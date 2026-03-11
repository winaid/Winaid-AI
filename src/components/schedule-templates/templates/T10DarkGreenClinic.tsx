import React from 'react';
import type { ScheduleData, TemplateColors, CalendarViewMode } from '../types';
import { DEFAULT_COLORS } from '../types';
import { buildCalendarWeeks, getEventWeeks, safeNum, safeTranslate } from '../calendarEngine';

const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const CARD_X = 30;
const CARD_W = 540;
const COL_W = CARD_W / 7;
const HEADER_H = 44;
const ROW_H_FULL = 82;
const ROW_H_WEEKLY = 112;
const CARD_Y = 230;

interface Props {
  data: ScheduleData;
  width?: number;
  colors?: TemplateColors;
  mode?: CalendarViewMode;
}

/** Tooth icon (simple molar silhouette) */
function ToothIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={safeTranslate(x, y)} fill="white" opacity="0.9">
      <path d="M-8,-12 Q-10,-6 -12,4 Q-12,12 -8,14 Q-5,10 -3,6
               Q0,12 3,6 Q5,10 8,14 Q12,12 12,4 Q10,-6 8,-12
               Q4,-16 0,-16 Q-4,-16 -8,-12 Z" />
    </g>
  );
}

/** Diamond badge (45-degree rotated square) for event dates */
function Diamond({ cx, cy, size, fill, stroke, strokeWidth = 0 }: {
  cx: number; cy: number; size: number;
  fill: string; stroke?: string; strokeWidth?: number;
}) {
  const s = safeNum(size, 16);
  return (
    <rect
      x={safeNum(cx - s / 2)} y={safeNum(cy - s / 2)}
      width={s} height={s} rx="3"
      fill={fill}
      stroke={stroke ?? 'none'} strokeWidth={strokeWidth}
      transform={`rotate(45,${safeNum(cx)},${safeNum(cy)})`}
    />
  );
}

/** Blurred rectangle representing a clinic interior photo hint */
function ClinicPhotoHint({ x, y, w, h }: {
  x: number; y: number; w: number; h: number;
}) {
  return (
    <g opacity="0.15">
      <rect x={safeNum(x)} y={safeNum(y)} width={safeNum(w)} height={safeNum(h)}
        rx="6" fill="#5A8A7A" />
      <rect x={safeNum(x + 8)} y={safeNum(y + 6)} width={safeNum(w * 0.35)} height={safeNum(h - 12)}
        rx="3" fill="#3D6B5E" />
      <rect x={safeNum(x + w * 0.45)} y={safeNum(y + 10)} width={safeNum(w * 0.45)} height={safeNum(h - 20)}
        rx="3" fill="#4A7D6E" />
    </g>
  );
}

