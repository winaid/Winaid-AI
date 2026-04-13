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

  // ── Transformer 리사이즈 → SlideData 저장 ──
  const saveElementSize = (id: string, width: number, height: number) => {
    const wPct = Math.round(width / cardWidth * 100);
    const hPct = Math.round(height / cardHeight * 100);
    const sizeKey = id === 'text-title' ? 'titleSize'
      : id === 'text-subtitle' ? 'subtitleSize'
      : id === 'text-body' ? 'bodySize' : null;
    if (sizeKey) {
      onSlideChange({ [sizeKey]: { w: wPct, h: hPct } });
      return;
    }
    if (id.startsWith('custom-')) {
      const elId = id.replace('custom-', '');
      const existing = slide.customElements || [];
      onSlideChange({
        customElements: existing.map(el => el.id === elId ? { ...el, w: wPct, h: hPct } : el),
      });
      return;
    }
    const existing = slide.elementSizes || {};
    onSlideChange({ elementSizes: { ...existing, [id]: { w: wPct, h: hPct } } });
  };

  // ── 도형 변경 ──
  const canChangeShape = !!(selectedId && !selectedId.startsWith('text-') && !readOnly);
  const currentShape = selectedId ? (slide.elementShapes?.[selectedId] || 'rounded') : 'rounded';
  const handleShapeChange = (shape: string) => {
    if (!selectedId) return;
    const existing = slide.elementShapes || {};
    onSlideChange({
      elementShapes: { ...existing, [selectedId]: shape as NonNullable<SlideData['elementShapes']>[string] },
    });
  };

  // ── 선택 노드의 화면 좌표 (툴바 위치용) ──
  const [selectedNodeRect, setSelectedNodeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!selectedId || readOnly) { setSelectedNodeRect(null); return; }
    const raf = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const node = stage.findOne(`#${selectedId}`);
      if (!node) { setSelectedNodeRect(null); return; }
      const rect = node.getClientRect({ relativeTo: stage });
      const stageBox = stage.container().getBoundingClientRect();
      setSelectedNodeRect({
        x: stageBox.left + rect.x * stage.scaleX(),
        y: stageBox.top + rect.y * stage.scaleY(),
        width: rect.width * stage.scaleX(),
        height: rect.height * stage.scaleY(),
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId, slide, readOnly, scale]);

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

      {/* 도형 변경 팝업 — 선택 요소 위 플로팅 (text가 아닐 때) */}
      {canChangeShape && selectedNodeRect && (
        <div style={{
          position: 'fixed',
          top: Math.max(8, selectedNodeRect.y - 46),
          left: selectedNodeRect.x + selectedNodeRect.width / 2,
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          padding: '4px',
        }}>
          {[
            { id: 'rounded', label: '□' },
            { id: 'pill', label: '⬭' },
            { id: 'circle', label: '○' },
            { id: 'diamond', label: '◇' },
            { id: 'hexagon', label: '⬡' },
            { id: 'sharp', label: '▢' },
            { id: 'outlined', label: '▯' },
          ].map(s => (
            <button key={s.id} type="button"
              onClick={(e) => { e.stopPropagation(); handleShapeChange(s.id); }}
              title={s.id}
              style={{
                width: 30, height: 30, fontSize: '16px', fontWeight: 700,
                background: currentShape === s.id ? '#3B82F6' : '#F1F5F9',
                color: currentShape === s.id ? 'white' : '#374151',
                border: 'none', borderRadius: '4px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{s.label}</button>
          ))}
          {selectedId?.startsWith('custom-') && (
            <>
              <div style={{ width: 1, height: 20, background: '#E2E8F0', margin: '0 4px' }} />
              <button type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const elId = selectedId.replace('custom-', '');
                  onSlideChange({ customElements: (slide.customElements || []).filter(el => el.id !== elId) });
                  setSelectedId(null);
                }}
                style={{
                  padding: '6px 10px', fontSize: '11px', fontWeight: 700,
                  background: '#EF4444', color: 'white',
                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                }}
              >🗑</button>
            </>
          )}
        </div>
      )}
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
                if (newBox.width < 30 || newBox.height < 20) return oldBox;
                return newBox;
              }}
              enabledAnchors={
                selectedId?.startsWith('text-')
                  ? ['middle-left', 'middle-right']  // 텍스트: 좌우만 (width만 조절, 높이 auto)
                  : undefined                        // 나머지: 8방향 전부
              }
              keepRatio={false}
              rotateEnabled={false}
              onTransformEnd={(e) => {
                const node = e.target;
                const id = node.id() || selectedId;
                if (!id) return;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                const newWidth = Math.max(30, node.width() * scaleX);
                const newHeight = Math.max(20, (node.height?.() || 0) * scaleY);
                // scale 리셋 + width/height로 반영
                node.scaleX(1);
                node.scaleY(1);
                node.width(newWidth);
                if (!id.startsWith('text-')) {
                  node.height(newHeight);
                }
                saveElementSize(id, newWidth, newHeight);
              }}
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
