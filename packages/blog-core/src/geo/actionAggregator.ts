/**
 * GEO-UX-1 — "오늘 우선 액션 3가지" 대시보드 집계.
 *
 * 8 GEO 섹션 결과 → priority signal 추출 → weights 적용 → top 3 액션 반환.
 * 운영자가 진단 화면 진입 시 첫 화면에 "지금 뭐부터 해야 하는지" 즉시 노출.
 *
 * 순수 함수 — 네트워크 X / DB X / LLM 호출 X.
 *
 * weights (priority high→low):
 *   100  medical_law_violation  — 의료법 위반 (즉시 교체 필수)
 *    70  missing_naver_channel  — 부재 네이버 채널 (한국 검색 핵심)
 *    60  eeat_weakness          — E-E-A-T 약점 (AI 신뢰도)
 *    50  competitor_new_content — 경쟁사 신규 콘텐츠 (즉시 대응)
 *    40  sentiment_weakness     — Sentiment 약점 (AI 평판)
 *    30  low_naver_citation     — 네이버 인용률 낮음 (visibility)
 */

import type { EEATResult } from './eeatScorer';
import type { NaverChannel, NaverChannelSummary } from './naverChannelClassifier';
import { getNaverChannelLabel } from './naverChannelClassifier';
import type { SentimentSummary } from './sentimentAnalyzer';
import type { CampaignPrefill } from './campaignPrefillBuilder';
import {
  buildPrefillFromEEATWeakness,
  buildPrefillFromSentimentWeakness,
  buildPrefillFromMissingNaverChannel,
  buildPrefillDeeplink,
} from './campaignPrefillBuilder';

// ── 타입 ──────────────────────────────────────────────────────

export type ActionImpact = 'high' | 'medium' | 'low';
export type ActionSourceKind =
  | 'medical_law_violation'
  | 'missing_naver_channel'
  | 'eeat_weakness'
  | 'competitor_new_content'
  | 'sentiment_weakness'
  | 'low_naver_citation';

export interface PriorityAction {
  /** 한국어 액션 제목. */
  title: string;
  /** 1줄 이유 (예: "E-E-A-T 신뢰도 점수 40점 → 70점 예상"). */
  reason: string;
  /** 임팩트 chip. */
  impact: ActionImpact;
  /** 어느 신호에서 trigger 됐는지 — UI 아이콘 + analytics. */
  source_kind: ActionSourceKind;
  /** 우선순위 weight (정렬 기준). */
  weight: number;
  /** 클릭 시 이동할 blog 빌더 deeplink. undefined 이면 액션 X (정보성). */
  href?: string;
  /** undefined 가능 — analytics + UI 라벨. */
  source_id?: string;
}

