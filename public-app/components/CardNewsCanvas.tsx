'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { SlideData, SlideDecoration, CardNewsTheme } from '../lib/cardNewsLayouts';
import { CARD_FONTS, getCardFont } from '../lib/cardNewsLayouts';
import type { CardTemplate } from '../lib/cardTemplateService';
import type { DesignPresetStyle } from '../lib/cardNewsLayouts';

interface Props {
  slide: SlideData;
  theme: CardNewsTheme;
  cardRatio?: '1:1' | '3:4' | '4:5' | '9:16' | '16:9';
  learnedTemplate?: CardTemplate | null;
  presetStyle?: DesignPresetStyle | null;
  maxWidth?: number;
  /** 캔버스에서 오브젝트 수정 시 SlideData 업데이트 콜백 */
  onSlideChange?: (patch: Partial<SlideData>) => void;
}

// ── 디자인 엔진 헬퍼 (CardNewsProRenderer와 동일 로직) ──

function calcTitleSize(text: string, maxSize = 52, minSize = 36): number {
  const len = (text || '').length;
  if (len <= 10) return maxSize;
  if (len <= 15) return Math.min(maxSize, 56);
  if (len <= 20) return Math.min(maxSize, 48);
  if (len <= 30) return Math.min(maxSize, 42);
  return minSize;
}

function calcBodySize(text: string): { fontSize: number; lineHeight: number } {
  const charCount = (text || '').length;
  if (charCount <= 50) return { fontSize: 22, lineHeight: 1.7 };
  if (charCount <= 100) return { fontSize: 20, lineHeight: 1.7 };
  if (charCount <= 200) return { fontSize: 18, lineHeight: 1.65 };
  return { fontSize: 16, lineHeight: 1.6 };
}

function calcItemLayout(itemCount: number) {
  if (itemCount <= 2) return { gap: 24, fontSize: 20 };
  if (itemCount <= 3) return { gap: 20, fontSize: 19 };
  if (itemCount <= 4) return { gap: 16, fontSize: 18 };
  if (itemCount <= 5) return { gap: 12, fontSize: 17 };
  return { gap: 10, fontSize: 16 };
}

