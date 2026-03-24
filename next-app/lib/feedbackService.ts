/**
 * 내부용 피드백 서비스 — post_feedbacks 테이블 CRUD
 *
 * 로그인 사용자 전용. guest/external에서는 호출하지 않는다.
 */
import { supabase } from './supabase';

export interface PostFeedback {
  id: string;
  post_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

/** 특정 글의 피드백 목록 조회 (오래된 순) */
export async function listFeedbacks(postId: string): Promise<PostFeedback[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('post_feedbacks')
    .select('id, post_id, user_id, user_name, content, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[feedbackService] listFeedbacks error:', error.message);
    return [];
  }
  return (data || []) as PostFeedback[];
}

/** 피드백 작성 */
export async function addFeedback(
  postId: string,
  userId: string,
  userName: string,
  content: string,
): Promise<{ success: boolean; feedback?: PostFeedback; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };
  if (!content.trim()) return { success: false, error: '내용을 입력하세요.' };

  const { data, error } = await supabase
    .from('post_feedbacks')
    .insert({
      post_id: postId,
      user_id: userId,
      user_name: userName,
      content: content.trim(),
    })
    .select('id, post_id, user_id, user_name, content, created_at')
    .single();

  if (error) {
    console.error('[feedbackService] addFeedback error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, feedback: data as PostFeedback };
}

/** 본인 피드백 삭제 */
export async function deleteFeedback(feedbackId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('post_feedbacks')
    .delete()
    .eq('id', feedbackId);
  if (error) {
    console.error('[feedbackService] deleteFeedback error:', error.message);
    return false;
  }
  return true;
}
