/**
 * useAiRefine — AI 수정 / 이미지 재생성 / 섹션 재생성 전용 훅
 *
 * 책임:
 *   - handleAiEditSubmit: AI 에디터 수정 요청 + 필요 시 이미지 재생성
 *   - handleSectionRegenerate: 블로그 섹션 재생성 (Gemini)
 *   - submitRegenerateImage: 개별 이미지 재생성
 *   - handleRecommendPrompt: 블로그 이미지 프롬프트 AI 추천
 *   - handleRecommendCardPrompt: 카드뉴스 프롬프트 AI 추천
 *   - handleRegenFileChange: 참고 이미지 파일 업로드 처리
 *   - 관련 로딩/상태 관리
 *
 * ResultPreview.tsx는 UI(버튼/모달/폼)만 담당하고,
 * 실제 AI 호출 구현은 이 훅이 소유한다.
 */

import { useState, useCallback } from 'react';
import type { GeneratedContent, BlogSection } from '../types';

interface UseAiRefineParams {
  localHtml: string;
  setLocalHtml: (html: string) => void;
  content: GeneratedContent;
  savedCustomStylePrompt: string;
  blogSections: BlogSection[];
  setBlogSections: React.Dispatch<React.SetStateAction<BlogSection[]>>;
  saveToHistory: (html: string) => void;
  setEditorInput: (v: string) => void;
  setEditProgress: (v: string) => void;
  setEditImagePrompt: (v: string) => void;
  setIsAIPromptApplied: (v: boolean) => void;
  // 카드뉴스 프롬프트 편집 state (읽기 전용)
  editSubtitle: string;
  editMainTitle: string;
  editDescription: string;
}

interface UseAiRefineReturn {
  // 로딩 상태
  isEditingAi: boolean;
  regeneratingSection: number | null;
  // 이미지 재생성 모달 상태
  regenOpen: boolean;
  setRegenOpen: (v: boolean) => void;
  regenIndex: number;
  setRegenIndex: (v: number) => void;
  regenPrompt: string;
  setRegenPrompt: (v: string) => void;
  regenRefDataUrl: string | undefined;
  regenRefName: string;
  isRecommendingPrompt: boolean;
  // 카드뉴스 프롬프트 추천 상태
  isRecommendingCardPrompt: boolean;
  // 액션
  handleAiEditSubmit: (e: React.FormEvent, editorInput: string) => Promise<void>;
  handleSectionRegenerate: (sectionIndex: number) => Promise<void>;
  submitRegenerateImage: () => Promise<void>;
  handleRecommendPrompt: () => Promise<void>;
  handleRecommendCardPrompt: () => Promise<void>;
  handleRegenFileChange: (file: File | null) => void;
}

