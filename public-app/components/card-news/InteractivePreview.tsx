'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SlideData, SlideDecoration } from '../../lib/cardNewsLayouts';

interface TextHandle {
  id: string;
  label: string;
  value: string;
  posKey: 'titlePosition' | 'subtitlePosition' | 'hospitalNamePosition';
  valueKey: 'title' | 'subtitle';
  pos: { x: number; y: number };
  hasExplicitPos: boolean; // 사용자가 직접 위치를 설정했는지
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

const BOUNDARY = { min: 5, max: 95 };

export default function InteractivePreview({
  slide, hospitalName, cardWidth, cardHeight, cardAspect,
  renderSlide, onSlideChange, fontLoaded, fontId, slideFontId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editValueKey, setEditValueKey] = useState<string>(''); // 편집 시작 시 고정
  const editRef = useRef<HTMLTextAreaElement>(null);

  // 텍스트 핸들 목록
  const handles: TextHandle[] = [
    {
      id: 'title', label: '제목', value: slide.title || '',
      posKey: 'titlePosition', valueKey: 'title',
      pos: slide.titlePosition || { x: 50, y: 35 },
      hasExplicitPos: !!slide.titlePosition,
    },
    ...(slide.subtitle ? [{
      id: 'subtitle', label: '부제', value: slide.subtitle,
      posKey: 'subtitlePosition' as const, valueKey: 'subtitle' as const,
      pos: slide.subtitlePosition || { x: 50, y: 55 },
      hasExplicitPos: !!slide.subtitlePosition,
    }] : []),
    ...(hospitalName ? [{
      id: 'hospital', label: '병원명 (드래그로 이동)', value: hospitalName,
      posKey: 'hospitalNamePosition' as const, valueKey: 'subtitle' as const, // 편집 차단됨, 안전장치
      pos: slide.hospitalNamePosition || { x: 50, y: 90 },
      hasExplicitPos: !!slide.hospitalNamePosition,
    }] : []),
  ];

  // 편집 확정 — valueKey를 편집 시작 시 고정해서 race condition 방지
  const commitEdit = useCallback(() => {
    if (editingId && editValueKey && editText.trim()) {
      onSlideChange({ [editValueKey]: editText });
    }
    setEditingId(null);
    setEditValueKey('');
  }, [editingId, editValueKey, editText, onSlideChange]);

  // Esc 핸들러
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) commitEdit(); // commitEdit이 setEditingId(null) 포함
        else setEditingId(null);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingId, commitEdit]);

  // 더블클릭 → 인라인 편집
  const startEdit = (handle: TextHandle) => {
    if (handle.id === 'hospital') return;
    // 기존 편집 저장
    if (editingId && editingId !== handle.id) commitEdit();
    setEditingId(handle.id);
    setEditValueKey(handle.valueKey); // 편집 시작 시 고정
    setEditText(handle.value);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.focus();
        editRef.current.style.height = 'auto';
        editRef.current.style.height = `${editRef.current.scrollHeight}px`;
      }
    }, 50);
  };

  // 드래그
  const startDrag = (e: React.MouseEvent, handle: TextHandle) => {
    if (editingId === handle.id) return;
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // 편집 중이면 먼저 저장
    if (editingId) commitEdit();
    setSelectedId(handle.id);

    const sx = e.clientX, sy = e.clientY;
    const startX = handle.pos.x, startY = handle.pos.y;
    let lastNx = startX, lastNy = startY;

    const onMove = (ev: MouseEvent) => {
      const nx = Math.round(Math.max(BOUNDARY.min, Math.min(BOUNDARY.max, startX + ((ev.clientX - sx) / rect.width) * 100)));
      const ny = Math.round(Math.max(BOUNDARY.min, Math.min(BOUNDARY.max, startY + ((ev.clientY - sy) / rect.height) * 100)));
      if (nx !== lastNx || ny !== lastNy) {
        lastNx = nx; lastNy = ny;
        onSlideChange({ [handle.posKey]: { x: nx, y: ny } });
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 장식 드래그
  const startDecoDrag = (e: React.MouseEvent, deco: SlideDecoration) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX, sy = e.clientY;
    const startX = parseFloat(deco.position.left);
    const startY = parseFloat(deco.position.top);

    const onMove = (ev: MouseEvent) => {
      const nx = Math.round(Math.max(BOUNDARY.min, Math.min(BOUNDARY.max, startX + ((ev.clientX - sx) / rect.width) * 100)));
      const ny = Math.round(Math.max(BOUNDARY.min, Math.min(BOUNDARY.max, startY + ((ev.clientY - sy) / rect.height) * 100)));
      onSlideChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, position: { top: `${ny}%`, left: `${nx}%` } } : d) });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // textarea 자동 높이
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const maxW = 650;
  const scale = maxW / cardWidth;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', maxWidth: `${maxW}px`, aspectRatio: cardAspect, position: 'relative', overflow: 'hidden', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (editingId) commitEdit();
          setSelectedId(null);
          setEditingId(null);
        }
      }}
    >
      {/* 렌더된 슬라이드 */}
      <div
        key={`preview-${fontLoaded}-${fontId}-${slideFontId}`}
        style={{ position: 'absolute', top: 0, left: 0, width: `${cardWidth}px`, height: `${cardHeight}px`, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
      >
        {renderSlide(slide)}
      </div>

      {/* 장식 요소 핸들 — scale 없이 % 기반으로 */}
      {(slide.decorations || []).map(deco => (
        <div key={deco.id}
          style={{
            position: 'absolute', left: deco.position.left, top: deco.position.top,
            width: '20px', height: '20px', zIndex: 21, cursor: 'grab',
            border: '2px dashed transparent', borderRadius: '4px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
          onMouseDown={(e) => startDecoDrag(e, deco)}
        />
      ))}

      {/* 텍스트 핸들 — hasExplicitPos인 것만 표시, 아니면 안내 */}
      {handles.map(handle => {
        const isSelected = selectedId === handle.id;
        const isEditing = editingId === handle.id;

        // 위치가 설정 안 된 텍스트는 작은 힌트 버튼만 표시
        if (!handle.hasExplicitPos && !isSelected) {
          return (
            <div key={handle.id}
              style={{
                position: 'absolute',
                left: `${handle.pos.x}%`, top: `${handle.pos.y}%`,
                transform: 'translate(-50%, -50%)', zIndex: 22,
                padding: '2px 8px', borderRadius: '12px',
                background: 'rgba(59,130,246,0.15)', cursor: 'grab',
                fontSize: '9px', color: '#3B82F6', fontWeight: 700,
                opacity: 0.6, transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '0.6'; }}
              onMouseDown={(e) => startDrag(e, handle)}
              onDoubleClick={() => startEdit(handle)}
            >
              {handle.label}
            </div>
          );
        }

        return (
          <div key={handle.id}
            style={{
              position: 'absolute', left: `${handle.pos.x}%`, top: `${handle.pos.y}%`,
              transform: 'translate(-50%, -50%)', zIndex: isSelected ? 30 : 22,
              cursor: isEditing ? 'text' : 'grab',
              minWidth: '80px', minHeight: '28px', padding: '4px 10px',
              border: isSelected ? '2px solid #3B82F6' : '2px solid transparent',
              borderRadius: '6px',
              background: isEditing ? 'rgba(255,255,255,0.95)' : 'transparent',
              transition: isEditing ? 'none' : 'border-color 0.15s',
              maxWidth: '85%',
            }}
            onMouseEnter={e => { if (!isSelected && !isEditing) e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; }}
            onMouseLeave={e => { if (!isSelected && !isEditing) e.currentTarget.style.borderColor = 'transparent'; }}
            onMouseDown={(e) => {
              if (handle.id === 'hospital') { startDrag(e, handle); return; }
              e.preventDefault();
              const sx = e.clientX, sy = e.clientY;
              let moved = false;
              const onMove = (ev: MouseEvent) => {
                if (!moved && (Math.abs(ev.clientX - sx) > 5 || Math.abs(ev.clientY - sy) > 5)) {
                  moved = true;
                  startDrag(e, handle);
                }
              };
              const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (!moved) startEdit(handle);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          >
            {isEditing && (
              <textarea
                ref={editRef}
                value={editText}
                onChange={handleTextChange}
                onBlur={() => commitEdit()}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } }}
                style={{
                  width: '100%', minWidth: '220px', minHeight: '36px',
                  border: 'none', outline: 'none', background: 'transparent',
                  fontSize: '15px', fontWeight: 700, color: '#1e293b',
                  resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
                  overflow: 'hidden',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
