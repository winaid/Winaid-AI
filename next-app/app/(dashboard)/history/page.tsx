'use client';

import { useState, useEffect, useCallback } from 'react';
import { listPosts, type SavedPost } from '../../../lib/postStorage';
import { supabase } from '../../../lib/supabase';

export default function HistoryPage() {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<SavedPost | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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

  // ── 목록 ──
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
