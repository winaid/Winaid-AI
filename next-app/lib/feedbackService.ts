/**
 * 내부용 피드백 서비스 — internal_feedbacks 테이블 CRUD
 *
 * 페이지 단위 피드백 (각 기록별 댓글이 아님).
 * 로그인 사용자 전용. guest/external에서는 호출하지 않는다.
 */
import { supabase } from './supabase';

export interface InternalFeedback {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  page: string;
  created_at: string;
}

/** 특정 페이지의 피드백 목록 (최신 30개, 오래된 순) */
export async function listFeedbacks(page: string): Promise<InternalFeedback[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('internal_feedbacks')
    .select('id, user_id, user_name, content, page, created_at')
    .eq('page', page)
    .order('created_at', { ascending: true })
    .limit(30);
  if (error) {
    console.error('[feedbackService] listFeedbacks error:', error.message);
    return [];
  }
  return (data || []) as InternalFeedback[];
}

/** 피드백 작성 */
export async function addFeedback(
  page: string,
  userId: string,
  userName: string,
  content: string,
): Promise<{ success: boolean; feedback?: InternalFeedback; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };
  if (!content.trim()) return { success: false, error: '내용을 입력하세요.' };

  const { data, error } = await supabase
    .from('internal_feedbacks')
    .insert({
      user_id: userId,
      user_name: userName,
      content: content.trim(),
      page,
    })
    .select('id, user_id, user_name, content, page, created_at')
    .single();

  if (error) {
    console.error('[feedbackService] addFeedback error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, feedback: data as InternalFeedback };
}

/** 본인 피드백 삭제 */
export async function deleteFeedback(feedbackId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('internal_feedbacks')
    .delete()
    .eq('id', feedbackId);
  if (error) {
    console.error('[feedbackService] deleteFeedback error:', error.message);
    return false;
  }
  return true;
}
