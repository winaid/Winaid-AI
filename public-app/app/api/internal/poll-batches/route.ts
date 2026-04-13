/**
 * /api/internal/poll-batches — cron 에서 칠 배치 수거 endpoint.
 *
 * 프로덕션에서도 동작한다 (404 차단 없음). 반드시 x-cron-secret 헤더 검증.
 * Phase 0 에서는 cron 을 설정하지 않는다 — Phase 2+ 에서 Vercel Cron 또는
 * Supabase scheduled function 으로 5~10분 간격 GET 을 붙일 예정.
 *
 * 동작:
 *   1. listInFlightBatches() 로 status IN ('in_progress','canceling') 배치 조회
 *   2. 각각 pollLLMBatch 호출
 *      - 여전히 in_progress → 그대로 두고 skip
 *      - ended → 결과 파싱 + api_usage_logs 기록 + llm_batches 업데이트
 *   3. { checked, completed, errored } 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import { listInFlightBatches, pollLLMBatch } from '../../../../lib/llm';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. 시크릿 검증
  const expected = process.env.LLM_BATCH_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'LLM_BATCH_CRON_SECRET not configured on server' },
      { status: 503 },
    );
  }
  const provided = request.headers.get('x-cron-secret');
  if (provided !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2. 진행 중 배치 목록
  let inflight;
  try {
    inflight = await listInFlightBatches();
  } catch (err) {
    return NextResponse.json(
      { error: `listInFlightBatches failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  let checked = 0;
  let completed = 0;
  let errored = 0;

  // 3. 개별 poll (동기 순차 — Anthropic rate limit 회피)
  for (const b of inflight) {
    checked += 1;
    try {
      const r = await pollLLMBatch(b.batchId);
      if (r.status === 'ended') completed += 1;
    } catch (err) {
      errored += 1;
      console.warn(`[poll-batches] ${b.batchId}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ checked, completed, errored });
}
