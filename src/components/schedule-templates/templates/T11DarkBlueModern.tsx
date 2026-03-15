import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const PAD_X = 30;
const GRID_W = 540;
const COL_W = GRID_W / 7;
const HEADER_H = 44;
const ROW_H_FULL = 72;
const ROW_H_WEEKLY = 100;
const GRID_Y = 230;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Quarter-circle halftone dot pattern */
function HalftoneDots({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const dots: { cx: number; cy: number; r: number }[] = [];
  const maxR = 90;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6 - row; col++) {
      const dx = col * 16 + 8;
      const dy = row * 16 + 8;
      if (Math.sqrt(dx * dx + dy * dy) < maxR) {
        dots.push({ cx: dx, cy: dy, r: 3.2 - row * 0.3 });
      }
    }
  }
  const sx = flip ? -1 : 1;
  const sy = 1;
  return (
    <g transform={safeTranslate(x, y)} opacity="0.25">
      {dots.map((d, i) => (
        <circle key={i} cx={safeNum(d.cx * sx)} cy={safeNum(d.cy * sy)}
          r={safeNum(Math.max(d.r, 1.2))} fill="#5A8DBF" />
      ))}
    </g>
  );
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
  const noticeY = safeNum(GRID_Y + calH + 24);
  const noticeH = data.notices ? data.notices.length * 22 + 16 : 0;
  const svgH = safeNum(noticeY + noticeH + 70, 600);
  const scale = safeNum(width / 600, 1);

  const eventDates = new Set(data.events.map(e => e.date));

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  /** Check if a column (day-of-week index) has any event in visible weeks */
  function columnHasEvent(di: number): boolean {
    return weeks.some(week =>
      week[di] && week[di].isCurrentMonth && eventDates.has(week[di].day)
    );
  }

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

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
          <stop offset="0%" stopColor="#0D1B3E" />
          <stop offset="100%" stopColor="#162850" />
        </linearGradient>
      </defs>

      {/* Dark navy background */}
      <rect width="600" height={svgH} fill="url(#t11-bg)" />

      {/* Halftone dot decorations in corners */}
      <HalftoneDots x={8} y={8} />
      <HalftoneDots x={592} y={8} flip />
      <HalftoneDots x={8} y={safeNum(svgH - 8)} />
      <HalftoneDots x={592} y={safeNum(svgH - 8)} flip />

      {/* Clinic name with thin white rectangular border frame */}
      <rect x="160" y="30" width="280" height="40" rx="3"
        fill="none" stroke="white" strokeWidth="1.2" opacity="0.8" />
      <text x="300" y="58" textAnchor="middle" fontSize="16"
        fontWeight="600" fill="white" letterSpacing="2">
        {data.clinicName}
      </text>

      {/* Large bold title */}
      <text x="300" y="130" textAnchor="middle" fontSize="48"
        fontWeight="900" fill="white" letterSpacing="-1">
        {data.title || `${data.monthLabel} 휴진 일정`}
      </text>

      {/* Subtitle */}
      {data.subtitle && (
        <text x="300" y="165" textAnchor="middle" fontSize="14"
          fontWeight="400" fill="#8AAED4">
          {data.subtitle}
        </text>
      )}

      {/* Thin decorative line under title */}
      <line x1="180" y1="180" x2="420" y2="180"
        stroke="#3A5E8C" strokeWidth="1" opacity="0.6" />

      {/* ── Calendar grid ── */}
      {/* Column background fills */}
      {DAY_LABELS.map((_, di) => {
        const cx = safeNum(PAD_X + di * COL_W);
        const colBg = columnHasEvent(di) ? '#1A2F55' : (di % 2 === 0 ? '#FFFFFF' : '#F0F5FF');
        const isEventCol = columnHasEvent(di);
        return (
          <rect key={di} x={cx} y={GRID_Y} width={COL_W} height={calH}
            fill={isEventCol ? '#1A2F55' : colBg}
            opacity={isEventCol ? 1 : 1} />
        );
      })}

      {/* Header row background */}
      <rect x={PAD_X} y={GRID_Y} width={GRID_W} height={HEADER_H}
        fill="#1E3A68" />

      {/* Header day labels */}
      {DAY_LABELS.map((day, i) => (
        <text key={day}
          x={safeNum(PAD_X + i * COL_W + COL_W / 2)} y={safeNum(GRID_Y + 29)}
          textAnchor="middle" fontSize="15" fontWeight="700"
          fill={i === 0 ? '#FF8A8A' : i === 6 ? '#7AB8FF' : 'white'}
        >
          {day}
        </text>
      ))}

      {/* Grid outer border */}
      <rect x={PAD_X} y={GRID_Y} width={GRID_W} height={calH}
        fill="none" stroke="#2A4A7A" strokeWidth="1.5" />

      {/* Header bottom border */}
      <line x1={PAD_X} y1={safeNum(GRID_Y + HEADER_H)}
        x2={safeNum(PAD_X + GRID_W)} y2={safeNum(GRID_Y + HEADER_H)}
        stroke="#2A4A7A" strokeWidth="1.5" />

      {/* Calendar body rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(GRID_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {/* Row bottom line */}
            {wi < weeks.length - 1 && (
              <line x1={PAD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(PAD_X + GRID_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#D8DFE8" strokeWidth="0.7" />
            )}

            {/* Column dividers */}
            {[1, 2, 3, 4, 5, 6].map(di => (
              <line key={di}
                x1={safeNum(PAD_X + di * COL_W)} y1={rowY}
                x2={safeNum(PAD_X + di * COL_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#D8DFE8" strokeWidth="0.5" />
            ))}

            {/* Cells */}
            {week.map((cell, di) => {
              const cellX = safeNum(PAD_X + di * COL_W);
              const cellCx = safeNum(cellX + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const isEventCol = columnHasEvent(di);

              // Cell background for non-event columns in body
              if (!isEventCol) {
                // already drawn by column background rects
              }

              let numColor = isEventCol
                ? '#CCDAEE'
                : (di === 0 ? '#E05555' : di === 6 ? '#4A8AD4' : '#2C3E50');
              if (!current) numColor = isEventCol ? '#3A5577' : '#B0B8C4';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {/* Event cell highlight */}
                  {hasEvent && (
                    <rect x={cellX + 1} y={safeNum(rowY + 1)}
                      width={safeNum(COL_W - 2)} height={safeNum(ROW_H - 2)}
                      fill={event!.type === 'closed' ? '#0F2240' : '#182E52'}
                      opacity="0.5" rx="2" />
                  )}

                  {/* Date number */}
                  <text x={cellCx} y={safeNum(rowY + 26)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={numColor}
                  >
                    {cell.day}
                  </text>

                  {/* Event label */}
                  {hasEvent && (
                    <text x={cellCx} y={safeNum(rowY + 48)}
                      textAnchor="middle"
                      fontSize={isHighlight ? '12' : '11'}
                      fontWeight="700"
                      fill={event!.color ?? (event!.type === 'closed' ? '#FF6B6B' : '#7AB8FF')}
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

      {/* Notice text below calendar */}
      {data.notices && data.notices.map((notice, i) => (
        <text key={i} x="300" y={safeNum(noticeY + 8 + i * 22)}
          textAnchor="middle" fontSize="13" fontWeight="400"
          fill="#8AAED4" letterSpacing="0.3">
          {notice}
        </text>
      ))}

      {/* Footer: clinic name and logo line */}
      <line x1="200" y1={safeNum(svgH - 50)} x2="400" y2={safeNum(svgH - 50)}
        stroke="#2A4A7A" strokeWidth="0.8" />
      <text x="300" y={safeNum(svgH - 28)}
        textAnchor="middle" fontSize="15" fontWeight="700"
        fill="#5A8DBF" letterSpacing="1.5">
        {data.clinicName}
      </text>
      <text x="300" y={safeNum(svgH - 12)}
        textAnchor="middle" fontSize="9" fontWeight="400"
        fill="#3A5E8C" letterSpacing="2">
        DENTAL CLINIC
      </text>
    </svg>
  );
}
