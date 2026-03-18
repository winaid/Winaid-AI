/**
 * calendarBuilders — 달력 HTML 빌더 모음
 *
 * calendarTemplateService.ts에서 추출.
 * 순수 함수: CalendarData → HTML string
 */

// ── 타입 ──

export interface CalendarData {
  month: number;
  year: number;
  title: string;            // "5월 진료 안내" 등
  closedDays: ClosedDay[];  // 휴진일
  shortenedDays?: ShortenedDay[];  // 단축 진료일
  vacationDays?: VacationDay[];    // 휴가일
  hospitalName?: string;
  notices?: string[];       // 하단 안내 문구
  colorTheme?: string;
  logoBase64?: string;      // data:image/...;base64,xxx 형식의 로고 이미지
  customMessage?: string;   // 사용자가 자유롭게 추가하는 하단 메시지
}

export interface ClosedDay {
  day: number;
  reason?: string; // "어린이날", "원장님 학회" 등
}

export interface ShortenedDay {
  day: number;
  hours?: string;  // "10:00~14:00"
  reason?: string;
}

export interface VacationDay {
  day: number;
  reason?: string;
}

// ── 한국 공휴일 ──

export function getHolidays(year: number, month: number): Map<number, string> {
  const fixed: Record<string, string> = {
    '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날',
    '6-6': '현충일', '8-15': '광복절', '10-3': '개천절',
    '10-9': '한글날', '12-25': '성탄절',
  };
  const result = new Map<number, string>();
  for (const [key, name] of Object.entries(fixed)) {
    const [m, d] = key.split('-').map(Number);
    if (m === month) result.set(d, name);
  }
  return result;
}

// ── 색상 테마 (빌더 공유) ──

