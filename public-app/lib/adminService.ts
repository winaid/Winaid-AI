/**
 * Admin 전용 서비스 — RPC 헬퍼 + 사용자 관리
 */
import { supabase } from './supabase';

/** 전체 콘텐츠 삭제 — root deleteAllGeneratedPosts 동일 */
export async function deleteAllGeneratedPosts(
  adminPassword: string,
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  try {
    // root와 동일: as any 캐스팅 + 타임아웃 30초
    const rpcPromise = supabase.rpc('delete_all_generated_posts' as any, {
      admin_password: adminPassword,
    } as any);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('전체 삭제 시간 초과 (30초)')), 30000),
    );

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as {
      data: any;
      error: any;
    };

    if (error) {
      const msg = error.message || String(error);

      // RPC 함수 미배포 감지
      if (msg.includes('WHERE clause') || msg.includes('could not find')) {
        return {
          success: false,
          error:
            'DB에 delete_all_generated_posts 함수가 없습니다. ' +
            'Supabase SQL Editor에서 sql/migrations/2026-03-20_fix_delete_all_generated_posts.sql을 실행하세요.',
        };
      }

      return { success: false, error: msg };
    }

    // RPC가 null 반환 (함수 미배포 등)
    if (data === null || data === undefined) {
      return {
        success: false,
        error:
          'RPC 함수가 응답하지 않았습니다 (null). ' +
          'Supabase SQL Editor에서 delete_all_generated_posts 함수를 배포했는지 확인하세요.',
      };
    }

    // -1 반환 (인증 실패 등)
    if (data === -1) {
      return { success: false, error: '관리자 인증 실패 — 비밀번호가 올바르지 않습니다.' };
    }

    const count = typeof data === 'number' ? data : 0;
    return { success: true, deletedCount: count };
  } catch (err: unknown) {
    const msg = (err as Error).message || '알 수 없는 오류';
    if (msg.includes('시간 초과')) {
      return { success: false, error: msg };
    }
    return { success: false, error: `삭제 중 오류: ${msg}` };
  }
}

// ── 사용자 관리 ──

/** 사용자 팀 배정 변경 */
export async function updateUserTeam(
  userId: string,
  teamId: number | null,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };
  const { error } = await supabase
    .from('profiles')
    .update({ team_id: teamId })
    .eq('id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** 사용자 프로필 삭제 (auth 계정은 유지, profiles 레코드만 삭제) */
export async function deleteUserProfile(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
