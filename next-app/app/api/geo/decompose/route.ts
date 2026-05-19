/**
 * POST /api/geo/decompose — citation URL 들의 콘텐츠 패턴 6종 분류
 *
 * body: { urls: string[] } (≤ 10)
 * 흐름: validate → Promise.allSettled (URL별 fetch+classify) → results 배열
 *
 * SECURITY (next-app):
 *   - checkAuth (admin_session HttpOnly cookie) — P-1 admin 무제한
 *   - URL validate (sanitizePromptInput 2000 + ^https?:// + URL 갯수 cap)
 *   - 실제 SSRF/size cap/HTML only 는 classifyUrlPattern 내부에서 보호
 *
 * fail 모드: 개별 URL fetch 실패는 result.status='fetch_failed' 로 surface (전체 500 안 됨)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
import {
  classifyUrlPattern,
  sanitizePromptInput,
  type PatternResult,
} from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
// URL 10개 × fetch 10s + classify CPU. 60s 헤드룸.
export const maxDuration = 60;

const MAX_URLS = 10;
const MAX_URL_LEN = 2000;

interface Body { urls?: unknown }

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

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const validated = validateBody(raw);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  // URL 별 병렬 classify. Promise.allSettled 로 부분 실패 허용.
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

  return NextResponse.json({ success: true, results });
}