export const THEMES: Record<string, { primary: string; light: string; accent: string; headerBg: string; subtle: string; border: string }> = {
  blue:     { primary: '#2563eb', light: '#eff6ff', accent: '#1d4ed8', headerBg: 'linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #1e3a8a 100%)', subtle: '#dbeafe', border: '#bfdbfe' },
  green:    { primary: '#16a34a', light: '#f0fdf4', accent: '#15803d', headerBg: 'linear-gradient(135deg, #16a34a 0%, #15803d 50%, #166534 100%)', subtle: '#bbf7d0', border: '#86efac' },
  pink:     { primary: '#db2777', light: '#fdf2f8', accent: '#be185d', headerBg: 'linear-gradient(135deg, #ec4899 0%, #db2777 50%, #be185d 100%)', subtle: '#fbcfe8', border: '#f9a8d4' },
  purple:   { primary: '#7c3aed', light: '#f5f3ff', accent: '#6d28d9', headerBg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)', subtle: '#ddd6fe', border: '#c4b5fd' },
  navy:     { primary: '#1e3a5f', light: '#f0f4f8', accent: '#0f2942', headerBg: 'linear-gradient(135deg, #1e3a5f 0%, #0f2942 50%, #0a1929 100%)', subtle: '#c8d6e5', border: '#a4b8cc' },
  coral:    { primary: '#e74c3c', light: '#fef5f4', accent: '#c0392b', headerBg: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 50%, #a93226 100%)', subtle: '#f5b7b1', border: '#f1948a' },
  teal:     { primary: '#0d9488', light: '#f0fdfa', accent: '#0f766e', headerBg: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)', subtle: '#99f6e4', border: '#5eead4' },
  charcoal: { primary: '#374151', light: '#f9fafb', accent: '#1f2937', headerBg: 'linear-gradient(135deg, #4b5563 0%, #374151 50%, #1f2937 100%)', subtle: '#d1d5db', border: '#9ca3af' },
};

// ── 공통 그리드 빌더 ──

/** 공통 달력 그리드 데이터 계산 */
function buildGridData(data: CalendarData) {
  const { month, year, closedDays, shortenedDays, vacationDays } = data;
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const holidays = getHolidays(year, month);
  const closedSet = new Map<number, string>();
  for (const cd of closedDays) closedSet.set(cd.day, cd.reason || '휴진');
  const shortenedSet = new Map<number, string>();
  for (const sd of (shortenedDays || [])) shortenedSet.set(sd.day, sd.hours || '단축');
  const vacationSet = new Map<number, string>();
  for (const vd of (vacationDays || [])) vacationSet.set(vd.day, vd.reason || '휴가');

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
  return { weeks, holidays, closedSet, shortenedSet, vacationSet };
}

const esc2 = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── 테마별 달력 빌더 ──

/**
 * 클린 그리드 테마 — 흰 배경, 파란 상단 바, 깔끔한 그리드
 */
function buildCleanGridCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:4px;border:1px solid #e8eef8;"><div style="min-height:62px;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      let numColor = '#1e293b';
      if (isSunday || isHol) numColor = '#dc2626';
      else if (isSat) numColor = '#2563eb';
      let cellBg = '#fff'; let badge = '';
      if (isClosed || isVac) {
        cellBg = '#fef2f2';
        numColor = '#dc2626';
        const label = isClosed ? closedSet.get(d)! : vacationSet.get(d)!;
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#fff;background:#dc2626;border-radius:4px;padding:2px 5px;display:inline-block;">${esc2(label)}</div>`;
      } else if (isShort) {
        cellBg = '#eff6ff';
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#fff;background:#2563eb;border-radius:4px;padding:2px 5px;display:inline-block;">${esc2(shortenedSet.get(d)!)}</div>`;
      }
      if (isHol && !isClosed && !isVac) badge = `<div style="margin-top:2px;font-size:9px;color:#dc2626;font-weight:600;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:2px;border:1px solid #e8eef8;background:${cellBg};"><div style="min-height:62px;text-align:center;padding:8px 2px 4px;">
        <span style="font-size:17px;font-weight:700;color:${numColor};">${d}</span>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayNames.map((n, i) => {
    const c = i === 0 ? '#fca5a5' : i === 6 ? '#93c5fd' : '#fff';
    return `<th style="padding:11px 4px;font-size:13px;font-weight:800;color:${c};text-align:center;">${n}</th>`;
  }).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:36px;object-fit:contain;margin-bottom:4px;" />` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:12px;font-size:12px;color:#475569;line-height:2;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:#f8fafc;border-radius:20px;overflow:hidden;min-height:700px;border:1px solid #e2e8f0;">
    <!-- 파란 상단 바 -->
    <div style="background:linear-gradient(90deg,#1d4ed8,#2563eb);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;">
      ${logoBase64 ? `<img src="${logoBase64}" style="max-height:32px;object-fit:contain;filter:brightness(0) invert(1);" />` : `<span style="font-size:15px;font-weight:700;color:rgba(255,255,255,0.9);">${esc2(hospitalName || '')}</span>`}
      <span style="font-size:13px;color:rgba(255,255,255,0.7);font-weight:500;">${year}년 ${month}월</span>
    </div>
    <!-- 제목 -->
    <div style="padding:28px 28px 16px;text-align:center;">
      <div style="font-size:44px;font-weight:900;color:#0f172a;letter-spacing:-1px;">${esc2(title)}</div>
      ${notices?.length ? `<div style="font-size:13px;color:#64748b;margin-top:8px;">${esc2(notices[0])}</div>` : ''}
    </div>
    <!-- 달력 -->
    <div style="margin:0 20px 20px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr style="background:#1e40af;">${headersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>
    </div>
    <!-- 범례 + 하단 -->
    <div style="padding:0 20px 24px;text-align:center;">
      <div style="display:flex;justify-content:center;gap:16px;margin-bottom:12px;">
        <span style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#fef2f2;border:1.5px solid #dc2626;"></span>휴진</span>
        <span style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#eff6ff;border:1.5px solid #2563eb;"></span>단축</span>
      </div>
      ${hospitalName && !logoBase64 ? `<div style="font-size:14px;font-weight:700;color:#1e40af;">${esc2(hospitalName)}</div>` : ''}
      ${customHTML}${noticesHTML}
    </div>
  </div>`;
}

/**
 * 가을 단풍 테마 — 오렌지 배경, 다크 헤더
 */
function buildAutumnCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:2px;border:1px solid #e5e5e5;background:#fff;"><div style="min-height:64px;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      let numColor = '#1a1a1a';
      if (isSunday || isHol) numColor = '#dc2626';
      else if (isSat) numColor = '#93c5fd';
      let badge = '';
      if (isClosed || isVac) {
        const label = isClosed ? closedSet.get(d)! : vacationSet.get(d)!;
        badge = `<div style="margin-top:5px;font-size:10px;font-weight:700;color:#713f12;background:#fcd34d;border-radius:12px;padding:2px 8px;display:inline-block;">${esc2(label)}</div>`;
      } else if (isShort) {
        badge = `<div style="margin-top:5px;font-size:10px;font-weight:700;color:#fff;background:#fb923c;border-radius:12px;padding:2px 8px;display:inline-block;">${esc2(shortenedSet.get(d)!)}</div>`;
      }
      if (isHol && !isClosed && !isVac && !isShort) badge = `<div style="margin-top:2px;font-size:9px;color:#dc2626;font-weight:600;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:2px;border:1px solid #e5e5e5;background:#fff;"><div style="min-height:64px;text-align:center;padding:8px 2px 4px;">
        <span style="font-size:18px;font-weight:700;color:${numColor};">${d}</span>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayNames.map((n, i) => {
    const c = i === 0 ? '#ef4444' : i === 6 ? '#93c5fd' : '#ffffff';
    return `<th style="padding:13px 4px;font-size:14px;font-weight:800;color:${c};text-align:center;">${n}</th>`;
  }).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:38px;object-fit:contain;margin-bottom:4px;" />` : '';
  const footerName = hospitalName ? `<div style="font-size:15px;font-weight:700;color:#7c2d12;margin-top:4px;">${esc2(hospitalName)}</div>` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:10px;font-size:12px;color:#78350f;line-height:2;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:12px;color:#92400e;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  const leafDecor = `
    <div style="position:absolute;top:8px;left:8px;font-size:24px;opacity:0.9;">🍁🍂🍁🍂</div>
    <div style="position:absolute;top:8px;right:8px;font-size:24px;opacity:0.9;">🍂🍁🍂🍁</div>
    <div style="position:absolute;top:44px;left:22px;font-size:18px;opacity:0.65;">🍁</div>
    <div style="position:absolute;top:44px;left:52px;font-size:14px;opacity:0.5;">🍂</div>
    <div style="position:absolute;top:44px;right:22px;font-size:18px;opacity:0.65;">🍂</div>
    <div style="position:absolute;top:44px;right:52px;font-size:14px;opacity:0.5;">🍁</div>
    <div style="position:absolute;top:70px;left:12px;font-size:12px;opacity:0.45;">🍁</div>
    <div style="position:absolute;top:70px;right:12px;font-size:12px;opacity:0.45;">🍂</div>
  `;

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:linear-gradient(160deg,#f97316 0%,#ea580c 100%);border-radius:20px;overflow:hidden;min-height:700px;position:relative;">
    ${leafDecor}
    <div style="position:relative;z-index:1;padding:40px 28px 20px;text-align:center;">
      <div style="font-size:34px;font-weight:900;color:#450a0a;letter-spacing:-0.5px;line-height:1.2;">${esc2(title)}</div>
      ${notices?.length ? `<div style="font-size:13px;color:#7c2d12;margin-top:10px;font-weight:600;">${esc2(notices[0])}</div>` : ''}
    </div>
    <div style="position:relative;z-index:1;margin:0 18px 20px;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.22);">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr style="background:#3d3d3d;">${headersHTML}</tr></thead>
        <tbody style="background:#fff;">${cellsHTML}</tbody>
      </table>
    </div>
    <div style="position:relative;z-index:1;text-align:center;padding:4px 20px 28px;">${logoHTML}${footerName}${customHTML}${noticesHTML}</div>
  </div>`;
}

