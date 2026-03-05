import React, { useState, useEffect, useCallback } from 'react';
import { getMyPostHistory, getPostById, type PostHistoryItem } from '../services/postStorageService';

interface PostHistoryProps {
  onClose: () => void;
  darkMode?: boolean;
}

const POST_TYPE_LABELS: Record<string, string> = {
  blog: 'blog',
  card_news: 'card',
  press_release: 'press',
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

    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Detail view
  if (selectedPost) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSelectedPost(null)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
              darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            &larr; Back
          </button>
          <button
            onClick={handleCopyHtml}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg'
            } transition-all`}
          >
            {copied ? 'Copied!' : 'Copy HTML'}
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
            {selectedPost.char_count?.toLocaleString()}chars
          </span>
        </div>
        <div
          className={`flex-1 overflow-y-auto rounded-xl border p-4 prose prose-sm max-w-none ${
            darkMode ? 'bg-slate-900 border-slate-700 prose-invert' : 'bg-white border-slate-200'
          }`}
          dangerouslySetInnerHTML={{ __html: selectedPost.content }}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            History
          </h2>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {total > 0 ? `${total} posts total` : 'No posts yet'}
          </p>
        </div>
        <button
          onClick={onClose}
          className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
        >
          &times;
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
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm">No posts yet. Generate one!</p>
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
                    : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md'
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
                        {item.char_count?.toLocaleString()}chars
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
                &lt; Prev
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
                Next &gt;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PostHistory;
