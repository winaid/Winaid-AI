/**
 * canvasLayouts.ts — fabric.js Canvas 기반 카드뉴스 레이아웃 렌더 함수
 *
 * CardNewsProRenderer의 16종 JSX 렌더 함수 로직을 fabric 좌표로 변환.
 * 각 함수는 CanvasLayoutContext를 받아 fabric 오브젝트를 canvas에 추가한다.
 *
 * 현재: 뼈대 + 공용 헬퍼 + renderGenericToCanvas (범용 폴백)
 * 개별 레이아웃 함수는 placeholder (전부 generic 폴백)
 */

import type { SlideData, CardNewsTheme } from './cardNewsLayouts';
import type { DesignPresetStyle } from './cardNewsLayouts';
import { CARD_FONTS, getCardFont } from './cardNewsLayouts';

// ══════════════════════════════════════════════════
// Context 타입
// ══════════════════════════════════════════════════

export interface CanvasLayoutContext {
  F: typeof import('fabric');
  canvas: any;
  slide: SlideData;
  theme: CardNewsTheme;
  cardWidth: number;
  cardHeight: number;
  isDarkTheme: boolean;
  presetStyle?: DesignPresetStyle | null;
  learnedTemplate?: any;
}

// ══════════════════════════════════════════════════
// OBJ 이름 상수 (CardNewsCanvas와 공유)
// ══════════════════════════════════════════════════

export const OBJ = {
  BG: '__bg__',
  PATTERN: '__pattern__',
  ACCENT_TOP: '__accent_top__',
  ACCENT_BOT: '__accent_bot__',
  TITLE: '__title__',
  SUBTITLE: '__subtitle__',
  BODY: '__body__',
  HOSPITAL: '__hospital__',
  IMAGE: '__image__',
  LOGO: '__logo__',
  DECO_PREFIX: '__deco_',
  ITEM_PREFIX: '__item_',
} as const;

// ══════════════════════════════════════════════════
// 선택 스타일 (파란 테두리 + 리사이즈 핸들)
// ══════════════════════════════════════════════════

export const SELECTION_STYLE = {
  borderColor: '#3B82F6',
  cornerColor: '#3B82F6',
  cornerStrokeColor: '#FFFFFF',
  cornerStyle: 'circle' as const,
  cornerSize: 10,
  transparentCorners: false,
  borderScaleFactor: 2,
  padding: 4,
};

// ══════════════════════════════════════════════════
// 공용 디자인 엔진 헬퍼
// ══════════════════════════════════════════════════

/** 제목 크기 자동 계산 (글자 수 기반) — CardNewsProRenderer.calcTitleSize 동일 */
export function calcTitleSize(text: string, maxSize = 52, minSize = 36): number {
  const len = (text || '').length;
  if (len <= 10) return maxSize;
  if (len <= 15) return Math.min(maxSize, 56);
  if (len <= 20) return Math.min(maxSize, 48);
  if (len <= 30) return Math.min(maxSize, 42);
  return minSize;
}

/** 본문 크기 자동 계산 (글자 수 기반) */
export function calcBodySize(text: string): { fontSize: number; lineHeight: number } {
  const charCount = (text || '').length;
  if (charCount <= 50) return { fontSize: 22, lineHeight: 1.7 };
  if (charCount <= 100) return { fontSize: 20, lineHeight: 1.7 };
  if (charCount <= 200) return { fontSize: 18, lineHeight: 1.65 };
  return { fontSize: 16, lineHeight: 1.6 };
}

/** 항목 수에 따른 gap/padding/fontSize 자동 계산 */
export function calcItemLayout(itemCount: number): { gap: number; fontSize: number; padding: number } {
  if (itemCount <= 2) return { gap: 24, fontSize: 20, padding: 32 };
  if (itemCount <= 3) return { gap: 20, fontSize: 19, padding: 28 };
  if (itemCount <= 4) return { gap: 16, fontSize: 18, padding: 24 };
  if (itemCount <= 5) return { gap: 12, fontSize: 17, padding: 20 };
  return { gap: 10, fontSize: 16, padding: 16 };
}

