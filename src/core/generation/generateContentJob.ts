/**
 * generateContentJob — 블로그/보도자료 생성의 공식 오케스트레이션 진입점
 *
 * 책임:
 *   1. 크레딧/접근 게이트 실행 (policies.ts) — 이 함수가 gate의 유일한 실행 지점
 *   2. postType별 생성 함수 디스패치 + 이미지 생성 + 후처리
 *   3. 생성 결과를 ContentArtifact shape로 래핑하여 반환
 *
 * gate 책임 규칙:
 *   - 블로그/보도자료: 이 함수 내부에서만 gate 실행 (훅에서 호출 금지)
 *   - 카드뉴스: 별도 워크플로우이므로 훅(useContentGeneration)에서 직접 gate 실행
 *
 * blogPipelineService, legacyBlogGeneration, faqService 등이 stage 실행 계층을 제공한다.
 * 최상위 흐름 책임은 이 파일에 있다.
 */

import type { GenerationRequest, GeneratedContent, FactCheckReport, SeoScoreReport, BlogSection } from '../../types';
import type { ImageQueueItem, ImageQueueResult } from '../../services/image/imageTypes';
import { runCreditGate, type CreditGateResult } from './policies';
import type { ContentArtifact } from './contracts';
import {
  DEFAULT_BLOG_IMAGE_COUNT,
  DEFAULT_CARD_NEWS_SLIDE_COUNT,
  BLOG_IMAGE_RATIO,
  CARD_NEWS_IMAGE_RATIO,
} from './contracts';

// ── 결과 타입 ──

export interface ContentJobResult {
  success: true;
  artifact: ContentArtifact;
  /** @deprecated artifact.content로 접근하라. 기존 소비자 호환용. */
  data: ContentArtifact['content'];
}

export interface ContentJobError {
  success: false;
  error: string;
  /** credit gate에서 차단된 경우 */
  gateBlocked?: boolean;
}

export type ContentJobOutcome = ContentJobResult | ContentJobError;

// ── 공식 진입점 ──

/**
 * 콘텐츠 생성 job 실행.
 *
 * @param request  - 생성 요청 (postType, topic, keywords, ...)
 * @param onProgress - 진행 상황 콜백 (UI 표시용)
 * @returns ContentJobOutcome — 성공 시 artifact + data, 실패 시 error
 *
 * 호출자(useContentGeneration)가 담당하는 것:
 *   - React state 관리 (isLoading, error, data)
 *   - hard timeout
 *   - 스크롤 잠금, 중복 클릭 방어
 *   - 서버 저장, 사용량 플러시
 *
 * 이 함수가 담당하는 것:
 *   - 크레딧 게이트
 *   - postType별 생성 디스패치 + 이미지 + 후처리
 *   - 결과를 ContentArtifact로 래핑
 *   - 에러 래핑
 */
export async function runContentJob(
  request: GenerationRequest,
  onProgress?: (msg: string) => void,
): Promise<ContentJobOutcome> {
  // ── 1. 입력 검증 ──
  if (!request.postType) {
    return {
      success: false,
      error: '콘텐츠 타입이 선택되지 않았습니다.',
    };
  }

  // ── 2. 크레딧 게이트 ──
  const gate: CreditGateResult = await runCreditGate(request.postType);
  if (!gate.allowed) {
    return {
      success: false,
      error: gate.message || '크레딧이 부족합니다.',
      gateBlocked: true,
    };
  }

  // ── 3. 생성 실행 (오케스트레이션) ──
  try {
    const data = await orchestrateFullPost(request, onProgress);

    // ── 4. ContentArtifact 래핑 ──
    const warnings: string[] = [];
    if (data.imageFailCount && data.imageFailCount > 0) {
      warnings.push(`이미지 ${data.imageFailCount}장 생성 실패`);
    }

    const artifact: ContentArtifact = {
      postType: request.postType,
      createdAt: new Date().toISOString(),
      title: data.title,
      content: data,
      category: request.category,
      keywords: request.keywords,
      seoTotal: data.seoScore?.total,
      aiSmellScore: data.factCheck?.ai_smell_score,
      imageMeta: {
        successCount: (request.imageCount ?? 1) - (data.imageFailCount ?? 0),
        failCount: data.imageFailCount ?? 0,
        prompts: data.imagePrompts ?? [],
      },
      warnings,
    };

    return { success: true, artifact, data };
  } catch (err: any) {
    // 한국어 에러 메시지 변환
    let friendlyError: string;
    try {
      const { getKoreanErrorMessage } = await import('../../services/geminiClient');
      friendlyError = getKoreanErrorMessage(err);
    } catch {
      friendlyError = err?.message || '콘텐츠 생성 중 오류가 발생했습니다.';
    }

    if (!friendlyError?.trim()) {
      friendlyError = '콘텐츠 생성 중 오류가 발생했습니다. 다시 시도해주세요.';
    }

    return { success: false, error: friendlyError };
  }
}

// ══════════════════════════════════════════════════════════════
// orchestrateFullPost — 실제 생성 오케스트레이션 (구 generateFullPost)
// ══════════════════════════════════════════════════════════════

/**
 * postType별 전체 생성 오케스트레이션.
 * 구 geminiService.generateFullPost()의 본문을 이관한 것.
 *
 * blogPipelineService, legacyBlogGeneration, faqService 등의 stage 실행 함수들을 호출하고,
 * 이미지 생성, 후처리, 저장까지 수행한다.
 *
 * 이 함수는 이 모듈 내부 전용이다. 외부에서는 runContentJob()을 사용하라.
 */
