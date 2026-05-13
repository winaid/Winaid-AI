/**
 * Request-scoped context (AsyncLocalStorage).
 *
 * withApiError 가 wrapped handler 를 runWithRequestContext 안에서 실행하면,
 * 그 안에서 호출되는 모든 lib 함수가 시그니처 변경 없이 getRequestId() 로
 * 현재 요청의 ID 를 얻을 수 있다.
 *
 * 사용 예:
 *   // withApiError 내부
 *   return runWithRequestContext(requestId, () => handler(req, ctx));
 *
 *   // lib/foo.ts 안 어디서든
 *   logger.error('foo failed', { detail: '...' });  // ALS 로 requestId 자동
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

export function runWithRequestContext<R>(requestId: string, fn: () => R): R {
  return storage.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
