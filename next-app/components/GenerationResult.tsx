'use client';

import { useState } from 'react';

// ── 에러 패널 ──

interface ErrorPanelProps {
  title?: string;
  error: string;
  onDismiss: () => void;
}

export function ErrorPanel({ title = '생성 실패', error, onDismiss }: ErrorPanelProps) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 min-h-[200px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-red-500 text-lg">&#x26A0;</span>
        <h3 className="text-base font-bold text-red-700">{title}</h3>
      </div>
      <p className="text-sm text-red-600 mb-4">{error}</p>
      <button
        onClick={onDismiss}
        className="px-4 py-2 text-sm font-semibold bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
      >
        닫기
      </button>
    </div>
  );
}

// ── 결과 패널 ──

interface ResultPanelProps {
  content: string;
  completionText?: string;
  saveStatus: string | null;
}

export function ResultPanel({ content, completionText = '생성 완료', saveStatus }: ResultPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(content);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="text-xs font-semibold text-slate-500">{completionText}</span>
          {saveStatus && (
            <span className={`text-xs font-medium ml-2 ${saveStatus.startsWith('저장 실패') ? 'text-red-500' : 'text-emerald-600'}`}>
              {saveStatus}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {copyFeedback ? '복사됨!' : '복사'}
        </button>
      </div>
      <div className="p-6 flex-1">
        <article className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </article>
      </div>
    </div>
  );
}
