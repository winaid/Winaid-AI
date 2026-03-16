import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCompactCalendarWeeks, getEventWeeks, safeNum } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 540 / 7;
const CARD_X = 30;
const CARD_W = 540;
const HEADER_H = 42;
const ROW_H_FULL = 76;
const ROW_H_WEEKLY = 106;
const CARD_Y = 200;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

export default function T3Autumn({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCompactCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 24 + 80, 600);
  const scale = safeNum(width / 600, 1);

  const RED = '#C62828';
  const RED_DARK = '#8E1A1A';
  const CHARCOAL = '#1A1A1A';

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
      {/* 흰 배경 — 공문 용지 */}
      <rect width="600" height={svgH} fill="white" />

      {/* 굵은 빨간 가로줄 2개 — 관공서 공문 핵심 시각 훅 (썸네일에서 확실히 보여야 함) */}
      <rect x="0" y="0" width="600" height="28" fill={RED} />
      <rect x="0" y="36" width="600" height="12" fill={RED} />

      {/* 클리닉명 — 좌측 정렬 공문 발신처 */}
      <text x={CARD_X} y="72" fontSize="13"
        fontWeight="600" fill={RED} letterSpacing="3">
        {data.clinicName}
      </text>

      {/* 구분선 */}
      <line x1={CARD_X} y1="84" x2={safeNum(CARD_X + CARD_W)} y2="84"
        stroke="#DDD" strokeWidth="1" />

      {/* 대형 타이틀 — 좌측 정렬, 공문 격식 */}
      <text x={CARD_X} y="125" fontSize="48"
        fontWeight="900" fill={CHARCOAL}>
        {data.monthLabel} 진료일정
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x={CARD_X} y="155" fontSize="14"
          fill="#666" fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 빨간 악센트 바 — 타이틀과 달력 사이 */}
      <rect x={CARD_X} y="170" width="120" height="6" rx="3" fill={RED} />

      {/* 캘린더 — 빨간 헤더 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="0" fill="white" stroke="#E0E0E0" strokeWidth="1" />

      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        fill={RED} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 28)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#FFB8B8' : 'white'}
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
                stroke="#EAEAEA" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const dayText = cell.dual ? `${cell.day}/${cell.dual}` : String(cell.day);

              let numColor = di === 0 ? RED : CHARCOAL;
              if (!current) numColor = '#CCC';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? RED : '#333');

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={evColor} opacity={0.12} />
                  )}
                  {/* 공문형: 이벤트 날짜에 빨간 밑줄 */}
                  {hasEvent && (
                    <line x1={safeNum(cx - 22)} y1={safeNum(rowY + 38)}
                      x2={safeNum(cx + 22)} y2={safeNum(rowY + 38)}
                      stroke={evColor} strokeWidth="3" />
                  )}
                  <text x={cx} y={safeNum(rowY + 32)}
                    textAnchor="middle" fontSize={cell.dual ? 13 : 16}
                    fontWeight={hasEvent ? '800' : '500'}
                    fill={hasEvent ? evColor : numColor}>
                    {dayText}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 56)}
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

      {/* 안내사항 — ※ 공문 스타일 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          {data.notices.map((n, i) => (
            <text key={i} x={safeNum(CARD_X + 4)} y={safeNum(CARD_Y + cardH + 24 + i * 24)}
              fontSize="12" fill="#444" fontWeight="400">
              {`※ ${n}`}
            </text>
          ))}
        </g>
      )}

      {/* 하단 — 빨간 줄 + 클리닉명 (상단과 대칭, 두꺼운 줄) */}
      <rect x="0" y={safeNum(svgH - 40)} width="600" height="12" fill={RED} />
      <rect x="0" y={safeNum(svgH - 22)} width="600" height="22" fill={RED} />
      <text x={CARD_X} y={safeNum(svgH - 38)} fontSize="13"
        fontWeight="700" fill={CHARCOAL} letterSpacing="2">
        {data.clinicName}
      </text>
    </svg>
  );
}
