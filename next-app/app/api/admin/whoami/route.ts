/**
 * GET /api/admin/whoami
 *
 * admin_session cookie 가 유효하면 200 { admin: true }, 아니면 401.
 * 클라이언트가 mount 시 호출해 admin 모드 진입 여부 결정.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminCookie } from '../../../../lib/adminCookie';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const result = verifyAdminCookie(req);
  if (!result.valid) {
    return NextResponse.json({ admin: false }, { status: 401 });
  }
  return NextResponse.json({ admin: true });
}
