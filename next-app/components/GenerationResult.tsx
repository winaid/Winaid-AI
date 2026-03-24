'use client';

import { useState, useMemo } from 'react';

// ── 간이 Markdown → HTML 변환 ──

function markdownToHtml(md: string): string {
  let html = md
    // 코드블록 (```...```) — 먼저 처리해서 내부 마크다운이 변환되지 않게
    .replace(/```[\s\S]*?```/g, (m) => {
      const code = m.slice(3, -3).replace(/^\w*\n/, '');
      return `<pre class="rp-code"><code>${escapeHtml(code)}</code></pre>`;
    })
    // 제목
    .replace(/^#### (.+)$/gm, '<h4 class="rp-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="rp-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="rp-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="rp-h1">$1</h1>')
    // 수평선
    .replace(/^---$/gm, '<hr class="rp-hr" />')
    // 굵은/기울임
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 리스트
    .replace(/^[-*] (.+)$/gm, '<li class="rp-li">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="rp-li rp-ol">$1. $2</li>')
    // 빈 줄 → 단락 구분
    .replace(/\n{2,}/g, '\n</p><p class="rp-p">\n')
    // 줄바꿈
    .replace(/\n/g, '<br />');

  // 감싸기
  html = `<p class="rp-p">${html}</p>`;
  // 연속 li를 ul로 감싸기
  html = html.replace(/((?:<li class="rp-li">[\s\S]*?<\/li>\s*<br \/>\s*)+)/g, (block) => {
    const cleaned = block.replace(/<br \/>\s*/g, '');
    return `<ul class="rp-ul">${cleaned}</ul>`;
  });
  // 빈 p 제거
  html = html.replace(/<p class="rp-p">\s*<\/p>/g, '');

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '');
}

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
  cssTheme?: string;
}

