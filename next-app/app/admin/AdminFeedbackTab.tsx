'use client';

import type { InternalFeedback as FeedbackItem, FeedbackAnalysis } from '../../lib/feedbackService';

export interface AdminFeedbackTabProps {
  feedbacks: FeedbackItem[];
  feedbacksLoading: boolean;
  feedbackSearch: string;
  setFeedbackSearch: (v: string) => void;
  feedbackAnalysis: FeedbackAnalysis | null;
  feedbackAnalyzing: boolean;
  feedbackAnalysisError: string;
  hasMoreFeedbacks: boolean;
  onDelete: (id: string) => void;
  onAnalyze: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export default function AdminFeedbackTab({
  feedbacks, feedbacksLoading, feedbackSearch, setFeedbackSearch,
  feedbackAnalysis, feedbackAnalyzing, feedbackAnalysisError,
  hasMoreFeedbacks,
  onDelete, onAnalyze, onLoadMore, onRefresh,
}: AdminFeedbackTabProps) {
  const fq = feedbackSearch.trim().toLowerCase();
  const filteredFeedbacks = fq
    ? feedbacks.filter(f =>
        f.content.toLowerCase().includes(fq) ||
        f.user_name.toLowerCase().includes(fq)
      )
    : feedbacks;

  return (
    <div className="space-y-4">
      {/* 헤더 + 분석 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">피드백 목록</h2>
          {feedbacks.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {feedbacks.length}건{fq && ` · 검색 ${filteredFeedbacks.length}건`}
            </span>
          )}
          <input
            type="text"
            value={feedbackSearch}
            onChange={e => setFeedbackSearch(e.target.value)}
            placeholder="내용·작성자 검색"
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:border-blue-400 transition-colors"
          />
          <button
            onClick={onRefresh}
            disabled={feedbacksLoading}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {feedbacksLoading ? '로딩...' : '새로고침'}
          </button>
        </div>
        <button
          onClick={onAnalyze}
          disabled={feedbackAnalyzing || feedbacks.length === 0}
          className="px-4 py-2 text-xs font-bold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
        >
          {feedbackAnalyzing ? (
            <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />분석 중...</>
          ) : (
            <>AI 피드백 분석</>
          )}
        </button>
      </div>

      {/* AI 분석 결과 */}
      {feedbackAnalysisError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs text-red-600">{feedbackAnalysisError}</p>
        </div>
      )}
      {feedbackAnalysis && (
        <div className="space-y-3">
          <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl">
            <p className="text-xs font-bold text-violet-700 mb-1">전체 트렌드</p>
            <p className="text-sm text-violet-800 leading-relaxed">{feedbackAnalysis.overall}</p>
          </div>
          {feedbackAnalysis.clusters.map((cluster, idx) => (
            <div key={idx} className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  cluster.priority === 'high' ? 'bg-red-100 text-red-700'
                  : cluster.priority === 'medium' ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600'
                }`}>
                  {cluster.priority === 'high' ? '긴급' : cluster.priority === 'medium' ? '보통' : '낮음'}
                </span>
                <span className="text-xs font-bold text-slate-800">{cluster.theme}</span>
                <span className="text-[10px] text-slate-400 ml-auto">{cluster.count}건</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-2">{cluster.summary}</p>
              {cluster.examples.length > 0 && (
                <div className="space-y-1">
                  {cluster.examples.map((ex, ei) => (
                    <div key={ei} className="text-[11px] text-slate-500 pl-2.5 border-l-2 border-slate-200 leading-relaxed">{ex}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 피드백 목록 */}
      {feedbacksLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">{fq ? '검색 결과가 없습니다.' : '아직 피드백이 없습니다.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredFeedbacks.map(fb => (
              <div key={fb.id} className="px-5 py-3.5 flex gap-3 group hover:bg-slate-50/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {fb.user_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-slate-700">{fb.user_name}</span>
                    <span className="text-[10px] text-slate-400">{fb.user_id === 'anonymous' ? '(비로그인)' : fb.user_id.slice(0, 8)}</span>
                    <span className="text-[10px] text-slate-400">{new Date(fb.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap break-words leading-relaxed">{fb.content}</p>
                </div>
                <button
                  onClick={() => onDelete(fb.id)}
                  className="text-[10px] text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 self-center"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          {hasMoreFeedbacks && !fq && (
            <button
              onClick={onLoadMore}
              disabled={feedbacksLoading}
              className="w-full py-2.5 text-xs font-semibold text-slate-500 bg-slate-50 border-t border-slate-100 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {feedbacksLoading ? '불러오는 중...' : '더 불러오기'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
