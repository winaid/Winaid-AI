declare const __BUILD_HASH__: string;
declare const __GEMINI_PROXY_URL__: string;
import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';
import { useCardNewsWorkflow } from './hooks/useCardNewsWorkflow';
import { useContentGeneration } from './hooks/useContentGeneration';
import { initImageDebugGlobals } from './services/image/imageOrchestrator';
import { Sidebar } from './components/layout/Sidebar';
import { MobileHeader } from './components/layout/MobileHeader';
import { HomeDashboard } from './components/HomeDashboard';
import { ToolWorkspace } from './components/workspace/ToolWorkspace';
import { GenerateWorkspace } from './components/workspace/GenerateWorkspace';
import type { ContentTabType } from './components/layout/Sidebar';
import { useAuth } from './hooks/useAuth';
import { useRouting, navigateTo, contentPages, appPages, type PageType } from './hooks/useRouting';

const AdminPage = lazy(() => import('./components/AdminPage'));
const AuthPage = lazy(() => import('./components/AuthPage').then(module => ({ default: module.AuthPage })));
const MedicalLawSearch = lazy(() => import('./components/MedicalLawSearch').then(module => ({ default: module.MedicalLawSearch })));
const LandingPage = lazy(() => import('./components/LandingPage'));
const UserManual = lazy(() => import('./components/UserManual'));
const MaintenancePage = lazy(() => import('./components/MaintenancePage'));

const IS_MAINTENANCE = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

const PageSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      <div className="text-sm font-medium text-slate-400">로딩 중...</div>
    </div>
  </div>
);

