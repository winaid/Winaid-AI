import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeneratedContent, ImageStyle as _ImageStyle, CssTheme, SeoScoreReport, FactCheckReport, SimilarityCheckResult } from '../types';
import { modifyPostWithAI, generateSingleImage, generateBlogImage, recommendImagePrompt, recommendCardNewsPrompt, regenerateCardSlide as _regenerateCardSlide, evaluateSeoScore, recheckAiSmell, checkContentSimilarity, saveBlogHistory, CARD_LAYOUT_RULE as _CARD_LAYOUT_RULE, STYLE_KEYWORDS } from '../services/geminiService';
import { CSS_THEMES as _CSS_THEMES, applyThemeToHtml } from '../utils/cssThemes';
import { optimizeAllImagesInHtml, formatFileSize } from '../utils/imageOptimizer';
import { saveAs } from 'file-saver';


// 동적 임포트: 초기 번들 크기 최적화
let docxModule: any = null;
let html2canvasModule: any = null;

// html2canvas용 oklch 색상 제거 함수
// 클론된 Document에서 모든 스타일시트의 oklch를 제거하고 인라인 스타일에 안전한 색상 적용
const removeOklchFromClonedDoc = (clonedDoc: Document, clonedElement: HTMLElement) => {
  try {
    // 1. 모든 <style> 태그에서 oklch 제거
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach(styleTag => {
      if (styleTag.textContent) {
        // oklch(...), oklab(...), color(...) 함수를 안전한 색상으로 대체
        styleTag.textContent = styleTag.textContent
          .replace(/oklch\([^)]+\)/gi, 'transparent')
          .replace(/oklab\([^)]+\)/gi, 'transparent')
          .replace(/color\([^)]+\)/gi, 'transparent');
      }
    });
    
    // 2. 모든 요소의 인라인 스타일에서 oklch 제거
    const allElements = clonedElement.querySelectorAll('*');
    const processElement = (el: Element) => {
      if (el instanceof HTMLElement && el.style) {
        const styleAttr = el.getAttribute('style');
        if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab') || styleAttr.includes('color('))) {
          el.setAttribute('style', styleAttr
            .replace(/oklch\([^)]+\)/gi, 'transparent')
            .replace(/oklab\([^)]+\)/gi, 'transparent')
            .replace(/color\([^)]+\)/gi, 'transparent')
          );
        }
      }
    };
    
    processElement(clonedElement);
    allElements.forEach(processElement);
    
    // 3. <link> 스타일시트 제거 (외부 CSS에 oklch가 있을 수 있음)
    const linkTags = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
    linkTags.forEach(link => link.remove());
    
    // 4. CSS 변수(--*)도 제거 - Tailwind가 여기에 oklch를 넣음
    const rootStyle = clonedDoc.documentElement.style;
    if (rootStyle) {
      // CSS 변수를 모두 제거
      const cssText = rootStyle.cssText;
      if (cssText.includes('oklch') || cssText.includes('oklab')) {
        clonedDoc.documentElement.setAttribute('style', cssText
          .replace(/oklch\([^)]+\)/gi, 'transparent')
          .replace(/oklab\([^)]+\)/gi, 'transparent')
        );
      }
    }
    
    console.log('✅ oklch 색상 제거 완료');
  } catch (e) {
    console.warn('oklch 제거 중 오류:', e);
  }
};

interface ResultPreviewProps {
  content: GeneratedContent;
  darkMode?: boolean;
}

// AI 수정 프롬프트 템플릿
const AI_PROMPT_TEMPLATES = [
  { label: '친근하게', prompt: '전체적으로 더 친근하고 따뜻한 톤으로 수정해줘', icon: '💗' },
  { label: 'CTA 강화', prompt: '마지막 부분의 CTA를 더 강력하게 수정해줘. 독자가 행동하고 싶게 만들어줘', icon: '🎯' },
  { label: '전문적으로', prompt: '더 전문적이고 신뢰감 있는 톤으로 수정해줘. 의학 용어도 적절히 사용해줘', icon: '👨‍⚕️' },
  { label: '짧게 요약', prompt: '전체 내용을 20% 정도 줄여서 핵심만 간결하게 정리해줘', icon: '✂️' },
  { label: '예시 추가', prompt: '각 섹션에 독자가 공감할 수 있는 구체적인 예시나 상황을 추가해줘', icon: '📝' },
  { label: 'SEO 강화', prompt: '키워드 밀도를 높이고 소제목을 SEO에 최적화된 형태로 수정해줘', icon: '🔍' },
];

// 임시저장 키
const AUTOSAVE_KEY = 'hospitalai_autosave';
const AUTOSAVE_HISTORY_KEY = 'hospitalai_autosave_history'; // 여러 저장본 관리
const CARD_PROMPT_HISTORY_KEY = 'hospitalai_card_prompt_history';
const CARD_REF_IMAGE_KEY = 'hospitalai_card_ref_image'; // 카드뉴스 참고 이미지 고정용

// 자동저장 히스토리 타입
interface AutoSaveHistoryItem {
  html: string;
  theme: string;
  postType: string;
  imageStyle?: string;
  savedAt: string;
  title: string; // 첫 번째 제목 추출
}

// 카드 프롬프트 히스토리 타입
interface CardPromptHistoryItem {
  subtitle: string;
  mainTitle: string;
  description: string;
  imagePrompt: string;
  savedAt: string;
}

