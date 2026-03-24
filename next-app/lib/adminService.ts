/**
 * Admin 전용 RPC 헬퍼 — root postStorageService.ts에서 admin 관련만 이식
 */
import { supabase } from './supabase';

/** 전체 콘텐츠 삭제 — root deleteAllGeneratedPosts 동일 */
export async function deleteAllGeneratedPosts(
  adminPassword: string,
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  try {
    const { data, error } = await supabase.rpc('delete_all_generated_posts', {
      admin_password: adminPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // RPC가 null 반환 (함수 미배포 등)
    if (data === null || data === undefined) {
      return { success: false, error: 'RPC 함수가 응답하지 않았습니다 (null). DB 배포를 확인하세요.' };
    }

    // -1 반환 (인증 실패 등)
    if (data === -1) {
      return { success: false, error: '관리자 인증 실패' };
    }

    const count = typeof data === 'number' ? data : 0;
    return { success: true, deletedCount: count };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || '알 수 없는 오류' };
  }
}
