'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Text, Image as KonvaImage, Rect, Circle, RegularPolygon, Line as KonvaLine } from 'react-konva';
import type Konva from 'konva';

/**
 * Konva 전용 폰트 패밀리 모듈 전역 — react-konva는 React Context를
 * renderer 트리로 전달하지 않으므로 모듈 스코프 변수로 주입한다.
 * KonvaSlideEditor가 렌더 전에 setKonvaFontFamily(...)를 호출한다.
 */
let _konvaFontFamily: string | undefined = undefined;
export function setKonvaFontFamily(family: string | undefined) { _konvaFontFamily = family; }
export function getKonvaFontFamily(fallback = 'Pretendard Variable, sans-serif'): string {
  return _konvaFontFamily || fallback;
}

export type ShapeType = 'rounded' | 'pill' | 'sharp' | 'diamond' | 'hexagon' | 'circle' | 'outlined';

/** 배열 항목이 placeholder(빈 값/기본 텍스트)인지 판단 */
export function isItemPlaceholder(text?: string): boolean {
  if (!text || !text.trim()) return true;
  return /^(항목|설명|단계|주의사항|질문을 입력|답변|시술|텍스트를 입력|제목|부제|새 텍스트|00$|00%)/.test(text.trim());
}

/** placeholder 시각 스타일 상수 */
export const PLACEHOLDER_STYLE = {
  opacity: 0.4,
  dash: [8, 6] as number[],
  textOpacity: 0.5,
} as const;

/** 요소 배경 도형 — 도형 종류에 따라 Rect/Circle/RegularPolygon/Line 반환 */
export function renderShapeBackground(opts: {
  shape: ShapeType;
  x: number; y: number;
  width: number; height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}): React.ReactNode {
  const { shape, x, y, width, height, fill = 'rgba(0,0,0,0.04)', stroke, strokeWidth, opacity = 1 } = opts;
  const minSide = Math.min(width, height);

  if (shape === 'circle') {
    return (
      <Circle
        x={x + width / 2}
        y={y + height / 2}
        radius={minSide / 2}
        fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity}
      />
    );
  }
  if (shape === 'diamond') {
    // RegularPolygon: 4각형 회전
    return (
      <RegularPolygon
        x={x + width / 2}
        y={y + height / 2}
        sides={4}
        radius={minSide / 2}
        fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity}
      />
    );
  }
  if (shape === 'hexagon') {
    return (
      <RegularPolygon
        x={x + width / 2}
        y={y + height / 2}
        sides={6}
        radius={minSide / 2}
        fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity}
      />
    );
  }
  if (shape === 'outlined') {
    return (
      <Rect
        x={x} y={y} width={width} height={height}
        fill="transparent"
        stroke={stroke || fill} strokeWidth={(strokeWidth ?? 0) + 2}
        cornerRadius={12} opacity={opacity}
      />
    );
  }
  // rounded / pill / sharp
  const corner = shape === 'pill' ? minSide / 2 : shape === 'sharp' ? 0 : 18;
  return (
    <Rect
      x={x} y={y} width={width} height={height}
      fill={fill} stroke={stroke} strokeWidth={strokeWidth}
      cornerRadius={corner} opacity={opacity}
    />
  );
}
void KonvaLine;

// ── 타입 ──

export interface EditableTextProps {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontStyle?: string;
  fill: string;
  align?: string;
  offsetX?: number;
  fontFamily?: string;
  lineHeight?: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDragEnd: (x: number, y: number) => void;
  onTextChange: (text: string) => void;
  readOnly?: boolean;
  cardWidth?: number;
  cardHeight?: number;
  onSnapGuides?: (guides: { vertical?: number; horizontal?: number }) => void;
}

export type LayoutRenderArgs = [
  slide: import('../../../lib/cardNewsLayouts').SlideData,
  theme: import('../../../lib/cardNewsLayouts').CardNewsTheme,
  w: number,
  h: number,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  onChange: (patch: Partial<import('../../../lib/cardNewsLayouts').SlideData>) => void,
  readOnly?: boolean,
  onSnapGuides?: (guides: { vertical?: number; horizontal?: number }) => void,
  fontFamily?: string,
];

// ── EditableText ──

