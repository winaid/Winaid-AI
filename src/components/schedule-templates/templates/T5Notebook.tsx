import React from 'react';
import type { ScheduleData, TemplateColors } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 18;
const CARD_W = 564;
const COL_W = CARD_W / 7;
const HEADER_H = 40;
const ROW_H = 76;
const GRID_Y = 380; // inside card, below doctor character

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
}

// 의사 캐릭터 (흰 가운 SVG)
function DoctorCharacter({ cx, y }: { cx: number; y: number }) {
  return (
    <g transform={`translate(${cx},${y})`}>
      {/* Head */}
      <ellipse cx="0" cy="-60" rx="28" ry="32" fill="#FFD5B5" />
      {/* Hair */}
      <ellipse cx="0" cy="-86" rx="28" ry="14" fill="#333" />
      <rect x="-28" y="-86" width="56" height="14" rx="7" fill="#333" />
      {/* Eyes */}
      <ellipse cx="-10" cy="-62" rx="4" ry="5" fill="#333" />
      <ellipse cx="10" cy="-62" rx="4" ry="5" fill="#333" />
      <ellipse cx="-9" cy="-63" rx="1.5" ry="2" fill="white" />
      <ellipse cx="11" cy="-63" rx="1.5" ry="2" fill="white" />
      {/* Smile */}
      <path d="M -8,-50 Q 0,-44 8,-50" stroke="#C47A5A" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* White coat body */}
      <rect x="-32" y="-28" width="64" height="70" rx="8" fill="white" />
      {/* Coat collar */}
      <path d="M -12,-28 L 0,-12 L 12,-28" fill="#E0E0E0" />
      {/* Teal undershirt */}
      <rect x="-8" y="-16" width="16" height="20" rx="3" fill="#26A69A" />
      {/* Coat buttons */}
      <circle cx="0" cy="5" r="2.5" fill="#BDBDBD" />
      <circle cx="0" cy="18" r="2.5" fill="#BDBDBD" />
      {/* Left arm holding stethoscope */}
      <rect x="-52" y="-22" width="22" height="12" rx="6" fill="white" transform="rotate(-20,-52,-22)" />
      {/* Right arm holding tool */}
      <rect x="32" y="-22" width="22" height="12" rx="6" fill="white" transform="rotate(20,32,-22)" />
      {/* Stethoscope (left hand) */}
      <circle cx="-46" cy="-10" r="8" fill="none" stroke="#888" strokeWidth="2.5" />
      <path d="M -38,-10 Q -28,0 -20,-8" stroke="#888" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Dental mirror (right hand) */}
      <circle cx="48" cy="-10" r="7" fill="#E0E0E0" stroke="#999" strokeWidth="1.5" />
      <line x1="42" y1="-4" x2="36" y2="6" stroke="#999" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

