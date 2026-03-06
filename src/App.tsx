import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { GenerationRequest, GenerationState, CardNewsScript, CardPromptData } from './types';
import { supabase, signOut } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load heavy components
const InputForm = lazy(() => import('./components/InputForm'));
const ResultPreview = lazy(() => import('./components/ResultPreview'));
const ScriptPreview = lazy(() => import('./components/ScriptPreview'));
const PromptPreview = lazy(() => import('./components/PromptPreview'));
const AdminPage = lazy(() => import('./components/AdminPage'));
const AuthPage = lazy(() => import('./components/AuthPage').then(module => ({ default: module.AuthPage })));
const ApiKeySettings = lazy(() => import('./components/ApiKeySettings'));
const PasswordLogin = lazy(() => import('./components/PasswordLogin'));
const MedicalLawSearch = lazy(() => import('./components/MedicalLawSearch').then(module => ({ default: module.MedicalLawSearch })));
const ImageGenerator = lazy(() => import('./components/ImageGenerator'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const PostHistory = lazy(() => import('./components/PostHistory'));

type PageType = 'landing' | 'home' | 'blog' | 'card_news' | 'press' | 'image' | 'history' | 'admin' | 'auth';
const contentPages: PageType[] = ['blog', 'card_news', 'press', 'image', 'history'];
const appPages: PageType[] = ['home', ...contentPages];

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
  const [state, setState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    data: null,
    progress: '',
  });
  
  // 각 탭별 독립적인 상태 관리
  const [blogState, setBlogState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    data: null,
    progress: '',
  });
  const [pressState, setPressState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    data: null,
    progress: '',
  });
  
  // Supabase 인증 상태
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [_userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [_isAdmin, setIsAdmin] = useState<boolean>(false); // 관리자 여부

  const [mobileTab, setMobileTab] = useState<'input' | 'result'>('input');
  
  // 스크롤 위치 저장 ref
  const scrollPositionRef = useRef<number>(0);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  
  // contentTab은 이제 currentPage에서 파생 (호환성 유지)
  type ContentTabType = 'blog' | 'card_news' | 'press' | 'image' | 'history';
  const contentTab: ContentTabType = contentPages.includes(currentPage) ? (currentPage as ContentTabType) : 'blog';
  const isAppPage = appPages.includes(currentPage);

  // 페이지 전환 (탭 전환 대신 페이지 전환)
  const setContentTab = (tab: ContentTabType) => {
    window.location.hash = tab;
    setCurrentPage(tab as PageType);
  };
  
  // 현재 탭에 맞는 state 가져오기
  const getCurrentState = (): GenerationState => {
    if (contentTab === 'press') return pressState;
    if (contentTab === 'blog' || contentTab === 'card_news') return blogState;
    return state;
  };
  
  // 현재 탭에 맞는 setState 가져오기
  const getCurrentSetState = (): React.Dispatch<React.SetStateAction<GenerationState>> => {
    if (contentTab === 'press') return setPressState;
    if (contentTab === 'blog' || contentTab === 'card_news') return setBlogState;
    return setState;
  };
  
  // 카드뉴스 3단계 워크플로우 상태
  // 1단계: 원고 생성 → 2단계: 프롬프트 확인 → 3단계: 이미지 생성
  const [cardNewsScript, setCardNewsScript] = useState<CardNewsScript | null>(null);
  const [cardNewsPrompts, setCardNewsPrompts] = useState<CardPromptData[] | null>(null); // 🆕 프롬프트 확인 단계
  const [pendingRequest, setPendingRequest] = useState<GenerationRequest | null>(null);
  const [scriptProgress, setScriptProgress] = useState<string>('');
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [_currentStep, setCurrentStep] = useState<1 | 2 | 3>(1); // 🆕 현재 단계
  

  

  // API 키 설정 모달 상태
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  
  // 비밀번호 인증 상태
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  
  // 앱 시작 시 인증 확인
  useEffect(() => {
    const auth = sessionStorage.getItem('hospital_ai_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);
  

  // 다크모드 상태
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved === 'true';
    }
    return false;
  });
  
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

  const handleGenerate = async (request: GenerationRequest) => {
    // 🔒 스크롤 위치 고정 (글 생성 시 스크롤 튀는 현상 방지)
    const currentScrollY = window.scrollY || window.pageYOffset;
    const currentScrollX = window.scrollX || window.pageXOffset;
    console.log('🔒 현재 스크롤 위치 저장:', currentScrollY, currentScrollX);
    
    // 🔒 스크롤 잠금 함수 (이벤트 리스너로 완전 차단)
    const lockScroll = (e: Event) => {
      e.preventDefault();
      window.scrollTo(currentScrollX, currentScrollY);
    };
    
    // 🔒 스크롤 잠금 활성화
    document.body.style.overflow = 'hidden';
    window.addEventListener('scroll', lockScroll, { passive: false });
    
    // 🔒 100ms 후 스크롤 잠금 해제
    setTimeout(() => {
      window.removeEventListener('scroll', lockScroll);
      document.body.style.overflow = '';
      window.scrollTo(currentScrollX, currentScrollY);
      console.log('🔓 스크롤 잠금 해제');
    }, 200);
    
    // 🗑️ 새 콘텐츠 생성 시 이전 저장본 자동 삭제
    try {
      localStorage.removeItem('hospitalai_autosave');
      localStorage.removeItem('hospitalai_autosave_history');
      localStorage.removeItem('hospitalai_card_prompt_history');
      localStorage.removeItem('hospitalai_card_ref_image');
      console.log('🗑️ 로컬 저장본 삭제 완료');
      
      // 🆕 서버 저장본은 삭제하지 않음 (사용자가 이전 글을 참고할 수 있도록)
      // const deleteResult = await deleteAllContent();
      // if (deleteResult.success) {
      //   console.log('🗑️ 서버 저장본 삭제 완료!');
      // } else {
      //   console.warn('⚠️ 서버 저장본 삭제 실패:', deleteResult.error);
      // }
    } catch (e) {
      console.warn('저장본 삭제 실패:', e);
    }

    // 🔧 스크롤 위치 저장 (탭 전환 전)
    if (leftPanelRef.current) {
      scrollPositionRef.current = leftPanelRef.current.scrollTop;
      console.log('📍 저장된 스크롤 위치:', scrollPositionRef.current);
    }

    console.log('📱 모바일 탭 전환: result');
    setMobileTab('result');
    
    console.log('📋 postType 확인:', request.postType);

    // 🚨 postType이 undefined면 에러 발생시키기 (디버깅용)
    if (!request.postType) {
      console.error('❌ postType이 undefined입니다! request:', request);
      setState(prev => ({
        ...prev,
        error: '콘텐츠 타입이 선택되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.'
      }));
      return;
    }

    // 크레딧 체크 (SaaS 과금)
    try {
      const { checkCredits } = await import('./services/creditService');
      const creditStatus = await checkCredits(request.postType);
      if (!creditStatus.canGenerate) {
        setState(prev => ({
          ...prev,
          error: creditStatus.message || '크레딧이 부족합니다.',
        }));
        return;
      }
      if (creditStatus.creditsRemaining >= 0 && creditStatus.planType !== 'anonymous') {
        console.log(`💳 크레딧: ${creditStatus.creditsRemaining}/${creditStatus.creditsTotal} 남음`);
      }
    } catch (e) {
      console.warn('크레딧 체크 스킵:', e);
    }
    
    // 카드뉴스: 2단계 워크플로우 (원고 생성 → 사용자 확인 → 디자인 변환)
    if (request.postType === 'card_news') {
      console.log('🎴 카드뉴스 모드 시작');
      setContentTab('card_news'); // 카드뉴스 탭으로 이동
      setIsGeneratingScript(true);
      setCardNewsScript(null);
      setPendingRequest(request);
      setState(prev => ({ ...prev, isLoading: false, data: null, error: null }));
      
      try {
        const { generateCardNewsScript } = await import('./services/cardNewsService');
        const script = await generateCardNewsScript(request, setScriptProgress);
        setCardNewsScript(script);
        setScriptProgress('');
      } catch (err: any) {
        setScriptProgress('');
        const { getKoreanErrorMessage } = await import('./services/geminiClient');
        setState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
      } finally {
        setIsGeneratingScript(false);
      }
      return;
    }

    // 블로그/언론보도: 기존 플로우 (한 번에 생성)
    console.log('📝 블로그/보도자료 모드 시작');
    
    // 🔥 탭 자동 전환 + 언론보도는 pressState에, 블로그는 blogState에 저장
    if (request.postType === 'press_release') {
      setContentTab('press'); // 언론보도 탭으로 이동
    } else {
      setContentTab('blog'); // 블로그 탭으로 이동
    }
    
    const targetSetState = request.postType === 'press_release' ? setPressState : setBlogState;
    
    targetSetState(prev => ({ ...prev, isLoading: true, error: null, progress: 'SEO 최적화 키워드 분석 및 이미지 생성 중...' }));
    
    console.log('🚀 generateFullPost 호출 시작');
    try {
      const { generateFullPost } = await import('./services/geminiService');
      const result = await generateFullPost(request, (p) => targetSetState(prev => ({ ...prev, progress: p })));
      targetSetState({ isLoading: false, error: null, data: result, progress: '' });

      // 크레딧 차감 + 사용량 저장
      try {
        const { deductCredit, flushSessionUsage } = await import('./services/creditService');
        await deductCredit(request.postType);
        await flushSessionUsage();
      } catch (e) {
        console.warn('크레딧 차감/사용량 저장 스킵:', e);
      }

      // 🆕 API 서버에 자동 저장
      try {
        console.log('💾 API 서버에 콘텐츠 저장 중...');
        const { saveContentToServer } = await import('./services/apiService');
        const saveResult = await saveContentToServer({
          title: result.title,
          content: result.htmlContent,
          category: request.category,
          postType: request.postType,
          metadata: {
            keywords: request.keywords,
            seoScore: result.seoScore?.total,
            aiSmellScore: result.factCheck?.ai_smell_score,
          },
        });
        
        if (saveResult.success) {
          console.log('✅ 서버 저장 완료! ID:', saveResult.id);
          
        } else {
          console.warn('⚠️ 서버 저장 실패:', saveResult.error);
        }
      } catch (saveErr) {
        console.warn('⚠️ 서버 저장 중 오류 (무시하고 계속):', saveErr);
      }
    } catch (err: any) {
       const { getKoreanErrorMessage } = await import('./services/geminiClient');
       const friendlyError = getKoreanErrorMessage(err);
       targetSetState(prev => ({ ...prev, isLoading: false, error: friendlyError }));
       setMobileTab('input');
    }
  };

  // 카드뉴스 원고 재생성
  const handleRegenerateScript = async () => {
    if (!pendingRequest) return;

    setIsGeneratingScript(true);
    setCardNewsScript(null);

    try {
      const { generateCardNewsScript } = await import('./services/cardNewsService');
      const script = await generateCardNewsScript(pendingRequest, setScriptProgress);
      setCardNewsScript(script);
      setScriptProgress('');
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('./services/geminiClient');
      setState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // 🆕 카드뉴스 원고 승인 → 프롬프트 확인 단계로 이동 (2단계)
  const handleApproveScript = async () => {
    if (!cardNewsScript || !pendingRequest) return;
    
    setIsGeneratingScript(true);
    setScriptProgress('🎨 [2단계] 이미지 프롬프트 생성 중...');
    
    try {
      // 원고를 디자인으로 변환 (프롬프트만 생성, 이미지는 아직!)
      const { convertScriptToCardNews } = await import('./services/cardNewsService');
      const designResult = await convertScriptToCardNews(
        cardNewsScript, 
        pendingRequest, 
        setScriptProgress
      );
      
      // 🆕 프롬프트 저장 → 사용자에게 확인받기!
      setCardNewsPrompts(designResult.cardPrompts);
      setCurrentStep(2);
      setScriptProgress('');
      
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('./services/geminiClient');
      setState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // 🆕 프롬프트 수정
  const handleEditPrompts = (updatedPrompts: CardPromptData[]) => {
    setCardNewsPrompts(updatedPrompts);
  };
  
  // 🆕 프롬프트 승인 → 이미지 생성 (3단계)
  const handleApprovePrompts = async () => {
    if (!cardNewsPrompts || !pendingRequest || !cardNewsScript) return;
    
    setIsGeneratingScript(true);
    setScriptProgress('🖼️ [3단계] 이미지 생성 중...');
    setCurrentStep(3);
    
    try {
      const imageStyle = pendingRequest.imageStyle || 'illustration';
      const referenceImage = pendingRequest.coverStyleImage || pendingRequest.contentStyleImage;
      const copyMode = pendingRequest.styleCopyMode;
      
      // 🆕 확인된 프롬프트로 이미지 생성!
      const { generateSingleImage } = await import('./services/imageGenerationService');
      const imagePromises = cardNewsPrompts.map((promptData, i) => {
        setScriptProgress(`🖼️ 이미지 ${i + 1}/${cardNewsPrompts.length}장 생성 중...`);
        return generateSingleImage(
          promptData.imagePrompt, 
          imageStyle, 
          '1:1', 
          pendingRequest.customImagePrompt,
          referenceImage,
          copyMode
        );
      });
      
      const images = await Promise.all(imagePromises);
      
      // HTML 생성 (카드 슬라이드 형식)
      const cardSlides = images.map((imgUrl, i) => {
        if (imgUrl) {
          return `
            <div class="card-slide" style="border-radius: 24px; overflow: hidden; aspect-ratio: 1/1; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
              <img src="${imgUrl}" alt="카드 ${i + 1}" data-index="${i + 1}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>`;
        }
        return `
          <div class="card-slide" style="border-radius: 24px; overflow: hidden; aspect-ratio: 1/1; box-shadow: 0 4px 16px rgba(0,0,0,0.08); background: #f1f5f9; display: flex; align-items: center; justify-content: center;">
            <div style="text-align: center; color: #64748B;">
              <div style="font-size: 32px; margin-bottom: 8px;">🖼️</div>
              <div>이미지 생성 실패</div>
              <div style="font-size: 12px;">카드 클릭하여 재생성</div>
            </div>
          </div>`;
      }).join('\n');
      
      const finalHtml = `
        <div class="card-news-container">
          <h2 class="hidden-title">${cardNewsScript.title}</h2>
          <div class="card-grid-wrapper">
            ${cardSlides}
          </div>
        </div>
      `.trim();
      
      // 결과 저장
      setState({
        isLoading: false,
        error: null,
        data: {
          htmlContent: finalHtml,
          title: cardNewsScript.title,
          imageUrl: images[0] || '',
          fullHtml: finalHtml,
          tags: [],
          factCheck: {
            fact_score: 0,
            verified_facts_count: 0,
            safety_score: 85,
            conversion_score: 80,
            issues: [],
            recommendations: []
          },
          postType: 'card_news',
          imageStyle: pendingRequest.imageStyle,
          customImagePrompt: pendingRequest.customImagePrompt,
          cardPrompts: cardNewsPrompts
        },
        progress: ''
      });
      
      // 상태 초기화
      setCardNewsScript(null);
      setCardNewsPrompts(null);
      setPendingRequest(null);
      setScriptProgress('');
      setCurrentStep(1);
      
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('./services/geminiClient');
      setState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // 🆕 이전 단계로 돌아가기
  const handleBackToScript = () => {
    setCardNewsPrompts(null);
    setCurrentStep(1);
  };

  // 원고 수정
  const handleEditScript = (updatedScript: CardNewsScript) => {
    setCardNewsScript(updatedScript);
  };

  // 랜딩 페이지 (모든 체크 전에 먼저 표시)
  if (currentPage === 'landing') {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center">로딩 중...</div>}>
        <LandingPage
          onStart={() => {
            window.location.hash = 'app';
            setCurrentPage('home');
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
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
        <AuthPage onNavigate={handleNavigate} />
      </Suspense>
    );
  }



  // Admin 페이지 렌더링
  if (currentPage === 'admin') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
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
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center">로딩 중...</div>}>
        <PasswordLogin onSuccess={() => setIsAuthenticated(true)} />
      </Suspense>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans relative transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 text-slate-900'}`}>
      {/* Animated background blobs */}
      {!darkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-[150px] animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-violet-100/30 rounded-full blur-[130px] animate-[pulse_10s_ease-in-out_2s_infinite]" />
          <div className="absolute -bottom-20 right-1/3 w-[400px] h-[400px] bg-cyan-100/20 rounded-full blur-[120px] animate-[pulse_12s_ease-in-out_4s_infinite]" />
        </div>
      )}

      {/* 상단 헤더 + 네비게이션 */}
      <header className={`backdrop-blur-2xl border-b sticky top-0 z-30 flex-none transition-all duration-300 ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/80 border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}>
        {/* 1단: 로고 + 유저 */}
        <div className="h-14 max-w-[1200px] w-full mx-auto px-5 flex justify-between items-center">
          <a href="#app" onClick={(e) => { e.preventDefault(); window.location.hash = 'app'; setCurrentPage('home'); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
            <img src="/280_logo.png" alt="WINAID" className={`h-8 w-8 group-hover:scale-105 transition-transform ${darkMode ? 'rounded-md bg-white p-0.5' : ''}`} />
            <div className="flex flex-col leading-none">
              <span className={`font-black text-base tracking-[-0.02em] ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>WIN<span className="text-blue-600">AID</span></span>
              <span className={`text-[8px] font-semibold tracking-wider uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>AI Marketing</span>
            </div>
          </a>

          <div className="flex items-center gap-3">
             {isLoggedIn && supabaseUser && (
               <div className="relative">
                 <button
                   onClick={() => setShowUserMenu(!showUserMenu)}
                   className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${darkMode ? 'bg-slate-700 text-blue-400 hover:bg-slate-600' : 'bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-600 hover:from-blue-100 hover:to-blue-200/80 border border-blue-100/80 shadow-sm'}`}
                   title={supabaseUser.email || '사용자'}
                 >
                   {(supabaseUser.email || 'U')[0].toUpperCase()}
                 </button>
                 {showUserMenu && (
                   <>
                     <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                     <div className={`absolute right-0 top-12 w-56 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border z-50 overflow-hidden backdrop-blur-2xl ${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200/60'}`}>
                       <div className={`px-4 py-3.5 text-xs truncate font-medium ${darkMode ? 'text-slate-400 border-b border-slate-700' : 'text-slate-500 border-b border-slate-100'}`}>
                         {supabaseUser.email}
                       </div>
                       <button
                         onClick={() => { setShowUserMenu(false); handleLogout(); }}
                         className={`w-full text-left px-4 py-3.5 text-sm font-medium transition-colors ${darkMode ? 'text-red-400 hover:bg-slate-700' : 'text-red-500 hover:bg-red-50'}`}
                       >
                         로그아웃
                       </button>
                     </div>
                   </>
                 )}
               </div>
             )}
          </div>
        </div>
        {/* 2단: 탑 네비게이션 바 */}
        <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100/80'}`}>
          <nav className="max-w-[1200px] w-full mx-auto px-5 flex items-center gap-1 overflow-x-auto custom-scrollbar">
            {([
              { id: 'blog' as ContentTabType, label: '블로그', icon: '📝' },
              { id: 'card_news' as ContentTabType, label: '카드뉴스', icon: '🎨' },
              { id: 'press' as ContentTabType, label: '언론보도', icon: '🗞️' },
              { id: 'image' as ContentTabType, label: '이미지 생성', icon: '🖼️' },
              { id: 'history' as ContentTabType, label: '히스토리', icon: '🕐' },
            ]).map(item => (
              <button
                key={item.id}
                onClick={() => setContentTab(item.id)}
                className={`relative py-3 px-4 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  currentPage !== 'home' && contentTab === item.id
                    ? darkMode ? 'text-blue-400' : 'text-blue-600'
                    : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm">{item.icon}</span>
                  {item.label}
                </span>
                {currentPage !== 'home' && contentTab === item.id && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 메인 콘텐츠 - 일반 웹페이지처럼 수직 스크롤 */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-[1200px] w-full mx-auto px-5 py-8">

        {/* 홈 대시보드 (#app) */}
        {currentPage === 'home' ? (
          <div className="space-y-8">
            {/* 환영 섹션 */}
            <div className={`rounded-2xl p-8 md:p-10 relative overflow-hidden ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gradient-to-br from-blue-600 via-blue-700 to-violet-700 text-white shadow-xl'}`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="relative">
                <h1 className={`text-2xl md:text-3xl font-black mb-3 ${darkMode ? 'text-slate-100' : 'text-white'}`}>WINAID에 오신 것을 환영합니다</h1>
                <p className={`text-base md:text-lg font-medium ${darkMode ? 'text-slate-400' : 'text-blue-100'}`}>AI 기반 의료 마케팅 콘텐츠를 쉽고 빠르게 생성하세요.</p>
              </div>
            </div>

            {/* 콘텐츠 생성 */}
            <div>
              <h2 className={`text-lg font-black mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>콘텐츠 생성</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  { id: 'blog' as ContentTabType, title: '블로그', desc: '네이버 스마트블록 최적화 의료 블로그', icon: '📝', color: 'blue' },
                  { id: 'card_news' as ContentTabType, title: '카드뉴스', desc: 'SNS용 카드뉴스 원고 + 이미지 자동 생성', icon: '🎨', color: 'pink' },
                  { id: 'press' as ContentTabType, title: '언론 보도자료', desc: '언론에 배포 가능한 보도자료 작성', icon: '🗞️', color: 'amber' },
                ]).map(item => (
                  <button
                    key={item.id}
                    onClick={() => setContentTab(item.id)}
                    className={`text-left p-6 rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-lg group ${
                      darkMode ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-blue-200 shadow-sm'
                    }`}
                  >
                    <span className="text-3xl mb-3 block">{item.icon}</span>
                    <h3 className={`text-base font-black mb-1.5 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{item.title}</h3>
                    <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
                    <div className={`mt-4 text-xs font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'} group-hover:underline`}>시작하기 →</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 도구 */}
            <div>
              <h2 className={`text-lg font-black mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>도구</h2>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { id: 'image' as ContentTabType, title: '이미지 생성', desc: 'AI 이미지', icon: '🖼️' },
                  { id: 'history' as ContentTabType, title: '히스토리', desc: '생성 이력', icon: '🕐' },
                ]).map(item => (
                  <button
                    key={item.id}
                    onClick={() => setContentTab(item.id)}
                    className={`text-left p-5 rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-lg ${
                      darkMode ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-blue-200 shadow-sm'
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{item.icon}</span>
                    <h3 className={`text-sm font-black mb-0.5 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{item.title}</h3>
                    <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) :

        /* 전체 화면 페이지들: 이미지, 히스토리 */
        contentTab === 'image' || contentTab === 'history' ? (
          <div className="w-full">
              {contentTab === 'history' ? (
                <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
                    <PostHistory
                      onClose={() => setContentTab('blog')}
                      darkMode={darkMode}
                    />
                  </Suspense>
                </div>
              ) : (
                <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
                  <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
                    <ImageGenerator />
                  </Suspense>
                </div>
              )}
          </div>
        ) : (
          <>
        {/* 블로그/카드뉴스/언론보도 - 위아래 배치 (입력 → 결과) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-stretch">
          {/* 입력 폼 */}
          <div>
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
              <InputForm
                onSubmit={handleGenerate}
                isLoading={state.isLoading || isGeneratingScript}
                onTabChange={setContentTab}
                activePostType={contentTab === 'press' ? 'press_release' : contentTab === 'card_news' ? 'card_news' : contentTab === 'blog' ? 'blog' : undefined}
              />
            </Suspense>
          </div>

          {/* 결과 영역 */}
          <div className="flex flex-col">
          {cardNewsPrompts && cardNewsPrompts.length > 0 ? (
            <Suspense fallback={<div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-20 flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]"><div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
              <PromptPreview
                prompts={cardNewsPrompts}
                onApprove={handleApprovePrompts}
                onBack={handleBackToScript}
                onEditPrompts={handleEditPrompts}
                isLoading={isGeneratingScript}
                progress={scriptProgress}
                darkMode={darkMode}
              />
            </Suspense>
          ) : cardNewsScript ? (
            <Suspense fallback={<div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-20 flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]"><div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
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
            <div className={`rounded-2xl border p-16 flex flex-col items-center justify-center text-center backdrop-blur-xl transition-colors duration-300 flex-1 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
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
            <Suspense fallback={<div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-20 flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]"><div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>}>
              <ResultPreview content={getCurrentState().data!} darkMode={darkMode} />
            </Suspense>
          ) : (
            <div className={`rounded-2xl border flex flex-col items-center justify-center p-16 text-center group backdrop-blur-xl transition-all duration-500 relative overflow-hidden flex-1 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/60 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.04)]'}`}>
               {!darkMode && (
                 <div className="absolute inset-0 pointer-events-none">
                   <div className="absolute top-8 right-8 w-32 h-32 bg-blue-100/30 rounded-full blur-[60px]" />
                   <div className="absolute bottom-8 left-8 w-24 h-24 bg-violet-100/20 rounded-full blur-[50px]" />
                 </div>
               )}
               <div className="relative">
                 <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 ${darkMode ? 'bg-slate-700' : 'bg-gradient-to-br from-blue-50 to-blue-100/80 border border-blue-200/30'}`}>
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
          </div>
        </div>
          </>
        )}

        </div>
      </main>

      {/* API 에러 모달 */}
      {(getCurrentState().error || state.error) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
        <Suspense fallback={<div>Loading...</div>}>
          <ApiKeySettings onClose={() => setShowApiKeyModal(false)} />
        </Suspense>
      )}

      {/* 의료광고법 검색 플로팅 버튼 */}
      <Suspense fallback={null}>
        <MedicalLawSearch />
      </Suspense>
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
