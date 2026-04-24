'use client';

import { useState, useEffect } from 'react';
import { BLOG_STAGES, BLOG_MESSAGE_POOL } from './blogConstants';
import { ErrorPanel, ResultPanel, type ScoreBarData } from '../../../components/GenerationResult';
import ContentAnalysisPanel from '../../../components/ContentAnalysisPanel';
import SeoDetailPanel from '../../../components/SeoDetailPanel';
import type { BlogSection, CssTheme, SeoReport } from '../../../lib/types';

export interface BlogResultAreaProps {
  // 진행 상태
  isGenerating: boolean;
  displayStage: number;
  rotationIdx: number;
  generationStartTime: number;
  estimatedTotalSeconds: number;
  stageInfo?: { name: string; completed?: number; total?: number } | null;
  // 에러
  error: string | null;
  onDismissError: () => void;
  isRetryable?: boolean;
  onRetry?: () => void;
  // 결과
  generatedContent: string | null;
  saveStatus: string | null;
  scores?: ScoreBarData;
  cssTheme: CssTheme;
  // 섹션
  blogSections: BlogSection[];
  regeneratingSection: number | null;
  sectionProgress: string;
  onSectionRegenerate: (idx: number) => void;
  // 다운로드
  onDownloadWord: () => void;
  onDownloadPDF: () => void;
  // 이미지
  onImageRegenerate: (imageIndex: number) => void;
  regeneratingImage: number | null;
  // SEO 상세 리포트
  seoReport?: SeoReport | null;
  isSeoLoading?: boolean;
  // 빈 상태
  topic: string;
  // 인라인 채팅 수정
  chatInput?: string;
  setChatInput?: (v: string) => void;
  isChatRefining?: boolean;
  onChatRefine?: () => void;
  // contentEditable 편집 → 부모 state 동기화
  onContentChange?: (html: string) => void;
  // 단락 hover [+] 버튼 / placeholder 클릭 → 이미지 삽입 모달
  onRequestImageInsert?: (target: HTMLElement, mode: 'after' | 'replace') => void;
}

