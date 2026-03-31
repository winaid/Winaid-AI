'use client';

import { useState, useEffect, useCallback } from 'react';
import { listPosts, type SavedPost } from '../../../lib/postStorage';
import { getSessionSafe } from '../../../lib/supabase';

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
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:1rem;font-weight:600;color:#475569;margin:0.75rem 0 0.3rem">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1rem;font-weight:700;color:#1e40af;margin:1rem 0 0.4rem;padding-left:15px;border-left:4px solid #787fff;line-height:1.5">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.35rem;font-weight:700;color:#1e293b;margin:1.25rem 0 0.5rem">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:2rem;font-weight:900;color:#1e293b;margin:1.5rem 0 0.75rem;line-height:1.4">$1</h1>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0" />')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:#1e293b">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li style="font-size:0.9375rem;line-height:1.7;color:#334155;margin:0.2rem 0">$1</li>')
    .replace(/\n{2,}/g, '</p><p style="font-size:0.9375rem;line-height:1.85;color:#334155;margin:0.5rem 0">')
    .replace(/\n/g, '<br />');
  html = `<p style="font-size:0.9375rem;line-height:1.85;color:#334155;margin:0.5rem 0">${html}</p>`;
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*["'][^"']*["']/gi, '').replace(/javascript\s*:/gi, '');
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

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  all: '콘텐츠를 생성하면 여기에 자동으로 저장됩니다.',
  blog: '블로그 글을 생성하면 여기에 표시됩니다.',
  card_news: '카드뉴스를 생성하면 여기에 표시됩니다.',
  press_release: '보도자료를 생성하면 여기에 표시됩니다.',
  image: '이미지를 생성하면 여기에 표시됩니다.',
  refine: 'AI 보정 결과가 여기에 표시됩니다.',
};

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
      const { userId } = await getSessionSafe();
      const result = await listPosts(userId);
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
      image: { label: '이미지', cls: 'bg-emerald-50 text-emerald-600' },
    };
    const info = map[post.post_type] || { label: post.post_type, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`px-1.5 py-0.5 rounded font-semibold text-xs ${info.cls}`}>{info.label}</span>;
  };

  const filtered = filterPosts(posts, activeTab);

  // ── 단일 return: 상세/목록 + 피드백을 항상 아래에 배치 ──
  return (
    <div className="p-5 max-w-4xl mx-auto space-y-6">
      {/* ── 히스토리 영역 (상세 또는 목록) ── */}
      {selectedPost ? (
        <>
          <button
            onClick={() => setSelectedPost(null)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
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
                <span>{relativeTime(selectedPost.created_at)}</span>
                {selectedPost.hospital_name && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium">{selectedPost.hospital_name}</span>
                )}
                {selectedPost.topic && (
                  <span className="text-slate-500">주제: {selectedPost.topic}</span>
                )}
                {selectedPost.char_count != null && selectedPost.post_type !== 'image' && (
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
              {selectedPost.post_type === 'image' && selectedPost.content.startsWith('data:image') ? (
                <div className="flex flex-col items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedPost.content}
                    alt={selectedPost.title || '생성된 이미지'}
                    className="max-w-full rounded-xl shadow-md border border-slate-200"
                  />
                  {selectedPost.topic && (
                    <p className="text-sm text-slate-500 text-center">프롬프트: {selectedPost.topic}</p>
                  )}
                </div>
              ) : (
                <article
                  className="max-w-none"
                  style={{ fontFamily: "'Malgun Gothic', sans-serif", lineHeight: 1.9 }}
                  dangerouslySetInnerHTML={{ __html: mdToHtml(selectedPost.content) }}
                />
              )}
            </div>

            {/* 하단 액션 */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
              {selectedPost.post_type === 'image' && selectedPost.content.startsWith('data:image') ? (
                <a
                  href={selectedPost.content}
                  download={`image-${selectedPost.id.slice(0, 8)}.png`}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm"
                >
                  다운로드
                </a>
              ) : (
                <button
                  onClick={() => {
                    try {
                      const html = mdToHtml(selectedPost.content);
                      const blob = new Blob([html], { type: 'text/html' });
                      const plainBlob = new Blob([selectedPost.content], { type: 'text/plain' });
                      navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })]);
                    } catch {
                      navigator.clipboard.writeText(selectedPost.content);
                    }
                    setCopyFeedback(true);
                    setTimeout(() => setCopyFeedback(false), 1500);
                  }}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                    copyFeedback
                      ? 'bg-emerald-500 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
                  }`}
                >
                  {copyFeedback ? '복사 완료' : '블로그로 복사'}
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
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
            <div className="flex gap-1 overflow-x-auto -mt-2">
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
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
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
                    {/* 이미지 타입 썸네일 */}
                    {post.post_type === 'image' && post.content?.startsWith('data:image') && (
                      <div className="flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post.content}
                          alt={post.title}
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                        />
                      </div>
                    )}
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
                        <span>{relativeTime(post.created_at)}</span>
                        {post.char_count != null && post.post_type !== 'image' && (
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
        </>
      )}

    </div>
  );
}
