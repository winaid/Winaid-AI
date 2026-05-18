/**
 * 진단 → 콘텐츠 생성 funnel.
 *
 * ToneRecommendationCards 의 "이 톤으로 만들기" 버튼이 사용하는 URL 빌더.
 * 양 끝점이 같은 schema 공유 — buildFunnelUrl / parseFunnelParams.
 *
 * 보안:
 *   - category 값은 VALID_CONTENT_CATEGORIES (7 카테고리) 화이트리스트로만 허용
 *   - 미등록 카테고리는 emit/parse 양쪽에서 drop — 임의 문자열 prompt injection 차단
 *   - tone 본문은 URL 에 안 실음 (페이지 자체에서 quartet record lookup)
 */

import { VALID_CONTENT_CATEGORIES } from '@winaid/blog-core';

export type FunnelDestination = 'blog' | 'press' | 'refine';

export interface FunnelParams {
  /** ContentCategory enum value (7 카테고리). 미등록 값은 무시. */
  category?: string;
  /** 출처 추적용 — analytics·UI 토스트 분기. */
  source?: 'diagnostic';
}

const DEST_PATH: Record<FunnelDestination, string> = {
  blog: '/blog',
  press: '/press',
  refine: '/refine',
};

/**
 * 콘텐츠 생성 페이지로 라우팅할 URL 빌드.
 * category 가 화이트리스트 외이면 query 에서 제외 (URL 정상이되 prefill 안 됨).
 */
export function buildFunnelUrl(dest: FunnelDestination, params: FunnelParams): string {
  const sp = new URLSearchParams();
  if (params.category && VALID_CONTENT_CATEGORIES.has(params.category)) {
    sp.set('category', params.category);
  }
  if (params.source) {
    sp.set('source', params.source);
  }
  const qs = sp.toString();
  return qs ? `${DEST_PATH[dest]}?${qs}` : DEST_PATH[dest];
}

/**
 * URLSearchParams → FunnelParams. mount 시 페이지가 호출.
 * 화이트리스트 검증 — 잘못된 category 면 undefined fallback.
 */
export function parseFunnelParams(searchParams: URLSearchParams | null): FunnelParams {
  if (!searchParams) return {};
  const rawCategory = searchParams.get('category');
  const rawSource = searchParams.get('source');
  const category =
    rawCategory && VALID_CONTENT_CATEGORIES.has(rawCategory) ? rawCategory : undefined;
  const source = rawSource === 'diagnostic' ? 'diagnostic' : undefined;
  return { category, source };
}
