'use client';

import { useState, useEffect, useCallback } from 'react';
import { listPosts, type SavedPost } from '../../../lib/postStorage';
import { getSupabaseClient } from '../../../lib/supabase';

type FilterTab = 'all' | 'blog' | 'card_news' | 'press_release' | 'refine';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'blog', label: '블로그' },
  { value: 'card_news', label: '카드뉴스' },
  { value: 'press_release', label: '보도자료' },
  { value: 'refine', label: 'AI 보정' },
];

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  all: '블로그를 생성하면 여기에 자동으로 저장됩니다.',
  blog: '블로그 글을 생성하면 여기에 표시됩니다.',
  card_news: '카드뉴스를 생성하면 여기에 표시됩니다.',
  press_release: '보도자료를 생성하면 여기에 표시됩니다.',
  refine: 'AI 보정 결과가 여기에 표시됩니다.',
};

function filterPosts(posts: SavedPost[], tab: FilterTab): SavedPost[] {
  switch (tab) {
    case 'all': return posts;
    case 'blog': return posts.filter(p => p.post_type === 'blog' && p.workflow_type !== 'refine');
    case 'card_news': return posts.filter(p => p.post_type === 'card_news');
    case 'press_release': return posts.filter(p => p.post_type === 'press_release');
    case 'refine': return posts.filter(p => p.workflow_type === 'refine');
  }
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<SavedPost | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const result = await listPosts(session?.user?.id || null);
      if ('error' in result) {
        setError(result.error);
      } else {
        setPosts(result.posts);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '데이터를 불러올 수 없습니다';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }
  };

  const typeBadge = (post: SavedPost) => {
    const map: Record<string, { label: string; cls: string }> = {
      blog: { label: '블로그', cls: 'bg-blue-50 text-blue-600' },
      card_news: { label: '카드뉴스', cls: 'bg-pink-50 text-pink-600' },
      press_release: { label: '보도자료', cls: 'bg-amber-50 text-amber-600' },
    };
    const info = map[post.post_type] || { label: post.post_type, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`px-1.5 py-0.5 rounded font-semibold text-xs ${info.cls}`}>{info.label}</span>;
  };

  // ── 상세 보기 ──
  if (selectedPost) {
    return (
      <div className="p-5 max-w-4xl mx-auto">
        <button
          onClick={() => setSelectedPost(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          목록으로
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* 헤더 */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80">
            <div className="flex items-center gap-2 mb-2">
              {typeBadge(selectedPost)}
              {selectedPost.workflow_type === 'refine' && (
                <span className="px-1.5 py-0.5 rounded font-semibold text-xs bg-violet-50 text-violet-600">AI 보정</span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-1">{selectedPost.title}</h1>
            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              <span>{new Date(selectedPost.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              {selectedPost.hospital_name && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium">{selectedPost.hospital_name}</span>
              )}
              {selectedPost.topic && (
                <span className="text-slate-500">주제: {selectedPost.topic}</span>
              )}
              {selectedPost.char_count != null && (
                <span>{selectedPost.char_count.toLocaleString()}자</span>
              )}
            </div>
          </div>

          {/* 키워드 */}
          {selectedPost.keywords && selectedPost.keywords.length > 0 && (
            <div className="px-6 py-2 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
              {selectedPost.keywords.map((kw, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium">{kw}</span>
              ))}
            </div>
          )}

          {/* 본문 */}
          <div className="px-6 py-6">
            <article className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {selectedPost.content}
            </article>
          </div>

          {/* 하단 액션 */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <button
              onClick={() => handleCopy(selectedPost.content)}
              className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {copyFeedback ? '복사됨!' : '본문 복사'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filtered = filterPosts(posts, activeTab);

  // ── 목록 ──
  return (
    <div className="p-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">생성 이력</h1>
        <button
          onClick={loadPosts}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      {/* 필터 탭 */}
      {!loading && posts.length > 0 && (
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {FILTER_TABS.map(tab => {
            const count = filterPosts(posts, tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  activeTab === tab.value
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.label}
                <span className={`ml-1 ${activeTab === tab.value ? 'text-slate-300' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-500">&#x26A0;</span>
            <span className="text-sm font-bold text-red-700">조회 실패</span>
          </div>
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={loadPosts}
            className="mt-3 px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto bg-slate-100">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-700 mb-1">
            {posts.length === 0 ? '아직 생성 이력이 없습니다' : '해당 유형의 이력이 없습니다'}
          </h2>
          <p className="text-sm text-slate-400">{EMPTY_MESSAGES[activeTab]}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(post => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 flex-wrap">
                    {typeBadge(post)}
                    {post.workflow_type === 'refine' && (
                      <span className="px-1.5 py-0.5 rounded font-semibold bg-violet-50 text-violet-600">
                        AI 보정
                      </span>
                    )}
                    {post.hospital_name && (
                      <span className="truncate max-w-[120px]">{post.hospital_name}</span>
                    )}
                    {post.topic && !post.hospital_name && (
                      <span className="truncate max-w-[140px] text-slate-400">{post.topic}</span>
                    )}
                    <span>{new Date(post.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {post.char_count != null && (
                      <span>{post.char_count.toLocaleString()}자</span>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 flex-none mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