export function ResultPanel({ content, completionText = '생성 완료', saveStatus, scores, postType, cssTheme = 'modern' }: ResultPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'html'>('preview');

  const renderedHtml = useMemo(() => sanitizeHtml(markdownToHtml(content)), [content]);
  const charCount = useMemo(() => content.replace(/\s/g, '').length, [content]);

  const charLabel = charCount < 1500 ? '짧음' : charCount < 4000 ? '적당' : '길음';
  const charColor = charCount < 1500 ? 'text-amber-600' : charCount < 4000 ? 'text-emerald-600' : 'text-blue-600';

  const handleCopy = () => {
    if (typeof navigator === 'undefined') return;
    // HTML 형식으로 클립보드에 복사 (블로그 에디터 붙여넣기용)
    try {
      const blob = new Blob([renderedHtml], { type: 'text/html' });
      const plainBlob = new Blob([content], { type: 'text/plain' });
      navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob }),
      ]);
    } catch {
      navigator.clipboard.writeText(content);
    }
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px] overflow-hidden flex flex-col">
      {/* ── 점수 바 ── */}
      <ScoreBar scores={scores} postType={postType} />

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-3">
          {/* 탭 전환 */}
          <div className="flex p-1 rounded-xl bg-slate-100">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-5 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'preview' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}
            >
              미리보기
            </button>
            <button
              onClick={() => setActiveTab('html')}
              className={`px-5 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'html' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}
            >
              HTML
            </button>
          </div>

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
      {activeTab === 'html' ? (
        <div className="p-6 flex-1 overflow-y-auto">
          <pre className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs leading-relaxed text-slate-600 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-[600px]">
            <code>{renderedHtml}</code>
          </pre>
        </div>
      ) : (
      <div className="p-6 flex-1 overflow-y-auto">
        <style>{`
          /* ── base ── */
          .rp-preview { max-width: 800px; margin: 0 auto; font-family: 'Malgun Gothic', sans-serif; line-height: 1.9; }
          .rp-preview .rp-h1 { font-size: 2rem; font-weight: 900; margin: 1.5rem 0 0.75rem; line-height: 1.4; }
          .rp-preview .rp-h2 { font-size: 1.35rem; font-weight: 700; margin: 1.25rem 0 0.5rem; line-height: 1.35; }
          .rp-preview .rp-h3 { font-size: 1.1rem; font-weight: 700; margin: 1rem 0 0.4rem; padding-left: 15px; border-left: 4px solid #787fff; color: #1e40af; line-height: 1.5; }
          .rp-preview .rp-h4 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.3rem; }
          .rp-preview .rp-p { font-size: 0.9375rem; line-height: 1.85; margin: 0.5rem 0; }
          .rp-preview .rp-ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
          .rp-preview .rp-li { font-size: 0.9375rem; line-height: 1.7; margin: 0.2rem 0; }
          .rp-preview .rp-hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
          .rp-preview .rp-code { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; font-size: 0.8125rem; line-height: 1.6; margin: 0.75rem 0; }
          .rp-preview strong { font-weight: 700; }
          .rp-preview em { font-style: italic; }

          /* ── bare tag fallback (Gemini HTML에 rp-* 클래스가 없는 경우, old applyThemeToHtml 동일) ── */
          .rp-preview h1:not([class]) { font-size: 32px; font-weight: 900; margin: 30px 0 15px; line-height: 1.4; color: #1a1a1a; }
          .rp-preview h2:not([class]) { font-size: 24px; font-weight: 700; margin: 25px 0 12px; line-height: 1.35; color: #1a1a1a; }
          .rp-preview h3:not([class]) { font-size: 19px; font-weight: bold; margin: 30px 0 15px 0; padding: 12px 0 12px 16px; border-left: 4px solid #787fff; color: #1e40af; line-height: 1.5; }
          .rp-preview p:not([class]) { font-size: 17px; color: #333; margin-bottom: 25px; line-height: 1.85; }

          /* ── modern ── */
          .rp-theme-modern { background: #fff; padding: 40px; color: #333; }
          .rp-theme-modern .rp-h1 { color: #1a1a1a; padding-bottom: 20px; }
          .rp-theme-modern .rp-h2 { color: #1a1a1a; }
          .rp-theme-modern .rp-p { color: #333; }

          /* ── premium ── */
          .rp-theme-premium { background: #fefefe; padding: 60px; border: 1px solid #e5e5e5; line-height: 2.0; color: #444; }
          .rp-theme-premium .rp-h1 { color: #2c2c2c; font-weight: 700; }
          .rp-theme-premium .rp-h2 { color: #2c2c2c; }
          .rp-theme-premium .rp-p { color: #444; line-height: 2.0; letter-spacing: -0.3px; }

          /* ── minimal ── */
          .rp-theme-minimal { max-width: 750px; background: #fff; padding: 30px 20px; color: #555; }
          .rp-theme-minimal .rp-h1 { font-size: 1.875rem; color: #222; }
          .rp-theme-minimal .rp-h2 { color: #222; }
          .rp-theme-minimal .rp-p { font-size: 1rem; color: #555; }

          /* ── warm ── */
          .rp-theme-warm { max-width: 820px; background: #fffbf5; padding: 45px 35px; border-radius: 20px; color: #4a4a4a; }
          .rp-theme-warm .rp-h1 { color: #c46d3d; padding: 20px 25px; background: #fff; border-radius: 15px; box-shadow: 0 2px 10px rgba(196,109,61,0.1); }
          .rp-theme-warm .rp-h2 { color: #c46d3d; }
          .rp-theme-warm .rp-h3, .rp-theme-warm h3:not([class]) { border-left-color: #c46d3d; color: #c46d3d; }
          .rp-theme-warm .rp-p, .rp-theme-warm p:not([class]) { color: #4a4a4a; }

          /* ── professional ── */
          .rp-theme-professional { max-width: 880px; background: #f7f9fb; padding: 50px 40px; border-top: 4px solid #787fff; color: #3a3a3a; }
          .rp-theme-professional .rp-h1 { color: #0066cc; padding: 20px 25px; background: #fff; border-left: 6px solid #787fff; border-radius: 8px; }
          .rp-theme-professional .rp-h2 { color: #0066cc; }
          .rp-theme-professional .rp-p { background: #fff; padding: 20px; border-radius: 8px; color: #3a3a3a; }
        `}</style>
        <article
          className={`rp-preview rp-theme-${cssTheme} max-w-none`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
      )}
    </div>
  );
}
