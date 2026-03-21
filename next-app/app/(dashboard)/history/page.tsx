'use client';

import { useState } from 'react';
import { listPosts, type SavedPost } from '../../../lib/postStorage';
import { supabase } from '../../../lib/supabase';

async function fetchInitialPosts(): Promise<{ posts: SavedPost[]; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const result = await listPosts(session?.user?.id || null);
  if ('error' in result) return { posts: [], error: result.error };
  return { posts: result.posts, error: null };
}

// 초기 데이터를 Promise로 시작 — 컴포넌트 마운트 시 1회
let initialDataPromise: Promise<{ posts: SavedPost[]; error: string | null }> | null = null;
function getInitialData() {
  if (!initialDataPromise) {
    initialDataPromise = fetchInitialPosts();
  }
  return initialDataPromise;
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<SavedPost | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 초기 로드: Promise가 resolve되면 state 세팅
  if (!initialized) {
    getInitialData().then(result => {
      setPosts(result.posts);
      setError(result.error);
      setLoading(false);
      setInitialized(true);
    });
  }

  const loadPosts = async () => {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const result = await listPosts(session?.user?.id || null);
    if ('error' in result) {
      setError(result.error);
    } else {
      setPosts(result.posts);
    }
    setLoading(false);
    // 다음 마운트에서도 새로 불러오도록 캐시 초기화
    initialDataPromise = null;
  };

  // 상세 보기 모드
  if (selectedPost) {
    return (
      <div className="p-5 max-w-4xl mx-auto">
        {/* 뒤로가기 */}
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
            <h1 className="text-lg font-bold text-slate-900 mb-1">{selectedPost.title}</h1>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{new Date(selectedPost.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              {selectedPost.hospital_name && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium">{selectedPost.hospital_name}</span>
              )}
              {selectedPost.topic && (
                <span className="text-slate-500">주제: {selectedPost.topic}</span>
              )}
              {selectedPost.char_count && (
                <span>{selectedPost.char_count.toLocaleString()}자</span>
              )}
            </div>
          </div>

          {/* 키워드 */}
          {selectedPost.keywords && selectedPost.keywords.length > 0 && (
            <div className="px-6 py-2 border-b border-slate-100 flex items-center gap-1.5">
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
              onClick={() => {
                if (typeof navigator !== 'undefined') {
                  navigator.clipboard.writeText(selectedPost.content);
                }
              }}
              className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              본문 복사
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 목록 모드
  return (
    <div className="p-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-900">생성 이력</h1>
        <button
          onClick={loadPosts}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto bg-slate-100">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-700 mb-1">아직 생성 이력이 없습니다</h2>
          <p className="text-sm text-slate-400">블로그를 생성하면 여기에 자동으로 저장됩니다.</p>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-2">
          {posts.map(post => (
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
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${
                      post.post_type === 'blog' ? 'bg-blue-50 text-blue-600'
                        : post.post_type === 'card_news' ? 'bg-pink-50 text-pink-600'
                        : post.post_type === 'refine' ? 'bg-violet-50 text-violet-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}>
                      {post.post_type === 'blog' ? '블로그' : post.post_type === 'card_news' ? '카드뉴스' : post.post_type === 'refine' ? 'AI 보정' : '보도자료'}
                    </span>
                    {post.hospital_name && (
                      <span className="truncate max-w-[120px]">{post.hospital_name}</span>
                    )}
                    <span>{new Date(post.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {post.char_count && (
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
