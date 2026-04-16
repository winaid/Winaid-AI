'use client';

import { useState } from 'react';

interface DiagnosticFormProps {
  onSubmit: (url: string) => void;
  disabled: boolean;
}

export default function DiagnosticForm({ onSubmit, disabled }: DiagnosticFormProps) {
  const [url, setUrl] = useState('');

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl || disabled) return;
    onSubmit(trimmedUrl);
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
        <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
          AI 실측(ChatGPT·Gemini 실제 답변)은 진단 결과 화면의 각 AI 카드에서 따로 요청할 수 있습니다.
        </p>
      </div>
    </form>
  );
}
