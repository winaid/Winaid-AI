import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCompactCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 540 / 7;
const CARD_X = 30;
const CARD_W = 540;
const HEADER_H = 44;
const ROW_H_FULL = 78;
const ROW_H_WEEKLY = 108;
const CARD_Y = 200;

/**
 * T3 — 가을 공문 (Autumn Official Notice)
 *
 * 성격: 실무 공문형 — 병원 공식 안내문/공지 느낌
 * 차별점: 정돈된 레이아웃, 공문 헤더 구조, 절제된 가을 톤
 * 대상: "공식적이고 격식 있는 안내가 필요한" 병원
 */

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
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 24 + 90, 600);
  const scale = safeNum(width / 600, 1);

  const CHARCOAL = '#2C2216';
  const WARM_BROWN = '#6B4C2A';
  const HEADER_BG = '#4A3728';
  const AUTUMN_ACCENT = '#C67A3C';
  const LIGHT_CREAM = '#FBF7F0';

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
      {/* 배경: 밝은 크림 (공문 용지 느낌) */}
      <rect width="600" height={svgH} fill={LIGHT_CREAM} />

      {/* 상단 공문 헤더 영역 — 이중선 테두리 */}
      <rect x="30" y="20" width="540" height="160" rx="2"
        fill="none" stroke={WARM_BROWN} strokeWidth="2" />
      <rect x="34" y="24" width="532" height="152" rx="1"
        fill="none" stroke={WARM_BROWN} strokeWidth="0.8" />

      {/* 공문 제목 라인 */}
      <line x1="60" y1="65" x2="540" y2="65"
        stroke={WARM_BROWN} strokeWidth="0.5" />

      {/* 클리닉명 (공문 발신처) */}
      <text x="300" y="55" textAnchor="middle" fontSize="18"
        fontWeight="700" fill={CHARCOAL} letterSpacing="3">
        {data.clinicName}
      </text>

      {/* 월 안내 제목 */}
      <text x="300" y="110" textAnchor="middle" fontSize="38"
        fontWeight="900" fill={CHARCOAL} letterSpacing="1">
        {data.monthLabel} 진료일정
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="145" textAnchor="middle" fontSize="13"
          fill={WARM_BROWN} fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 가을 악센트 라인 (공문 스타일 구분선, 절제된 가을 컬러) */}
      <rect x="180" y="155" width="240" height="3" rx="1.5"
        fill={AUTUMN_ACCENT} opacity="0.6" />

      {/* 캘린더 카드 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="4" fill="white" stroke="#D8CCBA" strokeWidth="1" />

      {/* 캘린더 헤더 — 차분한 브라운 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="4" fill={HEADER_BG} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={HEADER_BG} />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 29)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#FFAA9A' : 'white'}
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
                stroke="#E8DFD2" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;
              const dayText = cell.dual ? `${cell.day}/${cell.dual}` : String(cell.day);

              let numColor = di === 0 ? '#B8432A' : CHARCOAL;
              if (!current) numColor = '#C4BAA8';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? '#B8432A' : AUTUMN_ACCENT);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={evColor} opacity={0.12} />
                  )}
                  {/* 공문형 이벤트: 밑줄 강조 (도장 느낌) */}
                  {hasEvent && (
                    <g>
                      <line x1={safeNum(cx - 22)} y1={safeNum(rowY + 38)}
                        x2={safeNum(cx + 22)} y2={safeNum(rowY + 38)}
                        stroke={evColor} strokeWidth="2.5" />
                    </g>
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

      {/* 안내사항 — 공문 스타일 박스 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <rect x={CARD_X} y={safeNum(CARD_Y + cardH + 12)}
            width={CARD_W} height={safeNum(noticeCount * 24 + 16)}
            rx="3" fill="none" stroke="#D8CCBA" strokeWidth="0.8" />
          {data.notices.map((n, i) => (
            <g key={i}>
              <text x={safeNum(CARD_X + 16)} y={safeNum(CARD_Y + cardH + 32 + i * 24)}
                fontSize="12" fill={i === 0 ? CHARCOAL : WARM_BROWN}
                fontWeight={i === 0 ? '600' : '400'}>
                {`※ ${n}`}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* 하단 공문 서명 영역 */}
      <g transform={safeTranslate(300, safeNum(svgH - 40))}>
        <line x1="-100" y1="-12" x2="100" y2="-12"
          stroke={WARM_BROWN} strokeWidth="0.8" />
        <text x="0" y="6" textAnchor="middle" fontSize="14"
          fontWeight="700" fill={CHARCOAL} letterSpacing="2">
          {data.clinicName}
        </text>
      </g>
    </svg>
  );
}
