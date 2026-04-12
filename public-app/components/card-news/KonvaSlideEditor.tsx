'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { SlideData, CardNewsTheme } from '../../lib/cardNewsLayouts';

// ── Props ──

interface KonvaSlideEditorProps {
  slide: SlideData;
  theme: CardNewsTheme;
  cardWidth?: number;
  cardHeight?: number;
  maxWidth?: number;
  onSlideChange: (patch: Partial<SlideData>) => void;
}

// ── BackgroundImage (비동기 이미지 로딩) ──

function BackgroundImage({ src, width, height }: { src: string; width: number; height: number }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);

  if (!image) return null;
  return <KonvaImage image={image} x={0} y={0} width={width} height={height} opacity={0.6} />;
}

// ── EditableText (드래그 + 더블클릭 편집) ──

interface EditableTextProps {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontStyle: string;
  fill: string;
  align: string;
  offsetX?: number;
  fontFamily?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDragEnd: (x: number, y: number) => void;
  onTextChange: (text: string) => void;
}

function EditableText({
  id, text, x, y, width, fontSize, fontStyle, fill, align, offsetX,
  fontFamily, selectedId, onSelect, onDragEnd, onTextChange,
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
    const areaX = stageBox.left + absPos.x * stage.scaleX();
    const areaY = stageBox.top + absPos.y * stage.scaleY();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = text;
    Object.assign(textarea.style, {
      position: 'absolute',
      left: `${areaX}px`,
      top: `${areaY}px`,
      width: `${width * stage.scaleX()}px`,
      fontSize: `${fontSize * stage.scaleY()}px`,
      fontWeight: fontStyle === 'bold' ? '700' : '400',
      fontFamily: fontFamily || 'inherit',
      color: fill,
      border: '2px solid #3B82F6',
      borderRadius: '4px',
      padding: '4px',
      background: 'rgba(255,255,255,0.95)',
      outline: 'none',
      resize: 'none',
      lineHeight: '1.3',
      textAlign: align,
      zIndex: '9999',
      boxSizing: 'border-box',
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
      x={x}
      y={y}
      width={width}
      fontSize={fontSize}
      fontStyle={fontStyle}
      fontFamily={fontFamily || 'Pretendard Variable, sans-serif'}
      fill={fill}
      align={align}
      offsetX={offsetX}
      lineHeight={1.3}
      wrap="word"
      draggable
      onClick={() => onSelect(id)}
      onTap={() => onSelect(id)}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onMouseEnter={(e) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'default';
      }}
    />
  );
}

// ── 배경 렌더링 ──

function renderBackground(
  slide: SlideData, theme: CardNewsTheme,
  w: number, h: number,
): React.ReactNode {
  const bgColor = slide.bgColor || theme.backgroundColor || '#1B2A4A';
  return (
    <>
      <Rect x={0} y={0} width={w} height={h} fill={bgColor} />
      {slide.imageUrl && slide.imagePosition === 'background' && (
        <BackgroundImage src={slide.imageUrl} width={w} height={h} />
      )}
    </>
  );
}

// ── Cover 레이아웃 ──

function renderCover(
  slide: SlideData, theme: CardNewsTheme,
  w: number, h: number,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  onSlideChange: (patch: Partial<SlideData>) => void,
): React.ReactNode {
  const titleX = slide.titlePosition?.x ? (w * slide.titlePosition.x / 100) : w / 2;
  const titleY = slide.titlePosition?.y ? (h * slide.titlePosition.y / 100) : h * 0.38;
  const subtitleX = slide.subtitlePosition?.x ? (w * slide.subtitlePosition.x / 100) : w / 2;
  const subtitleY = slide.subtitlePosition?.y ? (h * slide.subtitlePosition.y / 100) : h * 0.58;
  const titleW = w * 0.85;

  return (
    <>
      {/* Accent bar */}
      <Rect
        x={w / 2 - 36}
        y={titleY - 50}
        width={72}
        height={5}
        fill={theme.accentColor}
        cornerRadius={3}
      />

      <EditableText
        id="text-title"
        text={slide.title || '제목을 입력하세요'}
        x={titleX}
        y={titleY}
        width={titleW}
        fontSize={slide.titleFontSize || 56}
        fontStyle={Number(slide.titleFontWeight || '900') >= 700 ? 'bold' : 'normal'}
        fill={slide.titleColor || theme.titleColor}
        align={slide.titleAlign || 'center'}
        offsetX={titleW / 2}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDragEnd={(x, y) => {
          onSlideChange({ titlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } });
        }}
        onTextChange={(text) => onSlideChange({ title: text })}
      />

      {slide.subtitle && (
        <EditableText
          id="text-subtitle"
          text={slide.subtitle}
          x={subtitleX}
          y={subtitleY}
          width={w * 0.8}
          fontSize={slide.subtitleFontSize || 22}
          fontStyle="normal"
          fill={slide.subtitleColor || theme.subtitleColor}
          align="center"
          offsetX={w * 0.8 / 2}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDragEnd={(x, y) => {
            onSlideChange({ subtitlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } });
          }}
          onTextChange={(text) => onSlideChange({ subtitle: text })}
        />
      )}
    </>
  );
}