async function orchestrateFullPost(
  request: GenerationRequest,
  onProgress?: (msg: string) => void,
): Promise<GeneratedContent> {
  const safeProgress = onProgress || ((msg: string) => console.log('📍 Progress:', msg));

  const isCardNews = request.postType === 'card_news';
  const isPressRelease = request.postType === 'press_release';

  console.info(`[BLOG_FLOW] orchestrateFullPost 시작 — postType: ${request.postType}, topic: ${request.topic?.substring(0, 30)}`);
  console.info('• orchestrateFullPost 시작 - request.imageStyle:', request.imageStyle);
  console.info('• orchestrateFullPost 시작 - request.customImagePrompt:', request.customImagePrompt ? request.customImagePrompt.substring(0, 50) : 'undefined/없음');

  // 🗞️ 보도자료: 전용 생성 함수 사용
  if (isPressRelease) {
    const { generatePressRelease } = await import('../../services/pressReleaseService');
    return generatePressRelease(request, safeProgress);
  }

  // 🤖 카드뉴스: 미니 에이전트 방식 사용
  if (isCardNews) {
    return _orchestrateCardNews(request, safeProgress);
  }

  // 📝 블로그: 다단계 파이프라인 또는 레거시 폴백
  return _orchestrateBlog(request, safeProgress);
}

// ── 카드뉴스 오케스트레이션 ──