const ResultPreview: React.FC<ResultPreviewProps> = ({ content, darkMode = false }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'html'>('preview');
  const [localHtml, setLocalHtml] = useState(content.fullHtml);
  const [currentTheme, setCurrentTheme] = useState<CssTheme>(content.cssTheme || 'modern');
  const [editorInput, setEditorInput] = useState('');
  const [isEditingAi, setIsEditingAi] = useState(false);
  const [editProgress, setEditProgress] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  
  // 자동저장 히스토리 (여러 저장본 관리)
  const [autoSaveHistory, setAutoSaveHistory] = useState<AutoSaveHistoryItem[]>([]);
  const [showAutoSaveDropdown, setShowAutoSaveDropdown] = useState(false);
  
  // Undo 기능을 위한 히스토리
  const [htmlHistory, setHtmlHistory] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  
  // 이미지 다운로드 모달
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadImgSrc, setDownloadImgSrc] = useState('');
  const [downloadImgIndex, setDownloadImgIndex] = useState(0);
  
  // 카드뉴스 다운로드 모달
  const [cardDownloadModalOpen, setCardDownloadModalOpen] = useState(false);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const [cardDownloadProgress, setCardDownloadProgress] = useState('');
  
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
  const [_editTags, _setEditTags] = useState(''); // 향후 태그 편집 기능에 활용
  const [editImagePrompt, setEditImagePrompt] = useState('');
  const [cardRegenRefImage, setCardRegenRefImage] = useState(''); // 참고 이미지
  const [refImageMode, setRefImageMode] = useState<'recolor' | 'copy'>('copy'); // 참고 이미지 적용 방식: recolor=복제+색상변경, copy=완전복제
  const [currentCardImage, setCurrentCardImage] = useState(''); // 현재 카드의 이미지 URL
  const [isRecommendingCardPrompt, setIsRecommendingCardPrompt] = useState(false); // 카드뉴스 AI 프롬프트 추천 중
  const [isAIPromptApplied, setIsAIPromptApplied] = useState(false); // AI 추천 프롬프트가 적용된 상태인지 (자동 연동 스킵용)
  const [promptHistory, setPromptHistory] = useState<CardPromptHistoryItem[]>([]); // 저장된 프롬프트 히스토리
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [isRefImageLocked, setIsRefImageLocked] = useState(false); // 참고 이미지 고정 여부
  
  // 🎨 커스텀 스타일 프롬프트 저장 (재생성 시에도 유지)
  const [savedCustomStylePrompt, setSavedCustomStylePrompt] = useState<string | undefined>(content.customImagePrompt);
  
  // 📊 SEO 점수 평가 관련 상태
  const [seoScore, setSeoScore] = useState<SeoScoreReport | null>(content.seoScore || null);
  const [isEvaluatingSeo, setIsEvaluatingSeo] = useState(false);
  const [showSeoDetail, setShowSeoDetail] = useState(false);
  
  // 🤖 AI 냄새 상세 분석 모달 상태
  const [showAiSmellDetail, setShowAiSmellDetail] = useState(false);
  
  // 🔄 AI 냄새 재검사 상태
  const [isRecheckingAiSmell, setIsRecheckingAiSmell] = useState(false);
  const [recheckResult, setRecheckResult] = useState<FactCheckReport | null>(null);
  
  // 🖼️ 이미지 최적화 상태
  const [isOptimizingImages, setIsOptimizingImages] = useState(false);
  const [_optimizationProgress, _setOptimizationProgress] = useState(''); // 향후 진행률 표시에 활용
  const [optimizationStats, setOptimizationStats] = useState<{ totalSaved: number; imageCount: number } | null>(null);
  
  // 🔍 유사도 검사 상태
  const [isCheckingSimilarity, setIsCheckingSimilarity] = useState(false);
  const [similarityResult, setSimilarityResult] = useState<SimilarityCheckResult | null>(null);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);
  
  // content.seoScore가 있으면 자동으로 설정
  useEffect(() => {
    if (content.seoScore) {
      console.log('📊 SEO 점수 자동 로드:', content.seoScore.total);
      setSeoScore(content.seoScore);
    }
  }, [content.seoScore]);
  
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
      alert('참고 이미지가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
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
    alert('✅ 프롬프트가 저장되었습니다!');
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
  useEffect(() => {
    // 🔒 AI 추천 프롬프트가 적용된 상태면 자동 연동 스킵 (사용자가 입력한 AI 프롬프트 보존)
    if (isAIPromptApplied) {
      return;
    }
    
    // 텍스트 내용이 하나라도 있으면 이미지 프롬프트 자동 생성
    if (editSubtitle || editMainTitle || editDescription) {
      const style = content.imageStyle || 'illustration';
      
      // 🎨 커스텀 스타일일 때는 savedCustomStylePrompt 사용, 아니면 기본 스타일
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
  
  // 카드 수 (localHtml 변경 시 업데이트)
  const [cardCount, setCardCount] = useState(0);
  
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenIndex, setRegenIndex] = useState<number>(1);
  const [regenPrompt, setRegenPrompt] = useState<string>('');
  const [regenRefDataUrl, setRegenRefDataUrl] = useState<string | undefined>(undefined);
  const [regenRefName, setRegenRefName] = useState<string>('');
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useRef<number>(0);

  useEffect(() => {
    setLocalHtml(content.fullHtml);
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

  // 단일 카드 다운로드
  const handleSingleCardDownload = async (cardIndex: number) => {
    const cards = document.querySelectorAll('.naver-preview .card-slide');
    const card = cards[cardIndex] as HTMLElement;
    if (!card) {
      alert('카드를 찾을 수 없습니다.');
      return;
    }
    
    // 다운로드 진행 표시
    setDownloadingCard(true);
    setCardDownloadProgress(`${cardIndex + 1}번 카드 다운로드 준비 중...`);
    
    try {
      // html2canvas 동적 로드
      if (!html2canvasModule) {
        setCardDownloadProgress('모듈 로드 중...');
        html2canvasModule = (await import('html2canvas')).default;
      }
      
      // 오버레이 임시 숨김
      const overlay = card.querySelector('.card-overlay') as HTMLElement;
      const badge = card.querySelector('.card-number-badge') as HTMLElement;
      if (overlay) overlay.style.display = 'none';
      if (badge) badge.style.display = 'none';
      
      setCardDownloadProgress(`${cardIndex + 1}번 카드 이미지 생성 중...`);
      
      const canvas = await html2canvasModule(card, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000, // 이미지 로드 타임아웃 15초
        onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
          // 클론된 문서에서 오버레이 제거
          const clonedOverlay = clonedDoc.querySelector('.card-overlay') as HTMLElement;
          const clonedBadge = clonedDoc.querySelector('.card-number-badge') as HTMLElement;
          if (clonedOverlay) clonedOverlay.remove();
          if (clonedBadge) clonedBadge.remove();
          
          // oklch/oklab 색상을 안전한 색상으로 변환 (html2canvas 호환성)
          removeOklchFromClonedDoc(clonedDoc, clonedElement);
        }
      });
      
      // 오버레이 복구
      if (overlay) overlay.style.display = '';
      if (badge) badge.style.display = '';
      
      // Promise로 toBlob 처리
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b: Blob | null) => resolve(b), 'image/png', 1.0);
      });
      
      if (blob) {
        saveAs(blob, `card_${cardIndex + 1}.png`);
        setCardDownloadProgress(`✅ ${cardIndex + 1}번 카드 다운로드 완료!`);
        setTimeout(() => setCardDownloadProgress(''), 1500);
      } else {
        // blob 생성 실패 시 toDataURL 방식으로 폴백
        console.warn('toBlob 실패, toDataURL로 폴백');
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `card_${cardIndex + 1}.png`;
        link.href = dataUrl;
        link.click();
        setCardDownloadProgress(`✅ ${cardIndex + 1}번 카드 다운로드 완료!`);
        setTimeout(() => setCardDownloadProgress(''), 1500);
      }
    } catch (error) {
      console.error('카드 다운로드 실패:', error);
      // 오버레이 복구 (에러 발생 시에도)
      const overlay = card.querySelector('.card-overlay') as HTMLElement;
      const badge = card.querySelector('.card-number-badge') as HTMLElement;
      if (overlay) overlay.style.display = '';
      if (badge) badge.style.display = '';
      
      setCardDownloadProgress('');
      alert(`❌ 카드 다운로드에 실패했습니다.\n\n원인: ${error instanceof Error ? error.message : '알 수 없는 오류'}\n\n💡 팁: 카드에 외부 이미지가 포함된 경우 다운로드가 실패할 수 있습니다.\n카드를 재생성하면 해결될 수 있습니다.`);
    } finally {
      setDownloadingCard(false);
    }
  };

  // HTML에서 제목 추출하는 함수
  const extractTitle = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 카드뉴스: .card-main-title 또는 .hidden-title
    const cardTitle = tempDiv.querySelector('.card-main-title, .hidden-title');
    if (cardTitle) return (cardTitle.textContent || '').slice(0, 30) || '카드뉴스';
    
    // 블로그: h1, h2, .blog-title
    const blogTitle = tempDiv.querySelector('h1, h2, .blog-title');
    if (blogTitle) return (blogTitle.textContent || '').slice(0, 30) || '블로그 글';
    
    return '저장된 글';
  };

  // 자동저장 히스토리 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_HISTORY_KEY);
      if (saved) {
        setAutoSaveHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('자동저장 히스토리 로드 실패:', e);
    }
  }, []);

  // localStorage 안전 저장 함수 (용량 초과 방지)
  const safeLocalStorageSet = (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      // QuotaExceededError 처리
      console.warn('localStorage 용량 초과, 오래된 데이터 정리 중...');
      return false;
    }
  };
  
  // 🔧 localStorage 용량 확인 함수
  const getLocalStorageUsage = (): { used: number; total: number; percent: number } => {
    let total = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
      }
    }
    const maxSize = 5 * 1024 * 1024; // 5MB
    return { used: total, total: maxSize, percent: Math.round((total / maxSize) * 100) };
  };
  
  // 🔧 히스토리에서 가장 오래된 항목 삭제
  const removeOldestFromHistory = (): boolean => {
    try {
      const historyStr = localStorage.getItem(AUTOSAVE_HISTORY_KEY);
      if (!historyStr) return false;
      
      const history = JSON.parse(historyStr);
      if (history.length === 0) return false;
      
      // 가장 오래된 것 제거 (배열 마지막)
      history.pop();
      localStorage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(history));
      console.log('🗑️ 오래된 저장본 1개 삭제, 남은 개수:', history.length);
      return true;
    } catch {
      return false;
    }
  };

  // 수동 저장 함수 (사용자가 버튼 클릭 시 저장)
  const saveManually = () => {
    if (!localHtml || !localHtml.trim()) {
      alert('저장할 내용이 없습니다.');
      return;
    }
    
    // 🔧 현재 히스토리가 이미 3개면 저장 불가
    if (autoSaveHistory.length >= 3) {
      alert('⚠️ 저장 슬롯이 가득 찼습니다!\n\n불러오기에서 기존 저장본을 삭제한 후 다시 저장해주세요.');
      return;
    }
    
    const now = new Date();
    const title = extractTitle(localHtml);
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    const saveData = {
      html: localHtml,
      theme: currentTheme,
      postType: content.postType,
      imageStyle: content.imageStyle,
      savedAt: now.toISOString(),
      title: `${title} (${timeStr})` // 시간 포함하여 구분
    };
    
    // 🔧 저장할 데이터 크기 확인
    const saveDataStr = JSON.stringify(saveData);
    const dataSize = saveDataStr.length * 2; // UTF-16
    const usage = getLocalStorageUsage();
    
    console.log(`💾 저장 시도: ${Math.round(dataSize/1024)}KB, 현재 사용량: ${usage.percent}%`);
    
    // 🔧 용량 부족 시 오래된 것 자동 삭제 (최대 3번 시도)
    let retryCount = 0;
    while (usage.used + dataSize > usage.total * 0.9 && retryCount < 3) {
      console.warn(`⚠️ 용량 부족 (${usage.percent}%), 오래된 저장본 삭제 중...`);
      if (!removeOldestFromHistory()) break;
      retryCount++;
    }
    
    // 현재 저장 (단일 저장은 항상 시도)
    if (!safeLocalStorageSet(AUTOSAVE_KEY, saveDataStr)) {
      // 용량 초과 시 히스토리 전체 삭제 후 재시도
      console.warn('🗑️ 히스토리 전체 삭제 후 재시도...');
      localStorage.removeItem(AUTOSAVE_HISTORY_KEY);
      setAutoSaveHistory([]);
      
      if (!safeLocalStorageSet(AUTOSAVE_KEY, saveDataStr)) {
        alert('⚠️ 저장 용량이 부족합니다.\n\n이미지가 많은 콘텐츠는 용량을 많이 차지합니다.\n기존 저장본을 모두 삭제 후 다시 시도해주세요.');
        return;
      }
    }
    setLastSaved(now);
    
    // 히스토리에 추가 (최근 3개만 유지)
    setAutoSaveHistory(prev => {
      // 🔧 같은 제목 필터링 제거 - 시간이 다르면 별도 저장
      let newHistory = [saveData, ...prev].slice(0, 3);
      
      // 저장 시도 (용량 초과 시 오래된 것부터 삭제)
      let historyStr = JSON.stringify(newHistory);
      
      // 🔧 저장 실패 시 오래된 것 하나씩 삭제하며 재시도
      while (!safeLocalStorageSet(AUTOSAVE_HISTORY_KEY, historyStr) && newHistory.length > 1) {
        console.warn(`⚠️ 히스토리 저장 실패, 오래된 항목 삭제 중... (${newHistory.length}개 → ${newHistory.length - 1}개)`);
        newHistory.pop(); // 가장 오래된 것 삭제
        historyStr = JSON.stringify(newHistory);
      }
      
      if (newHistory.length === 1 && !safeLocalStorageSet(AUTOSAVE_HISTORY_KEY, historyStr)) {
        // 그래도 실패하면 경고
        alert('⚠️ 저장 용량이 부족하여 이전 저장본이 삭제되었습니다.');
        newHistory = [saveData]; // 현재 것만 유지
        localStorage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(newHistory));
      }
      
      return newHistory;
    });
    
    const finalUsage = getLocalStorageUsage();
    alert(`✅ "${title}" 저장되었습니다! (${autoSaveHistory.length + 1}/3)\n\n💾 저장 공간: ${finalUsage.percent}% 사용 중`);
  };

  // 특정 저장본 불러오기
  const loadFromAutoSaveHistory = (item: AutoSaveHistoryItem) => {
    setLocalHtml(item.html);
    if (item.theme) setCurrentTheme(item.theme as any);
    setShowAutoSaveDropdown(false);
    alert(`"${item.title}" 불러왔습니다!`);
  };

  // 임시저장 삭제 (향후 UI에서 활용 가능)
  const _clearAutoSave = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_HISTORY_KEY);
    setAutoSaveHistory([]);
    setLastSaved(null);
    alert('임시저장이 삭제되었습니다.');
  };

  // 임시저장 데이터 있는지 확인
  const hasAutoSave = () => {
    try {
      return autoSaveHistory.length > 0;
    } catch {
      return false;
    }
  };

  // Undo: 이전 상태로 되돌리기
  const handleUndo = () => {
    if (htmlHistory.length > 0) {
      const prevHtml = htmlHistory[htmlHistory.length - 1];
      setHtmlHistory(prev => prev.slice(0, -1));
      setLocalHtml(prevHtml);
      setCanUndo(htmlHistory.length > 1);
    }
  };

  // 히스토리에 현재 상태 저장 (AI 수정 전에 호출)
  const saveToHistory = () => {
    setHtmlHistory(prev => [...prev.slice(-9), localHtml]); // 최대 10개 유지
    setCanUndo(true);
  };

  // 이미지 다운로드 함수
  const downloadImage = (imgSrc: string, index: number) => {
    const link = document.createElement('a');
    link.href = imgSrc;
    link.download = `hospital-ai-image-${index}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // 카드뉴스 1장씩 전체 다운로드 (html2canvas 사용)
  const downloadCardAsImage = async (cardIndex: number) => {
    const cardSlides = getCardElements();
    if (!cardSlides || !cardSlides[cardIndex]) {
      alert('카드를 찾을 수 없습니다. 카드뉴스를 먼저 생성해주세요.');
      return;
    }
    
    setDownloadingCard(true);
    setCardDownloadProgress(`${cardIndex + 1}번 카드 이미지 생성 중...`);
    
    try {
      // html2canvas 동적 로드
      if (!html2canvasModule) {
        html2canvasModule = (await import('html2canvas')).default;
      }
      
      const card = cardSlides[cardIndex] as HTMLElement;
      const canvas = await html2canvasModule(card, {
        scale: 2, // 고화질
        backgroundColor: null,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      
      const link = document.createElement('a');
      link.download = `card-news-${cardIndex + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      setCardDownloadProgress('');
    } catch (error) {
      console.error('카드 다운로드 실패:', error);
      alert('카드 다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloadingCard(false);
    }
  };
  
  // 카드 슬라이드 재생성
  const handleCardRegenerate = async () => {
    // 편집된 프롬프트가 있는지 확인
    const hasEditedPrompt = editSubtitle || editMainTitle || editDescription || editImagePrompt || cardRegenRefImage;
    
    if (!hasEditedPrompt) {
      alert('프롬프트를 수정하거나 참고 이미지를 업로드해주세요.');
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
          const newCardHtml = `
            <div class="card-slide" style="border-radius: 24px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
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
          alert(`⚠️ ${cardRegenIndex + 1}번 카드 이미지 생성에 실패했습니다.\nAI가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.`);
        } else {
          alert(`✅ ${cardRegenIndex + 1}번 카드가 재생성되었습니다!`);
        }
        setCardRegenModalOpen(false);
        setCardRegenInstruction('');
        setCardRegenProgress('');
      } else {
        throw new Error('이미지가 생성되지 않았습니다. 잠시 후 다시 시도해주세요.');
      }
      
    } catch (error) {
      console.error('카드 재생성 실패:', error);
      alert('카드 재생성 중 오류가 발생했습니다.');
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

  // 카드 요소들 가져오기 (여러 방법 시도)
  const getCardElements = (): NodeListOf<Element> | null => {
    // 1. editorRef에서 찾기
    let cards = editorRef.current?.querySelectorAll('.card-slide');
    if (cards && cards.length > 0) return cards;
    
    // 2. naver-preview 영역에서 찾기
    cards = document.querySelector('.naver-preview')?.querySelectorAll('.card-slide');
    if (cards && cards.length > 0) return cards;
    
    // 3. 전체 document에서 찾기
    cards = document.querySelectorAll('.card-slide');
    if (cards && cards.length > 0) return cards;
    
    return null;
  };
  
  // 카드 수 가져오기 (향후 UI에 카드 개수 표시 시 활용)
  const _getCardCount = () => {
    return getCardElements()?.length || 0;
  };
  
  // 모든 카드뉴스 일괄 다운로드
  const downloadAllCards = async () => {
    const cardSlides = getCardElements();
    if (!cardSlides || cardSlides.length === 0) {
      alert('다운로드할 카드가 없습니다. 카드뉴스를 먼저 생성해주세요.');
      return;
    }
    
    setDownloadingCard(true);
    let successCount = 0;
    let failedCards: number[] = [];
    
    try {
      // html2canvas 동적 로드
      if (!html2canvasModule) {
        setCardDownloadProgress('모듈 로드 중...');
        html2canvasModule = (await import('html2canvas')).default;
      }
      
      for (let i = 0; i < cardSlides.length; i++) {
        setCardDownloadProgress(`${i + 1}/${cardSlides.length}장 다운로드 중...`);
        
        try {
          const card = cardSlides[i] as HTMLElement;
          
          // 오버레이 임시 숨김
          const overlay = card.querySelector('.card-overlay') as HTMLElement;
          const badge = card.querySelector('.card-number-badge') as HTMLElement;
          if (overlay) overlay.style.display = 'none';
          if (badge) badge.style.display = 'none';
          
          const canvas = await html2canvasModule(card, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            allowTaint: true,
            logging: false,
            imageTimeout: 15000,
            onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
              const clonedOverlay = clonedDoc.querySelector('.card-overlay') as HTMLElement;
              const clonedBadge = clonedDoc.querySelector('.card-number-badge') as HTMLElement;
              if (clonedOverlay) clonedOverlay.remove();
              if (clonedBadge) clonedBadge.remove();
              
              // oklch/oklab 색상을 안전한 색상으로 변환 (html2canvas 호환성)
              removeOklchFromClonedDoc(clonedDoc, clonedElement);
            }
          });
          
          // 오버레이 복구
          if (overlay) overlay.style.display = '';
          if (badge) badge.style.display = '';
          
          // Promise로 toBlob 처리 (타임아웃 포함)
          const blob = await Promise.race([
            new Promise<Blob | null>((resolve) => {
              canvas.toBlob((b: Blob | null) => resolve(b), 'image/png', 1.0);
            }),
            new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Blob 생성 타임아웃')), 10000)
            )
          ]);
          
          if (blob) {
            saveAs(blob, `card-news-${i + 1}.png`);
            successCount++;
          } else {
            // toDataURL 폴백
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `card-news-${i + 1}.png`;
            link.href = dataUrl;
            link.click();
            successCount++;
          }
          
          // 각 다운로드 사이 짧은 딜레이 (브라우저 부하 방지)
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (cardError) {
          console.error(`${i + 1}번 카드 다운로드 실패:`, cardError);
          failedCards.push(i + 1);
          // 실패해도 다음 카드 계속 진행
        }
      }
      
      // 결과 메시지
      if (failedCards.length === 0) {
        setCardDownloadProgress(`✅ ${successCount}장 모두 다운로드 완료!`);
        
        // 🆕 블로그 이력 저장 (카드뉴스 다운로드 성공 시)
        if (content.title && localHtml) {
          saveBlogHistory(
            content.title,
            localHtml.replace(/<[^>]*>/g, ' ').trim(),
            localHtml,
            content.keyword?.split(',').map(k => k.trim()) || [],
            undefined,
            content.category
          ).catch(err => {
            console.error('블로그 이력 저장 실패 (메인 플로우는 계속):', err);
          });
        }
      } else {
        setCardDownloadProgress(`⚠️ ${successCount}장 완료, ${failedCards.length}장 실패 (${failedCards.join(', ')}번)`);
      }
      setTimeout(() => setCardDownloadProgress(''), 3000);
      
      // 실패한 카드가 있으면 안내
      if (failedCards.length > 0) {
        setTimeout(() => {
          alert(`⚠️ ${failedCards.length}장의 카드 다운로드에 실패했습니다.\n(${failedCards.join(', ')}번 카드)\n\n💡 해당 카드를 재생성한 후 다시 시도해주세요.`);
        }, 500);
      }
      
    } catch (error) {
      console.error('카드 다운로드 실패:', error);
      setCardDownloadProgress('');
      alert(`❌ 카드 다운로드 중 오류가 발생했습니다.\n\n원인: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setDownloadingCard(false);
    }
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

  const _openRegenModal = (imgIndex: number, currentPrompt: string) => { // 향후 이미지 재생성 모달에 활용
    setRegenIndex(imgIndex);
    setRegenPrompt(currentPrompt || '전문적인 의료 일러스트');
    setRegenRefDataUrl(undefined);
    setRegenRefName('');
    setRegenOpen(true);
  };

  const handleRegenFileChange = (file: File | null) => {
    if (!file) {
      setRegenRefDataUrl(undefined);
      setRegenRefName('');
      return;
    }
    setRegenRefName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const v = (reader.result || '').toString();
      if (v.startsWith('data:')) setRegenRefDataUrl(v);
    };
    reader.readAsDataURL(file);
  };

  const handleRecommendPrompt = async () => {
    setIsRecommendingPrompt(true);
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = localHtml;
      const textContent = tempDiv.innerText || tempDiv.textContent || '';
      
      // 현재 이미지 스타일을 전달하여 스타일에 맞는 프롬프트 추천
      // 🎨 커스텀 스타일일 때 savedCustomStylePrompt 전달
      const currentStyle = content.imageStyle || 'illustration';
      const recommendedPrompt = await recommendImagePrompt(textContent, regenPrompt, currentStyle, savedCustomStylePrompt);
      setRegenPrompt(recommendedPrompt);
    } catch {
      alert('프롬프트 추천 중 오류가 발생했습니다.');
    } finally {
      setIsRecommendingPrompt(false);
    }
  };

  // 🎴 카드뉴스용 AI 프롬프트 추천 - 부제/메인제목/설명 포함!
  const handleRecommendCardPrompt = async () => {
    setIsRecommendingCardPrompt(true);
    try {
      const currentStyle = content.imageStyle || 'illustration';
      
      // 🎴 카드뉴스 전용 프롬프트 추천 함수 사용
      const recommendedPrompt = await recommendCardNewsPrompt(
        editSubtitle,
        editMainTitle,
        editDescription,
        currentStyle,
        savedCustomStylePrompt
      );
      
      // 🔒 AI 추천 프롬프트 적용 - 자동 연동 스킵 플래그 ON
      setIsAIPromptApplied(true);
      setEditImagePrompt(recommendedPrompt);
    } catch {
      alert('프롬프트 추천 중 오류가 발생했습니다.');
    } finally {
      setIsRecommendingCardPrompt(false);
    }
  };

  const submitRegenerateImage = async () => {
    if (!regenPrompt.trim()) return;
    setIsEditingAi(true);
    setEditProgress(`${regenIndex}번 이미지를 다시 생성 중...`);
    try {
      const style = content.imageStyle || 'illustration';
      const isCardNews = content.postType === 'card_news';
      const imgRatio = isCardNews ? "1:1" : "16:9";
      // 🎨 커스텀 스타일 프롬프트: savedCustomStylePrompt 사용 (재생성 시에도 유지!)
      const customStylePrompt = savedCustomStylePrompt || undefined;
      
      let newImageData: string;
      
      if (isCardNews) {
        // 🎴 카드뉴스: generateSingleImage 사용 (텍스트 포함, 브라우저 프레임, 1:1)
        console.log('🔄 카드뉴스 이미지 재생성:', { style, customStylePrompt: customStylePrompt?.substring(0, 50) });
        newImageData = await generateSingleImage(regenPrompt.trim(), style, imgRatio, customStylePrompt);
      } else {
        // 📝 블로그: generateBlogImage 사용 (텍스트 없는 순수 이미지, 16:9)
        console.log('🔄 블로그 이미지 재생성:', { style, customStylePrompt: customStylePrompt?.substring(0, 50) });
        newImageData = await generateBlogImage(regenPrompt.trim(), style, imgRatio, customStylePrompt);
      }
      
      if (newImageData) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = localHtml;
        const imgs = tempDiv.querySelectorAll('img');
        if (imgs[regenIndex - 1]) {
          imgs[regenIndex - 1].src = newImageData;
          imgs[regenIndex - 1].alt = regenPrompt.trim();
          setLocalHtml(tempDiv.innerHTML);
        }
        alert('✅ 이미지가 재생성되었습니다!');
        setRegenOpen(false);
      } else {
        alert('이미지를 생성하지 못했습니다. 다시 시도해주세요.');
      }
    } catch {
      alert('이미지 생성 중 오류가 발생했습니다.');
    } finally {
      setIsEditingAi(false);
      setEditProgress('');
    }
  };

  // 이미지 URL을 ArrayBuffer로 변환하는 함수
  const fetchImageAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
    try {
      // base64 데이터인 경우
      if (url.startsWith('data:')) {
        const base64Data = url.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
      // 일반 URL인 경우
      const response = await fetch(url);
      return await response.arrayBuffer();
    } catch (e) {
      console.error('이미지 로드 실패:', e);
      return null;
    }
  };

  // HTML에서 깨끗한 텍스트 추출 (태그 제거, 정리)
  const cleanText = (text: string | null): string => {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')  // 연속 공백을 하나로
      .replace(/\n+/g, ' ')  // 줄바꿈을 공백으로
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width 문자 제거
      .replace(/[\u0332-\u0338]/g, '') // Combining 밑줄 문자 제거 (̲)
      .replace(/[\u035C-\u0362]/g, '') // 기타 Combining 문자 제거
      .replace(/[^\x20-\x7E\uAC00-\uD7A3\u3131-\u318E\u1100-\u11FF\u3000-\u303F\uFF00-\uFFEF]/g, (char) => {
        // 한글, 영문, 숫자, 기본 특수문자, 한글 자모, CJK 기호 외에는 검사
        const code = char.charCodeAt(0);
        // 이모지 범위 확인 (U+1F300-U+1F9FF, U+2600-U+26FF, U+2700-U+27BF)
        if ((code >= 0x1F300 && code <= 0x1F9FF) ||
            (code >= 0x2600 && code <= 0x26FF) ||
            (code >= 0x2700 && code <= 0x27BF)) {
          return char; // 이모지는 유지
        }
        // 그 외 특수 유니코드는 제거
        return '';
      })
      .trim();
  };

  // 📊 SEO 점수 평가 함수
  const handleEvaluateSeo = async () => {
    if (isEvaluatingSeo || content.postType === 'card_news') return;
    
    setIsEvaluatingSeo(true);
    setEditProgress('📊 SEO 점수 평가 중...');
    
    try {
      // HTML에서 제목 추출
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = localHtml;
      const titleElement = tempDiv.querySelector('.main-title, h2, h1');
      const title = titleElement?.textContent?.trim() || content.title || '';
      
      // 토픽/키워드 추출 (content에서 가져오거나 제목에서 추출)
      const topic = title;
      const keywords = title.split(/[,\s]+/).slice(0, 5).join(', ');
      
      const result = await evaluateSeoScore(localHtml, title, topic, keywords);
      setSeoScore(result);
      setShowSeoDetail(true);
      setEditProgress('');
    } catch (error) {
      console.error('SEO 평가 실패:', error);
      setEditProgress('SEO 평가 실패');
      setTimeout(() => setEditProgress(''), 2000);
    } finally {
      setIsEvaluatingSeo(false);
    }
  };

  // 🔄 AI 냄새 재검사 함수 (현재 비활성화)
  const handleRecheckAiSmell = async () => {
    // AI 냄새 점수 미출력으로 인해 검사 기능 비활성화
    console.log('🔇 AI 냄새 재검사 기능이 비활성화되었습니다.');
    return;
    
    /* 기존 코드 보존 (필요시 재활성화)
    if (isRecheckingAiSmell || content.postType === 'card_news') return;
    
    setIsRecheckingAiSmell(true);
    setEditProgress('🤖 AI 냄새 재검사 중...');
    
    try {
      const result = await recheckAiSmell(localHtml);
      setRecheckResult(result);
      
      // 결과에 따라 메시지 표시
      const aiSmellScore = result.ai_smell_score || 0;
      if (aiSmellScore <= 20) {
        setEditProgress(`✅ AI 냄새 점수: ${aiSmellScore}점 - 사람 글 수준! 🎉`);
      } else if (aiSmellScore <= 40) {
        setEditProgress(`⚠️ AI 냄새 점수: ${aiSmellScore}점 - 경계선 (부분 수정 권장)`);
      } else {
        setEditProgress(`❌ AI 냄새 점수: ${aiSmellScore}점 - 재작성 필요`);
      }
      
      setTimeout(() => setEditProgress(''), 3000);
    } catch (error) {
      console.error('AI 냄새 재검사 실패:', error);
      setEditProgress('❌ AI 냄새 재검사 실패');
      setTimeout(() => setEditProgress(''), 2000);
    } finally {
      setIsRecheckingAiSmell(false);
    }
    */
  };

  // 🖼️ 이미지 최적화 함수
  const handleOptimizeImages = async () => {
    if (isOptimizingImages) return;
    
    setIsOptimizingImages(true);
    setOptimizationProgress('이미지 분석 중...');
    
    try {
      const result = await optimizeAllImagesInHtml(
        localHtml,
        { quality: 0.85, maxWidth: 1200, format: 'webp' },
        (message) => setOptimizationProgress(message)
      );
      
      setLocalHtml(result.html);
      setOptimizationStats(result.stats);
      
      if (result.stats.imageCount > 0) {
        setOptimizationProgress(`✅ ${result.stats.imageCount}개 이미지 최적화 완료! (${formatFileSize(result.stats.totalSaved)} 절약)`);
      } else {
        setOptimizationProgress('✅ Lazy loading 적용 완료!');
      }
      
      setTimeout(() => setOptimizationProgress(''), 4000);
    } catch (error) {
      console.error('이미지 최적화 실패:', error);
      setOptimizationProgress('❌ 이미지 최적화 실패');
      setTimeout(() => setOptimizationProgress(''), 2000);
    } finally {
      setIsOptimizingImages(false);
    }
  };

  // 🔍 유사도 검사 함수
  const handleCheckSimilarity = async () => {
    if (isCheckingSimilarity) return;
    
    setIsCheckingSimilarity(true);
    setSimilarityResult(null);
    
    try {
      const result = await checkContentSimilarity(
        content.htmlContent,
        content.title,
        (msg) => console.log('📊 유사도 검사:', msg)
      );
      
      setSimilarityResult(result);
      setShowSimilarityModal(true);
      
      // 결과에 따라 알림
      if (result.status === 'HIGH_RISK') {
        alert('⚠️ 유사한 콘텐츠가 발견되었습니다!\n재작성을 권장합니다.');
      } else if (result.status === 'MEDIUM_RISK') {
        alert('💡 일부 유사한 표현이 있습니다.\n확인해보세요.');
      } else if (result.status === 'ORIGINAL') {
        alert('✅ 독창적인 콘텐츠입니다!');
      }
    } catch (error) {
      console.error('유사도 검사 실패:', error);
      alert('유사도 검사 중 오류가 발생했습니다.\n\n💡 Google Custom Search API 키가 설정되어 있는지 확인해주세요.');
    } finally {
      setIsCheckingSimilarity(false);
    }
  };

  // 워드 다운로드 함수 - 미리보기 화면 그대로 HTML로 내보내기 (Word에서 열 수 있음)
  const handleDownloadWord = async () => {
    setEditProgress('Word 문서 생성 중...');
    
    try {
      // 🎯 미리보기 CSS 그대로 적용
      let styledHtml = applyInlineStylesForNaver(localHtml, currentTheme);
      
      // Word용 HTML 문서 생성 (mso 태그로 Word 호환성 확보)
      const wordHtml = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word 15">
  <meta name="Originator" content="Microsoft Word 15">
  <!--[if gte mso 9]>
  <xml>
    <o:DocumentProperties>
      <o:Author>Hospital AI</o:Author>
    </o:DocumentProperties>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: A4;
      margin: 2.5cm;
    }
    body {
      font-family: '맑은 고딕', Malgun Gothic, sans-serif;
      font-size: 11pt;
      line-height: 1.8;
      color: #333;
      max-width: 100%;
    }
    h2 {
      font-size: 18pt;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 20px;
      padding-bottom: 10px;
    }
    h3 {
      font-size: 14pt;
      font-weight: bold;
      color: #1e40af;
      margin-top: 25px;
      margin-bottom: 10px;
      padding-left: 12px;
      border-left: 4px solid #787fff;
    }
    p {
      font-size: 11pt;
      color: #333;
      margin-bottom: 15px;
      line-height: 1.8;
      text-align: justify;
    }
    ul, ol {
      margin: 15px 0;
      padding-left: 25px;
    }
    li {
      font-size: 11pt;
      margin-bottom: 8px;
      line-height: 1.6;
    }
    img {
      max-width: 100%;
      height: auto;
      margin: 20px 0;
    }
    .naver-post-container {
      max-width: 100%;
      padding: 0;
    }
    /* Word에서 박스로 보이는 스타일 제거 */
    div {
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  </style>
</head>
<body>
  ${styledHtml}
</body>
</html>`;

      // .doc 파일로 저장 (Word에서 바로 열 수 있음)
      const blob = new Blob(['\ufeff' + wordHtml], { type: 'application/msword;charset=utf-8' });
      const fileName = `hospital-ai-content-${Date.now()}.doc`;
      
      // 강제 다운로드 (웹에서 열리는 문제 해결)
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (e) {
      console.error('Word 생성 오류:', e);
      alert('Word 문서 생성 중 오류가 발생했습니다.');
    } finally {
      setEditProgress('');
    }
  };

  // PDF 다운로드 함수 (개선된 정렬)
  const handleDownloadPDF = async () => {
    setEditProgress('PDF 생성 중...');
    
    try {
      const styledHtml = applyInlineStylesForNaver(localHtml, currentTheme);
      
      // 🆕 블로그 이력 저장 (백그라운드에서 실행)
      if (content.title && localHtml) {
        saveBlogHistory(
          content.title,
          localHtml.replace(/<[^>]*>/g, ' ').trim(), // 텍스트만 추출
          localHtml, // HTML 전체
          content.keyword?.split(',').map(k => k.trim()) || [],
          undefined, // naverUrl
          content.category
        ).catch(err => {
          console.error('블로그 이력 저장 실패 (메인 플로우는 계속):', err);
        });
      }
      
      // 새 창에서 프린트 다이얼로그 열기 (PDF로 저장 가능)
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('팝업이 차단되었습니다. 팝업을 허용해주세요.');
        return;
      }
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Hospital AI Content - PDF</title>
          <style>
            @page {
              size: A4;
              margin: 2cm;
            }
            @media print {
              body { 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
              }
              /* 페이지 나눔 방지 */
              h3, p, li, img {
                page-break-inside: avoid;
              }
              /* 제목 뒤에서 페이지 나눔 방지 */
              h2, h3 {
                page-break-after: avoid;
              }
              /* 이미지 전후 페이지 나눔 설정 */
              .content-image-wrapper, img {
                page-break-inside: avoid;
                page-break-before: auto;
                page-break-after: auto;
              }
            }
            * {
              box-sizing: border-box;
            }
            body { 
              font-family: '맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
              line-height: 1.9; 
              padding: 0;
              margin: 0;
              max-width: 100%;
              color: #333;
              font-size: 14px;
              word-break: keep-all;
              overflow-wrap: break-word;
            }
            /* 메인 제목 */
            h2, .main-title { 
              font-size: 24px; 
              font-weight: 900; 
              margin: 0 0 20px 0;
              padding-bottom: 15px;
              color: #1a1a1a; 
              line-height: 1.4;
            }
            /* 소제목 */
            h3 { 
              font-size: 18px; 
              font-weight: 700; 
              margin: 35px 0 15px 0;
              padding: 12px 16px;
              color: #1e40af;
              background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
              border-left: 4px solid #3b82f6;
              border-radius: 0 8px 8px 0;
            }
            /* 본문 */
            p { 
              font-size: 14px; 
              margin: 0 0 18px 0;
              color: #333;
              text-align: justify;
              line-height: 1.9;
            }
            /* 리스트 */
            ul { 
              margin: 15px 0 20px 0;
              padding-left: 0;
              list-style: none;
            }
            li { 
              font-size: 14px; 
              margin-bottom: 12px;
              padding: 10px 15px 10px 30px;
              background: #f8fafc;
              border-radius: 8px;
              position: relative;
              line-height: 1.7;
            }
            li::before {
              content: '•';
              position: absolute;
              left: 12px;
              color: #10b981;
              font-weight: bold;
              font-size: 18px;
            }
            /* 이미지 */
            img { 
              max-width: 100%; 
              height: auto; 
              margin: 25px auto;
              display: block;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }
            .content-image-wrapper {
              margin: 30px 0;
              text-align: center;
            }
            .content-image-wrapper img {
              margin: 0 auto;
            }
            /* CTA 박스 */
            .cta-box, [class*="cta"] { 
              background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
              border: 2px solid #10b981;
              padding: 25px;
              margin: 30px 0;
              border-radius: 16px;
              page-break-inside: avoid;
            }
            /* 해시태그 */
            .hashtags, [class*="hashtag"] {
              margin-top: 30px;
              padding: 15px;
              background: #f8fafc;
              border-radius: 12px;
              color: #64748b;
              font-size: 13px;
            }
            /* 숨김 요소 */
            .hidden-title { display: none; }
          </style>
        </head>
        <body>
          ${styledHtml}
          <script>
            window.onload = function() {
              // 이미지 로드 완료 후 프린트
              var images = document.querySelectorAll('img');
              var loadedCount = 0;
              var totalImages = images.length;
              
              function tryPrint() {
                setTimeout(function() { window.print(); }, 500);
              }
              
              if (totalImages === 0) {
                tryPrint();
                return;
              }
              
              for (var i = 0; i < images.length; i++) {
                var img = images[i];
                if (img.complete) {
                  loadedCount++;
                } else {
                  img.onload = img.onerror = function() {
                    loadedCount++;
                    if (loadedCount >= totalImages) {
                      tryPrint();
                    }
                  };
                }
              }
              
              if (loadedCount >= totalImages) {
                tryPrint();
              }
              
              // 안전장치: 5초 후 강제 프린트
              setTimeout(function() { window.print(); }, 5000);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch {
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setEditProgress('');
    }
  };

  const applyInlineStylesForNaver = (html: string, theme: CssTheme = currentTheme) => {
    let styled = html;
    
    if (content.postType === 'card_news') {
        // 카드뉴스: 클래스를 유지하면서 인라인 스타일 추가 (다운로드/재생성 기능 위해 클래스 필수)
        styled = styled
            .replace(/<div class="card-news-container"/g, '<div class="card-news-container" style="max-width: 480px; margin: 0 auto; padding: 16px;"')
            .replace(/<div class="card-grid-wrapper"/g, '<div class="card-grid-wrapper" style="display: flex; flex-direction: column; gap: 24px;"')
            .replace(/<div class="card-slide"/g, '<div class="card-slide" style="background: linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%); border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); overflow: hidden; width: 100%; aspect-ratio: 1/1; position: relative;"')
            .replace(/<div class="card-border-box"/g, '<div class="card-border-box" style="border: 3px solid #1e293b; border-radius: 20px; margin: 16px; display: flex; flex-direction: column; background: #fff; overflow: hidden;"')
            .replace(/<div class="card-header-row"/g, '<div class="card-header-row" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; position: relative; z-index: 3;"')
            .replace(/class="brand-text"/g, 'class="brand-text" style="font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #1e293b;"')
            .replace(/class="arrow-icon"/g, 'class="arrow-icon" style="font-size: 16px; border: 2px solid #1e293b; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #1e293b;"')
            .replace(/<div class="card-content-area"/g, '<div class="card-content-area" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px 24px; gap: 8px; z-index: 2; pointer-events: none;"')
            .replace(/class="card-subtitle"/g, 'class="card-subtitle" style="font-size: 13px; font-weight: 700; color: #3b82f6; margin-bottom: 4px; pointer-events: auto; position: relative; z-index: 3;"')
            .replace(/class="card-divider-dotted"/g, 'class="card-divider-dotted" style="width: 60%; border-bottom: 2px dotted #cbd5e1; margin: 8px 0 12px 0;"')
            .replace(/class="card-main-title"/g, 'class="card-main-title" style="font-size: 26px; font-weight: 900; color: #0f172a; line-height: 1.3; margin: 0; word-break: keep-all; letter-spacing: -0.5px; display: block; text-align: center; max-width: 100%; padding: 0 8px; pointer-events: auto; position: relative; z-index: 3;"')
            .replace(/<h1([^>]*)>/g, '<p$1>')
            .replace(/<\/h1>/g, '</p>')
            .replace(/class="card-highlight"/g, 'class="card-highlight" style="color: #3b82f6;"')
            .replace(/class="card-img-container"/g, 'class="card-img-container" style="position: absolute; inset: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; padding: 0; z-index: 1;"')
            .replace(/class="card-inner-img"/g, 'class="card-inner-img" style="width: 100%; height: 100%; object-fit: cover; object-position: center;"')
            .replace(/class="card-desc"/g, 'class="card-desc" style="font-size: 15px; color: #475569; margin-top: 12px; font-weight: 500; line-height: 1.7; word-break: keep-all; max-width: 90%; pointer-events: auto; position: relative; z-index: 3;"')
            .replace(/<div class="card-footer-row"/g, '<div class="card-footer-row" style="padding: 12px 20px 16px; display: flex; justify-content: center; gap: 8px; border-top: 1px solid #f1f5f9; pointer-events: auto; position: relative; z-index: 3;"')
            .replace(/class="pill-tag"/g, 'class="pill-tag" style="background: #f1f5f9; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 700; color: #475569;"')
            .replace(/class="hidden-title"/g, 'class="hidden-title" style="display: none;"')
            .replace(/class="legal-box-card"/g, 'class="legal-box-card" style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 16px; line-height: 1.5;"');
    } else {
        styled = applyThemeToHtml(styled, theme);
    }
    return styled;
  };

  // Word 2016 호환을 위한 HTML 변환 함수
  const convertToWordCompatibleHtml = (html: string): string => {
    let result = html;
    
    // 🎯 0. naver-post-container div 제거 (border 박스 방지!)
    // 컨테이너 div의 border가 워드에서 네모 박스로 나타나는 문제 해결
    result = result.replace(/<div[^>]*class="naver-post-container"[^>]*>/gi, '');
    result = result.replace(/<\/div>\s*$/gi, ''); // 마지막 닫는 태그 제거
    
    // 🎯 1. h3 소제목을 테이블로 변환 (Word 2016에서 border-left 안 먹음)
    // 네이버 블로그에서는 border-left로 보이지만, 워드 복사용으로 테이블 변환
    result = result.replace(
      /<h3[^>]*>(.*?)<\/h3>/gi,
      (match, content) => {
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        return `<table style="width: 100%; border-collapse: collapse; margin: 25px 0 15px 0;">
          <tr>
            <td style="width: 4px; background-color: #787fff;"></td>
            <td style="padding: 12px 16px; font-size: 18px; font-weight: bold; color: #1e40af; font-family: '맑은 고딕', Malgun Gothic, sans-serif;">${textContent}</td>
          </tr>
        </table>`;
      }
    );
    
    // 2. linear-gradient를 단색 배경으로 변환
    result = result.replace(/background:\s*linear-gradient\([^)]+\)/gi, 'background-color: #f8fafc');
    result = result.replace(/background-image:\s*linear-gradient\([^)]+\)/gi, 'background-color: #f8fafc');
    
    // 3. font-weight: 700/800/900 등을 bold로 통일 (Word 호환성)
    result = result.replace(/font-weight:\s*[6-9]00/gi, 'font-weight: bold');
    
    // 4. rgba 색상을 hex로 변환 (Word 2016에서 rgba 지원 불안정)
    result = result.replace(/rgba\(0,\s*0,\s*0,\s*0\.1\)/gi, '#e5e5e5');
    result = result.replace(/rgba\(0,\s*0,\s*0,\s*0\.06\)/gi, '#f0f0f0');
    result = result.replace(/rgba\(0,\s*0,\s*0,\s*0\.08\)/gi, '#ebebeb');
    
    // 5. box-shadow 제거 (Word에서 지원 안 함)
    result = result.replace(/box-shadow:\s*[^;]+;/gi, '');
    
    // 6. border-radius 제거 (Word 2016에서 지원 안 함 - 네모 박스 문제 원인!)
    result = result.replace(/border-radius:\s*[^;]+;/gi, '');
    
    // 7. border 속성 완전 제거 (Word 네모 박스 문제 완전 해결!)
    // 테이블 소제목의 border는 background-color로 대체됨
    result = result.replace(/border\s*:\s*[^;]+;/gi, '');
    result = result.replace(/border-top\s*:\s*[^;]+;/gi, '');
    result = result.replace(/border-bottom\s*:\s*[^;]+;/gi, '');
    result = result.replace(/border-left\s*:\s*[^;]+;/gi, '');
    result = result.replace(/border-right\s*:\s*[^;]+;/gi, '');
    
    // 8. aspect-ratio 제거 (Word에서 지원 안 함)
    result = result.replace(/aspect-ratio:\s*[^;]+;/gi, '');
    
    // 9. 웹폰트를 시스템 폰트로 변경 (Word 호환)
    result = result.replace(/font-family:\s*[^;]+;/gi, 'font-family: "맑은 고딕", Malgun Gothic, sans-serif;');
    
    return result;
  };

  const handleCopy = async () => {
    try {
      // 🎯 미리보기 CSS 그대로 복사 (Word 호환 버전)
      let styledHtml = applyInlineStylesForNaver(localHtml, currentTheme);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(styledHtml, 'text/html');
      
      // 🎯 Word에서 박스로 보이는 CSS만 선택적 제거
      doc.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style') || '';
        // border-radius, box-shadow만 제거 (이것들이 Word에서 박스 원인)
        // border-left는 유지 (h3 소제목 스타일)
        const cleanStyle = style
          .replace(/border-radius\s*:[^;]+;?/gi, '')
          .replace(/box-shadow\s*:[^;]+;?/gi, '')
          .replace(/outline\s*:[^;]+;?/gi, '');
        el.setAttribute('style', cleanStyle);
      });
      
      // 🎯 컨테이너의 border만 제거 (전체 박스 테두리)
      const container = doc.querySelector('.naver-post-container');
      if (container) {
        const style = container.getAttribute('style') || '';
        const cleanStyle = style
          .replace(/border\s*:[^;]+;?/gi, '')
          .replace(/border-top\s*:[^;]+;?/gi, '')
          .replace(/border-bottom\s*:[^;]+;?/gi, '');
        container.setAttribute('style', cleanStyle);
      }
      
      // 🎯 h2 메인 제목의 border-bottom 제거 (밑줄이 박스로 보임)
      doc.querySelectorAll('h2').forEach(h2 => {
        const style = h2.getAttribute('style') || '';
        const cleanStyle = style.replace(/border-bottom\s*:[^;]+;?/gi, '');
        h2.setAttribute('style', cleanStyle);
      });
      
      let finalHtml = doc.body.innerHTML;
      
      // 임시 div 생성하여 HTML 복사 (팝업 없이 복사)
      const tempDiv = document.createElement('div');
      tempDiv.contentEditable = 'true';
      tempDiv.innerHTML = finalHtml;
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      document.body.appendChild(tempDiv);
      
      // 범위 선택
      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        
        // execCommand로 복사 (권한 팝업 없음)
        const success = document.execCommand('copy');
        
        // 정리
        selection.removeAllRanges();
        document.body.removeChild(tempDiv);
        
        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          throw new Error('Copy failed');
        }
      }
    } catch (err) { 
      // Fallback: navigator.clipboard API (팝업 발생 가능)
      try {
        let styledHtml = applyInlineStylesForNaver(localHtml);
        styledHtml = convertToWordCompatibleHtml(styledHtml);
        const blob = new Blob([styledHtml], { type: 'text/html' });
        const plainText = new Blob([editorRef.current?.innerText || ""], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': blob,
          'text/plain': plainText
        });
        await navigator.clipboard.write([item]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error('클립보드 복사 실패:', err);
      }
    }
  };

  const handleAiEditSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editorInput.trim()) return;
      
      // Undo를 위해 현재 상태 저장
      saveToHistory();
      
      setIsEditingAi(true);
      setEditProgress('AI 에디터가 요청하신 내용을 바탕으로 원고를 최적화하고 있습니다...');
      
      try {
          const result = await modifyPostWithAI(localHtml, editorInput);
          
          // 🚨 방어 코드: newHtml 검증
          if (!result || !result.newHtml) {
            console.error('❌ AI 정밀보정 결과 없음:', result);
            throw new Error('AI가 수정된 콘텐츠를 반환하지 않았습니다. 다시 시도해주세요.');
          }
          
          let workingHtml = result.newHtml;

          // 🖼️ 이미지가 0장인 경우 이미지 재생성 건너뛰기
          const hasImages = localHtml.includes('[IMG_') || localHtml.includes('<img');
          
          if (result.regenerateImageIndices && result.newImagePrompts && hasImages) {
              setEditProgress('요청하신 부분에 맞춰 새로운 일러스트를 생성 중입니다...');

              const idxList = result.regenerateImageIndices.slice(0, 3);
              const promptList = result.newImagePrompts.slice(0, idxList.length);
              const newImageMap: Record<number, string> = {};

              const isCardNews = content.postType === 'card_news';
              await Promise.all(
                promptList.map(async (prompt, i) => {
                  const targetIdx = idxList[i];
                  if (!targetIdx) return;
                  const style = content.imageStyle || 'illustration';
                  // 🎨 커스텀 스타일 프롬프트: savedCustomStylePrompt 사용 (재생성 시에도 유지!)
                  const customStylePrompt = savedCustomStylePrompt || undefined;
                  console.log('🔄 AI 보정 이미지 재생성:', { targetIdx, style, isCardNews, customStylePrompt: customStylePrompt?.substring(0, 50) });
                  
                  if (isCardNews) {
                    // 🎴 카드뉴스: generateSingleImage 사용 (텍스트 포함, 1:1)
                    newImageMap[targetIdx] = await generateSingleImage(prompt, style, '1:1', customStylePrompt);
                  } else {
                    // 📝 블로그: generateBlogImage 사용 (텍스트 없는 순수 이미지, 16:9)
                    newImageMap[targetIdx] = await generateBlogImage(prompt, style, '16:9', customStylePrompt);
                  }
                })
              );

              const markerPattern = /\[IMG_(\d+)\]/g;
              let markersFound = false;
              if (markerPattern.test(workingHtml)) {
                  markersFound = true;
                  workingHtml = workingHtml.replace(markerPattern, (match, idx) => {
                      const imgNum = parseInt(idx, 10);
                      const newSrc = newImageMap[imgNum];
                      if (newSrc) {
                          return `<div class="content-image-wrapper"><img src="${newSrc}" /></div>`;
                      }
                      return '';
                  });
              }

              if (!markersFound) {
                  try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(workingHtml, 'text/html');
                    const imgs = Array.from(doc.querySelectorAll('img'));
                    imgs.forEach((img, i) => {
                      const ordinal = i + 1;
                      const newSrc = newImageMap[ordinal];
                      if (newSrc) img.setAttribute('src', newSrc);
                    });
                    workingHtml = doc.body.innerHTML;
                  } catch {
                    workingHtml = workingHtml.replace(/\[IMG_\d+\]/g, '');
                  }
              }
          }

          setLocalHtml(workingHtml);
          setEditorInput('');
          setEditProgress('');
      } catch (err: any) { 
          const msg = (err?.message || err?.toString || "").toString();
          alert("AI 보정 실패: " + (msg || "Gemini API 응답을 확인해주세요.")); 
          setEditProgress('');
      } finally { 
          setIsEditingAi(false); 
      }
  };

  return (
    <div className={`rounded-[48px] shadow-2xl border h-full flex flex-col overflow-hidden relative transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <style>{`
        .naver-preview .main-title { font-size: 32px; font-weight: 900; margin-bottom: 30px; color: #000; line-height: 1.4; padding-bottom: 20px; }
        .naver-preview h2:not(.main-title):not(.hidden-title):not(.press-subtitle), .naver-preview h3 { font-size: 24px; font-weight: bold; margin-top: 50px; margin-bottom: 20px; color: #000; padding-left: 15px; border-left: 4px solid #787fff; }
        .naver-preview p { font-size: 16px; margin-bottom: 20px; color: #333; line-height: 1.8; }
        .naver-preview .content-image-wrapper { position: relative; margin: 90px 0; }
        .naver-preview .content-image-wrapper img { width: 100%; border-radius: 48px; display: block; box-shadow: 0 30px 70px rgba(0,0,0,0.12); cursor: pointer; transition: filter 0.3s; }
        .naver-preview .content-image-wrapper:hover img { filter: brightness(0.8); }
        .naver-preview .content-image-wrapper::after { content: '✨ 이미지 재생성'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(79, 70, 229, 0.9); color: white; padding: 12px 24px; border-radius: 20px; font-weight: 900; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
        .naver-preview .content-image-wrapper:hover::after { opacity: 1; }

        .card-news-container { max-width: 480px; margin: 0 auto; }
        .card-grid-wrapper { display: flex; flex-direction: column; gap: 24px; }
        
        .card-slide { 
           background: linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%); 
           border-radius: 24px; 
           box-shadow: 0 8px 32px rgba(0,0,0,0.06); 
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
      {downloadModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6">
          <div className={`w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className={`text-sm font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🖼️ {downloadImgIndex}번 이미지</div>
              <button
                type="button"
                onClick={() => setDownloadModalOpen(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>
            
            {/* 이미지 미리보기 */}
            <div className="p-4">
              <img 
                src={downloadImgSrc} 
                alt={`이미지 ${downloadImgIndex}`}
                className="w-full h-48 object-cover rounded-xl"
              />
            </div>
            
            {/* 버튼들 */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  downloadImage(downloadImgSrc, downloadImgIndex);
                  setDownloadModalOpen(false);
                }}
                className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
              >
                📥 다운로드
              </button>
              <button
                type="button"
                onClick={() => {
                  setDownloadModalOpen(false);
                  setRegenOpen(true);
                }}
                className="flex-1 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 transition-all flex items-center justify-center gap-2"
              >
                ✨ 재생성
              </button>
            </div>
          </div>
        </div>
      )}

      {regenOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-white rounded-[36px] shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">✨ {regenIndex}번 이미지 재생성</div>
                <div className="text-xs text-slate-500">프롬프트를 수정하여 새 이미지를 생성합니다.</div>
              </div>
              <button
                type="button"
                onClick={() => setRegenOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>

            <div className="p-8 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-black text-slate-700">프롬프트</div>
                  <button
                    type="button"
                    onClick={handleRecommendPrompt}
                    disabled={isRecommendingPrompt}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRecommendingPrompt ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        AI 분석중...
                      </>
                    ) : (
                      <>
                        🤖 AI 프롬프트 추천
                      </>
                    )}
                  </button>
                </div>
                {/* 영어 프롬프트인 경우 안내 메시지 */}
                {regenPrompt && /^[a-zA-Z\s,.\-:;'"!?()]+$/.test(regenPrompt.trim()) && (
                  <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="text-xs text-amber-700 font-bold">
                      ⚠️ 현재 영어 프롬프트입니다. 한글로 수정하거나 "AI 프롬프트 추천" 버튼을 눌러 새 프롬프트를 받아보세요!
                    </div>
                  </div>
                )}
                <textarea
                  value={regenPrompt}
                  onChange={(e) => setRegenPrompt(e.target.value)}
                  className="w-full h-32 p-4 rounded-2xl border border-slate-200 bg-slate-50 outline-none font-mono text-sm"
                  placeholder="예: 병원에서 의사가 환자와 상담하는 따뜻한 장면, 밝은 조명..."
                  disabled={isRecommendingPrompt}
                />
                <div className="text-[11px] text-slate-500 mt-2">
                  💡 팁: 한글로 원하는 이미지를 설명하세요! "AI 프롬프트 추천" 버튼을 누르면 글 내용에 맞는 최적의 프롬프트를 자동 생성합니다.
                </div>
              </div>

              <div>
                <div className="text-xs font-black text-slate-700 mb-2">참고 이미지 (선택)</div>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleRegenFileChange(e.target.files?.[0] || null)}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {regenRefName && (
                    <div className="text-xs font-bold text-slate-600 truncate max-w-[180px]">📎 {regenRefName}</div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  참고 이미지는 "무드/실루엣/배색" 참고용으로만 사용됩니다.
                </div>
                {regenRefDataUrl && (
                  <div className="mt-3">
                    <img src={regenRefDataUrl} alt="참고 이미지" className="max-h-32 rounded-xl border border-slate-200" />
                  </div>
                )}
              </div>
            </div>

            <div className="px-8 py-6 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRegenOpen(false)}
                className="px-6 py-3 rounded-2xl font-black text-sm bg-slate-100 hover:bg-slate-200"
                disabled={isEditingAi}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitRegenerateImage}
                className="px-8 py-3 rounded-2xl font-black text-sm bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                disabled={isEditingAi}
              >
                이 프롬프트로 재생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 항상 표시: 점수 표시 & 다운로드 버튼 */}
      <div className="bg-slate-900 p-6 flex items-center justify-between text-white flex-none">
        <div className="flex items-center gap-4">
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
        <div className="flex items-center gap-2">
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
      {showSeoDetail && seoScore && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowSeoDetail(false)}>
          <div className={`w-full max-w-2xl rounded-[28px] shadow-2xl overflow-hidden my-4 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black ${
                  seoScore.total >= 85 ? 'bg-emerald-100 text-emerald-600' : 
                  seoScore.total >= 70 ? 'bg-amber-100 text-amber-600' : 
                  'bg-red-100 text-red-600'
                }`}>
                  {seoScore.total}
                </div>
                <div>
                  <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>📊 SEO 점수 분석</div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {seoScore.total >= 85 ? '✅ 상위 노출 가능성 높음' : seoScore.total >= 70 ? '⚠️ 개선 권장' : '🚨 85점 미만 - 재설계 필요'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSeoDetail(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>
            
            {/* 본문 */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* ① 제목 최적화 (25점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>① 제목 최적화</span>
                  <span className={`text-lg font-black ${seoScore.title.score >= 20 ? 'text-emerald-500' : seoScore.title.score >= 15 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.title.score}/25점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 키워드 자연 포함: <span className="font-bold">{seoScore.title.keyword_natural}/10</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 시기성/상황성: <span className="font-bold">{seoScore.title.seasonality}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 판단 유도형: <span className="font-bold">{seoScore.title.judgment_inducing}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 의료광고 안전: <span className="font-bold">{seoScore.title.medical_law_safe}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.title.feedback}</p>
              </div>

              {/* ② 본문 키워드 구조 (25점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>② 본문 키워드 구조</span>
                  <span className={`text-lg font-black ${seoScore.keyword_structure.score >= 20 ? 'text-emerald-500' : seoScore.keyword_structure.score >= 15 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.keyword_structure.score}/25점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 메인키워드 노출: <span className="font-bold">{seoScore.keyword_structure.main_keyword_exposure}/10</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 연관키워드 분산: <span className="font-bold">{seoScore.keyword_structure.related_keyword_spread}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 소제목 키워드: <span className="font-bold">{seoScore.keyword_structure.subheading_variation}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 무의미반복 없음: <span className="font-bold">{seoScore.keyword_structure.no_meaningless_repeat}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.keyword_structure.feedback}</p>
              </div>

              {/* ③ 사용자 체류 구조 (20점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>③ 사용자 체류 구조</span>
                  <span className={`text-lg font-black ${seoScore.user_retention.score >= 16 ? 'text-emerald-500' : seoScore.user_retention.score >= 12 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.user_retention.score}/20점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 도입부 문제인식: <span className="font-bold">{seoScore.user_retention.intro_problem_recognition}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 생활 예시: <span className="font-bold">{seoScore.user_retention.relatable_examples}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 중간 이탈방지: <span className="font-bold">{seoScore.user_retention.mid_engagement_points}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 정보과부하 없음: <span className="font-bold">{seoScore.user_retention.no_info_overload}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.user_retention.feedback}</p>
              </div>

              {/* ④ 의료법 안전성 + 신뢰 신호 (20점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>④ 의료법 안전성</span>
                  <span className={`text-lg font-black ${seoScore.medical_safety.score >= 16 ? 'text-emerald-500' : seoScore.medical_safety.score >= 12 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.medical_safety.score}/20점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 단정/보장 없음: <span className="font-bold">{seoScore.medical_safety.no_definitive_guarantee}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 개인차 언급: <span className="font-bold">{seoScore.medical_safety.individual_difference}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 자가진단 한계: <span className="font-bold">{seoScore.medical_safety.self_diagnosis_limit}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 직접홍보 최소화: <span className="font-bold">{seoScore.medical_safety.minimal_direct_promo}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.medical_safety.feedback}</p>
              </div>

              {/* ⑤ 전환 연결성 (10점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>⑤ 전환 연결성</span>
                  <span className={`text-lg font-black ${seoScore.conversion.score >= 8 ? 'text-emerald-500' : seoScore.conversion.score >= 6 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.conversion.score}/10점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • CTA 자연 흐름: <span className="font-bold">{seoScore.conversion.cta_flow_natural}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 시점 고정형 문장: <span className="font-bold">{seoScore.conversion.time_fixed_sentence}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.conversion.feedback}</p>
              </div>

              {/* 결론 */}
              <div className={`rounded-xl p-4 border-2 ${
                seoScore.total >= 85 ? 'border-emerald-400 bg-emerald-50' : 
                seoScore.total >= 70 ? 'border-amber-400 bg-amber-50' : 
                'border-red-400 bg-red-50'
              } ${darkMode ? 'bg-opacity-10' : ''}`}>
                <div className={`text-sm font-black mb-2 ${
                  seoScore.total >= 85 ? 'text-emerald-700' : 
                  seoScore.total >= 70 ? 'text-amber-700' : 
                  'text-red-700'
                }`}>
                  {seoScore.total >= 85 ? '✅ 우수한 SEO 점수입니다!' : 
                   seoScore.total >= 70 ? '⚠️ 개선이 필요한 영역이 있습니다' : 
                   '🚨 85점 미만 - 재설계/재작성을 권장합니다'}
                </div>
                <p className={`text-xs ${
                  seoScore.total >= 85 ? 'text-emerald-600' : 
                  seoScore.total >= 70 ? 'text-amber-600' : 
                  'text-red-600'
                }`}>
                  SEO 점수는 상위 노출 가능성과 클릭 후 이탈 최소화를 함께 반영하는 비교 지표입니다. 
                  글 간 차이점과 전환 이탈 지점을 파악하여 콘텐츠 품질을 개선하세요.
                </p>
              </div>
            </div>
            
            {/* 푸터 */}
            <div className={`px-6 py-4 border-t flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={handleEvaluateSeo}
                disabled={isEvaluatingSeo}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                🔄 다시 평가
              </button>
              <button
                type="button"
                onClick={() => setShowSeoDetail(false)}
                className="px-6 py-2 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🤖 AI 냄새 상세 분석 모달 (모든 점수에서 표시) */}
      {showAiSmellDetail && (recheckResult?.ai_smell_analysis || content.factCheck?.ai_smell_analysis) && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowAiSmellDetail(false)}>
          <div className={`w-full max-w-2xl rounded-[28px] shadow-2xl overflow-hidden my-4 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black ${
                  (recheckResult?.ai_smell_score ?? content.factCheck?.ai_smell_score ?? 0) <= 7 ? 'bg-green-100 text-green-600' :
                  (recheckResult?.ai_smell_score ?? content.factCheck?.ai_smell_score ?? 0) <= 15 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                }`}>
                  {recheckResult?.ai_smell_score ?? content.factCheck?.ai_smell_score ?? 0}
                </div>
                <div>
                  <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🤖 AI 냄새 분석 결과</div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {(recheckResult?.ai_smell_score ?? content.factCheck?.ai_smell_score ?? 0) <= 20 
                      ? '✅ 사람 글 수준 (0~20점) - 바로 발행 가능!'
                      : (recheckResult?.ai_smell_score ?? content.factCheck?.ai_smell_score ?? 0) <= 40 
                        ? '⚠️ 경계선 (21~40점) - 부분 수정 후 발행 가능'
                        : '🚨 AI 냄새 강함 (41점 이상) - 재작성 권장'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiSmellDetail(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>
            
            {/* 본문 */}
            {(() => {
              const analysis = recheckResult?.ai_smell_analysis || content.factCheck?.ai_smell_analysis;
              if (!analysis) return null;
              return (
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* 우선 수정 사항 */}
              {analysis.priority_fixes && analysis.priority_fixes.length > 0 && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-amber-900/30 border border-amber-700' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className={`text-sm font-black mb-3 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                    ⚡ 우선 수정 사항 (이것만 고쳐도 OK!)
                  </div>
                  <ul className="space-y-2">
                    {analysis.priority_fixes.map((fix, idx) => (
                      <li key={idx} className={`text-sm flex items-start gap-2 ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                        <span className="font-bold">{idx + 1}.</span>
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ① 문장 리듬 단조로움 */}
              {analysis.sentence_rhythm && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>① 문장 리듬 단조로움</span>
                    <span className={`text-lg font-black ${analysis.sentence_rhythm.score <= 5 ? 'text-green-500' : analysis.sentence_rhythm.score <= 12 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.sentence_rhythm.score}/25점
                    </span>
                  </div>
                  {analysis.sentence_rhythm.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.sentence_rhythm.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.sentence_rhythm.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.sentence_rhythm.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ② 판단 단정형 글쓰기 */}
              {analysis.judgment_avoidance && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>② 판단 단정형 글쓰기</span>
                    <span className={`text-lg font-black ${analysis.judgment_avoidance.score <= 4 ? 'text-green-500' : analysis.judgment_avoidance.score <= 10 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.judgment_avoidance.score}/20점
                    </span>
                  </div>
                  {analysis.judgment_avoidance.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.judgment_avoidance.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.judgment_avoidance.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.judgment_avoidance.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ③ 현장감 부재 */}
              {analysis.lack_of_realism && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>③ 현장감 부재</span>
                    <span className={`text-lg font-black ${analysis.lack_of_realism.score <= 4 ? 'text-green-500' : analysis.lack_of_realism.score <= 10 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.lack_of_realism.score}/20점
                    </span>
                  </div>
                  {analysis.lack_of_realism.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.lack_of_realism.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.lack_of_realism.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.lack_of_realism.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ④ 템플릿 구조 */}
              {analysis.template_structure && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>④ 템플릿 구조</span>
                    <span className={`text-lg font-black ${analysis.template_structure.score <= 3 ? 'text-green-500' : analysis.template_structure.score <= 8 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.template_structure.score}/15점
                    </span>
                  </div>
                  {analysis.template_structure.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.template_structure.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.template_structure.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.template_structure.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ⑤ 가짜 공감 */}
              {analysis.fake_empathy && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>⑤ 가짜 공감</span>
                    <span className={`text-lg font-black ${analysis.fake_empathy.score <= 2 ? 'text-green-500' : analysis.fake_empathy.score <= 5 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.fake_empathy.score}/10점
                    </span>
                  </div>
                  {analysis.fake_empathy.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.fake_empathy.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.fake_empathy.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.fake_empathy.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ⑥ 행동 유도 실패 */}
              {analysis.cta_failure && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>⑥ 행동 유도 실패</span>
                    <span className={`text-lg font-black ${analysis.cta_failure.score <= 2 ? 'text-green-500' : analysis.cta_failure.score <= 5 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.cta_failure.score}/10점
                    </span>
                  </div>
                  {analysis.cta_failure.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.cta_failure.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.cta_failure.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.cta_failure.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* 점수 기준 안내 */}
              <div className={`rounded-xl p-4 text-center ${darkMode ? 'bg-slate-700/30' : 'bg-slate-100'}`}>
                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span className="font-bold">📊 AI 냄새 점수 기준</span><br />
                  <span className="text-green-500">0~20점: 사람 글 ✅</span> | 
                  <span className="text-amber-500"> 21~40점: 경계선 ⚠️</span> | 
                  <span className="text-red-500"> 41점↑: AI 확정 🚨</span>
                </div>
              </div>
            </div>
              );
            })()}
            
            {/* 하단 버튼 */}
            <div className={`px-6 py-4 border-t flex justify-end ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setShowAiSmellDetail(false)}
                className="px-6 py-2 rounded-xl font-bold text-sm bg-amber-600 text-white hover:bg-amber-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카드 재생성 모달 */}
      {cardRegenModalOpen && content.postType === 'card_news' && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => setShowHistoryDropdown(false)}>
          <div className={`w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div>
                <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🔄 {cardRegenIndex + 1}번 카드 재생성</div>
                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {cardRegenIndex === 0 ? '표지' : `${cardRegenIndex + 1}번째 슬라이드`}를 새롭게 만듭니다
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCardRegenModalOpen(false)}
                disabled={isRegeneratingCard}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {cardRegenProgress && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-blue-700">{cardRegenProgress}</span>
                </div>
              )}
              
              {/* 실시간 미리보기 - 실제 이미지 위에 텍스트 오버레이 */}
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-blue-600 bg-blue-900/30' : 'border-blue-200 bg-blue-50'}`}>
                <div className={`px-4 py-2 text-xs font-black ${darkMode ? 'bg-blue-800 text-blue-200' : 'bg-blue-100 text-blue-700'}`}>
                  👁️ 실시간 미리보기
                </div>
                <div className="p-4">
                  <div className="relative aspect-square max-w-[220px] mx-auto rounded-xl overflow-hidden shadow-lg">
                    {/* 배경 이미지 */}
                    {currentCardImage ? (
                      <img 
                        src={currentCardImage} 
                        alt="현재 카드" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200" />
                    )}
                    
                    {/* 텍스트 오버레이 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-black/20">
                      {editSubtitle && (
                        <p className="text-[10px] text-white font-bold drop-shadow-lg bg-blue-500/80 px-2 py-0.5 rounded mb-1">
                          {editSubtitle}
                        </p>
                      )}
                      {editMainTitle && (
                        <p className="text-sm font-black text-white leading-tight drop-shadow-lg bg-black/40 px-3 py-1.5 rounded-lg max-w-[90%]">
                          {editMainTitle}
                        </p>
                      )}
                      {editDescription && (
                        <p className="text-[9px] text-white/90 leading-tight drop-shadow mt-2 max-w-[85%] bg-black/30 px-2 py-1 rounded">
                          {editDescription}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className={`text-center text-[9px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    ※ 실제 카드와 다를 수 있습니다
                  </p>
                </div>
              </div>
              
              {/* 📝 카드 프롬프트 편집 */}
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-600 bg-slate-700/50' : 'border-slate-200 bg-slate-50'}`}>
                <div className={`px-4 py-2 text-xs font-black flex items-center justify-between ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                  <span>✏️ 카드 프롬프트 편집</span>
                  <div className="flex items-center gap-2 relative">
                    {/* 불러오기 버튼 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                        disabled={promptHistory.length === 0}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-40 ${
                          darkMode 
                            ? 'bg-amber-600 text-white hover:bg-amber-500' 
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                      >
                        📂 불러오기
                      </button>
                      
                      {/* 히스토리 드롭다운 */}
                      {showHistoryDropdown && promptHistory.length > 0 && (
                        <div 
                          className={`absolute top-full right-0 mt-2 w-72 rounded-xl shadow-2xl z-[10000] overflow-hidden border-2 ${
                            darkMode ? 'bg-slate-800 border-amber-500' : 'bg-white border-amber-300'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={`px-3 py-2 text-[10px] font-bold ${darkMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                            📂 저장된 프롬프트 ({promptHistory.length}개)
                          </div>
                          {promptHistory.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => loadFromHistory(item)}
                              className={`w-full px-4 py-3 text-left text-xs transition-all border-b last:border-b-0 ${
                                darkMode 
                                  ? 'hover:bg-amber-900/50 text-slate-200 border-slate-700' 
                                  : 'hover:bg-amber-50 text-slate-700 border-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-black text-sm truncate flex-1">{item.mainTitle || '(제목 없음)'}</span>
                                <span className={`text-[9px] ml-2 px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                  {item.savedAt}
                                </span>
                              </div>
                              {item.subtitle && (
                                <div className={`text-[10px] truncate ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                                  📌 {item.subtitle}
                                </div>
                              )}
                              {item.description && (
                                <div className={`text-[9px] truncate mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {item.description.slice(0, 50)}...
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* 저장 버튼 */}
                    <button
                      type="button"
                      onClick={savePromptToHistory}
                      disabled={!editSubtitle && !editMainTitle && !editDescription}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-40 ${
                        darkMode 
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500' 
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      💾 저장
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {/* 텍스트 프롬프트 편집 */}
                  <div className="space-y-2">
                    <div className={`text-xs font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>📝 텍스트 내용</div>
                    
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>부제</label>
                      <input
                        type="text"
                        value={editSubtitle}
                        onChange={(e) => { setEditSubtitle(e.target.value); setIsAIPromptApplied(false); }}
                        disabled={isRegeneratingCard}
                        placeholder="예: 놓치기 쉬운 신호"
                        className={`w-full mt-1 px-3 py-2 rounded-lg text-xs border outline-none ${
                          darkMode 
                            ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>메인 제목</label>
                      <input
                        type="text"
                        value={editMainTitle}
                        onChange={(e) => { setEditMainTitle(e.target.value); setIsAIPromptApplied(false); }}
                        disabled={isRegeneratingCard}
                        placeholder="예: 심장이 보내는 경고"
                        className={`w-full mt-1 px-3 py-2 rounded-lg text-xs border outline-none ${
                          darkMode 
                            ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>설명</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => { setEditDescription(e.target.value); setIsAIPromptApplied(false); }}
                        disabled={isRegeneratingCard}
                        placeholder="예: 이런 증상이 나타나면 주의가 필요해요"
                        rows={2}
                        className={`w-full mt-1 px-3 py-2 rounded-lg text-xs border outline-none resize-none ${
                          darkMode 
                            ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    
                  </div>
                  
                  {/* 이미지 프롬프트 편집 */}
                  <div>
                    <div className={`text-xs font-bold mb-1 flex items-center justify-between ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                      <span>🎨 이미지 프롬프트</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRecommendCardPrompt}
                          disabled={isRecommendingCardPrompt || isRegeneratingCard}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            darkMode 
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500' 
                              : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600'
                          }`}
                        >
                          {isRecommendingCardPrompt ? (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin"></span>
                              AI 분석중...
                            </span>
                          ) : (
                            '🤖 AI 추천'
                          )}
                        </button>
                        <span className={`text-[9px] font-normal ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          텍스트 변경 시 자동 연동
                        </span>
                      </div>
                    </div>
                    <textarea
                      value={editImagePrompt}
                      onChange={(e) => setEditImagePrompt(e.target.value)}
                      disabled={isRegeneratingCard || isRecommendingCardPrompt}
                      placeholder="예: 1:1 카드뉴스, 파란 배경, 심장 3D 일러스트..."
                      rows={5}
                      className={`w-full px-3 py-2 rounded-lg text-xs border outline-none resize-y min-h-[80px] ${
                        darkMode 
                          ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                    <div className={`text-[9px] mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      💡 AI 추천: 부제/메인제목/설명 + 배경 스타일을 자동 생성합니다
                    </div>
                  </div>
                  
                  {/* 🖼️ 참고 이미지 업로드 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className={`text-xs font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                        🖼️ 참고 이미지 {isRefImageLocked && <span className="text-emerald-500">🔒 고정됨</span>}
                      </div>
                      {cardRegenRefImage && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isRefImageLocked) {
                              clearRefImageFromStorage();
                            } else {
                              saveRefImageToStorage(cardRegenRefImage, refImageMode);
                            }
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                            isRefImageLocked
                              ? (darkMode ? 'bg-emerald-600 text-white hover:bg-red-500' : 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700')
                              : (darkMode ? 'bg-slate-600 text-slate-300 hover:bg-emerald-600' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700')
                          }`}
                        >
                          {isRefImageLocked ? '🔓 고정 해제' : '🔒 이 이미지 고정'}
                        </button>
                      )}
                    </div>
                    <div className={`text-[10px] mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {isRefImageLocked 
                        ? '✅ 다음 재생성에도 이 참고 이미지가 자동 적용됩니다!'
                        : '💡 카드 프레임이 마음에 안 드시나요? 원하는 스타일의 카드를 참고 이미지로 첨부하면 동일한 레이아웃으로 생성됩니다!'}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const newImage = ev.target?.result as string;
                            setCardRegenRefImage(newImage);
                            // 새 이미지 업로드 시 고정 해제
                            if (isRefImageLocked) {
                              clearRefImageFromStorage();
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      disabled={isRegeneratingCard}
                      className={`w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold transition-all ${
                        darkMode 
                          ? 'file:bg-slate-600 file:text-slate-200 hover:file:bg-slate-500'
                          : 'file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200'
                      }`}
                    />
                    {cardRegenRefImage && (
                      <>
                        <div className="mt-2 relative">
                          <img src={cardRegenRefImage} alt="참고 이미지" className="max-h-24 rounded-lg border border-slate-300" />
                          <button
                            type="button"
                            onClick={() => {
                              setCardRegenRefImage('');
                              if (isRefImageLocked) {
                                clearRefImageFromStorage();
                              }
                            }}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold"
                          >
                            ✕
                          </button>
                          {isRefImageLocked && (
                            <div className="absolute -top-2 -left-2 w-5 h-5 bg-emerald-500 text-white rounded-full text-xs font-bold flex items-center justify-center">
                              🔒
                            </div>
                          )}
                        </div>
                        
                        {/* 적용 방식 선택 */}
                        <div className={`mt-3 p-3 rounded-lg ${darkMode ? 'bg-slate-600' : 'bg-orange-50'}`}>
                          <div className={`text-[10px] font-bold mb-2 ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                            🎨 스타일 적용 방식
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRefImageMode('recolor');
                                if (isRefImageLocked) {
                                  saveRefImageToStorage(cardRegenRefImage, 'recolor');
                                }
                              }}
                              className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                refImageMode === 'recolor'
                                  ? 'bg-purple-500 text-white'
                                  : darkMode 
                                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-500' 
                                    : 'bg-white text-slate-600 hover:bg-purple-100'
                              }`}
                            >
                              🎨 복제+색상변경
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRefImageMode('copy');
                                if (isRefImageLocked) {
                                  saveRefImageToStorage(cardRegenRefImage, 'copy');
                                }
                              }}
                              className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                refImageMode === 'copy'
                                  ? 'bg-orange-500 text-white'
                                  : darkMode 
                                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-500' 
                                    : 'bg-white text-slate-600 hover:bg-orange-100'
                              }`}
                            >
                              📋 레이아웃 복제
                            </button>
                          </div>
                          <div className={`text-[9px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {refImageMode === 'recolor' 
                              ? '레이아웃은 그대로, 색상만 다르게!' 
                              : '텍스트 위치, 구도, 색상까지 동일하게'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
            </div>
            
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setCardRegenModalOpen(false)}
                disabled={isRegeneratingCard}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  darkMode 
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCardRegenerate}
                disabled={isRegeneratingCard || (!editSubtitle && !editMainTitle && !editDescription && !editImagePrompt && !cardRegenRefImage)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isRegeneratingCard ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    재생성 중...
                  </>
                ) : (
                  cardRegenRefImage 
                    ? (refImageMode === 'copy' ? '📋 완전 복제' : '🎨 복제+색상변경')
                    : '🎨 이 카드 재생성'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카드뉴스 다운로드 모달 */}
      {cardDownloadModalOpen && content.postType === 'card_news' && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6">
          <div className={`w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🖼️ 카드뉴스 다운로드</div>
              <button
                type="button"
                onClick={() => setCardDownloadModalOpen(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {cardDownloadProgress && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-blue-700">{cardDownloadProgress}</span>
                </div>
              )}
              
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  📌 카드뉴스 전체를 이미지로 다운로드합니다.<br/>
                  각 카드가 PNG 이미지로 저장됩니다.
                </p>
                
                {/* 개별 카드 다운로드 & 재생성 */}
                <div className="space-y-2 mb-4">
                  <div className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>개별 카드 다운로드</div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {Array.from({ length: cardCount || 6 }, (_, i) => (
                      <div key={i} className="flex">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadCardAsImage(i);
                          }}
                          disabled={downloadingCard}
                          className={`flex-1 px-3 py-2.5 rounded-l-lg text-xs font-bold transition-all disabled:opacity-50 ${darkMode ? 'bg-slate-600 hover:bg-slate-500 text-white' : 'bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700'}`}
                        >
                          📥 {i + 1}장
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardDownloadModalOpen(false);
                            setTimeout(() => openCardRegenModal(i), 100);
                          }}
                          disabled={downloadingCard}
                          className={`px-3 py-2.5 rounded-r-lg text-xs font-bold transition-all disabled:opacity-50 ${darkMode ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-purple-100 border border-purple-200 hover:border-purple-400 hover:bg-purple-200 text-purple-700'}`}
                          title="이 카드 재생성"
                        >
                          🔄
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* 전체 다운로드 버튼 */}
              <button
                type="button"
                onClick={downloadAllCards}
                disabled={downloadingCard}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                📥 모든 카드 일괄 다운로드
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`p-6 border-b flex-none transition-colors duration-300 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <div className={`flex p-1.5 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <button onClick={() => setActiveTab('preview')} className={`px-8 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'preview' ? (darkMode ? 'bg-slate-600 text-emerald-400 shadow-sm' : 'bg-white text-green-600 shadow-sm') : 'text-slate-400'}`}>미리보기</button>
                <button onClick={() => setActiveTab('html')} className={`px-8 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'html' ? (darkMode ? 'bg-slate-600 text-emerald-400 shadow-sm' : 'bg-white text-green-600 shadow-sm') : 'text-slate-400'}`}>HTML</button>
            </div>
            
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
                                const newHistory = autoSaveHistory.filter((_, i) => i !== idx);
                                setAutoSaveHistory(newHistory);
                                localStorage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(newHistory));
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



      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto p-8 lg:p-16 custom-scrollbar transition-colors duration-300 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
        {activeTab === 'preview' ? (
          <div className={`mx-auto bg-white shadow-lg border border-slate-100 p-12 naver-preview min-h-[800px] ${content.postType === 'card_news' ? 'max-w-xl' : 'max-w-3xl'}`}>
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
      {showSimilarityModal && similarityResult && (
        <div 
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowSimilarityModal(false)}
        >
          <div 
            className={`max-w-2xl w-full max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden ${
              darkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              similarityResult.status === 'HIGH_RISK' ? 'bg-red-500 text-white' :
              similarityResult.status === 'MEDIUM_RISK' ? 'bg-yellow-500 text-white' :
              similarityResult.status === 'LOW_RISK' ? 'bg-blue-500 text-white' :
              'bg-green-500 text-white'
            }`}>
              <h3 className="font-bold text-xl">🔍 유사도 검사 결과</h3>
              <button 
                onClick={() => setShowSimilarityModal(false)}
                className="text-2xl hover:opacity-70 transition-opacity"
              >
                ×
              </button>
            </div>
            
            {/* 본문 */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* 점수 */}
              <div className="text-center mb-6">
                <div className={`text-6xl font-black mb-2 ${
                  similarityResult.finalScore >= 80 ? 'text-red-600' :
                  similarityResult.finalScore >= 60 ? 'text-yellow-600' :
                  similarityResult.finalScore >= 40 ? 'text-blue-600' :
                  'text-green-600'
                }`}>
                  {similarityResult.finalScore.toFixed(1)}점
                </div>
                <p className="text-lg font-bold mb-2">
                  {similarityResult.message}
                </p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  검사 시간: {(similarityResult.checkDuration / 1000).toFixed(1)}초
                </p>
              </div>
              
              {/* 최다 매칭 출처 정보 (개선된 UI) */}
              {similarityResult.topSourceInfo && similarityResult.topSourceInfo.matchCount > 0 && (
                <div className={`mb-6 p-5 rounded-xl border-2 ${
                  similarityResult.topSourceInfo.matchCount >= 5 
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : similarityResult.topSourceInfo.matchCount >= 3
                    ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    {similarityResult.topSourceInfo.matchCount >= 5 ? '🚨' : 
                     similarityResult.topSourceInfo.matchCount >= 3 ? '⚠️' : '💡'} 
                    최다 유사 출처
                  </h4>
                  <div className="space-y-3">
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-white'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <a
                          href={similarityResult.topSourceInfo.blogInfo?.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-blue-600 hover:underline flex-1"
                        >
                          {similarityResult.topSourceInfo.blogInfo?.title?.replace(/<[^>]*>/g, '') || '블로그'}
                        </a>
                        <span className={`ml-3 px-3 py-1 rounded-full text-sm font-bold ${
                          similarityResult.topSourceInfo.matchCount >= 5 
                            ? 'bg-red-500 text-white'
                            : similarityResult.topSourceInfo.matchCount >= 3
                            ? 'bg-yellow-500 text-white'
                            : 'bg-blue-500 text-white'
                        }`}>
                          {similarityResult.topSourceInfo.matchCount}개 문장 일치
                        </span>
                      </div>
                      <p className={`text-xs mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {similarityResult.topSourceInfo.blogInfo?.snippet?.substring(0, 150)}...
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {similarityResult.topSourceInfo.blogInfo?.displayLink || similarityResult.topSourceInfo.blogKey}
                      </p>
                    </div>
                    <div className={`text-sm p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className="font-bold mb-2">📝 일치하는 문장:</p>
                      <ul className="space-y-1 text-xs">
                        {similarityResult.topSourceInfo.matchedPhrases?.slice(0, 5).map((phrase: string, idx: number) => (
                          <li key={idx} className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            • "{phrase.substring(0, 80)}..."
                          </li>
                        ))}
                        {similarityResult.topSourceInfo.matchedPhrases?.length > 5 && (
                          <li className={`italic ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                            외 {similarityResult.topSourceInfo.matchedPhrases.length - 5}개 문장 더...
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 자체 블로그 매칭 */}
              {similarityResult.ownBlogMatches.length > 0 ? (
                <div className={`mb-6 p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    📚 자체 블로그 유사 글
                  </h4>
                  <ul className="space-y-2">
                    {similarityResult.ownBlogMatches.map((match: any, idx: number) => {
                      // similarity 값 안전하게 처리
                      const similarity = typeof match.similarity === 'number' && !isNaN(match.similarity) 
                        ? match.similarity 
                        : 0;
                      const percentage = (similarity * 100).toFixed(1);
                      
                      return (
                        <li key={idx} className={`flex justify-between items-center p-3 rounded-lg ${
                          darkMode ? 'bg-slate-600' : 'bg-white'
                        }`}>
                          <span className="truncate flex-1 text-sm">{match.blog?.title || '제목 없음'}</span>
                          <span className={`font-bold ml-3 text-lg ${
                            similarity >= 0.8 ? 'text-red-500' :
                            similarity >= 0.6 ? 'text-yellow-500' :
                            'text-blue-500'
                          }`}>
                            {percentage}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className={`mb-6 p-4 rounded-xl border-2 border-dashed ${
                  darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-blue-50 border-blue-300'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    📚 자체 블로그 유사 글
                  </h4>
                  <div className={`text-center py-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    <p className="text-lg mb-2">✨ 첫 글이시네요!</p>
                    <p className="text-sm">
                      이 글을 <strong>PDF 다운로드</strong> 또는 <strong>카드뉴스 다운로드</strong>하면<br/>
                      다음부터 자체 블로그와의 유사도 검사가 가능합니다.
                    </p>
                  </div>
                </div>
              )}
              
              {/* 웹 검색 매칭 (네이버 블로그) */}
              {similarityResult.webSearchMatches.length > 0 ? (
                <div className={`mb-6 p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    🌐 네이버 블로그에서 발견된 유사 문장
                  </h4>
                  <ul className="space-y-4">
                    {similarityResult.webSearchMatches.map((match: any, idx: number) => (
                      <li key={idx} className={`p-4 rounded-lg border-l-4 border-red-500 ${
                        darkMode ? 'bg-slate-600' : 'bg-white'
                      }`}>
                        <p className="font-bold mb-2 text-sm text-red-600">"{match.phrase.substring(0, 100)}..."</p>
                        <div className="mb-2 text-xs">
                          <span className={`font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {match.matchCount}건의 네이버 블로그에서 발견
                          </span>
                        </div>
                        {/* 매칭된 블로그 목록 */}
                        {match.matches && match.matches.length > 0 && (
                          <div className="space-y-2 mt-3">
                            {match.matches.slice(0, 3).map((blog: any, blogIdx: number) => (
                              <a
                                key={blogIdx}
                                href={blog.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`block p-2 rounded text-xs hover:bg-opacity-80 transition-all ${
                                  darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-50 hover:bg-slate-100'
                                }`}
                              >
                                <div className="font-bold text-blue-600 hover:underline mb-1">
                                  {blog.title.replace(/<[^>]*>/g, '')}
                                </div>
                                <div className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {blog.snippet?.substring(0, 150)}...
                                </div>
                                <div className={`mt-1 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {blog.displayLink || blog.link}
                                </div>
                              </a>
                            ))}
                            {match.matches.length > 3 && (
                              <div className={`text-xs text-center pt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                외 {match.matches.length - 3}개 블로그 더보기...
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : similarityResult.keyPhrases && similarityResult.keyPhrases.length > 0 && (
                <div className={`mb-6 p-4 rounded-xl border-2 border-dashed ${
                  darkMode ? 'bg-slate-700 border-slate-600' : 'bg-yellow-50 border-yellow-300'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    ⚠️ 웹 검색 결과 없음
                  </h4>
                  <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    네이버 블로그 검색 결과가 없습니다. 다음을 확인해주세요:
                  </p>
                  <ul className={`text-sm space-y-2 ml-4 list-disc ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    <li>
                      <strong>Google Custom Search API 키 설정</strong>
                      <div className="text-xs mt-1 ml-2">
                        Cloudflare Dashboard &gt; Workers & Pages &gt; 프로젝트 &gt; Settings &gt; Environment variables
                      </div>
                    </li>
                    <li>
                      <strong>필요한 환경변수</strong>
                      <div className="text-xs mt-1 ml-2">
                        • GOOGLE_API_KEY<br/>
                        • GOOGLE_SEARCH_ENGINE_ID
                      </div>
                    </li>
                    <li>
                      <strong>API 할당량 확인</strong>
                      <div className="text-xs mt-1 ml-2">
                        무료: 100쿼리/일 | 유료: 10,000쿼리/일
                      </div>
                    </li>
                  </ul>
                  <div className={`mt-4 p-3 rounded-lg text-xs ${
                    darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-600'
                  }`}>
                    💡 <strong>참고:</strong> 콘솔(F12)에서 상세한 에러 메시지를 확인할 수 있습니다.
                  </div>
                </div>
              )}
              
              {/* 핵심 문장 */}
              {similarityResult.keyPhrases.length > 0 && (
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                    💡 검사된 핵심 문장들
                  </h4>
                  <ul className="space-y-1 text-xs">
                    {similarityResult.keyPhrases.map((phrase: string, idx: number) => (
                      <li key={idx} className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                        {idx + 1}. "{phrase}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            {/* 푸터 */}
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <button
                onClick={() => setShowSimilarityModal(false)}
                className={`px-6 py-2 rounded-lg font-bold transition-all ${
                  darkMode 
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' 
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultPreview;
