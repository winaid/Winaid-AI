import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 560 / 7;
const CARD_X = 20;
const CARD_W = 560;
const HEADER_H = 44;
const ROW_H_FULL = 82;
const ROW_H_WEEKLY = 112;
const GRID_Y = 140;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

function Sparkle({ x, y, size = 1, color = '#7C3AED' }: { x: number; y: number; size?: number; color?: string }) {
  const s = safeNum(size, 1);
  return (
    <g transform={`${safeTranslate(x, y)} scale(${s})`} opacity="0.7">
      <path d="M0,-12 L3,-3 L12,0 L3,3 L0,12 L-3,3 L-12,0 L-3,-3 Z" fill={color} />
    </g>
  );
}

export default function T12LavenderSparkle({ data, width = 600, colors, mode = 'full' }: Props) {
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
  const svgH = safeNum(noticeY + noticeCount * 24 + (noticeCount > 0 ? 80 : 50), 600);
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
        <linearGradient id="t12-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F3E8FF" />
          <stop offset="100%" stopColor="#FDFCFF" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="600" height={svgH} fill="url(#t12-bg)" />

      {/* Sparkle decorations */}
      <Sparkle x={60} y={50} size={1.4} color="#7C3AED" />
      <Sparkle x={100} y={75} size={0.8} color="#A78BFA" />
      <Sparkle x={500} y={45} size={1.5} color="#7C3AED" />
      <Sparkle x={540} y={80} size={0.9} color="#A78BFA" />
      <Sparkle x={40} y={100} size={0.6} color="#C4B5FD" />
      <Sparkle x={560} y={110} size={0.7} color="#C4B5FD" />

      {/* Title */}
      <text x="300" y="85" textAnchor="middle" fontSize="52" fontWeight="900"
        fill="#5B21B6" letterSpacing="-1">
        {data.monthLabel} 진료일정
      </text>

      {/* Subtitle */}
      {data.subtitle && (
        <text x="300" y="120" textAnchor="middle" fontSize="14" fill="#7C3AED" fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* Calendar header */}
      <rect x={CARD_X} y={GRID_Y} width={CARD_W} height={HEADER_H}
        rx="8" fill="#E8D5F5" />
      <rect x={CARD_X} y={safeNum(GRID_Y + HEADER_H / 2)} width={CARD_W} height={safeNum(HEADER_H / 2)}
        fill="#E8D5F5" />

      {(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const).map((day, i) => {
        const textColor = i === 0 ? '#DC2626' : i === 6 ? '#7C3AED' : '#5B21B6';
        return (
          <text key={day}
            x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(GRID_Y + 28)}
            textAnchor="middle" fontSize="13" fontWeight="700" fill={textColor}
            letterSpacing="0.5"
          >
            {day}
          </text>
        );
      })}

      <line x1={CARD_X} y1={safeNum(GRID_Y + HEADER_H)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(GRID_Y + HEADER_H)}
        stroke="#D8B4FE" strokeWidth="1.5" />

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(GRID_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#EDE9FE" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? '#DC2626' : di === 6 ? '#7C3AED' : '#333';
              if (!current) numColor = '#BDBDBD';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? '#7C3AED' : '#A78BFA');

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28} fill={evColor} opacity={0.15} />
                  )}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={22}
                      fill={isClosed ? evColor : 'none'}
                      stroke={isClosed ? 'none' : evColor}
                      strokeWidth="2.5" />
                  )}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="18"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={isClosed ? 'white' : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 58)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '11'}
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

      {/* Notice section */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <rect x="40" y={safeNum(noticeY - 8)} width="520"
            height={safeNum(data.notices.length * 24 + 20)}
            rx="10" fill="#F5F0FF" />
          {data.notices.map((n, i) => (
            <text key={i} x="300" y={safeNum(noticeY + 14 + i * 24)}
              textAnchor="middle" fontSize="12.5"
              fill={i === 0 ? '#5B21B6' : '#666'}
              fontWeight={i === 0 ? '600' : '400'}>
              {n}
            </text>
          ))}
        </g>
      )}

      <text x="300" y={safeNum(svgH - 22)} textAnchor="middle"
        fontSize="16" fontWeight="700" fill="#5B21B6">
        {data.clinicName}
      </text>
    </svg>
  );
}
