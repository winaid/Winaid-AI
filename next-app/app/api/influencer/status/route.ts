/**
 * POST /api/influencer/status — 인플루언서 아웃리치 상태 업데이트
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: {
    username: string;
    hospital_id: string;
    status: string;
    sent_date?: string;
    dm_message?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.username || !body.hospital_id) {
    return NextResponse.json({ error: 'username, hospital_id 필수' }, { status: 400 });
  }

  // Supabase 동적 import (설정 안 되어 있으면 로컬 스토리지 fallback)
  try {
    const { supabase } = await import('@winaid/blog-core');
    if (!supabase) {
      // Supabase 미설정 → 성공으로 응답 (프론트에서 로컬 상태만 관리)
      return NextResponse.json({ success: true, storage: 'local' });
    }

    const { error } = await (supabase.from('influencer_outreach') as ReturnType<typeof supabase.from>).upsert(
      {
        hospital_name: body.hospital_id,
        username: body.username,
        status: body.status,
        dm_message: body.dm_message || null,
        sent_date: body.sent_date || null,
        notes: body.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hospital_name,username' },
    );

    if (error) {
      console.error('[INFLUENCER] 상태 저장 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, storage: 'supabase' });
  } catch (err) {
    console.error('[INFLUENCER] 상태 저장 오류:', err);
    return NextResponse.json({ success: true, storage: 'local' });
  }
}