/**
 * 기와지붕 전통 테마 — 베이지 배경, 한국 전통 기와 장식
 */
function buildKoreanTraditionalCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:2px;border:1px solid #d1d5db;background:#fff;"><div style="min-height:64px;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      let numColor = '#111827';
      if (isSunday || isHol) numColor = '#9b1c1c';
      else if (isSat) numColor = '#1e3a8a';
      let circleBg = ''; let label = ''; let badge = '';
      if (isClosed) {
        circleBg = `background:#9b1c1c;border-radius:50%;`;
        numColor = '#fff';
        label = closedSet.get(d)!;
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#9b1c1c;">${esc2(label)}</div>`;
      } else if (isShort) {
        circleBg = `background:#1e3a8a;border-radius:50%;`;
        numColor = '#fff';
        label = shortenedSet.get(d)!;
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#1e3a8a;">${esc2(label)}</div>`;
      } else if (isVac) {
        circleBg = `background:#6b7280;border-radius:50%;`;
        numColor = '#fff';
        label = vacationSet.get(d)!;
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#6b7280;">${esc2(label)}</div>`;
      }
      if (isHol && !isClosed && !isVac && !isShort) badge = `<div style="margin-top:2px;font-size:9px;color:#9b1c1c;font-weight:600;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:2px;border:1px solid #d1d5db;background:#fff;"><div style="min-height:64px;text-align:center;padding:6px 2px 4px;">
        <div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:36px;height:36px;${circleBg}">
          <span style="font-size:16px;font-weight:700;color:${numColor};">${d}</span>
        </div>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayNames.map((n, i) => {
    const c = i === 0 ? '#9b1c1c' : i === 6 ? '#1e3a8a' : '#111827';
    return `<th style="padding:12px 4px;font-size:13px;font-weight:800;color:${c};text-align:center;border-bottom:1px solid #d1d5db;">${n}</th>`;
  }).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:36px;object-fit:contain;margin-bottom:4px;" />` : '';
  const footerName = hospitalName ? `<div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc2(hospitalName)}</div>` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:12px;font-size:12px;color:#374151;line-height:2;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:12px;color:#374151;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:#fdfaf5;border-radius:20px;overflow:hidden;min-height:700px;position:relative;">
    <div style="position:relative;padding:28px 28px 12px;">
      <div style="position:absolute;top:16px;left:18px;font-size:60px;line-height:1;">🦢</div>
      <div style="position:absolute;top:14px;right:18px;font-size:28px;line-height:1;">☁️ ✦ ✦</div>
      <div style="text-align:center;padding-top:16px;">
        <div style="font-size:28px;font-weight:900;color:#111827;line-height:1.3;">${esc2(title)}</div>
        ${notices?.length ? `<div style="font-size:12px;color:#374151;margin-top:6px;">${esc2(notices[0])}</div>` : ''}
        ${(notices?.length ?? 0) > 1 ? `<div style="font-size:12px;color:#374151;margin-top:3px;">${esc2(notices![1])}</div>` : ''}
      </div>
    </div>
    <div style="margin:0 18px 18px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d1d5db;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr style="background:#fff;">${headersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>
    </div>
    <div style="text-align:center;padding:4px 20px 16px;">${logoHTML}${footerName}${customHTML}${noticesHTML}</div>
    <div style="height:34px;background:linear-gradient(180deg,#86efac 0%,#22c55e 100%);border-radius:0 0 20px 20px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-16px;left:8%;width:80px;height:32px;background:#16a34a;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-22px;left:33%;width:115px;height:40px;background:#15803d;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-13px;left:60%;width:72px;height:28px;background:#16a34a;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-19px;right:7%;width:92px;height:36px;background:#15803d;border-radius:50% 50% 0 0;"></div>
    </div>
  </div>`;
}

/**
 * 겨울 크리스마스 테마 — 연파랑 배경, 다크 네이비 헤더, 산타 썰매, 눈꽃, 크리스마스 트리
 */
function buildWinterCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:64px;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      let numColor = '#1e293b';
      if (isSunday || isHol) numColor = '#dc2626';
      else if (isSat) numColor = '#1e40af';
      let badge = '';
      if (isClosed || isVac) {
        const label = isClosed ? closedSet.get(d)! : vacationSet.get(d)!;
        const isChristmas = isHol && holidays.get(d) === '성탄절';
        const circleBg = isChristmas ? '#dc2626' : '#facc15';
        const textColor = isChristmas ? '#fff' : '#713f12';
        return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:64px;text-align:center;padding:6px 2px 4px;">
          <div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:36px;height:36px;background:${circleBg};border-radius:50%;">
            <span style="font-size:15px;font-weight:800;color:${textColor};">${d}</span>
          </div>
          <div style="margin-top:3px;font-size:9px;font-weight:700;color:${circleBg === '#facc15' ? '#92400e' : '#dc2626'};">${esc2(label)}</div>
        </div></td>`;
      }
      if (isShort) {
        const label = shortenedSet.get(d)!;
        return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:64px;text-align:center;padding:6px 2px 4px;">
          <div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:36px;height:36px;background:#dbeafe;border-radius:50%;">
            <span style="font-size:15px;font-weight:800;color:#1e40af;">${d}</span>
          </div>
          <div style="margin-top:3px;font-size:9px;font-weight:700;color:#1e40af;">${esc2(label)}</div>
        </div></td>`;
      }
      if (isHol) badge = `<div style="font-size:9px;color:#dc2626;font-weight:600;margin-top:2px;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:64px;text-align:center;padding:8px 2px 4px;">
        <span style="font-size:18px;font-weight:700;color:${numColor};">${d}</span>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayNames.map((n, i) => {
    const c = i === 0 ? '#fca5a5' : i === 6 ? '#bfdbfe' : '#e2e8f0';
    return `<th style="padding:12px 4px;font-size:13px;font-weight:800;color:${c};text-align:center;">${n}</th>`;
  }).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:34px;object-fit:contain;margin-bottom:4px;" />` : '';
  const footerName = hospitalName ? `<div style="font-size:14px;font-weight:700;color:#1e3a8a;margin-top:4px;">${esc2(hospitalName)}</div>` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:10px;font-size:12px;color:#374151;line-height:2;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:12px;color:#334155;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  const snowflakes = [
    [12,8,22],[30,15,18],[55,10,14],[72,5,20],[88,12,16],[8,30,12],[45,25,18],[80,28,14],[20,45,10],
    [65,40,16],[90,35,12],[5,55,20],[38,52,14],[75,48,18],[22,65,12]
  ].map(([l,t,s]) =>
    `<div style="position:absolute;left:${l}%;top:${t}%;font-size:${s}px;opacity:0.5;color:#93c5fd;">❄</div>`
  ).join('');

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:linear-gradient(160deg,#e0f2fe 0%,#bae6fd 60%,#e0f7ff 100%);border-radius:20px;overflow:hidden;min-height:700px;position:relative;">
    ${snowflakes}
    <div style="position:absolute;top:10px;right:14px;font-size:28px;line-height:1;z-index:2;">🛷</div>
    <div style="background:#1e3a8a;padding:16px 24px 14px;position:relative;z-index:1;">
      <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:1px;">${year}년 ${month}월</div>
      <div style="font-size:30px;font-weight:900;color:#fff;margin-top:2px;">${esc2(title)}</div>
      ${hospitalName ? `<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;font-weight:500;">${esc2(hospitalName)}</div>` : ''}
    </div>
    <div style="position:relative;z-index:1;margin:16px 14px 12px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(30,58,138,0.18);">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr style="background:#1e3a8a;">${headersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>
    </div>
    <div style="position:relative;z-index:1;text-align:center;padding:4px 16px 8px;">
      <div style="display:flex;justify-content:center;gap:16px;margin-bottom:8px;">
        <span style="font-size:11px;color:#374151;display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#facc15;"></span>정기휴진</span>
        <span style="font-size:11px;color:#374151;display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#dc2626;"></span>공휴일휴진</span>
      </div>
      ${logoHTML}${footerName}${customHTML}${noticesHTML}
    </div>
    <div style="text-align:center;padding:0 0 10px;font-size:28px;letter-spacing:4px;position:relative;z-index:1;">🎄⛄🎄</div>
  </div>`;
}

/**
 * 벚꽃 봄 테마 — 연핑크 배경, 큰 월 숫자, 벚꽃 장식
 */
function buildCherryBlossomCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:2px;border:1px solid #f3f4f6;background:#fff;"><div style="min-height:62px;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      let numColor = '#1f2937';
      if (isSunday || isHol) numColor = '#f97316';
      else if (isSat) numColor = '#93c5fd';
      let circleBg = ''; let badge = '';
      if (isClosed || isVac) {
        circleBg = `background:#7c3aed;border-radius:50%;`;
        numColor = '#fff';
        const label = isClosed ? closedSet.get(d)! : vacationSet.get(d)!;
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#7c3aed;">${esc2(label)}</div>`;
      } else if (isShort) {
        circleBg = `background:#7c3aed;border-radius:50%;`;
        numColor = '#fff';
        badge = `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#7c3aed;">${esc2(shortenedSet.get(d)!)}</div>`;
      }
      if (isHol && !isClosed && !isVac && !isShort) badge = `<div style="margin-top:2px;font-size:9px;color:#f97316;font-weight:600;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:2px;border:1px solid #f3f4f6;background:#fff;"><div style="min-height:62px;text-align:center;padding:6px 2px 4px;">
        <div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:34px;height:34px;${circleBg}">
          <span style="font-size:15px;font-weight:700;color:${numColor};">${d}</span>
        </div>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayNames.map((n, i) => {
    const c = i === 0 ? '#f97316' : i === 6 ? '#93c5fd' : '#1f2937';
    return `<th style="padding:10px 4px;font-size:13px;font-weight:800;color:${c};text-align:center;background:#fff;">${n}</th>`;
  }).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:36px;object-fit:contain;margin-bottom:4px;" />` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:10px;font-size:12px;color:#fff;line-height:2;font-weight:600;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:13px;color:#fce7f3;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  const blobDecor = `
    <div style="position:absolute;top:-60px;left:-60px;width:220px;height:220px;background:rgba(249,168,212,0.55);border-radius:50%;filter:blur(40px);pointer-events:none;"></div>
    <div style="position:absolute;top:-40px;right:-50px;width:180px;height:180px;background:rgba(236,72,153,0.45);border-radius:50%;filter:blur(36px);pointer-events:none;"></div>
  `;

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:linear-gradient(160deg,#f9a8d4,#ec4899,#db2777);border-radius:20px;overflow:hidden;min-height:700px;position:relative;">
    ${blobDecor}
    <div style="position:relative;z-index:1;padding:32px 24px 20px;text-align:center;">
      ${hospitalName ? `<div style="font-size:36px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.2);line-height:1.2;">${esc2(hospitalName)}</div>` : ''}
      <div style="font-size:42px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.15);line-height:1.2;margin-top:4px;">${esc2(title)}</div>
    </div>
    <div style="position:relative;z-index:1;margin:0 16px 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr style="border-bottom:1px solid #f3f4f6;">${headersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>
    </div>
    <div style="position:relative;z-index:1;text-align:center;padding:0 20px 28px;">${logoHTML}${customHTML}${noticesHTML}</div>
  </div>`;
}

