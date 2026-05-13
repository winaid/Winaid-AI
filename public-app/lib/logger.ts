/**
 * public-app 구조화 로거 (handoff §9.7 / 백로그 19).
 *
 * - prod (NODE_ENV=production): 단일 라인 JSON → Vercel 로그 패널에서 grep + jq 친화
 * - dev: 가독 포맷 (level tag + ctx JSON + stack)
 * - level=error|warn → stderr (console.error), 그 외 → stdout (console.log)
 * - ctx.requestId 가 없으면 AsyncLocalStorage(getRequestId) fallback — lib 함수가
 *   시그니처 변경 없이 자동 requestId 첨부 가능 (withApiError 안에서 호출 시)
 *
 * 본 모듈은 `lib/diagnostic/logger.ts` (traceId 기반, 진단 도메인 전용) 와 의미가
 * 중복되지만 일관화는 별도 cleanup PR. 본 PR 은 인프라만.
 */

import { getRequestId } from './requestContext';

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  durationMs?: number;
  [k: string]: unknown;
}

function log(level: Level, msg: string, ctx?: LogContext, err?: unknown): void {
  const isDev = process.env.NODE_ENV !== 'production';

  // ctx.requestId 명시 없으면 ALS fallback
  const effectiveCtx: LogContext | undefined = ctx
    ? { ...ctx, requestId: ctx.requestId ?? getRequestId() }
    : (() => {
        const rid = getRequestId();
        return rid ? { requestId: rid } : undefined;
      })();

  const errFields =
    err instanceof Error
      ? { err: { name: err.name, message: err.message, stack: err.stack } }
      : err !== undefined
        ? { err: String(err) }
        : {};

  const sink = level === 'error' || level === 'warn' ? console.error : console.log;

  if (isDev) {
    const tag = `[${level.toUpperCase()}]`;
    const ctxStr = effectiveCtx ? ' ' + JSON.stringify(effectiveCtx) : '';
    const errStr = err instanceof Error ? `\n${err.stack}` : '';
    sink(`${tag} ${msg}${ctxStr}${errStr}`);
    return;
  }

  // prod: 단일 라인 JSON
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...effectiveCtx,
    ...errFields,
  };
  sink(JSON.stringify(payload));
}

export const logger = {
  debug: (msg: string, ctx?: LogContext): void => log('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext): void => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext, err?: unknown): void => log('warn', msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: unknown): void => log('error', msg, ctx, err),
};
