import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 22;
const CARD_W = 556;
const COL_W = CARD_W / 7;
const HEADER_H = 50;
const ROW_H_FULL = 85;
const ROW_H_WEEKLY = 115;
const CARD_Y = 220;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

// 6-pointed snowflake
function Snowflake({ x, y, r = 12, opacity = 0.4 }: {
  x: number; y: number; r?: number; opacity?: number;
}) {
  const sx = safeNum(x);
  const sy = safeNum(y);
  const sr = safeNum(r, 12);
  return (
    <g transform={safeTranslate(sx, sy)} opacity={safeNum(opacity, 0.4)}>
      {[0, 30, 60, 90, 120, 150].map((a, i) => (
        <line key={i}
          x1="0" y1={-sr} x2="0" y2={sr}
          stroke="#7BA7CF" strokeWidth="2.5"
          transform={`rotate(${safeNum(a)})`}
        />
      ))}
      {/* Branch ticks */}
      {[0, 60, 120, 180, 240, 300].map((a, i) => (
        <g key={i} transform={`rotate(${safeNum(a)})`}>
          <line x1="-5" y1={safeNum(-sr * 0.55)} x2="0" y2={safeNum(-sr * 0.7)} stroke="#7BA7CF" strokeWidth="2" />
          <line x1="5" y1={safeNum(-sr * 0.55)} x2="0" y2={safeNum(-sr * 0.7)} stroke="#7BA7CF" strokeWidth="2" />
        </g>
      ))}
      <circle cx="0" cy="0" r="3.5" fill="#7BA7CF" />
    </g>
  );
}

// Santa + reindeer silhouette (top-right)
function SantaSilhouette({ x, y }: { x: number; y: number }) {
  return (
    <g transform={safeTranslate(x, y)} opacity="0.4" fill="#5C7FAA">
      {/* Sleigh */}
      <path d="M 0,0 Q 40,-10 80,0 Q 70,15 40,18 Q 10,15 0,0 Z" />
      <path d="M 10,18 Q 30,30 60,28 Q 70,20 80,0" fill="none"
        stroke="#5C7FAA" strokeWidth="4" strokeLinecap="round" />
      {/* Santa */}
      <circle cx="20" cy="-18" r="12" />
      <rect x="8" y="-12" width="24" height="20" rx="4" />
      {/* Reindeer 1 */}
      <ellipse cx="110" cy="5" rx="22" ry="10" transform="rotate(-8,110,5)" />
      <circle cx="130" cy="-8" r="8" />
      {/* Antlers */}
      <path d="M 126,-16 L 120,-30 M 120,-30 L 115,-22 M 120,-30 L 125,-22"
        stroke="#5C7FAA" strokeWidth="2.5" fill="none" />
      <line x1="90" y1="12" x2="88" y2="28" stroke="#5C7FAA" strokeWidth="3" />
      <line x1="100" y1="13" x2="98" y2="29" stroke="#5C7FAA" strokeWidth="3" />
      {/* Reindeer 2 */}
      <ellipse cx="165" cy="3" rx="20" ry="9" transform="rotate(-8,165,3)" />
      <circle cx="183" cy="-9" r="7" />
      <path d="M 179,-16 L 174,-28 M 174,-28 L 170,-21 M 174,-28 L 179,-21"
        stroke="#5C7FAA" strokeWidth="2.5" fill="none" />
      <line x1="147" y1="10" x2="145" y2="25" stroke="#5C7FAA" strokeWidth="3" />
      <line x1="157" y1="10" x2="155" y2="25" stroke="#5C7FAA" strokeWidth="3" />
      {/* Harness lines */}
      <line x1="80" y1="2" x2="90" y2="5" stroke="#5C7FAA" strokeWidth="2" />
      <line x1="80" y1="2" x2="145" y2="5" stroke="#5C7FAA" strokeWidth="1.5" />
    </g>
  );
}

