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
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { crawlSite } from '../../../../lib/diagnostic/crawler';
import {
  streamChatGPT,
  streamGemini,
  buildDiscoveryQuery,
  buildDiscoveryQueries,
  hostOf,
  domainMatches,
  extractUrlsFromText,
  type StreamMeta,
} from '../../../../lib/diagnostic/discovery';
import { logDiagnostic, generateTraceId } from '../../../../lib/diagnostic/logger';
import type { AIPlatform } from '../../../../lib/diagnostic/types';

// Vercel Pro plan max = 300s. 600 은 fallback(60s default)으로 떨어져 504 발생.
// Gemini 3.1 Pro Preview 실측 평균 30~60s, worst ~120s 라 300 이면 충분.
export const maxDuration = 300;

// Vercel/proxy idle timeout 차단용 SSE keepalive 간격 (ms).
// Gemini Pro Preview 의 reasoning thinking phase 첫 byte 30~90s 동안 idle 로 판단되면 504.
// SSE comment(`: ping\n\n`)는 표준 spec 상 클라이언트 파서가 무시 → 본문 영향 없음.
// 800ms 는 public-app 동일 패턴 (검증된 값).
const KEEPALIVE_INTERVAL_MS = 800;
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
  /** Phase 3: 다중 쿼리 패턴 ID (recommend/service/price/urgent). 없으면 customQuery 또는 기본값. */
  queryId?: string;
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

  // Phase 3: queryId 가 있으면 다중 쿼리에서 매칭, 없으면 단일 쿼리(customQuery 또는 자동).
  const queryId = typeof body.queryId === 'string' ? body.queryId.trim() : '';
  let query: string;
  if (queryId && !customQuery) {
    const queries = buildDiscoveryQueries(crawl, '치과');
    const matched = queries.find((q) => q.id === queryId);
    query = matched?.query ?? buildDiscoveryQuery(crawl, '치과');
  } else {
    query = buildDiscoveryQuery(crawl, '치과', customQuery);
  }
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

      // Keepalive — Gemini Pro Preview 는 reasoning phase 로 first-byte 30~90s 걸릴 수
      // 있고, 그동안 Vercel/proxy 가 idle 로 판단해 504. SSE comment(`: ping\n\n`)는
      // 이벤트 파서에서 무시되므로 클라이언트엔 영향 없음. 첫 chunk 도착 시 중단.
      let firstChunkReceived = false;
      const keepaliveInterval = setInterval(() => {
        if (firstChunkReceived) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // controller 가 이미 닫힘 — finally 에서 clear 됨
        }
      }, KEEPALIVE_INTERVAL_MS);

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
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            clearInterval(keepaliveInterval);
          }
          fullText += result.value;
          send({ type: 'chunk', text: result.value });
        }

        // 완료 — URL 매칭 OR 사이트 이름 언급 으로 selfIncluded 판정.
        // (사용자 요청: "URL 이 아니라 치과 이름만 들어가있어도 언급으로 인정")
        const topResults = extractUrlsFromText(fullText);
        let selfRank: number | null = null;
        for (const r of topResults) {
          if (domainMatches(selfHost, r.domain)) {
            selfRank = r.rank;
            break;
          }
        }
        // 사이트 이름이 답변 텍스트에 직접 노출됐는지 검사. 공백 normalize 후 includes().
        // siteName 2 자 미만이면 false positive 방지로 skip.
        const siteNameRaw = (crawl.title || '').trim().slice(0, 60);
        const siteNameMentioned = siteNameRaw.length >= 2
          ? fullText.replace(/\s/g, '').includes(siteNameRaw.replace(/\s/g, ''))
          : false;

        // 캐시 저장 (비동기, 실패해도 done 이벤트에 영향 없음)
        // RLS 강화 시점에 anon 차단 대비 service_role 우선 사용 (현재 RLS 미활성이라도 방어적)
        const dbCache = supabaseAdmin ?? supabase;
        if (dbCache && fullText.length > 30) {
          sha256(query).then((queryHash) => {
            dbCache
              .from('diagnostic_stream_cache')
              .upsert(
                {
                  platform,
                  query_hash: queryHash,
                  query_text: query,
                  answer_text: fullText,
                  sources: JSON.stringify(meta.sources),
                  self_included: (selfRank !== null || siteNameMentioned),
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
          selfIncluded: (selfRank !== null || siteNameMentioned),
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
        clearInterval(keepaliveInterval);
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
