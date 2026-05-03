import { NextRequest, NextResponse } from 'next/server';
import { resolveImageOwner } from './serverAuth';
import { verifyAdminCookie } from './adminCookie';

/**
 * API route 인증 체크 — 두 경로 지원:
 *   1. admin_session HttpOnly cookie (admin 페이지 cookie 인증)
 *   2. Authorization: Bearer <access_token> (Supabase 세션)
 * 둘 다 무효 → 401.
 *
 * 과거의 X-Admin-Token 헤더 + localStorage 평문 저장 + get_admin_stats RPC password
 * 검증 + 5분 in-memory 캐시 패턴은 모두 제거. cookie 기반 stateless HMAC 검증으로
 * 통일.
 */
export async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  // 1) admin_session HttpOnly cookie 우선
  const cookie = verifyAdminCookie(req);
  if (cookie.valid) return null;

  // 2) Supabase Bearer 토큰 검증
  const owner = await resolveImageOwner(req);
  if (!owner || owner === 'guest') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
