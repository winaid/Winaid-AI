/**
 * useResultActions — 결과 화면의 비즈니스 액션 훅
 *
 * ResultPreview.tsx가 렌더링에 집중하도록,
 * 결과 생명주기 관련 액션을 이 훅으로 분리한다.
 *
 * 책임:
 *   - [Layer 2] History Persistence — 카드뉴스 다운로드 성공 시 이력 저장
 *   - Undo 관리 — AI 수정 전 상태 백업/복원
 */

import { useState, useCallback } from 'react';

interface UseResultActionsReturn {
  // Undo
  htmlHistory: string[];
  canUndo: boolean;
  handleUndo: () => string | null;
  saveToHistory: (html: string) => void;
  // History persistence
  persistCardNewsHistory: (opts: {
    title: string;
    html: string;
    keywords?: string;
    category?: string;
  }) => void;
}

export function useResultActions(): UseResultActionsReturn {
  const [htmlHistory, setHtmlHistory] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // ── Undo 관리 ──

  const handleUndo = useCallback((): string | null => {
    let prevHtml: string | null = null;
    setHtmlHistory(prev => {
      if (prev.length === 0) return prev;
      prevHtml = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      setCanUndo(next.length > 0);
      return next;
    });
    return prevHtml;
  }, []);

  const saveToHistory = useCallback((html: string) => {
    setHtmlHistory(prev => [...prev.slice(-9), html]); // 최대 10개 유지
    setCanUndo(true);
  }, []);

  // ── [Layer 2] History Persistence ──

  const persistCardNewsHistory = useCallback(async (opts: {
    title: string;
    html: string;
    keywords?: string;
    category?: string;
  }) => {
    if (!opts.title || !opts.html) return;

    // SVG template 보존: raster base64만 제거, SVG inline은 유지
    const { stripLargeBase64FromHtml } = await import('../services/image/imageStorageService');
    const lightweightHtml = stripLargeBase64FromHtml(opts.html);
    console.info(
      `[STORAGE] persistCardNewsHistory | original=${opts.html.length}자 | lightweight=${lightweightHtml.length}자`
    );

    // contentStorage 어댑터를 통해 Layer 2 저장
    import('../core/generation/contentStorage').then(({ persistBlogHistory }) => {
      persistBlogHistory({
        title: opts.title,
        plainText: opts.html.replace(/<[^>]*>/g, ' ').trim(),
        lightweightHtml,
        keywords: opts.keywords?.split(',').map(k => k.trim()) || [],
        category: opts.category,
      }).catch(err => {
        console.error('블로그 이력 저장 실패 (메인 플로우는 계속):', err);
      });
    });
  }, []);

  return {
    htmlHistory,
    canUndo,
    handleUndo,
    saveToHistory,
    persistCardNewsHistory,
  };
}
