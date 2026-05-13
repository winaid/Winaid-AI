/**
 * AEO/GEO 진단 — 권장사항 그룹 분류
 *
 * ActionItem 의 새 필드 (executionType, cost) 매핑과
 * UI 그룹 섹션 분류 규칙을 한 곳에 모은 단일 source of truth.
 *
 * - ACTION_META (actionPlan.ts) 사전은 그대로 두고, 본 파일이 LABEL 별로
 *   executionType / cost 를 결정 — Gemini 호출 없이 결정론적.
 * - 신규 LABEL 이 ACTION_META 에 추가될 때 본 파일에 매핑이 누락되면
 *   ActionItem.executionType / cost 가 undefined 가 되어 UI "미분류" fallback.
 */

import { LABELS } from './scoring';
import type { ActionCost, ActionItem, ExecutionType } from './types';

// ── LABEL → ExecutionType ─────────────────────────────────
const EXECUTION_TYPE_BY_LABEL: Record<string, ExecutionType> = {
  // security_tech — 제작사 코드/서버 작업
  [LABELS.https]: 'developer',
  [LABELS.viewport]: 'developer',
  [LABELS.robots]: 'developer',
  [LABELS.sitemap]: 'developer',
  [LABELS.psi]: 'developer',
  [LABELS.own_domain]: 'developer',

  // page_existence — 페이지 신설/구조 (디자인·홈페이지 작업)
  [LABELS.has_doctor_page]: 'homepage',
  [LABELS.has_treatment_page]: 'homepage',
  [LABELS.has_service_details]: 'homepage',
  [LABELS.has_location_page]: 'homepage',
  [LABELS.has_faq_page]: 'homepage',
  [LABELS.has_pricing_page]: 'homepage',

  // schema — 제작사 JSON-LD 추가 (코드 작업)
  [LABELS.dentist_schema]: 'developer',
  [LABELS.organization_schema]: 'developer',
  [LABELS.breadcrumb_schema]: 'developer',
  [LABELS.faq_schema]: 'developer',
  [LABELS.profile_schema]: 'developer',
  [LABELS.sameas_schema]: 'developer',
  [LABELS.review_schema]: 'developer',
  [LABELS.howto_schema]: 'developer',

  // headings — HTML 구조 (제작사 코드)
  [LABELS.h1_count]: 'developer',
  [LABELS.h2_count]: 'developer',

  // content — 텍스트/메타 수정 (즉시 가능)
  [LABELS.title_opt]: 'instant',
  [LABELS.meta_desc]: 'instant',
  [LABELS.alt_ratio]: 'instant',
  [LABELS.doctor_in_text]: 'instant',
  [LABELS.word_count]: 'instant',
  [LABELS.faq_structure]: 'instant',
  [LABELS.services_named]: 'instant',
  [LABELS.contact_text]: 'instant',
  [LABELS.address_text]: 'instant',
  [LABELS.hours_text]: 'instant',
  [LABELS.content_freshness]: 'instant',
  [LABELS.author_info]: 'instant',

  // external channels — 채널 등록 (병원이 직접)
  [LABELS.naver]: 'instant',
  [LABELS.google]: 'instant',
  [LABELS.kakao]: 'instant',
  [LABELS.youtube]: 'instant',
  [LABELS.instagram]: 'instant',
  [LABELS.news_mentions]: 'instant',
  [LABELS.owned_channels_diversity]: 'instant',

  // blog/crawler related — 제작사 메타/허용 설정
  [LABELS.blog_searchable]: 'developer',
  [LABELS.ai_crawler_access]: 'developer',
  [LABELS.llms_txt]: 'developer',

  // images — 제작사 최적화
  [LABELS.image_optimization]: 'developer',
};