async function _orchestrateCardNews(
  request: GenerationRequest,
  safeProgress: (msg: string) => void,
): Promise<GeneratedContent> {
  const { STYLE_NAMES } = await import('../../services/image/imagePromptBuilder');
  const { generateSingleImage } = await import('../../services/image/cardNewsImageService');
  const { generateCardNewsWithAgents } = await import('../../services/cardNewsService');
  const { MEDICAL_DISCLAIMER } = await import('../../services/resultAssembler');
  const { persistGeneratedPost } = await import('./contentStorage');
  const { runAiSmellCheck, integrateAiSmellToFactCheck } = await import('../../services/contentQualityService');

  safeProgress('🤖 미니 에이전트 방식으로 카드뉴스 생성 시작...');

  try {
    const agentResult = await generateCardNewsWithAgents(request, safeProgress);

    const styleName = STYLE_NAMES[request.imageStyle] || STYLE_NAMES.illustration;
    safeProgress(`🎨 ${styleName} 스타일로 4:3 이미지 생성 중...`);

    const maxImages = request.slideCount || 6;
    safeProgress(`🎨 ${maxImages}장의 완성형 카드 이미지 생성 중...`);

    const referenceImage = request.coverStyleImage || request.contentStyleImage;
    const copyMode = request.styleCopyMode;

    const { getDesignTemplateById } = await import('../../services/cardNewsDesignTemplates');
    const designTemplate = request.designTemplateId ? getDesignTemplateById(request.designTemplateId) : undefined;
    const effectiveCustomStyle = designTemplate?.stylePrompt || request.customImagePrompt;

    if (!agentResult.imagePrompts || !Array.isArray(agentResult.imagePrompts)) {
      agentResult.imagePrompts = [];
    }

    if (agentResult.imagePrompts.length > 0) {
      console.log('🎨 첫 생성 imagePrompts:', agentResult.imagePrompts.map((p: string, i: number) => ({ index: i, promptHead: p.substring(0, 200) })));
    }

    // ── 개별 timeout + 실패 격리 순차 루프 ──
    const IMAGE_TIMEOUT_MS = 60_000;
    const totalCards = Math.min(maxImages, agentResult.imagePrompts.length);
    const images: { index: number; data: string; prompt: string; failed: boolean }[] = [];
    let failedCount = 0;

    for (let i = 0; i < totalCards; i++) {
      safeProgress(`🎨 카드 이미지 ${i + 1}/${totalCards}장 생성 중...`);
      try {
        const imagePromise = generateSingleImage(
          agentResult.imagePrompts[i],
          request.imageStyle,
          "1:1",
          effectiveCustomStyle,
          referenceImage,
          copyMode
        );
        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error(`이미지 ${i + 1}장 timeout (${IMAGE_TIMEOUT_MS / 1000}초)`)), IMAGE_TIMEOUT_MS)
        );
        const img = await Promise.race([imagePromise, timeoutPromise]);
        images.push({ index: i + 1, data: img, prompt: agentResult.imagePrompts[i], failed: false });
        safeProgress(`✅ 카드 이미지 ${i + 1}/${totalCards}장 완료`);
      } catch (imgErr: any) {
        console.warn(`⚠️ 카드 ${i + 1} 이미지 생성 실패 (계속 진행):`, imgErr?.message);
        images.push({ index: i + 1, data: '', prompt: agentResult.imagePrompts[i], failed: true });
        failedCount++;
        safeProgress(`⚠️ 이미지 ${i + 1}/${totalCards}장 실패 — 다음 카드 진행 중...`);
      }
    }

    if (failedCount > 0) {
      safeProgress(`🖼️ 이미지 완료: ${totalCards - failedCount}장 성공, ${failedCount}장 fallback 적용`);
    }

    const cleanAltText = (text: string) => text
      .replace(/[A-Za-z0-9+/=_-]{10,}/g, '')
      .replace(/[a-zA-Z0-9]{5,}\/[a-zA-Z0-9/]+/g, '')
      .replace(/[^\uAC00-\uD7AF가-힣a-zA-Z0-9\s.,!?~():-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);

    const sc = agentResult.styleConfig;
    const cardBorderRadius = sc?.borderRadius || '24px';
    const cardBoxShadow = sc?.boxShadow || '0 4px 16px rgba(0,0,0,0.08)';
    const cardBorderStyle = sc?.borderWidth && sc.borderWidth !== '0'
      ? `border: ${sc.borderWidth} solid ${sc.borderColor};`
      : '';
    const bgColor = sc?.backgroundColor || '#E8F4FD';
    const textColor = '#1E293B';
    const subtitleColor = '#64748B';

    const cardSlides = images.map((img) => {
      if (img.data && !img.failed) {
        return `
          <div class="card-slide" style="border-radius: ${cardBorderRadius}; ${cardBorderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${cardBoxShadow};">
            <img src="${img.data}" alt="${cleanAltText(img.prompt)}" data-index="${img.index}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>`;
      }
      // ── Readable fallback SVG (텍스트 포함) ──
      const cardPrompt = agentResult.cardPrompts?.[img.index - 1];
      const tp = cardPrompt?.textPrompt || {};
      const escSvg = (t: string) => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const svgSub = escSvg(tp.subtitle || '').substring(0, 40);
      const svgMain = escSvg(tp.mainTitle || `카드 ${img.index}`).substring(0, 25);
      const svgDesc = escSvg(tp.description || '').substring(0, 50);
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect fill="${bgColor}" width="800" height="800" rx="24"/><rect fill="#fff" x="50" y="50" width="700" height="700" rx="20" opacity="0.85"/><text x="400" y="280" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="${subtitleColor}">${svgSub}</text><text x="400" y="360" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="${textColor}">${svgMain}</text>${svgDesc ? `<text x="400" y="420" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="${subtitleColor}">${svgDesc}</text>` : ''}<text x="400" y="540" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#94A3B8">카드를 클릭하여 이미지를 재생성하세요</text></svg>`;
      const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(fallbackSvg))) : Buffer.from(fallbackSvg).toString('base64');
      return `
          <div class="card-slide" style="border-radius: ${cardBorderRadius}; ${cardBorderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${cardBoxShadow};">
            <img src="data:image/svg+xml;base64,${b64}" alt="카드 ${img.index} (재생성 필요)" data-index="${img.index}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>`;
    }).join('\n');

    const finalHtml = `
      <div class="card-news-container">
        <h2 class="hidden-title">${agentResult.title}</h2>
        <div class="card-grid-wrapper">
          ${cardSlides}
        </div>
        <div class="legal-box-card">${MEDICAL_DISCLAIMER}</div>
      </div>
    `.trim();

    // 카드뉴스 텍스트 AI 냄새 검사
    const cardTexts = agentResult.cardPrompts?.map((card: any) => {
      const tp = card.textPrompt;
      return `${tp.subtitle || ''} ${tp.mainTitle || ''} ${tp.description || ''}`;
    }).join(' ') || '';

    safeProgress('🔍 카드뉴스 텍스트 AI 냄새 검사 중...');
    const cardAiSmellCheck = runAiSmellCheck(cardTexts);

    let cardFactCheck: FactCheckReport = {
      fact_score: 85,
      safety_score: 90,
      conversion_score: 80,
      ai_smell_score: cardAiSmellCheck.score,
      verified_facts_count: 5,
      issues: [],
      recommendations: []
    };

    cardFactCheck = integrateAiSmellToFactCheck(cardFactCheck, cardAiSmellCheck);

    if (cardAiSmellCheck.criticalIssues.length > 0) {
      safeProgress(`🚨 카드뉴스 텍스트에 금지 패턴 ${cardAiSmellCheck.criticalIssues.length}개 발견!`);
    } else {
      safeProgress('✅ 카드뉴스 생성 완료!');
    }

    // [Layer 1] Result Persistence — Supabase generated_posts
    persistGeneratedPost(request, {
      postType: 'card_news',
      title: agentResult.title,
      contentHtml: finalHtml,
      slideCount: images.length,
    }).catch(err => console.warn('⚠️ 카드뉴스 저장 예외:', err));

    return {
      title: agentResult.title,
      htmlContent: finalHtml,
      imageUrl: images[0]?.data || "",
      fullHtml: finalHtml,
      tags: [],
      factCheck: cardFactCheck,
      postType: 'card_news',
      imageStyle: request.imageStyle,
      customImagePrompt: request.customImagePrompt,
      cardPrompts: agentResult.cardPrompts,
      cssTheme: request.cssTheme || 'modern'
    };
  } catch (error: any) {
    // 카드뉴스 실패 시 블로그 코어를 fallback으로 사용하지 않음 (모드 격리)
    // 이전: _orchestrateBlog({ ...request, postType: 'card_news' as any }) → blast radius
    console.error('[CARD_NEWS] 미니 에이전트 방식 실패:', error?.message);
    throw new Error('카드뉴스 생성에 실패했습니다. 다시 시도해주세요.');
  }
}

// ── 블로그 오케스트레이션 ──

