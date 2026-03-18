/**
 * useCardRegenerate — 카드뉴스 재생성 전용 훅
 *
 * 책임:
 *   - openCardRegenModal: 카드 재생성 모달 열기 + 프롬프트 초기화
 *   - handleCardRegenerate: 카드 슬라이드 재생성 실행
 *   - 카드 편집 state (subtitle/mainTitle/description/tags/imagePrompt)
 *   - 참고 이미지 저장/삭제/고정
 *   - 프롬프트 히스토리 저장/불러오기
 *   - 이미지 프롬프트 자동 연동 (텍스트 변경 시)
 *   - 관련 로딩/에러 상태 관리
 *
 * ResultPreview.tsx는 CardRegenModal에 props를 전달하고 버튼만 보여주며,
 * 실제 카드 재생성 구현은 이 훅이 소유한다.
 */

import { useState, useEffect, useCallback } from 'react';
import type { GeneratedContent, CardNewsDesignTemplateId } from '../types';
import {
  CARD_PROMPT_HISTORY_KEY,
  CARD_REF_IMAGE_KEY,
  CardPromptHistoryItem,
} from '../components/resultPreviewUtils';
import { STYLE_KEYWORDS } from '../services/image/imagePromptBuilder';

interface UseCardRegenerateParams {
  content: GeneratedContent;
  localHtml: string;
  setLocalHtml: (html: string) => void;
  savedCustomStylePrompt: string | undefined;
  designTemplateId?: CardNewsDesignTemplateId;
  /** useCardDownload에서 제공하는 카드 요소 탐색 함수 */
  getCardElements: () => NodeListOf<Element> | null;
  /** useAiRefine이 소유하는 isAIPromptApplied */
  isAIPromptApplied: boolean;
  setIsAIPromptApplied: (v: boolean) => void;
}

interface UseCardRegenerateReturn {
  // 모달 상태
  cardRegenModalOpen: boolean;
  setCardRegenModalOpen: (v: boolean) => void;
  cardRegenIndex: number;
  isRegeneratingCard: boolean;
  cardRegenProgress: string;
  currentCardImage: string;
  // 편집 state
  editSubtitle: string;
  setEditSubtitle: (v: string) => void;
  editMainTitle: string;
  setEditMainTitle: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editImagePrompt: string;
  setEditImagePrompt: (v: string) => void;
  // 참고 이미지
  cardRegenRefImage: string;
  setCardRegenRefImage: (v: string) => void;
  refImageMode: 'recolor' | 'copy';
  setRefImageMode: (v: 'recolor' | 'copy') => void;
  isRefImageLocked: boolean;
  saveRefImageToStorage: (image: string, mode: 'recolor' | 'copy') => void;
  clearRefImageFromStorage: () => void;
  // 프롬프트 히스토리
  promptHistory: CardPromptHistoryItem[];
  showHistoryDropdown: boolean;
  setShowHistoryDropdown: (v: boolean) => void;
  savePromptToHistory: () => void;
  loadFromHistory: (item: CardPromptHistoryItem) => void;
  // 액션
  openCardRegenModal: (cardIndex: number) => void;
  handleCardRegenerate: () => Promise<void>;
}