// Christmas tree (bottom)
function ChristmasTree({ x, y, h = 50 }: { x: number; y: number; h?: number }) {
  const sh = safeNum(h, 50);
  const w = safeNum(sh * 0.65);
  return (
    <g transform={safeTranslate(x, y)} opacity="0.4" fill="#4A7FA5">
      <polygon points={`0,${safeNum(-sh)} ${safeNum(-w)},${safeNum(sh * 0.2)} ${safeNum(w)},${safeNum(sh * 0.2)}`} />
      <polygon points={`0,${safeNum(-sh * 0.65)} ${safeNum(-w * 1.2)},${safeNum(sh * 0.5)} ${safeNum(w * 1.2)},${safeNum(sh * 0.5)}`} />
      <rect x="-8" y={safeNum(sh * 0.5)} width="16" height={safeNum(sh * 0.3)} fill="#4A7FA5" />
    </g>
  );
}

/**
 * T6 — 크리스마스 (Christmas)
 *
 * 리서치 근거:
 * - OhPrint.me 2025 크리스마스 카드 트렌드: 3대 팔레트 분석
 *   ① 네이비+골드 (VIP), ② 레드+베이지 (빈티지), ③ 그린+화이트 (미니멀)
 *   2025-2026 트렌드 = "담백한(muted) 톤", 금박 마감
 * - 세웅병원 크리스마스 휴진안내: 인사말(상단) + 휴진기간(중앙) + 재개일 + 응급연락처(하단) 구조
 * - GettyImagesBank 한국 크리스마스 템플릿: 트리 실루엣(빈도 1위) + 눈꽃(빈도 2위) + 루돌프
 *
 * 시각 요소 매핑:
 * - 파스텔 블루 배경 #D8E8F5 → "파스텔 블루+실버 (모던)" 팔레트 직접 차용
 * - Snowflake 9개 (크기/투명도 다양) → 눈꽃 = 가장 보편적 크리스마스 장식 (빈도 2위)
 * - SantaSilhouette opacity 0.22 → "담백한 디자인" 트렌드, 실루엣 > 풀컬러
 * - ChristmasTree opacity 0.2 하단 5개 → 트리 실루엣 = 컬러 배경 위 가장 보편적 (빈도 1위)
 * - 네이비 헤더 #1A3A5C → 의료 전문성 유지 (클래식 빨간 헤더 대신)
 */
