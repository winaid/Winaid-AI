import { useState, useCallback, useRef, RefObject } from 'react';
import { GenerationRequest, GenerationState, DisplayStage } from '../types';
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
  displayStage: 0,
};

// ══════════════════════════════════════════════════════
// 블로그 displayStage gate 로직
//
// 구조: raw progress → gate 신호 감지 → internal flags → displayStage
//
// 내부 처리 순서와 화면 표시 순서를 분리한다.
// 내부에서 이미지가 먼저 시작돼도, textReady 플래그가 false이면
// displayStage는 image(3)로 올라가지 않는다.
//
// gate 신호:
//   __STAGE:TEXT_READY__  → 텍스트 draft 완료 (Stage A+B 끝)
//   __STAGE:IMAGE_START__ → 이미지 생성 진입 (블로그 이미지 루프 직전)
//   __STAGE:SAVING__      → 저장 단계 진입
// ══════════════════════════════════════════════════════

/** progress에서 gate 신호 prefix를 제거하고 사용자용 메시지만 반환 */
function stripGateSignal(progress: string): string {
  return progress.replace(/__STAGE:[A-Z_]+__\s*/g, '').trim();
}

/**
 * 내부 로직 메시지를 사용자 친화적 톤으로 교체.
 * "Stage A", "소제목 2/5", "폴리싱" 같은 파이프라인 용어를 숨긴다.
 */
/**
 * 내부 progress → 사용자용 메시지 변환.
 *
 * 정책: "원문 보존"이 아니라 "사용자 경험 보호".
 * 내부 용어가 섞인 메시지는 빈 문자열로 반환하여
 * displayStage의 defaultMsg가 대신 표시되게 한다.
 *
 * 이미지 단계에서는 병렬 정보("이미지 3/5장")를 제거하고
 * "한 장씩 차분하게 준비하는" 느낌의 문구로 교체한다.
 */

// 이미지 단계 순환 문구 (병렬 진행을 숨기고 순차 인상 부여)
const IMAGE_STEP_MESSAGES = [
  '장면을 하나씩 정리하고 있어요',
  '내용과 잘 맞는 장면을 살펴보고 있어요',
  '화면이 심심하지 않도록 이미지를 준비하고 있어요',
  '글과 어울리는 비주얼을 고르고 있어요',
  '거의 다 왔어요, 마지막 이미지를 고르고 있어요',
];
let _imgStepIdx = 0;

function humanizeProgress(msg: string): string {
  if (!msg) return msg;

  // ── 1. 완전 숨기기: 내부 파이프라인 용어 ──
  if (/stage\s*[abc]/i.test(msg)) return '';
  if (msg.includes('폴리싱') || msg.includes('polish')) return '';
  if (msg.includes('소제목') && msg.includes('/')) return '';
  if (msg.includes('도입부 작성') || msg.includes('도입부 생성')) return '';
  if (msg.includes('섹션') && /\d/.test(msg)) return '';
  if (msg.includes('마무리 작성')) return '';
  if (msg.includes('파이프라인')) return '';
  if (msg.includes('AI 냄새')) return '';
  if (msg.includes('보조 비주얼')) return '';
  if (msg.includes('통합 검증')) return '';
  if (msg.includes('quality path') || msg.includes('quality_path')) return '';
  if (/seo\s*점수/i.test(msg) || /seo\s*score/i.test(msg)) return '';
  if (msg.includes('FAQ') && !msg.includes('FAQ 섹션이')) return '';

  // ── 2. 내부 역할/기술 태그 제거 ──
  let cleaned = msg
    .replace(/\s*\((hero|sub)\)/gi, '')
    .replace(/\s*\[wave[- ]?\d+\]/gi, '')
    .replace(/tier=\w+/gi, '')
    .replace(/nb2|pro-rescue|pro-quality/gi, '');

  // ── 3. 이미지 진행: 병렬 숫자를 순차 느낌으로 교체 ──
  // "이미지 3/5장 생성 중" → 순환 문구
  if (/이미지\s*\d+\/\d+장/.test(cleaned) || /이미지.*생성 시작/.test(cleaned)) {
    const step = IMAGE_STEP_MESSAGES[_imgStepIdx % IMAGE_STEP_MESSAGES.length];
    _imgStepIdx++;
    return step;
  }
  // "이미지 3/5장 완료" → 순환 문구
  if (/이미지\s*\d+\/\d+장\s*완료/.test(cleaned) || /이미지\s*\d+\/\d+장\s*준비 완료/.test(cleaned)) {
    const step = IMAGE_STEP_MESSAGES[_imgStepIdx % IMAGE_STEP_MESSAGES.length];
    _imgStepIdx++;
    return step;
  }

  // ── 4. 재시도 메시지 간소화 ──
  if (cleaned.includes('재시도')) {
    return '조금 더 다듬고 있어요';
  }

  // ── 5. 나머지는 통과 (이모지 있는 완료 메시지 등) ──
  return cleaned.trim();
}

