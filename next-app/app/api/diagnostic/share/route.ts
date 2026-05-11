/**
 * POST /api/diagnostic/share — Internal proxy to public-app.
 *
 * A1a P4-a (2026-05-08): share 발급 endpoint 본체는 public-app 으로 이전됐다
 * (외부용 먼저 정책). 본 라우트는 next-app 사내 매니저가 진단 후 영업용 공유
 * 링크 발급을 계속 가능하게 하는 server-to-server proxy.
 *
 * 흐름:
 *   사내 매니저 (next-app DiagnosticResult)
 *     → POST /api/diagnostic/share (본 라우트, next-app origin)
 *     → server-side fetch ${NEXT_PUBLIC_PUBLIC_APP_URL}/api/diagnostic/share
 *       + X-Internal-Secret 헤더 (INTERNAL_SHARE_PROXY_SECRET 값)
 *     → public-app 이 헤더 검증 후 service_role 로 DB INSERT
 *     → 응답 그대로 forward
 *     → DiagnosticResult 가 publicUrl 을 toast 로 표시
 *
 * 데이터 정합성: 발급된 토큰은 public-seoul DB 에 저장된다. winai.kr/check/<token>
 * 조회 시 동일 DB 에서 읽으므로 데이터 분리 문제 없음.
 *
 * Rate limit: next-app 측에서 처리 (IP 기반, 분당 5건). public-app 측은 본
 * proxy 호출 시 rate limit skip (X-Internal-Secret 통과 = Vercel server IP라
 * 클라이언트 IP 추적 불가).
 *
 * 본 proxy 는 A1a 분리 합의로 3개월 후(2026-08) 재검토 — 사내 매니저가 발급
 * 사용 빈도 낮으면 cross-origin (P1) 또는 폐기 (P3) 로 단순화.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '../../../../lib/rateLimit';

export const dynamic = 'force-dynamic';

const MINUTE_LIMIT = 5;
const HOUR_LIMIT = 20;
const FALLBACK_PUBLIC_APP_URL = 'https://winai.kr';

function err(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error: message },
    { status, ...(headers ? { headers } : {}) },
  );
}

export async function POST(request: NextRequest) {
  // 1) next-app 측 rate limit (사내 매니저 발급 spam 방지)
  const ip = getClientIp(request);
  try {
    const minute = await checkRateLimit(`share:m:${ip}`, MINUTE_LIMIT, 60);
    if (!minute.allowed) {
      return err(
        `요청이 너무 많습니다. ${minute.retryAfterSec}초 후 다시 시도해 주세요.`,
        429,
        { 'Retry-After': String(minute.retryAfterSec) },
      );
    }
    const hour = await checkRateLimit(`share:h:${ip}`, HOUR_LIMIT, 3600);
    if (!hour.allowed) {
      const mins = Math.ceil(hour.retryAfterSec / 60);
      return err(
        `시간당 발급 한도(${HOUR_LIMIT}건)를 초과했습니다. ${mins}분 후 다시 시도해 주세요.`,
        429,
        { 'Retry-After': String(hour.retryAfterSec) },
      );
    }
  } catch (e) {
    // DB 장애 — fail-open
    console.warn('[share-proxy] rate limit check 실패 (fail-open):', (e as Error).message?.slice(0, 100));
  }

  // 2) proxy secret 확인 (서버측 설정 누락 시 명확한 503)
  const proxySecret = process.env.INTERNAL_SHARE_PROXY_SECRET;
  if (!proxySecret) {
    console.warn('[share-proxy] INTERNAL_SHARE_PROXY_SECRET 미설정 — proxy 동작 불가');
    return err(
      '서버 설정 오류: 공유 링크 발급 proxy 가 구성되지 않았습니다 (운영자에게 문의).',
      503,
    );
  }

  // 3) body 그대로 forward (검증은 public-app 측에서)
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return err('요청 본문을 읽을 수 없습니다.', 400);
  }

  const target = `${process.env.NEXT_PUBLIC_PUBLIC_APP_URL || FALLBACK_PUBLIC_APP_URL}/api/diagnostic/share`;

  // 4) server-to-server fetch
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': proxySecret,
      },
      body: rawBody,
      // 30 초 타임아웃 (Vercel function 기본보다 짧게)
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const msg = (e as Error).message || 'unknown';
    console.warn('[share-proxy] upstream fetch 실패:', msg.slice(0, 200));
    return err(`공유 링크 발급 서버에 연결할 수 없습니다 (${msg.slice(0, 80)}).`, 502);
  }

  // 5) 응답 그대로 forward (status + JSON body)
  const upstreamText = await upstream.text();
  let upstreamJson: unknown = null;
  try {
    upstreamJson = JSON.parse(upstreamText);
  } catch {
    // public-app 이 비정상 응답 (HTML 에러 페이지 등) — 그대로 전달
    return new NextResponse(upstreamText, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'text/plain' },
    });
  }
  return NextResponse.json(upstreamJson, { status: upstream.status });
}
