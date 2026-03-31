'use client';

/**
 * InternalFeedback — 페이지 하단 내부용 피드백 영역
 *
 * - 로그인/비로그인 모두 사용 가능 (비로그인 시 anonymous/익명 fallback)
 * - 페이지 단위 피드백 (기록별 댓글 아님)
 * - writeOnly=true: 입력만 (목록/분석은 admin에서 확인)
 * - 3/31 이후 로그인 연동 시 작성자 식별 강화 예정
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listFeedbacks,
  addFeedback,
  deleteFeedback,
  analyzeFeedbacks,
  type InternalFeedback as FeedbackItem,
  type FeedbackAnalysis,
} from '../lib/feedbackService';

interface Props {
  /** 현재 화면 식별자 (예: 'history') */
  page: string;
  /** 로그인 사용자 ID (미로그인 시 생략 가능 — 3/31 이후 연결 강화 예정) */
  userId?: string;
  /** 표시 이름 (미로그인 시 '익명' fallback) */
  userName?: string;
  /** true이면 입력만 표시 (목록/분석 숨김) */
  writeOnly?: boolean;
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

export default function InternalFeedback({ page, userId, userName, writeOnly }: Props) {
  const resolvedUserId = userId || 'anonymous';
  const resolvedUserName = userName || '익명';

  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitOk, setSubmitOk] = useState(false);

  // AI 분석
  const [analysis, setAnalysis] = useState<FeedbackAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const load = useCallback(async () => {
    if (writeOnly) return;
    const list = await listFeedbacks(page);
    setFeedbacks(list);
  }, [page, writeOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitOk(false);

    const result = await addFeedback(page, resolvedUserId, resolvedUserName, text);
    if (result.success && result.feedback) {
      setFeedbacks(prev => [...prev, result.feedback!]);
      setText('');
      setSubmitOk(true);
      setTimeout(() => setSubmitOk(false), 2000);
    } else {
      setSubmitError(result.error || '저장에 실패했습니다.');
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

  const handleAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysisError('');
    const result = await analyzeFeedbacks(feedbacks);
    if (result.success && result.analysis) {
      setAnalysis(result.analysis);
    } else {
      setAnalysisError(result.error || '분석 실패');
    }
    setAnalyzing(false);
  };

  const priorityBadge = (p: string) => {
    const map: Record<string, string> = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-amber-100 text-amber-700',
      low: 'bg-slate-100 text-slate-600',
    };
    const labels: Record<string, string> = { high: '긴급', medium: '보통', low: '낮음' };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${map[p] || map.low}`}>
        {labels[p] || p}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm font-bold text-slate-700">내부 피드백</span>
        {feedbacks.length > 0 && (
          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{feedbacks.length}</span>
        )}
      </div>

      {/* 기존 피드백 목록 (writeOnly에서는 숨김) */}
      {!writeOnly && feedbacks.length > 0 && (
        <div className="px-5 py-3 space-y-3 max-h-[320px] overflow-y-auto">
          {feedbacks.map(fb => (
            <div key={fb.id} className="flex gap-2.5 group">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                {fb.user_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{fb.user_name}</span>
                  <span className="text-[10px] text-slate-400">{timeAgo(fb.created_at)}</span>
                  {fb.user_id === resolvedUserId && (
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
      <div className="px-5 py-4 border-t border-slate-100">
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
            {resolvedUserName.charAt(0)}
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">Ctrl+Enter로 전송</span>
                {submitError && (
                  <span className="text-[10px] text-red-500">{submitError}</span>
                )}
                {submitOk && (
                  <span className="text-[10px] text-emerald-600 font-medium">저장 완료</span>
                )}
              </div>
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

      {/* ── AI 분석 섹션 (writeOnly에서는 숨김) ── */}
      {!writeOnly && <div className="px-5 py-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-sm font-bold text-slate-700">AI 피드백 분석</span>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || feedbacks.length === 0}
            className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
          >
            {analyzing ? (
              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />분석 중...</>
            ) : (
              <>분석 실행</>
            )}
          </button>
        </div>

        {feedbacks.length === 0 && !analyzing && (
          <p className="text-xs text-slate-400">피드백이 있어야 분석할 수 있습니다.</p>
        )}

        {analysisError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg mb-3">
            <p className="text-xs text-red-600">{analysisError}</p>
          </div>
        )}

        {analysis && (
          <div className="space-y-3">
            {/* 전체 요약 */}
            <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
              <p className="text-xs font-bold text-violet-700 mb-1">전체 트렌드</p>
              <p className="text-sm text-violet-800 leading-relaxed">{analysis.overall}</p>
            </div>

            {/* 클러스터 카드 */}
            {analysis.clusters.map((cluster, idx) => (
              <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  {priorityBadge(cluster.priority)}
                  <span className="text-xs font-bold text-slate-800">{cluster.theme}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{cluster.count}건</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-2">{cluster.summary}</p>
                {cluster.examples.length > 0 && (
                  <div className="space-y-1">
                    {cluster.examples.map((ex, ei) => (
                      <div key={ei} className="text-[11px] text-slate-500 pl-2.5 border-l-2 border-slate-200 leading-relaxed">
                        {ex}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {analysis.clusters.length === 0 && (
              <p className="text-xs text-slate-400">분석 결과가 없습니다.</p>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}
