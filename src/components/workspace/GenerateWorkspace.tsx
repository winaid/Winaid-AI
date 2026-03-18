import React, { lazy, Suspense } from 'react';
import type { GenerationRequest, GenerationState } from '../../types';

const InputForm = lazy(() => import('../InputForm'));
const ResultPreview = lazy(() => import('../ResultPreview'));
const ScriptPreview = lazy(() => import('../ScriptPreview'));
const PromptPreview = lazy(() => import('../PromptPreview'));

const FormSkeleton = () => (
  <div className="p-5 space-y-4 animate-pulse">
    <div className="h-3 w-24 rounded-md bg-slate-200 animate-pulse" />
    <div className="h-10 w-full rounded-xl bg-slate-200" />
    <div className="h-3 w-20 rounded-md bg-slate-200 animate-pulse" />
    <div className="h-10 w-full rounded-xl bg-slate-200" />
    <div className="h-3 w-28 rounded-md bg-slate-200 animate-pulse" />
    <div className="h-24 w-full rounded-xl bg-slate-200" />
    <div className="h-11 w-full rounded-xl bg-slate-200" />
  </div>
);

const ContentSkeleton = () => (
  <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-10 shadow-[0_4px_24px_rgba(0,0,0,0.06)] animate-pulse">
    <div className="space-y-4">
      <div className="h-3 w-3/4 rounded-md bg-slate-200 animate-pulse" />
      <div className="h-3 w-full rounded-md bg-slate-200 animate-pulse" />
      <div className="h-3 w-full rounded-md bg-slate-200 animate-pulse" />
      <div className="h-3 w-1/2 rounded-md bg-slate-200 animate-pulse" />
      <div className="h-40 w-full rounded-xl bg-slate-200 mt-4" />
      <div className="h-3 w-full rounded-md bg-slate-200 animate-pulse" />
      <div className="h-3 w-2/3 rounded-md bg-slate-200 animate-pulse" />
    </div>
  </div>
);

interface GenerateWorkspaceProps {
  darkMode: boolean;
  contentTab: string;
  isLoading: boolean;
  isGeneratingScript: boolean;
  scriptProgress: string;
  currentState: GenerationState;
  cardNewsPrompts: any[] | null;
  cardNewsScript: any | null;
  pendingRequest: GenerationRequest | null;
  onSubmit: (req: GenerationRequest) => void;
  onTabChange: (tab: string) => void;
  onApprovePrompts: () => void;
  onBackToScript: () => void;
  onEditPrompts: (prompts: any[]) => void;
  onApproveScript: () => void;
  onRegenerateScript: () => void;
  onEditScript: (script: any) => void;
}

