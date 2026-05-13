/**
 * /api/internal/admin/leads — internal proxy 전용 (X-Internal-Secret).
 *
 * GET    ?status=new|contacted|closed&q=<text>&limit=<n>&offset=<n>
 *           → { rows: LeadRow[], total: number }
 * PATCH  body: { id: string, status: 'new'|'contacted'|'closed' }
 *           → { success: true }
 *
 * 호출자: next-app /api/admin/leads (admin cookie 검증 후 본 라우트로 forward).
 * 인증: timingSafeEqual(INTERNAL_SHARE_PROXY_SECRET). 실패 → 401.
 *
 * 외부에서 직접 호출 X. share infra 와 같은 secret 재사용.
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@winaid/blog-core';
import { LEAD_STATUSES, type LeadStatus } from '../../../../../lib/diagnostic/leadTypes';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function verifyInternalSecret(request: NextRequest): boolean {
  const provided = request.headers.get('x-internal-secret');
  if (!provided) return false;
  const expected = process.env.INTERNAL_SHARE_PROXY_SECRET;
  if (!expected) return false;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function unauthorized() {
  return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
}

async function _wrappedGET(request: NextRequest) {
  if (!verifyInternalSecret(request)) return unauthorized();
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: 'admin client missing' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const q = (searchParams.get('q') || '').trim().slice(0, 200);
  const limitRaw = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  let query = supabaseAdmin
    .from('diagnostic_leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && LEAD_STATUSES.includes(status as LeadStatus)) {
    query = query.eq('status', status);
  }
  if (q) {
    // hospital_name 또는 contact_name 부분 일치 (ILIKE)
    const safe = q.replace(/[%_]/g, '\\$&');
    query = query.or(`hospital_name.ilike.%${safe}%,contact_name.ilike.%${safe}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error('[internal/admin/leads] list error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, rows: data ?? [], total: count ?? 0 });
}

async function _wrappedPATCH(request: NextRequest) {
  if (!verifyInternalSecret(request)) return unauthorized();
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: 'admin client missing' }, { status: 500 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid body' }, { status: 400 });
  }

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
  }
  if (!body.status || !LEAD_STATUSES.includes(body.status as LeadStatus)) {
    return NextResponse.json({ success: false, error: 'invalid status' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('diagnostic_leads')
    .update({ status: body.status })
    .eq('id', body.id);

  if (error) {
    console.error('[internal/admin/leads] update error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET = withApiError(_wrappedGET, { route: '/api/internal/admin/leads' });
export const PATCH = withApiError(_wrappedPATCH, { route: '/api/internal/admin/leads' });
