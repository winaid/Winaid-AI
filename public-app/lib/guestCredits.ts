/**
 * 게스트(비로그인) 사용자 크레딧 관리
 *
 * 로그인 사용자는 Supabase의 profiles 테이블에 크레딧이 저장된다.
 * 게스트는 localStorage에만 남고, 로그아웃 시 초기화된다(다시 들어오면 5개 새로 받음).
 *
 * 로그인된 사용자와는 완전히 별개의 카운터이므로 악용을 막기 위해 서버 API route에는
 * 별도의 IP 기반 rate limit(분당 10회)을 두고 있다.
 */

export const GUEST_CREDIT_KEY = 'winaid_guest_credits';
export const GUEST_TOTAL_USED_KEY = 'winaid_guest_credits_used';
export const GUEST_CREDIT_DEFAULT = 5;

export interface GuestCreditState {
  credits: number;
  totalUsed: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** 최초 방문 시 3개 세팅, 이후는 저장된 값을 반환 */
export function initGuestCredits(): GuestCreditState {
  if (!isBrowser()) {
    return { credits: GUEST_CREDIT_DEFAULT, totalUsed: 0 };
  }
  const saved = localStorage.getItem(GUEST_CREDIT_KEY);
  if (saved === null) {
    localStorage.setItem(GUEST_CREDIT_KEY, String(GUEST_CREDIT_DEFAULT));
    localStorage.setItem(GUEST_TOTAL_USED_KEY, '0');
    return { credits: GUEST_CREDIT_DEFAULT, totalUsed: 0 };
  }
  const credits = Math.max(0, parseInt(saved, 10) || 0);
  const used = Math.max(0, parseInt(localStorage.getItem(GUEST_TOTAL_USED_KEY) || '0', 10) || 0);
  return { credits, totalUsed: used };
}

/** 크레딧 1개 차감. 성공 시 새 상태 반환, 실패(0개) 시 null */
export function consumeGuestCredit(): GuestCreditState | null {
  if (!isBrowser()) {
    // SSR/테스트 환경: 차감 없이 무제한처럼 동작
    return { credits: GUEST_CREDIT_DEFAULT, totalUsed: 0 };
  }
  const current = initGuestCredits();
  if (current.credits <= 0) return null;
  const next: GuestCreditState = {
    credits: current.credits - 1,
    totalUsed: current.totalUsed + 1,
  };
  localStorage.setItem(GUEST_CREDIT_KEY, String(next.credits));
  localStorage.setItem(GUEST_TOTAL_USED_KEY, String(next.totalUsed));
  return next;
}

/** 로그아웃 시 호출 — 재방문 시 3개 새로 받음 */
export function resetGuestCredits(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(GUEST_CREDIT_KEY);
  localStorage.removeItem(GUEST_TOTAL_USED_KEY);
}
