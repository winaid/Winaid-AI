/**
 * 카드뉴스 순수 스타일 계산 유틸리티
 * CardNewsProRenderer.tsx에서 추출 — HTML 렌더링 전용 값.
 */
import type { CSSProperties } from 'react';
import type { SlideData, CardNewsTheme } from './cardNewsLayouts';
import { CARD_FONTS, getCardFont } from './cardNewsLayouts';

// ── CSS 파싱 ──

/**
 * CSS 선언 문자열 "height: 6px; background: red" 를 React 스타일 객체로 파싱.
 * AI가 추출한 학습 템플릿의 CSS 힌트를 style prop에 직접 꽂기 위한 헬퍼.
 */
export function parseCSSString(css: string | undefined): CSSProperties {
  const result: Record<string, string> = {};
  if (!css) return result as CSSProperties;
  css.split(';').forEach(rule => {
    const idx = rule.indexOf(':');
    if (idx <= 0) return;
    const key = rule.slice(0, idx).trim();
    const value = rule.slice(idx + 1).trim();
    if (!key || !value) return;
    // kebab-case → camelCase
    const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = value;
  });
  return result as CSSProperties;
}

// ── 폰트 로딩 ──

/** Google Fonts CDN에서 한 번만 로드. 이미 있으면 스킵 */
export function ensureGoogleFontLoaded(fontId: string): void {
  if (typeof document === 'undefined') return;
  const font = CARD_FONTS.find(f => f.id === fontId);
  if (!font || !font.googleImport) return;
  const linkId = `gfont-${font.id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleImport}&display=swap`;
  document.head.appendChild(link);
}

// ── 폰트 패밀리 해석 ──

/** 테마 fontId → CSS font-family 문자열 */
export function resolveEffectiveFontFamily(
  theme: CardNewsTheme,
  customFontName: string | null,
): string {
  if (theme.fontId === 'custom' && customFontName) {
    return `'${customFontName}', 'Pretendard Variable', 'Pretendard', sans-serif`;
  }
  if (theme.fontId) return getCardFont(theme.fontId).family;
  return theme.fontFamily;
}

/** 슬라이드별 폰트 — slide.fontId가 있으면 그 폰트, 없으면 전체 폰트 */
export function resolveSlideFontFamily(
  slide: SlideData,
  effectiveFontFamily: string,
  customFontName: string | null,
): string {
  if (!slide.fontId) return effectiveFontFamily;
  if (slide.fontId === 'custom' && customFontName) {
    return `'${customFontName}', 'Pretendard Variable', 'Pretendard', sans-serif`;
  }
  const font = CARD_FONTS.find(f => f.id === slide.fontId);
  if (!font) return effectiveFontFamily;
  if (font.googleImport) ensureGoogleFontLoaded(font.id);
  return font.family;
}

// ── 사이즈 자동 계산 (순수 함수) ──

/** 제목 크기 자동 계산 (글자 수 기반) */
export function calcTitleSize(text: string, maxSize: number = 52, minSize: number = 36): number {
  const len = (text || '').length;
  if (len <= 10) return maxSize;
  if (len <= 15) return Math.min(maxSize, 56);
  if (len <= 20) return Math.min(maxSize, 48);
  if (len <= 30) return Math.min(maxSize, 42);
  return minSize;
}

/** 수치 크기 자동 계산 */
export function calcValueSize(text: string, containerWidth: number = 300): number {
  const len = (text || '').length;
  return Math.min(80, Math.max(36, Math.floor(containerWidth * 0.85 / Math.max(len, 1))));
}

/** 항목 수에 따른 gap/padding/fontSize 자동 계산 */
export function calcItemLayout(itemCount: number): { gap: number; padding: number; fontSize: number } {
  if (itemCount <= 2) return { gap: 24, padding: 32, fontSize: 22 };
  if (itemCount <= 3) return { gap: 20, padding: 28, fontSize: 20 };
  if (itemCount <= 4) return { gap: 16, padding: 24, fontSize: 18 };
  if (itemCount <= 5) return { gap: 12, padding: 20, fontSize: 17 };
  return { gap: 10, padding: 16, fontSize: 16 };
}

/** 그리드 열 수 자동 계산 */
export function calcGridCols(itemCount: number): number {
  if (itemCount <= 1) return 1;
  if (itemCount <= 2) return 2;
  if (itemCount <= 4) return 2;
  if (itemCount <= 6) return 3;
  return 3;
}

/** 본문 크기 자동 계산 (글자 수 기반) */
export function calcBodySize(text: string): { fontSize: number; lineHeight: number } {
  const charCount = (text || '').length;
  if (charCount <= 50) return { fontSize: 22, lineHeight: 1.7 };
  if (charCount <= 100) return { fontSize: 20, lineHeight: 1.7 };
  if (charCount <= 200) return { fontSize: 18, lineHeight: 1.65 };
  return { fontSize: 16, lineHeight: 1.6 };
}

