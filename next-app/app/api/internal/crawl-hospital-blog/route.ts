/**
 * POST /api/internal/crawl-hospital-blog — Server-side proxy for Railway crawler-server.
 *
 * 배경:
 *   PR #70 에서 crawler-server 가 모든 /api/* 에 Bearer 인증 강제. 그러나 styleService.ts
 *   의 호출자가 모니노레포 grep 단계에서 누락되어 next-app 측 토큰 첨부가 빠짐 → 401.
 *   client 에서 직접 호출하려면 secret 을 NEXT_PUBLIC_ 으로 노출해야 하는데 그러면
 *   Bearer 인증 도입 의도(외부 무단 호출 차단) 자체가 무력화됨.
 *
 * 동작:
 *   1) Supabase 세션(Bearer) 또는 admin password(X-Admin-Token) 인증 (apiAuth.checkAuth)
 *   2) server-only env CRAWLER_SHARED_SECRET 으로 Authorization: Bearer 첨부
 *   3) Railway crawler-server 로 forward → 응답 그대로 패스스루
 *
 * Env 필요:
 *   - NEXT_PUBLIC_CRAWLER_URL (또는 CRAWLER_URL fallback) : Railway crawler 도메인
 *   - CRAWLER_SHARED_SECRET                              : Railway 와 동일 값 (NEXT_PUBLIC_ 금지)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const crawlerBase = process.env.NEXT_PUBLIC_CRAWLER_URL || process.env.CRAWLER_URL;
  const secret = process.env.CRAWLER_SHARED_SECRET;
  if (!crawlerBase) {
    return NextResponse.json({ error: 'crawler_url_not_set' }, { status: 500 });
  }
  if (!secret) {
    return NextResponse.json({ error: 'crawler_secret_not_set' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const upstream = await fetch(`${crawlerBase}/api/naver/crawl-hospital-blog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await upstream.text();
    const ct = upstream.headers.get('content-type') || 'application/json';
    return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': ct } });
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[internal/crawl-hospital-blog] upstream failed: ${message}`);
    return NextResponse.json(
      { error: 'upstream_failed', message: message.slice(0, 200) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
