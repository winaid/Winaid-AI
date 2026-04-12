'use client';

import { useEffect, useRef, useState } from 'react';
import type { SlideData, CardNewsTheme } from '../lib/cardNewsLayouts';
import type { CardTemplate } from '../lib/cardTemplateService';
import type { DesignPresetStyle } from '../lib/cardNewsLayouts';
import {
  type CanvasLayoutContext,
  OBJ, SELECTION_STYLE,
  makeFabricGradient,
  renderCoverToCanvas, renderInfoToCanvas, renderComparisonToCanvas,
  renderChecklistToCanvas, renderStepsToCanvas, renderIconGridToCanvas,
  renderDataHighlightToCanvas, renderQnaToCanvas, renderTimelineToCanvas,
  renderBeforeAfterToCanvas, renderProsConsToCanvas, renderPriceTableToCanvas,
  renderWarningToCanvas, renderQuoteToCanvas, renderNumberedListToCanvas,
  renderClosingToCanvas, renderGenericToCanvas,
} from '../lib/canvasLayouts';

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
  const internalChangeRef = useRef(false);
  const prevSlideJsonRef = useRef('');

  // 선택된 객체 → 플로팅 툴바 표시
  const [selectedObjInfo, setSelectedObjInfo] = useState<{
    type: 'text' | 'image' | 'other';
    top: number;
    left: number;
    textAlign?: string;
    name?: string;
  } | null>(null);

  // 이미지 필터 상태
  const [imgFilters, setImgFilters] = useState({ brightness: 0, contrast: 0, saturation: 0 });

  // WYSIWYG 편집 UX 상태
  const [hoverInfo, setHoverInfo] = useState<{ top: number; left: number; label: string } | null>(null);
  const [editingObj, setEditingObj] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // ── 핵심 버그 수정: fabric v6+ 기본 origin 복원 ──
      // fabric.js v6 부터 FabricObject 의 default origin 이 'left'/'top' 에서
      // 'center'/'center' 로 바뀌었다. 이 컴포넌트와 canvasLayouts.ts 의 모든
      // 좌표 계산은 "left/top 이 top-left 코너" 라는 pre-v6 규약을 가정한다.
      // 예: `new F.Rect({ left: 0, top: 0, width: 1080, height: 1080 })` 은
      // '(0,0) 을 top-left 로' 로 쓰였는데 v7 기본값(center)을 따르면
      // '(0,0) 이 중앙' 이라 (-540,-540)~(540,540) 이 그려지고 canvas 영역
      // (0,0)~(1080,1080) 과 교차해 좌상단 540×540 만 페인트 된다. 그 결과
      // 에디터 프리뷰가 카드의 좌상단 50% 만 배경으로 채우는 버그가 발생.
      // BaseFabricObject 가 FabricObject$1 의 진짜 정적 기본값을 들고 있고
      // 생성자 체인 1단계에서 읽힌다 — 여기에 덮어쓴다.
      const BaseObj = (F as unknown as { BaseFabricObject?: { ownDefaults: Record<string, unknown> } }).BaseFabricObject;
      if (BaseObj?.ownDefaults) {
        BaseObj.ownDefaults.originX = 'left';
        BaseObj.ownDefaults.originY = 'top';
      }
      // 일부 서브클래스(InteractiveFabricObject)는 자체 ownDefaults 를 별도 보관해
      // 생성자 3단계에서 다시 적용하므로 여기도 덮어쓴다.
      if ((F.FabricObject as unknown as { ownDefaults?: Record<string, unknown> }).ownDefaults) {
        (F.FabricObject as unknown as { ownDefaults: Record<string, unknown> }).ownDefaults.originX = 'left';
        (F.FabricObject as unknown as { ownDefaults: Record<string, unknown> }).ownDefaults.originY = 'top';
      }

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

      // CSS 크기만 축소 (내부 좌표계는 1080 유지) — 마우스 좌표 매핑 정확도 보장
      canvas.setDimensions(
        { width: displayWidth, height: displayHeight },
        { cssOnly: true },
      );

      // ── 유틸: fabric Gradient (canvasLayouts에서 import) ──
      const mkGrad = (css: string, w: number, h: number) =>
        makeFabricGradient(F, css, w, h);

      // ════════ 1. 배경 ════════
      const learnedBg = lt?.backgroundStyle?.gradient || lt?.colors?.backgroundGradient;
      const bgSrc = learnedBg || theme.backgroundGradient || theme.backgroundColor;
      const bgRect = new F.Rect({
        left: 0, top: 0, width: cardWidth, height: cardHeight,
        selectable: false, evented: false, name: OBJ.BG,
      });
      if (bgSrc.includes('linear-gradient')) {
        const grad = mkGrad(bgSrc, cardWidth, cardHeight);
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

      // ════════ 7~11. 레이아웃별 콘텐츠 렌더 ════════
      const layoutCtx: CanvasLayoutContext = {
        F, canvas, slide, theme, cardWidth, cardHeight, isDarkTheme, presetStyle, learnedTemplate: lt,
      };

      switch (slide.layout) {
        case 'cover':          renderCoverToCanvas(layoutCtx); break;
        case 'info':           renderInfoToCanvas(layoutCtx); break;
        case 'comparison':     renderComparisonToCanvas(layoutCtx); break;
        case 'checklist':      renderChecklistToCanvas(layoutCtx); break;
        case 'steps':          renderStepsToCanvas(layoutCtx); break;
        case 'icon-grid':      renderIconGridToCanvas(layoutCtx); break;
        case 'data-highlight': renderDataHighlightToCanvas(layoutCtx); break;
        case 'qna':            renderQnaToCanvas(layoutCtx); break;
        case 'timeline':       renderTimelineToCanvas(layoutCtx); break;
        case 'before-after':   renderBeforeAfterToCanvas(layoutCtx); break;
        case 'pros-cons':      renderProsConsToCanvas(layoutCtx); break;
        case 'price-table':    renderPriceTableToCanvas(layoutCtx); break;
        case 'warning':        renderWarningToCanvas(layoutCtx); break;
        case 'quote':          renderQuoteToCanvas(layoutCtx); break;
        case 'numbered-list':  renderNumberedListToCanvas(layoutCtx); break;
        case 'closing':        renderClosingToCanvas(layoutCtx); break;
        default:               renderGenericToCanvas(layoutCtx); break;
      }

      // ════════ 모든 객체를 선택/이동 가능하게 (배경만 제외) ════════
      const BG_NAMES: string[] = [OBJ.BG, OBJ.PATTERN, OBJ.ACCENT_TOP, OBJ.ACCENT_BOT];
      canvas.getObjects().forEach((obj: any) => {
        const name: string = obj.name || '';
        // 배경/패턴/악센트바만 고정, 나머지 전부 드래그+선택 가능
        if (!BG_NAMES.includes(name) && !name.startsWith('__overlay')) {
          obj.set({
            selectable: true,
            evented: true,
            ...SELECTION_STYLE,
          });
          // 텍스트 객체: 호버 시 텍스트 커서 표시 → 편집 가능 암시
          const isTextObj = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text';
          if (isTextObj) {
            obj.set({ hoverCursor: 'text' });
          }
        }
      });

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

      // ════════ 선택 이벤트 → 플로팅 툴바 + 선택 배경 ════════
      const applySelectionBg = (obj: any) => {
        if (!obj) return;
        const isT = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text';
        if (isT) {
          obj._origBgColor = obj._origBgColor ?? (obj.backgroundColor || '');
          obj.set({ backgroundColor: 'rgba(255,255,255,0.35)' });
          canvas.renderAll();
        }
      };
      const clearAllSelectionBg = () => {
        canvas.getObjects().forEach((o: any) => {
          if ('_origBgColor' in o) {
            o.set({ backgroundColor: o._origBgColor || '', shadow: null });
            delete o._origBgColor;
          }
        });
        canvas.renderAll();
      };
      canvas.on('selection:created', (e: any) => {
        const obj = e.selected?.[0];
        updateToolbar(obj);
        applySelectionBg(obj);
      });
      canvas.on('selection:updated', (e: any) => {
        // 이전 객체 배경 복원
        const prev = e.deselected?.[0];
        if (prev && '_origBgColor' in prev) {
          prev.set({ backgroundColor: prev._origBgColor || '', shadow: null });
          delete prev._origBgColor;
        }
        const obj = e.selected?.[0];
        updateToolbar(obj);
        applySelectionBg(obj);
      });
      canvas.on('selection:cleared', () => {
        setSelectedObjInfo(null);
        clearAllSelectionBg();
      });
      canvas.on('object:moving', (e: any) => updateToolbar(e.target));

      function updateToolbar(obj: any) {
        if (!obj) { setSelectedObjInfo(null); return; }
        const isText = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text';
        const isImage = obj.type === 'image';
        const bounds = obj.getBoundingRect();
        setSelectedObjInfo({
          type: isText ? 'text' : isImage ? 'image' : 'other',
          top: Math.max(0, bounds.top * displayScale - 44),
          left: bounds.left * displayScale,
          textAlign: obj.textAlign,
          name: obj.name,
        });
        // 이미지 선택 시 현재 필터값 읽기
        if (isImage) {
          const filters = obj.filters || [];
          const br = filters.find((f: any) => f?.type === 'Brightness');
          const ct = filters.find((f: any) => f?.type === 'Contrast');
          const st = filters.find((f: any) => f?.type === 'Saturation');
          setImgFilters({
            brightness: br?.brightness ?? 0,
            contrast: ct?.contrast ?? 0,
            saturation: st?.saturation ?? 0,
          });
        }
      }

      // ════════ 스냅 가이드라인 (중앙 정렬 보조선) ════════
      const guidelines: any[] = [];

      canvas.on('object:moving', (e: any) => {
        const obj = e.target;
        if (!obj) return;

        // 기존 가이드라인 제거
        guidelines.forEach(g => canvas.remove(g));
        guidelines.length = 0;

        const F2 = fabricRef.current ? require('fabric') : null;
        if (!F2) return;

        const centerX = cardWidth / 2;
        const centerY = cardHeight / 2;
        const objCenterX = (obj.left || 0) + (obj.width || 0) * (obj.scaleX || 1) / 2;
        const objCenterY = (obj.top || 0) + (obj.height || 0) * (obj.scaleY || 1) / 2;

        const SNAP_THRESHOLD = 10;

        // 수직 중앙선
        if (Math.abs(objCenterX - centerX) < SNAP_THRESHOLD) {
          obj.set('left', centerX - (obj.width || 0) * (obj.scaleX || 1) / 2);
          const vLine = new F.Line([centerX, 0, centerX, cardHeight], {
            stroke: '#EF4444', strokeWidth: 1.5, strokeDashArray: [5, 5],
            selectable: false, evented: false, name: '__guide__',
          });
          canvas.add(vLine);
          guidelines.push(vLine);
        }

        // 수평 중앙선
        if (Math.abs(objCenterY - centerY) < SNAP_THRESHOLD) {
          obj.set('top', centerY - (obj.height || 0) * (obj.scaleY || 1) / 2);
          const hLine = new F.Line([0, centerY, cardWidth, centerY], {
            stroke: '#EF4444', strokeWidth: 1.5, strokeDashArray: [5, 5],
            selectable: false, evented: false, name: '__guide__',
          });
          canvas.add(hLine);
          guidelines.push(hLine);
        }

        canvas.renderAll();
      });

      canvas.on('object:modified', () => {
        // 이동 완료 시 가이드라인 제거
        guidelines.forEach(g => canvas.remove(g));
        guidelines.length = 0;
        canvas.renderAll();
      });

      // ════════ WYSIWYG: 호버 힌트 (디바운스로 깜빡임 방지) ════════
      canvas.on('mouse:over', (e: any) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        const obj = e.target;
        if (!obj) return;
        const isTextObj = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text';
        const objName: string = obj.name || '';
        if (isTextObj && !BG_NAMES.includes(objName) && !objName.startsWith('__overlay') && !objName.startsWith('__guide')) {
          hoverTimeoutRef.current = setTimeout(() => {
            const bounds = obj.getBoundingRect();
            const label = objName === OBJ.TITLE ? '제목' : objName === OBJ.SUBTITLE ? '부제' : objName === OBJ.BODY ? '본문' : objName === OBJ.HOSPITAL ? '병원명' : '텍스트';
            setHoverInfo({
              top: bounds.top * displayScale,
              left: (bounds.left + bounds.width / 2) * displayScale,
              label,
            });
          }, 80);
        }
      });
      canvas.on('mouse:out', () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => setHoverInfo(null), 50);
      });

      // ════════ WYSIWYG: 텍스트 인라인 편집 시각 피드백 ════════
      canvas.on('text:editing:entered', (e: any) => {
        const obj = e.target;
        if (!obj) return;
        setEditingObj(true);
        setHoverInfo(null);
        obj._origBgColor = obj._origBgColor ?? (obj.backgroundColor || '');
        obj.set({
          backgroundColor: 'rgba(255,255,255,0.95)',
          editingBorderColor: '#3B82F6',
          shadow: new F.Shadow({ color: 'rgba(59,130,246,0.15)', blur: 20, offsetX: 0, offsetY: 4 }),
        });
        canvas.renderAll();
      });
      canvas.on('text:editing:exited', (e: any) => {
        const obj = e.target;
        if (!obj) return;
        setEditingObj(false);
        // 선택 상태 유지 시 selection bg, 아니면 원본
        const stillSelected = canvas.getActiveObject() === obj;
        obj.set({
          backgroundColor: stillSelected ? 'rgba(255,255,255,0.35)' : (obj._origBgColor || ''),
          shadow: null,
        });
        canvas.renderAll();
      });

      canvas.renderAll();
    };

    build();

    return () => {
      disposed = true;
      setHoverInfo(null);
      setEditingObj(false);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
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
      <canvas ref={canvasElRef} />

      {/* 플로팅 이미지 필터 — 이미지 선택 시 표시 */}
      {selectedObjInfo && selectedObjInfo.type === 'image' && (
        <div
          className="absolute z-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-3 space-y-2"
          style={{ top: Math.max(4, selectedObjInfo.top), left: Math.max(4, Math.min(selectedObjInfo.left, displayWidth - 200)) }}
        >
          {([
            { key: 'brightness' as const, label: '밝기', min: -0.5, max: 0.5, step: 0.05, FilterClass: 'Brightness' },
            { key: 'contrast' as const, label: '대비', min: -0.5, max: 0.5, step: 0.05, FilterClass: 'Contrast' },
            { key: 'saturation' as const, label: '채도', min: -1, max: 1, step: 0.1, FilterClass: 'Saturation' },
          ]).map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-6">{f.label}</span>
              <input
                type="range" min={f.min} max={f.max} step={f.step}
                value={imgFilters[f.key]}
                onChange={async (e) => {
                  const val = Number(e.target.value);
                  setImgFilters(prev => ({ ...prev, [f.key]: val }));
                  const canvas = fabricRef.current;
                  if (!canvas) return;
                  const obj = canvas.getActiveObject();
                  if (!obj || obj.type !== 'image') return;
                  const F = await import('fabric');
                  // 기존 같은 타입 필터 제거
                  obj.filters = (obj.filters || []).filter((fl: any) => fl?.type !== f.FilterClass);
                  // 새 필터 추가 (0이 아닐 때만)
                  if (val !== 0) {
                    const FilterCls = (F.filters as any)?.[f.FilterClass];
                    if (FilterCls) obj.filters.push(new FilterCls({ [f.key]: val }));
                  }
                  obj.applyFilters();
                  canvas.renderAll();
                }}
                className="w-20 accent-blue-500"
              />
              <span className="text-[9px] text-slate-400 w-8">{imgFilters[f.key] > 0 ? '+' : ''}{(imgFilters[f.key] * 100).toFixed(0)}%</span>
            </div>
          ))}
          <button
            type="button"
            onClick={async () => {
              setImgFilters({ brightness: 0, contrast: 0, saturation: 0 });
              const canvas = fabricRef.current;
              if (!canvas) return;
              const obj = canvas.getActiveObject();
              if (!obj || obj.type !== 'image') return;
              obj.filters = [];
              obj.applyFilters();
              canvas.renderAll();
            }}
            className="w-full text-[10px] text-slate-400 hover:text-red-500 transition-colors"
          >
            초기화
          </button>
        </div>
      )}

      {/* 플로팅 정렬 툴바 — 텍스트 선택 시 표시 (편집 모드에서는 숨김) */}
      {selectedObjInfo && selectedObjInfo.type === 'text' && !editingObj && (
        <div
          className="absolute z-20 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 px-1.5 py-1"
          style={{ top: Math.max(4, selectedObjInfo.top), left: Math.max(4, selectedObjInfo.left) }}
        >
          {(['left', 'center', 'right'] as const).map(align => (
            <button
              key={align}
              type="button"
              onClick={() => {
                const canvas = fabricRef.current;
                if (!canvas) return;
                const obj = canvas.getActiveObject();
                if (obj) {
                  obj.set('textAlign', align);
                  canvas.renderAll();
                  if (onSlideChange && obj.name) {
                    if (obj.name === OBJ.TITLE) onSlideChange({ titleAlign: align });
                  }
                  setSelectedObjInfo(prev => prev ? { ...prev, textAlign: align } : null);
                }
              }}
              className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-all ${
                selectedObjInfo.textAlign === align ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
              title={align === 'left' ? '좌측 정렬' : align === 'center' ? '가운데 정렬' : '우측 정렬'}
            >
              {align === 'left' ? '≡←' : align === 'center' ? '≡' : '→≡'}
            </button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-0.5" />
          <span className="text-[9px] font-bold text-blue-500 px-0.5">
            {selectedObjInfo.name === OBJ.TITLE ? '제목' : selectedObjInfo.name === OBJ.SUBTITLE ? '부제' : selectedObjInfo.name === OBJ.BODY ? '본문' : '텍스트'}
          </span>
          <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">· 더블클릭 편집</span>
        </div>
      )}

      {/* WYSIWYG 호버 힌트 — 부드러운 페이드 인/아웃 */}
      <div
        className="absolute z-30 pointer-events-none transition-opacity duration-150"
        style={{
          opacity: hoverInfo && !editingObj && !selectedObjInfo ? 1 : 0,
          top: Math.max(4, (hoverInfo?.top ?? 0) - 32),
          left: Math.min(Math.max(50, hoverInfo?.left ?? 0), displayWidth - 50),
          transform: 'translateX(-50%)',
        }}
      >
        <div className="px-2.5 py-1 bg-slate-800/90 text-white text-[10px] font-bold rounded-md shadow-lg whitespace-nowrap backdrop-blur-sm">
          클릭하여 {hoverInfo?.label ?? ''} 편집
        </div>
      </div>

      {/* 편집 모드 인디케이터 — 펄스 도트 */}
      {editingObj && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full shadow-lg flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            입력하여 편집 · ESC로 완료
          </div>
        </div>
      )}
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
