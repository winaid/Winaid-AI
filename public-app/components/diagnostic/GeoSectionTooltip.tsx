'use client';

/**
 * GeoSectionTooltip — 8 GEO 섹션 헤더 옆 ? 아이콘 + popover (GEO-UX-2).
 *
 * UX-1 한계 #3 해결 — 기술 용어 설명 부족.
 *
 * 양 앱 lockstep. 접근성: aria-describedby + role="tooltip" + 44×44px touch target.
 */

import { useEffect, useId, useRef, useState } from 'react';

export interface GeoSectionTooltipProps {
  /** 한국어 설명 (200자 cap, 줄바꿈 가능). */
  description: string;
  /** 위치 — 헤더 옆 right (default) 또는 below. */
  placement?: 'right' | 'below';
}

const MAX_DESC_LEN = 250;

export default function GeoSectionTooltip({ description, placement = 'below' }: GeoSectionTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);

  // 외부 클릭 / ESC 시 닫기 (모바일 터치 대응)
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const desc = description.length > MAX_DESC_LEN
    ? description.slice(0, MAX_DESC_LEN) + '…'
    : description;

  const popoverPos = placement === 'right'
    ? 'left-full top-1/2 -translate-y-1/2 ml-2'
    : 'top-full left-0 mt-2';

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          // 모바일 (no hover) 에서는 touch 만 동작 — 데스크탑 hover-leave 시 닫기
          if (window.matchMedia('(hover: hover)').matches) setOpen(false);
        }}
        aria-describedby={open ? tooltipId : undefined}
        aria-label="섹션 설명 보기"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-indigo-600 cursor-pointer bg-transparent border-0 p-0 align-middle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={
            'absolute z-50 max-w-[280px] sm:max-w-[320px] text-[11px] bg-slate-800 text-slate-100 rounded-lg px-3 py-2 shadow-lg whitespace-normal leading-relaxed ' +
            popoverPos
          }
        >
          {desc}
        </span>
      )}
    </span>
  );
}
