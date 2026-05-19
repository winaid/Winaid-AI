/**
 * POST /api/geo/competitor/detect — 경쟁사 신규 콘텐츠 감지 + DB insert
 *
 * body: { hospital_name, sinceDays? }
 * 흐름:
 *   1. competitor_domains WHERE hospital_name AND enabled=true 조회
 *   2. 각 도메인 detectNewContent (RSS + 네이버) → 신규 URL 후보
 *   3. competitor_contents 에 UNIQUE (hospital_name, url) — insert 시 중복 skip
 *   4. (옵션) pattern_type classifyUrlPattern — 호출 비용 절약 위해 신규 N건 max 5 만
 *   5. 응답 { discovered: N, items: [...] }
 *
 * SECURITY: next-app — checkAuth (admin_session). supabaseAdmin RLS 우회.
 * maxDuration 90 (도메인 N × fetch + classify).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
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

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

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

  // 1) 활성 추적 도메인 조회
  const domainsRes = await (db.from('competitor_domains') as ReturnType<typeof db.from>)
    .select('hospital_name, domain, source, enabled')
    .eq('hospital_name', hospital_name)
    .eq('enabled', true);
  if (domainsRes.error) {
    console.warn('[geo/competitor detect] domains error:', domainsRes.error.message);
    return NextResponse.json({ discovered: 0, items: [], error: domainsRes.error.message }, { status: 500 });
  }
  const domains = (domainsRes.data || []) as CompetitorDomain[];
  if (domains.length === 0) {
    return NextResponse.json({ discovered: 0, items: [], note: '추적 도메인 없음 — 먼저 등록하세요.' });
  }

  // 2) 도메인별 detect
  const allItems: CompetitorContentItem[] = [];
  for (const d of domains) {
    try {
      const result = await detectNewContent(d.domain, d.domain, sinceDays);
      for (const i of result.items) allItems.push({ ...i, hospital_name });
    } catch (e) {
      console.warn(`[geo/competitor detect] domain=${d.domain} error:`, e instanceof Error ? e.message : e);
    }
  }

  // 3) URL dedup + DB 기존 URL 조회 (이미 알고 있는 것 제외)
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

  // 4) 신규 N건 — pattern_type 분류 (max 5건 한도 — 외부 API 비용 cap)
  for (let i = 0; i < Math.min(newItems.length, MAX_CLASSIFY_PER_RUN); i++) {
    try {
      const cls = await classifyUrlPattern(newItems[i].url);
      if (cls.status === 'ok' && cls.primary_pattern) {
        (newItems[i] as CompetitorContentItem & { pattern_type?: string }).pattern_type = cls.primary_pattern;
      }
    } catch {
      // silent — pattern 누락은 nullable
    }
  }

  // 5) DB insert (UNIQUE 위반은 skip — onConflict 안 쓰고 신규만 insert)
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
