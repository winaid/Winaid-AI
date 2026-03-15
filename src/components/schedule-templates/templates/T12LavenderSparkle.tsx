import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 520 / 7;
const CARD_X = 40;
const CARD_W = 520;
const HEADER_H = 44;
const ROW_H_FULL = 82;
const ROW_H_WEEKLY = 112;
const CARD_Y = 180;

/**
 * T12 — 프리미엄 소프트 (Premium Soft)
 *
 * 성격: 고급 클리닉 느낌 — 피부과·여성의원·에스테틱
 * 차별점: 넓은 여백, 골드 악센트, 세리프 느낌의 고급 타이포
 *        다른 미니멀 템플릿(T5)과 구분: 여백+골드로 "고급감"
 * 대상: "고급스럽고 세련된 안내"를 원하는 피부과/여성의원
 */

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
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 24 + 100, 600);
  const scale = safeNum(width / 600, 1);

  const IVORY = '#FAF8F3';
  const GOLD = '#C4A872';
  const GOLD_LIGHT = '#E8DABE';
  const CHARCOAL = '#2E2B26';
  const MUTED_TAUPE = '#9A8E7E';
  const CLOSED_WINE = '#9A4A4A';

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
      {/* 배경: 아이보리 (프리미엄 톤) */}
      <rect width="600" height={svgH} fill={IVORY} />

      {/* 골드 프레임 — 전체를 감싸는 얇은 테두리 (고급감) */}
      <rect x="16" y="16" width="568" height={safeNum(svgH - 32)}
        rx="3" fill="none" stroke={GOLD_LIGHT} strokeWidth="1" />
      <rect x="20" y="20" width="560" height={safeNum(svgH - 40)}
        rx="2" fill="none" stroke={GOLD} strokeWidth="0.6" />

      {/* 상단 골드 악센트 */}
      <line x1="200" y1="36" x2="400" y2="36"
        stroke={GOLD} strokeWidth="1" />
      <circle cx="300" cy="36" r="3" fill={GOLD} />

      {/* 클리닉명 — 고급 레터스페이싱 */}
      <text x="300" y="68" textAnchor="middle" fontSize="12" fontWeight="500"
        fill={MUTED_TAUPE} letterSpacing="6">
        {data.clinicName}
      </text>

      {/* 월 타이틀 — 대형, 넓은 여백 */}
      <text x="300" y="120" textAnchor="middle" fontSize="44" fontWeight="300"
        fill={CHARCOAL} letterSpacing="2">
        {data.monthLabel}
      </text>
      <text x="300" y="150" textAnchor="middle" fontSize="16" fontWeight="500"
        fill={MUTED_TAUPE} letterSpacing="4">
        진료일정 안내
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="170" textAnchor="middle" fontSize="12"
          fill={MUTED_TAUPE} fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 — 넓은 좌우 패딩 (고급 여백) */}
      {/* 캘린더 헤더 */}
      <line x1={CARD_X} y1={CARD_Y} x2={safeNum(CARD_X + CARD_W)} y2={CARD_Y}
        stroke={GOLD_LIGHT} strokeWidth="1" />

      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => {
        const textColor = i === 0 ? CLOSED_WINE : i === 6 ? '#5A7A8A' : CHARCOAL;
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
        stroke={GOLD_LIGHT} strokeWidth="0.8" />

      {/* 캘린더 행 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#EDE6DA" strokeWidth="0.6" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? CLOSED_WINE : di === 6 ? '#5A7A8A' : '#4A4540';
              if (!current) numColor = '#D0C8BC';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? CLOSED_WINE : GOLD);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={evColor} opacity={0.1} />
                  )}
                  {/* 프리미엄 이벤트: 골드 다이아몬드 or 와인 원형 */}
                  {hasEvent && isClosed && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={22}
                      fill={evColor} opacity="0.15" />
                  )}
                  {hasEvent && !isClosed && (
                    <g transform={safeTranslate(cx, safeNum(rowY + 28))}>
                      <rect x="-16" y="-16" width="32" height="32" rx="2"
                        fill="none" stroke={evColor} strokeWidth="1"
                        transform="rotate(45)" opacity="0.4" />
                    </g>
                  )}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="17"
                    fontWeight={hasEvent ? '600' : '300'}
                    fill={hasEvent ? evColor : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 58)}
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

      {/* 안내사항 — 골드 프레임 박스 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <rect x={CARD_X} y={safeNum(CARD_Y + cardH + 16)}
            width={CARD_W} height={safeNum(noticeCount * 24 + 18)}
            rx="4" fill="none" stroke={GOLD_LIGHT} strokeWidth="0.8" />
          {data.notices.map((n, i) => (
            <text key={i} x="300" y={safeNum(CARD_Y + cardH + 38 + i * 24)}
              textAnchor="middle" fontSize="12"
              fill={i === 0 ? CHARCOAL : MUTED_TAUPE}
              fontWeight={i === 0 ? '500' : '300'}>
              {n}
            </text>
          ))}
        </g>
      )}

      {/* 하단 프리미엄 서명 */}
      <g transform={safeTranslate(300, safeNum(svgH - 48))}>
        <line x1="-80" y1="-8" x2="80" y2="-8"
          stroke={GOLD} strokeWidth="0.6" />
        <circle cx="0" cy="-8" r="2.5" fill={GOLD} />
        <text x="0" y="12" textAnchor="middle" fontSize="13"
          fontWeight="500" fill={CHARCOAL} letterSpacing="4">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
