'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Notion 스타일 단락 hover "+" 버튼.
 * contentEditable article 을 감싸는 상위 컴포넌트에서 사용.
 *
 * - editor 내부 mousemove → document.elementFromPoint → closest(단락 셀렉터) 로 대상 파악
 * - React Portal 로 body 에 버튼 렌더 (contentEditable 바깥, 편집 오염 방지)
 * - 버튼 클릭 시 onInsert(target) 호출
 */

interface ImageInsertButtonProps {
  editorRef: React.RefObject<HTMLElement | null>;
  onInsert: (afterElement: HTMLElement) => void;
}

const TARGET_SELECTOR = 'p, h2, h3, h4, ul, ol, .content-image-wrapper';
const HIDE_DELAY_MS = 200;

export default function ImageInsertButton({ editorRef, onInsert }: ImageInsertButtonProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setTarget(null), HIDE_DELAY_MS);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleMouseMove = (e: MouseEvent) => {
      cancelHide();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || !editor.contains(el)) { scheduleHide(); return; }
      const found = el.closest(TARGET_SELECTOR) as HTMLElement | null;
      if (!found || !editor.contains(found)) { scheduleHide(); return; }
      setTarget(found);
      const r = found.getBoundingClientRect();
      setPos({
        top: r.top + window.scrollY + r.height / 2 - 12,
        left: r.left + window.scrollX - 34,
      });
    };

    const handleMouseLeave = () => scheduleHide();

    editor.addEventListener('mousemove', handleMouseMove);
    editor.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      editor.removeEventListener('mousemove', handleMouseMove);
      editor.removeEventListener('mouseleave', handleMouseLeave);
      cancelHide();
    };
  }, [editorRef, scheduleHide, cancelHide]);

  const handleClick = useCallback(() => {
    if (!target) return;
    onInsert(target);
  }, [target, onInsert]);

  if (!mounted || !target || !pos) return null;

  return createPortal(
    <button
      type="button"
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      title="여기에 이미지 삽입"
      style={{
        position: 'absolute',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#f1f5f9',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        lineHeight: 1,
        fontWeight: 700,
        cursor: 'pointer',
        zIndex: 9999,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        opacity: 1,
        transition: 'background 150ms, color 150ms',
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
      onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
    >
      +
    </button>,
    document.body,
  );
}
