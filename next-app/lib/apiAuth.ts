import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@winaid/blog-core';
import { resolveImageOwner } from './serverAuth';

/**
 * API route 인증 체크 — 두 경로 지원:
 *   1. Authorization: Bearer <access_token> (Supabase 세션)
 *   2. X-Admin-Token: <admin password> (admin 페이지 별도 인증)
 * 둘 다 무효 → 401.
 */
export async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  // 1) X-Admin-Token 우선 검증 (admin 페이지에서 password 로그인한 경우)
  const adminToken = req.headers.get('x-admin-token');
  if (adminToken) {
    if (await verifyAdminToken(adminToken)) return null;
  }

  // 2) Supabase Bearer 토큰 검증
  const owner = await resolveImageOwner(req);
  if (!owner || owner === 'guest') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

// ── admin 토큰 검증 + 5분 in-memory 캐시 (serverless 인스턴스 단위) ──
const adminTokenCache = new Map<string, number>();

async function verifyAdminToken(token: string): Promise<boolean> {
  if (!token || !supabase) return false;
  const now = Date.now();
  const expireAt = adminTokenCache.get(token);
  if (expireAt && expireAt > now) return true;
  try {
    // get_admin_stats RPC 가 password 검증 — 결과 있으면 valid
    const { data, error } = await supabase.rpc('get_admin_stats', { admin_password: token });
    const ok = !error && !!data && (!Array.isArray(data) || data.length > 0);
    if (ok) {
      adminTokenCache.set(token, now + 5 * 60_000); // 5분 캐시
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