/**
 * 봄 어린이 테마 — 하늘색 배경, 흰 타원, 초록 잔디 하단
 */
function buildSpringKidsCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:60px;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      let numColor = '#1e293b';
      if (isSunday || isHol) numColor = '#ec4899';
      else if (isSat) numColor = '#3b82f6';
      let badge = '';
      if (isClosed || isVac) {
        const label = isClosed ? closedSet.get(d)! : vacationSet.get(d)!;
        numColor = '#fff';
        return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:60px;text-align:center;padding:5px 2px 4px;">
          <div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:32px;height:32px;background:#f472b6;border-radius:50%;">
            <span style="font-size:14px;font-weight:800;color:#fff;">${d}</span>
          </div>
          <div style="margin-top:3px;font-size:9px;font-weight:700;color:#ec4899;">${esc2(label)}</div>
        </div></td>`;
      }
      if (isShort) {
        const label = shortenedSet.get(d)!;
        return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:60px;text-align:center;padding:5px 2px 4px;">
          <div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:32px;height:32px;background:#34d399;border-radius:50%;">
            <span style="font-size:14px;font-weight:800;color:#fff;">${d}</span>
          </div>
          <div style="margin-top:3px;font-size:9px;font-weight:700;color:#059669;">${esc2(label)}</div>
        </div></td>`;
      }
      if (isHol) badge = `<div style="font-size:9px;color:#ec4899;font-weight:600;margin-top:2px;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:2px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:60px;text-align:center;padding:7px 2px 4px;">
        <span style="font-size:17px;font-weight:700;color:${numColor};">${d}</span>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayNames.map((n, i) => {
    const bg = i === 0 ? '#f9a8d4' : i === 6 ? '#93c5fd' : '#334155';
    const tc = i === 0 || i === 6 ? '#fff' : '#fff';
    return `<th style="padding:11px 4px;font-size:13px;font-weight:800;color:${tc};text-align:center;background:${bg};">${n}</th>`;
  }).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:34px;object-fit:contain;margin-bottom:4px;" />` : '';
  const footerName = hospitalName ? `<div style="font-size:14px;font-weight:700;color:#1e3a8a;margin-top:4px;">${esc2(hospitalName)}</div>` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:10px;font-size:12px;color:#374151;line-height:2;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:12px;color:#334155;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:#bfdbfe;border-radius:20px;overflow:hidden;min-height:700px;position:relative;">
    <!-- 구름 장식 -->
    <div style="position:absolute;top:14px;left:10px;font-size:26px;opacity:0.7;">☁️</div>
    <div style="position:absolute;top:8px;left:60px;font-size:18px;opacity:0.6;">☁️</div>
    <div style="position:absolute;top:18px;right:14px;font-size:22px;opacity:0.65;">☁️</div>
    <!-- 제목 영역 -->
    <div style="text-align:center;padding:28px 24px 12px;position:relative;z-index:1;">
      ${hospitalName ? `<div style="display:inline-block;background:#16a34a;color:#fff;font-size:12px;font-weight:700;padding:4px 16px;border-radius:20px;margin-bottom:8px;">${esc2(hospitalName)}</div>` : ''}
      <div style="font-size:32px;font-weight:900;color:#1e3a8a;line-height:1.2;">${esc2(title)}</div>
    </div>
    <!-- 달력 흰 타원/카드 -->
    <div style="position:relative;z-index:1;margin:8px 14px 10px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12);">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr>${headersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>
    </div>
    <div style="position:relative;z-index:1;text-align:center;padding:4px 16px 8px;">${logoHTML}${footerName}${customHTML}${noticesHTML}</div>
    <!-- 하단 초록 잔디 -->
    <div style="height:40px;background:linear-gradient(180deg,#4ade80 0%,#16a34a 100%);position:relative;overflow:hidden;">
      <div style="position:absolute;top:-18px;left:5%;width:70px;height:30px;background:#22c55e;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-24px;left:22%;width:100px;height:38px;background:#16a34a;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-16px;left:45%;width:65px;height:28px;background:#22c55e;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-22px;left:65%;width:88px;height:34px;background:#15803d;border-radius:50% 50% 0 0;"></div>
      <div style="position:absolute;top:-14px;right:5%;width:60px;height:26px;background:#22c55e;border-radius:50% 50% 0 0;"></div>
    </div>
  </div>`;
}

/**
 * 의료 노트북 테마 — 하늘색 배경, 노란 링바인더, 여의사 캐릭터, 빨간 타일 휴진
 */
function buildMedicalNotebookCalendar(data: CalendarData): string {
  const { month, year, title, hospitalName, notices, customMessage, logoBase64 } = data;
  const { weeks, holidays, closedSet, shortenedSet, vacationSet } = buildGridData(data);
  const dayHeaderNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:1px;border:1px solid #e2e8f0;"><div style="min-height:64px;background:#fff;"></div></td>`;
      const isSunday = col === 0; const isSat = col === 6;
      const isClosed = closedSet.has(d); const isShort = shortenedSet.has(d); const isVac = vacationSet.has(d);
      const isHol = holidays.has(d);
      if (isClosed || isVac) {
        const label = isClosed ? closedSet.get(d)! : vacationSet.get(d)!;
        return `<td style="padding:1px;border:1px solid #e2e8f0;"><div style="min-height:64px;background:#ef4444;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 2px;">
          <span style="font-size:13px;font-weight:800;color:#fff;">${d}</span>
          <span style="font-size:10px;font-weight:700;color:#ffe4e6;margin-top:2px;">${esc2(label)}</span>
        </div></td>`;
      }
      if (isShort) {
        const label = shortenedSet.get(d)!;
        return `<td style="padding:1px;border:1px solid #e2e8f0;"><div style="min-height:64px;background:#2563eb;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 2px;">
          <span style="font-size:13px;font-weight:800;color:#fff;">${d}</span>
          <span style="font-size:10px;font-weight:700;color:#bfdbfe;margin-top:2px;">${esc2(label)}</span>
        </div></td>`;
      }
      let numColor = '#1e3a8a';
      if (isSunday || isHol) numColor = '#dc2626';
      else if (isSat) numColor = '#2563eb';
      let badge = '';
      if (isHol && !isClosed) badge = `<div style="font-size:9px;color:#dc2626;font-weight:600;margin-top:2px;">${esc2(holidays.get(d)!)}</div>`;
      return `<td style="padding:1px;border:1px solid #e2e8f0;background:#fff;"><div style="min-height:64px;text-align:center;padding:8px 2px 4px;">
        <span style="font-size:17px;font-weight:700;color:${numColor};">${d}</span>${badge}</div></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headersHTML = dayHeaderNames.map((n, i) => {
    const c = i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#1e3a8a';
    return `<th style="padding:11px 2px;font-size:11px;font-weight:800;color:${c};text-align:center;letter-spacing:0.5px;">${n}</th>`;
  }).join('');

  const ringBindersHTML = Array.from({length: 8}, (_, i) =>
    `<div style="position:absolute;top:-14px;left:calc(${6 + i * 12.5}% - 10px);width:20px;height:20px;border-radius:50%;background:#fcd34d;border:3px solid #f59e0b;"></div>`
  ).join('');

  const logoHTML = logoBase64 ? `<img src="${logoBase64}" style="max-height:36px;object-fit:contain;margin-bottom:4px;" />` : '';
  const noticesHTML = notices?.length ? `<div style="margin-top:10px;font-size:12px;color:#475569;line-height:2;">${notices.map(n => `· ${esc2(n)}`).join('<br>')}</div>` : '';
  const customHTML = customMessage?.trim() ? `<div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.8;">${esc2(customMessage.trim())}</div>` : '';

  return `<div id="calendar-render-target" style="width:100%;font-family:'Noto Sans KR',-apple-system,sans-serif;background:#3b9fe8;border-radius:20px;overflow:hidden;min-height:700px;position:relative;padding-top:20px;">
    <div style="text-align:center;padding:0 0 16px;position:relative;">
      <div style="font-size:80px;line-height:1;display:inline-block;">👩‍⚕️</div>
    </div>
    <div style="position:relative;margin:0 16px 20px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,80,0.2);padding:0 0 20px;overflow:hidden;">
      <div style="position:relative;height:18px;background:#fff;">
        ${ringBindersHTML}
      </div>
      <div style="padding:18px 20px 12px;text-align:center;border-bottom:1px solid #f1f5f9;">
        ${hospitalName ? `<div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:4px;">${esc2(hospitalName)}</div>` : ''}
        <div style="font-size:32px;font-weight:900;color:#1e3a8a;letter-spacing:-0.5px;line-height:1.2;">${esc2(title)}</div>
        <div style="height:6px;background:#fcd34d;border-radius:3px;margin:8px 20px 0;"></div>
      </div>
      <div style="margin:12px 12px 8px;overflow:hidden;border-radius:8px;border:1px solid #e2e8f0;">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <thead><tr style="background:#f8fafc;">${headersHTML}</tr></thead>
          <tbody>${cellsHTML}</tbody>
        </table>
      </div>
      <div style="text-align:center;padding:8px 20px 0;">${logoHTML}${customHTML}${noticesHTML}</div>
    </div>
  </div>`;
}

/** 테마 이름 → 빌더 함수 맵 */
const THEMED_BUILDERS: Record<string, (data: CalendarData) => string> = {
  autumn:             buildAutumnCalendar,
  korean_traditional: buildKoreanTraditionalCalendar,
  winter:             buildWinterCalendar,
  cherry_blossom:     buildCherryBlossomCalendar,
  spring_kids:        buildSpringKidsCalendar,
  medical_notebook:   buildMedicalNotebookCalendar,
};

/** 테마 목록 (UI에서 사용) */
export const CALENDAR_THEME_OPTIONS: { value: string; label: string; emoji: string; desc: string; group: string; groupColor: string }[] = [
  { value: 'autumn',             label: '📊 실무 스프레드시트',  emoji: '📊', desc: 'zebra 격자 + 슬레이트 헤더 + 범례',  group: '실무',   groupColor: '#334155' },
  { value: 'korean_traditional', label: '🏛️ 한방 전통',         emoji: '🏛️', desc: '기와 문양 + 이중 테두리 한지 프레임', group: '전통',   groupColor: '#92400e' },
  { value: 'winter',             label: '❄️ 딥블루 프로스트',    emoji: '❄️', desc: '딥블루 그라데이션 + 프로스트 글래스', group: '프리미엄', groupColor: '#0c4a6e' },
  { value: 'cherry_blossom',     label: '🌸 블러시 로즈',        emoji: '🌸', desc: '로즈 헤더 + 파스텔 핑크 갭 셀',     group: '소프트', groupColor: '#be7e8a' },
  { value: 'spring_kids',        label: '🏥 차콜 프레임',        emoji: '🏥', desc: '차콜 헤더/풋터 + 풀레드 휴진셀',   group: '실무',   groupColor: '#292524' },
  { value: 'medical_notebook',   label: '📐 모던 미니멀',        emoji: '📐', desc: '2단 라인 + 모노톤 규선 + 도트 마커', group: '미니멀', groupColor: '#1e293b' },
  { value: 'autumn_spring_note', label: '🌙 야간진료',           emoji: '🌙', desc: '다크 배너 + 화·목 앰버 컬럼 강조',  group: '실무',   groupColor: '#d97706' },
  { value: 'autumn_holiday',     label: '📱 SNS 볼드',           emoji: '📱', desc: '코랄 히어로 + 라운드 뱃지 셀',     group: '소프트', groupColor: '#f97316' },
  { value: 'hanok_roof',         label: '✨ 골드 클래식',        emoji: '✨', desc: '골드 밴드 + 세리프 + 점선 격자',     group: '프리미엄', groupColor: '#78350f' },
  { value: 'dark_green_clinic',  label: '🌲 프리미엄 그린',      emoji: '🌲', desc: '다크그린 헤더 + 에메랄드 악센트',   group: '프리미엄', groupColor: '#14532d' },
  { value: 'dark_blue_modern',   label: '🔷 네이비 모던',         emoji: '🔷', desc: '네이비 헤더+요일바 + 블루 마커',   group: '프리미엄', groupColor: '#1e3a5f' },
  { value: 'lavender_sparkle',   label: '💜 라벤더 소프트',      emoji: '💜', desc: '라벤더 헤더 + 라운드 갭 셀',       group: '소프트', groupColor: '#7c3aed' },
];

// ── 메인 달력 HTML 빌더 ──

// ── HTML 달력 생성 ──

export function buildCalendarHTML(data: CalendarData): string {
  // 계절/스타일 테마인 경우 전용 빌더로 분기
  if (data.colorTheme && THEMED_BUILDERS[data.colorTheme]) {
    return THEMED_BUILDERS[data.colorTheme](data);
  }
  const { month, year, title, closedDays, shortenedDays, vacationDays, hospitalName, notices, colorTheme, logoBase64, customMessage } = data;
  const theme = THEMES[colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const holidays = getHolidays(year, month);
  const closedSet = new Map<number, string>();
  for (const cd of closedDays) closedSet.set(cd.day, cd.reason || '휴진');
  const shortenedSet = new Map<number, string>();
  for (const sd of (shortenedDays || [])) shortenedSet.set(sd.day, sd.hours || '단축');
  const vacationSet = new Map<number, string>();
  for (const vd of (vacationDays || [])) vacationSet.set(vd.day, vd.reason || '휴가');

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) { week.push(d); if (week.length === 7) { weeks.push(week); week = []; } }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:14px 6px;"></td>`;
      const isSunday = col === 0;
      const isSaturday = col === 6;
      const isHoliday = holidays.has(d);
      const isClosed = closedSet.has(d);
      const isShortened = shortenedSet.has(d);
      const isVacation = vacationSet.has(d);
      const holidayName = holidays.get(d);

      let color = '#374151';
      if (isClosed || isVacation) color = '#dc2626';
      else if (isShortened) color = '#b45309';
      else if (isSunday || isHoliday) color = '#dc2626';
      else if (isSaturday) color = '#2563eb';

      let cellBg = '';
      let badge = '';
      let borderStyle = '';

      if (isClosed) {
        cellBg = 'background:#fef2f2;';
        borderStyle = `border:2px solid #fca5a5;`;
        badge = `<div style="margin-top:3px;font-size:10px;color:#fff;font-weight:700;background:#ef4444;border-radius:10px;padding:1px 8px;display:inline-block;">휴진</div>`;
      } else if (isVacation) {
        cellBg = 'background:#faf5ff;';
        borderStyle = `border:2px solid #c4b5fd;`;
        badge = `<div style="margin-top:3px;font-size:10px;color:#fff;font-weight:700;background:#8b5cf6;border-radius:10px;padding:1px 8px;display:inline-block;">휴가</div>`;
        color = '#7c3aed';
      } else if (isShortened) {
        cellBg = 'background:#fffbeb;';
        borderStyle = `border:2px solid #fcd34d;`;
        badge = `<div style="margin-top:3px;font-size:10px;color:#fff;font-weight:700;background:#f59e0b;border-radius:10px;padding:1px 8px;display:inline-block;">단축</div>`;
      }
      if (isHoliday && !isClosed) {
        badge = `<div style="margin-top:3px;font-size:9px;color:#ef4444;font-weight:600;">${holidayName}</div>`;
      } else if (isHoliday && isClosed) {
        badge = `<div style="margin-top:2px;font-size:9px;color:#ef4444;font-weight:600;">${holidayName}</div><div style="font-size:10px;color:#fff;font-weight:700;background:#ef4444;border-radius:10px;padding:1px 8px;display:inline-block;">휴진</div>`;
      }

      return `<td style="padding:4px;">
        <div style="border-radius:12px;padding:10px 4px;text-align:center;${cellBg}${borderStyle}min-height:56px;">
          <div style="font-size:17px;font-weight:700;color:${color};line-height:1;">${d}</div>
          ${badge}
        </div>
      </td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const dayHeadersHTML = dayNames.map((name, i) => {
    let color = '#6b7280';
    if (i === 0) color = '#dc2626';
    if (i === 6) color = '#2563eb';
    return `<th style="padding:14px 4px;font-size:13px;font-weight:800;color:${color};text-align:center;letter-spacing:2px;">${name}</th>`;
  }).join('');

  const logoHTML = logoBase64
    ? `<img src="${logoBase64}" style="max-height:44px;margin-bottom:10px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />`
    : '';

  const hospitalLine = hospitalName
    ? `<div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:6px;font-weight:500;letter-spacing:3px;text-transform:uppercase;">${esc(hospitalName)}</div>`
    : '';

  // 범례
  const legendItems: string[] = [];
  const closedCount = closedDays.length;
  const shortCount = (shortenedDays || []).length;
  const vacCount = (vacationDays || []).length;
  if (closedCount > 0) {
    const days = closedDays.map(cd => `${cd.day}일`).join(', ');
    legendItems.push(`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:#fef2f2;border-radius:12px;border:1px solid #fecaca;">
      <div style="width:10px;height:10px;background:#ef4444;border-radius:50%;flex-shrink:0;"></div>
      <div><span style="font-size:13px;font-weight:700;color:#dc2626;">휴진</span> <span style="font-size:12px;color:#991b1b;">${days}</span></div>
    </div>`);
  }
  if (shortCount > 0) {
    const days = (shortenedDays || []).map(sd => `${sd.day}일${sd.hours ? `(${sd.hours})` : ''}`).join(', ');
    legendItems.push(`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:#fffbeb;border-radius:12px;border:1px solid #fde68a;">
      <div style="width:10px;height:10px;background:#f59e0b;border-radius:50%;flex-shrink:0;"></div>
      <div><span style="font-size:13px;font-weight:700;color:#b45309;">단축진료</span> <span style="font-size:12px;color:#92400e;">${days}</span></div>
    </div>`);
  }
  if (vacCount > 0) {
    const days = (vacationDays || []).map(vd => `${vd.day}일`).join(', ');
    legendItems.push(`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:#faf5ff;border-radius:12px;border:1px solid #e9d5ff;">
      <div style="width:10px;height:10px;background:#8b5cf6;border-radius:50%;flex-shrink:0;"></div>
      <div><span style="font-size:13px;font-weight:700;color:#7c3aed;">휴가</span> <span style="font-size:12px;color:#6d28d9;">${days}</span></div>
    </div>`);
  }
  const closedLegend = legendItems.length > 0
    ? `<div style="margin-top:20px;display:flex;flex-direction:column;gap:8px;">${legendItems.join('')}</div>`
    : '';

  const noticesHTML = (notices && notices.length > 0)
    ? `<div style="margin-top:20px;padding:20px 24px;background:${theme.light};border-radius:16px;border:1px solid ${theme.border};">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:10px;letter-spacing:1px;">INFORMATION</div>
        ${notices.map(n => `<div style="font-size:14px;color:#475569;line-height:2;padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-weight:700;">&#8250;</span> ${esc(n)}</div>`).join('')}
      </div>`
    : '';

  const customMsgHTML = customMessage?.trim()
    ? `<div style="margin-top:16px;padding:16px 24px;background:linear-gradient(135deg, ${theme.light}, #ffffff);border-radius:14px;border:1px solid ${theme.border};text-align:center;">
        <div style="font-size:14px;color:#334155;line-height:1.8;white-space:pre-line;">${esc(customMessage.trim())}</div>
      </div>`
    : '';

  const footerHTML = hospitalName
    ? `<div style="margin-top:24px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(hospitalName)}</div>
      </div>`
    : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <!-- 헤더 -->
    <div style="background:${theme.headerBg};padding:${logoBase64 ? '28px 36px 24px' : '36px 36px 28px'};text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML}
      <div style="font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(title)}</div>
      ${hospitalLine}
      <div style="margin-top:12px;display:inline-block;padding:6px 20px;background:rgba(255,255,255,0.15);border-radius:20px;backdrop-filter:blur(4px);font-size:12px;color:rgba(255,255,255,0.9);font-weight:600;">${year}. ${String(month).padStart(2, '0')}</div>
    </div>

    <!-- 달력 그리드 -->
    <div style="padding:24px 24px 28px;">
      <table style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;">
        <thead><tr>${dayHeadersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>
      ${closedLegend}
      ${noticesHTML}
      ${customMsgHTML}
      ${footerHTML}
    </div>
  </div>`;
}

