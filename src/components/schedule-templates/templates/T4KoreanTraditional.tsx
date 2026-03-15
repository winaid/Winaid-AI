import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 540 / 7;
const CARD_X = 30;
const CARD_W = 540;
const HEADER_H = 46;
const ROW_H_FULL = 74;
const ROW_H_WEEKLY = 105;

/**
 * T4 — 전통 문서 (Traditional Document)
 *
 * 성격: 문서형 전통 — 한의원/명절 공식 안내, 격식 있는 전통 느낌
 * 차별점: 이중 테두리 프레임, 전통 기하 문양, 오방색 이벤트
 *        T9 한옥 기와(프레임형)와 구분: 장식적 프레임 아닌 "문서 격식"
 * 대상: "전통적이면서 공식적인 안내"가 필요한 한의원
 *
 * 오방색(五方色) 매핑:
 * - 赤(남/화): 휴진, 黑(북/수): 야간, 靑(동/목): 정상, 黃(중앙/토): 세미나
 */
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  closed:  { bg: '#8B1A2A', text: 'white' },
  night:   { bg: '#2C3E50', text: 'white' },
  normal:  { bg: '#1B5E4B', text: 'white' },
  seminar: { bg: '#8B7D3C', text: 'white' },
  custom:  { bg: '#6B4C1A', text: 'white' },
};

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** 전통 기하 문양 (코너) */
function TraditionalCorner({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rot)})`} opacity="0.4">
      <rect x="0" y="0" width="28" height="28" fill="none" stroke="#8B6914" strokeWidth="1.5" />
      <rect x="4" y="4" width="20" height="20" fill="none" stroke="#8B6914" strokeWidth="0.8" />
      <line x1="0" y1="14" x2="10" y2="14" stroke="#8B6914" strokeWidth="0.8" />
      <line x1="14" y1="0" x2="14" y2="10" stroke="#8B6914" strokeWidth="0.8" />
    </g>
  );
}

export default function T4KoreanTraditional({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const CARD_Y = 220;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 90, 600);
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
      <defs>
        <linearGradient id="t4-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5EDD5" />
          <stop offset="100%" stopColor="#EDE0C4" />
        </linearGradient>
      </defs>

      {/* 한지 느낌 배경 */}
      <rect width="600" height={svgH} fill="url(#t4-bg)" />

      {/* 이중 문서 테두리 (전통 문서 격식) */}
      <rect x="12" y="12" width="576" height={safeNum(svgH - 24)}
        rx="2" fill="none" stroke="#B8A060" strokeWidth="2" />
      <rect x="18" y="18" width="564" height={safeNum(svgH - 36)}
        rx="1" fill="none" stroke="#B8A060" strokeWidth="0.8" />

      {/* 네 모서리 전통 기하 문양 */}
      <TraditionalCorner x={24} y={24} rot={0} />
      <TraditionalCorner x={safeNum(600 - 52)} y={24} rot={90} />
      <TraditionalCorner x={24} y={safeNum(svgH - 52)} rot={270} />
      <TraditionalCorner x={safeNum(600 - 52)} y={safeNum(svgH - 52)} rot={180} />

      {/* 공식 문서 헤더 영역 */}
      <line x1="80" y1="70" x2="520" y2="70"
        stroke="#B8A060" strokeWidth="0.8" />

      {/* 클리닉명 (발신처) */}
      <text x="300" y="60" textAnchor="middle" fontSize="16"
        fontWeight="700" fill="#3E2A0A" letterSpacing="4">
        {data.clinicName}
      </text>

      {/* 월 안내 제목 */}
      <text x="300" y="130" textAnchor="middle" fontSize="46" fontWeight="900"
        fill="#3E2A0A" letterSpacing="2">
        {data.monthLabel} 진료일정
      </text>

      {/* 전통 구분선 (삼단) */}
      <g transform={safeTranslate(300, 150)}>
        <line x1="-120" y1="0" x2="-20" y2="0" stroke="#B8A060" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="3" fill="#B8A060" />
        <line x1="20" y1="0" x2="120" y2="0" stroke="#B8A060" strokeWidth="0.8" />
      </g>

      {/* 부제 */}
      {data.subtitle && data.subtitle.split('\n').map((line, i) => (
        <text key={i} x="300" y={safeNum(175 + i * 22)}
          textAnchor="middle" fontSize="14" fill="#6B4C1A">
          {line}
        </text>
      ))}

      {/* 캘린더 카드 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="4" fill="white" stroke="#D4C5A9" strokeWidth="1" />

      {/* 캘린더 헤더 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="4" fill="white" stroke="#D4C5A9" strokeWidth="1" />
      <line x1={CARD_X} y1={safeNum(CARD_Y + HEADER_H)}
        x2={safeNum(CARD_X + CARD_W)} y2={safeNum(CARD_Y + HEADER_H)}
        stroke="#D4C5A9" strokeWidth="1" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 31)}
          textAnchor="middle" fontSize="15" fontWeight="600"
          fill={i === 0 ? '#8B1A2A' : '#3E2A0A'}
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
                stroke="#E8DCC8" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const typeColors = hasEvent ? (TYPE_COLORS[event!.type] ?? TYPE_COLORS.custom) : null;

              let numColor = di === 0 ? '#8B1A2A' : '#3E2A0A';
              if (!current) numColor = '#C4B8A0';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={30}
                      fill={event!.color ?? typeColors!.bg} opacity={0.18} />
                  )}
                  {/* 오방색 원형 뱃지 */}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={24}
                      fill={event!.color ?? typeColors!.bg} />
                  )}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="15"
                    fontWeight={hasEvent ? '700' : '500'}
                    fill={hasEvent ? typeColors!.text : numColor}
                  >
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 54)}
                      textAnchor="middle" fontSize={isHighlight ? '11.5' : '10'}
                      fontWeight={isHighlight ? '800' : '600'}
                      fill={event!.color ?? typeColors!.bg}>
                      {event!.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* 안내사항 — 전통 문서 스타일 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          {data.notices.map((n, i) => (
            <g key={i}>
              <text x={safeNum(CARD_X + 16)}
                y={safeNum(CARD_Y + cardH + 24 + i * 22)}
                fontSize="12" fill="#6B4C1A"
                fontWeight={i === 0 ? '600' : '400'}>
                {`• ${n}`}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* 하단 서명 */}
      <g transform={safeTranslate(300, safeNum(svgH - 40))}>
        <line x1="-80" y1="-10" x2="80" y2="-10"
          stroke="#B8A060" strokeWidth="0.8" />
        <text x="0" y="8" textAnchor="middle" fontSize="15"
          fontWeight="700" fill="#3E2A0A" letterSpacing="2">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