/** 블로그 결과 영역 — 생성 중 / 에러 / 결과 / 빈 상태 4가지 렌더링 */
export default function BlogResultArea({
  isGenerating, displayStage, rotationIdx, generationStartTime, estimatedTotalSeconds,
  stageInfo = null,
  error, onDismissError, isRetryable, onRetry,
  generatedContent, saveStatus, scores, cssTheme,
  blogSections, regeneratingSection, sectionProgress,
  onSectionRegenerate, onDownloadWord, onDownloadPDF,
  onImageRegenerate, regeneratingImage,
  seoReport, isSeoLoading,
  topic,
  chatInput = '', setChatInput, isChatRefining = false, onChatRefine,
  onContentChange,
  onRequestImageInsert,
}: BlogResultAreaProps) {

  // ── 카운트다운 타이머 (생성 중에만 동작) ──
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isGenerating || !generationStartTime) { setElapsedSeconds(0); return; }
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - generationStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating, generationStartTime]);

  // ── (1) 생성 중 ──
  if (isGenerating) {
    const stage = BLOG_STAGES[displayStage] || BLOG_STAGES[1];
    const pool = BLOG_MESSAGE_POOL[displayStage] || BLOG_MESSAGE_POOL[1];

    let displayMsg: string;
    let progressPct: number;

    if (stageInfo) {
      const { name, completed, total } = stageInfo;
      if (name === 'outline_start') {
        displayMsg = '글 구조를 짜고 있어요...';
        progressPct = 5;
      } else if (name === 'outline_done') {
        displayMsg = '구조 완성! 본문 작성 시작합니다...';
        progressPct = 15;
      } else if (name === 'sections_start') {
        displayMsg = '도입부와 본문을 채우고 있어요...';
        progressPct = 20;
      } else if (name === 'section_done' && total) {
        const pct = (completed ?? 0) / total;
        displayMsg = `본문 작성 중... (${completed}/${total})`;
        progressPct = 20 + pct * 60;
      } else if (name === 'section_failed' && total) {
        displayMsg = `본문 작성 중... (${completed}/${total})`;
        progressPct = 20 + ((completed ?? 0) / total) * 60;
      } else if (name === 'fallback_1pass') {
        displayMsg = '글을 작성하고 있어요...';
        progressPct = 30;
      } else {
        displayMsg = pool[rotationIdx % pool.length];
        progressPct = 50;
      }
    } else {
      displayMsg = pool[rotationIdx % pool.length];
      progressPct = estimatedTotalSeconds > 0
        ? Math.min(95, (elapsedSeconds / estimatedTotalSeconds) * 100)
        : 0;
    }

    return (
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
          {/* 상단: 현재 단계 배지 */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-blue-50 text-blue-600 border border-blue-100">
            <span>{stage.icon}</span>
            <span>{stage.label}</span>
          </div>
          {/* 중단: 스피너 */}
          <div className="relative mb-6">
            <div className="w-14 h-14 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </div>
            </div>
          </div>
          {/* 프로그레스 바 */}
          <div className="w-full max-w-xs mb-4">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          {/* 진행 메시지 */}
          <p className="text-sm font-medium text-slate-700 mb-2 min-h-[20px] transition-opacity duration-500">
            {displayMsg}
          </p>
          {/* 카운트다운 */}
          <p className="text-xs text-blue-400 mb-1">
            {(() => {
              // 1) sections 진행률 80% 이상 + elapsed > 10s 일 때만 "거의 다 됐어요!" 허용
              if (stageInfo && stageInfo.total && stageInfo.completed !== undefined) {
                const progress = stageInfo.completed / stageInfo.total;
                if (progress >= 0.8 && elapsedSeconds > 10 && stageInfo.completed > 0) {
                  const avgPerSection = elapsedSeconds / stageInfo.completed;
                  const remaining = Math.max(0, Math.round(avgPerSection * (stageInfo.total - stageInfo.completed)));
                  return remaining > 5 ? `약 ${remaining}초 남음` : '거의 다 됐어요!';
                }
                // 섹션 진행 중 (1개 이상 완료): 최소 5초 floor
                if (stageInfo.completed > 0 && elapsedSeconds > 0) {
                  const avgPerSection = elapsedSeconds / stageInfo.completed;
                  const remaining = Math.max(5, Math.round(avgPerSection * (stageInfo.total - stageInfo.completed)));
                  return `약 ${remaining}초 남음`;
                }
              }
              // 2) 초기 단계 (outline / sections_start) — estimated 기반
              const remaining = estimatedTotalSeconds - elapsedSeconds;
              if (remaining > 5) return `약 ${remaining}초 남음`;
              // estimated 초과해도 실제 진행률 낮으면 거짓 "거의 다" 억제
              return '조금만 더 기다려주세요...';
            })()}
          </p>
          <p className="text-xs text-slate-400 max-w-xs">
            {stage.hint}
          </p>
        </div>
      </div>
    );
  }

  // ── (2) 에러 ──
  if (error) {
    return (
      <div className="flex-1 min-w-0">
        <ErrorPanel error={error} onDismiss={onDismissError} onRetry={isRetryable ? onRetry : undefined} />
      </div>
    );
  }

  // ── (3) 결과 표시 ──
  if (generatedContent) {
    return (
      <div className="flex-1 min-w-0">
        <ContentAnalysisPanel html={generatedContent} keyword={topic?.split(',')[0]?.trim()} />
        {seoReport ? (
          <SeoDetailPanel report={seoReport} />
        ) : isSeoLoading ? (
          <div className="w-full mt-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-500">SEO 상세 분석 중...</span>
          </div>
        ) : null}
        <ResultPanel
          content={generatedContent}
          saveStatus={saveStatus}
          postType="blog"
          scores={scores}
          cssTheme={cssTheme}
          blogSections={blogSections}
          regeneratingSection={regeneratingSection}
          sectionProgress={sectionProgress}
          onSectionRegenerate={onSectionRegenerate}
          onDownloadWord={onDownloadWord}
          onDownloadPDF={onDownloadPDF}
          onImageRegenerate={onImageRegenerate}
          regeneratingImage={regeneratingImage}
          onContentChange={onContentChange}
          onRequestImageInsert={onRequestImageInsert}
        />

        {/* 인라인 수정 채팅 */}
        {setChatInput && onChatRefine && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-violet-600">✨ AI 수정</span>
              <span className="text-[10px] text-slate-400">생성된 글을 명령어로 바로 수정합니다</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onChatRefine(); } }}
                placeholder="예: 도입부를 더 자연스럽게 / 3번째 소제목 내용 보강 / 전체적으로 톤을 부드럽게"
                disabled={isChatRefining}
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 disabled:opacity-50"
              />
              <button
                onClick={onChatRefine}
                disabled={!chatInput.trim() || isChatRefining}
                className="px-5 py-3 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 disabled:opacity-50 flex-shrink-0 flex items-center gap-2"
              >
                {isChatRefining ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />수정 중...</>
                ) : '수정 요청'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['도입부 자연스럽게', '전체 톤 부드럽게', '결론 강화', '문장 다듬기', 'AI 느낌 제거'].map(chip => (
                <button key={chip} onClick={() => setChatInput(chip)}
                  className="px-2.5 py-1 text-[10px] font-medium rounded-lg bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                >{chip}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── (4) 빈 상태 (empty) ──
  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
          {['B', 'I', 'U'].map(t => (
            <div key={t} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-300">{t}</div>
          ))}
          <div className="w-px h-4 mx-1 bg-slate-200" />
          {[1, 2, 3].map(i => (
            <div key={i} className="w-7 h-7 rounded flex items-center justify-center text-slate-300">
              <div className="space-y-[3px]">
                {Array.from({ length: i === 1 ? 3 : i === 2 ? 2 : 1 }).map((_, j) => (
                  <div key={j} className="h-0.5 rounded bg-slate-300" style={{ width: j === 0 ? '14px' : j === 1 ? '10px' : '12px' }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
            <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="max-w-sm text-center">
            <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
              AI가 작성하는<br /><span className="text-blue-600">의료 콘텐츠</span>
            </h2>
            <p className="text-sm leading-relaxed text-slate-400">
              키워드 하나로 SEO 최적화된<br />블로그 글을 자동 생성합니다
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-2">
            {['병원 말투 학습 기반 생성', 'SEO 키워드 자동 최적화', '의료광고법 준수 검토'].map(text => (
              <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                <span className="text-[10px] text-blue-400">✦</span>
                {text}
              </div>
            ))}
          </div>
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-blue-50 text-blue-500 border border-blue-100">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            AI 대기 중
          </div>
        </div>
      </div>
    </div>
  );
}