/** 오브젝트 이름(name) 상수 — fabric 오브젝트 식별용 */
const OBJ = {
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

export default function CardNewsCanvas({
  slide,
  theme,
  cardRatio = '1:1',
  learnedTemplate,
  presetStyle,
  maxWidth = 650,
  onSlideChange,
}: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);
  // 내부 변경 중이면 props 변화에 의한 재렌더 무시
  const internalChangeRef = useRef(false);
  // 직전 slide JSON → 변경 감지
  const prevSlideJsonRef = useRef('');

  const cardWidth = 1080;
  const cardHeight = (() => {
    switch (cardRatio) {
      case '3:4': return 1440;
      case '4:5': return 1350;
      case '9:16': return 1920;
      case '16:9': return 608;
      default: return 1080;
    }
  })();

  const displayScale = Math.min(1, maxWidth / cardWidth);
  const displayWidth = Math.round(cardWidth * displayScale);
  const displayHeight = Math.round(cardHeight * displayScale);

  const lt = learnedTemplate || null;

  const isDarkTheme = (() => {
    const hex = theme.backgroundColor.replace('#', '');
    if (hex.length !== 6) return true;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  })();

  /** 폰트 family 문자열 계산 */
  const getFontFamily = useCallback((fontId?: string): string => {
    if (!fontId) {
      if (theme.fontId) return getCardFont(theme.fontId).family;
      return theme.fontFamily;
    }
    const font = CARD_FONTS.find(f => f.id === fontId);
    return font ? font.family : getCardFont(theme.fontId).family;
  }, [theme.fontId, theme.fontFamily]);

  /** CSS font-family → fabric에 쓸 첫 번째 폰트명 추출 */
  const extractFontName = useCallback((cssFamily: string): string => {
    const m = cssFamily.match(/'([^']+)'/);
    return m ? m[1] : cssFamily.split(',')[0].trim();
  }, []);

  // ── CSS 그라데이션 파싱 ──
  const parseGradientStops = useCallback((gradientCSS: string) => {
    const match = gradientCSS.match(/linear-gradient\([^,]+,\s*(.+)\)/);
    if (!match) return [];
    const stops: { color: string; offset: number }[] = [];
    match[1].split(',').map(s => s.trim()).forEach(part => {
      const m = part.match(/^(.+?)\s+([\d.]+)%$/);
      if (m) stops.push({ color: m[1], offset: parseFloat(m[2]) / 100 });
      else stops.push({ color: part, offset: stops.length === 0 ? 0 : 1 });
    });
    return stops;
  }, []);

  // ── 공통 선택 스타일 (파란 테두리 + 리사이즈 핸들) ──
  const SELECTION_STYLE = {
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
  // 캔버스 빌드
  // ══════════════════════════════════════════════════

  useEffect(() => {
    const slideJson = JSON.stringify(slide);
    // 내부 변경에 의한 리렌더면 스킵
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      prevSlideJsonRef.current = slideJson;
      return;
    }
    prevSlideJsonRef.current = slideJson;

    let disposed = false;

    const build = async () => {
      const F = await import('fabric');
      if (disposed || !canvasElRef.current) return;

      // 이전 캔버스 정리
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }

      const canvas = new F.Canvas(canvasElRef.current, {
        width: cardWidth,
        height: cardHeight,
        selection: true,
        renderOnAddRemove: false,
      });
      if (disposed) { canvas.dispose(); return; }
      fabricRef.current = canvas;

      // ── 유틸: fabric Gradient 생성 ──
      const makeFabricGradient = (css: string, w: number, h: number) => {
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
      };

      // ════════ 1. 배경 ════════
      const learnedBg = lt?.backgroundStyle?.gradient || lt?.colors?.backgroundGradient;
      const bgSrc = learnedBg || theme.backgroundGradient || theme.backgroundColor;
      const bgRect = new F.Rect({
        left: 0, top: 0, width: cardWidth, height: cardHeight,
        selectable: false, evented: false, name: OBJ.BG,
      });
      if (bgSrc.includes('linear-gradient')) {
        const grad = makeFabricGradient(bgSrc, cardWidth, cardHeight);
        if (grad) bgRect.set('fill', grad);
        else bgRect.set('fill', theme.backgroundColor);
      } else {
        bgRect.set('fill', bgSrc);
      }
      canvas.add(bgRect);

      // ════════ 2. 패턴 장식 ════════
      const ptn = presetStyle?.backgroundPattern || 'herringbone';
      if (ptn !== 'none') {
        const ptnOp = presetStyle?.patternOpacity ?? (isDarkTheme ? 0.02 : 0.015);
        const pc = isDarkTheme ? `rgba(255,255,255,${ptnOp})` : `rgba(0,0,0,${ptnOp})`;
        const pCanvas = document.createElement('canvas');
        const ctx = pCanvas.getContext('2d');
        if (ctx) {
          if (ptn === 'dots') {
            pCanvas.width = 20; pCanvas.height = 20;
            ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(10, 10, 1, 0, Math.PI * 2); ctx.fill();
          } else if (ptn === 'lines') {
            pCanvas.width = 21; pCanvas.height = 21;
            ctx.strokeStyle = pc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(21, 20); ctx.stroke();
          } else if (ptn === 'diamond') {
            pCanvas.width = 32; pCanvas.height = 32;
            ctx.fillStyle = pc; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(32, 16); ctx.lineTo(16, 32); ctx.lineTo(0, 16); ctx.closePath(); ctx.fill();
          } else {
            pCanvas.width = 28; pCanvas.height = 28;
            ctx.strokeStyle = pc; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(14, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(14, 28); ctx.lineTo(28, 14); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(28, 14); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(14, 28); ctx.stroke();
          }
          const pRect = new F.Rect({
            left: 0, top: 0, width: cardWidth, height: cardHeight,
            selectable: false, evented: false, name: OBJ.PATTERN,
          });
          pRect.set('fill', new F.Pattern({ source: pCanvas, repeat: 'repeat' }));
          canvas.add(pRect);
        }
      }

      // ════════ 3. Accent bars ════════
      if (!lt) {
        const topH = presetStyle?.topBarHeight ?? 8;
        const botH = presetStyle?.bottomBarHeight ?? 4;
        if (topH > 0) {
          const tb = new F.Rect({ left: 0, top: 0, width: cardWidth, height: topH, selectable: false, evented: false, name: OBJ.ACCENT_TOP });
          tb.set('fill', new F.Gradient({
            type: 'linear', coords: { x1: 0, y1: 0, x2: cardWidth, y2: 0 },
            colorStops: [{ offset: 0, color: theme.accentColor }, { offset: 0.6, color: theme.accentColor + '80' }, { offset: 1, color: 'rgba(0,0,0,0)' }],
          }));
          canvas.add(tb);
        }
        if (botH > 0) {
          const bb = new F.Rect({ left: 0, top: cardHeight - botH, width: cardWidth, height: botH, selectable: false, evented: false, name: OBJ.ACCENT_BOT });
          bb.set('fill', new F.Gradient({
            type: 'linear', coords: { x1: 0, y1: 0, x2: cardWidth, y2: 0 },
            colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 0.4, color: theme.accentColor + '50' }, { offset: 1, color: theme.accentColor }],
          }));
          canvas.add(bb);
        }
      }

      // ════════ 4. 슬라이드 이미지 ════════
      if (slide.imageUrl) {
        try {
          const fImg = await F.FabricImage.fromURL(slide.imageUrl, { crossOrigin: 'anonymous' });
          const pos = slide.imagePosition || 'top';
          if (pos === 'background') {
            fImg.set({
              left: 0, top: 0, originX: 'left', originY: 'top',
              scaleX: cardWidth / (fImg.width || 1),
              scaleY: cardHeight / (fImg.height || 1),
              selectable: false, evented: false, name: OBJ.IMAGE,
            });
            canvas.add(fImg);
            // 반투명 오버레이
            const overlay = new F.Rect({
              left: 0, top: 0, width: cardWidth, height: cardHeight,
              fill: theme.backgroundColor + 'CC',
              selectable: false, evented: false,
            });
            canvas.add(overlay);
          } else {
            // top/center/bottom — 드래그+리사이즈 가능
            const maxImgW = cardWidth * 0.8;
            const maxImgH = cardHeight * 0.35;
            const imgScale = Math.min(maxImgW / (fImg.width || 1), maxImgH / (fImg.height || 1), 1);
            const focal = slide.imageFocalPoint || { x: 50, y: pos === 'top' ? 25 : pos === 'bottom' ? 75 : 50 };
            fImg.set({
              left: (focal.x / 100) * cardWidth,
              top: (focal.y / 100) * cardHeight,
              originX: 'center', originY: 'center',
              scaleX: imgScale, scaleY: imgScale,
              name: OBJ.IMAGE,
              ...SELECTION_STYLE,
            });
            canvas.add(fImg);
          }
        } catch { /* image load fail — skip */ }
      }

      // ════════ 5. 장식 요소 (decorations) ════════
      (slide.decorations || []).forEach(deco => {
        const left = (parseFloat(deco.position.left) / 100) * cardWidth;
        const top = (parseFloat(deco.position.top) / 100) * cardHeight;
        const name = OBJ.DECO_PREFIX + deco.id;
        const common = {
          left, top, originX: 'center' as const, originY: 'center' as const,
          fill: deco.color, opacity: deco.opacity, angle: deco.rotation,
          name, ...SELECTION_STYLE,
        };

        let obj: any = null;
        switch (deco.type) {
          case 'circle':
          case 'dots':
            obj = new F.Circle({ ...common, radius: deco.size / 2 });
            break;
          case 'line':
          case 'wave':
            obj = new F.Rect({ ...common, width: deco.size, height: 4, rx: 2, ry: 2 });
            break;
          case 'star':
            // 5각 별 근사 — Polygon
            obj = new F.Circle({ ...common, radius: deco.size / 2 });
            break;
          case 'arrow':
            obj = new F.Rect({ ...common, width: deco.size, height: deco.size * 0.3, rx: 4, ry: 4 });
            break;
          case 'badge':
            obj = new F.Rect({ ...common, width: deco.size, height: deco.size * 0.6, rx: deco.size * 0.3, ry: deco.size * 0.3 });
            break;
          case 'corner':
            obj = new F.Rect({ ...common, width: deco.size, height: deco.size, rx: 0, ry: 0 });
            break;
          default:
            obj = new F.Circle({ ...common, radius: deco.size / 2 });
        }
        if (obj) canvas.add(obj);
      });

      // ════════ 6. 병원 로고 ════════
      if (theme.hospitalLogo) {
        try {
          const logo = await F.FabricImage.fromURL(theme.hospitalLogo, { crossOrigin: 'anonymous' });
          const logoPos = slide.logoPosition || { x: 10, y: 8 };
          const logoScale = Math.min(80 / (logo.width || 1), 80 / (logo.height || 1), 1);
          logo.set({
            left: (logoPos.x / 100) * cardWidth,
            top: (logoPos.y / 100) * cardHeight,
            originX: 'center', originY: 'center',
            scaleX: logoScale, scaleY: logoScale,
            name: OBJ.LOGO,
            ...SELECTION_STYLE,
          });
          canvas.add(logo);
        } catch { /* skip */ }
      }

      // ════════ 7. 텍스트: 제목 ════════
      const titleFontFamily = extractFontName(getFontFamily(slide.titleFontId || slide.fontId));
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
          fontFamily: titleFontFamily,
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

      // ════════ 8. 텍스트: 부제 ════════
      if (slide.subtitle) {
        const subPos = slide.subtitlePosition || { x: 50, y: titlePos.y + 12 };
        const subFontFamily = extractFontName(getFontFamily(slide.subtitleFontId || slide.fontId));
        const subObj = new F.Textbox(slide.subtitle, {
          left: (subPos.x / 100) * cardWidth,
          top: (subPos.y / 100) * cardHeight,
          originX: 'center',
          originY: 'center',
          width: cardWidth * 0.8,
          fontSize: slide.subtitleFontSize || 22,
          fontFamily: subFontFamily,
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

      // ════════ 9. 텍스트: 본문 (body) ════════
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
          fontFamily: extractFontName(getFontFamily(slide.fontId)),
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

      // ════════ 10. 리스트 아이템 (checkItems / steps / icons / numberedItems / questions 등) ════════
      const items = getItemTexts(slide);
      if (items.length > 0) {
        const layout = calcItemLayout(items.length);
        const startY = 0.5; // 중간부터 시작 (제목 아래)
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
            fontFamily: extractFontName(getFontFamily(slide.fontId)),
            fontWeight: '500',
            fill: slide.bodyColor || theme.bodyColor,
            textAlign: 'left',
            lineHeight: 1.5,
            name: OBJ.ITEM_PREFIX + item.key,
            splitByGrapheme: true,
            ...SELECTION_STYLE,
          });
          // 아이템 앞 마커 (체크, 숫자 등)
          if (item.marker) {
            const marker = new F.Text(item.marker, {
              left: cardWidth * 0.07,
              top: Math.max(yPos, 200 + i * (layout.fontSize + layout.gap)),
              originX: 'center',
              originY: 'top',
              fontSize: layout.fontSize,
              fontWeight: '700',
              fill: theme.accentColor,
              selectable: false, evented: false,
            });
            canvas.add(marker);
          }
          canvas.add(itemObj);
        });
      }

      // ════════ 11. 병원명 텍스트 ════════
      if (theme.hospitalName) {
        const hospPos = slide.hospitalNamePosition || { x: 50, y: 92 };
        const hospObj = new F.Textbox(theme.hospitalName, {
          left: (hospPos.x / 100) * cardWidth,
          top: (hospPos.y / 100) * cardHeight,
          originX: 'center',
          originY: 'center',
          width: cardWidth * 0.5,
          fontSize: slide.hospitalFontSize || 18,
          fontFamily: extractFontName(getFontFamily(slide.fontId)),
          fontWeight: slide.hospitalFontWeight || '600',
          fill: slide.hospitalColor || theme.subtitleColor,
          textAlign: 'center',
          name: OBJ.HOSPITAL,
          splitByGrapheme: true,
          ...SELECTION_STYLE,
        });
        canvas.add(hospObj);
      }

      // ════════ 이벤트 핸들러 ════════

      // 드래그 이동 완료 시 SlideData 업데이트
      canvas.on('object:modified', (e: any) => {
        if (!onSlideChange || !e.target) return;
        const obj = e.target;
        const name: string = obj.name || '';

        internalChangeRef.current = true;

        // 위치를 % 로 변환
        const xPct = Math.round(((obj.left || 0) / cardWidth) * 100);
        const yPct = Math.round(((obj.top || 0) / cardHeight) * 100);

        if (name === OBJ.TITLE) {
          onSlideChange({ titlePosition: { x: xPct, y: yPct } });
        } else if (name === OBJ.SUBTITLE) {
          onSlideChange({ subtitlePosition: { x: xPct, y: yPct } });
        } else if (name === OBJ.HOSPITAL) {
          onSlideChange({ hospitalNamePosition: { x: xPct, y: yPct } });
        } else if (name === OBJ.IMAGE) {
          onSlideChange({ imageFocalPoint: { x: xPct, y: yPct } });
        } else if (name === OBJ.LOGO) {
          onSlideChange({ logoPosition: { x: xPct, y: yPct } });
        } else if (name.startsWith(OBJ.DECO_PREFIX)) {
          const decoId = name.slice(OBJ.DECO_PREFIX.length);
          const updatedDecos = (slide.decorations || []).map(d =>
            d.id === decoId
              ? { ...d, position: { top: `${yPct}%`, left: `${xPct}%` } }
              : d
          );
          onSlideChange({ decorations: updatedDecos });
        }
      });

      // 텍스트 편집 완료 시 SlideData 업데이트
      canvas.on('text:changed', (e: any) => {
        if (!onSlideChange || !e.target) return;
        const obj = e.target;
        const name: string = obj.name || '';
        const newText: string = obj.text || '';

        internalChangeRef.current = true;

        if (name === OBJ.TITLE) {
          onSlideChange({ title: newText });
        } else if (name === OBJ.SUBTITLE) {
          onSlideChange({ subtitle: newText });
        } else if (name === OBJ.BODY) {
          onSlideChange({ body: newText });
        } else if (name === OBJ.HOSPITAL && theme.hospitalName) {
          // 병원명은 theme 레벨이라 slide patch로는 안 됨 → 무시
        } else if (name.startsWith(OBJ.ITEM_PREFIX)) {
          const key = name.slice(OBJ.ITEM_PREFIX.length);
          const patch = buildItemPatch(slide, key, newText);
          if (patch) onSlideChange(patch);
        }
      });

      canvas.renderAll();
    };

    build();

    return () => {
      disposed = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slide, theme, cardRatio, lt, presetStyle,
    cardWidth, cardHeight, isDarkTheme,
  ]);

  return (
    <div
      style={{
        width: displayWidth,
        height: displayHeight,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}
    >
      <canvas
        ref={canvasElRef}
        style={{ width: displayWidth, height: displayHeight }}
      />
    </div>
  );
}

