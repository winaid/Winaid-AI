/**
 * POST /api/diagnostic/stream — AEO/GEO 실측 전용 SSE 엔드포인트 (단계 S-A)
 *
 * 기본 /api/diagnostic 에서 실측(discovery)을 분리하고, 사용자가 "실측하기"
 * 버튼을 누르면 이 엔드포인트를 플랫폼(ChatGPT | Gemini) 하나씩 호출.
 * 결과는 Server-Sent Events 로 실시간 스트림.
 *
 * body: { url: string, customQuery?: string, platform: 'ChatGPT' | 'Gemini' }
 *
 * 이벤트 형식: `data: ${JSON.stringify({type, ...})}\n\n`
 *   - start: { type, platform, query, timestamp }
 *   - chunk: { type, text }
 *   - done:  { type, answerText, topResults, selfIncluded, selfRank, timestamp }
 *   - error: { type, message, timestamp }
 *
 * 에러 응답 (SSE 진입 전):
 *   - 401 unauthorized
 *   - 400 invalid json / missing url / bad platform
 *   - 502 crawl failed
 */

import { NextRequest } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
import { crawlSite } from '../../../../lib/diagnostic/crawler';
import {
  streamChatGPT,
  streamGemini,
  buildDiscoveryQuery,
  hostOf,
  domainMatches,
  extractUrlsFromText,
} from '../../../../lib/diagnostic/discovery';
import type { AIPlatform } from '../../../../lib/diagnostic/types';

export const maxDuration = 600; // 10분 — 실측은 긴 스트림 허용
export const dynamic = 'force-dynamic';

const MAX_QUERY_LEN = 100;

interface Body {
  url?: string;
  customQuery?: string;
  platform?: string;
}

function sanitizeCustomQuery(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim().slice(0, MAX_QUERY_LEN);
  return t || undefined;
}

function isAIPlatform(p: unknown): p is AIPlatform {
  return p === 'ChatGPT' || p === 'Gemini';
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error, ...(extra ?? {}) }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  // 1) 인증 가드 — next-app 내부용
  const auth = await checkAuth(request);
  if (auth) return auth;

  // 2) body 파싱
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError(400, '요청 본문(JSON)을 읽을 수 없습니다.');
  }

  const normalizedUrl = body.url ? normalizeUrl(body.url) : null;
  if (!normalizedUrl) {
    return jsonError(400, '유효한 url 필드가 필요합니다.', { url: body.url });
  }
  if (!isAIPlatform(body.platform)) {
    return jsonError(400, "platform 은 'ChatGPT' 또는 'Gemini' 여야 합니다.");
  }
  const platform = body.platform;
  const customQuery = sanitizeCustomQuery(body.customQuery);

  // 3) crawl — 지역 추출 + selfHost 계산용. 실패 시 SSE 진입 전에 JSON 에러.
  let crawl;
  try {
    crawl = await crawlSite(normalizedUrl);
  } catch (e) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'unknown';
    console.warn(`[diagnostic/stream] crawlSite 실패: ${msg}`);
    return jsonError(502, '사이트 크롤에 실패했습니다.', { detail: msg });
  }

  const query = buildDiscoveryQuery(crawl, '치과', customQuery);
  const selfHost = hostOf(crawl.finalUrl);

  // 4) SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({
        type: 'start',
        platform,
        query,
        timestamp: new Date().toISOString(),
      });

      let fullText = '';
      try {
        const iterator =
          platform === 'ChatGPT' ? streamChatGPT(query) : streamGemini(query);
        for await (const chunk of iterator) {
          fullText += chunk;
          send({ type: 'chunk', text: chunk });
        }

        // 완료 — 누적된 답변에서 URL 추출 후 selfIncluded 판정
        const topResults = extractUrlsFromText(fullText);
        let selfRank: number | null = null;
        for (const r of topResults) {
          if (domainMatches(selfHost, r.domain)) {
            selfRank = r.rank;
            break;
          }
        }

        send({
          type: 'done',
          answerText: fullText,
          topResults,
          selfIncluded: selfRank !== null,
          selfRank,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        const msg = (e as Error)?.message?.slice(0, 200) || 'unknown';
        console.warn(`[diagnostic/stream/${platform}] ${msg}`);
        send({
          type: 'error',
          message: msg,
          timestamp: new Date().toISOString(),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Vercel / nginx 버퍼링 방지 (SSE 필수)
      'X-Accel-Buffering': 'no',
    },
  });
}
