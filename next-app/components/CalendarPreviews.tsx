/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 (AI 생성 정적 이미지)
 *
 * public/calendar-previews/{themeValue}.png 이미지를 표시.
 * 로드 실패 시 groupColor 배경 + 이름 fallback.
 */
'use client';

import { useState } from 'react';

/* ── 템플릿 이름 매핑 (fallback 표시용) ── */
const THEME_NAMES: Record<string, string> = {
  sch_spreadsheet: '실무 스프레드시트',
  sch_charcoal_frame: '차콜 프레임',
  sch_modern_note: '모던 미니멀',
  sch_night_clinic: '야간진료',
  sch_blushy_rose: '블러시 로즈',
  sch_sns_bold: 'SNS 볼드',
  sch_lavender_soft: '라벤더 소프트',
  sch_korean_classic: '한방 전통',
  sch_deep_frost: '딥블루 프로스트',
  sch_gold_classic: '골드 클래식',
  sch_premium_green: '프리미엄 그린',
  sch_navy_modern: '네이비 모던',
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
