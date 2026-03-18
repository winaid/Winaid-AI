/**
 * useCardDownload — 카드뉴스 다운로드 전용 훅
 *
 * 책임:
 *   - 단일 카드 PNG 다운로드 (handleSingleCardDownload)
 *   - 전체 카드 일괄 PNG 다운로드 (downloadAllCards)
 *   - 개별 카드 PNG 다운로드 (downloadCardAsImage)
 *   - 블로그 이미지 단순 다운로드 (downloadImage)
 *   - 다운로드 진행 상태 관리
 *   - html2canvas 동적 로드/캐싱
 *
 * ResultPreview.tsx는 이 훅의 함수를 호출만 하고,
 * 다운로드 구현은 이 훅이 소유한다.
 */

import { useState, useCallback, useRef, RefObject } from 'react';
import { saveAs } from 'file-saver';
import { removeOklchFromClonedDoc } from '../components/resultPreviewUtils';
import { toast } from '../components/Toast';

// html2canvas 동적 모듈 캐시 (모듈 레벨)
let html2canvasModule: any = null;

async function ensureHtml2Canvas(): Promise<any> {
  if (!html2canvasModule) {
    html2canvasModule = (await import('html2canvas')).default;
  }
  return html2canvasModule;
}

interface UseCardDownloadParams {
  editorRef: RefObject<HTMLDivElement | null>;
  localHtml: string;
  onHistoryPersist?: () => void;
}

interface UseCardDownloadReturn {
  // 상태
  downloadingCard: boolean;
  cardDownloadProgress: string;
  // 액션
  downloadImage: (imgSrc: string, index: number) => void;
  downloadCardAsImage: (cardIndex: number) => Promise<void>;
  handleSingleCardDownload: (cardIndex: number) => Promise<void>;
  downloadAllCards: () => Promise<void>;
  // 유틸
  getCardElements: () => NodeListOf<Element> | null;
}

