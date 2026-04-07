'use client';

/**
 * SlideRenderContext — 렌더 함수들이 공유하는 테마 파생값 + 컨텍스트.
 * 현재는 context 생성만 여기에 두고, 실제 렌더 함수는 CardNewsProRenderer에 유지.
 * 다음 단계에서 렌더 함수를 이쪽으로 이동 예정.
 */
import type { CSSProperties } from 'react';
import type { CardNewsTheme, DesignPresetStyle } from '../../lib/cardNewsLayouts';
import type { CardTemplate } from '../../lib/cardTemplateService';
import { resolveEffectiveFontFamily } from '../../lib/cardStyleUtils';

export interface SlideRenderContext {
  theme: CardNewsTheme;
  lt: CardTemplate | null;
  presetStyle: DesignPresetStyle | null;
  isDarkTheme: boolean;
  cardWidth: number;
  cardHeight: number;
  cardAspect: string;
  cardContainerStyle: CSSProperties;
  effectiveFontFamily: string;
  customFontName: string | null;
  // 파생 색상값
  innerCardBg: string;
  innerCardBorder: string;
  innerCardRadius: string;
  innerCardShadow: string;
  whiteCardBg: string;
  whiteCardText: string;
  whiteCardSub: string;
}

/** 카드 높이 계산 */
function calcCardHeight(cardRatio: string): number {
  switch (cardRatio) {
    case '3:4': return 1440;
    case '4:5': return 1350;
    case '9:16': return 1920;
    case '16:9': return 608;
    default: return 1080;
  }
}

/** CSS aspect-ratio 문자열 */
function calcCardAspect(cardRatio: string): string {
  switch (cardRatio) {
    case '3:4': return '3 / 4';
    case '4:5': return '4 / 5';
    case '9:16': return '9 / 16';
    case '16:9': return '16 / 9';
    default: return '1 / 1';
  }
}

/** 테마가 어두운지 판정 (배경색 luminance 기준) */
function calcIsDark(bgColor: string): boolean {
  const hex = bgColor.replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

/** SlideRenderContext 생성 — 모든 테마 파생값을 한 번에 계산 */
export function createSlideRenderContext(
  theme: CardNewsTheme,
  learnedTemplate: CardTemplate | null | undefined,
  presetStyle: DesignPresetStyle | null | undefined,
  cardRatio: string,
  effectiveFontFamily: string,
  customFontName: string | null,
): SlideRenderContext {
  const lt = learnedTemplate || null;
  const cardWidth = 1080;
  const cardHeight = calcCardHeight(cardRatio);
  const cardAspect = calcCardAspect(cardRatio);

  const learnedBgGradient = lt?.backgroundStyle?.gradient || lt?.colors?.backgroundGradient;
  const cardContainerStyle: CSSProperties = {
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    position: 'relative',
    overflow: 'hidden',
    isolation: 'isolate',
    background: learnedBgGradient || theme.backgroundGradient || theme.backgroundColor,
    fontFamily: effectiveFontFamily,
    display: 'flex',
    flexDirection: 'column',
    padding: lt?.layoutRules?.contentPadding || '60px 64px',
    boxSizing: 'border-box',
    textAlign: lt?.layoutRules?.titleAlign || 'left',
    lineHeight: 1.5,
  };

  const isDarkTheme = calcIsDark(theme.backgroundColor);

  // 내부 카드 색상 (학습 템플릿 우선, 없으면 자동)
  const innerCardBg = lt?.innerCardStyle?.background
    || (isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
  const innerCardBorderRaw = lt?.innerCardStyle?.border;
  const innerCardBorder = (innerCardBorderRaw && innerCardBorderRaw !== 'none' ? innerCardBorderRaw : null)
    || (isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');
  const innerCardRadius = lt?.innerCardStyle?.borderRadius || '18px';
  const innerCardShadow = lt?.innerCardStyle?.boxShadow && lt.innerCardStyle.boxShadow !== 'none'
    ? lt.innerCardStyle.boxShadow
    : (isDarkTheme ? 'none' : '0 4px 12px rgba(0,0,0,0.04)');

  const whiteCardBg = isDarkTheme ? 'rgba(255,255,255,0.95)' : '#FFFFFF';
  const whiteCardText = isDarkTheme ? '#1A1A2E' : theme.titleColor;
  const whiteCardSub = isDarkTheme ? '#666' : theme.bodyColor;

  return {
    theme,
    lt,
    presetStyle: presetStyle || null,
    isDarkTheme,
    cardWidth,
    cardHeight,
    cardAspect,
    cardContainerStyle,
    effectiveFontFamily,
    customFontName,
    innerCardBg,
    innerCardBorder,
    innerCardRadius,
    innerCardShadow,
    whiteCardBg,
    whiteCardText,
    whiteCardSub,
  };
}
