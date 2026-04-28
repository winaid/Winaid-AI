/**
 * Anthropic Message Batches API 래퍼 (50% 할인).
 *
 * 실시간 UX 필요 없는 태스크(말투 학습, 크롤링 글 채점, 배치 콘텐츠 생성)는
 * queueLLMBatch 로 제출하고 pollLLMBatch 로 결과를 수신.
 *
 * Phase 0 범위:
 *   - queueLLMBatch:   검증 + 제출 + llm_batches insert
 *   - pollLLMBatch:    상태 조회 + ended 시 결과 스트림 파싱 + api_usage_logs 기록
 *   - listInFlightBatches: 관리자/cron 용 in-progress 목록
 *   - cancelLLMBatch:  Anthropic 에 cancel 호출 + status='canceling'
 *
 * TODO (Phase 2+):
 *   Vercel Cron 또는 Supabase scheduled function 으로 5~10분 간격 poll endpoint 호출.
 *   Phase 0 에서는 endpoint 만 만들고 cron 은 설정하지 않는다.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  BatchCreateParams,
  MessageBatch,
  MessageBatchIndividualResponse,
} from '@anthropic-ai/sdk/resources/messages/batches';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  BatchItem,
  BatchResult,
  BatchSubmission,
  LLMProvider,
  LLMResponse,
  LLMTaskKind,
  LLMUsage,
} from './types';
import { resolveRoute, isBatchable } from './router';
import { fillClaudeUsage } from './cost';
import { buildClaudeSystemParam } from './claude';
import { logUsage } from './logUsage';

const CUSTOM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ITEMS_PHASE0 = 100;

// ── Anthropic 클라이언트 ──

function getClaudeKey(): string {
  const keys = [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_API_KEY_2,
    process.env.ANTHROPIC_API_KEY_3,
  ].filter((k): k is string => !!k);
  if (keys.length === 0) throw new Error('ANTHROPIC_API_KEY not set');
  return keys[0]; // Batch 호출은 단일 키 사용 (여러 키면 첫 번째)
}

function newClient(): Anthropic {
  return new Anthropic({ apiKey: getClaudeKey() });
}

// ── Supabase (llm_batches 관리용) ──

let cachedDb: SupabaseClient | null | undefined;
function getDb(): SupabaseClient | null {
  if (cachedDb !== undefined) return cachedDb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) {
    cachedDb = null;
    return null;
  }
  cachedDb = createClient(url, key, { auth: { persistSession: false } });
  return cachedDb;
}

// ── queueLLMBatch ──

export interface QueueLLMBatchOpts {
  /** 기본 '1h' (Batch 지연 고려). */
  cacheTtl?: '5m' | '1h';
  /** 제출한 사용자 (llm_batches.created_by) */
  userId?: string | null;
}

export async function queueLLMBatch(
  items: BatchItem[],
  opts: QueueLLMBatchOpts = {},
): Promise<BatchSubmission> {
  // 1. 검증
  if (!Array.isArray(items) || items.length < 1) {
    throw new Error('queueLLMBatch: items must be non-empty array');
  }
  if (items.length > MAX_ITEMS_PHASE0) {
    throw new Error(`queueLLMBatch: Phase 0 limit is ${MAX_ITEMS_PHASE0} items per batch`);
  }

  const task = items[0].request.task;
  if (!isBatchable(task)) {
    throw new Error(`queueLLMBatch: task "${task}" is not batchable (realtime UX)`);
  }
  for (const it of items) {
    if (it.request.task !== task) {
      throw new Error(`queueLLMBatch: all items must share same task (expected "${task}", got "${it.request.task}")`);
    }
    if (!CUSTOM_ID_RE.test(it.customId)) {
      throw new Error(`queueLLMBatch: invalid customId "${it.customId}" (must match ${CUSTOM_ID_RE})`);
    }
  }
  const ids = new Set<string>();
  for (const it of items) {
    if (ids.has(it.customId)) {
      throw new Error(`queueLLMBatch: duplicate customId "${it.customId}"`);
    }
    ids.add(it.customId);
  }

  const route = resolveRoute(task);
  if (route.provider !== 'claude') {
    throw new Error(`queueLLMBatch: route provider is "${route.provider}" — only claude batches supported`);
  }

  const cacheTtl = opts.cacheTtl ?? '1h';

  // 2. Anthropic requests 변환
  const requests: BatchCreateParams.Request[] = items.map(it => ({
    custom_id: it.customId,
    params: {
      model: route.model,
      max_tokens: it.request.maxOutputTokens ?? 8192,
      temperature: it.request.temperature ?? 0.7,
      system: buildClaudeSystemParam(it.request.systemBlocks, cacheTtl),
      messages: [{ role: 'user', content: it.request.userPrompt }],
    },
  }));

  // 3. 제출
  const client = newClient();
  const batch = await client.messages.batches.create({ requests });

  const submittedAt = batch.created_at || new Date().toISOString();
  const estimatedCompletionAt = batch.expires_at ?? null;

  // 4. llm_batches row insert (있을 때만)
  const db = getDb();
  if (db) {
    const { error } = await db.from('llm_batches').insert({
      anthropic_batch_id: batch.id,
      provider: 'claude' as LLMProvider,
      task,
      model: route.model,
      item_count: items.length,
      custom_ids: items.map(i => i.customId),
      status: 'in_progress',
      submitted_at: submittedAt,
      created_by: opts.userId ?? null,
    });
    if (error) {
      console.warn(`[llm/claudeBatch] llm_batches insert failed: ${error.message}`);
    }
  }

  return {
    batchId: batch.id,
    provider: 'claude',
    task,
    itemCount: items.length,
    submittedAt,
    estimatedCompletionAt,
  };
}

