import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', serif";
const COL_W = 540 / 7;  // card inner width
const CARD_X = 30;
const HEADER_H = 46;
const ROW_H_FULL = 74;
const ROW_H_WEEKLY = 105;

// Event type → circle color mapping
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  closed:  { bg: '#8B1A2A', text: 'white' },
  night:   { bg: '#6A1B9A', text: 'white' },
  normal:  { bg: '#1565C0', text: 'white' },
  seminar: { bg: '#37474F', text: 'white' },
  custom:  { bg: '#FF6F00', text: 'white' },
};

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

function Crane({ x, y, size = 1, flip = false }: { x: number; y: number; size?: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`${safeTranslate(x, y)} scale(${safeNum(s * size, 1)},${safeNum(size, 1)})`} opacity="0.7">
      {/* Body */}
      <ellipse cx="0" cy="0" rx="22" ry="10" fill="#B0BEC5" transform="rotate(-10)" />
      {/* Neck */}
      <path d="M 12,-8 Q 20,-25 18,-38" stroke="#B0BEC5" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Head */}
      <circle cx="18" cy="-40" r="6" fill="#B0BEC5" />
      {/* Red cap */}
      <ellipse cx="18" cy="-44" rx="4" ry="2.5" fill="#E53935" />
      {/* Beak */}
      <line x1="24" y1="-40" x2="34" y2="-37" stroke="#78909C" strokeWidth="2" />
      {/* Wing up */}
      <path d="M 0,0 Q -18,-20 -35,-5 Q -18,5 0,0" fill="#CFD8DC" />
      {/* Wing down */}
      <path d="M 0,0 Q -15,15 -30,10 Q -15,2 0,0" fill="#B0BEC5" />
      {/* Tail */}
      <path d="M -22,0 Q -38,5 -42,12 Q -35,8 -22,0" fill="#CFD8DC" />
      {/* Legs */}
      <line x1="5" y1="8" x2="2" y2="28" stroke="#90A4AE" strokeWidth="2" />
      <line x1="-5" y1="8" x2="-8" y2="28" stroke="#90A4AE" strokeWidth="2" />
    </g>
  );
}

