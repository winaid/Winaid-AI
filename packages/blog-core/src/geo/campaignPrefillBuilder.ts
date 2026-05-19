/**
 * GEO-12 — AEO→콘텐츠 자동 생성 파이프라인 (campaign prefill builder).
 *
 * 진단 결과의 약점 chip / 권고 카드 (E-E-A-T / Sentiment / 부재 네이버 채널 /
 * 경쟁사 콘텐츠) 를 클릭하면 그 약점 보강하는 콘텐츠 캠페인 자동 prefill →
 * blog 빌더 새 창 진입. 모든 함수 순수 (네트워크 X, DB X, throw X).
 *
 * 양 끝점 schema 공유:
 *   - blog-core 측: 4 builder + serializeToQueryParams (URL 빌드)
 *   - 양 앱 blog page (page.tsx): query param 읽고 form prefill
 *
 * 보안:
 *   - category 7 카테고리 화이트리스트 (VALID_CONTENT_CATEGORIES) — drift-zero invariant
 *   - 잘못된 카테고리는 omit (URL 정상이되 prefill 안 됨)
 *   - title 길이 cap (200자) + URL safe encoding
 */

import { ContentCategory, VALID_CONTENT_CATEGORIES } from '../types';
import type { NaverChannel } from './naverChannelClassifier';
import type { PatternType } from './types';

// ── 타입 ──────────────────────────────────────────────────────

export type CampaignSourceKind =
  | 'eeat_weakness'
  | 'sentiment_weakness'
  | 'missing_naver'
  | 'competitor_response';

/** 콘텐츠 캠페인 prefill 단위 — query param 으로 직렬화되어 blog 페이지가 form prefill. */
export interface CampaignPrefill {
  /** 추천 제목 — blog 페이지 title 필드 prefill. */
  title?: string;
  /** 카테고리 — VALID_CONTENT_CATEGORIES 화이트리스트 (drift-zero). */
  category?: ContentCategory;
  /** 추천 톤 (블로그 page 의 tone select 와 동등 value). */
  tone?: string;
  /** 추천 콘텐츠 패턴 (GEO-1.2 분류) — FAQ/비교표/사례 등. */
  pattern_type?: PatternType;
  /** outline / 권고 list — blog 페이지의 customSubheadings prefill 후보. */
  outline_hint?: string[];
  /** 어느 진단 섹션에서 trigger 됐는지 — analytics + UI 토스트 분기. */
  source_kind: CampaignSourceKind;
  /** signal/channel/content id — analytics 추적. */
  source_id?: string;
}

const MAX_TITLE_LEN = 200;
const MAX_OUTLINE_ITEMS = 6;
const MAX_OUTLINE_ITEM_LEN = 200;

// ── 헬퍼 ──────────────────────────────────────────────────────

function clampText(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trim() : s.trim();
}

function safeCategory(c: ContentCategory | string | undefined): ContentCategory | undefined {
  if (!c) return undefined;
  return VALID_CONTENT_CATEGORIES.has(String(c)) ? (c as ContentCategory) : undefined;
}

// ── EEAT 약점 → CampaignPrefill ────────────────────────────────

/**
 * E-E-A-T 약점 signal label 별 추천 제목 + 톤. label 미매칭 시 generic fallback.
 */
