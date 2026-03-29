/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 (정적 이미지)
 *
 * public/calendar-previews/{themeValue}.jpg → .png 순서로 시도.
 * 둘 다 실패 시 groupColor 배경 + 이름 fallback.
 */
'use client';

import { useState } from 'react';

const THEME_NAMES: Record<string, string> = {
  sch_cherry_blossom: '벚꽃',
  sch_maple_autumn: '단풍',
  sch_snowflake_winter: '눈꽃',
  sch_korean_classic: '한방 전통',
  sch_bojagi_holiday: '보자기 명절',
  sch_ink_wash: '수묵화',
  sch_clean_blue: '클린 블루',
  sch_rose_gold: '로즈 골드',
  sch_green_botanical: '그린 보태니컬',
  sch_kids_pastel: '키즈 파스텔',
  sch_taegeuk_national: '태극기',
  sch_christmas: '크리스마스',
};

export function CalendarThemePreview({
  themeValue,
  groupColor,
  size = 'sm',
}: {
  themeValue: string;
  groupColor?: string;
  size?: 'sm' | 'lg';
}) {
  const [tryPng, setTryPng] = useState(false);
  const [allFailed, setAllFailed] = useState(false);
  const lg = size === 'lg';
  const rd = lg ? 'rounded-xl' : 'rounded-lg';
  const imgSrc = `/calendar-previews/${themeValue}.${tryPng ? 'png' : 'jpg'}`;

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
          {THEME_NAMES[themeValue] || themeValue}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={THEME_NAMES[themeValue] || themeValue}
      loading="lazy"
      onError={() => {
        if (!tryPng) setTryPng(true);
        else setAllFailed(true);
      }}
      className={`w-full h-full object-cover ${rd}`}
    />
  );
}
