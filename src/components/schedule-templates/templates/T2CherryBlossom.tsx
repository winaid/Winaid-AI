import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 600 / 7;
const HEADER_H = 44;
const ROW_H_FULL = 82;
const ROW_H_WEEKLY = 110;
const GRID_Y = 292;

const COLORS = {
  night: '#8E24AA',
  seminar: '#283593',
  closed: '#E91E63',
  normal: '#388E3C',
  custom: '#FF6F00',
};

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
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
  const noticeY = safeNum(GRID_Y + calH + 24);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(noticeY + noticeCount * 28 + (noticeCount > 0 ? 80 : 40), 600);
  const scale = safeNum(width / 600, 1);

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  // Petal positions (top-left, top-right, scattered)
  const petals = [
    { cx: 40, cy: 55, rx: 68, ry: 38, rot: -35 },
    { cx: 105, cy: 25, rx: 55, ry: 30, rot: 20 },
    { cx: 510, cy: 45, rx: 78, ry: 42, rot: 45 },
    { cx: 565, cy: 115, rx: 60, ry: 32, rot: -22 },
    { cx: 28, cy: 145, rx: 52, ry: 28, rot: 10 },
    { cx: 575, cy: 200, rx: 64, ry: 36, rot: -40 },
    { cx: 85, cy: 215, rx: 72, ry: 38, rot: 15 },
    { cx: 490, cy: 238, rx: 54, ry: 28, rot: 30 },
  ];

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={svgH * scale}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="t2-pink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F06292" />
          <stop offset="100%" stopColor="#FCE4EC" />
        </linearGradient>
        <radialGradient id="t2-petal-grad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#FFCDD2" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#F48FB1" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      {/* White background */}
      <rect width="600" height={svgH} fill="white" />

      {/* Pink top section */}
      <rect width="600" height="272" fill="url(#t2-pink)" />

      {/* Petal blobs */}
      {petals.map((p, i) => (
        <ellipse
          key={i} cx={safeNum(p.cx)} cy={safeNum(p.cy)} rx={safeNum(p.rx)} ry={safeNum(p.ry)}
          fill="url(#t2-petal-grad)"
          transform={`rotate(${safeNum(p.rot)},${safeNum(p.cx)},${safeNum(p.cy)})`}
          opacity="0.65"
        />
      ))}

      {/* Falling petal accents */}
      {[{ x: 430, y: 190, r: 25 }, { x: 148, y: 175, r: 20 }, { x: 72, y: 260, r: 22 }].map((p, i) => (
        <ellipse key={i} cx={safeNum(p.x)} cy={safeNum(p.y)} rx={safeNum(p.r)} ry={safeNum(p.r * 0.55)}
          fill="#F06292" opacity="0.82"
          transform={`rotate(${safeNum(30 + i * 20)},${safeNum(p.x)},${safeNum(p.y)})`} />
      ))}

      {/* Clinic name */}
      <text x="300" y="85" textAnchor="middle" fontSize="50" fontWeight="900" fill="white"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>
        {data.clinicName}
      </text>

      {/* Month + title */}
      <text x="300" y="155" textAnchor="middle" fontSize="44" fontWeight="900" fill="white">
        {data.monthLabel} 진료일정
      </text>

      {/* Thin divider */}
      <line x1="60" y1="178" x2="540" y2="178" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />

      {/* Calendar weekday headers */}
      {(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const).map((day, i) => {
        const textColor = i === 0 ? '#E91E63' : i === 6 ? '#64B5F6' : '#555';
        return (
          <text key={day}
            x={i * COL_W + COL_W / 2} y={GRID_Y + 26}
            textAnchor="middle" fontSize="13" fontWeight="700" fill={textColor} letterSpacing="0.5"
          >
            {day}
          </text>
        );
      })}

      {/* Header bottom line */}
      <line x1="0" y1={GRID_Y + HEADER_H} x2="600" y2={GRID_Y + HEADER_H}
        stroke="#E0E0E0" strokeWidth="1.5" />

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = GRID_Y + HEADER_H + wi * ROW_H;
        return (
          <g key={wi}>
            <line x1="0" y1={rowY + ROW_H} x2="600" y2={rowY + ROW_H}
              stroke="#E0E0E0" strokeWidth="0.8" />

            {week.map((cell, di) => {
              const cx = di * COL_W + COL_W / 2;
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;

              let numColor = di === 0 ? '#E91E63' : '#333';
              if (!current) numColor = '#BDBDBD';

              const hasCircle = !!event && current;
              const evColor = event?.color ?? C[event?.type ?? 'normal'];
              const dimmed = isHighlight && current && !hasCircle;

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {/* Highlight glow */}
                  {isHighlight && hasCircle && (
                    <circle cx={cx} cy={rowY + 25} r={30} fill={evColor} opacity={0.18} />
                  )}
                  {hasCircle && (
                    <circle cx={cx} cy={rowY + 25} r={23} fill={evColor} />
                  )}
                  <text
                    x={cx} y={rowY + 31}
                    textAnchor="middle" fontSize="18"
                    fontWeight={hasCircle ? '700' : '400'}
                    fill={hasCircle ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>
                  {event && current && (
                    <text x={cx} y={rowY + 55}
                      textAnchor="middle" fontSize={isHighlight ? '12.5' : '11'} fill={evColor} fontWeight={isHighlight ? '800' : '600'}>
                      {event.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Notice section */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <rect x="30" y={noticeY - 8} width="540" height={data.notices.length * 28 + 20}
            rx="6" fill="#FFF5F8" />
          {data.notices.map((n, i) => (
            <text key={i}
              x="300" y={noticeY + 16 + i * 28}
              textAnchor="middle" fontSize="13"
              fill={i === 0 ? '#C2185B' : '#555'}
              fontWeight={i === 0 ? '700' : '400'}
            >
              {n}
            </text>
          ))}
        </g>
      )}

      {/* Hospital name footer */}
      <text x="300" y={svgH - 22} textAnchor="middle" fontSize="16" fontWeight="700" fill="#7B2FBE">
        {data.clinicName}
      </text>
    </svg>
  );
}
