/**
 * /api/geo/alerts/subscriptions — 알림 구독 CRUD (GET / POST / DELETE)
 *
 * SECURITY (public-app):
 *   - gateGuestRequest (분당 20)
 *   - 게스트 차단 — 알림은 권한 필요 (이메일/슬랙 webhook 등 PII)
 *   - admin_session cookie 보유 시 P-1 bypass
 *   - 로그인 사용자만 사용 가능
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest, isAuthenticatedByCookie } from '../../../../../lib/guestRateLimit';
import type { AlertSubscription } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 200;
const MAX_DOMAINS = 20;
const MAX_DOMAIN_LEN = 200;
const MAX_CHANNEL_VAL_LEN = 500;

async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

function hasAdminSession(request: NextRequest): boolean {
  const cookies = request.headers.get('cookie') || '';
  return /admin_session=/i.test(cookies);
}

/** 게스트 차단 — 알림은 로그인 사용자 전용. admin bypass 우선. */
function gateAuthenticated(request: NextRequest): NextResponse | null {
  if (hasAdminSession(request)) return null;
  const gate = gateGuestRequest(request, 20);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!isAuthenticatedByCookie(request)) {
    return NextResponse.json({ error: '알림 구독은 로그인이 필요합니다.' }, { status: 401 });
  }
  return null;
}

function validateSubscription(raw: unknown): { ok: true; sub: AlertSubscription } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid body' };
  const b = raw as Record<string, unknown>;
  if (typeof b.hospital_name !== 'string' || !b.hospital_name.trim() || b.hospital_name.length > MAX_NAME_LEN) {
    return { ok: false, error: 'hospital_name 필수 (1~200자)' };
  }
  if (!Array.isArray(b.our_domains)) return { ok: false, error: 'our_domains 배열 필수' };
  if (b.our_domains.length > MAX_DOMAINS) return { ok: false, error: `our_domains 최대 ${MAX_DOMAINS}개` };
  const our_domains: string[] = [];
  for (const d of b.our_domains) {
    if (typeof d !== 'string') return { ok: false, error: 'our_domains 항목은 문자열' };
    const t = d.trim();
    if (!t || t.length > MAX_DOMAIN_LEN) return { ok: false, error: 'our_domains 항목 길이 1~200자' };
    our_domains.push(t);
  }
  let threshold_pct = 20;
  if (typeof b.threshold_pct === 'number' && b.threshold_pct > 0 && b.threshold_pct <= 100) {
    threshold_pct = Math.round(b.threshold_pct);
  }
  let compare_window_days = 7;
  if (typeof b.compare_window_days === 'number' && b.compare_window_days > 0 && b.compare_window_days <= 90) {
    compare_window_days = Math.round(b.compare_window_days);
  }
  if (!b.channels || typeof b.channels !== 'object') return { ok: false, error: 'channels 객체 필수' };
  const rawChannels = b.channels as Record<string, unknown>;
  const channels: Record<string, string | undefined> = {};
  for (const k of ['email', 'slack_webhook', 'kakao_token']) {
    const v = rawChannels[k];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length > MAX_CHANNEL_VAL_LEN) return { ok: false, error: `channels.${k} 길이 초과` };
      if (t) channels[k] = t;
    }
  }
  if (Object.keys(channels).length === 0) {
    return { ok: false, error: '최소 한 채널 (email / slack_webhook / kakao_token) 입력 필수' };
  }
  const enabled = typeof b.enabled === 'boolean' ? b.enabled : true;
  return {
    ok: true,
    sub: {
      hospital_name: b.hospital_name.trim(),
      our_domains,
      threshold_pct,
      compare_window_days,
      channels,
      enabled,
    },
  };
}

async function _wrappedGET(request: NextRequest) {
  const blocked = gateAuthenticated(request);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const hospital_name = searchParams.get('hospital_name')?.trim() || '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수 (1~200자)' }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ subscriptions: [], storage: 'local' });
    const { data, error } = await (db.from('geo_alert_subscriptions') as ReturnType<typeof db.from>)
      .select('id, hospital_name, our_domains, threshold_pct, compare_window_days, channels, enabled, created_at, updated_at')
      .eq('hospital_name', hospital_name)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[geo/alerts GET] supabase error:', error.message);
      return NextResponse.json({ subscriptions: [], storage: 'local' });
    }
    return NextResponse.json({ subscriptions: data || [], storage: 'supabase' });
  } catch (err) {
    console.warn('[geo/alerts GET] exception:', err);
    return NextResponse.json({ subscriptions: [], storage: 'local' });
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
  const v = validateSubscription(raw);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ subscription: v.sub, storage: 'local' });
    const { data, error } = await (db.from('geo_alert_subscriptions') as ReturnType<typeof db.from>)
      .insert({
        hospital_name: v.sub.hospital_name,
        our_domains: v.sub.our_domains,
        threshold_pct: v.sub.threshold_pct,
        compare_window_days: v.sub.compare_window_days,
        channels: v.sub.channels,
        enabled: v.sub.enabled,
      })
      .select('id, hospital_name, our_domains, threshold_pct, compare_window_days, channels, enabled, created_at')
      .single();
    if (error) {
      console.warn('[geo/alerts POST] supabase error:', error.message);
      return NextResponse.json({ subscription: v.sub, storage: 'local', soft_error: error.message });
    }
    return NextResponse.json({ subscription: data, storage: 'supabase' });
  } catch (err) {
    console.warn('[geo/alerts POST] exception:', err);
    return NextResponse.json({ subscription: v.sub, storage: 'local' });
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
    const { error } = await (db.from('geo_alert_subscriptions') as ReturnType<typeof db.from>)
      .delete()
      .eq('id', id);
    if (error) {
      console.warn('[geo/alerts DELETE] supabase error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, storage: 'supabase' });
  } catch (err) {
    console.warn('[geo/alerts DELETE] exception:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withApiError(_wrappedGET);
export const POST = withApiError(_wrappedPOST);
export const DELETE = withApiError(_wrappedDELETE);
