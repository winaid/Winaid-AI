import { NextRequest, NextResponse } from 'next/server';

/**
 * API route 인증 체크 — Supabase 세션 쿠키 존재 확인
 * @returns null이면 인증 성공, NextResponse면 401 반환
 */
export async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  const cookies = req.headers.get('cookie') || '';
  if (!/sb-[a-z]+-auth-token/.test(cookies)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  return null;
}