export default function T10DarkGreenClinic({ data, width = 600, colors, mode = 'full' }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const isWeekly = mode === 'weekly';
  const isHighlight = mode === 'highlight';
  const allWeeks = buildCalendarWeeks(data.year, data.month);
  const weeks = isWeekly
    ? getEventWeeks(allWeeks, data.events.map(e => e.date))
    : allWeeks;
  const ROW_H = isWeekly ? ROW_H_WEEKLY : ROW_H_FULL;
  const calH = safeNum(HEADER_H + weeks.length * ROW_H);
  const cardH = safeNum(calH + 16);
  const noticeY = safeNum(CARD_Y + cardH + 20);
  const noticeCount = data.notices?.length ?? 0;
  const noticeBlockH = safeNum(noticeCount * 22 + 10);
  const svgH = safeNum(noticeY + noticeBlockH + 80, 600);
  const scale = safeNum(width / 600, 1);
  const splitY = safeNum(svgH * 0.42);

  const darkGreen = '#2C4A4A';
  const tealAccent = '#3A6B5E';
  const bannerGreen = '#3A7D5C';
  const normalGreen = '#2E7D52';
  const closedRed = C.closed ?? '#D32F2F';

  function getEvent(date: number) {
    return data.events.find(e => e.date === date);
  }

  function eventColor(ev: { type: string; color?: string }) {
    if (ev.color) return ev.color;
    if (ev.type === 'closed') return closedRed;
    if (ev.type === 'normal') return normalGreen;
    return tealAccent;
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
        <filter id="t10-shadow">
          <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="rgba(20,40,40,0.15)" />
        </filter>
      </defs>

      {/* Two-tone background: dark top, cream bottom */}
      <rect width="600" height={svgH} fill="#F5F0E8" />
      <rect width="600" height={splitY} fill={darkGreen} />

      {/* Clinic name + tooth icon */}
      <ToothIcon x={300} y={38} />
      <text x="300" y="78" textAnchor="middle" fontSize="16" fontWeight="600"
        fill="white" letterSpacing="2" opacity="0.9">
        {data.clinicName}
      </text>

      {/* Green rounded-rect banner with month title */}
      <rect x="160" y="100" width="280" height="48" rx="24"
        fill={bannerGreen} />
      <text x="300" y="131" textAnchor="middle" fontSize="22"
        fontWeight="800" fill="white">
        {data.title}
      </text>

      {/* Subtitle */}
      {data.subtitle && data.subtitle.split('\n').map((line, i) => (
        <text key={i} x="300" y={safeNum(172 + i * 22)}
          textAnchor="middle" fontSize="13" fill="rgba(255,255,255,0.75)" fontWeight="400">
          {line}
        </text>
      ))}

      {/* Calendar card (white with thin border) */}
      <rect x={CARD_X} y={CARD_Y} width={CARD_W} height={cardH}
        rx="8" fill="white" stroke="#D8D8D0" strokeWidth="1"
        filter="url(#t10-shadow)" />

      {/* Calendar header row */}
      {(['일', '월', '화', '수', '목', '금', '토'] as const).map((day, i) => (
        <text key={day}
          x={safeNum(CARD_X + i * COL_W + COL_W / 2)} y={safeNum(CARD_Y + 30)}
          textAnchor="middle" fontSize="14" fontWeight="700"
          fill={i === 0 ? '#C62828' : i === 6 ? '#1565C0' : '#3C3C3C'}
        >
          {day}
        </text>
      ))}

      {/* Header separator line */}
      <line x1={CARD_X + 10} y1={safeNum(CARD_Y + HEADER_H)}
        x2={safeNum(CARD_X + CARD_W - 10)} y2={safeNum(CARD_Y + HEADER_H)}
        stroke="#E0E0D8" strokeWidth="1" />

      {/* Calendar rows */}
      {weeks.map((week, wi) => {
        const rowY = safeNum(CARD_Y + HEADER_H + wi * ROW_H);
        return (
          <g key={wi}>
            {wi < weeks.length - 1 && (
              <line x1={safeNum(CARD_X + 10)} y1={safeNum(rowY + ROW_H)}
                x2={safeNum(CARD_X + CARD_W - 10)} y2={safeNum(rowY + ROW_H)}
                stroke="#EEEEE8" strokeWidth="0.5" />
            )}

            {week.map((cell, di) => {
              const cx = safeNum(CARD_X + di * COL_W + COL_W / 2);
              const cy = safeNum(rowY + 32);
              const event = getEvent(cell.day);
              const current = cell.isCurrentMonth;
              const hasEvent = !!event && current;
              const dimmed = isHighlight && current && !hasEvent;

              let numColor = di === 0 ? '#C62828' : di === 6 ? '#1565C0' : '#333333';
              if (!current) numColor = '#C8C8C0';

              const diamondSize = isWeekly ? 30 : 26;

              return (
                <g key={di} opacity={dimmed ? 0.22 : 1}>
                  {/* Highlight glow */}
                  {isHighlight && hasEvent && (
                    <Diamond cx={cx} cy={cy} size={safeNum(diamondSize + 10)}
                      fill={eventColor(event!)} strokeWidth={0} />
                  )}

                  {/* Diamond badge for event dates */}
                  {hasEvent && (
                    <Diamond cx={cx} cy={cy} size={diamondSize}
                      fill={event!.type === 'closed' ? closedRed : darkGreen}
                      stroke={event!.type === 'closed' ? closedRed : tealAccent}
                      strokeWidth={0} />
                  )}

                  {/* Date number */}
                  <text x={cx} y={safeNum(cy + 5)}
                    textAnchor="middle" fontSize="16"
                    fontWeight={hasEvent ? '700' : '400'}
                    fill={hasEvent ? 'white' : numColor}
                  >
                    {cell.day}
                  </text>

                  {/* Event label below diamond */}
                  {hasEvent && (
                    <text x={cx} y={safeNum(cy + (isWeekly ? 38 : 32))}
                      textAnchor="middle"
                      fontSize={isHighlight ? '12' : '11'}
                      fontWeight="700"
                      fill={eventColor(event!)}
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

      {/* Notices section */}
      {data.notices && data.notices.length > 0 && data.notices.map((note, i) => (
        <text key={i} x="300" y={safeNum(noticeY + 16 + i * 22)}
          textAnchor="middle" fontSize="12.5" fontWeight="500" fill="#4A5A5A">
          {note}
        </text>
      ))}

      {/* Bottom dark green strip with clinic photo hints */}
      <rect x="0" y={safeNum(svgH - 60)} width="600" height="60"
        fill={darkGreen} opacity="0.85" />
      <ClinicPhotoHint x={30} y={safeNum(svgH - 52)} w={160} h={44} />
      <ClinicPhotoHint x={220} y={safeNum(svgH - 52)} w={160} h={44} />
      <ClinicPhotoHint x={410} y={safeNum(svgH - 52)} w={160} h={44} />
    </svg>
  );
}