export function EditableText({
  id, text, x, y, width, fontSize, fontStyle = 'normal', fill, align = 'left',
  offsetX, fontFamily, lineHeight = 1.3, selectedId, onSelect, onDragEnd, onTextChange,
  readOnly = false, cardWidth = 1080, cardHeight = 1080, onSnapGuides,
}: EditableTextProps) {
  const textRef = useRef<Konva.Text>(null);
  const resolvedFontFamily = fontFamily || getKonvaFontFamily();

  const handleDblClick = useCallback(() => {
    const textNode = textRef.current;
    if (!textNode) return;
    const stage = textNode.getStage();
    if (!stage) return;

    textNode.hide();
    const stageBox = stage.container().getBoundingClientRect();
    const absPos = textNode.getAbsolutePosition();
    const scaleX = stage.scaleX();
    const scaleY = stage.scaleY();

    // ── 폭 계산 ──
    // getTextWidth() 는 Konva 내부 좌표 (scale 무관). DOM px 변환 시 * scaleX.
    // 초기 폭: 실제 텍스트 폭 + fontSize*2 여유, 최소 120px (내부 좌표) *scaleX, 상한 width*scaleX
    const innerMaxW = width;
    const innerTextW = textNode.getTextWidth();
    const innerPadding = fontSize * 2;
    const innerInitialW = Math.max(120, Math.min(innerTextW + innerPadding, innerMaxW));
    const domInitialW = innerInitialW * scaleX;
    const domMaxW = innerMaxW * scaleX;
    const domMinH = fontSize * 1.6 * scaleY;

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = text;
    Object.assign(textarea.style, {
      position: 'absolute',
      left: `${stageBox.left + absPos.x * scaleX}px`,
      top: `${stageBox.top + absPos.y * scaleY}px`,
      width: `${domInitialW}px`,
      maxWidth: `${domMaxW}px`,
      minHeight: `${domMinH}px`,
      height: `${domMinH}px`,
      fontSize: `${fontSize * scaleY}px`,
      fontWeight: fontStyle === 'bold' ? '700' : '400',
      fontFamily: resolvedFontFamily,
      color: '#1e293b',
      background: '#ffffff',
      border: '2px solid #3B82F6',
      borderRadius: '6px',
      padding: '8px 12px',
      outline: 'none',
      resize: 'none',
      lineHeight: '1.3',
      textAlign: align,
      zIndex: '9999',
      boxSizing: 'border-box',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      overflow: 'hidden',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    });
    textarea.focus();

    // auto-grow: 상한까지 폭 확장, 상한 도달 시 줄바꿈으로 높이만 확장
    const autoGrow = () => {
      // 폭: 1줄일 때 contents 폭을 맞춘다. 측정을 위해 임시로 width auto 설정
      const atMaxW = textarea.clientWidth >= domMaxW - 1;
      if (!atMaxW) {
        // whiteSpace: nowrap 임시 적용 → scrollWidth = 한 줄 필요 폭
        const prevWhite = textarea.style.whiteSpace;
        textarea.style.whiteSpace = 'nowrap';
        const neededW = textarea.scrollWidth + 4; // border 보정
        textarea.style.whiteSpace = prevWhite;
        const targetW = Math.min(Math.max(domInitialW, neededW), domMaxW);
        textarea.style.width = `${targetW}px`;
      }
      // 높이: scrollHeight 기반
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(domMinH, textarea.scrollHeight)}px`;
    };
    autoGrow();
    textarea.addEventListener('input', autoGrow);

    const cleanup = () => {
      if (!document.body.contains(textarea)) return;
      onTextChange(textarea.value);
      document.body.removeChild(textarea);
      textNode.show();
      textNode.getLayer()?.batchDraw();
    };
    textarea.addEventListener('blur', cleanup);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        textarea.blur();
      }
    });
  }, [text, width, fontSize, fontStyle, resolvedFontFamily, align, onTextChange]);

  return (
    <Text
      ref={textRef}
      id={id}
      text={text}
      x={x} y={y}
      width={width}
      fontSize={fontSize}
      fontStyle={fontStyle}
      fontFamily={resolvedFontFamily}
      fill={fill}
      align={align}
      offsetX={offsetX}
      lineHeight={lineHeight}
      wrap="word"
      draggable={!readOnly}
      listening={!readOnly}
      onClick={readOnly ? undefined : () => onSelect(id)}
      onTap={readOnly ? undefined : () => onSelect(id)}
      onDblClick={readOnly ? undefined : handleDblClick}
      onDblTap={readOnly ? undefined : handleDblClick}
      onDragMove={readOnly ? undefined : (e) => {
        const node = e.target as Konva.Text;
        const nodeW = node.width();
        const nodeH = node.height();
        const ox = (offsetX || 0);
        const centerX = node.x() - ox + nodeW / 2;
        const centerY = node.y() + nodeH / 2;
        const cardCx = cardWidth / 2;
        const cardCy = cardHeight / 2;
        const THRESHOLD = 8;
        const guides: { vertical?: number; horizontal?: number } = {};
        if (Math.abs(centerX - cardCx) < THRESHOLD) {
          node.x(cardCx - nodeW / 2 + ox);
          guides.vertical = cardCx;
        }
        if (Math.abs(centerY - cardCy) < THRESHOLD) {
          node.y(cardCy - nodeH / 2);
          guides.horizontal = cardCy;
        }
        onSnapGuides?.(guides);
      }}
      onDragEnd={readOnly ? undefined : (e) => {
        onSnapGuides?.({});
        onDragEnd(e.target.x(), e.target.y());
      }}
      onMouseEnter={readOnly ? undefined : (e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab'; }}
      onMouseLeave={readOnly ? undefined : (e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default'; }}
    />
  );
}

// ── EditableShape (accent bar, VS 뱃지 등 도형용) ──

interface EditableShapeProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  cornerRadius?: number | number[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onDragEnd?: (x: number, y: number) => void;
  readOnly?: boolean;
}

export function EditableShape({
  id, x, y, width, height, fill, cornerRadius = 0,
  onSelect, onDragEnd, readOnly = false,
}: EditableShapeProps) {
  return (
    <Rect
      id={id}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      cornerRadius={cornerRadius as number}
      draggable={!readOnly}
      listening={!readOnly}
      onClick={readOnly ? undefined : () => onSelect?.(id)}
      onTap={readOnly ? undefined : () => onSelect?.(id)}
      onDragEnd={readOnly ? undefined : (e) => onDragEnd?.(e.target.x(), e.target.y())}
      onMouseEnter={readOnly ? undefined : (e) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'grab';
      }}
      onMouseLeave={readOnly ? undefined : (e) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'default';
      }}
    />
  );
}

// ── BackgroundImage ──

export function BackgroundImage({ src, width, height, opacity = 0.6 }: {
  src: string; width: number; height: number; opacity?: number;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  if (!image) return null;
  return <KonvaImage image={image} x={0} y={0} width={width} height={height} opacity={opacity} />;
}

// ── SlideImage (top/bottom 배치) ──

export function SlideImage({ src, x, y, width, height }: {
  src: string; x: number; y: number; width: number; height: number;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  if (!image) return null;
  return <KonvaImage image={image} x={x} y={y} width={width} height={height} cornerRadius={16} />;
}

// ── 공통 헬퍼 ──

/** 배열 항목을 세로로 균등 배치 */
export function layoutVerticalItems(
  count: number, startY: number, availableHeight: number, gap = 12,
): { y: number; height: number }[] {
  if (count <= 0) return [];
  const itemH = (availableHeight - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    y: startY + i * (itemH + gap),
    height: Math.max(20, itemH),
  }));
}

/** 그리드 좌표 계산 */
export function layoutGrid(
  cols: number, rows: number,
  left: number, top: number, width: number, height: number, gap = 3,
): { x: number; y: number; w: number; h: number }[][] {
  const cellW = (width - gap * (cols - 1)) / cols;
  const cellH = (height - gap * (rows - 1)) / rows;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      x: left + c * (cellW + gap),
      y: top + r * (cellH + gap),
      w: cellW,
      h: cellH,
    })),
  );
}

/** 타이틀 블록 렌더링 (accent bar + title + subtitle) — 재사용 */
export function renderTitleBlock(
  args: LayoutRenderArgs,
  opts: { alignCenter?: boolean; startY?: number } = {},
): { element: React.ReactNode; bottomY: number } {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange, ro, snapCb, fontFamily] = args;
  const { alignCenter = false, startY = 60 } = opts;
  const ax = alignCenter ? w / 2 - 30 : 60;
  const tx = alignCenter ? w / 2 : 60;
  const offsetX = alignCenter ? w * 0.85 / 2 : 0;
  const titleFs = Math.min(52, Math.max(36, Math.floor(360 / Math.max(1, (slide.title || '').length))));

  let bottomY = startY + titleFs + 20;

  // accent bar 위치 저장 반영
  const accentPos = slide.elementPositions?.['accent-bar'];
  const accentX = accentPos ? (w * accentPos.x / 100) : ax;
  const accentY = accentPos ? (h * accentPos.y / 100) : startY;

  const element = (
    <>
      <EditableShape
        id="shape-accent-bar" x={accentX} y={accentY} width={60} height={4}
        fill={theme.accentColor} cornerRadius={2}
        selectedId={selectedId} onSelect={setSelectedId} readOnly={ro}
        onDragEnd={(nx, ny) => {
          const existing = slide.elementPositions || {};
          onChange({ elementPositions: { ...existing, 'accent-bar': { x: Math.round(nx / w * 100), y: Math.round(ny / h * 100) } } });
        }}
      />
      <EditableText
        id="text-title" text={slide.title || '제목'}
        x={tx} y={startY + 20} width={w * 0.85} fontSize={titleFs}
        fontStyle="bold" fill={theme.titleColor} align={alignCenter ? 'center' : 'left'} offsetX={offsetX}
        fontFamily={fontFamily}
        selectedId={selectedId} onSelect={setSelectedId}
        onDragEnd={(x, y) => onChange({ titlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
        onTextChange={t => onChange({ title: t })}
        readOnly={ro}
        cardWidth={w} cardHeight={h} onSnapGuides={snapCb}
      />
      {slide.subtitle && (() => {
        bottomY = startY + titleFs + 60;
        return (
          <EditableText
            id="text-subtitle" text={slide.subtitle}
            x={tx} y={startY + titleFs + 25} width={w * 0.8} fontSize={22}
            fontStyle="normal" fill={theme.subtitleColor} align={alignCenter ? 'center' : 'left'}
            offsetX={alignCenter ? w * 0.8 / 2 : 0}
            fontFamily={fontFamily}
            selectedId={selectedId} onSelect={setSelectedId}
            onDragEnd={(x, y) => onChange({ subtitlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
            onTextChange={t => onChange({ subtitle: t })}
            cardWidth={w} cardHeight={h} onSnapGuides={snapCb}
            readOnly={ro}
          />
        );
      })()}
    </>
  );

  return { element, bottomY };
}

// ── 커스텀 요소 (사용자 추가 텍스트/이미지) ──

/** 커스텀 이미지 요소 — 비동기 로딩 */
function CustomImageElement({
  id, src, x, y, width, height, readOnly, onSelect, onDragEnd,
}: {
  id: string; src: string;
  x: number; y: number; width: number; height: number;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  if (!image) return null;
  return (
    <KonvaImage
      id={id}
      image={image}
      x={x} y={y}
      width={width} height={height}
      cornerRadius={8}
      draggable={!readOnly}
      listening={!readOnly}
      onClick={readOnly ? undefined : () => onSelect(id)}
      onTap={readOnly ? undefined : () => onSelect(id)}
      onDragEnd={readOnly ? undefined : (e) => onDragEnd(e.target.x(), e.target.y())}
    />
  );
}

/** 커스텀 요소(사용자 추가 텍스트/이미지) 전체 렌더 */
export function renderCustomElements(
  slide: import('../../../lib/cardNewsLayouts').SlideData,
  w: number,
  h: number,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  onSlideChange: (patch: Partial<import('../../../lib/cardNewsLayouts').SlideData>) => void,
  readOnly: boolean,
  fontFamily?: string,
): React.ReactNode {
  if (!slide.customElements?.length) return null;
  return slide.customElements.map((el) => {
    const id = `custom-${el.id}`;
    const elW = w * el.w / 100;
    const elH = h * el.h / 100;
    const x = w * el.x / 100 - elW / 2;
    const y = h * el.y / 100 - elH / 2;

    const handleMove = (newX: number, newY: number) => {
      const centerX = newX + elW / 2;
      const centerY = newY + elH / 2;
      onSlideChange({
        customElements: (slide.customElements || []).map(c =>
          c.id === el.id
            ? { ...c, x: Math.round(centerX / w * 100), y: Math.round(centerY / h * 100) }
            : c
        ),
      });
    };

    if (el.type === 'text') {
      return (
        <EditableText
          key={id}
          id={id}
          text={el.text || '텍스트'}
          x={x + elW / 2}
          y={y + elH / 2 - (el.fontSize || 24) / 2}
          width={elW}
          fontSize={el.fontSize || 24}
          fontStyle={Number(el.fontWeight || '500') >= 700 ? 'bold' : 'normal'}
          fill={el.color || '#333333'}
          align={el.align || 'left'}
          offsetX={elW / 2}
          fontFamily={fontFamily}
          selectedId={selectedId}
          onSelect={setSelectedId}
          readOnly={readOnly}
          cardWidth={w} cardHeight={h}
          onDragEnd={(nx, ny) => handleMove(nx - elW / 2, ny - elH / 2)}
          onTextChange={(newText) => {
            onSlideChange({
              customElements: (slide.customElements || []).map(c =>
                c.id === el.id ? { ...c, text: newText } : c
              ),
            });
          }}
        />
      );
    }

    if (el.type === 'image' && el.imageUrl) {
      return (
        <CustomImageElement
          key={id}
          id={id}
          src={el.imageUrl}
          x={x} y={y}
          width={elW} height={elH}
          readOnly={readOnly}
          onSelect={setSelectedId}
          onDragEnd={handleMove}
        />
      );
    }
    return null;
  });
}
