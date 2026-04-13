/**
 * 토큰 → USD 환산.
 *
 * 단가 (USD / 1M tokens) — Phase 0 기준 고정 상수.
 * 가격이 변경되면 이 파일만 수정.
 *
 * Gemini 계산식:
 *   inputTokens * input + outputTokens * output
 *
 * Claude 계산식 (sync):
 *   Anthropic 의 input_tokens 는 "non-cached" 분만 반환하는 스펙.
 *   방어적으로 input_tokens 에서 cache_read/write 를 한 번 더 빼 음수 방지.
 *   (nonCachedInput) * input
 *   + cacheReadTokens  * cacheRead
 *   + cacheWriteTokens * cacheWrite(5m | 1h)
 *   + outputTokens     * output
 *
 * Batch 경로는 위 결과에 0.5x 곱.
 */

import type { LLMUsage } from './types';

export interface GeminiRates {
  /** USD / 1M tokens */
  input: number;
  output: number;
}

export interface ClaudeRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

export const GEMINI_RATES: Record<string, GeminiRates> = {
  'gemini-3.1-pro-preview': { input: 1.25, output: 10.0 },
  'gemini-3.1-flash-lite-preview': { input: 0.1, output: 0.4 },
};

export const CLAUDE_RATES: Record<string, ClaudeRates> = {
  'claude-haiku-4-5-20251001': {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2.0,
  },
  'claude-sonnet-4-6': {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
  },
  'claude-opus-4-6': {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite5m: 18.75,
    cacheWrite1h: 30.0,
  },
};

const MTOK = 1_000_000;

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** Gemini 비용 (캐시 개념 없음) */
export function computeGeminiCost(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const r = GEMINI_RATES[model];
  if (!r) return 0;
  return round8((usage.inputTokens * r.input) / MTOK + (usage.outputTokens * r.output) / MTOK);
}

/**
 * Claude 비용.
 *
 * @param model    claude-haiku-4-5-20251001 | claude-sonnet-4-6 | claude-opus-4-6
 * @param usage    inputTokens/outputTokens/cacheRead/cacheWrite
 * @param isBatch  true면 0.5x
 * @param cacheTtl '5m' | '1h' — cacheWrite 가 있는 경우에만 의미 있음
 */
export function computeClaudeCost(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
  isBatch: boolean,
  cacheTtl: '5m' | '1h' = '5m',
): number {
  const r = CLAUDE_RATES[model];
  if (!r) return 0;

  const cacheWriteRate = cacheTtl === '1h' ? r.cacheWrite1h : r.cacheWrite5m;

  // Anthropic 응답의 input_tokens 는 cached 제외 분만 반환하는 것이 공식 스펙.
  // 그래도 방어적으로 빼서 음수 방지 (0 floor).
  const nonCachedInput = Math.max(
    0,
    usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
  );

  let cost =
    (nonCachedInput * r.input) / MTOK +
    (usage.cacheReadTokens * r.cacheRead) / MTOK +
    (usage.cacheWriteTokens * cacheWriteRate) / MTOK +
    (usage.outputTokens * r.output) / MTOK;

  if (isBatch) cost *= 0.5;

  return round8(cost);
}

/** usage → LLMUsage (costUsd 포함). provider별 디스패치. */
export function fillGeminiUsage(
  model: string,
  partial: { inputTokens: number; outputTokens: number },
  isBatch: boolean = false,
): LLMUsage {
  return {
    inputTokens: partial.inputTokens,
    outputTokens: partial.outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: computeGeminiCost(model, partial),
    isBatch,
  };
}

export function fillClaudeUsage(
  model: string,
  partial: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
  isBatch: boolean,
  cacheTtl: '5m' | '1h' = '5m',
): LLMUsage {
  return {
    inputTokens: partial.inputTokens,
    outputTokens: partial.outputTokens,
    cacheReadTokens: partial.cacheReadTokens,
    cacheWriteTokens: partial.cacheWriteTokens,
    costUsd: computeClaudeCost(model, partial, isBatch, cacheTtl),
    isBatch,
  };
}
