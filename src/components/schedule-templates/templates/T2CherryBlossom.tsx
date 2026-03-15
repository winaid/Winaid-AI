import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 540 / 7;
const CARD_X = 30;
const CARD_W = 540;
const HEADER_H = 44;
const ROW_H_FULL = 78;
const ROW_H_WEEKLY = 108;
const CARD_Y = 260;

/**
 * T2 — 소프트 브랜딩 (Soft Branding)
 *
 * 성격: 클리닉 브랜드 아이덴티티를 자연스럽게 노출
 * 차별점: 큰 로고/클리닉명 영역 + 소프트 핑크 브랜딩 컬러
 * 대상: "우리 병원 이름이 잘 보이는 안내"를 원하는 클리닉
 */

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Subtle petal accent (restrained) */
function PetalAccent({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`${safeTranslate(x, y)} scale(${safeNum(size, 1)})`} opacity="0.4">
      <ellipse cx="0" cy="-6" rx="8" ry="14" fill="#F8BBD0" transform="rotate(-15)" />
      <ellipse cx="8" cy="4" rx="8" ry="14" fill="#F8BBD0" transform="rotate(25)" />
      <ellipse cx="-8" cy="4" rx="8" ry="14" fill="#F8BBD0" transform="rotate(-55)" />
      <circle cx="0" cy="0" r="4" fill="#F48FB1" opacity="0.6" />
    </g>
  );
}

export default function T2CherryBlossom({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 26 + 80, 600);
  const scale = safeNum(width / 600, 1);

  const BRAND_PINK = '#E8638A';
  const SOFT_PINK = '#FDE8EF';
  const DEEP_ROSE = '#C2185B';
  const TEXT_DARK = '#3C1A2A';

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={safeNum(svgH * scale)}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 배경: 소프트 핑크 → 화이트 (브랜딩 톤) */}
      <defs>
        <linearGradient id="t2-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SOFT_PINK} />
          <stop offset="60%" stopColor="white" />
          <stop offset="100%" stopColor="#FAFAFA" />
        </linearGradient>
      </defs>
      <rect width="600" height={svgH} fill="url(#t2-bg)" />

      {/* 소프트 꽃잎 악센트 (절제된 3개) */}
      <PetalAccent x={55} y={50} size={1.8} />
      <PetalAccent x={545} y={45} size={2.0} />
      <PetalAccent x={540} y={safeNum(svgH - 50)} size={1.5} />

      {/* ── 브랜딩 영역: 큰 로고 원 + 클리닉명 ── */}
      <g transform={safeTranslate(300, 80)}>
        {/* 로고 원형 배경 */}
        <circle cx="0" cy="0" r="48" fill={BRAND_PINK} />
        <circle cx="0" cy="0" r="42" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />
        {/* 로고 이니셜 */}
        <text x="0" y="14" textAnchor="middle" fontSize="36"
          fontWeight="900" fill="white">
          {data.clinicName.charAt(0)}
        </text>
      </g>

      {/* 클리닉명 — 브랜드 강조 */}
      <text x="300" y="160" textAnchor="middle" fontSize="26"
        fontWeight="800" fill={TEXT_DARK} letterSpacing="2">
        {data.clinicName}
      </text>

      {/* 브랜드 구분선 */}
      <line x1="200" y1="175" x2="400" y2="175"
        stroke={BRAND_PINK} strokeWidth="1.5" opacity="0.5" />

      {/* 월 제목 */}
      <text x="300" y="215" textAnchor="middle" fontSize="38"
        fontWeight="900" fill={TEXT_DARK}>
        {data.monthLabel} 진료일정
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="242" textAnchor="middle" fontSize="13"
          fill={BRAND_PINK} fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 카드 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="10" fill="white" stroke="#F0D8E0" strokeWidth="1" />

      {/* 캘린더 헤더 — 브랜드 핑크 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="10" fill={BRAND_PINK} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={BRAND_PINK} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 29)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#FFD0D0' : 'white'}
        >
          {day}
        </text>
      ))}

      {/* 캘린더 행 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#F5E0E8" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? DEEP_ROSE : TEXT_DARK;
              if (!current) numColor = '#D0C0C8';

              const evColor = event?.color ?? BRAND_PINK;

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={evColor} opacity={0.15} />
                  )}
                  {/* 브랜딩형 이벤트: 소프트 원형 배경 */}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={22}
                      fill={evColor} opacity="0.12" />
                  )}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={hasEvent ? evColor : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 56)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '10.5'}
                      fontWeight={isHighlight ? '700' : '600'}
                      fill={evColor}>
                      {event!.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* 안내사항 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          {data.notices.map((n, i) => (
            <g key={i}>
              <circle cx={safeNum(CARD_X + 14)} cy={safeNum(CARD_Y + cardH + 20 + i * 26)}
                r="2.5" fill={BRAND_PINK} />
              <text x={safeNum(CARD_X + 24)} y={safeNum(CARD_Y + cardH + 25 + i * 26)}
                fontSize="12" fill={TEXT_DARK} fontWeight="400">
                {n}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* 하단 브랜딩 푸터 */}
      <g transform={safeTranslate(300, safeNum(svgH - 35))}>
        <circle cx="-70" cy="0" r="12" fill={BRAND_PINK} />
        <text x="-70" y="5" textAnchor="middle" fontSize="11"
          fontWeight="900" fill="white">
          {data.clinicName.charAt(0)}
        </text>
        <text x="-45" y="5" fontSize="15" fontWeight="700" fill={TEXT_DARK}>
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
