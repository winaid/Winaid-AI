/**
 * 공용 LLM 레이어 — 공개 API.
 *
 * Phase 0: callLLM (sync) + queueLLMBatch/pollLLMBatch/listInFlightBatches/cancelLLMBatch.
 *
 * Phase 2+ 에서 기존 /api/gemini 호출부(blog/press/refine/card_news/style_learn)를
 * callLLM 로 교체 예정. 현재는 토대만.
 */

import type { LLMRequest, LLMResponse } from './types';
import { resolveRoute } from './router';
import { callGemini } from './gemini';
import { callClaude } from './claude';
import { logUsage } from './logUsage';

/**
 * 공용 LLM 호출. task → provider 자동 결정.
 *
 *  - req.googleSearch === true → 무조건 gemini-3.1-pro-preview (router 처리)
 *  - LLM_DISABLE_CLAUDE=true  → Claude 태스크도 Gemini 로 폴백 (router 처리)
 *  - 성공 시 api_usage_logs 에 한 줄 insert (실패 시 swallow)
 */
export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  if (req.stream === true) {
    throw new Error('stream is not supported in Phase 0');
  }

  const route = resolveRoute(req.task, { googleSearch: req.googleSearch });

  const resp =
    route.provider === 'claude' ? await callClaude(req) : await callGemini(req);

  // 사용량 로깅 (비차단)
  void logUsage({
    task: req.task,
    provider: resp.provider,
    model: resp.model,
    usage: resp.usage,
    latencyMs: resp.latencyMs,
    userId: req.userId ?? null,
    isBatch: false,
    batchId: null,
  });

  return resp;
}

// Batch API (claudeBatch.ts)
export {
  queueLLMBatch,
  pollLLMBatch,
  listInFlightBatches,
  cancelLLMBatch,
} from './claudeBatch';

// 공용 타입
export type {
  LLMRequest,
  LLMResponse,
  LLMUsage,
  CacheableBlock,
  LLMTaskKind,
  LLMProvider,
  BatchItem,
  BatchSubmission,
  BatchResult,
} from './types';

// 라우팅/단가 유틸 (검증 endpoint 등에서 재사용)
export { resolveRoute, isBatchable } from './router';
export { CLAUDE_RATES, GEMINI_RATES, computeClaudeCost, computeGeminiCost } from './cost';
