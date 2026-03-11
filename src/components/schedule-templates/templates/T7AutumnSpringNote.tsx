import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, getRangeBoundsInWeek, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 540 / 7;
const CARD_X = 30;
const CARD_W = 540;
const HEADER_H = 46;
const ROW_H_FULL = 80;
const ROW_H_WEEKLY = 110;
const CARD_Y = 200;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Simplified maple leaf shape */
function MapleLeaf({ x, y, size = 1, rot = 0, color = '#D2691E' }: {
  x: number; y: number; size?: number; rot?: number; color?: string;
}) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rot)}) scale(${safeNum(size, 1)})`}>
      <path
        d="M0,-20 C3,-15 10,-12 6,-6 C10,-8 14,-2 8,0 C12,3 10,8 6,6
           C8,10 4,14 0,20 C-4,14 -8,10 -6,6 C-10,8 -12,3 -8,0
           C-14,-2 -10,-8 -6,-6 C-10,-12 -3,-15 0,-20Z"
        fill={color}
        opacity="0.85"
      />
      <line x1="0" y1="20" x2="0" y2="30" stroke={color} strokeWidth="2" opacity="0.7" />
    </g>
  );
}

/** Decorative cloud shape */
function Cloud({ x, y, scale = 1, opacity = 0.25 }: {
  x: number; y: number; scale?: number; opacity?: number;
}) {
  return (
    <g transform={`${safeTranslate(x, y)} scale(${safeNum(scale, 1)})`} opacity={safeNum(opacity, 0.25)}>
      <ellipse cx="0" cy="0" rx="40" ry="18" fill="#F5E6C8" />
      <ellipse cx="-25" cy="5" rx="22" ry="14" fill="#F5E6C8" />
      <ellipse cx="25" cy="5" rx="22" ry="14" fill="#F5E6C8" />
      <ellipse cx="0" cy="-8" rx="24" ry="14" fill="#F5E6C8" />
    </g>
  );
}

/** Simplified autumn tree */
function AutumnTree({ x, y, h = 50, crownColor = '#D2691E' }: {
  x: number; y: number; h?: number; crownColor?: string;
}) {
  const sh = safeNum(h, 50);
  const cw = safeNum(sh * 0.6);
  return (
    <g transform={safeTranslate(x, y)}>
      {/* Trunk */}
      <rect x="-5" y={safeNum(-sh * 0.2)} width="10" height={safeNum(sh * 0.4)} rx="2" fill="#6B4C2A" />
      {/* Crown */}
      <ellipse cx="0" cy={safeNum(-sh * 0.5)} rx={safeNum(cw / 2)} ry={safeNum(sh * 0.38)} fill={crownColor} opacity="0.85" />
    </g>
  );
}

export default function T7AutumnSpringNote({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(
        allWeeks,
        data.events.map(e => e.date),
        data.ranges?.map(r => ({ start: r.start, end: r.end })),
      )
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 24);
  const svgH = safeNum(CARD_Y + cardH + 80, 600);
  const scale = safeNum(width / 600, 1);

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  // Spiral binding dot positions along top of card
  const spiralDots = Array.from({ length: 18 }, (_, i) => CARD_X + 15 + i * 30);

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={safeNum(svgH * scale)}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="t7-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B6B3D" />
          <stop offset="100%" stopColor="#6B4C2A" />
        </linearGradient>
        <filter id="t7-shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="rgba(0,0,0,0.2)" />
        </filter>
      </defs>

      {/* Brown warm gradient background */}
      <rect width="600" height={svgH} fill="url(#t7-bg)" />

      {/* Maple leaves - top-left cluster */}
      <MapleLeaf x={35} y={40} size={1.4} rot={-20} color="#D2691E" />
      <MapleLeaf x={85} y={25} size={1.0} rot={15} color="#CC3333" />
      <MapleLeaf x={60} y={85} size={0.9} rot={35} color="#E8A317" />
      <MapleLeaf x={120} y={60} size={0.7} rot={-10} color="#4A7A3D" />
      <MapleLeaf x={20} y={110} size={0.8} rot={45} color="#CC3333" />

      {/* Maple leaves - bottom scattered */}
      <MapleLeaf x={40} y={safeNum(svgH - 55)} size={1.1} rot={25} color="#D2691E" />
      <MapleLeaf x={560} y={safeNum(svgH - 50)} size={1.2} rot={-30} color="#CC3333" />
      <MapleLeaf x={200} y={safeNum(svgH - 30)} size={0.7} rot={50} color="#E8A317" />
      <MapleLeaf x={480} y={safeNum(svgH - 65)} size={0.8} rot={10} color="#4A7A3D" />

      {/* Clouds - top-right */}
      <Cloud x={480} y={45} scale={1.2} opacity={0.3} />
      <Cloud x={540} y={85} scale={0.8} opacity={0.2} />

      {/* Title - huge white month label */}
      <text x="300" y="95" textAnchor="middle" fontSize="64" fontWeight="900"
        fill="white" letterSpacing="-2">
        {data.monthLabel}
      </text>

      {/* Subtitle */}
      <text x="300" y="135" textAnchor="middle" fontSize="22" fontWeight="600"
        fill="rgba(255,255,255,0.85)">
        휴진 안내
      </text>

      {/* Clinic name */}
      <text x="300" y="168" textAnchor="middle" fontSize="14" fontWeight="400"
        fill="rgba(255,255,255,0.6)" letterSpacing="1">
        {data.clinicName}
      </text>

      {/* White calendar card */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="14" fill="white" filter="url(#t7-shadow)" />

      {/* Spiral binding dots along top of card */}
      {spiralDots.map((dx, i) => (
        <g key={i}>
          <circle cx={dx} cy={CARD_Y} r="6" fill="#8B6B3D" />
          <circle cx={dx} cy={CARD_Y} r="3" fill="white" />
        </g>
      ))}

      {/* Calendar header row */}
      <rect x={CARD_X} y={CARD_Y + 8} width={CARD_W} height={HEADER_H - 8}
        fill="#FAF3E8" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => {
        const textColor = i === 0 ? '#C62828' : i === 6 ? '#1565C0' : '#5D4037';
        return (
          <text key={day}
            x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={CARD_Y + 36}
            textAnchor="middle" fontSize="14" fontWeight="700" fill={textColor}
          >
            {day}
          </text>
        );
      })}

      <line x1={CARD_X} y1={safeNum(CARD_Y + HEADER_H)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(CARD_Y + HEADER_H)}
        stroke="#E0D5C5" strokeWidth="1" />

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#EDE5D8" strokeWidth="1" />
            )}

            {/* Range bars for this week */}
            {(data.ranges ?? []).map((range, ri) => {
              const bounds = getRangeBoundsInWeek(range, week);
              if (!bounds) return null;
              const rx = safeNum(CARD_X + bounds.startCol * COL_W + 4);
              const rw = safeNum((bounds.endCol - bounds.startCol + 1) * COL_W - 8);
              const barColor = range.color ?? C.closed;
              return (
                <g key={`r${ri}`}>
                  <rect x={rx} y={safeNum(rowY + 38)} width={rw} height="22" rx="11"
                    fill={barColor} opacity="0.85" />
                  <text x={safeNum(rx + rw / 2)} y={safeNum(rowY + 53)}
                    textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
                    {range.label}
                  </text>
                </g>
              );
            })}

            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? '#C62828' : di === 6 ? '#1565C0' : '#3E2723';
              if (!current) numColor = '#BDBDBD';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <rect x={safeNum(cx - 30)} y={safeNum(rowY + 4)} width="60" height="28" rx="8"
                      fill={event!.color ?? C.closed} opacity={0.15} />
                  )}

                  <text x={cx} y={safeNum(rowY + 24)} textAnchor="middle"
                    fontSize="16" fontWeight={isHighlight && hasEvent ? '800' : '600'} fill={numColor}>
                    {cell.day}
                  </text>

                  {event && current && (
                    <text x={cx} y={safeNum(rowY + 68)}
                      textAnchor="middle" fontSize="10" fontWeight="600"
                      fill={event.color ?? '#8B6B3D'}>
                      {event.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Autumn trees illustration at bottom */}
      <AutumnTree x={60} y={safeNum(svgH - 18)} h={55} crownColor="#D2691E" />
      <AutumnTree x={120} y={safeNum(svgH - 12)} h={42} crownColor="#CC3333" />
      <AutumnTree x={170} y={safeNum(svgH - 16)} h={38} crownColor="#E8A317" />
      <AutumnTree x={430} y={safeNum(svgH - 14)} h={45} crownColor="#CC3333" />
      <AutumnTree x={500} y={safeNum(svgH - 10)} h={40} crownColor="#4A7A3D" />
      <AutumnTree x={550} y={safeNum(svgH - 16)} h={52} crownColor="#D2691E" />

      {/* Footer: clinic name */}
      <g transform={safeTranslate(300, safeNum(svgH - 28))}>
        <text x="0" y="0" textAnchor="middle" fontSize="16" fontWeight="800" fill="white">
          {data.clinicName}
        </text>
        <text x="0" y="16" textAnchor="middle" fontSize="9" fontWeight="400"
          fill="rgba(255,255,255,0.5)" letterSpacing="1.5">
          {data.subtitle ?? ''}
        </text>
      </g>
    </svg>
  );
}
