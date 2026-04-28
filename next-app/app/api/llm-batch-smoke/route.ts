/**
 * /api/llm-batch-smoke — 개발 전용 Batch 제출/조회 smoke endpoint.
 *
 * 프로덕션(NODE_ENV === 'production') 에서는 404. Phase 0 검증용.
 *
 * 사용법:
 *   POST /api/llm-batch-smoke
 *     body: { task: "score_crawled_post", prompts: ["...", "..."] }
 *     응답: { batchId, itemCount, submittedAt }
 *
 *   GET  /api/llm-batch-smoke?batchId=<id>
 *     응답: { batchResult, savingsPct? }
 *     ended 일 때만 savingsPct (sync 예상 비용 대비 50% 할인 반영) 계산.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queueLLMBatch, pollLLMBatch, isBatchable } from '@winaid/blog-core';
import type { BatchItem, LLMTaskKind, CacheableBlock } from '@winaid/blog-core';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const VALID_TASKS: readonly LLMTaskKind[] = [
  'press',
  'style_learn',
  'score_crawled_post',
];

/** Batch에도 cache 효과를 측정할 수 있도록 공통 system prefix */
const SYSTEM_PREFIX = `[채점 가이드] 다음 병원 블로그 글을 간략히 평가해주세요.
- 의료광고법 준수 여부
- 정보 가치
- 가독성
각 항목을 1-10점으로 채점하고 한 줄 총평을 덧붙이세요.`;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('not found', { status: 404 });
  }

  let body: { task?: string; prompts?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const taskRaw = body.task;
  const prompts = body.prompts;

  if (!taskRaw || !(VALID_TASKS as readonly string[]).includes(taskRaw)) {
    return NextResponse.json(
      { error: `invalid task. valid: ${VALID_TASKS.join(',')}` },
      { status: 400 },
    );
  }
  const task = taskRaw as LLMTaskKind;

  if (!isBatchable(task)) {
    return NextResponse.json({ error: `task ${task} is not batchable` }, { status: 400 });
  }

  if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > 100) {
    return NextResponse.json(
      { error: 'prompts must be a 1~100 length string array' },
      { status: 400 },
    );
  }

  const systemBlocks: CacheableBlock[] = [
    {
      type: 'text',
      text: SYSTEM_PREFIX,
      cacheable: true,
      cacheTtl: '1h',
    },
  ];

  const items: BatchItem[] = (prompts as string[]).map((p, i) => ({
    customId: `smoke_${Date.now()}_${i}`,
    request: {
      task,
      systemBlocks,
      userPrompt: String(p),
      maxOutputTokens: 256,
      temperature: 0.3,
    },
  }));

  try {
    const submission = await queueLLMBatch(items, { cacheTtl: '1h' });
    return NextResponse.json(submission);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ error: 'batchId required' }, { status: 400 });
  }

  try {
    const result = await pollLLMBatch(batchId);

    // 50% 절감 계산 (ended 일 때만)
    let batchCostUsd: number | null = null;
    let syncEquivalentCostUsd: number | null = null;
    let savingsPct: number | null = null;

    if (result.status === 'ended') {
      let batchCost = 0;
      let syncCost = 0;
      for (const r of result.results) {
        if (!r.response) continue;
        batchCost += r.response.usage.costUsd;
        // sync 비용 = batch 비용 / 0.5
        syncCost += r.response.usage.costUsd / 0.5;
      }
      batchCostUsd = Math.round(batchCost * 1e8) / 1e8;
      syncEquivalentCostUsd = Math.round(syncCost * 1e8) / 1e8;
      savingsPct = syncCost > 0 ? Math.round(((syncCost - batchCost) / syncCost) * 1000) / 10 : null;
    }

    return NextResponse.json({
      batchResult: result,
      batchCostUsd,
      syncEquivalentCostUsd,
      savingsPct,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

