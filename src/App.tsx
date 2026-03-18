declare const __BUILD_HASH__: string;
declare const __GEMINI_PROXY_URL__: string;
import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { supabase, signOut } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';
import { useCardNewsWorkflow } from './hooks/useCardNewsWorkflow';
import { useContentGeneration } from './hooks/useContentGeneration';
import { initImageDebugGlobals } from './services/image/imageOrchestrator';
import { Sidebar } from './components/layout/Sidebar';
import { MobileHeader } from './components/layout/MobileHeader';
import { HomeDashboard } from './components/HomeDashboard';
import type { ContentTabType } from './components/layout/Sidebar';

// Lazy load heavy components
const InputForm = lazy(() => import('./components/InputForm'));
const ResultPreview = lazy(() => import('./components/ResultPreview'));
const ScriptPreview = lazy(() => import('./components/ScriptPreview'));
const PromptPreview = lazy(() => import('./components/PromptPreview'));
const AdminPage = lazy(() => import('./components/AdminPage'));
const AuthPage = lazy(() => import('./components/AuthPage').then(module => ({ default: module.AuthPage })));
// PasswordLogin 제거됨 — 비밀번호 인증 비활성화
const ContentRefiner = lazy(() => import('./components/ContentRefiner'));
const MedicalLawSearch = lazy(() => import('./components/MedicalLawSearch').then(module => ({ default: module.MedicalLawSearch })));
const ImageGenerator = lazy(() => import('./components/ImageGenerator'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const PostHistory = lazy(() => import('./components/PostHistory'));
const UserManual = lazy(() => import('./components/UserManual'));

type PageType = 'landing' | 'home' | 'blog' | 'card_news' | 'press' | 'refine' | 'image' | 'history' | 'admin' | 'auth';
const contentPages: PageType[] = ['blog', 'card_news', 'press', 'refine', 'image', 'history'];
const appPages: PageType[] = ['home', ...contentPages];

// 스켈레톤 로딩 컴포넌트들
const SkeletonLine = ({ w = 'w-full' }: { w?: string }) => (
  <div className={`h-3 ${w} rounded-md bg-slate-200 animate-pulse`} />
);

const LoadingSpinner = ({ size = 'w-10 h-10' }: { size?: string }) => (
  <div className="flex items-center justify-center py-20">
    <div className={`${size} border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin`} />
  </div>
);

const PageSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      <div className="text-sm font-medium text-slate-400">로딩 중...</div>
    </div>
  </div>
);

const FormSkeleton = () => (
  <div className="p-5 space-y-4 animate-pulse">
    <SkeletonLine w="w-24" />
    <div className="h-10 w-full rounded-xl bg-slate-200" />
    <SkeletonLine w="w-20" />
    <div className="h-10 w-full rounded-xl bg-slate-200" />
    <SkeletonLine w="w-28" />
    <div className="h-24 w-full rounded-xl bg-slate-200" />
    <div className="h-11 w-full rounded-xl bg-slate-200" />
  </div>
);

const ContentSkeleton = () => (
  <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-10 shadow-[0_4px_24px_rgba(0,0,0,0.06)] animate-pulse">
    <div className="space-y-4">
      <SkeletonLine w="w-3/4" />
      <SkeletonLine />
      <SkeletonLine />
      <SkeletonLine w="w-1/2" />
      <div className="h-40 w-full rounded-xl bg-slate-200 mt-4" />
      <SkeletonLine />
      <SkeletonLine w="w-2/3" />
    </div>
  </div>
);

const PanelSkeleton = () => (
  <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 animate-pulse">
    <div className="space-y-4">
      <SkeletonLine w="w-40" />
      <div className="h-32 w-full rounded-xl bg-slate-200" />
      <SkeletonLine w="w-2/3" />
      <SkeletonLine w="w-1/2" />
    </div>
  </div>
);

// 사용자 정보 타입
interface UserProfile {
  id: string;
  email: string;
  name: string;
}

// HTML 태그 제거 헬퍼 함수
const stripHtml = (html: string) => {
  if (typeof document === 'undefined') return html;
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

// ── Path 기반 라우팅 헬퍼 ──
const getPageFromPath = (): PageType => {
  // 1) OAuth 콜백: 해시에 access_token이 있으면 일단 landing (후속 OAuth 핸들러가 처리)
  const hash = window.location.hash;
  if (hash && (hash.includes('access_token') || hash.includes('error'))) {
    return 'landing';
  }

  // 2) 기존 해시 URL 호환 → path로 리다이렉트
  if (hash && hash !== '#') {
    const hashPage = hash.replace('#', '');
    const targetPath = hashPage === 'app' ? '/app' : `/${hashPage}`;
    window.history.replaceState(null, '', targetPath);
    if (hashPage === 'admin') return 'admin';
    if (hashPage === 'auth' || hashPage === 'login' || hashPage === 'register') return 'auth';
    if (hashPage === 'app') return 'home';
    if (contentPages.includes(hashPage as PageType)) return hashPage as PageType;
    return 'landing';
  }

  // 3) path 기반 판별
  const path = window.location.pathname.replace(/^\//, '');
  if (path === 'admin') return 'admin';
  if (path === 'auth' || path === 'login' || path === 'register') return 'auth';
  if (path === 'app') return 'home';
  if (contentPages.includes(path as PageType)) return path as PageType;
  return 'landing';
};

const navigateTo = (page: string) => {
  const targetPath = page === 'home' ? '/app' : `/${page}`;
  window.history.pushState(null, '', targetPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>(getPageFromPath);
  
  // Supabase 인증 상태
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [_userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [_isAdmin, setIsAdmin] = useState<boolean>(false); // 관리자 여부

  const [mobileTab, setMobileTab] = useState<'input' | 'result'>('input');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  
  // 스크롤 위치 저장 ref
  const scrollPositionRef = useRef<number>(0);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  
  // contentTab은 이제 currentPage에서 파생 (호환성 유지)
  const contentTab: ContentTabType = contentPages.includes(currentPage) ? (currentPage as ContentTabType) : 'blog';
  const isAppPage = appPages.includes(currentPage);

  // 페이지 전환 (탭 전환 대신 페이지 전환)
  const setContentTab = (tab: ContentTabType) => {
    navigateTo(tab);
    setCurrentPage(tab as PageType);
  };

  // 카드뉴스 3단계 워크플로우 (커스텀 훅)
  const {
    cardNewsScript, cardNewsPrompts, pendingRequest,
    scriptProgress, isGeneratingScript,
    handleGenerateCardNews, handleRegenerateScript,
    handleApproveScript, handleApprovePrompts,
    handleEditPrompts, handleBackToScript, handleEditScript,
  } = useCardNewsWorkflow();

  // 콘텐츠 생성 상태 관리 (커스텀 훅)
  const {
    state, setState, getCurrentState, getCurrentSetState, handleGenerate,
  } = useContentGeneration({
    contentTab,
    setContentTab,
    setMobileTab,
    leftPanelRef,
    scrollPositionRef,
    handleGenerateCardNews,
  });


  const [showUserManual, setShowUserManual] = useState(false);
  // quickInput → HomeDashboard 내부 상태로 이동

  // 비밀번호 인증 제거됨 — 항상 인증된 상태
  const [isAuthenticated] = useState<boolean>(true);
  

  // 다크모드 상태
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved === 'true';
    }
    return false;
  });

  // Genspark 스타일: 생성 시작 후 센터→좌우 분리 레이아웃 전환
  const [hasGenerated, setHasGenerated] = useState(false);
  
  // 다크모드 토글
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
  };
  
  // IMG 디버그 글로벌 등록 (콘솔에서 window.__IMG_VERIFY 등 즉시 사용 가능)
  useEffect(() => { initImageDebugGlobals(); }, []);

  // 스크롤 위치 복원 (탭 전환 후)
  useEffect(() => {
    if (mobileTab === 'input' && leftPanelRef.current && scrollPositionRef.current > 0) {
      // 약간의 딜레이 후 스크롤 복원 (DOM 렌더링 대기)
      const timer = setTimeout(() => {
        if (leftPanelRef.current) {
          leftPanelRef.current.scrollTop = scrollPositionRef.current;
          console.log('📍 복원된 스크롤 위치:', scrollPositionRef.current);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mobileTab]);

  // 📊 렌더 게이트 로그 — 상태 변경 시 어떤 뷰가 보이는지 추적
  // hasAttemptedGeneration: 한 번이라도 생성 시도했으면 true (EMPTY_STATE 구분용)
  const hasAttemptedGenerationRef = React.useRef(false);
  useEffect(() => {
    const cs = getCurrentState();
    if (cs.isLoading) hasAttemptedGenerationRef.current = true;
    const renderView = cs.isLoading ? 'LOADING_SPINNER' : cs.data ? 'RESULT_PREVIEW' : cs.error ? 'ERROR_MODAL' : 'EMPTY_STATE';
    const logMsg = `[RENDER_GATE] contentTab=${contentTab} | isLoading=${cs.isLoading} | hasData=${!!cs.data} | hasError=${!!cs.error} | progress="${(cs.progress || '').substring(0, 30)}" → ${renderView}`;
    switch (renderView) {
      case 'LOADING_SPINNER':
        console.info(`⏳ ${logMsg}`);
        break;
      case 'RESULT_PREVIEW':
        console.info(`✅ ${logMsg}`);
        break;
      case 'ERROR_MODAL':
        console.warn(`❌ ${logMsg}`);
        break;
      case 'EMPTY_STATE':
      default:
        if (hasAttemptedGenerationRef.current) {
          console.warn(`⚠️ ${logMsg} (생성 시도 후 빈 상태 — input 복귀 확인)`);
        } else {
          console.info(`ℹ️ ${logMsg} (초기 상태)`);
        }
        break;
    }
  }, [getCurrentState, contentTab]);

  // Supabase 인증 상태 감시
  useEffect(() => {
    // 관리자 인증 상태 확인 (sessionStorage)
    const adminAuth = sessionStorage.getItem('ADMIN_AUTHENTICATED');
    if (adminAuth === 'true') {
      setIsAdmin(true);
    }
    

    
    // OAuth 콜백 처리 (URL hash에 access_token이 있는 경우)
    const handleOAuthCallback = async () => {
      const hash = window.location.hash;
      console.info('[OAuth Callback] Current hash:', hash);
      
      // OAuth 토큰이 URL에 있는지 확인
      if (hash && (hash.includes('access_token') || hash.includes('error'))) {
        console.info('[OAuth Callback] Detected OAuth callback in URL');
        
        // Supabase가 자동으로 세션을 설정할 때까지 대기
        // getSession()이 토큰을 파싱하고 세션을 생성함
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[OAuth Callback] Error getting session:', error);
          // 에러 시 auth 페이지로
          window.history.replaceState(null, '', '/auth');
          return null;
        }

        if (session?.user) {
          console.info('[OAuth Callback] Session established:', session.user.email);
          // 성공 - URL 정리 후 blog으로
          window.history.replaceState(null, '', '/blog');
          return session;
        }
      }
      return null;
    };
    
    // 현재 세션 확인
    const checkSession = async () => {
      // 먼저 OAuth 콜백인지 확인
      const oauthSession = await handleOAuthCallback();
      
      // OAuth 세션이 있으면 그걸 사용, 아니면 기존 세션 확인
      let session;
      if (oauthSession) {
        session = oauthSession;
      } else {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }
      
      console.info('[Session Check] Session result:', session?.user?.email);
      
      if (session?.user) {
        console.info('[Session Check] User found, setting isLoggedIn to true');
        setSupabaseUser(session.user);
        setIsLoggedIn(true);
        // 프로필 정보 설정
        setUserProfile({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자'
        });
        
        // 세션이 있고 현재 auth 페이지면 홈으로 이동
        const currentPath = window.location.pathname;
        if (currentPath === '/auth') {
          navigateTo('home');
          setCurrentPage('home');
        }
        // #app은 이미 home이므로 유지
        // 해시가 비어있으면(landing) → 그대로 유지
      }
      setAuthLoading(false);
    };
    
    checkSession();

    console.info('[Auth] Initial auth check started');
    
    // 인증 상태 변경 감시
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('[Auth Event]', event, session?.user?.email);
      
      if (session?.user) {
        setSupabaseUser(session.user);
        setIsLoggedIn(true);
        // 프로필 정보 설정
        setUserProfile({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자'
        });
        
        // 🔧 로그인/OAuth 성공 시 profiles 없으면 자동 생성
        if (event === 'SIGNED_IN') {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', session.user.id)
              .single();
            
            if (!profile) {
              await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                full_name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자',
                avatar_url: session.user.user_metadata?.avatar_url || null,
                created_at: new Date().toISOString()
              } as any, { onConflict: 'id' });
              
              await supabase.from('subscriptions').upsert({
                user_id: session.user.id,
                plan_type: 'free',
                credits_total: 3,
                credits_used: 0,
                expires_at: null
              } as any, { onConflict: 'user_id' });
              
              console.info('✅ 프로필 자동 생성 완료:', session.user.email);
            }
          } catch (e) {
            console.error('프로필 확인/생성 실패 (무시):', e);
          }
        }
        
        // 로그인 성공 시 처리
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.info('[Auth Event] Login success');
          // 🔧 authLoading을 false로 설정 (로딩 화면 해제)
          setAuthLoading(false);
          
          const currentHash = window.location.hash;
          const currentPath = window.location.pathname;

          // OAuth 토큰이 URL에 있는 경우에만 홈으로 리다이렉트
          if (currentHash.includes('access_token') || currentHash.includes('refresh_token')) {
            window.history.replaceState(null, '', '/app');
            setCurrentPage('home');
          }
          // auth 페이지에서 로그인한 경우 홈으로 이동
          else if (currentPath === '/auth' || currentPath === '/login' || currentPath === '/register') {
            navigateTo('home');
            setCurrentPage('home');
          }
          // 그 외 (admin, pricing 등)는 현재 페이지 유지
          // 페이지 전환 없이 상태만 업데이트됨
        }
      } else {
        setSupabaseUser(null);
        setUserProfile(null);
        setIsLoggedIn(false);
        // 🔧 로그아웃 시에도 authLoading 해제
        setAuthLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // URL path 기반 라우팅 (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const newPage = getPageFromPath();
      setCurrentPage(prevPage => {
        if (prevPage !== newPage) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return newPage;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 페이지 네비게이션 헬퍼
  const handleNavigate = (page: PageType) => {
    navigateTo(page);
    setCurrentPage(page);
  };

  // 사용자 메뉴 드롭다운 상태
  const [showUserMenu, setShowUserMenu] = useState(false);

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('로그아웃 에러 (무시하고 강제 로그아웃 진행):', error);
    } finally {
      // 🔴 강제 로그아웃: 에러가 나더라도 로컬 세션은 무조건 삭제
      setSupabaseUser(null);
      setUserProfile(null);
      setIsLoggedIn(false);
      
      // 로컬스토리지 완전 초기화
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-hospitalai-auth-token');
      
      // 세션 스토리지도 초기화
      sessionStorage.clear();
      
      window.history.replaceState(null, '', '/auth');
      setCurrentPage('auth');

      // 페이지 새로고침으로 완전 초기화
      window.location.reload();
    }
  };


  // 랜딩 페이지 (모든 체크 전에 먼저 표시)
  if (currentPage === 'landing') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <LandingPage
          onStart={() => {
            navigateTo('home');
            setCurrentPage('home');
          }}
          darkMode={darkMode}
        />
      </Suspense>
    );
  }

  // 로딩 중 (admin/pricing 페이지는 로딩 화면 없이 바로 표시)
  if (authLoading && currentPage !== 'admin' && (currentPage as string) !== 'pricing' && !appPages.includes(currentPage)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  // Auth 페이지 렌더링
  if (currentPage === 'auth') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <AuthPage onNavigate={handleNavigate} />
      </Suspense>
    );
  }



  // Admin 페이지 렌더링
  if (currentPage === 'admin') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <AdminPage onAdminVerified={() => setIsAdmin(true)} />
      </Suspense>
    );
  }

  // 메인 앱 렌더링
  return (
    <div className={`min-h-screen flex font-sans relative transition-colors duration-300 ${darkMode ? 'bg-[#0f1117] text-slate-100' : 'bg-[#f6f7f9] text-slate-900'}`}>

      {/* 좌측 사이드바 네비게이션 */}
      <Sidebar
        darkMode={darkMode}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onToggleDarkMode={toggleDarkMode}
        contentTab={contentTab}
        currentPage={currentPage}
        onSelectTab={setContentTab}
        onNavigateHome={() => { navigateTo('home'); setCurrentPage('home'); }}
        isLoggedIn={isLoggedIn}
        userEmail={supabaseUser?.email || undefined}
        onLogout={handleLogout}
      />

      {/* 모바일 상단 헤더 + 메인 콘텐츠 */}
      <div className="flex flex-col flex-1 min-w-0">
      <MobileHeader
        darkMode={darkMode}
        currentPage={currentPage}
        contentTab={contentTab}
        onSelectTab={setContentTab}
        onNavigateHome={() => { navigateTo('home'); setCurrentPage('home'); }}
        isLoggedIn={isLoggedIn}
        userEmail={supabaseUser?.email || undefined}
        showUserMenu={showUserMenu}
        onToggleUserMenu={() => setShowUserMenu(!showUserMenu)}
      />

      {/* 메인 콘텐츠 */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="w-full px-5 lg:px-8 py-6">

        {/* 홈 대시보드 */}
        {currentPage === 'home' ? (
          <HomeDashboard
            darkMode={darkMode}
            onSelectTab={setContentTab}
            onSetTopic={(topic) => setState(prev => ({ ...prev, blog: { ...prev.blog, topic } }))}
            onShowUserManual={() => setShowUserManual(true)}
          />
        ) :

        /* 전체 화면 페이지들: 유사도, AI보정, 이미지, 히스토리 */
        contentTab === 'refine' || contentTab === 'image' || contentTab === 'history' ? (
          <div className="w-full">
              {contentTab === 'history' ? (
                <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <PostHistory
                      onClose={() => setContentTab('blog')}
                      darkMode={darkMode}
                    />
                  </Suspense>
                </div>
              ) : contentTab === 'image' ? (
                <Suspense fallback={<PanelSkeleton />}>
                  <ImageGenerator />
                </Suspense>
              ) : (
                <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <ContentRefiner
                      onClose={() => setContentTab('blog')}
                      onNavigate={(tab) => setContentTab(tab)}
                      darkMode={darkMode}
                    />
                  </Suspense>
                </div>
              )}
          </div>
        ) : (
          <>
        {/* 블로그/카드뉴스/언론보도 - Genspark 센터→분리 레이아웃 */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          {/* 입력 폼 */}
          <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
            <Suspense fallback={<FormSkeleton />}>
              <InputForm
                onSubmit={(req) => { setHasGenerated(true); handleGenerate(req); }}
                isLoading={getCurrentState().isLoading || state.isLoading || isGeneratingScript}
                onTabChange={setContentTab}
                activePostType={contentTab === 'press' ? 'press_release' : contentTab === 'card_news' ? 'card_news' : contentTab === 'blog' ? 'blog' : undefined}
              />
            </Suspense>
          </div>

          {/* 결과 영역 - 항상 표시 */}
          <div className="flex flex-col min-h-[480px] lg:flex-1 min-w-0">
          {cardNewsPrompts && cardNewsPrompts.length > 0 ? (
            <Suspense fallback={<ContentSkeleton />}>
              <PromptPreview
                prompts={cardNewsPrompts}
                onApprove={() => handleApprovePrompts(getCurrentSetState())}
                onBack={handleBackToScript}
                onEditPrompts={handleEditPrompts}
                isLoading={isGeneratingScript}
                progress={scriptProgress}
                darkMode={darkMode}
              />
            </Suspense>
          ) : cardNewsScript ? (
            <Suspense fallback={<ContentSkeleton />}>
              <ScriptPreview
                script={cardNewsScript}
                onApprove={handleApproveScript}
                onRegenerate={handleRegenerateScript}
                onEditScript={handleEditScript}
                isLoading={isGeneratingScript}
                progress={scriptProgress}
                darkMode={darkMode}
                topic={pendingRequest?.topic}
                category={pendingRequest?.category}
              />
            </Suspense>
          ) : (getCurrentState().isLoading || isGeneratingScript) ? (
            <div className={`rounded-xl border p-16 flex flex-col items-center justify-center text-center transition-colors duration-300 flex-1 min-h-[480px] ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="relative mb-8">
                <div className={`w-16 h-16 border-[3px] border-t-blue-500 rounded-full animate-spin ${darkMode ? 'border-slate-700' : 'border-blue-100'}`}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-blue-50'}`}>
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                  </div>
                </div>
              </div>
              <h2 className={`text-lg font-bold mb-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{getCurrentState().progress || scriptProgress}</h2>
              <p className={`max-w-xs text-sm font-medium text-center ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                {pendingRequest?.postType === 'card_news'
                  ? '카드뉴스 원고를 생성하고 있습니다...'
                  : pendingRequest?.postType === 'press_release'
                  ? '언론 보도자료를 작성하고 있습니다...'
                  : <>네이버 스마트블록 노출을 위한 최적의<br/>의료 콘텐츠를 생성하고 있습니다.</>}
              </p>
            </div>
          ) : getCurrentState().data ? (
            <>
              {getCurrentState().warning && (
                <div className={`rounded-xl border px-4 py-3 mb-3 flex items-center gap-3 text-sm font-medium ${darkMode ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  <span>⚠️</span>
                  <span>{getCurrentState().warning}</span>
                </div>
              )}
              <Suspense fallback={<ContentSkeleton />}>
                <ResultPreview content={getCurrentState().data!} darkMode={darkMode} />
              </Suspense>
            </>
          ) : (
            /* 빈 상태 — 문서 에디터 스타일 */
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
                {/* 아이콘 */}
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${darkMode ? 'bg-[#21262d]' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100'}`}>
                  <svg className={`w-7 h-7 ${darkMode ? 'text-slate-500' : 'text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>

                {/* 대형 타이포그래피 */}
                <div className="max-w-sm text-center">
                  <h2 className={`text-3xl font-black tracking-tight leading-tight mb-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    AI가 작성하는<br/>
                    <span className={`${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>의료 콘텐츠</span>
                  </h2>
                  <p className={`text-sm leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    키워드 하나로 SEO 최적화된<br/>블로그·카드뉴스·보도자료를 자동 생성합니다
                  </p>
                </div>

                {/* 기능 힌트 */}
                <div className={`mt-8 flex flex-col items-center gap-2`}>
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
          )}
          </div>
        </div>
          </>
        )}

        </div>
      </main>
      </div>{/* end flex-col flex-1 wrapper */}

      {/* API 에러 모달 */}
      {(getCurrentState().error || state.error) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="오류 알림">
          <div className={`rounded-2xl p-8 max-w-md w-full shadow-[0_20px_60px_rgba(0,0,0,0.15)] ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-black flex items-center gap-2 ${
                (getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('limit')
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`}>
                {(getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('limit')
                  ? '⚠️ API 사용량 한도 초과'
                  : (getCurrentState().error || state.error || '').includes('네트워크') || (getCurrentState().error || state.error || '').includes('인터넷')
                  ? '📡 네트워크 오류'
                  : '❌ 오류 발생'}
              </h3>
              <button
                onClick={() => {
                  // 🛡️ EMPTY_STATE 방지: error를 지우기 전에 data가 없으면 input 탭으로 복귀
                  if (!getCurrentState().data) {
                    setMobileTab('input');
                  }
                  getCurrentSetState()(prev => ({ ...prev, error: null }));
                  setState(prev => ({ ...prev, error: null }));
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  darkMode ? 'bg-slate-700 text-slate-400 hover:bg-slate-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                ✕
              </button>
            </div>
            
            <div className={`rounded-xl p-4 mb-6 ${
              (getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('limit')
                ? darkMode ? 'bg-amber-900/30 border border-amber-700' : 'bg-amber-50 border border-amber-200'
                : darkMode ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm font-medium mb-3 ${
                (getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('limit')
                  ? darkMode ? 'text-amber-300' : 'text-amber-700'
                  : darkMode ? 'text-red-300' : 'text-red-700'
              }`}>
                {getCurrentState().error || state.error}
              </p>
              
              {((getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('limit')) && (
                <div className={`text-xs space-y-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                  <p>• Gemini API 일일 사용량 한도에 도달했습니다.</p>
                  <p>• 보통 1-2시간 후 다시 사용 가능합니다.</p>
                  <p>• 급하시면 잠시 후 다시 시도해주세요.</p>
                </div>
              )}
              
              {((getCurrentState().error || state.error || '').includes('네트워크') || (getCurrentState().error || state.error || '').includes('인터넷')) && (
                <div className={`text-xs space-y-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                  <p>• 인터넷 연결을 확인해주세요.</p>
                  <p>• VPN을 사용 중이라면 끄고 다시 시도해주세요.</p>
                </div>
              )}
            </div>
            {/* 디버깅 정보 (개발자용) */}
            <div className={`rounded-lg px-3 py-2 mb-4 text-[10px] font-mono break-all ${darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>
              <p>build: {typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'}</p>
              <p>proxy: {typeof __GEMINI_PROXY_URL__ !== 'undefined' && __GEMINI_PROXY_URL__ ? __GEMINI_PROXY_URL__.substring(0, 50) : 'NOT SET'}</p>
              <p>tab: {contentTab} | mobile: {mobileTab}</p>
            </div>
            
            <div className="flex gap-3">
              {pendingRequest && !((getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('API 키')) && (
                <button
                  onClick={() => {
                    getCurrentSetState()(prev => ({ ...prev, error: null }));
                    setState(prev => ({ ...prev, error: null }));
                    handleGenerate(pendingRequest);
                  }}
                  className="flex-1 px-4 py-3 font-bold rounded-xl transition-all bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  다시 시도
                </button>
              )}
              <button
                onClick={() => {
                  // 🛡️ EMPTY_STATE 방지: error를 지우기 전에 data가 없으면 input 탭으로 복귀
                  if (!getCurrentState().data) {
                    setMobileTab('input');
                  }
                  getCurrentSetState()(prev => ({ ...prev, error: null }));
                  setState(prev => ({ ...prev, error: null }));
                }}
                className={`${pendingRequest && !((getCurrentState().error || state.error || '').includes('API 사용량') || (getCurrentState().error || state.error || '').includes('quota') || (getCurrentState().error || state.error || '').includes('API 키')) ? 'flex-1' : 'w-full'} px-4 py-3 font-bold rounded-xl transition-all ${
                  darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 의료광고법 검색 플로팅 버튼 */}
      <Suspense fallback={null}>
        <MedicalLawSearch />
      </Suspense>

      {/* 사용 설명서 모달 */}
      {showUserManual && (
        <Suspense fallback={null}>
          <UserManual onClose={() => setShowUserManual(false)} darkMode={darkMode} />
        </Suspense>
      )}

      {/* 토스트 알림 */}
      <ToastContainer />
    </div>
  );
};

// ErrorBoundary로 전체 앱 래핑
const AppWithErrorBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithErrorBoundary;
