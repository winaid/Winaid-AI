/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 (AI 생성 정적 이미지)
 *
 * public/calendar-previews/{themeValue}.png 이미지를 표시.
 * 로드 실패 시 groupColor 배경 + 이름 fallback.
 */
'use client';

import { useState } from 'react';

const THEME_NAMES: Record<string, string> = {
  sch_cherry_blossom: '벚꽃 봄',
  sch_sunflower_summer: '해바라기 여름',
  sch_maple_autumn: '단풍 가을',
  sch_snowflake_winter: '눈꽃 겨울',
  sch_korean_classic: '한방 전통',
  sch_bojagi_holiday: '보자기 명절',
  sch_ink_wash: '수묵화',
  sch_navy_professional: '네이비 프로',
  sch_mint_wellness: '민트 웰니스',
  sch_coral_sns: '코랄 SNS',
  sch_kids_pastel: '키즈 파스텔',
  sch_beige_gold: '베이지 골드',
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
  const [imgError, setImgError] = useState(false);
  const lg = size === 'lg';
  const rd = lg ? 'rounded-xl' : 'rounded-lg';

  if (imgError) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center ${rd}`}
        style={{ background: groupColor || '#64748b' }}
      >
        <span className={`${lg ? 'text-[11px]' : 'text-[7px]'} font-bold text-white text-center leading-tight px-1`}>
          {THEME_NAMES[themeValue] || themeValue}
        </span>
      </div>
    );
  }

  return (
    <img
      src={`/calendar-previews/${themeValue}.png`}
      alt={THEME_NAMES[themeValue] || themeValue}
      loading="lazy"
      onError={() => setImgError(true)}
      className={`w-full h-full object-cover ${rd}`}
    />
  );
}
