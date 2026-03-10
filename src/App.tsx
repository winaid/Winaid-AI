import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { supabase, signOut } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';
import { useCardNewsWorkflow } from './hooks/useCardNewsWorkflow';
import { useContentGeneration } from './hooks/useContentGeneration';

// Lazy load heavy components
const InputForm = lazy(() => import('./components/InputForm'));
const ResultPreview = lazy(() => import('./components/ResultPreview'));
const ScriptPreview = lazy(() => import('./components/ScriptPreview'));
const PromptPreview = lazy(() => import('./components/PromptPreview'));
const AdminPage = lazy(() => import('./components/AdminPage'));
const AuthPage = lazy(() => import('./components/AuthPage').then(module => ({ default: module.AuthPage })));
const ApiKeySettings = lazy(() => import('./components/ApiKeySettings'));
const PasswordLogin = lazy(() => import('./components/PasswordLogin'));
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

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin') return 'admin';
    if (hash === 'auth' || hash === 'login' || hash === 'register') return 'auth';
    if (hash === 'app') return 'home';
    if (contentPages.includes(hash as PageType)) return hash as PageType;
    return 'landing';
  });
  const [apiKeyReady, setApiKeyReady] = useState<boolean>(false);
  
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
  type ContentTabType = 'blog' | 'refine' | 'card_news' | 'press' | 'image' | 'history';
  const contentTab: ContentTabType = contentPages.includes(currentPage) ? (currentPage as ContentTabType) : 'blog';
  const isAppPage = appPages.includes(currentPage);

  // 페이지 전환 (탭 전환 대신 페이지 전환)
  const setContentTab = (tab: ContentTabType) => {
    window.location.hash = tab;
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


  // API 키 설정 모달 상태
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showUserManual, setShowUserManual] = useState(false);
  
  // 비밀번호 인증 상태 - 임시로 항상 true (로그인 비활성화)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  

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


  // Supabase 인증 상태 감시
  useEffect(() => {
    // 관리자 인증 상태 확인 (localStorage)
    const adminAuth = localStorage.getItem('ADMIN_AUTHENTICATED');
    if (adminAuth === 'true') {
      setIsAdmin(true);
    }
    

    
    // OAuth 콜백 처리 (URL hash에 access_token이 있는 경우)
    const handleOAuthCallback = async () => {
      const hash = window.location.hash;
      console.log('[OAuth Callback] Current hash:', hash);
      
      // OAuth 토큰이 URL에 있는지 확인
      if (hash && (hash.includes('access_token') || hash.includes('error'))) {
        console.log('[OAuth Callback] Detected OAuth callback in URL');
        
        // Supabase가 자동으로 세션을 설정할 때까지 대기
        // getSession()이 토큰을 파싱하고 세션을 생성함
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[OAuth Callback] Error getting session:', error);
          // 에러 시 hash 정리 후 auth 페이지로
          window.location.hash = 'auth';
          return null;
        }
        
        if (session?.user) {
          console.log('[OAuth Callback] Session established:', session.user.email);
          // 성공 - hash를 정리하고 blog으로
          window.history.replaceState(null, '', window.location.pathname + '#blog');
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
      
      console.log('[Session Check] Session result:', session?.user?.email);
      
      if (session?.user) {
        console.log('[Session Check] User found, setting isLoggedIn to true');
        setSupabaseUser(session.user);
        setIsLoggedIn(true);
        // 프로필 정보 설정
        setUserProfile({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자'
        });
        
        // 세션이 있고 현재 auth 페이지면 홈으로 이동
        const currentHash = window.location.hash;
        if (currentHash === '#auth') {
          window.location.hash = 'app';
          setCurrentPage('home');
        }
        // #app은 이미 home이므로 유지
        // 해시가 비어있으면(landing) → 그대로 유지
      }
      setAuthLoading(false);
    };
    
    checkSession();

    console.log('[Auth] Initial auth check started');
    
    // 인증 상태 변경 감시
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth Event]', event, session?.user?.email);
      
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
              
              console.log('✅ 프로필 자동 생성 완료:', session.user.email);
            }
          } catch (e) {
            console.error('프로필 확인/생성 실패 (무시):', e);
          }
        }
        
        // 로그인 성공 시 처리
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('[Auth Event] Login success');
          // 🔧 authLoading을 false로 설정 (로딩 화면 해제)
          setAuthLoading(false);
          
          const currentHash = window.location.hash;
          
          // OAuth 토큰이 URL에 있는 경우에만 홈으로 리다이렉트
          if (currentHash.includes('access_token') || currentHash.includes('refresh_token')) {
            window.history.replaceState(null, '', window.location.pathname + '#app');
            window.location.hash = 'app';
            setCurrentPage('home');
          }
          // auth 페이지에서 로그인한 경우 홈으로 이동
          else if (currentHash === '#auth' || currentHash === '#login' || currentHash === '#register') {
            window.location.hash = 'app';
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

  // URL hash 기반 라우팅
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');

      let newPage: PageType;
      if (hash === 'admin') newPage = 'admin';
      else if (hash === 'auth' || hash === 'login' || hash === 'register') newPage = 'auth';
      else if (hash === 'app') newPage = 'home';
      else if (contentPages.includes(hash as PageType)) newPage = hash as PageType;
      else return; // 해시 없음 = 현재 페이지 유지

      setCurrentPage(prevPage => {
        if (prevPage !== newPage) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return newPage;
      });
    };

    // 해시가 있을 때만 초기 실행 (landing 보호)
    if (window.location.hash && window.location.hash !== '#') {
      handleHashChange();
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 페이지 네비게이션 헬퍼
  const handleNavigate = (page: PageType) => {
    window.location.hash = page;
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
      
      window.location.hash = 'auth';
      setCurrentPage('auth');
      
      // 페이지 새로고침으로 완전 초기화
      window.location.reload();
    }
  };

  // 서버에서 API 키 로드 및 localStorage 동기화
  useEffect(() => {
    const loadApiKeys = async () => {
      try {
        // 항상 서버에서 최신 API 키를 가져옴
        const { getApiKeys } = await import('./services/apiService');
        const apiKeys = await getApiKeys();
        
        if (apiKeys.gemini) {
          localStorage.setItem('GEMINI_API_KEY', apiKeys.gemini);
          setApiKeyReady(true);
          console.log('✅ 서버에서 Gemini API 키 로드 완료');
        } else {
          // 서버에 없으면 localStorage 확인
          const localGemini = localStorage.getItem('GEMINI_API_KEY');
          if (localGemini) {
            setApiKeyReady(true);
            console.log('✅ localStorage에서 API 키 사용');
          } else {
            console.log('⚠️ API 키 없음 - 설정 필요');
          }
        }
        
        if (apiKeys.openai) {
          localStorage.setItem('OPENAI_API_KEY', apiKeys.openai);
          console.log('✅ OpenAI API 키 로드 완료');
        }
      } catch (error) {
        console.error('❌ API 키 로드 실패:', error);
        // 에러 시에도 localStorage 체크
        const localGemini = localStorage.getItem('GEMINI_API_KEY');
        if (localGemini) {
          setApiKeyReady(true);
          console.log('✅ 로컬 백업 키 사용');
        }
      }
    };
    
    loadApiKeys();
  }, [currentPage]);

  // 랜딩 페이지 (모든 체크 전에 먼저 표시)
  if (currentPage === 'landing') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <LandingPage
          onStart={() => {
            if (isAuthenticated) {
              window.location.hash = 'app';
              setCurrentPage('home');
            } else {
              window.location.hash = 'auth';
              setCurrentPage('auth');
            }
          }}
          darkMode={darkMode}
        />
      </Suspense>
    );
  }

  // 로딩 중 (admin/pricing 페이지는 로딩 화면 없이 바로 표시)
  // app 페이지는 로딩 중에도 UI 표시 (apiKeyReady 체크에서 처리)
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

  // API Key 미설정 시 안내 화면
  if (!apiKeyReady) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white p-12 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-slate-100 relative overflow-hidden">
          <div className="text-6xl mb-6">🛠️</div>
          <h1 className="text-2xl font-black mb-3 text-slate-900">WINAID</h1>
          <h2 className="text-lg font-bold text-amber-600 mb-6">서비스 준비 중</h2>
          <p className="text-slate-500 mb-8 font-medium">서비스가 곧 오픈될 예정입니다.<br/>잠시만 기다려주세요!</p>
          <a
            href="#"
            className="block w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-100 hover:shadow-2xl transition-all active:scale-95"
          >
             🏠 홈으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  // 메인 앱 렌더링
  // 비밀번호 인증 화면 표시
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <PasswordLogin onSuccess={() => setIsAuthenticated(true)} />
      </Suspense>
    );
  }

  return (
    <div className={`min-h-screen flex font-sans relative transition-colors duration-300 ${darkMode ? 'bg-[#0f1117] text-slate-100' : 'bg-[#f6f7f9] text-slate-900'}`}>

      {/* 좌측 사이드바 네비게이션 */}
      <aside className={`hidden lg:flex flex-col flex-none h-screen sticky top-0 z-30 transition-all duration-300 border-r ${
        sidebarCollapsed ? 'w-[68px]' : 'w-[210px]'
      } ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-[1px_0_0_0_rgba(0,0,0,0.04)]'}`}>
        {/* 로고 */}
        <div className={`h-14 flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} border-b ${darkMode ? 'border-[#30363d]' : 'border-slate-100'}`}>
          <a href="#app" onClick={(e) => { e.preventDefault(); window.location.hash = 'app'; setCurrentPage('home'); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
            <img src="/280_logo.png" alt="WINAID" className={`h-8 w-8 group-hover:scale-105 transition-transform flex-none ${darkMode ? 'rounded-md bg-white p-0.5' : ''}`} />
            {!sidebarCollapsed && (
              <div className="flex flex-col leading-none">
                <span className={`font-black text-base tracking-[-0.02em] ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>WIN<span className="text-blue-600">AID</span></span>
                <span className={`text-[8px] font-semibold tracking-wider uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>AI Marketing</span>
              </div>
            )}
          </a>
        </div>

        {/* 네비게이션 메뉴 */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          <div className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${sidebarCollapsed ? 'text-center' : ''} ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {sidebarCollapsed ? '···' : '콘텐츠'}
          </div>
          {([
            { id: 'blog' as ContentTabType, label: '블로그', icon: '📝' },
            { id: 'card_news' as ContentTabType, label: '카드뉴스', icon: '🎨' },
            { id: 'press' as ContentTabType, label: '언론보도', icon: '🗞️' },
          ]).map(item => (
            <button
              key={item.id}
              onClick={() => setContentTab(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } ${
                contentTab === item.id && currentPage !== 'home'
                  ? darkMode ? 'bg-blue-500/20 text-blue-400 font-bold' : 'bg-blue-50 text-blue-700 font-bold'
                  : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2128]' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span className="text-base flex-none">{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}

          <div className={`px-2 py-1.5 mt-4 text-[10px] font-bold uppercase tracking-wider ${sidebarCollapsed ? 'text-center' : ''} ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {sidebarCollapsed ? '···' : '도구'}
          </div>
          {([
            { id: 'refine' as ContentTabType, label: 'AI 보정', icon: '✨' },
            { id: 'image' as ContentTabType, label: '이미지 생성', icon: '🖼️' },
            { id: 'history' as ContentTabType, label: '히스토리', icon: '🕐' },
          ]).map(item => (
            <button
              key={item.id}
              onClick={() => setContentTab(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } ${
                contentTab === item.id && currentPage !== 'home'
                  ? darkMode ? 'bg-blue-500/20 text-blue-400 font-bold' : 'bg-blue-50 text-blue-700 font-bold'
                  : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2128]' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span className="text-base flex-none">{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* 하단: 사이드바 접기/펼치기 + 다크모드 + 유저 */}
        <div className={`border-t py-3 px-2 space-y-1 ${darkMode ? 'border-[#30363d]' : 'border-slate-100'}`}>
          {/* 다크모드 토글 */}
          <button
            onClick={toggleDarkMode}
            title={darkMode ? '라이트 모드' : '다크 모드'}
            className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
              sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/80'}`}
          >
            <span className="text-base flex-none">{darkMode ? '☀️' : '🌙'}</span>
            {!sidebarCollapsed && <span>{darkMode ? '라이트 모드' : '다크 모드'}</span>}
          </button>

          {/* 유저 메뉴 */}
          {isLoggedIn && supabaseUser && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                title={supabaseUser.email || '사용자'}
                className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
                  sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                } ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/80'}`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-none ${darkMode ? 'bg-slate-700 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  {(supabaseUser.email || 'U')[0].toUpperCase()}
                </span>
                {!sidebarCollapsed && <span className="truncate text-xs">{supabaseUser.email}</span>}
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className={`absolute left-full bottom-0 ml-2 w-48 rounded-xl shadow-lg border z-50 overflow-hidden ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'}`}>
                    <button
                      onClick={() => { setShowUserMenu(false); handleLogout(); }}
                      className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${darkMode ? 'text-red-400 hover:bg-slate-700' : 'text-red-500 hover:bg-red-50'}`}
                    >
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 사이드바 접기/펼치기 */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
              sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/80'}`}
          >
            <svg className={`w-4 h-4 flex-none transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>사이드바 접기</span>}
          </button>
        </div>
      </aside>

      {/* 모바일 상단 헤더 (lg 미만에서만 표시) */}
      <div className="flex flex-col flex-1 min-w-0">
      <header className={`lg:hidden backdrop-blur-2xl border-b sticky top-0 z-30 flex-none transition-all duration-300 ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/80 border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}>
        <div className="h-14 w-full px-5 flex justify-between items-center">
          <a href="#app" onClick={(e) => { e.preventDefault(); window.location.hash = 'app'; setCurrentPage('home'); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
            <img src="/280_logo.png" alt="WINAID" className={`h-8 w-8 group-hover:scale-105 transition-transform ${darkMode ? 'rounded-md bg-white p-0.5' : ''}`} />
            <div className="flex flex-col leading-none">
              <span className={`font-black text-base tracking-[-0.02em] ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>WIN<span className="text-blue-600">AID</span></span>
              <span className={`text-[8px] font-semibold tracking-wider uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>AI Marketing</span>
            </div>
          </a>
          <div className="flex items-center gap-3">
             {isLoggedIn && supabaseUser && (
               <button
                 onClick={() => setShowUserMenu(!showUserMenu)}
                 className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${darkMode ? 'bg-slate-700 text-blue-400 hover:bg-slate-600' : 'bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-600 hover:from-blue-100 hover:to-blue-200/80 border border-blue-100/80 shadow-sm'}`}
                 title={supabaseUser.email || '사용자'}
               >
                 {(supabaseUser.email || 'U')[0].toUpperCase()}
               </button>
             )}
          </div>
        </div>
        {/* 모바일 네비 탭 */}
        {currentPage !== 'home' && (
        <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100/80'}`}>
          <nav className="w-full px-3 flex items-center gap-1 overflow-x-auto custom-scrollbar scroll-smooth" role="tablist" aria-label="콘텐츠 유형 탭">
            {([
              { id: 'blog' as ContentTabType, label: '블로그', icon: '📝' },
              { id: 'card_news' as ContentTabType, label: '카드뉴스', icon: '🎨' },
              { id: 'press' as ContentTabType, label: '언론보도', icon: '🗞️' },
              { id: 'refine' as ContentTabType, label: 'AI 보정', icon: '✨' },
              { id: 'image' as ContentTabType, label: '이미지 생성', icon: '🖼️' },
              { id: 'history' as ContentTabType, label: '히스토리', icon: '🕐' },
            ]).map(item => (
              <button
                key={item.id}
                onClick={() => setContentTab(item.id)}
                className={`relative py-3 px-3 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  contentTab === item.id
                    ? darkMode ? 'text-blue-400' : 'text-blue-600'
                    : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className="text-sm">{item.icon}</span>
                  {item.label}
                </span>
                {contentTab === item.id && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
        )}
      </header>

      {/* 메인 콘텐츠 */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="w-full px-5 lg:px-8 py-6">

        {/* 홈 대시보드 (#app) */}
        {currentPage === 'home' ? (
          <div className="max-w-4xl mx-auto pt-8 pb-16 px-2">

            {/* 히어로 - 중앙 집중형 */}
            <div className="text-center mb-12">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold mb-5 ${darkMode ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                AI 엔진 가동 중
              </div>
              <h1 className={`text-3xl md:text-4xl font-black mb-3 tracking-tight ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                오늘 어떤 콘텐츠를 만들까요?
              </h1>
              <p className={`text-base ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                병원 마케팅 콘텐츠를 AI로 빠르게 생성하세요
              </p>
            </div>

            {/* 콘텐츠 타입 선택 - 큰 카드 3개 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {([
                {
                  id: 'blog' as ContentTabType,
                  title: '블로그',
                  desc: '네이버 스마트블록 최적화',
                  icon: '📝',
                  gradient: darkMode ? 'from-blue-500/10 to-blue-600/5' : 'from-blue-50 to-white',
                  border: darkMode ? 'border-blue-500/20 hover:border-blue-400/50' : 'border-blue-100 hover:border-blue-300',
                  badge: 'bg-blue-100 text-blue-600',
                  cta: darkMode ? 'text-blue-400' : 'text-blue-600',
                  tags: ['SEO 최적화', '의료법 검증', 'AI 이미지'],
                },
                {
                  id: 'card_news' as ContentTabType,
                  title: '카드뉴스',
                  desc: 'SNS 이미지 슬라이드 자동 제작',
                  icon: '🎨',
                  gradient: darkMode ? 'from-pink-500/10 to-pink-600/5' : 'from-pink-50 to-white',
                  border: darkMode ? 'border-pink-500/20 hover:border-pink-400/50' : 'border-pink-100 hover:border-pink-300',
                  badge: 'bg-pink-100 text-pink-600',
                  cta: darkMode ? 'text-pink-400' : 'text-pink-600',
                  tags: ['디자인 템플릿', '슬라이드 구성', '이미지 생성'],
                },
                {
                  id: 'press' as ContentTabType,
                  title: '보도자료',
                  desc: '언론 배포용 전문 보도자료',
                  icon: '🗞️',
                  gradient: darkMode ? 'from-amber-500/10 to-amber-600/5' : 'from-amber-50 to-white',
                  border: darkMode ? 'border-amber-500/20 hover:border-amber-400/50' : 'border-amber-100 hover:border-amber-300',
                  badge: 'bg-amber-100 text-amber-600',
                  cta: darkMode ? 'text-amber-400' : 'text-amber-600',
                  tags: ['보도자료 포맷', '전문 어조', '병원 정보 연동'],
                },
              ]).map(item => (
                <button
                  key={item.id}
                  onClick={() => setContentTab(item.id)}
                  className={`text-left rounded-2xl border p-6 bg-gradient-to-br transition-all duration-200 group hover:shadow-lg hover:-translate-y-0.5 ${item.gradient} ${item.border} ${darkMode ? '' : 'shadow-sm'}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${darkMode ? 'bg-white/5' : 'bg-white shadow-sm border border-white'}`}>
                    {item.icon}
                  </div>
                  <h3 className={`text-base font-black mb-1 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</h3>
                  <p className={`text-xs mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {item.tags.map((tag, i) => (
                      <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${darkMode ? 'bg-white/10 text-slate-400' : item.badge}`}>{tag}</span>
                    ))}
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold ${item.cta}`}>
                    시작하기
                    <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            {/* 도구 - 가로 줄 */}
            <div className={`rounded-2xl border p-1 flex gap-1 mb-6 ${darkMode ? 'bg-[#161b22] border-[#2d3a4f]' : 'bg-slate-100/80 border-slate-200'}`}>
              {([
                { id: 'refine' as ContentTabType, title: 'AI 보정', icon: '✨', desc: '기존 글 다듬기' },
                { id: 'image' as ContentTabType, title: '이미지 생성', icon: '🖼️', desc: 'AI 이미지 제작' },
                { id: 'history' as ContentTabType, title: '히스토리', icon: '🕐', desc: '생성 내역 조회' },
              ]).map(item => (
                <button
                  key={item.id}
                  onClick={() => setContentTab(item.id)}
                  className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-sm font-semibold transition-all group ${
                    darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.title}</span>
                  <span className={`hidden sm:inline text-[11px] font-normal ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>— {item.desc}</span>
                </button>
              ))}
            </div>

            {/* 하단 가이드 - 미니멀 */}
            <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-[#161b22] border-[#2d3a4f]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-bold tracking-wide uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>사용 방법</span>
                <button
                  onClick={() => setShowUserManual(true)}
                  className={`text-xs font-semibold transition-colors ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500 hover:text-blue-600'}`}
                >
                  전체 설명서 →
                </button>
              </div>
              <div className="flex items-start gap-0">
                {([
                  { step: '01', title: '유형 선택', desc: '블로그·카드뉴스·보도자료' },
                  { step: '02', title: '키워드 입력', desc: '주제와 타겟 키워드' },
                  { step: '03', title: 'AI 생성', desc: '자동 최적화 콘텐츠' },
                  { step: '04', title: '검수 · 배포', desc: '의료법 검증 후 사용' },
                ]).map((tip, i, arr) => (
                  <div key={i} className="flex-1 flex items-start gap-2 relative">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>{i + 1}</div>
                      {i < arr.length - 1 && <div className={`w-px flex-1 mt-1 h-4 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />}
                    </div>
                    <div className="pb-1 min-w-0">
                      <div className={`text-[11px] font-bold mb-0.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{tip.title}</div>
                      <div className={`text-[10px] leading-snug ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{tip.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
                <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <ImageGenerator />
                  </Suspense>
                </div>
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
        <div className={`transition-all duration-500 ease-in-out ${
          hasGenerated
            ? 'flex flex-col lg:flex-row gap-5 lg:items-start'
            : 'flex justify-center'
        }`}>
          {/* 입력 폼 */}
          <div className={`transition-all duration-500 ease-in-out ${
            hasGenerated
              ? 'w-full lg:w-[340px] xl:w-[360px] lg:flex-none'
              : 'w-full max-w-[600px]'
          }`}>
            <Suspense fallback={<FormSkeleton />}>
              <InputForm
                onSubmit={(req) => { setHasGenerated(true); handleGenerate(req); }}
                isLoading={state.isLoading || isGeneratingScript}
                onTabChange={setContentTab}
                activePostType={contentTab === 'press' ? 'press_release' : contentTab === 'card_news' ? 'card_news' : contentTab === 'blog' ? 'blog' : undefined}
              />
            </Suspense>
          </div>

          {/* 결과 영역 - 생성 후에만 표시 */}
          {hasGenerated && <div className="flex flex-col min-h-[480px] lg:flex-1 min-w-0">
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
            <Suspense fallback={<ContentSkeleton />}>
              <ResultPreview content={getCurrentState().data!} darkMode={darkMode} />
            </Suspense>
          ) : (
            <div className={`rounded-xl border flex flex-col items-center justify-center p-16 text-center transition-all duration-300 flex-1 min-h-[480px] ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-sm'}`}>
               <div className="flex flex-col items-center">
                 <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-5 ${darkMode ? 'bg-[#0f1117]' : 'bg-slate-50 border border-slate-200'}`}>
                   <svg className={`w-9 h-9 ${darkMode ? 'text-slate-500' : 'text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                     <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                   </svg>
                 </div>
                 <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>AI 콘텐츠 생성</h3>
                 <p className={`text-sm font-medium leading-relaxed mb-5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>왼쪽에서 키워드를 입력하고<br/>생성 버튼을 눌러보세요</p>
                 <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-blue-50/80 text-blue-500 border border-blue-100/50'}`}>
                   <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                   AI 대기 중
                 </div>
               </div>
            </div>
          )}
          </div>}
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

      {/* API 키 설정 모달 */}
      {showApiKeyModal && (
        <Suspense fallback={<LoadingSpinner />}>
          <ApiKeySettings onClose={() => setShowApiKeyModal(false)} />
        </Suspense>
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
