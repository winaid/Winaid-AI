'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Moveable from 'react-moveable';

interface EditableSlideWrapperProps {
  children: React.ReactNode;
  isEditMode: boolean;
  slideIndex: number;
  onElementMove?: (slideIndex: number, elementId: string, x: number, y: number) => void;
  onElementResize?: (slideIndex: number, elementId: string, width: number, height: number) => void;
}

export default function EditableSlideWrapper({
  children,
  isEditMode,
  slideIndex,
  onElementMove,
  onElementResize,
}: EditableSlideWrapperProps) {
  const [selectedTarget, setSelectedTarget] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 편집 모드가 꺼지면 선택 해제
  useEffect(() => {
    if (!isEditMode) setSelectedTarget(null);
  }, [isEditMode]);

  // 선택된 요소가 DOM에서 사라지면 선택 해제
  useEffect(() => {
    if (!selectedTarget) return;
    if (!containerRef.current?.contains(selectedTarget)) {
      setSelectedTarget(null);
    }
  });

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isEditMode) return;

    const target = e.target as HTMLElement;
    // data-editable 속성이 있는 가장 가까운 요소를 찾음
    const editable = target.closest('[data-editable]') as HTMLElement | null;

    if (editable && containerRef.current?.contains(editable)) {
      e.stopPropagation();
      setSelectedTarget(editable);
    } else {
      setSelectedTarget(null);
    }
  }, [isEditMode]);

  // Escape로 선택 해제
  useEffect(() => {
    if (!isEditMode || !selectedTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSelectedTarget(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditMode, selectedTarget]);

  // 편집 모드가 아니면 그냥 children 렌더
  if (!isEditMode) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{ position: 'relative', cursor: 'default' }}
    >
      {children}

      {selectedTarget && (
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
    </div>
  );
}
