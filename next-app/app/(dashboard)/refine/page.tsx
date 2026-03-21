'use client';

import { useState } from 'react';
import { buildRefinePrompt, REFINE_OPTIONS, type RefineMode } from '../../../lib/refinePrompt';
import { savePost } from '../../../lib/postStorage';
import { supabase } from '../../../lib/supabase';

export default function RefinePage() {
  // ── 폼 상태 ──
  const [originalText, setOriginalText] = useState('');
  const [selectedMode, setSelectedMode] = useState<RefineMode>('natural');

  // ── 생성 상태 ──
  const [isRefining, setIsRefining] = useState(false);
  const [refinedContent, setRefinedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalText.trim()) return;

    setIsRefining(true);
    setError(null);
    setRefinedContent(null);
    setSaveStatus(null);

    try {
      const { systemInstruction, prompt } = buildRefinePrompt({
        originalText: originalText.trim(),
        mode: selectedMode,
      });

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction,
          model: 'gemini-2.5-flash-preview-05-20',
          temperature: 0.6,
          maxOutputTokens: 8192,
        }),
      });

      const data = await res.json() as { text?: string; error?: string; details?: string };

      if (!res.ok || !data.text) {
        setError(data.error || data.details || `서버 오류 (${res.status})`);
        return;
      }

      setRefinedContent(data.text);

      // Supabase에 저장 — post_type CHECK 제약으로 'blog'로 저장, topic에 보정 모드 표기
      const { data: { session } } = await supabase.auth.getSession();
      const modeLabel = REFINE_OPTIONS.find(o => o.value === selectedMode)?.label || selectedMode;
      const titleMatch = data.text.match(/^#\s+(.+)/m) || data.text.match(/^(.+)/);
      const extractedTitle = titleMatch
        ? `[AI 보정] ${titleMatch[1].replace(/^[#*\s]+/, '').trim().substring(0, 180)}`
        : `[AI 보정] ${originalText.trim().substring(0, 50)}`;

      const saveResult = await savePost({
        userId: session?.user?.id || null,
        userEmail: session?.user?.email || null,
        postType: 'blog',
        title: extractedTitle,
        content: data.text,
        topic: `[AI 보정 · ${modeLabel}] ${originalText.trim().substring(0, 100)}`,
      });

      if ('error' in saveResult) {
        setSaveStatus('저장 실패: ' + saveResult.error);
      } else {
        setSaveStatus('저장 완료');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '네트워크 오류';
      setError(msg);
    } finally {
      setIsRefining(false);
    }
  };

  const charCount = originalText.replace(/\s/g, '').length;

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 영역 ── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] lg:flex-none">
        <form onSubmit={handleRefine} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">✨</span>
            <h2 className="text-base font-bold text-slate-800">AI 보정</h2>
          </div>

          {/* 원문 입력 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500">원문 입력 *</label>
              <span className="text-[10px] text-slate-400">{charCount.toLocaleString()}자</span>
            </div>
            <textarea
              value={originalText}
              onChange={e => setOriginalText(e.target.value)}
              placeholder="다듬고 싶은 텍스트를 여기에 붙여넣으세요..."
              required
              rows={12}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-y min-h-[200px]"
            />
          </div>

          {/* 보정 모드 선택 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">보정 방향</label>
            <div className="grid grid-cols-2 gap-1.5">
              {REFINE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedMode(opt.value)}
                  className={`text-left px-3 py-2.5 rounded-xl transition-all border ${
                    selectedMode === opt.value
                      ? 'bg-violet-50 border-violet-200 ring-1 ring-violet-300'
                      : 'bg-white border-slate-150 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{opt.icon}</span>
                    <span className={`text-xs font-bold ${selectedMode === opt.value ? 'text-violet-700' : 'text-slate-700'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 보정 버튼 */}
          <button
            type="submit"
            disabled={isRefining || !originalText.trim()}
            className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isRefining ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                보정 중...
              </>
            ) : (
              'AI 보정 시작'
            )}
          </button>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {isRefining ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-violet-50 text-violet-600 border border-violet-100">
              <span>✨</span>
              <span>보정 중</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-violet-100 border-t-violet-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              원문을 분석하고 다듬고 있어요
            </p>
            <p className="text-xs text-slate-400">
              {REFINE_OPTIONS.find(o => o.value === selectedMode)?.description}
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 min-h-[200px]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-red-500 text-lg">⚠</span>
              <h3 className="text-base font-bold text-red-700">보정 실패</h3>
            </div>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 text-sm font-semibold bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              닫기
            </button>
          </div>
        ) : refinedContent ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span className="text-xs font-semibold text-slate-500">
                  보정 완료 · {REFINE_OPTIONS.find(o => o.value === selectedMode)?.label}
                </span>
                {saveStatus && (
                  <span className={`text-xs font-medium ml-2 ${saveStatus.startsWith('저장 실패') ? 'text-red-500' : 'text-emerald-600'}`}>
                    {saveStatus}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (typeof navigator !== 'undefined') {
                    navigator.clipboard.writeText(refinedContent);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              >
                복사
              </button>
            </div>
            <div className="p-6 flex-1">
              <article className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                {refinedContent}
              </article>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="text-[10px] text-slate-300 font-medium">AI REFINE</div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100">
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 다듬는<br /><span className="text-violet-600">콘텐츠 보정</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">
                  기존 글을 붙여넣고<br />원하는 방향으로 다듬어보세요
                </p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['자연스럽게 · 전문적으로 · 짧게 · 길게', '의료광고법 리스크 자동 완화', 'SEO 구조 최적화'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-violet-400">✦</span>
                    {text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-violet-50 text-violet-500 border border-violet-100">
                <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
                AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
