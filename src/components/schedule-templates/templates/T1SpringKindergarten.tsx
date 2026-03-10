import React from 'react';
import type { ScheduleData, TemplateColors } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getRangeBoundsInWeek } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 600 / 7;
const HEADER_H = 42;
const ROW_H = 72;
const GRID_Y = 290;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
}

export default function T1SpringKindergarten({ data, width = 600, colors }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const weeks = buildCalendarWeeks(data.year, data.month);
  const calH = HEADER_H + weeks.length * ROW_H;
  const noticeY = GRID_Y + calH + 18;
  const svgH = noticeY + (data.notices?.length ?? 0) * 24 + 140;
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
        <linearGradient id="t1-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#AEE0F5" />
          <stop offset="55%" stopColor="#D8F0FA" />
          <stop offset="100%" stopColor="#EAF8F0" />
        </linearGradient>
      </defs>

      {/* Sky background */}
      <rect width="600" height={svgH} fill="url(#t1-sky)" />

      {/* Clouds */}
      {([{ x: 48, y: 75 }, { x: 478, y: 58 }, { x: 510, y: 98 }] as const).map((c, i) => (
        <g key={i} transform={`translate(${c.x},${c.y})`} opacity="0.85">
          <ellipse cx="0" cy="0" rx="42" ry="20" fill="white" />
          <ellipse cx="22" cy="-8" rx="28" ry="16" fill="white" />
          <ellipse cx="-22" cy="-6" rx="26" ry="14" fill="white" />
        </g>
      ))}

      {/* ── Green ribbon bow at top center ── */}
      <g transform="translate(300,68)">
        {/* Crossing ribbon stripes */}
        <line x1="-310" y1="-38" x2="310" y2="28" stroke="#5D9A3C" strokeWidth="22" strokeLinecap="round" />
        <line x1="310" y1="-38" x2="-310" y2="28" stroke="#5D9A3C" strokeWidth="22" strokeLinecap="round" />
        <line x1="-310" y1="-38" x2="310" y2="28" stroke="#4A7D2E" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
        <line x1="310" y1="-38" x2="-310" y2="28" stroke="#4A7D2E" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
        {/* Bow loops */}
        <path d="M0,0 Q-55,-48 -35,-72 Q-12,-90 0,0" fill="#5D9A3C" />
        <path d="M0,0 Q55,-48 35,-72 Q12,-90 0,0" fill="#5D9A3C" />
        <path d="M0,0 Q-42,38 -28,58 Q-10,72 0,0" fill="#4A7D2E" opacity="0.85" />
        <path d="M0,0 Q42,38 28,58 Q10,72 0,0" fill="#4A7D2E" opacity="0.85" />
        {/* Knot */}
        <ellipse cx="0" cy="0" rx="20" ry="16" fill="#4A7D2E" />
        <ellipse cx="0" cy="0" rx="11" ry="9" fill="#3A6622" />
      </g>

      {/* White oval */}
      <ellipse cx="300" cy="205" rx="262" ry="185" fill="white" opacity="0.96" />

      {/* Yellow butterfly (right) */}
      <g transform="translate(522,195)">
        <ellipse cx="-10" cy="-6" rx="16" ry="10" fill="#FDD835" transform="rotate(-25,-10,-6)" />
        <ellipse cx="10" cy="-6" rx="16" ry="10" fill="#FDD835" transform="rotate(25,10,-6)" />
        <ellipse cx="-7" cy="6" rx="11" ry="7" fill="#FBC02D" transform="rotate(-12,-7,6)" />
        <ellipse cx="7" cy="6" rx="11" ry="7" fill="#FBC02D" transform="rotate(12,7,6)" />
        <line x1="0" y1="-16" x2="0" y2="14" stroke="#4E342E" strokeWidth="1.5" />
      </g>

      {/* Small star flowers */}
      {([{ x: 68, y: 200 }, { x: 530, y: 235 }] as const).map((f, i) => (
        <g key={i} transform={`translate(${f.x},${f.y})`}>
          {[0, 60, 120, 180, 240, 300].map((a, j) => (
            <ellipse
              key={j}
              cx={Math.cos((a * Math.PI) / 180) * 11}
              cy={Math.sin((a * Math.PI) / 180) * 11}
              rx="6.5" ry="4"
              fill="#FFD54F"
              transform={`rotate(${a})`}
            />
          ))}
          <circle cx="0" cy="0" r="4.5" fill="#FF8F00" />
        </g>
      ))}

      {/* Clinic name */}
      <text x="300" y="163" textAnchor="middle" fontSize="18" fontWeight="700" fill="#3B6E1C">
        {data.clinicName}
      </text>

      {/* Flower icons (text) */}
      <text x="174" y="162" textAnchor="middle" fontSize="16" fill="#FFB300">✿</text>
      <text x="426" y="162" textAnchor="middle" fontSize="16" fill="#FFB300">✿</text>

      {/* Banner ribbon behind main title */}
      <g transform="translate(300,218)">
        <path d="M -165,-16 L 165,-16 L 155,18 L -155,18 Z" fill="#D5E9C0" />
        <path d="M -165,-16 L -188,1 L -165,18 Z" fill="#BDD4A8" />
        <path d="M 165,-16 L 188,1 L 165,18 Z" fill="#BDD4A8" />
        <text y="8" textAnchor="middle" fontSize="30" fontWeight="800" fill="#2E5C1A" letterSpacing="3">
          {data.monthLabel} 일정
        </text>
      </g>

      {/* ── Calendar ── */}
      {/* Header */}
      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => {
        const bg = i === 0 ? C.closed : i === 6 ? C.secondary : '#424242';
        return (
          <g key={day}>
            <rect x={i * COL_W} y={GRID_Y} width={COL_W} height={HEADER_H} fill={bg} />
            {i > 0 && (
              <line
                x1={i * COL_W} y1={GRID_Y}
                x2={i * COL_W} y2={GRID_Y + HEADER_H}
                stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"
              />
            )}
            <text
              x={i * COL_W + COL_W / 2} y={GRID_Y + 27}
              textAnchor="middle" fontSize="15" fontWeight="700" fill="white"
            >
              {day}
            </text>
          </g>
        );
      })}

      {/* Rows */}
      {weeks.map((week, wi) => {
        const rowY = GRID_Y + HEADER_H + wi * ROW_H;

        // Range bars
        const rangeBars = (data.ranges ?? [])
          .map(r => ({ r, bounds: getRangeBoundsInWeek(r, week) }))
          .filter(x => x.bounds !== null);

        return (
          <g key={wi}>
            <rect x="0" y={rowY} width="600" height={ROW_H} fill="white" />
            <line x1="0" y1={rowY + ROW_H} x2="600" y2={rowY + ROW_H} stroke="#E0E0E0" strokeWidth="0.8" />

            {/* Range bars */}
            {rangeBars.map(({ r, bounds }) => {
              const bx = bounds!.startCol * COL_W + 3;
              const bw = (bounds!.endCol - bounds!.startCol + 1) * COL_W - 6;
              const barY = rowY + ROW_H - 21;
              return (
                <g key={r.label}>
                  <rect x={bx} y={barY} width={bw} height={17} rx="4" fill={r.color ?? '#FFCDD2'} />
                  <text
                    x={bx + bw / 2} y={barY + 12}
                    textAnchor="middle" fontSize="10.5" fill="#C62828" fontWeight="600"
                  >
                    {r.label}
                  </text>
                </g>
              );
            })}

            {/* Cells */}
            {week.map((cell, di) => {
              const cx = di * COL_W + COL_W / 2;
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              let numColor = di === 0 ? '#E91E63' : '#333';
              if (!current) numColor = '#BDBDBD';

              return (
                <g key={di}>
                  <text x={cx} y={rowY + 26} textAnchor="middle" fontSize="17" fontWeight="500" fill={numColor}>
                    {cell.day}
                  </text>
                  {event && current && (
                    <g>
                      <text
                        x={cx + 8} y={rowY + 45}
                        textAnchor="middle" fontSize="10.5" fill={event.color ?? '#555'} fontWeight="500"
                      >
                        {event.label}
                      </text>
                      {/* Pencil underline */}
                      <line
                        x1={cx - 20} y1={rowY + 49}
                        x2={cx + 35} y2={rowY + 49}
                        stroke="#BDBDBD" strokeWidth="1.5" strokeDasharray="3,1"
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Notices */}
      {data.notices?.map((notice, i) => (
        <g key={i}>
          <circle cx="46" cy={noticeY + 11 + i * 24} r="2.8" fill="#666" />
          <text x="56" y={noticeY + 16 + i * 24} fontSize="11.5" fill="#555">
            {notice}
          </text>
        </g>
      ))}

      {/* ── Bottom landscape ── */}
      <g transform={`translate(0,${svgH - 118})`}>
        {/* Back hill */}
        <path d="M 0,55 Q 150,18 300,38 Q 450,18 600,48 L 600,120 L 0,120 Z" fill="#66BB6A" />
        {/* Front hill */}
        <path d="M 0,65 Q 100,40 200,55 Q 350,32 500,50 Q 560,44 600,58 L 600,120 L 0,120 Z" fill="#4CAF50" />
        {/* Scallop edge */}
        {Array.from({ length: 21 }, (_, i) => (
          <circle key={i} cx={i * 30 + 0} cy={64} r="13" fill="#43A047" />
        ))}
        {/* Fence rail */}
        <rect x="0" y="72" width="600" height="9" rx="2" fill="#8D6E63" />
        {/* Fence posts */}
        {Array.from({ length: 26 }, (_, i) => (
          <rect key={i} x={i * 24} y="66" width="17" height="15" rx="2" fill="#A1887F" />
        ))}
        {/* Trees */}
        {[72, 190, 375, 516].map((tx, i) => (
          <g key={i} transform={`translate(${tx},10)`}>
            <rect x="-5" y="42" width="10" height="22" fill="#795548" />
            <circle cx="0" cy="20" r="30" fill="#F9A825" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a, j) => (
              <circle
                key={j}
                cx={Math.cos((a * Math.PI) / 180) * 23}
                cy={20 + Math.sin((a * Math.PI) / 180) * 23}
                r="9" fill="#FFD600"
              />
            ))}
            <circle cx="0" cy="20" r="10" fill="#FF8F00" />
          </g>
        ))}
        {/* Ground flowers */}
        {[28, 128, 248, 340, 448, 568].map((fx, i) => (
          <g key={i} transform={`translate(${fx},58)`}>
            {[0, 60, 120, 180, 240, 300].map((a, j) => (
              <ellipse
                key={j}
                cx={Math.cos((a * Math.PI) / 180) * 7}
                cy={Math.sin((a * Math.PI) / 180) * 7}
                rx="4.5" ry="3" fill="#FFEB3B"
                transform={`rotate(${a})`}
              />
            ))}
            <circle cx="0" cy="0" r="3.5" fill="#FFA000" />
          </g>
        ))}
      </g>
    </svg>
  );
}