// ── 헬퍼: 슬라이드의 리스트 아이템을 통합 추출 ──

interface ItemText {
  key: string;       // "check_0", "step_1", "icon_2" 등
  text: string;
  marker?: string;   // "✓", "1", emoji 등
}

function getItemTexts(slide: SlideData): ItemText[] {
  const items: ItemText[] = [];

  if (slide.checkItems?.length) {
    slide.checkItems.forEach((t, i) => items.push({
      key: `check_${i}`, text: t, marker: slide.checkIcon || '✓',
    }));
  } else if (slide.steps?.length) {
    slide.steps.forEach((s, i) => items.push({
      key: `step_${i}`, text: s.desc ? `${s.label}\n${s.desc}` : s.label, marker: `${i + 1}`,
    }));
  } else if (slide.icons?.length) {
    slide.icons.forEach((ic, i) => items.push({
      key: `icon_${i}`, text: ic.desc ? `${ic.title}\n${ic.desc}` : ic.title, marker: ic.emoji,
    }));
  } else if (slide.numberedItems?.length) {
    slide.numberedItems.forEach((n, i) => items.push({
      key: `num_${i}`, text: n.desc ? `${n.title}\n${n.desc}` : n.title, marker: n.num || `${i + 1}`,
    }));
  } else if (slide.questions?.length) {
    slide.questions.forEach((q, i) => items.push({
      key: `qna_${i}`, text: `Q. ${q.q}\nA. ${q.a}`,
    }));
  } else if (slide.warningItems?.length) {
    slide.warningItems.forEach((w, i) => items.push({
      key: `warn_${i}`, text: w, marker: '⚠',
    }));
  } else if (slide.pros?.length || slide.cons?.length) {
    (slide.pros || []).forEach((p, i) => items.push({
      key: `pro_${i}`, text: p, marker: slide.prosIcon || 'O',
    }));
    (slide.cons || []).forEach((c, i) => items.push({
      key: `con_${i}`, text: c, marker: slide.consIcon || 'X',
    }));
  } else if (slide.priceItems?.length) {
    slide.priceItems.forEach((p, i) => items.push({
      key: `price_${i}`, text: `${p.name}  ${p.price}${p.note ? `  ${p.note}` : ''}`,
    }));
  } else if (slide.dataPoints?.length) {
    slide.dataPoints.forEach((d, i) => items.push({
      key: `data_${i}`, text: `${d.value}\n${d.label}`,
    }));
  } else if (slide.timelineItems?.length) {
    slide.timelineItems.forEach((t, i) => items.push({
      key: `timeline_${i}`, text: t.desc ? `${t.time} ${t.title}\n${t.desc}` : `${t.time} ${t.title}`,
    }));
  }

  return items;
}

