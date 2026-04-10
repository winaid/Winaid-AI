/**
 * 카드뉴스 편집 드래프트 — localStorage 자동 저장/복원
 *
 * 편집 중 브라우저 충돌/새로고침 시 작업을 보존한다.
 * 3초 디바운스 저장은 호출부(page.tsx)에서 처리.
 */
import type { SlideData, CardNewsTheme } from './cardNewsLayouts';

const DRAFT_KEY = 'winai-cardnews-draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간

export type CardRatio = '1:1' | '3:4' | '4:5' | '9:16' | '16:9';

export interface CardNewsDraft {
  topic: string;
  hospitalName: string;
  proSlides: SlideData[];
  proTheme: CardNewsTheme;
  proCardRatio: CardRatio;
  savedAt: number;
}

/** 드래프트 저장. localStorage 용량 초과 등 오류는 조용히 무시. */
export function saveDraft(draft: CardNewsDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 용량 초과/privacy 모드 등 — 작업 흐름을 막지 않도록 무시
  }
}

/**
 * 드래프트 로드. 다음 경우 null 반환:
 *  - 없음
 *  - JSON 파싱 실패
 *  - 24시간 이상 경과 (만료 시 자동 삭제)
 *  - 슬라이드가 비어 있음 (복원 의미 없음)
 */
export function loadDraft(): CardNewsDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<CardNewsDraft>;

    if (typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    if (!Array.isArray(draft.proSlides) || draft.proSlides.length === 0) {
      return null;
    }
    return draft as CardNewsDraft;
  } catch {
    return null;
  }
}

/** 드래프트 삭제. */
export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 무시
  }
}
