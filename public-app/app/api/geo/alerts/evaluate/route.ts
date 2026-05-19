/**
 * POST /api/geo/alerts/evaluate — 운영자 trigger 알림 평가 + 발송
 * GET /api/geo/alerts/evaluate?hospital_name=&limit= → 알림 이력 조회
 *
 * SECURITY (public-app):
 *   - gateGuestRequest (분당 10 — 발송 비용 높음)
 *   - 게스트 차단 — 알림은 권한 필요
 *   - admin_session bypass
 *   - maxDuration 30
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest, isAuthenticatedByCookie } from '../../../../../lib/guestRateLimit';
import {
  evaluateSubscription,
  sendToAllChannels,
  type Alert,
  type AlertSubscription,
  type CitationRow,
  type ChannelsConfig,
  type SendResult,
} from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_NAME_LEN = 200;

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
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!isAuthenticatedByCookie(request)) {
    return NextResponse.json({ error: '알림 평가는 로그인이 필요합니다.' }, { status: 401 });
  }
  return null;
}

interface EvaluatedResult {
  subscription_id?: string;
  alerts: Alert[];
  sent: SendResult[];
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

  const b = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const hospital_name = typeof b.hospital_name === 'string' ? b.hospital_name.trim() : '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수 (1~200자)' }, { status: 400 });
  }

  const db = await getDb();
  if (!db) {
    return NextResponse.json({ evaluated: [], note: 'supabase 미설정 — 알림 평가 skip' });
  }

  const subsRes = await (db.from('geo_alert_subscriptions') as ReturnType<typeof db.from>)
    .select('id, hospital_name, our_domains, threshold_pct, compare_window_days, channels, enabled')
    .eq('hospital_name', hospital_name)
    .eq('enabled', true);
  if (subsRes.error) {
    console.warn('[geo/alerts evaluate] subs select error:', subsRes.error.message);
    return NextResponse.json({ evaluated: [], error: subsRes.error.message }, { status: 500 });
  }
  const subscriptions = (subsRes.data || []) as Array<AlertSubscription & { id: string }>;
  if (subscriptions.length === 0) {
    return NextResponse.json({ evaluated: [], note: '활성 구독 없음' });
  }

  const maxWindow = subscriptions.reduce((m, s) => Math.max(m, s.compare_window_days || 7), 7);
  const fromIso = new Date(Date.now() - maxWindow * 2 * 86_400_000).toISOString();

  const citationsRes = await (db.from('geo_citations') as ReturnType<typeof db.from>)
    .select('id, campaign_id, hospital_name, query, ai_model, answer_text, citations, our_domains, created_at')
    .eq('hospital_name', hospital_name)
    .gte('created_at', fromIso)
    .order('created_at', { ascending: false });
  if (citationsRes.error) {
    console.warn('[geo/alerts evaluate] citations select error:', citationsRes.error.message);
    return NextResponse.json({ evaluated: [], error: citationsRes.error.message }, { status: 500 });
  }
  const rows = (citationsRes.data || []) as CitationRow[];

  const evaluated: EvaluatedResult[] = [];
  const now = new Date();
  for (const sub of subscriptions) {
    const alerts = evaluateSubscription(sub, rows, now);
    const sentForSub: SendResult[] = [];
    for (const alert of alerts) {
      const channels: ChannelsConfig = sub.channels || {};
      const subject = `[WINAID GEO 알림] ${hospital_name} — ${alert.type}`;
      const sent = await sendToAllChannels(channels, subject, alert.message);
      sentForSub.push(...sent);
      const successChannels = sent.filter(s => s.ok).map(s => s.channel);
      await (db.from('geo_alert_history') as ReturnType<typeof db.from>)
        .insert({
          subscription_id: sub.id,
          hospital_name,
          alert_type: alert.type,
          payload: alert.payload as Record<string, unknown>,
          sent_to: successChannels,
        })
        .then((r) => {
          if (r.error) console.warn('[geo/alerts evaluate] history insert error:', r.error.message);
        });
    }
    evaluated.push({ subscription_id: sub.id, alerts, sent: sentForSub });
  }

  return NextResponse.json({ success: true, evaluated });
}

async function _wrappedGET(request: NextRequest) {
  const blocked = gateAuthenticated(request);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const hospital_name = searchParams.get('hospital_name')?.trim() || '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수' }, { status: 400 });
  }
  let limit = 20;
  const rawLimit = searchParams.get('limit');
  if (rawLimit) {
    const n = parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0 && n <= 200) limit = n;
  }

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ history: [], storage: 'local' });
    const { data, error } = await (db.from('geo_alert_history') as ReturnType<typeof db.from>)
      .select('id, subscription_id, hospital_name, alert_type, payload, sent_to, sent_at')
      .eq('hospital_name', hospital_name)
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[geo/alerts history] supabase error:', error.message);
      return NextResponse.json({ history: [], storage: 'local' });
    }
    return NextResponse.json({ history: data || [], storage: 'supabase' });
  } catch (err) {
    console.warn('[geo/alerts history] exception:', err);
    return NextResponse.json({ history: [], storage: 'local' });
  }
}

export const POST = withApiError(_wrappedPOST);
export const GET = withApiError(_wrappedGET);
