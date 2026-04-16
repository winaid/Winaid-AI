'use client';

import { useState } from 'react';

interface DiagnosticFormProps {
  onSubmit: (url: string, customQuery?: string) => void;
  disabled: boolean;
}

/** 사용자 직접 입력 검색어 길이 상한 — 프롬프트 주입·비용 폭주 방어. */
const MAX_QUERY_LEN = 100;

export default function DiagnosticForm({ onSubmit, disabled }: DiagnosticFormProps) {
  const [url, setUrl] = useState('');
  const [customQuery, setCustomQuery] = useState('');

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl || disabled) return;
    const trimmedQuery = customQuery.trim().slice(0, MAX_QUERY_LEN);
    onSubmit(trimmedUrl, trimmedQuery || undefined);
  };

  return (
    <form onSubmit={handle} className="w-full max-w-2xl mx-auto">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="diag-url" className="block text-xs font-bold text-slate-500 mb-2">
          진단할 병원 홈페이지 URL
        </label>
        <div className="flex gap-2">
          <input
            id="diag-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="예: example-clinic.co.kr 또는 https://example-clinic.co.kr"
            className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            disabled={disabled}
          />
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
          >
            {disabled ? '진단 중...' : '진단 시작'}
          </button>
        </div>

        {/* AI 실측 검색어 — optional. 비워두면 기존 extractRegion 자동 추출. */}
        <div className="mt-3">
          <label htmlFor="diag-query" className="block text-xs font-bold text-slate-500 mb-2">
            AI 실측 검색어 <span className="font-normal text-slate-400">(선택)</span>
          </label>
          <input
            id="diag-query"
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="예: 안산 치과 추천, 강남구 치과"
            maxLength={MAX_QUERY_LEN}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            disabled={disabled}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            비워두면 사이트에서 지역을 자동으로 추출합니다. ChatGPT·Gemini 실측에 그대로 사용돼요.
          </p>
        </div>
      </div>
    </form>
  );
}
