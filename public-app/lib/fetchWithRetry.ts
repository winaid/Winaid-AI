/**
 * 네트워크 요청 재시도 + 지수 백오프 헬퍼
 * root 앱의 재시도 패턴 이식
 */

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  /** 재시도 대상 상태 코드 (기본: 408, 429, 500, 502, 503, 504) */
  retryStatusCodes?: number[];
}

const DEFAULT_RETRY_STATUS = [408, 429, 500, 502, 503, 504];

/**
 * fetch wrapper — 네트워크 에러 또는 특정 HTTP 상태 시 지수 백오프로 재시도
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const retryCodes = options?.retryStatusCodes ?? DEFAULT_RETRY_STATUS;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);

      // 재시도 대상 상태가 아니면 바로 반환
      if (!retryCodes.includes(res.status) || attempt === maxRetries) {
        return res;
      }

      // 재시도 대상 → 백오프 후 재시도
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      // 네트워크 에러
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) break;
    }

    // 지수 백오프: 1s, 2s, 4s, ...
    const delay = baseDelay * Math.pow(2, attempt);
    await new Promise(r => setTimeout(r, delay));
  }

  throw lastError ?? new Error('fetchWithRetry: 모든 재시도 실패');
}