async function _orchestrateBlog(
  request: GenerationRequest,
  safeProgress: (msg: string) => void,
): Promise<GeneratedContent> {
  // Stage 실행 함수: SOT 파일에서 직접 import
  const { generateBlogWithPipeline } = await import('../../services/blogPipelineService');
  const { generateBlogPostText } = await import('../../services/legacyBlogGeneration');
  const { generateFaqSection, generateSmartBlockFaq } = await import('../../services/faqService');
  const { runAiSmellCheck, integrateAiSmellToFactCheck } = await import('../../services/contentQualityService');

  const { STYLE_NAMES } = await import('../../services/image/imagePromptBuilder');
  const { generateImageQueue } = await import('../../services/image/imageOrchestrator');
  const { generateSingleImage } = await import('../../services/image/cardNewsImageService');
  const { updateSessionFinalPayload } = await import('../../services/image/imageOrchestrator');
  const { callGemini, TIMEOUTS } = await import('../../services/geminiClient');
  const { persistGeneratedPost, persistBlogHistory } = await import('./contentStorage');
  const {
    MEDICAL_DISCLAIMER,
    cleanMarkdownArtifacts,
    ensureContainerWrapper,
    generateCardNewsFallbackTemplate,
    normalizeSubtitles,
    insertImageMarkers,
    insertImageData,
    applyCardNewsStyles,
    wrapFinalHtml,
  } = await import('../../services/resultAssembler');

  let textData: any;
  let _polishPromise: Promise<{ content: string; polishModel: string; finalQualityPath: string; stageCMs: number }> | null = null;

  if (request.postType === 'blog' && !request.referenceUrl) {
    // 다단계 파이프라인 사용 (블로그 전용)
    safeProgress('🚀 다단계 파이프라인으로 블로그 생성 시작...');
    try {
      safeProgress('🔍 최신 정보 검색 중...');
      let pipelineSearchResults: any = {};
      try {
        const searchResponseText = await callGemini({
          prompt: `"${request.topic}" 관련 최신 치과 의료 정보 검색. health.kdca.go.kr 우선. JSON: {"collected_facts": [{"fact": "...", "source": "..."}]}`,
          model: "gemini-3.1-flash-lite-preview",
          googleSearch: true,
          responseType: 'text',
          timeout: TIMEOUTS.QUICK_OPERATION,
        });
        const rawText = (typeof searchResponseText === 'string' ? searchResponseText : JSON.stringify(searchResponseText)) || '{}';
        try {
          const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*"collected_facts"[\s\S]*\}/);
          pipelineSearchResults = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : rawText.trim());
        } catch { pipelineSearchResults = { collected_facts: [] }; }
      } catch { pipelineSearchResults = { collected_facts: [] }; }

      const pipelineResult = await generateBlogWithPipeline(request, pipelineSearchResults, safeProgress);
      _polishPromise = pipelineResult.polishPromise;
      textData = {
        title: pipelineResult.title,
        content: pipelineResult.rawHtml,
        imagePrompts: pipelineResult.imagePrompts,
        conclusionLength: pipelineResult.conclusionLength,
        fact_check: {
          fact_score: 85,
          safety_score: 90,
          conversion_score: 75,
          ai_smell_score: 10,
          verified_facts_count: 5,
          issues: [],
          recommendations: []
        }
      };
      // gate 신호: 텍스트 draft 완료 → UI에서 "글 검토" 단계 진입 허용
      safeProgress('__STAGE:TEXT_READY__ ✅ 다단계 파이프라인 생성 완료! (폴리싱 병렬 진행 중)');
      console.info(`[BLOG_FLOW] ✅ 파이프라인 textData 확보 — title: "${textData.title}", rawHtml: ${textData.content?.length || 0}자, polishPromise=async`);
      console.info(`[PIPELINE_RESULT] source=pipeline`);
    } catch (pipelineError: any) {
      const failReason = `${pipelineError?.status || 'N/A'} ${pipelineError?.message?.substring(0, 120) || 'unknown'}`;
      console.error(`[BLOG_FLOW] ❌ 파이프라인 실패: ${pipelineError?.message}`);
      console.warn(`[BLOG_FLOW] ⚠️ 구형 generateBlogPostText 폴백 진입 — 원인: ${failReason}`);
      safeProgress('⚠️ 파이프라인 실패, 기존 방식으로 재시도...');
      try {
        textData = await generateBlogPostText(request, safeProgress);
        // gate 신호: 레거시 경로에서도 텍스트 완료 통지
        safeProgress('__STAGE:TEXT_READY__ ✅ 텍스트 생성 완료');
        console.info(`[BLOG_FLOW] ✅ 구형 폴백 성공 — title: "${textData?.title}", content: ${textData?.content?.length || 0}자`);
        console.info(`[PIPELINE_RESULT] source=legacy_fallback | reason=${failReason} | textLength=${textData?.content?.length || 0} | imagePrompts=${textData?.imagePrompts?.length || 0} | model=PRO(60s,JSON,googleSearch)`);
      } catch (fallbackError: any) {
        console.error(`[BLOG_FLOW] ❌ 구형 폴백도 실패: ${fallbackError?.message}`);
        throw new Error(pipelineError?.message || '블로그 생성에 실패했습니다. 다시 시도해주세요.');
      }
    }
  } else {
    // 카드뉴스 폴백 또는 레퍼런스 URL 사용 시 기존 방식
    const hasStyleRef = request.postType === 'card_news' && (request.coverStyleImage || request.contentStyleImage);
    if (hasStyleRef) {
      if (request.coverStyleImage && request.contentStyleImage) {
        safeProgress('🎨 표지/본문 스타일 분석 중...');
      } else if (request.coverStyleImage) {
        safeProgress('🎨 표지 스타일 분석 중 (본문도 동일 적용)...');
      } else {
        safeProgress('🎨 본문 스타일 분석 중...');
      }
    }

    const step1Msg = hasStyleRef
      ? `참고 이미지 스타일로 카드뉴스 생성 중...`
      : request.referenceUrl
      ? `🔗 레퍼런스 URL 분석 및 ${request.postType === 'card_news' ? '카드뉴스 템플릿 모방' : '스타일 벤치마킹'} 중...`
      : `네이버 로직 분석 및 ${request.postType === 'card_news' ? '카드뉴스 기획' : '블로그 원고 작성'} 중...`;

    safeProgress(step1Msg);
    textData = await generateBlogPostText(request, safeProgress);
    // gate 신호: 레퍼런스/카드뉴스 경로에서도 텍스트 완료 통지
    if (request.postType === 'blog') {
      safeProgress('__STAGE:TEXT_READY__ ✅ 텍스트 생성 완료');
    }
    console.info(`[PIPELINE_RESULT] source=legacy_direct (referenceUrl or non-blog)`);
  }

  const styleName = STYLE_NAMES[request.imageStyle] || STYLE_NAMES.illustration;
  const imgRatio = request.postType === 'card_news' ? CARD_NEWS_IMAGE_RATIO : BLOG_IMAGE_RATIO;

  // gate 신호: 이미지 생성 단계 진입 (textReady gate 통과 시만 UI에 반영)
  safeProgress(`__STAGE:IMAGE_START__ 🎨 ${styleName} 스타일로 ${imgRatio} 이미지 생성 중...`);

  const selectedImageCount = request.postType === 'card_news' ? (request.slideCount || DEFAULT_CARD_NEWS_SLIDE_COUNT) : (request.imageCount ?? DEFAULT_BLOG_IMAGE_COUNT);
  const maxImages = selectedImageCount;

  console.info(`[IMG-CONTRACT] selected=${selectedImageCount} maxImages=${maxImages} postType=${request.postType} promptsAvailable=${textData.imagePrompts?.length || 0}`);

  const fallbackReferenceImage = request.coverStyleImage || request.contentStyleImage;
  const fallbackCopyMode = request.styleCopyMode;

  let images: { index: number; data: string; prompt: string }[] = [];
  let imageFailCount = 0;

  const generatedPromptCount = textData.imagePrompts?.length || 0;
  if (!textData.imagePrompts || !Array.isArray(textData.imagePrompts)) {
    console.warn(`[IMG-CONTRACT] ⚠️ imagePrompts 미생성 — 빈 배열 초기화`);
    textData.imagePrompts = [];
  } else {
    console.info(`[IMG-CONTRACT] generatedPromptCount=${generatedPromptCount} selected=${selectedImageCount}`);
  }

  // 비상 패딩
  if (maxImages > 0 && textData.imagePrompts.length < maxImages) {
    console.warn(`[IMG-CONTRACT] ⚠️ 비상 패딩 발동! generated=${textData.imagePrompts.length} selected=${maxImages} — 파이프라인 프롬프트 부족`);
    const defaultPrompt = `${request.topic} — 의료/구강 건강 맥락의 현실적 이미지. ${request.imageStyle === 'illustration' ? '3D 일러스트, 파스텔톤' : request.imageStyle === 'medical' ? '의학 해부도, 전문 의료 이미지' : '실사 사진, DSLR 촬영'}. 현대 한국인, 현대적 일상복 또는 의료복.`;
    while (textData.imagePrompts.length < maxImages) {
      textData.imagePrompts.push(defaultPrompt);
      console.log(`   + 패딩 프롬프트 추가: ${textData.imagePrompts.length}/${maxImages}`);
    }
  }

  if (maxImages > 0 && textData.imagePrompts.length > 0) {
    const imgStart = Date.now();

    if (request.postType === 'card_news') {
      safeProgress(`🎨 카드뉴스 이미지 ${maxImages}장 생성 중...`);
      for (let i = 0; i < maxImages; i++) {
        const p = textData.imagePrompts[i];
        const t0 = Date.now();
        safeProgress(`🎨 카드 이미지 ${i + 1}/${maxImages}장 생성 중...`);
        try {
          const img = await generateSingleImage(p, request.imageStyle, imgRatio, request.customImagePrompt, fallbackReferenceImage, fallbackCopyMode);
          const isFallback = img.includes('image/svg+xml');
          if (isFallback) { imageFailCount++; }
          images.push({ index: i + 1, data: img, prompt: p });
          if (!isFallback) safeProgress(`✅ 카드 이미지 ${i + 1}/${maxImages}장 완료`);
        } catch (imgErr: any) {
          console.warn(`[IMG] card #${i + 1} exception ${Date.now() - t0}ms: ${(imgErr?.message || '').substring(0, 60)}`);
          imageFailCount++;
        }
        if (i < maxImages - 1) {
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        }
      }
    } else {
      // 블로그: 웨이브 기반 이미지 생성 (0~N장 범용 정책)
      const { planBlogImageWaves, buildHeroRetryItem } = await import('./blogImagePlanner');
      const waves = planBlogImageWaves(
        textData.imagePrompts,
        maxImages,
        request.imageStyle,
        imgRatio,
        request.customImagePrompt,
      );

      const allQueueResults: ImageQueueResult[] = [];
      for (let wi = 0; wi < waves.length; wi++) {
        const wave = waves[wi];
        // 단일 웨이브면 라벨 생략, 복수 웨이브면 차수 표시
        const waveLabel = waves.length > 1 ? ` ${wave.label}` : '';
        safeProgress(`🎨 이미지${waveLabel}: ${wave.items.length}장 생성 중...`);

        // wave 간 간격: nb2 슬롯 회복 + API rate limit 완화 (첫 wave 제외)
        if (wi > 0) {
          const gapMs = 2000 + Math.random() * 1000;
          console.info(`[IMG-WAVE] wave gap ${Math.round(gapMs)}ms before ${wave.label}`);
          await new Promise(r => setTimeout(r, gapMs));
        }

        // progress 래퍼: wave 내 인덱스 대신 전체 기준으로 재포맷
        const totalImageCount = maxImages;
        const waveProgress = (msg: string) => {
          // "이미지 {wave내idx}/{wave내total}장" → "이미지 {전체기준}/{전체total}장"으로 교체
          const fixed = msg.replace(
            /이미지 (\d+)\/(\d+)장/,
            (_, idxStr) => {
              const idx = parseInt(idxStr, 10);
              return `이미지 ${idx}/${totalImageCount}장`;
            }
          );
          safeProgress(fixed);
        };
        const waveResults = await generateImageQueue(wave.items, waveProgress);
        allQueueResults.push(...waveResults);

        for (const qr of waveResults) {
          images.push({ index: qr.index + 1, data: qr.data, prompt: qr.prompt });
          if (qr.status === 'fallback') imageFailCount++;
        }
      }

      // ── hero 재시도: hero가 template이면 간결 프롬프트로 1회 추가 시도 ──
      // 근거: hero chain(startTier=pro)은 heroPrompt(복합 5줄)로만 2회 시도.
      //        timeout이 프롬프트 복잡도 때문이면 둘 다 실패한다.
      //        간결 프롬프트(1줄)는 생성 시간 10-20s → manual 35s timeout 내 성공 확률 높음.
      const heroQR = allQueueResults.find(r => r.role === 'hero');
      if (heroQR && heroQR.resultType === 'template') {
        safeProgress('🔄 대표 이미지 재시도 중 (간결 프롬프트)...');
        const retryItem = buildHeroRetryItem(
          request.topic,
          request.imageStyle,
          imgRatio,
          request.customImagePrompt,
        );
        const retryResults = await generateImageQueue([retryItem], safeProgress);
        const retryHero = retryResults[0];

        if (retryHero && retryHero.resultType === 'ai-image') {
          // hero 교체: images 배열 + allQueueResults 모두 갱신
          const heroImgIdx = images.findIndex(img => img.index === 1);
          if (heroImgIdx >= 0) {
            images[heroImgIdx] = { index: 1, data: retryHero.data, prompt: retryHero.prompt };
            imageFailCount = Math.max(0, imageFailCount - 1);
          }
          const heroQRIdx = allQueueResults.findIndex(r => r.role === 'hero');
          if (heroQRIdx >= 0) allQueueResults[heroQRIdx] = retryHero;
          console.info('[IMG-HERO-RETRY] ✅ hero 재시도 성공 (간결 프롬프트)');
          safeProgress('✅ 대표 이미지 재시도 성공!');
        } else {
          console.warn('[IMG-HERO-RETRY] ⚠️ hero 재시도 실패 — 보조 비주얼 유지');
          safeProgress('⚠️ 대표 이미지 재시도 실패 — 보조 비주얼 유지');
        }
      }

      const plannedSlotCount = maxImages;
      const aiSlots = allQueueResults.filter(r => r.resultType === 'ai-image').length;
      const templateSlots = allQueueResults.filter(r => r.resultType === 'template').length;
      const placeholderSlots = allQueueResults.filter(r => r.resultType === 'placeholder').length;
      const slotFillRate = selectedImageCount > 0 ? Math.round((images.length / selectedImageCount) * 100) : 100;
      console.info(`[IMG-SUMMARY] selected=${selectedImageCount} planned=${plannedSlotCount} returned=${images.length} ai=${aiSlots} template=${templateSlots} placeholder=${placeholderSlots} slotFillRate=${slotFillRate}%`);
      if (images.length < selectedImageCount) {
        console.error(`[IMG-SUMMARY] ⛔ 수량 계약 위반! selected=${selectedImageCount} returned=${images.length}`);
      }
    }

    const imgElapsed = Date.now() - imgStart;
    console.info(`[IMG] total: ${images.length}/${maxImages} images, ${imageFailCount} fallback, ${imgElapsed}ms`);
    if (imageFailCount > 0 && imageFailCount === images.length) {
      safeProgress(`⚠️ 이미지 ${imageFailCount}장 AI 생성 실패 — 대체 이미지 적용`);
    } else if (imageFailCount > 0) {
      safeProgress(`⚠️ 이미지 ${imageFailCount}장 AI 생성 실패 — 일부 대체 이미지 적용`);
    }
  } else {
    console.info(`[IMG-CONTRACT] selected=0 planned=0 — 이미지 생성 스킵`);
    console.info(`[IMG-SUMMARY] selected=0 returned=0 inserted=0`);
    safeProgress('📝 이미지 없이 텍스트만 생성 완료');
  }

  // Stage C 폴리싱 결과 대기
  if (_polishPromise) {
    try {
      const polishResult = await _polishPromise;
      textData.content = polishResult.content;
      console.info(`[BLOG_FLOW] ✅ Stage C polish 완료 — model=${polishResult.polishModel}, path=${polishResult.finalQualityPath}, ${polishResult.stageCMs}ms, content=${polishResult.content.length}자`);
    } catch (polishErr: any) {
      console.warn(`[BLOG_FLOW] ⚠️ Stage C polish 실패, rawHtml 유지 — ${polishErr?.message?.substring(0, 80)}`);
    }
  }

  let body = textData.content || (textData as any).contentHtml || '';
  console.info(`[BLOG_FLOW] body 확보됨: ${body ? body.length : 0}자, title: "${textData.title}"`);
  if (!body || body.trim() === '') {
    console.error('❌ textData.content/contentHtml 둘 다 비어있습니다:', textData);
    throw new Error('AI가 콘텐츠를 생성하지 못했습니다. 다시 시도해주세요.');
  }

  // 후처리 안전망
  const safeMinimalResult = (): GeneratedContent => {
    const minimalHtml = body.includes('class="naver-post-container"')
      ? body
      : `<div class="naver-post-container">${body}</div>`;
    return {
      title: textData.title || request.topic,
      htmlContent: minimalHtml,
      imageUrl: "",
      fullHtml: minimalHtml,
      tags: [],
      postType: request.postType,
      imageStyle: request.imageStyle,
      cssTheme: request.cssTheme || 'modern',
      imageFailCount,
      imagePrompts: textData.imagePrompts,
    };
  };

  try {
    body = cleanMarkdownArtifacts(body);
    body = ensureContainerWrapper(body, request.postType);

    if (request.postType === 'card_news') {
      body = generateCardNewsFallbackTemplate(body, request.slideCount || 6, request.topic);
    }

    if (request.postType === 'blog') {
      body = normalizeSubtitles(body);
    }

    body = insertImageMarkers(body, images.length, request.postType);

    const imgResult = insertImageData(body, images, request.postType, selectedImageCount);
    body = imgResult.html;
    const blobUrls = imgResult.blobUrls;

    if (request.postType === 'card_news') {
      body = applyCardNewsStyles(body, textData.analyzedStyle);
      if (textData.analyzedStyle?.backgroundColor) {
        safeProgress(`🎨 템플릿 색상(${textData.analyzedStyle.backgroundColor}) 적용 완료`);
      }
    }

    let finalHtml = wrapFinalHtml(body, {
      postType: request.postType,
      topic: request.topic,
      title: textData.title,
    });

    // FAQ 섹션 생성 (블로그 전용)
    if (request.postType === 'blog' && request.includeFaq) {
      safeProgress('❓ FAQ 섹션 생성 시작 (스마트블록 최적화)...');
      try {
        const [faqHtmlResult, smartBlockResult] = await Promise.allSettled([
          generateFaqSection(
            request.topic,
            request.keywords || '',
            request.faqCount || 3,
            safeProgress
          ),
          generateSmartBlockFaq(
            request.topic,
            request.keywords || '',
            Math.min(request.faqCount || 3, 3),
            safeProgress
          )
        ]);

        const faqHtml = faqHtmlResult.status === 'fulfilled' ? faqHtmlResult.value : '';

        let smartBlockHtml = '';
        if (smartBlockResult.status === 'fulfilled' && smartBlockResult.value.length > 0) {
          const faqs = smartBlockResult.value;
          const faqSchemaItems = faqs.map((faq: any) =>
            `{"@type":"Question","name":"${faq.question.replace(/"/g, '\\"')}","acceptedAnswer":{"@type":"Answer","text":"${faq.answer.replace(/"/g, '\\"')}"}}`
          ).join(',');

          smartBlockHtml = `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchemaItems}]}
</script>`;

          if (!faqHtml) {
            smartBlockHtml += `
<div class="faq-section smart-block-faq">
  <h3 class="faq-title">자주 묻는 질문</h3>
  ${faqs.map((faq: any) => `
  <div class="faq-item">
    <p class="faq-question">Q. ${faq.question}</p>
    <div class="faq-answer">
      <p>${faq.answer}</p>
    </div>
  </div>`).join('')}
</div>`;
          }
          safeProgress(`✅ 스마트블록 FAQ ${faqs.length}개 추가`);
        }

        const combinedFaq = (faqHtml || '') + smartBlockHtml;

        if (combinedFaq) {
          if (finalHtml.includes('</div>')) {
            const lastDivIndex = finalHtml.lastIndexOf('</div>');
            finalHtml = finalHtml.slice(0, lastDivIndex) + combinedFaq + finalHtml.slice(lastDivIndex);
          } else {
            finalHtml += combinedFaq;
          }
          safeProgress('✅ FAQ 섹션 추가 완료! (스마트블록 최적화 포함)');
        }
      } catch (faqError) {
        console.warn('⚠️ FAQ 생성 실패 (스킵):', faqError);
      }
    }

    // SEO 점수
    let seoScore: SeoScoreReport | undefined = textData.seoScore;
    if (request.postType === 'blog') {
      if (seoScore) {
        console.log('📊 이미 평가된 SEO 점수 사용:', seoScore.total);
        if (seoScore.total >= 85) {
          safeProgress(`✅ SEO 점수 ${seoScore.total}점`);
        } else {
          safeProgress(`ℹ️ SEO 점수 ${seoScore.total}점`);
        }
      }
      console.log('🔇 AI 냄새 점수 검사 비활성화됨 (사용자 설정)');
    }

    // 최종 AI 냄새 검사 (데이터만 유지, 경고 비활성화)
    const aiSmellCheckResult = runAiSmellCheck(finalHtml);

    let finalFactCheck = textData.fact_check || {
      fact_score: 85,
      safety_score: 90,
      conversion_score: 80,
      ai_smell_score: 0,
      verified_facts_count: 5,
      issues: [],
      recommendations: []
    };

    finalFactCheck = integrateAiSmellToFactCheck(finalFactCheck, aiSmellCheckResult);

    console.log('🔇 AI 냄새 검사 완료 (결과 출력 비활성화):', {
      score: aiSmellCheckResult.score,
      criticalCount: aiSmellCheckResult.criticalIssues.length,
      warningCount: aiSmellCheckResult.warningIssues.length
    });

    // 저장용 HTML: blob URL → Supabase Storage URL
    let storageHtml = finalHtml;
    if (images.length > 0) {
      try {
        const { restoreAndUploadImages } = await import('../../services/image/imageStorageService');
        storageHtml = await restoreAndUploadImages(finalHtml, images);
        console.info(`[STORAGE] blob→URL 업로드 완료 | display=${finalHtml.length}자(${Math.round(finalHtml.length*2/1024)}KB) | storage=${storageHtml.length}자(${Math.round(storageHtml.length*2/1024)}KB)`);
      } catch (uploadErr) {
        console.warn('[STORAGE] 이미지 업로드 실패, SVG 보존 + raster strip:', uploadErr);
        const { stripLargeBase64FromHtml } = await import('../../services/image/imageStorageService');
        storageHtml = stripLargeBase64FromHtml(finalHtml);
      }
    }

    // 세션 통계 기록
    const persistedHtmlKB = Math.round(storageHtml.length * 2 / 1024);
    if (images.length > 0) {
      updateSessionFinalPayload(persistedHtmlKB, persistedHtmlKB);
    }

    // 블로그 이력 저장 (비동기)
    const plainTextForEmbedding = (textData.content || '')
      .replace(/\[IMG_\d+\]/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let blogHistoryContent: string;
    let embedSource: string;
    if (plainTextForEmbedding.length >= 50) {
      blogHistoryContent = plainTextForEmbedding;
      embedSource = 'plainText';
    } else {
      const fallbackText = storageHtml
        .replace(/src="data:image[^"]*"/gi, 'src=""')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (fallbackText.length >= 50) {
        blogHistoryContent = fallbackText;
        embedSource = 'fallbackHtml';
      } else {
        blogHistoryContent = textData.title || request.topic || '';
        embedSource = 'fallbackTitle';
      }
    }

    const hasBlobInHistory = storageHtml.includes('blob:');
    // 공용 strip 함수 사용 — SVG template 보존, raster base64만 제거
    const { stripLargeBase64FromHtml: stripForHistory } = await import('../../services/image/imageStorageService');
    const lightweightHtml = stripForHistory(storageHtml);
    console.info(`[STORAGE] saveBlogHistory lightweight | original=${storageHtml.length}자(${Math.round(storageHtml.length * 2 / 1024)}KB) | lightweight=${lightweightHtml.length}자(${Math.round(lightweightHtml.length * 2 / 1024)}KB) | imagesStripped=true | contentType=${embedSource} | contentLen=${blogHistoryContent.length}자 | blob잔류=${hasBlobInHistory}`);
    // [Layer 2] History Persistence — Supabase blog_history (유사도 검사용)
    persistBlogHistory({
      title: textData.title,
      plainText: blogHistoryContent,
      lightweightHtml,
      keywords: request.keywords?.split(',').map(k => k.trim()) || [request.topic],
      category: request.category,
    }).catch(error => {
      console.warn('⚠️ 블로그 이력 저장 실패 (무시):', error);
    });

    // [Layer 1] Result Persistence — Supabase generated_posts
    persistGeneratedPost(request, {
      postType: 'blog',
      title: textData.title,
      contentHtml: storageHtml,
    }).catch(err => console.warn('⚠️ 블로그 포스트 저장 예외:', err));

    // 블로그 섹션 분리
    let sections: BlogSection[] | undefined;
    if (request.postType === 'blog') {
      try {
        sections = parseBlogSections(finalHtml);
        console.log(`📋 블로그 섹션 분리 완료: ${sections.length}개`);
      } catch (e) {
        console.warn('⚠️ 블로그 섹션 분리 실패:', e);
      }
    }

    safeProgress('__STAGE:SAVING__ ✅ 모든 생성 작업 완료!');
    console.info(`[BLOG_FLOW] ✅ orchestrateFullPost 반환 직전 — title: "${textData.title}", htmlContent: ${finalHtml.length}자, imageFailCount: ${imageFailCount}`);

    return {
      title: textData.title,
      htmlContent: finalHtml,
      imageUrl: images[0]?.data || "",
      fullHtml: finalHtml,
      tags: [],
      factCheck: finalFactCheck,
      postType: request.postType,
      imageStyle: request.imageStyle,
      customImagePrompt: request.customImagePrompt,
      seoScore,
      cssTheme: request.cssTheme || 'modern',
      sections,
      imageFailCount,
      imagePrompts: textData.imagePrompts,
      conclusionLength: textData.conclusionLength,
      generatedImages: images,
      blobUrls,
      storageHtml,
    };

  } catch (postProcessError) {
    console.error('⚠️ 후처리 중 오류 발생, 텍스트만 반환:', postProcessError);
    safeProgress('⚠️ 일부 처리 실패 — 텍스트 본문만 반환합니다');
    const result = safeMinimalResult();
    result.imageFailCount = imageFailCount > 0 ? imageFailCount : (maxImages > 0 ? maxImages : 0);
    return result;
  }
}

