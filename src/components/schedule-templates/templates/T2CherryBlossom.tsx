import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 540 / 7;
const CARD_X = 30;
const CARD_W = 540;
const HEADER_H = 42;
const ROW_H_FULL = 76;
const ROW_H_WEEKLY = 106;
const CARD_Y = 280;

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
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 24 + 60, 600);
  const scale = safeNum(width / 600, 1);

  const ROSE = '#D4447C';
  const ROSE_DARK = '#B8305E';
  const ROSE_LIGHT = '#F8E0EC';
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
      {/* 상단 로즈핑크 블록 — 전체 너비, 상단 40% */}
      <rect width="600" height="260" fill={ROSE} />
      {/* 하단 흰색 */}
      <rect y="260" width="600" height={safeNum(svgH - 260)} fill="white" />

      {/* 핑크 블록 안 장식: 큰 원형 반투명 */}
      <circle cx="500" cy="60" r="120" fill="#E0558E" opacity="0.3" />
      <circle cx="80" cy="200" r="80" fill="#C03A6C" opacity="0.2" />

      {/* 클리닉명 — 핑크 블록 안, 큰 흰색 */}
      <text x="300" y="80" textAnchor="middle" fontSize="15"
        fontWeight="500" fill="rgba(255,255,255,0.75)" letterSpacing="4">
        {data.clinicName}
      </text>

      {/* 큰 로고 이니셜 원 */}
      <circle cx="300" cy="140" r="42" fill="white" />
      <text x="300" y="155" textAnchor="middle" fontSize="38"
        fontWeight="900" fill={ROSE}>
        {data.clinicName.charAt(0)}
      </text>

      {/* 월 타이틀 */}
      <text x="300" y="218" textAnchor="middle" fontSize="36"
        fontWeight="900" fill={TEXT_WHITE} letterSpacing="1">
        {data.monthLabel} 진료일정
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="248" textAnchor="middle" fontSize="13"
          fontWeight="400" fill="rgba(255,255,255,0.7)">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 카드 — 흰 라운드 카드, 핑크존/흰존 경계에 걸침 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="12" fill="white" stroke={ROSE_LIGHT} strokeWidth="1.5" />

      {/* 캘린더 헤더 — 로즈핑크 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="12" fill={ROSE} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={ROSE} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 28)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#FFD0D0' : TEXT_WHITE}
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
                stroke={ROSE_LIGHT} strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? ROSE_DARK : '#333';
              if (!current) numColor = '#D0C0C8';

              const evColor = event?.color ?? ROSE;

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={28}
                      fill={evColor} opacity={0.15} />
                  )}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={20}
                      fill={evColor} opacity="0.15" />
                  )}
                  <text x={cx} y={safeNum(rowY + 32)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={hasEvent ? evColor : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 52)}
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
        <g key={i}>
          <circle cx={safeNum(CARD_X + 14)} cy={safeNum(CARD_Y + cardH + 20 + i * 24)}
            r="2.5" fill={ROSE} />
          <text x={safeNum(CARD_X + 24)} y={safeNum(CARD_Y + cardH + 25 + i * 24)}
            fontSize="12" fill="#555" fontWeight="400">
            {n}
          </text>
        </g>
      ))}

      {/* 하단 브랜딩 푸터 */}
      <g transform={safeTranslate(300, safeNum(svgH - 25))}>
        <circle cx="-60" cy="0" r="10" fill={ROSE} />
        <text x="-60" y="4" textAnchor="middle" fontSize="10"
          fontWeight="900" fill="white">
          {data.clinicName.charAt(0)}
        </text>
        <text x="-38" y="5" fontSize="14" fontWeight="700" fill="#333">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
