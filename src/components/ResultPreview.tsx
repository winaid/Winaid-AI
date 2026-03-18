import React, { useState, useEffect, useRef } from 'react';
import { GeneratedContent, ImageStyle as _ImageStyle, CssTheme, BlogSection } from '../types';
import { generateSingleImage } from '../services/image/cardNewsImageService';
import { STYLE_KEYWORDS } from '../services/image/imagePromptBuilder';
import { AI_PROMPT_TEMPLATES, CARD_PROMPT_HISTORY_KEY, CARD_REF_IMAGE_KEY, AutoSaveHistoryItem, CardPromptHistoryItem, cleanText } from './resultPreviewUtils';
import { SeoDetailModal, AiSmellDetailModal, SimilarityModal } from './ScoringModals';
import { ImageDownloadModal, ImageRegenModal, CardDownloadModal } from './ExportModals';
import { CardRegenModal } from './CardRegenModal';
import { getDesignTemplateById } from '../services/cardNewsDesignTemplates';
import { toast } from './Toast';
import { useDocumentExport } from '../hooks/useDocumentExport';
import { useContentQuality } from '../hooks/useContentQuality';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { useResultActions } from '../hooks/useResultActions';
import { useCardDownload } from '../hooks/useCardDownload';
import { useAiRefine } from '../hooks/useAiRefine';



interface ResultPreviewProps {
  content: GeneratedContent;
  darkMode?: boolean;
}

