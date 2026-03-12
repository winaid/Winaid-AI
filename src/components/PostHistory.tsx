import React, { useState, useEffect, useCallback } from 'react';
import { getMyPostHistory, getPostById, type PostHistoryItem } from '../services/postStorageService';
import { sanitizeHtml } from '../utils/sanitizeHtml';

interface PostHistoryProps {
  onClose: () => void;
  darkMode?: boolean;
}

const POST_TYPE_LABELS: Record<string, string> = {
  blog: '블로그',
  card_news: '카드뉴스',
  press_release: '보도자료',
};

const POST_TYPE_COLORS: Record<string, string> = {
  blog: 'bg-emerald-100 text-emerald-700',
  card_news: 'bg-blue-100 text-blue-700',
  press_release: 'bg-amber-100 text-amber-700',
};

const PostHistory: React.FC<PostHistoryProps> = ({ onClose, darkMode = false }) => {
  const [items, setItems] = useState<PostHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [loadingPost, setLoadingPost] = useState(false);
  const [copied, setCopied] = useState(false);
  const PAGE_SIZE = 10;

  const fetchHistory = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    const result = await getMyPostHistory(PAGE_SIZE, pageNum * PAGE_SIZE);
    if (result.success) {
      setItems(result.data || []);
      setTotal(result.total || 0);
    } else {
      setError(result.error || 'Failed to load history');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  const handleViewPost = async (postId: string) => {
    setLoadingPost(true);
    const result = await getPostById(postId);
    if (result.success) {
      setSelectedPost(result.data);
    } else {
      setError(result.error || 'Failed to load post');
    }
    setLoadingPost(false);
  };

  const handleCopyHtml = () => {
    if (selectedPost?.content) {
      navigator.clipboard.writeText(selectedPost.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return '방금 전';
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Detail view
  if (selectedPost) {
    return (
      <div className="h-full flex flex-col">
        <div className={`flex items-center justify-between pb-4 mb-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={() => setSelectedPost(null)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            &larr; 목록으로
          </button>
          <button
            onClick={handleCopyHtml}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            }`}
          >
            {copied ? '복사 완료!' : 'HTML 복사'}
          </button>
        </div>
        <h2 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          {selectedPost.title}
        </h2>
        <div className="flex gap-2 mb-4">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${POST_TYPE_COLORS[selectedPost.post_type] || 'bg-slate-100 text-slate-600'}`}>
            {POST_TYPE_LABELS[selectedPost.post_type] || selectedPost.post_type}
          </span>
          {selectedPost.category && (
            <span className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
              {selectedPost.category}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {selectedPost.char_count?.toLocaleString()}자
          </span>
        </div>
        <div
          className={`flex-1 overflow-y-auto rounded-xl border p-4 prose prose-sm max-w-none ${
            darkMode ? 'bg-slate-900 border-slate-700 prose-invert' : 'bg-white border-slate-200'
          }`}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedPost.content) }}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      <div className={`flex items-center justify-between pb-4 mb-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm ${darkMode ? 'bg-amber-900/50 border border-amber-800' : 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100/80'}`}>
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
          </div>
          <div>
            <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              작성 히스토리
            </h2>
            <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
              {total > 0 ? `총 ${total}개의 글` : '아직 작성한 글이 없습니다'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400 border border-transparent hover:border-slate-200'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className={`flex-1 flex flex-col items-center justify-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          </div>
          <p className="text-sm font-medium">아직 작성한 글이 없습니다</p>
          <p className="text-xs mt-1 opacity-60">블로그 글을 생성하면 여기에 저장됩니다</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleViewPost(item.id)}
                disabled={loadingPost}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 hover:border-slate-500'
                    : 'bg-white/80 backdrop-blur-sm border-slate-200/60 hover:border-blue-300/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${POST_TYPE_COLORS[item.post_type] || 'bg-slate-100 text-slate-600'}`}>
                        {POST_TYPE_LABELS[item.post_type] || item.post_type}
                      </span>
                      {item.category && (
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {item.category}
                        </span>
                      )}
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {item.char_count?.toLocaleString()}자
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {formatDate(item.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-200">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className={`px-3 py-1 rounded text-sm ${
                  page === 0
                    ? 'opacity-30 cursor-not-allowed'
                    : darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                &lt; 이전
              </button>
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className={`px-3 py-1 rounded text-sm ${
                  page >= totalPages - 1
                    ? 'opacity-30 cursor-not-allowed'
                    : darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                다음 &gt;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PostHistory;