const EEAT_LABEL_TO_PREFILL: Record<string, { title: string; tone: string; pattern_type?: PatternType }> = {
  '사례 dedicated 페이지': { title: '치료 사례 모음 — 환자 동의 후 게재', tone: 'empathy', pattern_type: 'case_study' },
  '전후 사진 alt 태그': { title: '치료 전후 사진 안내 (alt 태그 보강)', tone: 'professional', pattern_type: 'case_study' },
  '본문 전후/Before·After 마커': { title: '치료 Before / After 안내', tone: 'professional', pattern_type: 'case_study' },
  '환자 후기 키워드': { title: '환자 후기 모음 (동의 환자 한정)', tone: 'empathy', pattern_type: 'case_study' },
  '시술 횟수 명시': { title: '누적 시술 실적 안내', tone: 'professional' },
  '의료진 dedicated 페이지': { title: '원장 약력 안내', tone: 'professional', pattern_type: 'doctor_interview' },
  '의료진 이름 명시 (3명 이상)': { title: '의료진 소개 — 약력 + 전문 분야', tone: 'professional', pattern_type: 'doctor_interview' },
  '학력 명시 (대학교/박사 등)': { title: '원장 약력 — 학력 / 박사', tone: 'professional', pattern_type: 'doctor_interview' },
  '경력 명시 (임상연도·前/現 병원)': { title: '의료진 경력 — 임상연도 + 前/現', tone: 'professional', pattern_type: 'doctor_interview' },
  '전문의 자격 표기': { title: '전문의 자격 안내', tone: 'professional', pattern_type: 'doctor_interview' },
  '진료과목 다양성': { title: '진료과목 안내', tone: 'professional', pattern_type: 'list' },
  '학회/정회원 명시': { title: '학회 활동 + 정회원 안내', tone: 'professional' },
  '논문/publication 마커': { title: '의료진 논문 list', tone: 'professional', pattern_type: 'list' },
  '외부 미디어 노출': { title: '언론 인터뷰 / 칼럼 모음', tone: 'professional', pattern_type: 'list' },
  '의료기관 schema.org JSON-LD': { title: 'schema.org 마크업 적용 안내 (제작사용)', tone: 'professional' },
  'Organization sameAs (네이버·구글·인스타 등)': { title: '공식 채널 sameAs 통합 안내', tone: 'professional' },
  'HTTPS 적용': { title: 'HTTPS 전체 페이지 적용 안내 (제작사용)', tone: 'professional' },
  '부작용/주의사항 명시': { title: '부작용 / 주의사항 안내', tone: 'professional', pattern_type: 'faq' },
  '출처/인용 표기': { title: '본문 출처 표기 가이드', tone: 'professional' },
  '연락처/전화번호 노출': { title: '연락처 안내 (헤더 / 푸터 양쪽)', tone: 'professional' },
  '개인정보 처리방침 페이지': { title: '개인정보 처리방침', tone: 'professional' },
  '의료광고법 준수 (위반 표현 미검출)': { title: '의료광고법 자체 점검 가이드', tone: 'professional' },
};

export function buildPrefillFromEEATWeakness(
  signalLabel: string,
  recommendations: string[] = [],
  defaultCategory: ContentCategory = ContentCategory.DENTAL,
  sourceId?: string,
): CampaignPrefill {
  const mapped = EEAT_LABEL_TO_PREFILL[signalLabel];
  const outline_hint = recommendations.slice(0, MAX_OUTLINE_ITEMS).map(r => clampText(r, MAX_OUTLINE_ITEM_LEN));
  return {
    title: mapped?.title ? clampText(mapped.title, MAX_TITLE_LEN) : clampText(`E-E-A-T 보강: ${signalLabel}`, MAX_TITLE_LEN),
    category: safeCategory(defaultCategory),
    tone: mapped?.tone,
    pattern_type: mapped?.pattern_type,
    outline_hint: outline_hint.length > 0 ? outline_hint : undefined,
    source_kind: 'eeat_weakness',
    source_id: sourceId,
  };
}

// ── Sentiment 약점 → CampaignPrefill ──────────────────────────

