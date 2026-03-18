/**
 * useTemplateGeneration — 템플릿 AI 생성 + 다운로드 오케스트레이션
 *
 * TemplateGenerator.tsx에서 추출.
 * handleGenerate, handleDownload, 생성 상태 관리.
 */
import { useState } from 'react';
import {
  generateTemplateWithAI,
  type TemplateApplicationMode,
} from '../../../services/calendarTemplateService';
import type { TemplateCategory } from '../config/templatePresets';
import { IMAGE_SIZES, type ImageSize } from '../config/templatePresets';
import {
  loadStyleHistory,
  saveStyleToHistory,
  resizeImageToThumbnail,
  resizeImageForReference,
  type SavedStyleHistory,
} from '../storage/styleHistory';
import type { ClosedDay, ShortenedDay, VacationDay } from '../../template/builders/calendarBuilders';

export interface GenerationOptions {
  category: TemplateCategory;
  templateData: Record<string, any>;
  activeStylePrompt: string;
  activeStyleName: string;
  hospitalName: string;
  logoBase64: string | null;
  brandingPos: 'top' | 'bottom';
  imageSize: ImageSize;
  templateAppMode: TemplateApplicationMode;
  customMessage: string;
  extraPrompt: string;
  clinicHours: string;
  clinicPhone: string;
  clinicAddress: string;
  brandColor: string;
  brandAccent: string;
  selectedHistory: SavedStyleHistory | null;
  selectedCatTemplate: { previewImage?: string; aiPrompt?: string } | null;
  selectedStyleId: string;
  totalPages: number;
}

export interface GenerationState {
  generating: boolean;
  generatingStep: number;
  generatingPage: number;
  resultImages: string[];
  currentPage: number;
  error: string | null;
}

export function useTemplateGeneration() {
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [generatingPage, setGeneratingPage] = useState(0);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showRegenMenu, setShowRegenMenu] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [showRegenPromptInput, setShowRegenPromptInput] = useState(false);

  const handleGenerate = async (opts: GenerationOptions, regenExtra?: string) => {
    setGenerating(true);
    setError(null);
    setGeneratingStep(0);
    setResultImages([]);
    setCurrentPage(0);
    setGeneratingPage(0);
    setShowRegenMenu(false);
    setShowRegenPromptInput(false);

    const stepTimer = setInterval(() => setGeneratingStep(s => s + 1), 3000);

    try {
      const sizeConfig = [...IMAGE_SIZES].find(s => s.id === opts.imageSize) || IMAGE_SIZES[3];
      const hospitalInfoLines = [opts.clinicHours, opts.clinicPhone, opts.clinicAddress].filter(Boolean);
      const allExtraPrompts = [
        String(opts.customMessage || '').trim(),
        String(opts.extraPrompt || '').trim(),
        regenExtra ? String(regenExtra).trim() : '',
      ].filter(Boolean);

      const images: string[] = [];
      let firstPageRef: string | undefined;

      for (let page = 1; page <= opts.totalPages; page++) {
        setGeneratingPage(page);

        const pageData = opts.totalPages > 1
          ? { ...opts.templateData, currentPage: page, totalPages: opts.totalPages }
          : opts.templateData;

        const customRef = opts.selectedCatTemplate?.previewImage || undefined;
        const styleRef = page === 1
          ? (opts.selectedHistory?.referenceImageUrl || customRef || undefined)
          : firstPageRef;

        const imageDataUrl = await generateTemplateWithAI(opts.category, pageData, opts.activeStylePrompt, {
          hospitalName: opts.hospitalName || undefined,
          logoBase64: opts.logoBase64,
          brandingPosition: opts.brandingPos,
          styleReferenceImage: styleRef,
          extraPrompt: allExtraPrompts.join('\n') || undefined,
          imageSize: sizeConfig.width > 0 ? { width: sizeConfig.width, height: sizeConfig.height } : undefined,
          hospitalInfo: hospitalInfoLines.length > 0 ? hospitalInfoLines : undefined,
          brandColor: opts.brandColor || undefined,
          brandAccent: opts.brandAccent || undefined,
          applicationMode: opts.templateAppMode,
        });

        images.push(imageDataUrl);
        setResultImages([...images]);
        setCurrentPage(images.length - 1);

        if (page === 1) {
          try { firstPageRef = await resizeImageForReference(imageDataUrl); } catch {}
        }
      }

      // 스타일 히스토리에 1장째 저장
      try {
        const [thumbnail, referenceImg] = await Promise.all([
          resizeImageToThumbnail(images[0]),
          resizeImageForReference(images[0]),
        ]);
        saveStyleToHistory({
          name: opts.activeStyleName,
          stylePrompt: opts.activeStylePrompt,
          thumbnailDataUrl: thumbnail,
          referenceImageUrl: referenceImg,
          presetId: opts.selectedHistory ? opts.selectedHistory.presetId : opts.selectedStyleId,
        });
      } catch (e) {
        console.warn('스타일 히스토리 저장 실패:', e);
      }
    } catch (err: any) {
      console.error('🔴 handleGenerate 에러:', err, '\n스택:', err?.stack);
      const msg = typeof err?.message === 'string' ? err.message : String(err);
      setError(msg || 'AI 이미지 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      clearInterval(stepTimer);
      setGenerating(false);
      setGeneratingPage(0);
    }
  };

  const handleDownload = (
    category: TemplateCategory,
    hospitalName: string,
    month: number,
    pageIndex?: number,
  ) => {
    if (resultImages.length === 0) return;
    const suffixes: Record<TemplateCategory, string> = {
      schedule: `${month}월_진료안내`, event: '이벤트', doctor: '의사소개',
      notice: '공지사항', greeting: '인사', hiring: '채용공고',
      caution: '주의사항', pricing: '비급여안내',
    };
    const baseName = `${hospitalName || '병원'}_${suffixes[category]}`;
    if (pageIndex !== undefined) {
      const a = document.createElement('a');
      a.href = resultImages[pageIndex];
      a.download = resultImages.length > 1 ? `${baseName}_${pageIndex + 1}.png` : `${baseName}.png`;
      a.click();
    } else {
      resultImages.forEach((img, i) => {
        const a = document.createElement('a');
        a.href = img;
        a.download = resultImages.length > 1 ? `${baseName}_${i + 1}.png` : `${baseName}.png`;
        a.click();
      });
    }
  };

  const resetResults = () => {
    setResultImages([]);
    setCurrentPage(0);
    setError(null);
  };

  return {
    // state
    generating,
    generatingStep,
    generatingPage,
    resultImages,
    currentPage,
    error,
    showRegenMenu,
    regenPrompt,
    showRegenPromptInput,
    // setters
    setCurrentPage,
    setError,
    setShowRegenMenu,
    setRegenPrompt,
    setShowRegenPromptInput,
    resetResults,
    // actions
    handleGenerate,
    handleDownload,
  };
}
