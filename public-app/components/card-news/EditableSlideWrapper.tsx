'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Moveable from 'react-moveable';

interface ElementStyle {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

interface EditableSlideWrapperProps {
  children: React.ReactNode;
  isEditMode: boolean;
  slideIndex: number;
  onElementMove?: (slideIndex: number, elementId: string, x: number, y: number) => void;
  onElementResize?: (slideIndex: number, elementId: string, width: number, height: number) => void;
  onTextChange?: (slideIndex: number, field: string, value: string) => void;
  onImageReplace?: (slideIndex: number, file: File) => void;
  onImageDelete?: (slideIndex: number) => void;
  // ── 4단계 ──
  cardWidth?: number;
  cardHeight?: number;
  selectedElementStyle?: Record<string, ElementStyle>;
  onStyleChange?: (slideIndex: number, field: string, styleKey: string, value: string | number) => void;
  onAddElement?: (slideIndex: number, type: 'text' | 'image') => void;
  onCustomElementChange?: (slideIndex: number, elementId: string, patch: Record<string, unknown>) => void;
  onCustomElementDelete?: (slideIndex: number, elementId: string) => void;
  scale?: number;  // 부모 CSS transform scale 값 (축소 미리보기용)
}

const miniBtn: React.CSSProperties = {
  padding: '4px 8px', fontSize: '11px', fontWeight: 700,
  background: '#F1F5F9', color: '#374151', border: 'none',
  borderRadius: '4px', cursor: 'pointer', lineHeight: 1,
};
const separator: React.CSSProperties = {
  width: '1px', height: '20px', background: '#E2E8F0', margin: '0 2px',
};

export default function EditableSlideWrapper({
  children,
  isEditMode,
  slideIndex,
  onElementMove,
  onElementResize,
  onTextChange,
  onImageReplace,
  onImageDelete,
  cardWidth = 1080,
  cardHeight = 1080,
  selectedElementStyle,
  onStyleChange,
  onAddElement,
  onCustomElementChange,
  onCustomElementDelete,
  scale = 1,
}: EditableSlideWrapperProps) {
  const [selectedTarget, setSelectedTarget] = useState<HTMLElement | null>(null);
  const [editingTarget, setEditingTarget] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── 현재 선택된 요소의 field / style ──
  const field = selectedTarget?.getAttribute('data-editable') || '';
  const isCustom = field.startsWith('custom-');
  const customId = isCustom ? field.replace('custom-', '') : '';
  const isImage = field === 'image';
  // 커스텀 요소 중 이미지 타입 감지: 내부에 <img>가 있으면 이미지
  const isCustomImage = isCustom && selectedTarget?.querySelector('img') !== null;
  const isText = (field === 'title' || field === 'subtitle' || field === 'body' || (isCustom && !isCustomImage)) && !isImage;
  const currentStyle = selectedElementStyle?.[field];

  // ── 스냅 대상 요소 수집 ──
  const getSnapElements = useCallback(() => {
    if (!containerRef.current) return [];
    const all = containerRef.current.querySelectorAll('[data-editable]');
    return Array.from(all).filter(el => el !== selectedTarget) as HTMLElement[];
  }, [selectedTarget]);

  // ── 스타일 변경 헬퍼 ──
  const changeSize = (delta: number) => {
    const cur = currentStyle?.fontSize || 48;
    const next = Math.max(12, Math.min(120, cur + delta));
    if (isCustom) {
      onCustomElementChange?.(slideIndex, customId, { fontSize: next });
    } else {
      onStyleChange?.(slideIndex, field, 'FontSize', next);
    }
  };
  const toggleBold = () => {
    const cur = currentStyle?.fontWeight || '800';
    const next = Number(cur) >= 700 ? '400' : '800';
    if (isCustom) {
      onCustomElementChange?.(slideIndex, customId, { fontWeight: next });
    } else {
      onStyleChange?.(slideIndex, field, 'FontWeight', next);
    }
  };
  const isBold = Number(currentStyle?.fontWeight || '800') >= 700;
  const changeColor = (color: string) => {
    if (isCustom) {
      onCustomElementChange?.(slideIndex, customId, { color });
    } else {
      onStyleChange?.(slideIndex, field, 'Color', color);
    }
  };
  const changeAlign = (align: string) => {
    if (isCustom) {
      onCustomElementChange?.(slideIndex, customId, { align });
    } else {
      onStyleChange?.(slideIndex, field, 'Align', align);
    }
  };

  // ── contentEditable 편집 종료 → 데이터 커밋 ──
  const commitEditing = useCallback(() => {
    if (!editingTarget) return;
    const f = editingTarget.getAttribute('data-editable') || '';
    const value = editingTarget.innerText;

    editingTarget.contentEditable = 'false';
    editingTarget.style.outline = '';
    editingTarget.style.outlineOffset = '';
    editingTarget.style.borderRadius = '';
    editingTarget.style.cursor = '';
    editingTarget.style.minHeight = '';

    if (f.startsWith('custom-')) {
      const elId = f.replace('custom-', '');
      onCustomElementChange?.(slideIndex, elId, { text: value });
    } else {
      onTextChange?.(slideIndex, f, value);
    }
    setEditingTarget(null);
  }, [editingTarget, slideIndex, onTextChange, onCustomElementChange]);

  // ── 편집 모드 꺼지면 전부 클린업 ──
  useEffect(() => {
    if (!isEditMode) {
      if (editingTarget) {
        editingTarget.contentEditable = 'false';
        editingTarget.style.outline = '';
        editingTarget.style.outlineOffset = '';
        editingTarget.style.borderRadius = '';
        editingTarget.style.cursor = '';
        editingTarget.style.minHeight = '';
      }
      setEditingTarget(null);
      setSelectedTarget(null);
    }
  }, [isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 선택된 요소가 DOM에서 사라지면 선택 해제 ──
  useEffect(() => {
    if (!selectedTarget) return;
    if (!containerRef.current?.contains(selectedTarget)) {
      setSelectedTarget(null);
    }
  });

  // ── 클릭: 요소 선택 (편집 중이면 먼저 커밋) ──
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isEditMode) return;

    const target = e.target as HTMLElement;
    const editable = target.closest('[data-editable]') as HTMLElement | null;

    if (editingTarget && editable !== editingTarget) {
      commitEditing();
    }

    if (editable && containerRef.current?.contains(editable)) {
      e.stopPropagation();
      setSelectedTarget(editable);
    } else {
      setSelectedTarget(null);
    }
  }, [isEditMode, editingTarget, commitEditing]);

