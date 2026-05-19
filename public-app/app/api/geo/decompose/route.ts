/**
 * POST /api/geo/decompose — citation URL 들의 콘텐츠 패턴 6종 분류
 *
 * body: { urls: string[] } (≤ 10)
 * 흐름: gate → validate → Promise.allSettled (URL별 fetch+classify) → results 배열
 *
 * SECURITY (public-app):
 *   - gateGuestRequest (분당 5)
 *   - 로그인 사용자만 useCredit(1) (게스트 무료, admin_session bypass)
 *   - URL validate (sanitizePromptInput 2000 + ^https?:// + URL 갯수 cap)
 *   - 실제 SSRF/size cap/HTML only 는 classifyUrlPattern 내부에서 보호
 *
 * fail 모드: 개별 URL fetch 실패는 result.status='fetch_failed' 로 surface (전체 500 안 됨)
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import {
  classifyUrlPattern,
  sanitizePromptInput,
  type PatternResult,
} from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_URLS = 10;
const MAX_URL_LEN = 2000;

interface Body { urls?: unknown }

function hasAdminSession(request: NextRequest): boolean {
  const cookies = request.headers.get('cookie') || '';
  return /admin_session=/i.test(cookies);
}

function validateBody(raw: unknown): { ok: true; urls: string[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid body' };
  const b = raw as Body;
  if (!Array.isArray(b.urls)) return { ok: false, error: 'urls 배열 필수' };
  if (b.urls.length === 0) return { ok: false, error: 'urls 최소 1개' };
  if (b.urls.length > MAX_URLS) return { ok: false, error: `urls 최대 ${MAX_URLS}개` };
  const urls: string[] = [];
  for (const u of b.urls) {
    if (typeof u !== 'string') return { ok: false, error: 'urls 항목은 문자열' };
    const cleaned = sanitizePromptInput(u, MAX_URL_LEN);
    if (!cleaned) return { ok: false, error: 'urls 항목 비어있음' };
    if (!/^https?:\/\//i.test(cleaned)) return { ok: false, error: `URL 형식 오류: ${cleaned.slice(0, 50)}` };
    urls.push(cleaned);
  }
  return { ok: true, urls };
}

async function _wrappedPOST(request: NextRequest) {
  const isAdmin = hasAdminSession(request);

  // P-1: admin bypass. 일반 경로는 분당 5회 (decompose 는 비용 높음 — analyze 보다 빡빡).
  if (!isAdmin) {
    const gate = gateGuestRequest(request, 5);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const validated = validateBody(raw);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  // 로그인 사용자 만 크레딧 차감.
  const userId = await resolveImageOwner(request);
  let creditDeducted = false;
  if (!isAdmin && userId && userId !== 'guest') {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
    creditDeducted = true;
  }

  const refundOnFail = async () => {
    if (creditDeducted && userId && userId !== 'guest') {
      await refundCredit(userId, 1).catch(() => {});
    }
  };

  const settled = await Promise.allSettled(
    validated.urls.map(u =>
      classifyUrlPattern(u, { abortSignal: request.signal }),
    ),
  );

  const results: PatternResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
    return { url: validated.urls[i], status: 'fetch_failed', error: reason };
  });

  // 모든 URL fetch_failed → 가치 0, 환불.
  const allFailed = results.every(r => r.status !== 'ok');
  if (allFailed) {
    await refundOnFail();
    return NextResponse.json({ success: false, results, error: 'all URLs failed' });
  }

  return NextResponse.json({ success: true, results });
}

export const POST = withApiError(_wrappedPOST);
