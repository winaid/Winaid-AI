import { useState, useCallback } from 'react';
import { GeneratedContent, SeoScoreReport, FactCheckReport, SimilarityCheckResult } from '../types';
import { evaluateSeoScore } from '../services/seoService';
import { recheckAiSmell } from '../services/contentQualityService';
import { checkContentSimilarity } from '../services/contentSimilarityService';
import { optimizeAllImagesInHtml, formatFileSize } from '../utils/imageOptimizer';
import { toast } from '../components/Toast';

interface UseContentQualityParams {
  content: GeneratedContent;
  localHtml: string;
  setLocalHtml: (html: string) => void;
  setEditProgress: (p: string) => void;
}

interface UseContentQualityReturn {
  // SEO
  seoScore: SeoScoreReport | null;
  setSeoScore: (s: SeoScoreReport | null) => void;
  isEvaluatingSeo: boolean;
  showSeoDetail: boolean;
  setShowSeoDetail: (v: boolean) => void;
  handleEvaluateSeo: () => Promise<void>;
  // AI Smell
  showAiSmellDetail: boolean;
  setShowAiSmellDetail: (v: boolean) => void;
  isRecheckingAiSmell: boolean;
  recheckResult: FactCheckReport | null;
  handleRecheckAiSmell: () => Promise<void>;
  // Image Optimization
  isOptimizingImages: boolean;
  optimizationStats: { totalSaved: number; imageCount: number } | null;
  handleOptimizeImages: () => Promise<void>;
  // Similarity
  isCheckingSimilarity: boolean;
  similarityResult: SimilarityCheckResult | null;
  showSimilarityModal: boolean;
  setShowSimilarityModal: (v: boolean) => void;
  handleCheckSimilarity: () => Promise<void>;
}

export function useContentQuality({
  content,
  localHtml,
  setLocalHtml,
  setEditProgress,
}: UseContentQualityParams): UseContentQualityReturn {
  // SEO
  const [seoScore, setSeoScore] = useState<SeoScoreReport | null>(content.seoScore || null);
  const [isEvaluatingSeo, setIsEvaluatingSeo] = useState(false);
  const [showSeoDetail, setShowSeoDetail] = useState(false);

  // AI Smell
  const [showAiSmellDetail, setShowAiSmellDetail] = useState(false);
  const [isRecheckingAiSmell, setIsRecheckingAiSmell] = useState(false);
  const [recheckResult, setRecheckResult] = useState<FactCheckReport | null>(null);

  // Image Optimization
  const [isOptimizingImages, setIsOptimizingImages] = useState(false);
  const [optimizationStats, setOptimizationStats] = useState<{ totalSaved: number; imageCount: number } | null>(null);

  // Similarity
  const [isCheckingSimilarity, setIsCheckingSimilarity] = useState(false);
  const [similarityResult, setSimilarityResult] = useState<SimilarityCheckResult | null>(null);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);

  const handleEvaluateSeo = useCallback(async () => {
    if (isEvaluatingSeo || content.postType === 'card_news') return;

    setIsEvaluatingSeo(true);
    setEditProgress('📊 SEO 점수 평가 중...');

    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = localHtml;
      const titleElement = tempDiv.querySelector('.main-title, h2, h1');
      const title = titleElement?.textContent?.trim() || content.title || '';
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
  }, [isEvaluatingSeo, content, localHtml, setEditProgress]);

  const handleRecheckAiSmell = useCallback(async () => {
    console.log('🔇 AI 냄새 재검사 기능이 비활성화되었습니다.');
  }, []);

  const handleOptimizeImages = useCallback(async () => {
    if (isOptimizingImages) return;

    setIsOptimizingImages(true);

    try {
      const result = await optimizeAllImagesInHtml(
        localHtml,
        { quality: 0.85, maxWidth: 1200, format: 'webp' },
        () => {}
      );

      setLocalHtml(result.html);
      setOptimizationStats(result.stats);

      if (result.stats.imageCount > 0) {
        toast.success(`${result.stats.imageCount}개 이미지 최적화 완료! (${formatFileSize(result.stats.totalSaved)} 절약)`);
      } else {
        toast.success('Lazy loading 적용 완료!');
      }
    } catch (error) {
      console.error('이미지 최적화 실패:', error);
      toast.error('이미지 최적화 실패');
    } finally {
      setIsOptimizingImages(false);
    }
  }, [isOptimizingImages, localHtml, setLocalHtml]);

  const handleCheckSimilarity = useCallback(async () => {
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

      if (result.status === 'HIGH_RISK') {
        toast.warning('유사한 콘텐츠가 발견되었습니다! 재작성을 권장합니다.');
      } else if (result.status === 'MEDIUM_RISK') {
        toast.info('일부 유사한 표현이 있습니다. 확인해보세요.');
      } else if (result.status === 'ORIGINAL') {
        toast.success('독창적인 콘텐츠입니다!');
      }
    } catch (error) {
      console.error('유사도 검사 실패:', error);
      toast.error('유사도 검사 중 오류가 발생했습니다. Google Custom Search API 키를 확인해주세요.');
    } finally {
      setIsCheckingSimilarity(false);
    }
  }, [isCheckingSimilarity, content]);

  return {
    seoScore,
    setSeoScore,
    isEvaluatingSeo,
    showSeoDetail,
    setShowSeoDetail,
    handleEvaluateSeo,
    showAiSmellDetail,
    setShowAiSmellDetail,
    isRecheckingAiSmell,
    recheckResult,
    handleRecheckAiSmell,
    isOptimizingImages,
    optimizationStats,
    handleOptimizeImages,
    isCheckingSimilarity,
    similarityResult,
    showSimilarityModal,
    setShowSimilarityModal,
    handleCheckSimilarity,
  };
}
