/**
 * Admin Page — "/admin" 경로
 *
 * 핵심 플로우: 비밀번호 로그인 → 통계 → 콘텐츠 목록/필터/삭제 → 사용자 목록
 * Supabase RPC: get_admin_stats, get_all_generated_posts, delete_generated_post
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { TEAM_DATA } from '../../../lib/teamData';

// ── 타입 ──

interface AdminStats {
  totalPosts: number;
  blogCount: number;
  cardNewsCount: number;
  pressReleaseCount: number;
  uniqueHospitals: number;
  uniqueUsers: number;
  postsToday: number;
  postsThisWeek: number;
  postsThisMonth: number;
}

interface GeneratedPost {
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

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  team_id: number | null;
  created_at: string;
}

type Tab = 'contents' | 'users';
type PostTypeFilter = 'all' | 'blog' | 'card_news' | 'press_release';

const POST_TYPE_LABELS: Record<string, string> = {
  blog: '블로그',
  card_news: '카드뉴스',
  press_release: '보도자료',
};

const POST_TYPE_COLORS: Record<string, string> = {
  blog: 'bg-blue-100 text-blue-700',
  card_news: 'bg-pink-100 text-pink-700',
  press_release: 'bg-amber-100 text-amber-700',
};

// ── RPC 호출 헬퍼 ──

async function getAdminStats(token: string): Promise<AdminStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_admin_stats', { admin_password: token });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalPosts: row.total_posts ?? 0,
    blogCount: row.blog_count ?? 0,
    cardNewsCount: row.card_news_count ?? 0,
    pressReleaseCount: row.press_release_count ?? 0,
    uniqueHospitals: row.unique_hospitals ?? 0,
    uniqueUsers: row.unique_users ?? 0,
    postsToday: row.posts_today ?? 0,
    postsThisWeek: row.posts_this_week ?? 0,
    postsThisMonth: row.posts_this_month ?? 0,
  };
}

async function getAllPosts(
  token: string,
  filterType?: string,
  filterHospital?: string,
): Promise<GeneratedPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_all_generated_posts', {
    admin_password: token,
    filter_post_type: filterType && filterType !== 'all' ? filterType : null,
    filter_hospital: filterHospital || null,
    limit_count: 100,
    offset_count: 0,
  });
  if (error || !data) return [];
  return data as GeneratedPost[];
}

async function deletePost(token: string, postId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('delete_generated_post', {
    admin_password: token,
    target_post_id: postId,
  });
  if (error) return false;
  return !!data;
}

async function getUsers(): Promise<UserProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, team_id, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as UserProfile[];
}

// ── 메인 컴포넌트 ──

export default function AdminPage() {
  // 인증
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // 탭
  const [tab, setTab] = useState<Tab>('contents');

  // 통계
  const [stats, setStats] = useState<AdminStats | null>(null);

  // 콘텐츠
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<PostTypeFilter>('all');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null);

  // 사용자
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // 세션 복원
  useEffect(() => {
    const saved = sessionStorage.getItem('ADMIN_AUTHENTICATED');
    const savedToken = sessionStorage.getItem('ADMIN_TOKEN');
    if (saved === 'true' && savedToken) {
      setAuthenticated(true);
      setPassword(savedToken);
    }
  }, []);

  // 인증 후 데이터 로드
  useEffect(() => {
    if (!authenticated) return;
    loadStats();
    loadPosts();
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // 필터 변경 시 재로드
  useEffect(() => {
    if (!authenticated) return;
    loadPosts();
  }, [typeFilter, hospitalFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // 사용자 탭 진입 시 로드
  useEffect(() => {
    if (tab === 'users' && authenticated && users.length === 0) {
      loadUsers();
    }
  }, [tab, authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const getToken = useCallback(() => {
    return sessionStorage.getItem('ADMIN_TOKEN') || password;
  }, [password]);

  const loadStats = useCallback(async () => {
    const s = await getAdminStats(getToken());
    if (s) setStats(s);
  }, [getToken]);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    const p = await getAllPosts(getToken(), typeFilter, hospitalFilter);
    setPosts(p);
    setPostsLoading(false);
  }, [getToken, typeFilter, hospitalFilter]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const u = await getUsers();
    setUsers(u);
    setUsersLoading(false);
  }, []);

  // ── 로그인 ──

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoginLoading(true);
    setLoginError('');

    const s = await getAdminStats(password.trim());
    if (s) {
      sessionStorage.setItem('ADMIN_AUTHENTICATED', 'true');
      sessionStorage.setItem('ADMIN_TOKEN', password.trim());
      setAuthenticated(true);
      setStats(s);
    } else {
      setLoginError('비밀번호가 올바르지 않습니다.');
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('ADMIN_AUTHENTICATED');
    sessionStorage.removeItem('ADMIN_TOKEN');
    setAuthenticated(false);
    setPassword('');
    setStats(null);
    setPosts([]);
    setUsers([]);
  };

  // ── 삭제 ──

  const handleDelete = async (postId: string) => {
    if (!confirm('이 콘텐츠를 삭제하시겠습니까?')) return;
    const ok = await deletePost(getToken(), postId);
    if (ok) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      if (selectedPost?.id === postId) setSelectedPost(null);
      loadStats();
    } else {
      alert('삭제에 실패했습니다.');
    }
  };

  // ── 시간 포맷 ──

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ── Supabase 미설정 ──

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8 bg-amber-50 rounded-xl border border-amber-200 max-w-md">
          <p className="text-amber-700 font-semibold mb-2">Supabase 미설정</p>
          <p className="text-sm text-amber-600">.env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 추가하세요.</p>
        </div>
      </div>
    );
  }

  // ── 로그인 화면 ──

  if (!authenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
          <h1 className="text-xl font-bold text-center text-slate-900 mb-6">관리자 로그인</h1>
          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="관리자 비밀번호"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              autoFocus
            />
            {loginError && (
              <p className="text-sm text-red-500 text-center">{loginError}</p>
            )}
            <button
              onClick={handleLogin}
              disabled={loginLoading || !password.trim()}
              className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                loginLoading || !password.trim()
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              {loginLoading ? '확인 중...' : '로그인'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 병원 목록 (필터용) ──

  const allHospitals = TEAM_DATA.flatMap(t => t.hospitals.map(h => h.name));

  // ── 대시보드 ──

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">관리자 대시보드</h1>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg hover:border-red-200 transition-all"
        >
          로그아웃
        </button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: '전체 콘텐츠', value: stats.totalPosts, color: 'text-slate-900' },
            { label: '블로그', value: stats.blogCount, color: 'text-blue-600' },
            { label: '카드뉴스', value: stats.cardNewsCount, color: 'text-pink-600' },
            { label: '보도자료', value: stats.pressReleaseCount, color: 'text-amber-600' },
            { label: '병원 수', value: stats.uniqueHospitals, color: 'text-emerald-600' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] font-medium text-slate-400 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '오늘', value: stats.postsToday },
            { label: '이번 주', value: stats.postsThisWeek },
            { label: '이번 달', value: stats.postsThisMonth },
          ].map((s, i) => (
            <div key={i} className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-center">
              <p className="text-[11px] text-slate-400">{s.label}</p>
              <p className="text-lg font-bold text-slate-700">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {([
          { key: 'contents' as Tab, label: '콘텐츠 관리' },
          { key: 'users' as Tab, label: '사용자 관리' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 콘텐츠 관리 탭 ── */}
      {tab === 'contents' && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 타입 필터 */}
            <div className="flex gap-1.5">
              {([
                { key: 'all' as PostTypeFilter, label: '전체' },
                { key: 'blog' as PostTypeFilter, label: '블로그' },
                { key: 'card_news' as PostTypeFilter, label: '카드뉴스' },
                { key: 'press_release' as PostTypeFilter, label: '보도자료' },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    typeFilter === f.key
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 병원 필터 */}
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 bg-white text-slate-600 outline-none focus:border-blue-400"
            >
              <option value="">전체 병원</option>
              {allHospitals.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>

            {/* 새로고침 */}
            <button
              onClick={() => { loadStats(); loadPosts(); }}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
            >
              새로고침
            </button>
          </div>

          {/* 콘텐츠 목록 */}
          {postsLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm">불러오는 중...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-400 text-sm">콘텐츠가 없습니다.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="text-[11px] text-slate-400 px-4 py-2 border-b bg-slate-50">
                총 {posts.length}건
              </div>
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {posts.map(post => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedPost(post)}
                  >
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${POST_TYPE_COLORS[post.post_type] || 'bg-slate-100 text-slate-600'}`}>
                      {POST_TYPE_LABELS[post.post_type] || post.post_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{post.title}</p>
                      <div className="flex gap-2 text-[10px] text-slate-400 mt-0.5">
                        {post.hospital_name && <span>{post.hospital_name}</span>}
                        {post.topic && <span>· {post.topic}</span>}
                        {post.user_email && <span>· {post.user_email}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <p className="text-[10px] text-slate-400">{formatDate(post.created_at)}</p>
                      {post.char_count && (
                        <p className="text-[10px] text-slate-300">{post.char_count.toLocaleString()}자</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}
                      className="flex-none px-2 py-1 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 상세 보기 모달 */}
          {selectedPost && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedPost(null)}>
              <div
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${POST_TYPE_COLORS[selectedPost.post_type] || 'bg-slate-100 text-slate-600'}`}>
                      {POST_TYPE_LABELS[selectedPost.post_type] || selectedPost.post_type}
                    </span>
                    <h2 className="text-sm font-bold text-slate-800 truncate max-w-md">{selectedPost.title}</h2>
                  </div>
                  <button onClick={() => setSelectedPost(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
                </div>
                <div className="px-5 py-3 bg-slate-50 text-[11px] text-slate-500 flex gap-4 border-b">
                  <span>{formatDate(selectedPost.created_at)}</span>
                  {selectedPost.hospital_name && <span>{selectedPost.hospital_name}</span>}
                  {selectedPost.topic && <span>주제: {selectedPost.topic}</span>}
                  {selectedPost.user_email && <span>{selectedPost.user_email}</span>}
                  {selectedPost.char_count && <span>{selectedPost.char_count.toLocaleString()}자</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <div
                    className="prose prose-sm max-w-none text-slate-700"
                    dangerouslySetInnerHTML={{ __html: selectedPost.content }}
                  />
                </div>
                <div className="flex gap-3 px-5 py-3 border-t">
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedPost.content); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all"
                  >
                    복사
                  </button>
                  <button
                    onClick={() => { handleDelete(selectedPost.id); }}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-all"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 사용자 관리 탭 ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">등록된 사용자</p>
            <button
              onClick={loadUsers}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
            >
              새로고침
            </button>
          </div>

          {usersLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm">불러오는 중...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-400 text-sm">사용자가 없습니다.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="text-[11px] text-slate-400 px-4 py-2 border-b bg-slate-50">
                총 {users.length}명
              </div>
              <div className="divide-y divide-slate-100">
                {users.map(user => {
                  const team = TEAM_DATA.find(t => t.id === user.team_id);
                  const initials = (user.full_name || user.email || '?').substring(0, 2).toUpperCase();
                  return (
                    <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-500 flex-none">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">{user.full_name || '(이름 없음)'}</p>
                          {team && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600">
                              {team.label}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{user.email || '-'}</p>
                      </div>
                      <p className="text-[10px] text-slate-300 flex-none">{formatDate(user.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
