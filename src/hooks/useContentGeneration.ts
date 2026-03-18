import { useState, useCallback, useRef, RefObject } from 'react';
import { GenerationRequest, GenerationState } from '../types';
import { GENERATION_HARD_TIMEOUT_MS } from '../core/generation/contracts';
import { runCreditGate } from '../core/generation/policies';
import { runContentJob } from '../core/generation/generateContentJob';

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

// GENERATION_HARD_TIMEOUT_MS → core/generation/contracts.ts에서 import

export function useContentGeneration(deps: ContentGenerationDeps): ContentGenerationState {
  const [state, setState] = useState<GenerationState>(initialState);
  const [blogState, setBlogState] = useState<GenerationState>(initialState);
  const [pressState, setPressState] = useState<GenerationState>(initialState);
  const isGeneratingRef = useRef(false);
  const generationIdRef = useRef(0); // timeout 후 늦은 결과 방어용

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
    console.info(`[BLOG_FLOW] handleGenerate 시작 — postType: ${request.postType}, topic: ${request.topic?.substring(0, 30)}`);

    // targetSetState 미리 결정 — 에러도 올바른 state에 설정하기 위함
    const earlyTargetSetState = request.postType === 'press_release' ? setPressState : setBlogState;

    if (!request.postType) {
      console.warn('[GEN_STEP] early return reason=postType 없음');
      earlyTargetSetState(prev => ({
        ...prev,
        error: '콘텐츠 타입이 선택되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.'
      }));
      isGeneratingRef.current = false;
      return;
    }

    // ── 카드뉴스: 훅 레벨 credit gate + 3단계 워크플로우 ──
    // 카드뉴스는 runContentJob을 거치지 않으므로 여기서 직접 gate 실행.
    // 블로그/보도자료는 runContentJob 내부에서 gate를 실행한다 (이중 호출 방지).
    if (request.postType === 'card_news') {
      const creditResult = await runCreditGate(request.postType);
      if (!creditResult.allowed) {
        earlyTargetSetState(prev => ({
          ...prev,
          isLoading: false,
          error: creditResult.message || '크레딧이 부족합니다.',
        }));
        isGeneratingRef.current = false;
        return;
      }
      try {
        await deps.handleGenerateCardNews(request, setState, deps.setContentTab);
      } finally {
        isGeneratingRef.current = false;
        import('../services/geminiClient').then(({ clearGenerationToken }) => clearGenerationToken()).catch(() => {});
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

    console.info(`[GEN_STEP] setLoading(true) — postType=${request.postType}, target=${request.postType === 'press_release' ? 'pressState' : 'blogState'}`);
    targetSetState(prev => ({ ...prev, isLoading: true, error: null, warning: null, progress: 'SEO 최적화 키워드 분석 및 이미지 생성 중...' }));

    // ── UI hard timeout: 무한 로딩 방지 (발표 안정화) ──
    const thisGenId = ++generationIdRef.current;
    const hardTimeoutId = setTimeout(() => {
      if (isGeneratingRef.current && generationIdRef.current === thisGenId) {
        console.error(`[BLOG_FLOW] ⏰ hard timeout ${GENERATION_HARD_TIMEOUT_MS}ms 초과 — 강제 로딩 해제`);
        targetSetState(prev => ({
          ...prev,
          isLoading: false,
          error: '생성 시간이 초과되었습니다. 네트워크 상태를 확인하고 다시 시도해주세요.',
          progress: '',
        }));
        isGeneratingRef.current = false;
      }
    }, GENERATION_HARD_TIMEOUT_MS);

    try {
      // ── 공식 오케스트레이터 진입점: runContentJob ──
      // credit gate 책임은 runContentJob 내부에서 단일 수행.
      // 이 훅에서는 gate를 호출하지 않는다 (카드뉴스만 예외).
      console.info('[GEN_STEP] before main pipeline — runContentJob 호출');
      const outcome = await runContentJob(request, (p) => {
        // timeout 후 늦은 progress 업데이트 방어
        if (generationIdRef.current !== thisGenId) return;
        targetSetState(prev => ({ ...prev, progress: p }));
      });

      // timeout 후 늦게 도착한 결과가 UI를 덮지 않도록 방어
      if (generationIdRef.current !== thisGenId) {
        console.warn(`[BLOG_FLOW] ⚠️ 결과 도착했으나 genId 불일치 (${thisGenId} vs ${generationIdRef.current}) — 폐기`);
        return;
      }

      // ── 실패 처리 ──
      if (!outcome.success) {
        console.error(`[BLOG_FLOW] ❌ 생성 실패:`, outcome.error);
        targetSetState(prev => {
          if (prev.data) {
            console.warn('[BLOG_FLOW] 기존 data 보존, warning으로 처리');
            return { ...prev, isLoading: false, error: null, warning: outcome.error };
          }
          console.warn('[BLOG_FLOW] data 없음 → error 상태로 전환 (에러 모달 표시 대기)');
          return { ...prev, isLoading: false, error: outcome.error, data: null };
        });
        return;
      }

      // ── 성공 처리 ──
      const result = outcome.data;

      // 📋 결과물 완전성 검증 로그 — "완전한 글 1편" 기준
      const html = result?.fullHtml || result?.htmlContent || '';
      const textOnly = html.replace(/<[^>]+>/g, '').trim();
      const h2Count = (html.match(/<h[23][^>]*>/gi) || []).length;
      const hasIntro = html.indexOf('<h') > 30 || (html.indexOf('<p') >= 0 && html.indexOf('<p') < html.indexOf('<h'));
      const conclusionLength = result?.conclusionLength;
      const hasConclusion = conclusionLength ? conclusionLength >= 20 : textOnly.length > 200;
      const conclusionSource = conclusionLength ? `pipeline(${conclusionLength}자)` : `heuristic(textLen=${textOnly.length})`;
      console.info(`[BLOG_FLOW] ✅ generateFullPost 반환됨`);
      console.info(`[BLOG_FLOW] 📋 완전성 검증: title="${result?.title}" | fullHtml=${html.length}자 | 텍스트=${textOnly.length}자 | h2/h3=${h2Count}개 | intro=${hasIntro} | conclusion=${hasConclusion} [${conclusionSource}]`);
      if (!result?.title || h2Count < 2 || textOnly.length < 300) {
        console.error(`[BLOG_FLOW] ⚠️ 완전성 미달 — title=${!!result?.title}, h2=${h2Count}, textLen=${textOnly.length}`);
      }
      const imageWarning = result.imageFailCount && result.imageFailCount > 0
        ? `본문은 정상 생성되었습니다. 이미지 ${result.imageFailCount}장은 AI 서버 과부하로 생성에 실패했습니다.`
        : null;
      console.info(`[BLOG_FLOW] setBlogState 호출 직전 — data 존재: ${!!result}, isLoading: false`);
      targetSetState({ isLoading: false, error: null, warning: imageWarning, data: result, progress: '' });
      console.info(`[BLOG_FLOW] ✅ setBlogState 완료 — 사용자 화면 전환 대기 (RENDER_GATE에서 RESULT_PREVIEW 확인)`);

      // 사용량 저장 (크레딧 차감은 서버에서 선처리 완료)
      try {
        const { flushSessionUsage } = await import('../services/creditService');
        await flushSessionUsage();
      } catch (e) {
        console.warn('사용량 저장 스킵:', e);
      }

      // API 서버에 자동 저장 — 반드시 storageHtml(경량화 완료본)만 사용
      try {
        const { saveContentToServer } = await import('../services/apiService');
        let contentForSave = result.storageHtml || '';
        if (!contentForSave) {
          contentForSave = result.htmlContent
            .replace(/src="data:image\/[^"]*"/gi, 'src=""')
            .replace(/src="blob:[^"]*"/gi, 'src=""');
          console.warn('[STORAGE] storageHtml 없음 — htmlContent에서 base64/blob strip 후 저장');
        }
        const displayKB = Math.round(result.htmlContent.length * 2 / 1024);
        const storageKB = Math.round(contentForSave.length * 2 / 1024);
        console.debug(`[STORAGE] saveContentToServer | display=${displayKB}KB | storage=${storageKB}KB`);
        if (storageKB > 500) {
          console.error(`[STORAGE] ⚠️ storage payload ${storageKB}KB — 비정상 크기! storageHtml 경로 점검 필요`);
        }
        const saveResult = await saveContentToServer({
          title: result.title,
          content: contentForSave,
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
    } finally {
      clearTimeout(hardTimeoutId);
      isGeneratingRef.current = false;
      import('../services/geminiClient').then(({ clearGenerationToken }) => clearGenerationToken()).catch(() => {});
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
