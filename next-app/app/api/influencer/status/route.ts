/**
 * /api/influencer/status — 인플루언서 아웃리치 상태 + 검색 이력 영속
 *
 * POST: 상태 / starred 토글 / DM 메시지 upsert (기존)
 * GET:  hospital 의 outreach + (옵션) 최근 검색 이력 조회 (PR-A 2026-05-18 신규)
 *
 * SECURITY: 양 핸들러 모두 checkAuth → admin_session HttpOnly cookie 검증.
 * supabaseAdmin (service_role) 으로 RLS 우회.
 * 2026-05-04_influencer_rls.sql + 2026-05-18_influencer_searches.sql 가 anon /
 * authenticated 차단 → service_role 우회 필수.
 *
 * P-1 정책 (CLAUDE.md): 본 라우트는 next-app 내부 어드민 전용. checkAuth 가
 * admin_session 통과 시 OK → rate limit / 크레딧 차감 없음.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

const MAX_HOSPITAL_ID_LEN = 200;
const MAX_USERNAME_LEN = 100;
const MAX_TEXT_LEN = 2000;
const ALLOWED_STATUSES = new Set(['pending', 'sent', 'replied', 'declined', 'collab', 'archived']);
const RECENT_SEARCHES_LIMIT = 5;

// ── 공통 supabase 클라이언트 ──
// 동적 import — Supabase 미설정 환경에서 빌드 깨짐 방지.
async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

// ── POST: outreach upsert (status / starred / dm_message / notes) ────

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: {
    username: string;
    hospital_id: string;
    status?: string;
    starred?: boolean;
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

  // 입력 검증 — 길이 캡
  if (typeof body.hospital_id !== 'string' || body.hospital_id.length > MAX_HOSPITAL_ID_LEN ||
      typeof body.username !== 'string' || body.username.length > MAX_USERNAME_LEN) {
    return NextResponse.json({ error: '입력 형식 오류' }, { status: 400 });
  }

  // status / starred 둘 중 적어도 하나는 있어야 의미 있는 호출
  const hasStatus = body.status !== undefined;
  const hasStarred = body.starred !== undefined;
  if (!hasStatus && !hasStarred) {
    return NextResponse.json({ error: 'status 또는 starred 중 하나는 필수' }, { status: 400 });
  }

  if (hasStatus && (typeof body.status !== 'string' || !ALLOWED_STATUSES.has(body.status))) {
    return NextResponse.json({ error: '입력 형식 오류' }, { status: 400 });
  }
  if (hasStarred && typeof body.starred !== 'boolean') {
    return NextResponse.json({ error: 'starred 는 boolean 이어야 합니다' }, { status: 400 });
  }
  if (body.dm_message && (typeof body.dm_message !== 'string' || body.dm_message.length > MAX_TEXT_LEN)) {
    return NextResponse.json({ error: 'dm_message 길이 초과' }, { status: 400 });
  }
  if (body.notes && (typeof body.notes !== 'string' || body.notes.length > MAX_TEXT_LEN)) {
    return NextResponse.json({ error: 'notes 길이 초과' }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) {
      // Supabase 미설정 → 성공으로 응답 (프론트에서 로컬 상태만 관리)
      return NextResponse.json({ success: true, storage: 'local' });
    }

    // upsert payload — undefined 필드는 omit (기존 row 값 보존)
    const payload: Record<string, unknown> = {
      hospital_name: body.hospital_id,
      username: body.username,
      updated_at: new Date().toISOString(),
    };
    if (hasStatus) payload.status = body.status;
    if (hasStarred) payload.starred = body.starred;
    if (body.dm_message !== undefined) payload.dm_message = body.dm_message || null;
    if (body.sent_date !== undefined) payload.sent_date = body.sent_date || null;
    if (body.notes !== undefined) payload.notes = body.notes || null;

    // status / starred 단독 호출이면 새 row insert 시 다른 필드 default 적용:
    //   - status default 'pending' (DDL 의 DEFAULT)
    //   - starred default false (DDL 의 DEFAULT)

    const { error } = await (db.from('influencer_outreach') as ReturnType<typeof db.from>).upsert(
      payload,
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

// ── GET: outreach 복원 + (옵션) 최근 검색 이력 ────────────────────────

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const hospitalId = searchParams.get('hospital_id');
  const includeSearches = searchParams.get('include_searches') === '1';

  if (!hospitalId || hospitalId.length > MAX_HOSPITAL_ID_LEN) {
    return NextResponse.json({ error: 'hospital_id 필수' }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) {
      // Supabase 미설정 → 빈 응답 (프론트에서 로컬 상태만 관리)
      return NextResponse.json({ outreach: [], searches: [], storage: 'local' });
    }

    // 1) outreach 전체 — username/status/starred/dm_message/sent_date/notes
    const outreachRes = await (db.from('influencer_outreach') as ReturnType<typeof db.from>)
      .select('username, status, starred, dm_message, sent_date, notes, updated_at')
      .eq('hospital_name', hospitalId)
      .order('updated_at', { ascending: false });

    const outreach = (!outreachRes.error && outreachRes.data) ? outreachRes.data : [];

    // 2) 최근 검색 이력 (옵션) — 최근 5건
    let searches: unknown[] = [];
    if (includeSearches) {
      const searchesRes = await (db.from('influencer_searches') as ReturnType<typeof db.from>)
        .select('id, search_params, result_count, created_at')
        .eq('hospital_name', hospitalId)
        .order('created_at', { ascending: false })
        .limit(RECENT_SEARCHES_LIMIT);

      if (!searchesRes.error && searchesRes.data) {
        searches = searchesRes.data;
      }
    }

    return NextResponse.json({ outreach, searches, storage: 'supabase' });
  } catch (err) {
    console.error('[INFLUENCER] 상태 조회 오류:', err);
    return NextResponse.json({ outreach: [], searches: [], storage: 'local' });
  }
}
