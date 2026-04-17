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
import { supabase } from '../../../../lib/supabase';
import { crawlSite } from '../../../../lib/diagnostic/crawler';
import {
  streamChatGPT,
  streamGemini,
  buildDiscoveryQuery,
  hostOf,
  domainMatches,
  extractUrlsFromText,
  type StreamMeta,
} from '../../../../lib/diagnostic/discovery';
import { logDiagnostic, generateTraceId } from '../../../../lib/diagnostic/logger';
import type { AIPlatform } from '../../../../lib/diagnostic/types';

export const maxDuration = 600; // 10분 — 실측은 긴 스트림 허용
export const dynamic = 'force-dynamic';

// ── 캐시 헬퍼 ──────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface CachedRow {
  answer_text: string;
  sources: unknown;
  self_included: boolean;
  self_rank: number | null;
  truncated: boolean;
  created_at: string;
}

const CACHE_TTL_MS = 30 * 86_400_000; // 30일

function buildCachedStream(
  cached: CachedRow,
  platform: string,
  query: string,
  selfHost: string,
): Response {
  const encoder = new TextEncoder();
  const text = cached.answer_text;
  const CHUNK = 50;
  const DELAY = 30;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send({ type: 'start', platform, query, timestamp: new Date().toISOString() });
      for (let i = 0; i < text.length; i += CHUNK) {
        send({ type: 'chunk', text: text.slice(i, i + CHUNK) });
        await new Promise<void>((r) => setTimeout(r, DELAY));
      }
      send({
        type: 'done',
        answerText: text,
        topResults: [],
        selfIncluded: cached.self_included,
        selfRank: cached.self_rank,
        truncated: cached.truncated,
        sources: Array.isArray(cached.sources) ? cached.sources : [],
        cached: true,
        cachedAt: cached.created_at,
        timestamp: new Date().toISOString(),
      });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

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
  const traceId = generateTraceId();
  const tStream = Date.now();
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

  // 3.5) 캐시 조회 — 30일 이내 동일 platform+query 결과가 있으면 fake-stream 으로 즉시 반환.
  //       Supabase 미설정 or DB 에러 시 skip (graceful).
  if (supabase) {
    try {
      const queryHash = await sha256(query);
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data: cached } = await supabase
        .from('diagnostic_stream_cache')
        .select('answer_text, sources, self_included, self_rank, truncated, created_at')
        .eq('platform', platform)
        .eq('query_hash', queryHash)
        .gt('created_at', cutoff)
        .maybeSingle();
      if (cached) {
        logDiagnostic({ traceId, step: 'cache_hit', platform, cacheHit: true, duration: Date.now() - tStream });
        return buildCachedStream(cached as CachedRow, platform, query, selfHost);
      }
      logDiagnostic({ traceId, step: 'cache_miss', platform, cacheHit: false });
    } catch (e) {
      console.warn(`[diagnostic/stream] 캐시 조회 실패 (skip): ${(e as Error).message.slice(0, 100)}`);
    }
  }

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
        // manual iteration 으로 generator return value(StreamMeta) 캡처
        const iterator: AsyncGenerator<string, StreamMeta, void> =
          platform === 'ChatGPT' ? streamChatGPT(query) : streamGemini(query);
        let meta: StreamMeta = { truncated: false, sources: [] };
        while (true) {
          const result = await iterator.next();
          if (result.done) {
            if (result.value) meta = result.value;
            break;
          }
          fullText += result.value;
          send({ type: 'chunk', text: result.value });
        }

        // 완료 — 누적된 답변에서 URL 추출 후 selfIncluded 판정 (기존 로직 유지)
        const topResults = extractUrlsFromText(fullText);
        let selfRank: number | null = null;
        for (const r of topResults) {
          if (domainMatches(selfHost, r.domain)) {
            selfRank = r.rank;
            break;
          }
        }

        // 캐시 저장 (비동기, 실패해도 done 이벤트에 영향 없음)
        if (supabase && fullText.length > 30) {
          sha256(query).then((queryHash) => {
            supabase!
              .from('diagnostic_stream_cache')
              .upsert(
                {
                  platform,
                  query_hash: queryHash,
                  query_text: query,
                  answer_text: fullText,
                  sources: JSON.stringify(meta.sources),
                  self_included: selfRank !== null,
                  self_rank: selfRank,
                  truncated: meta.truncated,
                },
                { onConflict: 'platform,query_hash' },
              )
              .then(({ error }) => {
                if (error) console.warn(`[diagnostic/stream] 캐시 저장 실패: ${error.message.slice(0, 100)}`);
              });
          });
        }

        send({
          type: 'done',
          answerText: fullText,
          topResults,
          selfIncluded: selfRank !== null,
          selfRank,
          truncated: meta.truncated,
          ...(meta.reason ? { reason: meta.reason } : {}),
          sources: meta.sources,
          timestamp: new Date().toISOString(),
        });
        logDiagnostic({ traceId, step: 'stream_done', platform, duration: Date.now() - tStream });
      } catch (e) {
        const msg = (e as Error)?.message?.slice(0, 200) || 'unknown';
        logDiagnostic({ traceId, step: 'stream_error', platform, duration: Date.now() - tStream, error: msg });
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
