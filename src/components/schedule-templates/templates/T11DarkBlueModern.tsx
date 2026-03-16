import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 30;
const CARD_W = 540;
const COL_W = CARD_W / 7;
const HEADER_H = 44;
const ROW_H_FULL = 72;
const ROW_H_WEEKLY = 100;
const CARD_Y = 250;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
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
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 60, 600);
  const scale = safeNum(width / 600, 1);

  const NAVY = '#0D1B3E';
  const NAVY_MID = '#152D5A';
  const TEXT_WHITE = '#E8E8F0';

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
      {/* 상단 40% 네이비 블록 */}
      <rect width="600" height="230" fill={NAVY} />
      {/* 하단 흰색 */}
      <rect y="230" width="600" height={safeNum(svgH - 230)} fill="#F5F6FA" />

      {/* 네이비 블록 안 장식: 큰 반투명 원 */}
      <circle cx="500" cy="40" r="130" fill={NAVY_MID} opacity="0.5" />
      <circle cx="80" cy="190" r="80" fill={NAVY_MID} opacity="0.4" />

      {/* 클리닉명 */}
      <text x={CARD_X} y="45" fontSize="13"
        fontWeight="500" fill="rgba(255,255,255,0.6)" letterSpacing="3">
        {data.clinicName}
      </text>

      {/* 대형 타이틀 — 좌측 정렬, 흰색 */}
      <text x={CARD_X} y="110" fontSize="48"
        fontWeight="900" fill={TEXT_WHITE}>
        {data.title || `${data.monthLabel} 진료일정`}
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x={CARD_X} y="145" fontSize="14"
          fontWeight="400" fill="rgba(255,255,255,0.5)">
          {data.subtitle}
        </text>
      )}

      {/* 네이비 얇은 악센트 바 */}
      <rect x={CARD_X} y="165" width="80" height="4" rx="2" fill="rgba(255,255,255,0.3)" />

      {/* 흰 캘린더 카드 — 경계에 걸침 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="10" fill="white" />

      {/* 캘린더 헤더 — 네이비 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="10" fill={NAVY} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={NAVY} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 29)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#FF8A8A' : i === 6 ? '#7AB8FF' : 'rgba(255,255,255,0.85)'}
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

              let numColor = di === 0 ? '#E53935' : di === 6 ? '#1565C0' : '#1A2A3A';
              if (!current) numColor = '#C0C8D0';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? '#C04040' : NAVY);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={28}
                      fill={evColor} opacity={0.12} />
                  )}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={20}
                      fill={evColor} opacity={isClosed ? 0.9 : 0.85} />
                  )}
                  <text x={cx} y={safeNum(rowY + 32)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={hasEvent ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 52)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '11'}
                      fontWeight="700"
                      fill={evColor}
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

      {/* 안내사항 */}
      {data.notices && data.notices.map((notice, i) => (
        <text key={i} x={safeNum(CARD_X + 4)} y={safeNum(CARD_Y + cardH + 20 + i * 22)}
          fontSize="12" fill="#6A7A8A" fontWeight="400">
          {notice}
        </text>
      ))}

      {/* 하단 — 네이비 바 */}
      <rect x="0" y={safeNum(svgH - 36)} width="600" height="36" fill={NAVY} />
      <text x={CARD_X} y={safeNum(svgH - 12)} fontSize="12"
        fontWeight="600" fill="rgba(255,255,255,0.7)" letterSpacing="1">
        {data.clinicName}
      </text>
    </svg>
  );
}
