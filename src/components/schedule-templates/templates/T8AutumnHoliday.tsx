import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 40;
const CARD_W = 520;
const COL_W = CARD_W / 7;
const HEADER_H = 40;
const ROW_H_FULL = 78;
const ROW_H_WEEKLY = 110;
const CARD_Y = 195;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Decorative maple leaf for corners */
function AutumnLeaf({ x, y, size = 1, rot = 0, color = '#C97B3A' }: {
  x: number; y: number; size?: number; rot?: number; color?: string;
}) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rot)}) scale(${safeNum(size, 1)})`}>
      <path
        d="M0,-30 C4,-22 12,-16 8,-8 C14,-12 20,-2 12,2 C18,6 14,14 8,10 C10,16 4,20 0,30
           C-4,20 -10,16 -8,10 C-14,14 -18,6 -12,2 C-20,-2 -14,-12 -8,-8 C-12,-16 -4,-22 0,-30 Z"
        fill={color}
        opacity="0.85"
      />
      <line x1="0" y1="30" x2="0" y2="44" stroke={color} strokeWidth="2.5" opacity="0.7" />
    </g>
  );
}

/** Small round leaf for variety */
function RoundLeaf({ x, y, size = 1, rot = 0, color = '#D4A24E' }: {
  x: number; y: number; size?: number; rot?: number; color?: string;
}) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rot)}) scale(${safeNum(size, 1)})`}>
      <ellipse cx="0" cy="0" rx="14" ry="18" fill={color} opacity="0.75" />
      <line x1="0" y1="-16" x2="0" y2="18" stroke={color} strokeWidth="1.5" opacity="0.5" />
    </g>
  );
}

/** Brown brush stroke accent */
function BrushStroke({ x, y, rot = 0, width: w = 60 }: {
  x: number; y: number; rot?: number; width?: number;
}) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rot)})`}>
      <rect x={0} y={0} width={safeNum(w)} height="6" rx="3" fill="#8B6914" opacity="0.18" />
      <rect x={safeNum(w * 0.15)} y={8} width={safeNum(w * 0.7)} height="4" rx="2" fill="#8B6914" opacity="0.12" />
    </g>
  );
}

export default function T8AutumnHoliday({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const noticeH = data.notices && data.notices.length > 0 ? safeNum(24 + data.notices.length * 20) : 0;
  const cardH = safeNum(calH + noticeH + 30);
  const svgH = safeNum(CARD_Y + cardH + 60, 600);
  const scale = safeNum(width / 600, 1);

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
        <filter id="t8-shadow">
          <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="rgba(80,50,10,0.12)" />
        </filter>
      </defs>

      {/* Beige/cream background */}
      <rect width="600" height={svgH} fill="#FDF5EC" />

      {/* Corner leaves — top-left (크기/밀도 강화 → 썸네일에서 가을 즉시 인지) */}
      <AutumnLeaf x={30} y={35} size={1.8} rot={-20} color="#C0543B" />
      <AutumnLeaf x={85} y={20} size={1.3} rot={15} color="#D4A24E" />
      <RoundLeaf x={50} y={90} size={1.2} rot={30} color="#B8862D" />
      <AutumnLeaf x={130} y={55} size={1.0} rot={-35} color="#C97B3A" />

      {/* Corner leaves — top-right */}
      <AutumnLeaf x={570} y={30} size={1.9} rot={25} color="#C97B3A" />
      <RoundLeaf x={520} y={50} size={1.3} rot={-10} color="#C0543B" />
      <AutumnLeaf x={545} y={100} size={1.1} rot={45} color="#D4A24E" />
      <RoundLeaf x={475} y={30} size={0.9} rot={20} color="#B8862D" />

      {/* Corner leaves — bottom-left */}
      <AutumnLeaf x={25} y={safeNum(svgH - 45)} size={1.5} rot={20} color="#B8862D" />
      <RoundLeaf x={80} y={safeNum(svgH - 30)} size={1.1} rot={-15} color="#C97B3A" />
      <AutumnLeaf x={120} y={safeNum(svgH - 55)} size={0.9} rot={40} color="#D4A24E" />

      {/* Corner leaves — bottom-right */}
      <AutumnLeaf x={575} y={safeNum(svgH - 40)} size={1.6} rot={-25} color="#C0543B" />
      <RoundLeaf x={525} y={safeNum(svgH - 25)} size={1.2} rot={10} color="#D4A24E" />
      <AutumnLeaf x={480} y={safeNum(svgH - 55)} size={0.9} rot={-40} color="#B8862D" />

      {/* White card with shadow */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="14" fill="white" filter="url(#t8-shadow)" />

      {/* Decorative tape/sticker at top of card */}
      <rect x={safeNum(300 - 30)} y={safeNum(CARD_Y - 10)} width="60" height="20"
        rx="3" fill="#D4A24E" opacity="0.6" />

      {/* Subtitle — "Holiday Notice" */}
      <text x="300" y="135" textAnchor="middle" fontSize="14" fontWeight="600"
        fill="#6B7F3A" letterSpacing="4">
        Holiday Notice
      </text>

      {/* Large bold title */}
      <text x="300" y="175" textAnchor="middle" fontSize="46" fontWeight="900"
        fill="#2C1810" letterSpacing="-1">
        {data.title || `${data.monthLabel} 휴무`}
      </text>

      {/* Calendar header row */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="14" fill="#F5EDE0" />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill="#F5EDE0" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 27)}
          textAnchor="middle" fontSize="13" fontWeight="700"
          fill={i === 0 ? '#C0543B' : '#6B5D4F'}
        >
          {day}
        </text>
      ))}

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#EDE5D8" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              const isClosed = hasEvent && event!.type === 'closed';
              const circleR = 20;
              let numColor = di === 0 ? '#C0543B' : '#3C2F24';
              if (!current) numColor = '#CCC4B8';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {/* Circle badge for events */}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={circleR}
                      fill={isClosed ? (event!.color ?? C.closed) : '#F0E0C8'}
                      opacity={isClosed ? 1 : 0.8}
                    />
                  )}

                  {/* Highlight glow */}
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={safeNum(circleR + 5)}
                      fill={isClosed ? (event!.color ?? C.closed) : '#D4A24E'}
                      opacity={0.15} />
                  )}

                  {/* Date number */}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="17"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={isClosed ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>

                  {/* Event label below circle */}
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 58)}
                      textAnchor="middle" fontSize="11" fontWeight="700"
                      fill={isClosed ? (event!.color ?? '#C0543B') : '#8B7355'}
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

      {/* Notice section below calendar */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <line x1={safeNum(CARD_X + 20)} y1={safeNum(CARD_Y + calH + 14)}
            x2={safeNum(CARD_X + CARD_W - 20)} y2={safeNum(CARD_Y + calH + 14)}
            stroke="#E8DDD0" strokeWidth="1" />
          {data.notices.map((notice, i) => (
            <text key={i}
              x={safeNum(CARD_X + CARD_W / 2)}
              y={safeNum(CARD_Y + calH + 34 + i * 20)}
              textAnchor="middle" fontSize="12" fontWeight="400" fill="#7A6B5A"
            >
              {notice}
            </text>
          ))}
        </g>
      )}

      {/* Footer — clinic name */}
      <text x="300" y={safeNum(CARD_Y + cardH + 40)}
        textAnchor="middle" fontSize="16" fontWeight="800" fill="#4A2D6F"
        letterSpacing="1">
        {data.clinicName}
      </text>
    </svg>
  );
}
