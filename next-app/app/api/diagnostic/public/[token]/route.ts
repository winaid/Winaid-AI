/**
 * GET /api/diagnostic/public/[token]
 *
 * 공개 공유 토큰으로 진단 스냅샷을 반환.
 * 인증 불필요. Cache-Control: public, max-age=300 (5분).
 *
 * 에러:
 *   404 — 토큰 없음 / 만료 / 철회
 *   500 — DB 오류
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || !/^[A-Za-z0-9_-]{1,32}$/.test(token)) {
    return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 404 });
  }

  const db = getSupabaseClient();

  const { data, error } = await db
    .from('diagnostic_public_shares')
    .select('snapshot, expires_at, is_revoked')
    .eq('token', token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: '공유 링크를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (data.is_revoked) {
    return NextResponse.json({ error: '만료되었거나 취소된 공유 링크입니다.' }, { status: 404 });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: '만료된 공유 링크입니다.' }, { status: 404 });
  }

  return NextResponse.json(data.snapshot, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
  });
}