/** Sentiment weakness label → prefill. Sentiment 약점은 부정 표현 보강 콘텐츠 권장. */
const SENTIMENT_LABEL_TO_PREFILL: Record<string, { title: string; tone: string; pattern_type?: PatternType }> = {
  '정보 제한': { title: '정보 부족 보강 — 상세 페이지 신설', tone: 'professional' },
  '정보 부족': { title: '시술 상세 안내 — 부족한 정보 보강', tone: 'professional', pattern_type: 'list' },
  '비교 어려움': { title: '비교 안내표 신설', tone: 'professional', pattern_type: 'comparison_table' },
  '모호함': { title: 'FAQ 페이지 — 자주 묻는 질문 정리', tone: 'professional', pattern_type: 'faq' },
  '확인 불가': { title: '핵심 정보 명시 + schema.org 마크업 안내', tone: 'professional' },
  '정보 부재': { title: '핵심 정보 페이지 신설', tone: 'professional' },
  '찾기 어려움': { title: '사이트 navigation 정리 안내', tone: 'professional' },
  '구체성 부족': { title: '시술 case 페이지 — 사진 + 의료진 코멘트', tone: 'empathy', pattern_type: 'case_study' },
};

export function buildPrefillFromSentimentWeakness(
  signalLabel: string,
  recommendations: string[] = [],
  defaultCategory: ContentCategory = ContentCategory.DENTAL,
  sourceId?: string,
): CampaignPrefill {
  const mapped = SENTIMENT_LABEL_TO_PREFILL[signalLabel];
  const outline_hint = recommendations.slice(0, MAX_OUTLINE_ITEMS).map(r => clampText(r, MAX_OUTLINE_ITEM_LEN));
  return {
    title: mapped?.title ? clampText(mapped.title, MAX_TITLE_LEN) : clampText(`Sentiment 보강: ${signalLabel}`, MAX_TITLE_LEN),
    category: safeCategory(defaultCategory),
    tone: mapped?.tone,
    pattern_type: mapped?.pattern_type,
    outline_hint: outline_hint.length > 0 ? outline_hint : undefined,
    source_kind: 'sentiment_weakness',
    source_id: sourceId,
  };
}

// ── 부재 네이버 채널 → CampaignPrefill ─────────────────────────

const NAVER_CHANNEL_TO_PREFILL: Partial<Record<NaverChannel, { title: string; tone: string; pattern_type?: PatternType }>> = {
  naver_blog: { title: '[네이버 블로그] 첫 글 — 시술 안내', tone: 'empathy', pattern_type: 'list' },
  naver_cafe: { title: '[네이버 카페] 환자 후기 안내', tone: 'empathy', pattern_type: 'case_study' },
  naver_place: { title: '[네이버 플레이스] 등록 + 방문자 후기 가이드', tone: 'professional' },
  naver_post: { title: '[네이버 포스트] 시술 슬라이드형 안내', tone: 'professional', pattern_type: 'list' },
};

export function buildPrefillFromMissingNaverChannel(
  channel: NaverChannel,
  defaultCategory: ContentCategory = ContentCategory.DENTAL,
): CampaignPrefill {
  const mapped = NAVER_CHANNEL_TO_PREFILL[channel];
  return {
    title: mapped?.title ? clampText(mapped.title, MAX_TITLE_LEN) : clampText(`[${channel}] 등록 콘텐츠`, MAX_TITLE_LEN),
    category: safeCategory(defaultCategory),
    tone: mapped?.tone,
    pattern_type: mapped?.pattern_type,
    source_kind: 'missing_naver',
    source_id: channel,
  };
}

// ── 경쟁사 콘텐츠 → CampaignPrefill ────────────────────────────

export interface CompetitorContentSeed {
  /** 경쟁사 콘텐츠 원본 title. */
  title?: string;
  /** GEO-1.2 분류된 pattern. */
  pattern_type?: PatternType;
  /** 경쟁사 hostname. */
  competitor_domain: string;
  /** competitor_contents.id (있으면). */
  content_id?: string;
}

