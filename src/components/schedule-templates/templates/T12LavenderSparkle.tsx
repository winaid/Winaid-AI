import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COL_W = 560 / 7;
const CARD_X = 20;
const CARD_W = 560;
const HEADER_H = 44;
const ROW_H_FULL = 82;
const ROW_H_WEEKLY = 112;
const GRID_Y = 140;

/**
 * T12 — 뉴트럴 클린 (Neutral Clean)
 *
 * 리서치 근거: 한국 피부과/여성의원 인테리어 디자인
 * - 피부과 브랜딩의 주류: 화이트+베이지+그레이 모노크롬 (medinterior.com, dopamine7.com)
 * - "깔끔하고 모던한 디자인, 베이지·화이트·파스텔톤 등 차분하고 세련된 색상"
 * - 심플 심볼 로고 + 모노크롬/그레이 팔레트가 피부과 표준
 * - 기존 라벤더/스파클은 화장품 브랜드에 가까워 피부과 문법과 불일치 → 뉴트럴 톤으로 교체
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
  const noticeY = safeNum(GRID_Y + calH + 24);
  const noticeCount = data.notices?.length ?? 0;
  const svgH = safeNum(noticeY + noticeCount * 24 + (noticeCount > 0 ? 80 : 50), 600);
  const scale = safeNum(width / 600, 1);

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  // 뉴트럴 팔레트: 베이지/웜그레이/차콜 (피부과 인테리어 기반)
  const WARM_BEIGE = '#F5F0E8';
  const SOFT_TAUPE = '#D4C9B8';
  const CHARCOAL = '#3C3835';
  const MUTED_BROWN = '#8A7E72';
  const ACCENT_GOLD = '#B8A48C';
  const CLOSED_RED = '#C4685A';

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={safeNum(svgH * scale)}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="t12-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDFBF7" />
          <stop offset="100%" stopColor={WARM_BEIGE} />
        </linearGradient>
      </defs>

      {/* 배경: 오프화이트 → 웜베이지 그라디언트 (피부과 벽면 톤) */}
      <rect width="600" height={svgH} fill="url(#t12-bg)" />

      {/* 상단 얇은 악센트 라인 (미니멀 브랜딩 요소) */}
      <rect x="0" y="0" width="600" height="3" fill={ACCENT_GOLD} />

      {/* 클리닉명 — 심플 타이포 (피부과 로고 스타일: 절제된 대문자) */}
      <text x="300" y="42" textAnchor="middle" fontSize="13" fontWeight="500"
        fill={MUTED_BROWN} letterSpacing="4">
        {data.clinicName}
      </text>

      {/* 구분선 */}
      <line x1="250" y1="54" x2="350" y2="54" stroke={SOFT_TAUPE} strokeWidth="0.8" />

      {/* 월 타이틀 — 대형 타이포, 차콜 */}
      <text x="300" y="95" textAnchor="middle" fontSize="48" fontWeight="800"
        fill={CHARCOAL} letterSpacing="-1">
        {data.monthLabel} 진료일정
      </text>

      {/* 서브타이틀 */}
      {data.subtitle && (
        <text x="300" y="120" textAnchor="middle" fontSize="13" fill={MUTED_BROWN} fontWeight="400">
          {data.subtitle}
        </text>
      )}

      {/* 캘린더 헤더 — 웜 베이지 배경 */}
      <rect x={CARD_X} y={GRID_Y} width={CARD_W} height={HEADER_H}
        rx="6" fill={SOFT_TAUPE} opacity="0.35" />
      <rect x={CARD_X} y={safeNum(GRID_Y + HEADER_H / 2)} width={CARD_W} height={safeNum(HEADER_H / 2)}
        fill={SOFT_TAUPE} opacity="0.35" />

      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => {
        const textColor = i === 0 ? CLOSED_RED : i === 6 ? '#5A7A9A' : CHARCOAL;
        return (
          <text key={day}
            x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(GRID_Y + 28)}
            textAnchor="middle" fontSize="13" fontWeight="600" fill={textColor}
          >
            {day}
          </text>
        );
      })}

      <line x1={CARD_X} y1={safeNum(GRID_Y + HEADER_H)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(GRID_Y + HEADER_H)}
        stroke={SOFT_TAUPE} strokeWidth="1" />

      {/* 캘린더 행 */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(GRID_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)} x2={safeNum(CARD_X + CARD_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#E8E2D8" strokeWidth="0.8" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? CLOSED_RED : di === 6 ? '#5A7A9A' : '#444';
              if (!current) numColor = '#C8C0B5';

              const isClosed = hasEvent && event!.type === 'closed';
              const evColor = event?.color ?? (isClosed ? CLOSED_RED : ACCENT_GOLD);

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28} fill={evColor} opacity={0.12} />
                  )}
                  {/* 이벤트: 미니멀 원형 — 채움(휴진) / 윤곽(일반) */}
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={22}
                      fill={isClosed ? evColor : 'none'}
                      stroke={isClosed ? 'none' : evColor}
                      strokeWidth="1.8" />
                  )}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="17"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={isClosed ? 'white' : numColor}>
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 58)}
                      textAnchor="middle" fontSize={isHighlight ? '12' : '10.5'}
                      fontWeight={isHighlight ? '700' : '500'}
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

      {/* 안내사항 — 미니멀 박스 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <rect x="40" y={safeNum(noticeY - 8)} width="520"
            height={safeNum(data.notices.length * 24 + 20)}
            rx="8" fill={WARM_BEIGE} stroke="#E0D8CC" strokeWidth="0.8" />
          {data.notices.map((n, i) => (
            <text key={i} x="300" y={safeNum(noticeY + 14 + i * 24)}
              textAnchor="middle" fontSize="12"
              fill={i === 0 ? CHARCOAL : MUTED_BROWN}
              fontWeight={i === 0 ? '600' : '400'}>
              {n}
            </text>
          ))}
        </g>
      )}

      {/* 하단 악센트 라인 + 클리닉명 */}
      <line x1="200" y1={safeNum(svgH - 38)} x2="400" y2={safeNum(svgH - 38)}
        stroke={SOFT_TAUPE} strokeWidth="0.8" />
      <text x="300" y={safeNum(svgH - 18)} textAnchor="middle"
        fontSize="14" fontWeight="600" fill={CHARCOAL} letterSpacing="2">
        {data.clinicName}
      </text>
    </svg>
  );
}
