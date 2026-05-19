/**
 * GET /api/geo/citations — geo_citations 최근 N건 조회
 *
 * query params:
 *   - hospital_name (필수)
 *   - limit (1~200, 기본 50)
 *   - campaign_id (옵션)
 *   - ai_model (옵션, 'chatgpt' | 'gemini')
 *
 * 응답: { rows: CitationRow[], storage: 'supabase' | 'local' }
 *
 * SECURITY: public-app — gateGuestRequest. admin_session 보유 시 bypass.
 *           supabaseAdmin (service_role) 으로 RLS 우회.
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import type { CitationRow } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 200;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

function hasAdminSession(request: NextRequest): boolean {
  const cookies = request.headers.get('cookie') || '';
  return /admin_session=/i.test(cookies);
}

async function _wrappedGET(request: NextRequest) {
  if (!hasAdminSession(request)) {
    const gate = gateGuestRequest(request, 30);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { searchParams } = new URL(request.url);
  const hospital_name = searchParams.get('hospital_name')?.trim() || '';
  if (!hospital_name || hospital_name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'hospital_name 필수 (1~200자)' }, { status: 400 });
  }

  let limit = DEFAULT_LIMIT;
  const rawLimit = searchParams.get('limit');
  if (rawLimit) {
    const n = parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0 && n <= MAX_LIMIT) limit = n;
  }

  const campaign_id = searchParams.get('campaign_id')?.trim() || '';
  const ai_model = searchParams.get('ai_model')?.trim() || '';
  if (ai_model && ai_model !== 'chatgpt' && ai_model !== 'gemini') {
    return NextResponse.json({ error: 'ai_model 은 chatgpt 또는 gemini' }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ rows: [], storage: 'local' });

    let q = (db.from('geo_citations') as ReturnType<typeof db.from>)
      .select('id, campaign_id, hospital_name, query, ai_model, answer_text, citations, our_domains, created_at, created_by')
      .eq('hospital_name', hospital_name)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (campaign_id) q = q.eq('campaign_id', campaign_id);
    if (ai_model) q = q.eq('ai_model', ai_model);

    const { data, error } = await q;
    if (error) {
      console.warn('[geo/citations GET] supabase select error:', error.message);
      return NextResponse.json({ rows: [], storage: 'local' });
    }
    return NextResponse.json({ rows: (data || []) as CitationRow[], storage: 'supabase' });
  } catch (err) {
    console.warn('[geo/citations GET] exception:', err);
    return NextResponse.json({ rows: [], storage: 'local' });
  }
}

export const GET = withApiError(_wrappedGET);