export default function T5Notebook({ data, width = 600, colors }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const weeks = buildCalendarWeeks(data.year, data.month);
  const calH = HEADER_H + weeks.length * ROW_H;
  const cardH = GRID_Y - CARD_X + calH + 40;
  const svgH = cardH + 110;
  const scale = width / 600;

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  // Spiral ring positions
  const rings = Array.from({ length: 7 }, (_, i) => CARD_X + 40 + i * 78);

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={svgH * scale}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="t5-outer-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2196F3" />
          <stop offset="100%" stopColor="#0D47A1" />
        </linearGradient>
        <filter id="t5-card-shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.25)" />
        </filter>
      </defs>

      {/* Blue outer background */}
      <rect width="600" height={svgH} fill="url(#t5-outer-bg)" />

      {/* Bottom-right blue diagonal accent */}
      <path d={`M 480,${svgH} L 600,${svgH - 120} L 600,${svgH} Z`} fill="#1565C0" opacity="0.6" />

      {/* Notebook card (white) */}
      <rect x={CARD_X} y={55} width={CARD_W} height={cardH - 10}
        rx="8" fill="white" filter="url(#t5-card-shadow)" />

      {/* Blue notebook top header */}
      <rect x={CARD_X} y={55} width={CARD_W} height={110}
        rx="8" fill="#1976D2" />
      <rect x={CARD_X} y={110} width={CARD_W} height={55} fill="#1976D2" />

      {/* Spiral rings */}
      {rings.map((rx, i) => (
        <g key={i}>
          {/* Ring outer */}
          <rect x={rx - 12} y={44} width={24} height={32} rx="12"
            fill="#FDD835" stroke="#F9A825" strokeWidth="2" />
          {/* Ring hole */}
          <rect x={rx - 5} y={52} width={10} height={16} rx="5" fill="#1976D2" />
        </g>
      ))}

      {/* Doctor character */}
      <DoctorCharacter cx={300} cy={180} />

      {/* Clinic name */}
      <text x="300" y={268} textAnchor="middle" fontSize="15"
        fontWeight="600" fill="#1565C0" letterSpacing="1">
        {data.clinicName}
      </text>

      {/* Main title */}
      <text x="300" y={318} textAnchor="middle" fontSize="40"
        fontWeight="900" fill="#1565C0" letterSpacing="-1">
        {data.monthLabel} 진료일정
      </text>

      {/* Yellow highlighter underline */}
      <rect x="80" y={323} width="440" height="12" rx="3"
        fill="#FDD835" opacity="0.7" />

      {/* ── Calendar ── */}
      {/* Weekday headers */}
      {(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const).map((day, i) => {
        const textColor = i === 0 ? '#E53935' : i === 6 ? '#1565C0' : '#555';
        return (
          <text key={day}
            x={CARD_X + i * COL_W + COL_W / 2} y={GRID_Y + 24}
            textAnchor="middle" fontSize="12" fontWeight="700"
            fill={textColor} letterSpacing="0.3"
          >
            {day}
          </text>
        );
      })}

      {/* Header bottom line */}
      <line x1={CARD_X} y1={GRID_Y + HEADER_H} x2={CARD_X + CARD_W} y2={GRID_Y + HEADER_H}
        stroke="#E0E0E0" strokeWidth="1.5" />

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = GRID_Y + HEADER_H + wi * ROW_H;
        return (
          <g key={wi}>
            {/* Column dividers */}
            {[1, 2, 3, 4, 5, 6].map(di => (
              <line key={di}
                x1={CARD_X + di * COL_W} y1={rowY}
                x2={CARD_X + di * COL_W} y2={rowY + ROW_H}
                stroke="#F0F0F0" strokeWidth="1" />
            ))}
            {/* Row bottom line */}
            <line x1={CARD_X} y1={rowY + ROW_H} x2={CARD_X + CARD_W} y2={rowY + ROW_H}
              stroke="#E8E8E8" strokeWidth="1" />

            {week.map((cell, di) => {
              const cx = CARD_X + di * COL_W;
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;

              let numColor = di === 0 ? '#E53935' : di === 6 ? '#1565C0' : '#333';
              if (!current) numColor = '#BDBDBD';

              const isClosed = !!event && current && event.type === 'closed';

              return (
                <g key={di}>
                  {/* Red fill cell for closed */}
                  {isClosed && (
                    <rect x={cx + 1} y={rowY + 1} width={COL_W - 2} height={ROW_H - 2}
                      fill={C.closed} />
                  )}

                  {/* Date number */}
                  <text x={cx + COL_W / 2} y={rowY + 22}
                    textAnchor="middle" fontSize="14"
                    fontWeight="600"
                    fill={isClosed ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>

                  {/* Event label (2-line in red cell) */}
                  {isClosed && (
                    <g>
                      {event!.label.split(' ').map((word, li) => (
                        <text key={li}
                          x={cx + COL_W / 2} y={rowY + 42 + li * 18}
                          textAnchor="middle" fontSize="15"
                          fontWeight="800" fill="white"
                        >
                          {word}
                        </text>
                      ))}
                    </g>
                  )}

                  {/* Non-closed event */}
                  {event && current && !isClosed && (
                    <text x={cx + COL_W / 2} y={rowY + 52}
                      textAnchor="middle" fontSize="10"
                      fill={event.color ?? '#555'}>
                      {event.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Drawing pen accent (bottom-right) */}
      <g transform={`translate(520,${GRID_Y + HEADER_H + weeks.length * ROW_H + 20})`}>
        {/* Sparkle */}
        <path d="M-15,-8 L-10,0 L-15,8 L0,4 L12,10 L8,0 L12,-10 L0,-4 Z"
          fill="#1565C0" opacity="0.3" transform="scale(0.6)" />
        {/* Diamond */}
        <path d="M20,-15 L25,-10 L20,-5 L15,-10 Z" fill="#64B5F6" opacity="0.5" />
      </g>

      {/* Footer: hospital logo */}
      <g transform={`translate(300,${svgH - 38})`}>
        {/* Tooth icon */}
        <path
          d="M-58,-12 C-64,-12 -68,-6 -68,2 C-68,12 -62,22 -56,22 C-53,22 -51,14 -46,14
             C-41,14 -39,22 -36,22 C-30,22 -24,12 -24,2 C-24,-6 -28,-12 -34,-12 Z"
          fill="#1565C0"
        />
        <text x="-14" y="8" fontSize="18" fontWeight="800" fill="#1565C0">
          {data.clinicName}
        </text>
        <text x="-14" y="22" fontSize="9" fontWeight="400" fill="#90A4AE" letterSpacing="1">
          YEIL DENTAL CLINIC
        </text>
      </g>
    </svg>
  );
}
