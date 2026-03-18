/**
 * styleHistory — 템플릿 스타일 히스토리 관리
 *
 * localStorage에 사용자 생성 스타일 저장/불러오기/삭제.
 * calendarTemplateService.ts에서 추출.
 */

// ── 타입 ──

export interface SavedStyleHistory {
  id: string;
  name: string;
  stylePrompt: string;
  thumbnailDataUrl: string;
  referenceImageUrl: string;
  presetId?: string;
  createdAt: number;
}

// ── 상수 ──

const STYLE_HISTORY_KEY = 'template_style_history';
const MAX_STYLE_HISTORY = 12;

// ── 함수 ──

export function loadStyleHistory(): SavedStyleHistory[] {
  try {
    const raw = localStorage.getItem(STYLE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveStyleToHistory(entry: Omit<SavedStyleHistory, 'id' | 'createdAt'>): SavedStyleHistory {
  const history = loadStyleHistory();
  const newEntry: SavedStyleHistory = {
    ...entry,
    id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  history.unshift(newEntry);
  const trimmed = history.slice(0, MAX_STYLE_HISTORY);
  localStorage.setItem(STYLE_HISTORY_KEY, JSON.stringify(trimmed));
  return newEntry;
}

export function deleteStyleFromHistory(id: string): void {
  const history = loadStyleHistory().filter(h => h.id !== id);
  localStorage.setItem(STYLE_HISTORY_KEY, JSON.stringify(history));
}

// ── 이미지 리사이즈 유틸 ──

export function resizeImageToThumbnail(dataUrl: string, maxSize: number = 120, quality: number = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function resizeImageForReference(dataUrl: string): Promise<string> {
  return resizeImageToThumbnail(dataUrl, 512, 0.75);
}
