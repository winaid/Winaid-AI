/**
 * POST /api/hospital-images/usage — 라이브러리 이미지 usage_count 일괄 증가.
 * body: { imageIds: string[] }
 *
 * SECURITY DEFINER RPC (increment_image_usage) 사용 — owner_id 검증으로
 * 본인 이미지만 증가 가능. 타 사용자 이미지는 조용히 무시 (update 행 0).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { checkAuth } from '../../../../lib/apiAuth';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const auth = await checkAuth(request);
  if (auth) return auth;

  const owner = await resolveImageOwner(request);
  if (!owner || owner === 'guest') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { imageIds?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const ids = (body.imageIds || []).filter(x => typeof x === 'string' && x.length > 0);
  if (ids.length === 0) return NextResponse.json({ ok: true, incremented: 0 });

  const { error } = await supabase.rpc('increment_image_usage', { image_ids: ids, owner_id: owner });
  if (error) {
    console.warn(`[hospital-images/usage] rpc error: ${error.message}`);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, incremented: ids.length });
}
