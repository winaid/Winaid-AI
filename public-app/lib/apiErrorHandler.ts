/**
 * API 라우트 통합 에러 핸들러 (handoff §9.2 / §9.7).
 *
 * 모든 public-app API 라우트의 export 핸들러를 `withApiError(...)` 로 감싸
 * 다음을 한 곳에서 처리:
 *   1) uncaught throw → Sentry.captureException (tags 로 라우트·메서드)
 *   2) prod 응답 → generic 메시지만 (스택트레이스·내부 정보 미노출)
 *   3) dev 응답 → 동일 메시지 + `_debug { name, message, stack }` 별도 필드
 *
 * 호환성:
 *   - 현행 envelope `{ error: string }` 유지 — 클라이언트 (`data.error`) 호환 0 영향
 *   - 라우트 내부 try/catch 가 이미 응답 return 하면 wrapper outer catch 발동 안 함
 *     (현재 라우트 다수가 그러함 — wrapper 의 가치는 신규 throw 안전망 + Sentry 통합)
 *   - SSE/스트리밍 라우트 (gemini, diagnostic/stream) 는 호출자가 wrap 대상에서 제외
 *
 * Sentry 주의: sentry.server.config.ts beforeSend 가 event.extra 를 통째 delete →
 *   라우트·메서드 컨텍스트는 반드시 `tags` 로 전달.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

const GENERIC_MESSAGE = '서버에서 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

export interface ApiErrorOptions {
  /** 명시적 라우트 식별자 (Sentry tag). 없으면 req.url pathname fallback. */
  route?: string;
}

// Next.js App Router 핸들러 시그니처. ctx 는 동적 라우트의 { params } 객체 등.
// Request 또는 NextRequest 양쪽 모두 받기 위해 generic 으로.
type Handler<TReq, TCtx> = (req: TReq, ctx: TCtx) => Promise<Response> | Response;

export function withApiError<TReq extends Request, TCtx = unknown>(
  handler: Handler<TReq, TCtx>,
  opts: ApiErrorOptions = {},
): Handler<TReq, TCtx> {
  return async (req: TReq, ctx: TCtx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const route = opts.route || extractRoutePath(req);
      try {
        Sentry.captureException(err, {
          tags: {
            route,
            method: req.method,
          },
        });
      } catch {
        // Sentry 자체 실패는 무시 — 응답이 우선
      }

      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev && err instanceof Error) {
        return NextResponse.json(
          {
            error: GENERIC_MESSAGE,
            _debug: {
              name: err.name,
              message: err.message,
              stack: err.stack,
            },
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 500 });
    }
  };
}

function extractRoutePath(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown';
  }
}