export function useCardRegenerate({
  content,
  localHtml,
  setLocalHtml,
  savedCustomStylePrompt,
  designTemplateId,
  getCardElements,
  isAIPromptApplied,
  setIsAIPromptApplied,
}: UseCardRegenerateParams): UseCardRegenerateReturn {

  // ── 모달 상태 ──
  const [cardRegenModalOpen, setCardRegenModalOpen] = useState(false);
  const [cardRegenIndex, setCardRegenIndex] = useState(0);
  const [isRegeneratingCard, setIsRegeneratingCard] = useState(false);
  const [cardRegenProgress, setCardRegenProgress] = useState('');
  const [currentCardImage, setCurrentCardImage] = useState('');

  // ── 카드 편집 state ──
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editMainTitle, setEditMainTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editImagePrompt, setEditImagePrompt] = useState('');

  // ── 참고 이미지 ──
  const [cardRegenRefImage, setCardRegenRefImage] = useState('');
  const [refImageMode, setRefImageMode] = useState<'recolor' | 'copy'>('copy');
  const [isRefImageLocked, setIsRefImageLocked] = useState(false);

  // ── 프롬프트 히스토리 ──
  const [promptHistory, setPromptHistory] = useState<CardPromptHistoryItem[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // ── 초기 로드: 프롬프트 히스토리 + 참고 이미지 ──

  useEffect(() => {
    const saved = localStorage.getItem(CARD_PROMPT_HISTORY_KEY);
    if (saved) {
      try {
        setPromptHistory(JSON.parse(saved));
      } catch (e) {
        console.error('히스토리 로드 실패:', e);
      }
    }
    const savedRefImage = localStorage.getItem(CARD_REF_IMAGE_KEY);
    if (savedRefImage) {
      try {
        const parsed = JSON.parse(savedRefImage);
        if (parsed.image) {
          setCardRegenRefImage(parsed.image);
          setRefImageMode(parsed.mode || 'copy');
          setIsRefImageLocked(true);
        }
      } catch (e) {
        console.error('참고 이미지 로드 실패:', e);
      }
    }
  }, []);

  // ── 이미지 프롬프트 자동 연동 (텍스트 변경 시) ──

  useEffect(() => {
    if (isAIPromptApplied) return;
    if (editSubtitle || editMainTitle || editDescription) {
      const style = content.imageStyle || 'illustration';
      let styleText: string;
      if (style === 'custom' && savedCustomStylePrompt) {
        styleText = savedCustomStylePrompt;
      } else if (style === 'photo') {
        styleText = 'photorealistic real medical clinic photo, natural lighting, DSLR, shallow depth of field, NOT illustration, NOT 3D render';
      } else {
        styleText = STYLE_KEYWORDS[style as keyof typeof STYLE_KEYWORDS] || STYLE_KEYWORDS.illustration;
      }
      const newImagePrompt = `1:1 카드뉴스, ${editSubtitle ? `"${editSubtitle}"` : ''} ${editMainTitle ? `"${editMainTitle}"` : ''} ${editDescription ? `"${editDescription}"` : ''}, ${styleText}, 밝고 친근한 분위기`.trim();
      setEditImagePrompt(newImagePrompt);
    }
  }, [editSubtitle, editMainTitle, editDescription, content.imageStyle, savedCustomStylePrompt, isAIPromptApplied]);

  // ── 참고 이미지 저장/삭제 ──

  const saveRefImageToStorage = useCallback((image: string, mode: 'recolor' | 'copy') => {
    try {
      localStorage.setItem(CARD_REF_IMAGE_KEY, JSON.stringify({ image, mode }));
      setIsRefImageLocked(true);
    } catch (e) {
      console.error('참고 이미지 저장 실패 (용량 초과):', e);
      import('../components/Toast').then(({ toast }) => {
        toast.error('참고 이미지가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
      });
    }
  }, []);

  const clearRefImageFromStorage = useCallback(() => {
    localStorage.removeItem(CARD_REF_IMAGE_KEY);
    setIsRefImageLocked(false);
  }, []);

  // ── 프롬프트 저장/불러오기 ──

  const savePromptToHistory = useCallback(() => {
    if (!editSubtitle && !editMainTitle && !editDescription) return;

    const newItem: CardPromptHistoryItem = {
      subtitle: editSubtitle,
      mainTitle: editMainTitle,
      description: editDescription,
      imagePrompt: editImagePrompt,
      savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };

    const filtered = promptHistory.filter(h =>
      h.subtitle !== newItem.subtitle || h.mainTitle !== newItem.mainTitle,
    );
    const newHistory = [newItem, ...filtered].slice(0, 3);

    setPromptHistory(newHistory);
    localStorage.setItem(CARD_PROMPT_HISTORY_KEY, JSON.stringify(newHistory));
    import('../components/Toast').then(({ toast }) => toast.success('프롬프트가 저장되었습니다!'));
  }, [editSubtitle, editMainTitle, editDescription, editImagePrompt, promptHistory]);

  const loadFromHistory = useCallback((item: CardPromptHistoryItem) => {
    setEditSubtitle(item.subtitle);
    setEditMainTitle(item.mainTitle);
    setEditDescription(item.description);
    setEditImagePrompt(item.imagePrompt);
    setShowHistoryDropdown(false);
  }, []);

  // ── 모달 열기 ──

  const openCardRegenModal = useCallback((cardIndex: number) => {
    setCardRegenIndex(cardIndex);
    setIsAIPromptApplied(false);

    if (!isRefImageLocked) {
      setCardRegenRefImage('');
    }

    // 현재 카드의 이미지 URL 가져오기
    const cards = getCardElements();
    if (cards && cards[cardIndex]) {
      const img = cards[cardIndex].querySelector('img');
      setCurrentCardImage(img ? img.src : '');
    } else {
      setCurrentCardImage('');
    }

    // 편집 state 초기화 후 프롬프트 값 복원
    setEditSubtitle('');
    setEditMainTitle('');
    setEditDescription('');
    setEditTags('');
    setEditImagePrompt('');

    const cardPrompt = content.cardPrompts?.[cardIndex];
    setTimeout(() => {
      if (cardPrompt) {
        setEditSubtitle(cardPrompt.textPrompt.subtitle || '');
        setEditMainTitle(cardPrompt.textPrompt.mainTitle || '');
        setEditDescription(cardPrompt.textPrompt.description || '');
        setEditTags(cardPrompt.textPrompt.tags?.join(', ') || '');
      }
    }, 0);

    setCardRegenModalOpen(true);
  }, [isRefImageLocked, getCardElements, content.cardPrompts, setIsAIPromptApplied]);

  // ── 카드 재생성 실행 ──

  const handleCardRegenerate = useCallback(async () => {
    const hasEditedPrompt = editSubtitle || editMainTitle || editDescription || editImagePrompt || cardRegenRefImage;
    if (!hasEditedPrompt) {
      const { toast } = await import('../components/Toast');
      toast.info('프롬프트를 수정하거나 참고 이미지를 업로드해주세요.');
      return;
    }

    setIsRegeneratingCard(true);
    setCardRegenProgress(cardRegenRefImage ? '참고 이미지 스타일 분석 중...' : '편집된 프롬프트로 이미지 생성 중...');

    try {
      const { generateSingleImage } = await import('../services/image/cardNewsImageService');
      const { getDesignTemplateById } = await import('../services/cardNewsDesignTemplates');

      const style = content.imageStyle || 'illustration';
      const customStylePrompt = savedCustomStylePrompt || undefined;
      console.log('🎨 재생성 시 커스텀 스타일:', customStylePrompt);

      const imagePromptToUse = editImagePrompt || `1:1 카드뉴스, "${editSubtitle}" "${editMainTitle}" "${editDescription}", 밝고 친근한 분위기`;

      // 진행 메시지 설정
      if (cardRegenRefImage) {
        setCardRegenProgress(refImageMode === 'copy' ? '📋 레이아웃 완전 복제 중...' : '🎨 레이아웃 복제 + 색상 변경 중...');
      } else if (customStylePrompt) {
        setCardRegenProgress('🎨 커스텀 스타일로 이미지 생성 중...');
      }

      console.log('🔄 카드 재생성 파라미터:', {
        style,
        customStylePrompt: customStylePrompt?.substring(0, 50),
        hasRefImage: !!cardRegenRefImage,
        refImageMode,
        imagePromptToUse: imagePromptToUse.substring(0, 100),
      });

      const newImage = await generateSingleImage(
        imagePromptToUse,
        style,
        '1:1',
        customStylePrompt,
        cardRegenRefImage || undefined,
        refImageMode === 'copy',
      );

      if (newImage) {
        const isPlaceholder = newImage.includes('이미지 생성에 실패했습니다') || newImage.includes('data:image/svg+xml');

        // DOM 업데이트 — 이미지 교체
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = localHtml;
        const cardsInHtml = tempDiv.querySelectorAll('.card-slide');

        if (cardsInHtml[cardRegenIndex]) {
          const dt = designTemplateId ? getDesignTemplateById(designTemplateId) : undefined;
          const dtSc = dt?.styleConfig;
          const regenBorderRadius = dtSc?.borderRadius || '24px';
          const regenBoxShadow = dtSc?.boxShadow || '0 4px 16px rgba(0,0,0,0.08)';
          const regenBorder = dtSc?.borderWidth && dtSc.borderWidth !== '0' ? `border: ${dtSc.borderWidth} solid ${dtSc.borderColor};` : '';
          const newCardHtml = `
            <div class="card-slide" style="border-radius: ${regenBorderRadius}; ${regenBorder} overflow: hidden; box-shadow: ${regenBoxShadow};">
              <img src="${newImage}" alt="${imagePromptToUse}" data-index="${cardRegenIndex + 1}" class="card-full-img" style="width: 100%; height: auto; display: block;" />
            </div>`;

          const newCardElement = document.createElement('div');
          newCardElement.innerHTML = newCardHtml;
          const newCard = newCardElement.firstElementChild;

          if (newCard) {
            cardsInHtml[cardRegenIndex].replaceWith(newCard);
            setLocalHtml(tempDiv.innerHTML);
          }
        }

        const { toast } = await import('../components/Toast');
        if (isPlaceholder) {
          toast.warning(`${cardRegenIndex + 1}번 카드 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.`);
        } else {
          toast.success(`${cardRegenIndex + 1}번 카드가 재생성되었습니다!`);
        }
        setCardRegenModalOpen(false);
        setCardRegenProgress('');
      } else {
        throw new Error('이미지가 생성되지 않았습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('카드 재생성 실패:', error);
      const { toast } = await import('../components/Toast');
      toast.error('카드 재생성 중 오류가 발생했습니다.');
    } finally {
      setIsRegeneratingCard(false);
      setCardRegenProgress('');
    }
  }, [
    editSubtitle, editMainTitle, editDescription, editImagePrompt,
    cardRegenRefImage, refImageMode, cardRegenIndex,
    content.imageStyle, savedCustomStylePrompt, designTemplateId,
    localHtml, setLocalHtml,
  ]);

  return {
    cardRegenModalOpen, setCardRegenModalOpen,
    cardRegenIndex,
    isRegeneratingCard,
    cardRegenProgress,
    currentCardImage,
    editSubtitle, setEditSubtitle,
    editMainTitle, setEditMainTitle,
    editDescription, setEditDescription,
    editImagePrompt, setEditImagePrompt,
    cardRegenRefImage, setCardRegenRefImage,
    refImageMode, setRefImageMode,
    isRefImageLocked,
    saveRefImageToStorage,
    clearRefImageFromStorage,
    promptHistory,
    showHistoryDropdown, setShowHistoryDropdown,
    savePromptToHistory,
    loadFromHistory,
    openCardRegenModal,
    handleCardRegenerate,
  };
}
