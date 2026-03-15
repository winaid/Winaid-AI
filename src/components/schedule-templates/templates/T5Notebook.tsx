import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 30;
const CARD_W = 540;
const COL_W = CARD_W / 7;
const HEADER_H = 42;
const ROW_H_FULL = 74;
const ROW_H_WEEKLY = 104;
const CARD_Y = 150;

/**
 * T5 — 미니멀 문서 (Minimal Document)
 *
 * 성격: 깔끔한 문서 스타일 — 정보 중심, 장식 최소
 * 차별점: 그리드 라인이 보이는 문서형 셀, 블루 모노톤
 * 대상: "간결하고 읽기 좋은 달력"을 원하는 병원
 */

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
  const svgH = safeNum(CARD_Y + cardH + noticeCount * 22 + 80, 600);
  const scale = safeNum(width / 600, 1);

  const DOC_BLUE = '#1565C0';
  const LIGHT_BLUE = '#E3F0FC';
  const TEXT_DARK = '#1A2A3A';

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
      {/* 배경: 흰색 (문서 용지) */}
      <rect width="600" height={svgH} fill="white" />

      {/* 상단 블루 악센트 바 (문서 상단 라인) */}
      <rect x="0" y="0" width="600" height="4" fill={DOC_BLUE} />

      {/* 클리닉명 — 좌측 정렬 (문서형) */}
      <text x={CARD_X} y="40" fontSize="14"
        fontWeight="600" fill={DOC_BLUE} letterSpacing="1">
        {data.clinicName}
      </text>

      {/* 구분선 */}
      <line x1={CARD_X} y1="52" x2={safeNum(CARD_X + CARD_W)} y2="52"
        stroke="#E0E8F0" strokeWidth="1" />

      {/* 월 타이틀 — 대형, 좌측 정렬 */}
      <text x={CARD_X} y="95" fontSize="42"
        fontWeight="900" fill={TEXT_DARK}>
        {data.monthLabel} 진료일정
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x={CARD_X} y="125" fontSize="13"
          fill="#7A8A9A" fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 카드 — 얇은 테두리 (문서 표) */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="2" fill="white" stroke="#D0D8E4" strokeWidth="1" />

      {/* 캘린더 헤더 — 연한 블루 배경 (문서 표 헤더) */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="2" fill={LIGHT_BLUE} />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill={LIGHT_BLUE} />
      <line x1={CARD_X} y1={safeNum(CARD_Y + HEADER_H)}
        x2={safeNum(CARD_X + CARD_W)} y2={safeNum(CARD_Y + HEADER_H)}
        stroke="#D0D8E4" strokeWidth="1" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 27)}
          textAnchor="middle" fontSize="13" fontWeight="600"
          fill={i === 0 ? '#E53935' : i === 6 ? DOC_BLUE : TEXT_DARK}
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

              let numColor = di === 0 ? '#E53935' : di === 6 ? DOC_BLUE : TEXT_DARK;
              if (!current) numColor = '#C0C8D0';

              const evColor = event?.color ?? (isClosed ? '#E53935' : DOC_BLUE);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={28}
                      fill={evColor} opacity={0.1} />
                  )}
                  {/* 문서형 이벤트: 셀 배경 채움 (표 강조) */}
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

      {/* 안내사항 — 문서 스타일 (번호 목록) */}
      {data.notices && data.notices.length > 0 && (
        <g>
          {data.notices.map((n, i) => (
            <text key={i} x={safeNum(CARD_X + 4)} y={safeNum(CARD_Y + cardH + 22 + i * 22)}
              fontSize="12" fill="#5A6A7A" fontWeight="400">
              {`${i + 1}. ${n}`}
            </text>
          ))}
        </g>
      )}

      {/* 하단 — 문서 푸터 라인 + 클리닉명 */}
      <line x1={CARD_X} y1={safeNum(svgH - 40)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(svgH - 40)}
        stroke="#E0E8F0" strokeWidth="1" />
      <text x={CARD_X} y={safeNum(svgH - 20)} fontSize="12"
        fontWeight="600" fill={DOC_BLUE} letterSpacing="1">
        {data.clinicName}
      </text>
      <text x={safeNum(CARD_X + CARD_W)} y={safeNum(svgH - 20)}
        textAnchor="end" fontSize="10" fill="#A0A8B4">
        진료일정 안내
      </text>
    </svg>
  );
}
