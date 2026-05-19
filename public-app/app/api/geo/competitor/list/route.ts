/**
 * /api/geo/competitor/list — GET list, POST 도메인 추가, DELETE 도메인 제거
 *
 * SECURITY (public-app): gateGuestRequest + 게스트 차단 + admin_session bypass
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest, isAuthenticatedByCookie } from '../../../../../lib/guestRateLimit';

export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 200;
const MAX_DOMAIN_LEN = 200;

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
  const gate = gateGuestRequest(request, 30);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!isAuthenticatedByCookie(request)) {
    return NextResponse.json({ error: '경쟁사 추적은 로그인이 필요합니다.' }, { status: 401 });
  }
  return null;
}

async function _wrappedGET(request: NextRequest) {
  const blocked = gateAuthenticated(request);
  if (blocked) return blocked;

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
  const respondedFilter = searchParams.get('responded');

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ contents: [], domains: [], storage: 'local' });

    let q = (db.from('competitor_contents') as ReturnType<typeof db.from>)
      .select('id, hospital_name, competitor_domain, url, title, snippet, discovered_at, published_at, pattern_type, source, responded, response_post_id')
      .eq('hospital_name', hospital_name)
      .order('discovered_at', { ascending: false })
      .limit(limit);
    if (respondedFilter === 'true' || respondedFilter === 'false') {
      q = q.eq('responded', respondedFilter === 'true');
    }
    const contentsRes = await q;

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
  const domainRaw = typeof b.domain === 'string' ? b.domain.trim().toLowerCase() : '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수' }, { status: 400 });
  }
  if (!domainRaw || domainRaw.length > MAX_DOMAIN_LEN) {
    return NextResponse.json({ error: 'domain 필수' }, { status: 400 });
  }
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

async function _wrappedDELETE(request: NextRequest) {
  const blocked = gateAuthenticated(request);
  if (blocked) return blocked;

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

export const GET = withApiError(_wrappedGET);
export const POST = withApiError(_wrappedPOST);
export const DELETE = withApiError(_wrappedDELETE);
