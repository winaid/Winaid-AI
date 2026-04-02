import { NextRequest, NextResponse } from 'next/server';

/**
 * API route 인증 체크
 * 내부용(next-app)은 팀 선택 방식이라 Supabase 쿠키가 없음 → 항상 통과
 */
export async function checkAuth(_req: NextRequest): Promise<NextResponse | null> {
  return null; // 내부용은 인증 스킵
}