function TraditionalCloud({ x, y, w = 80 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={safeTranslate(x, y)} opacity="0.55">
      <ellipse cx="0" cy="0" rx={w * 0.5} ry={w * 0.18} fill="#D4C5A9" />
      <ellipse cx={w * 0.18} cy={w * -0.1} rx={w * 0.22} ry={w * 0.14} fill="#D4C5A9" />
      <ellipse cx={-w * 0.18} cy={w * -0.08} rx={w * 0.2} ry={w * 0.12} fill="#D4C5A9" />
    </g>
  );
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
  const CARD_Y = 260;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 20);
  const svgH = safeNum(CARD_Y + cardH + 90, 600);
  const scale = safeNum(width / 600, 1);

  // Find the "special" date (date=1 or any highlighted date for outline circle)
  const specialDate = data.events.find(e => e.date === 1 && e.type === 'normal');

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={svgH * scale}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="t4-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5EDD5" />
          <stop offset="100%" stopColor="#EDE0C4" />
        </linearGradient>
      </defs>

      {/* Beige background */}
      <rect width="600" height={svgH} fill="url(#t4-bg)" />

      {/* Traditional corner patterns (simplified geometric) */}
      {[0, 1, 2, 3].map(i => {
        const x = i % 2 === 0 ? 8 : 584;
        const y = i < 2 ? 8 : svgH - 8;
        const r = i < 2 ? 0 : 180;
        return (
          <g key={i} transform={`${safeTranslate(x, y)} rotate(${safeNum(r)})`} opacity="0.4">
            <rect x="0" y="0" width="22" height="22" fill="none" stroke="#8B6914" strokeWidth="1.5" />
            <rect x="3" y="3" width="16" height="16" fill="none" stroke="#8B6914" strokeWidth="1" />
            <line x1="0" y1="11" x2="8" y2="11" stroke="#8B6914" strokeWidth="1" />
            <line x1="11" y1="0" x2="11" y2="8" stroke="#8B6914" strokeWidth="1" />
          </g>
        );
      })}

      {/* Cranes */}
      <Crane x={70} y={90} size={0.9} />
      <Crane x={520} y={svgH - 100} size={0.85} flip />

      {/* Traditional clouds */}
      <TraditionalCloud x={20} y={35} w={90} />
      <TraditionalCloud x={460} y={30} w={100} />
      <TraditionalCloud x={200} y={20} w={70} />
      <TraditionalCloud x={20} y={svgH - 40} w={80} />
      <TraditionalCloud x={480} y={svgH - 35} w={90} />

      {/* Mountain outline at bottom */}
      <path
        d={`M 0,${svgH} Q 80,${svgH - 60} 160,${svgH - 95} Q 240,${svgH - 130} 300,${svgH - 105}
            Q 380,${svgH - 80} 440,${svgH - 110} Q 520,${svgH - 75} 600,${svgH - 55} L 600,${svgH} Z`}
        fill="#C8A96E" opacity="0.25"
      />

      {/* Title */}
      <text x="300" y="195" textAnchor="middle" fontSize="46" fontWeight="900"
        fill="#3E2A0A" letterSpacing="2">
        {data.monthLabel} 진료일정
      </text>

      {/* Subtitle */}
      {data.subtitle && data.subtitle.split('\n').map((line, i) => (
        <text key={i} x="300" y={228 + i * 22}
          textAnchor="middle" fontSize="14" fill="#6B4C1A">
          {line}
        </text>
      ))}

      {/* Calendar card */}
      <rect x={CARD_X} y={CARD_Y} width="540" height={cardH}
        rx="6" fill="white" stroke="#D4C5A9" strokeWidth="1.5" />

      {/* Header row */}
      <rect x={CARD_X} y={CARD_Y} width="540" height={HEADER_H}
        rx="6" fill="white" stroke="#D4C5A9" strokeWidth="1" />
      <rect x={CARD_X} y={CARD_Y + HEADER_H / 2} width="540" height={HEADER_H / 2} fill="white" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <g key={day}>
          {i > 0 && (
            <line x1={CARD_X + i * COL_W} y1={CARD_Y}
              x2={CARD_X + i * COL_W} y2={CARD_Y + cardH}
              stroke="#E8DCC8" strokeWidth="1" />
          )}
          <text
            x={CARD_X + i * COL_W + COL_W / 2} y={CARD_Y + 31}
            textAnchor="middle" fontSize="15" fontWeight="600"
            fill={i === 0 ? '#8B1A2A' : '#3E2A0A'}
          >
            {day}
          </text>
        </g>
      ))}

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = CARD_Y + HEADER_H + wi * ROW_H;
        return (
          <g key={wi}>
            <line x1={CARD_X} y1={rowY + ROW_H} x2={CARD_X + 540} y2={rowY + ROW_H}
              stroke="#E8DCC8" strokeWidth="1" />

            {week.map((cell, di) => {
              const cx = CARD_X + di * COL_W + COL_W / 2;
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;

              let numColor = di === 0 ? '#8B1A2A' : '#3E2A0A';
              if (!current) numColor = '#C4B8A0';

              const hasEvent = !!event && current;
              const typeColors = hasEvent ? (TYPE_COLORS[event!.type] ?? TYPE_COLORS.custom) : null;
              const dimmed = isHighlight && current && !hasEvent;

              // Special: date=1 gets outline circle instead of filled
              const isSpecial = cell.day === 1 && current && specialDate;

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {/* Highlight glow */}
                  {isHighlight && hasEvent && !isSpecial && (
                    <circle cx={cx} cy={rowY + 28} r={30} fill={event!.color ?? typeColors!.bg} opacity={0.18} />
                  )}
                  {/* Filled circle for events */}
                  {hasEvent && !isSpecial && (
                    <circle cx={cx} cy={rowY + 28} r={24} fill={event!.color ?? typeColors!.bg} />
                  )}
                  {/* Outline circle for special date */}
                  {isSpecial && (
                    <>
                      <circle cx={cx} cy={rowY + 28} r={24}
                        fill="none" stroke="#C62828" strokeWidth="2" strokeDasharray="4,2" />
                      {/* Star accent */}
                      <text x={cx + 20} y={rowY + 6} fontSize="12" fill="#C62828">✦</text>
                    </>
                  )}

                  <text x={cx} y={rowY + 34}
                    textAnchor="middle" fontSize="15"
                    fontWeight={hasEvent ? '700' : '500'}
                    fill={hasEvent ? (isSpecial ? '#C62828' : typeColors!.text) : numColor}
                  >
                    {cell.day}
                  </text>

                  {hasEvent && (
                    <text x={cx} y={rowY + 54}
                      textAnchor="middle" fontSize={isHighlight ? '11.5' : '10'} fontWeight={isHighlight ? '800' : '600'}
                      fill={isSpecial ? '#C62828' : (event!.color ?? typeColors!.bg)}
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

      {/* Footer logo area */}
      <g transform={safeTranslate(300, CARD_Y + cardH + 60)}>
        {/* B circle icon */}
        <circle cx="-60" cy="0" r="18" fill="#1565C0" />
        <text x="-60" y="6" textAnchor="middle" fontSize="16" fontWeight="900" fill="white">B</text>
        <text x="-28" y="6" fontSize="18" fontWeight="800" fill="#3E2A0A">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