export function GenerateWorkspace({
  darkMode,
  contentTab,
  isLoading,
  isGeneratingScript,
  scriptProgress,
  currentState,
  cardNewsPrompts,
  cardNewsScript,
  pendingRequest,
  onSubmit,
  onTabChange,
  onApprovePrompts,
  onBackToScript,
  onEditPrompts,
  onApproveScript,
  onRegenerateScript,
  onEditScript,
}: GenerateWorkspaceProps) {
  const activePostType = contentTab === 'press' ? 'press_release' : contentTab === 'card_news' ? 'card_news' : contentTab === 'blog' ? 'blog' : undefined;

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
      {/* 입력 폼 */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <Suspense fallback={<FormSkeleton />}>
          <InputForm
            onSubmit={onSubmit}
            isLoading={isLoading || isGeneratingScript}
            onTabChange={onTabChange}
            activePostType={activePostType}
          />
        </Suspense>
      </div>

      {/* 결과 영역 */}
      <div className="flex flex-col min-h-[480px] lg:flex-1 min-w-0">
        {cardNewsPrompts && cardNewsPrompts.length > 0 ? (
          <Suspense fallback={<ContentSkeleton />}>
            <PromptPreview
              prompts={cardNewsPrompts}
              onApprove={onApprovePrompts}
              onBack={onBackToScript}
              onEditPrompts={onEditPrompts}
              isLoading={isGeneratingScript}
              progress={scriptProgress}
              darkMode={darkMode}
            />
          </Suspense>
        ) : cardNewsScript ? (
          <Suspense fallback={<ContentSkeleton />}>
            <ScriptPreview
              script={cardNewsScript}
              onApprove={onApproveScript}
              onRegenerate={onRegenerateScript}
              onEditScript={onEditScript}
              isLoading={isGeneratingScript}
              progress={scriptProgress}
              darkMode={darkMode}
              topic={pendingRequest?.topic}
              category={pendingRequest?.category}
            />
          </Suspense>
        ) : (isLoading || isGeneratingScript) ? (
          <LoadingView
            darkMode={darkMode}
            progress={currentState.progress || scriptProgress}
            postType={pendingRequest?.postType}
          />
        ) : currentState.data ? (
          <>
            {currentState.warning && (
              <div className={`rounded-xl border px-4 py-3 mb-3 flex items-center gap-3 text-sm font-medium ${darkMode ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <span>⚠️</span>
                <span>{currentState.warning}</span>
              </div>
            )}
            <Suspense fallback={<ContentSkeleton />}>
              <ResultPreview content={currentState.data} darkMode={darkMode} />
            </Suspense>
          </>
        ) : (
          <EmptyState darkMode={darkMode} />
        )}
      </div>
    </div>
  );
}

/** 생성 중 로딩 스피너 */
function LoadingView({ darkMode, progress, postType }: { darkMode: boolean; progress: string; postType?: string }) {
  return (
    <div className={`rounded-xl border p-16 flex flex-col items-center justify-center text-center transition-colors duration-300 flex-1 min-h-[480px] ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className="relative mb-8">
        <div className={`w-16 h-16 border-[3px] border-t-blue-500 rounded-full animate-spin ${darkMode ? 'border-slate-700' : 'border-blue-100'}`}></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-blue-50'}`}>
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </div>
        </div>
      </div>
      <h2 className={`text-lg font-bold mb-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{progress}</h2>
      <p className={`max-w-xs text-sm font-medium text-center ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
        {postType === 'card_news'
          ? '카드뉴스 원고를 생성하고 있습니다...'
          : postType === 'press_release'
          ? '언론 보도자료를 작성하고 있습니다...'
          : <>네이버 스마트블록 노출을 위한 최적의<br/>의료 콘텐츠를 생성하고 있습니다.</>}
      </p>
    </div>
  );
}

/** 초기 빈 상태 — 에디터 스타일 */
function EmptyState({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border flex-1 min-h-[520px] overflow-hidden flex flex-col transition-all duration-300 ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-[0_2px_16px_rgba(0,0,0,0.06)]'}`}>
      {/* 에디터 툴바 */}
      <div className={`flex items-center gap-1 px-4 py-2.5 border-b ${darkMode ? 'border-[#30363d] bg-[#1c2128]' : 'border-slate-100 bg-slate-50/80'}`}>
        {['B', 'I', 'U'].map(t => (
          <div key={t} className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>{t}</div>
        ))}
        <div className={`w-px h-4 mx-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
        {[1,2,3].map(i => (
          <div key={i} className={`w-7 h-7 rounded flex items-center justify-center ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>
            <div className="space-y-[3px]">{Array.from({length: i === 1 ? 3 : i === 2 ? 2 : 1}).map((_,j) => <div key={j} className={`h-0.5 rounded ${darkMode ? 'bg-slate-600' : 'bg-slate-300'}`} style={{width: j === 0 ? '14px' : j === 1 ? '10px' : '12px'}} />)}</div>
          </div>
        ))}
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${darkMode ? 'bg-[#21262d]' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100'}`}>
          <svg className={`w-7 h-7 ${darkMode ? 'text-slate-500' : 'text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>

        <div className="max-w-sm text-center">
          <h2 className={`text-3xl font-black tracking-tight leading-tight mb-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            AI가 작성하는<br/>
            <span className={`${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>의료 콘텐츠</span>
          </h2>
          <p className={`text-sm leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            키워드 하나로 SEO 최적화된<br/>블로그·카드뉴스·보도자료를 자동 생성합니다
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          {[
            { icon: '✦', text: '병원 말투 학습 기반 생성' },
            { icon: '✦', text: 'SEO 키워드 자동 최적화' },
            { icon: '✦', text: '의료광고법 준수 검토' },
          ].map(item => (
            <div key={item.text} className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`text-[10px] ${darkMode ? 'text-blue-500' : 'text-blue-400'}`}>{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>

        <div className={`mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${darkMode ? 'bg-[#21262d] text-slate-500 border border-[#30363d]' : 'bg-blue-50 text-blue-500 border border-blue-100'}`}>
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
          AI 대기 중
        </div>
      </div>
    </div>
  );
}
