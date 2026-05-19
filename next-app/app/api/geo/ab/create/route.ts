/**
 * POST /api/geo/ab/create — GEO-13 실험 + variant 생성 (어드민 전용).
 *
 * body: CreateExperimentInput (variants 2~4 강제)
 *
 * 응답: { experiment_id, variant_ids, variant_prompts: [{ variant_id, variant_name, prompt }] }
 *
 * SECURITY: admin_session cookie 검증. supabaseAdmin 으로 RLS 우회.
 *           CLAUDE.md P-1 — 어드민 무제한, rate limit / quota 없음.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
import { createExperiment, type CreateExperimentInput } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getDb() {
  const { supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: CreateExperimentInput;
  try {
    body = (await request.json()) as CreateExperimentInput;
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  if (!body.hospital_name?.trim()) {
    return NextResponse.json({ error: 'hospital_name required' }, { status: 400 });
  }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 });
  }
  if (!Array.isArray(body.variants) || body.variants.length < 2 || body.variants.length > 4) {
    return NextResponse.json({ error: 'variants must be 2~4' }, { status: 400 });
  }
  if (!body.baseReq || typeof body.baseReq !== 'object') {
    return NextResponse.json({ error: 'baseReq required' }, { status: 400 });
  }

  const db = await getDb();
  if (!db) return NextResponse.json({ error: 'supabase not configured' }, { status: 503 });

  try {
    const result = await createExperiment(db, body);
    // variant_prompts 의 prompt 본문은 응답 payload 크고 클라이언트가 거의 안 씀 —
    // 메타데이터만 반환. 호출자가 실제 buildBlogPromptV3 재호출하려면 별도.
    return NextResponse.json({
      experiment_id: result.experiment_id,
      variant_ids: result.variant_ids,
      variants_summary: result.variant_prompts.map((v) => ({
        variant_id: v.variant_id,
        variant_name: v.variant_name,
        format_config: v.format_config,
        system_blocks_count: v.prompt.systemBlocks.length,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
