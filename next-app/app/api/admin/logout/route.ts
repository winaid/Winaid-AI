/**
 * POST /api/admin/logout
 *
 * admin_session cookie 삭제 (Max-Age=0). 본문/cookie 검증 없이 항상 200 반환 —
 * 로그아웃은 idempotent.
 */

import { NextResponse } from 'next/server';
import { buildAdminClearCookieHeader } from '../../../../lib/adminCookie';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', buildAdminClearCookieHeader());
  return res;
}