// ── 유틸리티: 블로그 섹션 파싱 ──

function parseBlogSections(html: string): BlogSection[] {
  const sections: BlogSection[] = [];

  const containerMatch = html.match(/<div[^>]*class="naver-post-container"[^>]*>([\s\S]*)<\/div>\s*$/);
  const content = containerMatch ? containerMatch[1] : html;

  let headingRegex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const h3Matches: { index: number; title: string; fullMatch: string }[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    h3Matches.push({
      index: match.index,
      title: match[1].replace(/<[^>]+>/g, '').trim(),
      fullMatch: match[0]
    });
  }

  if (h3Matches.length === 0) {
    headingRegex = /<h2[^>]*(?!class="[^"]*(?:main-title|hidden-title)[^"]*")[^>]*>([\s\S]*?)<\/h2>/gi;
    while ((match = headingRegex.exec(content)) !== null) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      if (title && !title.includes('FAQ') && !title.includes('자주 묻는')) {
        h3Matches.push({ index: match.index, title, fullMatch: match[0] });
      }
    }
  }

  if (h3Matches.length === 0) return sections;

  const introHtml = content.substring(0, h3Matches[0].index).trim();
  if (introHtml && introHtml.replace(/<[^>]+>/g, '').trim().length > 10) {
    sections.push({ index: 0, type: 'intro', title: '도입부', html: introHtml });
  }

  for (let i = 0; i < h3Matches.length; i++) {
    const start = h3Matches[i].index;
    const end = i + 1 < h3Matches.length ? h3Matches[i + 1].index : content.length;
    const sectionHtml = content.substring(start, end).trim();

    if (h3Matches[i].title.includes('자주 묻는') || h3Matches[i].title.includes('FAQ')) continue;

    sections.push({
      index: sections.length,
      type: 'section',
      title: h3Matches[i].title,
      html: sectionHtml
    });
  }

  return sections;
}

