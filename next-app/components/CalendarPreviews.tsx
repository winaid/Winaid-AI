/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 컴포넌트
 *
 * public/calendar-previews/{themeValue}.png 정적 이미지를 표시.
 * 이미지 로드 실패 시 groupColor 배경 + 텍스트 fallback.
 */
'use client';

import { useState } from 'react';

export function CalendarThemePreview({
  themeValue,
  groupColor,
  size = 'sm',
}: {
  themeValue: string;
  groupColor?: string;
  size?: 'sm' | 'lg';
}) {
  const [imgError, setImgError] = useState(false);
  const lg = size === 'lg';
  const imgSrc = `/calendar-previews/${themeValue}.png`;

  if (imgError) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center ${lg ? 'rounded-xl' : 'rounded-lg'}`}
        style={{ background: groupColor || '#64748b' }}
      >
        <span className={`${lg ? 'text-[11px]' : 'text-[6px]'} font-bold text-white text-center leading-tight px-1`}>
          {themeValue}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={themeValue}
      loading="lazy"
      onError={() => setImgError(true)}
      className={`w-full h-full object-cover ${lg ? 'rounded-xl' : 'rounded-lg'}`}
    />
  );
}