export function useCardDownload({
  editorRef,
  localHtml,
  onHistoryPersist,
}: UseCardDownloadParams): UseCardDownloadReturn {

  const [downloadingCard, setDownloadingCard] = useState(false);
  const [cardDownloadProgress, setCardDownloadProgress] = useState('');

  // ── 카드 요소 탐색 (여러 방법 시도) ──

  const getCardElements = useCallback((): NodeListOf<Element> | null => {
    let cards = editorRef.current?.querySelectorAll('.card-slide');
    if (cards && cards.length > 0) return cards;

    cards = document.querySelector('.naver-preview')?.querySelectorAll('.card-slide');
    if (cards && cards.length > 0) return cards;

    cards = document.querySelectorAll('.card-slide');
    if (cards && cards.length > 0) return cards;

    return null;
  }, [editorRef]);

  // ── 블로그 이미지 단순 다운로드 ──

  const downloadImage = useCallback((imgSrc: string, index: number) => {
    const link = document.createElement('a');
    link.href = imgSrc;
    link.download = `hospital-ai-image-${index}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // ── 카드 1장 다운로드 (간이 버전 — CardDownloadModal에서 사용) ──

  const downloadCardAsImage = useCallback(async (cardIndex: number) => {
    const cardSlides = getCardElements();
    if (!cardSlides || !cardSlides[cardIndex]) {
      toast.error('카드를 찾을 수 없습니다. 카드뉴스를 먼저 생성해주세요.');
      return;
    }

    setDownloadingCard(true);
    setCardDownloadProgress(`${cardIndex + 1}번 카드 이미지 생성 중...`);

    try {
      const html2canvas = await ensureHtml2Canvas();
      const card = cardSlides[cardIndex] as HTMLElement;
      const canvas = await html2canvas(card, {
        scale: 2,
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
      toast.error('카드 다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloadingCard(false);
    }
  }, [getCardElements]);

  // ── 단일 카드 다운로드 (고품질 — 오버레이 제거, 2x 스케일) ──

  const handleSingleCardDownload = useCallback(async (cardIndex: number) => {
    const cards = document.querySelectorAll('.naver-preview .card-slide');
    const card = cards[cardIndex] as HTMLElement;
    if (!card) {
      toast.error('카드를 찾을 수 없습니다.');
      return;
    }

    setDownloadingCard(true);
    setCardDownloadProgress(`${cardIndex + 1}번 카드 다운로드 준비 중...`);

    try {
      const html2canvas = await ensureHtml2Canvas();
      setCardDownloadProgress('모듈 로드 완료');

      // 오버레이 임시 숨김
      const overlay = card.querySelector('.card-overlay') as HTMLElement;
      const badge = card.querySelector('.card-number-badge') as HTMLElement;
      if (overlay) overlay.style.display = 'none';
      if (badge) badge.style.display = 'none';

      setCardDownloadProgress(`${cardIndex + 1}번 카드 이미지 생성 중...`);

      const canvas = await html2canvas(card, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
          const clonedOverlay = clonedDoc.querySelector('.card-overlay') as HTMLElement;
          const clonedBadge = clonedDoc.querySelector('.card-number-badge') as HTMLElement;
          if (clonedOverlay) clonedOverlay.remove();
          if (clonedBadge) clonedBadge.remove();
          removeOklchFromClonedDoc(clonedDoc, clonedElement);
        },
      });

      // 오버레이 복구
      if (overlay) overlay.style.display = '';
      if (badge) badge.style.display = '';

      // toBlob → saveAs, 실패 시 toDataURL 폴백
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b: Blob | null) => resolve(b), 'image/png', 1.0);
      });

      if (blob) {
        saveAs(blob, `card_${cardIndex + 1}.png`);
      } else {
        console.warn('toBlob 실패, toDataURL로 폴백');
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `card_${cardIndex + 1}.png`;
        link.href = dataUrl;
        link.click();
      }

      setCardDownloadProgress(`✅ ${cardIndex + 1}번 카드 다운로드 완료!`);
      setTimeout(() => setCardDownloadProgress(''), 1500);
    } catch (error) {
      console.error('카드 다운로드 실패:', error);
      // 오버레이 복구 (에러 발생 시에도)
      const overlay = card.querySelector('.card-overlay') as HTMLElement;
      const badge = card.querySelector('.card-number-badge') as HTMLElement;
      if (overlay) overlay.style.display = '';
      if (badge) badge.style.display = '';

      setCardDownloadProgress('');
      toast.error(`카드 다운로드에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setDownloadingCard(false);
    }
  }, []);

  // ── 전체 카드 일괄 다운로드 ──

  const downloadAllCards = useCallback(async () => {
    const cardSlides = getCardElements();
    if (!cardSlides || cardSlides.length === 0) {
      toast.warning('다운로드할 카드가 없습니다. 카드뉴스를 먼저 생성해주세요.');
      return;
    }

    setDownloadingCard(true);
    let successCount = 0;
    const failedCards: number[] = [];

    try {
      const html2canvas = await ensureHtml2Canvas();
      setCardDownloadProgress('모듈 로드 완료');

      for (let i = 0; i < cardSlides.length; i++) {
        setCardDownloadProgress(`${i + 1}/${cardSlides.length}장 다운로드 중...`);

        try {
          const card = cardSlides[i] as HTMLElement;

          const overlay = card.querySelector('.card-overlay') as HTMLElement;
          const badge = card.querySelector('.card-number-badge') as HTMLElement;
          if (overlay) overlay.style.display = 'none';
          if (badge) badge.style.display = 'none';

          const canvas = await html2canvas(card, {
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
              removeOklchFromClonedDoc(clonedDoc, clonedElement);
            },
          });

          if (overlay) overlay.style.display = '';
          if (badge) badge.style.display = '';

          const blob = await Promise.race([
            new Promise<Blob | null>((resolve) => {
              canvas.toBlob((b: Blob | null) => resolve(b), 'image/png', 1.0);
            }),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Blob 생성 타임아웃')), 10000)
            ),
          ]);

          if (blob) {
            saveAs(blob, `card-news-${i + 1}.png`);
            successCount++;
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `card-news-${i + 1}.png`;
            link.href = dataUrl;
            link.click();
            successCount++;
          }

          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (cardError) {
          console.error(`${i + 1}번 카드 다운로드 실패:`, cardError);
          failedCards.push(i + 1);
        }
      }

      // 결과 메시지
      if (failedCards.length === 0) {
        setCardDownloadProgress(`✅ ${successCount}장 모두 다운로드 완료!`);
        // [Layer 2] History Persistence
        onHistoryPersist?.();
      } else {
        setCardDownloadProgress(`⚠️ ${successCount}장 완료, ${failedCards.length}장 실패 (${failedCards.join(', ')}번)`);
      }
      setTimeout(() => setCardDownloadProgress(''), 3000);

      if (failedCards.length > 0) {
        setTimeout(() => {
          toast.warning(`${failedCards.length}장의 카드 다운로드에 실패했습니다. (${failedCards.join(', ')}번 카드)`);
        }, 500);
      }
    } catch (error) {
      console.error('카드 다운로드 실패:', error);
      setCardDownloadProgress('');
      toast.error(`카드 다운로드 중 오류가 발생했습니다. 원인: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setDownloadingCard(false);
    }
  }, [getCardElements, onHistoryPersist]);

  return {
    downloadingCard,
    cardDownloadProgress,
    downloadImage,
    downloadCardAsImage,
    handleSingleCardDownload,
    downloadAllCards,
    getCardElements,
  };
}
