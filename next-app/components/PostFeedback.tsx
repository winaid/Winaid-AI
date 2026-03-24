'use client';

/**
 * PostFeedback — history 상세 하단 내부용 피드백란
 *
 * - 로그인 사용자 전용 (guest에서는 이 컴포넌트를 렌더하지 않음)
 * - 작성자 이름 + 시각 + 내용 표시
 * - v1: 텍스트 입력 → 저장 → 목록 표시
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listFeedbacks,
  addFeedback,
  deleteFeedback,
  type PostFeedback as Feedback,
} from '../lib/feedbackService';

interface Props {
  postId: string;
  userId: string;
  userName: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
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

export default function PostFeedback({ postId, userId, userName }: Props) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const list = await listFeedbacks(postId);
    setFeedbacks(list);
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const result = await addFeedback(postId, userId, userName, text);
    if (result.success && result.feedback) {
      setFeedbacks(prev => [...prev, result.feedback!]);
      setText('');
    } else {
      setLoadError(result.error || '저장 실패');
    }
    setSubmitting(false);
  };

  const handleDelete = async (feedbackId: string) => {
    if (!confirm('이 피드백을 삭제하시겠습니까?')) return;
    const ok = await deleteFeedback(feedbackId);
    if (ok) {
      setFeedbacks(prev => prev.filter(f => f.id !== feedbackId));
    }
  };

  return (
    <div className="mt-0 border-t border-slate-100">
      {/* 헤더 */}
      <div className="px-6 py-3 bg-slate-50/50 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-xs font-bold text-slate-600">내부 피드백</span>
        {feedbacks.length > 0 && (
          <span className="text-[10px] text-slate-400">{feedbacks.length}개</span>
        )}
      </div>

      {/* 에러 */}
      {loadError && (
        <div className="mx-6 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          {loadError}
        </div>
      )}

      {/* 기존 피드백 목록 */}
      {feedbacks.length > 0 && (
        <div className="px-6 space-y-2 pb-3">
          {feedbacks.map(fb => (
            <div key={fb.id} className="flex gap-2.5 group">
              {/* 아바타 */}
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                {fb.user_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{fb.user_name}</span>
                  <span className="text-[10px] text-slate-400">{timeAgo(fb.created_at)}</span>
                  {fb.user_id === userId && (
                    <button
                      onClick={() => handleDelete(fb.id)}
                      className="text-[10px] text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap break-words mt-0.5 leading-relaxed">{fb.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 입력란 */}
      <div className="px-6 pb-4 pt-1">
        <div className="flex gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
            {userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="피드백을 입력하세요..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 resize-none transition-all placeholder-slate-400"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-slate-400">Ctrl+Enter로 전송</span>
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? '저장 중...' : '피드백 작성'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
