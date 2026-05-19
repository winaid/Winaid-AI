/**
 * GET /api/geo/ab/[id] — GEO-13 실험 상세 + analyzeResult 결과.
 *
 * 응답: AbAnalysisResult (experiment + variants summary + winner + notes)
 *
 * SECURITY: admin_session cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
import { analyzeResult } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';

async function getDb() {
  const { supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const db = await getDb();
  if (!db) return NextResponse.json({ error: 'supabase not configured' }, { status: 503 });

  try {
    const result = await analyzeResult(db, id);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    const status = msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
