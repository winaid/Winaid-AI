/**
 * API 라우트 통합 에러 핸들러 + request_id 전파 + 자동 로그 (handoff §9.2 / §9.7 / 백로그 19).
 *
 * 모든 public-app API 라우트의 export 핸들러를 `withApiError(...)` 로 감싸 다음을 처리:
 *   1) uncaught throw → Sentry.captureException (tags: route, method, requestId)
 *   2) prod 응답 → generic 메시지만 (스택트레이스·내부 정보 미노출)
 *   3) dev 응답 → 동일 메시지 + `_debug { name, message, stack }` 별도 필드
 *   4) 요청 진입·종료·에러 자동 구조화 로그 (`api.start` / `api.ok` / `api.error`)
 *   5) X-Request-Id 헤더 — 요청에 있으면 사용, 없으면 발급. 응답에도 부착.
 *   6) AsyncLocalStorage(runWithRequestContext) — lib 함수가 시그니처 무변경으로 자동 requestId
 *
 * 호환성:
 *   - 현행 envelope `{ error: string }` 유지 — 클라이언트 (`data.error`) 호환 0 영향
 *   - 라우트 내부 try/catch 가 이미 응답 return 하면 outer catch 발동 안 함
 *   - SSE/스트리밍 라우트 (gemini, diagnostic/stream) 는 호출자가 wrap 대상에서 제외
 *
 * Sentry 주의: sentry.server.config.ts beforeSend 가 event.extra 를 통째 delete →
 *   라우트·메서드·requestId 컨텍스트는 반드시 `tags` 로 전달.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { logger } from './logger';
import { runWithRequestContext } from './requestContext';

const GENERIC_MESSAGE = '서버에서 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
const REQUEST_ID_HEADER = 'X-Request-Id';
const CACHE_CONTROL_HEADER = 'Cache-Control';
const DEFAULT_CACHE_CONTROL = 'no-store, must-revalidate';
const MAX_INCOMING_REQUEST_ID_LEN = 128;
const VALID_REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export interface ApiErrorOptions {
  /** 명시적 라우트 식별자 (Sentry tag). 없으면 req.url pathname fallback. */
  route?: string;
  /**
   * 응답 Cache-Control 헤더 기본값. 미지정 시 'no-store, must-revalidate'.
   * 명시적 cache 가 필요한 라우트만 opt-in 으로 'public, max-age=60' 같은 값 전달.
   * 라우트 본문이 응답에 직접 Cache-Control 헤더를 설정했다면 wrapper 가 덮어쓰지 않음 (idempotent).
   */
  cacheControl?: string;
}

type Handler<TReq, TCtx> = (req: TReq, ctx: TCtx) => Promise<Response> | Response;

export function withApiError<TReq extends Request, TCtx = unknown>(
  handler: Handler<TReq, TCtx>,
  opts: ApiErrorOptions = {},
): Handler<TReq, TCtx> {
  return async (req: TReq, ctx: TCtx) => {
    const startedAt = Date.now();
    const requestId = resolveRequestId(req);
    const route = opts.route || extractRoutePath(req);
    const method = req.method;

    return runWithRequestContext(requestId, async () => {
      logger.info('api.start', { requestId, route, method });
      try {
        const res = await handler(req, ctx);
        logger.info('api.ok', {
          requestId,
          route,
          method,
          status: res.status,
          durationMs: Date.now() - startedAt,
        });
        return decorate(res, requestId, opts.cacheControl);
      } catch (err) {
        logger.error(
          'api.error',
          { requestId, route, method, durationMs: Date.now() - startedAt },
          err,
        );
        try {
          Sentry.captureException(err, {
            tags: { route, method, requestId },
          });
        } catch {
          // Sentry 자체 실패는 무시 — 응답이 우선
        }

        const isDev = process.env.NODE_ENV !== 'production';
        const body: Record<string, unknown> = { error: GENERIC_MESSAGE };
        if (isDev && err instanceof Error) {
          body._debug = { name: err.name, message: err.message, stack: err.stack };
        }
        const res = NextResponse.json(body, { status: 500 });
        return decorate(res, requestId, opts.cacheControl);
      }
    });
  };
}

function resolveRequestId(req: Request): string {
  const incoming = req.headers.get(REQUEST_ID_HEADER) || req.headers.get('x-request-id');
  if (incoming && incoming.length <= MAX_INCOMING_REQUEST_ID_LEN && VALID_REQUEST_ID_RE.test(incoming)) {
    return incoming;
  }
  return crypto.randomUUID();
}

function extractRoutePath(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown';
  }
}

/**
 * 응답에 X-Request-Id + Cache-Control 헤더 추가 (idempotent). Response 는 immutable
 * 이므로 두 헤더 중 하나라도 추가 필요하면 새 객체 생성. 이미 라우트 본문이 설정한
 * 헤더는 덮어쓰지 않음 (다른 의도된 cache 정책 보존 — 예: diagnostic/public/[token]
 * 의 5분 SWR).
 *
 * SSE 라우트는 어차피 wrap 제외이므로 일반 JSON/buffered 응답만 처리.
 */
function decorate(res: Response, requestId: string, cacheControl: string | undefined): Response {
  const hasRid = !!res.headers.get(REQUEST_ID_HEADER);
  const hasCc = !!res.headers.get(CACHE_CONTROL_HEADER);
  if (hasRid && hasCc) return res;

  const headers = new Headers(res.headers);
  if (!hasRid) headers.set(REQUEST_ID_HEADER, requestId);
  if (!hasCc) headers.set(CACHE_CONTROL_HEADER, cacheControl || DEFAULT_CACHE_CONTROL);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
