/**
 * 진단 dashboard 의 카테고리 톤 chip 박스용 어댑터.
 *
 * 단일 source of truth — UI 가 직접 quartet record 를 lookup 하지 않고
 * 본 어댑터의 ToneRecommendation 만 받음. 미등록 카테고리는 모든 필드 null
 * (UI 가 미렌더). PR #194-197 quartet record + PR #205-next CATEGORY_CTA_HINT.
 */

import {
  CATEGORY_TONE,
  PRESS_CATEGORY_TONE,
  CATEGORY_CTA_HINT,
} from '@winaid/blog-core';

export interface ToneRecommendation {
  blogTone: string | null;
  pressTone: string | null;
  ctaHint: string | null;
}

export function deriveToneRecommendation(category: string | undefined | null): ToneRecommendation {
  if (!category) return { blogTone: null, pressTone: null, ctaHint: null };
  return {
    blogTone: CATEGORY_TONE[category]?.tone ?? null,
    pressTone: PRESS_CATEGORY_TONE[category]?.tone ?? null,
    ctaHint: CATEGORY_CTA_HINT[category] ?? null,
  };
}

/** 톤 추천 chip 박스가 렌더 가능한지 (3 필드 중 하나라도 있으면 true). */
export function hasToneRecommendation(rec: ToneRecommendation): boolean {
  return rec.blogTone !== null || rec.pressTone !== null || rec.ctaHint !== null;
}