const App: React.FC = () => {
  // ── 라우팅 ──
  const { currentPage, setCurrentPage, handleNavigate } = useRouting();

  // ── 인증 ──
  const { supabaseUser, isLoggedIn, authLoading, isAdmin, handleLogout } = useAuth((page) => {
    navigateTo(page);
    setCurrentPage(page as PageType);
  });

  // ── UI 상태 ──
  const [mobileTab, setMobileTab] = useState<'input' | 'result'>('input');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserManual, setShowUserManual] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const scrollPositionRef = useRef<number>(0);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // contentTab은 currentPage에서 파생
  const contentTab: ContentTabType = contentPages.includes(currentPage) ? (currentPage as ContentTabType) : 'blog';

  const setContentTab = (tab: ContentTabType) => {
    navigateTo(tab);
    setCurrentPage(tab as PageType);
  };

  // ── 다크모드 ──
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('darkMode') === 'true';
    return false;
  });
  const toggleDarkMode = () => { const v = !darkMode; setDarkMode(v); localStorage.setItem('darkMode', String(v)); };

  // ── 콘텐츠 생성 훅 ──
  const {
    cardNewsScript, cardNewsPrompts, pendingRequest,
    scriptProgress, isGeneratingScript,
    handleGenerateCardNews, handleRegenerateScript,
    handleApproveScript, handleApprovePrompts,
    handleEditPrompts, handleBackToScript, handleEditScript,
  } = useCardNewsWorkflow();

  const {
    state, setState, getCurrentState, getCurrentSetState, handleGenerate,
  } = useContentGeneration({
    contentTab, setContentTab, setMobileTab, leftPanelRef, scrollPositionRef, handleGenerateCardNews,
  });

  // ── 초기화 ──
  useEffect(() => { initImageDebugGlobals(); }, []);

  // 스크롤 위치 복원
  useEffect(() => {
    if (mobileTab === 'input' && leftPanelRef.current && scrollPositionRef.current > 0) {
      const timer = setTimeout(() => {
        if (leftPanelRef.current) leftPanelRef.current.scrollTop = scrollPositionRef.current;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mobileTab]);

  // ── 페이지 분기 렌더링 ──

  // 점검 모드
  if (IS_MAINTENANCE) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <MaintenancePage darkMode={darkMode} />
      </Suspense>
    );
  }

  // 랜딩
  if (currentPage === 'landing') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <LandingPage onStart={() => handleNavigate('home')} darkMode={darkMode} />
      </Suspense>
    );
  }

  // 인증 로딩
  if (authLoading && currentPage !== 'admin' && (currentPage as string) !== 'pricing' && !appPages.includes(currentPage)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  // Auth / Admin 페이지
  if (currentPage === 'auth') return <Suspense fallback={<PageSkeleton />}><AuthPage onNavigate={handleNavigate} /></Suspense>;
  if (currentPage === 'admin') return <Suspense fallback={<PageSkeleton />}><AdminPage onAdminVerified={() => {}} /></Suspense>;

  // ── 메인 앱 렌더링 ──
  const errorText = getCurrentState().error || state.error || '';
  const isQuotaError = errorText.includes('API 사용량') || errorText.includes('quota') || errorText.includes('limit');
  const isNetworkError = errorText.includes('네트워크') || errorText.includes('인터넷');

  return (
    <div className={`min-h-screen flex font-sans relative transition-colors duration-300 ${darkMode ? 'bg-[#0f1117] text-slate-100' : 'bg-[#f6f7f9] text-slate-900'}`}>

      <Sidebar
        darkMode={darkMode}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onToggleDarkMode={toggleDarkMode}
        contentTab={contentTab}
        currentPage={currentPage}
        onSelectTab={setContentTab}
        onNavigateHome={() => handleNavigate('home')}
        isLoggedIn={isLoggedIn}
        userEmail={supabaseUser?.email || undefined}
        onLogout={handleLogout}
      />

      <div className="flex flex-col flex-1 min-w-0">
      <MobileHeader
        darkMode={darkMode}
        currentPage={currentPage}
        contentTab={contentTab}
        onSelectTab={setContentTab}
        onNavigateHome={() => handleNavigate('home')}
        isLoggedIn={isLoggedIn}
        userEmail={supabaseUser?.email || undefined}
        showUserMenu={showUserMenu}
        onToggleUserMenu={() => setShowUserMenu(!showUserMenu)}
      />

      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="w-full px-5 lg:px-8 py-6">

        {currentPage === 'home' ? (
          <HomeDashboard
            darkMode={darkMode}
            onSelectTab={setContentTab}
            onSetTopic={(topic) => setState(prev => ({ ...prev, blog: { ...(prev as any).blog, topic } }))}
            onShowUserManual={() => setShowUserManual(true)}
          />
        ) :
        contentTab === 'refine' || contentTab === 'image' || contentTab === 'history' ? (
          <ToolWorkspace contentTab={contentTab} darkMode={darkMode} onClose={() => setContentTab('blog')} onNavigate={(tab) => setContentTab(tab)} />
        ) : (
          <GenerateWorkspace
            darkMode={darkMode}
            contentTab={contentTab}
            isLoading={getCurrentState().isLoading || state.isLoading}
            isGeneratingScript={isGeneratingScript}
            scriptProgress={scriptProgress}
            currentState={getCurrentState()}
            cardNewsPrompts={cardNewsPrompts}
            cardNewsScript={cardNewsScript}
            pendingRequest={pendingRequest}
            onSubmit={(req) => { setHasGenerated(true); handleGenerate(req); }}
            onTabChange={setContentTab as any}
            onApprovePrompts={() => handleApprovePrompts(getCurrentSetState())}
            onBackToScript={handleBackToScript}
            onEditPrompts={handleEditPrompts}
            onApproveScript={handleApproveScript as any}
            onRegenerateScript={handleRegenerateScript as any}
            onEditScript={handleEditScript}
          />
        )}

        </div>
      </main>
      </div>

      {/* 에러 모달 */}
      {errorText && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="오류 알림">
          <div className={`rounded-2xl p-8 max-w-md w-full shadow-[0_20px_60px_rgba(0,0,0,0.15)] ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-black flex items-center gap-2 ${isQuotaError ? 'text-amber-600' : 'text-red-600'}`}>
                {isQuotaError ? '⚠️ API 사용량 한도 초과' : isNetworkError ? '📡 네트워크 오류' : '❌ 오류 발생'}
              </h3>
              <button
                onClick={() => {
                  if (!getCurrentState().data) setMobileTab('input');
                  getCurrentSetState()(prev => ({ ...prev, error: null }));
                  setState(prev => ({ ...prev, error: null }));
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${darkMode ? 'bg-slate-700 text-slate-400 hover:bg-slate-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >✕</button>
            </div>

            <div className={`rounded-xl p-4 mb-6 ${isQuotaError ? (darkMode ? 'bg-amber-900/30 border border-amber-700' : 'bg-amber-50 border border-amber-200') : (darkMode ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200')}`}>
              <p className={`text-sm font-medium mb-3 ${isQuotaError ? (darkMode ? 'text-amber-300' : 'text-amber-700') : (darkMode ? 'text-red-300' : 'text-red-700')}`}>
                {errorText}
              </p>
              {isQuotaError && (
                <div className={`text-xs space-y-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                  <p>• Gemini API 일일 사용량 한도에 도달했습니다.</p>
                  <p>• 보통 1-2시간 후 다시 사용 가능합니다.</p>
                </div>
              )}
              {isNetworkError && (
                <div className={`text-xs space-y-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                  <p>• 인터넷 연결을 확인해주세요.</p>
                  <p>• VPN을 사용 중이라면 끄고 다시 시도해주세요.</p>
                </div>
              )}
            </div>

            <div className={`rounded-lg px-3 py-2 mb-4 text-[10px] font-mono break-all ${darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>
              <p>build: {typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'}</p>
              <p>proxy: {typeof __GEMINI_PROXY_URL__ !== 'undefined' && __GEMINI_PROXY_URL__ ? __GEMINI_PROXY_URL__.substring(0, 50) : 'NOT SET'}</p>
              <p>tab: {contentTab} | mobile: {mobileTab}</p>
            </div>

            <div className="flex gap-3">
              {pendingRequest && !isQuotaError && !errorText.includes('API 키') && (
                <button
                  onClick={() => {
                    getCurrentSetState()(prev => ({ ...prev, error: null }));
                    setState(prev => ({ ...prev, error: null }));
                    handleGenerate(pendingRequest);
                  }}
                  className="flex-1 px-4 py-3 font-bold rounded-xl transition-all bg-emerald-500 hover:bg-emerald-600 text-white"
                >다시 시도</button>
              )}
              <button
                onClick={() => {
                  if (!getCurrentState().data) setMobileTab('input');
                  getCurrentSetState()(prev => ({ ...prev, error: null }));
                  setState(prev => ({ ...prev, error: null }));
                }}
                className={`${pendingRequest && !isQuotaError && !errorText.includes('API 키') ? 'flex-1' : 'w-full'} px-4 py-3 font-bold rounded-xl transition-all ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
              >닫기</button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}><MedicalLawSearch /></Suspense>

      {showUserManual && (
        <Suspense fallback={null}>
          <UserManual onClose={() => setShowUserManual(false)} darkMode={darkMode} />
        </Suspense>
      )}

      <ToastContainer />
    </div>
  );
};

const AppWithErrorBoundary: React.FC = () => (
  <ErrorBoundary><App /></ErrorBoundary>
);

export default AppWithErrorBoundary;
