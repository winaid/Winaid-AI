/**
 * GET /api/diagnostic/history?url={encodedUrl}&limit=10
 * 같은 URL 의 최근 N건 진단 히스토리 반환 (점수 추이 바 차트용).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10) || 10, 1), 50);

  if (!url) {
    return NextResponse.json({ history: [] });
  }

  if (!supabase) {
    return NextResponse.json({ history: [] });
  }

  try {
    const { data, error } = await supabase
      .from('diagnostic_history')
      .select('overall_score, analyzed_at')
      .eq('url', url)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn('[history] 조회 실패:', error.message);
      return NextResponse.json({ history: [] });
    }

    return NextResponse.json({ history: data ?? [] });
  } catch {
    return NextResponse.json({ history: [] });
  }
}
