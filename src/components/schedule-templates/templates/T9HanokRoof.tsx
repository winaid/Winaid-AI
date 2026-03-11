import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, getRangeBoundsInWeek, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 30;
const CARD_W = 540;
const COL_W = CARD_W / 7;
const HEADER_H = 44;
const ROW_H_FULL = 76;
const ROW_H_WEEKLY = 108;

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  closed:  { bg: '#D64545', text: 'white' },
  night:   { bg: '#7B1FA2', text: 'white' },
  normal:  { bg: '#E8856A', text: 'white' },
  seminar: { bg: '#5D4037', text: 'white' },
  custom:  { bg: '#E88B3A', text: 'white' },
};

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Decorative beige cloud */
function HanokCloud({ x, y, w = 70 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={safeTranslate(x, y)} opacity="0.5">
      <ellipse cx="0" cy="0" rx={w * 0.5} ry={w * 0.16} fill="#DDD0B8" />
      <ellipse cx={w * 0.2} cy={w * -0.09} rx={w * 0.22} ry={w * 0.12} fill="#DDD0B8" />
      <ellipse cx={-w * 0.18} cy={w * -0.07} rx={w * 0.19} ry={w * 0.1} fill="#DDD0B8" />
    </g>
  );
}

/** Korean traditional corner pattern (small geometric squares) */
function CornerPattern({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rotate)})`} opacity="0.3">
      <rect x="0" y="0" width="18" height="18" fill="none" stroke="#8B7355" strokeWidth="1.2" />
      <rect x="3" y="3" width="12" height="12" fill="none" stroke="#8B7355" strokeWidth="0.8" />
      <rect x="6" y="6" width="6" height="6" fill="none" stroke="#8B7355" strokeWidth="0.6" />
    </g>
  );
}

export default function T9HanokRoof({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date), data.ranges)
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const CARD_Y = 280;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 100, 600);
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
      {/* Warm beige background */}
      <rect width="600" height={svgH} fill="#F0E6D3" />

      {/* Large salmon/coral half-circle at top center */}
      <circle cx="300" cy="0" r="200" fill="#E8856A" />

      {/* Hanok roof tile decoration */}
      <g transform={safeTranslate(300, 120)}>
        {/* Main curved roof shape */}
        <path
          d="M -220,0 Q -180,-55 -100,-70 Q 0,-82 100,-70 Q 180,-55 220,0 Z"
          fill="#4A4A4A"
        />
        {/* Roof ridge */}
        <path
          d="M -200,-2 Q -160,-48 -80,-60 Q 0,-68 80,-60 Q 160,-48 200,-2"
          fill="none" stroke="#3A3A3A" strokeWidth="3"
        />
        {/* Tile pattern: small repeated rectangles */}
        {[-160, -120, -80, -40, 0, 40, 80, 120, 160].map((tx, i) => (
          <g key={i}>
            <rect x={tx - 8} y={-30} width={16} height={10} rx="1" fill="#5A5A5A" stroke="#3A3A3A" strokeWidth="0.5" />
            <rect x={tx - 8} y={-16} width={16} height={10} rx="1" fill="#555" stroke="#3A3A3A" strokeWidth="0.5" />
          </g>
        ))}
        {/* Curved eave ends */}
        <path d="M -220,0 Q -235,-8 -240,5" stroke="#4A4A4A" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M 220,0 Q 235,-8 240,5" stroke="#4A4A4A" strokeWidth="6" fill="none" strokeLinecap="round" />
      </g>

      {/* Decorative clouds */}
      <HanokCloud x={50} y={45} w={80} />
      <HanokCloud x={530} y={40} w={90} />
      <HanokCloud x={80} y={safeNum(svgH - 50)} w={75} />
      <HanokCloud x={500} y={safeNum(svgH - 45)} w={85} />

      {/* Clinic name + logo top-left */}
      <g transform={safeTranslate(32, 30)}>
        <circle cx="12" cy="0" r="14" fill="white" opacity="0.9" />
        <text x="12" y="5" textAnchor="middle" fontSize="13" fontWeight="900" fill="#E8856A">H</text>
        <text x="34" y="5" fontSize="14" fontWeight="700" fill="white">
          {data.clinicName}
        </text>
      </g>

      {/* Large bold month title inside the salmon half-circle */}
      <text x="300" y="80" textAnchor="middle" fontSize="52" fontWeight="900"
        fill="white" letterSpacing="2">
        {data.monthLabel}
      </text>

      {/* Subtitle: 진료일정 안내 */}
      <text x="300" y="160" textAnchor="middle" fontSize="22" fontWeight="800" fill="white">
        진료일정 안내
      </text>

      {/* Additional subtitle lines */}
      {data.subtitle && data.subtitle.split('\n').map((line, i) => (
        <text key={i} x="300" y={safeNum(190 + i * 22)}
          textAnchor="middle" fontSize="13" fill="#6B5444" fontWeight="400">
          {line}
        </text>
      ))}

      {/* Calendar card with white background */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="8" fill="white" stroke="#D9CCBA" strokeWidth="1" />

      {/* Traditional corner decorations on card */}
      <CornerPattern x={CARD_X + 4} y={CARD_Y + 4} rotate={0} />
      <CornerPattern x={CARD_X + CARD_W - 22} y={CARD_Y + 4} rotate={0} />
      <CornerPattern x={CARD_X + 4} y={safeNum(CARD_Y + cardH - 22)} rotate={0} />
      <CornerPattern x={CARD_X + CARD_W - 22} y={safeNum(CARD_Y + cardH - 22)} rotate={0} />

      {/* Calendar header */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="8" fill="#E8856A" />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W} height={HEADER_H / 2}
        fill="#E8856A" />

      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 30)}
          textAnchor="middle" fontSize="15" fontWeight="700"
          fill={i === 0 ? '#FFD0D0' : 'white'}
        >
          {day}
        </text>
      ))}

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);

        // Range bars
        const rangeBars = (data.ranges ?? [])
          .map(r => ({ r, bounds: getRangeBoundsInWeek(r, week) }))
          .filter(x => x.bounds !== null);

        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#EDE3D5" strokeWidth="1" />
            )}

            {/* Range bars */}
            {rangeBars.map(({ r, bounds }) => {
              const bx = safeNum(CARD_X + bounds!.startCol * COL_W + 3);
              const bw = safeNum((bounds!.endCol - bounds!.startCol + 1) * COL_W - 6, COL_W);
              const barY = safeNum(rowY + ROW_H - 22);
              return (
                <g key={r.label}>
                  <rect x={bx} y={barY} width={bw} height={17} rx="4"
                    fill={r.color ?? '#FDDCCC'} />
                  <text x={safeNum(bx + bw / 2)} y={safeNum(barY + 12)}
                    textAnchor="middle" fontSize="10" fill="#A04020" fontWeight="600">
                    {r.label}
                  </text>
                </g>
              );
            })}

            {/* Cells */}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const typeColors = hasEvent ? (TYPE_COLORS[event!.type] ?? TYPE_COLORS.custom) : null;

              let numColor = di === 0 ? '#D64545' : '#3E2A0A';
              if (di === 6) numColor = '#2E6DA4';
              if (!current) numColor = '#C8BBA8';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {/* Highlight glow */}
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={28}
                      fill={event!.color ?? typeColors!.bg} opacity={0.15} />
                  )}
                  {/* Event cell colored rectangle background */}
                  {hasEvent && (
                    <rect
                      x={safeNum(cx - COL_W / 2 + 4)} y={safeNum(rowY + 4)}
                      width={safeNum(COL_W - 8)} height={safeNum(ROW_H - 28)}
                      rx="6" fill={event!.color ?? typeColors!.bg} opacity="0.15"
                    />
                  )}

                  {/* Date number */}
                  <text x={cx} y={safeNum(rowY + 30)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={hasEvent ? (event!.color ?? typeColors!.bg) : numColor}
                  >
                    {cell.day}
                  </text>

                  {/* Event label */}
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 50)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '10.5'}
                      fontWeight={isHighlight ? '800' : '600'}
                      fill={event!.color ?? typeColors!.bg}
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

      {/* Notices */}
      {data.notices?.map((notice, i) => (
        <g key={i}>
          <circle cx={CARD_X + 14} cy={safeNum(CARD_Y + cardH + 22 + i * 22)} r="2.5" fill="#A08060" />
          <text x={CARD_X + 24} y={safeNum(CARD_Y + cardH + 27 + i * 22)}
            fontSize="11.5" fill="#6B5444">
            {notice}
          </text>
        </g>
      ))}

      {/* Footer area */}
      <g transform={safeTranslate(300, safeNum(CARD_Y + cardH + noticeCount * 22 + 60))}>
        <text x="0" y="0" textAnchor="middle" fontSize="16" fontWeight="800" fill="#5A3E28">
          {data.clinicName}
        </text>
        <text x="0" y="22" textAnchor="middle" fontSize="11" fill="#A08060" letterSpacing="1">
          HANOK MEDICAL CLINIC
        </text>
      </g>
    </svg>
  );
}
