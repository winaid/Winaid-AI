/**
 * GET /api/diagnostic/user-history — 로그인 사용자의 진단 목록.
 *
 * 응답: { history: DiagnosticHistoryRow[] } — 클라이언트 필터·정렬용으로 한 번에 반환.
 * 1인당 진단 수가 보통 수십 건 이하라 페이지네이션 없이 직접 fetch.
 *
 * 게스트(미로그인) 는 401 — 현재 게스트 진단 목록 보관 인프라 없음.
 * 신규 가입 직후 / 진단 없는 사용자 → { history: [] } 빈 배열.
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin, getSessionSafe } from '@winaid/blog-core';
import type { DiagnosticHistoryRow } from '../../../../lib/diagnostic/historyFilter';

export const dynamic = 'force-dynamic';

const HARD_LIMIT = 500; // 1인당 cap

async function _wrappedGET(_request: NextRequest) {
  let userId: string | null = null;
  try {
    const session = await getSessionSafe();
    userId = session.userId;
  } catch {
    return NextResponse.json({ history: [] as DiagnosticHistoryRow[] }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ history: [] as DiagnosticHistoryRow[] }, { status: 401 });
  }

  const db = supabaseAdmin ?? supabase;
  if (!db) {
    logger.warn('user-history.db_missing', { module: 'user-history' });
    return NextResponse.json({ history: [] as DiagnosticHistoryRow[] });
  }

  const { data, error } = await db
    .from('diagnostic_history')
    .select('id, url, site_name, overall_score, analyzed_at')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false })
    .limit(HARD_LIMIT);

  if (error) {
    logger.warn('user-history.query_failed', { module: 'user-history' }, error);
    return NextResponse.json({ history: [] as DiagnosticHistoryRow[] });
  }

  type Row = { id: string; url: string; site_name: string | null; overall_score: number; analyzed_at: string };
  const history: DiagnosticHistoryRow[] = (data ?? []).map((r: Row) => ({
    id: r.id,
    url: r.url,
    siteName: r.site_name,
    overallScore: r.overall_score,
    analyzedAt: r.analyzed_at,
  }));

  return NextResponse.json({ history });
}

export const GET = withApiError(_wrappedGET, { route: '/api/diagnostic/user-history' });
