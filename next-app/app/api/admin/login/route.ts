/**
 * POST /api/admin/login
 *
 * 입력: { password: string }
 * 출력 (성공): 200 + Set-Cookie admin_session=...; HttpOnly; Secure(prod); SameSite=Strict; Max-Age=3600
 * 출력 (실패): 401 invalid_password
 * 출력 (미초기화): 503 admin_not_configured
 *
 * - timing-safe password 비교 (verifyAdminPassword)
 * - rate limit 5회/분 (per-IP)
 * - 응답 본문에 비밀 노출 X
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminConfigured,
  verifyAdminPassword,
  issueAdminCookieValue,
  buildAdminSetCookieHeader,
  ADMIN_COOKIE_MAX_AGE_SEC,
} from '../../../../lib/adminCookie';
import { checkRateLimit, getClientIp } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 503 });
  }

  // Rate limit — IP 당 분당 5회 시도까지
  const ip = getClientIp(req);
  try {
    const rl = await checkRateLimit(`admin_login:m:${ip}`, 5, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'too_many_requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }
  } catch {
    // rate limit DB 실패 — fail-open (login 자체를 막지 않음, 실패 시 401 만 반환)
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const password = (body as { password?: unknown })?.password;
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  const cookieValue = issueAdminCookieValue();
  if (!cookieValue) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, expiresInSec: ADMIN_COOKIE_MAX_AGE_SEC });
  res.headers.set('Set-Cookie', buildAdminSetCookieHeader(cookieValue));
  return res;
}