export default function T6Christmas({ data, width = 600, colors, mode = 'full' }: Props) {
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
  const svgH = safeNum(CARD_Y + cardH + 65, 600);
  const scale = safeNum(width / 600, 1);

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  // Snowflake positions
  const flakes = [
    { x: 30, y: 30, r: 20, o: 0.6 },
    { x: 80, y: 65, r: 14, o: 0.5 },
    { x: 155, y: 18, r: 12, o: 0.45 },
    { x: 490, y: 25, r: 22, o: 0.55 },
    { x: 555, y: 70, r: 15, o: 0.5 },
    { x: 420, y: 55, r: 12, o: 0.4 },
    { x: 25, y: safeNum(svgH - 70), r: 16, o: 0.5 },
    { x: 570, y: safeNum(svgH - 50), r: 18, o: 0.5 },
    { x: 320, y: safeNum(svgH - 30), r: 13, o: 0.4 },
  ];

  return (
    <svg
      viewBox={`0 0 600 ${svgH}`}
      width={width}
      height={safeNum(svgH * scale)}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="t6-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D8E8F5" />
          <stop offset="100%" stopColor="#E8F0F8" />
        </linearGradient>
        <filter id="t6-shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="rgba(30,60,100,0.12)" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="600" height={svgH} fill="url(#t6-bg)" />

      {/* Snowflakes */}
      {flakes.map((f, i) => (
        <Snowflake key={i} x={f.x} y={f.y} r={f.r} opacity={f.o} />
      ))}

      {/* Santa silhouette top-right */}
      <SantaSilhouette x={360} y={52} />

      {/* Christmas trees bottom */}
      <ChristmasTree x={48} y={safeNum(svgH - 40)} h={65} />
      <ChristmasTree x={110} y={safeNum(svgH - 30)} h={50} />
      <ChristmasTree x={490} y={safeNum(svgH - 38)} h={60} />
      <ChristmasTree x={548} y={safeNum(svgH - 28)} h={48} />
      <ChristmasTree x={300} y={safeNum(svgH - 22)} h={40} />

      {/* Title */}
      <text x="300" y="90" textAnchor="middle" fontSize="58"
        fontWeight="900" fill="#1A3A5C" letterSpacing="-2">
        {data.monthLabel} 진료일정
      </text>

      {/* Subtitle (multi-line) */}
      {data.subtitle && data.subtitle.split('\n').map((line, i) => (
        <text key={i} x="300" y={safeNum(148 + i * 26)}
          textAnchor="middle" fontSize="14.5" fill="#4A6080" fontWeight="400">
          {line}
        </text>
      ))}

      {/* Calendar card */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="10" fill="white" filter="url(#t6-shadow)" />

      {/* Header */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={HEADER_H}
        rx="10" fill="#1A3A5C" />
      <rect x={CARD_X} y={CARD_Y + HEADER_H / 2} width={CARD_W} height={HEADER_H / 2} fill="#1A3A5C" />

      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={CARD_Y + 33}
          textAnchor="middle" fontSize="16" fontWeight="700" fill="white"
        >
          {day}
        </text>
      ))}

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={CARD_X} y1={safeNum(rowY + ROW_H)} x2={CARD_X + CARD_W} y2={safeNum(rowY + ROW_H)}
                stroke="#E8EEF5" strokeWidth="1" />
            )}
            {[1, 2, 3, 4, 5, 6].map(di => (
              <line key={di}
                x1={safeNum(CARD_X + di * COL_W)} y1={rowY}
                x2={safeNum(CARD_X + di * COL_W)} y2={safeNum(rowY + ROW_H)}
                stroke="#EEF3F8" strokeWidth="1" />
            ))}

            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? '#C62828' : '#2C3E50';
              if (!current) numColor = '#BDBDBD';

              const isSpecialClosed = !!event && current && !!event.color; // e.g. 성탄절 (red)
              const isRegularClosed = !!event && current && !event.color;   // 정기휴진 (yellow circle)

              const circleColor = isSpecialClosed
                ? (event!.color ?? '#D32F2F')
                : '#F9A825'; // yellow for regular

              return (
                <g key={di} opacity={dimmed ? 0.25 : 1}>
                  {/* Highlight glow */}
                  {isHighlight && hasEvent && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={28}
                      fill={isSpecialClosed ? circleColor : '#F9A825'} opacity={0.18} />
                  )}
                  {/* Circle badge */}
                  {(isSpecialClosed || isRegularClosed) && current && (
                    <circle cx={cx} cy={safeNum(rowY + 28)} r={22}
                      fill={isSpecialClosed ? circleColor : 'none'}
                      stroke={isSpecialClosed ? 'none' : '#F9A825'}
                      strokeWidth="2.5"
                    />
                  )}

                  {/* Date number */}
                  <text x={cx} y={safeNum(rowY + 34)}
                    textAnchor="middle" fontSize="18"
                    fontWeight={event && current ? '700' : '400'}
                    fill={isSpecialClosed ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>

                  {/* Event label below circle */}
                  {event && current && (
                    <text x={cx} y={safeNum(rowY + 62)}
                      textAnchor="middle" fontSize={isHighlight ? '13' : '12'} fontWeight={isHighlight ? '800' : '700'}
                      fill={isSpecialClosed ? event.color ?? '#D32F2F' : '#E65100'}
                    >
                      {event.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Footer */}
      <text x="300" y={safeNum(CARD_Y + cardH + 52)}
        textAnchor="middle" fontSize="17" fontWeight="800" fill="#1A3A5C">
        {data.clinicName}
      </text>
      <text x="300" y={safeNum(CARD_Y + cardH + 70)}
        textAnchor="middle" fontSize="10" fontWeight="400" fill="#7A96B0" letterSpacing="1.5">
        {data.clinicName}
      </text>
    </svg>
  );
}
