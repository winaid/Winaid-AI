import { useState, useCallback, useRef, RefObject } from 'react';
import { GenerationRequest, GenerationState } from '../types';

type ContentTabType = 'blog' | 'refine' | 'card_news' | 'press' | 'image' | 'history';

interface ContentGenerationDeps {
  contentTab: ContentTabType;
  setContentTab: (tab: ContentTabType) => void;
  setMobileTab: (tab: 'input' | 'result') => void;
  leftPanelRef: RefObject<HTMLDivElement | null>;
  scrollPositionRef: RefObject<number>;
  handleGenerateCardNews: (
    request: GenerationRequest,
    setState: React.Dispatch<React.SetStateAction<GenerationState>>,
    setContentTab: (tab: string) => void
  ) => Promise<void>;
}

interface ContentGenerationState {
  state: GenerationState;
  setState: React.Dispatch<React.SetStateAction<GenerationState>>;
  blogState: GenerationState;
  setBlogState: React.Dispatch<React.SetStateAction<GenerationState>>;
  pressState: GenerationState;
  setPressState: React.Dispatch<React.SetStateAction<GenerationState>>;
  getCurrentState: () => GenerationState;
  getCurrentSetState: () => React.Dispatch<React.SetStateAction<GenerationState>>;
  handleGenerate: (request: GenerationRequest) => Promise<void>;
}

const initialState: GenerationState = {
  isLoading: false,
  error: null,
  warning: null,
  data: null,
  progress: '',
};

