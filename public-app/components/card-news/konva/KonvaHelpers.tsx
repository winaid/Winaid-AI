'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Text, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';

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
];

// ── EditableText ──

export function EditableText({
  id, text, x, y, width, fontSize, fontStyle = 'normal', fill, align = 'left',
  offsetX, fontFamily, lineHeight = 1.3, selectedId, onSelect, onDragEnd, onTextChange,
  readOnly = false, cardWidth = 1080, cardHeight = 1080, onSnapGuides,
}: EditableTextProps) {
  const textRef = useRef<Konva.Text>(null);

  const handleDblClick = useCallback(() => {
    const textNode = textRef.current;
    if (!textNode) return;
    const stage = textNode.getStage();
    if (!stage) return;

    textNode.hide();
    const stageBox = stage.container().getBoundingClientRect();
    const absPos = textNode.getAbsolutePosition();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = text;
    Object.assign(textarea.style, {
      position: 'absolute',
      left: `${stageBox.left + absPos.x * stage.scaleX()}px`,
      top: `${stageBox.top + absPos.y * stage.scaleY()}px`,
      width: `${width * stage.scaleX()}px`,
      fontSize: `${fontSize * stage.scaleY()}px`,
      fontWeight: fontStyle === 'bold' ? '700' : '400',
      fontFamily: fontFamily || 'inherit',
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
    });
    textarea.focus();

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
  }, [text, width, fontSize, fontStyle, fontFamily, fill, align, onTextChange]);

  return (
    <Text
      ref={textRef}
      id={id}
      text={text}
      x={x} y={y}
      width={width}
      fontSize={fontSize}
      fontStyle={fontStyle}
      fontFamily={fontFamily || 'Pretendard Variable, sans-serif'}
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
  const [slide, theme, w, h, selectedId, setSelectedId, onChange, ro, snapCb] = args;
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
