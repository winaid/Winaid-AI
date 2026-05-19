/**
 * GET /api/geo/competitor/list?hospital_name=&limit=&responded= — 최근 감지 list
 * POST /api/geo/competitor/list — competitor_domains 추가 (수동)
 *   body: { hospital_name, domain }
 *
 * SECURITY: next-app — checkAuth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 200;
const MAX_DOMAIN_LEN = 200;

async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const hospital_name = searchParams.get('hospital_name')?.trim() || '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수' }, { status: 400 });
  }
  let limit = 30;
  const rawLimit = searchParams.get('limit');
  if (rawLimit) {
    const n = parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0 && n <= 200) limit = n;
  }
  const respondedFilter = searchParams.get('responded'); // 'true' / 'false' / null

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ contents: [], domains: [], storage: 'local' });

    // contents
    let q = (db.from('competitor_contents') as ReturnType<typeof db.from>)
      .select('id, hospital_name, competitor_domain, url, title, snippet, discovered_at, published_at, pattern_type, source, responded, response_post_id')
      .eq('hospital_name', hospital_name)
      .order('discovered_at', { ascending: false })
      .limit(limit);
    if (respondedFilter === 'true' || respondedFilter === 'false') {
      q = q.eq('responded', respondedFilter === 'true');
    }
    const contentsRes = await q;

    // domains
    const domainsRes = await (db.from('competitor_domains') as ReturnType<typeof db.from>)
      .select('id, hospital_name, domain, source, enabled, added_at')
      .eq('hospital_name', hospital_name)
      .order('added_at', { ascending: false });

    return NextResponse.json({
      contents: contentsRes.error ? [] : (contentsRes.data || []),
      domains: domainsRes.error ? [] : (domainsRes.data || []),
      storage: 'supabase',
    });
  } catch (err) {
    console.warn('[geo/competitor list] exception:', err);
    return NextResponse.json({ contents: [], domains: [], storage: 'local' });
  }
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
  const domainRaw = typeof b.domain === 'string' ? b.domain.trim().toLowerCase() : '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수' }, { status: 400 });
  }
  if (!domainRaw || domainRaw.length > MAX_DOMAIN_LEN) {
    return NextResponse.json({ error: 'domain 필수' }, { status: 400 });
  }
  // hostname 정규화 (https:// 제거 + www 제거 + path 제거)
  const domain = domainRaw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.\-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'domain 형식 오류' }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ success: true, storage: 'local' });
    const { data, error } = await (db.from('competitor_domains') as ReturnType<typeof db.from>)
      .upsert(
        { hospital_name, domain, source: 'manual', enabled: true },
        { onConflict: 'hospital_name,domain' },
      )
      .select('id, domain, source, enabled, added_at')
      .single();
    if (error) {
      console.warn('[geo/competitor list POST] error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, domain: data });
  } catch (err) {
    console.warn('[geo/competitor list POST] exception:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.json({ error: 'id 필수 (?id=)' }, { status: 400 });

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ success: true, storage: 'local' });
    const { error } = await (db.from('competitor_domains') as ReturnType<typeof db.from>)
      .delete()
      .eq('id', id);
    if (error) {
      console.warn('[geo/competitor list DELETE] error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.warn('[geo/competitor list DELETE] exception:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
