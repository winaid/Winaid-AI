import { useState } from 'react';
import { GenerationRequest, GenerationState, CardNewsScript, CardPromptData } from '../types';

interface CardNewsWorkflowState {
  cardNewsScript: CardNewsScript | null;
  cardNewsPrompts: CardPromptData[] | null;
  pendingRequest: GenerationRequest | null;
  scriptProgress: string;
  isGeneratingScript: boolean;
  currentStep: 1 | 2 | 3;
}

interface CardNewsWorkflowActions {
  handleGenerateCardNews: (request: GenerationRequest, setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>, setContentTab: (tab: string) => void) => Promise<void>;
  handleRegenerateScript: (setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>) => Promise<void>;
  handleApproveScript: (setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>) => Promise<void>;
  handleApprovePrompts: (setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>) => Promise<void>;
  handleEditPrompts: (updatedPrompts: CardPromptData[]) => void;
  handleBackToScript: () => void;
  handleEditScript: (updatedScript: CardNewsScript) => void;
}

export function useCardNewsWorkflow(): CardNewsWorkflowState & CardNewsWorkflowActions {
  const [cardNewsScript, setCardNewsScript] = useState<CardNewsScript | null>(null);
  const [cardNewsPrompts, setCardNewsPrompts] = useState<CardPromptData[] | null>(null);
  const [pendingRequest, setPendingRequest] = useState<GenerationRequest | null>(null);
  const [scriptProgress, setScriptProgress] = useState<string>('');
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const handleGenerateCardNews = async (
    request: GenerationRequest,
    setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>,
    setContentTab: (tab: string) => void
  ) => {
    setContentTab('card_news');
    setIsGeneratingScript(true);
    setCardNewsScript(null);
    setPendingRequest(request);
    setGlobalState(prev => ({ ...prev, isLoading: false, data: null, error: null }));

    try {
      const { generateCardNewsScript } = await import('../services/cardNewsService');
      const script = await generateCardNewsScript(request, setScriptProgress);
      setCardNewsScript(script);
      setScriptProgress('');
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('../services/geminiClient');
      setGlobalState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleRegenerateScript = async (
    setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>
  ) => {
    if (!pendingRequest) return;

    setIsGeneratingScript(true);
    setCardNewsScript(null);

    try {
      const { generateCardNewsScript } = await import('../services/cardNewsService');
      const script = await generateCardNewsScript(pendingRequest, setScriptProgress);
      setCardNewsScript(script);
      setScriptProgress('');
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('../services/geminiClient');
      setGlobalState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleApproveScript = async (
    setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>
  ) => {
    if (!cardNewsScript || !pendingRequest) return;

    setIsGeneratingScript(true);
    setScriptProgress('🎨 [2단계] 이미지 프롬프트 생성 중...');

    try {
      const { convertScriptToCardNews } = await import('../services/cardNewsService');
      const designResult = await convertScriptToCardNews(
        cardNewsScript,
        pendingRequest,
        setScriptProgress
      );

      setCardNewsPrompts(designResult.cardPrompts);
      setCurrentStep(2);
      setScriptProgress('');
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('../services/geminiClient');
      setGlobalState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleApprovePrompts = async (
    setGlobalState: React.Dispatch<React.SetStateAction<GenerationState>>
  ) => {
    if (!cardNewsPrompts || !pendingRequest || !cardNewsScript) return;

    setIsGeneratingScript(true);
    setScriptProgress('🖼️ [3단계] 이미지 생성 중...');
    setCurrentStep(3);

    try {
      const imageStyle = pendingRequest.imageStyle || 'illustration';
      const referenceImage = pendingRequest.coverStyleImage || pendingRequest.contentStyleImage;
      const copyMode = pendingRequest.styleCopyMode;

      // 디자인 템플릿 스타일 가져오기
      const { getDesignTemplateById } = await import('../services/cardNewsDesignTemplates');
      const template = pendingRequest.designTemplateId
        ? getDesignTemplateById(pendingRequest.designTemplateId)
        : undefined;
      const sc = template?.styleConfig;
      const borderRadius = sc?.borderRadius || '24px';
      const boxShadow = sc?.boxShadow || '0 4px 16px rgba(0,0,0,0.08)';
      const borderStyle = sc?.borderWidth && sc.borderWidth !== '0'
        ? `border: ${sc.borderWidth} solid ${sc.borderColor};`
        : '';
      const bgColor = sc?.backgroundColor || '#E8F4FD';
      const textColor = sc?.mainTitleStyle?.color || '#1E293B';
      const subtitleColor = sc?.subtitleStyle?.color || '#64748B';

      // 디자인 템플릿의 stylePrompt를 이미지 생성에 전달 (customImagePrompt보다 우선)
      const effectiveCustomStyle = template?.stylePrompt || pendingRequest.customImagePrompt;

      const { generateSingleImage } = await import('../services/image/cardNewsImageService');

      // ── 안정화된 배치 실행 루프 ──
      // 핵심 변경:
      // 1) per-card timeout: 60s → 120s (실제 모델 응답 80~185s 관찰)
      // 2) 배치 크기 2: 완전 직렬(느림) vs 전체 병렬(불안정) 사이 균형
      // 3) late-arrival 캡처: timeout 후에도 응답 도착 시 반영
      const PER_CARD_TIMEOUT_MS = 120_000;
      const BATCH_SIZE = 2;
      const totalCards = cardNewsPrompts.length;
      const images: (string | null)[] = new Array(totalCards).fill(null);
      let failedCount = 0;

      // late-arrival 캡처용: timeout 후에도 백그라운드에서 계속 실행
      const lateArrivals: Map<number, Promise<string | null>> = new Map();

      for (let batchStart = 0; batchStart < totalCards; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCards);
        const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k);
        setScriptProgress(`🖼️ 이미지 ${batchStart + 1}~${batchEnd}/${totalCards}장 생성 중...`);

        const batchPromises = batchIndices.map(async (i) => {
          const promptData = cardNewsPrompts[i];
          const imagePromise = generateSingleImage(
            promptData.imagePrompt,
            imageStyle,
            '1:1',
            effectiveCustomStyle,
            referenceImage,
            copyMode
          );

          // late-arrival 캡처: promise 자체를 저장
          const wrappedPromise = imagePromise.then(
            (url) => url,
            () => null
          );
          lateArrivals.set(i, wrappedPromise);

          try {
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error(`이미지 ${i + 1}장 생성 timeout (${PER_CARD_TIMEOUT_MS / 1000}초)`)), PER_CARD_TIMEOUT_MS)
            );
            const result = await Promise.race([imagePromise, timeoutPromise]);
            images[i] = result;
            setScriptProgress(`✅ 이미지 ${i + 1}/${totalCards}장 완료`);
          } catch (imgErr: any) {
            console.warn(`⚠️ 카드 ${i + 1} 이미지 생성 실패 (계속 진행):`, imgErr?.message);
            images[i] = null;
            failedCount++;
            setScriptProgress(`⚠️ 이미지 ${i + 1}/${totalCards}장 실패 — 다음 배치 진행 중...`);
          }
        });

        await Promise.allSettled(batchPromises);
      }

      // ── late-arrival 복구: timeout된 카드 중 뒤늦게 도착한 응답 반영 ──
      if (failedCount > 0) {
        setScriptProgress(`🔄 실패 카드 ${failedCount}장 응답 대기 중 (최대 30초)...`);
        const LATE_ARRIVAL_WAIT_MS = 30_000;
        const failedIndices = images.map((img, i) => img === null ? i : -1).filter(i => i >= 0);

        const lateResults = await Promise.race([
          Promise.allSettled(failedIndices.map(async (i) => {
            const pending = lateArrivals.get(i);
            if (!pending) return null;
            return pending;
          })),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), LATE_ARRIVAL_WAIT_MS))
        ]);

        if (lateResults && Array.isArray(lateResults)) {
          let recovered = 0;
          lateResults.forEach((result, idx) => {
            const cardIdx = failedIndices[idx];
            if (result.status === 'fulfilled' && result.value) {
              images[cardIdx] = result.value;
              recovered++;
              failedCount--;
              console.info(`🔄 카드 ${cardIdx + 1} late-arrival 복구 성공`);
            }
          });
          if (recovered > 0) {
            setScriptProgress(`🔄 ${recovered}장 추가 복구 완료! 총 실패: ${failedCount}장`);
          }
        }
      }

      if (failedCount > 0) {
        setScriptProgress(`🖼️ 완료: ${totalCards - failedCount}장 성공, ${failedCount}장 fallback 카드 적용`);
      }

      // ── 카드 HTML 조립: 성공 → 이미지, 실패 → readable fallback SVG ──
      const cardSlides = images.map((imgUrl, i) => {
        const promptData = cardNewsPrompts[i];
        // cardPrompts에서 텍스트 추출 (fallback에 사용)
        const subtitle = promptData?.textPrompt?.subtitle || '';
        const mainTitle = promptData?.textPrompt?.mainTitle || promptData?.imagePrompt?.substring(0, 30) || `카드 ${i + 1}`;
        const description = promptData?.textPrompt?.description || '';

        if (imgUrl) {
          return `
            <div class="card-slide" style="border-radius: ${borderRadius}; ${borderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${boxShadow};">
              <img src="${imgUrl}" alt="카드 ${i + 1}" data-index="${i + 1}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>`;
        }

        // ── Readable fallback SVG 카드 ──
        // 빈 div가 아니라 실제 콘텐츠가 있는 SVG 카드
        const escapeSvgText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const svgSubtitle = escapeSvgText(subtitle).substring(0, 40);
        const svgMainTitle = escapeSvgText(mainTitle).substring(0, 25);
        const svgDesc = escapeSvgText(description).substring(0, 50);

        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
          <rect fill="${bgColor}" width="800" height="800" rx="24"/>
          <rect fill="#ffffff" x="50" y="50" width="700" height="700" rx="20" opacity="0.85"/>
          <text x="400" y="280" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="20" fill="${subtitleColor}">${svgSubtitle}</text>
          <text x="400" y="360" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="36" font-weight="bold" fill="${textColor}">${svgMainTitle}</text>
          ${svgDesc ? `<text x="400" y="420" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="18" fill="${subtitleColor}">${svgDesc}</text>` : ''}
          <line x1="300" y1="480" x2="500" y2="480" stroke="${subtitleColor}" stroke-width="1" opacity="0.3"/>
          <text x="400" y="540" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="14" fill="#94A3B8">카드를 클릭하여 이미지를 재생성하세요</text>
          <circle cx="400" cy="610" r="30" fill="${bgColor}" opacity="0.5"/>
          <text x="400" y="618" text-anchor="middle" font-size="24">🔄</text>
        </svg>`;
        const b64 = btoa(unescape(encodeURIComponent(fallbackSvg)));
        const fallbackUrl = `data:image/svg+xml;base64,${b64}`;

        return `
            <div class="card-slide" style="border-radius: ${borderRadius}; ${borderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${boxShadow};">
              <img src="${fallbackUrl}" alt="카드 ${i + 1} (재생성 필요)" data-index="${i + 1}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
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

      // 실패한 카드가 있으면 warning으로 안내
      const warningMsg = failedCount > 0
        ? `${failedCount}장의 카드 이미지 생성에 실패하여 fallback 카드로 대체되었습니다. 해당 카드를 클릭하면 개별 재생성할 수 있습니다.`
        : null;

      setGlobalState({
        isLoading: false,
        error: null,
        warning: warningMsg,
        data: {
          htmlContent: finalHtml,
          title: cardNewsScript.title,
          imageUrl: images.find(img => img !== null) || '',
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
          cardPrompts: cardNewsPrompts,
          designTemplateId: pendingRequest.designTemplateId
        },
        progress: '',
        displayStage: 0,
      });

      // 상태 초기화
      setCardNewsScript(null);
      setCardNewsPrompts(null);
      setPendingRequest(null);
      setScriptProgress('');
      setCurrentStep(1);
    } catch (err: any) {
      setScriptProgress('');
      const { getKoreanErrorMessage } = await import('../services/geminiClient');
      setGlobalState(prev => ({ ...prev, error: getKoreanErrorMessage(err) }));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleEditPrompts = (updatedPrompts: CardPromptData[]) => {
    setCardNewsPrompts(updatedPrompts);
  };

  const handleBackToScript = () => {
    setCardNewsPrompts(null);
    setCurrentStep(1);
  };

  const handleEditScript = (updatedScript: CardNewsScript) => {
    setCardNewsScript(updatedScript);
  };

  return {
    // State
    cardNewsScript,
    cardNewsPrompts,
    pendingRequest,
    scriptProgress,
    isGeneratingScript,
    currentStep,
    // Actions
    handleGenerateCardNews,
    handleRegenerateScript,
    handleApproveScript,
    handleApprovePrompts,
    handleEditPrompts,
    handleBackToScript,
    handleEditScript,
  };
}