export interface AggregateInputs {
  /** GEO-7 (E-E-A-T) 결과. */
  eeat?: EEATResult;
  /** GEO-10 (Sentiment) 결과. */
  sentiment?: SentimentSummary;
  /** GEO-11 (네이버 채널) 결과. */
  naver?: NaverChannelSummary;
  /** GEO-9 (경쟁사 콘텐츠) 최근 미응답 list — { title?, pattern_type? }. */
  competitorRecent?: Array<{
    id?: string;
    title?: string;
    pattern_type?: string;
    competitor_domain: string;
  }>;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function impactFor(weight: number): ActionImpact {
  if (weight >= 70) return 'high';
  if (weight >= 40) return 'medium';
  return 'low';
}

// ── 신호별 추출 ────────────────────────────────────────────────

function fromMedicalLawViolations(s: SentimentSummary): PriorityAction[] {
  if (!s.medicalLawViolations || s.medicalLawViolations.length === 0) return [];
  const v = s.medicalLawViolations[0];
  return [{
    title: `의료법 위반 표현 즉시 교체: "${v.label}"`,
    reason: `AI 답변에 ${v.count}회 등장 — 환자 민원 / 행정 처분 위험`,
    impact: 'high',
    source_kind: 'medical_law_violation',
    weight: 100,
    href: undefined,
    source_id: v.keyword,
  }];
}

function fromMissingNaverChannels(n: NaverChannelSummary): PriorityAction[] {
  if (!n.missingChannels || n.missingChannels.length === 0) return [];
  return n.missingChannels.slice(0, 4).map((ch: NaverChannel) => {
    const prefill: CampaignPrefill = buildPrefillFromMissingNaverChannel(ch);
    return {
      title: `${getNaverChannelLabel(ch)} 콘텐츠 신설`,
      reason: '한국 의료 검색의 80%+ 가 네이버 채널 경유 — 부재 시 인용 0',
      impact: 'high',
      source_kind: 'missing_naver_channel',
      weight: 70,
      href: buildPrefillDeeplink(prefill),
      source_id: ch,
    };
  });
}

function fromEEATWeaknesses(e: EEATResult): PriorityAction[] {
  if (!e.weaknesses || e.weaknesses.length === 0) return [];
  return e.weaknesses.slice(0, 5).map((w) => {
    const prefill = buildPrefillFromEEATWeakness(w.label, [w.recommendation], undefined, w.label);
    return {
      title: `E-E-A-T 보강: ${w.label}`,
      reason: `현재 종합 ${e.overall}점 → 약점 보강 시 ${Math.min(100, e.overall + 8)}점 예상`,
      impact: 'medium' as ActionImpact,
      source_kind: 'eeat_weakness' as ActionSourceKind,
      weight: 60,
      href: buildPrefillDeeplink(prefill),
      source_id: w.label,
    };
  });
}

function fromCompetitorRecent(competitors: AggregateInputs['competitorRecent']): PriorityAction[] {
  if (!competitors || competitors.length === 0) return [];
  return competitors.slice(0, 3).map((c) => ({
    title: `경쟁사 대응: ${c.title || c.competitor_domain}`,
    reason: `${c.competitor_domain}${c.pattern_type ? ` (${c.pattern_type}형)` : ''} — 즉시 대응 콘텐츠 작성`,
    impact: 'medium' as ActionImpact,
    source_kind: 'competitor_new_content' as ActionSourceKind,
    weight: 50,
    // CompetitorContentSection 의 server-side respond endpoint 가 prefillUrl 생성 — 본 대시보드는 직접 deeplink 안 만들고 섹션 이동 유도
    href: undefined,
    source_id: c.id,
  }));
}

function fromSentimentWeaknesses(s: SentimentSummary): PriorityAction[] {
  if (!s.weaknesses || s.weaknesses.length === 0) return [];
  return s.weaknesses.slice(0, 3).map((w) => {
    const prefill = buildPrefillFromSentimentWeakness(w.label, [], undefined, w.keyword);
    return {
      title: `Sentiment 보강: ${w.label}`,
      reason: `AI 답변에 ${w.count}회 부정 신호 — 약점 보강 콘텐츠 작성`,
      impact: 'medium' as ActionImpact,
      source_kind: 'sentiment_weakness' as ActionSourceKind,
      weight: 40,
      href: buildPrefillDeeplink(prefill),
      source_id: w.keyword,
    };
  });
}

function fromLowNaverCitation(n: NaverChannelSummary): PriorityAction[] {
  if (n.totalCitations === 0) return [];
  const naverPct = (n.naverCitations / n.totalCitations) * 100;
  // 네이버 인용 비율이 30% 미만 (한국에서 비정상적으로 낮음) — 우선 보강
  if (naverPct >= 30) return [];
  return [{
    title: '네이버 노출 보강 (현재 인용률 < 30%)',
    reason: `네이버 인용 ${n.naverCitations}/${n.totalCitations}건 (${Math.round(naverPct)}%) — 한국 평균 80%+ 대비 매우 낮음`,
    impact: 'medium',
    source_kind: 'low_naver_citation',
    weight: 30,
    href: undefined,
    source_id: 'low_naver_pct',
  }];
}

// ── public — top 3 액션 집계 ──────────────────────────────────

/**
 * 모든 입력 → weight 기준 정렬 → 같은 source_kind 중복 제거 (높은 우선 1건만) → top 3.
 *
 * 입력 누락 (예: eeat undefined) 시 그 신호 skip.
 */
export function aggregateTop3Actions(inputs: AggregateInputs): PriorityAction[] {
  const all: PriorityAction[] = [];
  if (inputs.sentiment) all.push(...fromMedicalLawViolations(inputs.sentiment));
  if (inputs.naver) all.push(...fromMissingNaverChannels(inputs.naver));
  if (inputs.eeat) all.push(...fromEEATWeaknesses(inputs.eeat));
  if (inputs.competitorRecent) all.push(...fromCompetitorRecent(inputs.competitorRecent));
  if (inputs.sentiment) all.push(...fromSentimentWeaknesses(inputs.sentiment));
  if (inputs.naver) all.push(...fromLowNaverCitation(inputs.naver));

  // weight desc 정렬
  all.sort((a, b) => b.weight - a.weight);

  // source_kind 중복 제거 (같은 종류 1건만, 가장 weight 높은 것)
  const seenKind = new Set<ActionSourceKind>();
  const out: PriorityAction[] = [];
  for (const a of all) {
    if (seenKind.has(a.source_kind)) continue;
    seenKind.add(a.source_kind);
    out.push({ ...a, impact: impactFor(a.weight) });
    if (out.length >= 3) break;
  }
  return out;
}