const ResultPreview: React.FC<ResultPreviewProps> = ({ content, darkMode = false }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'html'>('preview');
  const [localHtml, setLocalHtml] = useState(content.fullHtml);
  const [currentTheme, setCurrentTheme] = useState<CssTheme>(content.cssTheme || 'modern');
  const [editorInput, setEditorInput] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);

  // 디자인 템플릿 스타일 계산
  const designTemplate = content.designTemplateId ? getDesignTemplateById(content.designTemplateId) : undefined;
  const dtStyle = designTemplate?.styleConfig;

  // ── [Layer 3] Draft Persistence ──
  const {
    autoSaveHistory,
    lastSaved,
    showAutoSaveDropdown,
    setShowAutoSaveDropdown,
    saveManually,
    loadFromAutoSaveHistory: loadDraft,
    hasAutoSave,
    deleteHistoryItem,
  } = useDraftPersistence({
    localHtml,
    currentTheme,
    postType: content.postType,
    imageStyle: content.imageStyle,
  });

  // ── Result Actions (undo + history persistence) ──
  const {
    canUndo,
    handleUndo: undoAction,
    saveToHistory,
    persistCardNewsHistory,
  } = useResultActions();
  
  // 이미지 다운로드 모달
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadImgSrc, setDownloadImgSrc] = useState('');
  const [downloadImgIndex, setDownloadImgIndex] = useState(0);
  
  // 카드뉴스 다운로드 모달
  const [cardDownloadModalOpen, setCardDownloadModalOpen] = useState(false);
  
  // 카드 재생성 모달
  const [cardRegenModalOpen, setCardRegenModalOpen] = useState(false);
  const [cardRegenIndex, setCardRegenIndex] = useState(0);
  const [cardRegenInstruction, setCardRegenInstruction] = useState(''); // 향후 재생성 지시사항 기능에 활용
  const [isRegeneratingCard, setIsRegeneratingCard] = useState(false);
  const [cardRegenProgress, setCardRegenProgress] = useState('');
  
  // 카드 재생성 시 편집 가능한 프롬프트
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editMainTitle, setEditMainTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState(''); // 향후 태그 편집 기능에 활용
  const [editImagePrompt, setEditImagePrompt] = useState('');
  const [cardRegenRefImage, setCardRegenRefImage] = useState(''); // 참고 이미지
  const [refImageMode, setRefImageMode] = useState<'recolor' | 'copy'>('copy'); // 참고 이미지 적용 방식: recolor=복제+색상변경, copy=완전복제
  const [currentCardImage, setCurrentCardImage] = useState(''); // 현재 카드의 이미지 URL
  const [promptHistory, setPromptHistory] = useState<CardPromptHistoryItem[]>([]); // 저장된 프롬프트 히스토리
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [isRefImageLocked, setIsRefImageLocked] = useState(false); // 참고 이미지 고정 여부
  
  // 🎨 커스텀 스타일 프롬프트 저장 (재생성 시에도 유지)
  const [savedCustomStylePrompt, setSavedCustomStylePrompt] = useState<string | undefined>(content.customImagePrompt);
  
  // 📝 섹션별 재생성 상태
  const [blogSections, setBlogSections] = useState<BlogSection[]>(content.sections || []);
  const [showSectionPanel, setShowSectionPanel] = useState(true);
  
  // content.seoScore가 있으면 자동으로 설정
  useEffect(() => {
    if (content.seoScore) {
      console.log('📊 SEO 점수 자동 로드:', content.seoScore.total);
      setSeoScore(content.seoScore);
    }
  }, [content.seoScore]);

  // 블로그 섹션 데이터 업데이트
  useEffect(() => {
    if (content.sections && content.sections.length > 0) {
      setBlogSections(content.sections);
      setShowSectionPanel(true); // 섹션이 있으면 패널 자동 표시
    }
  }, [content.sections]);
  
  // 디버깅: factCheck 상태 확인
  useEffect(() => {
    console.log('🔍 ResultPreview - content.factCheck:', content.factCheck);
    console.log('🔍 ResultPreview - content.seoScore:', content.seoScore);
    console.log('🔍 ResultPreview - content.postType:', content.postType);
  }, [content.factCheck, content.seoScore, content.postType]);
  
  // 프롬프트 히스토리 및 참고 이미지 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(CARD_PROMPT_HISTORY_KEY);
    if (saved) {
      try {
        setPromptHistory(JSON.parse(saved));
      } catch (e) {
        console.error('히스토리 로드 실패:', e);
      }
    }
    
    // 저장된 참고 이미지 불러오기
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
  
  // 참고 이미지 저장/삭제 함수
  const saveRefImageToStorage = (image: string, mode: 'recolor' | 'copy') => {
    try {
      localStorage.setItem(CARD_REF_IMAGE_KEY, JSON.stringify({ image, mode }));
      setIsRefImageLocked(true);
    } catch (e) {
      console.error('참고 이미지 저장 실패 (용량 초과):', e);
      toast.error('참고 이미지가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
    }
  };
  
  const clearRefImageFromStorage = () => {
    localStorage.removeItem(CARD_REF_IMAGE_KEY);
    setIsRefImageLocked(false);
  };
  
  // 프롬프트 저장 함수
  const savePromptToHistory = () => {
    if (!editSubtitle && !editMainTitle && !editDescription) return;
    
    const newItem: CardPromptHistoryItem = {
      subtitle: editSubtitle,
      mainTitle: editMainTitle,
      description: editDescription,
      imagePrompt: editImagePrompt,
      savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };
    
    // 최근 3개만 유지 (중복 제거)
    const filtered = promptHistory.filter(h => 
      h.subtitle !== newItem.subtitle || h.mainTitle !== newItem.mainTitle
    );
    const newHistory = [newItem, ...filtered].slice(0, 3);
    
    setPromptHistory(newHistory);
    localStorage.setItem(CARD_PROMPT_HISTORY_KEY, JSON.stringify(newHistory));
    toast.success('프롬프트가 저장되었습니다!');
  };
  
  // 히스토리에서 불러오기
  const loadFromHistory = (item: CardPromptHistoryItem) => {
    setEditSubtitle(item.subtitle);
    setEditMainTitle(item.mainTitle);
    setEditDescription(item.description);
    setEditImagePrompt(item.imagePrompt);
    setShowHistoryDropdown(false);
  };
  
  // 텍스트 변경 시 이미지 프롬프트 자동 연동
  // 카드 수 (localHtml 변경 시 업데이트)
  const [cardCount, setCardCount] = useState(0);
  
  
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useRef<number>(0);

  // ── Card Download 훅 ──
  const {
    downloadingCard,
    cardDownloadProgress,
    downloadImage,
    downloadCardAsImage,
    handleSingleCardDownload,
    downloadAllCards,
    getCardElements,
  } = useCardDownload({
    editorRef,
    localHtml,
    onHistoryPersist: () => persistCardNewsHistory({
      title: content.title,
      html: localHtml,
      keywords: (content as any).keyword,
      category: (content as any).category,
    }),
  });

  // 문서 내보내기 훅 (Word/PDF/복사)
  const {
    copied, editProgress, setEditProgress,
    handleDownloadWord, handleDownloadPDF, handleCopy,
    applyInlineStylesForNaver,
  } = useDocumentExport({ content, localHtml, currentTheme, editorRef });

  // ── AI Refine 훅 (AI 수정/재생성/프롬프트 추천) ──
  const {
    isEditingAi,
    regeneratingSection,
    regenOpen, setRegenOpen,
    regenIndex, setRegenIndex,
    regenPrompt, setRegenPrompt,
    regenRefDataUrl,
    regenRefName,
    isRecommendingPrompt,
    isRecommendingCardPrompt,
    isAIPromptApplied, setIsAIPromptApplied,
    handleAiEditSubmit: aiEditSubmit,
    handleSectionRegenerate,
    submitRegenerateImage,
    handleRecommendPrompt,
    handleRecommendCardPrompt,
    handleRegenFileChange,
  } = useAiRefine({
    localHtml,
    setLocalHtml,
    content,
    savedCustomStylePrompt: savedCustomStylePrompt || '',
    blogSections,
    setBlogSections,
    saveToHistory,
    setEditorInput,
    setEditProgress,
    setEditImagePrompt,
    editSubtitle,
    editMainTitle,
    editDescription,
  });

  // handleAiEditSubmit 래퍼: editorInput을 바인딩
  const handleAiEditSubmit = (e: React.FormEvent) => aiEditSubmit(e, editorInput);

  // 텍스트 변경 시 이미지 프롬프트 자동 연동
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

  // 콘텐츠 품질 검사 훅 (SEO/유사도/이미지 최적화)
  const {
    seoScore, setSeoScore, isEvaluatingSeo, showSeoDetail, setShowSeoDetail, handleEvaluateSeo,
    showAiSmellDetail, setShowAiSmellDetail, isRecheckingAiSmell, recheckResult, handleRecheckAiSmell,
    isOptimizingImages, optimizationStats, handleOptimizeImages,
    isCheckingSimilarity, similarityResult, showSimilarityModal, setShowSimilarityModal, handleCheckSimilarity,
  } = useContentQuality({ content, localHtml, setLocalHtml, setEditProgress });

  useEffect(() => {
    setLocalHtml(content.fullHtml);
    // blob URL cleanup: 이전 content의 blob URL 해제 (메모리 누수 방지)
    return () => {
      if (content.blobUrls) {
        content.blobUrls.forEach(url => {
          try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        });
      }
    };
  }, [content.fullHtml]);

  // 🎨 content.customImagePrompt가 변경되면 저장된 값도 업데이트
  // 실사/3D일러스트/의학3D 선택 시 undefined가 전달되므로 초기화됨
  useEffect(() => {
    setSavedCustomStylePrompt(content.customImagePrompt);
    console.log('🎨 커스텀 스타일 업데이트:', content.customImagePrompt || '(없음 - 기본 스타일 사용)');
  }, [content.customImagePrompt]);

  // 글자 수 계산 (실제 보이는 텍스트만, 공백 제외) + 카드 수 업데이트
  useEffect(() => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = localHtml;
    
    // 🔧 CSS <style> 태그 제거 (글자수에 CSS가 포함되지 않도록)
    const styleTags = tempDiv.querySelectorAll('style');
    styleTags.forEach(el => el.remove());
    
    // 🔧 <script> 태그도 제거
    const scriptTags = tempDiv.querySelectorAll('script');
    scriptTags.forEach(el => el.remove());
    
    // 카드 수 계산
    const cards = tempDiv.querySelectorAll('.card-slide');
    setCardCount(cards.length);
    
    // 숨겨진 요소 제거
    const hiddenElements = tempDiv.querySelectorAll('.hidden-title, [style*="display: none"], [style*="display:none"]');
    hiddenElements.forEach(el => el.remove());
    
    // 카드뉴스의 경우 실제 내용만 계산 (태그/해시태그/메타정보 제외)
    if (content.postType === 'card_news') {
      // pill-tag, footer, legal-box 등 메타정보 제거
      const metaElements = tempDiv.querySelectorAll('.pill-tag, .card-footer-row, .legal-box-card, .brand-text, .arrow-icon');
      metaElements.forEach(el => el.remove());
      
      // 실제 콘텐츠 텍스트만 추출 (subtitle, main-title, desc)
      let contentText = '';
      tempDiv.querySelectorAll('.card-subtitle, .card-main-title, .card-desc').forEach(el => {
        contentText += (el.textContent || '') + ' ';
      });
      
      // 공백 제외 글자 수 계산
      const text = contentText.replace(/\s+/g, '');
      setCharCount(text.length);
    } else {
      // 블로그 포스트의 경우 본문 텍스트만 계산 (공백 제외)
      
      // 해시태그 문단 제거 (#으로 시작하는 내용)
      const hashtagElements = tempDiv.querySelectorAll('p');
      hashtagElements.forEach(el => {
        const text = el.textContent || '';
        // #태그 패턴이 2개 이상 있으면 해시태그 문단으로 판단
        if ((text.match(/#/g) || []).length >= 2) {
          el.remove();
        }
      });
      
      // 이미지 마커 제거 ([IMG_1], [IMG_2] 등)
      // main-title 클래스 제거 (제목은 본문 글자수에서 제외)
      const mainTitleElements = tempDiv.querySelectorAll('.main-title');
      mainTitleElements.forEach(el => el.remove());
      
      // ✅ 공백 제외 글자수 계산 (실제 콘텐츠 양 측정)
      const text = (tempDiv.textContent || '')
        .replace(/\[IMG_\d+\]/g, '')  // 이미지 마커 제거
        .replace(/\s+/g, '')  // 모든 공백 제거
        .trim();
      
      // 🔍 디버깅: 글자수 계산 상세 로그
      console.log('📊 UI 글자수 계산 (CSS 제외):');
      console.log('   - 공백 제외 후:', text.length);
      console.log('   - 처음 100자:', text.substring(0, 100));
      
      setCharCount(text.length);
    }
  }, [localHtml, content.postType]);

  // 카드뉴스 카드에 오버레이 추가
  useEffect(() => {
    if (content.postType !== 'card_news') return;
    
    const addOverlaysToCards = () => {
      const cards = document.querySelectorAll('.naver-preview .card-slide');
      cards.forEach((card, index) => {
        // 이미 오버레이가 있으면 스킵
        if (card.querySelector('.card-overlay')) return;
        
        // 카드 번호 배지
        const badge = document.createElement('div');
        badge.className = 'card-number-badge';
        badge.textContent = index === 0 ? '표지' : `${index + 1}`;
        card.appendChild(badge);
        
        // 오버레이 생성
        const overlay = document.createElement('div');
        overlay.className = 'card-overlay';
        overlay.innerHTML = `
          <button class="card-overlay-btn regen" data-index="${index}">
            🔄 재생성
          </button>
          <button class="card-overlay-btn download" data-index="${index}">
            💾 다운로드
          </button>
        `;
        card.appendChild(overlay);
      });
    };
    
    // 이벤트 위임 핸들러
    const handleOverlayClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('card-overlay-btn')) return;
      
      e.stopPropagation();
      const index = parseInt(target.dataset.index || '0', 10);
      
      if (target.classList.contains('regen')) {
        openCardRegenModal(index);
      } else if (target.classList.contains('download')) {
        handleSingleCardDownload(index);
      }
    };
    
    // DOM 업데이트 후 실행
    const timer = setTimeout(() => {
      addOverlaysToCards();
      // 이벤트 위임: 부모 요소에 이벤트 리스너 등록
      document.addEventListener('click', handleOverlayClick);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleOverlayClick);
    };
  }, [localHtml, content.postType]);

  // ── Draft 불러오기 래퍼 (setLocalHtml/setCurrentTheme 바인딩) ──
  const loadFromAutoSaveHistory = (item: AutoSaveHistoryItem) => {
    const result = loadDraft(item);
    setLocalHtml(result.html);
    if (result.theme) setCurrentTheme(result.theme as CssTheme);
  };

  // ── Undo 래퍼 (setLocalHtml 바인딩) ──
  const handleUndo = () => {
    const prevHtml = undoAction();
    if (prevHtml !== null) setLocalHtml(prevHtml);
  };


  // 카드 슬라이드 재생성
  const handleCardRegenerate = async () => {
    // 편집된 프롬프트가 있는지 확인
    const hasEditedPrompt = editSubtitle || editMainTitle || editDescription || editImagePrompt || cardRegenRefImage;
    
    if (!hasEditedPrompt) {
      toast.info('프롬프트를 수정하거나 참고 이미지를 업로드해주세요.');
      return;
    }
    
    setIsRegeneratingCard(true);
    setCardRegenProgress(cardRegenRefImage ? '참고 이미지 스타일 분석 중...' : '편집된 프롬프트로 이미지 생성 중...');
    
    try {
      // 편집된 이미지 프롬프트 구성
      const style = content.imageStyle || 'illustration';
      
      // 🎨 커스텀 스타일 프롬프트 우선순위:
      // 1. savedCustomStylePrompt (state에 저장된 값) 사용 - 재생성 시에도 유지됨!
      // 2. 참고 이미지가 있으면 "참고 이미지 스타일 그대로" 지시
      // 3. 없으면 기본 스타일
      // 🎨 커스텀 스타일은 항상 최우선! (참고 이미지가 있어도 유지)
      const customStylePrompt = savedCustomStylePrompt || undefined;
      console.log('🎨 재생성 시 커스텀 스타일:', customStylePrompt);
      
      // 🎨 스타일 결정: 커스텀 > 기본 스타일 (참고 이미지는 레이아웃만!)
      let _styleText: string; // 향후 스타일 텍스트 표시에 활용 가능
      if (customStylePrompt) {
        _styleText = customStylePrompt;  // 커스텀 스타일 있으면 무조건 사용!
      } else {
        // 기본 스타일 (3D 일러스트)
        _styleText = style === 'illustration' ? '3D 일러스트' : style === 'medical' ? '의학 3D' : '실사 사진';
      }
      
      // 🔧 재생성 프롬프트: 사용자가 직접 수정한 editImagePrompt 사용!
      // 자동 연동 프롬프트 또는 사용자가 직접 수정한 프롬프트
      let imagePromptToUse = editImagePrompt || `1:1 카드뉴스, "${editSubtitle}" "${editMainTitle}" "${editDescription}", 밝고 친근한 분위기`;
      
      // 참고 이미지 모드에 따라 진행 메시지 설정
      if (cardRegenRefImage) {
        if (refImageMode === 'copy') {
          setCardRegenProgress('📋 레이아웃 완전 복제 중...');
        } else {
          setCardRegenProgress('🎨 레이아웃 복제 + 색상 변경 중...');
        }
      } else if (customStylePrompt) {
        setCardRegenProgress('🎨 커스텀 스타일로 이미지 생성 중...');
      }
      
      // 🔧 디버그 로그 추가
      console.log('🔄 카드 재생성 파라미터:', {
        style,
        customStylePrompt: customStylePrompt?.substring(0, 50),
        hasRefImage: !!cardRegenRefImage,
        refImageMode,
        imagePromptToUse: imagePromptToUse.substring(0, 100)
      });
      
      // 참고 이미지와 모드를 generateSingleImage에 전달 (inspire/copy 모두 지원)
      // customStylePrompt를 4번째 파라미터로 전달 (커스텀 스타일 유지)
      const newImage = await generateSingleImage(
        imagePromptToUse, 
        style, 
        '1:1', 
        customStylePrompt,  // 🎨 커스텀 스타일 프롬프트 - content.customImagePrompt가 있으면 항상 전달!
        cardRegenRefImage || undefined,  // 참고 이미지가 있으면 항상 전달
        refImageMode === 'copy'  // copy 모드인지 여부
      );
      
      if (newImage) {
        // 플레이스홀더 이미지인지 확인 (SVG 플레이스홀더는 재시도 필요)
        const isPlaceholder = newImage.includes('이미지 생성에 실패했습니다') || newImage.includes('data:image/svg+xml');
        
        // DOM 업데이트 - 이미지 교체
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = localHtml;
        const cardsInHtml = tempDiv.querySelectorAll('.card-slide');
        
        if (cardsInHtml[cardRegenIndex]) {
          // 새 이미지로 교체 (완성형 카드이므로 전체 이미지 교체)
          const regenBorderRadius = dtStyle?.borderRadius || '24px';
          const regenBoxShadow = dtStyle?.boxShadow || '0 4px 16px rgba(0,0,0,0.08)';
          const regenBorder = dtStyle?.borderWidth && dtStyle.borderWidth !== '0' ? `border: ${dtStyle.borderWidth} solid ${dtStyle.borderColor};` : '';
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
        
        if (isPlaceholder) {
          toast.warning(`${cardRegenIndex + 1}번 카드 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.`);
        } else {
          toast.success(`${cardRegenIndex + 1}번 카드가 재생성되었습니다!`);
        }
        setCardRegenModalOpen(false);
        setCardRegenInstruction('');
        setCardRegenProgress('');
      } else {
        throw new Error('이미지가 생성되지 않았습니다. 잠시 후 다시 시도해주세요.');
      }
      
    } catch (error) {
      console.error('카드 재생성 실패:', error);
      toast.error('카드 재생성 중 오류가 발생했습니다.');
    } finally {
      setIsRegeneratingCard(false);
      setCardRegenProgress('');
    }
  };
  
  // 카드 재생성 모달 열기
  const openCardRegenModal = (cardIndex: number) => {
    setCardRegenIndex(cardIndex);
    setCardRegenInstruction('');
    // 🔓 AI 프롬프트 적용 플래그 리셋 (모달 열 때마다 자동 연동 활성화)
    setIsAIPromptApplied(false);
    // 참고 이미지가 고정되어 있지 않으면 초기화, 고정되어 있으면 유지
    if (!isRefImageLocked) {
      setCardRegenRefImage('');
    }
    
    // 현재 카드의 이미지 URL 가져오기
    const cards = getCardElements();
    if (cards && cards[cardIndex]) {
      const img = cards[cardIndex].querySelector('img');
      if (img) {
        setCurrentCardImage(img.src);
      } else {
        setCurrentCardImage('');
      }
    } else {
      setCurrentCardImage('');
    }
    
    // 기존 프롬프트 값으로 편집 state 초기화
    const cardPrompt = content.cardPrompts?.[cardIndex];
    
    // 먼저 모든 값을 초기화하여 useEffect가 새 값으로 트리거되도록 함
    setEditSubtitle('');
    setEditMainTitle('');
    setEditDescription('');
    setEditTags('');
    setEditImagePrompt('');
    
    // 다음 렌더링 사이클에서 실제 값 설정 (useEffect 트리거 보장)
    setTimeout(() => {
      if (cardPrompt) {
        setEditSubtitle(cardPrompt.textPrompt.subtitle || '');
        setEditMainTitle(cardPrompt.textPrompt.mainTitle || '');
        setEditDescription(cardPrompt.textPrompt.description || '');
        setEditTags(cardPrompt.textPrompt.tags?.join(', ') || '');
        // imagePrompt는 useEffect에서 자동 생성됨 (일관된 간단한 형식)
      }
    }, 0);
    
    setCardRegenModalOpen(true);
  };

  // 이미지 클릭 핸들러 (다운로드 or 재생성 선택 모달)
  const handleImageClick = (imgSrc: string, imgAlt: string, index: number) => {
    setDownloadImgSrc(imgSrc);
    setDownloadImgIndex(index);
    setRegenIndex(index);
    setRegenPrompt(imgAlt || '전문적인 의료 일러스트');
    setDownloadModalOpen(true);
  };

  // localHtml이 외부에서 변경될 때만 에디터 내용 업데이트 + 스크롤 위치 복원
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      // 현재 스크롤 위치 저장
      if (scrollContainerRef.current) {
        savedScrollPosition.current = scrollContainerRef.current.scrollTop;
      }
      
      const styledHtml = applyInlineStylesForNaver(localHtml, currentTheme);
      if (editorRef.current.innerHTML !== styledHtml) {
        editorRef.current.innerHTML = styledHtml;

        // 📋 렌더 성공 로그 — innerHTML 실제 설정 직후
        const renderedHtml = editorRef.current.innerHTML;
        const titleMatch = renderedHtml.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
        const h2Count = (renderedHtml.match(/<h[23][^>]*>/gi) || []).length;
        console.info(`[RESULT_PREVIEW] html length=${renderedHtml.length} | title visible=${!!titleMatch} | h2 count=${h2Count} | copy visible=true`);

        // DOM 업데이트 후 스크롤 위치 복원 (더 안정적인 방법)
        setTimeout(() => {
          if (scrollContainerRef.current && savedScrollPosition.current > 0) {
            scrollContainerRef.current.scrollTop = savedScrollPosition.current;
          }
        }, 0);
      }
    }
    isInternalChange.current = false;
  }, [localHtml, currentTheme]);

  const handleHtmlChange = () => {
    if (editorRef.current) {
      isInternalChange.current = true;
      setLocalHtml(editorRef.current.innerHTML);
    }
  };

  // [훅으로 이동됨] handleSectionRegenerate, handleRegenFileChange, handleRecommendPrompt, handleRecommendCardPrompt, submitRegenerateImage, handleAiEditSubmit → useAiRefine
  // [훅으로 이동됨] handleEvaluateSeo, handleRecheckAiSmell, handleOptimizeImages, handleCheckSimilarity → useContentQuality
  // [훅으로 이동됨] handleDownloadWord, handleDownloadPDF, handleCopy, applyInlineStylesForNaver → useDocumentExport

  return (
    <div className={`rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border h-full flex flex-col overflow-hidden relative transition-colors duration-300 backdrop-blur-2xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/90 border-slate-200/60'}`}>
      <style>{`
        .naver-preview { word-break: keep-all; overflow-wrap: break-word; }
        .naver-preview .naver-post-container { max-width: 100% !important; box-sizing: border-box; padding: 0 !important; }
        .naver-preview .main-title { font-size: clamp(20px, 4vw, 32px); font-weight: 900; margin-bottom: 30px; color: #000; line-height: 1.4; padding-bottom: 20px; }
        .naver-preview h2:not(.main-title):not(.hidden-title):not(.press-subtitle), .naver-preview h3 { font-size: clamp(18px, 3vw, 24px); font-weight: bold; margin-top: 50px; margin-bottom: 20px; color: #000; padding-left: 15px; border-left: 4px solid #787fff; }
        .naver-preview p { font-size: clamp(14px, 2vw, 16px); margin-bottom: 20px; color: #333; line-height: 1.8; word-break: keep-all; }
        .naver-preview .content-image-wrapper { position: relative; margin: 90px 0; }
        .naver-preview .content-image-wrapper img { width: 100%; border-radius: 16px; display: block; box-shadow: 0 20px 50px rgba(0,0,0,0.08); cursor: pointer; transition: filter 0.3s; }
        .naver-preview .content-image-wrapper:hover img { filter: brightness(0.8); }
        .naver-preview .content-image-wrapper::after { content: '✨ 이미지 재생성'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(79, 70, 229, 0.9); color: white; padding: 12px 24px; border-radius: 20px; font-weight: 900; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
        .naver-preview .content-image-wrapper:hover::after { opacity: 1; }

        .card-news-container { max-width: 480px; margin: 0 auto; }
        .card-grid-wrapper { display: flex; flex-direction: column; gap: 24px; }
        
        .card-slide {
           background: ${dtStyle ? `linear-gradient(180deg, ${dtStyle.backgroundColor} 0%, ${dtStyle.backgroundColor}dd 100%)` : 'linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%)'};
           border-radius: ${dtStyle?.borderRadius || '24px'};
           box-shadow: ${dtStyle?.boxShadow || '0 8px 32px rgba(0,0,0,0.06)'};
           ${dtStyle?.borderWidth && dtStyle.borderWidth !== '0' ? `border: ${dtStyle.borderWidth} solid ${dtStyle.borderColor};` : ''}
           overflow: hidden;
           position: relative;
           width: 100%;
           cursor: pointer;
           transition: transform 0.2s, box-shadow 0.2s;
        }
        .card-slide:hover {
           transform: translateY(-4px);
           box-shadow: 0 12px 40px rgba(0,0,0,0.12);
        }
        .card-slide:hover .card-overlay {
           opacity: 1;
        }
        /* 모바일에서도 터치 시 오버레이 표시 */
        .card-slide:active .card-overlay {
           opacity: 1;
        }
        /* 모바일 전용: 미디어 쿼리로 항상 표시 (투명도 낮춤) */
        @media (hover: none) and (pointer: coarse) {
           .card-overlay {
              opacity: 0.95;
           }
        }
        .card-overlay {
           position: absolute;
           inset: 0;
           background: rgba(0,0,0,0.5);
           display: flex;
           flex-direction: column;
           justify-content: center;
           align-items: center;
           gap: 12px;
           opacity: 0;
           transition: opacity 0.2s;
           z-index: 10;
           /* 모바일에서 터치 가능하도록 */
           touch-action: manipulation;
        }
        .card-overlay-btn {
           padding: 12px 24px;
           border-radius: 12px;
           font-weight: 700;
           font-size: 14px;
           border: none;
           cursor: pointer;
           transition: transform 0.1s;
           display: flex;
           align-items: center;
           gap: 8px;
           user-select: none;
           -webkit-user-select: none;
           /* 모바일 터치 영역 확대 */
           min-height: 44px;
           touch-action: manipulation;
        }
        .card-overlay-btn:hover {
           transform: scale(1.05);
        }
        /* 모바일에서 터치 피드백 */
        .card-overlay-btn:active {
           transform: scale(0.95);
        }
        .card-overlay-btn.regen {
           background: linear-gradient(135deg, #8B5CF6, #6366F1);
           color: white;
        }
        .card-overlay-btn.download {
           background: white;
           color: #1e293b;
        }
        .card-number-badge {
           position: absolute;
           top: 12px;
           left: 12px;
           background: rgba(0,0,0,0.6);
           color: white;
           padding: 4px 10px;
           border-radius: 8px;
           font-size: 12px;
           font-weight: 700;
           z-index: 5;
        }

        .card-border-box {
           border: 3px solid #1e293b;
           border-radius: 20px;
           margin: 16px;
           height: calc(100% - 32px);
           display: flex;
           flex-direction: column;
           background: #fff;
           overflow: hidden;
        }

        .card-header-row {
           padding: 16px 20px;
           display: flex;
           justify-content: space-between;
           align-items: center;
           border-bottom: 1px solid #f1f5f9;
        }
        
        .brand-text {
           font-size: 10px;
           font-weight: 900;
           letter-spacing: 2px;
           text-transform: uppercase;
           color: #1e293b;
        }

        .arrow-icon {
           font-size: 16px;
           border: 2px solid #1e293b;
           border-radius: 50%;
           width: 28px;
           height: 28px;
           display: flex;
           align-items: center;
           justify-content: center;
           color: #1e293b;
        }

        .card-content-area {
           flex: 1;
           display: flex;
           flex-direction: column;
           align-items: center;
           justify-content: center;
           text-align: center;
           padding: 20px 24px;
           gap: 8px;
        }

        .card-subtitle {
           font-size: 13px;
           font-weight: 700;
           color: #3b82f6;
           margin-bottom: 4px;
           letter-spacing: -0.3px;
        }

        .card-divider-dotted {
           width: 60%;
           border-bottom: 2px dotted #cbd5e1;
           margin: 8px 0 12px 0;
        }

        .card-main-title,
        .card-content-area h1.card-main-title,
        .card-content-area p.card-main-title {
           font-size: 26px !important;
           font-weight: 900 !important;
           color: #0f172a !important;
           line-height: 1.3 !important;
           margin: 0 !important;
           word-break: keep-all !important;
           letter-spacing: -0.5px !important;
           white-space: pre-line !important;
           display: block !important;
           text-align: center !important;
           max-width: 100% !important;
           padding: 0 8px !important;
        }

        .card-highlight {
           color: #3b82f6;
        }
        
        .card-img-container {
           width: 100%;
           display: flex;
           justify-content: center;
           align-items: center;
           padding: 12px 0;
        }
        
        .card-inner-img {
            width: 85%;
            aspect-ratio: 1;
            object-fit: cover;
            object-position: center top;
            border-radius: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }

        .card-full-img {
            width: 100%;
            height: auto;
            display: block;
        }
        
        .card-desc {
            font-size: 15px;
            color: #475569;
            margin-top: 12px;
            font-weight: 500;
            line-height: 1.7;
            word-break: keep-all;
            max-width: 90%;
            min-height: 40px;
        }

        .card-footer-row {
           padding: 12px 20px 16px;
           display: flex;
           justify-content: center;
           gap: 8px;
           border-top: 1px solid #f1f5f9;
        }

        .pill-tag {
           background: #f1f5f9;
           padding: 6px 12px;
           border-radius: 16px;
           font-size: 11px;
           font-weight: 700;
           color: #475569;
        }

        .hidden-title { display: none; }
        .legal-box-card { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>

      {/* 이미지 클릭 시 선택 모달 (다운로드 or 재생성) */}
      <ImageDownloadModal
        darkMode={darkMode}
        downloadModalOpen={downloadModalOpen}
        setDownloadModalOpen={setDownloadModalOpen}
        downloadImgSrc={downloadImgSrc}
        downloadImgIndex={downloadImgIndex}
        downloadImage={downloadImage}
        setRegenOpen={setRegenOpen}
      />

      <ImageRegenModal
        darkMode={darkMode}
        regenOpen={regenOpen}
        setRegenOpen={setRegenOpen}
        regenIndex={regenIndex}
        regenPrompt={regenPrompt}
        setRegenPrompt={setRegenPrompt}
        isRecommendingPrompt={isRecommendingPrompt}
        handleRecommendPrompt={handleRecommendPrompt}
        regenRefDataUrl={regenRefDataUrl}
        regenRefName={regenRefName}
        handleRegenFileChange={handleRegenFileChange}
        isEditingAi={isEditingAi}
        submitRegenerateImage={submitRegenerateImage}
      />

      {/* 항상 표시: 점수 표시 & 다운로드 버튼 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-between text-white flex-none relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-60" />
        <div className="flex items-center gap-4 relative">
          {content.factCheck ? (
            <>
              {/* 📊 SEO 점수 (블로그에만 표시) - 가장 앞에 배치 */}
              {content.postType !== 'card_news' && (
              <>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">📊 SEO 점수</span>
                  <div className="flex items-center gap-2">
                    {seoScore ? (
                      <>
                        <span className={`text-3xl font-black ${seoScore.total >= 85 ? 'text-emerald-400' : seoScore.total >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                          {seoScore.total}점
                        </span>
                        <button
                          onClick={() => setShowSeoDetail(true)}
                          className="text-[10px] opacity-70 hover:opacity-100 underline"
                        >
                          {seoScore.total >= 85 ? '✅ 최적화' : seoScore.total >= 70 ? '⚠️ 개선필요' : '🚨 재설계'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleEvaluateSeo}
                        disabled={isEvaluatingSeo}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {isEvaluatingSeo ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            평가중...
                          </>
                        ) : (
                          '평가하기'
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* 구분선 */}
                <div className="w-px h-12 bg-slate-700"></div>
              </>
            )}
            
            {/* ⚖️ 의료법 준수 (Safety Score) */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">⚖️ 의료법</span>
              <div className="flex items-center gap-2">
                 <span className={`text-2xl font-black ${content.factCheck.safety_score > 80 ? 'text-green-400' : 'text-amber-400'}`}>
                   {content.factCheck.safety_score}점
                 </span>
                 <span className="text-[10px] opacity-70">{content.factCheck.safety_score > 80 ? '✅' : '⚠️'}</span>
              </div>
            </div>
            
            {/* 구분선 */}
            <div className="w-px h-12 bg-slate-700"></div>
            
            {/* 🎯 전환력 점수 (Conversion Score) */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">🎯 전환력</span>
              <div className="flex items-center gap-2">
                 <span className={`text-2xl font-black ${(content.factCheck.conversion_score || 0) >= 80 ? 'text-emerald-400' : (content.factCheck.conversion_score || 0) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                   {content.factCheck.conversion_score || 0}점
                 </span>
                 <span className="text-[10px] opacity-70 leading-tight">
                   {(content.factCheck.conversion_score || 0) >= 80 ? '🔥' : (content.factCheck.conversion_score || 0) >= 60 ? '👍' : '💡'}
                 </span>
              </div>
            </div>
            
            {/* 🤖 AI 냄새 점수 - 비활성화됨
                <div className="w-px h-12 bg-slate-700"></div>
                <div>AI 냄새 점수 UI</div>
            */}
            
            {content.postType === 'card_news' && (
              <div className="hidden lg:block ml-4">
                <span className="text-xs font-bold text-blue-400 border border-blue-400 px-2 py-1 rounded-lg">카드뉴스 모드</span>
              </div>
            )}
          </>
          ) : (
            <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              💡 콘텐츠를 생성하면 점수가 표시됩니다
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 relative">
             {/* 🖼️ 이미지 최적화 버튼 */}
             <button 
               onClick={handleOptimizeImages} 
               disabled={isOptimizingImages}
               className={`${
                 optimizationStats 
                   ? 'bg-green-500 hover:bg-green-600' 
                   : 'bg-amber-500 hover:bg-amber-600'
               } text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 relative`}
               title={optimizationStats 
                 ? `✅ ${optimizationStats.imageCount}개 이미지 최적화됨 (${formatFileSize(optimizationStats.totalSaved)} 절약)` 
                 : 'WebP 변환 + Lazy Loading 적용'
               }
             >
               {isOptimizingImages ? (
                 <>
                   <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                   </svg>
                   <span className="hidden lg:inline">최적화 중...</span>
                 </>
               ) : (
                 <>
                   🖼️ <span className="hidden lg:inline">{optimizationStats ? '최적화됨' : '이미지 최적화'}</span>
                 </>
               )}
             </button>
             
             <span className="text-[10px] font-black uppercase text-slate-400 mr-2 hidden lg:inline">다운로드</span>
             {content.postType === 'card_news' ? (
               <>
                 <button 
                   onClick={() => setCardDownloadModalOpen(true)} 
                   disabled={downloadingCard} 
                   className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                 >
                   📥 다운로드
                 </button>
               </>
             ) : (
               <>
                 <button onClick={handleDownloadWord} disabled={isEditingAi} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                    📄 Word
                 </button>
                 <button onClick={handleDownloadPDF} disabled={isEditingAi} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                    📑 PDF
                 </button>
               </>
             )}
        </div>
      </div>
      
      {/* 📊 SEO 점수 상세 모달 */}
      {seoScore && (
        <SeoDetailModal
          darkMode={darkMode}
          seoScore={seoScore}
          showSeoDetail={showSeoDetail}
          setShowSeoDetail={setShowSeoDetail}
          isEvaluatingSeo={isEvaluatingSeo}
          handleEvaluateSeo={handleEvaluateSeo}
        />
      )}

      {/* 🤖 AI 냄새 상세 분석 모달 */}
      <AiSmellDetailModal
        darkMode={darkMode}
        showAiSmellDetail={showAiSmellDetail}
        setShowAiSmellDetail={setShowAiSmellDetail}
        recheckResult={recheckResult}
        factCheck={content.factCheck}
      />

      {/* 카드 재생성 모달 */}
      {content.postType === 'card_news' && (
        <CardRegenModal
          darkMode={darkMode}
          cardRegenModalOpen={cardRegenModalOpen}
          setCardRegenModalOpen={setCardRegenModalOpen}
          cardRegenIndex={cardRegenIndex}
          isRegeneratingCard={isRegeneratingCard}
          cardRegenProgress={cardRegenProgress}
          currentCardImage={currentCardImage}
          editSubtitle={editSubtitle}
          setEditSubtitle={setEditSubtitle}
          editMainTitle={editMainTitle}
          setEditMainTitle={setEditMainTitle}
          editDescription={editDescription}
          setEditDescription={setEditDescription}
          editImagePrompt={editImagePrompt}
          setEditImagePrompt={setEditImagePrompt}
          isRecommendingCardPrompt={isRecommendingCardPrompt}
          handleRecommendCardPrompt={handleRecommendCardPrompt}
          isAIPromptApplied={isAIPromptApplied}
          setIsAIPromptApplied={setIsAIPromptApplied}
          cardRegenRefImage={cardRegenRefImage}
          setCardRegenRefImage={setCardRegenRefImage}
          refImageMode={refImageMode}
          setRefImageMode={setRefImageMode}
          isRefImageLocked={isRefImageLocked}
          saveRefImageToStorage={saveRefImageToStorage}
          clearRefImageFromStorage={clearRefImageFromStorage}
          promptHistory={promptHistory}
          showHistoryDropdown={showHistoryDropdown}
          setShowHistoryDropdown={setShowHistoryDropdown}
          savePromptToHistory={savePromptToHistory}
          loadFromHistory={loadFromHistory}
          handleCardRegenerate={handleCardRegenerate}
        />
      )}

      {/* 카드뉴스 다운로드 모달 */}
      {content.postType === 'card_news' && (
        <CardDownloadModal
          darkMode={darkMode}
          cardDownloadModalOpen={cardDownloadModalOpen}
          setCardDownloadModalOpen={setCardDownloadModalOpen}
          downloadingCard={downloadingCard}
          cardDownloadProgress={cardDownloadProgress}
          cardCount={cardCount || 6}
          downloadCardAsImage={downloadCardAsImage}
          openCardRegenModal={openCardRegenModal}
          downloadAllCards={downloadAllCards}
        />
      )}

      <div className={`p-6 border-b flex-none transition-colors duration-300 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <div className={`flex p-1.5 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <button onClick={() => setActiveTab('preview')} className={`px-8 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'preview' ? (darkMode ? 'bg-slate-600 text-emerald-400 shadow-sm' : 'bg-white text-green-600 shadow-sm') : 'text-slate-400'}`}>미리보기</button>
                <button onClick={() => setActiveTab('html')} className={`px-8 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'html' ? (darkMode ? 'bg-slate-600 text-emerald-400 shadow-sm' : 'bg-white text-green-600 shadow-sm') : 'text-slate-400'}`}>HTML</button>
            </div>

            {/* 소제목별 수정 버튼 (블로그 전용) */}
            {content.postType === 'blog' && blogSections.length > 0 && (
              <button
                onClick={() => setShowSectionPanel(!showSectionPanel)}
                className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
                  showSectionPanel
                    ? darkMode ? 'bg-violet-900/50 text-violet-300 border border-violet-700' : 'bg-violet-100 text-violet-700 border border-violet-300'
                    : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                소제목별 수정
              </button>
            )}
            
            {/* 글자 수 표시 */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>📊 글자 수:</span>
              <span className={`text-sm font-black ${charCount < 1500 ? 'text-amber-500' : charCount > 4000 ? 'text-blue-500' : 'text-emerald-500'}`}>
                {charCount.toLocaleString()}자
              </span>
              <span className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {charCount < 1500 ? '(짧음)' : charCount < 2500 ? '(적당)' : charCount < 4000 ? '(길음)' : '(매우 길음)'}
              </span>
            </div>
            
            {/* Undo 버튼 */}
            {canUndo && (
              <button
                type="button"
                onClick={handleUndo}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${darkMode ? 'bg-orange-900/50 text-orange-400 hover:bg-orange-900' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                title="이전 상태로 되돌리기"
              >
                ↩️ 되돌리기
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* 유사도 검사 버튼 */}
            <button 
              onClick={handleCheckSimilarity}
              disabled={isCheckingSimilarity}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                isCheckingSimilarity 
                  ? (darkMode ? 'bg-purple-900/30 text-purple-500 cursor-wait' : 'bg-purple-100/50 text-purple-400 cursor-wait')
                  : (darkMode ? 'bg-purple-900/50 text-purple-400 hover:bg-purple-900' : 'bg-purple-100 text-purple-700 hover:bg-purple-200')
              }`}
              title="블로그 유사도 검사 (중복 체크)"
            >
              {isCheckingSimilarity ? (
                <>
                  <span className="animate-spin inline-block mr-1">🔄</span>
                  검사 중...
                </>
              ) : (
                <>🔍 유사도</>
              )}
            </button>
            
            {/* 저장 버튼 */}
            <div className="flex items-center gap-1 relative">
              {/* 수동 저장 버튼 */}
              <button 
                onClick={saveManually}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-blue-900/50 text-blue-400 hover:bg-blue-900' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                title="현재 내용 저장"
              >
                💾 저장
              </button>
              
              {hasAutoSave() && (
                <div className="relative">
                  <button 
                    onClick={() => setShowAutoSaveDropdown(!showAutoSaveDropdown)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-900' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                    title="저장된 글 불러오기"
                  >
                    📂 불러오기
                  </button>
                  
                  {/* 자동저장 히스토리 드롭다운 */}
                  {showAutoSaveDropdown && autoSaveHistory.length > 0 && (
                    <div 
                      className={`absolute bottom-full right-0 mb-2 w-80 rounded-xl shadow-2xl z-[10000] overflow-hidden border-2 ${
                        darkMode ? 'bg-slate-800 border-amber-500' : 'bg-white border-amber-300'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={`px-3 py-2 text-[10px] font-bold flex items-center justify-between ${darkMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                        <span>📂 저장된 글 ({autoSaveHistory.length}/3)</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowAutoSaveDropdown(false); }}
                          className="text-xs hover:opacity-70"
                        >✕</button>
                      </div>
                      {autoSaveHistory.map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 ${
                            darkMode ? 'border-slate-700' : 'border-slate-100'
                          }`}
                        >
                          {/* 불러오기 버튼 */}
                          <button
                            type="button"
                            onClick={() => loadFromAutoSaveHistory(item)}
                            className={`flex-1 text-left text-xs transition-all rounded-lg p-2 ${
                              darkMode 
                                ? 'hover:bg-amber-900/50 text-slate-200' 
                                : 'hover:bg-amber-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-black text-sm truncate flex-1">{item.title}</span>
                              <span className={`text-[9px] ml-2 px-2 py-0.5 rounded-full ${
                                item.postType === 'card_news' 
                                  ? 'bg-purple-100 text-purple-600' 
                                  : item.postType === 'press_release'
                                  ? 'bg-amber-100 text-amber-600'
                                  : 'bg-blue-100 text-blue-600'
                              }`}>
                                {item.postType === 'card_news' ? '카드뉴스' : item.postType === 'press_release' ? '보도자료' : '블로그'}
                              </span>
                            </div>
                            <div className={`text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              🕐 {new Date(item.savedAt).toLocaleString('ko-KR', { 
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                              })}
                            </div>
                          </button>
                          
                          {/* 🗑️ 삭제 버튼 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`"${item.title}"을(를) 삭제하시겠습니까?`)) {
                                deleteHistoryItem(idx);
                              }
                            }}
                            className={`p-2 rounded-lg text-xs font-bold transition-all ${
                              darkMode 
                                ? 'bg-red-900/50 text-red-400 hover:bg-red-900' 
                                : 'bg-red-50 text-red-500 hover:bg-red-100'
                            }`}
                            title="삭제"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {lastSaved && (
                <span className={`text-[10px] hidden lg:inline ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  💾 {lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨
                </span>
              )}
            </div>
            
            <button onClick={handleCopy} className={`px-10 py-3 rounded-xl text-md font-bold text-white shadow-xl transition-all active:scale-95 ${copied ? 'bg-emerald-500' : 'bg-green-500 hover:bg-green-600'}`}>
                {copied ? '✅ 복사 완료' : '블로그로 복사'}
            </button>
          </div>
        </div>
        
      </div>



      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar transition-colors duration-300 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
        {/* 이미지 생성 실패 알림 배너 */}
        {content.imageFailCount && content.imageFailCount > 0 && (
          <div className="mx-4 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-lg">&#9888;</span>
              <span className="text-sm text-amber-800 font-medium">
                본문은 정상 생성되었습니다. 이미지 {content.imageFailCount}장은 AI 서버 과부하로 실패했습니다.
              </span>
            </div>
            <span className="text-xs text-amber-600">나중에 이미지 클릭으로 재생성 가능</span>
          </div>
        )}
        {activeTab === 'preview' ? (
          <div className={`relative ${content.postType === 'card_news' ? 'max-w-xl' : 'max-w-5xl'} mx-auto flex gap-4`}>
            {/* 섹션별 재생성 패널 (블로그 전용) - 사이드 패널 */}
            {content.postType === 'blog' && blogSections.length > 0 && showSectionPanel && (
              <div className={`sticky top-4 shrink-0 w-56 rounded-xl p-4 space-y-2 h-fit max-h-[70vh] overflow-y-auto shadow-xl self-start ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200 shadow-xl'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-sm font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    섹션별 재생성
                  </h4>
                  <button onClick={() => setShowSectionPanel(false)} className="text-xs text-slate-400 hover:text-slate-600">
                    닫기
                  </button>
                </div>
                {blogSections.map((section, idx) => (
                  <div key={idx} className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}>
                    <div className={`font-medium mb-1 truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {section.type === 'intro' ? '도입부' : section.title}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {section.html.replace(/<[^>]+>/g, '').length}자
                      </span>
                      <button
                        onClick={() => handleSectionRegenerate(idx)}
                        disabled={regeneratingSection !== null}
                        className={`ml-auto text-xs px-3 py-1 rounded-md font-medium transition-all ${
                          regeneratingSection === idx
                            ? 'bg-blue-100 text-blue-600 animate-pulse'
                            : regeneratingSection !== null
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-violet-100 text-violet-700 hover:bg-violet-200 active:scale-95'
                        }`}
                      >
                        {regeneratingSection === idx ? '재생성 중...' : '재생성'}
                      </button>
                    </div>
                  </div>
                ))}
                {regeneratingSection !== null && editProgress && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-700 animate-pulse">
                    {editProgress}
                  </div>
                )}
              </div>
            )}

            {/* 섹션 패널 토글 버튼 (블로그 전용) */}
            {content.postType === 'blog' && blogSections.length > 0 && !showSectionPanel && (
              <button
                onClick={() => setShowSectionPanel(true)}
                className={`fixed left-4 top-1/2 -translate-y-1/2 z-10 px-3 py-3 rounded-xl shadow-lg transition-all hover:scale-105 ${darkMode ? 'bg-violet-900 text-violet-300 hover:bg-violet-800 border border-violet-700' : 'bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-300'}`}
                title="소제목별 수정 패널 열기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                <span className="text-[10px] font-bold mt-1 block">수정</span>
              </button>
            )}

          <div className={`flex-1 min-w-0 bg-white shadow-lg border border-slate-100 p-6 lg:p-8 naver-preview min-h-[800px]`}>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleHtmlChange}
                onClick={(e) => {
                   const target = e.target as HTMLElement;
                   
                   // 1. 이미지 클릭 처리
                   if (target.tagName === 'IMG') {
                      const imgElement = target as HTMLImageElement;
                      const allImgs = Array.from(editorRef.current?.querySelectorAll('img') || []);
                      const index = allImgs.indexOf(imgElement) + 1;
                      handleImageClick(imgElement.src, imgElement.alt, index);
                      return;
                   }

                   // 2. 카드뉴스 재생성 플레이스홀더 클릭 처리
                   const placeholder = target.closest('.card-image-placeholder');
                   if (placeholder) {
                      const indexStr = placeholder.getAttribute('data-card-index');
                      if (indexStr) {
                        const index = parseInt(indexStr, 10);
                        openCardRegenModal(index);
                      }
                      return;
                   }

                   // 3. 오버레이 버튼 클릭 처리 (이벤트 위임 - 안전장치)
                   const overlayBtn = target.closest('.card-overlay-btn');
                   if (overlayBtn) {
                      const btn = overlayBtn as HTMLElement;
                      const indexStr = btn.getAttribute('data-index');
                      if (indexStr) {
                         const index = parseInt(indexStr, 10);
                         if (btn.classList.contains('regen')) {
                            openCardRegenModal(index);
                         } else if (btn.classList.contains('download')) {
                            handleSingleCardDownload(index);
                         }
                      }
                      return;
                   }
                }}
                className="focus:outline-none"
              />
          </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto h-full">
            <textarea 
                value={localHtml} 
                onChange={(e) => setLocalHtml(e.target.value)}
                className="w-full h-full p-10 font-mono text-sm bg-slate-900 text-green-400 rounded-3xl outline-none border-none shadow-inner resize-none" 
            />
          </div>
        )}
      </div>
      
      <div className={`p-6 border-t flex-none transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
         <div className="max-w-4xl mx-auto">
            {isEditingAi && (
                <div className="mb-3 flex items-center gap-3 animate-pulse">
                    <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-green-600">{editProgress}</span>
                </div>
            )}
            
            {/* AI 프롬프트 템플릿 버튼들 */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={`text-xs font-bold flex items-center gap-1 ${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <span>🎯 빠른 수정</span>
                  <span className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {!showTemplates && (
                  <span className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>클릭하면 자주 쓰는 AI 수정 명령어가 나타납니다</span>
                )}
              </div>
              
              {showTemplates && (
                <div className={`flex flex-wrap gap-2 p-3 rounded-xl border animate-in fade-in duration-200 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                  {AI_PROMPT_TEMPLATES.map((template, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setEditorInput(template.prompt);
                        setShowTemplates(false);
                      }}
                      disabled={isEditingAi}
                      className={`px-3 py-2 border rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 ${darkMode ? 'bg-slate-600 border-slate-500 text-slate-300 hover:border-emerald-500 hover:text-emerald-400' : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      <span>{template.icon}</span>
                      <span>{template.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <form onSubmit={handleAiEditSubmit} className="flex gap-3">
                <input 
                    type="text" 
                    value={editorInput} 
                    onChange={(e) => setEditorInput(e.target.value)}
                    placeholder="예: '3번째 문단을 더 부드럽게 고치고 전체 그림을 현대적인 스타일로 바꿔줘'"
                    className={`flex-1 px-6 py-4 border rounded-xl focus:border-green-500 outline-none font-bold text-sm transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                    disabled={isEditingAi}
                />
                <button type="submit" disabled={isEditingAi} className={`px-8 py-4 font-bold rounded-xl transition-all text-sm ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-900 text-white hover:bg-black'}`}>
                    {isEditingAi ? 'AI 작동중' : 'AI 정밀보정'}
                </button>
            </form>
         </div>
      </div>
      
      {/* 🔍 유사도 검사 결과 모달 */}
      <SimilarityModal
        darkMode={darkMode}
        showSimilarityModal={showSimilarityModal}
        setShowSimilarityModal={setShowSimilarityModal}
        similarityResult={similarityResult!}
      />
    </div>
  );
};

export default ResultPreview;
