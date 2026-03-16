import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 500 / 7;
const CARD_X = 50;
const CARD_W = 500;
const HEADER_H = 44;
const ROW_H_FULL = 74;
const ROW_H_WEEKLY = 104;
const CARD_Y = 290;

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  closed:  { bg: '#C4564A', text: 'white' },
  night:   { bg: '#2C3E50', text: 'white' },
  normal:  { bg: '#C4A44A', text: 'white' },
  seminar: { bg: '#5D6B3A', text: 'white' },
  custom:  { bg: '#8B7355', text: 'white' },
};

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

export default function T4KoreanTraditional({ data, width = 600, colors, mode = 'full' }: Props) {
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
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 80, 600);
  const scale = safeNum(width / 600, 1);

  const INK = '#1E1E1E';
  const INK_MID = '#2A2A2A';
  const GOLD = '#C4A44A';
  const GOLD_DIM = '#8B7940';
  const TEXT_GOLD = '#E8D5A0';

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
        <linearGradient id="t4-ink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={INK} />
          <stop offset="100%" stopColor={INK_MID} />
        </linearGradient>
      </defs>

      {/* 먹색 배경 — 수묵 한의원 */}
      <rect width="600" height={svgH} fill="url(#t4-ink)" />

      {/* 중앙 큰 금색 원 — 핵심 시각 훅 (月 심볼) */}
      <circle cx="300" cy="155" r="90" fill="none" stroke={GOLD} strokeWidth="2" opacity="0.6" />
      <circle cx="300" cy="155" r="82" fill="none" stroke={GOLD} strokeWidth="0.8" opacity="0.3" />
      <circle cx="300" cy="155" r="70" fill={GOLD} opacity="0.25" />

      {/* 클리닉명 — 원 위 */}
      <text x="300" y="60" textAnchor="middle" fontSize="13"
        fontWeight="500" fill={TEXT_GOLD} letterSpacing="5" opacity="0.7">
        {data.clinicName}
      </text>

      {/* 월 — 원 안에 대형 */}
      <text x="300" y="170" textAnchor="middle" fontSize="56"
        fontWeight="300" fill={GOLD} letterSpacing="4">
        {data.monthLabel}
      </text>

      {/* 진료일정 — 원 아래 */}
      <text x="300" y="220" textAnchor="middle" fontSize="18"
        fontWeight="600" fill={TEXT_GOLD} letterSpacing="6">
        진료일정
      </text>

      {/* 금 구분선 */}
      <line x1="220" y1="240" x2="380" y2="240"
        stroke={GOLD} strokeWidth="0.8" opacity="0.5" />

      {/* 부제 */}
      {data.subtitle && data.subtitle.split('\n').map((line, i) => (
        <text key={i} x="300" y={safeNum(264 + i * 20)}
          textAnchor="middle" fontSize="12" fill={TEXT_GOLD} opacity="0.6">
          {line}
        </text>
      ))}

      {/* 캘린더 — 배경 어두운 상태에서 흰 카드 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="4" fill="rgba(255,255,255,0.06)" stroke={GOLD_DIM} strokeWidth="0.8" />

      {/* 캘린더 헤더 — 금색 배경 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="4" fill={GOLD_DIM} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={GOLD_DIM} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 30)}
          textAnchor="middle" fontSize="14" fontWeight="600"
          fill={i === 0 ? '#FFB8A8' : '#F5EDD5'}
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
                stroke={GOLD_DIM} strokeWidth="0.5" opacity="0.4" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const typeColors = hasEvent ? (TYPE_COLORS[event!.type] ?? TYPE_COLORS.custom) : null;

              let numColor = di === 0 ? '#E88A7A' : TEXT_GOLD;
              if (!current) numColor = '#555';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={event!.color ?? typeColors!.bg} opacity={0.2} />
                  )}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={22}
                      fill={event!.color ?? typeColors!.bg} opacity="0.85" />
                  )}
                  <text x={cx} y={safeNum(rowY + 32)}
                    textAnchor="middle" fontSize="15"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={hasEvent ? typeColors!.text : numColor}
                  >
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 52)}
                      textAnchor="middle" fontSize={isHighlight ? '11.5' : '10'}
                      fontWeight={isHighlight ? '800' : '600'}
                      fill={event!.color ?? typeColors!.bg}>
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
      {data.notices && data.notices.length > 0 && data.notices.map((n, i) => (
        <text key={i} x="300" y={safeNum(CARD_Y + cardH + 22 + i * 22)}
          textAnchor="middle" fontSize="11.5" fill={TEXT_GOLD} opacity="0.6">
          {n}
        </text>
      ))}

      {/* 하단 — 클리닉명 */}
      <g transform={safeTranslate(300, safeNum(svgH - 35))}>
        <line x1="-60" y1="-10" x2="60" y2="-10"
          stroke={GOLD} strokeWidth="0.6" opacity="0.4" />
        <text x="0" y="8" textAnchor="middle" fontSize="13"
          fontWeight="500" fill={TEXT_GOLD} letterSpacing="3" opacity="0.7">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