/** 그리드 열 수 자동 계산 */
export function calcGridCols(itemCount: number): number {
  if (itemCount <= 1) return 1;
  if (itemCount <= 2) return 2;
  if (itemCount <= 4) return 2;
  if (itemCount <= 6) return 3;
  return 3;
}

/** 수치 크기 자동 계산 */
export function calcValueSize(text: string, containerWidth = 300): number {
  const len = (text || '').length;
  return Math.min(80, Math.max(36, Math.floor(containerWidth * 0.85 / Math.max(len, 1))));
}

// ── 색상 헬퍼 ──

export function getInnerCardBg(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
}

export function getInnerCardBorder(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
}

export function getWhiteCardBg(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.95)' : '#FFFFFF';
}

export function getWhiteCardText(theme: CardNewsTheme, isDark: boolean): string {
  return isDark ? '#1A1A2E' : theme.titleColor;
}

export function getWhiteCardSub(theme: CardNewsTheme, isDark: boolean): string {
  return isDark ? '#666' : theme.bodyColor;
}

// ── 폰트 헬퍼 ──

/** CSS font-family → fabric에 쓸 첫 번째 폰트명 추출 */
export function extractFontName(cssFamily: string): string {
  const m = cssFamily.match(/'([^']+)'/);
  return m ? m[1] : cssFamily.split(',')[0].trim();
}

/** fontId → CSS font-family 문자열 */
export function getFontFamily(theme: CardNewsTheme, fontId?: string): string {
  if (!fontId) {
    if (theme.fontId) return getCardFont(theme.fontId).family;
    return theme.fontFamily;
  }
  const font = CARD_FONTS.find(f => f.id === fontId);
  return font ? font.family : getCardFont(theme.fontId).family;
}

/** fontId → fabric에 쓸 폰트명 (한방에) */
export function resolveFontName(theme: CardNewsTheme, fontId?: string): string {
  return extractFontName(getFontFamily(theme, fontId));
}

// ── CSS gradient → fabric Gradient ──

/** CSS linear-gradient 문자열 파싱 */
export function parseGradientStops(gradientCSS: string): { color: string; offset: number }[] {
  const match = gradientCSS.match(/linear-gradient\([^,]+,\s*(.+)\)/);
  if (!match) return [];
  const stops: { color: string; offset: number }[] = [];
  match[1].split(',').map(s => s.trim()).forEach(part => {
    const m = part.match(/^(.+?)\s+([\d.]+)%$/);
    if (m) stops.push({ color: m[1], offset: parseFloat(m[2]) / 100 });
    else stops.push({ color: part, offset: stops.length === 0 ? 0 : 1 });
  });
  return stops;
}

/** CSS linear-gradient → fabric.Gradient 오브젝트 */
export function makeFabricGradient(
  F: typeof import('fabric'), css: string, w: number, h: number,
): any | undefined {
  const stops = parseGradientStops(css);
  if (stops.length < 2) return undefined;
  const am = css.match(/(\d+)deg/);
  const angle = am ? parseInt(am[1]) : 180;
  const rad = (angle - 90) * (Math.PI / 180);
  return new F.Gradient({
    type: 'linear',
    coords: {
      x1: w / 2 - Math.cos(rad) * w / 2,
      y1: h / 2 - Math.sin(rad) * h / 2,
      x2: w / 2 + Math.cos(rad) * w / 2,
      y2: h / 2 + Math.sin(rad) * h / 2,
    },
    colorStops: stops.map(s => ({ offset: s.offset, color: s.color })),
  });
}

// ══════════════════════════════════════════════════
// 아이템 텍스트 추출 헬퍼 (renderGenericToCanvas에서 사용)
// ══════════════════════════════════════════════════

interface ItemText {
  key: string;
  text: string;
  marker?: string;
}

