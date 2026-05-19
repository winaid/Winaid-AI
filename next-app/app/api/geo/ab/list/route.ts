/**
 * GET /api/geo/ab/list — GEO-13 실험 list 조회 (어드민 전용).
 *
 * query:
 *   - hospital_name (옵션)
 *   - status (옵션 — draft/running/completed/cancelled)
 *   - limit (1~100, 기본 30)
 *
 * 응답: { rows: AbExperimentRow[] }
 *
 * SECURITY: admin_session cookie. supabaseAdmin 으로 RLS 우회.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const VALID_STATUS = new Set(['draft', 'running', 'completed', 'cancelled']);

async function getDb() {
  const { supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin;
}

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const hospital_name = searchParams.get('hospital_name')?.trim() || '';
  const status = searchParams.get('status')?.trim() || '';
  if (status && !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  let limit = DEFAULT_LIMIT;
  const rawLimit = searchParams.get('limit');
  if (rawLimit) {
    const n = parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0 && n <= MAX_LIMIT) limit = n;
  }

  const db = await getDb();
  if (!db) return NextResponse.json({ rows: [] });

  try {
    let q = db.from('geo_ab_experiments').select('*').order('created_at', { ascending: false }).limit(limit);
    if (hospital_name) q = q.eq('hospital_name', hospital_name);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) {
      console.warn('[ab/list] error:', error.message);
      return NextResponse.json({ rows: [] });
    }
    return NextResponse.json({ rows: data ?? [] });
  } catch (err) {
    console.warn('[ab/list] exception:', err);
    return NextResponse.json({ rows: [] });
  }
}
