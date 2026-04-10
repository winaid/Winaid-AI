/**
 * 카드뉴스 편집 드래프트 — localStorage 자동 저장/복원
 *
 * 편집 중 브라우저 충돌/새로고침 시 작업을 보존한다.
 * 3초 디바운스 저장은 호출부(page.tsx)에서 처리.
 *
 * Day 3 개선:
 *  - userId 바인딩: 공용 PC에서 타인이 자기 드래프트로 오인하는 상황 방지
 *  - 저장 결과 반환: QuotaExceededError 등 실패를 호출자가 인지 가능
 *  - idle timeout: "마지막 접근 기준 48시간"으로 변경, 편집 중 재접근하면 수명 연장
 */
import type { SlideData, CardNewsTheme } from './cardNewsLayouts';

const DRAFT_KEY = 'winai-cardnews-draft';
const DRAFT_IDLE_MS = 48 * 60 * 60 * 1000; // 마지막 접근 후 48시간
const EXPIRY_WARN_MS = 2 * 60 * 60 * 1000;  // 2시간 남으면 경고

export type CardRatio = '1:1' | '3:4' | '4:5' | '9:16' | '16:9';

export interface CardNewsDraft {
  /** 이 드래프트를 만든 사용자 — 게스트면 undefined */
  userId?: string;
  topic: string;
  hospitalName: string;
  proSlides: SlideData[];
  proTheme: CardNewsTheme;
  proCardRatio: CardRatio;
  savedAt: number;
  /** 마지막으로 loadDraft가 호출된 시각 (idle timeout 기준) */
  lastAccessedAt?: number;
}

export type SaveDraftResult =
  | { ok: true }
  | { ok: false; error: string; reason: 'quota' | 'unavailable' | 'unknown' };

export interface LoadDraftResult {
  draft: CardNewsDraft;
  /** 만료까지 남은 ms. 2시간 이하면 호출자가 경고 표시 */
  expiresIn: number;
  /** 2시간 이하 남음 */
  expiringSoon: boolean;
}

// ── saveDraft ──────────────────────────────────────────────────────────

/** 드래프트 저장. 실패 시 호출자가 알 수 있도록 구조적 결과 반환. */
export function saveDraft(draft: CardNewsDraft, userId?: string | null): SaveDraftResult {
  if (typeof window === 'undefined') {
    return { ok: false, error: '브라우저 환경이 아닙니다.', reason: 'unavailable' };
  }
  try {
    const payload: CardNewsDraft = {
      ...draft,
      userId: userId ?? draft.userId, // 호출자가 명시하면 우선
      savedAt: draft.savedAt,
      lastAccessedAt: Date.now(), // 저장 = 접근이므로 갱신
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    // QuotaExceededError 판별 — DOMException 이름/코드는 브라우저마다 다르지만 다음 중 하나
    const name = (err as DOMException)?.name || '';
    const message = (err as Error)?.message || '';
    const isQuota =
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Firefox
      /quota/i.test(message);
    if (isQuota) {
      return {
        ok: false,
        error: '저장 용량이 초과되었습니다. 브라우저 localStorage를 정리해주세요.',
        reason: 'quota',
      };
    }
    return {
      ok: false,
      error: '드래프트 저장 실패 — ' + (message || '알 수 없는 오류'),
      reason: 'unknown',
    };
  }
}

// ── loadDraft ──────────────────────────────────────────────────────────

/**
 * 드래프트 로드.
 * @param currentUserId 현재 로그인 사용자의 id. 게스트는 null/undefined.
 *
 * 다음 경우 null 반환:
 *  - 없음 / JSON 파싱 실패
 *  - 마지막 접근 후 48시간 경과 (만료, 자동 삭제)
 *  - 슬라이드가 비어 있음
 *  - userId 불일치 — A가 저장한 드래프트를 B가 보는 것 방지 (드래프트 삭제 X,
 *    원래 사용자가 돌아올 수 있으므로)
 *
 * 만료까지 남은 시간도 함께 반환.
 */
export function loadDraft(currentUserId?: string | null): LoadDraftResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<CardNewsDraft>;

    // savedAt 필수
    if (typeof draft.savedAt !== 'number') {
      clearDraft();
      return null;
    }

    // idle timeout: 마지막 접근 기준 48시간
    const lastAccessed = typeof draft.lastAccessedAt === 'number'
      ? draft.lastAccessedAt
      : draft.savedAt;
    const elapsedIdle = Date.now() - lastAccessed;
    if (elapsedIdle > DRAFT_IDLE_MS) {
      clearDraft();
      return null;
    }

    // 슬라이드 유효성
    if (!Array.isArray(draft.proSlides) || draft.proSlides.length === 0) {
      return null;
    }

    // userId 바인딩 — 저장된 userId가 있는데 현재 userId와 다르면 거절
    // (게스트끼리는 둘 다 undefined/null이라 통과)
    const savedUserId = draft.userId || undefined;
    const normalizedCurrent = currentUserId || undefined;
    if (savedUserId !== normalizedCurrent) {
      return null;
    }

    // 만료까지 남은 시간 계산
    const expiresIn = DRAFT_IDLE_MS - elapsedIdle;
    const expiringSoon = expiresIn <= EXPIRY_WARN_MS;

    // lastAccessedAt 갱신 (편집 재개 시 수명 연장)
    try {
      const refreshed: CardNewsDraft = { ...(draft as CardNewsDraft), lastAccessedAt: Date.now() };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(refreshed));
    } catch {
      // 용량 초과 등 — 로드 자체는 성공이므로 무시
    }

    return {
      draft: draft as CardNewsDraft,
      expiresIn,
      expiringSoon,
    };
  } catch {
    return null;
  }
}

// ── clearDraft ─────────────────────────────────────────────────────────

/** 드래프트 삭제. */
export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 무시
  }
}
