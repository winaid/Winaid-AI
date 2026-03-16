import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const PAD_X = 40;
const GRID_W = 520;
const COL_W = GRID_W / 7;
const HEADER_H = 44;
const ROW_H_FULL = 72;
const ROW_H_WEEKLY = 100;
const GRID_Y = 240;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

export default function T11DarkBlueModern({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const noticeY = safeNum(GRID_Y + calH + 20);
  const noticeH = data.notices ? data.notices.length * 22 + 12 : 0;
  const svgH = safeNum(noticeY + noticeH + 60, 600);
  const scale = safeNum(width / 600, 1);

  const NAVY = '#0D1B3E';
  const NAVY_MID = '#152D5A';
  const NAVY_LIGHT = '#1E3A6E';
  const GOLD = '#D4A872';
  const GOLD_DIM = '#A08050';
  const TEXT_WHITE = '#E8E8F0';
  const TEXT_DIM = '#6880A0';

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
      <defs>
        <linearGradient id="t11-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={NAVY} />
          <stop offset="100%" stopColor="#0A1530" />
        </linearGradient>
      </defs>

      {/* 네이비 풀블리드 배경 — 카드 없음, 전체가 네이비 */}
      <rect width="600" height={svgH} fill="url(#t11-bg)" />

      {/* 상단 골드 얇은 라인 */}
      <line x1="0" y1="0" x2="600" y2="0" stroke={GOLD} strokeWidth="2" />

      {/* 클리닉명 */}
      <text x="300" y="50" textAnchor="middle" fontSize="13"
        fontWeight="500" fill={GOLD} letterSpacing="4">
        {data.clinicName}
      </text>

      {/* 구분 라인 */}
      <line x1="220" y1="65" x2="380" y2="65"
        stroke={GOLD_DIM} strokeWidth="0.6" opacity="0.5" />

      {/* 대형 타이틀 — 흰색 */}
      <text x="300" y="130" textAnchor="middle" fontSize="52"
        fontWeight="900" fill={TEXT_WHITE} letterSpacing="-1">
        {data.title || `${data.monthLabel} 진료일정`}
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="165" textAnchor="middle" fontSize="14"
          fontWeight="400" fill={TEXT_DIM}>
          {data.subtitle}
        </text>
      )}

      {/* 골드 구분선 — 타이틀 아래 */}
      <line x1="200" y1="185" x2="400" y2="185"
        stroke={GOLD_DIM} strokeWidth="0.8" opacity="0.4" />

      {/* 캘린더 — 다크 배경 위 직접 렌더 (카드 없음) */}
      {/* 헤더 행 — 약간 밝은 네이비 */}
      <rect x={PAD_X} y={GRID_Y} width={GRID_W} height={HEADER_H}
        rx="6" fill={NAVY_MID} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(PAD_X + i * COL_W + COL_W / 2)} y={safeNum(GRID_Y + 29)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#FF8A8A' : i === 6 ? '#7AB8FF' : 'rgba(255,255,255,0.8)'}
        >
          {day}
        </text>
      ))}

      {/* 캘린더 본문 — 네이비 배경 위에 직접 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(GRID_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {/* 줄 구분 — 어두운 네이비 라인 */}
            {wi < weeks.length - 1 && (
              <line x1={PAD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(PAD_X + GRID_W)} y2={safeNum(rowY + ROW_H)}
                stroke={NAVY_LIGHT} strokeWidth="0.8" />
            )}

            {week.map((cell, di) => {
              const cellCx = safeNum(PAD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? '#FF8A8A' : di === 6 ? '#7AB8FF' : TEXT_WHITE;
              if (!current) numColor = '#3A4A60';

              const isClosed = hasEvent && event!.type === 'closed';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cellCx} cy={safeNum(rowY + 26)} r={28}
                      fill={event!.color ?? GOLD} opacity={0.15} />
                  )}
                  {/* 이벤트: 골드 원형 배지 */}
                  {hasEvent && (
                    <circle cx={cellCx} cy={safeNum(rowY + 26)} r={20}
                      fill={isClosed ? '#C04040' : GOLD}
                      opacity={isClosed ? 0.9 : 0.85} />
                  )}
                  <text x={cellCx} y={safeNum(rowY + 32)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={hasEvent ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cellCx} y={safeNum(rowY + 52)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '11'}
                      fontWeight="700"
                      fill={isClosed ? '#FF8A8A' : GOLD}
                    >
                      {event!.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* 안내사항 — 네이비 배경 위 밝은 텍스트 */}
      {data.notices && data.notices.map((notice, i) => (
        <text key={i} x="300" y={safeNum(noticeY + 8 + i * 22)}
          textAnchor="middle" fontSize="12.5" fontWeight="400"
          fill={TEXT_DIM} letterSpacing="0.3">
          {notice}
        </text>
      ))}

      {/* 하단 — 골드 라인 + 클리닉명 */}
      <line x1="0" y1={safeNum(svgH - 1)} x2="600" y2={safeNum(svgH - 1)}
        stroke={GOLD} strokeWidth="2" />
      <text x="300" y={safeNum(svgH - 18)}
        textAnchor="middle" fontSize="13" fontWeight="600"
        fill={GOLD} letterSpacing="2">
        {data.clinicName}
      </text>
    </svg>
  );
}
