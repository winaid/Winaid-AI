/**
 * 생성물 저장/조회 — generated_posts 테이블
 *
 * 기존 src/services/postStorageService.ts 참고하여 최소 구현.
 * 테이블 스키마는 sql/migrations/supabase_migration_generated_posts.sql 기준.
 */
import { getSupabaseClient } from './supabase';

export interface SavePostInput {
  userId?: string | null;
  userEmail?: string | null;
  hospitalName?: string;
  postType: 'blog' | 'card_news' | 'press_release';
  workflowType?: 'generate' | 'refine';
  title: string;
  content: string;
  topic?: string;
  keywords?: string[];
  imageStyle?: string;
}

export interface SavedPost {
  id: string;
  post_type: string;
  workflow_type: string;
  title: string;
  content: string;
  topic: string | null;
  hospital_name: string | null;
  keywords: string[] | null;
  char_count: number | null;
  created_at: string;
}

/** 생성 결과를 generated_posts에 저장 */
export async function savePost(input: SavePostInput): Promise<{ id: string } | { error: string }> {
  const supabase = getSupabaseClient();
  const plainText = input.content.replace(/<[^>]*>/g, '').replace(/[#*_~`>-]/g, '');
  const charCount = plainText.replace(/\s/g, '').length;
  const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;

  const { data, error } = await supabase
    .from('generated_posts')
    .insert({
      user_id: input.userId || null,
      user_email: input.userEmail || null,
      hospital_name: input.hospitalName || null,
      post_type: input.postType,
      workflow_type: input.workflowType || 'generate',
      title: input.title,
      content: input.content,
      plain_text: plainText.substring(0, 10000),
      topic: input.topic || null,
      keywords: input.keywords || null,
      image_style: input.imageStyle || null,
      char_count: charCount,
      word_count: wordCount,
    } as Record<string, unknown>)
    .select('id')
    .single();

  if (error) {
    console.error('[postStorage] save error:', error.message);
    return { error: error.message };
  }

  return { id: (data as { id: string }).id };
}

/** 사용자의 생성 이력 조회 */
export async function listPosts(userId: string | null): Promise<{ posts: SavedPost[] } | { error: string }> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('generated_posts')
    .select('id, post_type, workflow_type, title, content, topic, hospital_name, keywords, char_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[postStorage] list error:', error.message);
    return { error: error.message };
  }

  return { posts: (data || []) as SavedPost[] };
}

/** 단일 포스트 조회 */
export async function getPost(postId: string): Promise<{ post: SavedPost } | { error: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('generated_posts')
    .select('id, post_type, workflow_type, title, content, topic, hospital_name, keywords, char_count, created_at')
    .eq('id', postId)
    .single();

  if (error) {
    console.error('[postStorage] get error:', error.message);
    return { error: error.message };
  }

  return { post: data as SavedPost };
}
