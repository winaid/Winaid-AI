/**
 * 생성물 저장/조회 — generated_posts 테이블 + guest localStorage fallback
 *
 * 로그인 사용자: Supabase에 저장/조회 (기존 동작 유지)
 * Guest 사용자: localStorage에 저장/조회
 */
import { isSupabaseConfigured, supabase } from '@winaid/blog-core';

export interface SavePostInput {
  userId?: string | null;
  userEmail?: string | null;
  hospitalName?: string;
  postType: 'blog' | 'card_news' | 'press_release' | 'image';
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

// ── Guest localStorage helpers ──

const GUEST_POSTS_KEY = 'winaid_guest_posts';
const GUEST_MAX_POSTS = 100;

function getGuestPosts(): SavedPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GUEST_POSTS_KEY);
    return raw ? JSON.parse(raw) as SavedPost[] : [];
  } catch { return []; }
}

function setGuestPosts(posts: SavedPost[]): boolean {
  if (typeof window === 'undefined') return false;
  const trimmed = posts.slice(0, GUEST_MAX_POSTS);
  try {
    localStorage.setItem(GUEST_POSTS_KEY, JSON.stringify(trimmed));
    return true;
  } catch (e) {
    console.warn('[postStorage] localStorage write failed, attempting to free space:', e);
    // Try removing old entries and retry once
    try {
      const reduced = trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2)));
      localStorage.setItem(GUEST_POSTS_KEY, JSON.stringify(reduced));
      return true;
    } catch (e2) {
      console.warn('[postStorage] localStorage write failed after retry:', e2);
      return false;
    }
  }
}

// ── Main API ──

/** 생성 결과를 저장 (Supabase 우선, fallback → localStorage) */
export async function savePost(input: SavePostInput): Promise<{ id: string } | { error: string }> {
  const plainText = input.content.replace(/<[^>]*>/g, '').replace(/[#*_~`>-]/g, '');
  const charCount = plainText.replace(/\s/g, '').length;

  // Supabase 경로 (로그인 사용자)
  if (isSupabaseConfigured && supabase) {
    try {
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

      if (!error && data) {
        return { id: (data as { id: string }).id };
      }
      // Supabase 에러 → guest fallback
      console.warn('[postStorage] Supabase save failed, using localStorage:', error?.message);
    } catch (err) {
      console.warn('[postStorage] Supabase save exception, using localStorage:', err);
    }
  }

  // Guest localStorage fallback
  const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const guestPost: SavedPost = {
    id: guestId,
    post_type: input.postType,
    workflow_type: input.workflowType || 'generate',
    title: input.title,
    content: input.content,
    topic: input.topic || null,
    hospital_name: input.hospitalName || null,
    keywords: input.keywords || null,
    char_count: charCount,
    created_at: new Date().toISOString(),
  };
  const posts = getGuestPosts();
  posts.unshift(guestPost);
  setGuestPosts(posts);
  return { id: guestId };
}

/**
 * 생성 이력 조회 (Supabase + guest 병합)
 *
 * - userId가 있으면 해당 사용자 글만 조회 (non-admin 기본)
 * - userId가 null이면 DB 조회를 건너뛰고 guest localStorage만 반환
 * - showAll=true이면 userId와 무관하게 전체 DB 조회 (admin 전용)
 */
export async function listPosts(
  userId: string | null,
  options?: { showAll?: boolean },
): Promise<{ posts: SavedPost[] } | { error: string }> {
  let dbPosts: SavedPost[] = [];
  const showAll = options?.showAll === true;

  if (isSupabaseConfigured && supabase) {
    // non-admin + 미로그인 → DB 조회 스킵 (guest 데이터만)
    if (!userId && !showAll) {
      // skip DB query
    } else {
      try {
        let query = supabase
          .from('generated_posts')
          .select('id, post_type, workflow_type, title, content, topic, hospital_name, keywords, char_count, created_at')
          .order('created_at', { ascending: false })
          .limit(50);

        // admin(showAll)이 아니면 반드시 userId로 필터
        if (!showAll && userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[postStorage] listPosts query error:', error.message);
        } else if (data) {
          dbPosts = data as SavedPost[];
        }
      } catch (err) {
        console.error('[postStorage] listPosts Supabase error:', err);
        // Supabase 에러 시 guest 데이터만 반환
      }
    }
  }

  // Guest posts 병합 (중복 ID 제거, 최신순)
  const guestPosts = getGuestPosts();
  const dbIds = new Set(dbPosts.map(p => p.id));
  const merged = [...dbPosts, ...guestPosts.filter(g => !dbIds.has(g.id))];
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { posts: merged.slice(0, 100) };
}

/** 단일 포스트 조회 */
export async function getPost(postId: string): Promise<{ post: SavedPost } | { error: string }> {
  // Guest post check
  if (postId.startsWith('guest_')) {
    const guestPosts = getGuestPosts();
    const found = guestPosts.find(p => p.id === postId);
    if (found) return { post: found };
    return { error: '게스트 글을 찾을 수 없습니다.' };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase 미설정' };
  }

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

/** 포스트 삭제 */
export async function deletePost(postId: string): Promise<{ success: boolean; error?: string }> {
  // Guest post
  if (postId.startsWith('guest_')) {
    const guestPosts = getGuestPosts();
    const filtered = guestPosts.filter(p => p.id !== postId);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('winaid_guest_posts', JSON.stringify(filtered)); } catch { /* ignore */ }
    }
    return { success: true };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase 미설정' };
  }

  const { error } = await supabase
    .from('generated_posts')
    .delete()
    .eq('id', postId);

  if (error) {
    console.error('[postStorage] delete error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
