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

      // 디자인 템플릿의 stylePrompt를 이미지 생성에 전달 (customImagePrompt보다 우선)
      const effectiveCustomStyle = template?.stylePrompt || pendingRequest.customImagePrompt;

      const { generateSingleImage } = await import('../services/image/cardNewsImageService');
      const imagePromises = cardNewsPrompts.map((promptData, i) => {
        setScriptProgress(`🖼️ 이미지 ${i + 1}/${cardNewsPrompts.length}장 생성 중...`);
        return generateSingleImage(
          promptData.imagePrompt,
          imageStyle,
          '1:1',
          effectiveCustomStyle,
          referenceImage,
          copyMode
        );
      });

      const images = await Promise.all(imagePromises);

      const cardSlides = images.map((imgUrl, i) => {
        if (imgUrl) {
          return `
            <div class="card-slide" style="border-radius: ${borderRadius}; ${borderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${boxShadow};">
              <img src="${imgUrl}" alt="카드 ${i + 1}" data-index="${i + 1}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>`;
        }
        return `
          <div class="card-slide" style="border-radius: ${borderRadius}; ${borderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${boxShadow}; background: #f1f5f9; display: flex; align-items: center; justify-content: center;">
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

      setGlobalState({
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
          cardPrompts: cardNewsPrompts,
          designTemplateId: pendingRequest.designTemplateId
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
