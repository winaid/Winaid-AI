/**
 * Admin 전용 서비스 — 사용자 관리 + 전체 삭제 헬퍼.
 *
 * 전체 삭제(`deleteAllGeneratedPosts`)는 server-side `/api/admin/rpc` dispatcher 로 위임.
 * 30초 타임아웃은 dispatcher 내부에서 적용된다. 인증은 admin_session HttpOnly cookie.
 */
import { supabase, supabaseAdmin } from '@winaid/blog-core';

const ADMIN_RPC_ENDPOINT = '/api/admin/rpc';

/** 전체 콘텐츠 삭제 — server-side dispatcher 경유 */
export async function deleteAllGeneratedPosts(
  // `adminPassword` 파라미터는 dispatcher 도입 후 의미 없음 (server 가 cookie 로 인증).
  // 시그니처 호환을 위해 유지. 본문에서 무시.
  _adminPassword?: string,
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  void _adminPassword;

  let res: Response;
  try {
    res = await fetch(ADMIN_RPC_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'delete-all' }),
    });
  } catch (err) {
    return { success: false, error: `네트워크 오류: ${(err as Error).message || '알 수 없음'}` };
  }

  if (!res.ok) {
    let detail = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail || body.error || detail;
    } catch { /* ignore */ }

    if (res.status === 401) {
      return { success: false, error: '관리자 인증이 만료되었습니다. 다시 로그인하세요.' };
    }
    if (res.status === 503) {
      return { success: false, error: '서버 설정 오류 (service_role 키 미설정).' };
    }
    if (detail === 'rpc_timeout_30s') {
      return { success: false, error: '전체 삭제 시간 초과 (30초). 잠시 후 다시 시도하세요.' };
    }
    if (detail.includes('WHERE clause') || detail.includes('could not find')) {
      return {
        success: false,
        error:
          'DB에 delete_all_generated_posts 함수가 없습니다. ' +
          'Supabase SQL Editor에서 sql/migrations/2026-05-08_drop_admin_password_check.sql을 실행하세요 ' +
          '(현행 admin 인증 모델 — GUC 기반 구버전 2026-03-20 파일은 폐기됨).',
      };
    }
    return { success: false, error: `삭제 중 오류: ${detail}` };
  }

  let body: { data?: unknown };
  try {
    body = (await res.json()) as { data?: unknown };
  } catch {
    return { success: false, error: 'RPC 응답 파싱 실패' };
  }
  const data = body.data;

  if (data === null || data === undefined) {
    return {
      success: false,
      error:
        'RPC 함수가 응답하지 않았습니다 (null). ' +
        'Supabase SQL Editor에서 delete_all_generated_posts 함수를 배포했는지 확인하세요.',
    };
  }
  if (data === -1) {
    return { success: false, error: '관리자 인증 실패 — service_role 미부여.' };
  }
  const count = typeof data === 'number' ? data : 0;
  return { success: true, deletedCount: count };
}

// ── 사용자 관리 ──

/** 사용자 팀 배정 변경 — admin 이 다른 사용자 profile 수정. profiles RLS 가
 * auth.uid()=id 만 허용하므로 anon/일반 사용자 client 로는 차단됨. service_role 필요. */
export async function updateUserTeam(
  userId: string,
  teamId: number | null,
): Promise<{ success: boolean; error?: string }> {
  const db = supabaseAdmin ?? supabase;
  if (!db) return { success: false, error: 'Supabase 미설정' };
  const { error } = await db
    .from('profiles')
    .update({ team_id: teamId })
    .eq('id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** 사용자 프로필 삭제 (auth 계정은 유지, profiles 레코드만 삭제). RLS 우회 필요 (위 동일). */
export async function deleteUserProfile(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const db = supabaseAdmin ?? supabase;
  if (!db) return { success: false, error: 'Supabase 미설정' };
  const { error } = await db
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
