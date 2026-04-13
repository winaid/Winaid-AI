/**
 * api_usage_logs 로깅.
 *
 * Supabase service role 클라이언트로 insert (RLS 우회). 미설정 환경이면 silent skip.
 * 실패해도 응답을 차단하지 않는다 (console.warn 만).
 *
 * Phase 0 에서는 service role key 가 필요하다. 기존 .env.example 에는 없지만
 * SUPABASE_SERVICE_ROLE_KEY 가 있으면 사용, 없으면 anon 키로 시도 (RLS 로 블록될 수 있음).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { LLMProvider, LLMTaskKind, LLMUsage } from './types';

let cachedClient: SupabaseClient | null | undefined;

/**
 * 서버 전용 Supabase 클라이언트 (service role → anon 순 시도).
 * 캐싱된 결과를 재사용. 미설정이면 null.
 */
function getLogClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    cachedClient = null;
    return null;
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

export interface LogUsageArgs {
  task: LLMTaskKind;
  provider: LLMProvider;
  model: string;
  usage: LLMUsage;
  latencyMs: number;
  userId?: string | null;
  isBatch: boolean;
  batchId?: string | null;
}

/**
 * api_usage_logs 에 한 줄 insert.
 * 실패는 swallow — 이 함수는 호출자 흐름을 절대 막지 않는다.
 */
export async function logUsage(args: LogUsageArgs): Promise<void> {
  const client = getLogClient();
  if (!client) return;

  try {
    // api_usage_logs 는 legacy 스키마 기준 total_* 컬럼을 가짐.
    // 2026-04-13 마이그레이션으로 provider/model/task/cache_*/is_batch/batch_id/latency_ms 추가.
    const row = {
      user_id: args.userId ?? null,
      total_calls: 1,
      total_input_tokens: args.usage.inputTokens,
      total_output_tokens: args.usage.outputTokens,
      total_cost_usd: args.usage.costUsd,
      details: [],
      provider: args.provider,
      model: args.model,
      task: args.task,
      cache_read_tokens: args.usage.cacheReadTokens,
      cache_write_tokens: args.usage.cacheWriteTokens,
      is_batch: args.isBatch,
      batch_id: args.batchId ?? null,
      latency_ms: args.latencyMs,
    };

    const { error } = await client.from('api_usage_logs').insert(row);
    if (error) {
      console.warn(`[llm/logUsage] insert failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[llm/logUsage] unexpected error: ${(err as Error).message}`);
  }
}