// ── 헬퍼: 아이템 텍스트 변경 → SlideData patch 생성 ──

function buildItemPatch(slide: SlideData, key: string, newText: string): Partial<SlideData> | null {
  const [type, idxStr] = key.split('_');
  const idx = parseInt(idxStr);
  if (isNaN(idx)) return null;

  switch (type) {
    case 'check': {
      const items = [...(slide.checkItems || [])];
      items[idx] = newText;
      return { checkItems: items };
    }
    case 'step': {
      const items = [...(slide.steps || [])];
      const lines = newText.split('\n');
      items[idx] = { ...items[idx], label: lines[0] || '', desc: lines.slice(1).join('\n') || undefined };
      return { steps: items };
    }
    case 'icon': {
      const items = [...(slide.icons || [])];
      const lines = newText.split('\n');
      items[idx] = { ...items[idx], title: lines[0] || '', desc: lines.slice(1).join('\n') || undefined };
      return { icons: items };
    }
    case 'num': {
      const items = [...(slide.numberedItems || [])];
      const lines = newText.split('\n');
      items[idx] = { ...items[idx], title: lines[0] || '', desc: lines.slice(1).join('\n') || undefined };
      return { numberedItems: items };
    }
    case 'qna': {
      const items = [...(slide.questions || [])];
      const lines = newText.split('\n');
      const qLine = lines.find(l => l.startsWith('Q.')) || lines[0] || '';
      const aLine = lines.find(l => l.startsWith('A.')) || lines[1] || '';
      items[idx] = { q: qLine.replace(/^Q\.\s*/, ''), a: aLine.replace(/^A\.\s*/, '') };
      return { questions: items };
    }
    case 'warn': {
      const items = [...(slide.warningItems || [])];
      items[idx] = newText;
      return { warningItems: items };
    }
    case 'pro': {
      const items = [...(slide.pros || [])];
      items[idx] = newText;
      return { pros: items };
    }
    case 'con': {
      const items = [...(slide.cons || [])];
      items[idx] = newText;
      return { cons: items };
    }
    case 'price': {
      const items = [...(slide.priceItems || [])];
      const parts = newText.split(/\s{2,}/);
      items[idx] = { name: parts[0] || '', price: parts[1] || '', note: parts[2] || undefined };
      return { priceItems: items };
    }
    case 'data': {
      const items = [...(slide.dataPoints || [])];
      const lines = newText.split('\n');
      items[idx] = { ...items[idx], value: lines[0] || '', label: lines[1] || '' };
      return { dataPoints: items };
    }
    case 'timeline': {
      const items = [...(slide.timelineItems || [])];
      const lines = newText.split('\n');
      const firstLine = lines[0] || '';
      const spaceIdx = firstLine.indexOf(' ');
      items[idx] = {
        time: spaceIdx > 0 ? firstLine.slice(0, spaceIdx) : firstLine,
        title: spaceIdx > 0 ? firstLine.slice(spaceIdx + 1) : '',
        desc: lines.slice(1).join('\n') || undefined,
      };
      return { timelineItems: items };
    }
  }
  return null;
}