export function useContentGeneration(deps: ContentGenerationDeps): ContentGenerationState {
  const [state, setState] = useState<GenerationState>(initialState);
  const [blogState, setBlogState] = useState<GenerationState>(initialState);
  const [pressState, setPressState] = useState<GenerationState>(initialState);
  const isGeneratingRef = useRef(false);

  const getCurrentState = useCallback((): GenerationState => {
    if (deps.contentTab === 'press') return pressState;
    if (deps.contentTab === 'blog' || deps.contentTab === 'card_news') return blogState;
    return state;
  }, [deps.contentTab, pressState, blogState, state]);

  const getCurrentSetState = useCallback((): React.Dispatch<React.SetStateAction<GenerationState>> => {
    if (deps.contentTab === 'press') return setPressState;
    if (deps.contentTab === 'blog' || deps.contentTab === 'card_news') return setBlogState;
    return setState;
  }, [deps.contentTab]);

  const handleGenerate = useCallback(async (request: GenerationRequest) => {
    // 🛡️ 중복 실행 방지 — 생성 중 재클릭 차단
    if (isGeneratingRef.current) {
      console.warn('[BLOG_FLOW] ⛔ 생성 중 중복 클릭 차단됨');
      return;
    }
    isGeneratingRef.current = true;

    // 스크롤 위치 고정
    const currentScrollY = window.scrollY || window.pageYOffset;
    const currentScrollX = window.scrollX || window.pageXOffset;

    const lockScroll = (e: Event) => {
      e.preventDefault();
      window.scrollTo(currentScrollX, currentScrollY);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('scroll', lockScroll, { passive: false });

    setTimeout(() => {
      window.removeEventListener('scroll', lockScroll);
      document.body.style.overflow = '';
      window.scrollTo(currentScrollX, currentScrollY);
    }, 200);

    // 이전 저장본 삭제
    try {
      localStorage.removeItem('hospitalai_autosave');
      localStorage.removeItem('hospitalai_autosave_history');
      localStorage.removeItem('hospitalai_card_prompt_history');
      localStorage.removeItem('hospitalai_card_ref_image');
    } catch (e) {
      console.warn('저장본 삭제 실패:', e);
    }

    // 스크롤 위치 저장
    if (deps.leftPanelRef.current) {
      (deps.scrollPositionRef as React.MutableRefObject<number>).current = deps.leftPanelRef.current.scrollTop;
    }

    deps.setMobileTab('result');
    console.warn(`[BLOG_FLOW] handleGenerate 시작 — postType: ${request.postType}, topic: ${request.topic?.substring(0, 30)}`);

    if (!request.postType) {
      setState(prev => ({
        ...prev,
        error: '콘텐츠 타입이 선택되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.'
      }));
      isGeneratingRef.current = false;
      return;
    }

    // 크레딧 체크
    try {
      const { checkCredits } = await import('../services/creditService');
      const creditStatus = await checkCredits(request.postType);
      if (!creditStatus.canGenerate) {
        setState(prev => ({
          ...prev,
          error: creditStatus.message || '크레딧이 부족합니다.',
        }));
        isGeneratingRef.current = false;
        return;
      }
    } catch (e) {
      console.warn('크레딧 체크 스킵:', e);
    }

    // 카드뉴스: 3단계 워크플로우
    if (request.postType === 'card_news') {
      try {
        await deps.handleGenerateCardNews(request, setState, deps.setContentTab);
      } finally {
        isGeneratingRef.current = false;
      }
      return;
    }

    // 블로그/언론보도
    if (request.postType === 'press_release') {
      deps.setContentTab('press');
    } else {
      deps.setContentTab('blog');
    }

    const targetSetState = request.postType === 'press_release' ? setPressState : setBlogState;

    targetSetState(prev => ({ ...prev, isLoading: true, error: null, warning: null, progress: 'SEO 최적화 키워드 분석 및 이미지 생성 중...' }));

    try {
      const { generateFullPost } = await import('../services/geminiService');
      console.warn('[BLOG_FLOW] generateFullPost 호출 시작...');
      const result = await generateFullPost(request, (p) => targetSetState(prev => ({ ...prev, progress: p })));
      // 📋 결과물 완전성 검증 로그 — "완전한 글 1편" 기준
      const html = result?.fullHtml || result?.htmlContent || '';
      const textOnly = html.replace(/<[^>]+>/g, '').trim();
      const h2Count = (html.match(/<h[23][^>]*>/gi) || []).length;
      const hasIntro = html.indexOf('<h') > 30 || (html.indexOf('<p') >= 0 && html.indexOf('<p') < html.indexOf('<h'));
      const hasConclusion = textOnly.length > 200; // 마무리 포함 시 최소 길이
      console.warn(`[BLOG_FLOW] ✅ generateFullPost 반환됨`);
      console.warn(`[BLOG_FLOW] 📋 완전성 검증: title="${result?.title}" | fullHtml=${html.length}자 | 텍스트=${textOnly.length}자 | h2/h3=${h2Count}개 | intro=${hasIntro} | conclusion=${hasConclusion}`);
      if (!result?.title || h2Count < 2 || textOnly.length < 300) {
        console.error(`[BLOG_FLOW] ⚠️ 완전성 미달 — title=${!!result?.title}, h2=${h2Count}, textLen=${textOnly.length}`);
      }
      const imageWarning = result.imageFailCount && result.imageFailCount > 0
        ? `본문은 정상 생성되었습니다. 이미지 ${result.imageFailCount}장은 AI 서버 과부하로 생성에 실패했습니다.`
        : null;
      console.warn(`[BLOG_FLOW] setBlogState 호출 직전 — data 존재: ${!!result}, isLoading: false`);
      targetSetState({ isLoading: false, error: null, warning: imageWarning, data: result, progress: '' });
      console.warn(`[BLOG_FLOW] ✅ setBlogState 완료 — 사용자 화면 전환 대기 (RENDER_GATE에서 RESULT_PREVIEW 확인)`);

      // 크레딧 차감 + 사용량 저장
      try {
        const { deductCredit, flushSessionUsage } = await import('../services/creditService');
        await deductCredit(request.postType);
        await flushSessionUsage();
      } catch (e) {
        console.warn('크레딧 차감/사용량 저장 스킵:', e);
      }

      // API 서버에 자동 저장
      try {
        const { saveContentToServer } = await import('../services/apiService');
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

        if (!saveResult.success) {
          console.warn('⚠️ 서버 저장 실패:', saveResult.error);
        }
      } catch (saveErr) {
        console.warn('⚠️ 서버 저장 중 오류:', saveErr);
      }
    } catch (err: any) {
      console.error(`[BLOG_FLOW] ❌ 생성 실패:`, err?.message || err);
      let friendlyError: string;
      try {
        const { getKoreanErrorMessage } = await import('../services/geminiClient');
        friendlyError = getKoreanErrorMessage(err);
      } catch {
        // dynamic import 실패 시 안전 폴백
        friendlyError = err?.message || '블로그 생성 중 오류가 발생했습니다. 다시 시도해주세요.';
      }
      // 🛡️ friendlyError가 falsy면 에러 모달이 안 뜸 → EMPTY_STATE 노출 방지
      if (!friendlyError?.trim()) {
        console.error('[BLOG_FLOW] ⚠️ friendlyError가 빈 문자열! 기본 메시지로 교체');
        friendlyError = '블로그 생성 중 오류가 발생했습니다. 다시 시도해주세요.';
      }
      console.warn(`[BLOG_FLOW] 에러 메시지: "${friendlyError}"`);
      targetSetState(prev => {
        // 🛡️ 이미 data가 있으면(부분 성공) 보존 — warning으로 표시
        if (prev.data) {
          console.warn('[BLOG_FLOW] 기존 data 보존, warning으로 처리');
          return { ...prev, isLoading: false, error: null, warning: friendlyError };
        }
        // data가 없으면 반드시 error 상태 — EMPTY_STATE 방지
        // ⚠️ mobileTab은 건드리지 않음: 에러 모달(position:fixed z-50)이 먼저 보여야 함
        // 사용자가 모달을 닫을 때 App.tsx에서 mobileTab='input' 복귀 처리
        console.warn('[BLOG_FLOW] data 없음 → error 상태로 전환 (에러 모달 표시 대기)');
        return { ...prev, isLoading: false, error: friendlyError, data: null };
      });
    } finally {
      isGeneratingRef.current = false;
    }
  }, [deps]);

  return {
    state,
    setState,
    blogState,
    setBlogState,
    pressState,
    setPressState,
    getCurrentState,
    getCurrentSetState,
    handleGenerate,
  };
}
