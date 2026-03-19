import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeneratedContent, ImageStyle as _ImageStyle, CssTheme, BlogSection } from '../types';
import '../styles/resultPreview.css';
import { AI_PROMPT_TEMPLATES, AutoSaveHistoryItem, computeHtmlMetrics, injectCardOverlays } from './resultPreviewUtils';
import { SeoDetailModal, AiSmellDetailModal, SimilarityModal } from './ScoringModals';
import { ResultScoreBar } from './ResultScoreBar';
import { ResultToolbar } from './ResultToolbar';
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
import { useCardRegenerate } from '../hooks/useCardRegenerate';



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

  // CSS custom properties: 디자인 템플릿 동적 값 → resultPreview.css의 var() fallback에 주입
  const cardCssVars = useMemo<React.CSSProperties>(() => {
    if (!dtStyle) return {};
    const vars: Record<string, string> = {};
    if (dtStyle.backgroundColor) {
      vars['--rp-card-bg'] = `linear-gradient(180deg, ${dtStyle.backgroundColor} 0%, ${dtStyle.backgroundColor}dd 100%)`;
    }
    if (dtStyle.borderRadius) {
      vars['--rp-card-radius'] = dtStyle.borderRadius;
    }
    if (dtStyle.boxShadow) {
      vars['--rp-card-shadow'] = dtStyle.boxShadow;
    }
    if (dtStyle.borderWidth && dtStyle.borderWidth !== '0') {
      vars['--rp-card-border'] = `${dtStyle.borderWidth} solid ${dtStyle.borderColor}`;
    }
    return vars as React.CSSProperties;
  }, [dtStyle]);

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

  // AI 프롬프트 적용 플래그 (useCardRegenerate + useAiRefine 공유)
  const [isAIPromptApplied, setIsAIPromptApplied] = useState(false);

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

  // ── Card Regenerate 훅 (카드뉴스 재생성 모달/편집/실행) ──
  const {
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
  } = useCardRegenerate({
    content,
    localHtml,
    setLocalHtml,
    savedCustomStylePrompt,
    designTemplateId: content.designTemplateId,
    getCardElements,
    isAIPromptApplied,
    setIsAIPromptApplied,
  });

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
    setIsAIPromptApplied,
    editSubtitle,
    editMainTitle,
    editDescription,
  });

  // handleAiEditSubmit 래퍼: editorInput을 바인딩
  const handleAiEditSubmit = (e: React.FormEvent) => aiEditSubmit(e, editorInput);

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

  // 글자 수 + 카드 수 계산 (유틸 함수로 분리됨)
  useEffect(() => {
    const metrics = computeHtmlMetrics(localHtml, content.postType);
    setCharCount(metrics.charCount);
    setCardCount(metrics.cardCount);
  }, [localHtml, content.postType]);

  // [React 선언적 패턴으로 전환됨] 카드 오버레이는 injectCardOverlays()로 HTML 렌더 시점에 주입
  // 클릭 이벤트는 editor onClick 이벤트 위임(아래 JSX)이 처리

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


  // [훅으로 이동됨] handleCardRegenerate, openCardRegenModal, saveRefImageToStorage, clearRefImageFromStorage, savePromptToHistory, loadFromHistory → useCardRegenerate

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
      
      let styledHtml = applyInlineStylesForNaver(localHtml, currentTheme);
      // 카드뉴스: overlay/badge HTML을 렌더 시점에 주입 (DOM 직접 조작 제거)
      if (content.postType === 'card_news') {
        styledHtml = injectCardOverlays(styledHtml);
      }
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
    <div
      className={`rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border h-full flex flex-col overflow-hidden relative transition-colors duration-300 backdrop-blur-2xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/90 border-slate-200/60'}`}
      style={cardCssVars}
    >
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

      <ResultScoreBar
        darkMode={darkMode}
        postType={content.postType}
        factCheck={content.factCheck}
        seoScore={seoScore}
        isEvaluatingSeo={isEvaluatingSeo}
        handleEvaluateSeo={handleEvaluateSeo}
        setShowSeoDetail={setShowSeoDetail}
        isOptimizingImages={isOptimizingImages}
        optimizationStats={optimizationStats}
        handleOptimizeImages={handleOptimizeImages}
        isEditingAi={isEditingAi}
        downloadingCard={downloadingCard}
        setCardDownloadModalOpen={setCardDownloadModalOpen}
        handleDownloadWord={handleDownloadWord}
        handleDownloadPDF={handleDownloadPDF}
      />
      
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

      <ResultToolbar
        darkMode={darkMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        postType={content.postType}
        blogSections={blogSections}
        showSectionPanel={showSectionPanel}
        setShowSectionPanel={setShowSectionPanel}
        charCount={charCount}
        canUndo={canUndo}
        handleUndo={handleUndo}
        isCheckingSimilarity={isCheckingSimilarity}
        handleCheckSimilarity={handleCheckSimilarity}
        saveManually={saveManually}
        hasAutoSave={hasAutoSave}
        showAutoSaveDropdown={showAutoSaveDropdown}
        setShowAutoSaveDropdown={setShowAutoSaveDropdown}
        autoSaveHistory={autoSaveHistory}
        loadFromAutoSaveHistory={loadFromAutoSaveHistory}
        deleteHistoryItem={deleteHistoryItem}
        lastSaved={lastSaved}
        copied={copied}
        handleCopy={handleCopy}
      />



      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar transition-colors duration-300 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
        {/* 이미지 품질 상태 배너 */}
        {content.imageFailCount != null && content.imageFailCount > 0 && (() => {
          const totalImages = content.imagePrompts?.length || 0;
          const aiCount = totalImages - content.imageFailCount;
          const isSevere = !!content.imageQualityWarning;
          return (
            <div className={`mx-4 mb-3 p-3 rounded-xl ${
              isSevere ? 'bg-orange-50 border border-orange-200' : 'bg-amber-50 border border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${isSevere ? 'text-orange-500' : 'text-amber-500'}`}>&#9888;</span>
                  <span className={`text-sm font-medium ${isSevere ? 'text-orange-800' : 'text-amber-800'}`}>
                    {content.imageQualityWarning || `본문은 정상 생성되었습니다. 이미지 ${content.imageFailCount}장은 AI 서버 과부하로 실패했습니다.`}
                  </span>
                </div>
                <span className={`text-xs shrink-0 ml-2 ${isSevere ? 'text-orange-600' : 'text-amber-600'}`}>이미지 클릭으로 재생성 가능</span>
              </div>
              {totalImages > 0 && (
                <div className="flex items-center gap-3 mt-2 ml-7">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    AI {aiCount}장
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    대체 {content.imageFailCount}장
                  </span>
                  {isSevere && (
                    <span className="text-xs text-orange-600 font-medium">이미지 재생성을 권장합니다</span>
                  )}
                </div>
              )}
            </div>
          );
        })()}
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