function getItemTexts(slide: SlideData): ItemText[] {
  const items: ItemText[] = [];

  if (slide.checkItems?.length) {
    slide.checkItems.forEach((t, i) => items.push({ key: `check_${i}`, text: t, marker: slide.checkIcon || '✓' }));
  } else if (slide.steps?.length) {
    slide.steps.forEach((s, i) => items.push({ key: `step_${i}`, text: s.desc ? `${s.label}\n${s.desc}` : s.label, marker: `${i + 1}` }));
  } else if (slide.icons?.length) {
    slide.icons.forEach((ic, i) => items.push({ key: `icon_${i}`, text: ic.desc ? `${ic.title}\n${ic.desc}` : ic.title, marker: ic.emoji }));
  } else if (slide.numberedItems?.length) {
    slide.numberedItems.forEach((n, i) => items.push({ key: `num_${i}`, text: n.desc ? `${n.title}\n${n.desc}` : n.title, marker: n.num || `${i + 1}` }));
  } else if (slide.questions?.length) {
    slide.questions.forEach((q, i) => items.push({ key: `qna_${i}`, text: `Q. ${q.q}\nA. ${q.a}` }));
  } else if (slide.warningItems?.length) {
    slide.warningItems.forEach((w, i) => items.push({ key: `warn_${i}`, text: w, marker: '⚠' }));
  } else if (slide.pros?.length || slide.cons?.length) {
    (slide.pros || []).forEach((p, i) => items.push({ key: `pro_${i}`, text: p, marker: slide.prosIcon || 'O' }));
    (slide.cons || []).forEach((c, i) => items.push({ key: `con_${i}`, text: c, marker: slide.consIcon || 'X' }));
  } else if (slide.priceItems?.length) {
    slide.priceItems.forEach((p, i) => items.push({ key: `price_${i}`, text: `${p.name}  ${p.price}${p.note ? `  ${p.note}` : ''}` }));
  } else if (slide.dataPoints?.length) {
    slide.dataPoints.forEach((d, i) => items.push({ key: `data_${i}`, text: `${d.value}\n${d.label}` }));
  } else if (slide.timelineItems?.length) {
    slide.timelineItems.forEach((t, i) => items.push({ key: `timeline_${i}`, text: t.desc ? `${t.time} ${t.title}\n${t.desc}` : `${t.time} ${t.title}` }));
  }

  return items;
}

// ══════════════════════════════════════════════════
// Generic 폴백 — 기존 CardNewsCanvas 섹션 7~11 로직
// ══════════════════════════════════════════════════

