'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer, Line } from 'react-konva';
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
  readOnly?: boolean;
  onStageReady?: (stage: Konva.Stage | null) => void;
}

// ── 메인 컴포넌트 ──

export default function KonvaSlideEditor({
  slide, theme, cardWidth = 1080, cardHeight = 1080,
  maxWidth = 650, onSlideChange, readOnly = false, onStageReady,
}: KonvaSlideEditorProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ vertical?: number; horizontal?: number }>({});

  useEffect(() => setMounted(true), []);

  // 외부에 Stage ref 노출 (다운로드용)
  useEffect(() => {
    if (!mounted) return;
    onStageReady?.(stageRef.current);
    return () => onStageReady?.(null);
  }, [mounted, onStageReady]);

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
  const args: LayoutRenderArgs = [slide, theme, cardWidth, cardHeight, selectedId, setSelectedId, onSlideChange, readOnly, setSnapGuides];

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

  // ── 정렬 버튼 ──
  type HAlign = 'left' | 'center' | 'right';
  type VAlign = 'top' | 'middle' | 'bottom';
  const alignElement = (hAlign?: HAlign, vAlign?: VAlign) => {
    if (!selectedId || !stageRef.current) return;
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (!node) return;
    const nodeW = node.width() * node.scaleX();
    const nodeH = node.height() * node.scaleY();
    const offsetX = (node as Konva.Text).offsetX?.() || 0;
    const offsetY = (node as Konva.Text).offsetY?.() || 0;
    let xPct: number | undefined;
    let yPct: number | undefined;
    if (hAlign === 'left') {
      node.x(offsetX);
      xPct = Math.round(nodeW / 2 / cardWidth * 100);
    } else if (hAlign === 'center') {
      node.x(cardWidth / 2 - nodeW / 2 + offsetX);
      xPct = 50;
    } else if (hAlign === 'right') {
      node.x(cardWidth - nodeW + offsetX);
      xPct = Math.round((cardWidth - nodeW / 2) / cardWidth * 100);
    }
    if (vAlign === 'top') {
      node.y(offsetY);
      yPct = Math.round(nodeH / 2 / cardHeight * 100);
    } else if (vAlign === 'middle') {
      node.y(cardHeight / 2 - nodeH / 2 + offsetY);
      yPct = 50;
    } else if (vAlign === 'bottom') {
      node.y(cardHeight - nodeH + offsetY);
      yPct = Math.round((cardHeight - nodeH / 2) / cardHeight * 100);
    }
    node.getLayer()?.batchDraw();
    // SlideData 저장 (title/subtitle만 현재 지원)
    const posKey = selectedId === 'text-title' ? 'titlePosition'
      : selectedId === 'text-subtitle' ? 'subtitlePosition' : null;
    if (posKey) {
      const cur = (slide as unknown as Record<string, { x: number; y: number } | undefined>)[posKey];
      onSlideChange({
        [posKey]: { x: xPct ?? cur?.x ?? 50, y: yPct ?? cur?.y ?? 50 },
      });
    }
  };

  const alignBtn: React.CSSProperties = {
    width: 28, height: 28, fontSize: '14px', fontWeight: 700,
    background: '#F1F5F9', color: '#374151', border: 'none',
    borderRadius: '4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (!mounted) return null;

  return (
    <div style={{
      position: 'relative',
      width: displayWidth, height: displayHeight,
      borderRadius: '16px', overflow: 'visible',
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    }}>
      {/* 정렬 툴바 UI는 제거됨 — alignElement 함수는 추후 단축키/다른 UI에서 재사용 가능하도록 유지 */}
      <Stage
        ref={stageRef}
        width={displayWidth}
        height={displayHeight}
        scaleX={scale}
        scaleY={scale}
        onClick={readOnly ? undefined : handleStageClick}
        onTap={readOnly ? undefined : handleStageClick}
        listening={!readOnly}
      >
        <Layer>
          <Rect x={0} y={0} width={cardWidth} height={cardHeight} fill={bgColor} />
          {slide.imageUrl && slide.imagePosition === 'background' && (
            <BackgroundImage src={slide.imageUrl} width={cardWidth} height={cardHeight} />
          )}
          {renderContent()}
          {!readOnly && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 50 || newBox.height < 20) return oldBox;
                return newBox;
              }}
              enabledAnchors={selectedId?.startsWith('text-') ? [] : undefined}
              rotateEnabled={false}
            />
          )}
        </Layer>
        {/* 스냅 가이드라인 — 최상위 Layer, 이벤트 비활성 */}
        {!readOnly && (snapGuides.vertical !== undefined || snapGuides.horizontal !== undefined) && (
          <Layer listening={false}>
            {snapGuides.vertical !== undefined && (
              <Line
                points={[snapGuides.vertical, 0, snapGuides.vertical, cardHeight]}
                stroke="#EF4444" strokeWidth={1.5} dash={[6, 4]}
              />
            )}
            {snapGuides.horizontal !== undefined && (
              <Line
                points={[0, snapGuides.horizontal, cardWidth, snapGuides.horizontal]}
                stroke="#EF4444" strokeWidth={1.5} dash={[6, 4]}
              />
            )}
          </Layer>
        )}
      </Stage>
    </div>
  );
}
