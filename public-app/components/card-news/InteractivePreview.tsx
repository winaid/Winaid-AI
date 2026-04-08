'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { SlideData } from '../../lib/cardNewsLayouts';

interface TextHandle {
  id: string;
  label: string;
  value: string;
  posKey: 'titlePosition' | 'subtitlePosition' | 'hospitalNamePosition';
  valueKey: 'title' | 'subtitle';
  pos: { x: number; y: number };
}

interface Props {
  slide: SlideData;
  hospitalName?: string;
  cardWidth: number;
  cardHeight: number;
  cardAspect: string;
  renderSlide: (slide: SlideData) => React.ReactNode;
  onSlideChange: (patch: Partial<SlideData>) => void;
  fontLoaded: number;
  fontId?: string;
  slideFontId?: string;
}

/**
 * MIRRA 스타일 인터랙티브 프리뷰
 * - 렌더된 카드 위에 텍스트 핸들 오버레이
 * - 클릭 → 선택 (파란 테두리)
 * - 드래그 → 위치 이동
 * - 더블클릭 → 인라인 텍스트 편집
 * - Esc/외부 클릭 → 선택 해제
 */
export default function InteractivePreview({
  slide, hospitalName, cardWidth, cardHeight, cardAspect,
  renderSlide, onSlideChange, fontLoaded, fontId, slideFontId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  // 텍스트 핸들 목록
  const handles: TextHandle[] = [
    {
      id: 'title',
      label: '제목',
      value: slide.title || '',
      posKey: 'titlePosition',
      valueKey: 'title',
      pos: slide.titlePosition || { x: 50, y: 30 },
    },
    {
      id: 'subtitle',
      label: '부제',
      value: slide.subtitle || '',
      posKey: 'subtitlePosition',
      valueKey: 'subtitle',
      pos: slide.subtitlePosition || { x: 50, y: 50 },
    },
    ...(hospitalName ? [{
      id: 'hospital',
      label: '병원명',
      value: hospitalName,
      posKey: 'hospitalNamePosition' as const,
      valueKey: 'title' as const, // 미사용
      pos: slide.hospitalNamePosition || { x: 50, y: 92 },
    }] : []),
  ];

  // Esc로 선택 해제
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) { commitEdit(); }
        setSelectedId(null);
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, editText]);

  // 편집 확정
  const commitEdit = () => {
    if (editingId && editText !== undefined) {
      const handle = handles.find(h => h.id === editingId);
      if (handle && handle.id !== 'hospital') {
        onSlideChange({ [handle.valueKey]: editText });
      }
    }
    setEditingId(null);
  };

  // 더블클릭 → 인라인 편집 모드
  const startEdit = (handle: TextHandle) => {
    if (handle.id === 'hospital') return; // 병원명은 편집 불가 (테마에서 관리)
    setEditingId(handle.id);
    setEditText(handle.value);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  // 드래그 시작
  const startDrag = (e: React.MouseEvent, handle: TextHandle) => {
    if (editingId === handle.id) return; // 편집 중이면 드래그 안 함
    e.preventDefault();
    setSelectedId(handle.id);

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const sx = e.clientX, sy = e.clientY;
    const startX = handle.pos.x, startY = handle.pos.y;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      moved = true;
      const nx = Math.round(Math.max(5, Math.min(95, startX + ((ev.clientX - sx) / rect.width) * 100)));
      const ny = Math.round(Math.max(5, Math.min(95, startY + ((ev.clientY - sy) / rect.height) * 100)));
      onSlideChange({ [handle.posKey]: { x: nx, y: ny } });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // 클릭만 하고 안 움직였으면 → 선택만
      if (!moved) setSelectedId(handle.id);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const maxW = 650;
  const scale = maxW / cardWidth;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxWidth: `${maxW}px`,
        aspectRatio: cardAspect,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}
      onClick={(e) => {
        // 빈 영역 클릭 → 선택 해제
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.layer === 'bg') {
          if (editingId) commitEdit();
          setSelectedId(null);
          setEditingId(null);
        }
      }}
    >
      {/* 렌더된 슬라이드 (축소) */}
      <div
        key={`preview-${fontLoaded}-${fontId}-${slideFontId}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {renderSlide(slide)}
      </div>

      {/* 텍스트 핸들 오버레이 */}
      {handles.map(handle => {
        const isSelected = selectedId === handle.id;
        const isEditing = editingId === handle.id;

        return (
          <div
            key={handle.id}
            style={{
              position: 'absolute',
              left: `${handle.pos.x}%`,
              top: `${handle.pos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected ? 30 : 22,
              cursor: isEditing ? 'text' : 'grab',
              minWidth: '60px',
              minHeight: '24px',
              padding: '4px 8px',
              border: isSelected ? '2px solid #3B82F6' : '2px solid transparent',
              borderRadius: '4px',
              background: isEditing ? 'rgba(255,255,255,0.95)' : 'transparent',
              transition: isEditing ? 'none' : 'border-color 0.15s',
              maxWidth: '90%',
            }}
            onMouseEnter={e => {
              if (!isSelected && !isEditing) e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)';
            }}
            onMouseLeave={e => {
              if (!isSelected && !isEditing) e.currentTarget.style.borderColor = 'transparent';
            }}
            onMouseDown={(e) => startDrag(e, handle)}
            onDoubleClick={() => startEdit(handle)}
          >
            {/* 선택 시 라벨 */}
            {isSelected && !isEditing && (
              <div style={{
                position: 'absolute',
                top: '-20px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '10px',
                color: '#3B82F6',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                background: 'white',
                padding: '1px 6px',
                borderRadius: '4px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}>
                {handle.label} — 더블클릭으로 편집
              </div>
            )}

            {/* 인라인 편집 모드 */}
            {isEditing ? (
              <textarea
                ref={editRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={() => commitEdit()}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                }}
                style={{
                  width: '100%',
                  minWidth: '200px',
                  minHeight: '40px',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#1e293b',
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.4,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
