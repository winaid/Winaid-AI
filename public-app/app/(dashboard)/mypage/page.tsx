'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../../../lib/supabase';
import { getCredits, type CreditInfo } from '../../../lib/creditService';
import { listPosts, deletePost, type SavedPost } from '../../../lib/postStorage';
import { getSessionSafe } from '../../../lib/supabase';
import { sanitizeHtml } from '../../../lib/sanitize';

// ── 상대 시간 ──
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── 간이 Markdown → HTML ──
function mdToHtml(md: string): string {
  let html = md
    .replace(/```[\s\S]*?```/g, (m) => {
      const code = m.slice(3, -3).replace(/^\w*\n/, '');
      return `<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:1rem;overflow-x:auto;font-size:0.8125rem;line-height:1.6;margin:0.75rem 0"><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`;
    })
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1rem;font-weight:700;color:#1e40af;margin:1rem 0 0.4rem;padding-left:15px;border-left:4px solid #787fff;line-height:1.5">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.35rem;font-weight:700;color:#1e293b;margin:1.25rem 0 0.5rem">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:#1e293b">$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<li style="font-size:0.9375rem;line-height:1.7;color:#334155;margin:0.2rem 0">$1</li>')
    .replace(/\n{2,}/g, '</p><p style="font-size:0.9375rem;line-height:1.85;color:#334155;margin:0.5rem 0">')
    .replace(/\n/g, '<br />');
  html = `<p style="font-size:0.9375rem;line-height:1.85;color:#334155;margin:0.5rem 0">${html}</p>`;
  return html.replace(/<p[^>]*>\s*<\/p>/g, '').replace(/<script[\s\S]*?<\/script>/gi, '');
}

interface UserProfile {
  id: string; email: string; name: string; hospitalName: string; createdAt: string;
}

interface UsageStats {
  totalPosts: number; blogCount: number; cardNewsCount: number; imageCount: number; pressCount: number;
}

type FilterTab = 'all' | 'blog' | 'card_news' | 'press_release' | 'image' | 'refine';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'blog', label: '블로그' },
  { value: 'card_news', label: '카드뉴스' },
  { value: 'press_release', label: '보도자료' },
  { value: 'image', label: '이미지' },
  { value: 'refine', label: 'AI 보정' },
];

function filterPosts(posts: SavedPost[], tab: FilterTab): SavedPost[] {
  switch (tab) {
    case 'all': return posts;
    case 'blog': return posts.filter(p => p.post_type === 'blog' && p.workflow_type !== 'refine');
    case 'card_news': return posts.filter(p => p.post_type === 'card_news');
    case 'press_release': return posts.filter(p => p.post_type === 'press_release');
    case 'image': return posts.filter(p => p.post_type === 'image');
    case 'refine': return posts.filter(p => p.workflow_type === 'refine');
  }
}