// ── Fallback (미구현 레이아웃) ──

function renderFallback(
  slide: SlideData, theme: CardNewsTheme,
  w: number, h: number,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  onSlideChange: (patch: Partial<SlideData>) => void,
): React.ReactNode {
  return (
    <>
      <EditableText
        id="text-title"
        text={slide.title || '제목'}
        x={w / 2} y={h * 0.35}
        width={w * 0.85} fontSize={48}
        fontStyle="bold" fill={theme.titleColor}
        align="center" offsetX={w * 0.85 / 2}
        selectedId={selectedId} onSelect={setSelectedId}
        onDragEnd={(x, y) => onSlideChange({ titlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
        onTextChange={(text) => onSlideChange({ title: text })}
      />
      {slide.subtitle && (
        <EditableText
          id="text-subtitle"
          text={slide.subtitle}
          x={w / 2} y={h * 0.55}
          width={w * 0.7} fontSize={24}
          fontStyle="normal" fill={theme.subtitleColor}
          align="center" offsetX={w * 0.7 / 2}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={(x, y) => onSlideChange({ subtitlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
          onTextChange={(text) => onSlideChange({ subtitle: text })}
        />
      )}
      {slide.body && (
        <EditableText
          id="text-body"
          text={slide.body}
          x={w * 0.08} y={h * 0.68}
          width={w * 0.84} fontSize={20}
          fontStyle="normal" fill={theme.bodyColor}
          align="left" offsetX={0}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}}
          onTextChange={(text) => onSlideChange({ body: text })}
        />
      )}
    </>
  );
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

  // SSR 방지
  useEffect(() => setMounted(true), []);

  const scale = maxWidth / cardWidth;
  const displayWidth = maxWidth;
  const displayHeight = cardHeight * scale;

  // 선택된 노드에 Transformer 연결
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

  // 빈 공간 클릭 → 선택 해제
  const handleStageClick = useCallback((e: { target: { getStage: () => Konva.Stage | null } }) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  }, []);

  // 레이아웃 분기
  const renderContent = () => {
    switch (slide.layout) {
      case 'cover':
      case 'closing':
        return renderCover(slide, theme, cardWidth, cardHeight, selectedId, setSelectedId, onSlideChange);
      default:
        return renderFallback(slide, theme, cardWidth, cardHeight, selectedId, setSelectedId, onSlideChange);
    }
  };

  if (!mounted) return null;

  return (
    <div style={{
      width: displayWidth,
      height: displayHeight,
      borderRadius: '16px',
      overflow: 'hidden',
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
          {renderBackground(slide, theme, cardWidth, cardHeight)}
          {renderContent()}
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
