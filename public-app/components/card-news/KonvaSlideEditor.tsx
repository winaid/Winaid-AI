'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { SlideData, CardNewsTheme } from '../../lib/cardNewsLayouts';
import { BackgroundImage, type LayoutRenderArgs } from './konva/KonvaHelpers';
import { renderCover, renderInfo, renderQuote } from './konva/KonvaLayoutBasic';
import { renderChecklist, renderSteps, renderWarning, renderNumberedList, renderTimeline } from './konva/KonvaLayoutList';
import { renderComparison, renderIconGrid, renderDataHighlight, renderBeforeAfter, renderQna, renderProsCons, renderPriceTable } from './konva/KonvaLayoutGrid';

// ── Props ──

interface KonvaSlideEditorProps {
  slide: SlideData;
  theme: CardNewsTheme;
  cardWidth?: number;
  cardHeight?: number;
  maxWidth?: number;
  onSlideChange: (patch: Partial<SlideData>) => void;
}

// ── 메인 컴포넌트 ──

export default function KonvaSlideEditor({
  slide, theme, cardWidth = 1080, cardHeight = 1080,
  maxWidth = 650, onSlideChange,
}: KonvaSlideEditorProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const scale = maxWidth / cardWidth;
  const displayWidth = maxWidth;
  const displayHeight = cardHeight * scale;

  // Transformer 연결
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (selectedId) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedId]);

  const handleStageClick = useCallback((e: { target: { getStage: () => Konva.Stage | null } }) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  }, []);

  // 배경
  const bgColor = slide.bgColor || theme.backgroundColor || '#1B2A4A';

  // 레이아웃 분기
  const args: LayoutRenderArgs = [slide, theme, cardWidth, cardHeight, selectedId, setSelectedId, onSlideChange];

  const renderContent = () => {
    switch (slide.layout) {
      case 'cover':
      case 'closing':        return renderCover(...args);
      case 'info':           return renderInfo(...args);
      case 'quote':          return renderQuote(...args);
      case 'checklist':      return renderChecklist(...args);
      case 'steps':          return renderSteps(...args);
      case 'warning':        return renderWarning(...args);
      case 'numbered-list':  return renderNumberedList(...args);
      case 'timeline':       return renderTimeline(...args);
      case 'comparison':     return renderComparison(...args);
      case 'icon-grid':      return renderIconGrid(...args);
      case 'data-highlight': return renderDataHighlight(...args);
      case 'before-after':   return renderBeforeAfter(...args);
      case 'qna':            return renderQna(...args);
      case 'pros-cons':      return renderProsCons(...args);
      case 'price-table':    return renderPriceTable(...args);
      default:               return renderInfo(...args); // fallback → info
    }
  };

  if (!mounted) return null;

  return (
    <div style={{
      width: displayWidth, height: displayHeight,
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    }}>
      <Stage
        ref={stageRef}
        width={displayWidth}
        height={displayHeight}
        scaleX={scale}
        scaleY={scale}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {/* 배경 */}
          <Rect x={0} y={0} width={cardWidth} height={cardHeight} fill={bgColor} />
          {slide.imageUrl && slide.imagePosition === 'background' && (
            <BackgroundImage src={slide.imageUrl} width={cardWidth} height={cardHeight} />
          )}

          {/* 레이아웃 콘텐츠 */}
          {renderContent()}

          {/* Transformer */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 50 || newBox.height < 20) return oldBox;
              return newBox;
            }}
            enabledAnchors={selectedId?.startsWith('text-') ? [] : undefined}
            rotateEnabled={false}
          />
        </Layer>
      </Stage>
    </div>
  );
}
