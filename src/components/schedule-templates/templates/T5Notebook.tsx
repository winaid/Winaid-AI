import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const SIDE_W = 140;
const CAL_X = SIDE_W + 20;
const CAL_W = 600 - CAL_X - 20;
const COL_W = CAL_W / 7;
const HEADER_H = 40;
const ROW_H_FULL = 68;
const ROW_H_WEEKLY = 96;
const CAL_Y = 20;

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
  const noticeCount = data.notices?.length ?? 0;
  const contentH = safeNum(CAL_Y + calH + noticeCount * 22 + 40);
  const svgH = safeNum(Math.max(contentH, 500));
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
      {/* 흰 배경 */}
      <rect width="600" height={svgH} fill="white" />

      {/* 좌측 세로 블루 사이드바 — 핵심 실루엣 */}
      <rect x="0" y="0" width={SIDE_W} height={svgH} fill={BLUE} />

      {/* 사이드바 안 장식 */}
      <circle cx="70" cy={safeNum(svgH - 60)} r="90" fill={BLUE_DARK} opacity="0.3" />

      {/* 사이드바 안: 클리닉명 세로 */}
      <text x="26" y="50" fontSize="12"
        fontWeight="500" fill="rgba(255,255,255,0.6)" letterSpacing="2">
        {data.clinicName}
      </text>

      {/* 사이드바 안: 큰 월 숫자 */}
      <text x="26" y="130" fontSize="64"
        fontWeight="900" fill={TEXT_WHITE}>
        {data.monthLabel.replace('월', '')}
      </text>
      <text x="26" y="160" fontSize="20"
        fontWeight="700" fill="rgba(255,255,255,0.8)">
        월
      </text>

      {/* 사이드바 안: 진료일정 */}
      <text x="26" y="200" fontSize="15"
        fontWeight="600" fill="rgba(255,255,255,0.7)" letterSpacing="2">
        진료일정
      </text>

      {/* 사이드바 하단: 클리닉명 반복 */}
      <text x="26" y={safeNum(svgH - 30)} fontSize="11"
        fontWeight="500" fill="rgba(255,255,255,0.5)" letterSpacing="1">
        {data.clinicName}
      </text>

      {/* 우측 본문: 타이틀 */}
      <text x={CAL_X} y="50" fontSize="22"
        fontWeight="800" fill="#1A2A3A">
        {data.title || `${data.monthLabel} 진료일정`}
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x={CAL_X} y="72" fontSize="12"
          fill="#888" fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 — 우측 본문 영역 */}
      <rect x={CAL_X} y={safeNum(CAL_Y + 70)} width={CAL_W} height={calH}
        rx="6" fill="white" stroke="#E0E8F0" strokeWidth="1" />

      {/* 캘린더 헤더 */}
      <rect x={CAL_X} y={safeNum(CAL_Y + 70)} width={CAL_W} height={HEADER_H}
        rx="6" fill={BLUE} />
      <rect x={CAL_X} y={safeNum(CAL_Y + 70 + HEADER_H / 2)} width={CAL_W}
        height={safeNum(HEADER_H / 2)} fill={BLUE} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CAL_X + i * COL_W + COL_W / 2)} y={safeNum(CAL_Y + 70 + 26)}
          textAnchor="middle" fontSize="12" fontWeight="700"
          fill={i === 0 ? '#FFB8B8' : i === 6 ? '#90CAF9' : TEXT_WHITE}
        >
          {day}
        </text>
      ))}

      {/* 캘린더 행 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CAL_Y + 70 + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CAL_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CAL_X + CAL_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#E8ECF0" strokeWidth="0.8" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CAL_X + di * COL_W + COL_W / 2);
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
                    <circle cx={cx} cy={safeNum(rowY + 24)} r={24}
                      fill={evColor} opacity={0.1} />
                  )}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 24)} r={17}
                      fill={evColor} opacity={isClosed ? 0.9 : 0.15} />
                  )}
                  <text x={cx} y={safeNum(rowY + 30)}
                    textAnchor="middle" fontSize="14"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={isClosed && hasEvent ? 'white' : hasEvent ? evColor : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 48)}
                      textAnchor="middle" fontSize={isHighlight ? '11' : '9.5'}
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
        <text key={i} x={CAL_X} y={safeNum(CAL_Y + 70 + calH + 20 + i * 22)}
          fontSize="11" fill="#6A7A8A" fontWeight="400">
          {n}
        </text>
      ))}
    </svg>
  );
}
