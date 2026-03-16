/**
 * 병원 달력 이미지 생성 서비스
 * HTML/CSS 템플릿 + html2canvas로 100% 정확한 달력 이미지를 프로그래밍으로 생성
 */
import { callGemini, callGeminiRaw, TIMEOUTS } from './geminiClient';
import { removeOklchFromClonedDoc } from '../components/resultPreviewUtils';

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

// ── 프롬프트에서 달력 데이터 추출 (AI 텍스트) ──

/**
 * 특정 월에서 특정 요일의 모든 날짜를 반환 (JS로 정확한 계산)
 * dayOfWeek: 0=일, 1=월, ..., 6=토
 */
function getAllDaysOfWeekInMonth(year: number, month: number, dayOfWeek: number): number[] {
  const days: number[] = [];
  const lastDate = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDate; d++) {
    if (new Date(year, month - 1, d).getDay() === dayOfWeek) {
      days.push(d);
    }
  }
  return days;
}

/**
 * 해당 월의 달력 그리드 텍스트 생성 (AI에게 정확한 날짜-요일 매핑 제공)
 */
function buildCalendarGridText(year: number, month: number): string {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();

  let grid = `${year}년 ${month}월 달력:\n`;
  grid += dayNames.join('  ') + '\n';

  let line = '    '.repeat(firstDay);
  let dow = firstDay;
  for (let d = 1; d <= lastDate; d++) {
    line += String(d).padStart(2, ' ') + '  ';
    dow++;
    if (dow === 7) { grid += line.trimEnd() + '\n'; line = ''; dow = 0; }
  }
  if (line.trim()) grid += line.trimEnd() + '\n';
  return grid;
}

export async function parseCalendarPrompt(prompt: string): Promise<CalendarData | null> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // AI에게 정확한 달력 그리드를 제공하여 날짜-요일 오류 방지
  const calendarGrid = buildCalendarGridText(currentYear, currentMonth);

  const systemInstruction = `당신은 사용자의 병원 달력 요청을 분석하여 JSON으로 변환하는 전문가입니다.
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "month": 숫자(1-12),
  "title": "달력 제목 문자열",
  "closedDays": [{"day": 숫자, "reason": "사유"}],
  "closedWeekday": "반복 휴진 요일명 또는 null",
  "hospitalName": "병원명 또는 null",
  "notices": ["안내문구1", "안내문구2"] 또는 [],
  "colorTheme": "blue" | "green" | "pink" | "purple"
}

📅 참고: 현재 달력 (날짜-요일 정확한 매핑):
${calendarGrid}

규칙:
- month: 프롬프트에서 언급된 월. 없으면 ${currentMonth}
- title: 프롬프트에서 파악되는 제목. 없으면 "N월 진료 안내"
- closedDays: 개별 휴진/휴무 날짜만 포함 (예: "5일 휴진" → {"day": 5, "reason": "휴진"})
- closedWeekday: "매주 X요일" 패턴이면 요일명만 반환 (예: "수요일"). 날짜 계산은 하지 마세요!
- hospitalName: 병원명이 언급되면 포함
- notices: "진료시간", "점심시간" 등 안내 문구
- colorTheme: 분위기에 맞는 색상. 기본 "blue"`;

  try {
    const rawText = await callGemini({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'text',
      systemInstruction,
      temperature: 0.1,
    });

    const text = (rawText || '').trim();
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const month = parsed.month || currentMonth;

    // closedDays 구성: 개별 날짜 + 반복 요일 (JS로 정확히 계산)
    const closedDays: ClosedDay[] = (parsed.closedDays || [])
      .map((d: any) => ({ day: Number(d.day), reason: d.reason || undefined }))
      .filter((d: ClosedDay) => d.day >= 1 && d.day <= new Date(currentYear, month, 0).getDate());

    // "매주 X요일" → JS로 정확한 날짜 계산 (AI에게 맡기지 않음)
    if (parsed.closedWeekday) {
      const weekdayMap: Record<string, number> = {
        '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3,
        '목요일': 4, '금요일': 5, '토요일': 6,
        '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
      };
      const dowIndex = weekdayMap[parsed.closedWeekday];
      if (dowIndex !== undefined) {
        const weekdayDays = getAllDaysOfWeekInMonth(currentYear, month, dowIndex);
        const existingDays = new Set(closedDays.map(d => d.day));
        for (const day of weekdayDays) {
          if (!existingDays.has(day)) {
            closedDays.push({ day, reason: `매주 ${parsed.closedWeekday} 휴진` });
          }
        }
      }
    }

    // 날짜순 정렬
    closedDays.sort((a, b) => a.day - b.day);

    return {
      month,
      year: currentYear,
      title: parsed.title || `${month}월 진료 안내`,
      closedDays,
      hospitalName: parsed.hospitalName || undefined,
      notices: parsed.notices || [],
      colorTheme: parsed.colorTheme || 'blue',
    };
  } catch {
    return null;
  }
}

// ── 한국 공휴일 ──

function getHolidays(year: number, month: number): Map<number, string> {
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

// ── 색상 테마 ──

const THEMES: Record<string, { primary: string; light: string; accent: string; headerBg: string; subtle: string; border: string }> = {
  blue:     { primary: '#2563eb', light: '#eff6ff', accent: '#1d4ed8', headerBg: 'linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #1e3a8a 100%)', subtle: '#dbeafe', border: '#bfdbfe' },
  green:    { primary: '#16a34a', light: '#f0fdf4', accent: '#15803d', headerBg: 'linear-gradient(135deg, #16a34a 0%, #15803d 50%, #166534 100%)', subtle: '#bbf7d0', border: '#86efac' },
  pink:     { primary: '#db2777', light: '#fdf2f8', accent: '#be185d', headerBg: 'linear-gradient(135deg, #ec4899 0%, #db2777 50%, #be185d 100%)', subtle: '#fbcfe8', border: '#f9a8d4' },
  purple:   { primary: '#7c3aed', light: '#f5f3ff', accent: '#6d28d9', headerBg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)', subtle: '#ddd6fe', border: '#c4b5fd' },
  navy:     { primary: '#1e3a5f', light: '#f0f4f8', accent: '#0f2942', headerBg: 'linear-gradient(135deg, #1e3a5f 0%, #0f2942 50%, #0a1929 100%)', subtle: '#c8d6e5', border: '#a4b8cc' },
  coral:    { primary: '#e74c3c', light: '#fef5f4', accent: '#c0392b', headerBg: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 50%, #a93226 100%)', subtle: '#f5b7b1', border: '#f1948a' },
  teal:     { primary: '#0d9488', light: '#f0fdfa', accent: '#0f766e', headerBg: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)', subtle: '#99f6e4', border: '#5eead4' },
  charcoal: { primary: '#374151', light: '#f9fafb', accent: '#1f2937', headerBg: 'linear-gradient(135deg, #4b5563 0%, #374151 50%, #1f2937 100%)', subtle: '#d1d5db', border: '#9ca3af' },
};

// ── 계절/스타일 테마 달력 빌더 ──

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

// ── HTML → 이미지 변환 ──

/**
 * HTML을 정확한 타겟 해상도의 이미지로 렌더링
 *
 * 동작 방식:
 * 1. HTML을 CSS_WIDTH(디자인 뷰포트)에서 렌더링
 * 2. html2canvas로 고해상도 캡처
 * 3. 타겟 해상도(1080x1080 등)의 새 캔버스에 콘텐츠를 fit하여 그리기
 *
 * options.width/height = 0이면 콘텐츠 크기 그대로 출력 (auto)
 */
export async function renderCalendarToImage(
  html: string,
  options?: { width?: number; height?: number },
): Promise<string> {
  const targetW = options?.width || 0;
  const targetH = options?.height || 0;
  const isAuto = targetW === 0 && targetH === 0;

  // CSS 디자인 뷰포트: 가로형이면 넓게, 아닌 경우 1080 기반
  const CSS_WIDTH = (targetW > targetH && targetH > 0) ? 960 : 540;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.innerHTML = html;
  document.body.appendChild(container);

  const target = container.querySelector('#calendar-render-target') as HTMLElement;
  if (!target) {
    document.body.removeChild(container);
    throw new Error('Calendar render target not found');
  }

  // CSS 뷰포트 크기 설정
  target.style.width = `${CSS_WIDTH}px`;
  target.style.boxSizing = 'border-box';

  // auto가 아니면 최소 높이 설정 (콘텐츠가 타겟 비율에 맞게)
  if (!isAuto && targetH > 0) {
    const cssHeight = Math.round(CSS_WIDTH * (targetH / targetW));
    target.style.minHeight = `${cssHeight}px`;
  }

  try {
    const html2canvas = (await import('html2canvas')).default;

    // 캡처 scale: 타겟 해상도에 정확히 맞추기
    // auto면 scale=2 (고품질 기본), 아니면 타겟W / CSS_WIDTH
    const captureScale = isAuto ? 2 : targetW / CSS_WIDTH;

    const sourceCanvas = await html2canvas(target, {
      scale: captureScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
        removeOklchFromClonedDoc(clonedDoc, clonedElement);
      },
    });

    if (isAuto) {
      // 자동: 캡처된 그대로 반환
      return sourceCanvas.toDataURL('image/png');
    }

    // 고정 사이즈: 타겟 캔버스에 콘텐츠를 중앙 배치
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const ctx = finalCanvas.getContext('2d')!;

    // 배경 흰색
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    // 콘텐츠를 타겟 캔버스에 fit (가로 꽉 채우고 세로 중앙)
    const contentW = sourceCanvas.width;
    const contentH = sourceCanvas.height;

    // 가로는 타겟에 맞추고, 세로가 넘치면 축소
    let drawW = targetW;
    let drawH = Math.round(contentH * (targetW / contentW));

    if (drawH > targetH) {
      // 세로가 넘치면 세로에 맞추고 가로 중앙
      drawH = targetH;
      drawW = Math.round(contentW * (targetH / contentH));
    }

    const offsetX = Math.round((targetW - drawW) / 2);
    const offsetY = Math.round((targetH - drawH) / 2);

    ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);

    return finalCanvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(container);
  }
}

// ── 이벤트/프로모션 템플릿 ──

export interface EventTemplateData {
  title: string;
  subtitle?: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  period?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildEventHTML(data: EventTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:40px;margin-bottom:12px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const priceSection = (data.price || data.discount) ? `
    <div style="margin:28px 0;text-align:center;padding:28px 24px;background:${theme.light};border-radius:20px;border:1px solid ${theme.border};position:relative;overflow:hidden;">
      <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:${theme.primary}10;border-radius:50%;"></div>
      ${data.discount ? `<div style="display:inline-block;margin-bottom:12px;padding:6px 20px;background:${theme.primary};color:white;border-radius:24px;font-size:15px;font-weight:800;letter-spacing:1px;box-shadow:0 4px 12px ${theme.primary}40;">${esc(data.discount)}</div>` : ''}
      ${data.originalPrice ? `<div style="font-size:18px;color:#94a3b8;text-decoration:line-through;margin-bottom:6px;font-weight:500;">${esc(data.originalPrice)}</div>` : ''}
      ${data.price ? `<div style="font-size:42px;font-weight:900;color:${theme.primary};letter-spacing:-2px;line-height:1;">${esc(data.price)}</div>` : ''}
    </div>` : '';

  const descSection = data.description?.trim()
    ? `<div style="margin:20px 0;padding:20px 24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;">
        ${data.description.trim().split('\n').filter(Boolean).map(line => `<div style="font-size:15px;color:#475569;line-height:2;padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-weight:700;">&#10003;</span> ${esc(line)}</div>`).join('')}
      </div>` : '';

  const periodSection = data.period?.trim()
    ? `<div style="margin:20px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:${theme.light};border:2px solid ${theme.border};border-radius:14px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span style="font-size:15px;color:#334155;font-weight:700;">${esc(data.period)}</span>
        </div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:28px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:40px 36px 36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-40px;right:-40px;width:150px;height:150px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML}
      <div style="display:inline-block;margin-bottom:16px;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;">EVENT</div>
      <div style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.3;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '이벤트')}</div>
      ${data.subtitle ? `<div style="font-size:16px;color:rgba(255,255,255,0.85);margin-top:10px;font-weight:400;line-height:1.5;">${esc(data.subtitle)}</div>` : ''}
    </div>
    <div style="padding:28px 36px 32px;">
      ${priceSection}${descSection}${periodSection}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 의사 소개 템플릿 ──