// ── pollLLMBatch ──

function mapBatchStatus(s: MessageBatch['processing_status']): 'in_progress' | 'canceling' | 'ended' {
  if (s === 'ended') return 'ended';
  if (s === 'canceling') return 'canceling';
  return 'in_progress';
}

interface StoredBatchMeta {
  task: LLMTaskKind;
  model: string;
  cacheTtl: '5m' | '1h';
}

async function loadBatchMeta(batchId: string): Promise<StoredBatchMeta | null> {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db
    .from('llm_batches')
    .select('task, model')
    .eq('anthropic_batch_id', batchId)
    .maybeSingle();
  if (error || !data) return null;
  // cacheTtl 은 llm_batches 에 저장 안 하고 있음 — Phase 0 에서는 '1h' 고정 (queueLLMBatch 기본값).
  return {
    task: data.task as LLMTaskKind,
    model: data.model as string,
    cacheTtl: '1h',
  };
}

export async function pollLLMBatch(batchId: string): Promise<BatchResult> {
  const client = newClient();
  const batch = await client.messages.batches.retrieve(batchId);

  const status = mapBatchStatus(batch.processing_status);
  const counts = batch.request_counts;
  const processedCount = counts.succeeded + counts.errored + counts.expired + counts.canceled;

  // ended 가 아니면 결과 파싱 스킵
  if (status !== 'ended') {
    return {
      batchId,
      status,
      processedCount,
      succeededCount: counts.succeeded,
      erroredCount: counts.errored,
      expiredCount: counts.expired,
      results: [],
    };
  }

  // meta 조회 (task/model 복원용)
  const meta = await loadBatchMeta(batchId);
  const modelForCost = meta?.model ?? 'claude-haiku-4-5-20251001';
  const taskForLog: LLMTaskKind = meta?.task ?? 'score_crawled_post';
  const cacheTtl = meta?.cacheTtl ?? '1h';

  // 결과 JSONL 스트림 파싱
  const resultsStream = await client.messages.batches.results(batchId);
  const results: BatchResult['results'] = [];
  let totalCostUsd = 0;

  for await (const item of resultsStream as AsyncIterable<MessageBatchIndividualResponse>) {
    const customId = item.custom_id;
    const r = item.result;

    if (r.type === 'succeeded') {
      const msg = r.message;
      const text = msg.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('');
      const u = msg.usage;
      const usage: LLMUsage = fillClaudeUsage(
        modelForCost,
        {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        },
        true, // isBatch
        cacheTtl,
      );
      totalCostUsd += usage.costUsd;

      const response: LLMResponse = {
        text,
        provider: 'claude',
        model: modelForCost,
        usage,
        latencyMs: 0, // Batch는 개별 latency 없음
        customId,
      };

      results.push({ customId, response, error: null });

      // api_usage_logs 기록 (Batch 성공 건만)
      void logUsage({
        task: taskForLog,
        provider: 'claude',
        model: modelForCost,
        usage,
        latencyMs: 0,
        userId: null,
        isBatch: true,
        batchId,
      });
    } else if (r.type === 'errored') {
      results.push({ customId, response: null, error: r.error?.error?.message || 'errored' });
    } else if (r.type === 'canceled') {
      results.push({ customId, response: null, error: 'canceled' });
    } else if (r.type === 'expired') {
      results.push({ customId, response: null, error: 'expired' });
    }
  }

  // llm_batches row 업데이트
  const db = getDb();
  if (db) {
    const { error } = await db
      .from('llm_batches')
      .update({
        status: 'ended',
        completed_at: batch.ended_at ?? new Date().toISOString(),
        succeeded_count: counts.succeeded,
        errored_count: counts.errored,
        expired_count: counts.expired,
        total_cost_usd: Math.round(totalCostUsd * 1e6) / 1e6,
      })
      .eq('anthropic_batch_id', batchId);
    if (error) {
      console.warn(`[llm/claudeBatch] llm_batches update failed: ${error.message}`);
    }
  }

  return {
    batchId,
    status: 'ended',
    processedCount,
    succeededCount: counts.succeeded,
    erroredCount: counts.errored,
    expiredCount: counts.expired,
    results,
  };
}

// ── listInFlightBatches ──

export async function listInFlightBatches(): Promise<BatchSubmission[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from('llm_batches')
    .select('anthropic_batch_id, provider, task, item_count, submitted_at, status')
    .in('status', ['in_progress', 'canceling']);
  if (error || !data) return [];
  return data.map(r => ({
    batchId: r.anthropic_batch_id as string,
    provider: r.provider as LLMProvider,
    task: r.task as LLMTaskKind,
    itemCount: r.item_count as number,
    submittedAt: r.submitted_at as string,
    estimatedCompletionAt: null,
  }));
}

// ── cancelLLMBatch ──

export async function cancelLLMBatch(batchId: string): Promise<void> {
  const client = newClient();
  await client.messages.batches.cancel(batchId);
  const db = getDb();
  if (db) {
    await db
      .from('llm_batches')
      .update({ status: 'canceling' })
      .eq('anthropic_batch_id', batchId);
  }
}