export default function MyPage() {
  const [mainTab, setMainTab] = useState<'profile' | 'history'>('profile');

  // ── 프로필 상태 ──
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editHospital, setEditHospital] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // ── 히스토리 상태 ──
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<SavedPost | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── 프로필 로드 ──
  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { setLoading(false); return; }
        setProfile({ id: user.id, email: user.email || '', name: user.user_metadata?.name || '', hospitalName: user.user_metadata?.hospital_name || user.user_metadata?.name || '', createdAt: user.created_at || '' });
        setEditName(user.user_metadata?.name || '');
        setEditHospital(user.user_metadata?.hospital_name || user.user_metadata?.name || '');
        const credits = await getCredits(user.id);
        setCreditInfo(credits);
        try {
          const { data: postData, error } = await (sb.from('generated_posts') as ReturnType<typeof sb.from>).select('post_type').eq('user_id', user.id);
          if (!error && postData) {
            setUsage({
              totalPosts: postData.length,
              blogCount: postData.filter((p: { post_type: string }) => p.post_type === 'blog').length,
              cardNewsCount: postData.filter((p: { post_type: string }) => p.post_type === 'card_news').length,
              imageCount: postData.filter((p: { post_type: string }) => p.post_type === 'image').length,
              pressCount: postData.filter((p: { post_type: string }) => p.post_type === 'press_release').length,
            });
          }
        } catch { /* ignore */ }
      } catch { /* not logged in */ }
      setLoading(false);
    })();
  }, []);

  // ── 히스토리 로드 ──
  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(null);
    try {
      const { userId } = await getSessionSafe();
      const result = await listPosts(userId);
      if ('error' in result) setPostsError(result.error);
      else setPosts(result.posts);
    } catch (err: unknown) {
      setPostsError(err instanceof Error ? err.message : '데이터를 불러올 수 없습니다');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'history' && posts.length === 0 && !postsLoading) loadPosts();
  }, [mainTab, posts.length, postsLoading, loadPosts]);

  // ── 프로필 저장 ──
  const handleSaveProfile = async () => {
    if (!isSupabaseConfigured || !profile) return;
    setIsSaving(true); setSaveMsg('');
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.auth.updateUser({ data: { name: editName.trim(), hospital_name: editHospital.trim() } });
      if (error) setSaveMsg('저장 실패: ' + error.message);
      else { setSaveMsg('저장되었습니다'); setProfile(prev => prev ? { ...prev, name: editName.trim(), hospitalName: editHospital.trim() } : prev); }
    } catch { setSaveMsg('저장 실패'); }
    setIsSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  // ── 히스토리 삭제 ──
  const handleDelete = async (postId: string) => {
    if (!confirm('이 콘텐츠를 삭제하시겠습니까?')) return;
    setDeletingId(postId);
    const result = await deletePost(postId);
    if (result.success) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      if (selectedPost?.id === postId) setSelectedPost(null);
    }
    setDeletingId(null);
  };

  const typeBadge = (post: SavedPost) => {
    const map: Record<string, { label: string; cls: string }> = {
      blog: { label: '블로그', cls: 'bg-blue-50 text-blue-600' },
      card_news: { label: '카드뉴스', cls: 'bg-pink-50 text-pink-600' },
      press_release: { label: '보도자료', cls: 'bg-amber-50 text-amber-600' },
      image: { label: '이미지', cls: 'bg-emerald-50 text-emerald-600' },
    };
    const info = map[post.post_type] || { label: post.post_type, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`px-1.5 py-0.5 rounded font-semibold text-xs ${info.cls}`}>{info.label}</span>;
  };

  const inputCls = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="text-4xl mb-4">🔒</div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">로그인이 필요합니다</h2>
      <p className="text-sm text-slate-500">회원 정보를 확인하려면 먼저 로그인해주세요.</p>
    </div>
  );

  const filtered = filterPosts(posts, activeFilter);

  return (
    <div className="max-w-3xl mx-auto p-5 space-y-6">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/20">
          {(profile.name || profile.email)[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{profile.name || '회원'}</h1>
          <p className="text-sm text-slate-500">{profile.email}</p>
        </div>
      </div>

      {/* 2탭 */}
      <div className="flex border-b border-slate-200">
        <button type="button" onClick={() => setMainTab('profile')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${mainTab === 'profile' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400'}`}>
          👤 프로필
        </button>
        <button type="button" onClick={() => setMainTab('history')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${mainTab === 'history' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400'}`}>
          🕐 히스토리 {posts.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-full">{posts.length}</span>}
        </button>
      </div>

      {/* ══════ 프로필 탭 ══════ */}
      {mainTab === 'profile' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-2xl p-5 border border-violet-200">
              <p className="text-xs font-semibold text-violet-500 mb-1">잔여 크레딧</p>
              <p className="text-3xl font-black text-violet-700">{creditInfo ? creditInfo.credits : '∞'}</p>
              <p className="text-[10px] text-violet-400 mt-1">{creditInfo ? `총 ${creditInfo.totalUsed}회 사용` : '무제한'}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-5 border border-blue-200">
              <p className="text-xs font-semibold text-blue-500 mb-1">생성한 콘텐츠</p>
              <p className="text-3xl font-black text-blue-700">{usage?.totalPosts || 0}</p>
              <p className="text-[10px] text-blue-400 mt-1">블로그 {usage?.blogCount || 0} · 카드뉴스 {usage?.cardNewsCount || 0} · 이미지 {usage?.imageCount || 0}</p>
            </div>
          </div>

          {usage && usage.totalPosts > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">콘텐츠 유형별 사용량</h3>
              <div className="space-y-2">
                {[
                  { label: '블로그', count: usage.blogCount, color: 'bg-blue-500', icon: '📝' },
                  { label: '카드뉴스', count: usage.cardNewsCount, color: 'bg-pink-500', icon: '🌸' },
                  { label: '이미지', count: usage.imageCount, color: 'bg-emerald-500', icon: '🖼️' },
                  { label: '보도자료', count: usage.pressCount, color: 'bg-amber-500', icon: '📰' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-xs font-medium text-slate-600 w-16">{item.label}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min((item.count / usage.totalPosts) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-8 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-700">프로필 정보</h3>
            <div>
              <label className={labelCls}>이메일</label>
              <input type="text" value={profile.email} disabled className={`${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelCls}>이름</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="이름을 입력하세요" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>병원명</label>
              <input type="text" value={editHospital} onChange={e => setEditHospital(e.target.value)} placeholder="병원 이름" className={inputCls} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveProfile} disabled={isSaving} className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
                {isSaving ? '저장 중...' : '변경사항 저장'}
              </button>
              {saveMsg && <span className={`text-xs font-medium ${saveMsg.includes('실패') ? 'text-red-500' : 'text-green-600'}`}>{saveMsg}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ══════ 히스토리 탭 ══════ */}
      {mainTab === 'history' && (
        <div className="space-y-4">
          {selectedPost ? (
            <>
              <button onClick={() => setSelectedPost(null)} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                목록으로
              </button>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80">
                  <div className="flex items-center gap-2 mb-2">{typeBadge(selectedPost)}</div>
                  <h2 className="text-lg font-bold text-slate-900 mb-1">{selectedPost.title}</h2>
                  <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span>{relativeTime(selectedPost.created_at)}</span>
                    {selectedPost.hospital_name && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium">{selectedPost.hospital_name}</span>}
                    {selectedPost.char_count != null && selectedPost.post_type !== 'image' && <span>{selectedPost.char_count.toLocaleString()}자</span>}
                  </div>
                </div>
                <div className="px-6 py-6">
                  {selectedPost.post_type === 'image' && (selectedPost.content.startsWith('data:image') || selectedPost.content.startsWith('https://')) ? (
                    <img src={selectedPost.content} alt={selectedPost.title || ''} className="max-w-full rounded-xl shadow-md border border-slate-200" />
                  ) : (
                    <article className="max-w-none" style={{ fontFamily: "'Malgun Gothic', sans-serif", lineHeight: 1.9 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(mdToHtml(selectedPost.content)) }} />
                  )}
                </div>
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <button onClick={() => { navigator.clipboard.writeText(selectedPost.content); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 1500); }}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${copyFeedback ? 'bg-emerald-500 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
                    {copyFeedback ? '복사 완료' : '복사'}
                  </button>
                  <button onClick={() => handleDelete(selectedPost.id)} disabled={deletingId === selectedPost.id}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-all">
                    {deletingId === selectedPost.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">생성 이력</h2>
                <button onClick={loadPosts} disabled={postsLoading} className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  새로고침
                </button>
              </div>

              {!postsLoading && posts.length > 0 && (
                <div className="flex gap-1 overflow-x-auto">
                  {FILTER_TABS.map(tab => {
                    const count = filterPosts(posts, tab.value).length;
                    return (
                      <button key={tab.value} onClick={() => setActiveFilter(tab.value)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                          activeFilter === tab.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}>
                        {tab.label} <span className={activeFilter === tab.value ? 'text-slate-300' : 'text-slate-400'}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {postsLoading && <div className="flex items-center justify-center py-16"><div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" /></div>}
              {postsError && !postsLoading && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-600">{postsError}</p>
                  <button onClick={loadPosts} className="mt-2 px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 rounded-lg text-red-600">다시 시도</button>
                </div>
              )}

              {!postsLoading && !postsError && filtered.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-3xl mb-3">🕐</div>
                  <h3 className="text-lg font-bold text-slate-700 mb-1">{posts.length === 0 ? '아직 생성 이력이 없습니다' : '해당 유형의 이력이 없습니다'}</h3>
                  <p className="text-sm text-slate-400">콘텐츠를 생성하면 여기에 자동으로 저장됩니다.</p>
                </div>
              )}

              {!postsLoading && filtered.length > 0 && (
                <div className="space-y-2">
                  {filtered.map(post => (
                    <div key={post.id} className="bg-white rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all group flex items-center">
                      <button onClick={() => setSelectedPost(post)} className="flex-1 text-left p-4">
                        <div className="flex items-start gap-4">
                          {post.post_type === 'image' && (post.content?.startsWith('data:image') || post.content?.startsWith('https://')) && (
                            <img src={post.content} alt={post.title} className="w-14 h-14 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-700">{post.title}</h3>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 flex-wrap">
                              {typeBadge(post)}
                              {post.hospital_name && <span className="truncate max-w-[120px]">{post.hospital_name}</span>}
                              <span>{relativeTime(post.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}
                        disabled={deletingId === post.id}
                        className="px-3 py-2 mr-3 text-[10px] font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50 flex-shrink-0"
                        title="삭제">
                        {deletingId === post.id ? '...' : '🗑'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