export interface DoctorTemplateData {
  doctorName: string;
  specialty: string;
  career?: string[];
  greeting?: string;
  doctorPhotoBase64?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildDoctorHTML(data: DoctorTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const careerHTML = (data.career && data.career.length > 0)
    ? `<div style="margin:24px 0;text-align:left;">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:14px;letter-spacing:1px;">CAREER & EDUCATION</div>
        <div style="padding:20px 24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;">
          ${data.career.map(c => `<div style="font-size:14px;color:#475569;line-height:2.4;padding-left:20px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-size:8px;top:50%;transform:translateY(-50%);">&#9679;</span>${esc(c)}</div>`).join('')}
        </div>
      </div>` : '';

  const greetingHTML = data.greeting?.trim()
    ? `<div style="margin:24px 0;padding:24px;background:linear-gradient(135deg, ${theme.light}, #ffffff);border-radius:16px;border:1px solid ${theme.border};text-align:center;position:relative;">
        <div style="font-size:40px;color:${theme.primary};opacity:0.15;position:absolute;top:8px;left:20px;font-family:Georgia,serif;">&ldquo;</div>
        <div style="font-size:15px;color:#334155;line-height:1.8;font-style:italic;white-space:pre-line;padding:0 20px;">${esc(data.greeting.trim())}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:28px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">NEW DOCTOR</div>
      <div style="font-size:26px;font-weight:900;color:#ffffff;text-shadow:0 2px 4px rgba(0,0,0,0.1);">신규 전문의 부임 안내</div>
    </div>
    <div style="padding:36px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:96px;height:96px;background:${theme.light};border:3px solid ${theme.border};border-radius:50%;line-height:96px;font-size:44px;margin-bottom:16px;box-shadow:0 4px 16px ${theme.primary}15;">&#129489;&#8205;&#9877;&#65039;</div>
        <div style="font-size:32px;font-weight:900;color:#1e293b;letter-spacing:-0.5px;">${esc(data.doctorName || '홍길동')}</div>
        <div style="font-size:15px;color:#64748b;font-weight:500;margin-top:4px;">전문의</div>
        <div style="display:inline-block;margin-top:12px;padding:8px 24px;background:${theme.light};color:${theme.primary};border:2px solid ${theme.border};border-radius:24px;font-size:14px;font-weight:700;">${esc(data.specialty || '전문 분야')}</div>
      </div>
      ${careerHTML}${greetingHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 공지사항 템플릿 ──

export interface NoticeTemplateData {
  title: string;
  content: string[];
  effectiveDate?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildNoticeHTML(data: NoticeTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const contentHTML = data.content.length > 0
    ? `<div style="margin:24px 0;">
        ${data.content.map((line, i) => `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 0;${i < data.content.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <div style="flex-shrink:0;width:28px;height:28px;background:${theme.light};border:2px solid ${theme.border};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${theme.primary};">${i + 1}</div>
          <div style="font-size:15px;color:#334155;line-height:1.8;padding-top:3px;">${esc(line)}</div>
        </div>`).join('')}
      </div>` : '';

  const dateHTML = data.effectiveDate?.trim()
    ? `<div style="margin:20px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:${theme.light};border:2px solid ${theme.border};border-radius:14px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span style="font-size:15px;color:${theme.primary};font-weight:700;">적용일: ${esc(data.effectiveDate)}</span>
        </div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:28px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">NOTICE</div>
      <div style="font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '공지사항')}</div>
    </div>
    <div style="padding:28px 36px 32px;">
      ${contentHTML}${dateHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 명절 인사 템플릿 ──

export interface GreetingTemplateData {
  holiday: string;
  greeting: string;
  closurePeriod?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

// 명절별 전용 디자인 설정
interface HolidayDesign {
  emoji: string;
  bgGradient: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  subtleColor: string;
  borderColor: string;
  tagBg: string;
  tagText: string;
  decoElements: string; // 장식 HTML
  closureTagColor: string;
}

const HOLIDAY_DESIGNS: Record<string, HolidayDesign> = {
  '설날': {
    emoji: '&#127982;',
    bgGradient: 'linear-gradient(180deg, #fef2f2 0%, #fff5f5 30%, #fffbeb 70%, #fef2f2 100%)',
    primaryColor: '#dc2626',
    accentColor: '#b91c1c',
    textColor: '#7f1d1d',
    subtleColor: '#fecaca',
    borderColor: '#fca5a5',
    tagBg: 'rgba(220,38,38,0.12)',
    tagText: '#dc2626',
    closureTagColor: '#b91c1c',
    decoElements: `
      <div style="position:absolute;top:20px;left:20px;font-size:28px;opacity:0.15;transform:rotate(-15deg);">&#127982;</div>
      <div style="position:absolute;top:40px;right:24px;font-size:22px;opacity:0.12;transform:rotate(10deg);">&#129511;</div>
      <div style="position:absolute;bottom:60px;left:30px;font-size:20px;opacity:0.10;transform:rotate(-8deg);">&#127885;</div>
      <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle, #dc262612 0%, transparent 70%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-30px;width:120px;height:120px;background:radial-gradient(circle, #f59e0b0a 0%, transparent 70%);border-radius:50%;"></div>`,
  },
  '추석': {
    emoji: '&#127765;',
    bgGradient: 'linear-gradient(180deg, #1e293b 0%, #1e3a5f 40%, #2d1b4e 100%)',
    primaryColor: '#f59e0b',
    accentColor: '#d97706',
    textColor: '#ffffff',
    subtleColor: '#44403c',
    borderColor: '#78716c',
    tagBg: 'rgba(245,158,11,0.2)',
    tagText: '#fbbf24',
    closureTagColor: '#fbbf24',
    decoElements: `
      <div style="position:absolute;top:16px;right:16px;width:80px;height:80px;background:radial-gradient(circle, #fbbf2420 0%, transparent 70%);border-radius:50%;"></div>
      <div style="position:absolute;top:30px;left:20px;font-size:20px;opacity:0.15;">&#127810;</div>
      <div style="position:absolute;bottom:80px;right:28px;font-size:18px;opacity:0.12;">&#127810;</div>
      <div style="position:absolute;top:-50px;left:-50px;width:180px;height:180px;background:radial-gradient(circle, #f59e0b08 0%, transparent 60%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;right:-40px;width:140px;height:140px;background:radial-gradient(circle, #7c3aed06 0%, transparent 60%);border-radius:50%;"></div>`,
  },
  '새해': {
    emoji: '&#127882;',
    bgGradient: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #172554 100%)',
    primaryColor: '#a78bfa',
    accentColor: '#7c3aed',
    textColor: '#ffffff',
    subtleColor: '#334155',
    borderColor: '#4c1d95',
    tagBg: 'rgba(167,139,250,0.2)',
    tagText: '#c4b5fd',
    closureTagColor: '#c4b5fd',
    decoElements: `
      <div style="position:absolute;top:12px;left:15px;font-size:14px;opacity:0.3;">&#10022;</div>
      <div style="position:absolute;top:50px;right:20px;font-size:10px;opacity:0.25;">&#10022;</div>
      <div style="position:absolute;top:28px;right:50px;font-size:8px;opacity:0.2;">&#10022;</div>
      <div style="position:absolute;bottom:100px;left:25px;font-size:12px;opacity:0.2;">&#10022;</div>
      <div style="position:absolute;bottom:60px;right:35px;font-size:16px;opacity:0.15;">&#127878;</div>
      <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle, #7c3aed10 0%, transparent 60%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:radial-gradient(circle, #a78bfa08 0%, transparent 60%);border-radius:50%;"></div>`,
  },
  '어버이날': {
    emoji: '&#127801;',
    bgGradient: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 30%, #fdf2f8 70%, #fff1f2 100%)',
    primaryColor: '#e11d48',
    accentColor: '#be123c',
    textColor: '#881337',
    subtleColor: '#fecdd3',
    borderColor: '#fda4af',
    tagBg: 'rgba(225,29,72,0.1)',
    tagText: '#e11d48',
    closureTagColor: '#be123c',
    decoElements: `
      <div style="position:absolute;top:15px;left:20px;font-size:24px;opacity:0.15;transform:rotate(-10deg);">&#127801;</div>
      <div style="position:absolute;top:50px;right:18px;font-size:18px;opacity:0.12;transform:rotate(15deg);">&#127801;</div>
      <div style="position:absolute;bottom:80px;left:35px;font-size:16px;opacity:0.08;transform:rotate(-5deg);">&#127801;</div>
      <div style="position:absolute;bottom:50px;right:30px;font-size:20px;opacity:0.10;transform:rotate(8deg);">&#10084;&#65039;</div>
      <div style="position:absolute;top:-50px;right:-50px;width:180px;height:180px;background:radial-gradient(circle, #e11d4810 0%, transparent 70%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-30px;width:140px;height:140px;background:radial-gradient(circle, #f472b608 0%, transparent 70%);border-radius:50%;"></div>`,
  },
  '크리스마스': {
    emoji: '&#127876;',
    bgGradient: 'linear-gradient(180deg, #14532d 0%, #166534 40%, #1a2e1a 100%)',
    primaryColor: '#ef4444',
    accentColor: '#dc2626',
    textColor: '#ffffff',
    subtleColor: '#365314',
    borderColor: '#4ade80',
    tagBg: 'rgba(239,68,68,0.2)',
    tagText: '#fca5a5',
    closureTagColor: '#fca5a5',
    decoElements: `
      <div style="position:absolute;top:10px;left:18px;font-size:14px;opacity:0.25;color:#fbbf24;">&#10022;</div>
      <div style="position:absolute;top:40px;right:22px;font-size:10px;opacity:0.2;color:#fbbf24;">&#10022;</div>
      <div style="position:absolute;top:20px;right:55px;font-size:18px;opacity:0.15;">&#10052;&#65039;</div>
      <div style="position:absolute;bottom:90px;left:20px;font-size:12px;opacity:0.15;">&#10052;&#65039;</div>
      <div style="position:absolute;bottom:60px;right:25px;font-size:20px;opacity:0.12;">&#127873;</div>
      <div style="position:absolute;top:-50px;right:-50px;width:180px;height:180px;background:radial-gradient(circle, #ef444410 0%, transparent 60%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:radial-gradient(circle, #22c55e08 0%, transparent 60%);border-radius:50%;"></div>`,
  },
};

const DEFAULT_HOLIDAY_DESIGN: HolidayDesign = {
  emoji: '&#127881;',
  bgGradient: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 40%, #eff6ff 100%)',
  primaryColor: '#2563eb',
  accentColor: '#1d4ed8',
  textColor: '#1e293b',
  subtleColor: '#dbeafe',
  borderColor: '#bfdbfe',
  tagBg: 'rgba(37,99,235,0.12)',
  tagText: '#2563eb',
  closureTagColor: '#1d4ed8',
  decoElements: `
    <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:rgba(37,99,235,0.05);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:rgba(37,99,235,0.03);border-radius:50%;"></div>`,
};

export function buildGreetingHTML(data: GreetingTemplateData): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const design = HOLIDAY_DESIGNS[data.holiday] || DEFAULT_HOLIDAY_DESIGN;
  const isDark = ['추석', '새해', '크리스마스'].includes(data.holiday);

  const logoHTML = data.logoBase64
    ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;${isDark ? 'filter:brightness(0) invert(1);' : ''}opacity:0.8;" />`
    : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 24px;background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)'};border-radius:16px;${isDark ? '' : 'backdrop-filter:blur(4px);'}text-align:center;font-size:13px;color:${isDark ? 'rgba(255,255,255,0.7)' : '#475569'};line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>`
    : '';

  const closureHTML = data.closurePeriod?.trim()
    ? `<div style="margin:28px auto;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:14px 28px;background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)'};border-radius:16px;border:1px solid ${isDark ? 'rgba(255,255,255,0.12)' : design.borderColor};box-shadow:0 4px 16px rgba(0,0,0,${isDark ? '0.2' : '0.04'});">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${design.closureTagColor}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <div style="font-size:11px;font-weight:700;color:${isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8'};letter-spacing:1px;">CLOSED</div>
            <div style="font-size:15px;color:${isDark ? '#ffffff' : '#334155'};font-weight:700;margin-top:2px;">${esc(data.closurePeriod)}</div>
          </div>
        </div>
      </div>`
    : '';

  return `<div id="calendar-render-target" style="width:100%;background:${design.bgGradient};border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,${isDark ? '0.3' : '0.08'}),0 1px 3px rgba(0,0,0,0.04);position:relative;">
    ${design.decoElements}
    <div style="padding:56px 40px 48px;text-align:center;position:relative;">
      ${logoHTML ? `<div style="margin-bottom:20px;">${logoHTML}</div>` : ''}
      <div style="font-size:72px;margin-bottom:20px;filter:drop-shadow(0 4px 8px rgba(0,0,0,${isDark ? '0.3' : '0.1'}));">${design.emoji}</div>
      <div style="display:inline-block;padding:6px 24px;background:${design.tagBg};border-radius:24px;margin-bottom:20px;">
        <span style="font-size:14px;color:${design.tagText};font-weight:700;letter-spacing:2px;">${esc(data.holiday || '명절')}</span>
      </div>
      <div style="font-size:30px;font-weight:900;color:${design.textColor};line-height:1.6;white-space:pre-line;letter-spacing:-0.5px;${isDark ? 'text-shadow:0 2px 8px rgba(0,0,0,0.3);' : ''}">${esc(data.greeting || '행복한 명절 되세요')}</div>
      ${closureHTML}${customMsgHTML}
      ${data.hospitalName ? `<div style="margin-top:36px;padding-top:20px;border-top:2px solid ${isDark ? 'rgba(255,255,255,0.1)' : design.subtleColor};">
        <div style="font-size:13px;color:${isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8'};font-weight:600;letter-spacing:3px;">${esc(data.hospitalName)}</div>
      </div>` : ''}
    </div>
  </div>`;
}

// ── 채용/공고 템플릿 ──

export interface HiringTemplateData {
  position: string;
  description?: string;
  qualifications?: string[];
  benefits?: string[];
  salary?: string;
  deadline?: string;
  contact?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildHiringHTML(data: HiringTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const qualHTML = (data.qualifications && data.qualifications.length > 0)
    ? `<div style="margin:20px 0;">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:12px;letter-spacing:1px;">&#9989; 자격 요건</div>
        <div style="padding:16px 20px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;">
          ${data.qualifications.map(q => `<div style="font-size:14px;color:#475569;line-height:2.2;padding-left:18px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-size:11px;top:50%;transform:translateY(-50%);">&#9679;</span>${esc(q)}</div>`).join('')}
        </div>
      </div>` : '';

  const benefitsHTML = (data.benefits && data.benefits.length > 0)
    ? `<div style="margin:20px 0;">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:12px;letter-spacing:1px;">&#127873; 복리후생</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${data.benefits.map(b => `<div style="padding:12px 14px;background:${theme.light};border-radius:12px;border:1px solid ${theme.border};font-size:13px;color:#334155;font-weight:600;text-align:center;">${esc(b)}</div>`).join('')}
        </div>
      </div>` : '';

  const salaryHTML = data.salary?.trim()
    ? `<div style="margin:16px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:${theme.light};border:2px solid ${theme.border};border-radius:14px;">
          <span style="font-size:18px;">&#128176;</span>
          <span style="font-size:15px;color:${theme.primary};font-weight:800;">${esc(data.salary)}</span>
        </div>
      </div>` : '';

  const deadlineHTML = data.deadline?.trim()
    ? `<div style="margin:16px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#fef2f2;border:1px solid #fecaca;border-radius:14px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style="font-size:14px;color:#dc2626;font-weight:700;">마감: ${esc(data.deadline)}</span>
        </div>
      </div>` : '';

  const contactHTML = data.contact?.trim()
    ? `<div style="margin:16px 0;padding:16px 20px;background:#f0f9ff;border-radius:14px;border:1px solid #bae6fd;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#0284c7;letter-spacing:1px;margin-bottom:6px;">CONTACT</div>
        <div style="font-size:14px;color:#0369a1;font-weight:600;">${esc(data.contact)}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:24px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">HIRING</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.position || '직원 모집')}</div>
      ${data.description ? `<div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:10px;font-weight:400;line-height:1.5;">${esc(data.description)}</div>` : ''}
    </div>
    <div style="padding:28px 36px 32px;">
      ${salaryHTML}${qualHTML}${benefitsHTML}${deadlineHTML}${contactHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 주의사항 템플릿 ──

export interface CautionTemplateData {
  title: string;
  type?: string;
  items: string[];
  emergency?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildCautionHTML(data: CautionTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const typeColors: Record<string, { bg: string; text: string; icon: string }> = {
    '시술 후': { bg: '#eff6ff', text: '#2563eb', icon: '&#128137;' },
    '진료 후': { bg: '#f0fdf4', text: '#16a34a', icon: '&#129658;' },
    '수술 후': { bg: '#fef2f2', text: '#dc2626', icon: '&#127975;' },
    '복약': { bg: '#f5f3ff', text: '#7c3aed', icon: '&#128138;' },
    '일반': { bg: '#f8fafc', text: '#475569', icon: '&#9888;&#65039;' },
  };
  const typeStyle = typeColors[data.type || '일반'] || typeColors['일반'];

  const typeHTML = data.type
    ? `<div style="display:inline-block;margin-top:12px;padding:6px 18px;background:${typeStyle.bg};border-radius:20px;">
        <span style="font-size:13px;color:${typeStyle.text};font-weight:700;">${typeStyle.icon} ${esc(data.type)}</span>
      </div>` : '';

  const itemsHTML = data.items.length > 0
    ? `<div style="margin:24px 0;">
        ${data.items.map((item, i) => `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 0;${i < data.items.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <div style="flex-shrink:0;width:32px;height:32px;background:${theme.light};border:2px solid ${theme.border};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${theme.primary};">${i + 1}</div>
          <div style="font-size:15px;color:#334155;line-height:1.8;padding-top:5px;">${esc(item)}</div>
        </div>`).join('')}
      </div>` : '';

  const emergencyHTML = data.emergency?.trim()
    ? `<div style="margin:20px 0;padding:18px 24px;background:#fef2f2;border-radius:16px;border:2px solid #fecaca;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:#dc2626;letter-spacing:1px;margin-bottom:6px;">&#128680; 응급 연락처</div>
        <div style="font-size:16px;color:#991b1b;font-weight:700;">${esc(data.emergency)}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:24px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">CAUTION</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '주의사항')}</div>
      ${typeHTML}
    </div>
    <div style="padding:28px 36px 32px;">
      ${itemsHTML}${emergencyHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 통합 함수: 프롬프트 → 달력 이미지 ──

export async function generateCalendarFromPrompt(
  prompt: string,
  onProgress?: (msg: string) => void,
): Promise<{ imageDataUrl: string; mimeType: string } | null> {
  const progress = (msg: string) => onProgress?.(msg);

  progress('달력 데이터 분석 중...');
  const calendarData = await parseCalendarPrompt(prompt);
  if (!calendarData) return null;

  progress('달력 디자인 렌더링 중...');
  const html = buildCalendarHTML(calendarData);
  const imageDataUrl = await renderCalendarToImage(html, { width: 1080, height: 1080 });

  return { imageDataUrl, mimeType: 'image/png' };
}

// ── 스타일 프리셋 (색상 + 분위기 + AI 프롬프트) ──

export interface StylePreset {
  id: string;
  name: string;
  color: string;
  accent: string;
  bg: string;
  desc: string;
  mood: string; // AI 프롬프트용 분위기 키워드
  aiPrompt: string; // AI에게 전달할 디자인 지시문 (영어)
}

export const AI_STYLE_PRESETS: StylePreset[] = [
  {
    id: 'fresh_start', name: '상쾌한 새출발', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
    desc: '희망 · 새로움',
    mood: '새해 첫날 아침같은 상쾌한 희망의 느낌',
    aiPrompt: 'Fresh new beginning design, soft champagne gold and warm coral accents, confetti and streamer decorations, crisp morning atmosphere, festive yet elegant, gentle sparkle effects, hopeful and bright mood, clean white space with pastel color pops, no radial rays or sunburst patterns',
  },
  {
    id: 'romantic_blossom', name: '로맨틱 블로썸', color: '#e11d48', accent: '#be123c', bg: '#fff1f2',
    desc: '설렘 · 로맨틱',
    mood: '이른 봄 설렘이 피어나는 로맨틱한 느낌',
    aiPrompt: 'Early spring romantic design, soft rose pink and warm red accents, delicate heart shapes, cherry blossom buds about to bloom, gentle watercolor washes, romantic yet professional mood, subtle floral borders, warm cozy atmosphere',
  },
  {
    id: 'petal_breeze', name: '꽃잎 바람', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8',
    desc: '벚꽃 · 산뜻',
    mood: '꽃잎이 흩날리는 화사하고 산뜻한 느낌',
    aiPrompt: 'Cherry blossom petal design, soft pink petals floating in the air, pastel pink and white gradient background, sakura branch illustrations, light and airy mood, gentle breeze atmosphere, fresh spring colors, delicate floral patterns',
  },
  {
    id: 'sprout_green', name: '새싹 그린', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
    desc: '생명력 · 치유',
    mood: '초록 새싹이 돋아나는 싱그러운 느낌',
    aiPrompt: 'Fresh sprout nature design, vibrant young green and lime accents, sprouting leaves and seedling illustrations, morning dew drops, clean fresh air mood, bright natural sunlight, growth and vitality energy, botanical elements, eco-friendly aesthetic',
  },
  {
    id: 'warm_gratitude', name: '따뜻한 감사', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
    desc: '카네이션 · 감성',
    mood: '카네이션 향기같은 따뜻한 감사의 느낌',
    aiPrompt: 'Warm gratitude design, carnation flower illustrations in red and pink, warm golden yellow background, heartfelt and thankful mood, soft hand-drawn floral elements, cozy family atmosphere, gentle warm lighting, watercolor texture accents',
  },
  {
    id: 'rain_droplet', name: '청량 빗방울', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
    desc: '빗방울 · 청량',
    mood: '빗방울이 떨어지는 청량하고 시원한 느낌',
    aiPrompt: 'Rainy season design, soft indigo and cool blue tones, gentle raindrops and water ripple patterns, transparent umbrella motifs, calm reflective puddle aesthetic, refreshing and cool mood, misty atmosphere with clarity, clean water-inspired gradients',
  },
  {
    id: 'ocean_breeze', name: '바다 물결', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
    desc: '시원한 · 파도',
    mood: '한여름 바다의 시원하고 청량한 느낌',
    aiPrompt: 'Summer ocean design, bright sky blue and turquoise gradients, ocean waves and seashell motifs, tropical vibes, cool refreshing mood, sunlight sparkling on water, beach sand textures, clear blue sky, vacation energy',
  },
  {
    id: 'sunflower_energy', name: '해바라기 에너지', color: '#eab308', accent: '#ca8a04', bg: '#fefce8',
    desc: '강렬 · 활력',
    mood: '해바라기처럼 강렬하고 뜨거운 에너지 느낌',
    aiPrompt: 'Midsummer sunflower design, bold golden yellow and warm orange, large sunflower illustrations, bright blazing sunshine, high energy and vibrant mood, clear summer sky, bold dynamic composition, warm saturated colors, powerful and lively atmosphere',
  },
  {
    id: 'maple_romance', name: '단풍 낭만', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
    desc: '단풍 · 낭만',
    mood: '단풍이 물들기 시작하는 낭만적인 느낌',
    aiPrompt: 'Early autumn design, warm orange and amber tones, maple leaves turning red and gold, soft warm sunset lighting, romantic and nostalgic mood, cozy sweater weather atmosphere, gentle falling leaves, warm gradient from orange to deep red',
  },
  {
    id: 'harvest_gold', name: '풍요로운 수확', color: '#a16207', accent: '#854d0e', bg: '#fefce8',
    desc: '풍성 · 따뜻한',
    mood: '풍성한 수확의 따뜻하고 풍요로운 느낌',
    aiPrompt: 'Autumn harvest design, rich brown and burnt orange palette, pumpkin and wheat illustrations, rustic warmth, abundance and gratitude mood, golden hour lighting, cozy thanksgiving atmosphere, grain texture accents, deep earthy warm tones',
  },
  {
    id: 'quiet_fog', name: '고즈넉한 안개', color: '#78716c', accent: '#57534e', bg: '#fafaf9',
    desc: '차분 · 고즈넉',
    mood: '낙엽이 쌓인 고즈넉한 늦가을 느낌',
    aiPrompt: 'Late autumn serene design, muted warm gray and soft brown tones, dry fallen leaves scattered softly, bare tree branch silhouettes, quiet contemplative mood, gentle fog atmosphere, warm tea and book aesthetic, calm and peaceful, subtle vintage texture',
  },
  {
    id: 'snowflake_glow', name: '눈꽃 조명', color: '#b91c1c', accent: '#d4a017', bg: '#fef9f0',
    desc: '눈꽃 · 포근한',
    mood: '눈꽃과 따뜻한 조명이 어우러진 포근한 느낌',
    aiPrompt: 'Winter holiday design, warm crimson red and shimmering gold accents, delicate white snowflake patterns on warm background, cozy Christmas fairy lights glow, rich red and gold color palette, festive ornament decorations, warm candlelight ambiance, soft falling snow, elegant holiday atmosphere with warmth',
  },
];

// ── 카테고리별 템플릿 프리셋 ──
// 진료일정: 레이아웃별 6개씩 (3×6=18)
// 이벤트/의사소개/공지/채용/주의: 각 6개 (5×6=30)
// 명절: 탭별 6개씩 (5×6=30)
// 총 78개

export interface CategoryTemplate {
  id: string;
  name: string;
  color: string;      // 메인 컬러
  accent: string;     // 악센트 컬러
  bg: string;         // 배경 그라데이션 시작색
  desc: string;       // 한 줄 설명
  aiPrompt: string;   // AI 이미지 생성용 영어 프롬프트
  layoutHint: string; // SVG 미리보기 레이아웃 힌트
  previewImage?: string; // 커스텀 미리보기 이미지 경로 (있으면 SVG 대신 이미지 표시)
}

export const CATEGORY_TEMPLATES: Record<string, CategoryTemplate[]> = {

  // ─── 진료 일정 (12개) ───
  // 연구 기반: 한국 병원 진료시간 안내 이미지 — 테이블/카드 레이아웃, 요일별 격자, 점심시간 표시
  // 지배적 패턴: 블루+화이트(신뢰), 민트/틸(치과), 베이지/아이보리(피부과/성형)
  // 4계절 커버: 봄(벚꽃) / 여름(그린) / 가을(단풍) / 겨울(눈꽃) + 사계절 범용 8종
  schedule: [
    {
      id: 'sch_clean_blue', name: '클린블루', color: '#3b82f6', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '파란 그라데이션 헤더에 7열 격자 달력 — 똑닥·네이버 예약 스타일의 가장 보편적 병원 일정표',
      layoutHint: 'cal_corporate',
      aiPrompt: `Korean medical clinic monthly schedule poster. Clean corporate blue — the most standard pattern used on 똑닥, 미리캔버스 hospital templates.

ZONE PROPORTIONS:
• TOP 18% — Blue gradient header bar (#3b82f6 → #1d4ed8). Hospital name "OO병원" 12pt white left-aligned. "N월 진료안내" 28pt bold white centered.
• BODY 62% — White rounded card (radius 12px, shadow 0 2px 8px rgba(0,0,0,0.08)). 7-column grid: 일(red #ef4444) 월 화 수 목 금 토(blue #3b82f6) day headers 11pt bold. 5×7 date cells, each cell min 44×44px for mobile tap targets. Closed days: soft blue (#dbeafe) circle + "휴진" 8pt red below date. Shortened days: amber (#fef3c7) circle + "단축" 8pt amber below.
• BOTTOM 20% — Three-row info block on light blue (#eff6ff) background:
  Row 1: 진료시간 table → 평일 09:00~18:00 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
  Row 2: 점심시간 13:00~14:00 (yellow highlight bar)
  Row 3: 범례 — 🔴 휴진 🟡 단축진료 🔵 정상진료 + 연락처 ☎ 02-000-0000

STRICT MODE ANCHORS: Header gradient angle, 7-column grid structure, cell min-size 44px, three-row bottom info block must be preserved.
INSPIRED MODE FREEDOM: Header gradient colors may shift within blue family, decorative corner shapes allowed, cell shape (circle/rounded-square) may vary.

Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+. No decorations, no illustrations. Pure corporate medical calendar.`,
    },
    {
      id: 'sch_beige_premium', name: '베이지골드', color: '#a3836a', accent: '#78583d', bg: '#faf7f4',
      desc: '리넨 질감 아이보리 위에 골드 라인 포인트 — 피부과·성형외과 고급 진료표',
      layoutHint: 'cal_premium',
      aiPrompt: `Korean aesthetic/dermatology clinic monthly schedule. Premium beige/ivory — popular with 피부과, 성형외과 beauty clinics on 미리캔버스.

ZONE PROPORTIONS:
• TOP 20% — Warm ivory (#faf7f4) background with 3% linen paper texture. Hospital name "OO피부과" in small warm brown (#78583d) 11pt, letter-spacing 2px. Large elegant "N월 진료안내" in warm brown (#a3836a) 26pt weight 700 serif. Thin gold (#c9a96e) 1px decorative line below title.
• BODY 58% — White card with warm border (1px #e8ddd0, radius 8px). Calendar grid inside. Day headers "일 월 화 수 목 금 토" in warm brown 11pt. Date numbers 14pt. Closed days: soft coral (#e8c4b8) circle behind number + "휴진" 8pt below. Shortened days: muted amber circle + "단축" 8pt.
• BOTTOM 22% — Two sections:
  Section 1: 진료시간 안내 table in warm brown text — 평일 10:00~19:00 / 토요일 10:00~15:00 / 일요일·공휴일 휴진. 점심시간 13:00~14:00 in soft coral highlight.
  Section 2: 범례 bar — coral dot "휴진" / amber dot "단축" / 연락처. Hospital logo small warm brown bottom-center.

STRICT MODE ANCHORS: Ivory/cream base tone, gold accent line position, serif title font, warm brown text color, two-section bottom layout.
INSPIRED MODE FREEDOM: Texture intensity (0-5%), gold line style (solid/dashed/dotted), card corner treatment, serif font choice variation.

Mobile readability: min body 11pt, dates 14pt. Premium, warm, sophisticated — luxury waiting room display aesthetic. No cartoon elements.`,
    },
    {
      id: 'sch_cherry_spring', name: '벚꽃봄', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '수채화 벚꽃 일러스트 코너 장식에 로즈핑크 달력 — 3~5월 봄 시즌 전용',
      layoutHint: 'cal_spring',
      aiPrompt: `Korean medical clinic monthly schedule. Spring cherry blossom (벚꽃) seasonal theme — designed for 3월~5월 spring period.

ZONE PROPORTIONS:
• TOP 22% — Soft pink (#fdf2f8) background. Watercolor cherry blossom (벚꽃) petals at top-left and top-right corners, 20% opacity, natural painterly brush strokes. Hospital name "OO의원" in deep pink (#be185d) 11pt. Large bold "N월 진료안내" in dark rose (#831843) 26pt weight 800. "봄바람처럼 건강하세요" optional subtitle 10pt rose.
• BODY 58% — White card (92% opacity, radius 12px, shadow soft). Light pink (#fce7f3) header bar with day names 일~토 11pt bold. 5×7 calendar grid, date numbers 14pt. Closed days: pink (#f9a8d4) circle + "휴진" 8pt magenta below. Shortened days: amber circle + "단축" 8pt. Falling petal illustration at card edge, very subtle.
• BOTTOM 20% — Pink-tinted info area:
  진료시간: 평일 09:00~18:00 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
  점심시간 12:30~13:30 in rose highlight
  범례: 🌸 휴진 🟡 단축진료 + 연락처

STRICT MODE ANCHORS: Cherry blossom corner illustrations, pink/rose color family, 22/58/20 zone ratio, watercolor art style.
INSPIRED MODE FREEDOM: Petal density and placement, additional spring elements (나비, 새), pink shade variation, card opacity 85-95%.

Mobile readability: min body 11pt, dates 14pt. Elegant spring seasonal — soft, professional, warm.`,
    },
    {
      id: 'sch_autumn_maple', name: '가을단풍', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '수채화 단풍잎 프레임에 오렌지 그라데이션 — 9~11월 가을 시즌 전용',
      layoutHint: 'cal_autumn',
      aiPrompt: `Korean medical clinic monthly schedule. Autumn maple leaf (단풍) seasonal theme — designed for 9월~11월 fall period.

ZONE PROPORTIONS:
• TOP 25% — Warm gradient background (orange #f97316 → peach #fed7aa). Watercolor autumn maple leaves (빨강/주황/금색) at top corners, vivid and lush. "OO병원" 12pt white. Large bold white "N월 진료일정" 28pt heavy sans-serif. Subtitle "진료일정을 확인하시어 내원에 착오 없으시길 바랍니다" 10pt white.
• BODY 55% — White rounded card (radius 14px). Charcoal (#3f3f46) header row with white day names 일~토. Calendar grid below, date numbers 14pt. Closed days: warm amber (#fbbf24) rounded pill badge with "정기휴진" text 8pt inside. Holiday: orange circle + holiday name 8pt below. Shortened: light orange circle + "단축" 8pt.
• BOTTOM 20% — Warm cream (#fff7ed) area:
  진료시간 table: 평일 09:00~18:30 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
  점심시간 12:30~14:00 in amber highlight bar
  범례: 🍁 휴진(정기) / 🟠 공휴일 / 🟡 단축 + "OO병원" logo + 연락처

STRICT MODE ANCHORS: Orange gradient header, maple leaf corner art, pill-badge closed-day markers, charcoal grid header, warm color family throughout.
INSPIRED MODE FREEDOM: Leaf density and color mix, gradient angle, badge shape (pill/circle/tag), additional fall elements (은행잎, 밤).

Mobile readability: min body 11pt, dates 14pt, badge text 8pt+. Rich autumn harvest atmosphere — warm and inviting.`,
    },
    {
      id: 'sch_traditional', name: '전통한옥', color: '#92400e', accent: '#78350f', bg: '#fef3c7',
      desc: '기와지붕 실루엣과 전통 문양 테두리 — 설·추석 명절 및 한의원 특화',
      layoutHint: 'cal_hanok',
      aiPrompt: `Korean medical clinic monthly schedule. Traditional Korean hanok (한옥) architecture motif — ideal for 설날/추석 holiday periods, 한의원, traditional clinics.

ZONE PROPORTIONS:
• TOP 25% — Warm cream (#f5e6d0) background. Coral/salmon (#e8795a) half-circle sun shape with bold white "N월" 32pt inside. "진료일정 안내" 16pt white below sun. Traditional tiled roof (기와지붕) silhouette in dark charcoal spanning full width as decorative border. Subtle 전통 구름문 cloud pattern at 10% opacity.
• BODY 55% — White card with traditional corner bracket ornaments (전통 꽃살문양) in warm brown (#92400e). 7-column calendar grid. Day headers: 일(coral) 토(blue) 평일(dark brown) 11pt. Date numbers 14pt. Closed days: coral circle behind white number + "휴진" 8pt coral below. 공휴일: warm gold circle + holiday name "설날/추석" 8pt.
• BOTTOM 20% — Warm cream area with subtle 보자기 pattern border:
  진료시간: 평일 09:00~18:00 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
  점심시간 12:00~13:00 in coral highlight
  범례: 🔴 휴진 / 🟡 공휴일 / "명절 연휴 기간 진료 일정을 확인하여 주시기 바랍니다"
  Hospital name in warm brown centered.

STRICT MODE ANCHORS: 기와지붕 roof silhouette, half-circle sun title element, 전통 문양 corner brackets, coral/brown/cream color palette, 25/55/20 zones.
INSPIRED MODE FREEDOM: Additional 전통 motifs (매화, 학, 연꽃), sun shape variation, 문양 complexity level, texture intensity.

Mobile readability: min body 11pt, dates 14pt. Dignified, warm — traditional Korean architecture and cultural heritage feel.`,
    },
    {
      id: 'sch_natural_kraft', name: '내추럴', color: '#92400e', accent: '#78350f', bg: '#fffbeb',
      desc: '크래프트지 질감에 손글씨풍 타이포 — 동네 의원·소아과의 친근한 게시판 스타일',
      layoutHint: 'cal_kraft',
      aiPrompt: `Korean neighborhood clinic monthly schedule. Warm natural kraft paper design — friendly, approachable community clinic (동네 의원, 소아과) feel.

ZONE PROPORTIONS:
• TOP 18% — Warm cream (#fefce8) background with kraft paper texture at 5% opacity. Simple minimal medical icon (작은 십자 or 하트) in warm brown. "N월 휴진 안내" in warm brown (#92400e) 24pt bold rounded sans-serif (slightly hand-drawn feel). Thin horizontal line divider in light warm brown (#d4a574).
• BODY 60% — White/cream area. Clean calendar grid with generous cell spacing. Date numbers 15pt. 일요일 in red (#dc2626), 토요일 in blue (#2563eb), 평일 dark brown. Closed days: soft red (#fee2e2) circle + bold red number + "쉽니다" 8pt below. Shortened: light amber circle + "단축" 8pt.
• BOTTOM 22% — Kraft-toned footer:
  진료시간 안내 (rounded box, 1px warm brown border):
    평일 09:00~18:00
    토요일 09:00~13:00
    일요일·공휴일 휴진
    점심시간 12:30~13:30
  범례: ⭕ 휴진 / △ 단축 / "편하게 문의해 주세요" + ☎ 연락처
  Hospital name "OO의원" bottom center in warm brown.

STRICT MODE ANCHORS: Kraft texture background, warm brown monochrome palette, hand-drawn feel typography, generous white space, no complex decorations.
INSPIRED MODE FREEDOM: Texture intensity (3-8%), icon choice (tooth/heart/cross), line style, cell shape, additional doodle-style accents at low opacity.

Mobile readability: min body 11pt, dates 15pt. MINIMAL, CLEAN, warm-toned — typography and calendar only, no characters or heavy illustrations.`,
    },
    {
      id: 'sch_winter_snow', name: '겨울눈꽃', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '기하학적 눈 결정 패턴에 아이시 블루 톤 — 12~2월 겨울 시즌 전용',
      layoutHint: 'cal_winter',
      aiPrompt: `Korean medical clinic monthly schedule. Winter snowflake (눈꽃) seasonal theme — designed for 12월~2월 winter period.

ZONE PROPORTIONS:
• TOP 22% — Icy blue (#e0f2fe) to white vertical gradient. Delicate geometric snowflake (눈 결정) crystal patterns scattered at 12% opacity in light blue (#bae6fd). "OO병원" 11pt deep blue. Bold "N월 진료안내" in deep blue (#0c4a6e) 26pt weight 800. Sparkle (✦) snowflake accents flanking title at 20% opacity.
• BODY 58% — Frosted white card (radius 12px, border 1px #bae6fd, backdrop-blur effect feel). 7-column grid with ice-blue (#e0f2fe) day header bar. Date numbers 14pt. Closed days: icy blue (#0ea5e9) rounded pill badge with white date + "휴진" 8pt below. Shortened: amber badge + "단축" 8pt. 공휴일: light blue cell bg + holiday name 8pt.
• BOTTOM 20% — Light icy background:
  진료시간 table in deep blue text: 평일 09:00~18:00 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
  점심시간 13:00~14:00 in sky-blue highlight bar
  범례: ❄️ 휴진 / 🟡 단축 / "연말연시 진료일정 안내" + ☎ 연락처

STRICT MODE ANCHORS: Ice-blue gradient, geometric snowflake patterns, frosted card effect, pill-badge markers, blue monochrome palette, 22/58/20 zones.
INSPIRED MODE FREEDOM: Snowflake density and size, gradient direction, additional winter elements (트리, 별), blue shade range (sky to navy).

Mobile readability: min body 11pt, dates 14pt. Cold, crisp, clean — professional Korean healthcare winter seasonal design.`,
    },
    {
      id: 'sch_white_minimal', name: '화이트', color: '#374151', accent: '#111827', bg: '#ffffff',
      desc: '순백 배경에 흑백 타이포그래피만 — 스위스 그리드 스타일 모던 미니멀',
      layoutHint: 'cal_swiss',
      aiPrompt: `Korean medical clinic monthly schedule. Ultra-minimal white — modern Swiss/Scandinavian grid-based typographic design.

ZONE PROPORTIONS:
• TOP 15% — Pure white (#ffffff) background. Very subtle light gray geometric grid lines at 3% opacity. Clinic logo monochrome + "OO의원" 11pt dark centered. Thin accent line (1px, #e5e7eb). Large bold "N월 진료일정" in clean sans-serif black (#111827) 28pt weight 800.
• BODY 62% — Clean white area with architectural grid. Thin gray (#e5e7eb) 1px lines separating cells. Day headers "일 월 화 수 목 금 토" 10pt medium gray. Date numbers 15pt black. Closed days: soft gray (#f3f4f6) circle + bold black number + "휴진" in red (#ef4444) 9pt below. Normal open days: very light blue (#eff6ff) circle badge. 공휴일: red (#fef2f2) bg + holiday name 8pt.
• BOTTOM 23% — Maximum whitespace, left-aligned text block:
  진료시간: 평일 09:00~18:00 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
  점심시간 13:00~14:00 (subtle gray underline)
  범례: ● 휴진 (red) / ○ 정상진료 (blue) / "문의 ☎ 02-000-0000"
  Important words "휴진" "정상진료" in bold black. No other decoration.

STRICT MODE ANCHORS: Pure white background, black/gray-only palette (red only for 휴진), thin 1px grid lines, left-aligned bottom text, maximum whitespace ratio > 40%.
INSPIRED MODE FREEDOM: Grid line style (solid/dashed), typography weight variation, subtle geometric accent shapes at < 5% opacity, circle vs square cell markers.

Mobile readability: min body 11pt, dates 15pt, title 24pt+. Extremely clean, no clutter — architectural typography precision.`,
    },
    {
      id: 'sch_navy_dark', name: '네이비', color: '#1e3a5f', accent: '#0f2444', bg: '#0f2444',
      desc: '다크 네이비 배경에 화이트 카드 테이블 — 대학병원·종합병원 공신력 스타일',
      layoutHint: 'cal_navy',
      aiPrompt: `Korean medical clinic monthly schedule. Dark navy corporate — trustworthy, authoritative feel matching 대학병원, 종합병원 branding.

ZONE PROPORTIONS:
• TOP 18% — Deep navy (#0f2444) full bleed background. Subtle halftone dot pattern at corners at 3% opacity. White thin-bordered (1px) rectangle frame inset. Clinic name "OO병원" in small sky blue (#7dd3fc) 11pt. Large bold white "N월 휴진 일정" 28pt heavy sans-serif inside frame.
• BODY 52% — White/light card (radius 10px) floating on navy. Clean table layout inside. Day header row: light blue (#dbeafe) background, dark navy text 11pt bold. Calendar grid with 1px #e5e7eb cell borders. Closed/holiday days: blue (#dbeafe) cell fill + bold navy date + holiday name 8pt below. Shortened: light amber cell fill + "단축" 8pt.
• BOTTOM 30% — Navy background continues:
  White text info block:
    진료시간 안내 (white 14pt bold underline)
    평일 09:00~18:00 / 토요일 09:00~14:00 / 일요일·공휴일 휴진
    점심시간 13:00~14:00
  범례 (horizontal): ◼ 휴진 / ◻ 단축 / "야간진료 매주 수요일 ~20:00" (if applicable)
  Clinic logo in sky blue centered at very bottom. ☎ 연락처 white.

STRICT MODE ANCHORS: Navy (#0f2444) dark background, white floating card, table-style grid with cell borders, sky-blue accent color, 18/52/30 zone ratio.
INSPIRED MODE FREEDOM: Navy shade range (#0a1628 ~ #1e3a5f), card shadow intensity, header frame style, accent blue shade, bottom layout (centered vs left-aligned).

Mobile readability: min body 11pt white-on-navy contrast ratio > 7:1, dates 14pt, title 24pt+. Corporate, trustworthy — professional healthcare institution.`,
    },
    {
      id: 'sch_mint_teal', name: '민트', color: '#14b8a6', accent: '#0f766e', bg: '#f0fdfa',
      desc: '민트/틸 그라데이션에 의료 십자 아이콘 — 치과·소아과 청결하고 산뜻한 느낌',
      layoutHint: 'cal_mint',
      aiPrompt: `Korean dental/pediatric clinic monthly schedule. Fresh mint/teal — the most popular palette for 치과, 소아과 clinics on 똑닥 and 미리캔버스 templates.

ZONE PROPORTIONS:
• TOP 20% — Light mint gradient (#f0fdfa → white). "OO치과" in teal (#0f766e) 12pt. Large bold "N월 진료안내" in teal (#14b8a6) 26pt weight 800. Thin teal 1px line divider. Small green medical cross (+) icon accent next to clinic name.
• BODY 60% — White card (radius 10px, border 1px #99f6e4). Calendar grid. Day headers in teal text 11pt bold on light mint (#ccfbf1) header bar. Date numbers 14pt. Closed days: teal (#14b8a6) circle + white date number + "휴진" 8pt teal below. Shortened days: amber (#fbbf24) circle + "단축" 8pt. 공휴일: mint bg cell + holiday name 8pt.
• BOTTOM 20% — Mint-tinted (#f0fdfa) info area:
  진료시간 table (teal text): 평일 09:30~18:30 / 토요일 09:30~14:00 / 일요일·공휴일 휴진
  점심시간 13:00~14:00 in teal highlight bar
  범례: 🟢 휴진 / 🟡 단축진료 / 녹색 십자(+) 정상진료
  ☎ 연락처 + "건강한 치아, OO치과가 함께합니다"

STRICT MODE ANCHORS: Mint/teal monochrome palette, green cross icon, teal circle closed-day markers, clean hygienic white card, 20/60/20 zones.
INSPIRED MODE FREEDOM: Teal shade variation (#0d9488 ~ #2dd4bf), cross icon size/position, card border treatment, additional tooth/dental icon at low opacity, gradient direction.

Mobile readability: min body 11pt, dates 14pt. Fresh, hygienic, professional — clean dental/pediatric clinic standard aesthetic.`,
    },
    {
      id: 'sch_lavender_soft', name: '라벤더', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '연보라 글래스모피즘 카드에 스파클(✦) 장식 — 성형외과·에스테틱 프리미엄',
      layoutHint: 'cal_glass',
      aiPrompt: `Korean aesthetic clinic monthly schedule. Soft lavender purple — preferred by 성형외과, 에스테틱, 피부관리 beauty clinics.

ZONE PROPORTIONS:
• TOP 20% — Soft lavender gradient (#f3e8ff → #faf5ff → white). Four-pointed star sparkles (✦) in purple at 12% opacity flanking title area. "OO성형외과" 11pt dark purple. Large bold "N월 진료일정" in dark purple (#7c3aed) 26pt weight 800 centered.
• BODY 58% — Glassmorphism-style card (white 85% opacity, radius 14px, backdrop-blur, border 1px rgba(139,92,246,0.15)). Day headers inside light lavender (#e9d5ff) bar 11pt bold purple. Calendar grid, date numbers 14pt. Closed/holiday days: purple (#8b5cf6) circle behind white date + "휴진" 9pt purple bold below. Consecutive closed days: light lavender (#ede9fe) rounded rectangle spanning multiple cells. Shortened: light violet circle + "단축" 8pt.
• BOTTOM 22% — Two-part layout:
  Part 1: Rounded callout box (border 1px #c4b5fd, radius 10px, bg #faf5ff): 진료시간 — 평일 10:00~19:00 / 토요일 10:00~15:00 / 일요일·공휴일 휴진 / 점심시간 13:00~14:00
  Part 2: 범례 + notice: "정상진료" bold purple / "휴진" bold purple / "아름다운 변화, OO성형외과" + ☎ 연락처

STRICT MODE ANCHORS: Lavender/purple palette, glassmorphism card effect, sparkle (✦) decorations, callout box in bottom section, 20/58/22 zones.
INSPIRED MODE FREEDOM: Sparkle density/size, glassmorphism blur intensity, purple shade range (#a78bfa ~ #6d28d9), additional beauty elements (꽃, 리본) at < 10% opacity.

Mobile readability: min body 11pt, dates 14pt. Feminine, elegant, premium — gentle luxury aesthetic clinic feel.`,
    },
    {
      id: 'sch_classic_green', name: '클래식그린', color: '#2d5a4a', accent: '#1a3c32', bg: '#f5f1eb',
      desc: '크림 상단 + 다크그린 하단 분할 구성에 다이아몬드 마커 — 한의원·내과 중후한 신뢰감',
      layoutHint: 'cal_sage',
      aiPrompt: `Korean traditional medicine clinic monthly schedule. Elegant dark green split-layout — suits 한의원, 내과, 가정의학과 clinics.

ZONE PROPORTIONS:
• TOP 15% — Cream (#f5f1eb) background upper section. Clinic logo (한방 or 의료 icon) + "OO한의원" in dark green (#2d5a4a) 13pt centered. Small English subtitle "OO Korean Medicine Clinic" 9pt below in muted green.
• TITLE BAR 8% — Dark green (#2d5a4a) rounded rectangle banner spanning 85% width, centered. Bold white "N월 진료일정" 22pt inside banner.
• BODY 45% — White card (border 1px #2d5a4a at 30% opacity, radius 8px) with decorative corner bracket ornaments in dark green. 7-column grid. Day headers: 일(coral #e57373) 토(blue #5c9ce6) 평일(dark #1a3c32) 11pt. Date numbers 14pt. Closed days: dark green diamond (◆ rotated 45°) behind white date + holiday name + "휴진" 8pt green below. Special open days: green circle behind white date.
• BOTTOM 32% — Deep forest green (#2d5a4a) background:
  White text block:
    진료시간 안내 (16pt bold white, underline)
    평일 09:00~18:00 / 토요일 09:00~13:00 / 일요일·공휴일 휴진
    점심시간 12:00~13:00
  범례 (white): ◆ 휴진 / ● 정상진료(특별) / "참고하여 내원에 차질이 없으시기 바랍니다"
  ☎ 연락처 + Hospital name white centered at bottom.

STRICT MODE ANCHORS: Cream/green split background (60/40), dark green banner title bar, diamond (◆) closed-day markers, corner bracket ornaments, 15/8/45/32 zones.
INSPIRED MODE FREEDOM: Green shade (#1a3c32 ~ #3d7a5f), split ratio (55-65% cream), ornament complexity, additional nature elements (대나무, 매화) at < 8% opacity, banner shape variation.

Mobile readability: min body 11pt on both cream and green backgrounds, dates 14pt, white-on-green contrast > 7:1. Elegant, classic, authoritative — traditional medicine trust and nature harmony.`,
    },
  ],
  // ─── 이벤트 (6개) ───
  // 연구 기반: X배너 → 인스타 어댑션, 캐러셀 표지, 사진+텍스트 분할, 할인율 48-72pt
  // 색상: 코랄/핑크 + 골드(프리미엄), 블루+옐로우(주목), 화이트 베이스(의료 신뢰감)
  event: [
    {
      id: 'evt_sale_banner', name: '할인 배너', color: '#ef4444', accent: '#b91c1c', bg: '#fef2f2',
      desc: '대각선 분할 배너형 — 할인율 최대 강조, 시술명+가격 수직 계층, 하단 CTA 바',
      layoutHint: 'price',
      aiPrompt: `Korean hospital discount promotion — diagonal split banner with dominant discount number. Modeled on Korean 피부과/성형외과 X배너 → 인스타 어댑션 style.

=== ZONE LAYOUT (vertical stack) ===
ZONE A – HEADER BAR (15%): Full-width solid red (#ef4444) bar. Hospital logo or name in small white (12px) at top-left. Right side: "EVENT" in white condensed caps (letter-spacing 3px). This bar anchors the brand.
ZONE B – DISCOUNT HERO (30%): White background with a large diagonal red (#ef4444) slash from top-left to bottom-right at 30° angle. In the red triangle area: massive white discount number "50" (72px, weight 900) with "%" beside it (40px). In the white triangle area: treatment name e.g. "보톡스 100단위" in bold red (#b91c1c, 28px, weight 800). The diagonal creates dynamic tension.
ZONE C – PRICE BLOCK (30%): Light red (#fef2f2) background. Centered layout: original price "정가 350,000원" with strikethrough in gray (16px). Below: "이벤트 특별가" label in dark gray (14px). Below: discounted price "175,000원" in massive bold red (#ef4444, 36px, weight 900). Thin red line separator above and below this block.
ZONE D – CTA + PERIOD (25%): White background. Full-width rounded red (#ef4444) CTA button: "지금 바로 예약하세요" in bold white (18px). Below button: event period "2024.03.01 ~ 03.31" in gray (12px). Bottom edge: "※ 의료법에 의해 부작용 등 주의사항을 확인하세요" in tiny gray (9px) — 의료광고법 compliance disclaimer.

=== PRICE HIERARCHY (must follow this order of visual dominance) ===
1st: Discount percentage (largest, 72px) 2nd: Treatment name (28px) 3rd: Discounted price (36px) 4th: Original price strikethrough (16px) 5th: Period + CTA

=== STRICT MODE ANCHORS ===
• Diagonal split angle: 30° ± 5°
• Zone A/B/C/D proportions: 15/30/30/25 (± 3%)
• Discount number always largest element on canvas
• 의료광고법 disclaimer always present at bottom
• CTA button must span ≥ 80% of canvas width

=== INSPIRED MODE FREEDOM ===
• Diagonal angle can shift 15°–45°
• Color intensity of red zones can vary
• Price block can use card with shadow instead of flat background
• Additional decorative elements like subtle dot patterns allowed in margins
• CTA button shape can be pill or rectangle

=== MOBILE READABILITY ===
• All text ≥ 11px. Discount number ≥ 60px even on small canvas.
• Price figures must have comma separators (e.g. "175,000원")
• Minimum 8px padding on all sides`,
    },
    {
      id: 'evt_elegant_event', name: '엘레강스 이벤트', color: '#a855f7', accent: '#7e22ce', bg: '#faf5ff',
      desc: '퍼플 + 세리프 타이틀 (프리미엄 시술)',
      layoutHint: 'elegant',
      aiPrompt: `Korean premium aesthetic clinic promotion — dark navy background with gold accents. Inspired by 청담/강남 성형외과 프리미엄 이벤트 포스터.

=== ZONE LAYOUT (vertical stack on dark navy) ===
ZONE A – GOLD FRAME + BRAND (10%): Deep navy (#0f172a) full bleed. Hospital name in small gold (#d4a853, 11px, letter-spacing 3px) centered. Thin gold horizontal rule (50% width, 0.5px) below. Gold double-line border framing entire canvas (outer 1.5px, inner 0.5px, 6px gap). Four small gold corner bracket ornaments.
ZONE B – LABEL + TREATMENT (30%): "SPECIAL EVENT" or "프리미엄 시술" in small gold caps (10px, letter-spacing 4px) centered. Treatment name in large bold white (32px, weight 800) centered below. Thin gold divider line (40% width) below treatment name.
ZONE C – PRICE HERO (35%): Discounted price in massive bold gold (#d4a853, 44px, weight 900) centered. Original price with strikethrough in small muted gray (#94a3b8, 14px) above discounted price. "특별가" label in small gold (12px) above original price.
ZONE D – PERIOD + FOOTER (25%): Event period "2024.03.01 ~ 03.31" in muted gold (#b8860b, 12px) centered. Hospital name in small gold at bottom. "※ 의료광고법 준수" disclaimer in tiny gray (9px).

=== STRICT MODE ANCHORS ===
• Navy (#0f172a) background must be full bleed — no white areas
• Gold (#d4a853) and white are the only text colors on navy
• Gold double-line border always present
• Zone proportions: 10/30/35/25 (± 3%)
• Price is the largest element after treatment name

=== INSPIRED MODE FREEDOM ===
• Gold border can be single line or ornamental
• Corner brackets can be Art Deco flourishes
• Subtle radial navy gradient (lighter center) allowed
• Price can have metallic shimmer text effect
• Additional thin gold decorative lines between zones

=== MOBILE READABILITY ===
• Treatment name ≥ 28px. Price ≥ 36px. Period ≥ 11px.
• Gold on navy contrast ratio ≥ 4.5:1
• Frame inset ≥ 6px from canvas edge`,
    },
    {
      id: 'evt_pop_colorful', name: '팝 컬러풀', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '앰버 원형 배지 + 대형 할인숫자',
      layoutHint: 'pop',
      aiPrompt: `Korean hospital promotion — bright amber accent on clean white, attention-grabbing. Modeled on 한국 피부과/치과 인스타그램 이벤트 게시물.

=== ZONE LAYOUT (vertical stack) ===
ZONE A – BADGE + BRAND (20%): Clean white background. Round amber (#f59e0b) badge (circle, 60px diameter) positioned top-right with massive discount number in bold white (36px) and "%OFF" below (12px). Hospital name in small amber (#d97706, 11px) text top-left.
ZONE B – TREATMENT NAME (25%): Treatment name in massive bold amber (#f59e0b, 36px, weight 900) centered. "이벤트" subtitle in darker amber (#d97706, 14px) below.
ZONE C – PRICE CARD (30%): White card with soft shadow (0 4px 16px rgba(0,0,0,0.08), radius 12px) and thin amber border (1px #f59e0b). Inside: original price strikethrough in gray (#9ca3af, 14px) at top, discounted price in massive bold amber (#f59e0b, 44px, weight 900) centered, event period in small gray (11px) at bottom of card.
ZONE D – CTA (25%): Rounded amber (#f59e0b) CTA pill button (80% width, 48px height) with white bold text "예약하기" (16px). Below button: "☎ 02-XXX-XXXX" in small gray (10px). 의료광고법 disclaimer in tiny gray (9px).

=== STRICT MODE ANCHORS ===
• Round amber badge always in top-right corner
• Discount number inside badge is the eye-catching entry point
• Price card with shadow is the central element
• Zone proportions: 20/25/30/25 (± 3%)
• CTA button spans ≥ 70% width

=== INSPIRED MODE FREEDOM ===
• Badge can be positioned top-left or centered
• Badge shape can be rounded square instead of circle
• Price card can have amber top-border accent instead of full border
• Additional decorative dots/confetti in amber at low opacity
• CTA can be rectangular with rounded corners

=== MOBILE READABILITY ===
• Treatment name ≥ 28px. Price ≥ 36px. Badge discount ≥ 28px.
• Price card padding ≥ 14px. CTA tap target ≥ 44px height.
• All text ≥ 10px`,
    },
    {
      id: 'evt_minimal_modern', name: '미니멀 모던', color: '#64748b', accent: '#334155', bg: '#f8fafc',
      desc: '타이포 중심 + 최대 여백 (고급 시술)',
      layoutHint: 'minimal',
      aiPrompt: `Korean premium clinic promotion — ultra-minimal typography-focused design. Inspired by 고급 에스테틱 브랜드 마케팅 and Swiss typography posters.

=== ZONE LAYOUT (vertical stack, maximum whitespace) ===
ZONE A – LABEL (10%): Off-white (#fafafa) background, no patterns. "EVENT" in tiny light gray (#cbd5e1, 10px) small caps with wide letter-spacing (4px). Short charcoal (#334155) accent underline (20px wide, 2px thick) centered below.
ZONE B – TREATMENT HERO (35%): Treatment name in massive bold charcoal (#1a1a1a, 44px, weight 900). Left-aligned or centered. This is the dominant visual element. Generous whitespace above and below (20px+). No other elements in this zone.
ZONE C – PRICE BLOCK (25%): Original price strikethrough in small light gray (#94a3b8, 14px). "할인가" label in small gray (#64748b, 11px). Discounted price in large bold charcoal (#1a1a1a, 36px, weight 800). All centered with 12px vertical spacing between elements.
ZONE D – FOOTER (15%): Event period dates in light gray (#94a3b8, 12px). Hospital name in tiny gray (#cbd5e1, 10px, letter-spacing 2px). Remaining 15% is pure empty whitespace.

=== STRICT MODE ANCHORS ===
• Off-white (#fafafa) background — no colors, no gradients
• Only charcoal (#1a1a1a) and gray (#94a3b8) text — no accent colors
• Treatment name is always the largest element (44px+)
• Zone proportions: 10/35/25/15 (± 3%, remaining 15% breathing room)
• Maximum whitespace — no decorative elements whatsoever

=== INSPIRED MODE FREEDOM ===
• Treatment name alignment can shift (left, center, right)
• A single thin hairline divider between zones allowed
• Font weight contrast can increase (ultra-light vs ultra-bold)
• Subtle off-white background tint shift allowed
• Price can be left-aligned to match treatment name

=== MOBILE READABILITY ===
• Treatment name ≥ 36px. Price ≥ 28px.
• Minimum 16px padding on all sides
• All text ≥ 10px`,
    },
    {
      id: 'evt_gradient_wave', name: '그라데이션 웨이브', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '틸 물결 곡선 + 플로팅 가격 카드',
      layoutHint: 'wave',
      aiPrompt: `Korean hospital promotion — fresh teal/cyan gradient with floating price card. Modeled on 한국 병원 인스타그램 모던 이벤트 게시물.

=== ZONE LAYOUT (vertical stack with floating card) ===
ZONE A – HEADER (20%): White background with subtle teal (#06b6d4) gradient at top edge (5-10% opacity). Hospital name in small teal (#0891b2, 11px) centered. Treatment name in large bold cyan (#06b6d4, 32px, weight 800) centered. "이벤트" subtitle in darker teal (#0891b2, 13px) below.
ZONE B – FLOATING PRICE CARD (40%): White background with subtle teal gradient at edges. Floating white card (radius 16px, shadow 0 6px 24px rgba(0,0,0,0.1)) centered, width 85%. Inside card: original price strikethrough in gray (#9ca3af, 14px) at top, discounted price in massive bold cyan (#06b6d4, 44px, weight 900) centered, thin teal divider (60% width, 1px), event period dates in small gray (#6b7280, 11px) at bottom. Card internal padding 20px.
ZONE C – CTA + CONTACT (20%): Rounded teal-to-cyan gradient (#06b6d4 → #0891b2) CTA pill button (75% width, 48px) "예약하기" in bold white (16px). Below button: "☎ 02-XXX-XXXX" in small gray (10px). Hospital name in teal (10px).
ZONE D – DISCLAIMER (10%): Light teal tint (#ecfeff) bar. "※ 부작용 등 주의사항 확인" in tiny gray (9px).

=== STRICT MODE ANCHORS ===
• Floating price card with shadow is the focal point
• Card must appear to "float" above background (shadow required)
• Teal/cyan is the only accent color — no warm colors
• Zone proportions: 20/40/20/10 (± 3%, remaining 10% spacing)
• CTA button has gradient fill

=== INSPIRED MODE FREEDOM ===
• Card shadow depth and blur can vary
• Teal gradient intensity on background edges can vary
• Card can have subtle teal top-border accent
• Wavy/curved decorative line between zones allowed
• CTA can be solid teal instead of gradient

=== MOBILE READABILITY ===
• Treatment name ≥ 28px. Price ≥ 36px.
• Card width 80-90% of canvas. Card padding ≥ 16px.
• CTA tap target ≥ 44px height`,
    },
    {
      id: 'evt_season_special', name: '시즌 스페셜', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '그린 시즌 배너 + 자연 모티프',
      layoutHint: 'season',
      aiPrompt: `Korean hospital seasonal promotion — fresh green with "시즌 한정" badge. For seasonal campaigns (수능, 새학기, 여름, 연말). Inspired by 한국 피부과/성형외과 시즌 할인 배너.

=== ZONE LAYOUT (vertical stack on mint background) ===
ZONE A – SEASON BADGE + BRAND (15%): Light mint (#f0fdf4) to white gradient background. Hospital name in small green (#16a34a, 11px) text top-center. "시즌 한정" inside a rounded green (#22c55e) pill badge (white text, 11px bold, padding 4px 12px) centered below hospital name.
ZONE B – TREATMENT CARD (45%): White card (radius 12px, shadow 0 4px 16px rgba(0,0,0,0.08)), width 88%, centered. Inside card: treatment name in large bold green (#22c55e, 32px, weight 800) centered. "이벤트" subtitle in darker green (#15803d, 13px). Thin green divider (50% width, 1px). Light green (#f0fdf4) background area for price section: original price strikethrough in gray (#9ca3af, 14px), discounted price in massive bold green (#22c55e, 44px, weight 900). Card internal padding 18px.
ZONE C – CTA + PERIOD (25%): Event period "2024.03.01 ~ 03.31" in small gray (#6b7280, 12px) centered. Green gradient (#22c55e → #16a34a) CTA pill button (75% width, 48px) "예약하기" in bold white (16px). Hospital name small in green below.
ZONE D – DISCLAIMER (10%): "※ 의료법에 의한 부작용 안내 확인" in tiny gray (9px). Thin mint (#d1fae5) bar.

=== STRICT MODE ANCHORS ===
• "시즌 한정" pill badge always present at top
• White card on mint background is the core composition
• Green is the only accent color (no red/orange/blue)
• Zone proportions: 15/45/25/10 (± 3%, remaining 5% spacing)
• Treatment card is the largest visual element

=== INSPIRED MODE FREEDOM ===
• Season badge can include season name (e.g., "🌸 봄 시즌 한정")
• Card can have green top-border accent instead of full shadow
• Decorative leaf/nature motifs at low opacity allowed
• CTA can be solid green instead of gradient
• Price area background tint can be cream instead of mint

=== MOBILE READABILITY ===
• Treatment name ≥ 28px. Price ≥ 36px. Badge ≥ 10px.
• Card width 85-92% of canvas. Card padding ≥ 14px.
• CTA tap target ≥ 44px height`,
    },
  ],

  // ─── 의사 소개 (6개) ───
  // 연구 기반: 좌우 분할 레이아웃 우세, 자격증 목록, 스튜디오 촬영 사진(백의), 중립 배경
  // 의료법 준수: 최고/유일/첫 등 최상급 표현 금지, 미검증 비교 금지
  // 색상: 화이트/라이트그레이 + 네이비(신뢰), 브랜드 컬러 악센트바, 베이지/크림(피부과)
  doctor: [
    {
      id: 'doc_portrait_formal', name: '매거진 커버', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '매거진 커버형 + 하단 정보 오버레이',
      layoutHint: 'portrait',
      aiPrompt: `Korean hospital doctor profile — formal, authoritative, top photo + bottom info.
TOP SECTION (55%): Light gray (#f1f5f9) or soft blue tint background. Hospital name with short accent underline at top-left. Large circular photo placeholder centered — white fill, soft shadow. This is a professional headshot area (white coat, neutral background).
BOTTOM SECTION (45%): Clean white band. Doctor name in massive bold navy (#1e40af, 32px, weight 800). Rounded navy pill badge with white text for specialty (e.g., "치과 전문의"). Credentials listed below in clean gray text — each on its own line (학력, 경력, 자격). Clear separation between photo zone and info zone.
Information hierarchy: photo → name → specialty badge → credentials. Formal, trustworthy. Korean medical law: no superlatives.`,
    },
    {
      id: 'doc_friendly_curve', name: '친근한 곡선', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '민트 곡선 + 인사말 강조 (가정의학)',
      layoutHint: 'curve',
      aiPrompt: `Korean neighborhood clinic doctor profile — friendly, approachable, mint/green accent.
BACKGROUND: Clean white with very subtle mint (#ecfdf5) tint.
TOP (15%): Hospital name in small green (#10b981) text centered.
MIDDLE-TOP (35%): Large circular photo placeholder centered — white fill, thin green (#10b981) border, soft shadow. Professional headshot area.
MIDDLE-BOTTOM (30%): Doctor name in large bold green (#10b981, 28px, weight 800) centered. Specialty in green accent text (e.g., "가정의학과 전문의"). Credentials listed in gray text — clean bullet points or vertical list.
BOTTOM (20%): Doctor greeting message in warm gray italic (e.g., "온 가족의 주치의가 되겠습니다"). Hospital name small at bottom.
Rounded, soft shapes throughout. Friendly, warm, patient-first aesthetic. Green = health, freshness. For family medicine, pediatrics, neighborhood clinics.`,
    },
    {
      id: 'doc_modern_split', name: '모던 분할', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '좌우 2단 분할 — 좌측 사진+우측 정보, 한국 병원 가장 보편적 레이아웃, 종합병원/전문의 프로필',
      layoutHint: 'split',
      aiPrompt: `Korean hospital doctor profile — left-right split layout (가장 많이 사용되는 의사 소개 형식). Inspired by 네이버 병원 찾기 의사 프로필 and 병원 홈페이지 의료진 소개.

=== ZONE LAYOUT (horizontal split: left photo | right info) ===
LEFT PANEL (42% width, full height):
  Light indigo (#eef2ff) background, full height. Hospital name "○○병원" in small indigo (#6366f1, 10px) at top-left corner (8px margin). Large circular photo placeholder centered both horizontally and vertically within panel (diameter ~70% of panel width). White fill, indigo (#6366f1, 2px) border, soft shadow (0 4px 16px rgba(0,0,0,0.08)). Professional studio headshot: white coat, neutral background, shoulders-up. Below photo: thin indigo decorative line (50% of panel width) centered.

RIGHT PANEL (58% width, full height):
  White background. Content vertically centered with top padding ~15%.
  ROW 1 – NAME: Doctor name "박○○" in bold indigo (#6366f1, 28px, weight 800). Left-aligned.
  ROW 2 – SPECIALTY BADGE: Rounded indigo (#6366f1) pill badge "정형외과 전문의" in white text (12px, bold). 8px below name.
  ROW 3 – CREDENTIALS: Structured list, 12px below badge:
    • "학력: 연세대학교 의과대학 졸업" (gray #4b5563, 12px)
    • "경력: ○○대학교병원 정형외과 전임의" (gray, 12px)
    • "전공: 관절경 수술, 스포츠 의학" (gray, 12px)
    • "학회: 대한정형외과학회 정회원" (gray, 12px)
  Each with small indigo (#6366f1) dot bullet. 5px line spacing.
  ROW 4 – GREETING: Thin indigo hairline above (80% width). "환자 한 분 한 분에게 정성을 다하겠습니다" in italic gray (#6b7280, 12px). 12px below credentials.

=== SPLIT DIVIDER ===
Vertical thin indigo (#6366f1, 1px opacity 30%) line between left and right panels, or clean edge with no visible divider.

=== STRICT MODE ANCHORS ===
• Left-right split must be maintained (not top-bottom)
• Photo on left, info on right (never reversed)
• Split ratio: 42/58 (± 5%)
• Photo always circular within left panel
• Credentials structured as labeled list (학력/경력/전공/학회)
• Korean medical law: NEVER use 최고, 유일, 첫, 가장 or any superlative

=== INSPIRED MODE FREEDOM ===
• Split ratio can shift 35/65 to 50/50
• Left panel background tint can vary
• Photo shape can be rounded rectangle
• Divider can be visible line, color edge, or gradient blend
• Right panel can have subtle indigo accent bar at top

=== MOBILE READABILITY ===
• Doctor name ≥ 24px. Credentials ≥ 11px. Badge ≥ 11px.
• On very narrow canvas, layout can stack vertically (photo top, info bottom)
• Credential labels (학력/경력) in bold for scanability`,
    },
    {
      id: 'doc_warm_story', name: '따뜻한 스토리', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '좌측 사이드바+우측 인사말 매거진 — 인사말이 주역, 소형 프로필 사이드바, 소아과/가정의학 친화',
      layoutHint: 'story',
      aiPrompt: `Korean hospital doctor profile — magazine-style with sidebar photo and greeting as main content. Inspired by 소아과/가정의학과 블로그형 원장 인사말 페이지.

=== ZONE LAYOUT (horizontal: narrow sidebar | wide content) ===
LEFT SIDEBAR (22% width, full height):
  Warm orange (#f97316) at 8% opacity fill, full height. Top (20% of sidebar): small circular photo placeholder (diameter ~80% of sidebar width), centered. White fill, thin orange (#f97316, 1.5px) border. Below photo: doctor name "이○○ 원장" in warm orange (#f97316, 13px, weight 700) centered. Bottom of sidebar: hospital name "○○소아과" in tiny orange (#ea580c, 9px) centered. Thin orange (#f97316, 1px) right border separating sidebar from main.

RIGHT MAIN AREA (78% width, full height):
  Warm cream (#fff7ed) background.
  ZONE A – GREETING (top 50%): Generous padding (20px top, 16px sides). Doctor greeting in warm dark gray (#374151, 16px, line-height 1.8, weight 400): e.g. "아이들의 건강한 성장을 위해 항상 곁에서 함께하겠습니다. 작은 증상도 꼼꼼히 살피고, 부모님의 걱정을 덜어드리는 의사가 되겠습니다." This is the MAIN CONTENT — 2–3 sentences of warm, personal commitment. Opening quotation mark "「" in large orange (#f97316, 32px) as decorative element at top-left of greeting.
  ZONE B – CREDENTIALS (middle 30%): Thin orange hairline above. Specialty "소아청소년과 전문의" in bold orange (#f97316, 14px). Below: credentials as pipe-separated byline: "고려대 의대 졸업 | ○○병원 소아과 전임의 | 대한소아과학회 정회원" in gray (#6b7280, 11px, line-height 1.6).
  ZONE C – FOOTER (bottom 20%): Thin orange hairline above. Hospital name + contact in small gray (10px).

=== STRICT MODE ANCHORS ===
• Sidebar always on LEFT, narrow (20–25% width)
• Greeting text is the dominant content (largest text area)
• Photo is small and contained in sidebar (not main area)
• Sidebar has tinted background; main area has cream/white
• Korean medical law: NEVER use 최고, 유일, 첫, 가장 or any superlative
• Greeting must be warm and patient-centered, never boastful

=== INSPIRED MODE FREEDOM ===
• Sidebar can be right instead of left
• Greeting can be 1–4 sentences
• Decorative quotation mark style can vary (「」, "", ornamental)
• Sidebar tint color intensity can vary 5–15%
• Credentials can be vertical list instead of pipe-separated

=== MOBILE READABILITY ===
• Greeting text ≥ 14px with line-height ≥ 1.6
• Doctor name ≥ 12px. Credentials ≥ 10px.
• Sidebar photo ≥ 48px diameter
• On narrow canvas, sidebar can collapse to horizontal strip at top`,
    },
    {
      id: 'doc_dark_luxury', name: '다크 럭셔리', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '다크 네이비+골드 전면 — VIP 원장 프로필, 성형외과/에스테틱 특화, 골드 프레임+코너 장식',
      layoutHint: 'luxury',
      aiPrompt: `Korean premium clinic doctor profile — dark navy full-bleed with gold accents. Inspired by 청담/강남 성형외과 VIP 원장 소개 페이지 and 호텔급 피부과 브랜딩.

=== ZONE LAYOUT (centered vertical axis on dark background) ===
ZONE A – BRAND HEADER (10%): Deep navy (#0f172a) background. Hospital name "○○성형외과" in small gold (#d4a017, 11px, letter-spacing 3px) centered. Thin gold horizontal rule (0.5px, 40% width) below.
ZONE B – PHOTO SHOWCASE (40%): Navy background continues. Circular photo placeholder centered (diameter ~50% of canvas width). Gold (#d4a017, 2.5px) ring border around photo. Four L-shaped gold corner brackets positioned at corners of an imaginary square around the photo (each bracket ~12px). Inside photo: professional studio headshot — white coat or suit, dark/neutral background. Subtle gold glow effect (box-shadow 0 0 20px rgba(212,160,23,0.15)) around photo.
ZONE C – IDENTITY + CREDENTIALS (35%): Doctor name "최○○ 대표원장" in bold gold (#d4a017, 28px, weight 800) centered. Below: specialty "성형외과 전문의" in smaller gold (#b8860b, 14px) centered. Thin gold line (30% width) divider. Credentials in light gray (#94a3b8, 12px) centered, each on own line:
  • "서울대학교 의과대학 졸업"
  • "○○대학교병원 성형외과 전문의 취득"
  • "대한성형외과학회 정회원"
  • "대한미용성형외과학회 정회원"
  5px line spacing. No bullets — clean centered lines.
ZONE D – FOOTER (15%): Thin gold horizontal line (60% width). Hospital name in small gold (#d4a017, 10px) centered. "상담 예약: 02-XXX-XXXX" in muted gold (#b8976a, 10px) below.

=== FRAMING ===
Gold double-line border around entire canvas: outer 1px, inner 0.5px, 5px gap. Creates luxury frame effect.

=== STRICT MODE ANCHORS ===
• Navy (#0f172a) background must be full bleed — no white areas anywhere
• Gold (#d4a017) and gray (#94a3b8) are the only text colors
• Corner brackets around photo always present
• Photo always circular with gold ring border
• Zone proportions: 10/40/35/15 (± 3%)
• Korean medical law: NEVER use 최고, 유일, 첫, 가장, 독보적 or any superlative

=== INSPIRED MODE FREEDOM ===
• Corner brackets can be ornamental flourishes or minimal angles
• Gold ring can have double-ring effect
• Subtle navy gradient (radial, slightly lighter center) allowed
• Credentials can have small gold dot separators
• Additional decorative thin gold lines between credential items

=== MOBILE READABILITY ===
• Doctor name ≥ 24px. Credentials ≥ 11px.
• Photo diameter ≥ 40% of canvas width
• Gold text on navy must maintain contrast ratio ≥ 4.5:1
• Frame border inset ≥ 6px from canvas edge`,
    },
    {
      id: 'doc_clean_grid', name: '클린 그리드', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '2x2 인포그래픽 카드 그리드 — 자격사항 4분할 카드, 빠른 스캔 최적화, 치과/종합병원 특화',
      layoutHint: 'grid',
      aiPrompt: `Korean hospital doctor profile — infographic 2x2 card grid layout for credential highlights. Inspired by 네이버 의사 프로필 카드 and 병원 앱 의료진 정보 UI.

=== ZONE LAYOUT (vertical: photo header + grid + footer) ===
ZONE A – PHOTO + NAME (30%): Light sky blue (#f0f9ff) gradient to white background. Hospital name "○○치과" in small sky blue (#0ea5e9, 10px) top-left. Circular photo placeholder centered (diameter ~40% of canvas width). White fill, sky blue (#0ea5e9, 2px) border, soft shadow. Below photo: doctor name "정○○ 원장" in bold sky blue (#0ea5e9, 24px, weight 800) centered. "치과보존과 전문의" in sky blue (#0284c7, 13px) centered below name.

ZONE B – CREDENTIAL GRID (45%): White background. 2x2 grid of info cards with 8px gap between cards. Each card: white fill, subtle sky blue (#0ea5e9, 1px) border, radius 8px, soft shadow (0 1px 4px rgba(0,0,0,0.05)), internal padding 10px.
  Card layout — sky blue label at top (bold, 10px, letter-spacing 1px, uppercase-style) + value text below in dark gray (#1f2937, 12px):
  TOP-LEFT card:  "학력" → "서울대학교 치의학대학원"
  TOP-RIGHT card: "전공" → "근관치료, 심미수복"
  BOTTOM-LEFT card:  "경력" → "○○병원 보존과 5년"
  BOTTOM-RIGHT card: "학회" → "대한치과보존학회 정회원"
  Each card identical size (48% width, auto height). Grid centered in zone.

ZONE C – FOOTER (15%): Light sky blue (#f0f9ff) background. Hospital name in small gray (10px) centered. Optional: rounded sky blue (#0ea5e9) pill badge with specialty summary.

=== STRICT MODE ANCHORS ===
• 2x2 grid layout must be maintained (4 cards)
• Each card has identical dimensions and styling
• Card labels are always: 학력, 전공, 경력, 학회 (in this order)
• Photo above grid, footer below grid
• Zone proportions: 30/45/15 (± 3%, remaining 10% spacing)
• Korean medical law: NEVER use 최고, 유일, 첫, 가장 or any superlative

=== INSPIRED MODE FREEDOM ===
• Grid can shift to 1x4 vertical stack on narrow canvas
• Cards can have colored left-border accent instead of full border
• Card backgrounds can have subtle sky blue tint
• Additional 5th card can be added as full-width row below grid
• Icons can accompany card labels (🎓 학력, 🏥 경력, 📋 전공, 🏛️ 학회)

=== MOBILE READABILITY ===
• Doctor name ≥ 20px. Card labels ≥ 10px. Card values ≥ 11px.
• Card minimum width: 45% of canvas width
• Card internal padding ≥ 8px
• Grid gap ≥ 6px for touch-friendly separation`,
    },
  ],

  // ─── 공지사항 (6개) ───
  // 연구 기반: 똑닥 템플릿(PDF/PPT/SNS), 중앙 단일카드, 구조화된 행, 연락처 포함
  // 색상: 화이트+네이비/다크그레이(기본), 계절 악센트(핑크/오렌지), 서브듀드 전문적
  notice: [
    {
      id: 'ntc_bulletin_board', name: '클린 블루 안내', color: '#2563eb', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '블루 헤더+오버랩 카드 표준형 — 똑닥/병원 표준 공지 포맷, 일반 긴급도, 구조화된 항목 나열',
      layoutHint: 'bulletin',
      aiPrompt: `Korean hospital official notice — standard blue header + overlapping white card. Modeled on 똑닥 공지 템플릿 and 네이버 예약 병원 공지 스타일. Normal urgency level.

=== ZONE LAYOUT (header + overlapping card) ===
ZONE A – BLUE HEADER (35%): Solid blue (#2563eb) full-width block. Hospital name "○○병원" in small white (11px) top-center. Below: notice title e.g. "진료시간 변경 안내" or "휴진 안내" in large bold white (26px, weight 800) centered. Optional subtitle "안내드립니다" in white (13px, opacity 80%) below title.
ZONE B – OVERLAPPING CARD (50%): Light blue (#eff6ff) background behind card. White rounded card (radius 12px, shadow 0 4px 16px rgba(0,0,0,0.08)), width 90%, overlapping Zone A bottom edge by ~10%. Inside card, structured content:
  • "📅 기간: 2024.03.01(금) ~ 03.05(수)" — bold dark text (13px)
  • "📋 사유: 병원 내부 시설 보수 공사" — gray text (13px)
  • "🏥 대체진료: ○○병원 (02-XXX-XXXX)" — gray text (13px)
  • "⏰ 재개일: 2024.03.06(목) 정상 진료" — bold dark text (13px)
  Each item with blue (#2563eb) dot bullet, 8px vertical spacing. Key info (dates, contact) in bold (#1f2937), supporting text in gray (#4b5563).
ZONE C – CTA + CONTACT (15%): Light blue background continues. Full-width rounded blue (#2563eb) button "전화 문의하기" in bold white (15px). Below: "📞 대표전화: 02-XXX-XXXX | 진료시간: 평일 09:00~18:00" in gray (10px) centered.

=== EMERGENCY CONTACT BAR ===
At very bottom: thin light blue (#dbeafe) bar, full width. "응급 시 연락처: 02-XXX-XXXX" in blue (#2563eb, 11px) centered.

=== INFO HIERARCHY ===
1st: Notice title (largest, white on blue) 2nd: Key dates/period (bold in card) 3rd: Details (gray in card) 4th: CTA button 5th: Contact info

=== STRICT MODE ANCHORS ===
• Blue header + white overlapping card structure must be maintained
• Card overlaps header bottom edge
• Structured bullet items inside card (not free-flowing text)
• Emergency contact bar at bottom
• Zone proportions: 35/50/15 (± 3%)

=== INSPIRED MODE FREEDOM ===
• Number of bullet items can vary (3–6)
• Icons/emojis beside items can be omitted or changed
• Card can have blue left-border accent
• Header can have subtle gradient (blue to darker blue)
• Additional "참고사항" section inside card allowed

=== MOBILE READABILITY ===
• Title ≥ 22px. Card items ≥ 12px. Contact ≥ 10px.
• Card width 85–95% of canvas. Card padding ≥ 14px.
• CTA button tap target ≥ 44px height`,
    },
    {
      id: 'ntc_modern_alert', name: '코럴 공지', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '긴급 경고 배너형 — 긴급 휴진/응급 안내, 높은 긴급도, 응급연락처 강조 바, 대체병원 정보 포함',
      layoutHint: 'alert',
      aiPrompt: `Korean hospital URGENT notice — red alert banner for 긴급 휴진, 응급 상황, 긴급 변경. HIGH urgency level. Inspired by 병원 긴급공지 카카오톡 알림톡 디자인.

=== ZONE LAYOUT (alert banner + content + emergency bar) ===
ZONE A – ALERT BANNER (25%): Solid coral-red (#ef4444) full-width block. Hospital name "○○병원" in small white (10px) top-left. Center: "⚠️ 긴급 안내" or "긴급 휴진 안내" in large bold white (28px, weight 800). Below title: "긴급" pill badge (white border, white text "URGENT", 10px) for additional emphasis.
ZONE B – CONTENT CARD (45%): Light red (#fef2f2) background. White rounded card (radius 10px, shadow 0 2px 12px rgba(0,0,0,0.08)), width 90%. Inside card, structured with red (#ef4444) left border accent (3px):
  • "🚨 휴진 기간: 2024.03.01(금) ~ 03.03(일)" — bold dark text (14px, weight 700)
  • "📋 사유: 의료진 긴급 사정" — gray text (13px)
  • "🏥 대체 병원: ○○의원 (도보 5분)" — gray text (13px)
  • "📍 대체 병원 주소: 서울시 ○○구 ○○로 123" — gray text (12px)
  • "⏰ 정상 진료 재개: 2024.03.04(월)" — bold dark text (14px)
  Each with 8px vertical spacing. Dates and key info in bold (#1f2937).
ZONE C – EMERGENCY CONTACT BAR (15%): Rounded pill bar with light red (#fef2f2) background, red (#ef4444) border (1.5px), centered. Inside: "📞 응급 연락처: 010-XXXX-XXXX (24시간)" in bold red (#dc2626, 14px). This is the most prominent contact element.
ZONE D – CLOSING (15%): White background. "환자분들께 불편을 드려 진심으로 죄송합니다." in gray italic (12px) centered. Hospital name "○○병원 원장 ○○○" in small gray (10px). "대표전화: 02-XXX-XXXX" in gray (10px).

=== STRICT MODE ANCHORS ===
• Red alert banner always at top — signals urgency immediately
• Emergency contact bar must be prominently displayed (not buried in text)
• Card must have red left-border accent
• "긴급" or "URGENT" indicator always visible
• Zone proportions: 25/45/15/15 (± 3%)
• Apology closing message always present

=== INSPIRED MODE FREEDOM ===
• Alert icon can be ⚠️, 🚨, or ❗
• Card can have full red border instead of left-only
• Emergency bar can be full-width strip instead of pill shape
• Additional "안내" items can be added (3–7 items)
• Banner can have gradient (red to darker red)

=== MOBILE READABILITY ===
• Alert title ≥ 24px. Emergency phone ≥ 13px. Card items ≥ 12px.
• Emergency contact bar always visible without scrolling
• Card padding ≥ 12px. Red border accent ≥ 3px for visibility`,
    },
    {
      id: 'ntc_soft_info', name: '라벤더 안내', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '번호 매긴 필 카드 3단 — 낮은 긴급도, 피부과/소아과 친화, 변경사항을 단계별로 안내',
      layoutHint: 'soft',
      aiPrompt: `Korean hospital soft notice — numbered pill cards for friendly step-by-step announcements. LOW urgency level. For 진료시간 변경, 리모델링 안내, 새 서비스 도입. Preferred by 피부과/에스테틱/소아과. Inspired by 카카오톡 채널 안내 메시지 디자인.

=== ZONE LAYOUT (vertical: header + 3 numbered cards + CTA) ===
ZONE A – HEADER (20%): Soft lavender (#f5f3ff) background. Rounded lavender (#8b5cf6) circle icon with white "ℹ" (or 📢) centered at top (32px diameter). Below: notice title e.g. "진료시간 변경 안내" or "새로운 서비스 안내" in bold purple (#8b5cf6, 22px, weight 800) centered. Hospital name "○○피부과" in small gray (#6b7280, 10px) centered below title.

ZONE B – NUMBERED CARDS (50%): Lavender background continues. 3 pill-shaped cards stacked vertically with 8px gap:
  CARD 1: White card (radius 20px, shadow 0 1px 6px rgba(0,0,0,0.05)), width 90%. Left: purple (#8b5cf6) circle with white "1" (bold, 14px). Right: "변경사항: 오후 진료시간이 18:00에서 19:00으로 연장됩니다" in dark gray (#374151, 13px). Internal padding 12px.
  CARD 2: Same style. Circle "2". "적용일: 2024년 3월 1일(금)부터 적용" in dark gray.
  CARD 3: Same style. Circle "3". "참고사항: 토요일 진료시간은 변동 없습니다 (09:00~13:00)" in dark gray.
  Each card identical dimensions. Content left-aligned after number circle.

ZONE C – CTA + FOOTER (20%): Rounded purple (#8b5cf6) pill button "자세히 보기" or "문의하기" in bold white (14px), centered, 70% width. Below: "문의: 02-XXX-XXXX" in gray (10px). 10px below: thin lavender bar full-width with "응급 연락처: 010-XXXX-XXXX" in purple (#7c3aed, 10px) centered.

=== STRICT MODE ANCHORS ===
• Exactly 3 numbered pill cards (no more, no fewer)
• Cards have pill shape (high border-radius ≥ 20px)
• Number circles on left, text on right within each card
• Lavender/purple palette throughout — no warm or contrasting colors
• Zone proportions: 20/50/20 (± 3%, remaining 10% spacing)
• Emergency contact bar at bottom

=== INSPIRED MODE FREEDOM ===
• Number of cards can extend to 4–5 for complex notices
• Card shape can be standard rounded rectangle instead of pill
• Number indicators can be icons instead of numbers
• Background can have subtle gradient (lavender to white)
• Cards can have left purple border accent instead of number circle

=== MOBILE READABILITY ===
• Title ≥ 20px. Card text ≥ 12px. Number in circle ≥ 13px.
• Card padding ≥ 10px. Cards width 85–95% of canvas.
• CTA button tap target ≥ 44px height`,
    },
    {
      id: 'ntc_corporate_formal', name: '공식 문서', color: '#1f2937', accent: '#111827', bg: '#f9fafb',
      desc: '공문서 이중선 형식 — 대학병원/종합병원 공식 고지, 원장 명의 발신, 무채색 권위체',
      layoutHint: 'formal',
      aiPrompt: `Korean hospital official document notice — formal 공문서 style. Used by 대학병원/종합병원 for 원장 명의 공지, 법적 고지, 정책 변경, 의료수가 변경. FORMAL urgency level. Inspired by Korean government 공문서 and 대한병원협회 공지 양식.

=== ZONE LAYOUT (document format with double-line borders) ===
ZONE A – TOP BORDER + HEADER (15%): Pure white (#ffffff) background. Double horizontal lines at top: thick line (2px, charcoal #1f2937) above, thin line (0.5px, charcoal) below, 4px gap. Below lines: hospital name "○○대학교병원" in formal charcoal (#1f2937, 16px, weight 700, letter-spacing 3px) centered. Optional small hospital logo placeholder above name.

ZONE B – TITLE (12%): "공 지 사 항" in very large bold charcoal (#111827, 28px, weight 900, letter-spacing 8px) centered. Thin charcoal hairline (40% width) below title.

ZONE C – BODY CONTENT (48%): Left-aligned with 24px left indent. All text in charcoal (#1f2937) on white. Structured as formal numbered items:
  "1. 변경 내용: 2024년 3월 1일부로 외래 진료시간이 아래와 같이 변경됩니다." (13px)
  "   - 평일: 09:00 ~ 17:30 (변경 전: 09:00 ~ 17:00)" (12px, gray #4b5563)
  "   - 토요일: 09:00 ~ 12:30 (변경 없음)" (12px, gray)
  "2. 적용일: 2024년 3월 1일(금)" (13px)
  "3. 사유: 의료진 진료 환경 개선" (13px)
  "4. 문의: 원무과 02-XXX-XXXX (내선 XXX)" (13px)
  Numbered items in bold charcoal. Sub-items indented with dash. 6px line spacing.

ZONE D – CLOSING (15%): "위 사항을 안내드리오니 양해하여 주시기 바랍니다." in charcoal (12px) centered. 16px gap. "○○대학교병원" in bold charcoal (14px) centered. "병원장 ○○○" in charcoal (12px) centered. Double horizontal lines at bottom matching top border.

=== EMERGENCY CONTACT ===
Below bottom border: "응급실: 02-XXX-XXXX (24시간)" in small charcoal (#374151, 10px) centered.

=== STRICT MODE ANCHORS ===
• Double-line borders at TOP and BOTTOM — defining feature
• Black/white/charcoal only — NO colors, NO decorations, NO icons
• Left-aligned body with indent (공문서 style)
• Numbered items for content (not bullets)
• Closing with hospital name + 원장 title
• Zone proportions: 15/12/48/15 (± 3%, remaining 10% spacing)

=== INSPIRED MODE FREEDOM ===
• Number of body items can vary (2–6)
• Indent depth can vary (16–32px)
• Letter-spacing in title can vary
• Light gray (#f9fafb) background instead of pure white allowed
• Sub-items can use ·, -, or ① style markers

=== MOBILE READABILITY ===
• Title ≥ 24px. Body text ≥ 12px. Closing ≥ 11px.
• Left indent ≥ 16px. Right margin ≥ 16px.
• Double lines must be visible (top line ≥ 1.5px thick)`,
    },
    {
      id: 'ntc_card_popup', name: '민트 팝업', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '다크 배경+플로팅 모달 카드 — 신규 개원/장비 도입/특별 안내, 중간 긴급도, 팝업 주목 효과',
      layoutHint: 'popup',
      aiPrompt: `Korean hospital modern popup-style notice — dark overlay with floating white modal card. MEDIUM urgency level. For attention-grabbing announcements: 신규 개원, 최신 장비 도입, 진료과목 추가, 특별 안내. Inspired by 앱 팝업 공지 UI and 카카오톡 채널 공지 팝업.

=== ZONE LAYOUT (dark backdrop + centered modal card) ===
BACKGROUND: Dark semi-transparent overlay (#0f172a at 60% opacity) full bleed. Creates focus on the modal card.

MODAL CARD (centered, 85% width, ~75% height): White rounded card (radius 14px, shadow 0 8px 32px rgba(0,0,0,0.2)).
  CARD ZONE A – ICON + TITLE (20% of card): Rounded mint (#06b6d4) circle icon (48px diameter) with white "📢" or "🔔" centered, positioned at top-center of card (overlapping card top edge by 50%). Below icon: notice title e.g. "신규 장비 도입 안내" or "진료과목 확대 안내" in bold dark (#1f2937, 22px, weight 800) centered. Hospital name "○○병원" in gray (#6b7280, 11px) centered below.
  CARD ZONE B – CONTENT (50% of card): Structured items with generous spacing (10px between items):
    • "📅 적용일: 2024년 3월 1일(금)부터" — bold dark (13px)
    • "🔬 도입 장비: ○○○ (최신 CT 촬영 장비)" — gray (13px)
    • "💡 특징: 저선량 고해상도 촬영으로 정확한 진단 가능" — gray (13px)
    • "📍 위치: 본원 2층 영상의학과" — gray (12px)
    • "ℹ️ 참고: 기존 예약 환자분께는 개별 안내드립니다" — gray (12px)
  Each with mint (#06b6d4) dot bullet. Key info in bold (#1f2937).
  CARD ZONE C – CTA + CONTACT (20% of card): Rounded mint (#06b6d4) to teal (#0891b2) gradient button "확인했습니다" or "예약 문의" in bold white (15px), 70% width, centered. Below: "문의: 02-XXX-XXXX" in gray (10px).
  CARD ZONE D – EMERGENCY BAR (10% of card): Thin mint (#ecfeff) bar at card bottom with rounded bottom corners. "응급 연락처: 02-XXX-XXXX" in teal (#0891b2, 10px) centered.

=== STRICT MODE ANCHORS ===
• Dark overlay backdrop always present
• White modal card centered on dark background
• Icon circle overlaps card top edge
• Content structured as bulleted items (not paragraph text)
• CTA button inside card
• Emergency contact at card bottom
• Card proportions: 20/50/20/10 (± 3%)

=== INSPIRED MODE FREEDOM ===
• Icon can be any relevant emoji or abstract symbol
• Dark overlay opacity can vary 40–70%
• Card size can vary 75–90% width, 65–80% height
• Number of content items: 3–6
• CTA button text freely changeable
• Card can have mint top-border accent (3px)

=== MOBILE READABILITY ===
• Title ≥ 20px. Content items ≥ 12px. CTA ≥ 14px.
• Card internal padding ≥ 16px. CTA tap target ≥ 44px.
• Icon circle ≥ 40px diameter`,
    },
    {
      id: 'ntc_timeline', name: '그린 타임라인', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '변경 전/후 좌우 비교 카드 — 진료시간/위치/담당의 변경, 빨강→초록 시각 비교, 즉시 파악 가능',
      layoutHint: 'timeline',
      aiPrompt: `Korean hospital change notice — before/after side-by-side comparison cards. For 진료시간 변경, 위치 이전, 담당의 변경, 시스템 변경. MEDIUM urgency level. Inspired by 은행/관공서 변경 안내문 and 병원 리모델링 이전 공지.

=== ZONE LAYOUT (header + side-by-side cards + footer) ===
ZONE A – HEADER (18%): White background. Hospital name "○○의원" in green (#16a34a, 11px) top-left. Notice title e.g. "진료시간 변경 안내" or "병원 위치 이전 안내" in bold green (#22c55e, 24px, weight 800) centered. Thin green hairline (50% width) below title.

ZONE B – COMPARISON CARDS (50%): White background. Two cards side by side (each ~44% width, 8px gap between, centered):
  LEFT CARD "변경 전": Light red (#fef2f2) background, radius 10px, padding 12px.
    "변경 전" label in bold red (#ef4444, 14px, weight 700) at top.
    Thin red (#fca5a5) line below label.
    Content listed in dark gray (#374151, 12px):
      "평일: 09:00 ~ 17:00"
      "토요일: 09:00 ~ 12:00"
      "점심: 12:30 ~ 13:30"
    Each on own line, 5px spacing.
  CENTER ARROW: Between the two cards, vertically centered: green (#22c55e) circle (28px) with white "→" arrow inside. Represents the change direction.
  RIGHT CARD "변경 후": Light green (#f0fdf4) background, radius 10px, padding 12px.
    "변경 후" label in bold green (#22c55e, 14px, weight 700) at top.
    Thin green (#86efac) line below label.
    Content listed in dark gray (#1f2937, 12px, weight 600):
      "평일: 09:00 ~ 18:00" ← changed items in bold
      "토요일: 09:00 ~ 13:00" ← changed items in bold
      "점심: 12:30 ~ 13:30 (변동 없음)" ← unchanged in regular weight

ZONE C – DETAILS + CONTACT (22%): White background.
  "📅 적용일: 2024년 3월 1일(금)부터" in bold dark text (13px) centered.
  "참고하여 내원에 차질 없으시기 바랍니다." in gray italic (11px) centered.
  Thin green line divider.
  Contact bar: light green (#f0fdf4) rounded bar, full width. "📞 문의: 02-XXX-XXXX | 응급: 010-XXXX-XXXX" in green (#16a34a, 11px) centered.

=== STRICT MODE ANCHORS ===
• Two cards MUST be side by side (left = before, right = after)
• Left card red-tinted, right card green-tinted — color coding mandatory
• Arrow indicator between cards
• Changed items in right card must be visually differentiated (bold)
• Zone proportions: 18/50/22 (± 3%, remaining 10% spacing)
• Emergency/contact bar at bottom

=== INSPIRED MODE FREEDOM ===
• Arrow can be →, ▶, or animated-style chevron
• Cards can be stacked vertically on very narrow canvas
• Additional "변경 사유" section below cards allowed
• Card borders can be added for definition
• Background can have very subtle green tint instead of pure white

=== MOBILE READABILITY ===
• Title ≥ 20px. Card labels ≥ 13px. Card content ≥ 11px.
• Cards minimum width: 40% each. Gap ≥ 6px.
• Arrow circle ≥ 24px diameter
• Contact bar padding ≥ 8px`,
    },
  ],

  // ─── 명절 인사: 설날 (6개) ───
  // 연구 기반: 네이비+골드(보름달), 베이지+전통색동(현대적), 서예체 인사말
  // 캔바/미리캔버스 한국 명절 템플릿 패턴 참고, 2025 뱀띠해 등 동물 테마
  greeting_설날: [
    {
      id: 'grt_seol_traditional', name: '전통 한복', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '단청·기와지붕 격식 있는 전통 설날 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[설날 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 18% → 중앙 40% → 인사말 27% → 푸터 15%
• 단청(丹靑) 색상 팔레트: 적색 #dc2626, 금색 #d4a017, 버건디 #991b1b
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보 (ZONE 1 또는 ZONE 3)
• 휴진 기간 안내 영역 확보 (ZONE 3 카드 내부 하단)

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 매화·소나무 배치 각도 및 밀도 자유
• 한복 인물 실루엣 추가 가능
• 구름문·보상화문·당초문 등 전통 문양 선택 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 18%): 기와지붕(瓦) 실루엣이 전체 폭을 덮는 진한 버건디(#7f1d1d) 지붕선. 지붕 아래 중앙에 "새해 복 많이 받으세요" — 큰 금색(#fbbf24) 궁서체/캘리그래피. 병원명은 흰색 80% 불투명도로 바로 아래 작게 배치.

ZONE 2 — 메인 일러스트 (middle 40%): 중앙 구도 — 큰 원형 프레임 안에 금박 "福/복" 글자(#d4a017 shimmer). 원 좌측에서 소나무(松) 가지가 녹색 솔잎과 함께 뻗어 나오고, 우측에서 매화(梅) 가지가 분홍-흰 꽃과 함께 진입. 원 아래로 빨강·금 매듭(매듭) 장식 한 쌍이 대칭으로 늘어짐. 배경 전체에 단청 기하 패턴 10% 불투명도 오버레이.

ZONE 3 — 인사말·휴진 안내 (next 27%): 흰색 반투명 라운드 카드(85% opacity, border-radius 16px), 좌우 8% 여백. 카드 안: ① 2~3줄 새해 인사 (버건디 #7f1d1d, 중간 크기, line-height 1.6) ② 금색 가는 구분선 ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기). 카드 상하에 금색 세선 디바이더.

ZONE 4 — 푸터 (bottom 15%): 금색(#d4a017) 구름문(雲紋) 25% 불투명도로 좌→우 흐름. 중앙에 작은 치아 아이콘(금색 외곽선)에 한복 갓을 얹은 형태. "2026" 금색 작은 텍스트.

=== BACKGROUND ===
적색-버건디 그라디언트(#dc2626 → #991b1b) 전면. 금색 이중선 테두리 가장자리에서 3% 안쪽. 격조 있고 왕실풍의 설날 분위기 — 만화적 요소 없이 품격 유지.`,
    },
    {
      id: 'grt_seol_tteokguk', name: '떡국 일러스트', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '손그림 떡국·설 음식 수채화풍 따뜻한 인사장',
      layoutHint: 'warm',
      aiPrompt: `[설날 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 18% → 중앙 45% → 인사말 22% → 푸터 15%
• 수채화/손그림 일러스트 스타일 유지
• 인사말 텍스트 반드시 포함: "따뜻한 새해 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 떡국 그릇 디자인·반찬 종류 변형 가능
• 수저 배치 방향 자유
• 김치·나물 등 곁들임 반찬 구성 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 18%): "설날 인사드립니다" — 큰 볼드 따뜻한 갈색(#92400e) 손글씨풍 한글, 중앙 정렬. 병원명은 부드러운 오렌지(#ea580c) 작은 텍스트. 오렌지(#f97316) 점선 가로 구분선.

ZONE 2 — 메인 일러스트 (middle 45%): 중앙에 큰 수채화 떡국 그릇 — 흰 도자기 그릇에 파란 테두리 문양, 안에 흰 떡(가래떡 어슷썰기), 파 고명, 노란 지단, 김 가루. 그릇 위로 3줄기 물결 모양 수증기(따뜻한 흰색). 오른쪽에 나무 젓가락·금속 수저 가지런히 배치, 따뜻한 나무결 식탁면. 좌우 작은 그릇에 김치·나물 반찬. 전체 수채화 번짐 효과.

ZONE 3 — 인사말·휴진 안내 (next 22%): 부드러운 오렌지 테두리(#fdba74, 1px) 라운드 사각 카드, 흰색 90% 불투명도, border-radius 12px. 안: ① 따뜻한 새해 인사 (진한 갈색 #78350f, line-height 1.8) ② "따뜻한 새해 되세요" 볼드 오렌지(#f97316) 강조 ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 작은 치아 캐릭터(둥근 사각형, 점눈, 미소) — 요리사 모자 쓰고 작은 수저 들고 있는 선 드로잉, 따뜻한 갈색(#92400e) 외곽선. "2026" 및 병원 정보 작은 갈색 텍스트.

=== BACKGROUND ===
따뜻한 크림-복숭아 그라디언트(#fff7ed → #fed7aa). 수채화 텍스처 15% 불투명도. 상단 절반에 따뜻한 흰색 보케 원형 10% 불투명도. 포근하고 가정적인 설날 식사 초대 느낌.`,
    },
    {
      id: 'grt_seol_modern', name: '모던 세뱃돈', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세뱃돈 봉투 중심 울트라클린 타이포그래피 인사장',
      layoutHint: 'minimal',
      aiPrompt: `[설날 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 타이포 30% → 푸터 15%
• 인디고+골드 2색 제한 팔레트
• 최대 여백(negative space) 원칙 — 장식 최소화
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 세뱃돈 봉투 기울기(0~10°) 자유
• 봉투 위 문양(격자문/빗살문 등) 선택 자유
• 추상 원형 장식 크기·위치 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): 병원명 — 작은 인디고(#4f46e5) 텍스트, 좌측 정렬 10% 좌여백. 아래 가는 인디고(#6366f1) 가로선 80% 폭 중앙 정렬.

ZONE 2 — 메인 비주얼 (middle 40%): 중앙에 단일 세뱃돈 봉투(세뱃돈 봉투) — 깨끗한 흰색 바탕에 인디고(#6366f1) 미니멀 선화. 봉투 상단에 골드(#d4a017) 봉인. 봉투 중앙에 골드 "복" 자. 봉투 5° 기울임. 뒤에 가는 골드 원 외곽선 하나. 그 외 요소 없음 — 극대화된 여백.

ZONE 3 — 타이포·휴진 안내 (next 30%): "새해 복 많이 받으세요" — 큰 볼드 인디고(#4f46e5) 현대 산세리프 한글, 중앙, letter-spacing 0.05em. 2줄 인사말 중간 회색(#64748b). "2026 설날" 골드(#d4a017) 악센트. 가는 구분선 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #94a3b8, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 작은 인디고 치아 아이콘(기하학/미니멀), 중앙. 병원 연락처 작은 회색(#94a3b8). 헤더와 동일한 가는 인디고 라인.

=== BACKGROUND ===
깨끗한 오프화이트(#eef2ff). 매우 희미한 격자문(#6366f1 at 5%) 배경 텍스처. 스위스/미니멀리스트 타이포그래피. 프리미엄 의료 브랜드 명절 카드.`,
    },
    {
      id: 'grt_seol_bokjumeoni', name: '복주머니', color: '#e11d48', accent: '#be123c', bg: '#fff1f2',
      desc: '복주머니·금동전 캐릭터 중심 귀여운 설날 카드',
      layoutHint: 'cute',
      aiPrompt: `[설날 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 인사말 25% → 푸터 15%
• 핑크-빨강-골드 파스텔 팔레트
• 치아 캐릭터(한복 착용) 반드시 포함
• 인사말 텍스트 반드시 포함: "복 많이 받으세요!"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 복주머니 색상·자수 문양 변형 가능
• 금동전 개수(5~10개)·배치 자유
• 캐릭터 표정·포즈 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): "복 많이 받으세요!" — 큰 볼드 로즈레드(#e11d48) 둥근 한글 폰트, 핑크 텍스트 쉐도우. 좌우에 작은 골드 악센트 마크. 병원명 작은 딥로즈(#be123c).

ZONE 2 — 메인 일러스트 (middle 45%): 복주머니 3개 가로 배열 — 좌(빨강 #dc2626, 금 졸라매), 중앙(가장 크게 1.3배, 핫핑크 #e11d48, 전통 꽃자수), 우(코랄 #fb7185, 금 졸라매). 각 복주머니에 금색 "복" 자수. 위로 금동전(사각 구멍 있는 동전) 5~7개 떠다님. 복주머니 사이에 치아 캐릭터 — 흰 둥근 사각형, 점눈, 미소, 분홍 볼, 핑크·노랑 한복 저고리 착용.

ZONE 3 — 인사말·휴진 안내 (next 25%): 핑크 테두리(#fda4af, 2px) 알약형 카드, 흰색 채움, border-radius 24px. 안: ① 밝은 새해 인사 (딥로즈 #9f1239, 둥근 서체) ② "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기) ③ 작은 ☘ 아이콘 불릿.

ZONE 4 — 푸터 (bottom 15%): 골드 외곽선 작은 행운 아이콘 가로 배열(말굽, 클로버, 동전). "2026" 핑크(#e11d48). 병원 정보 로즈(#be123c).

=== BACKGROUND ===
부드러운 로즈핑크 그라디언트(#fff1f2 → #fce7f3). 골드·빨강·핑크 작은 기하 도트 20% 불투명도. 중앙 따뜻한 방사 글로우(흰색 15%). 밝고 활기찬 가족 친화적 설날 카드.`,
    },
    {
      id: 'grt_seol_gold_luxury', name: '금박 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '버건디·금박 봉황 문양 프리미엄 설날 인사장',
      layoutHint: 'luxury',
      aiPrompt: `[설날 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 12% → 중앙 40% → 인사말 28% → 푸터 20%
• 버건디+골드 2색 한정 팔레트 — 다른 색상 절대 금지
• 금박(gold foil) 메탈릭 질감 전체 적용
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 보상화문/연꽃문/당초문 등 전통 문양 선택 자유
• 봉황 실루엣 크기·자세 자유
• 소나무 가지 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 상단 악센트 (top 12%): 금박 소나무(松) 가지 일러스트 — 60% 폭 중앙, 정밀한 솔잎 디테일(#d4a017), 금 시머 효과. 가지 끝에 작은 골드 도트.

ZONE 2 — 메인 센터피스 (middle 40%): 큰 원형 금 프레임(3px #d4a017 선, 반지름 ~30%). 원 안에 "복" — 초대형 금 캘리그래피(#fbbf24 → #d4a017 그라디언트), 붓터치 스타일. 원 둘레에 보상화문/연꽃문 금박 40% 불투명도 만다라형 링. 대각선 위치에 전통 모서리 장식 4개.

ZONE 3 — 인사말·휴진 안내 (next 28%): "새해 복 많이 받으세요" — 우아한 금색(#fbbf24) 세리프/캘리그래피 한글, 중앙, 넓은 자간. 금 디바이더 선(60% 폭). 2줄 인사말 부드러운 금(#d4a017 70%). 병원명 밝은 금. 구분선 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금색 #d4a017 50%, 작은 크기).

ZONE 4 — 푸터 (bottom 20%): 금박 엠보싱 효과 — 대칭 봉황(鳳凰) 실루엣 2마리(골드 25% 불투명도)가 방패형 치아 엠블럼 좌우 배치. "2026" 작은 골드 텍스트.

=== BACKGROUND ===
진한 버건디(#7f1d1d) 전면. 고급 리넨 텍스처 8% 불투명도. 금 이중선 장식 테두리 4% 안쪽, 모서리에 다이아몬드. 울트라 프리미엄 VIP 설날 카드.`,
    },
    {
      id: 'grt_seol_sunrise', name: '새해 일출', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '산 능선 위 해돋이·한옥 마을 수채화 풍경 인사장',
      layoutHint: 'nature',
      aiPrompt: `[설날 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 20% → 중앙 35% → 인사말 30% → 푸터 15%
• 새벽-일출 그라디언트 하늘 (네이비 → 앰버 → 골드)
• 3겹 산 능선 실루엣 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 한옥 마을 가옥 수(3~5채) 자유
• 산 능선 색조·곡선 자유
• 별·초승달 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 상단 하늘 (top 20%): 딥네이비-인디고(#1e3a5f → #312e81)에서 따뜻한 톤으로 전환. 흰 별 30% 불투명도 흩어짐. 우상단에 초승달 외곽선(연금 #fde68a, 15% 불투명도).

ZONE 2 — 일출·산 (middle 35%): 산 능선 뒤에서 떠오르는 태양 원반 — 빛나는 그라디언트 원(#fbbf24 → #f59e0b), 부드러운 금빛 광선 20% 불투명도 방사. 산 실루엣 3겹: 먼 산(먼지 보라 #6b5b73), 중간 산(따뜻한 갈색 #92400e 60%), 가까운 산(진한 앰버 #78350f). 산 사이 한옥(韓屋) 3~4채 — 곡선 기와 지붕, 굴뚝 연기.

ZONE 3 — 인사말·휴진 안내 (next 30%): 황금빛 일출 글로우 영역. "새해 복 많이 받으세요" — 큰 볼드 진한 갈색(#78350f) 우아한 한글, 골드 텍스트 쉐도우. 가는 금 디바이더(#d97706, 50% 폭). 2~3줄 인사 중간 갈색(#92400e). 병원명 앰버(#d97706). 구분선 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (갈색 #78350f 60%, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 하단 가장자리 소나무 실루엣(진한 앰버 #92400e 40%). 중앙 치아 아이콘(떠오르는 해 형태) 골드(#d97706) 외곽선. "2026" 따뜻한 금 텍스트.

=== BACKGROUND ===
새벽 하늘 그라디언트 — 딥네이비(#1e3a5f) → 앰버(#f59e0b) → 복숭아(#fbbf24) → 연금(#fffbeb). 한국 산 일출 수채화 풍경 — 새로운 시작의 평화로움.`,
    },
  ],

  // ─── 명절 인사: 추석 (6개) ───
  greeting_추석: [
    {
      id: 'grt_chsk_fullmoon', name: '보름달 전통', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '보름달·벼이삭·감 격식 있는 한가위 전통 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[추석 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 35% → 중앙 25% → 인사말 25% → 푸터 15%
• 네이비+골드 팔레트: #1a1a2e, #d4a017, #fbbf24
• 보름달(滿月) 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 달토끼 실루엣 투명도·크기 자유
• 벼이삭·감·밤 배치 구성 자유
• 팔각문/사각문 등 전통 문양 선택 자유

=== ZONE 구성 ===
ZONE 1 — 보름달 (top 35%): 중앙에 거대한 보름달 — 연금(#fde68a) → 따뜻한 흰색 그라디언트 원, 앰버(#f59e0b 30%) 외곽 글로우. 달 안에 달토끼(절구 찧는 모습) 실루엣 15% 불투명도. 달 가장자리에 따뜻한 금빛 구름 띠(#d4a017 15%).

ZONE 2 — 풍요 프레임 (middle 25%): 좌우 대칭 — 금색 벼이삭(#d4a017) 곡선으로 안쪽 향함. 중앙에 감(#ea580c) 2~3개 + 밤(#92400e) 2개. 빨강·금 매듭 장식 악센트.

ZONE 3 — 인사말·휴진 안내 (next 25%): "풍성한 한가위 보내세요" — 큰 볼드 금색(#fbbf24) 캘리그래피 한글, 중앙. 금 다이아몬드 장식 디바이더. 2~3줄 추석 인사 부드러운 금(#d4a017 80%). 병원명 밝은 금. 「 」스타일 금 괄호 프레임. 아래에 "휴진 안내: OO월 OO일 ~ OO월 OO일" (금 50%, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 금색 구름문(#d4a017 20%) 하단 흐름. 치아 아이콘(보름달 모티프) 금 외곽선. "2026 추석" 우아한 금 텍스트.

=== BACKGROUND ===
딥 네이비(#1a1a2e) → 다크 앰버(#451a03) 그라디언트. 팔각문 5% 불투명도 골드 오버레이. 가을밤 하늘 분위기 — 장엄하고 격조 있는 한가위.`,
    },
    {
      id: 'grt_chsk_songpyeon', name: '송편 일러스트', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '손그림 송편·과일 수채화풍 따뜻한 추석 인사장',
      layoutHint: 'warm',
      aiPrompt: `[추석 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 18% → 중앙 45% → 인사말 22% → 푸터 15%
• 수채화/손그림 일러스트 스타일 유지
• 송편 일러스트 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "건강한 한가위 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 송편 색상·개수(8~12개) 자유
• 과일 종류(배, 감, 대추, 밤) 구성 자유
• 소반/접시 디자인 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 18%): "즐거운 추석 보내세요" — 큰 볼드 진녹(#15803d) 손글씨풍. 좌우 솔가지(#22c55e) 일러스트. 병원명 짙은 녹색(#166534). 점선 녹색 구분선.

ZONE 2 — 메인 일러스트 (middle 45%): 둥근 나무 소반 위 솔잎 깔고 송편 8~10개 — 흰색, 연분홍(#fda4af), 연녹(#86efac), 연노랑(#fde68a) 반달형. 한 개는 깨/팥 소 단면. 주변에 배(좌), 감(#ea580c 우), 대추·밤. 갓 찐 송편 수증기. 수채화 번짐 효과.

ZONE 3 — 인사말·휴진 안내 (next 22%): 연녹 테두리(#86efac, 1.5px) 라운드 카드, 흰색 92%, border-radius 14px. 안: ① 추석 인사 (진녹 #14532d, line-height 1.7) ② "건강한 한가위 되세요" 볼드 녹색(#15803d) ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기). 송편 아이콘 불릿.

ZONE 4 — 푸터 (bottom 15%): 작은 치아 캐릭터(앞치마, 송편 들고 있는 포즈) 녹색(#15803d) 선 드로잉. "2026" 및 병원 정보 진녹 텍스트.

=== BACKGROUND ===
세이지그린-크림 그라디언트(#f0fdf4 → #fefce8). 수채화 워시 12% 불투명도. 솔잎 패턴 5% 대각선. 포근한 가족 모임 초대 느낌.`,
    },
    {
      id: 'grt_chsk_modern', name: '모던 한가위', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '기하학적 보름달·토끼 울트라클린 추석 카드',
      layoutHint: 'minimal',
      aiPrompt: `[추석 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 타이포 30% → 푸터 15%
• 인디고+실버그레이 2색 한정 — 따뜻한 색 절대 금지
• 최대 여백 원칙
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 토끼 실루엣 포즈(앉기/서기) 자유
• 단풍잎 위치·크기 자유
• 원(보름달) 선 두께(1~3px) 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): 병원명 인디고(#4f46e5) 산세리프, 좌측 10%. 인디고(#6366f1) 가로선 80% 폭. "추석" 라벨 우측 정렬 작은 인디고.

ZONE 2 — 메인 비주얼 (middle 40%): 큰 원(보름달) — 인디고(#6366f1, 2px) 외곽선만, 채움 없음. 원 안 하단 1/3에 토끼 실루엣(#4f46e5) 미니멀 기하학. 토끼 아래 절구 선화. 원 바깥 우하에 단풍잎 하나(#a5b4fc 40%). 극대화된 여백.

ZONE 3 — 타이포·휴진 안내 (next 30%): "풍성한 한가위 보내세요" — 큰 볼드 인디고(#4f46e5) 산세리프, letter-spacing 0.05em. 2줄 인사말 회색(#64748b). "2026 추석" 실버(#a5b4fc). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #94a3b8, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 기하학 치아 아이콘 인디고 외곽선, 중앙. 병원 연락처 회색(#94a3b8). 인디고 가로선.

=== BACKGROUND ===
깨끗한 오프화이트(#eef2ff). 희미한 기하 그리드(#6366f1 4%). 스위스 미니멀리즘 — 세련되고 지적인 의료 브랜드 추석 카드.`,
    },
    {
      id: 'grt_chsk_rabbit', name: '토끼 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '달토끼·치아 캐릭터 떡 찧기 귀여운 추석 카드',
      layoutHint: 'cute',
      aiPrompt: `[추석 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 인사말 25% → 푸터 15%
• 핑크-라벤더-골드 파스텔 팔레트
• 달토끼 캐릭터 + 치아 캐릭터 반드시 포함
• 인사말 텍스트 반드시 포함: "즐거운 한가위!"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 토끼 의상(한복 색상) 변형 가능
• 떠다니는 낙엽 수·색상 자유
• 캐릭터 표정·포즈 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): "즐거운 한가위!" — 큰 볼드 핫핑크(#ec4899) 둥근 한글, 핑크 텍스트 쉐도우. 좌우 금색 초승달·별. 병원명 딥핑크(#be185d).

ZONE 2 — 메인 일러스트 (middle 45%): 연노랑(#fef3c7) 보름달 원 배경 중앙. 달 위에 달토끼 캐릭터 — 큰 눈, 핑크 귀속(#f9a8d4), 분홍 볼(#fda4af), 파스텔 핑크 한복 저고리 착용, 떡메로 떡 찧는 모습. 떡 조각 위로 튕김. 옆에 치아 캐릭터(흰 둥근 사각형, 점눈, 큰 미소, 핑크 리본) — 라벤더 한복 치마, 부채 들고 있음. 주변에 단풍잎(빨강 #ef4444), 은행잎(노랑 #fbbf24), 파스텔 송편 떠다님.

ZONE 3 — 인사말·휴진 안내 (next 25%): 핑크 테두리(#f9a8d4, 2px) 알약형 카드, 흰색 95%, border-radius 24px. 안: ① 추석 인사 (딥핑크 #9f1239, 둥근 서체) ② "달토끼와 함께 행복한 추석!" 볼드 핑크(#ec4899) ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c). ☽ 아이콘 불릿.

ZONE 4 — 푸터 (bottom 15%): 작은 캐릭터 아이콘 가로 반복(토끼, 달, 송편, 단풍잎, 치아) 핑크(#ec4899) 외곽선. "2026 추석" 핑크 텍스트. 병원 정보 로즈(#be185d).

=== BACKGROUND ===
핑크-라벤더 그라디언트(#fdf2f8 → #f3e8ff). 금·핑크 작은 별 20% 불투명도. 상단 따뜻한 핑크 글로우(#fda4af 10%). 가족 친화적 소아/가족 치과 추석 카드.`,
    },
    {
      id: 'grt_chsk_premium', name: '달빛 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '네이비·금박 보름달 감나무 프리미엄 추석 인사장',
      layoutHint: 'luxury',
      aiPrompt: `[추석 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 12% → 중앙 40% → 인사말 28% → 푸터 20%
• 네이비+골드 2색 한정 — 다른 색상 절대 금지
• 금박 메탈릭 질감 전체 적용
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 감나무 가지 각도·감 개수 자유
• 제수용 과일 구성 자유
• 봉황 실루엣 크기·자세 자유

=== ZONE 구성 ===
ZONE 1 — 상단 악센트 (top 12%): 좌우 대칭 금박 벼이삭(#d4a017) — 좌우에서 중앙으로 곡선. 이삭 끝 금 도트. 중앙 상단에 달 떠오르는 은은한 금빛 글로우.

ZONE 2 — 달빛 센터피스 (middle 40%): 거대한 보름달 — 금 그라디언트(#fbbf24 → #d4a017), 사실적 달 표면 텍스처, 금 할로 효과(#f59e0b 25%). 달 안에 토끼 실루엣(깊은 금 12%). 좌우에 금박 감나무 가지 — 양쪽 감 2개씩(#b8860b). 달 아래 제수 과일(배, 사과, 밤) 금 실루엣.

ZONE 3 — 인사말·휴진 안내 (next 28%): "풍성한 한가위 보내세요" — 큰 우아한 금(#fbbf24) 캘리그래피. 연꽃 모티프 금 디바이더. 2줄 인사말 부드러운 금(#d4a017 70%). 병원명 밝은 금. 「 」금 괄호 프레임. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #d4a017 50%, 작은 크기).

ZONE 4 — 푸터 (bottom 20%): 금박 봉황 2마리 대칭(20% 불투명도) + 방패형 치아 엠블럼(초승달 디테일, #d4a017). "2026 추석" 금 텍스트. 파도문 10% 하단.

=== BACKGROUND ===
미드나잇 네이비(#1a1a2e) 전면. 실크 텍스처 6% 불투명도. 금 이중선 장식 테두리 4% 안쪽, 모서리 한국 전통 장식. VIP 프리미엄 추석 카드.`,
    },
    {
      id: 'grt_chsk_autumn', name: '가을 풍경', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '단풍·황금 들판·초가집 수채화 가을 풍경 인사장',
      layoutHint: 'nature',
      aiPrompt: `[추석 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 25% → 중앙 35% → 인사말 25% → 푸터 15%
• 가을 석양 그라디언트 (복숭아 → 앰버 → 번트오렌지)
• 한국 가을 시골 풍경 필수
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 기러기 V자 편대 수(3~7마리) 자유
• 초가집/감나무 배치 자유
• 단풍나무 색조 비율 자유

=== ZONE 구성 ===
ZONE 1 — 하늘·보름달 (top 25%): 복숭아-앰버 석양 하늘. 우상에 보름달(연크림 #fef3c7, 글로우 20%). 기러기 V자 편대(3~5마리) 갈색(#92400e 30%) 실루엣.

ZONE 2 — 가을 풍경 (middle 35%): 수채화 한국 가을 시골 파노라마 — 빨강(#dc2626)·번트오렌지(#ea580c)·금노랑(#f59e0b) 단풍나무 언덕. 황금 들판 사이 오솔길. 중경에 초가집(볏짚 지붕, 굴뚝 연기). 감나무(밝은 주황 감). 전경 좌우에 클로즈업 단풍 가지 프레이밍. 수채화 번짐 효과.

ZONE 3 — 인사말·휴진 안내 (next 25%): 반투명 따뜻한 흰색 카드(88%, border-radius 14px), 번트오렌지 테두리(#fb923c, 1px). 안: ① "풍성한 한가위 보내세요" 큰 볼드 진갈(#78350f) ② 2~3줄 인사 중갈(#92400e) ③ "건강하고 행복한 추석 되세요" 번트오렌지(#ea580c) 볼드 ④ "휴진 안내: OO월 OO일 ~ OO월 OO일" (갈색 #92400e 60%, 작은 크기). 단풍잎 아이콘 악센트.

ZONE 4 — 푸터 (bottom 15%): 낙엽(단풍·은행) 수채화 40% 불투명도 하단 가장자리. 치아 아이콘(단풍잎 악센트, #ea580c 외곽선). "2026 추석" 갈색(#92400e) 텍스트.

=== BACKGROUND ===
가을 석양 그라디언트 — 연복숭아(#fff7ed) → 앰버(#fed7aa) → 번트오렌지(#ea580c 20%). 수채화 워시 15% 불투명도. 한국 가을 시골 풍경 — 풍요와 향수.`,
    },
  ],

  // ─── 명절 인사: 새해 (6개) ───
  greeting_새해: [
    {
      id: 'grt_newy_fireworks', name: '불꽃놀이', color: '#7c3aed', accent: '#6d28d9', bg: '#f5f3ff',
      desc: '밤하늘 불꽃·도시 스카이라인 화려한 새해 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[새해(양력 1/1) — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 40% → 중앙 20% → 인사말 15% → 푸터 10% (나머지 여유)
• 퍼플-골드-네이비 팔레트: #7c3aed, #FFD700, #0f0a2e
• "2026" 연도 표시 필수 (큰 타이포)
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 불꽃 폭발 개수(3~7개)·색상 배합 자유
• 도시 스카이라인 실루엣 유무 자유
• 별 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 불꽃 (top 40%): 3~5개 큰 불꽃 폭발 — 금(#FFD700), 퍼플(#7c3aed), 일렉트릭블루(#3b82f6). 방사 얇은 선 + 빛나는 파티클 트레일. 폭발 중심 블룸/글로우 효과. 희미한 연기 흔적.

ZONE 2 — 연도 표시 (center, 20%): "2026" — 초대형 볼드(48px, weight 900) 따뜻한 금(#FFD700), 글로우(#fbbf24 40%, 8px blur). 주변에 작은 금 기하 악센트(사각·원) 30~60% 불투명도.

ZONE 3 — 인사말·휴진 안내 (next 15%): "새해 복 많이 받으세요" — 흰색(24px, weight 700), 금빛 텍스트 쉐도우. 병원명 금(#FFD700, 14px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (흰 60%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 10%): 희미한 도시 스카이라인 실루엣(다크 네이비 #1a1a4e, 20%). 가는 금 그라디언트 선(1px). 위로 사라지는 작은 금 파티클.

=== BACKGROUND ===
딥 미드나잇 네이비(#0f0a2e) → 다크 퍼플(#1a0533) 그라디언트. 작은 별 15% 불투명도. 화려하고 축제적인 자정 파티 분위기.`,
    },
    {
      id: 'grt_newy_champagne', name: '샴페인 토스트', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '블랙·골드 샴페인 건배 럭셔리 새해 카드',
      layoutHint: 'luxury',
      aiPrompt: `[새해(양력 1/1) — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 45% → 중앙 15% → 인사말 20% → 푸터 8% (나머지 여유)
• 블랙+골드 2색 한정
• 샴페인 글라스 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 샴페인 거품 개수·크기 자유
• 컨페티/리본 밀도 자유
• 글라스 각도 자유

=== ZONE 구성 ===
ZONE 1 — 샴페인 글라스 (top 45%): 두 개의 우아한 샴페인 플루트 중앙에서 건배 — 금(#d4a017) 라인아트, 메탈릭 광택. 금 거품(4~8px 원) 위로 올라감(20~80% 불투명도). 건배 지점에 스플래시 + 방사 금 방울.

ZONE 2 — 셀러브레이션 악센트 (middle 15%): 얇은 금(#FFD700) 컨페티 조각 + 작은 별 — 30~60% 불투명도, 랜덤 회전. 좌우에서 곡선 금 리본 스트리머.

ZONE 3 — 인사말·휴진 안내 (next 20%): "Happy New Year" 우아한 세리프(16px, gold #d4a017, letter-spacing 3px). "새해 복 많이 받으세요" 흰색(22px, weight 700). 병원명 금(#b8860b, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #d4a017 50%, 작은 크기).

ZONE 4 — 하단 테두리 (bottom 8%): 장식적 금 이중선 테두리. 중앙 하단 작은 금 리본.

=== BACKGROUND ===
딥 블랙(#0a0a0a) → 차콜(#1a1a1a) 그라디언트. 대각선 금 시머 줄 5% 불투명도. 블랙타이 갈라 미학 — 고급스럽고 세련된 축하.`,
    },
    {
      id: 'grt_newy_minimal', name: '미니멀 2026', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '"2026" 대형 타이포 중심 울트라미니멀 새해 카드',
      layoutHint: 'minimal',
      aiPrompt: `[새해(양력 1/1) — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 20% → 중앙 35% → 인사말 20% → 하단 15% (나머지 여유)
• 네이비+골드+화이트 3색 한정
• "2026" 초대형 타이포 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 숫자 서체 선택 자유
• 드롭 쉐도우 유무 자유
• 가로선 위치·길이 자유

=== ZONE 구성 ===
ZONE 1 — 상단 여백 (top 20%): 빈 흰 공간. 가는 네이비(#1e40af 8%) 가로선, 60% 폭, 중앙.

ZONE 2 — 연도 타이포 (center, 35%): "2026" — 울트라볼드 산세리프(72px, weight 900, 네이비 #1e40af). 타이트 letter-spacing(-2px). 미묘한 드롭 쉐도우. 수평 중앙 지배적 존재감.

ZONE 3 — 인사말·휴진 안내 (next 20%): "새해 복 많이 받으세요" 네이비(#1e3a8a, 18px, weight 500). 가는 금(#d4a017) 가로선 40px, 1px. 병원명 연네이비(#93c5fd, 12px, letter-spacing 3px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연네이비 #93c5fd 60%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 빈 흰 공간. 여백의 미.

=== BACKGROUND ===
순수 화이트(#ffffff). 텍스처·그라디언트 없음. 울트라 미니멀리스트, 타이포그래피 중심 그래픽 디자인. 스칸디나비안 감성.`,
    },
    {
      id: 'grt_newy_confetti', name: '컨페티 파티', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '파스텔 컨페티·파티모자 캐릭터 귀여운 새해 카드',
      layoutHint: 'cute',
      aiPrompt: `[새해(양력 1/1) — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 35% → 중앙 25% → 캐릭터 20% → 하단 15% (나머지 여유)
• 파스텔 멀티컬러 팔레트 (핑크, 골드, 스카이블루, 민트, 라벤더)
• 파티 캐릭터 반드시 포함
• 인사말 텍스트 반드시 포함: "2026 새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 기하 도형 종류·크기·밀도 자유
• 풍선 개수·색상 자유
• 캐릭터 소품(뿔나팔/깃발/폭죽) 자유

=== ZONE 구성 ===
ZONE 1 — 기하 악센트 (top 35%): 컬러풀 기하 도형 흩뿌림 — 원, 둥근 사각, 삼각형. 핑크(#ec4899), 골드(#fbbf24), 스카이블루(#38bdf8), 민트(#34d399), 라벤더(#a78bfa). 4~12px, 랜덤 회전, 40~90% 불투명도. 상단 모서리 근처 파티모자 2개(핑크+금줄).

ZONE 2 — 인사 배너 (center, 25%): 핑크(#ec4899 90%) 라운드 사각 배너. 흰색 볼드 "2026 새해 복 많이 받으세요"(22px, weight 800). 양옆 별 장식. 배너 아래 풍선 2개(핑크·골드) 곱슬 줄.

ZONE 3 — 캐릭터·휴진 안내 (next 20%): 3개 작은 축하 캐릭터(둥근 얼굴, 파티모자, 분홍 볼, 행복 표정) 가로 배열, 각자 뿔나팔/깃발 들고. 파스텔. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (핑크 #be185d 50%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 병원명 핑크(#be185d, 13px). 작은 기하 도형 20% 불투명도 이어짐.

=== BACKGROUND ===
소프트 핑크(#fdf2f8) → 화이트 그라디언트. 즐겁고 활기찬 가족 친화적 파티 무드.`,
    },
    {
      id: 'grt_newy_sunrise', name: '첫 일출', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '바다 위 첫 일출·2026 수채화 풍경 새해 인사장',
      layoutHint: 'nature',
      aiPrompt: `[새해(양력 1/1) — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 45% → 중앙 20% → 인사말 20% → 하단 10% (나머지 여유)
• 인디고 → 오렌지 → 골드 → 복숭아 하늘 그라디언트
• 바다/해안 일출 풍경 필수
• "2026" 연도 표시 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 구름 형태·밀도 자유
• 잔별 밀도 자유
• 바다 색조 자유

=== ZONE 구성 ===
ZONE 1 — 하늘·구름 (top 45%): 수채화 스타일 드라마틱 구름 — 아래에서 금오렌지 빛. 구름 가장자리 골드(#fbbf24) 하이라이트. 밤 인디고 → 새벽 오렌지 전환. 좌상단에 사라지는 별 2~3개(15%).

ZONE 2 — 일출 수평선 (middle, 20%): 바다 수평선에서 반원 태양 떠오름 — 따뜻한 광선(얇은 선, 금 #FFD700, 10~30%) 부채꼴. 바다 표면 금빛 반사, 오렌지(#ea580c 20%) 잔물결. "2026" 구름/광선 속에 은은하게 형성(30%, 36px).

ZONE 3 — 인사말·휴진 안내 (next 20%): "새해 복 많이 받으세요" 따뜻한 갈색(#92400e, 22px, weight 700), 은은한 글로우. 병원명 오렌지(#ea580c, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (갈색 #92400e 50%, 작은 크기).

ZONE 4 — 하단 바다 (bottom 10%): 잔잔한 바다 수면 뮤트 틸(#0d9488 30%), 수채화 워시.

=== BACKGROUND ===
그라디언트 하늘 — 딥 인디고(#312e81) → 오렌지(#f97316) → 골드(#fbbf24) → 복숭아(#fed7aa). 장엄하고 희망적인 새 시작의 풍경.`,
    },
    {
      id: 'grt_newy_clock', name: '자정 시계', color: '#64748b', accent: '#475569', bg: '#f8fafc',
      desc: '빈티지 회중시계 자정 카운트다운 따뜻한 새해 카드',
      layoutHint: 'warm',
      aiPrompt: `[새해(양력 1/1) — 따뜻한/빈티지]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 10% → 중앙 50% → 인사말 20% → 하단 8% (나머지 여유)
• 슬레이트+골드+세피아 팔레트
• 12시 가리키는 시계 메인 비주얼 필수
• "2026" 연도 표시 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 시계 장식 디테일(톱니바퀴 등) 자유
• 로마/아라비아 숫자 선택 자유
• 세피아 워시 강도 자유

=== ZONE 구성 ===
ZONE 1 — 장식 상단 (top 10%): 가는 장식선 슬레이트(#64748b 15%). 작은 톱니바퀴 아이콘 중앙(16px, 슬레이트 30%).

ZONE 2 — 시계 페이스 (center, 50%): 큰 빈티지 회중시계 — 금(#d4a017) 이중원 테두리, 로마숫자(XII 상단, 슬레이트 #475569). 금(#b8860b) 장식 시·분침 12시 가리킴. 세밀한 눈금. 6시 위치 서브다이얼에 톱니바퀴 디테일(슬레이트 20%). 전체 세피아 톤 워시(#92400e 5%).

ZONE 3 — 인사말·휴진 안내 (next 20%): "새해 복 많이 받으세요" 슬레이트(#475569, 20px, weight 700). "2026" 금(#d4a017, 14px, weight 600, letter-spacing 4px). 병원명 연슬레이트(#94a3b8, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (슬레이트 #94a3b8 50%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 8%): 상단과 대칭 장식선. 좌우 작은 스크롤워크 장식.

=== BACKGROUND ===
따뜻한 오프화이트(#f8fafc), 빈티지 종이 텍스처 5% 불투명도. 우아하고 빈티지한 자정의 순간 — 따뜻함과 클래식.`,
    },
  ],

  // ─── 명절 인사: 어버이날 (6개) ───
  greeting_어버이날: [
    {
      id: 'grt_parent_carnation', name: '카네이션 전통', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '빨간 카네이션 테두리 격식 있는 어버이날 감사 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[어버이날 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 10% → 메인 40% → 인사말 25% → 하단 10% (나머지 여유)
• 레드+크림 팔레트: #dc2626, #991b1b, #fef2f2
• 카네이션 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보 (어버이날은 5/8이므로 연휴 휴진 있을 수 있음)

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 카네이션 꽃잎 디테일 수준 자유
• 리본 색상·형태 자유
• 테두리 꽃봉오리 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 꽃 테두리 (outer border, 10% inset): 빨간(#dc2626) 카네이션 꽃잎 테두리 — 사면 가장자리에 작은 꽃봉오리·녹색 잎 수채화 스타일(60~80% 불투명도). 모서리에 2~3송이 풀블룸 클러스터.

ZONE 2 — 메인 카네이션 (center-top, 40%): 큰 사실적 빨간 카네이션(#dc2626) 중심 — 겹겹이 쌓인 꽃잎 텍스처, 가장자리에 연핑크(#fca5a5) 하이라이트. 진녹(#166534) 줄기 + 잎 2개. 줄기 아래 녹색 새틴 리본 매듭. 꽃 아래 부드러운 그림자(4px blur, 10%).

ZONE 3 — 인사말·휴진 안내 (center-lower, 25%): "감사합니다" — 우아한 붓글씨체(28px, weight 700, 딥레드 #991b1b). "어버이날을 축하합니다" 따뜻한 회색(#78716c, 14px). 병원명 레드(#b91c1c, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c 60%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 10%): 흩어지는 작은 카네이션 꽃잎(5~7개, 회전, 20~40% 불투명도). 가는 레드(#dc2626) 선 10%.

=== BACKGROUND ===
따뜻한 크림(#fef2f2) → 소프트 화이트 그라디언트. 전통적이고 진심 어린 한국식 감사 미학.`,
    },
    {
      id: 'grt_parent_watercolor', name: '수채화 꽃다발', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8',
      desc: '루즈한 수채화 카네이션 꽃다발 감성 인사장',
      layoutHint: 'warm',
      aiPrompt: `[어버이날 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 50% → 좌우 10% → 인사말 25% → 하단 10% (나머지 여유)
• 수채화 페인팅 스타일 — 하드 아웃라인 없음
• 카네이션 꽃다발 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 카네이션 색상 배합(핑크/레드/코랄) 자유
• 수채화 번짐·드립 정도 자유
• 잎사귀 톤(녹색/민트) 자유

=== ZONE 구성 ===
ZONE 1 — 수채화 꽃다발 (top-center, 50%): 자유롭고 표현적인 수채화 카네이션 꽃다발 — 5~7송이 다양한 핑크(#f472b6, #ec4899, #fda4af)와 레드(#ef4444). 보이는 붓자국, 꽃잎 만나는 곳 색 번짐. 녹색(#86efac) 줄기·잎 웻온웻 효과. 꽃다발 하단 물감 드립·스플래시(핑크 15%). 모든 요소 부드럽고 회화적.

ZONE 2 — 예술적 스플래시 (sides, 10%씩): 좌우 여백에 추상 수채화 도트·스플래시(핑크+민트그린) 15~25% 불투명도.

ZONE 3 — 인사말·휴진 안내 (center-lower, 25%): "감사합니다" — 손글씨 붓스크립트(26px, weight 600, 따뜻한 핑크 #ec4899), 자연스러운 획 두께 변화. "사랑하는 부모님께" 소프트 회색(#9ca3af, 13px, 손글씨). 병원명 핑크(#f472b6, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #9ca3af 50%, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 희미한 블러시 핑크(#fce7f3) 수채화 워시 줄무늬 20% 불투명도.

=== BACKGROUND ===
소프트 핑크 워시(#fdf2f8), 수채화 종이 텍스처(미세 결, 8%). 회화적 아름다움으로 표현하는 가족 사랑.`,
    },
    {
      id: 'grt_parent_modern', name: '모던 감사', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '카네이션 선화 울트라클린 미니멀 감사 카드',
      layoutHint: 'minimal',
      aiPrompt: `[어버이날 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 20% → 중앙 35% → 타이포 25% → 하단 15% (나머지 여유)
• 인디고+화이트 2색 한정
• 최대 여백 원칙
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 카네이션 선화 디테일 수준 자유
• 하트 외곽선 유무·위치 자유
• 선 두께(1~2px) 자유

=== ZONE 구성 ===
ZONE 1 — 상단 여백 (top 20%): 순수 흰 공간. 인디고(#6366f1 6%) 가로선 50% 폭, 중앙.

ZONE 2 — 카네이션 선화 (center, 35%): 단일 우아한 카네이션 — 인디고(#6366f1) 세밀한 선화(1.5px), 미니멀 디테일, 건축 도면 스타일. 기하학적 꽃잎 형태. 곧은 줄기 + 잎 2개. 외곽선만 — 채움 없음. 꽃 우상에 작은 하트 외곽선(인디고 15%).

ZONE 3 — 타이포·휴진 안내 (next 25%): "감사합니다" — 현대 산세리프(28px, weight 700, 인디고 #4f46e5), letter-spacing 1px. 가는 인디고 선 30px, 30% 불투명도. 병원명 연인디고(#a5b4fc, 12px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연인디고 #a5b4fc 50%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 작은 하트 외곽선 2개 인디고 8%, 중앙에서 약간 어긋남. 깨끗한 흰 공간.

=== BACKGROUND ===
화이트(#ffffff) → 매우 희미한 인디고(#eef2ff) 그라디언트. 선화의 세련됨 + 최대 여백. 절제된 의료 브랜드 우아함.`,
    },
    {
      id: 'grt_parent_photo', name: '포토 프레임', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '폴라로이드·카네이션 화환 스크랩북 귀여운 감사 카드',
      layoutHint: 'cute',
      aiPrompt: `[어버이날 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 좌우 15%씩 → 하단 15% (나머지 여유)
• 오렌지+크림+핑크 따뜻한 팔레트
• 폴라로이드 프레임 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "소중한 우리 가족"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 프레임 기울기(0~5°) 자유
• 스크랩북 스티커 종류·배치 자유
• 카네이션 화환 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 장식 상단 (top 15%): 오렌지(#f97316) 외곽선 스캘럽 에지 배너 — "Happy Parents Day" 손글씨(14px, weight 600). 좌우 하트 낙서(오렌지).

ZONE 2 — 포토 프레임 (center, 40%): 폴라로이드 스타일 흰 프레임(3° 기울임, 드롭쉐도우 4px 10%). 상단 하트 모양 클립(#ea580c). 프레임 안 복숭아(#fed7aa) → 오렌지(#fdba74) 그라디언트 플레이스홀더. 아래 "소중한 우리 가족" 손글씨(12px, 회색 #78716c). 프레임 위로 카네이션 화환 아치(핑크·레드 꽃봉오리 + 녹색 덩굴).

ZONE 3 — 스크랩북·휴진 안내 (sides, 15%씩): 하트 낙서, 별 스티커, 마스킹테이프(오렌지 줄무늬), "LOVE" 원형 스탬프 — 30~50% 불투명도. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (오렌지 #ea580c 50%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 병원명 오렌지(#ea580c, 13px). 손그림 화살표. 작은 카네이션 스티커.

=== BACKGROUND ===
따뜻한 크림(#fff7ed), 크래프트 종이 텍스처 6% 불투명도. 가족 앨범 스크랩북 감성 — 귀엽고 진심 어린.`,
    },
    {
      id: 'grt_parent_gold', name: '금장 카네이션', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '버건디·금박 카네이션 메탈릭 프리미엄 감사 카드',
      layoutHint: 'luxury',
      aiPrompt: `[어버이날 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 8% → 메인 40% → 인사말 25% → 하단 10% (나머지 여유)
• 버건디+골드 2색 한정
• 금박 카네이션 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 코너 플로리시 스타일 자유
• 카네이션 꽃잎 금박 광택 강도 자유
• 리본 형태 자유

=== ZONE 구성 ===
ZONE 1 — 금 프레임 (outer border, 8% inset): 장식적 금(#d4a017) 이중선 프레임 — 코너 스크롤워크 플로리시. 안쪽 선 1px, 바깥 선 2px, 4px 간격. 금 80% 불투명도, 메탈릭 광택.

ZONE 2 — 금 카네이션 (center-top, 40%): 메탈릭 금(#d4a017) 카네이션 일러스트, 밝은 금(#FFD700) 하이라이트. 포일 스탬핑 효과 — 꽃잎에 은은한 광택 그라디언트. 줄기·잎 다크 골드(#92400e). 줄기에 금 리본 매듭, 흐르는 리본 꼬리. 꽃 주변 금 글로우(8px blur, 15%).

ZONE 3 — 인사말·휴진 안내 (center-lower, 25%): "감사합니다" 금(#FFD700, 26px, weight 700, 세리프). 메탈릭 포일 텍스트. "어버이날을 축하합니다" 연금(#fde68a, 13px). 병원명 금(#d4a017, 13px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #fde68a 50%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 10%): 중앙 작은 금 리본 매듭 일러스트. 가는 금 선 20%.

=== BACKGROUND ===
딥 버건디(#450a0a) → 다크 와인(#7f1d1d) 그라디언트. 엠보싱 리넨 텍스처 5% 불투명도. 프리미엄 금박 우아함 — 고급 의료 브랜드.`,
    },
    {
      id: 'grt_parent_garden', name: '정원 풍경', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '아침 햇살 카네이션 정원 수채화 풍경 감사 카드',
      layoutHint: 'nature',
      aiPrompt: `[어버이날 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 25% → 중앙 40% → 인사말 20% → 하단 10% (나머지 여유)
• 녹색+따뜻한 자연색 팔레트
• 카네이션 정원 풍경 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 정원 벤치 유무 자유
• 오솔길 형태 자유
• 나비 실루엣 유무 자유

=== ZONE 구성 ===
ZONE 1 — 하늘·빛 (top 25%): 부드러운 파란 하늘 + 흰 구름 2~3개. 우상에서 대각선 아침 햇살(#fbbf24 10%) 부채꼴. 평화로운 아침 분위기.

ZONE 2 — 카네이션 정원 (center, 40%): 풍성한 정원 장면 — 빨강(#dc2626), 핑크(#f472b6), 흰 카네이션 밀집 열. 수채화 보태니컬 스타일. 높이·개화 정도 다양. 풍성한 녹색(#22c55e) 잎. 중앙에 따뜻한 돌색(#d6d3d1) 오솔길. 우측에 나무 정원 벤치(꽃에 둘러싸인).

ZONE 3 — 인사말·휴진 안내 (lower, 20%): "감사합니다" 진녹(#15803d, 24px, weight 700). "사랑과 감사를 담아" 따뜻한 녹색(#4ade80, 13px). 병원명 녹색(#22c55e, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (녹색 #22c55e 50%, 작은 크기).

ZONE 4 — 하단 정원 가장자리 (bottom 10%): 잔디 텍스처 녹색(#86efac 15%) 페이드아웃. 우하단에 나비 실루엣(녹색 20%).

=== BACKGROUND ===
소프트 모닝 스카이 블루(#f0fdf4) → 가든 그린(#dcfce7) 그라디언트. 금빛 워시 8% 불투명도. 평화로운 카네이션 정원의 아침 햇살.`,
    },
  ],

  // ─── 명절 인사: 크리스마스 (6개) ───
  greeting_크리스마스: [
    {
      id: 'grt_xmas_tree', name: '크리스마스 트리', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '오너먼트·가랜드 장식 트리 전통 크리스마스 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[크리스마스 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 50% → 인사말 20% → 하단 10% (나머지 여유)
• 녹색-빨강-골드 클래식 크리스마스 팔레트
• 크리스마스 트리 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 오너먼트 색상 조합 자유
• 트리 형태(뾰족/넓은) 자유
• 선물 상자 개수(2~5개) 자유

=== ZONE 구성 ===
ZONE 1 — 별 트리토퍼 (top 15%): 큰 금별(#FFD700) 트리 꼭대기, 방사 광선(얇은 선 8%). 주변 반짝임 도트(금 3~5px, 30%).

ZONE 2 — 크리스마스 트리 (center, 50%): 삼각형 상록수 — 진녹(#22c55e → #15803d) 그라디언트. 겹겹이 가지 텍스처. 장식: 컬러풀 오너먼트 볼(빨강 #dc2626, 금 #d4a017, 파랑 #3b82f6, 8~12px 원), 반짝이 라이트 도트(흰/노랑 3px, 글로우), 금 가랜드(#d4a017) 물결 드레이핑. 따뜻한 갈색(#92400e) 줄기.

ZONE 3 — 선물·인사·휴진 안내 (next 20%): 트리 아래 선물 상자 3~4개(빨강·녹색·금, 리본 매듭). "Merry Christmas" 빨강(#dc2626, 12px, letter-spacing 2px). "메리 크리스마스" 녹색(#15803d, 22px, weight 700). 병원명 빨강(#b91c1c, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 바닥 금빛 글로우(8%). 가는 녹색 장식선.

=== BACKGROUND ===
따뜻한 크림(#fffbeb) → 소프트 화이트 그라디언트. 중앙 따뜻한 방사 글로우(금 #fbbf24 3%). 클래식 거실 크리스마스 분위기.`,
    },
    {
      id: 'grt_xmas_snow', name: '눈 내리는 밤', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '눈 덮인 마을·가로등 수채화 겨울밤 풍경 카드',
      layoutHint: 'nature',
      aiPrompt: `[크리스마스 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 전면 눈 오버레이 → 마을 45% → 인사말 25% → 하단 10% (나머지 여유)
• 딥블루-화이트 겨울밤 팔레트
• 눈 내리는 마을 풍경 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 집 수(3~5채)·스타일 자유
• 가로등 유무 자유
• 눈송이 크기·밀도 자유

=== ZONE 구성 ===
ZONE 1 — 눈 (full overlay): 전체에 눈송이 파티클 — 작은 도트(2~3px, 흰, 40~70%) + 큰 결정 눈송이(8~12px, 흰, 20~30%, 육각형). 크기 변화로 깊이감. 일부에 모션 블러.

ZONE 2 — 마을 풍경 (center-bottom, 45%): 아늑한 집 3~4채 — 눈 덮인 지붕(흰 #f0f9ff 두꺼운 캡), 창문에서 따뜻한 금빛(#fbbf24) 빛. 우측 교회 첨탑. 수채화 스타일, 부드러운 가장자리. 눈 덮인 대지(연파랑흰 #e0f2fe). 좌측 빈티지 가로등 — 금빛 글로우 원(#fbbf24 30%, 40px 반지름).

ZONE 3 — 인사말·휴진 안내 (upper-center, 25%): "Merry Christmas" 흰(14px, letter-spacing 3px, 80%). "메리 크리스마스" 흰(22px, weight 700), 글로우 텍스트 쉐도우. 병원명 아이스블루(#7dd3fc, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (흰 50%, 작은 크기).

ZONE 4 — 하단 눈밭 (bottom 10%): 물결 모양 눈 덮인 대지, 수채화 가장자리 페이드아웃.

=== BACKGROUND ===
딥 겨울밤 파랑(#0c1445) → 미드나잇(#1e1b4b) 그라디언트. 평화롭고 마법 같은 고요한 밤 — 아늑한 크리스마스 이브.`,
    },
    {
      id: 'grt_xmas_minimal', name: '미니멀 노엘', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '단일 오너먼트 볼 레드&화이트 울트라미니멀 카드',
      layoutHint: 'minimal',
      aiPrompt: `[크리스마스 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 30% → 중앙 25% → 타이포 20% → 하단 20% (나머지 여유)
• 레드+화이트 2색 한정 (골드 캡만 예외)
• 단일 오너먼트 볼 포컬 포인트
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 줄 길이(25~35%) 자유
• 오너먼트 볼 크기(40~60px) 자유
• 눈송이 패턴 유무 자유

=== ZONE 구성 ===
ZONE 1 — 매달린 줄 (top 30%): 단일 가는 세로선(1px, 레드 #dc2626 40%) 상단 중앙에서 아래로. 깔끔하고 정밀.

ZONE 2 — 오너먼트 볼 (center, 25%): 줄에 매달린 단일 크리스마스 오너먼트 — 완벽한 원(50px), 레드(#dc2626) 솔리드, 상단에 골드(#d4a017) 캡+고리. 좌상에 하이라이트 반사(흰 호, 15%). 아래 부드러운 그림자(4px blur, 5%).

ZONE 3 — 타이포·휴진 안내 (next 20%): "Merry Christmas" 깨끗한 산세리프(14px, letter-spacing 4px, #b91c1c). "메리 크리스마스" 레드(#dc2626, 20px, weight 700). 병원명 연회색(#d1d5db, 11px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연회색 #d1d5db 60%, 작은 크기).

ZONE 4 — 하단 (bottom 20%): 넓은 빈 흰 공간. 여백의 미.

=== BACKGROUND ===
순수 화이트(#ffffff). 매우 희미한 눈송이 패턴(연회색 #f1f5f9 4%). 울트라 미니멀 — 단일 오너먼트가 포컬 포인트. Less is more.`,
    },
    {
      id: 'grt_xmas_character', name: '산타 캐릭터', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '산타·엘프 치아·눈사람 캐릭터 귀여운 크리스마스 카드',
      layoutHint: 'cute',
      aiPrompt: `[크리스마스 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 인사말 20% → 하단 10% (나머지 여유)
• 레드-그린-골드 밝은 파스텔 팔레트
• 산타 + 치아 캐릭터(엘프 복장) 반드시 포함
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 눈사람 유무·크기 자유
• 과자·캔디케인 장식 개수 자유
• 캐릭터 포즈·표정 자유

=== ZONE 구성 ===
ZONE 1 — 배너 (top 15%): 스캘럽 레드(#ef4444) 배너, 흰 텍스트 "Merry Christmas!"(14px, weight 700). 배너 양 끝 홀리 잎. 위에 작은 금별 흩뿌림(5~8개, 4px, 30%).

ZONE 2 — 캐릭터 씬 (center, 45%): 중앙에 산타(둥근 몸, 큰 빨간 모자+흰 폼폼, 분홍 볼, 눈감은 미소) — 빨간 선물 보따리. 좌측에 치아 캐릭터(엘프 복장: 녹색 모자, 뾰족 귀, 큰 미소). 우측에 둥근 눈사람(당근 코, 빨간 목도리). 모두 심플 일러스트 — 큰 머리, 작은 몸, 파스텔 셰이딩. 발 주변 캔디케인, 진저브레드맨, 롤리팝.

ZONE 3 — 인사말·휴진 안내 (next 20%): "메리 크리스마스" 밝은 빨강(#ef4444, 22px, weight 800). "즐거운 성탄절 보내세요" 녹색(#16a34a, 13px). 병원명 빨강(#dc2626, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (빨강 #dc2626 50%, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 작은 선물 상자 아이콘 가로 배열(빨강·녹색·금, 리본). 하단 가장자리 눈 도트.

=== BACKGROUND ===
소프트 레드(#fef2f2) → 화이트 그라디언트. 캔디케인 대각선 줄무늬(#fca5a5+흰, 4%). 귀엽고 밝은 크리스마스 파티 — 어린이 친화적.`,
    },
    {
      id: 'grt_xmas_gold', name: '골드 오너먼트', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '네이비·골드 매달린 오너먼트 럭셔리 크리스마스 카드',
      layoutHint: 'luxury',
      aiPrompt: `[크리스마스 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 40% → 중앙 15% → 인사말 25% → 하단 10% (나머지 여유)
• 네이비+골드 2색 한정
• 매달린 오너먼트 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 오너먼트 형태(원·물방울·타원·별) 조합 자유
• 결정 눈송이 밀도 자유
• 스파클 도트 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 매달린 오너먼트 (top 40%): 5개 우아한 오너먼트 — 상단에서 금(#d4a017) 가는 줄에 다른 길이로 매달림. 형태: 원·물방울·타원·별·원 — 금(#d4a017)과 밝은 금(#FFD700) 메탈릭 광택. 각각 장식 금 캡. 걸이에 금 리본 매듭. 주변 시머/스파클 도트(흰 2px, 50%).

ZONE 2 — 결정 눈송이 (middle, 15%): 3~4개 큰 기하학적 결정 눈송이(흰 10~20%, 육각형 프랙탈, 보석 같은 정밀함).

ZONE 3 — 인사말·휴진 안내 (next 25%): "Merry Christmas" 금박 효과(#FFD700 → #d4a017, 16px, 세리프, letter-spacing 3px). "메리 크리스마스" 밝은 금(#FFD700, 24px, weight 700), 메탈릭 효과. 병원명 뮤트 골드(#b8860b, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #b8860b 50%, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 가는 금 이중선 테두리. 중앙 작은 금 리본.

=== BACKGROUND ===
딥 네이비(#1a1a2e) → 블랙(#0a0a1a) 그라디언트. 금 더스트 파티클(1~2px, #d4a017, 5%). 고급스럽고 화려한 프리미엄 크리스마스 카드.`,
    },
    {
      id: 'grt_xmas_wreath', name: '리스 장식', color: '#16a34a', accent: '#15803d', bg: '#f0fdf4',
      desc: '솔가지·열매 리스 프레임 빨간 리본 따뜻한 카드',
      layoutHint: 'warm',
      aiPrompt: `[크리스마스 — 따뜻한/리스]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 리스 원형 레이아웃: 리스 70% → 리본 6시 방향 → 중앙 텍스트 → 모서리 여유
• 녹색-빨강 전통 크리스마스 팔레트
• 원형 리스 프레임 메인 구조 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 솔방울·겨우살이 배치 자유
• 리본 크기·색조 자유
• 열매 클러스터 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 리스 원 (centered, 70% of card): 원형 크리스마스 리스 — 풍성한 솔가지(#16a34a → #15803d) 두꺼운 링(지름의 ~15%). 바늘 텍스처, 겹겹이 풍성. 장식: 빨간 홀리 열매(#dc2626) 3개씩 클러스터, 진녹 홀리 잎(#166534), 솔방울(#92400e) 3~4개, 겨우살이(흰 열매). 리스 뒤 부드러운 그림자(6px blur, 8%).

ZONE 2 — 빨간 리본 (wreath 6시): 큰 장식 빨간(#dc2626) 새틴 리본 매듭, 흐르는 리본 꼬리 2개. 포컬 악센트.

ZONE 3 — 중앙 텍스트·휴진 안내 (inside wreath): "Merry Christmas" 진녹(#15803d, 13px, letter-spacing 2px). "메리 크리스마스" 빨강(#dc2626, 22px, weight 700). 병원명 녹색(#16a34a, 12px). 리스 원 안쪽 중앙 정렬. 텍스트 뒤 따뜻한 촛불 글로우(#fbbf24 6%). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (녹색 #16a34a 50%, 작은 크기).

ZONE 4 — 모서리 (outside wreath): 모서리에 흩어진 솔잎·단일 열매(15% 불투명도). 리스 바깥은 깔끔.

=== BACKGROUND ===
따뜻한 크림(#f0fdf4), 중앙 따뜻한 금빛 글로우(#fbbf24 5%). 따뜻하고 아늑한 가족 크리스마스 리스 — 환영하는 축제 분위기.`,
    },
  ],

  // ─── 명절 인사: 기본 fallback (구 greeting) ───
  greeting: [
    {
      id: 'grt_traditional_korean', name: '전통 한국풍', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '단청·매화·학 격식 있는 범용 명절 인사장 (설/추석 겸용)',
      layoutHint: 'traditional',
      aiPrompt: `[범용 명절 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 8% → 장식 30% → 인사말 30% → 하단 15% (나머지 여유)
• 빨강+금 전통 팔레트: #dc2626, #d4a017, #991b1b
• 한지(韓紙) 질감 배경 필수
• 인사말 텍스트 반드시 포함: "명절을 축하합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보 — 이 템플릿은 설/추석 범용이므로 휴진 안내가 매우 중요

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 매화/소나무 선택 또는 둘 다 가능
• 학 실루엣 수(1~3마리) 자유
• 구름문/매듭 장식 유무 자유

=== ZONE 구성 ===
ZONE 1 — 전통 프레임 (outer border, 8% inset): 빨강(#dc2626)+금(#d4a017) 단청풍 기하 패턴 테두리. 모서리에 양식화된 구름문(#d4a017 60%). 이중선(빨강 1px 외, 금 1px 내, 3px 간격).

ZONE 2 — 장식 요소 (top-center, 30%): 우아한 매화(梅) 가지 — 진갈(#57534e) 가지에 빨강(#dc2626)+핑크(#fca5a5) 오엽 꽃. 상부에 학(鶴) 실루엣 2~3마리 금(#d4a017 20%). 작은 구름문 흩뿌림.

ZONE 3 — 인사말·휴진 안내 (center, 30%): "명절을 축하합니다" — 붓 캘리그래피(26px, weight 800, 딥레드 #991b1b). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" — 따뜻한 회색(#78716c, 13px). 병원명 빨강(#dc2626, 14px, weight 600) + 전통 프레임 밑줄.

ZONE 4 — 하단 악센트 (bottom 15%): 소나무(松) 실루엣(진녹 #166534, 15%). 빨강+금 가는 장식선. 중앙 빨간 전통 매듭 장식.

=== BACKGROUND ===
따뜻한 크림(#fef2f2), 한지 텍스처 5% 불투명도. 격조 있는 한국 전통 축제 미학 — 빨강과 금 단청 우아함.`,
    },
    {
      id: 'grt_warm_family', name: '따뜻한 가족', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '촛불·가족 실루엣 수채화 손그림 범용 명절 인사장',
      layoutHint: 'warm',
      aiPrompt: `[범용 명절 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 인사말 25% → 하단 10% (나머지 여유)
• 오렌지+크림+피치 따뜻한 팔레트
• 가족 실루엣/일러스트 필수
• 인사말 텍스트 반드시 포함: "따뜻한 명절 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 가족 구성(어른 2명 + 아이 1~2명) 자유
• 촛불/보케 밀도 자유
• 하트 형태/위치 자유

=== ZONE 구성 ===
ZONE 1 — 따뜻한 헤더 (top 15%): 상단 중앙에 작은 촛불 일러스트(따뜻한 오렌지 #f97316, 글로우 효과). 아래 오렌지(#fdba74 20%) 손그림 물결 선.

ZONE 2 — 가족 일러스트 (center, 40%): 따뜻한 손그림 스타일 — 가족 실루엣(어른 2명, 아이 1~2명) 손잡고 있는 심플 선화, 따뜻한 갈색(#92400e 50%). 뒤에 수채화 워시 소프트 오렌지(#fed7aa 15%). 가족 위에 하트 형태(오렌지 30%). 포근하고 심플.

ZONE 3 — 인사말·휴진 안내 (next 25%): "따뜻한 명절 보내세요" 따뜻한 오렌지갈색(#ea580c, 22px, weight 700). "휴진 안내: OO월 OO일 ~ OO월 OO일" 따뜻한 회색(#78716c, 12px). 병원명 오렌지(#f97316, 13px).

ZONE 4 — 하단 글로우 (bottom 10%): 하단 중앙에서 촛불 글로우 — 금(#fbbf24 5%) 방사 그라디언트 페이드. 피치색 손그림 가로선 15%.

=== BACKGROUND ===
소프트 크림(#fff7ed) → 피치(#fed7aa) 미묘한 그라디언트. 따뜻한 금 보케 원 5~8개(#fbbf24, 8~15%, 20~60px). 가족 중심의 따뜻하고 감성적인 의료 인사.`,
    },
    {
      id: 'grt_modern_minimal', name: '모던 미니멀', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '타이포 중심 울트라클린 범용 명절 카드 (휴진 안내 강조)',
      layoutHint: 'minimal',
      aiPrompt: `[범용 명절 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 25% → 중앙 30% → 스케줄 20% → 하단 20% (나머지 여유)
• 인디고+화이트 2색 한정
• 최대 여백 원칙
• 인사말 텍스트 반드시 포함: "행복한 명절 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 강조 — 이 템플릿의 핵심 기능

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 기하 심볼(별/오너먼트/원) 선택 자유
• 가로선 위치·길이 자유
• 기하 도트 유무 자유

=== ZONE 구성 ===
ZONE 1 — 상단 여백 (top 25%): 깨끗한 흰 공간. 인디고(#6366f1 8%) 가로선 40% 폭, 중앙. 선 위에 작은 기하 명절 심볼(별 또는 오너먼트 선화, 인디고 25%, 24px).

ZONE 2 — 메인 타이포 (center, 30%): "Happy Holidays" 깨끗한 산세리프(14px, letter-spacing 4px, 인디고 #6366f1 60%). 아래 "행복한 명절 되세요" 볼드 인디고(#4f46e5, 24px, weight 700). 줄 사이 넉넉한 여백(20px gap).

ZONE 3 — 스케줄·휴진 안내 (next 20%): 가는 인디고 선(30px, 1px, 15%). "휴진 안내" 인디고(#6366f1, 11px, weight 600, letter-spacing 2px). 휴진 날짜 연회색(#94a3b8, 12px). 병원명 인디고(#a5b4fc, 12px, letter-spacing 2px).

ZONE 4 — 하단 (bottom 20%): 순수 흰 공간. 중앙 작은 기하 도트(인디고 10%).

=== BACKGROUND ===
순수 화이트(#ffffff). 매우 미세한 기하 그리드(연인디고 #e0e7ff 3%). 모던 미니멀 타이포 정밀함 — 세련된 의료 브랜드.`,
    },
    {
      id: 'grt_nature_season', name: '자연 사계절', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '보태니컬 아치·사계절 풍경 비네트 수채화 범용 인사장',
      layoutHint: 'nature',
      aiPrompt: `[범용 명절 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 30% → 중앙 30% → 인사말 25% → 하단 10% (나머지 여유)
• 녹색+따뜻한 자연색 팔레트
• 수채화 보태니컬 스타일 필수
• 인사말 텍스트 반드시 포함: "행복한 명절 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 계절별 꽃(벚꽃/해바라기/단풍/소나무) 선택 자유
• 풍경 비네트 구성 자유
• 유칼립투스/올리브 잎 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 보태니컬 헤더 (top 30%): 수채화 보태니컬 아치 — 유칼립투스·작은 잎·계절 단풍 아치/가랜드 형태. 색상: 세이지그린(#22c55e), 올리브(#65a30d), 민트(#86efac), 어스브라운(#92400e) 줄기. 수채화 스타일 — 번짐, 자연스러운 불완전함. 계절 꽃(봄 벚꽃, 여름 해바라기, 가을 단풍, 겨울 소나무) 배치.

ZONE 2 — 풍경 비네트 (center, 30%): 작은 원형 비네트(수채화, 부드러운 가장자리 페더) — 고요한 계절 풍경(완만한 녹색 언덕, 나무 한 그루, 잔잔한 하늘). 어스톤(#92400e, #22c55e, #38bdf8) 루즈 수채화 워시.

ZONE 3 — 인사말·휴진 안내 (next 25%): "행복한 명절 되세요" 진녹(#15803d, 22px, weight 700). "휴진 안내: OO월 OO일 ~ OO월 OO일" 따뜻한 회색(#78716c, 12px). 병원명 녹색(#22c55e, 13px).

ZONE 4 — 하단 보태니컬 (bottom 10%): 하단 모서리에 수채화 잎 가지(세이지그린 20%). 녹색 손그림 스타일 가로선 10%.

=== BACKGROUND ===
세이지그린(#f0fdf4) → 따뜻한 크림(#fefce8) 그라디언트. 고요하고 자연 영감의 계절감 — 평화롭고 상쾌한.`,
    },
    {
      id: 'grt_luxury_gold', name: '럭셔리 골드', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '네이비·골드 오너먼트 아르데코 프리미엄 범용 명절 카드',
      layoutHint: 'luxury',
      aiPrompt: `[범용 명절 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 6% → 오너먼트 35% → 인사말 30% → 하단 12% (나머지 여유)
• 네이비+골드 2색 한정
• 금박 메탈릭 효과 전체 적용
• 인사말 텍스트 반드시 포함: "행복한 명절 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 오너먼트 형태(원/물방울) 조합 자유
• 코너 플로리시 스타일(아르데코/클래식) 자유
• 금별 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 금 테두리 (outer frame, 6% inset): 금(#d4a017) 이중선 프레임 — 외선 2px, 내선 1px, 4px 간격. 모서리 장식 플로리시(아르데코 스크롤워크). 금박 효과 + 하이라이트 그라디언트.

ZONE 2 — 오너먼트 디스플레이 (top-center, 35%): 3개 우아한 오너먼트 — 중앙 크게(원, 40px, 금 + 정교한 각인 패턴), 좌우 작게(물방울, 28px). 모두 금(#d4a017 → #FFD700) 그라디언트, 메탈릭 광택. 주변 금별(4px, 30%).

ZONE 3 — 인사말·휴진 안내 (center, 30%): "Happy Holidays" 금박 세리프(14px, letter-spacing 3px, #FFD700). "행복한 명절 되세요" 밝은 금(#FFD700, 24px, weight 700), 메탈릭 시머. 가는 금 선(40px, 1px). 병원명 뮤트 골드(#b8860b, 12px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #fde68a 60%, 11px).

ZONE 4 — 하단 (bottom 12%): 하단 중앙 작은 금 리본 오너먼트.

=== BACKGROUND ===
딥 네이비(#0f172a) → 다크 차콜(#1e293b) 그라디언트. 프리미엄 리넨 텍스처 4% 불투명도. 고급스럽고 격조 있는 금-네이비 의료 브랜드 카드.`,
    },
    {
      id: 'grt_cute_character', name: '귀여운 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '치아 캐릭터·말풍선 파스텔 파티 귀여운 범용 명절 카드',
      layoutHint: 'cute',
      aiPrompt: `[범용 명절 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 말풍선 20% → 하단 15% (나머지 여유)
• 파스텔 멀티컬러 팔레트 (핑크, 노랑, 민트, 라벤더)
• 치아 캐릭터(파티모자) 반드시 포함
• 인사말 텍스트 반드시 포함: "행복한 명절 보내세요!"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 동반 캐릭터(별/하트) 유무 자유
• 번팅/깃발 장식 유무 자유
• 말풍선 형태(둥근/구름형) 자유

=== ZONE 구성 ===
ZONE 1 — 축제 악센트 (top 15%): 파스텔 별·도트 흩뿌림 — 핑크(#ec4899), 골드(#fbbf24), 민트(#34d399) — 15~30% 불투명도, 4~8px. 파스텔 번팅/깃발 배너 상단 가장자리.

ZONE 2 — 캐릭터 씬 (center, 45%): 중앙에 치아 캐릭터 — 흰 치아 형태, 큰 둥근 눈, 분홍 볼, 넓은 미소, 핑크+금도트 파티모자. 작은 깃발 들고 있음. 좌측에 별 캐릭터(노란, 행복 표정). 우측에 하트 캐릭터(핑크, 행복 표정). 심플 일러스트 — 둥근 형태, 미니멀 디테일, 최대 귀여움. 주변 기하 악센트.

ZONE 3 — 말풍선·휴진 안내 (next 20%): 둥근 말풍선(흰 채움, 핑크 #ec4899 2px 테두리) — "행복한 명절 보내세요!" 핑크(#be185d, 18px, weight 700). 안에 작은 하트 악센트. 말풍선 꼬리 → 치아 캐릭터 향함. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (핑크 #ec4899 40%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 병원명 핑크(#ec4899, 13px). 작은 축제 아이콘 가로 배열(선물, 별, 하트, 사탕) 파스텔 25%.

=== BACKGROUND ===
소프트 핑크(#fdf2f8) → 화이트 그라디언트. 파스텔 기하 도트(핑크 #f9a8d4, 노랑 #fde68a, 민트 #a7f3d0, 라벤더 #c4b5fd) 8% 불투명도, 2~4px 원. 귀엽고 즐거운 파스텔 축하 — 어린이 친화적 치과 인사.`,
    },
  ],

  // ─── 채용/공고 (6개) ───
  // 연구 기반: 실제 근무환경 사진 > 스톡, FAQ 말풍선 디자인, 가독성 최우선
  // 색상: 브랜드 컬러 + 화이트 + 1악센트, 틸/민트(환영), 코랄(활기), 네이비+옐로(주목)
  // 레이아웃: 단일 볼드 카드, 분할 사진/텍스트, 캐러셀(표지+혜택+지원방법)
  hiring: [
    {
      id: 'hir_corporate_clean', name: '기업 표준형', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '네이비 헤더 + 교대색 행 테이블 — 대형병원·종합병원 정규직 공채 표준 포맷',
      layoutHint: 'corporate',
      aiPrompt: `STRUCTURED TABLE POSTING LAYOUT — standard Korean hospital recruitment format. Navy header band, striped data table rows, CTA footer. Information flows: 모집분야 → 자격요건 → 근무조건 → 복리후생 → 지원방법.

ZONE 1 — HEADER (top 18%): Solid navy (#1e40af) filled rectangle, full width. Hospital name in small white text (13px, weight 500, letter-spacing 2px) centered at top of bar. "함께할 OO을 찾습니다" in largest bold white text (28px, weight 800) centered below. This bar is a single solid block — no gradients, no rounded corners.
ZONE 2 — TABLE BODY (middle 57%): White background (#ffffff). Rows alternate white / light blue (#eff6ff at 50%). Each row is a full-width horizontal band (row height ~48px), split into LEFT LABEL COLUMN (28% width, navy #1e40af text, 14px bold) and RIGHT VALUE COLUMN (72% width, dark gray #374151 text, 14px regular). Thin navy (#1e40af, 1px) horizontal lines separate rows.
- Row 1: "모집분야" | "간호사 (정규직 / 계약직)"
- Row 2: "자격요건" | "간호사 면허 소지자, 유관 경력 2년 이상 우대"
- Row 3: "근무형태" | "주 5일 (월~금), 3교대 / 협의 가능"
- Row 4: "급여조건" | "경력에 따른 협의, 야간수당 별도"
- Row 5: "복리후생" | "4대보험 · 식대 · 교육비 · 경조금 · 연차"
- Row 6: "지원방법" | "이메일(recruit@hospital.co.kr) 또는 방문 접수"
ZONE 3 — CTA FOOTER (bottom 25%): Solid navy (#1e40af) filled rectangle, full width. "지원하기" in large bold white text (22px) centered. Contact phone "☎ 02-000-0000" in small white text (12px) below. "채용 시 마감" in tiny white text (10px, 60% opacity).

STRICT MODE ANCHORS: Navy header bar, table row structure with label|value split, navy CTA footer bar, alternating row stripes. These structural elements must be preserved.
INSPIRED MODE FREEDOM: Row count (5-8), specific label/value text, row height, label column width ratio (25-35%), additional sub-rows or merged cells.
MOBILE: Minimum 13px font. Label column can stack above value on narrow screens. Row height minimum 40px for tap targets.`,
    },
    {
      id: 'hir_friendly_team', name: '팀워크 카드형', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '민트 배경 + 좌측 보더 스택 카드 — 동네 의원·소규모 병원 따뜻한 채용 공고',
      layoutHint: 'team',
      aiPrompt: `STACKED INFO CARDS LAYOUT — warm, approachable neighborhood clinic recruitment. Mint background, white cards with green left-border, friendly language. Information flow: 모집분야 → 자격요건 → 복리후생 → 지원방법.

BACKGROUND: Soft mint (#f0fdf4) solid fill, full canvas.
ZONE 1 — HEADER (top 20%): Rounded rectangle card (white fill, 12px border-radius, subtle shadow, 90% width centered). Inside: "함께 일할 동료를 찾습니다 :)" in bold green (#16a34a) text (22px) centered. "간호사 · 간호조무사 모집" in large bold dark text (#111827, 18px) below.
ZONE 2 — INFO CARDS (middle 55%): 4 horizontal card rows stacked vertically with 10px gap. Each card is a white rounded rectangle (90% width centered, 10px border-radius, subtle shadow) with 4px solid green (#22c55e) LEFT border. Inside each card, left-aligned with 16px padding:
- Card 1: Green circle icon (user silhouette) → "모집분야" in small bold green (11px) → "정규직 간호사 / 간호조무사 (신입·경력 무관)" in medium dark text (14px).
- Card 2: Green circle icon (clipboard) → "자격요건" in small bold green → "해당 면허 소지자, 성실하고 밝은 분 환영" in medium dark text.
- Card 3: Green circle icon (heart) → "복리후생" in small bold green → "4대보험 · 점심 제공 · 연차 · 교육비 · 명절 상여" in medium dark text.
- Card 4: Green circle icon (phone) → "지원방법" in small bold green → "전화 문의 (010-0000-0000) 또는 이메일 접수" in medium dark text.
ZONE 3 — CTA BOTTOM (bottom 25%): Green (#22c55e) rounded pill button (220px wide, 48px tall, centered) with "지원하기" in bold white text (16px). Hospital name "OO내과의원" in small green (#16a34a) text below button. "서울시 OO구 OO로 000" 주소 in tiny gray text.

STRICT MODE ANCHORS: Mint background, stacked card layout with green left-border, pill CTA button. Cards must be vertically stacked (not grid).
INSPIRED MODE FREEDOM: Card count (3-5), icon shapes, card padding, border-radius, shadow intensity, card content text, button width.
MOBILE: Cards stack naturally. Minimum card height 60px. Text minimum 13px. Button minimum 44px height for touch.`,
    },
    {
      id: 'hir_modern_startup', name: '모던 아이콘 그리드', color: '#8b5cf6', accent: '#7c3aed', bg: '#1e1b4b',
      desc: '다크 인디고 배경 + 2×3 복리후생 아이콘 그리드 — IT·스타트업 감성 모던 채용',
      layoutHint: 'modern',
      aiPrompt: `DARK ICON GRID LAYOUT — modern tech-forward recruitment poster. Dark indigo background, 2x3 icon grid showcasing benefits, purple accent CTA. Structure: Title → Benefits Grid → CTA.

BACKGROUND: Solid dark indigo (#1e1b4b), full canvas.
ZONE 1 — TITLE (top 22%): Hospital/clinic name in small light purple (#a78bfa, 11px, letter-spacing 3px, uppercase) centered at very top. "간호사 모집" in largest bold white text (26px, weight 800) centered. "정규직 · 경력우대 · 즉시 입사 가능" in medium light purple (#a78bfa, 14px) text centered below. Thin horizontal line (1px, purple #8b5cf6 at 40% opacity) spanning 50% width, centered, as divider.
ZONE 2 — ICON GRID (middle 53%): 2 columns x 3 rows grid of benefit cells, centered, 12px gap. Each cell is a rounded square (dark purple #2e1065 fill, 12px border-radius, ~46% width, equal height) containing:
- Top: Simple geometric icon shape (30px) in purple (#8b5cf6).
- Bottom: Label in small bold white (12px) + one-line description in tiny gray (#94a3b8, 10px).
Grid cells:
- [1,1]: Shield → "4대보험" / "국민·건강·고용·산재"
- [1,2]: Utensils → "식대 지원" / "중식 제공 또는 월 10만원"
- [2,1]: Calendar → "연차 보장" / "입사 즉시 발생"
- [2,2]: Coins → "인센티브" / "분기별 성과급"
- [3,1]: Book → "교육 지원" / "학회·세미나·자격증"
- [3,2]: Clock → "유연 근무" / "협의 가능"
ZONE 3 — CTA (bottom 25%): Purple (#8b5cf6) rounded button (220px wide, 48px, centered) with "지원하기" in bold white text (16px). "recruit@hospital.co.kr" in small light purple (#a78bfa, 11px) below. "☎ 02-000-0000" in small gray (#94a3b8, 11px).

STRICT MODE ANCHORS: Dark indigo background, 2x3 grid of rounded-square cells, purple accent color, dark-on-dark cell contrast. Grid structure must remain 2-column.
INSPIRED MODE FREEDOM: Grid cell content/icons, cell border-radius, gap size, description text, icon style (outline vs filled), CTA button shape.
MOBILE: Grid cells minimum 44px tall. Icon minimum 24px. Label text minimum 12px. High contrast white-on-dark required.`,
    },
    {
      id: 'hir_benefits_focus', name: '복리후생 강조형', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '2×2 혜택 카드 그리드 + 상세 설명 — 복리후생을 전면에 내세운 채용 공고',
      layoutHint: 'benefits',
      aiPrompt: `BENEFITS-FOCUSED CARD GRID — recruitment poster where benefits are the hero element. Warm cream background, 2x2 benefit card grid dominates the layout. Structure: Position → Benefits Grid → CTA.

BACKGROUND: Warm cream (#fffbeb), full canvas.
ZONE 1 — POSITION HEADER (top 18%): "간호사 · 물리치료사 모집" in large bold dark text (#78350f, 22px) centered. "정규직 · 경력우대 · 수습 3개월" in medium amber (#d97706, 14px) below. Thin amber (#f59e0b) horizontal line divider (50% width, centered, 1px).
ZONE 2 — BENEFITS GRID (middle 57%): "이런 복리후생이 준비되어 있습니다" in medium bold amber (#d97706, 15px) text, left-aligned with 6% left margin. Below: 2x2 grid of benefit cards, centered, 12px gap. Each card is a white rounded rectangle (46% width, equal height ~120px, 12px border-radius, subtle shadow, 3px top border in amber #f59e0b). Inside each card (padding 14px):
- Top: Simple geometric icon shape in amber (#f59e0b, 28px) centered.
- Middle: Benefit name in medium bold dark text (#78350f, 15px) centered.
- Bottom: Two-line description in small gray (#6b7280, 11px) centered.
Cards:
- [1,1]: Shield icon → "4대보험 완비" / "국민연금·건강보험\n고용·산재보험 전액"
- [1,2]: Utensils icon → "식대 지원" / "점심 제공 또는\n월 식대 10만원 별도"
- [2,1]: Graduation cap → "교육비 지원" / "직무교육·학회 참가비\n자격증 취득 지원"
- [2,2]: Gift icon → "경조금·상여" / "경조사 지원·경조휴가\n명절 상여금 지급"
ZONE 3 — CTA FOOTER (bottom 25%): Amber (#f59e0b) rounded pill button (220px, 48px, centered) with "지원하기" in bold white text (16px). Hospital name "OO병원" in small amber text (12px) below. "☎ 02-000-0000 | recruit@hospital.co.kr" in small gray text (11px).

STRICT MODE ANCHORS: Warm cream background, 2x2 card grid with amber top-border, amber pill CTA. Grid must remain 2x2.
INSPIRED MODE FREEDOM: Card content, icon style, card dimensions, description length, additional benefit cards (can expand to 2x3), shadow/border style.
MOBILE: Cards can reflow to single column on narrow screens. Card minimum height 100px. Text minimum 12px. Touch target minimum 44px.`,
    },
    {
      id: 'hir_urgent_now', name: '급구 긴급형', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '레드 대각 분할 + "급구" 대형 타이포 — 즉시 채용이 필요한 긴급 구인 공고',
      layoutHint: 'urgent',
      aiPrompt: `DIAGONAL SPLIT URGENT LAYOUT — high-contrast urgent recruitment poster. Bold red diagonal division creates visual tension. Structure: Urgent Banner → Job Details → Immediate CTA.

BACKGROUND: Diagonal split — upper-left triangle filled with solid red (#ef4444), lower-right triangle filled with white (#ffffff). Diagonal line from top-right to bottom-left corner.
ZONE 1 — RED TRIANGLE (upper-left, ~42% of canvas): "URGENT" in small white text (10px, letter-spacing 4px, 40% opacity) centered above main text. "급구" in massive bold white text (52px, weight 900) positioned in center of red triangle. Creates immediate visual impact and urgency.
ZONE 2 — WHITE TRIANGLE (lower-right, ~40% of canvas): Job details in dark text, left-aligned within white area with 8% padding:
- "간호사 모집" in large bold red (#ef4444, 20px) as section title.
- Bullet list with red (#ef4444) filled circle bullets (6px):
  - "정규직 채용 (수습 없음)" in medium dark text (#1f2937, 14px)
  - "간호사 면허 소지자" in medium dark text
  - "경력 우대, 신입 지원 가능" in medium dark text
  - "4대보험 · 식대 · 야간수당 · 인센티브" in medium dark text
- "※ 면접 후 즉시 근무 가능" in small bold red (#dc2626, 12px) below bullet list.
ZONE 3 — BOTTOM STRIP (bottom 18%): Solid red (#dc2626) horizontal bar, full width. "지금 바로 지원하기" in bold white text (18px) centered. "☎ 02-000-0000 (평일 09:00~18:00)" in small white text (11px) below. Hospital name in tiny white text (10px, 70% opacity).

STRICT MODE ANCHORS: Diagonal split composition (red upper-left / white lower-right), "급구" oversized text, red bottom CTA bar. The diagonal is the defining structural element.
INSPIRED MODE FREEDOM: Diagonal angle (35-55 degrees), bullet content, font sizes, additional urgency indicators (blinking effect description, exclamation marks), red shade variations.
MOBILE: "급구" minimum 36px. Bullet text minimum 13px. Bottom bar minimum 60px height. Ensure white-area text doesn't overlap diagonal edge.`,
    },
    {
      id: 'hir_premium_brand', name: '프리미엄 브랜드형', color: '#78716c', accent: '#57534e', bg: '#fafaf9',
      desc: '오프화이트 + 골드 라인 에디토리얼 — 대학병원·고급 의원 브랜드 채용 공고',
      layoutHint: 'brand',
      aiPrompt: `PREMIUM EDITORIAL LAYOUT — elegant, minimal recruitment poster. Warm off-white canvas, charcoal typography, gold line accents. Magazine editorial feel. Structure: Brand → Title → Details → Contact.

BACKGROUND: Warm off-white (#fafaf9), full canvas.
ZONE 1 — TOP BRANDING (top 12%): Hospital name "OO대학교병원" in medium charcoal (#57534e, 14px, letter-spacing 4px, weight 500) text, centered. Thin gold (#b8860b) horizontal line (70% width, centered, 1px) below name with 12px spacing.
ZONE 2 — MAIN TITLE (next 23%): "함께할 인재를 모십니다" in largest bold charcoal (#44403c, 26px, weight 700) text, centered. "간호사" in large bold gold (#b8860b, 20px) text centered below. "정규직 채용 | 경력 3년 이상" in medium charcoal (#57534e, 13px) text centered below that.
ZONE 3 — DETAILS (middle 40%): Thin gold horizontal line divider (50% width, centered). Below, centered minimal list with generous line spacing (32px between items):
- Small gold diamond (◆, 8px) then "모집분야  |  내과 병동 간호사 (00명)" in medium charcoal text (14px)
- Small gold diamond (◆) then "자격요건  |  간호사 면허, 유관 경력 3년 이상" in medium charcoal text
- Small gold diamond (◆) then "근무조건  |  주 5일, 3교대, 협의 가능" in medium charcoal text
- Small gold diamond (◆) then "복리후생  |  4대보험 · 식대 · 교육비 · 학자금 · 경조금" in medium charcoal text
Gold (#b8860b) pipe "|" as separator in each line. Thin gold horizontal line divider below the list (50% width, centered).
ZONE 4 — CONTACT CTA (bottom 25%): "지원 및 문의" in medium bold charcoal (#44403c, 16px) text centered. "채용담당: recruit@hospital.ac.kr" in small charcoal text (12px) below. "☎ 02-000-0000 (인사팀)" in small charcoal text (12px). Thin gold horizontal line at very bottom (70% width). No button — elegant text-based CTA befitting premium brand.

STRICT MODE ANCHORS: Off-white background, gold horizontal line dividers, gold diamond bullets, charcoal typography, editorial vertical rhythm. No buttons, no cards — pure typography.
INSPIRED MODE FREEDOM: Gold line widths, diamond bullet style, line-spacing, detail item count (3-6), font weight variations, letter-spacing values, line lengths.
MOBILE: Body text minimum 13px. Gold lines minimum 40% width. Generous vertical spacing (24px+) between sections for thumb scrolling.`,
    },
  ],

  // ─── 주의사항 (6개) ───
  // 연구 기반: 체크리스트/번호 카드뉴스(5-10슬라이드), 아이콘+텍스트 페어링, DO/DON'T 색상 코딩
  // 대형 병원(서울아산, 서울대) 참고: 거즈관리→냉찜질→식단→금연/금주→복약→후속방문 순서
  // 색상: 라이트블루/민트+다크텍스트(신뢰), 레드/코랄(경고), 그린(허용)
  caution: [
    {
      id: 'cau_medical_checklist', name: '의료 체크리스트 표준형', color: '#3b82f6', accent: '#2563eb', bg: '#eff6ff',
      desc: '번호 원형 배지 + 세로 진행선 — 시술 후 주의사항 표준 체크리스트 (인쇄용)',
      layoutHint: 'checklist',
      aiPrompt: `MEDICAL NUMBERED CHECKLIST LAYOUT — vertical numbered list with connecting progress line. Patient safety focus. High readability for all ages. Optimized for print handout.

BACKGROUND: White with very subtle blue tint (#f8fbff), full canvas.
ZONE 1 — HEADER (top 18%): Blue (#3b82f6) solid header bar spanning full width. Hospital name "OO치과의원" in small white text (11px, weight 500) at top-left with 5% left margin. Procedure name "발치 후 주의사항" in bold large white text (22px, weight 700) centered below. Clean, professional medical header — single solid bar, no gradient.
ZONE 2 — CHECKLIST BODY (middle 57%): White background. Left side: thin vertical line in light blue (#93c5fd, 2px) running from first to last item, 12% from left edge. 5 numbered items stacked vertically with 20px gap.
EACH ITEM: Filled blue circle (#3b82f6, 28px diameter) with white number (1-5, 14px bold) centered, positioned ON the vertical line. To the right (16px gap): instruction text in dark gray (#374151, 15px, weight 500), single line.
- Item 1: "거즈를 1시간 동안 꽉 물고 계세요"
- Item 2: "당일은 뜨거운 음식과 자극적인 음식을 피하세요"
- Item 3: "처방된 약을 시간에 맞춰 복용하세요"
- Item 4: "시술 부위를 손이나 혀로 만지지 마세요"
- Item 5: "심한 운동, 음주, 흡연은 3일간 피하세요"
ZONE 3 — EMERGENCY CONTACT (bottom 25%): Light blue (#eff6ff) rounded rectangle (90% width, centered, 12px radius, 16px padding). Inside: red warning icon (▲, #ef4444, 16px) + "이런 증상이 있으면 즉시 연락하세요" in bold dark text (14px). Below: "출혈이 30분 이상 지속 / 심한 부기·통증 / 38도 이상 발열" in dark gray (13px). Blue (#3b82f6) rounded pill (80% width, centered, 40px height): "☎ 이상 증상 시: 02-000-0000" in bold white text (14px). Hospital name in small gray text (11px) below pill.

STRICT MODE ANCHORS: Blue header bar, vertical progress line with numbered circles, emergency contact box at bottom. Numbered list structure must be preserved.
INSPIRED MODE FREEDOM: Number of items (4-6), instruction text content, circle size, vertical line position, emergency symptom list, header procedure name.
MOBILE: Instruction text minimum 14px. Number circles minimum 24px. Line spacing minimum 18px. Emergency phone number must be tappable size (minimum 44px height).`,
    },
    {
      id: 'cau_warning_bold', name: '경고 강조형', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '▲ 경고 삼각형 + 레드 하이라이트 행 — 긴급 주의가 필요한 시술 후 경고 카드',
      layoutHint: 'warning',
      aiPrompt: `BOLD WARNING CARD LAYOUT — high-contrast red warning design for critical post-treatment precautions. Patient safety is paramount — every element designed for unmissable visibility.

BACKGROUND: White (#ffffff) with light red tint (#fef2f2 at 30%) at edges.
ZONE 1 — WARNING HEADER (top 22%): Large warning triangle icon (▲) in red (#ef4444) centered, 44px tall. Below: "시술 후 주의사항" in bold red (#ef4444, 24px) text centered. "아래 사항을 반드시 지켜주세요" in dark gray (#4b5563, 14px) centered. Hospital name "OO피부과" in small gray text (11px) above triangle.
ZONE 2 — WARNING LIST (middle 53%): 5 numbered precaution items, each on its own row, full width with 5% horizontal margin.
EACH ITEM: Red filled circle (#ef4444, 26px) with white number (14px bold) on the left. Instruction text in dark (#1f2937, 15px, weight 500) to the right with 12px gap.
CRITICAL ROWS (items 1, 4): Light red background strip (#fef2f2, full row width, 8px vertical padding) to visually highlight the most dangerous warnings.
NORMAL ROWS (items 2, 3, 5): White background.
- Item 1 [CRITICAL]: "출혈이 30분 이상 멈추지 않으면 즉시 내원하세요"
- Item 2: "시술 당일 음주 및 흡연은 절대 금지입니다"
- Item 3: "뜨거운 음식, 맵고 자극적인 음식을 피하세요"
- Item 4 [CRITICAL]: "심한 부기·통증·발열 시 즉시 연락하세요"
- Item 5: "거즈는 1시간 후 제거하고, 입안을 헹구지 마세요"
ZONE 3 — EMERGENCY BAR (bottom 25%): Solid red (#ef4444) bar spanning full width, 60px height. "이상 발생 시 즉시 연락" in bold white text (16px) centered. "☎ 02-000-0000 (진료시간 외: 010-0000-0000)" in white text (13px) below. Hospital name in tiny white text (10px, 70% opacity).

STRICT MODE ANCHORS: Warning triangle icon, red numbered list with highlighted critical rows, solid red emergency bar at bottom. Critical row highlighting is essential.
INSPIRED MODE FREEDOM: Number of items (4-6), which items are critical (1-2 max), instruction text content, triangle size, highlight color intensity.
MOBILE: Warning text minimum 14px. Red bar minimum 56px height. Phone number tappable (44px+). Critical row background must be clearly distinguishable from normal rows.`,
    },
    {
      id: 'cau_friendly_guide', name: '친절한 단계 안내형', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '세로 점선 + 단계별 안내 + 다음 내원일 — 불안한 환자를 위한 친절 가이드',
      layoutHint: 'guide',
      aiPrompt: `FRIENDLY STEP-BY-STEP GUIDE LAYOUT — calming green design with connected numbered steps. Warm, reassuring tone reduces patient anxiety. Includes next-visit date field.

BACKGROUND: Soft mint (#ecfdf5) to white vertical gradient (mint at top, white at bottom).
ZONE 1 — HEADER (top 18%): Hospital name "OO치과" in green (#059669, 12px, weight 500) left-aligned with 6% left margin. "임플란트 시술 후 관리 안내" in bold dark green (#065f46, 20px) below. "차근차근 따라해 주세요 :)" in warm gray (#6b7280, 13px) as friendly subtitle. Approachable, non-clinical header tone.
ZONE 2 — STEP-BY-STEP (middle 52%): 4 numbered steps arranged vertically with 24px spacing. Vertical dotted line in light green (#6ee7b7, 2px dots, 4px gap) running through all step circles, connecting top to bottom, positioned 10% from left edge.
EACH STEP: Green filled circle (#10b981, 32px) with white number (①②③④, 16px) centered ON the dotted line. To the right (14px gap): instruction text in dark gray (#374151, 15px). Friendly Korean ~세요 endings throughout.
- Step ①: "시술 후 2시간은 아무것도 드시지 마세요"
- Step ②: "부기가 있으면 찬 수건이나 아이스팩으로 찜질해 주세요"
- Step ③: "처방해 드린 약은 시간 맞춰 꼭 드세요"
- Step ④: "불편하시면 언제든지 편하게 전화주세요"
Color coding hint: green text for "허용" items, amber (#d97706) for "주의" items if mixed.
ZONE 3 — NEXT VISIT + CONTACT (bottom 30%): Light green (#d1fae5) rounded rectangle (90% width, centered, 12px radius, 16px padding).
- Top: "다음 내원 예정일" in bold dark green (#065f46, 14px). Below: "____년 __월 __일 (___요일) __시" with underline blanks for handwriting.
- Divider: thin dotted green line.
- Bottom: "궁금한 점이 있으시면 연락주세요" in green (#059669, 13px). "☎ 02-000-0000" in bold green (15px). Hospital name and address in small gray (11px).

STRICT MODE ANCHORS: Mint background, vertical dotted connecting line, numbered step circles, next-visit date box with blanks at bottom. The dotted line + circles structure is defining.
INSPIRED MODE FREEDOM: Step count (3-5), instruction text, circle size, dotted line style, next-visit box layout, additional tips section.
MOBILE: Step text minimum 14px. Circles minimum 28px. Next-visit box minimum 80px height. Generous touch spacing between steps (20px+).`,
    },
    {
      id: 'cau_timeline_recovery', name: '회복 타임라인형', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '당일→3일→1주→1개월 수평 타임라인 — 회복 단계별 관리법 한눈에 보기',
      layoutHint: 'timeline',
      aiPrompt: `RECOVERY TIMELINE LAYOUT — horizontal timeline showing care instructions across recovery stages. Color transitions from amber (caution) to green (healed). Patients see their recovery journey at a glance.

BACKGROUND: Soft lavender (#f5f3ff) to white gradient (lavender at top, white at bottom).
ZONE 1 — HEADER (top 15%): Hospital name "OO치과" in small gray text (#6b7280, 11px) centered at top. "발치 후 회복 가이드" in bold purple (#8b5cf6, 22px) centered below. Thin purple line (#8b5cf6, 1px, 40% width) centered as divider.
ZONE 2 — TIMELINE (middle 55%): Horizontal progress bar spanning 85% width, centered, 8px tall, rounded ends. Color gradient left to right: amber (#f59e0b) then light purple (#a78bfa) then blue (#3b82f6) then green (#10b981).
4 circular markers (24px diameter) positioned ON the bar at equal intervals:
- Marker 1 (left end): Amber (#f59e0b) filled circle. Label "당일" above in bold amber text (13px).
- Marker 2 (33%): Light purple (#a78bfa) circle. Label "3일 후" above in bold purple (13px).
- Marker 3 (66%): Blue (#3b82f6) circle. Label "1주일" above in bold blue (13px).
- Marker 4 (right end): Green (#10b981) circle. Label "1개월" above in bold green (13px).
INSTRUCTIONS BELOW EACH MARKER: 2 lines of instruction text in small dark gray (#4b5563, 12px), centered under each marker, max width per column ~22%.
- 당일: "거즈 1시간 유지 / 냉찜질 / 금주·금연"
- 3일 후: "부기 서서히 감소 / 미지근한 부드러운 음식"
- 1주일: "실밥 제거 내원 / 일상 식사 서서히 가능"
- 1개월: "완전 회복 확인 / 정상 활동 가능"
ZONE 3 — EMERGENCY CONTACT (bottom 30%): Purple (#8b5cf6) rounded pill bar (80% width, centered, 44px height): "회복 중 이상 증상 시 ☎ 02-000-0000" in bold white text (14px). Below pill: "출혈 지속 · 심한 통증 · 38도 이상 발열 → 즉시 내원" in small purple text (#7c3aed, 12px). Hospital name in tiny gray text (10px).

STRICT MODE ANCHORS: Horizontal timeline bar with gradient, 4 time markers with labels above and instructions below, pill-shaped emergency contact. Timeline bar is the defining structural element.
INSPIRED MODE FREEDOM: Number of markers (3-5), time intervals, instruction text, gradient colors, marker size, instruction line count, additional recovery percentage indicators.
MOBILE: Timeline can wrap to 2 rows on very narrow screens. Marker labels minimum 12px. Instructions minimum 11px. Emergency pill minimum 44px height.`,
    },
    {
      id: 'cau_infographic', name: 'O/X 인포그래픽형', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '2×3 O/X 카드 그리드 — 허용(O)과 금지(X)를 한눈에 구분하는 시각 인포그래픽',
      layoutHint: 'infographic',
      aiPrompt: `O/X INFOGRAPHIC GRID LAYOUT — 2x3 grid of icon cards showing DO (O) and DON'T (X) instructions. Instant visual comprehension — patients understand in seconds without reading long paragraphs. Color coding: green=allowed, red=prohibited.

BACKGROUND: Warm cream (#fffbeb), full canvas.
ZONE 1 — HEADER (top 15%): Hospital name "OO의원" in small gray text (#6b7280, 11px) centered at top. "시술 후 주의사항" in bold amber (#d97706, 22px) centered. "O는 해도 좋아요, X는 하지 마세요" in medium gray (#6b7280, 13px) as explanatory subtitle.
ZONE 2 — O/X GRID (middle 60%): 2 columns x 3 rows grid, centered, 10px gap. Left column = O (DO) cards, Right column = X (DON'T) cards. Each card is a rounded rectangle (~46% width, ~80px height, 12px radius).
O CARDS (left column, green): Light green background (#f0fdf4), 2px green (#22c55e) border. Large green "O" letter (36px, bold, #22c55e) on the left side of card. Instruction text (14px, dark #1f2937) to the right.
- O Card 1: "냉찜질 해주세요"
- O Card 2: "부드러운 음식 드세요"
- O Card 3: "처방약 복용하세요"
X CARDS (right column, red): Light red background (#fef2f2), 2px red (#ef4444) border. Large red "X" letter (36px, bold, #ef4444) on the left side of card. Instruction text (14px, dark #1f2937) to the right.
- X Card 1: "뜨거운 음식 금지"
- X Card 2: "음주 · 흡연 금지"
- X Card 3: "사우나 · 찜질방 금지"
The O and X letters are the dominant visual elements — instantly recognizable at a glance.
ZONE 3 — EMERGENCY (bottom 25%): Amber (#f59e0b) rounded pill (80% width, centered, 44px): "☎ 이상 증상 시: 02-000-0000" in bold white text (14px). "출혈 · 부기 · 통증 지속 시 즉시 내원" in small amber text (#d97706, 12px) below. Hospital name in tiny gray (10px).

STRICT MODE ANCHORS: 2-column O/X grid structure, green for O cards, red for X cards, large O/X letters as primary visual. Grid layout is the defining element.
INSPIRED MODE FREEDOM: Grid size (2x2 to 2x4), card content, O/X letter size, card dimensions, additional amber "△ 주의" cards for caution-level items, icon additions.
MOBILE: O/X letters minimum 28px. Card text minimum 13px. Cards minimum 60px height. Grid can reflow to single column with O/X prefix on narrow screens.`,
    },
    {
      id: 'cau_clean_card', name: 'DO/DON\'T 분할형', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: 'DO/DON\'T 좌우 2열 분할 — 해야 할 것과 하지 말아야 할 것을 양쪽으로 비교',
      layoutHint: 'card',
      aiPrompt: `DO / DON'T TWO-COLUMN SPLIT LAYOUT — left column for recommended actions, right column for prohibited actions. Most intuitive format for behavioral instructions. Green=allowed, Red=prohibited color coding.

BACKGROUND: White (#ffffff), full canvas.
ZONE 1 — HEADER (top 18%): Hospital name "OO치과" in small gray text (#6b7280, 11px) centered at top. "보톡스 시술 후 주의사항" in bold sky blue (#0ea5e9, 22px) centered. Thin sky blue line (#0ea5e9, 1px, 60% width) centered as separator.
ZONE 2 — TWO-COLUMN BODY (middle 57%): Content area split into two equal columns (48% width each) side by side with 4% center gap.
LEFT COLUMN — "이렇게 하세요 ✓": Green header bar (#22c55e, full column width, 36px height, 8px top radius) with "이렇게 하세요 ✓" in bold white text (14px) centered. Below: 4 items stacked vertically with 8px gap. Each item is a card (light green #f0fdf4 background, 8px radius, 12px padding) with small green checkmark circle (✓, #22c55e, 20px) on the left, instruction text (#374151, 14px) on the right.
- "냉찜질을 10분씩 반복하세요"
- "부드러운 미지근한 음식을 드세요"
- "처방약을 꼭 복용하세요"
- "시술 후 4시간은 충분히 쉬세요"
CENTER DIVIDER: Vertical dashed line (#d1d5db, 1px, 4px dash) from top of content area to bottom.
RIGHT COLUMN — "이것은 안 돼요 ✗": Red header bar (#ef4444, full column width, 36px height, 8px top radius) with "이것은 안 돼요 ✗" in bold white text (14px) centered. Below: 4 items with light red (#fef2f2) background cards, small red X circle (✗, #ef4444, 20px) on the left.
- "당일 음주 · 흡연 절대 금지"
- "사우나 · 찜질방 · 뜨거운 목욕 금지"
- "시술 부위를 손으로 만지지 마세요"
- "격한 운동은 3일간 피하세요"
ZONE 3 — EMERGENCY CONTACT (bottom 25%): Sky blue (#0ea5e9) rounded rectangle (90% width, centered, 12px radius, 50px height): "☎ 이상 증상 시 연락: 02-000-0000" in bold white text (15px) centered. "진료시간: 월~금 09:00~18:00 / 토 09:00~13:00" in small white text (11px, 70% opacity). Hospital name and address in tiny gray text (10px) below.

STRICT MODE ANCHORS: Two-column split with green DO header and red DON'T header, vertical center divider, checkmark/X icons, sky blue emergency bar. The dual-column comparison is the defining structure.
INSPIRED MODE FREEDOM: Item count per column (3-5), instruction text, header text, icon style, card padding, column width ratio, additional "주의" amber middle section.
MOBILE: On narrow screens, columns can stack vertically (DO on top, DON'T below). Item text minimum 13px. Header bars minimum 32px. Emergency bar minimum 48px height for touch.`,
    },
  ],  // ─── 비급여 진료비 안내 (6개) ───
  // 연구 기반: 테이블/메뉴보드 형식(법적 요구), 교대 행 배경, 최소 장식, 가격 우측 정렬
  // 의료법 제45조: 비급여 진료비 투명 공개 의무, 최종 수정일 표시
  // 색상: 화이트+다크그레이/네이비(가장 보편적), 베이지/크림(프리미엄)
  pricing: [
    {
      id: 'prc_clean_table', name: '클린 테이블 표준형', color: '#3b82f6', accent: '#2563eb', bg: '#eff6ff',
      desc: '블루 헤더 + 줄무늬 행 테이블 — 의료법 제45조 준수 비급여 진료비 표준 공시표',
      layoutHint: 'table',
      aiPrompt: `CLEAN TABLE STANDARD — the most common Korean hospital fee schedule format. Compliant with 의료법 제45조 (비급여 진료비 투명 공개 의무). Treatment name LEFT, price RIGHT alignment.

BACKGROUND: White (#ffffff) full bleed.
ZONE 1 — HEADER (top 15%): Full-width horizontal bar in blue (#3b82f6), 56px height. "비급여 진료비 안내" in bold white text (22px, weight 700) centered. Hospital name "OO치과의원" in smaller white text (12px, weight 400) above title within the bar.
ZONE 2 — TABLE BODY (middle 65%): Full-width table layout. Rows alternate white and light blue (#eff6ff at 50%). Each row (height 48px, padding 12-16px):
- LEFT: Treatment name in dark text (#1e293b, 14px, weight 500), left-aligned with 6% left margin.
- RIGHT: Price in bold blue (#2563eb, 15px, weight 700) right-aligned with 6% right margin, "원" suffix.
Thin gray (#e2e8f0, 1px) horizontal lines between rows.
CATEGORY HEADERS: Category name rows (e.g., "임플란트", "보톡스/필러", "레이저") span full width with slightly darker blue-gray (#dbeafe) background, bold text (#1e3a8a, 13px, weight 600).
Example rows:
- Category: "임플란트"
  - "오스템 임플란트 (1개)" | "1,200,000원"
  - "스트라우만 임플란트 (1개)" | "1,800,000원"
- Category: "보톡스"
  - "이마 보톡스 (50단위)" | "150,000원"
  - "사각턱 보톡스 (50단위)" | "200,000원"
ZONE 3 — FOOTER (bottom 20%): Thin gray line (#e2e8f0, 1px) separator. Small gray text (#94a3b8, 11px):
- "※ 상기 금액은 부가세(VAT) 포함 금액입니다"
- "※ 시술 범위 및 재료에 따라 달라질 수 있습니다"
- "최종 수정일: YYYY.MM.DD"
Hospital name and phone "☎ 02-000-0000" in small text.

STRICT MODE ANCHORS: Blue header bar, alternating-row table with left-name/right-price alignment, category group headers, footer with VAT and date. Table structure is essential.
INSPIRED MODE FREEDOM: Number of categories/items, price values, category names, row height, stripe color intensity, footer disclaimer text.
MOBILE: Treatment name minimum 13px. Price minimum 14px. Row height minimum 44px for touch. Category headers clearly distinguishable from item rows.`,
    },
    {
      id: 'prc_card_grid', name: '카테고리 카드형', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '2열 카테고리별 카드 그리드 — 진료 항목별로 묶은 치과/피부과 비급여 가격표',
      layoutHint: 'cards',
      aiPrompt: `CATEGORY CARD GRID — organized by treatment category in a 2-column card layout. Each card groups related treatments. Clean, organized dental/dermatology clinic style.

BACKGROUND: Very light mint (#f0fdf9) full bleed.
ZONE 1 — HEADER (top 12%): Hospital name "OO치과" in smaller dark text (#374151, 12px) centered at top. "비급여 진료비 안내" in bold teal (#059669, 22px) text centered below. Thin teal line (#10b981, 1px, 40% width) centered as divider.
ZONE 2 — CARD GRID (middle 68%): 2-column grid of category cards, centered, 14px gap. Each card represents one treatment category.
CARD DESIGN: White rounded rectangle (46% width, auto height, 12px radius, subtle shadow). Card header: category name in bold white text (14px) on a teal (#10b981) background strip (full card width, 36px height, 12px top radius). Card body (padding 14px): 2-4 treatment items listed vertically. Each item row:
- Treatment name on left in dark text (#374151, 13px)
- Price on right in bold teal (#059669, 14px, weight 700) with "원" suffix
Thin light gray (#e5e7eb, 1px) lines between items.
Cards:
- Card 1: "임플란트" — "오스템 (1개) | 1,200,000원", "스트라우만 (1개) | 1,800,000원"
- Card 2: "보톡스" — "이마 (50u) | 150,000원", "사각턱 (50u) | 200,000원"
- Card 3: "필러" — "팔자필러 (1cc) | 300,000원", "턱끝필러 (1cc) | 350,000원"
- Card 4: "레이저" — "IPL (1회) | 100,000원", "프락셀 (1회) | 250,000원"
- Card 5: "스케일링" — "일반 스케일링 | 50,000원"
- Card 6: "미백" — "전문 미백 (상·하) | 300,000원"
ZONE 3 — FOOTER (bottom 20%): Small gray text (#6b7280, 11px) centered: "※ VAT 포함 / 시술 범위에 따라 변동 가능 / 최종 수정일: YYYY.MM.DD". Hospital contact in small text.

STRICT MODE ANCHORS: 2-column card grid, teal header strip per card, treatment-name-left/price-right within each card. Card-based grouping is the defining structure.
INSPIRED MODE FREEDOM: Card count (4-8), items per card (1-4), category names, price values, card dimensions, shadow intensity, additional icons per category.
MOBILE: Cards reflow to single column. Card minimum width 280px. Treatment text minimum 12px. Price text minimum 13px.`,
    },
    {
      id: 'prc_premium_dark', name: '프리미엄 다크', color: '#1e293b', accent: '#f59e0b', bg: '#0f172a',
      desc: '다크 네이비 + 골드 가격 — 프리미엄 피부과·성형외과 고급 비급여 가격표',
      layoutHint: 'dark',
      aiPrompt: `PREMIUM DARK — dark navy background with gold accents for upscale aesthetic clinics. Luxury through restraint. Treatment name LEFT in white, price RIGHT in gold.

BACKGROUND: Dark navy (#0f172a) full bleed.
ZONE 1 — BORDER + HEADER (top 18%): Subtle gold (#f59e0b at 60%) double-line border around entire canvas — outer line 2px, inner line 1px, 6px gap. Hospital name "OO피부과" in smaller white text (#f1f5f9, 11px, letter-spacing 3px) centered at top. "비급여 진료비 안내" in gold (#f59e0b, 20px, weight 700) bold text centered below.
ZONE 2 — PRICE LIST (middle 60%): Vertically stacked treatment items with generous spacing (20px between rows).
CATEGORY HEADERS: Category name (e.g., "보톡스/필러", "레이저/리프팅", "피부관리") in small uppercase gold text (#f59e0b, 11px, letter-spacing 2px). Short gold line (40px, 1px) below category name.
ITEM ROWS: Treatment name in white (#f1f5f9, 14px, weight 400) left-aligned. Price in bold gold (#f59e0b, 15px, weight 700) right-aligned with "원" suffix. Thin gold separator lines (1px, 20% opacity) between items.
Example items:
- Category: "보톡스"
  - "이마 보톡스 (50단위)" | "150,000원"
  - "사각턱 보톡스 (50단위)" | "200,000원"
- Category: "필러"
  - "팔자 필러 (1cc)" | "300,000원"
  - "볼 필러 (1cc)" | "350,000원"
- Category: "레이저"
  - "제네시스 (1회)" | "100,000원"
  - "울쎄라 (전체)" | "2,500,000원"
ZONE 3 — FOOTER (bottom 22%): Thin gold line (80% width, centered, 1px). Small white text (#f1f5f9 at 50%, 10px): "※ VAT 포함 / 시술 범위에 따라 변동 가능". "최종 수정일: YYYY.MM.DD" in same style. Hospital phone in tiny gold text (10px).

STRICT MODE ANCHORS: Dark navy background, gold double-border frame, gold category headers with short underline, white-name/gold-price row layout. Dark-on-gold contrast is essential.
INSPIRED MODE FREEDOM: Category count, item count, border style (single vs double), gold opacity variations, spacing, additional decorative gold elements (corner ornaments).
MOBILE: Treatment name minimum 13px. Price minimum 14px. Row spacing minimum 16px. Gold lines minimum 30% opacity for visibility on dark background.`,
    },
    {
      id: 'prc_warm_wood', name: '카페 메뉴판형', color: '#92400e', accent: '#d97706', bg: '#fffbeb',
      desc: '크림 배경 + 도트 리더 연결선 — 카페 메뉴판 느낌의 따뜻한 동네 의원 가격표',
      layoutHint: 'wood',
      aiPrompt: `CAFE MENU BOARD — warm cream background styled like a cafe menu board. Dot-leader lines connect treatment names to prices. Approachable neighborhood clinic feel.

BACKGROUND: Warm cream (#fffbeb) full bleed.
ZONE 1 — HEADER (top 15%): Hospital name "OO내과의원" in smaller brown text (#92400e, 12px, weight 500) centered at top. "비급여 진료비 안내" in dark brown (#92400e, 22px, weight 700) bold text centered. Thin brown decorative line (1px, 60% width, centered) below title.
ZONE 2 — MENU LIST (middle 65%): Items grouped by treatment category. Each category section:
CATEGORY HEADER: Medium brown (#92400e, 15px, weight 600) bold text with short brown underline (30px, 2px). 28-32px spacing above each new category.
ITEM ROWS: Each row (line-height 24px, 20px gap between rows):
- Treatment name in dark brown (#78350f, 14px, weight 500) on the left.
- Dotted leader line: repeating dots (·····) in light brown (#d4a574, 12px) filling space between name and price.
- Price in bold amber (#d97706, 15px, weight 700) on the right with "원" suffix.
Example categories and items:
- "건강검진"
  - "기본 건강검진 ········· 80,000원"
  - "종합 건강검진 ········· 250,000원"
- "예방접종"
  - "독감 예방접종 ········· 35,000원"
  - "대상포진 ········· 150,000원"
- "비타민/수액"
  - "비타민C 수액 ········· 50,000원"
  - "피로회복 수액 ········· 80,000원"
ZONE 3 — FOOTER (bottom 20%): Thin brown line (#92400e, 1px, 50% width, centered). Small brown text (#a16207, 11px): "※ VAT 포함 금액입니다 / 최종 수정일: YYYY.MM.DD". Hospital address and phone in small text.

STRICT MODE ANCHORS: Cream background, dot-leader lines connecting name to price, brown/amber color scheme, category grouping. The dot-leader pattern is the defining visual characteristic.
INSPIRED MODE FREEDOM: Category count, item count, dot style (·, …, ---), brown shade variations, category header style, additional decorative elements (corner flourishes).
MOBILE: Treatment name minimum 13px. Price minimum 14px. Dot leaders must remain visible (minimum 10px). Category spacing minimum 20px.`,
    },
    {
      id: 'prc_gradient_modern', name: '모던 그라데이션형', color: '#7c3aed', accent: '#a855f7', bg: '#f5f3ff',
      desc: '라벤더 배경 + 퍼플 필 뱃지 가격 — 뷰티 클리닉/피부과 모던 비급여 가격표',
      layoutHint: 'gradient',
      aiPrompt: `MODERN GRADIENT — soft lavender background with purple pill badges for prices. Beauty clinic aesthetic. Treatment name LEFT, price in pill badge RIGHT.

BACKGROUND: Soft lavender (#f5f3ff) full bleed.
ZONE 1 — HEADER (top 13%): Hospital name "OO피부과" in smaller dark gray (#374151, 12px) centered at top. "비급여 진료비 안내" in bold purple (#7c3aed, 22px) text centered. Thin purple line (#7c3aed, 1px, 30% width) centered below.
ZONE 2 — PRICE LIST (middle 67%): Vertically stacked treatment items. Rows alternate transparent and very light purple (#ede9fe at 40%) backgrounds.
CATEGORY LABELS: Small purple (#7c3aed, 11px, letter-spacing 2px, weight 600) uppercase text above each group.
ROW LAYOUT (padding 14px vertical, 6% horizontal margin): Treatment name on left in dark text (#1f2937, 14px, weight 500). Price on right inside rounded pill-shaped badge: badge background light purple (#ede9fe), 1px purple (#c4b5fd) border, border-radius 999px, padding 6px 16px. Price text in bold purple (#7c3aed, 14px, weight 700) with "원" suffix.
Example items:
- Category: "보톡스"
  - "이마 보톡스 (50단위)" | [150,000원] (pill badge)
  - "사각턱 보톡스 (50단위)" | [200,000원]
  - "턱끝 보톡스 (30단위)" | [120,000원]
- Category: "필러"
  - "팔자 필러 (1cc)" | [300,000원]
  - "볼 필러 (1cc)" | [350,000원]
- Category: "레이저"
  - "토닝 (1회)" | [80,000원]
  - "IPL (1회)" | [100,000원]
ZONE 3 — FOOTER (bottom 20%): Small gray (#6b7280, 11px) text centered: "※ VAT 포함 / 시술 범위·횟수에 따라 변동 가능". "최종 수정일: YYYY.MM.DD". Hospital phone in small text.

STRICT MODE ANCHORS: Lavender background, pill-shaped price badges with purple border, alternating row backgrounds, category labels. The pill badge is the distinctive element.
INSPIRED MODE FREEDOM: Category count, item count, pill badge size/color, alternating row colors, category label style, additional treatment details (duration, sessions).
MOBILE: Treatment name minimum 13px. Pill badge text minimum 13px. Row height minimum 44px. Pill badges must not wrap to next line.`,
    },
    {
      id: 'prc_minimal_line', name: '미니멀 라인형', color: '#64748b', accent: '#0ea5e9', bg: '#f8fafc',
      desc: '순백 배경 + 스카이블루 가격 — 스위스 타이포그래피 미니멀 비급여 가격표',
      layoutHint: 'minimal',
      aiPrompt: `MINIMAL LINE — ultra-minimal Swiss typography-inspired price list. Pure white, maximum whitespace. No decorations whatsoever. Treatment name LEFT in charcoal, price RIGHT in sky blue.

BACKGROUND: Pure white (#ffffff) full bleed.
ZONE 1 — HEADER (top 12%): Hospital name "OO의원" in lighter gray (#94a3b8, 11px, weight 400) left-aligned or centered at top. "비급여 진료비 안내" in charcoal (#374151, 20px, weight 700) bold text. Single thin horizontal line (1px, #e2e8f0) spanning full width below title with 24px spacing.
ZONE 2 — PRICE LIST (middle 70%): Each item row contains ONLY: treatment name in charcoal (#374151, 14px, weight 400) on the left, price in bold sky blue (#0ea5e9, 15px, weight 700) on the right with "원" suffix.
NO separator lines between items — only generous whitespace (24-28px vertical gap) creates visual separation. NO icons, NO borders, NO background colors, NO dot leaders, NO badges.
ALIGNMENT: All treatment names left-aligned to same position (6% left margin). All prices right-aligned to same position (6% right margin). Grid-based Swiss typographic alignment.
Example items (no categories, just a flat list):
- "임플란트 (오스템, 1개)" | "1,200,000원"
- "임플란트 (스트라우만, 1개)" | "1,800,000원"
- "이마 보톡스 (50단위)" | "150,000원"
- "사각턱 보톡스 (50단위)" | "200,000원"
- "팔자 필러 (1cc)" | "300,000원"
- "스케일링" | "50,000원"
- "전문 미백 (상·하)" | "300,000원"
ZONE 3 — FOOTER (bottom 18%): After 32px gap, single thin line (1px, #e2e8f0, full width). Small gray (#94a3b8, 10px) text: "※ VAT 포함 / 최종 수정일: YYYY.MM.DD". Hospital contact in same style.

STRICT MODE ANCHORS: Pure white background, charcoal-name/sky-blue-price only, zero decorations, generous whitespace as only separator. The absence of decoration IS the design.
INSPIRED MODE FREEDOM: Item count, treatment names, price values, font weight variations, whitespace amounts, optional single category divider lines (thin, subtle).
MOBILE: Treatment name minimum 13px. Price minimum 14px. Vertical gap minimum 20px between items. Left/right margin minimum 5%.`,
    },
  ],
};

// ── AI 이미지 생성: 템플릿 데이터 → Nano Banana Pro ──

// 스타일 히스토리 (localStorage에 저장)
export interface SavedStyleHistory {
  id: string;
  name: string;
  stylePrompt: string; // 재사용 가능한 스타일 프롬프트
  thumbnailDataUrl: string; // 결과 이미지 축소 썸네일 (120px, UI 표시용)
  referenceImageUrl: string; // 참고 이미지 (512px, AI에 전달용 - 그림체/일러스트 재현)
  presetId?: string; // 기반 프리셋 ID (있으면)
  createdAt: number;
}

const STYLE_HISTORY_KEY = 'template_style_history';
const MAX_STYLE_HISTORY = 12; // 참고 이미지(512px) 포함이라 용량 관리

export function loadStyleHistory(): SavedStyleHistory[] {
  try {
    const raw = localStorage.getItem(STYLE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveStyleToHistory(entry: Omit<SavedStyleHistory, 'id' | 'createdAt'>): SavedStyleHistory {
  const history = loadStyleHistory();
  const newEntry: SavedStyleHistory = {
    ...entry,
    id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  history.unshift(newEntry);
  // 최대 개수 제한 + 썸네일 용량 관리
  const trimmed = history.slice(0, MAX_STYLE_HISTORY);
  localStorage.setItem(STYLE_HISTORY_KEY, JSON.stringify(trimmed));
  return newEntry;
}

export function deleteStyleFromHistory(id: string): void {
  const history = loadStyleHistory().filter(h => h.id !== id);
  localStorage.setItem(STYLE_HISTORY_KEY, JSON.stringify(history));
}

// 이미지를 리사이즈 (썸네일 or 참고 이미지)
export function resizeImageToThumbnail(dataUrl: string, maxSize: number = 120, quality: number = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// AI 참고용 중간 해상도 이미지 (512px, 그림체/일러스트 재현용)
export function resizeImageForReference(dataUrl: string): Promise<string> {
  return resizeImageToThumbnail(dataUrl, 512, 0.75);
}

export type TemplateApplicationMode = 'strict' | 'inspired';

interface AiTemplateRequest {
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution' | 'pricing';
  stylePrompt: string;
  textContent: string;
  hospitalName?: string;
  logoBase64?: string | null;
  brandingPosition?: 'top' | 'bottom';
  extraPrompt?: string;
  imageSize?: { width: number; height: number };
  hospitalInfo?: string[];
  brandColor?: string;
  brandAccent?: string;
  calendarTheme?: string;
  applicationMode?: TemplateApplicationMode;
}

/** 달력 테마별 AI 스타일 프롬프트 — SVG 템플릿의 실제 디자인 특성을 반영 */
const CALENDAR_THEME_AI_STYLE: Record<string, string> = {
  spring_kids: `[CALENDAR THEME: Spring Kindergarten / 봄 어린이]
MANDATORY VISUAL STYLE:
- Background: soft sky-blue gradient (top #AEE0F5 → bottom #EAF8F0), warm and cheerful
- Top decoration: large GREEN RIBBON BOW (forest green #5D9A3C) crossing the top like a gift wrap
- White oval center area containing the calendar content
- Yellow BUTTERFLY decoration on the right side
- Small STAR-SHAPED FLOWERS (yellow petals #FFD54F, orange center) scattered as accents
- Flower text markers (✿) beside the clinic name
- Green BANNER RIBBON behind the month title (light green #D5E9C0 with darker edges)
- WHITE FLUFFY CLOUDS in the sky area
- Bottom landscape: rolling GREEN HILLS with WOODEN FENCE (brown #8D6E63), round TREES with yellow/orange foliage, small yellow GROUND FLOWERS
- Scalloped green grass edge along the hills
- Calendar header row: dark background with white text for day names
- Sunday dates in pink/red, weekday dates in dark gray
- Events shown with pencil-style dashed underlines
- Overall mood: bright, cheerful, kindergarten-like, spring garden feel
- Color palette: sky blue, forest green, yellow, orange, white, pink
- NO confetti, NO party decorations — this is a nature/garden theme`,

  cherry_blossom: `[CALENDAR THEME: Cherry Blossom Dental / 벚꽃 치과]
MANDATORY VISUAL STYLE:
- Background: soft pink gradient (#FFF0F5 → #FFE4EC), romantic spring feel
- Large CHERRY BLOSSOM PETALS (soft pink ellipses) scattered around edges, overlapping the borders
- Each petal cluster has 5 rounded petals with a darker pink center
- Falling petals effect throughout the design
- Calendar header: pink (#E91E63) background with white text
- Event markers: colored CIRCLE BADGES with event type text inside
- Night events: purple (#8E24AA), Seminar: dark blue (#283593), Closed: pink (#E91E63)
- Month title in elegant serif-style font, dark pink color
- Clinic name in a soft banner above the calendar
- Notices at bottom with small bullet points
- Overall mood: elegant, feminine, soft, romantic spring
- Color palette: pink, soft pink, white, dark rose, touches of purple
- NO cartoon characters — sophisticated floral design`,

  autumn: `[CALENDAR THEME: Autumn Maple / 가을 단풍]
MANDATORY VISUAL STYLE:
- Background: warm cream/beige (#FFF8E7) with FALLING MAPLE LEAVES
- Large detailed MAPLE LEAVES in various autumn colors: deep orange (#D84315), red-brown, golden yellow, burnt sienna
- Leaves scattered around the edges, some overlapping the calendar card
- Calendar sits inside a white rounded CARD with subtle shadow, slight inset from edges
- Warm brown header text for month title
- Subtitle text in warm gray below the title
- Calendar header: warm orange/brown background
- Event markers: golden yellow PILL-SHAPED badges with dark text
- Closed days highlighted with warm accent colors
- Compact 5-week layout (last row may show dual dates like "23/30")
- Bottom area: more maple leaves and a warm gradient fade
- Overall mood: cozy, warm, autumnal, harvest season
- Color palette: orange, brown, golden yellow, cream, deep red
- NO cold colors — everything warm-toned`,

  korean_traditional: `[CALENDAR THEME: Korean Traditional / 한국 전통]
MANDATORY VISUAL STYLE:
- Background: elegant beige/parchment (#F5EDD5) with subtle texture feel
- Traditional Korean CRANE (학) silhouettes in gray, flying gracefully (one left, one right)
- MOUNTAIN/LANDSCAPE silhouette at bottom in soft muted blue-gray, inspired by Korean ink painting (산수화)
- Pine tree silhouettes along the mountain edges
- Calendar inside a clean white card with very subtle border
- Title area: refined serif-style typography with traditional feel
- Subtitle in classical Korean style
- Calendar header: dark navy/charcoal (#37474F) background
- Event markers: colored CIRCLES with Korean text — deep red (#8B1A2A) for closed, purple for night, blue for normal
- Traditional Korean patterns as subtle border decorations (optional)
- Overall mood: dignified, classical, refined, cultured
- Color palette: beige, navy, deep red, soft gold (#D4A853), gray-blue
- Inspired by Korean traditional art (한국화) — NOT cartoonish`,

  medical_notebook: `[CALENDAR THEME: Medical Notebook / 의료 노트북]
MANDATORY VISUAL STYLE:
- Background: clean sky blue (#E3F2FD) or soft blue
- Main content area styled like a SPIRAL NOTEBOOK page: white with blue LEFT MARGIN LINE, horizontal RULED LINES
- SPIRAL BINDING rings along the left edge (gray circles/ovals)
- Cute DOCTOR CHARACTER illustration: person in white coat with stethoscope, friendly smile
- Doctor character placed prominently above or beside the calendar
- Teal/turquoise (#26A69A) accent color for doctor's undershirt and highlights
- Calendar below the doctor character area
- Calendar header: teal/blue (#0097A7) background with white text
- Event markers with clean medical-style badges
- Font style: clean sans-serif, slightly casual/friendly
- A small tooth or medical icon as accent
- Overall mood: friendly, approachable, medical but not intimidating, slightly playful
- Color palette: white, teal, sky blue, gray, touches of coral
- Like a friendly doctor's personal notebook`,

  winter: `[CALENDAR THEME: Winter Christmas / 겨울 크리스마스]
MANDATORY VISUAL STYLE:
- Background: deep navy blue (#1A2A4A → #2C3E6B gradient), cold winter night sky
- SNOWFLAKES scattered throughout: 6-pointed crystal snowflakes in soft blue-white (#7BA7CF), varying sizes and opacities
- SANTA SLEIGH with REINDEER silhouette in the upper portion (subtle, semi-transparent)
- Pine TREE silhouettes along the bottom in dark navy/forest green
- Small warm LIGHTS or stars twinkling in the sky
- Calendar sits inside a white rounded card with soft shadow
- Title area: white or light text on dark background, elegant winter typography
- Red accent (#D32F2F) for Christmas-specific events
- Calendar header: dark blue (#283593) or navy background
- Snowdrift or snow-covered ground at the bottom
- Overall mood: serene, magical, winter wonderland, festive but elegant
- Color palette: deep navy, white, soft blue, red accent, silver
- NOT overly cartoonish — elegant winter/holiday aesthetic`,

  autumn_spring_note: `[CALENDAR THEME: Autumn Spring Note / 가을 스프링노트]
MANDATORY VISUAL STYLE:
- Background: warm off-white/cream with subtle gradient
- Main content area styled like a SPIRAL-BOUND NOTEBOOK: spiral binding dots/rings along the top edge
- MAPLE LEAVES (orange-brown #D2691E) scattered around edges with 0.85 opacity
- Decorative cloud shapes in warm cream (#F5E6C8)
- Simplified AUTUMN TREES with brown trunks (#6B4C2A) and warm foliage crowns
- Earth tone color palette: browns, tans, creams, warm oranges
- Calendar sits inside the notebook page area
- Title in warm brown/dark chocolate color
- Event markers in warm autumn tones
- Overall mood: cozy, nostalgic, warm autumn notebook feel
- Color palette: cream, chocolate brown, burnt orange, tan, warm gold
- Like a personal planner page for autumn — handcrafted feel`,

  autumn_holiday: `[CALENDAR THEME: Autumn Holiday / 가을 Holiday]
MANDATORY VISUAL STYLE:
- Background: warm beige/cream (#FDF5EC)
- Large AUTUMN LEAVES at corners: maple-style with stems in rust (#C0543B), golden brown (#C97B3A), and amber (#D4A24E)
- Brush stroke accents with low opacity for East Asian ink-wash aesthetic
- Calendar inside a white card with subtle drop shadow
- Round leaf shapes for variety mixed with pointed maple leaves
- Various leaf rotations creating natural scattered effect
- Clean title typography in dark brown
- Event markers: ROUND CIRCLE BADGES with colored backgrounds
- Closed days in red, normal in warm accents
- Overall mood: refined autumn with traditional East Asian artistic sensibility
- Color palette: beige, rust brown, golden amber, dark brown (#8B6914), cream white
- Elegant and minimal — NOT cartoonish`,

  hanok_roof: `[CALENDAR THEME: Hanok Roof / 한옥 기와]
MANDATORY VISUAL STYLE:
- Background: warm beige (#F0E6D3)
- Large SALMON/CORAL HALF-CIRCLE (#E8856A) at top center (stylized sun)
- Traditional Korean HANOK ROOF TILES structure: curved ridge line with repeated tile pattern in dark gray (#4A4A4A, #3A3A3A)
- Beige CLOUDS with 0.5 opacity in East Asian ink-painting style
- Korean traditional CORNER PATTERNS: concentric geometric squares in brown (#8B7355)
- Calendar inside a bordered frame with traditional feel
- Title in dignified serif-style Korean typography
- Event colors: red for closed, purple for night, coral for normal, brown for seminar
- Overall mood: cultural heritage, sophisticated, celebrating Korean traditional architecture
- Color palette: beige, coral/salmon, dark gray, brown, cream
- Inspired by Korean hanok buildings — dignified and respectful`,

  dark_green_clinic: `[CALENDAR THEME: Dark Green Clinic / 다크그린 클리닉]
MANDATORY VISUAL STYLE:
- Background: split design — dark teal/green header (#2C4A4A) on top, lighter area below
- Professional medical palette: dark teals, forest greens (#3A7D5C, #2E7D52)
- WHITE TOOTH ICON (molar silhouette) as medical branding element
- Event markers: DIAMOND-SHAPED BADGES (45-degree rotated squares) for type differentiation
- Layered green rectangles with low opacity suggesting healthcare facility
- Calendar with clean grid layout on white/light background
- Red accents (#D32F2F) for closed days
- Title in white text on dark green header
- Overall mood: professional, trustworthy, medical/dental clinic branding
- Color palette: dark teal, forest green, white, red accent, light gray
- Clean and clinical — premium healthcare aesthetic`,

  dark_blue_modern: `[CALENDAR THEME: Dark Blue Modern / 다크블루 모던]
MANDATORY VISUAL STYLE:
- Background: DEEP NAVY gradient (#0D1B3E → #162850), dark and premium
- QUARTER-CIRCLE HALFTONE DOT PATTERNS in all four corners: blue dots (#5A8DBF) with varying sizes, 0.25 opacity
- Modern tech/corporate aesthetic with elegant bokeh-like dot effects
- Calendar displayed as a TABLE GRID with clear borders on dark background
- White or light text on dark navy background throughout
- Clean modern sans-serif typography
- Day headers in bold, dates in clean grid cells
- Closed days highlighted with red or contrasting accent
- Event text inside the calendar cells with subtle color coding
- Overall mood: contemporary, minimalist, premium, sleek corporate
- Color palette: deep navy, white, cool blue (#5A8DBF), subtle gray, red accent
- Like a premium tech company's internal calendar — NOT a typical hospital design
- NO cute illustrations — pure modern minimalist design`,

  lavender_sparkle: `[CALENDAR THEME: Lavender Sparkle / 라벤더 스파클]
MANDATORY VISUAL STYLE:
- Background: soft LAVENDER GRADIENT (#F3E8FF → #FDFCFF), light and airy
- SPARKLE/STAR shapes scattered throughout: four-pointed stars in various purple shades (#7C3AED, #A78BFA, #C4B5FD) with 0.7 opacity
- Multiple sparkles in varying sizes creating magical, whimsical effect
- Calendar header: rounded rectangle in light purple (#E8D5F5)
- Title in deep purple (#5B21B6), elegant and bold
- Vibrant purple (#7C3AED) as primary accent color
- Sunday dates in red (#DC2626), other dates in dark gray
- Clean rounded shapes throughout the design
- Event markers with purple-toned badges
- Overall mood: playful, magical, feminine, modern and cheerful
- Color palette: lavender, deep purple, light violet, white, red accent
- Sparkly and enchanting — like a magical planner design`,
};

// =============================================
// DESIGNER PERSONA - 10-year veteran graphic designer identity
// Injected into ALL image generation prompts for consistent quality
// =============================================
export const DESIGNER_PERSONA = `[DESIGNER IDENTITY]
You are a veteran Korean hospital marketing designer with 10+ years of experience at 똑닥, 강남언니, and major Korean hospital groups.
You specialize in Korean medical clinic SNS images — monthly schedules, event promotions, doctor introductions, notices, holiday greetings, hiring posts, patient care guides, and price lists.
Your work is used daily by real Korean hospitals (치과, 피부과, 성형외과, 내과, 한의원, 정형외과). Patients and staff see these images on Instagram, KakaoTalk, and clinic waiting room displays.

[DESIGN PHILOSOPHY — PRACTICAL HOSPITAL TOOL, NOT CONCEPT ART]
- Every image must function as a REAL hospital communication tool that patients can read and act on
- Design like 똑닥/미리캔버스 Korean hospital templates — clean, professional, immediately usable
- NEVER design like a design school portfolio piece, art exhibition poster, or creative concept
- If a patient cannot understand the information within 3 seconds on their phone, the design has FAILED
- Korean text readability is the #1 priority — minimum 14pt equivalent for body text, 28pt+ for headings
- Information hierarchy: title > key data (dates, prices, names) > supporting details > contact/footer
- Generous whitespace, clear section separation, structured information rows
- Mobile-first: all content must be legible on a phone screen without zooming

[DESIGN CHARACTERISTICS]
- Clean, organized, professional — NEVER messy, cluttered, or overly decorative
- Excellent readability above all else — Korean 가독성 is non-negotiable
- Clear information delivery with strong visual hierarchy
- Title > Key Info > Supporting Info — always in this reading order
- Generous whitespace for clean, organized layouts
- Elegant but never exaggerated — no Art Deco, no thermometer gauges, no code editor motifs
- Trustworthy medical/healthcare-appropriate aesthetic
- Mobile-friendly legible notice images — designed for Instagram feed (4:5 ratio)
- Series-capable: multiple images look unified as one brand system
- Korean medical advertising law compliant: no superlatives (최고/유일/첫/독보적), no outcome guarantees

[DESIGN STYLE]
clean, minimal, modern, elegant, premium, readable, organized, trustworthy, medical-friendly, professional notice design

[COLOR PALETTE]
Main: navy, deep blue, clean blue
Support: white, light gray, soft blue-gray
Accent: soft mint, soft coral (used sparingly)
Overall feel: clean, trustworthy hospital atmosphere with restrained color use

[TYPOGRAPHY]
- Titles: large and bold
- Key info: clearly aligned
- Body: easy to read
- Generous line-height and spacing
- Korean readability is TOP priority

[VISUAL ELEMENTS]
- Only simple icons when needed (icons support info, never dominate)
- Decorative elements: MINIMAL
- Backgrounds must NEVER overpower text readability

[ABSOLUTE DON\'Ts]
- Flyer-like busy designs
- Excessive decorations
- Garish color combinations
- Tacky effects (drop shadows, bevels, gradients everywhere)
- Advertisement/poster-like exaggeration
- Backgrounds that overpower text
- Childish graphic elements
- Cluttered layouts with no breathing room`;

// Series design rules for multi-page templates (hiring, card news)
export const SERIES_DESIGN_RULES = `[SERIES DESIGN RULES - for multi-page templates]
All pages in a series MUST look like they were made by the same designer, same template, same brand:
1. Same color palette across all pages
2. Same typography styles maintained
3. Same layout grid rules
4. Same icon style
5. Same design elements repeated
6. Same spacing/margin structure
7. Each page differs only in ROLE, overall design tone stays identical
8. When viewed together, they must read as ONE cohesive series`;

// =============================================
// DESIGN SYSTEM V2 — 2025-2026 Medical Image Standard
// =============================================
export const DESIGN_SYSTEM_V2 = `[DESIGN SYSTEM V2 — 2025-2026 Korean Medical SNS Standard]
FORMAT: 4:5 vertical ratio (1080×1350px recommended). Important content within center 1080×1080px safe zone. Side margins 48px+, top safe 12%, bottom safe 10%.
3-SECOND RULE: Core message must be comprehensible within 3 seconds at mobile phone distance.
TYPOGRAPHY: Sans-serif only (Pretendard/Noto Sans KR style). Heading Bold 28-36pt tracking -0.02em, subheading SemiBold 18-22pt, body Regular 14-16pt lh1.6 (minimum 14px for mobile readability), caption Light 11-13pt 60% opacity, price Bold 40-56pt. Sufficient line-height (행간) for Korean text.
COLOR: max 3 colors per design (primary+accent+neutral). text-primary #0f172a, text-secondary #64748b. Medical trust palette: soft blue (#B3E5FC/#29B6F6), navy (#37474F), teal (#00BCD4), mint/sage green, clean white. Dermatology/aesthetics: beige/cream/ivory. No neon/fluorescent.
SURFACES: cards white radius 16px shadow 0 4px 24px rgba(0,0,0,0.06), badges primary/10% radius 8px, dividers 1px rgba(0,0,0,0.06).
INFO HIERARCHY: title > key information > supporting details > contact/footer. Each zone clearly separated.
INFO BLOCKS: date/time=icon+text left-aligned, contact=phone icon+number, price=large number right-aligned, caution=warning icon+amber/red.
TEXT LIMITS: title max 15chars, subtitle max 25chars, body max 3lines per block, max 4 text zones per image.
ICONS: simple line or flat minimal only. No 3D, no icon gradients, no stock photos. Small clock/calendar/tooth icons are acceptable.
CTA: pill radius 24px, max 1 per image, max 10chars.
KOREAN MEDICAL LAW: No superlatives (최고/유일/첫/독보적). No unverified before/after comparisons. No guarantees of treatment outcome. All claims must be objective and verifiable.
FEED COHESION: Consistent ton-and-manner (톤앤매너) across posts. Same color palette, typography weight, spacing rhythm within a template set.
FORBIDDEN: starburst/explosion, comic-book energy lines, confetti/sparkle/glitter, multiple fonts, <12pt text, >1px borders, sharp corners, >rgba(0,0,0,0.1) shadows, fake urgency (!! ★★★), watermarks, sticker/flyer effects, clip-art medical illustrations, 3D metallic text, handwritten notices, Comic Sans equivalent fonts.
CONCEPT ART FORBIDDEN: Art Deco arches, thermometer gauges, code editor braces, film strip frames, vinyl record layouts, retro TV screens, origami shapes, DNA helix structures, circuit board patterns, blueprint grids. These are design school concepts, NOT hospital tools.
PRACTICAL REQUIREMENT: Every generated image must look like it could be posted TODAY on a real Korean hospital's Instagram account. If it looks like a design portfolio piece or creative concept rather than a functional hospital communication, it has FAILED.`;

function buildTemplateAiPrompt(req: AiTemplateRequest): string {
  const { category, stylePrompt, textContent, hospitalName, extraPrompt, imageSize, calendarTheme } = req;

  const categoryLabels: Record<string, string> = {
    schedule: 'hospital monthly schedule / clinic calendar announcement - clean, modern, trustworthy medical design. MUST include 점심시간 (lunch break) info if provided. Use table/grid layout with clear day headers (일월화수목금토). Sunday=red, Saturday=blue. Closed days clearly marked. Mobile-readable at phone distance.',
    event: 'hospital promotion / medical event announcement - eye-catching yet professional, clear price hierarchy. CRITICAL: discount number must be largest element (48-72pt equivalent). Show original price with strikethrough + discounted price prominently. Event period dates must be clearly visible. Korean medical advertising law: no superlatives (최고/유일/첫), no guarantees of outcome.',
    doctor: 'doctor introduction / new physician announcement - professional, trustworthy portrait-style medical profile. CRITICAL Korean medical law compliance: NEVER use superlatives like 최고(best), 유일(only), 첫(first), 독보적(unrivaled). Only list verifiable credentials (학력, 전공, 자격증, 학회). Avoid subjective quality claims.',
    notice: 'hospital notice / important announcement - clean, authoritative, easy to read at a glance. Centered single-card layout preferred. Structured information rows. Include resumption date (진료 재개일) if applicable. Emergency contact or alternative clinic info at bottom.',
    greeting: 'holiday greeting / seasonal message from hospital - warm, heartfelt, culturally appropriate Korean design. Use traditional Korean motifs appropriate to the specific holiday. Calligraphic greeting text (서예체 style). Include hospital branding subtly at bottom.',
    hiring: `hospital job posting / staff recruitment announcement.
${SERIES_DESIGN_RULES}
CRITICAL DESIGN RULES FOR HIRING:
- Design like a premium Instagram recruiting post (NOT a cluttered poster)
- Use clean ICONS and VISUAL SYMBOLS for benefits/requirements (checkmarks, briefcase, shield, heart icons)
- Typography: Bold clean sans-serif headings, regular weight for body text
- Layout: Clear visual sections with generous whitespace between items
- Color: Use the style preset colors as primary, with white backgrounds for content cards
- DO NOT add random clip art, hands holding phones, or unrelated stock imagery
- DO NOT generate garbled or random Korean text - ONLY use the exact text provided
- Keep it MINIMAL: icons + provided text only, no extra decorative Korean words`,
    caution: `post-treatment / post-procedure patient care instructions.
CRITICAL DESIGN RULES FOR CAUTION:
- Design like a clean professional medical handout that patients take home
- Must be HIGHLY READABLE: minimum 16pt equivalent font size for all body text
- Clear visual hierarchy: title > numbered items > footer
- Use friendly medical illustrations (tooth, medicine, ice pack icons)
- Numbered list with generous line spacing between items
- Soft, calming color palette - NOT alarming or scary
- Emergency contact in a clearly visible box at the bottom`,
    pricing: `hospital non-covered treatment pricing / fee schedule announcement.
CRITICAL DESIGN RULES FOR PRICING:
- Design like a premium hospital price list or menu board
- Clean TABLE or LIST layout with clear item-price alignment
- Treatment names LEFT-aligned, prices RIGHT-aligned with dotted leader lines or clear spacing
- Bold prices in accent color for visibility
- Professional medical aesthetic — NOT like a restaurant menu
- Clean section dividers between item groups
- Title at top, disclaimer/notice at bottom in smaller text
- Use medical icons (tooth, syringe, etc.) sparingly as accents
- Generous whitespace, easy to scan at a glance`,
  };

  const isPortrait = imageSize && imageSize.width > 0 && imageSize.height > 0 && imageSize.height > imageSize.width;
  const aspectDesc = imageSize && imageSize.width > 0 && imageSize.height > 0
    ? (imageSize.width > imageSize.height ? 'landscape (wide)'
      : imageSize.width < imageSize.height ? `portrait (tall, ${imageSize.width}:${imageSize.height} ratio ~${(imageSize.width / imageSize.height).toFixed(2)})`
      : 'square 1:1')
    : 'square 1:1';

  // 추가 프롬프트를 상단 우선순위로
  const userRequestBlock = extraPrompt ? `
🚨🚨🚨 [USER'S SPECIAL REQUEST - HIGHEST PRIORITY!] 🚨🚨🚨
The user specifically asked for the following. YOU MUST follow this:
${extraPrompt}
This request OVERRIDES default sizing, positioning, and styling rules.
🚨🚨🚨 END OF USER REQUEST 🚨🚨🚨
` : '';

  // 달력 카테고리일 때 날짜 정확성 강조
  const calendarAccuracyBlock = category === 'schedule' ? `
🔢 [CALENDAR DATA ACCURACY - CRITICAL!]
The calendar grid below contains the ONLY correct data. Do NOT guess or use data from reference images.
Every single date number, day-of-week alignment, and marked day MUST match exactly.
If a reference image was provided, its calendar dates are from a DIFFERENT month - IGNORE them completely.
` : '';

  // 달력 테마 스타일 블록 — 선택한 테마의 디자인 특성을 AI에 전달
  const calendarThemeBlock = (category === 'schedule' && calendarTheme && CALENDAR_THEME_AI_STYLE[calendarTheme])
    ? `
🎨🎨🎨 [CALENDAR DESIGN THEME - HIGHEST VISUAL PRIORITY!] 🎨🎨🎨
${CALENDAR_THEME_AI_STYLE[calendarTheme]}
You MUST follow this theme's visual style exactly. This OVERRIDES the generic [DESIGN STYLE] preset below.
The calendar must look like this specific theme — not a generic hospital calendar.
🎨🎨🎨 END OF THEME INSTRUCTIONS 🎨🎨🎨
` : '';

  // 브랜드 컬러 블록
  const brandColorBlock = (req.brandColor || req.brandAccent) ? `
[BRAND COLORS - USE THESE AS PRIMARY DESIGN COLORS]
${req.brandColor ? `Main color: ${req.brandColor}` : ''}
${req.brandAccent ? `Accent color: ${req.brandAccent}` : ''}
Use these colors for headings, backgrounds, accents, and key UI elements. These override preset style colors.` : '';

  // 브랜딩 블록
  const brandingBlock = hospitalName ? (() => {
    const pos = req.brandingPosition || 'top';
    const posLabel = pos === 'top' ? 'HEADER (top of image)' : 'FOOTER (bottom of image)';
    const posDetail = pos === 'top'
      ? 'Place branding at the TOP, above all content.'
      : 'Place branding at the BOTTOM, below all content.';
    const logoInstructions = req.logoBase64
      ? `- Hospital LOGO and NAME side by side: [LOGO] [NAME]
- Grouped as ONE TIGHT unit with NO gap between them, logo left, name right, vertically centered
- ⚠️ Logo and hospital name MUST be adjacent/touching - never separated by other content`
      : `- Display "${hospitalName}" in a clean font`;
    const portraitWarning = isPortrait
      ? `\n⚠️ PORTRAIT FORMAT: Logo and hospital name MUST stay together as one compact group. Do NOT spread them apart vertically.`
      : '';
    return `
[HOSPITAL BRANDING - ${posLabel}]
"${hospitalName}"
${posDetail}
${logoInstructions}${portraitWarning}`;
  })() : '';

  // 병원 기본 정보 블록 (진료시간, 전화, 주소)
  const hospitalInfoBlock = req.hospitalInfo && req.hospitalInfo.length > 0 ? `
[HOSPITAL INFO - display at the bottom of the image, small but legible text]
${req.hospitalInfo.map(line => `"${line}"`).join('\n')}` : '';

  return `${DESIGNER_PERSONA}

🚨 CRITICAL: KOREAN TEXT ACCURACY 🚨
ONLY render Korean text from "quotes" in [TEXT CONTENT] below.
DO NOT invent/generate/guess any Korean text. Use ICONS and SHAPES to fill space instead.

KOREAN TEXT RULES:
1. ONLY text in "quotes" below may appear in the image
2. Copy each character EXACTLY - no approximations
3. Use clean sans-serif font (Pretendard/Noto Sans KR style)
4. Use FEWER Korean words when in doubt, not more
5. Fill space with ICONS, ILLUSTRATIONS, DECORATIVE SHAPES - never with made-up text
${userRequestBlock}
[IMAGE TYPE]
${categoryLabels[category] || 'hospital announcement'}
${calendarAccuracyBlock}${calendarThemeBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${req.applicationMode === 'strict' ? `[DESIGN APPLICATION MODE: STRICT — 레이아웃 복제]
LAYOUT REPLICATION — less than 5% structural deviation.
- Replicate zone proportions exactly (header/body/footer ratios ±5%)
- Keep element placement order identical to template
- Use exact color codes from template — no tone shifts
- Maintain decorative element count and positions
- Only substitute text content to user's input
- Do NOT add, remove, or reposition any structural element
- Result must look like a direct variant of the same template
- PRACTICAL CHECK: the result must still function as a real Korean hospital communication tool — if strict replication produces something unusable, prioritize readability and information clarity over decorative accuracy
` : `[DESIGN APPLICATION MODE: INSPIRED — 목적 유지, 구조 재해석]
CREATIVE REFERENCE — template is mood/direction reference, NOT a blueprint.
ALLOWED: reinterpret zone proportions (±30%), reorder non-critical elements, adjust color tones within same family, add/remove subtle decorative elements, vary typography weight/size.
REQUIRED: maintain information hierarchy (title>key info>supporting), maintain readability and professional medical feel, follow DESIGN_SYSTEM_V2 spacing/safe area/text limits.
PRACTICAL REQUIREMENT: the result must look like it was designed for a REAL Korean hospital Instagram account. If the inspired interpretation produces something that looks like concept art or a design portfolio piece rather than a functional hospital post, it has FAILED. Reference 똑닥/미리캔버스 Korean hospital templates for the expected quality bar.
`}
${DESIGN_SYSTEM_V2}
━━━━━━━━━━━━━━━━━━━━━━━━━━
[DESIGN STYLE — Template Layout]
${stylePrompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${brandColorBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━
[TEXT CONTENT - ONLY render text in "quotes"]
${textContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${brandingBlock}
${hospitalInfoBlock}

[IMAGE SPECIFICATIONS]
- Aspect ratio: ${aspectDesc} (ALWAYS use this ratio, IGNORE reference image ratio)
- Resolution: high quality, crisp rendering
- Korean text: large, clean sans-serif (minimum 24pt equivalent)
- Empty areas: fill with icons/illustrations, NOT text

⛔ FORBIDDEN:
- Inventing Korean text not in quotes above
- Rendering instruction labels ("[MAIN TITLE]", "날짜:", "제목:")
- Copying text/numbers/dates from reference images
- Page numbering ("PAGE X of Y")
- Garbled/random Korean (찬당쩡, 맘보행 = WRONG)
- Watermarks, stock photo aesthetic, cluttered layouts
- Random clip art (hands holding phones, unrelated objects)`.trim();
}

function buildScheduleTextContent(data: {
  month: number; year: number; title: string;
  closedDays?: { day: number }[];
  shortenedDays?: { day: number; hours?: string }[];
  vacationDays?: { day: number; reason?: string }[];
  notices?: string[];
  layout?: 'full_calendar' | 'week' | 'highlight';
}): string {
  const { month, year, title, closedDays, shortenedDays, vacationDays, notices, layout = 'full_calendar' } = data;

  // 마킹된 모든 날짜 수집 (주간/강조형에서 사용)
  const allMarkedDays = new Set<number>();
  closedDays?.forEach(d => allMarkedDays.add(d.day));
  shortenedDays?.forEach(d => allMarkedDays.add(d.day));
  vacationDays?.forEach(d => allMarkedDays.add(d.day));

  let content = `"${title}"\n\n`;

  if (layout === 'full_calendar') {
    // 전체 달력 그리드
    content += `[LAYOUT: FULL MONTHLY CALENDAR - show complete ${month}월 calendar grid with all dates]\n\n`;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const lastDate = new Date(year, month, 0).getDate();
    let calGrid = `일 월 화 수 목 금 토\n`;
    let dayNum = 1;
    let line = '   '.repeat(firstDay);
    for (let i = firstDay; i < 7 && dayNum <= lastDate; i++) {
      line += String(dayNum).padStart(2, ' ') + ' ';
      dayNum++;
    }
    calGrid += line.trimEnd() + '\n';
    while (dayNum <= lastDate) {
      line = '';
      for (let i = 0; i < 7 && dayNum <= lastDate; i++) {
        line += String(dayNum).padStart(2, ' ') + ' ';
        dayNum++;
      }
      calGrid += line.trimEnd() + '\n';
    }
    content += calGrid;

  } else if (layout === 'week') {
    // 한 주 달력형: 마킹된 날짜가 포함된 주만 표시
    content += `[LAYOUT: WEEKLY CALENDAR - show ONLY the relevant week(s) containing marked dates as a horizontal day strip]\n`;
    content += `[Design as a clean weekly bar: 일 월 화 수 목 금 토 with date numbers, highlight marked days]\n\n`;

    const firstDay = new Date(year, month - 1, 1).getDay();
    const lastDate = new Date(year, month, 0).getDate();
    const weeks: number[][] = [];
    let week: number[] = new Array(firstDay).fill(0);
    for (let d = 1; d <= lastDate; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(0); weeks.push(week); }

    // 마킹된 날짜가 포함된 주만 추출
    const relevantWeeks = weeks.filter(w => w.some(d => allMarkedDays.has(d)));
    if (relevantWeeks.length === 0 && weeks.length > 0) {
      // 마킹 없으면 현재 주 or 첫째 주
      relevantWeeks.push(weeks[0]);
    }

    content += `일 월 화 수 목 금 토\n`;
    for (const w of relevantWeeks) {
      content += w.map(d => d === 0 ? '  ' : String(d).padStart(2, ' ')).join(' ') + '\n';
    }

  } else {
    // 강조형: 달력 그리드 없이 날짜만 크게 강조
    content += `[LAYOUT: HIGHLIGHT STYLE - NO calendar grid! Instead, display key dates as large, bold, eye-catching elements]\n`;
    content += `[Design: Big date numbers/ranges prominently displayed with icons and color-coded labels]\n`;
    content += `[Think: "3일, 10일, 17일 휴진" displayed as large stylized date badges or cards]\n\n`;
    content += `${year}년 ${month}월\n`;
  }

  if (closedDays && closedDays.length > 0) {
    content += `\n🔴 휴진일: ${closedDays.map(d => `${d.day}일`).join(', ')}`;
  }
  if (shortenedDays && shortenedDays.length > 0) {
    content += `\n🟡 단축진료: ${shortenedDays.map(d => `${d.day}일${d.hours ? ` (${d.hours})` : ''}`).join(', ')}`;
  }
  if (vacationDays && vacationDays.length > 0) {
    content += `\n🟣 휴가: ${vacationDays.map(d => `${d.day}일${d.reason ? ` (${d.reason})` : ''}`).join(', ')}`;
  }
  if (notices && notices.length > 0) {
    content += `\n\n안내사항:\n${notices.map(n => `• ${n}`).join('\n')}`;
  }

  return content;
}

function buildEventTextContent(data: {
  title: string; subtitle?: string; price?: string; originalPrice?: string;
  discount?: string; period?: string; description?: string;
}): string {
  // AI에게 레이아웃 힌트를 주되 "라벨:" 형태가 이미지에 나오지 않게!
  let content = `[MAIN TITLE - largest, bold, center] "${data.title}"`;
  if (data.subtitle) content += `\n[SUBTITLE - smaller, above title] "${data.subtitle}"`;
  if (data.discount) content += `\n[BADGE - eye-catching accent color] "${data.discount}"`;
  if (data.originalPrice) content += `\n[STRIKETHROUGH price] "${data.originalPrice}"`;
  if (data.price) content += `\n[HIGHLIGHT price - large, bold, accent color] "${data.price}"`;
  if (data.period) content += `\n[PERIOD - small text] "${data.period}"`;
  if (data.description) content += `\n[DETAILS]\n${data.description}`;
  return content;
}

function buildDoctorTextContent(data: {
  doctorName: string; specialty: string; career: string[]; greeting?: string; hasPhoto?: boolean;
}): string {
  let content = '';
  if (data.hasPhoto) {
    content += `[DOCTOR PHOTO - use the provided doctor photo image, display it prominently as a professional headshot, circular or rounded frame recommended]\n`;
  }
  content += `[NAME - largest, bold] "${data.doctorName}"`;
  content += `\n[SPECIALTY - accent color badge] "${data.specialty}"`;
  if (data.career.length > 0) content += `\n[CAREER LIST - clean bullet points]\n${data.career.map(c => `• ${c}`).join('\n')}`;
  if (data.greeting) content += `\n[GREETING - italic or light weight] "${data.greeting}"`;
  return content;
}

function buildNoticeTextContent(data: {
  title: string; content: string[]; effectiveDate?: string;
}): string {
  let text = `[TITLE - largest, bold, center] "${data.title}"`;
  if (data.content.length > 0) text += `\n[CONTENT - numbered list, readable]\n${data.content.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
  if (data.effectiveDate) text += `\n[EFFECTIVE DATE - subtle, bottom] "${data.effectiveDate}"`;
  return text;
}

function buildGreetingTextContent(data: {
  holiday: string; greeting: string; closurePeriod?: string;
}): string {
  // 명절별 상세 테마 장식 힌트 (구체적 오브젝트 + 컬러 팔레트 + 분위기 지시)
  const holidayDecorations: Record<string, string> = {
    '설날': `Traditional Korean Lunar New Year (설날/Seollal) theme.
MUST-HAVE OBJECTS: 복주머니 (fortune pouches) in red/gold silk, 한복 patterns, 매화 (plum blossoms) branches, 떡국 (rice cake soup) steam illustration, 세뱃돈 envelopes, Korean knot ornaments (매듭).
COLOR PALETTE: Deep red (#dc2626), gold (#d4a017), warm cream (#fef7ed), burgundy accents.
PATTERNS: Traditional Korean cloud motifs (구름문양), dancheong (단청) border patterns, geometric Korean lattice.
MOOD: Dignified, festive, warm family gathering, new beginnings, prosperity wishes.
BACKGROUND: Warm cream or soft red gradient. NO modern/Western New Year elements.`,
    '추석': `Korean Chuseok/Harvest Moon Festival (추석/한가위) theme.
MUST-HAVE OBJECTS: Large luminous full moon (보름달), 송편 (half-moon rice cakes) on pine needle plate, 감 (persimmons), 밤 (chestnuts), Korean pear, 갈대 (pampas grass/silver grass) silhouettes, 달토끼 (moon rabbit) silhouette.
COLOR PALETTE: Deep midnight blue (#1e3a5f), golden amber (#f59e0b), warm brown (#78350f), moonlight ivory.
PATTERNS: Moon halo glow, autumn maple leaf borders, traditional Korean pattern accents.
MOOD: Abundant harvest, family reunion, moonlit autumn night, nostalgic warmth, gratitude.
BACKGROUND: Dark navy/midnight gradient with golden moon glow. Rich autumnal warmth.`,
    '새해': `International/Western New Year celebration (새해/Happy New Year 2026) theme.
MUST-HAVE OBJECTS: "2026" large typography, fireworks bursts, confetti and streamers, champagne glasses/bubbles, midnight clock at 12:00, sparklers, party poppers.
COLOR PALETTE: Midnight purple (#4c1d95), electric violet (#7c3aed), gold sparkle (#fbbf24), silver (#c0c0c0), hot pink accents.
PATTERNS: Starburst patterns, glitter scatter, bokeh light dots.
MOOD: Celebration, excitement, glamorous midnight party, fresh start, countdown energy.
BACKGROUND: Dark midnight blue/purple gradient with sparkle effects. NOT Korean traditional style.`,
    '어버이날': `Korean Parents' Day (어버이날, May 8th) theme.
MUST-HAVE OBJECTS: Red and pink carnation flowers (카네이션) - THE symbol of Korean Parents' Day, carnation bouquet with green ribbon bow, heart shapes, handwritten-style "감사합니다" text, warm embrace imagery.
COLOR PALETTE: Carnation red (#e11d48), soft rose pink (#fb7185), warm cream (#fff1f2), gentle green (#22c55e) for stems/leaves.
PATTERNS: Soft watercolor flower petals, gentle petal scatter, ribbon bows.
MOOD: Deep gratitude (감사), warm love (사랑), tender emotion, heartfelt sincerity, touching and emotional.
BACKGROUND: Soft pink/cream gradient. Warm, tender, NOT flashy or festive. Emphasis on sincerity.`,
    '크리스마스': `Christmas (크리스마스/Merry Christmas) celebration theme.
MUST-HAVE OBJECTS: Christmas tree with ornaments and star topper, snowflakes, gift boxes with ribbons, candy canes, holly and berries, Christmas wreath, golden bells, stockings, santa hat accent.
COLOR PALETTE: Classic red (#ef4444), forest green (#166534), gold (#d4a017), snow white, warm brown (wood/gingerbread).
PATTERNS: Snowflake patterns, plaid/tartan accents, twinkling star lights, pine branch borders.
MOOD: Warm cozy holiday, twinkling lights, snowy winter wonderland, family warmth, magical festive feeling.
BACKGROUND: Deep green or deep red gradient. Warm golden light effects.`,
  };
  const deco = holidayDecorations[data.holiday] || 'Festive holiday theme with appropriate seasonal decorations matching the holiday type.';

  let content = `[HOLIDAY VISUAL THEME - CRITICAL: decorate the image with these SPECIFIC elements]\n${deco}`;
  content += `\n\n[GREETING MESSAGE - largest, bold, center, beautiful typography with decorative frame]\n"${data.greeting}"`;
  if (data.closurePeriod) content += `\n\n[CLOSURE INFO - small, subtle card at bottom] "휴진 안내: ${data.closurePeriod}"`;
  return content;
}

function buildHiringTextContent(data: {
  pageData: { type: string; content: string }[]; currentPage?: number; totalPages?: number;
}): string {
  const { currentPage, totalPages, pageData } = data;
  const pageIndex = (currentPage || 1) - 1;
  const page = pageData[pageIndex] || pageData[0] || { type: 'cover', content: '' };
  const lines = String(page.content || '').trim().split('\n').filter(Boolean);

  const typeHints: Record<string, { layout: string; fallback: string }> = {
    cover: {
      layout: 'COVER PAGE - bold, modern hero design. Large prominent title centered, accent color background block or gradient, ONE strong visual icon (briefcase/people/plus). Keep it SIMPLE - title + subtitle + hospital name only. NO lists, NO detailed text on cover.',
      fallback: '직원 모집',
    },
    requirements: {
      layout: 'REQUIREMENTS PAGE - clean numbered/bulleted list with small icon per item (checkmark, star, badge). White card background with items, generous spacing between each requirement. Each line gets its own row with icon + text.',
      fallback: '자격 요건',
    },
    benefits: {
      layout: 'BENEFITS PAGE - 2x2 or 2x3 icon grid layout. Each benefit in its own card/cell with a relevant ICON above and text below (shield=insurance, utensils=meals, calendar=vacation, coin=bonus). Warm, inviting color scheme.',
      fallback: '복리후생',
    },
    contact: {
      layout: 'CONTACT/APPLICATION PAGE - prominent CTA button style at center, contact details in clean card below. Large "지원하기" or equivalent call-to-action. Phone/email/deadline in organized rows with icons.',
      fallback: '지원 방법',
    },
    intro: {
      layout: 'HOSPITAL INTRODUCTION PAGE - professional showcase. Key stats in large numbers, workplace description in clean typography, modern and trustworthy feel. Consider split-layout or card-based info blocks.',
      fallback: '병원 소개',
    },
    free: {
      layout: 'CONTENT PAGE - well-organized layout matching the content provided, clean card-based design',
      fallback: '채용 안내',
    },
  };

  const hint = typeHints[page.type] || typeHints.free;
  const isMultiPage = totalPages && totalPages > 1;
  // 페이지 정보는 디자인 지시로만 사용 - 이미지에 "PAGE X of Y" 텍스트를 렌더링하지 않도록 함
  const pageInstruction = isMultiPage
    ? `[DESIGN INSTRUCTION - this is page ${currentPage} of ${totalPages} in a carousel series. Do NOT render any page number or "PAGE X of Y" text on the image.]\n`
    : '';

  let content = `${pageInstruction}[${hint.layout}]`;

  // 채용 공고 치과 전용 기본 콘텐츠 (사용자가 아무것도 입력하지 않은 경우)
  const defaultContent: Record<string, string[]> = {
    cover: ['치과위생사 모집', '함께 성장할 인재를 찾습니다', '정규직 / 경력·신입 환영'],
    requirements: ['자격 요건', '치과위생사 면허 소지자', '경력 1년 이상 우대 (신입 지원 가능)', '성실하고 친절한 환자 응대 가능자', '디지털 차트 사용 가능자 우대', '스케일링·보철·교정 진료 경험자 우대'],
    benefits: ['복리후생', '4대보험 완비', '중식 제공', '연차·반차 자유 사용', '인센티브 분기별 지급', '명절 상여금·경조사비', '워크숍·세미나 지원', '유니폼 지급'],
    contact: ['지원 방법', '이력서 이메일 제출', '전화 문의 환영', '채용 시까지 상시 모집', '면접 후 즉시 합류 가능'],
    intro: ['병원 소개', '최신 디지털 장비 보유', '1일 환자 수 적정 유지', '쾌적하고 청결한 근무 환경', '원장님 직접 교육 진행'],
    free: ['채용 안내'],
  };

  const effectiveLines = lines.length > 0 ? lines : (defaultContent[page.type] || defaultContent.free);

  // 첫 줄 = 제목, 나머지 = 내용
  content += `\n[HEADING - bold, prominent] "${effectiveLines[0]}"`;
  if (effectiveLines.length > 1) {
    const bodyLines = effectiveLines.slice(1).map(l =>
      l.startsWith('-') || l.startsWith('*') || l.startsWith('•') ? `  ${l}` : l
    );
    content += `\n[CONTENT - well-structured, readable, with appropriate icons/bullets]\n${bodyLines.map(l => `"${l}"`).join('\n')}`;
  }
  return content;
}

function buildCautionTextContent(data: {
  type: string; title: string; items: string[]; emergency?: string;
}): string {
  const typeThemes: Record<string, string> = {
    '시술 후': 'Post-procedure care theme: clean medical aesthetic, soft blue/teal accents, professional but warm. Include subtle medical/beauty icons.',
    '진료 후': 'Post-visit care theme: warm, reassuring tone, soft green/blue accents, clean medical design.',
    '수술 후': 'Post-surgery care theme: serious but caring, structured layout, red/navy accents for important warnings.',
    '복약': 'Medication guidance theme: organized pill/medicine visuals, clear numbered steps, pharmacy-style clean design.',
    '일반': 'General medical notice: professional hospital design, neutral tones with accent color highlights.',
  };
  const theme = typeThemes[data.type] || typeThemes['일반'];

  let content = `[VISUAL THEME - ${theme}]`;
  content += `\n\n[MAIN TITLE - largest, bold, center] "${data.title}"`;
  content += `\n[TYPE BADGE - small accent tag] "${data.type}"`;
  if (data.items.length > 0) {
    content += `\n\n[CAUTION ITEMS - numbered list, each item has a small warning/check icon, clear readable text with generous spacing between items]`;
    content += `\n${data.items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`;
  }
  if (data.emergency) content += `\n\n[EMERGENCY CONTACT - prominent box at bottom, accent color background] "${data.emergency}"`;
  content += `\n\n[DESIGN NOTES: This is a patient handout. Text must be VERY readable - minimum 14pt equivalent. Use icons/illustrations to make it friendly, not scary. Layout should be scannable with clear visual hierarchy.]`;
  return content;
}

function buildPricingTextContent(data: {
  title: string; items: string[]; notice?: string;
}): string {
  let content = `[MAIN TITLE - largest, bold, center] "${data.title}"`;
  if (data.items.length > 0) {
    content += `\n\n[PRICING TABLE - clean list or table layout. Each row: treatment name LEFT-aligned, price RIGHT-aligned. Use dotted leader lines or clear spacing between name and price. Bold prices in accent color.]`;
    for (const item of data.items) {
      // "항목: 가격" 형식이면 분리, 아니면 그대로
      const colonIdx = item.indexOf(':');
      if (colonIdx > 0) {
        const name = item.substring(0, colonIdx).trim();
        const price = item.substring(colonIdx + 1).trim();
        content += `\n- "${name}" → "${price}"`;
      } else {
        content += `\n- "${item}"`;
      }
    }
  }
  if (data.notice) content += `\n\n[DISCLAIMER/NOTICE - smaller text at bottom, muted color, inside a subtle box or divider] "${data.notice}"`;
  content += `\n\n[DESIGN NOTES: This is a hospital fee schedule. Must look professional and trustworthy. Clean alignment between item names and prices is CRITICAL. Use a table-like layout. Korean text only from quotes above.]`;
  return content;
}

export async function generateTemplateWithAI(
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution' | 'pricing',
  templateData: Record<string, any>,
  stylePrompt: string,
  options?: {
    hospitalName?: string;
    logoBase64?: string | null;
    brandingPosition?: 'top' | 'bottom';
    styleReferenceImage?: string; // 이전 생성 결과 이미지 (그림체/일러스트 재현용)
    extraPrompt?: string;
    imageSize?: { width: number; height: number };
    hospitalInfo?: string[]; // 진료시간, 전화번호, 주소
    brandColor?: string; // 메인 브랜드 컬러 HEX
    brandAccent?: string; // 포인트 컬러 HEX
    applicationMode?: TemplateApplicationMode; // strict=템플릿 그대로, inspired=느낌만 참고
  }
): Promise<string> {
  // 카테고리별 텍스트 콘텐츠 생성
  let textContent: string;
  switch (category) {
    case 'schedule':
      textContent = buildScheduleTextContent(templateData as any);
      break;
    case 'event':
      textContent = buildEventTextContent(templateData as any);
      break;
    case 'doctor':
      textContent = buildDoctorTextContent({ ...(templateData as any), hasPhoto: !!templateData.doctorPhotoBase64 });
      break;
    case 'notice':
      textContent = buildNoticeTextContent(templateData as any);
      break;
    case 'greeting':
      textContent = buildGreetingTextContent(templateData as any);
      break;
    case 'hiring':
      textContent = buildHiringTextContent(templateData as any);
      break;
    case 'caution':
      textContent = buildCautionTextContent(templateData as any);
      break;
    case 'pricing':
      textContent = buildPricingTextContent(templateData as any);
      break;
    default:
      textContent = JSON.stringify(templateData);
  }

  const prompt = buildTemplateAiPrompt({
    category,
    stylePrompt,
    textContent,
    hospitalName: options?.hospitalName,
    logoBase64: options?.logoBase64,
    brandingPosition: options?.brandingPosition,
    extraPrompt: options?.extraPrompt,
    imageSize: options?.imageSize,
    hospitalInfo: options?.hospitalInfo,
    brandColor: options?.brandColor,
    brandAccent: options?.brandAccent,
    calendarTheme: category === 'schedule' ? templateData.colorTheme : undefined,
    applicationMode: options?.applicationMode,
  });

  // 이미지 파트 준비
  const makeImagePart = (dataUrl: string) => {
    if (!dataUrl?.startsWith('data:')) return null;
    const [meta, base64] = dataUrl.split(',');
    const mimeType = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';
    return { inlineData: { data: base64, mimeType } };
  };

  const logoPart = makeImagePart(options?.logoBase64 || '');
  const styleRefPart = makeImagePart(options?.styleReferenceImage || '');
  const doctorPhotoPart = category === 'doctor' ? makeImagePart(templateData.doctorPhotoBase64 || '') : null;
  const hospitalPhotoParts = (category === 'hiring' && templateData.hospitalPhotos)
    ? (templateData.hospitalPhotos as string[]).map((p: string) => makeImagePart(p)).filter(Boolean)
    : [];

  const MAX_RETRIES = 3;
  let lastError: any = null;

  // 참고 이미지 + 로고 + 프롬프트 조합 (재사용)
  const buildContents = () => {
    const contents: any[] = [];
    if (styleRefPart) {
      contents.push(styleRefPart);
      contents.push({ text: `[STYLE REFERENCE - REPLICATE VISUAL STYLE ONLY]
Match this reference image's visual DNA:
- Illustration style, line weights, icon shapes
- Color palette and gradients (EXACT same colors)
- Typography weight/style, text decoration approach
- Decorative elements: patterns, borders, shapes
- Background textures, shadows, depth effects
- Overall mood and aesthetic quality level

DO NOT COPY from reference: text, numbers, dates, data, aspect ratio.
Use ONLY the new text content from the prompt below.
` });
    }
    if (doctorPhotoPart) {
      contents.push(doctorPhotoPart);
      contents.push({ text: '[DOCTOR PHOTO - This is the actual photo of the doctor. Include this photo prominently in the design as a professional headshot.]\n\n' });
    }
    if (hospitalPhotoParts.length > 0) {
      hospitalPhotoParts.forEach((part: any, i: number) => {
        contents.push(part);
        contents.push({ text: `[HOSPITAL PHOTO ${i + 1} - Real photo of the hospital (exterior, interior, or equipment). Incorporate these photos naturally into the recruitment design to showcase the workplace environment.]\n\n` });
      });
    }
    if (logoPart) {
      contents.push(logoPart);
      contents.push({ text: '[Hospital Logo - place next to hospital name]\n\n' });
    }
    contents.push({ text: prompt });
    return contents;
  };

  const contents = buildContents();
  const totalTextLength = contents.filter((c: any) => c.text).reduce((sum: number, c: any) => sum + c.text.length, 0);
  console.log(`📝 프롬프트 총 길이: ${totalTextLength}자, 파트 수: ${contents.length}, 이미지 파트: ${contents.filter((c: any) => c.inlineData).length}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🎨 템플릿 AI 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (${category}, ref=${!!styleRefPart})...`);

      const result = await callGeminiRaw('gemini-3-pro-image-preview', {
        contents: [{role: 'user', parts: contents}],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
          imageConfig: {
            imageSize: '4K',
          },
        },
      }, TIMEOUTS.IMAGE_GENERATION);

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        const data = imagePart.inlineData.data;
        console.log(`✅ 템플릿 AI 이미지 생성 성공 (시도 ${attempt})`);
        return `data:${mimeType};base64,${data}`;
      }

      lastError = new Error('이미지 데이터를 받지 못했습니다.');
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error: any) {
      lastError = error;
      const errMsg = typeof error?.message === 'string' ? error.message : JSON.stringify(error);
      const statusCode = error?.status || error?.code || error?.error?.code;
      console.error(`❌ 템플릿 AI 이미지 생성 에러 (시도 ${attempt}, status=${statusCode}):`, errMsg);
      console.error('스택 트레이스:', error?.stack || '(no stack)');
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  // AI 생성 실패 시 기존 HTML 방식으로 폴백
  console.warn('⚠️ AI 이미지 생성 실패, HTML 렌더링으로 폴백:', lastError?.message);
  throw new Error(`AI 이미지 생성 실패: ${lastError?.message || '알 수 없는 오류'}. 다시 시도해주세요.`);
}
