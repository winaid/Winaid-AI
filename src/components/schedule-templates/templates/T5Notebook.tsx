import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 30;
const CARD_W = 540;
const COL_W = CARD_W / 7;
const HEADER_H = 42;
const ROW_H_FULL = 74;
const ROW_H_WEEKLY = 104;
const CARD_Y = 240;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

export default function T5Notebook({ data, width = 600, colors, mode = 'full' }: Props) {
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
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 60, 600);
  const scale = safeNum(width / 600, 1);

  const BLUE = '#1565C0';
  const BLUE_DARK = '#0D47A1';
  const TEXT_WHITE = '#FFFFFF';

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
      {/* 상단 1/3 진한 블루 블록 */}
      <rect width="600" height="220" fill={BLUE} />
      {/* 하단 흰색 */}
      <rect y="220" width="600" height={safeNum(svgH - 220)} fill="white" />

      {/* 블루 블록 안 장식: 큰 반투명 원 */}
      <circle cx="520" cy="40" r="100" fill={BLUE_DARK} opacity="0.3" />
      <circle cx="60" cy="180" r="60" fill={BLUE_DARK} opacity="0.35" />

      {/* 클리닉명 — 좌측 정렬, 블루 블록 안 */}
      <text x={CARD_X} y="50" fontSize="14"
        fontWeight="500" fill="rgba(255,255,255,0.7)" letterSpacing="2">
        {data.clinicName}
      </text>

      {/* 대형 타이틀 — 좌측 정렬, 흰색 */}
      <text x={CARD_X} y="110" fontSize="46"
        fontWeight="900" fill={TEXT_WHITE}>
        {data.monthLabel}
      </text>
      <text x={CARD_X} y="145" fontSize="20"
        fontWeight="600" fill="rgba(255,255,255,0.85)" letterSpacing="2">
        진료일정 안내
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x={CARD_X} y="175" fontSize="13"
          fill="rgba(255,255,255,0.6)" fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 흰 캘린더 카드 — 블루/흰 경계에 걸침 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="8" fill="white" stroke="#E0E8F0" strokeWidth="1" />

      {/* 캘린더 헤더 — 진한 블루 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="8" fill={BLUE} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={BLUE} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 28)}
          textAnchor="middle" fontSize="13" fontWeight="700"
          fill={i === 0 ? '#FFB8B8' : i === 6 ? '#90CAF9' : TEXT_WHITE}
        >
          {day}
        </text>
      ))}

      {/* 캘린더 행 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#E8ECF0" strokeWidth="0.8" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const isClosed = hasEvent && event!.type === 'closed';

              let numColor = di === 0 ? '#E53935' : di === 6 ? BLUE : '#1A2A3A';
              if (!current) numColor = '#C0C8D0';

              const evColor = event?.color ?? (isClosed ? '#E53935' : BLUE);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={28}
                      fill={evColor} opacity={0.1} />
                  )}
                  {isClosed && (
                    <rect x={safeNum(cx - COL_W / 2 + 2)} y={safeNum(rowY + 2)}
                      width={safeNum(COL_W - 4)} height={safeNum(ROW_H - 4)}
                      rx="3" fill={evColor} opacity="0.08" />
                  )}
                  <text x={cx} y={safeNum(rowY + 28)}
                    textAnchor="middle" fontSize="15"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={hasEvent ? evColor : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 50)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '10.5'}
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

      {/* 안내사항 */}
      {data.notices && data.notices.length > 0 && data.notices.map((n, i) => (
        <text key={i} x={safeNum(CARD_X + 4)} y={safeNum(CARD_Y + cardH + 22 + i * 22)}
          fontSize="12" fill="#5A6A7A" fontWeight="400">
          {`${i + 1}. ${n}`}
        </text>
      ))}

      {/* 하단 — 블루 바 + 클리닉명 */}
      <rect x="0" y={safeNum(svgH - 36)} width="600" height="36" fill={BLUE} />
      <text x={CARD_X} y={safeNum(svgH - 12)} fontSize="12"
        fontWeight="600" fill={TEXT_WHITE} letterSpacing="1">
        {data.clinicName}
      </text>
      <text x={safeNum(CARD_X + CARD_W)} y={safeNum(svgH - 12)}
        textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.6)">
        진료일정 안내
      </text>
    </svg>
  );
}