export function renderGenericToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight } = ctx;
  const fontName = resolveFontName(theme, slide.fontId);

  // ── 제목 ──
  const titleFontName = resolveFontName(theme, slide.titleFontId || slide.fontId);
  const titleFontSize = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
  const titlePos = slide.titlePosition || { x: 50, y: 30 };

  if (slide.title) {
    const titleObj = new F.Textbox(slide.title, {
      left: (titlePos.x / 100) * cardWidth,
      top: (titlePos.y / 100) * cardHeight,
      originX: 'center',
      originY: 'center',
      width: cardWidth * 0.85,
      fontSize: titleFontSize,
      fontFamily: titleFontName,
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: slide.titleAlign || 'center',
      lineHeight: slide.titleLineHeight || 1.25,
      charSpacing: (slide.titleLetterSpacing || -0.4) * 10,
      name: OBJ.TITLE,
      splitByGrapheme: true,
      ...SELECTION_STYLE,
    });
    canvas.add(titleObj);
  }

  // ── 부제 ──
  if (slide.subtitle) {
    const subPos = slide.subtitlePosition || { x: 50, y: titlePos.y + 12 };
    const subFontName = resolveFontName(theme, slide.subtitleFontId || slide.fontId);
    const subObj = new F.Textbox(slide.subtitle, {
      left: (subPos.x / 100) * cardWidth,
      top: (subPos.y / 100) * cardHeight,
      originX: 'center',
      originY: 'center',
      width: cardWidth * 0.8,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: subFontName,
      fontWeight: slide.subtitleFontWeight || '600',
      fill: slide.subtitleColor || theme.subtitleColor,
      textAlign: 'center',
      lineHeight: slide.subtitleLineHeight || 1.55,
      name: OBJ.SUBTITLE,
      splitByGrapheme: true,
      ...SELECTION_STYLE,
    });
    canvas.add(subObj);
  }

  // ── 본문 ──
  if (slide.body) {
    const bodyAuto = calcBodySize(slide.body);
    const bodyY = slide.subtitlePosition
      ? slide.subtitlePosition.y + 15
      : titlePos.y + 25;
    const bodyObj = new F.Textbox(slide.body, {
      left: cardWidth * 0.5,
      top: (bodyY / 100) * cardHeight,
      originX: 'center',
      originY: 'top',
      width: cardWidth * 0.78,
      fontSize: slide.bodyFontSize || bodyAuto.fontSize,
      fontFamily: fontName,
      fontWeight: '400',
      fill: slide.bodyColor || theme.bodyColor,
      textAlign: 'left',
      lineHeight: bodyAuto.lineHeight,
      name: OBJ.BODY,
      splitByGrapheme: true,
      ...SELECTION_STYLE,
    });
    canvas.add(bodyObj);
  }

  // ── 리스트 아이템 ──
  const items = getItemTexts(slide);
  if (items.length > 0) {
    const layout = calcItemLayout(items.length);
    const startY = 0.5;
    const totalH = items.length * (layout.fontSize + layout.gap);
    const offsetY = (startY * cardHeight) - totalH / 2;

    items.forEach((item, i) => {
      const yPos = offsetY + i * (layout.fontSize + layout.gap);
      const itemObj = new F.Textbox(item.text, {
        left: cardWidth * 0.12,
        top: Math.max(yPos, 200 + i * (layout.fontSize + layout.gap)),
        originX: 'left',
        originY: 'top',
        width: cardWidth * 0.76,
        fontSize: layout.fontSize,
        fontFamily: fontName,
        fontWeight: '500',
        fill: slide.bodyColor || theme.bodyColor,
        textAlign: 'left',
        lineHeight: 1.5,
        name: OBJ.ITEM_PREFIX + item.key,
        splitByGrapheme: true,
        ...SELECTION_STYLE,
      });
      if (item.marker) {
        const marker = new F.Text(item.marker, {
          left: cardWidth * 0.07,
          top: Math.max(yPos, 200 + i * (layout.fontSize + layout.gap)),
          originX: 'center',
          originY: 'top',
          fontSize: layout.fontSize,
          fontWeight: '700',
          fill: theme.accentColor,
          selectable: false,
          evented: false,
        });
        canvas.add(marker);
      }
      canvas.add(itemObj);
    });
  }

  // ── 병원명 텍스트 ──
  if (theme.hospitalName) {
    const hospPos = slide.hospitalNamePosition || { x: 50, y: 92 };
    const hospObj = new F.Textbox(theme.hospitalName, {
      left: (hospPos.x / 100) * cardWidth,
      top: (hospPos.y / 100) * cardHeight,
      originX: 'center',
      originY: 'center',
      width: cardWidth * 0.5,
      fontSize: slide.hospitalFontSize || 18,
      fontFamily: fontName,
      fontWeight: slide.hospitalFontWeight || '600',
      fill: slide.hospitalColor || theme.subtitleColor,
      textAlign: 'center',
      name: OBJ.HOSPITAL,
      splitByGrapheme: true,
      ...SELECTION_STYLE,
    });
    canvas.add(hospObj);
  }
}

// ══════════════════════════════════════════════════
// 레이아웃별 렌더 함수 (placeholder — 전부 generic 폴백)
// 다음 프롬프트에서 하나씩 실제 구현으로 교체 예정
// ══════════════════════════════════════════════════

export function renderCoverToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderInfoToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderComparisonToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderChecklistToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderStepsToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderIconGridToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderDataHighlightToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderQnaToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderTimelineToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderBeforeAfterToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderProsConsToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderPriceTableToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderWarningToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderQuoteToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderNumberedListToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
export function renderClosingToCanvas(ctx: CanvasLayoutContext): void { renderGenericToCanvas(ctx); }
