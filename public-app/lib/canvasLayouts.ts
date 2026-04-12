/**
 * canvasLayouts.ts — fabric.js Canvas 기반 카드뉴스 레이아웃 렌더 함수
 *
 * CardNewsProRenderer의 16종 JSX 렌더 함수 로직을 fabric 좌표로 변환.
 * 각 함수는 CanvasLayoutContext를 받아 fabric 오브젝트를 canvas에 추가한다.
 *
 * 현재: 뼈대 + 공용 헬퍼 + renderGenericToCanvas (범용 폴백)
 * 개별 레이아웃 함수는 placeholder (전부 generic 폴백)
 */

import type { SlideData, CardNewsTheme, CoverTemplate } from './cardNewsLayouts';
import type { DesignPresetStyle } from './cardNewsLayouts';
import { CARD_FONTS, getCardFont, COVER_TEMPLATES } from './cardNewsLayouts';

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

/**
 * CSS linear-gradient 문자열 파싱.
 *
 * 이전엔 `split(',')` 로 단순 분리했으나 `rgba(r,g,b,a)` 처럼 괄호 내부에
 * 쉼표가 있는 색상을 만나면 잘려서 `'rgba(0'`, `'0'`, `'0'`, `'0.5)'` 처럼
 * 부서진 값을 색상 stop 으로 등록했고, 이후 렌더 시 browser `CanvasGradient.addColorStop`
 * 이 `SyntaxError: ... could not be parsed as a color` 로 throw → unhandledRejection
 * 이 발생하고 캔버스 렌더가 중간에 멈춤. COVER_TEMPLATES 의 `overlayGradient` 가
 * rgba 를 쓰기 때문에 해당 템플릿에서 100% 재현됨.
 *
 * 아래 구현은 괄호 depth 를 추적해 top-level 쉼표에서만 split 한다.
 */
export function parseGradientStops(gradientCSS: string): { color: string; offset: number }[] {
  const inner = gradientCSS.match(/linear-gradient\((.+)\)\s*$/)?.[1];
  if (!inner) return [];

  // depth-aware split
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());

  // 첫 요소는 방향/각도 (예: "180deg", "to bottom right") — 색상 stop 아님.
  const stopParts = parts.slice(1);
  const stops: { color: string; offset: number }[] = [];
  stopParts.forEach((part, idx) => {
    // "color  50%" 패턴 — 뒤의 명시적 offset 추출
    const m = part.match(/^(.+?)\s+([\d.]+)%$/);
    if (m) {
      stops.push({ color: m[1].trim(), offset: parseFloat(m[2]) / 100 });
    } else {
      // offset 미지정 — 균등 분포 (2개면 0/1, 3개면 0/0.5/1 …)
      const offset = stopParts.length > 1 ? idx / (stopParts.length - 1) : 0;
      stops.push({ color: part, offset });
    }
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
      splitByGrapheme: false,
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
      splitByGrapheme: false,
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
      splitByGrapheme: false,
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
        splitByGrapheme: false,
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
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    });
    canvas.add(hospObj);
  }
}

// ══════════════════════════════════════════════════
// 레이아웃별 렌더 함수 (placeholder — 전부 generic 폴백)
// 다음 프롬프트에서 하나씩 실제 구현으로 교체 예정
// ══════════════════════════════════════════════════

export function renderCoverToCanvas(ctx: CanvasLayoutContext): void {
  const { slide } = ctx;
  const tmpl = slide.coverTemplateId
    ? COVER_TEMPLATES.find(t => t.id === slide.coverTemplateId)
    : null;
  if (tmpl) {
    renderCoverFromTemplateToCanvas(ctx, tmpl);
  } else {
    renderDefaultCoverToCanvas(ctx);
  }
}

// ── 기본 커버 (템플릿 없을 때) ──

function renderDefaultCoverToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const fontName = resolveFontName(theme, slide.titleFontId || slide.fontId);
  const PAD = 60;

  // 콘텐츠 세로 중앙 기준점
  const centerY = cardHeight / 2;

  // accent bar — 72×5px, 중앙 상단
  const accentY = slide.titlePosition
    ? (slide.titlePosition.y / 100) * cardHeight - 80
    : centerY - 60;
  canvas.add(new F.Rect({
    left: cardWidth / 2 - 36,
    top: accentY,
    width: 72,
    height: 5,
    fill: theme.accentColor,
    rx: 3,
    ry: 3,
    selectable: false,
    evented: false,
  }));

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 64, 42);
    const titlePos = slide.titlePosition || { x: 50, y: 50 };
    canvas.add(new F.Textbox(slide.title, {
      left: (titlePos.x / 100) * cardWidth,
      top: (titlePos.y / 100) * cardHeight,
      originX: 'center',
      originY: 'center',
      width: cardWidth * 0.9,
      fontSize: titleFs,
      fontFamily: fontName,
      fontWeight: slide.titleFontWeight || '900',
      fill: slide.titleColor || theme.titleColor,
      textAlign: 'center',
      lineHeight: slide.titleLineHeight || 1.2,
      charSpacing: (slide.titleLetterSpacing || -0.4) * 10,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      shadow: isDarkTheme ? new F.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 24, offsetX: 0, offsetY: 2 }) : undefined,
      ...SELECTION_STYLE,
    }));
  }

  // 부제
  if (slide.subtitle) {
    const subPos = slide.subtitlePosition || { x: 50, y: 60 };
    canvas.add(new F.Textbox(slide.subtitle, {
      left: (subPos.x / 100) * cardWidth,
      top: (subPos.y / 100) * cardHeight,
      originX: 'center',
      originY: 'center',
      width: cardWidth * 0.85,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: slide.subtitleFontWeight || '600',
      fill: slide.subtitleColor || theme.subtitleColor,
      textAlign: 'center',
      lineHeight: slide.subtitleLineHeight || 1.55,
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  }

  // 병원 푸터
  addHospitalFooter(ctx);
}

// ── 템플릿 커버 (COVER_TEMPLATES 10종 대응) ──

function renderCoverFromTemplateToCanvas(ctx: CanvasLayoutContext, t: CoverTemplate): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight } = ctx;
  const fontName = resolveFontName(theme, slide.titleFontId || slide.fontId);

  // ── 토글 결정 ──
  const showArrows = slide.showArrows !== undefined ? slide.showArrows : t.decorations.hasArrows;
  const showBadge = slide.showBadge !== undefined ? slide.showBadge : t.decorations.hasBadge;
  const showHashtags = slide.showHashtags !== undefined ? slide.showHashtags : t.decorations.hasHashtags;
  const showHandle = slide.showHandle !== undefined ? slide.showHandle : t.decorations.hasHandle;
  const showLine = slide.showLine !== undefined ? slide.showLine : t.decorations.hasLine;

  // ── 템플릿 배경 오버레이 ──
  // (이미지 자체는 CardNewsCanvas 섹션 4에서 처리됨)
  // gradient/solid 배경은 별도 Rect로 추가
  if (t.background.type === 'gradient' && t.background.gradient) {
    const grad = makeFabricGradient(F, t.background.gradient, cardWidth, cardHeight);
    if (grad) {
      const bgR = new F.Rect({ left: 0, top: 0, width: cardWidth, height: cardHeight, selectable: false, evented: false });
      bgR.set('fill', grad);
      canvas.add(bgR);
    }
  } else if (t.background.type === 'solid' && t.background.solidColor) {
    canvas.add(new F.Rect({ left: 0, top: 0, width: cardWidth, height: cardHeight, fill: t.background.solidColor, selectable: false, evented: false }));
  }

  // 이미지 오버레이 (image-full, image-half 등에 overlayGradient 적용)
  if (t.background.overlayGradient && (t.background.type === 'image-full' || t.background.type === 'image-half')) {
    const ovGrad = makeFabricGradient(F, t.background.overlayGradient, cardWidth, cardHeight);
    if (ovGrad) {
      const ovR = new F.Rect({ left: 0, top: 0, width: cardWidth, height: cardHeight, selectable: false, evented: false });
      ovR.set('fill', ovGrad);
      canvas.add(ovR);
    }
  }
  if (t.background.overlayColor) {
    canvas.add(new F.Rect({ left: 0, top: 0, width: cardWidth, height: cardHeight, fill: t.background.overlayColor, selectable: false, evented: false }));
  }

  // ── titlePosition → fabric 좌표 매핑 ──
  const posCoords: Record<string, { left: number; top: number; originX: string; originY: string; textAlign: string }> = {
    'center':        { left: cardWidth / 2,    top: cardHeight / 2,    originX: 'center', originY: 'center', textAlign: 'center' },
    'bottom-left':   { left: 60,               top: cardHeight - 160,  originX: 'left',   originY: 'bottom', textAlign: 'left' },
    'bottom-center': { left: cardWidth / 2,    top: cardHeight - 140,  originX: 'center', originY: 'bottom', textAlign: 'center' },
    'top-left':      { left: 60,               top: 140,               originX: 'left',   originY: 'top',    textAlign: 'left' },
    'top-right':     { left: cardWidth - 60,   top: 140,               originX: 'right',  originY: 'top',    textAlign: 'right' },
  };
  const tPos = posCoords[t.layout.titlePosition] || posCoords['center'];
  const maxW = parseFloat(t.layout.titleMaxWidth) / 100 * cardWidth || cardWidth * 0.85;

  // ── line 장식 (제목 근처) ──
  if (showLine) {
    const lineLeft = tPos.originX === 'center' ? cardWidth / 2 - 30 : tPos.originX === 'right' ? cardWidth - 120 : 60;
    const lineTop = tPos.originY === 'bottom' ? tPos.top - 20 : tPos.originY === 'top' ? tPos.top : tPos.top - 50;
    canvas.add(new F.Rect({
      left: lineLeft,
      top: lineTop,
      width: 60,
      height: 3,
      fill: t.colors.accent,
      rx: 2,
      ry: 2,
      selectable: false,
      evented: false,
    }));
  }

  // ── 부제 (above-title) ──
  if (t.layout.subtitlePosition === 'above-title' && slide.subtitle) {
    const subAboveTop = tPos.originY === 'bottom' ? tPos.top - 80 : tPos.originY === 'top' ? tPos.top : tPos.top - 40;
    canvas.add(new F.Textbox(`\u201C${slide.subtitle}\u201D`, {
      left: tPos.left,
      top: slide.subtitlePosition ? (slide.subtitlePosition.y / 100) * cardHeight : subAboveTop,
      originX: tPos.originX as any,
      originY: 'bottom',
      width: maxW,
      fontSize: slide.subtitleFontSize || t.layout.subtitleSize,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '500',
      fill: slide.subtitleColor || t.colors.subtitle,
      textAlign: tPos.textAlign as any,
      charSpacing: 10,
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  }

  // ── 제목 ──
  if (slide.title) {
    const titleLeft = slide.titlePosition ? (slide.titlePosition.x / 100) * cardWidth : tPos.left;
    const titleTop = slide.titlePosition ? (slide.titlePosition.y / 100) * cardHeight : tPos.top;
    const titleOriginX = slide.titlePosition ? 'center' : tPos.originX;
    const titleOriginY = slide.titlePosition ? 'center' : tPos.originY;

    canvas.add(new F.Textbox(slide.title, {
      left: titleLeft,
      top: titleTop,
      originX: titleOriginX as any,
      originY: titleOriginY as any,
      width: maxW,
      fontSize: slide.titleFontSize || t.layout.titleSize,
      fontFamily: fontName,
      fontWeight: slide.titleFontWeight || String(t.layout.titleWeight),
      fill: slide.titleColor || t.colors.title,
      textAlign: tPos.textAlign as any,
      lineHeight: slide.titleLineHeight || 1.25,
      charSpacing: (slide.titleLetterSpacing || -0.4) * 10,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  }

  // ── 부제 (below-title) ──
  if (t.layout.subtitlePosition === 'below-title' && slide.subtitle) {
    const subBelowTop = tPos.originY === 'bottom' ? tPos.top + 16 : tPos.originY === 'top' ? tPos.top + 80 : tPos.top + 50;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: slide.subtitlePosition ? (slide.subtitlePosition.x / 100) * cardWidth : tPos.left,
      top: slide.subtitlePosition ? (slide.subtitlePosition.y / 100) * cardHeight : subBelowTop,
      originX: (slide.subtitlePosition ? 'center' : tPos.originX) as any,
      originY: (slide.subtitlePosition ? 'center' : 'top') as any,
      width: maxW * 0.85,
      fontSize: slide.subtitleFontSize || t.layout.subtitleSize,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '500',
      fill: slide.subtitleColor || t.colors.subtitle,
      textAlign: tPos.textAlign as any,
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  }

  // ── 뱃지 장식 ──
  if (showBadge && (slide.badge || theme.hospitalName)) {
    const badgeText = slide.badge || theme.hospitalName || 'CARDNEWS';
    const badgeLeft = t.decorations.badgePosition === 'top-left' ? 40
      : t.decorations.badgePosition === 'top-right' ? cardWidth - 40
      : cardWidth / 2;
    const badgeOriginX = t.decorations.badgePosition === 'top-right' ? 'right'
      : t.decorations.badgePosition === 'top-left' ? 'left' : 'center';

    // 뱃지 배경
    const badgeW = badgeText.length * 10 + 40;
    canvas.add(new F.Rect({
      left: badgeLeft,
      top: 40,
      width: badgeW,
      height: 32,
      fill: t.colors.accent,
      rx: 6,
      ry: 6,
      originX: badgeOriginX as any,
      originY: 'top',
      selectable: false,
      evented: false,
    }));
    canvas.add(new F.Text(badgeText, {
      left: badgeLeft,
      top: 48,
      originX: badgeOriginX as any,
      originY: 'center',
      fontSize: 13,
      fontWeight: '800',
      fill: '#FFFFFF',
      charSpacing: 10,
      selectable: false,
      evented: false,
    }));
  }

  // ── 해시태그 ──
  if (showHashtags) {
    const tags = slide.hashtags || slide.title?.split(' ').slice(0, 3).map(w => `#${w}`) || [];
    const tagY = cardHeight - 80;
    const tagStartX = tPos.textAlign === 'center' ? cardWidth / 2 : 60;
    let xOffset = 0;

    tags.forEach(tag => {
      const label = tag.startsWith('#') ? tag : `#${tag}`;
      const tw = label.length * 10 + 40;
      canvas.add(new F.Text(label, {
        left: tPos.textAlign === 'center' ? tagStartX - (tags.length * 50) + xOffset + tw / 2 : tagStartX + xOffset + tw / 2,
        top: tagY,
        originX: 'center',
        originY: 'center',
        fontSize: 15,
        fontWeight: '700',
        fill: t.colors.hashtag,
        selectable: false,
        evented: false,
      }));
      xOffset += tw + 12;
    });
  }

  // ── 화살표 ──
  if (showArrows) {
    if (t.decorations.arrowStyle === 'circle') {
      canvas.add(new F.Circle({
        left: cardWidth - 60,
        top: cardHeight - 40,
        radius: 24,
        fill: 'transparent',
        stroke: t.colors.title + '60',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      }));
      canvas.add(new F.Text('\u2192', {
        left: cardWidth - 60,
        top: cardHeight - 40,
        originX: 'center',
        originY: 'center',
        fontSize: 20,
        fill: t.colors.title,
        selectable: false,
        evented: false,
      }));
    } else {
      canvas.add(new F.Text('\u203A \u203A \u203A \u203A', {
        left: cardWidth - 60,
        top: cardHeight - 40,
        originX: 'right',
        originY: 'center',
        fontSize: 24,
        fontWeight: '300',
        fill: t.colors.title,
        opacity: 0.6,
        charSpacing: 40,
        selectable: false,
        evented: false,
      }));
    }
  }

  // ── SNS 핸들 ──
  if (showHandle && theme.hospitalName) {
    canvas.add(new F.Text(`@${theme.hospitalName.replace(/\s/g, '_').toLowerCase()}`, {
      left: cardWidth / 2,
      top: cardHeight - 40,
      originX: 'center',
      originY: 'center',
      fontSize: 13,
      fontWeight: '500',
      fill: t.colors.subtitle,
      selectable: false,
      evented: false,
    }));
  }

  // 병원 푸터
  addHospitalFooter(ctx);
}

// ── 공용: 병원명 푸터 추가 ──

function addHospitalFooter(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  if (!theme.hospitalName) return;

  const hospPos = slide.hospitalNamePosition || { x: 50, y: 92 };
  canvas.add(new F.Textbox(theme.hospitalName, {
    left: (hospPos.x / 100) * cardWidth,
    top: (hospPos.y / 100) * cardHeight,
    originX: 'center',
    originY: 'center',
    width: cardWidth * 0.5,
    fontSize: slide.hospitalFontSize || 14,
    fontFamily: resolveFontName(theme, slide.fontId),
    fontWeight: slide.hospitalFontWeight || '600',
    fill: slide.hospitalColor || (isDarkTheme ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'),
    textAlign: 'center',
    charSpacing: 30,
    name: OBJ.HOSPITAL,
    splitByGrapheme: false,
    ...SELECTION_STYLE,
  }));
}
// ══════════════════════════════════════════════════
// renderInfoToCanvas
// ══════════════════════════════════════════════════

export function renderInfoToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.titleFontId || slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);

  // 콘텐츠 세로 중앙 기준 — 패딩 고려
  let curY = cardHeight * 0.22;

  // accent bar (왼쪽 정렬)
  canvas.add(new F.Rect({
    left: PAD, top: curY, width: 60, height: 4,
    fill: theme.accentColor, rx: 2, ry: 2,
    selectable: false, evented: false,
  }));
  curY += 28;

  // 제목 (왼쪽 정렬)
  if (slide.title) {
    const titleFs = slide.titleFontSize || 48;
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : PAD,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: titlePos ? 'center' : 'left',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: fontName,
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: slide.titleAlign || 'left',
      lineHeight: slide.titleLineHeight || 1.25,
      charSpacing: -20,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 22;
  }

  // 부제
  if (slide.subtitle) {
    const subPos = slide.subtitlePosition;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: subPos ? (subPos.x / 100) * cardWidth : PAD,
      top: subPos ? (subPos.y / 100) * cardHeight : curY,
      originX: subPos ? 'center' : 'left',
      originY: subPos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: slide.subtitleFontWeight || '600',
      fill: slide.subtitleColor || theme.subtitleColor,
      textAlign: 'left',
      lineHeight: slide.subtitleLineHeight || 1.55,
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += 22 * 1.6 + 22;
  }

  // 본문 카드 (배경 Rect + accent 왼쪽 보더 + 텍스트)
  if (slide.body) {
    const bodyAuto = calcBodySize(slide.body);
    const bodyFs = slide.bodyFontSize || bodyAuto.fontSize;
    const bodyPadX = 36;
    const bodyPadY = 32;
    const bodyW = cardWidth - PAD * 2;
    // 본문 높이 추정 (줄 수 * 폰트 크기 * 줄 간격)
    const estLines = Math.ceil(slide.body.length / Math.floor((bodyW - bodyPadX * 2) / bodyFs));
    const bodyH = Math.max(estLines * bodyFs * bodyAuto.lineHeight + bodyPadY * 2, 120);

    // 카드 배경
    canvas.add(new F.Rect({
      left: PAD, top: curY, width: bodyW, height: bodyH,
      fill: innerBg, rx: 18, ry: 18,
      selectable: false, evented: false,
    }));

    // 왼쪽 accent 보더
    canvas.add(new F.Rect({
      left: PAD, top: curY, width: 5, height: bodyH,
      fill: theme.accentColor, rx: 3, ry: 3,
      selectable: false, evented: false,
    }));

    // 본문 텍스트
    canvas.add(new F.Textbox(slide.body, {
      left: PAD + bodyPadX,
      top: curY + bodyPadY,
      originX: 'left',
      originY: 'top',
      width: bodyW - bodyPadX * 2 - 5,
      fontSize: bodyFs,
      fontFamily: resolveFontName(theme, slide.fontId),
      fontWeight: '400',
      fill: slide.bodyColor || theme.bodyColor,
      textAlign: 'left',
      lineHeight: bodyAuto.lineHeight,
      name: OBJ.BODY,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  }

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderComparisonToCanvas
// ══════════════════════════════════════════════════

export function renderComparisonToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const GAP = 3;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);

  const cols = slide.columns || [];
  const labels = slide.compareLabels || [];
  const rowCount = labels.length || (cols[0]?.items?.length || 0);
  if (cols.length === 0) { renderGenericToCanvas(ctx); return; }

  // ── 제목 영역 ──
  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({
    left: cardWidth / 2 - 30, top: curY, width: 60, height: 4,
    fill: theme.accentColor, rx: 2, ry: 2,
    selectable: false, evented: false,
  }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : cardWidth / 2,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: 'center',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: 'center',
      lineHeight: 1.25,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }

  // 부제
  if (slide.subtitle) {
    const subPos = slide.subtitlePosition;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: subPos ? (subPos.x / 100) * cardWidth : cardWidth / 2,
      top: subPos ? (subPos.y / 100) * cardHeight : curY + 10,
      originX: 'center',
      originY: subPos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '600',
      fill: slide.subtitleColor || theme.subtitleColor,
      textAlign: 'center',
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += 40;
  }

  curY += 24;

  // ── 테이블 영역 ──
  const tableTop = curY;
  const tableBottom = cardHeight - 80; // 병원 푸터 공간
  const tableH = tableBottom - tableTop;
  const totalCols = (labels.length > 0 ? 1 : 0) + cols.length;
  const tableW = cardWidth - PAD * 2;
  const labelColW = labels.length > 0 ? 160 : 0;
  const dataColW = (tableW - labelColW - GAP * (totalCols - 1)) / cols.length;
  const headerH = 60;
  const rowH = (tableH - headerH - GAP * rowCount) / Math.max(rowCount, 1);

  // 헤더 행
  let hx = PAD + (labels.length > 0 ? labelColW + GAP : 0);
  cols.forEach((col, ci) => {
    // 헤더 배경
    canvas.add(new F.Rect({
      left: hx, top: tableTop, width: dataColW, height: headerH,
      fill: col.highlight ? theme.accentColor : theme.cardBgColor,
      selectable: false, evented: false,
    }));
    // 헤더 텍스트
    canvas.add(new F.Text(col.header, {
      left: hx + dataColW / 2, top: tableTop + headerH / 2,
      originX: 'center', originY: 'center',
      fontSize: 22, fontWeight: '900', fontFamily: fontName,
      fill: col.highlight ? '#FFFFFF' : '#1A1A2E',
      selectable: false, evented: false,
    }));
    hx += dataColW + GAP;
  });

  // 데이터 행
  for (let ri = 0; ri < rowCount; ri++) {
    const ry = tableTop + headerH + GAP + ri * (rowH + GAP);
    let rx = PAD;

    // 라벨 열
    if (labels.length > 0) {
      canvas.add(new F.Rect({
        left: rx, top: ry, width: labelColW, height: rowH,
        fill: isDarkTheme ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
        selectable: false, evented: false,
      }));
      canvas.add(new F.Text(labels[ri] || '', {
        left: rx + labelColW / 2, top: ry + rowH / 2,
        originX: 'center', originY: 'center',
        fontSize: 17, fontWeight: '800', fontFamily: fontName,
        fill: theme.titleColor,
        selectable: false, evented: false,
      }));
      rx += labelColW + GAP;
    }

    // 데이터 열
    cols.forEach((col, ci) => {
      canvas.add(new F.Rect({
        left: rx, top: ry, width: dataColW, height: rowH,
        fill: col.highlight ? `${theme.accentColor}1F` : innerBg,
        selectable: false, evented: false,
      }));
      canvas.add(new F.Text(col.items[ri] || '', {
        left: rx + dataColW / 2, top: ry + rowH / 2,
        originX: 'center', originY: 'center',
        fontSize: 18, fontWeight: col.highlight ? '800' : '500',
        fontFamily: fontName,
        fill: col.highlight ? theme.accentColor : theme.titleColor,
        selectable: false, evented: false,
      }));
      rx += dataColW + GAP;
    });
  }

  // VS 뱃지 (2열, 라벨 없을 때)
  if (cols.length === 2 && labels.length === 0) {
    const vsX = PAD + tableW / 2;
    const vsY = tableTop + tableH / 2;
    canvas.add(new F.Circle({
      left: vsX, top: vsY, radius: 24,
      fill: theme.accentColor,
      originX: 'center', originY: 'center',
      shadow: new F.Shadow({ color: theme.accentColor + '44', blur: 16, offsetX: 0, offsetY: 4 }),
      selectable: false, evented: false,
    }));
    canvas.add(new F.Text(slide.vsIcon || 'VS', {
      left: vsX, top: vsY,
      originX: 'center', originY: 'center',
      fontSize: 16, fontWeight: '900', fill: '#FFFFFF',
      selectable: false, evented: false,
    }));
  }

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderChecklistToCanvas
// ══════════════════════════════════════════════════

export function renderChecklistToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const innerBorder = getInnerCardBorder(isDarkTheme);
  const items = slide.checkItems || [];
  const layout = calcItemLayout(items.length);

  let curY = PAD;

  // accent bar (왼쪽)
  canvas.add(new F.Rect({
    left: PAD, top: curY, width: 60, height: 4,
    fill: theme.accentColor, rx: 2, ry: 2,
    selectable: false, evented: false,
  }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : PAD,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: titlePos ? 'center' : 'left',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: slide.titleAlign || 'left',
      lineHeight: 1.25,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }

  // 부제
  if (slide.subtitle) {
    curY += 10;
    const subPos = slide.subtitlePosition;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: subPos ? (subPos.x / 100) * cardWidth : PAD,
      top: subPos ? (subPos.y / 100) * cardHeight : curY,
      originX: subPos ? 'center' : 'left',
      originY: subPos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '600',
      fill: slide.subtitleColor || theme.subtitleColor,
      textAlign: 'left',
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += 36;
  }

  curY += 24;

  // 체크 아이템
  const itemAreaBottom = cardHeight - 80;
  const totalItemH = items.length * (layout.padding * 2 + layout.fontSize) + (items.length - 1) * layout.gap;
  const startY = Math.max(curY, (curY + itemAreaBottom) / 2 - totalItemH / 2);
  const itemW = cardWidth - PAD * 2;
  const itemH = layout.padding * 2 + layout.fontSize;
  const circleR = 22;

  items.forEach((item, i) => {
    const iy = startY + i * (itemH + layout.gap);

    // 아이템 배경 (pill shape)
    canvas.add(new F.Rect({
      left: PAD, top: iy, width: itemW, height: itemH,
      fill: innerBg, rx: itemH / 2, ry: itemH / 2,
      stroke: innerBorder, strokeWidth: 1,
      selectable: false, evented: false,
    }));

    // 체크 아이콘 원
    const circleX = PAD + 28 + circleR;
    const circleY = iy + itemH / 2;
    canvas.add(new F.Circle({
      left: circleX, top: circleY, radius: circleR,
      fill: theme.accentColor,
      originX: 'center', originY: 'center',
      selectable: false, evented: false,
    }));
    canvas.add(new F.Text(slide.checkIcon || '✓', {
      left: circleX, top: circleY,
      originX: 'center', originY: 'center',
      fontSize: 22, fontWeight: '900', fill: '#FFFFFF',
      selectable: false, evented: false,
    }));

    // 아이템 텍스트
    canvas.add(new F.Textbox(item, {
      left: circleX + circleR + 20,
      top: circleY,
      originX: 'left',
      originY: 'center',
      width: itemW - 28 - circleR * 2 - 48,
      fontSize: layout.fontSize,
      fontFamily: fontName,
      fontWeight: '600',
      fill: theme.titleColor,
      textAlign: 'left',
      lineHeight: 1.4,
      name: OBJ.ITEM_PREFIX + `check_${i}`,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderStepsToCanvas
// ══════════════════════════════════════════════════

export function renderStepsToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const items = slide.steps || [];
  const layout = calcItemLayout(items.length);
  const isHorizontal = items.length <= 3;

  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({
    left: cardWidth / 2 - 30, top: curY, width: 60, height: 4,
    fill: theme.accentColor, rx: 2, ry: 2,
    selectable: false, evented: false,
  }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : cardWidth / 2,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: 'center',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: 'center',
      lineHeight: 1.25,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }

  // 부제
  if (slide.subtitle) {
    curY += 10;
    const subPos = slide.subtitlePosition;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: subPos ? (subPos.x / 100) * cardWidth : cardWidth / 2,
      top: subPos ? (subPos.y / 100) * cardHeight : curY,
      originX: 'center',
      originY: subPos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '600',
      fill: slide.subtitleColor || theme.subtitleColor,
      textAlign: 'center',
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += 36;
  }

  curY += 24;

  const areaBottom = cardHeight - 80;
  const areaH = areaBottom - curY;

  if (isHorizontal) {
    // ── 가로 배치 (3개 이하) ──
    const stepW = (cardWidth - PAD * 2 - layout.gap * (items.length - 1)) / items.length;
    const stepH = areaH;
    const circleSize = 56;

    items.forEach((step, i) => {
      const sx = PAD + i * (stepW + layout.gap);

      // 카드 배경
      canvas.add(new F.Rect({
        left: sx, top: curY, width: stepW, height: stepH,
        fill: innerBg, rx: 20, ry: 20,
        selectable: false, evented: false,
      }));

      // 번호 원
      const circleX = sx + stepW / 2;
      const circleY = curY + layout.padding + circleSize / 2;
      canvas.add(new F.Circle({
        left: circleX, top: circleY, radius: circleSize / 2,
        fill: theme.accentColor,
        originX: 'center', originY: 'center',
        shadow: new F.Shadow({ color: theme.accentColor + '40', blur: 18, offsetX: 0, offsetY: 6 }),
        selectable: false, evented: false,
      }));
      canvas.add(new F.Text(String(i + 1), {
        left: circleX, top: circleY,
        originX: 'center', originY: 'center',
        fontSize: 24, fontWeight: '900', fill: '#FFFFFF',
        selectable: false, evented: false,
      }));

      // label
      const labelY = circleY + circleSize / 2 + 16;
      const labelFs = Math.min(24, layout.fontSize + 2);
      canvas.add(new F.Textbox(step.label, {
        left: sx + stepW / 2,
        top: labelY,
        originX: 'center',
        originY: 'top',
        width: stepW - 40,
        fontSize: labelFs,
        fontFamily: fontName,
        fontWeight: '800',
        fill: theme.titleColor,
        textAlign: 'center',
        lineHeight: 1.3,
        name: OBJ.ITEM_PREFIX + `step_${i}`,
        splitByGrapheme: false,
        ...SELECTION_STYLE,
      }));

      // desc
      if (step.desc) {
        canvas.add(new F.Textbox(step.desc, {
          left: sx + stepW / 2,
          top: labelY + labelFs * 1.4 + 6,
          originX: 'center',
          originY: 'top',
          width: stepW - 40,
          fontSize: layout.fontSize - 2,
          fontFamily: fontName,
          fontWeight: '400',
          fill: theme.bodyColor,
          textAlign: 'center',
          lineHeight: 1.55,
          selectable: false, evented: false,
        }));
      }
    });
  } else {
    // ── 세로 배치 (4개 이상) ──
    const stepH = (areaH - layout.gap * (items.length - 1)) / items.length;
    const circleSize = 64;
    const accentBorderW = 6;

    items.forEach((step, i) => {
      const sy = curY + i * (stepH + layout.gap);

      // 카드 배경
      canvas.add(new F.Rect({
        left: PAD, top: sy, width: cardWidth - PAD * 2, height: stepH,
        fill: innerBg, rx: 20, ry: 20,
        selectable: false, evented: false,
      }));

      // 왼쪽 accent 보더
      canvas.add(new F.Rect({
        left: PAD, top: sy, width: accentBorderW, height: stepH,
        fill: theme.accentColor, rx: 3, ry: 3,
        selectable: false, evented: false,
      }));

      // 번호 원
      const circleX = PAD + 30 + circleSize / 2;
      const circleY = sy + stepH / 2;
      canvas.add(new F.Circle({
        left: circleX, top: circleY, radius: circleSize / 2,
        fill: theme.accentColor,
        originX: 'center', originY: 'center',
        shadow: new F.Shadow({ color: theme.accentColor + '40', blur: 18, offsetX: 0, offsetY: 6 }),
        selectable: false, evented: false,
      }));
      canvas.add(new F.Text(String(i + 1), {
        left: circleX, top: circleY,
        originX: 'center', originY: 'center',
        fontSize: 28, fontWeight: '900', fill: '#FFFFFF',
        selectable: false, evented: false,
      }));

      // label
      const textLeft = circleX + circleSize / 2 + 24;
      const textW = cardWidth - PAD - textLeft - 30;
      const labelFs = Math.min(24, layout.fontSize + 2);

      canvas.add(new F.Textbox(step.label, {
        left: textLeft,
        top: step.desc ? circleY - 14 : circleY,
        originX: 'left',
        originY: 'center',
        width: textW,
        fontSize: labelFs,
        fontFamily: fontName,
        fontWeight: '800',
        fill: theme.titleColor,
        textAlign: 'left',
        lineHeight: 1.3,
        name: OBJ.ITEM_PREFIX + `step_${i}`,
        splitByGrapheme: false,
        ...SELECTION_STYLE,
      }));

      // desc
      if (step.desc) {
        canvas.add(new F.Textbox(step.desc, {
          left: textLeft,
          top: circleY + 10,
          originX: 'left',
          originY: 'top',
          width: textW,
          fontSize: layout.fontSize - 2,
          fontFamily: fontName,
          fontWeight: '400',
          fill: theme.bodyColor,
          textAlign: 'left',
          lineHeight: 1.55,
          selectable: false, evented: false,
        }));
      }
    });
  }

  addHospitalFooter(ctx);
}
// ══════════════════════════════════════════════════
// renderIconGridToCanvas
// ══════════════════════════════════════════════════

export function renderIconGridToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const items = slide.icons || [];
  const cols = calcGridCols(items.length);
  const wcBg = getWhiteCardBg(isDarkTheme);
  const wcText = getWhiteCardText(theme, isDarkTheme);
  const wcSub = getWhiteCardSub(theme, isDarkTheme);

  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({ left: cardWidth / 2 - 30, top: curY, width: 60, height: 4, fill: theme.accentColor, rx: 2, ry: 2, selectable: false, evented: false }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const tp = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: tp ? (tp.x / 100) * cardWidth : cardWidth / 2, top: tp ? (tp.y / 100) * cardHeight : curY,
      originX: 'center', originY: tp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: titleFs, fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800', fill: slide.titleColor || theme.titleColor,
      textAlign: 'center', lineHeight: 1.25, name: OBJ.TITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }
  if (slide.subtitle) {
    const sp = slide.subtitlePosition;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: sp ? (sp.x / 100) * cardWidth : cardWidth / 2, top: sp ? (sp.y / 100) * cardHeight : curY + 10,
      originX: 'center', originY: sp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: slide.subtitleFontSize || 22, fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '600', fill: slide.subtitleColor || theme.subtitleColor, textAlign: 'center',
      name: OBJ.SUBTITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += 40;
  }
  curY += 24;

  // 그리드
  const gridGap = 22;
  const rows = Math.ceil(items.length / cols);
  const cellW = (cardWidth - PAD * 2 - gridGap * (cols - 1)) / cols;
  const areaBottom = cardHeight - 80;
  const cellH = Math.min((areaBottom - curY - gridGap * (rows - 1)) / rows, cellW * 1.2);

  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = PAD + col * (cellW + gridGap);
    const cy = curY + row * (cellH + gridGap);

    // 카드 배경
    canvas.add(new F.Rect({ left: cx, top: cy, width: cellW, height: cellH, fill: wcBg, rx: 20, ry: 20, selectable: false, evented: false }));

    // 배경 번호
    canvas.add(new F.Text(String(i + 1).padStart(2, '0'), {
      left: cx + 12, top: cy - 10, originX: 'left', originY: 'top',
      fontSize: 80, fontWeight: '900',
      fill: isDarkTheme ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.03)',
      selectable: false, evented: false,
    }));

    // 이모지
    canvas.add(new F.Text(item.emoji, {
      left: cx + cellW / 2, top: cy + cellH * 0.3, originX: 'center', originY: 'center',
      fontSize: 56, selectable: false, evented: false,
    }));

    // 타이틀
    canvas.add(new F.Textbox(item.title, {
      left: cx + cellW / 2, top: cy + cellH * 0.55, originX: 'center', originY: 'top',
      width: cellW - 48, fontSize: 22, fontWeight: '900', fontFamily: fontName,
      fill: wcText, textAlign: 'center', lineHeight: 1.3,
      name: OBJ.ITEM_PREFIX + `icon_${i}`, splitByGrapheme: false, ...SELECTION_STYLE,
    }));

    // 설명
    if (item.desc) {
      canvas.add(new F.Textbox(item.desc, {
        left: cx + cellW / 2, top: cy + cellH * 0.75, originX: 'center', originY: 'top',
        width: cellW - 48, fontSize: 15, fontWeight: '500', fontFamily: fontName,
        fill: wcSub, textAlign: 'center', lineHeight: 1.55,
        selectable: false, evented: false,
      }));
    }
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderDataHighlightToCanvas
// ══════════════════════════════════════════════════

export function renderDataHighlightToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const innerBorder = getInnerCardBorder(isDarkTheme);
  const points = slide.dataPoints || [];
  const cols = Math.min(Math.max(points.length, 1), 3);

  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({ left: cardWidth / 2 - 30, top: curY, width: 60, height: 4, fill: theme.accentColor, rx: 2, ry: 2, selectable: false, evented: false }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const tp = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: tp ? (tp.x / 100) * cardWidth : cardWidth / 2, top: tp ? (tp.y / 100) * cardHeight : curY,
      originX: 'center', originY: tp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: titleFs, fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800', fill: slide.titleColor || theme.titleColor,
      textAlign: 'center', lineHeight: 1.25, name: OBJ.TITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }
  if (slide.subtitle) {
    const sp = slide.subtitlePosition;
    canvas.add(new F.Textbox(slide.subtitle, {
      left: sp ? (sp.x / 100) * cardWidth : cardWidth / 2, top: sp ? (sp.y / 100) * cardHeight : curY + 10,
      originX: 'center', originY: sp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: slide.subtitleFontSize || 22, fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '600', fill: slide.subtitleColor || theme.subtitleColor, textAlign: 'center',
      name: OBJ.SUBTITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += 40;
  }
  curY += 24;

  // 데이터 포인트
  const gap = 24;
  const areaBottom = cardHeight - 80;
  const containerW = Math.floor((cardWidth - PAD * 2 - gap * (cols - 1)) / cols);
  const shapeSize = Math.min(containerW, areaBottom - curY);
  const centerY = curY + (areaBottom - curY) / 2;

  points.forEach((dp, i) => {
    const cx = PAD + i * (containerW + gap) + containerW / 2;
    const shape = slide.dataShape || 'circle';
    const bg = dp.highlight ? `${theme.accentColor}15` : innerBg;
    const border = dp.highlight ? theme.accentColor : innerBorder;
    const borderW = dp.highlight ? 3 : 1;

    // 도형
    if (shape === 'circle' || shape === 'hexagon') {
      canvas.add(new F.Circle({
        left: cx, top: centerY, radius: shapeSize / 2 - 4,
        fill: bg, stroke: border, strokeWidth: borderW,
        originX: 'center', originY: 'center',
        shadow: dp.highlight ? new F.Shadow({ color: theme.accentColor + '25', blur: 30, offsetX: 0, offsetY: 8 }) : undefined,
        selectable: false, evented: false,
      }));
    } else if (shape === 'diamond') {
      canvas.add(new F.Rect({
        left: cx, top: centerY, width: shapeSize * 0.7, height: shapeSize * 0.7,
        fill: bg, stroke: border, strokeWidth: borderW, angle: 45, rx: 24, ry: 24,
        originX: 'center', originY: 'center',
        selectable: false, evented: false,
      }));
    } else {
      // rounded, pill
      const rx = shape === 'pill' ? shapeSize / 4 : 24;
      const h = shape === 'pill' ? shapeSize * 0.5 : shapeSize - 8;
      canvas.add(new F.Rect({
        left: cx, top: centerY, width: containerW - 8, height: h,
        fill: bg, stroke: border, strokeWidth: borderW, rx, ry: rx,
        originX: 'center', originY: 'center',
        selectable: false, evented: false,
      }));
    }

    // value
    const valFs = calcValueSize(dp.value, containerW);
    canvas.add(new F.Text(dp.value, {
      left: cx, top: centerY - 12, originX: 'center', originY: 'center',
      fontSize: valFs, fontWeight: '900', fontFamily: fontName,
      fill: dp.highlight ? theme.accentColor : theme.titleColor,
      charSpacing: -30, selectable: false, evented: false,
    }));

    // label
    canvas.add(new F.Text(dp.label, {
      left: cx, top: centerY + valFs / 2 + 8, originX: 'center', originY: 'top',
      fontSize: 16, fontWeight: '600', fontFamily: fontName,
      fill: theme.bodyColor, selectable: false, evented: false,
    }));
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderQnaToCanvas
// ══════════════════════════════════════════════════

export function renderQnaToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const innerBorder = getInnerCardBorder(isDarkTheme);
  const questions = slide.questions || [];
  const layout = calcItemLayout(questions.length);

  let curY = PAD;

  // accent bar (왼쪽)
  canvas.add(new F.Rect({ left: PAD, top: curY, width: 60, height: 4, fill: theme.accentColor, rx: 2, ry: 2, selectable: false, evented: false }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const tp = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: tp ? (tp.x / 100) * cardWidth : PAD, top: tp ? (tp.y / 100) * cardHeight : curY,
      originX: tp ? 'center' : 'left', originY: tp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: titleFs, fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800', fill: slide.titleColor || theme.titleColor,
      textAlign: slide.titleAlign || 'left', lineHeight: 1.25,
      name: OBJ.TITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 24;
  }

  // Q&A 카드들
  const areaBottom = cardHeight - 80;
  const totalGap = (questions.length - 1) * layout.gap;
  const cardH = Math.min((areaBottom - curY - totalGap) / Math.max(questions.length, 1), 200);
  const badgeSize = 44;
  const badgeR = 12;

  questions.forEach((qa, i) => {
    const cy = curY + i * (cardH + layout.gap);
    const contentW = cardWidth - PAD * 2;

    // 카드 배경
    canvas.add(new F.Rect({ left: PAD, top: cy, width: contentW, height: cardH, fill: innerBg, rx: 18, ry: 18, stroke: innerBorder, strokeWidth: 1, selectable: false, evented: false }));

    // Q 뱃지
    const qbX = PAD + 28 + badgeSize / 2;
    const qbY = cy + cardH * 0.3;
    canvas.add(new F.Rect({ left: qbX, top: qbY, width: badgeSize, height: badgeSize, fill: theme.accentColor, rx: badgeR, ry: badgeR, originX: 'center', originY: 'center', selectable: false, evented: false }));
    canvas.add(new F.Text('Q', { left: qbX, top: qbY, originX: 'center', originY: 'center', fontSize: 22, fontWeight: '900', fill: '#FFFFFF', selectable: false, evented: false }));

    // 질문 텍스트
    canvas.add(new F.Textbox(qa.q, {
      left: qbX + badgeSize / 2 + 16, top: qbY, originX: 'left', originY: 'center',
      width: contentW - badgeSize - 72, fontSize: 22, fontWeight: '800', fontFamily: fontName,
      fill: theme.titleColor, textAlign: 'left', lineHeight: 1.4,
      name: OBJ.ITEM_PREFIX + `qna_${i}`, splitByGrapheme: false, ...SELECTION_STYLE,
    }));

    // A 뱃지
    const abY = cy + cardH * 0.7;
    canvas.add(new F.Rect({ left: qbX, top: abY, width: badgeSize, height: badgeSize, fill: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', rx: badgeR, ry: badgeR, originX: 'center', originY: 'center', selectable: false, evented: false }));
    canvas.add(new F.Text('A', { left: qbX, top: abY, originX: 'center', originY: 'center', fontSize: 22, fontWeight: '900', fill: theme.accentColor, selectable: false, evented: false }));

    // 답변 텍스트
    canvas.add(new F.Textbox(qa.a, {
      left: qbX + badgeSize / 2 + 16, top: abY, originX: 'left', originY: 'center',
      width: contentW - badgeSize - 72, fontSize: 18, fontWeight: '400', fontFamily: fontName,
      fill: theme.bodyColor, textAlign: 'left', lineHeight: 1.65,
      selectable: false, evented: false,
    }));
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderTimelineToCanvas
// ══════════════════════════════════════════════════

export function renderTimelineToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const items = slide.timelineItems || [];
  const layout = calcItemLayout(items.length);

  let curY = PAD;

  // accent bar (왼쪽)
  canvas.add(new F.Rect({ left: PAD, top: curY, width: 60, height: 4, fill: theme.accentColor, rx: 2, ry: 2, selectable: false, evented: false }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const tp = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: tp ? (tp.x / 100) * cardWidth : PAD, top: tp ? (tp.y / 100) * cardHeight : curY,
      originX: tp ? 'center' : 'left', originY: tp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: titleFs, fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800', fill: slide.titleColor || theme.titleColor,
      textAlign: slide.titleAlign || 'left', lineHeight: 1.25,
      name: OBJ.TITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 24;
  }

  // 타임라인 영역
  const lineX = PAD + 24; // 세로선 x
  const contentLeft = PAD + 56; // 텍스트 시작 x
  const areaBottom = cardHeight - 80;
  const dotR = 14;

  // 세로선
  canvas.add(new F.Rect({
    left: lineX, top: curY, width: 4, height: areaBottom - curY,
    fill: theme.accentColor + '55', rx: 2, ry: 2,
    selectable: false, evented: false,
  }));

  // 각 시점
  const itemH = (areaBottom - curY) / Math.max(items.length, 1);

  items.forEach((item, i) => {
    const iy = curY + i * itemH;

    // dot
    canvas.add(new F.Circle({
      left: lineX + 2, top: iy + 14, radius: dotR, originX: 'center', originY: 'center',
      fill: theme.accentColor, stroke: theme.backgroundColor, strokeWidth: 4,
      selectable: false, evented: false,
    }));
    canvas.add(new F.Text(String(i + 1), {
      left: lineX + 2, top: iy + 14, originX: 'center', originY: 'center',
      fontSize: 13, fontWeight: '900', fill: '#FFFFFF', selectable: false, evented: false,
    }));

    // time 뱃지
    canvas.add(new F.Text(item.time, {
      left: contentLeft, top: iy + 4, originX: 'left', originY: 'top',
      fontSize: 14, fontWeight: '900', fill: theme.accentColor, charSpacing: 10,
      selectable: false, evented: false,
    }));

    // title
    canvas.add(new F.Textbox(item.title, {
      left: contentLeft, top: iy + 28, originX: 'left', originY: 'top',
      width: cardWidth - contentLeft - PAD, fontSize: layout.fontSize, fontWeight: '800', fontFamily: fontName,
      fill: theme.titleColor, textAlign: 'left', lineHeight: 1.3,
      name: OBJ.ITEM_PREFIX + `timeline_${i}`, splitByGrapheme: false, ...SELECTION_STYLE,
    }));

    // desc
    if (item.desc) {
      canvas.add(new F.Textbox(item.desc, {
        left: contentLeft, top: iy + 28 + layout.fontSize * 1.4 + 8,
        originX: 'left', originY: 'top', width: cardWidth - contentLeft - PAD,
        fontSize: layout.fontSize - 4, fontWeight: '400', fontFamily: fontName,
        fill: theme.bodyColor, textAlign: 'left', lineHeight: 1.55,
        selectable: false, evented: false,
      }));
    }
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderBeforeAfterToCanvas
// ══════════════════════════════════════════════════

export function renderBeforeAfterToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const innerBorder = getInnerCardBorder(isDarkTheme);

  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({ left: cardWidth / 2 - 30, top: curY, width: 60, height: 4, fill: theme.accentColor, rx: 2, ry: 2, selectable: false, evented: false }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const tp = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: tp ? (tp.x / 100) * cardWidth : cardWidth / 2, top: tp ? (tp.y / 100) * cardHeight : curY,
      originX: 'center', originY: tp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: titleFs, fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800', fill: slide.titleColor || theme.titleColor,
      textAlign: 'center', lineHeight: 1.25, name: OBJ.TITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 24;
  }

  const gap = 22;
  const colW = (cardWidth - PAD * 2 - gap) / 2;
  const areaBottom = cardHeight - 80;
  const colH = areaBottom - curY;

  const beforeItems = slide.beforeItems || [];
  const afterItems = slide.afterItems || [];

  // BEFORE 열
  const bx = PAD;
  canvas.add(new F.Rect({ left: bx, top: curY, width: colW, height: colH, fill: innerBg, rx: 20, ry: 20, stroke: innerBorder, strokeWidth: 1, selectable: false, evented: false }));
  canvas.add(new F.Text(slide.beforeLabel || 'BEFORE', {
    left: bx + colW / 2, top: curY + 32, originX: 'center', originY: 'center',
    fontSize: 18, fontWeight: '900', fill: theme.bodyColor, charSpacing: 40,
    selectable: false, evented: false,
  }));
  beforeItems.forEach((item, i) => {
    const iy = curY + 64 + i * 40;
    canvas.add(new F.Text('\u2022', { left: bx + 26, top: iy, originX: 'left', originY: 'top', fontSize: 20, fill: theme.bodyColor, selectable: false, evented: false }));
    canvas.add(new F.Textbox(item, {
      left: bx + 46, top: iy, originX: 'left', originY: 'top', width: colW - 72,
      fontSize: 20, fontWeight: '400', fontFamily: fontName, fill: theme.bodyColor,
      textAlign: 'left', lineHeight: 1.5,
      name: OBJ.ITEM_PREFIX + `check_${i}`, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
  });

  // AFTER 열
  const ax = PAD + colW + gap;
  canvas.add(new F.Rect({ left: ax, top: curY, width: colW, height: colH, fill: theme.accentColor + '1F', rx: 20, ry: 20, stroke: theme.accentColor, strokeWidth: 2, selectable: false, evented: false }));
  canvas.add(new F.Text(slide.afterLabel || 'AFTER', {
    left: ax + colW / 2, top: curY + 32, originX: 'center', originY: 'center',
    fontSize: 18, fontWeight: '900', fill: theme.accentColor, charSpacing: 40,
    selectable: false, evented: false,
  }));
  afterItems.forEach((item, i) => {
    const iy = curY + 64 + i * 40;
    canvas.add(new F.Text('\u2713', { left: ax + 26, top: iy, originX: 'left', originY: 'top', fontSize: 20, fontWeight: '700', fill: theme.accentColor, selectable: false, evented: false }));
    canvas.add(new F.Textbox(item, {
      left: ax + 46, top: iy, originX: 'left', originY: 'top', width: colW - 72,
      fontSize: 20, fontWeight: '700', fontFamily: fontName, fill: theme.titleColor,
      textAlign: 'left', lineHeight: 1.5, selectable: false, evented: false,
    }));
  });

  // 중앙 화살표
  const arrowY = curY + colH / 2;
  canvas.add(new F.Circle({ left: cardWidth / 2, top: arrowY, radius: 22, fill: theme.accentColor, originX: 'center', originY: 'center',
    shadow: new F.Shadow({ color: theme.accentColor + '44', blur: 12, offsetX: 0, offsetY: 4 }), selectable: false, evented: false }));
  canvas.add(new F.Text(slide.baArrowIcon || '\u2192', { left: cardWidth / 2, top: arrowY, originX: 'center', originY: 'center', fontSize: 20, fontWeight: '900', fill: '#FFFFFF', selectable: false, evented: false }));

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderProsConsToCanvas
// ══════════════════════════════════════════════════

export function renderProsConsToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const pros = slide.pros || [];
  const cons = slide.cons || [];
  const layout = calcItemLayout(Math.max(pros.length, cons.length));

  const GREEN = '#34D399';
  const RED = '#EF4444';

  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({ left: cardWidth / 2 - 30, top: curY, width: 60, height: 4, fill: theme.accentColor, rx: 2, ry: 2, selectable: false, evented: false }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const tp = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: tp ? (tp.x / 100) * cardWidth : cardWidth / 2, top: tp ? (tp.y / 100) * cardHeight : curY,
      originX: 'center', originY: tp ? 'center' : 'top', width: cardWidth - PAD * 2,
      fontSize: titleFs, fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800', fill: slide.titleColor || theme.titleColor,
      textAlign: 'center', lineHeight: 1.25, name: OBJ.TITLE, splitByGrapheme: false, ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 24;
  }

  const gap = 20;
  const colW = (cardWidth - PAD * 2 - gap) / 2;
  const areaBottom = cardHeight - 80;
  const colH = areaBottom - curY;
  const circleSize = 56;

  // Helper: 열 렌더
  const renderCol = (x: number, color: string, icon: string, label: string, items: string[], keyPrefix: string) => {
    // 배경
    canvas.add(new F.Rect({ left: x, top: curY, width: colW, height: colH, fill: color + '24', rx: 20, ry: 20, stroke: color + '73', strokeWidth: 2, selectable: false, evented: false }));

    // 아이콘 원
    canvas.add(new F.Circle({ left: x + colW / 2, top: curY + 28 + circleSize / 2, radius: circleSize / 2, fill: color, originX: 'center', originY: 'center', selectable: false, evented: false }));
    canvas.add(new F.Text(icon, { left: x + colW / 2, top: curY + 28 + circleSize / 2, originX: 'center', originY: 'center', fontSize: 28, fontWeight: '900', fill: '#FFFFFF', selectable: false, evented: false }));

    // 라벨
    canvas.add(new F.Text(label, { left: x + colW / 2, top: curY + 28 + circleSize + 16, originX: 'center', originY: 'top', fontSize: 18, fontWeight: '900', fill: color, selectable: false, evented: false }));

    // 구분선
    const lineY = curY + 28 + circleSize + 44;
    canvas.add(new F.Rect({ left: x + 24, top: lineY, width: colW - 48, height: 2, fill: color + '4D', selectable: false, evented: false }));

    // 아이템
    const itemStartY = lineY + 16;
    const marker = keyPrefix === 'pro' ? '\u25CB' : '\u2715';
    items.forEach((item, i) => {
      const iy = itemStartY + i * (layout.fontSize + layout.gap);
      canvas.add(new F.Text(marker, { left: x + 24, top: iy, originX: 'left', originY: 'top', fontSize: layout.fontSize, fontWeight: '900', fill: color, selectable: false, evented: false }));
      canvas.add(new F.Textbox(item, {
        left: x + 48, top: iy, originX: 'left', originY: 'top', width: colW - 72,
        fontSize: layout.fontSize, fontWeight: '500', fontFamily: fontName, fill: theme.titleColor,
        textAlign: 'left', lineHeight: 1.5,
        name: OBJ.ITEM_PREFIX + `${keyPrefix}_${i}`, splitByGrapheme: false, ...SELECTION_STYLE,
      }));
    });
  };

  renderCol(PAD, GREEN, slide.prosIcon || 'O', slide.prosLabel || '장점', pros, 'pro');
  renderCol(PAD + colW + gap, RED, slide.consIcon || 'X', slide.consLabel || '주의점', cons, 'con');

  addHospitalFooter(ctx);
}
// ══════════════════════════════════════════════════
// renderPriceTableToCanvas
// ══════════════════════════════════════════════════

export function renderPriceTableToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const GAP = 3;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const altBg = isDarkTheme ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const items = slide.priceItems || [];

  let curY = PAD;

  // accent bar (중앙)
  canvas.add(new F.Rect({
    left: cardWidth / 2 - 30, top: curY, width: 60, height: 4,
    fill: theme.accentColor, rx: 2, ry: 2,
    selectable: false, evented: false,
  }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : cardWidth / 2,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: 'center',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: 'center',
      lineHeight: 1.25,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }

  curY += 24;

  // 테이블 영역
  const tableTop = curY;
  const tableBottom = cardHeight - 80;
  const tableW = cardWidth - PAD * 2;
  const nameColW = tableW * 0.58;  // 1.4fr
  const priceColW = tableW * 0.42; // 1fr (가격+비고)
  const headerH = 60;
  const rowCount = items.length;
  const rowH = Math.min(80, (tableBottom - tableTop - headerH - GAP * rowCount) / Math.max(rowCount, 1));

  // 헤더: 시술 항목
  canvas.add(new F.Rect({
    left: PAD, top: tableTop, width: nameColW - GAP / 2, height: headerH,
    fill: theme.accentColor, selectable: false, evented: false,
  }));
  canvas.add(new F.Text('💊 시술 항목', {
    left: PAD + (nameColW - GAP / 2) / 2, top: tableTop + headerH / 2,
    originX: 'center', originY: 'center',
    fontSize: 22, fontWeight: '900', fill: '#FFFFFF', fontFamily: fontName,
    selectable: false, evented: false,
  }));

  // 헤더: 예상 비용
  canvas.add(new F.Rect({
    left: PAD + nameColW + GAP / 2, top: tableTop, width: priceColW - GAP / 2, height: headerH,
    fill: theme.accentColor, selectable: false, evented: false,
  }));
  canvas.add(new F.Text('💰 예상 비용', {
    left: PAD + nameColW + GAP / 2 + (priceColW - GAP / 2) / 2, top: tableTop + headerH / 2,
    originX: 'center', originY: 'center',
    fontSize: 22, fontWeight: '900', fill: '#FFFFFF', fontFamily: fontName,
    selectable: false, evented: false,
  }));

  // 데이터 행
  items.forEach((item, i) => {
    const ry = tableTop + headerH + GAP + i * (rowH + GAP);
    const bg = i % 2 === 0 ? innerBg : altBg;

    // 항목명 셀
    canvas.add(new F.Rect({
      left: PAD, top: ry, width: nameColW - GAP / 2, height: rowH,
      fill: bg, selectable: false, evented: false,
    }));
    canvas.add(new F.Textbox(item.name, {
      left: PAD + (nameColW - GAP / 2) / 2, top: ry + rowH / 2,
      originX: 'center', originY: 'center',
      width: nameColW - 40,
      fontSize: 20, fontWeight: '700', fontFamily: fontName,
      fill: theme.titleColor, textAlign: 'center',
      name: OBJ.ITEM_PREFIX + `price_${i}`,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));

    // 가격 셀
    const priceLeft = PAD + nameColW + GAP / 2;
    canvas.add(new F.Rect({
      left: priceLeft, top: ry, width: priceColW - GAP / 2, height: rowH,
      fill: bg, selectable: false, evented: false,
    }));
    canvas.add(new F.Text(item.price, {
      left: priceLeft + (priceColW - GAP / 2) / 2,
      top: item.note ? ry + rowH / 2 - 10 : ry + rowH / 2,
      originX: 'center', originY: 'center',
      fontSize: 24, fontWeight: '900', fontFamily: fontName,
      fill: theme.accentColor,
      selectable: false, evented: false,
    }));

    // 비고
    if (item.note) {
      canvas.add(new F.Text(item.note, {
        left: priceLeft + (priceColW - GAP / 2) / 2,
        top: ry + rowH / 2 + 12,
        originX: 'center', originY: 'center',
        fontSize: 13, fontWeight: '500', fontFamily: fontName,
        fill: theme.bodyColor,
        selectable: false, evented: false,
      }));
    }
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderWarningToCanvas
// ══════════════════════════════════════════════════

export function renderWarningToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const items = slide.warningItems || [];
  const layout = calcItemLayout(items.length);

  // 빨간 상단 바
  canvas.add(new F.Rect({
    left: 0, top: 0, width: cardWidth, height: 8,
    fill: '#EF4444',
    selectable: false, evented: false,
  }));

  let curY = PAD + 16;

  // ⚠️ 아이콘
  canvas.add(new F.Text('⚠️', {
    left: cardWidth / 2, top: curY,
    originX: 'center', originY: 'top',
    fontSize: 80,
    selectable: false, evented: false,
  }));
  curY += 100;

  // 경고 제목
  const warnTitle = slide.warningTitle || slide.title;
  if (warnTitle) {
    const titleFs = slide.titleFontSize || calcTitleSize(warnTitle, 52, 36);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(warnTitle, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : cardWidth / 2,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: 'center',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: '900',
      fill: theme.accentColor,
      textAlign: 'center',
      lineHeight: 1.25,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 24;
  }

  // 경고 아이템
  const itemAreaBottom = cardHeight - 80;
  const itemH = layout.padding * 2 + layout.fontSize;
  const totalH = items.length * itemH + (items.length - 1) * layout.gap;
  const startY = Math.max(curY, (curY + itemAreaBottom) / 2 - totalH / 2);
  const itemW = cardWidth - PAD * 2;

  items.forEach((item, i) => {
    const iy = startY + i * (itemH + layout.gap);

    // 아이템 배경 (빨간 투명)
    canvas.add(new F.Rect({
      left: PAD, top: iy, width: itemW, height: itemH,
      fill: 'rgba(239,68,68,0.14)', rx: 16, ry: 16,
      selectable: false, evented: false,
    }));

    // 왼쪽 accent 보더
    canvas.add(new F.Rect({
      left: PAD, top: iy, width: 6, height: itemH,
      fill: '#F87171', rx: 3, ry: 3,
      selectable: false, evented: false,
    }));

    // ❗ 마커
    canvas.add(new F.Text('❗', {
      left: PAD + 36, top: iy + itemH / 2,
      originX: 'center', originY: 'center',
      fontSize: 24, fontWeight: '900', fill: '#F87171',
      selectable: false, evented: false,
    }));

    // 텍스트
    canvas.add(new F.Textbox(item, {
      left: PAD + 64,
      top: iy + itemH / 2,
      originX: 'left',
      originY: 'center',
      width: itemW - 100,
      fontSize: layout.fontSize,
      fontFamily: fontName,
      fontWeight: '600',
      fill: theme.titleColor,
      textAlign: 'left',
      lineHeight: 1.5,
      name: OBJ.ITEM_PREFIX + `warn_${i}`,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderQuoteToCanvas
// ══════════════════════════════════════════════════

export function renderQuoteToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const fontName = resolveFontName(theme, slide.fontId);
  const quoteText = slide.quoteText || slide.body || '';

  // 배경 장식 원
  canvas.add(new F.Circle({
    left: cardWidth / 2, top: cardHeight / 2,
    originX: 'center', originY: 'center',
    radius: 150,
    fill: `${theme.accentColor}08`,
    selectable: false, evented: false,
  }));

  // 여는 따옴표
  canvas.add(new F.Text('\u201C', {
    left: cardWidth / 2, top: cardHeight * 0.2,
    originX: 'center', originY: 'center',
    fontSize: 140,
    fontFamily: 'Georgia, serif',
    fill: theme.accentColor,
    opacity: 0.35,
    selectable: false, evented: false,
  }));

  // 인용문
  if (quoteText) {
    const quoteFs = calcTitleSize(quoteText, 28, 20);
    canvas.add(new F.Textbox(quoteText, {
      left: cardWidth / 2,
      top: cardHeight * 0.46,
      originX: 'center',
      originY: 'center',
      width: cardWidth * 0.85,
      fontSize: quoteFs,
      fontFamily: fontName,
      fontWeight: '700',
      fontStyle: 'italic',
      fill: theme.titleColor,
      textAlign: 'center',
      lineHeight: 1.6,
      charSpacing: -10,
      name: OBJ.BODY,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));

    // 인용문 하단 구분선
    canvas.add(new F.Rect({
      left: cardWidth / 2 - cardWidth * 0.15,
      top: cardHeight * 0.58,
      width: cardWidth * 0.3,
      height: 3,
      fill: `${theme.accentColor}40`,
      rx: 2, ry: 2,
      selectable: false, evented: false,
    }));
  }

  // 저자
  let authorY = cardHeight * 0.66;
  if (slide.quoteAuthor) {
    canvas.add(new F.Text(`— ${slide.quoteAuthor}`, {
      left: cardWidth / 2,
      top: authorY,
      originX: 'center', originY: 'center',
      fontSize: 24,
      fontFamily: fontName,
      fontWeight: '900',
      fill: theme.accentColor,
      selectable: false, evented: false,
    }));
    authorY += 36;
  }

  // 역할
  if (slide.quoteRole) {
    canvas.add(new F.Text(slide.quoteRole, {
      left: cardWidth / 2,
      top: authorY,
      originX: 'center', originY: 'center',
      fontSize: 18,
      fontFamily: fontName,
      fontWeight: '500',
      fill: theme.bodyColor,
      selectable: false, evented: false,
    }));
  }

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderNumberedListToCanvas
// ══════════════════════════════════════════════════

export function renderNumberedListToCanvas(ctx: CanvasLayoutContext): void {
  const { F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const PAD = 64;
  const fontName = resolveFontName(theme, slide.fontId);
  const innerBg = getInnerCardBg(isDarkTheme);
  const innerBorder = getInnerCardBorder(isDarkTheme);
  const items = slide.numberedItems || [];
  const layout = calcItemLayout(items.length);

  let curY = PAD;

  // accent bar (왼쪽)
  canvas.add(new F.Rect({
    left: PAD, top: curY, width: 60, height: 4,
    fill: theme.accentColor, rx: 2, ry: 2,
    selectable: false, evented: false,
  }));
  curY += 20;

  // 제목
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 52, 36);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : PAD,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: titlePos ? 'center' : 'left',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth - PAD * 2,
      fontSize: titleFs,
      fontFamily: resolveFontName(theme, slide.titleFontId || slide.fontId),
      fontWeight: slide.titleFontWeight || '800',
      fill: slide.titleColor || theme.titleColor,
      textAlign: slide.titleAlign || 'left',
      lineHeight: 1.25,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3;
  }

  curY += 24;

  // 아이템 영역
  const areaBottom = cardHeight - 80;
  const itemH = layout.padding * 2 + layout.fontSize;
  const totalH = items.length * itemH + (items.length - 1) * layout.gap;
  const startY = Math.max(curY, (curY + areaBottom) / 2 - totalH / 2);
  const itemW = cardWidth - PAD * 2;
  const numSize = 60;

  items.forEach((item, i) => {
    const iy = startY + i * (itemH + layout.gap);

    // 연결선 (마지막 제외)
    if (i < items.length - 1) {
      canvas.add(new F.Rect({
        left: PAD + numSize / 2 + 14 - 1.5,
        top: iy + itemH,
        width: 3,
        height: layout.gap + 4,
        fill: `${theme.accentColor}30`,
        selectable: false, evented: false,
      }));
    }

    // 아이템 배경
    canvas.add(new F.Rect({
      left: PAD, top: iy, width: itemW, height: itemH,
      fill: innerBg, rx: 18, ry: 18,
      stroke: innerBorder, strokeWidth: 1,
      selectable: false, evented: false,
    }));

    // 번호 (rounded rect)
    const numLeft = PAD + 14;
    const numTop = iy + (itemH - numSize) / 2;
    canvas.add(new F.Rect({
      left: numLeft, top: numTop, width: numSize, height: numSize,
      fill: theme.accentColor, rx: 16, ry: 16,
      shadow: new F.Shadow({ color: theme.accentColor + '44', blur: 24, offsetX: 0, offsetY: 8 }),
      selectable: false, evented: false,
    }));
    canvas.add(new F.Text(item.num || String(i + 1).padStart(2, '0'), {
      left: numLeft + numSize / 2, top: numTop + numSize / 2,
      originX: 'center', originY: 'center',
      fontSize: 26, fontWeight: '900', fill: '#FFFFFF',
      selectable: false, evented: false,
    }));

    // title 텍스트
    const textLeft = numLeft + numSize + 24;
    const textW = itemW - (numLeft - PAD) - numSize - 48;
    const hasDesc = !!item.desc;

    canvas.add(new F.Textbox(item.title, {
      left: textLeft,
      top: hasDesc ? iy + itemH / 2 - 12 : iy + itemH / 2,
      originX: 'left',
      originY: 'center',
      width: textW,
      fontSize: layout.fontSize,
      fontFamily: fontName,
      fontWeight: '800',
      fill: theme.titleColor,
      textAlign: 'left',
      lineHeight: 1.3,
      name: OBJ.ITEM_PREFIX + `num_${i}`,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));

    // desc
    if (item.desc) {
      canvas.add(new F.Textbox(item.desc, {
        left: textLeft,
        top: iy + itemH / 2 + 10,
        originX: 'left',
        originY: 'top',
        width: textW,
        fontSize: layout.fontSize - 4,
        fontFamily: fontName,
        fontWeight: '400',
        fill: theme.bodyColor,
        textAlign: 'left',
        lineHeight: 1.5,
        selectable: false, evented: false,
      }));
    }
  });

  addHospitalFooter(ctx);
}

// ══════════════════════════════════════════════════
// renderClosingToCanvas
// ══════════════════════════════════════════════════

export function renderClosingToCanvas(ctx: CanvasLayoutContext): void {
  const { slide } = ctx;
  // 커버 템플릿이 있으면 커버와 동일하게 렌더
  const tmpl = slide.coverTemplateId
    ? COVER_TEMPLATES.find(t => t.id === slide.coverTemplateId)
    : null;
  if (tmpl) {
    renderCoverFromTemplateToCanvas(ctx, tmpl);
    return;
  }

  const { F, canvas, theme, cardWidth, cardHeight, isDarkTheme } = ctx;
  const fontName = resolveFontName(theme, slide.titleFontId || slide.fontId);
  const centerX = cardWidth / 2;
  let curY = cardHeight * 0.3;

  // accent bar (중앙)
  canvas.add(new F.Rect({
    left: centerX - 36, top: curY, width: 72, height: 5,
    fill: theme.accentColor, rx: 3, ry: 3,
    selectable: false, evented: false,
  }));
  curY += 40;

  // 부제 (pill badge 형태)
  if (slide.subtitle) {
    const subPos = slide.subtitlePosition;
    const subText = slide.subtitle;
    const subW = Math.min(subText.length * 22 + 48, cardWidth * 0.7);
    const subH = 48;
    const sx = subPos ? (subPos.x / 100) * cardWidth : centerX;
    const sy = subPos ? (subPos.y / 100) * cardHeight : curY;

    // pill 배경
    canvas.add(new F.Rect({
      left: sx - subW / 2, top: sy - subH / 2, width: subW, height: subH,
      fill: `${theme.accentColor}22`, rx: subH / 2, ry: subH / 2,
      selectable: false, evented: false,
    }));
    canvas.add(new F.Textbox(subText, {
      left: sx, top: sy,
      originX: 'center', originY: 'center',
      width: subW - 20,
      fontSize: slide.subtitleFontSize || 22,
      fontFamily: resolveFontName(theme, slide.subtitleFontId || slide.fontId),
      fontWeight: '800',
      fill: theme.accentColor,
      textAlign: 'center',
      charSpacing: 2,
      name: OBJ.SUBTITLE,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += subH + 24;
  }

  // 제목 (감사/마무리 메시지)
  if (slide.title) {
    const titleFs = slide.titleFontSize || calcTitleSize(slide.title, 64, 42);
    const titlePos = slide.titlePosition;
    canvas.add(new F.Textbox(slide.title, {
      left: titlePos ? (titlePos.x / 100) * cardWidth : centerX,
      top: titlePos ? (titlePos.y / 100) * cardHeight : curY,
      originX: 'center',
      originY: titlePos ? 'center' : 'top',
      width: cardWidth * 0.9,
      fontSize: titleFs,
      fontFamily: fontName,
      fontWeight: slide.titleFontWeight || '900',
      fill: slide.titleColor || theme.titleColor,
      textAlign: 'center',
      lineHeight: slide.titleLineHeight || 1.25,
      charSpacing: (slide.titleLetterSpacing || -0.4) * 10,
      name: OBJ.TITLE,
      splitByGrapheme: false,
      shadow: isDarkTheme ? new F.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 24, offsetX: 0, offsetY: 2 }) : undefined,
      ...SELECTION_STYLE,
    }));
    curY += titleFs * 1.3 + 16;
  }

  // 본문
  if (slide.body) {
    canvas.add(new F.Textbox(slide.body, {
      left: centerX, top: curY,
      originX: 'center', originY: 'top',
      width: cardWidth * 0.8,
      fontSize: 20,
      fontFamily: resolveFontName(theme, slide.fontId),
      fontWeight: '400',
      fill: theme.bodyColor,
      textAlign: 'center',
      lineHeight: 1.7,
      name: OBJ.BODY,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
    curY += 60;
  }

  // 병원명 강조
  if (theme.hospitalName) {
    const hospY = Math.max(curY + 12, cardHeight * 0.72);

    // 상단 구분선
    canvas.add(new F.Rect({
      left: centerX - 60, top: hospY - 16,
      width: 120, height: 3,
      fill: theme.accentColor,
      rx: 2, ry: 2,
      selectable: false, evented: false,
    }));

    canvas.add(new F.Textbox(theme.hospitalName, {
      left: centerX, top: hospY + 10,
      originX: 'center', originY: 'top',
      width: cardWidth * 0.6,
      fontSize: 24,
      fontFamily: fontName,
      fontWeight: '800',
      fill: theme.titleColor,
      textAlign: 'center',
      charSpacing: 40,
      name: OBJ.HOSPITAL,
      splitByGrapheme: false,
      ...SELECTION_STYLE,
    }));
  }
}
