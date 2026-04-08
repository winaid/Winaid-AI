'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { BlogSection } from '../lib/types';
import { sanitizeHtml } from '../lib/sanitize';

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

// ── 에러 패널 ──

interface ErrorPanelProps {
  title?: string;
  error: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

export function ErrorPanel({ title = '생성 실패', error, onDismiss, onRetry }: ErrorPanelProps) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 min-h-[200px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-red-500 text-lg">&#x26A0;</span>
        <h3 className="text-base font-bold text-red-700">{title}</h3>
      </div>
      <p className="text-sm text-red-600 mb-4">{error}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-sm font-semibold bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
        >
          닫기
        </button>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            다시 생성하기
          </button>
        )}
      </div>
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

// ── 섹션 패널 (blog 전용, root ResultPreview.tsx 동일) ──

function BlogSectionPanel({
  sections,
  regeneratingSection,
  sectionProgress,
  onRegenerate,
}: {
  sections: BlogSection[];
  regeneratingSection: number | null;
  sectionProgress: string;
  onRegenerate: (idx: number) => void;
}) {
  return (
    <div className="sticky top-4 shrink-0 w-56 rounded-xl p-4 space-y-2 h-fit max-h-[70vh] overflow-y-auto shadow-xl self-start bg-white border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-slate-700">소제목별 수정</h4>
      </div>
      {sections.map((section) => {
        const label =
          section.type === 'intro'
            ? '도입부'
            : section.type === 'conclusion'
              ? '마무리'
              : section.title;
        const charLen = section.html.replace(/<[^>]*>/g, '').replace(/\s/g, '').length;
        const isRegenerating = regeneratingSection === section.index;
        const isDisabled = regeneratingSection !== null && !isRegenerating;

        return (
          <div key={section.index} className="p-3 rounded-lg text-sm bg-slate-50 hover:bg-slate-100 transition-colors">
            <div className="font-medium mb-1 truncate text-slate-700" title={label}>
              {label}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{charLen}자</span>
              <button
                onClick={() => onRegenerate(section.index)}
                disabled={isRegenerating || isDisabled}
                className={`ml-auto text-xs px-3 py-1 rounded-md font-medium transition-all ${
                  isRegenerating
                    ? 'bg-blue-100 text-blue-600 animate-pulse'
                    : isDisabled
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-violet-100 text-violet-700 hover:bg-violet-200 active:scale-95'
                }`}
              >
                {isRegenerating ? '재생성 중...' : '재생성'}
              </button>
            </div>
          </div>
        );
      })}
      {/* 재생성 진행 상태 */}
      {sectionProgress && (
        <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-700 animate-pulse">
          {sectionProgress}
        </div>
      )}
      <p className="text-[9px] text-slate-400 mt-2 text-center">소제목 재생성은 크레딧이 소모되지 않습니다</p>
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
  // blog 전용 optional props
  blogSections?: BlogSection[];
  regeneratingSection?: number | null;
  sectionProgress?: string;
  onSectionRegenerate?: (sectionIndex: number) => void;
  onDownloadWord?: () => void;
  onDownloadPDF?: () => void;
  onImageRegenerate?: (imageIndex: number) => void;
  regeneratingImage?: number | null;
}

export function ResultPanel({
  content,
  completionText = '생성 완료',
  saveStatus,
  scores,
  postType,
  cssTheme = 'modern',
  blogSections,
  regeneratingSection = null,
  sectionProgress = '',
  onSectionRegenerate,
  onDownloadWord,
  onDownloadPDF,
  onImageRegenerate,
  regeneratingImage,
}: ResultPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'html'>('preview');
  const [showSectionPanel, setShowSectionPanel] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  // ── 서식 명령 ──
  const execFormat = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }, []);

  const handleInsertLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    execFormat('createLink', url);
    // target="_blank" 추가
    setTimeout(() => {
      const links = editorRef.current?.querySelectorAll('a:not([target])');
      links?.forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); });
    }, 50);
    setLinkUrl('');
    setShowLinkInput(false);
  }, [linkUrl, execFormat]);

  const handleLineBreak = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // 마침표 뒤 공백 + 다음 문장 시작 지점에 <br> 삽입 (제목 태그 내부 제외)
    const processed = html.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/gi, (match, open, inner, close) => {
      const newInner = inner.replace(/\.(\s+)(?!<br)(?=[가-힣A-Z])/g, '.<br>');
      return `${open}${newInner}${close}`;
    });
    editorRef.current.innerHTML = processed;
  }, []);

  const hasBlogSections = postType === 'blog' && blogSections && blogSections.length > 0 && onSectionRegenerate;

  // 이미지 재생성 시 해당 이미지 위에 오버레이 추가/제거
  useEffect(() => {
    if (!editorRef.current) return;
    const OVERLAY_CLASS = 'img-regen-overlay';
    // 기존 오버레이 제거
    editorRef.current.querySelectorAll(`.${OVERLAY_CLASS}`).forEach(el => el.remove());
    if (regeneratingImage == null) return;
    const img = editorRef.current.querySelector(`img[data-image-index="${regeneratingImage}"]`);
    if (!img) return;
    const wrapper = img.closest('.content-image-wrapper') || img.parentElement;
    if (!wrapper) return;
    (wrapper as HTMLElement).style.position = 'relative';
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:12px;z-index:10;';
    overlay.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);"><div style="width:16px;height:16px;border:2px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div><span style="font-size:13px;font-weight:700;color:#3b82f6;">재생성 중...</span></div>';
    wrapper.appendChild(overlay);
    return () => { overlay.remove(); };
  }, [regeneratingImage]);

  // content가 이미 HTML이면 markdownToHtml 스킵 (old는 innerHTML 직접 렌더)
  const isHtml = /<(?:h[1-6]|p|div|ul|ol|table)\b/i.test(content);
  const renderedHtml = useMemo(
    () => sanitizeHtml(isHtml ? content : markdownToHtml(content)),
    [content, isHtml],
  );
  const charCount = useMemo(() => content.replace(/<[^>]+>/g, '').replace(/\s/g, '').length, [content]);

  const charLabel = charCount < 1500 ? '짧음' : charCount < 4000 ? '적당' : '길음';
  const charColor = charCount < 1500 ? 'text-amber-600' : charCount < 4000 ? 'text-emerald-600' : 'text-blue-600';

  const handleCopy = () => {
    if (typeof navigator === 'undefined') return;
    const editedHtml = editorRef.current?.innerHTML || renderedHtml;
    const plainText = editorRef.current?.innerText || content;
    // 출처 블록 제거 후 복사
    const htmlWithoutRefs = editedHtml.replace(/<div[^>]*class="references-footer"[^>]*>[\s\S]*?<\/div>/gi, '');
    const plainWithoutRefs = plainText.replace(/참고 자료[\s\S]*$/, '').trim();
    try {
      const blob = new Blob([htmlWithoutRefs], { type: 'text/html' });
      const plainBlob = new Blob([plainWithoutRefs], { type: 'text/plain' });
      navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob }),
      ]);
    } catch {
      navigator.clipboard.writeText(plainWithoutRefs);
    }
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px] overflow-hidden flex flex-col">
      {/* ── 점수 바 ── */}
      <ScoreBar scores={scores} postType={postType} />

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-slate-50/80 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
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

          {/* 서식 툴바 (preview 모드에서만) */}
          {activeTab === 'preview' && (
            <div className="flex items-center gap-0.5">
              {/* 기본 서식 */}
              <button type="button" onClick={() => execFormat('bold')} title="볼드" className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black text-slate-600 hover:bg-slate-200 transition-all">B</button>
              <button type="button" onClick={() => execFormat('italic')} title="이탤릭" className="w-8 h-8 flex items-center justify-center rounded-lg text-xs italic text-slate-600 hover:bg-slate-200 transition-all">I</button>
              <button type="button" onClick={() => execFormat('underline')} title="밑줄" className="w-8 h-8 flex items-center justify-center rounded-lg text-xs underline text-slate-600 hover:bg-slate-200 transition-all">U</button>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              {/* 정렬 */}
              <button type="button" onClick={() => execFormat('justifyLeft')} title="왼쪽 정렬" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M3 6h18M3 12h12M3 18h18" /></svg>
              </button>
              <button type="button" onClick={() => execFormat('justifyCenter')} title="가운데 정렬" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M3 6h18M6 12h12M3 18h18" /></svg>
              </button>
              <button type="button" onClick={() => execFormat('justifyRight')} title="오른쪽 정렬" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M3 6h18M9 12h12M3 18h18" /></svg>
              </button>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              {/* 줄바꿈 */}
              <button type="button" onClick={handleLineBreak} title="한 문장씩 줄바꿈" className="px-2 h-8 flex items-center justify-center rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-200 transition-all whitespace-nowrap">↵ 줄바꿈</button>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              {/* 링크 */}
              <div className="relative">
                <button type="button" onClick={() => setShowLinkInput(!showLinkInput)} title="링크 삽입" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 transition-all text-sm">🔗</button>
                {showLinkInput && (
                  <div className="absolute top-full left-0 mt-1 z-50 flex gap-1.5 bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                    <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." className="w-48 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-400" onKeyDown={e => { if (e.key === 'Enter') handleInsertLink(); }} autoFocus />
                    <button type="button" onClick={handleInsertLink} className="px-3 py-1.5 text-xs font-bold bg-blue-500 text-white rounded-lg hover:bg-blue-600">삽입</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 소제목 수정 토글 (blog 전용) */}
          {hasBlogSections && (
            <button
              onClick={() => setShowSectionPanel(!showSectionPanel)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                showSectionPanel
                  ? 'bg-violet-50 text-violet-600 border-violet-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-violet-200 hover:text-violet-500'
              }`}
            >
              {showSectionPanel ? '소제목 수정 닫기' : '소제목별 수정'}
            </button>
          )}

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
            <span className="text-[9px] text-slate-400">공백 제외</span>
          </div>

          {/* 저장 상태 */}
          {saveStatus && (
            <span className={`text-xs font-medium ${saveStatus.startsWith('저장 실패') ? 'text-red-500' : 'text-emerald-600'}`}>
              💾 {saveStatus}
            </span>
          )}
        </div>

        {/* 우측 버튼들 */}
        <div className="flex items-center gap-2">
          {/* 다운로드 (blog 전용, root ResultScoreBar.tsx 동일) */}
          {postType === 'blog' && (onDownloadWord || onDownloadPDF) && (
            <>
              <span className="text-[10px] font-black uppercase text-slate-400 mr-1 hidden lg:inline">다운로드</span>
              {onDownloadWord && (
                <button
                  onClick={onDownloadWord}
                  disabled={regeneratingSection !== null}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  📄 Word
                </button>
              )}
              {onDownloadPDF && (
                <button
                  onClick={onDownloadPDF}
                  disabled={regeneratingSection !== null}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  📑 PDF
                </button>
              )}
              <div className="w-px h-5 bg-slate-200" />
            </>
          )}

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
      </div>

      {/* ── 콘텐츠 영역 (섹션 패널 포함) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 섹션 패널 (좌측 사이드바) */}
        {showSectionPanel && hasBlogSections && (
          <BlogSectionPanel
            sections={blogSections!}
            regeneratingSection={regeneratingSection}
            sectionProgress={sectionProgress}
            onRegenerate={onSectionRegenerate!}
          />
        )}

        {/* 메인 콘텐츠 */}
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

              /* ── main-title (old resultAssembler.ts + cssThemes.ts modern 기준) ── */
              .rp-preview .main-title { font-size: 32px; font-weight: 900; color: #1a1a1a; margin: 0 0 30px 0; padding-bottom: 20px; line-height: 1.4; word-break: keep-all; }

              /* ── bare tag fallback (Gemini HTML에 rp-* 클래스가 없는 경우, old applyThemeToHtml 동일) ── */
              .rp-preview h1:not([class]) { font-size: 32px; font-weight: 900; margin: 30px 0 15px; line-height: 1.4; color: #1a1a1a; }
              .rp-preview h2:not([class]) { font-size: 24px; font-weight: 700; margin: 25px 0 12px; line-height: 1.35; color: #1a1a1a; }
              .rp-preview h3:not([class]) { font-size: 19px; font-weight: bold; margin: 30px 0 15px 0; padding: 12px 0 12px 16px; border-left: 4px solid #787fff; color: #1e40af; line-height: 1.5; }
              .rp-preview p:not([class]) { font-size: 17px; color: #333; margin-bottom: 25px; line-height: 1.85; }

              /* ── content-image-wrapper ── */
              .rp-preview .content-image-wrapper { margin: 30px 0; text-align: center; }
              .rp-preview .content-image-wrapper img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); cursor: pointer; transition: opacity 0.2s; }
              .rp-preview .content-image-wrapper img:hover { opacity: 0.85; }
              .rp-preview .content-image-wrapper img::after { content: '🔄 클릭하여 재생성'; }

              /* ── references footer ── */
              .rp-preview .references-footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; opacity: 0.6; position: relative; user-select: none; -webkit-user-select: none; }
              .rp-preview .references-footer p { font-size: 11px; color: #94a3b8; font-weight: 600; margin: 0 0 8px 0; }
              .rp-preview .references-footer ul { font-size: 11px; color: #94a3b8; padding-left: 20px; margin: 0; line-height: 1.8; }
              .rp-preview .references-footer::after { content: '📋 블로그 복사 시 이 부분은 제외됩니다'; display: block; margin-top: 8px; font-size: 10px; color: #cbd5e1; font-style: italic; }

              /* ── modern ── */
              .rp-theme-modern { background: #fff; padding: 40px; color: #333; }
              .rp-theme-modern .rp-h1 { color: #1a1a1a; padding-bottom: 20px; }
              .rp-theme-modern .rp-h2 { color: #1a1a1a; }
              .rp-theme-modern .rp-p { color: #333; }

              /* ── premium ── */
              .rp-theme-premium { background: #fefefe; padding: 60px; border: 1px solid #e5e5e5; line-height: 2.0; color: #444; }
              .rp-theme-premium .rp-h1 { color: #2c2c2c; font-weight: 700; }
              .rp-theme-premium .rp-h2 { color: #2c2c2c; }
              .rp-theme-premium .main-title { font-size: 34px; font-weight: 700; color: #2c2c2c; margin-bottom: 35px; padding-bottom: 25px; }
              .rp-theme-premium .rp-p { color: #444; line-height: 2.0; letter-spacing: -0.3px; }

              /* ── minimal ── */
              .rp-theme-minimal { max-width: 750px; background: #fff; padding: 30px 20px; color: #555; }
              .rp-theme-minimal .rp-h1 { font-size: 1.875rem; color: #222; }
              .rp-theme-minimal .rp-h2 { color: #222; }
              .rp-theme-minimal .main-title { font-size: 30px; font-weight: 700; color: #222; margin-bottom: 25px; padding-bottom: 18px; }
              .rp-theme-minimal .rp-p { font-size: 1rem; color: #555; }

              /* ── warm ── */
              .rp-theme-warm { max-width: 820px; background: #fffbf5; padding: 45px 35px; border-radius: 20px; color: #4a4a4a; }
              .rp-theme-warm .rp-h1 { color: #c46d3d; padding: 20px 25px; background: #fff; border-radius: 15px; box-shadow: 0 2px 10px rgba(196,109,61,0.1); }
              .rp-theme-warm .rp-h2 { color: #c46d3d; }
              .rp-theme-warm .main-title { font-size: 32px; font-weight: 800; color: #c46d3d; padding: 20px 25px; background: #fff; border-radius: 15px; box-shadow: 0 2px 10px rgba(196,109,61,0.1); }
              .rp-theme-warm .rp-h3, .rp-theme-warm h3:not([class]) { border-left-color: #c46d3d; color: #c46d3d; }
              .rp-theme-warm .rp-p, .rp-theme-warm p:not([class]) { color: #4a4a4a; }

              /* ── professional ── */
              .rp-theme-professional { max-width: 880px; background: #f7f9fb; padding: 50px 40px; border-top: 4px solid #787fff; color: #3a3a3a; }
              .rp-theme-professional .rp-h1 { color: #0066cc; padding: 20px 25px; background: #fff; border-left: 6px solid #787fff; border-radius: 8px; }
              .rp-theme-professional .rp-h2 { color: #0066cc; }
              .rp-theme-professional .main-title { font-size: 32px; font-weight: 800; color: #0066cc; padding: 20px 25px; background: #fff; border-left: 6px solid #787fff; border-radius: 8px; }
              .rp-theme-professional .rp-p { background: #fff; padding: 20px; border-radius: 8px; color: #3a3a3a; }
            `}</style>
            <article
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className={`rp-preview rp-theme-${cssTheme} max-w-none outline-none`}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName === 'IMG' && onImageRegenerate) {
                  const idx = target.getAttribute('data-image-index');
                  if (idx) {
                    e.preventDefault();
                    onImageRegenerate(Number(idx));
                  }
                }
              }}
            />
            {/* 이미지 재생성 오버레이는 useEffect로 해당 이미지 위에 표시 */}
          </div>
        )}
      </div>
    </div>
  );
}
