'use client';

import React from 'react';
import { Rect, Text } from 'react-konva';
import { EditableText, EditableShape, renderTitleBlock, type LayoutRenderArgs } from './KonvaHelpers';
import type { SlideData } from '../../../lib/cardNewsLayouts';

function shapeRadius(slide: SlideData, id: string, defaultCorner: number, w: number, h: number): number {
  const shape = slide.elementShapes?.[id];
  if (!shape) return defaultCorner;
  if (shape === 'pill' || shape === 'circle') return Math.min(w, h) / 2;
  if (shape === 'sharp' || shape === 'diamond' || shape === 'hexagon') return 0;
  return 18;
}

// ── Cover / Closing ──

export function renderCover(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange, readOnly, snapCb] = args;
  const titleX = slide.titlePosition?.x ? (w * slide.titlePosition.x / 100) : w / 2;
  const titleY = slide.titlePosition?.y ? (h * slide.titlePosition.y / 100) : h * 0.38;
  const subtitleY = slide.subtitlePosition?.y ? (h * slide.subtitlePosition.y / 100) : h * 0.58;
  const titleW = w * 0.85;

  // accent bar — elementPositions에 저장된 위치 반영
  const accentPos = slide.elementPositions?.['accent-bar'];
  const accentX = accentPos ? (w * accentPos.x / 100) : (w / 2 - 36);
  const accentY = accentPos ? (h * accentPos.y / 100) : (titleY - 50);

  return (
    <>
      <EditableShape
        id="shape-accent-bar" x={accentX} y={accentY} width={72} height={5}
        fill={theme.accentColor} cornerRadius={3}
        selectedId={selectedId} onSelect={setSelectedId} readOnly={readOnly}
        onDragEnd={(nx, ny) => {
          const existing = slide.elementPositions || {};
          onChange({ elementPositions: { ...existing, 'accent-bar': { x: Math.round(nx / w * 100), y: Math.round(ny / h * 100) } } });
        }}
      />
      <EditableText
        id="text-title" text={slide.title || '제목을 입력하세요'}
        x={titleX} y={titleY} width={titleW}
        fontSize={slide.titleFontSize || 56}
        fontStyle={Number(slide.titleFontWeight || '900') >= 700 ? 'bold' : 'normal'}
        fill={slide.titleColor || theme.titleColor}
        align={slide.titleAlign || 'center'} offsetX={titleW / 2}
        selectedId={selectedId} onSelect={setSelectedId}
        onDragEnd={(x, y) => onChange({ titlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
        onTextChange={t => onChange({ title: t })}
        readOnly={readOnly} cardWidth={w} cardHeight={h} onSnapGuides={snapCb}
      />
      {slide.subtitle && (
        <EditableText
          id="text-subtitle" text={slide.subtitle}
          x={w / 2} y={subtitleY} width={w * 0.8} fontSize={slide.subtitleFontSize || 22}
          fontStyle="normal" fill={slide.subtitleColor || theme.subtitleColor}
          align={slide.subtitleAlign || 'center'} offsetX={w * 0.8 / 2}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={(x, y) => onChange({ subtitlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
          onTextChange={t => onChange({ subtitle: t })}
          readOnly={readOnly} cardWidth={w} cardHeight={h} onSnapGuides={snapCb}
        />
      )}
      {slide.body && (
        <EditableText
          id="text-body" text={slide.body}
          x={w / 2} y={h * 0.72} width={w * 0.8} fontSize={20}
          fill={theme.bodyColor} align={slide.bodyAlign || 'center'} offsetX={w * 0.8 / 2}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}} onTextChange={t => onChange({ body: t })}
          readOnly={readOnly} cardWidth={w} cardHeight={h} onSnapGuides={snapCb}
        />
      )}
    </>
  );
}

// ── Info ──

export function renderInfo(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { startY: 60 });
  const bodyY = Math.max(bottomY + 30, h * 0.42);

  return (
    <>
      {titleBlock}
      {slide.body && (
        <>
          <Rect id="body-card" x={50} y={bodyY} width={w - 100} height={h * 0.4}
            fill={theme.cardBgColor || 'rgba(0,0,0,0.04)'}
            cornerRadius={shapeRadius(slide, 'body-card', 18, w - 100, h * 0.4)} />
          <Rect x={50} y={bodyY} width={5} height={h * 0.4}
            fill={theme.accentColor} />
          <EditableText
            id="text-body" text={slide.body}
            x={80} y={bodyY + 25} width={w - 160} fontSize={20}
            fill={theme.bodyColor} align={slide.bodyAlign || 'left'} offsetX={0}
            selectedId={selectedId} onSelect={setSelectedId}
            onDragEnd={() => {}} onTextChange={t => onChange({ body: t })}
          />
        </>
      )}
    </>
  );
}

// ── Quote ──

export function renderQuote(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const qText = slide.quoteText || slide.body || '';

  return (
    <>
      <Text x={w / 2 - 40} y={h * 0.15} text={'\u201C'} fontSize={140}
        fill={theme.accentColor} opacity={0.35} fontFamily="Georgia, serif" />
      <EditableText
        id="text-body" text={qText}
        x={w / 2} y={h * 0.38} width={w * 0.75} fontSize={28}
        fontStyle="bold" fill={theme.titleColor} align="center" offsetX={w * 0.75 / 2}
        selectedId={selectedId} onSelect={setSelectedId}
        onDragEnd={() => {}} onTextChange={t => onChange({ quoteText: t })}
      />
      {slide.quoteAuthor && (
        <EditableText
          id="text-quote-author" text={`— ${slide.quoteAuthor}`}
          x={w / 2} y={h * 0.7} width={w * 0.6} fontSize={24}
          fontStyle="bold" fill={theme.accentColor} align="center" offsetX={w * 0.6 / 2}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}} onTextChange={t => onChange({ quoteAuthor: t.replace(/^—\s*/, '') })}
        />
      )}
      {slide.quoteRole && (
        <EditableText
          id="text-quote-role" text={slide.quoteRole}
          x={w / 2} y={h * 0.76} width={w * 0.5} fontSize={18}
          fill={theme.bodyColor} align="center" offsetX={w * 0.5 / 2}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}} onTextChange={t => onChange({ quoteRole: t })}
        />
      )}
    </>
  );
}
