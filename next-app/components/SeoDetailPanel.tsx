'use client';

import { useState } from 'react';
import type { SeoReport } from '@winaid/blog-core';

interface SeoDetailPanelProps {
  report: SeoReport;
}

const CATEGORIES: { key: keyof Pick<SeoReport, 'title' | 'keyword_structure' | 'user_retention' | 'medical_safety' | 'conversion'>; label: string; maxScore: number; num: string }[] = [
  { key: 'title', label: '제목 최적화', maxScore: 25, num: '①' },
  { key: 'keyword_structure', label: '본문 키워드 구조', maxScore: 25, num: '②' },
  { key: 'user_retention', label: '사용자 체류 구조', maxScore: 20, num: '③' },
  { key: 'medical_safety', label: '의료법 안전성', maxScore: 20, num: '④' },
  { key: 'conversion', label: '전환 연결성', maxScore: 10, num: '⑤' },
];

function getBarColor(score: number, maxScore: number): string {
  const ratio = score / maxScore;
  if (ratio >= 0.8) return 'bg-blue-500';
  if (ratio >= 0.6) return 'bg-amber-500';
  return 'bg-red-500';
}

function getTotalColor(total: number): { bg: string; text: string } {
  if (total >= 85) return { bg: 'bg-emerald-50', text: 'text-emerald-600' };
  if (total >= 70) return { bg: 'bg-amber-50', text: 'text-amber-600' };
  return { bg: 'bg-red-50', text: 'text-red-600' };
}

export default function SeoDetailPanel({ report }: SeoDetailPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const totalColor = getTotalColor(report.total);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full mt-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs">📊</span>
          <span className="text-xs font-semibold text-slate-600">SEO 상세 분석 보기</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-black ${totalColor.text}`}>{report.total}점</span>
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <span className="text-sm">📊</span>
          <span className="text-xs font-bold text-slate-700">SEO 상세 분석</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full ${totalColor.bg}`}>
            <span className={`text-sm font-black ${totalColor.text}`}>{report.total}</span>
            <span className={`text-xs font-medium ${totalColor.text} ml-0.5`}>/100</span>
          </div>
          <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
        </div>
      </div>

      {/* 카테고리별 점수 */}
      <div className="p-4 space-y-3">
        {CATEGORIES.map(cat => {
          const data = report[cat.key];
          if (!data) return null;
          const ratio = data.score / cat.maxScore;
          const barColor = getBarColor(data.score, cat.maxScore);
          const isFeedbackOpen = expandedFeedback === cat.key;

          return (
            <div key={cat.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">
                  <span className="text-slate-400 mr-1">{cat.num}</span>
                  {cat.label}
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {data.score}<span className="text-slate-400 font-normal">/{cat.maxScore}</span>
                </span>
              </div>
              {/* progress bar */}
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                />
              </div>
              {/* feedback 토글 */}
              {data.feedback && (
                <button
                  onClick={() => setExpandedFeedback(isFeedbackOpen ? null : cat.key)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {isFeedbackOpen ? '피드백 접기 ▲' : '피드백 보기 ▼'}
                </button>
              )}
              {isFeedbackOpen && data.feedback && (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  {data.feedback}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 개선 제안 */}
      {report.improvement_suggestions?.length > 0 && (
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-blue-50/80 border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-2">개선 제안</p>
            <ul className="space-y-1">
              {report.improvement_suggestions.map((s, i) => (
                <li key={i} className="text-[11px] text-blue-600 flex items-start gap-1.5">
                  <span className="text-blue-400 mt-0.5 flex-none">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
