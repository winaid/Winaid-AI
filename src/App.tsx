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
const SimilarityChecker = lazy(() => import('./components/SimilarityChecker'));
const ContentRefiner = lazy(() => import('./components/ContentRefiner'));
const MedicalLawSearch = lazy(() => import('./components/MedicalLawSearch').then(module => ({ default: module.MedicalLawSearch })));
const ImageGenerator = lazy(() => import('./components/ImageGenerator'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const PostHistory = lazy(() => import('./components/PostHistory'));

type PageType = 'landing' | 'app' | 'admin' | 'auth';

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
  // 탭 이름 목록 (URL hash로 사용)
  const validTabs = ['blog', 'similarity', 'refine', 'card_news', 'press', 'image', 'history'] as const;
  type ContentTabType = typeof validTabs[number];

  const [currentPage, setCurrentPage] = useState<PageType>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin') return 'admin';
    if (hash === 'auth' || hash === 'login' || hash === 'register') return 'auth';
    // 탭 이름이면 app 페이지
    if ((validTabs as readonly string[]).includes(hash) || hash === 'app') return 'app';
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
  const [_supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [_userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [_isAdmin, setIsAdmin] = useState<boolean>(false); // 관리자 여부

  const [mobileTab, setMobileTab] = useState<'input' | 'result'>('input');
  
  // 스크롤 위치 저장 ref
  const scrollPositionRef = useRef<number>(0);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  
  // 오른쪽 콘텐츠 탭 (URL hash에서 초기값 파싱)
  const [contentTab, setContentTabRaw] = useState<ContentTabType>(() => {
    const hash = window.location.hash.replace('#', '');
    if ((validTabs as readonly string[]).includes(hash)) return hash as ContentTabType;
    return 'blog';
  });

  // contentTab 변경 시 URL hash도 함께 업데이트
  const setContentTab = (tab: ContentTabType) => {
    setContentTabRaw(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  
  // 현재 탭에 맞는 state 가져오기
  const getCurrentState = (): GenerationState => {
    if (contentTab === 'press') return pressState;
    if (contentTab === 'blog' || contentTab === 'card_news') return blogState;
    return state; // similarity, refine
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
  
  // 유사도 검사 모달 상태
  const [showSimilarityChecker, setShowSimilarityChecker] = useState(false);
  const [autoSimilarityResult, setAutoSimilarityResult] = useState<any>(null);
  
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
          // 성공 - hash를 정리하고 app으로
          window.history.replaceState(null, '', window.location.pathname + '#app');
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
        
        // 세션이 있고 현재 auth 페이지면 app으로 이동
        const currentHash = window.location.hash;
        if (currentHash === '#auth') {
          window.location.hash = 'app';
          setCurrentPage('app');
        } else if (currentHash === '#app') {
          setCurrentPage('app');
        }
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
          
          // OAuth 토큰이 URL에 있는 경우에만 #app으로 리다이렉트
          if (currentHash.includes('access_token') || currentHash.includes('refresh_token')) {
            window.history.replaceState(null, '', window.location.pathname + '#app');
            window.location.hash = 'app';
            setCurrentPage('app');
          }
          // auth 페이지에서 로그인한 경우 app으로 이동
          else if (currentHash === '#auth' || currentHash === '#login' || currentHash === '#register') {
            window.location.hash = 'app';
            setCurrentPage('app');
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

  // URL hash 기반 라우팅 (로그인 체크 제거)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');

      // 탭 이름이면 → app 페이지 + 해당 탭으로 전환
      if ((validTabs as readonly string[]).includes(hash)) {
        setContentTabRaw(hash as ContentTabType);
        setCurrentPage(prevPage => {
          if (prevPage !== 'app') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          return 'app';
        });
        return;
      }

      let newPage: PageType;
      if (hash === 'admin') newPage = 'admin';
      else if (hash === 'auth' || hash === 'login' || hash === 'register') newPage = 'auth';
      else if (hash === 'app') newPage = 'app';
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
    if (page === 'app') {
      window.location.hash = contentTab; // #blog, #press 등
    } else {
      window.location.hash = page;
    }
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
          
          // 🔍 자동 유사도 검사 비활성화 (사용자가 수동으로 실행)
          // 이유: 크롤링 100개가 자동으로 실행되어 성능 저하 발생
          // ResultPreview의 "🔍 유사도" 버튼으로 수동 실행 가능
          /*
          try {
            console.log('🔍 구글 검색 유사도 검사 시작...');
            
            const searchKeywords = request.keywords || request.topic;
            if (searchKeywords) {
              const naverBlogs = await prepareNaverBlogsForComparison(searchKeywords, 10);
              
              if (naverBlogs && naverBlogs.length > 0) {
                console.log(`📰 구글 검색 결과 ${naverBlogs.length}개 완료`);
                
                const similarities = naverBlogs.map((blog) => {
                  const similarity = calculateOverallSimilarity(result.htmlContent, blog.text);
                  const level = getSimilarityLevel(similarity);
                  return {
                    id: blog.id,
                    title: blog.title,
                    url: blog.url,
                    blogger: blog.blogger,
                    similarity,
                    level,
                  };
                }).sort((a, b) => b.similarity - a.similarity);
                
                const highSimilarityContents = similarities.filter(s => s.similarity >= 40);
                
                if (highSimilarityContents.length > 0) {
                  setAutoSimilarityResult({
                    totalChecked: similarities.length,
                    highSimilarity: highSimilarityContents,
                    maxSimilarity: similarities[0].similarity,
                    isNaverBlog: true,
                  });
                  console.log(`⚠️ 유사도 높은 웹사이트 발견: ${highSimilarityContents.length}개`);
                } else {
                  console.log('✅ 구글 검색 유사도 검사 완료: 중복 없음');
                }
              }
            }
          } catch (similarityErr) {
            console.warn('⚠️ 구글 검색 유사도 검사 실패 (무시하고 계속):', similarityErr);
          }
          */
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
            window.location.hash = '#app';
            setCurrentPage('app');
          }}
          darkMode={darkMode}
        />
      </Suspense>
    );
  }

  // 로딩 중 (admin/pricing 페이지는 로딩 화면 없이 바로 표시)
  // app 페이지는 로딩 중에도 UI 표시 (apiKeyReady 체크에서 처리)
  if (authLoading && currentPage !== 'admin' && (currentPage as string) !== 'pricing' && currentPage !== 'app') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  // Auth 페이지 렌더링
  if (currentPage === 'auth') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
        <AuthPage onNavigate={handleNavigate} />
      </Suspense>
    );
  }



  // Admin 페이지 렌더링
  if (currentPage === 'admin') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
        <AdminPage onAdminVerified={() => setIsAdmin(true)} />
      </Suspense>
    );
  }

  // API Key 미설정 시 안내 화면
  if (!apiKeyReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white p-12 rounded-[40px] shadow-2xl border border-slate-100 relative overflow-hidden">
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
    <div className={`min-h-screen flex flex-col font-sans relative transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className={`backdrop-blur-xl border-b sticky top-0 z-30 h-16 flex items-center shadow-sm flex-none transition-colors duration-300 ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white/80 border-slate-100'}`}>
        <div className="max-w-[1600px] w-full mx-auto px-6 flex justify-between items-center">
          <a href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer">
            <img src="/280_logo.png" alt="WINAID" className={`h-9 ${darkMode ? 'rounded-md bg-white p-0.5' : ''}`} />
            <div className="flex flex-col leading-none">
              <span className={`font-black text-lg tracking-[-0.02em] ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>WIN<span className="text-blue-500">AID</span></span>
              <span className={`text-[9px] font-medium tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Advertising Company</span>
            </div>
          </a>
          
          <div className="flex items-center gap-3">
             {isLoggedIn && supabaseUser && (
               <div className="relative">
                 <button
                   onClick={() => setShowUserMenu(!showUserMenu)}
                   className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${darkMode ? 'bg-slate-700 text-emerald-400 hover:bg-slate-600' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                   title={supabaseUser.email || '사용자'}
                 >
                   {(supabaseUser.email || 'U')[0].toUpperCase()}
                 </button>
                 {showUserMenu && (
                   <>
                     <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                     <div className={`absolute right-0 top-12 w-48 rounded-xl shadow-xl border z-50 overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                       <div className={`px-4 py-3 text-xs truncate ${darkMode ? 'text-slate-400 border-b border-slate-700' : 'text-slate-500 border-b border-slate-100'}`}>
                         {supabaseUser.email}
                       </div>
                       <button
                         onClick={() => { setShowUserMenu(false); handleLogout(); }}
                         className={`w-full text-left px-4 py-3 text-sm transition-colors ${darkMode ? 'text-red-400 hover:bg-slate-700' : 'text-red-500 hover:bg-red-50'}`}
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
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-8 flex flex-col lg:flex-row gap-8 overflow-hidden h-[calc(100vh-64px)]">
        
        {/* AI 정밀보정과 유사도 검사는 전체 화면 사용 */}
        {contentTab === 'refine' || contentTab === 'similarity' || contentTab === 'image' || contentTab === 'history' ? (
          <div className="w-full h-full flex flex-col gap-4 overflow-hidden">
            {/* 탭 메뉴 */}
            <div className={`flex gap-1 p-1.5 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-slate-100/80 border border-slate-200/60'} w-fit mx-auto`}>
              {([
                { id: 'blog' as const, label: '블로그', icon: '📝' },
                { id: 'card_news' as const, label: '카드뉴스', icon: '🎨' },
                { id: 'press' as const, label: '언론보도', icon: '🗞️' },
                { id: 'similarity' as const, label: '유사도', icon: '🔍' },
                { id: 'refine' as const, label: 'AI보정', icon: '✨' },
                { id: 'image' as const, label: '이미지', icon: '🖼️' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setContentTab(tab.id)}
                  className={`py-2 px-4 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    contentTab === tab.id
                      ? darkMode ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                  }`}
                >
                  <span className="text-xs">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 전체 화면 콘텐츠 */}
            <div className="flex-1 overflow-hidden">
              {contentTab === 'similarity' ? (
                <div className={`h-full rounded-2xl shadow-lg border p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin"></div></div>}>
                    <SimilarityChecker
                      onClose={() => setContentTab('blog')}
                      darkMode={darkMode}
                      initialContent={getCurrentState().data ? stripHtml(getCurrentState().data!.htmlContent) : ''}
                    />
                  </Suspense>
                </div>
              ) : contentTab === 'history' ? (
                <div className={`h-full rounded-2xl shadow-lg border p-6 overflow-y-auto ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin"></div></div>}>
                    <PostHistory
                      onClose={() => setContentTab('blog')}
                      darkMode={darkMode}
                    />
                  </Suspense>
                </div>
              ) : contentTab === 'image' ? (
                <div className={`h-full rounded-2xl shadow-lg border p-6 overflow-y-auto ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin"></div></div>}>
                    <ImageGenerator />
                  </Suspense>
                </div>
              ) : (
                <div className={`h-full rounded-2xl shadow-lg border p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div></div>}>
                    <ContentRefiner
                      onClose={() => setContentTab('blog')}
                      onNavigate={(tab) => setContentTab(tab)}
                      darkMode={darkMode}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
        {/* 왼쪽 영역: 콘텐츠 */}
        <div className={`lg:w-[500px] flex flex-col gap-4 overflow-hidden pb-24 lg:pb-0 ${mobileTab === 'result' ? 'hidden lg:flex' : 'flex'}`}>
          {/* 콘텐츠 */}
          <div ref={leftPanelRef} className="flex-1 overflow-y-auto custom-scrollbar">
            {/* 블로그/카드뉴스/언론보도 입력 폼 */}
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
              <InputForm
                onSubmit={handleGenerate}
                isLoading={state.isLoading || isGeneratingScript}
                onTabChange={setContentTab}
              />
            </Suspense>
          </div>
        </div>

        {/* 오른쪽 영역: 결과 */}
        <div className={`flex-1 h-full flex flex-col ${mobileTab === 'input' ? 'hidden lg:flex' : 'flex'} overflow-hidden`}>
          {/* 카드뉴스 3단계 워크플로우 */}
          {/* 2단계: 프롬프트 확인 */}
          {cardNewsPrompts && cardNewsPrompts.length > 0 ? (
            <Suspense fallback={<div className="rounded-[40px] border p-20 flex items-center justify-center"><div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
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
            /* 1단계: 원고 확인 */
            <Suspense fallback={<div className="rounded-[40px] border p-20 flex items-center justify-center"><div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
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
            <div className={`rounded-[40px] border p-20 flex flex-col items-center justify-center h-full text-center shadow-2xl animate-pulse transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
              <div className="relative mb-10">
                <div className={`w-24 h-24 border-8 border-t-emerald-500 rounded-full animate-spin ${darkMode ? 'border-slate-700' : 'border-emerald-50'}`}></div>
                <div className="absolute inset-0 flex items-center justify-center text-3xl">🏥</div>
              </div>
              <h2 className={`text-2xl font-black mb-4 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{getCurrentState().progress || scriptProgress}</h2>
              <p className={`max-w-xs font-medium text-center ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                {pendingRequest?.postType === 'card_news' 
                  ? '카드뉴스 원고를 생성하고 있습니다...' 
                  : pendingRequest?.postType === 'press_release'
                  ? '언론 보도자료를 작성하고 있습니다...'
                  : <>네이버 스마트블록 노출을 위한 최적의<br/>의료 콘텐츠를 생성하고 있습니다.</>}
              </p>
            </div>
          ) : getCurrentState().data ? (
            <Suspense fallback={<div className="rounded-[40px] border p-20 flex items-center justify-center"><div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
              <ResultPreview content={getCurrentState().data!} darkMode={darkMode} />
            </Suspense>
          ) : (
            <div className={`h-full rounded-[40px] shadow-2xl border flex flex-col items-center justify-center p-20 text-center group transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gradient-to-br from-white to-blue-50/30 border-slate-100'}`}>
               <div className={`w-28 h-28 rounded-3xl flex items-center justify-center text-5xl mb-8 group-hover:scale-110 transition-transform duration-500 ${darkMode ? 'bg-slate-700' : 'bg-blue-50'}`}>🦷</div>
               <h3 className={`text-2xl font-black ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>치과 콘텐츠 생성</h3>
               <p className={`mt-3 max-w-xs text-sm font-medium leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>좌측에서 키워드를 입력하고<br/>블로그 원고 생성 버튼을 눌러보세요</p>
               <div className={`mt-6 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                 <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                 AI가 대기 중입니다
               </div>
            </div>
          )}
        </div>
          </>
        )}

      </main>

      <div className={`lg:hidden backdrop-blur-xl border-t fixed bottom-0 left-0 right-0 z-30 flex p-2 transition-colors duration-300 ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-slate-200'}`}>
        <button onClick={() => setMobileTab('input')} className={`flex-1 py-3 rounded-2xl text-sm font-black transition-all ${mobileTab === 'input' ? 'bg-emerald-600 text-white shadow-lg' : darkMode ? 'text-slate-400' : 'text-slate-400'}`}>🛠️ 설정</button>
        <button onClick={() => setMobileTab('result')} className={`flex-1 py-3 rounded-2xl text-sm font-black transition-all ${mobileTab === 'result' ? 'bg-emerald-600 text-white shadow-lg' : darkMode ? 'text-slate-400' : 'text-slate-400'}`}>📄 결과</button>
      </div>
      


      {/* API 에러 모달 */}
      {(getCurrentState().error || state.error) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`rounded-3xl p-8 max-w-md w-full shadow-2xl ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
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

      {/* 유사도 검사 모달 */}
      {showSimilarityChecker && (
        <Suspense fallback={<div>Loading...</div>}>
          <SimilarityChecker 
            onClose={() => setShowSimilarityChecker(false)}
            savedContents={[]}
          />
        </Suspense>
      )}

      {/* 자동 유사도 검사 결과 알림 */}
      {autoSimilarityResult && (
        <div className="fixed bottom-8 right-8 z-50 animate-fadeIn">
          <div className={`rounded-2xl shadow-2xl max-w-md overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔍</span>
                  <h3 className="font-bold text-lg">웹 검색 유사도 검사</h3>
                </div>
                <button
                  onClick={() => setAutoSimilarityResult(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-6 h-6 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="p-4">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl font-bold text-orange-600">
                    {autoSimilarityResult.maxSimilarity}%
                  </span>
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    최고 유사도
                  </span>
                </div>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  검색 결과 {autoSimilarityResult.totalChecked}개 중 {autoSimilarityResult.highSimilarity.length}개와 유사합니다.
                </p>
              </div>

              {/* 유사한 글 목록 */}
              <div className="space-y-2 max-h-40 overflow-y-auto mb-4">
                {autoSimilarityResult.highSimilarity.slice(0, 3).map((item: any, index: number) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block p-3 rounded-lg transition hover:scale-[1.02] ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          {item.title || `글 ${index + 1}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {item.blogger || '네이버 블로그'}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                            {item.level.label}
                          </span>
                        </div>
                      </div>
                      <div
                        className="text-xl font-bold ml-2"
                        style={{ color: item.level.color }}
                      >
                        {item.similarity}%
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              {/* 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAutoSimilarityResult(null);
                    setShowSimilarityChecker(true);
                  }}
                  className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition"
                >
                  자세히 보기
                </button>
                <button
                  onClick={() => setAutoSimilarityResult(null)}
                  className={`flex-1 py-2 font-semibold rounded-lg transition ${
                    darkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
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
