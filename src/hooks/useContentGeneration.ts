import { useState, useCallback, RefObject } from 'react';
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

    if (!request.postType) {
      setState(prev => ({
        ...prev,
        error: '콘텐츠 타입이 선택되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.'
      }));
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
        return;
      }
    } catch (e) {
      console.warn('크레딧 체크 스킵:', e);
    }

    // 카드뉴스: 3단계 워크플로우
    if (request.postType === 'card_news') {
      await deps.handleGenerateCardNews(request, setState, deps.setContentTab);
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
      const result = await generateFullPost(request, (p) => targetSetState(prev => ({ ...prev, progress: p })));
      const imageWarning = result.imageFailCount && result.imageFailCount > 0
        ? `본문은 정상 생성되었습니다. 이미지 ${result.imageFailCount}장은 AI 서버 과부하로 생성에 실패했습니다.`
        : null;
      targetSetState({ isLoading: false, error: null, warning: imageWarning, data: result, progress: '' });

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
      const { getKoreanErrorMessage } = await import('../services/geminiClient');
      const friendlyError = getKoreanErrorMessage(err);
      targetSetState(prev => {
        // 🛡️ 이미 data가 있으면(부분 성공) 보존 — error는 모달로 표시되지만 본문은 유지
        if (prev.data) {
          return { ...prev, isLoading: false, error: null, warning: friendlyError };
        }
        // data가 없으면 기존대로 에러 처리 + 모바일 input 탭 복귀
        deps.setMobileTab('input');
        return { ...prev, isLoading: false, error: friendlyError };
      });
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
