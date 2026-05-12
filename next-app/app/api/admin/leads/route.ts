/**
 * /api/admin/leads — admin proxy → public-app /api/internal/admin/leads
 *
 * GET    ?status=&q=&limit=&offset= — 리드 목록 조회
 * PATCH  body { id, status }         — 상태 변경
 *
 * 인증: next-app admin_session HttpOnly cookie 검증.
 * 통과 시 ${NEXT_PUBLIC_PUBLIC_APP_URL}/api/internal/admin/leads 로 forward
 * X-Internal-Secret 헤더(INTERNAL_SHARE_PROXY_SECRET) 첨부.
 * 데이터 본체는 public-seoul DB 의 diagnostic_leads 테이블.
 *
 * 패턴: next-app /api/diagnostic/share (A1a P4-a) 동일.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminCookie } from '../../../../lib/adminCookie';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FALLBACK_PUBLIC_APP_URL = 'https://winai.kr';

function unauthorized(reason: string) {
  return NextResponse.json({ error: 'unauthorized', reason }, { status: 401 });
}

function getPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_PUBLIC_APP_URL || FALLBACK_PUBLIC_APP_URL).replace(/\/$/, '');
}

function getProxySecret(): string | null {
  return process.env.INTERNAL_SHARE_PROXY_SECRET || null;
}

export async function GET(request: NextRequest) {
  const auth = verifyAdminCookie(request);
  if (!auth.valid) return unauthorized(auth.reason);

  const secret = getProxySecret();
  if (!secret) {
    return NextResponse.json(
      { error: 'service_unavailable', reason: 'INTERNAL_SHARE_PROXY_SECRET 미설정' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const upstreamUrl = new URL(`${getPublicAppUrl()}/api/internal/admin/leads`);
  for (const key of ['status', 'q', 'limit', 'offset']) {
    const v = searchParams.get(key);
    if (v) upstreamUrl.searchParams.set(key, v);
  }

  const res = await fetch(upstreamUrl.toString(), {
    method: 'GET',
    headers: { 'X-Internal-Secret': secret },
    cache: 'no-store',
  }).catch((e) => {
    console.error('[admin/leads] upstream fetch failed', e);
    return null;
  });

  if (!res) {
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = verifyAdminCookie(request);
  if (!auth.valid) return unauthorized(auth.reason);

  const secret = getProxySecret();
  if (!secret) {
    return NextResponse.json(
      { error: 'service_unavailable', reason: 'INTERNAL_SHARE_PROXY_SECRET 미설정' },
      { status: 503 },
    );
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const res = await fetch(`${getPublicAppUrl()}/api/internal/admin/leads`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: bodyText,
    cache: 'no-store',
  }).catch((e) => {
    console.error('[admin/leads PATCH] upstream fetch failed', e);
    return null;
  });

  if (!res) {
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}
