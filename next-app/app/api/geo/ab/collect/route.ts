/**
 * POST /api/geo/ab/collect — GEO-13 실험 메트릭 수집 (cron + 어드민 수동).
 *
 * Vercel Cron 호출 (vercel.json 의 crons 엔트리) 와 어드민 수동 호출 둘 다 지원.
 *
 * body (옵션):
 *   - experiment_id (옵션, 미지정 시 status='running' 모든 실험)
 *   - queries (옵션, 미지정 시 experiment.queries 사용)
 *
 * 응답: { results: [{ experiment_id, metrics_inserted, per_variant }, ...] }
 *
 * SECURITY: admin_session cookie 또는 Vercel Cron header (CRON_SECRET) 검증.
 *           CLAUDE.md P-1 — 어드민 무제한.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
import { collectMetrics } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getDb() {
  const { supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin;
}

/**
 * Vercel Cron 인증: Authorization: Bearer ${CRON_SECRET}
 * 어드민 cookie 인증과 OR — 둘 중 하나 통과 시 OK.
 */
function isVercelCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  // 어드민 cookie 또는 Vercel Cron 토큰
  const isCron = isVercelCronAuthorized(request);
  if (!isCron) {
    const auth = await checkAuth(request);
    if (auth) return auth;
  }

  let body: { experiment_id?: string; queries?: string[] } = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const db = await getDb();
  if (!db) return NextResponse.json({ error: 'supabase not configured' }, { status: 503 });

  try {
    // experiment_id 명시: 단일 실험만
    if (body.experiment_id) {
      const result = await collectMetrics(db, {
        experiment_id: body.experiment_id,
        queries: body.queries,
      });
      return NextResponse.json({ results: [{ experiment_id: body.experiment_id, ...result }] });
    }

    // 미지정: status='running' 모든 실험
    const { data: running, error } = await db
      .from('geo_ab_experiments')
      .select('id')
      .eq('status', 'running');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: Array<{ experiment_id: string; metrics_inserted: number; per_variant: unknown[] }> = [];
    for (const row of ((running ?? []) as Array<{ id: string }>)) {
      try {
        const r = await collectMetrics(db, { experiment_id: row.id });
        results.push({ experiment_id: row.id, metrics_inserted: r.metrics_inserted, per_variant: r.per_variant });
      } catch (err) {
        console.warn('[ab/collect] experiment', row.id, 'failed:', err);
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