  // ── 더블클릭: 텍스트 contentEditable 진입 ──
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isEditMode) return;

    const target = e.target as HTMLElement;
    const editable = target.closest('[data-editable]') as HTMLElement | null;
    if (!editable || !containerRef.current?.contains(editable)) return;

    const f = editable.getAttribute('data-editable') || '';
    if (f === 'image') return;

    // 커스텀 이미지 요소(내부에 <img>가 있으면)는 편집 스킵
    if (f.startsWith('custom-') && editable.querySelector('img')) return;

    // 텍스트 편집 가능한 필드: title, subtitle, body, custom-* (text type)
    const isEditableText = f === 'title' || f === 'subtitle' || f === 'body' || f.startsWith('custom-');
    if (!isEditableText) return;

    e.stopPropagation();
    if (editingTarget && editingTarget !== editable) commitEditing();

    editable.contentEditable = 'true';
    editable.focus();

    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editable);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);

    editable.style.outline = '2px solid #3B82F6';
    editable.style.outlineOffset = '2px';
    editable.style.borderRadius = '4px';
    editable.style.cursor = 'text';
    editable.style.minHeight = '1em';

    setEditingTarget(editable);
    setSelectedTarget(editable);
  }, [isEditMode, editingTarget, commitEditing]);

  // ── Escape 2단계 ──
  useEffect(() => {
    if (!isEditMode) return;
    if (!selectedTarget && !editingTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (editingTarget) commitEditing();
        else if (selectedTarget) setSelectedTarget(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditMode, selectedTarget, editingTarget, commitEditing]);

  // ── Enter(Shift 없이)로 편집 종료 ──
  useEffect(() => {
    if (!editingTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEditing();
      }
    };
    editingTarget.addEventListener('keydown', handler);
    return () => editingTarget.removeEventListener('keydown', handler);
  }, [editingTarget, commitEditing]);

  if (!isEditMode) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className="moveable-container"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ position: 'relative', cursor: 'default' }}
    >
      {children}

      {/* 숨겨진 파일 input — 기존 이미지 교체용 */}
      <input ref={imageInputRef} type="file" accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageReplace?.(slideIndex, file);
          e.target.value = '';
        }}
      />

      {/* ── Moveable — 편집 중이 아닐 때만 표시, 스냅 가이드라인 포함 ── */}
      {selectedTarget && !editingTarget && (
        <Moveable
          target={selectedTarget}
          container={containerRef.current}
          dragTarget={selectedTarget}
          zoom={1 / scale}
          draggable={true}
          resizable={(() => {
            const f = selectedTarget?.getAttribute('data-editable') || '';
            return f !== 'title' && f !== 'subtitle' && f !== 'body';
          })()}
          keepRatio={false}
          throttleDrag={0}
          throttleResize={0}
          edge={false}
          origin={false}
          // ── 4A: 스냅 가이드라인 ──
          snappable={true}
          snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
          elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
          snapThreshold={5}
          isDisplaySnapDigit={true}
          snapGap={true}
          horizontalGuidelines={[cardHeight * 0.5]}
          verticalGuidelines={[cardWidth * 0.5]}
          elementGuidelines={getSnapElements()}

          onDrag={({ target, left, top }) => {
            target.style.position = 'absolute';
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
          }}
          onDragEnd={({ target }) => {
            const id = target.getAttribute('data-editable') || '';
            const left = parseInt(target.style.left) || 0;
            const top = parseInt(target.style.top) || 0;
            if (id.startsWith('custom-')) {
              const elId = id.replace('custom-', '');
              const xPct = Math.round(Math.max(0, Math.min(100, (left / cardWidth) * 100)));
              const yPct = Math.round(Math.max(0, Math.min(100, (top / cardHeight) * 100)));
              onCustomElementChange?.(slideIndex, elId, { x: xPct, y: yPct });
            } else {
              onElementMove?.(slideIndex, id, left, top);
            }
          }}
          onResize={({ target, width, height, drag }) => {
            target.style.width = `${width}px`;
            target.style.height = `${height}px`;
            target.style.position = 'absolute';
            target.style.left = `${drag.left}px`;
            target.style.top = `${drag.top}px`;
          }}
          onResizeEnd={({ target }) => {
            const id = target.getAttribute('data-editable') || '';
            const width = parseInt(target.style.width) || 0;
            const height = parseInt(target.style.height) || 0;
            if (id.startsWith('custom-')) {
              const elId = id.replace('custom-', '');
              const left = parseInt(target.style.left) || 0;
              const top = parseInt(target.style.top) || 0;
              onCustomElementChange?.(slideIndex, elId, {
                x: Math.round((left / cardWidth) * 100),
                y: Math.round((top / cardHeight) * 100),
                w: Math.round((width / cardWidth) * 100),
                h: Math.round((height / cardHeight) * 100),
              });
            } else {
              onElementResize?.(slideIndex, id, width, height);
            }
          }}
        />
      )}

      {/* ── 4B: 텍스트 컨텍스트 툴바 — 텍스트 선택 시, 편집 중 아닐 때 ── */}
      {selectedTarget && !editingTarget && isText && (
        <div style={{
          position: 'absolute',
          top: Math.max(0, selectedTarget.offsetTop - 48),
          left: selectedTarget.offsetLeft,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          padding: '4px',
        }}>
          {/* 폰트 크기 -/+ */}
          <button type="button" onClick={(e) => { e.stopPropagation(); changeSize(-2); }}
            style={miniBtn}>A-</button>
          <span style={{ fontSize: '11px', fontWeight: 700, minWidth: '28px', textAlign: 'center', color: '#374151' }}>
            {currentStyle?.fontSize || 48}
          </span>
          <button type="button" onClick={(e) => { e.stopPropagation(); changeSize(+2); }}
            style={miniBtn}>A+</button>

          <div style={separator} />

          {/* 굵기 토글 */}
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleBold(); }}
            style={{ ...miniBtn, fontWeight: 900,
              background: isBold ? '#1E293B' : '#F1F5F9',
              color: isBold ? 'white' : '#374151' }}>
            B
          </button>

          <div style={separator} />

          {/* 색상 */}
          <label style={{ ...miniBtn, padding: 0, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '4px',
              background: currentStyle?.color || '#000',
              border: '2px solid #E2E8F0',
            }} />
            <input type="color"
              value={currentStyle?.color || '#000000'}
              onChange={(e) => { e.stopPropagation(); changeColor(e.target.value); }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
          </label>

          <div style={separator} />

          {/* 정렬 (title + custom) */}
          {(field === 'title' || isCustom) && (
            <>
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} type="button" onClick={(e) => { e.stopPropagation(); changeAlign(a); }}
                  style={{ ...miniBtn,
                    background: currentStyle?.align === a ? '#3B82F6' : '#F1F5F9',
                    color: currentStyle?.align === a ? 'white' : '#374151',
                    fontSize: '13px',
                  }}>
                  {a === 'left' ? '\u25E7' : a === 'center' ? '\u2261' : '\u25E8'}
                </button>
              ))}
            </>
          )}

          {/* 커스텀 요소 삭제 */}
          {isCustom && (
            <>
              <div style={separator} />
              <button type="button" onClick={(e) => {
                e.stopPropagation();
                onCustomElementDelete?.(slideIndex, customId);
                setSelectedTarget(null);
              }}
                style={{ ...miniBtn, background: '#EF4444', color: 'white' }}>
                삭제
              </button>
            </>
          )}
        </div>
      )}

      {/* ── 이미지 플로팅 툴바 — 이미지 선택 시 (기존 이미지 + 커스텀 이미지) ── */}
      {selectedTarget && !editingTarget && (isImage || isCustomImage) && (
        <div style={{
          position: 'absolute',
          top: Math.max(0, selectedTarget.offsetTop - 44),
          left: selectedTarget.offsetLeft + selectedTarget.offsetWidth / 2,
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          gap: '4px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          padding: '4px',
        }}>
          <button type="button"
            onClick={(e) => { e.stopPropagation(); imageInputRef.current?.click(); }}
            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              background: '#3B82F6', color: 'white', border: 'none',
              borderRadius: '6px', cursor: 'pointer' }}>
            교체
          </button>
          {!isCustom && (
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onImageDelete?.(slideIndex); }}
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700,
                background: '#EF4444', color: 'white', border: 'none',
                borderRadius: '6px', cursor: 'pointer' }}>
              삭제
            </button>
          )}
          {isCustom && (
            <button type="button" onClick={(e) => {
              e.stopPropagation();
              onCustomElementDelete?.(slideIndex, customId);
              setSelectedTarget(null);
            }}
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700,
                background: '#EF4444', color: 'white', border: 'none',
                borderRadius: '6px', cursor: 'pointer' }}>
              삭제
            </button>
          )}
        </div>
      )}

      {/* ── 4C: 요소 추가 버튼 — 배치 모드일 때 우하단 ── */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        right: '12px',
        zIndex: 50,
        display: 'flex',
        gap: '4px',
      }}>
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onAddElement?.(slideIndex, 'text'); }}
          style={{
            padding: '6px 12px', fontSize: '11px', fontWeight: 700,
            background: '#3B82F6', color: 'white', border: 'none',
            borderRadius: '8px', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
          }}>
          + 텍스트
        </button>
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onAddElement?.(slideIndex, 'image'); }}
          style={{
            padding: '6px 12px', fontSize: '11px', fontWeight: 700,
            background: '#8B5CF6', color: 'white', border: 'none',
            borderRadius: '8px', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
          }}>
          + 이미지
        </button>
      </div>

      {/* ── 스냅 가이드라인 CSS ── */}
      <style>{`
        .moveable-container .moveable-guideline {
          background: #3B82F6 !important;
        }
        .moveable-container .moveable-dashed {
          border-color: #3B82F6 !important;
        }
        .moveable-container .moveable-gap {
          background: rgba(59, 130, 246, 0.15) !important;
        }
      `}</style>
    </div>
  );
}