/** 카드 내부 패딩 계산 (이미지 유무 + 항목 수) */
export function calcCardPadding(slide: SlideData): string {
  const hasImage = !!slide.imageUrl && (slide.imagePosition === 'top' || slide.imagePosition === 'bottom');
  const itemCount = (slide.checkItems || slide.steps || slide.icons || slide.numberedItems || []).length;
  if (hasImage) return '40px 50px';
  if (itemCount >= 5) return '50px 54px';
  return '60px 64px';
}

/** 세로 정렬 → CSS justifyContent 값 */
export function getContentAlignV(slide: SlideData): string {
  const v = slide.contentAlignV || 'center';
  return v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';
}

// ── 스타일 빌더 ──

/** 슬라이드별 컨테이너 스타일 */
export function getCardStyle(
  slide: SlideData,
  cardContainerStyle: CSSProperties,
  slideFontFamily: string,
): CSSProperties {
  return {
    ...cardContainerStyle,
    fontFamily: slideFontFamily,
    padding: calcCardPadding(slide),
    textAlign: (slide.titleAlign || cardContainerStyle.textAlign || 'left') as CSSProperties['textAlign'],
    ...(slide.bgColor ? { background: slide.bgGradient || slide.bgColor } : {}),
  };
}

/** 슬라이드별 제목 스타일 */
export function getTitleStyle(
  slide: SlideData,
  defaults: { fontSize: number; textAlign?: string },
  theme: CardNewsTheme,
  slideFontFamily: string,
  titleFontFamily?: string,
): CSSProperties {
  return {
    color: slide.titleColor || theme.titleColor,
    fontSize: `${slide.titleFontSize || defaults.fontSize}px`,
    fontWeight: (slide.titleFontWeight || '800') as CSSProperties['fontWeight'],
    letterSpacing: slide.titleLetterSpacing ? `${slide.titleLetterSpacing}px` : '-0.02em',
    lineHeight: slide.titleLineHeight || 1.25,
    wordBreak: 'keep-all',
    whiteSpace: 'pre-line',
    textAlign: (slide.titleAlign || defaults.textAlign || undefined) as CSSProperties['textAlign'],
    ...(slide.textShadow ? { textShadow: '0 2px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)' } : {}),
    ...(slide.titleFontId ? { fontFamily: titleFontFamily || slideFontFamily } : {}),
    ...(slide.titlePosition ? {
      position: 'absolute' as const,
      left: `${slide.titlePosition.x}%`,
      top: `${slide.titlePosition.y}%`,
      transform: 'translate(-50%, -50%)',
      width: '90%',
      maxWidth: '90%',
      zIndex: 10,
    } : {}),
  };
}

/** 슬라이드별 부제 스타일 */
export function getSubtitleStyle(
  slide: SlideData,
  theme: CardNewsTheme,
  slideFontFamily: string,
  subtitleFontFamily?: string,
): CSSProperties {
  return {
    color: slide.subtitleColor || theme.subtitleColor,
    fontSize: `${slide.subtitleFontSize || 22}px`,
    fontWeight: (slide.subtitleFontWeight || '600') as CSSProperties['fontWeight'],
    letterSpacing: slide.subtitleLetterSpacing ? `${slide.subtitleLetterSpacing}px` : undefined,
    lineHeight: slide.subtitleLineHeight || 1.55,
    wordBreak: 'keep-all',
    whiteSpace: 'pre-line',
    ...(slide.textShadow ? { textShadow: '0 2px 8px rgba(0,0,0,0.4)' } : {}),
    ...(slide.subtitleFontId ? { fontFamily: subtitleFontFamily || slideFontFamily } : {}),
    ...(slide.subtitlePosition ? {
      position: 'absolute' as const,
      left: `${slide.subtitlePosition.x}%`,
      top: `${slide.subtitlePosition.y}%`,
      transform: 'translate(-50%, -50%)',
      width: '85%',
      maxWidth: '85%',
      zIndex: 10,
    } : {}),
  };
}

/** 슬라이드별 본문 스타일 */
export function getBodyStyle(slide: SlideData, theme: CardNewsTheme): CSSProperties {
  const auto = calcBodySize(slide.body || '');
  return {
    color: slide.bodyColor || theme.bodyColor,
    fontSize: `${slide.bodyFontSize || auto.fontSize}px`,
    lineHeight: slide.bodyLineHeight || auto.lineHeight,
    wordBreak: 'keep-all',
  };
}
