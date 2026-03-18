/**
 * useDraftPersistence — [Layer 3] Draft Persistence 훅
 *
 * localStorage 기반 임시저장을 담당한다.
 * 서버 저장(Layer 1: Result, Layer 2: History)과는 독립된 계층이다.
 *
 * 책임:
 *   - 수동 저장 (saveManually)
 *   - 저장본 불러오기 (loadFromAutoSaveHistory)
 *   - 임시저장 삭제 (clearAutoSave)
 *   - 저장본 존재 여부 확인 (hasAutoSave)
 *   - localStorage 용량 관리 (안전 저장, 오래된 항목 자동 삭제)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AUTOSAVE_KEY,
  AUTOSAVE_HISTORY_KEY,
  AutoSaveHistoryItem,
  extractTitle,
} from '../components/resultPreviewUtils';
import { toast } from '../components/Toast';

interface UseDraftPersistenceParams {
  localHtml: string;
  currentTheme: string;
  postType: string;
  imageStyle?: string;
}

interface UseDraftPersistenceReturn {
  autoSaveHistory: AutoSaveHistoryItem[];
  lastSaved: Date | null;
  showAutoSaveDropdown: boolean;
  setShowAutoSaveDropdown: (v: boolean) => void;
  saveManually: () => void;
  loadFromAutoSaveHistory: (item: AutoSaveHistoryItem) => { html: string; theme?: string };
  clearAutoSave: () => void;
  hasAutoSave: () => boolean;
  deleteHistoryItem: (index: number) => void;
}

// ── localStorage 유틸 (모듈 레벨) ──

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    console.warn('localStorage 용량 초과, 오래된 데이터 정리 중...');
    return false;
  }
}

function getLocalStorageUsage(): { used: number; total: number; percent: number } {
  let total = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      total += localStorage[key].length * 2;
    }
  }
  const maxSize = 5 * 1024 * 1024;
  return { used: total, total: maxSize, percent: Math.round((total / maxSize) * 100) };
}

function removeOldestFromHistory(): boolean {
  try {
    const historyStr = localStorage.getItem(AUTOSAVE_HISTORY_KEY);
    if (!historyStr) return false;
    const history = JSON.parse(historyStr);
    if (history.length === 0) return false;
    history.pop();
    localStorage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(history));
    console.log('🗑️ 오래된 저장본 1개 삭제, 남은 개수:', history.length);
    return true;
  } catch {
    return false;
  }
}

// ── 훅 본체 ──

export function useDraftPersistence({
  localHtml,
  currentTheme,
  postType,
  imageStyle,
}: UseDraftPersistenceParams): UseDraftPersistenceReturn {

  const [autoSaveHistory, setAutoSaveHistory] = useState<AutoSaveHistoryItem[]>([]);
  const [showAutoSaveDropdown, setShowAutoSaveDropdown] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // 히스토리 초기 로드
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

  const saveManually = useCallback(() => {
    if (!localHtml || !localHtml.trim()) {
      toast.warning('저장할 내용이 없습니다.');
      return;
    }

    if (autoSaveHistory.length >= 3) {
      toast.warning('저장 슬롯이 가득 찼습니다! 기존 저장본을 삭제한 후 다시 저장해주세요.');
      return;
    }

    const now = new Date();
    const title = extractTitle(localHtml);
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    // base64/blob 제거: localStorage에는 경량 HTML만 저장
    const restoredHtml = localHtml
      .replace(/src="data:image\/[^"]*"/gi, 'src=""')
      .replace(/src="blob:[^"]*"/gi, 'src=""');
    const hasBlobLeak = restoredHtml.includes('blob:');

    const saveData: AutoSaveHistoryItem = {
      html: restoredHtml,
      theme: currentTheme,
      postType,
      imageStyle,
      savedAt: now.toISOString(),
      title: `${title} (${timeStr})`,
    };

    const saveDataStr = JSON.stringify(saveData);
    const dataSize = saveDataStr.length * 2;
    const usage = getLocalStorageUsage();

    console.info(
      `[STORAGE] autosave | display=${localHtml.length}자(${Math.round(localHtml.length * 2 / 1024)}KB)` +
      ` | storage=${restoredHtml.length}자(${Math.round(restoredHtml.length * 2 / 1024)}KB)` +
      ` | blob잔류=${hasBlobLeak} | payload=${Math.round(dataSize / 1024)}KB` +
      ` | localStorage=${usage.percent}% (${Math.round(usage.used / 1024)}/${Math.round(usage.total / 1024)}KB)`
    );
    if (hasBlobLeak) {
      console.error('[STORAGE] ❌ autosave에 blob: URL 잔류! 재로드 시 이미지 깨짐 위험');
    }
    if (dataSize > 4 * 1024 * 1024) {
      console.warn(`[STORAGE] ⚠️ autosave payload ${Math.round(dataSize / 1024)}KB — localStorage 5MB 한도의 ${Math.round(dataSize / (5 * 1024 * 1024) * 100)}% 사용`);
    }

    // 용량 부족 시 오래된 것 자동 삭제 (최대 3번 시도)
    let retryCount = 0;
    while (usage.used + dataSize > usage.total * 0.9 && retryCount < 3) {
      console.warn(`⚠️ 용량 부족 (${usage.percent}%), 오래된 저장본 삭제 중...`);
      if (!removeOldestFromHistory()) break;
      retryCount++;
    }

    // 현재 저장
    if (!safeLocalStorageSet(AUTOSAVE_KEY, saveDataStr)) {
      console.warn('🗑️ 히스토리 전체 삭제 후 재시도...');
      localStorage.removeItem(AUTOSAVE_HISTORY_KEY);
      setAutoSaveHistory([]);

      if (!safeLocalStorageSet(AUTOSAVE_KEY, saveDataStr)) {
        toast.warning('저장 용량이 부족합니다. 기존 저장본을 모두 삭제 후 다시 시도해주세요.');
        return;
      }
    }
    setLastSaved(now);

    // 히스토리에 추가 (최근 3개만 유지)
    setAutoSaveHistory(prev => {
      let newHistory = [saveData, ...prev].slice(0, 3);
      let historyStr = JSON.stringify(newHistory);

      while (!safeLocalStorageSet(AUTOSAVE_HISTORY_KEY, historyStr) && newHistory.length > 1) {
        console.warn(`⚠️ 히스토리 저장 실패, 오래된 항목 삭제 중... (${newHistory.length}개 → ${newHistory.length - 1}개)`);
        newHistory.pop();
        historyStr = JSON.stringify(newHistory);
      }

      if (newHistory.length === 1 && !safeLocalStorageSet(AUTOSAVE_HISTORY_KEY, historyStr)) {
        toast.warning('저장 용량이 부족하여 이전 저장본이 삭제되었습니다.');
        newHistory = [saveData];
        localStorage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(newHistory));
      }

      return newHistory;
    });

    const finalUsage = getLocalStorageUsage();
    void finalUsage; // 로그용으로만 사용
    toast.success(`"${title}" 저장되었습니다! (${autoSaveHistory.length + 1}/3)`);
  }, [localHtml, currentTheme, postType, imageStyle, autoSaveHistory.length]);

  const loadFromAutoSaveHistory = useCallback((item: AutoSaveHistoryItem) => {
    const hasBlobUrl = item.html.includes('blob:');
    const imgCount = (item.html.match(/<img[^>]+>/gi) || []).length;
    const base64ImgCount = (item.html.match(/src="data:image/gi) || []).length;
    console.info(
      `[RELOAD] 저장본 불러오기 | title="${item.title}" | html=${item.html.length}자(${Math.round(item.html.length * 2 / 1024)}KB) | img=${imgCount}개 | base64=${base64ImgCount}개 | blob잔류=${hasBlobUrl}`
    );
    if (hasBlobUrl) {
      console.warn('[RELOAD] ⚠️ blob: URL 포함 — 이미지가 표시되지 않을 수 있음');
    }
    setShowAutoSaveDropdown(false);
    toast.info(`"${item.title}" 불러왔습니다!`);
    return { html: item.html, theme: item.theme };
  }, []);

  const clearAutoSave = useCallback(() => {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_HISTORY_KEY);
    setAutoSaveHistory([]);
    setLastSaved(null);
    toast.info('임시저장이 삭제되었습니다.');
  }, []);

  const hasAutoSaveFn = useCallback(() => {
    return autoSaveHistory.length > 0;
  }, [autoSaveHistory.length]);

  const deleteHistoryItem = useCallback((index: number) => {
    setAutoSaveHistory(prev => {
      const newHistory = prev.filter((_, i) => i !== index);
      localStorage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  return {
    autoSaveHistory,
    lastSaved,
    showAutoSaveDropdown,
    setShowAutoSaveDropdown,
    saveManually,
    loadFromAutoSaveHistory,
    clearAutoSave,
    hasAutoSave: hasAutoSaveFn,
    deleteHistoryItem,
  };
}
