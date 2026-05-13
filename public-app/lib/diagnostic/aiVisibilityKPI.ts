/**
 * AI Visibility KPI 어댑터 — ChatGPT / Gemini 모델별 분리 점수 도출.
 *
 * 데이터 우선순위:
 *   1. 실측 (SSE measurementResults) — MeasurementData.selfIncluded + selfRank → 점수 변환
 *   2. 휴리스틱 fallback — predictAIVisibility 의 score (categories 기반 0-100)
 *
 * 실측 점수 변환 (selfIncluded=true 시):
 *   rank=1 → 100, rank=2 → 85, rank=3 → 70, rank=4 → 55, rank=5 → 40, rank>5 → 25
 *   selfIncluded=false → 0
 *
 * Strongest/Weakest: 두 점수 차이 ≥ 5 → 강한쪽 / 약한쪽. 그 외 'equal'.
 *   양쪽 점수 null → strongest/weakest 모두 null (UI "측정 미완료").
 *
 * Avg Position: 실측이 있을 때만 selfRank 평균 (selfIncluded=true 만 계산). 실측 0건 → null.
 */

import type {
  AIPlatform,
  AIVisibility,
  MeasurementData,
} from './types';

export type StrongestKey = 'chatGPT' | 'gemini' | 'equal' | null;

export interface AIVisibilityKPI {
  chatGPT: { score: number | null; position: number | null };
  gemini: { score: number | null; position: number | null };
  strongest: StrongestKey;
  weakest: StrongestKey;
  /** 실측이 있는 platform 의 selfRank 평균. 실측 0건 → null. */
  avgPosition: number | null;
}

const DIFF_THRESHOLD = 5;

function rankToScore(rank: number | null, included: boolean): number {
  if (!included) return 0;
  if (rank === null || !Number.isFinite(rank)) return 25;
  if (rank <= 1) return 100;
  if (rank === 2) return 85;
  if (rank === 3) return 70;
  if (rank === 4) return 55;
  if (rank === 5) return 40;
  return 25;
}

function platformScore(
  platform: AIPlatform,
  liveResults: Partial<Record<AIPlatform, MeasurementData>>,
  heuristic: AIVisibility[],
): { score: number | null; position: number | null } {
  const live = liveResults[platform];
  if (live) {
    return {
      score: rankToScore(live.selfRank, live.selfIncluded),
      position: live.selfIncluded ? live.selfRank : null,
    };
  }
  const h = heuristic.find((v) => v.platform === platform);
  if (h && typeof h.score === 'number') {
    return { score: h.score, position: null };
  }
  return { score: null, position: null };
}

function decideStrongest(
  cgScore: number | null,
  gmScore: number | null,
): { strongest: StrongestKey; weakest: StrongestKey } {
  if (cgScore === null && gmScore === null) return { strongest: null, weakest: null };
  if (cgScore === null) return { strongest: 'gemini', weakest: 'chatGPT' };
  if (gmScore === null) return { strongest: 'chatGPT', weakest: 'gemini' };
  const diff = cgScore - gmScore;
  if (Math.abs(diff) < DIFF_THRESHOLD) return { strongest: 'equal', weakest: 'equal' };
  return diff > 0
    ? { strongest: 'chatGPT', weakest: 'gemini' }
    : { strongest: 'gemini', weakest: 'chatGPT' };
}

export function deriveAIVisibilityKPI(
  heuristic: AIVisibility[],
  liveResults: Partial<Record<AIPlatform, MeasurementData>> = {},
): AIVisibilityKPI {
  const chatGPT = platformScore('ChatGPT', liveResults, heuristic);
  const gemini = platformScore('Gemini', liveResults, heuristic);
  const { strongest, weakest } = decideStrongest(chatGPT.score, gemini.score);

  // Avg position — 실측 platform 의 selfRank 만 평균 (selfIncluded=true)
  const positions: number[] = [];
  for (const p of ['ChatGPT', 'Gemini'] as const) {
    const live = liveResults[p];
    if (live?.selfIncluded && typeof live.selfRank === 'number') {
      positions.push(live.selfRank);
    }
  }
  const avgPosition =
    positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null;

  return { chatGPT, gemini, strongest, weakest, avgPosition };
}
