import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 480 / 7;
const CARD_X = 60;
const CARD_W = 480;
const HEADER_H = 42;
const ROW_H_FULL = 78;
const ROW_H_WEEKLY = 108;
const CARD_Y = 270;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
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
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 80, 600);
  const scale = safeNum(width / 600, 1);

  const BLACK = '#111111';
  const CHARCOAL = '#1A1A1A';
  const GOLD = '#C9A84C';
  const GOLD_BRIGHT = '#E8CC6A';
  const GOLD_DIM = '#8A7030';
  const WINE = '#A04040';

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
      {/* 순흑 배경 */}
      <rect width="600" height={svgH} fill={BLACK} />

      {/* 골드 프레임 — 전체를 감싸는 이중 테두리 */}
      <rect x="14" y="14" width="572" height={safeNum(svgH - 28)}
        rx="2" fill="none" stroke={GOLD} strokeWidth="1.5" />
      <rect x="20" y="20" width="560" height={safeNum(svgH - 40)}
        rx="1" fill="none" stroke={GOLD_DIM} strokeWidth="0.6" />

      {/* 네 모서리 골드 장식 — L자 코너 */}
      {[
        { x: 14, y: 14, sx: 1, sy: 1 },
        { x: 586, y: 14, sx: -1, sy: 1 },
        { x: 14, y: safeNum(svgH - 14), sx: 1, sy: -1 },
        { x: 586, y: safeNum(svgH - 14), sx: -1, sy: -1 },
      ].map((c, i) => (
        <g key={i} transform={safeTranslate(c.x, c.y)}>
          <line x1="0" y1="0" x2={safeNum(30 * c.sx)} y2="0" stroke={GOLD_BRIGHT} strokeWidth="2" />
          <line x1="0" y1="0" x2="0" y2={safeNum(30 * c.sy)} stroke={GOLD_BRIGHT} strokeWidth="2" />
        </g>
      ))}

      {/* 상단 골드 악센트 */}
      <line x1="220" y1="42" x2="380" y2="42"
        stroke={GOLD} strokeWidth="0.8" />
      <circle cx="300" cy="42" r="2.5" fill={GOLD} />

      {/* 클리닉명 — 넓은 레터스페이싱, 골드 */}
      <text x="300" y="75" textAnchor="middle" fontSize="12" fontWeight="500"
        fill={GOLD} letterSpacing="8">
        {data.clinicName}
      </text>

      {/* 월 타이틀 — 대형, 가볍게 */}
      <text x="300" y="140" textAnchor="middle" fontSize="52" fontWeight="300"
        fill="white" letterSpacing="4">
        {data.monthLabel}
      </text>
      <text x="300" y="175" textAnchor="middle" fontSize="16" fontWeight="400"
        fill={GOLD} letterSpacing="6">
        진료일정 안내
      </text>

      {/* 골드 구분선 */}
      <line x1="240" y1="195" x2="360" y2="195"
        stroke={GOLD_DIM} strokeWidth="0.6" />

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="225" textAnchor="middle" fontSize="12"
          fill="#888" fontWeight="300">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 — 어두운 배경 위, 골드 라인 구분 */}
      {/* 헤더 */}
      <line x1={CARD_X} y1={CARD_Y} x2={safeNum(CARD_X + CARD_W)} y2={CARD_Y}
        stroke={GOLD_DIM} strokeWidth="0.8" />

      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => {
        const textColor = i === 0 ? WINE : i === 6 ? '#5A7A8A' : '#AAA';
        return (
          <text key={day}
            x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 28)}
            textAnchor="middle" fontSize="12" fontWeight="500"
            fill={textColor} letterSpacing="1"
          >
            {day}
          </text>
        );
      })}

      <line x1={CARD_X} y1={safeNum(CARD_Y + HEADER_H)}
        x2={safeNum(CARD_X + CARD_W)} y2={safeNum(CARD_Y + HEADER_H)}
        stroke={GOLD_DIM} strokeWidth="0.6" />

      {/* 캘린더 행 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#2A2A2A" strokeWidth="0.5" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? '#CC6666' : di === 6 ? '#6688AA' : '#CCC';
              if (!current) numColor = '#333';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? WINE : GOLD);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={evColor} opacity={0.12} />
                  )}
                  {/* 이벤트 마커: 골드 다이아몬드(일반) / 와인 원(휴진) */}
                  {hasEvent && isClosed && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={20}
                      fill={evColor} opacity="0.9" />
                  )}
                  {hasEvent && !isClosed && (
                    <rect
                      x={safeNum(cx - 14)} y={safeNum(rowY + 14)}
                      width="28" height="28" rx="2"
                      fill="none" stroke={evColor} strokeWidth="1.2"
                      transform={`rotate(45,${safeNum(cx)},${safeNum(rowY + 28)})`}
                      opacity="0.7"
                    />
                  )}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="17"
                    fontWeight={hasEvent ? '600' : '300'}
                    fill={hasEvent && isClosed ? 'white' : hasEvent ? evColor : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 56)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '10.5'}
                      fontWeight={isHighlight ? '600' : '400'}
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

      {/* 안내사항 — 골드 톤 */}
      {data.notices && data.notices.length > 0 && data.notices.map((n, i) => (
        <text key={i} x="300" y={safeNum(CARD_Y + cardH + 20 + i * 22)}
          textAnchor="middle" fontSize="11.5"
          fill="#888" fontWeight="300">
          {n}
        </text>
      ))}

      {/* 하단 — 골드 장식 + 클리닉명 */}
      <g transform={safeTranslate(300, safeNum(svgH - 40))}>
        <line x1="-60" y1="-8" x2="60" y2="-8"
          stroke={GOLD} strokeWidth="0.6" />
        <circle cx="0" cy="-8" r="2" fill={GOLD} />
        <text x="0" y="10" textAnchor="middle" fontSize="12"
          fontWeight="400" fill={GOLD} letterSpacing="5">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
