'use client';

/**
 * GeoLoadingSpinner — 분석 중 통일 spinner (GEO-UX-1).
 *
 * 양 앱 lockstep. 8 GEO 섹션 로딩 시 표시 (각자 다른 spinner 제거).
 */

export interface GeoLoadingSpinnerProps {
  /** 로딩 메시지 (옵션). */
  message?: string;
  /** 크기 — sm: 작은 inline, md: 카드 안. */
  size?: 'sm' | 'md';
}

export default function GeoLoadingSpinner({ message, size = 'md' }: GeoLoadingSpinnerProps) {
  const spinnerSize = size === 'sm' ? 'h-3 w-3' : 'h-5 w-5';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  return (
    <div className={size === 'sm' ? 'inline-flex items-center gap-1.5' : 'flex items-center justify-center gap-2 py-4'}>
      <svg
        className={'animate-spin text-indigo-600 ' + spinnerSize}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-label="로딩 중"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {message && <span className={textSize + ' text-slate-500'}>{message}</span>}
    </div>
  );
}
