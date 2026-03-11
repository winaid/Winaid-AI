// ── SVG 좌표 안전 유틸 ──────────────────────────────────────────
/** undefined / NaN / Infinity → fallback(기본 0)으로 치환 */
export const safeNum = (v: unknown, fb = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;

/** 안전한 translate 문자열 생성 */
export const safeTranslate = (x: unknown, y: unknown) =>
  `translate(${safeNum(x)},${safeNum(y)})`;

/** 안전한 rotate 문자열 생성 */
export const safeRotate = (deg: unknown, cx?: unknown, cy?: unknown) =>
  cx !== undefined
    ? `rotate(${safeNum(deg)},${safeNum(cx)},${safeNum(cy)})`
    : `rotate(${safeNum(deg)})`;

export interface CalendarCell {
  day: number;
  isCurrentMonth: boolean;
  weekIndex: number;
  dayIndex: number; // 0=Sun … 6=Sat
  dual?: number;    // "23/30" 같이 두 날짜를 한 칸에 표시할 때
}

/** 해당 월의 달력 주(row) 배열을 반환 */
export function buildCalendarWeeks(year: number, month: number): CalendarCell[][] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  const flat: { day: number; isCurrentMonth: boolean }[] = [];

  // 이전달 채우기
  for (let i = 0; i < firstDay; i++) {
    flat.push({ day: prevMonthDays - firstDay + 1 + i, isCurrentMonth: false });
  }
  // 이번달
  for (let d = 1; d <= daysInMonth; d++) {
    flat.push({ day: d, isCurrentMonth: true });
  }
  // 다음달 채우기
  const trailing = (7 - (flat.length % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    flat.push({ day: i, isCurrentMonth: false });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < flat.length; i++) {
    const wi = Math.floor(i / 7);
    const di = i % 7;
    if (di === 0) weeks.push([]);
    weeks[wi].push({ ...flat[i], weekIndex: wi, dayIndex: di });
  }
  return weeks;
}

/**
 * 6주가 필요한 달을 5주로 압축. 마지막 행 일요일에 "23/30" 식으로 dual 표기.
 * T3(단풍) 같은 템플릿용.
 */
export function buildCompactCalendarWeeks(year: number, month: number): CalendarCell[][] {
  const weeks = buildCalendarWeeks(year, month);
  if (weeks.length <= 5) return weeks;

  const merged = weeks[4].map((cell, i) => {
    const extra = weeks[5]?.[i];
    if (cell.isCurrentMonth && extra?.isCurrentMonth) {
      return { ...cell, dual: extra.day };
    }
    return cell;
  });

  return [...weeks.slice(0, 4), merged];
}

/**
 * 이벤트가 포함된 주(week)만 추출 (한 주 모드용)
 * 연속된 범위로 확장하고, 최소 2주를 보장
 */
export function getEventWeeks(
  weeks: CalendarCell[][],
  eventDates: number[],
  rangeDays?: { start: number; end: number }[],
): CalendarCell[][] {
  if (weeks.length === 0) return weeks;

  const allDates = new Set(eventDates);
  // range 안의 날짜도 이벤트 날짜로 포함
  (rangeDays ?? []).forEach(r => {
    for (let d = r.start; d <= r.end; d++) allDates.add(d);
  });

  // 이벤트가 있는 주 인덱스 찾기
  const hitIndices: number[] = [];
  weeks.forEach((week, wi) => {
    if (week.some(c => c.isCurrentMonth && allDates.has(c.day))) {
      hitIndices.push(wi);
    }
  });

  if (hitIndices.length === 0) return weeks.slice(0, 2); // fallback: 첫 2주

  // 최소~최대 인덱스의 연속 범위
  const minWi = Math.min(...hitIndices);
  const maxWi = Math.max(...hitIndices);

  // 최소 2주 보장
  let startWi = minWi;
  let endWi = Math.max(maxWi, minWi + 1);

  // 범위를 벗어나지 않도록
  if (endWi >= weeks.length) {
    endWi = weeks.length - 1;
    startWi = Math.max(0, endWi - 1);
  }

  return weeks.slice(startWi, endWi + 1);
}

/** 특정 날짜가 range 안에 있는지 */
export function isInRange(day: number, ranges: { start: number; end: number }[]): boolean {
  return ranges.some(r => day >= r.start && day <= r.end);
}

/** 한 주(row) 안에서 range의 시작/끝 열(column) 인덱스 반환 */
export function getRangeBoundsInWeek(
  range: { start: number; end: number },
  week: CalendarCell[]
): { startCol: number; endCol: number } | null {
  let startCol = -1;
  let endCol = -1;
  for (let i = 0; i < week.length; i++) {
    const c = week[i];
    if (!c.isCurrentMonth) continue;
    if (c.day >= range.start && c.day <= range.end) {
      if (startCol === -1) startCol = i;
      endCol = i;
    }
  }
  return startCol === -1 ? null : { startCol, endCol };
}