export function buildPrefillFromCompetitorContent(
  seed: CompetitorContentSeed,
  defaultCategory: ContentCategory = ContentCategory.DENTAL,
): CampaignPrefill {
  // 경쟁사 같은 주제 — 단순 prefix 추가 ("우리 관점:") + pattern 그대로
  const rawTitle = seed.title?.trim() || `[${seed.competitor_domain}] 대응 콘텐츠`;
  const title = clampText(`우리 관점: ${rawTitle}`, MAX_TITLE_LEN);
  return {
    title,
    category: safeCategory(defaultCategory),
    pattern_type: seed.pattern_type,
    source_kind: 'competitor_response',
    source_id: seed.content_id || seed.competitor_domain,
  };
}

// ── 직렬화: CampaignPrefill → URLSearchParams ─────────────────

/**
 * blog 빌더 deeplink 용 URL query params. category 7 화이트리스트 검증 — 잘못된 카테고리는 omit.
 * outline_hint 는 '\n' join 으로 1 string (length cap 후).
 */
export function serializeToQueryParams(prefill: CampaignPrefill): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('from', 'geo_funnel');
  sp.set('source_kind', prefill.source_kind);
  if (prefill.title) sp.set('title', clampText(prefill.title, MAX_TITLE_LEN));
  if (prefill.category && VALID_CONTENT_CATEGORIES.has(prefill.category)) {
    sp.set('category', prefill.category);
  }
  if (prefill.tone) sp.set('tone', prefill.tone);
  if (prefill.pattern_type) sp.set('pattern_type', prefill.pattern_type);
  if (prefill.outline_hint && prefill.outline_hint.length > 0) {
    const joined = prefill.outline_hint
      .slice(0, MAX_OUTLINE_ITEMS)
      .map(s => clampText(s, MAX_OUTLINE_ITEM_LEN))
      .filter(Boolean)
      .join('\n');
    if (joined) sp.set('outline_hint', joined);
  }
  if (prefill.source_id) sp.set('source_id', clampText(prefill.source_id, MAX_TITLE_LEN));
  return sp;
}

/** 편의 — full deeplink URL string. dest 기본 '/blog'. */
export function buildPrefillDeeplink(prefill: CampaignPrefill, dest: '/blog' | '/press' | '/refine' = '/blog'): string {
  const sp = serializeToQueryParams(prefill);
  const qs = sp.toString();
  return qs ? `${dest}?${qs}` : dest;
}

/**
 * 역방향 — blog page mount 시 query params → CampaignPrefill 부분 복원.
 * category whitelist 검증, 잘못된 값은 무시.
 */
export function parseCampaignPrefill(searchParams: URLSearchParams | null): Partial<CampaignPrefill> & { from?: string } {
  if (!searchParams) return {};
  const out: Partial<CampaignPrefill> & { from?: string } = {};
  const from = searchParams.get('from');
  if (from === 'geo_funnel') out.from = from;
  const sourceKind = searchParams.get('source_kind');
  if (sourceKind === 'eeat_weakness' || sourceKind === 'sentiment_weakness' || sourceKind === 'missing_naver' || sourceKind === 'competitor_response') {
    out.source_kind = sourceKind;
  }
  const title = searchParams.get('title');
  if (title) out.title = clampText(title, MAX_TITLE_LEN);
  const rawCategory = searchParams.get('category');
  if (rawCategory && VALID_CONTENT_CATEGORIES.has(rawCategory)) {
    out.category = rawCategory as ContentCategory;
  }
  const tone = searchParams.get('tone');
  if (tone) out.tone = tone;
  const pattern = searchParams.get('pattern_type');
  if (pattern) out.pattern_type = pattern as PatternType;
  const outlineHint = searchParams.get('outline_hint');
  if (outlineHint) {
    out.outline_hint = outlineHint.split('\n')
      .slice(0, MAX_OUTLINE_ITEMS)
      .map(s => clampText(s, MAX_OUTLINE_ITEM_LEN))
      .filter(Boolean);
  }
  const sourceId = searchParams.get('source_id');
  if (sourceId) out.source_id = clampText(sourceId, MAX_TITLE_LEN);
  return out;
}
