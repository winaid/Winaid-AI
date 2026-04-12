'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Moveable from 'react-moveable';

interface EditableSlideWrapperProps {
  children: React.ReactNode;
  isEditMode: boolean;
  slideIndex: number;
  onElementMove?: (slideIndex: number, elementId: string, x: number, y: number) => void;
  onElementResize?: (slideIndex: number, elementId: string, width: number, height: number) => void;
  // ── 2단계 ──
  onTextChange?: (slideIndex: number, field: string, value: string) => void;
  onImageReplace?: (slideIndex: number, file: File) => void;
  onImageDelete?: (slideIndex: number) => void;
}

export default function EditableSlideWrapper({
  children,
  isEditMode,
  slideIndex,
  onElementMove,
  onElementResize,
  onTextChange,
  onImageReplace,
  onImageDelete,
}: EditableSlideWrapperProps) {
  const [selectedTarget, setSelectedTarget] = useState<HTMLElement | null>(null);
  const [editingTarget, setEditingTarget] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── contentEditable 편집 종료 → 데이터 커밋 ──
  const commitEditing = useCallback(() => {
    if (!editingTarget) return;
    const field = editingTarget.getAttribute('data-editable') || '';
    const value = editingTarget.innerText;

    editingTarget.contentEditable = 'false';
    editingTarget.style.outline = '';
    editingTarget.style.outlineOffset = '';
    editingTarget.style.borderRadius = '';
    editingTarget.style.cursor = '';
    editingTarget.style.minHeight = '';

    onTextChange?.(slideIndex, field, value);
    setEditingTarget(null);
  }, [editingTarget, slideIndex, onTextChange]);

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
  }, [isEditMode]); // editingTarget 의존 제거 — 클린업 시점에만 동작

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

    // 다른 요소 클릭 시 기존 편집 종료
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

    const field = editable.getAttribute('data-editable');
    if (field === 'image') return; // 이미지는 더블클릭 편집 안 함

    if (field === 'title' || field === 'subtitle' || field === 'body') {
      e.stopPropagation();

      // 기존 편집 종료
      if (editingTarget && editingTarget !== editable) commitEditing();

      editable.contentEditable = 'true';
      editable.focus();

      // 커서를 텍스트 끝으로
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editable);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);

      // 시각 피드백
      editable.style.outline = '2px solid #3B82F6';
      editable.style.outlineOffset = '2px';
      editable.style.borderRadius = '4px';
      editable.style.cursor = 'text';
      editable.style.minHeight = '1em';

      setEditingTarget(editable);
      setSelectedTarget(editable);
    }
  }, [isEditMode, editingTarget, commitEditing]);

  // ── Escape 2단계: 1st 편집 종료, 2nd 선택 해제 ──
  useEffect(() => {
    if (!isEditMode) return;
    if (!selectedTarget && !editingTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (editingTarget) {
          commitEditing();
        } else if (selectedTarget) {
          setSelectedTarget(null);
        }
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

  // ── 편집 모드가 아니면 그냥 children 렌더 ──
  if (!isEditMode) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ position: 'relative', cursor: 'default' }}
    >
      {children}

      {/* 숨겨진 파일 input (이미지 교체용) */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageReplace?.(slideIndex, file);
          e.target.value = '';
        }}
      />

      {/* Moveable — 편집(contentEditable) 중이 아닐 때만 표시 */}
      {selectedTarget && !editingTarget && (
        <Moveable
          target={selectedTarget}
          container={containerRef.current}
          draggable={true}
          resizable={true}
          keepRatio={false}
          throttleDrag={0}
          throttleResize={0}
          edge={false}
          origin={false}
          onDrag={({ target, left, top }) => {
            target.style.position = 'absolute';
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
          }}
          onDragEnd={({ target }) => {
            const id = target.getAttribute('data-editable') || '';
            const left = parseInt(target.style.left) || 0;
            const top = parseInt(target.style.top) || 0;
            onElementMove?.(slideIndex, id, left, top);
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
            onElementResize?.(slideIndex, id, width, height);
          }}
        />
      )}

      {/* 이미지 플로팅 툴바 — 이미지 선택 시, 편집 중 아닐 때 */}
      {selectedTarget && !editingTarget &&
       selectedTarget.getAttribute('data-editable') === 'image' && (
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
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); imageInputRef.current?.click(); }}
            style={{
              padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              background: '#3B82F6', color: 'white', border: 'none',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            교체
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onImageDelete?.(slideIndex); }}
            style={{
              padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              background: '#EF4444', color: 'white', border: 'none',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
