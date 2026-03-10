import React from 'react';
import type { ScheduleData, TemplateColors } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCompactCalendarWeeks } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 560 / 7;  // inside card (card x=20, w=560)
const CARD_X = 20;
const CARD_Y = 168;
const HEADER_H = 50;
const ROW_H = 92;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
}

// Simplified maple leaf path (centered at 0,0, size ~40px)
function MapleLeaf({ x, y, size = 1, rot = 0, color = '#D84315' }: {
  x: number; y: number; size?: number; rot?: number; color?: string;
}) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rot}) scale(${size})`}>
      <path
        d="M0,-38 C5,-30 15,-22 10,-12 C18,-16 24,-4 16,0 C22,4 18,14 10,10 C14,18 6,24 0,38
           C-6,24 -14,18 -10,10 C-18,14 -22,4 -16,0 C-24,-4 -18,-16 -10,-12 C-15,-22 -5,-30 0,-38 Z"
        fill={color}
        opacity="0.88"
      />
      {/* Stem */}
      <line x1="0" y1="38" x2="0" y2="55" stroke={color} strokeWidth="3" />
    </g>
  );
}

export default function T3Autumn({ data, width = 600, colors }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const weeks = buildCompactCalendarWeeks(data.year, data.month);
  const calH = HEADER_H + weeks.length * ROW_H;
  const cardH = calH + 24;
  const svgH = CARD_Y + cardH + 120;
  const scale = width / 600;

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
        <linearGradient id="t3-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFAB40" />
          <stop offset="50%" stopColor="#FF7043" />
          <stop offset="100%" stopColor="#E64A19" />
        </linearGradient>
        <filter id="t3-shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="rgba(0,0,0,0.18)" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="600" height={svgH} fill="url(#t3-bg)" />

      {/* Maple leaves - corners */}
      <MapleLeaf x={30} y={55} size={1.4} rot={-25} color="#BF360C" />
      <MapleLeaf x={85} y={20} size={1.0} rot={15} color="#D84315" />
      <MapleLeaf x={55} y={100} size={0.8} rot={40} color="#E64A19" />
      <MapleLeaf x={570} y={45} size={1.5} rot={30} color="#BF360C" />
      <MapleLeaf x={530} y={90} size={1.0} rot={-15} color="#FF7043" />
      <MapleLeaf x={555} y={135} size={0.7} rot={50} color="#D84315" />
      {/* Bottom corners */}
      <MapleLeaf x={25} y={svgH - 60} size={1.2} rot={20} color="#BF360C" />
      <MapleLeaf x={575} y={svgH - 50} size={1.3} rot={-30} color="#D84315" />
      <MapleLeaf x={540} y={svgH - 100} size={0.9} rot={10} color="#E64A19" />

      {/* Decorative triangle accent */}
      <polygon points="520,140 545,110 555,145" fill="rgba(255,255,255,0.12)" />
      <polygon points="65,160 80,130 90,162" fill="rgba(255,255,255,0.12)" />

      {/* Title */}
      <text x="300" y="88" textAnchor="middle" fontSize="62" fontWeight="900"
        fill="#3E1800" letterSpacing="-2">
        {data.monthLabel} 진료일정
      </text>

      {/* Subtitle */}
      {data.subtitle && (
        <text x="300" y="128" textAnchor="middle" fontSize="16" fill="#5D3010" fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* White calendar card */}
      <rect x={CARD_X} y={CARD_Y} width="560" height={cardH}
        rx="12" fill="white" filter="url(#t3-shadow)" />

      {/* Calendar header (dark) */}
      <rect x={CARD_X} y={CARD_Y} width="560" height={HEADER_H}
        rx="12" fill="#37282A" />
      <rect x={CARD_X} y={CARD_Y + HEADER_H / 2} width="560" height={HEADER_H / 2} fill="#37282A" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={CARD_X + i * COL_W + COL_W / 2} y={CARD_Y + 33}
          textAnchor="middle" fontSize="16" fontWeight="700" fill="white"
        >
          {day}
        </text>
      ))}

      {/* Rows */}
      {weeks.map((week, wi) => {
        const rowY = CARD_Y + HEADER_H + wi * ROW_H;
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={rowY + ROW_H} x2={CARD_X + 560} y2={rowY + ROW_H}
                stroke="#E8E0D8" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = CARD_X + di * COL_W + COL_W / 2;
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;

              // Dual date text (e.g. "23/30")
              const dayText = cell.dual ? `${cell.day}/${cell.dual}` : String(cell.day);

              let numColor = di === 0 ? '#C62828' : '#333';
              if (!current) numColor = '#BDBDBD';

              return (
                <g key={di}>
                  <text x={cx} y={rowY + 36} textAnchor="middle"
                    fontSize={cell.dual ? 14 : 18} fontWeight="600" fill={numColor}>
                    {dayText}
                  </text>
                  {/* Yellow pill badge */}
                  {event && current && (
                    <g>
                      <rect x={cx - 32} y={rowY + 45} width="64" height="22" rx="6"
                        fill={event.color ?? C.closed} />
                      <text x={cx} y={rowY + 60}
                        textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
                        {event.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Footer: tooth icon + hospital name */}
      <g transform={`translate(300,${CARD_Y + cardH + 52})`}>
        {/* Simple tooth shape */}
        <path
          d="M-12,-14 C-18,-14 -22,-8 -22,0 C-22,10 -16,22 -10,22 C-7,22 -5,14 0,14
             C5,14 7,22 10,22 C16,22 22,10 22,0 C22,-8 18,-14 12,-14 Z"
          fill="#E53935"
        />
        <text x="18" y="6" fontSize="18" fontWeight="800" fill="#37282A">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
