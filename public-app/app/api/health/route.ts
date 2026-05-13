/**
 * GET /api/health — 외부 모니터링(Vercel / UptimeRobot 등) 용 minimal endpoint.
 *
 * - 200 OK + 최소 JSON
 * - DB / 외부 API 의존 없음 — 본 endpoint 만으로 "서비스 전체 정상" 으로 오해 안 하도록.
 *   depth-check (DB/Supabase/Gemini ping) 가 필요하면 별도 /api/health/deep 후속.
 * - withApiError wrap → X-Request-Id 헤더 + Cache-Control: no-store 자동 부착.
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function _wrappedGET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'public-app',
      timestamp: new Date().toISOString(),
      uptime:
        typeof process !== 'undefined' && typeof process.uptime === 'function'
          ? Math.floor(process.uptime())
          : null,
    },
    { status: 200 },
  );
}

export const GET = withApiError(_wrappedGET, { route: '/api/health' });
