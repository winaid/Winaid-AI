/**
 * POST /api/geo/competitor/detect — 경쟁사 신규 콘텐츠 감지 + DB insert
 *
 * SECURITY (public-app):
 *   - gateGuestRequest (분당 5 — 발송 비용 높음 + 외부 API 호출)
 *   - 게스트 차단 — 경쟁사 추적은 권한 필요
 *   - admin_session bypass
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest, isAuthenticatedByCookie } from '../../../../../lib/guestRateLimit';
import {
  detectNewContent,
  classifyUrlPattern,
  type CompetitorContentItem,
  type CompetitorDomain,
} from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const MAX_NAME_LEN = 200;
const MAX_CLASSIFY_PER_RUN = 5;

async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

function hasAdminSession(request: NextRequest): boolean {
  const cookies = request.headers.get('cookie') || '';
  return /admin_session=/i.test(cookies);
}

function gateAuthenticated(request: NextRequest): NextResponse | null {
  if (hasAdminSession(request)) return null;
  const gate = gateGuestRequest(request, 5);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!isAuthenticatedByCookie(request)) {
    return NextResponse.json({ error: '경쟁사 감지는 로그인이 필요합니다.' }, { status: 401 });
  }
  return null;
}

async function _wrappedPOST(request: NextRequest) {
  const blocked = gateAuthenticated(request);
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const b = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const hospital_name = typeof b.hospital_name === 'string' ? b.hospital_name.trim() : '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수 (1~200자)' }, { status: 400 });
  }
  let sinceDays = 7;
  if (typeof b.sinceDays === 'number' && b.sinceDays > 0 && b.sinceDays <= 30) sinceDays = Math.round(b.sinceDays);

  const db = await getDb();
  if (!db) return NextResponse.json({ discovered: 0, items: [], note: 'supabase 미설정' });

  const domainsRes = await (db.from('competitor_domains') as ReturnType<typeof db.from>)
    .select('hospital_name, domain, source, enabled')
    .eq('hospital_name', hospital_name)
    .eq('enabled', true);
  if (domainsRes.error) {
    return NextResponse.json({ discovered: 0, items: [], error: domainsRes.error.message }, { status: 500 });
  }
  const domains = (domainsRes.data || []) as CompetitorDomain[];
  if (domains.length === 0) {
    return NextResponse.json({ discovered: 0, items: [], note: '추적 도메인 없음 — 먼저 등록하세요.' });
  }

  const allItems: CompetitorContentItem[] = [];
  for (const d of domains) {
    try {
      const result = await detectNewContent(d.domain, d.domain, sinceDays);
      for (const i of result.items) allItems.push({ ...i, hospital_name });
    } catch (e) {
      console.warn(`[geo/competitor detect] domain=${d.domain} error:`, e instanceof Error ? e.message : e);
    }
  }

  const candidateUrls = Array.from(new Set(allItems.map(i => i.url)));
  let existingUrls = new Set<string>();
  if (candidateUrls.length > 0) {
    const existRes = await (db.from('competitor_contents') as ReturnType<typeof db.from>)
      .select('url')
      .eq('hospital_name', hospital_name)
      .in('url', candidateUrls);
    if (!existRes.error && existRes.data) {
      existingUrls = new Set((existRes.data as Array<{ url: string }>).map(r => r.url));
    }
  }
  const newItems = allItems.filter(i => !existingUrls.has(i.url));

  for (let i = 0; i < Math.min(newItems.length, MAX_CLASSIFY_PER_RUN); i++) {
    try {
      const cls = await classifyUrlPattern(newItems[i].url);
      if (cls.status === 'ok' && cls.primary_pattern) {
        (newItems[i] as CompetitorContentItem & { pattern_type?: string }).pattern_type = cls.primary_pattern;
      }
    } catch { /* silent */ }
  }

  if (newItems.length > 0) {
    const rows = newItems.map(i => ({
      hospital_name,
      competitor_domain: i.competitor_domain,
      url: i.url,
      title: i.title || null,
      snippet: i.snippet || null,
      published_at: i.published_at || null,
      pattern_type: (i as CompetitorContentItem & { pattern_type?: string }).pattern_type || null,
      source: i.source,
    }));
    const ins = await (db.from('competitor_contents') as ReturnType<typeof db.from>)
      .insert(rows);
    if (ins.error) console.warn('[geo/competitor detect] insert error:', ins.error.message);
  }

  return NextResponse.json({
    success: true,
    discovered: newItems.length,
    candidates: candidateUrls.length,
    items: newItems.slice(0, 50),
  });
}

export const POST = withApiError(_wrappedPOST);