/** gate 신호 추출 */
function extractGateSignal(progress: string): string | null {
  const m = progress.match(/__STAGE:([A-Z_]+)__/);
  return m ? m[1] : null;
}

/**
 * 블로그 displayStage 결정.
 *
 * gate 플래그(textReady) 기반으로 stage 3(이미지) 진입을 제어한다.
 * monotonic: 현재 displayStage보다 낮으면 무시.
 *
 * 흐름:
 *   1. gate 신호 → 내부 플래그 갱신
 *   2. 플래그 조합 → 허용 가능 최대 stage 계산
 *   3. monotonic 적용: max(현재, 새 stage)
 */
function resolveGatedStage(
  currentStage: DisplayStage,
  gateSignal: string | null,
  textReady: boolean,
  rawProgress: string,
): DisplayStage {
  // gate 신호에 의한 직접 stage 결정
  if (gateSignal === 'SAVING') return Math.max(currentStage, 4) as DisplayStage;
  if (gateSignal === 'IMAGE_START' && textReady) return Math.max(currentStage, 3) as DisplayStage;
  if (gateSignal === 'TEXT_READY') return Math.max(currentStage, 2) as DisplayStage;

  // raw progress에서 힌트 기반 stage 파싱 (gate 신호가 없는 일반 메시지)
  const p = rawProgress.toLowerCase();

  // 저장 키워드 감지
  if (p.includes('모든 생성 작업 완료')) return Math.max(currentStage, 4) as DisplayStage;

  // 이미지 키워드 감지 — 단, textReady gate 통과 필수
  if (textReady && (p.includes('이미지') || p.includes('대표 이미지') || p.includes('대체 렌더'))) {
    return Math.max(currentStage, 3) as DisplayStage;
  }

  // 글 검토 키워드
  if (p.includes('폴리싱') || p.includes('faq') || p.includes('seo 점수')
    || p.includes('검사') || p.includes('파이프라인 생성 완료')) {
    return Math.max(currentStage, 2) as DisplayStage;
  }

  // 글 작성 키워드
  if (p.includes('파이프라인') || p.includes('검색') || p.includes('소제목')
    || p.includes('섹션') || p.includes('도입부') || p.includes('기존 방식')) {
    return Math.max(currentStage, 1) as DisplayStage;
  }

  return currentStage;
}

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
        await deps.handleGenerateCardNews(request, setState, deps.setContentTab as any);
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
    targetSetState(prev => ({ ...prev, isLoading: true, error: null, warning: null, progress: 'SEO 최적화 키워드 분석 및 콘텐츠 생성 중...', displayStage: 1 }));

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
          displayStage: 0,
        }));
        isGeneratingRef.current = false;
      }
    }, GENERATION_HARD_TIMEOUT_MS);

    try {
      // ── 공식 오케스트레이터 진입점: runContentJob ──
      // credit gate 책임은 runContentJob 내부에서 단일 수행.
      // 이 훅에서는 gate를 호출하지 않는다 (카드뉴스만 예외).
      console.info('[GEN_STEP] before main pipeline — runContentJob 호출');
      // 블로그 전용 gate: textReady가 true가 되기 전에는 image stage 진입 차단
      const textReadyRef_ = { current: false };

      const outcome = await runContentJob(request, (p) => {
        // timeout 후 늦은 progress 업데이트 방어
        if (generationIdRef.current !== thisGenId) return;

        // gate 신호 추출 → 내부 플래그 갱신
        const gateSignal = extractGateSignal(p);
        if (gateSignal === 'TEXT_READY') textReadyRef_.current = true;

        // 사용자에게 보이는 progress에서 gate 신호 제거 + 내부 용어 교체
        const cleanProgress = humanizeProgress(stripGateSignal(p));

        // gate + monotonic 기반 displayStage 결정
        targetSetState(prev => {
          const newStage = resolveGatedStage(
            prev.displayStage,
            gateSignal,
            textReadyRef_.current,
            cleanProgress,
          );
          return {
            ...prev,
            progress: cleanProgress || prev.progress,
            displayStage: newStage,
          };
        });
      });

      // timeout 후 늦게 도착한 결과가 UI를 덮지 않도록 방어
      if (generationIdRef.current !== thisGenId) {
        console.warn(`[BLOG_FLOW] ⚠️ 결과 도착했으나 genId 불일치 (${thisGenId} vs ${generationIdRef.current}) — 폐기`);
        return;
      }

      // ── 실패 처리 ──
      if (!outcome.success) {
        const failReason = outcome.gateBlocked ? 'gate_blocked' : 'generation_error';
        console.error(`[BLOG_FLOW] ❌ 생성 실패 (${failReason}):`, outcome.error);
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

      // ── 성공 처리: artifact 기반 ──
      const { artifact } = outcome;
      const result = artifact.content;

      // 📋 결과물 완전성 검증 로그 — "완전한 글 1편" 기준
      const html = result?.fullHtml || result?.htmlContent || '';
      const textOnly = html.replace(/<[^>]+>/g, '').trim();
      const h2Count = (html.match(/<h[23][^>]*>/gi) || []).length;
      const hasIntro = html.indexOf('<h') > 30 || (html.indexOf('<p') >= 0 && html.indexOf('<p') < html.indexOf('<h'));
      const conclusionLength = result?.conclusionLength;
      const hasConclusion = conclusionLength ? conclusionLength >= 20 : textOnly.length > 200;
      const conclusionSource = conclusionLength ? `pipeline(${conclusionLength}자)` : `heuristic(textLen=${textOnly.length})`;
      console.info(`[BLOG_FLOW] ✅ generateFullPost 반환됨`);
      console.info(`[BLOG_FLOW] 📋 완전성 검증: title="${artifact.title}" | fullHtml=${html.length}자 | 텍스트=${textOnly.length}자 | h2/h3=${h2Count}개 | intro=${hasIntro} | conclusion=${hasConclusion} [${conclusionSource}]`);
      if (!artifact.title || h2Count < 2 || textOnly.length < 300) {
        console.error(`[BLOG_FLOW] ⚠️ 완전성 미달 — title=${!!artifact.title}, h2=${h2Count}, textLen=${textOnly.length}`);
      }

      // artifact.warnings → UI warning (이미지 fallback 안내)
      const imageWarning = artifact.imageMeta.failCount > 0
        ? `일부 이미지(${artifact.imageMeta.failCount}장)는 대체 이미지로 제공되었습니다. 해당 이미지를 클릭하면 AI 이미지로 교체할 수 있습니다.`
        : null;
      console.info(`[BLOG_FLOW] setBlogState 호출 직전 — data 존재: ${!!result}, isLoading: false`);
      targetSetState({ isLoading: false, error: null, warning: imageWarning, data: result, progress: '', displayStage: 0 });
      console.info(`[BLOG_FLOW] ✅ setBlogState 완료 — 사용자 화면 전환 대기 (RENDER_GATE에서 RESULT_PREVIEW 확인)`);

      // 사용량 저장 (크레딧 차감은 서버에서 선처리 완료)
      try {
        const { flushSessionUsage } = await import('../services/creditService');
        await flushSessionUsage();
      } catch (e) {
        console.warn('사용량 저장 스킵:', e);
      }

      // API 서버에 자동 저장 — 저장 어댑터 사용
      try {
        const { saveArtifactToServer } = await import('../core/generation/contentStorage');
        const saveResult = await saveArtifactToServer(artifact);
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