export function useAiRefine({
  localHtml,
  setLocalHtml,
  content,
  savedCustomStylePrompt,
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
}: UseAiRefineParams): UseAiRefineReturn {

  // ── 로딩 상태 ──
  const [isEditingAi, setIsEditingAi] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<number | null>(null);

  // ── 이미지 재생성 모달 상태 ──
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenIndex, setRegenIndex] = useState<number>(1);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenRefDataUrl, setRegenRefDataUrl] = useState<string | undefined>(undefined);
  const [regenRefName, setRegenRefName] = useState('');
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);

  // ── 카드뉴스 프롬프트 추천 상태 ──
  const [isRecommendingCardPrompt, setIsRecommendingCardPrompt] = useState(false);

  // ── 섹션 재생성 ──

  const handleSectionRegenerate = useCallback(async (sectionIndex: number) => {
    const section = blogSections[sectionIndex];
    if (!section || regeneratingSection !== null) return;

    setRegeneratingSection(sectionIndex);
    try {
      saveToHistory(localHtml);

      const { regenerateSection } = await import('../services/faqService');
      const newSectionHtml = await regenerateSection(
        section.title,
        section.html,
        localHtml,
        'strict',
        (msg: string) => setEditProgress(msg),
      );

      let updatedHtml = localHtml;
      const oldSectionHtml = section.html;
      if (updatedHtml.includes(oldSectionHtml)) {
        updatedHtml = updatedHtml.replace(oldSectionHtml, newSectionHtml);
      } else {
        const escapedTitle = section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionRegex = new RegExp(
          `<h3[^>]*>${escapedTitle}<\\/h3>[\\s\\S]*?(?=<h3|<div class="faq|$)`,
          'i',
        );
        updatedHtml = updatedHtml.replace(sectionRegex, newSectionHtml);
      }

      setLocalHtml(updatedHtml);
      setBlogSections(prev => prev.map((s, i) =>
        i === sectionIndex ? { ...s, html: newSectionHtml } : s,
      ));
      setEditProgress(`✅ "${section.title}" 재생성 완료`);
    } catch (error) {
      console.error('섹션 재생성 실패:', error);
      setEditProgress('❌ 재생성 실패');
    } finally {
      setRegeneratingSection(null);
      setTimeout(() => setEditProgress(''), 3000);
    }
  }, [blogSections, regeneratingSection, localHtml, setLocalHtml, setBlogSections, saveToHistory, setEditProgress]);

  // ── 참고 이미지 파일 처리 ──

  const handleRegenFileChange = useCallback((file: File | null) => {
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
  }, []);

  // ── 블로그 이미지 프롬프트 추천 ──

  const handleRecommendPrompt = useCallback(async () => {
    setIsRecommendingPrompt(true);
    try {
      const { recommendImagePrompt } = await import('../services/image/cardNewsImageService');
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = localHtml;
      const textContent = tempDiv.innerText || tempDiv.textContent || '';
      const currentStyle = content.imageStyle || 'illustration';
      const recommendedPrompt = await recommendImagePrompt(textContent, regenPrompt, currentStyle, savedCustomStylePrompt);
      setRegenPrompt(recommendedPrompt);
    } catch {
      const { toast } = await import('../components/Toast');
      toast.error('프롬프트 추천 중 오류가 발생했습니다.');
    } finally {
      setIsRecommendingPrompt(false);
    }
  }, [localHtml, content.imageStyle, regenPrompt, savedCustomStylePrompt]);

  // ── 카드뉴스 AI 프롬프트 추천 ──

  const handleRecommendCardPrompt = useCallback(async () => {
    setIsRecommendingCardPrompt(true);
    try {
      const { recommendCardNewsPrompt } = await import('../services/image/cardNewsImageService');
      const currentStyle = content.imageStyle || 'illustration';
      const recommendedPrompt = await recommendCardNewsPrompt(
        editSubtitle,
        editMainTitle,
        editDescription,
        currentStyle,
        savedCustomStylePrompt,
      );
      setIsAIPromptApplied(true);
      setEditImagePrompt(recommendedPrompt);
    } catch {
      const { toast } = await import('../components/Toast');
      toast.error('프롬프트 추천 중 오류가 발생했습니다.');
    } finally {
      setIsRecommendingCardPrompt(false);
    }
  }, [content.imageStyle, editSubtitle, editMainTitle, editDescription, savedCustomStylePrompt]);

  // ── 개별 이미지 재생성 ──

  const submitRegenerateImage = useCallback(async () => {
    if (!regenPrompt.trim()) return;
    setIsEditingAi(true);
    setEditProgress(`${regenIndex}번 이미지를 다시 생성 중...`);
    try {
      const { generateSingleImage } = await import('../services/image/cardNewsImageService');
      const { generateBlogImage } = await import('../services/image/imageOrchestrator');

      const style = content.imageStyle || 'illustration';
      const isCardNews = content.postType === 'card_news';
      const imgRatio = isCardNews ? '1:1' : '16:9';
      const customStylePrompt = savedCustomStylePrompt || undefined;

      let newImageData: string;
      if (isCardNews) {
        console.log('🔄 카드뉴스 이미지 재생성:', { style, customStylePrompt: customStylePrompt?.substring(0, 50) });
        newImageData = await generateSingleImage(regenPrompt.trim(), style, imgRatio, customStylePrompt);
      } else {
        console.log('🔄 블로그 이미지 재생성 (manual):', { style, customStylePrompt: customStylePrompt?.substring(0, 50) });
        newImageData = (await generateBlogImage(regenPrompt.trim(), style, imgRatio, customStylePrompt, 'manual', 'hero')).data;
      }

      if (newImageData) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = localHtml;
        const imgs = tempDiv.querySelectorAll('img');
        if (imgs[regenIndex - 1]) {
          const targetImg = imgs[regenIndex - 1];
          const hadIndex = targetImg.hasAttribute('data-image-index');
          targetImg.src = newImageData;
          targetImg.alt = regenPrompt.trim();
          if (!hadIndex) {
            targetImg.setAttribute('data-image-index', String(regenIndex));
          }
          console.info(`[IMG_REGEN] before index=${regenIndex} | after data-image-index=${targetImg.getAttribute('data-image-index')} | preserved=${hadIndex}`);
          setLocalHtml(tempDiv.innerHTML);
        }
        const { toast } = await import('../components/Toast');
        toast.success('이미지가 재생성되었습니다!');
        setRegenOpen(false);
      } else {
        const { toast } = await import('../components/Toast');
        toast.error('이미지를 생성하지 못했습니다. 다시 시도해주세요.');
      }
    } catch {
      const { toast } = await import('../components/Toast');
      toast.error('이미지 생성 중 오류가 발생했습니다.');
    } finally {
      setIsEditingAi(false);
      setEditProgress('');
    }
  }, [regenPrompt, regenIndex, content.imageStyle, content.postType, savedCustomStylePrompt, localHtml, setLocalHtml, setEditProgress]);

  // ── AI 에디터 수정 ──

  const handleAiEditSubmit = useCallback(async (e: React.FormEvent, editorInput: string) => {
    e.preventDefault();
    if (!editorInput.trim()) return;

    saveToHistory(localHtml);
    setIsEditingAi(true);
    setEditProgress('AI 에디터가 요청하신 내용을 바탕으로 원고를 최적화하고 있습니다...');

    try {
      const { modifyPostWithAI } = await import('../services/contentEditorService');
      const result = await modifyPostWithAI(localHtml, editorInput);

      if (!result || !result.newHtml) {
        console.error('❌ AI 정밀보정 결과 없음:', result);
        throw new Error('AI가 수정된 콘텐츠를 반환하지 않았습니다. 다시 시도해주세요.');
      }

      let workingHtml = result.newHtml;
      const hasImages = localHtml.includes('[IMG_') || localHtml.includes('<img');

      if (result.regenerateImageIndices && result.newImagePrompts && hasImages) {
        setEditProgress('요청하신 부분에 맞춰 새로운 일러스트를 생성 중입니다...');

        const { generateSingleImage } = await import('../services/image/cardNewsImageService');
        const { generateBlogImage } = await import('../services/image/imageOrchestrator');

        const idxList = result.regenerateImageIndices.slice(0, 3);
        const promptList = result.newImagePrompts.slice(0, idxList.length);
        const newImageMap: Record<number, string> = {};
        const isCardNews = content.postType === 'card_news';

        await Promise.all(
          promptList.map(async (prompt, i) => {
            const targetIdx = idxList[i];
            if (!targetIdx) return;
            const style = content.imageStyle || 'illustration';
            const customStylePrompt = savedCustomStylePrompt || undefined;
            console.log('🔄 AI 보정 이미지 재생성:', { targetIdx, style, isCardNews, customStylePrompt: customStylePrompt?.substring(0, 50) });

            if (isCardNews) {
              newImageMap[targetIdx] = await generateSingleImage(prompt, style, '1:1', customStylePrompt);
            } else {
              newImageMap[targetIdx] = (await generateBlogImage(prompt, style, '16:9', customStylePrompt, 'manual', 'hero')).data;
            }
          }),
        );

        const markerPattern = /\[IMG_(\d+)\]/g;
        let markersFound = false;
        if (markerPattern.test(workingHtml)) {
          markersFound = true;
          workingHtml = workingHtml.replace(markerPattern, (_match, idx) => {
            const imgNum = parseInt(idx, 10);
            const newSrc = newImageMap[imgNum];
            if (newSrc) {
              console.info(`[IMG_REGEN] marker [IMG_${imgNum}] → img with data-image-index="${imgNum}"`);
              return `<div class="content-image-wrapper"><img src="${newSrc}" data-image-index="${imgNum}" /></div>`;
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
              if (newSrc) {
                const hadIndex = img.hasAttribute('data-image-index');
                img.setAttribute('src', newSrc);
                if (!hadIndex) {
                  img.setAttribute('data-image-index', String(ordinal));
                }
                console.info(`[IMG_REGEN] DOM img[${i}] src 교체 | data-image-index=${img.getAttribute('data-image-index')} | preserved=${hadIndex}`);
              }
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
      const { toast } = await import('../components/Toast');
      const msg = (err?.message || err?.toString || '').toString();
      toast.error('AI 보정 실패: ' + (msg || 'Gemini API 응답을 확인해주세요.'));
      setEditProgress('');
    } finally {
      setIsEditingAi(false);
    }
  }, [localHtml, setLocalHtml, content.postType, content.imageStyle, savedCustomStylePrompt, saveToHistory, setEditorInput, setEditProgress]);

  return {
    isEditingAi,
    regeneratingSection,
    regenOpen,
    setRegenOpen,
    regenIndex,
    setRegenIndex,
    regenPrompt,
    setRegenPrompt,
    regenRefDataUrl,
    regenRefName,
    isRecommendingPrompt,
    isRecommendingCardPrompt,
    handleAiEditSubmit,
    handleSectionRegenerate,
    submitRegenerateImage,
    handleRecommendPrompt,
    handleRecommendCardPrompt,
    handleRegenFileChange,
  };
}
