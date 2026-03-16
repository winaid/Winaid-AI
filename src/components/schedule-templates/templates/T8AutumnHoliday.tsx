import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 50;
const CARD_W = 500;
const COL_W = CARD_W / 7;
const HEADER_H = 40;
const ROW_H_FULL = 74;
const ROW_H_WEEKLY = 104;
const CARD_Y = 240;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Simple leaf shape */
function WarmLeaf({ x, y, size = 1, rot = 0 }: {
  x: number; y: number; size?: number; rot?: number;
}) {
  return (
    <g transform={`${safeTranslate(x, y)} rotate(${safeNum(rot)}) scale(${safeNum(size, 1)})`}>
      <ellipse cx="0" cy="0" rx="10" ry="18" fill="white" opacity="0.2" />
    </g>
  );
}

export default function T8AutumnHoliday({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const noticeH = data.notices && data.notices.length > 0 ? safeNum(20 + data.notices.length * 20) : 0;
  const cardH = safeNum(calH + noticeH + 28);
  const svgH = safeNum(CARD_Y + cardH + 50, 600);
  const scale = safeNum(width / 600, 1);

  const CORAL = '#E8856A';
  const CORAL_DARK = '#C96B52';
  const CORAL_LIGHT = '#F0A088';

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
        <filter id="t8-card-shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="10" floodColor="rgba(180,100,60,0.2)" />
        </filter>
      </defs>

      {/* 전면 웜 코랄 배경 */}
      <rect width="600" height={svgH} fill={CORAL} />

      {/* 배경 장식: 큰 반투명 원형들 — 따뜻한 톤 깊이 */}
      <circle cx="520" cy="80" r="140" fill={CORAL_DARK} opacity="0.2" />
      <circle cx="60" cy={safeNum(svgH - 80)} r="100" fill={CORAL_DARK} opacity="0.15" />
      <circle cx="300" cy="160" r="200" fill={CORAL_LIGHT} opacity="0.1" />

      {/* 흰 잎 장식 — 코너에 흩어짐 */}
      <WarmLeaf x={40} y={40} size={1.8} rot={-30} />
      <WarmLeaf x={90} y={70} size={1.2} rot={20} />
      <WarmLeaf x={560} y={35} size={2.0} rot={25} />
      <WarmLeaf x={510} y={80} size={1.4} rot={-15} />
      <WarmLeaf x={30} y={safeNum(svgH - 35)} size={1.5} rot={40} />
      <WarmLeaf x={570} y={safeNum(svgH - 30)} size={1.6} rot={-35} />

      {/* 클리닉명 */}
      <text x="300" y="60" textAnchor="middle" fontSize="14"
        fontWeight="500" fill="rgba(255,255,255,0.7)" letterSpacing="3">
        {data.clinicName}
      </text>

      {/* 대형 타이틀 */}
      <text x="300" y="120" textAnchor="middle" fontSize="48"
        fontWeight="900" fill="white" letterSpacing="-1">
        {data.title || `${data.monthLabel} 휴진안내`}
      </text>

      {/* 부제 */}
      {data.subtitle && (
        <text x="300" y="155" textAnchor="middle" fontSize="14"
          fontWeight="400" fill="rgba(255,255,255,0.7)">
          {data.subtitle}
        </text>
      )}

      {/* 흰 분리선 */}
      <line x1="240" y1="175" x2="360" y2="175"
        stroke="white" strokeWidth="1" opacity="0.4" />

      {/* 중앙 흰 라운드 카드 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="16" fill="white" filter="url(#t8-card-shadow)" />

      {/* 캘린더 헤더 */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="16" fill="#FAF0EA" />
      <rect x={CARD_X} y={safeNum(CARD_Y + HEADER_H / 2)} width={CARD_W}
        height={safeNum(HEADER_H / 2)} fill="#FAF0EA" />

      {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 27)}
          textAnchor="middle" fontSize="13" fontWeight="700"
          fill={i === 0 ? CORAL_DARK : '#6B5D4F'}
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
              <line x1={safeNum(CARD_X + 10)} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W - 10)} y2={safeNum(rowY + ROW_H)}
                stroke="#F0E8E0" strokeWidth="1" />
            )}
            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              const isClosed = hasEvent && event!.type === 'closed';
              let numColor = di === 0 ? CORAL_DARK : '#3C2F24';
              if (!current) numColor = '#CCC4B8';

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={20}
                      fill={isClosed ? (event!.color ?? CORAL) : '#F5E6D8'}
                      opacity={isClosed ? 1 : 0.8}
                    />
                  )}
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 26)} r={26}
                      fill={isClosed ? (event!.color ?? CORAL) : CORAL_LIGHT}
                      opacity={0.15} />
                  )}
                  <text x={cx} y={safeNum(rowY + 32)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={isClosed ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>
                  {hasEvent && (
                    <text x={cx} y={safeNum(rowY + 54)}
                      textAnchor="middle" fontSize="11" fontWeight="700"
                      fill={isClosed ? CORAL_DARK : '#8B7355'}
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

      {/* 안내사항 — 카드 안 하단 */}
      {data.notices && data.notices.length > 0 && (
        <g>
          <line x1={safeNum(CARD_X + 20)} y1={safeNum(CARD_Y + calH + 10)}
            x2={safeNum(CARD_X + CARD_W - 20)} y2={safeNum(CARD_Y + calH + 10)}
            stroke="#F0E8E0" strokeWidth="1" />
          {data.notices.map((notice, i) => (
            <text key={i}
              x={safeNum(CARD_X + CARD_W / 2)}
              y={safeNum(CARD_Y + calH + 30 + i * 20)}
              textAnchor="middle" fontSize="11.5" fontWeight="400" fill="#8B7355">
              {notice}
            </text>
          ))}
        </g>
      )}

      {/* 하단 클리닉명 — 코랄 배경 위 흰색 */}
      <text x="300" y={safeNum(svgH - 20)}
        textAnchor="middle" fontSize="15" fontWeight="800" fill="white">
        {data.clinicName}
      </text>
    </svg>
  );
}
