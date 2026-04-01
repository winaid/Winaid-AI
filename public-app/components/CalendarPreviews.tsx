/**
 * ThemePreview.tsx — 범용 카테고리 템플릿 프리뷰 (정적 이미지)
 *
 * public/{category}-previews/{themeValue}.jpg → .png 순서로 시도.
 * 둘 다 실패 시 groupColor 배경 + 이름 fallback.
 *
 * 8개 카테고리 폴더:
 * schedule-previews, event-previews, doctor-previews, notice-previews,
 * greeting-previews, hiring-previews, caution-previews, pricing-previews
 */
'use client';

import { useState } from 'react';

export function ThemePreview({
  themeValue,
  category,
  groupColor,
  label,
  size = 'sm',
}: {
  themeValue: string;
  category: string;
  groupColor?: string;
  label?: string;
  size?: 'sm' | 'lg';
}) {
  const [tryPng, setTryPng] = useState(false);
  const [allFailed, setAllFailed] = useState(false);
  const lg = size === 'lg';
  const rd = lg ? 'rounded-xl' : 'rounded-lg';
  const imgSrc = `/${category}-previews/${themeValue}.${tryPng ? 'png' : 'jpg'}`;

  if (allFailed) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center ${rd}`}
        style={{ background: groupColor || '#64748b' }}
      >
        <span
          className="text-white text-center font-semibold leading-tight px-1"
          style={{ fontSize: lg ? 12 : 9 }}
        >
          {label || themeValue}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={label || themeValue}
      loading="lazy"
      onError={() => {
        if (!tryPng) setTryPng(true);
        else setAllFailed(true);
      }}
      className={`w-full h-full object-cover ${rd}`}
    />
  );
}

// 하위 호환: 기존 CalendarThemePreview를 ThemePreview로 래핑
export function CalendarThemePreview({
  themeValue,
  groupColor,
  size = 'sm',
}: {
  themeValue: string;
  groupColor?: string;
  size?: 'sm' | 'lg';
}) {
  return (
    <ThemePreview
      themeValue={themeValue}
      category="schedule"
      groupColor={groupColor}
      size={size}
    />
  );
}
