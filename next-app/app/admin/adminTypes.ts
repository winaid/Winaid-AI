/**
 * 관리자 페이지 타입/상수/RPC 헬퍼
 * page.tsx에서 분리.
 *
 * RPC 호출은 server-side `/api/admin/rpc` dispatcher 를 통해 수행한다.
 * client 에서 anon supabase 로 admin RPC 를 직접 부르던 legacy 패턴은 폐기.
 * 인증은 admin_session HttpOnly cookie (credentials: 'include' 자동 첨부).
 */
import { supabase } from '@winaid/blog-core';

const ADMIN_RPC_ENDPOINT = '/api/admin/rpc';

async function callAdminRpc<T = unknown>(
  op: 'stats' | 'posts' | 'delete-post' | 'delete-all',
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(ADMIN_RPC_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, args: args ?? {} }),
    });
    if (!res.ok) {
      let detail = `http_${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; detail?: string };
        detail = body.detail || body.error || detail;
      } catch { /* ignore — non-JSON body */ }
      return { data: null, error: detail };
    }
    const body = (await res.json()) as { data: T };
    return { data: body.data ?? null, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message || 'network_error' };
  }
}

// ── 타입 ──

export interface AdminStats {
  totalPosts: number;
  blogCount: number;
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

export type Tab = 'contents' | 'users' | 'style' | 'feedback' | 'leads';
export type PostTypeFilter = 'all' | 'blog' | 'press_release' | 'image';

export const POST_TYPE_LABELS: Record<string, string> = {
  blog: '블로그',
  press_release: '보도자료',
  image: '이미지',
};

export const POST_TYPE_COLORS: Record<string, string> = {
  blog: 'bg-blue-100 text-blue-700',
  press_release: 'bg-amber-100 text-amber-700',
  image: 'bg-emerald-100 text-emerald-700',
};

// ── RPC 호출 헬퍼 ──

// `token` 파라미터는 admin_session 쿠키 도입 후 의미 없음 (서버측 가드가 인증).
// 시그니처는 호출자 호환을 위해 유지. 본문에서는 무시.
export async function getAdminStats(_token?: string): Promise<AdminStats | null> {
  void _token;
  const { data, error } = await callAdminRpc<unknown>('stats');
  if (error || data == null) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number | undefined> | null;
  if (!row) return null;
  return {
    totalPosts: row.total_posts ?? 0,
    blogCount: row.blog_count ?? 0,
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
  _token: string | undefined,
  filterType?: string,
  filterHospital?: string,
  offset = 0,
): Promise<GeneratedPost[]> {
  void _token;
  // RPC 시도 (server-side dispatcher)
  const { data, error } = await callAdminRpc<GeneratedPost[]>('posts', {
    filter_post_type: filterType && filterType !== 'all' ? filterType : null,
    filter_hospital: filterHospital || null,
    limit_count: 100,
    offset_count: offset,
  });
  if (!error && data && data.length > 0) return data;

  // RPC 실패/빈 결과 → content 제외 직접 쿼리 fallback (이미지 base64가 너무 커서 RPC 응답 초과 방지).
  // NOTE: 본 fallback 은 anon supabase 의 generated_posts SELECT RLS 에 의존한다.
  // PR-2 SQL 마이그레이션 또는 Sprint 1 후속(RLS lockdown) 진행 시 본 분기도 server route 로
  // 이전 필요. 현재는 호환성 유지를 위해 보존 (PR-1 scope-out).
  if (!supabase) return [];
  try {
    let query = supabase
      .from('generated_posts')
      .select('id, post_type, title, hospital_name, category, user_email, topic, char_count, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + 99);

    if (filterType && filterType !== 'all') {
      query = query.eq('post_type', filterType);
    }
    if (filterHospital) {
      query = query.ilike('hospital_name', `%${filterHospital}%`);
    }

    const { data: fallbackData, error: fallbackError } = await query;
    if (fallbackError || !fallbackData) return [];

    return (fallbackData as Record<string, unknown>[]).map(row => ({
      ...row,
      content: row.post_type === 'image' ? '[이미지]' : '',
    })) as GeneratedPost[];
  } catch {
    return [];
  }
}

export async function getPostContent(postId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('generated_posts')
      .select('content')
      .eq('id', postId)
      .single();
    if (error || !data) return null;
    return (data as { content: string }).content;
  } catch {
    return null;
  }
}

export async function deletePost(_token: string | undefined, postId: string): Promise<boolean> {
  void _token;
  const { data, error } = await callAdminRpc<boolean>('delete-post', { post_id: postId });
  if (error) return false;
  return !!data;
}

export async function getUsers(): Promise<UserProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, name, team_id, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  // full_name이 없으면 name 컬럼을 fallback으로 사용
  return (data as (UserProfile & { name?: string | null })[]).map(u => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name || u.name || null,
    team_id: u.team_id,
    created_at: u.created_at,
  }));
}

// ── 유틸 ──

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