// ── LABEL → ActionCost ────────────────────────────────────
const COST_BY_LABEL: Record<string, ActionCost> = {
  // security_tech — 제작사 무료 작업 (포함 또는 무료 인증서)
  [LABELS.https]: 'free',
  [LABELS.viewport]: 'free',
  [LABELS.robots]: 'free',
  [LABELS.sitemap]: 'free',
  [LABELS.psi]: 'free',
  [LABELS.own_domain]: 'external',

  // page_existence — 디자인·콘텐츠 비용 가능성
  [LABELS.has_doctor_page]: 'external',
  [LABELS.has_treatment_page]: 'external',
  [LABELS.has_service_details]: 'time_only',
  [LABELS.has_location_page]: 'time_only',
  [LABELS.has_faq_page]: 'time_only',
  [LABELS.has_pricing_page]: 'time_only',

  // schema — 제작사 무료
  [LABELS.dentist_schema]: 'free',
  [LABELS.organization_schema]: 'free',
  [LABELS.breadcrumb_schema]: 'free',
  [LABELS.faq_schema]: 'free',
  [LABELS.profile_schema]: 'free',
  [LABELS.sameas_schema]: 'free',
  [LABELS.review_schema]: 'free',
  [LABELS.howto_schema]: 'free',

  // headings
  [LABELS.h1_count]: 'free',
  [LABELS.h2_count]: 'free',

  // content — 시간 소요 (콘텐츠 작성·수정)
  [LABELS.title_opt]: 'time_only',
  [LABELS.meta_desc]: 'time_only',
  [LABELS.alt_ratio]: 'time_only',
  [LABELS.doctor_in_text]: 'time_only',
  [LABELS.word_count]: 'time_only',
  [LABELS.faq_structure]: 'time_only',
  [LABELS.services_named]: 'time_only',
  [LABELS.contact_text]: 'free',
  [LABELS.address_text]: 'free',
  [LABELS.hours_text]: 'free',
  [LABELS.content_freshness]: 'time_only',
  [LABELS.author_info]: 'time_only',

  // external channels — 등록 무료, 운영 시간
  [LABELS.naver]: 'time_only',
  [LABELS.google]: 'time_only',
  [LABELS.kakao]: 'time_only',
  [LABELS.youtube]: 'time_only',
  [LABELS.instagram]: 'time_only',
  [LABELS.news_mentions]: 'external',
  [LABELS.owned_channels_diversity]: 'time_only',

  // blog/crawler/image
  [LABELS.blog_searchable]: 'free',
  [LABELS.ai_crawler_access]: 'free',
  [LABELS.llms_txt]: 'free',
  [LABELS.image_optimization]: 'free',
};

export function getExecutionType(label: string): ExecutionType | undefined {
  return EXECUTION_TYPE_BY_LABEL[label];
}

export function getActionCost(label: string): ActionCost | undefined {
  return COST_BY_LABEL[label];
}

// ── UI 그룹 분류 ──────────────────────────────────────────

export type ActionGroup = 'instant_human' | 'ai_helpable' | 'dev_required' | 'unclassified';

export const ACTION_GROUP_LABEL: Record<ActionGroup, { emoji: string; label: string }> = {
  instant_human: { emoji: '🙋', label: '지금 바로 할 수 있는 일' },
  ai_helpable: { emoji: '🤖', label: 'AI가 도와줄 수 있는 일' },
  dev_required: { emoji: '🛠', label: '개발자/외부 작업 필요' },
  unclassified: { emoji: '📦', label: '미분류' },
};

/**
 * 그룹 결정 규칙 (우선순위 순):
 *  1) executionType 또는 cost 가 누락 → 'unclassified'
 *  2) executor 가 'ai' 또는 'both'/'hybrid' (= AI 협업) → 'ai_helpable'
 *  3) executionType === 'instant' → 'instant_human' (사람이 즉시)
 *  4) executionType ∈ {'developer','homepage'} → 'dev_required'
 *  5) 어느 조건에도 안 맞으면 'unclassified'
 *
 * 'ai_helpable' 을 가장 먼저 본 이유: 'AI 가 도와줄 수 있는' 항목은 사용자가
 *  본 앱(WINAID) 안에서 바로 처리 가능한 가장 큰 가치 — 가장 prominent 그룹.
 */
export function classifyActionGroup(action: ActionItem): ActionGroup {
  if (!action.executionType || !action.cost) return 'unclassified';

  const exec = action.executor;
  const aiCapable = exec === 'ai' || exec === 'both' || exec === 'hybrid';
  if (aiCapable) return 'ai_helpable';

  if (action.executionType === 'instant') return 'instant_human';
  if (action.executionType === 'developer' || action.executionType === 'homepage') {
    return 'dev_required';
  }
  return 'unclassified';
}

export const ACTION_GROUP_ORDER: ActionGroup[] = [
  'ai_helpable',
  'instant_human',
  'dev_required',
  'unclassified',
];
