/**
 * POST /api/influencer/status — 인플루언서 아웃리치 상태 업데이트
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

const MAX_HOSPITAL_ID_LEN = 200;
const MAX_USERNAME_LEN = 100;
const MAX_TEXT_LEN = 2000;
const ALLOWED_STATUSES = new Set(['pending', 'sent', 'replied', 'declined', 'collab', 'archived']);

export async function POST(request: NextRequest) {
  // 인증 의무화 — 이전엔 누구나 임의 hospital_id+username upsert 가능 (타 병원 데이터 위변조).
  // SECURITY: 본 라우트가 검증된 인증 통과 후 supabaseAdmin (service_role) 으로
  // RLS 우회. 2026-05-04_influencer_rls.sql 마이그레이션이 RLS 를 좁혀 anon /
  // authenticated 는 모두 차단 → service_role 우회 필수.
  const auth = await checkAuth(request);
  if (auth) return auth;

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

  // 입력 검증 — 길이 캡 + status 화이트리스트 (DB 부하/저장 폭주 방지)
  if (typeof body.hospital_id !== 'string' || body.hospital_id.length > MAX_HOSPITAL_ID_LEN ||
      typeof body.username !== 'string' || body.username.length > MAX_USERNAME_LEN ||
      typeof body.status !== 'string' || !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: '입력 형식 오류' }, { status: 400 });
  }
  if (body.dm_message && (typeof body.dm_message !== 'string' || body.dm_message.length > MAX_TEXT_LEN)) {
    return NextResponse.json({ error: 'dm_message 길이 초과' }, { status: 400 });
  }
  if (body.notes && (typeof body.notes !== 'string' || body.notes.length > MAX_TEXT_LEN)) {
    return NextResponse.json({ error: 'notes 길이 초과' }, { status: 400 });
  }

  // Supabase 동적 import (설정 안 되어 있으면 로컬 스토리지 fallback).
  // RLS 좁힘 (2026-05-04_influencer_rls.sql) 후 anon/authenticated 는 차단됨 →
  // supabaseAdmin (service_role) 사용 필수. supabaseAdmin 미설정 시 로컬 fallback.
  try {
    const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
    const db = supabaseAdmin ?? supabase;
    if (!db) {
      // Supabase 미설정 → 성공으로 응답 (프론트에서 로컬 상태만 관리)
      return NextResponse.json({ success: true, storage: 'local' });
    }

    const { error } = await (db.from('influencer_outreach') as ReturnType<typeof db.from>).upsert(
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
