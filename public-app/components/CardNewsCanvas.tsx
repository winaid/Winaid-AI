'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { SlideData, SlideDecoration } from '../lib/cardNewsLayouts';
import type { CardNewsTheme } from '../lib/cardNewsLayouts';
import type { CardTemplate } from '../lib/cardTemplateService';
import type { DesignPresetStyle } from '../lib/cardNewsLayouts';

interface Props {
  slide: SlideData;
  theme: CardNewsTheme;
  cardRatio?: '1:1' | '3:4' | '4:5' | '9:16' | '16:9';
  /** 학습 템플릿 (배경 오버라이드) */
  learnedTemplate?: CardTemplate | null;
  /** 디자인 프리셋 스타일 */
  presetStyle?: DesignPresetStyle | null;
  /** 컨테이너에 맞출 최대 너비 (px). 기본 650 */
  maxWidth?: number;
}

/**
 * fabric.js 기반 카드뉴스 캔버스 — 현재는 배경만 렌더링.
 * 텍스트/이미지 레이어는 이후 단계에서 추가 예정.
 */
export default function CardNewsCanvas({
  slide,
  theme,
  cardRatio = '1:1',
  learnedTemplate,
  presetStyle,
  maxWidth = 650,
}: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);

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

  // 디스플레이 스케일 — maxWidth 기준으로 축소
  const displayScale = Math.min(1, maxWidth / cardWidth);
  const displayWidth = Math.round(cardWidth * displayScale);
  const displayHeight = Math.round(cardHeight * displayScale);

  const lt = learnedTemplate || null;

  /** 테마 어두운지 판정 */
  const isDarkTheme = (() => {
    const hex = theme.backgroundColor.replace('#', '');
    if (hex.length !== 6) return true;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  })();

  /** CSS 그라데이션 문자열을 파싱해서 fabric Gradient 용 색상 배열 반환 */
  const parseGradientStops = useCallback((gradientCSS: string): { color: string; offset: number }[] => {
    // "linear-gradient(180deg, #1B2A4A 0%, #152238 100%)" → [{color, offset}, ...]
    const match = gradientCSS.match(/linear-gradient\([^,]+,\s*(.+)\)/);
    if (!match) return [];
    const stopsStr = match[1];
    const stops: { color: string; offset: number }[] = [];
    // 각 색상 stop 파싱
    const parts = stopsStr.split(',').map(s => s.trim());
    parts.forEach(part => {
      const m = part.match(/^(.+?)\s+([\d.]+)%$/);
      if (m) {
        stops.push({ color: m[1], offset: parseFloat(m[2]) / 100 });
      } else {
        // % 없으면 균등 분배 시 처리
        stops.push({ color: part, offset: stops.length === 0 ? 0 : 1 });
      }
    });
    return stops;
  }, []);

  /** 패턴 배경(herringbone, dots 등)을 fabric 위에 그리기 */
  const drawPatternDecoration = useCallback(async (
    fabricModule: any,
    canvas: any,
  ) => {
    const ptn = presetStyle?.backgroundPattern || 'herringbone';
    if (ptn === 'none') return;

    const ptnOp = presetStyle?.patternOpacity ?? (isDarkTheme ? 0.02 : 0.015);
    const patternColor = isDarkTheme
      ? `rgba(255,255,255,${ptnOp})`
      : `rgba(0,0,0,${ptnOp})`;

    // 패턴을 오프스크린 캔버스에 그린 뒤 fabric pattern으로 채우기
    const patternCanvas = document.createElement('canvas');
    const ctx = patternCanvas.getContext('2d');
    if (!ctx) return;

    if (ptn === 'dots') {
      patternCanvas.width = 20;
      patternCanvas.height = 20;
      ctx.fillStyle = patternColor;
      ctx.beginPath();
      ctx.arc(10, 10, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (ptn === 'lines') {
      patternCanvas.width = 21;
      patternCanvas.height = 21;
      ctx.strokeStyle = patternColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(21, 20);
      ctx.stroke();
    } else if (ptn === 'diamond') {
      patternCanvas.width = 32;
      patternCanvas.height = 32;
      ctx.fillStyle = patternColor;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(32, 16);
      ctx.lineTo(16, 32);
      ctx.lineTo(0, 16);
      ctx.closePath();
      ctx.fill();
    } else {
      // herringbone
      patternCanvas.width = 28;
      patternCanvas.height = 28;
      ctx.strokeStyle = patternColor;
      ctx.lineWidth = 2;
      // 45도 대각선
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14, 28);
      ctx.lineTo(28, 14);
      ctx.stroke();
      // -45도 대각선
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(28, 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(14, 28);
      ctx.stroke();
    }

    const patternRect = new fabricModule.Rect({
      left: 0,
      top: 0,
      width: cardWidth,
      height: cardHeight,
      selectable: false,
      evented: false,
    });
    patternRect.set('fill', new fabricModule.Pattern({
      source: patternCanvas,
      repeat: 'repeat',
    }));
    canvas.add(patternRect);
  }, [cardWidth, cardHeight, isDarkTheme, presetStyle]);

  /** 상단/하단 accent bar */
  const drawAccentBars = useCallback((fabricModule: any, canvas: any) => {
    const topH = presetStyle?.topBarHeight ?? 8;
    const botH = presetStyle?.bottomBarHeight ?? 4;

    if (topH > 0) {
      const topBar = new fabricModule.Rect({
        left: 0,
        top: 0,
        width: cardWidth,
        height: topH,
        selectable: false,
        evented: false,
      });
      // fabric v7: Gradient.parseGradient 대신 직접 생성
      topBar.set('fill', new fabricModule.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: cardWidth, y2: 0 },
        colorStops: [
          { offset: 0, color: theme.accentColor },
          { offset: 0.6, color: theme.accentColor + '80' },
          { offset: 1, color: 'rgba(0,0,0,0)' },
        ],
      }));
      canvas.add(topBar);
    }

    if (botH > 0) {
      const botBar = new fabricModule.Rect({
        left: 0,
        top: cardHeight - botH,
        width: cardWidth,
        height: botH,
        selectable: false,
        evented: false,
      });
      botBar.set('fill', new fabricModule.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: cardWidth, y2: 0 },
        colorStops: [
          { offset: 0, color: 'rgba(0,0,0,0)' },
          { offset: 0.4, color: theme.accentColor + '50' },
          { offset: 1, color: theme.accentColor },
        ],
      }));
      canvas.add(botBar);
    }
  }, [cardWidth, cardHeight, theme.accentColor, presetStyle]);

  /** 슬라이드별 장식 요소(decorations) 렌더 */
  const drawDecorations = useCallback((fabricModule: any, canvas: any, decorations: SlideDecoration[]) => {
    decorations.forEach(deco => {
      const left = (parseFloat(deco.position.left) / 100) * cardWidth;
      const top = (parseFloat(deco.position.top) / 100) * cardHeight;

      let obj: any = null;
      if (deco.type === 'circle' || deco.type === 'dots') {
        obj = new fabricModule.Circle({
          radius: deco.size / 2,
          left,
          top,
          originX: 'center',
          originY: 'center',
          fill: deco.color,
          opacity: deco.opacity,
          angle: deco.rotation,
          selectable: false,
          evented: false,
        });
      } else if (deco.type === 'line' || deco.type === 'wave') {
        obj = new fabricModule.Rect({
          left,
          top,
          width: deco.size,
          height: 4,
          originX: 'center',
          originY: 'center',
          fill: deco.color,
          opacity: deco.opacity,
          angle: deco.rotation,
          rx: 2,
          ry: 2,
          selectable: false,
          evented: false,
        });
      } else {
        // star, arrow, badge, corner → 기본 원
        obj = new fabricModule.Circle({
          radius: deco.size / 2,
          left,
          top,
          originX: 'center',
          originY: 'center',
          fill: deco.color,
          opacity: deco.opacity,
          angle: deco.rotation,
          selectable: false,
          evented: false,
        });
      }
      if (obj) canvas.add(obj);
    });
  }, [cardWidth, cardHeight]);

  // ── 메인: 캔버스 초기화 + 배경 렌더 ──
  useEffect(() => {
    let disposed = false;

    const initCanvas = async () => {
      const fabricModule = await import('fabric');

      if (disposed || !canvasElRef.current) return;

      // 이전 캔버스 정리
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }

      const canvas = new fabricModule.Canvas(canvasElRef.current, {
        width: cardWidth,
        height: cardHeight,
        selection: false,
        renderOnAddRemove: false, // 수동 renderAll로 한꺼번에 그리기
      });

      if (disposed) {
        canvas.dispose();
        return;
      }

      fabricRef.current = canvas;

      // ── 1. 배경색/그라데이션 ──
      const learnedBgGradient = lt?.backgroundStyle?.gradient || lt?.colors?.backgroundGradient;
      const bgSource = learnedBgGradient || theme.backgroundGradient || theme.backgroundColor;

      if (bgSource.includes('linear-gradient')) {
        // 그라데이션 배경
        const stops = parseGradientStops(bgSource);
        if (stops.length >= 2) {
          // 방향 추출 (180deg = top→bottom 기본)
          const angleMatch = bgSource.match(/(\d+)deg/);
          const angle = angleMatch ? parseInt(angleMatch[1]) : 180;
          const rad = (angle - 90) * (Math.PI / 180);
          const coords = {
            x1: cardWidth / 2 - Math.cos(rad) * cardWidth / 2,
            y1: cardHeight / 2 - Math.sin(rad) * cardHeight / 2,
            x2: cardWidth / 2 + Math.cos(rad) * cardWidth / 2,
            y2: cardHeight / 2 + Math.sin(rad) * cardHeight / 2,
          };

          const bgRect = new fabricModule.Rect({
            left: 0,
            top: 0,
            width: cardWidth,
            height: cardHeight,
            selectable: false,
            evented: false,
          });
          bgRect.set('fill', new fabricModule.Gradient({
            type: 'linear',
            coords,
            colorStops: stops.map(s => ({ offset: s.offset, color: s.color })),
          }));
          canvas.add(bgRect);
        }
      } else {
        // 단색 배경
        const bgRect = new fabricModule.Rect({
          left: 0,
          top: 0,
          width: cardWidth,
          height: cardHeight,
          fill: bgSource,
          selectable: false,
          evented: false,
        });
        canvas.add(bgRect);
      }

      // ── 2. 학습 템플릿 패턴 배경 ──
      if (lt?.backgroundStyle?.patternCSS) {
        // 학습 템플릿의 CSS 패턴은 오프스크린 캔버스로 근사 렌더
        // (CSS 패턴을 fabric에 1:1 변환은 복잡 → 도트/라인 기본 근사)
        await drawPatternDecoration(fabricModule, canvas);
      } else if (!lt) {
        // ── 3. 프리셋 패턴 장식 (학습 템플릿 없을 때만) ──
        await drawPatternDecoration(fabricModule, canvas);
      }

      // ── 4. accent bar ──
      if (!lt) {
        drawAccentBars(fabricModule, canvas);
      } else {
        // 학습 템플릿: 상단/하단 accent CSS가 있으면 간단한 바로 그리기
        if (lt.backgroundStyle?.hasTopAccent) {
          const topBar = new fabricModule.Rect({
            left: 0, top: 0, width: cardWidth, height: 8,
            fill: theme.accentColor,
            selectable: false, evented: false,
          });
          canvas.add(topBar);
        }
        if (lt.backgroundStyle?.hasBottomAccent) {
          const botBar = new fabricModule.Rect({
            left: 0, top: cardHeight - 4, width: cardWidth, height: 4,
            fill: theme.accentColor,
            selectable: false, evented: false,
          });
          canvas.add(botBar);
        }
      }

      // ── 5. 슬라이드별 장식 요소 ──
      if (slide.decorations && slide.decorations.length > 0) {
        drawDecorations(fabricModule, canvas, slide.decorations);
      }

      // 한번에 렌더
      canvas.renderAll();
    };

    initCanvas();

    return () => {
      disposed = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [
    slide, theme, cardRatio, lt, presetStyle,
    cardWidth, cardHeight, isDarkTheme,
    parseGradientStops, drawPatternDecoration, drawAccentBars, drawDecorations,
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
        style={{
          width: displayWidth,
          height: displayHeight,
        }}
      />
    </div>
  );
}
