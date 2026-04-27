/**
 * POST /api/hospital-images/usage — 라이브러리 이미지 usage_count 일괄 증가.
 * body: { imageIds: string[] }
 *
 * SECURITY DEFINER RPC (increment_image_usage) 사용 — auth.uid() 로 소유자 검증.
 * anon 인스턴스는 auth.uid() NULL 반환하므로, Bearer 토큰을 forward 한 userClient 로 호출.
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const owner = await resolveImageOwner(request);
  if (!owner || owner === 'guest') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const accessToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'no_access_token' }, { status: 401 });
  }

  let body: { imageIds?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const ids = (body.imageIds || []).filter(x => typeof x === 'string' && x.length > 0);
  if (ids.length === 0) return NextResponse.json({ ok: true, incremented: 0 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });
  }

  // Bearer 토큰 forward → RPC 안 auth.uid() 가 실제 사용자 ID 반환
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  void owner; // 로깅/감사용으로 resolveImageOwner 유지
  const { error } = await userClient.rpc('increment_image_usage', { image_ids: ids });
  if (error) {
    console.warn(`[hospital-images/usage] rpc error: ${error.message}`);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, incremented: ids.length });
}
