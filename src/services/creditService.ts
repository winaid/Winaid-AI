/**
 * Credit Service - 사용량 체크/차감 + API 비용 추적
 * SaaS 과금의 기본 인프라
 */

import { supabase } from '../lib/supabase';

// 콘텐츠 타입별 크레딧 소모량
export const CREDIT_COSTS: Record<string, number> = {
  blog: 1,
  card_news: 2,
  press_release: 1,
};

// Gemini 모델별 토큰 단가 (USD per 1M tokens, 2026-03 기준 추정)
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.5 },
  'gemini-3-pro-image-preview': { input: 1.25, output: 5.0 },  // 이미지 생성 (Nano Banana Pro)
};

export interface CreditStatus {
  canGenerate: boolean;
  creditsRemaining: number;
  creditsTotal: number;
  creditsUsed: number;
  planType: string;
  message?: string;
}

export interface ApiUsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  operation: string; // 'blog_outline', 'blog_section', 'blog_intro', etc.
}

// 세션 내 API 사용량 누적 (메모리)
let sessionUsage: ApiUsageRecord[] = [];

// checkCredits / deductCredit 삭제됨 — 서버(proxy)에서 JWT+generation token으로 처리
// see: geminiClient.ts → deductCreditOnServer(), vercel-proxy/api/gemini.js

/**
 * API 사용량 기록 (세션 내 메모리 + Supabase)
 */
export function trackApiUsage(record: ApiUsageRecord): void {
  sessionUsage.push(record);
}

/**
 * 토큰 수에서 비용 계산
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = TOKEN_PRICING[model] || TOKEN_PRICING['gemini-3.1-flash-lite-preview'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/**
 * 세션 사용량 요약 가져오기
 */
export function getSessionUsageSummary(): {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byOperation: Record<string, number>;
} {
  const summary = {
    totalCalls: sessionUsage.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    byOperation: {} as Record<string, number>,
  };

  for (const r of sessionUsage) {
    summary.totalInputTokens += r.inputTokens;
    summary.totalOutputTokens += r.outputTokens;
    summary.totalCostUsd += r.costUsd;
    summary.byOperation[r.operation] = (summary.byOperation[r.operation] || 0) + 1;
  }

  return summary;
}

/**
 * 세션 사용량을 Supabase에 저장
 */
export async function flushSessionUsage(): Promise<void> {
  if (sessionUsage.length === 0) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const summary = getSessionUsageSummary();

    await supabase.from('api_usage_logs').insert({
      user_id: user.id,
      total_calls: summary.totalCalls,
      total_input_tokens: summary.totalInputTokens,
      total_output_tokens: summary.totalOutputTokens,
      total_cost_usd: summary.totalCostUsd,
      details: JSON.stringify(sessionUsage),
      created_at: new Date().toISOString(),
    } as any);

    sessionUsage = []; // 초기화
  } catch (error) {
    console.error('[CreditService] 사용량 저장 실패:', error);
    // 실패해도 세션 데이터 유지 (다음 기회에 저장)
  }
}

/**
 * 세션 사용량 초기화
 */
export function resetSessionUsage(): void {
  sessionUsage = [];
}
