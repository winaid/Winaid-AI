/**
 * 관리자 페이지 타입/상수/RPC 헬퍼
 * page.tsx에서 분리
 */
import { supabase } from '../../lib/supabase';

// ── 타입 ──

export interface AdminStats {
  totalPosts: number;
  blogCount: number;
  cardNewsCount: number;
  pressReleaseCount: number;
  imageCount: number;
  uniqueHospitals: number;
  uniqueUsers: number;
  postsToday: number;
  postsThisWeek: number;
  postsThisMonth: number;
}

export interface GeneratedPost {
  id: string;
  post_type: string;
  title: string;
  content: string;
  hospital_name: string | null;
  category: string | null;
  user_email: string | null;
  topic: string | null;
  char_count: number | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  team_id: number | null;
  created_at: string;
}

export type Tab = 'contents' | 'users' | 'style' | 'feedback';
export type PostTypeFilter = 'all' | 'blog' | 'card_news' | 'press_release' | 'image';

export const POST_TYPE_LABELS: Record<string, string> = {
  blog: '블로그',
  card_news: '카드뉴스',
  press_release: '보도자료',
  image: '이미지',
};

export const POST_TYPE_COLORS: Record<string, string> = {
  blog: 'bg-blue-100 text-blue-700',
  card_news: 'bg-pink-100 text-pink-700',
  press_release: 'bg-amber-100 text-amber-700',
  image: 'bg-emerald-100 text-emerald-700',
};

// ── RPC 호출 헬퍼 ──

export async function getAdminStats(token: string): Promise<AdminStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_admin_stats', { admin_password: token });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalPosts: row.total_posts ?? 0,
    blogCount: row.blog_count ?? 0,
    cardNewsCount: row.card_news_count ?? 0,
    pressReleaseCount: row.press_release_count ?? 0,
    imageCount: row.image_count ?? 0,
    uniqueHospitals: row.unique_hospitals ?? 0,
    uniqueUsers: row.unique_users ?? 0,
    postsToday: row.posts_today ?? 0,
    postsThisWeek: row.posts_this_week ?? 0,
    postsThisMonth: row.posts_this_month ?? 0,
  };
}

export async function getAllPosts(
  token: string,
  filterType?: string,
  filterHospital?: string,
  offset = 0,
): Promise<GeneratedPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_all_generated_posts', {
    admin_password: token,
    filter_post_type: filterType && filterType !== 'all' ? filterType : null,
    filter_hospital: filterHospital || null,
    limit_count: 100,
    offset_count: offset,
  });
  if (error || !data) return [];
  return data as GeneratedPost[];
}

export async function deletePost(token: string, postId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('delete_generated_post', {
    admin_password: token,
    post_id: postId,
  });
  if (error) return false;
  return !!data;
}

export async function getUsers(): Promise<UserProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, team_id, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as UserProfile[];
}

// ── 유틸 ──

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
