'use client';

import { useState, useMemo } from 'react';

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

// ── 점수 타입 ──

export interface ScoreBarData {
  safetyScore?: number;
  conversionScore?: number;
  seoScore?: number;
}

// ── 점수 바 (내부 컴포넌트) ──

function ScoreBar({ scores, postType }: { scores?: ScoreBarData; postType?: string }) {
  const hasScores = scores && (scores.safetyScore != null || scores.conversionScore != null || scores.seoScore != null);

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4 flex items-center justify-between text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "url(\"data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=\")" }} />
      <div className="flex items-center gap-4 relative">
        {hasScores ? (
          <>
            {/* SEO 점수 (blog만) */}
            {postType !== 'card_news' && (
              <>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">📊 SEO 점수</span>
                  <div className="flex items-center gap-2">
                    {scores.seoScore != null ? (
                      <>
                        <span className={`text-2xl font-black ${scores.seoScore >= 85 ? 'text-emerald-400' : scores.seoScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                          {scores.seoScore}점
                        </span>
                        <span className="text-[10px] opacity-70">
                          {scores.seoScore >= 85 ? '✅ 최적화' : scores.seoScore >= 70 ? '⚠️ 개선필요' : '🚨 재설계'}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </div>
                <div className="w-px h-10 bg-slate-700" />
              </>
            )}

            {/* 의료법 준수 */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">⚖️ 의료법</span>
              <div className="flex items-center gap-2">
                {scores.safetyScore != null ? (
                  <>
                    <span className={`text-2xl font-black ${scores.safetyScore > 80 ? 'text-green-400' : 'text-amber-400'}`}>
                      {scores.safetyScore}점
                    </span>
                    <span className="text-[10px] opacity-70">{scores.safetyScore > 80 ? '✅' : '⚠️'}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
            </div>

            <div className="w-px h-10 bg-slate-700" />

            {/* 전환력 점수 */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">🎯 전환력</span>
              <div className="flex items-center gap-2">
                {scores.conversionScore != null ? (
                  <>
                    <span className={`text-2xl font-black ${scores.conversionScore >= 80 ? 'text-emerald-400' : scores.conversionScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {scores.conversionScore}점
                    </span>
                    <span className="text-[10px] opacity-70">
                      {scores.conversionScore >= 80 ? '🔥' : scores.conversionScore >= 60 ? '👍' : '💡'}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-400">
            💡 점수 데이터가 연결되면 여기에 표시됩니다
          </div>
        )}
      </div>
    </div>
  );
}

// ── 결과 패널 ──

interface ResultPanelProps {
  content: string;
  completionText?: string;
  saveStatus: string | null;
  scores?: ScoreBarData;
  postType?: string;
}

export function ResultPanel({ content, completionText = '생성 완료', saveStatus, scores, postType }: ResultPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const charCount = useMemo(() => content.replace(/\s/g, '').length, [content]);

  const charLabel = charCount < 1500 ? '짧음' : charCount < 4000 ? '적당' : '길음';
  const charColor = charCount < 1500 ? 'text-amber-600' : charCount < 4000 ? 'text-emerald-600' : 'text-blue-600';

  const handleCopy = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(content);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px] overflow-hidden flex flex-col">
      {/* ── 점수 바 ── */}
      <ScoreBar scores={scores} postType={postType} />

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-3">
          {/* 완료 상태 */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-xs font-semibold text-slate-500">{completionText}</span>
          </div>

          {/* 글자 수 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white">
            <span className="text-[10px]">📊</span>
            <span className="text-xs text-slate-500">글자 수:</span>
            <span className={`text-xs font-bold ${charColor}`}>
              {charCount.toLocaleString()}
            </span>
            <span className={`text-[10px] ${charColor}`}>({charLabel})</span>
          </div>

          {/* 저장 상태 */}
          {saveStatus && (
            <span className={`text-xs font-medium ${saveStatus.startsWith('저장 실패') ? 'text-red-500' : 'text-emerald-600'}`}>
              💾 {saveStatus}
            </span>
          )}
        </div>

        {/* 복사 버튼 */}
        <button
          onClick={handleCopy}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            copyFeedback
              ? 'bg-emerald-500 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
          }`}
        >
          {copyFeedback ? '✅ 복사 완료' : '블로그로 복사'}
        </button>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div className="p-6 flex-1">
        <article className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </article>
      </div>
    </div>
  );
}
