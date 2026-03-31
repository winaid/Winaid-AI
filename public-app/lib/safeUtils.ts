/**
 * 공통 안전 유틸리티
 *
 * safeJsonParse — JSON 파싱 실패 시 fallback 반환 (앱 크래시 방지)
 * fetchWithTimeout — AbortController 기반 타임아웃 fetch
 * clampNumber — 숫자 범위 제한
 * safeLocalStorageSet — localStorage 쿼터 초과 방어
 * safeLocalStorageGet — localStorage 파싱 방어
 */

/** JSON 파싱 실패 시 fallback을 반환. 앱 크래시 방지용. */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    // markdown 코드 블록 래핑된 JSON 처리
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // 중괄호/대괄호 추출 시도
    const braceMatch = text.match(/[{[][\s\S]*[}\]]/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]) as T;
      } catch {
        // 최종 실패
      }
    }
    return fallback;
  }
}

/** AbortController 기반 타임아웃 fetch. signal이 이미 있으면 병합. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // 외부 signal과 내부 abort를 모두 연결
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 숫자를 min~max 범위로 제한 */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** localStorage 안전 쓰기 — 쿼터 초과 시 오래된 항목 제거 후 재시도 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // 쿼터 초과 시 해당 키의 기존 데이터 삭제 후 재시도
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

/** localStorage 안전 읽기 + JSON 파싱 */
export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
