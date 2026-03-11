/**
 * 병원 달력 이미지 생성 서비스
 * HTML/CSS 템플릿 + html2canvas로 100% 정확한 달력 이미지를 프로그래밍으로 생성
 */
import { getAiClient } from './geminiClient';
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
  const ai = getAiClient();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // AI에게 정확한 달력 그리드를 제공하여 날짜-요일 오류 방지
  const calendarGrid = buildCalendarGridText(currentYear, currentMonth);

  const systemPrompt = `당신은 사용자의 병원 달력 요청을 분석하여 JSON으로 변환하는 전문가입니다.
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
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
      },
    });

    const text = response.text?.trim();
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
export const CALENDAR_THEME_OPTIONS = [
  { value: 'autumn',             label: '🍁 가을 단풍',        emoji: '🍁' },
  { value: 'korean_traditional', label: '🦢 한국 전통',         emoji: '🦢' },
  { value: 'winter',             label: '❄️ 크리스마스',        emoji: '❄️' },
  { value: 'cherry_blossom',     label: '🌸 벚꽃 봄',           emoji: '🌸' },
  { value: 'spring_kids',        label: '🌼 봄 동산',           emoji: '🌼' },
  { value: 'medical_notebook',   label: '📓 노트북',            emoji: '📓' },
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
  // ─── 진료 일정: 전체 달력 레이아웃 (6개) ───
  // 각 템플릿은 레이아웃 구조, 정보 위계, 시각적 분위기가 모두 다름
  schedule_full_calendar: [
    {
      id: 'sfc_clean_grid', name: '클린 그리드', color: '#3b82f6', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '깔끔한 격자 달력',
      layoutHint: 'cal_grid',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
STRUCTURE: 3 vertical zones stacked top-to-bottom.
ZONE 1 — HEADER BAR (top 18% of image): Full-width rounded rectangle filled with solid blue (#3b82f6→#1d4ed8) gradient. Inside: hospital name in small white text near top, then large bold white text "N월 진료안내" centered. No other elements in this bar.
ZONE 2 — CALENDAR GRID (middle 60%): One large white rounded card (border-radius 12px, subtle drop shadow) centered with side margins. Inside the card: Row of 7 day-name headers (일월화수목금토) — Sunday in red (#ef4444), Saturday in blue (#3b82f6), weekdays in gray (#94a3b8). Below: 5 rows × 7 columns of date numbers in regular gray (#64748b). CLOSED DAYS: soft colored circle behind the number (light blue fill at 15% opacity), number in bold blue (#3b82f6). SHORTENED DAYS: soft amber circle behind number, number in bold amber (#d97706). All numbers evenly spaced in a clean grid. Sunday column numbers in light red.
ZONE 3 — LEGEND (bottom 8%): Below the grid card, a simple row of colored circle dots with labels: blue dot + "휴진", amber dot + "단축". Small, minimal.
NO decorations, NO illustrations, NO borders. Pure clean corporate medical calendar. White background outside the header bar.`,
    },
    {
      id: 'sfc_pastel_bubble', name: '가을 단풍', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '단풍잎 가을 달력',
      layoutHint: 'cal_bubble',
      aiPrompt: `Korean dental clinic monthly schedule with beautiful autumn leaf theme.
BACKGROUND: Warm gradient from rich orange (#f97316) at top to soft peachy-pink (#fecaca) at bottom. Large realistic autumn maple leaves (단풍잎) decoratively placed at TOP-LEFT and TOP-RIGHT corners - in vibrant red, orange, and gold colors. Leaves overlap and create a natural frame at the top.
SUBTLE DECORATION: Thin elegant white curved line flowing across the background.
TOP (20%): Very large bold white text "N월 진료일정" in heavy rounded Korean font (similar weight to Black/Heavy). Below: "진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다." in smaller white text.
CENTER (60%): Large white rounded card (border-radius 12px, subtle shadow). Inside:
- HEADER ROW: Dark charcoal (#3f3f46) background bar with white text showing 일 월 화 수 목 금 토, evenly spaced.
- CALENDAR GRID: 5 rows of date numbers. Previous month dates in light gray. Sunday dates in bold red. Regular dates in dark gray. CLOSED DAYS: warm yellow/amber (#fbbf24) rounded pill badge below the date number showing "정기휴진" text. Clean thin grid lines separating rows.
BOTTOM (20%): Centered dental clinic logo (tooth icon) with clinic name in warm brown/coral text.
Rich, warm autumn atmosphere. Professional Korean dental clinic seasonal calendar.`,
    },
    {
      id: 'sfc_mint_fresh', name: '벚꽃 봄', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '벚꽃 핑크 달력',
      layoutHint: 'cal_nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft pink (#fdf2f8) full background. Scattered cherry blossom (벚꽃) petals in corners and edges at low opacity (30-50%), pink tones (#f9a8d4, #fbcfe8). Delicate, spring atmosphere.
HEADER (top 30%): Hospital name in small deep pink accent (#be185d) centered at top. Thin pink divider line below. Large bold month number "N월" in dark rose (#831843), very prominent. Below: "진 료 안 내" in spaced letters, medium rose (#9d174d).
FULL CALENDAR GRID (middle 55%): One large white card (90% opacity, border-radius 12px, soft shadow) centered. Top bar of card in light pink (#fce7f3). 7 day-name headers (일월화수목금토) — Sunday in rose red (#e11d48), Saturday in blue, weekdays in deep pink (#9d174d). Below: 5 rows × 7 columns of date numbers. CLOSED DAYS: soft pink circle (#fce7f3) behind number, number in bold rose red (#e11d48). SHORTENED DAYS: soft amber circle behind number, number in bold amber.
BOTTOM (15%): Legend with pink circle + "휴진", amber circle + "단축". Clean spring cherry blossom theme.
Overall: Elegant spring cherry blossom Korean dental clinic calendar. Soft, feminine, professional.`,
    },
    {
      id: 'sfc_dark_premium', name: '오로라 그라데이션', color: '#c084fc', accent: '#7c3aed', bg: '#faf5ff',
      desc: '보라 그라데이션 달력',
      layoutHint: 'cal_dark',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Full-bleed purple-to-indigo gradient (#7c3aed → #c084fc) covering entire image with rounded corners. Large soft pink blob circle (#f472b6 at 25%) in top-right area. Large soft indigo blob circle (#818cf8 at 20%) in bottom-left area. Creates an aurora/gradient effect.
HEADER (top 18%): Hospital name in small white text (90% opacity) centered. Below: large bold "N월 진료안내" in white, prominent.
FULL CALENDAR GRID (middle 58%): One large white card (95% opacity, border-radius 20px, soft shadow) centered. Inside: 7 day-name headers (일월화수목금토) — Sunday=red, Saturday=blue, weekdays=gray. Below: 5 rows × 7 columns of date numbers showing ALL dates of the month. CLOSED DAYS: soft purple circle behind number (#c084fc at 15%), number in bold purple. SHORTENED DAYS: soft amber circle behind number, number in bold amber. Sunday column numbers in light red, others in gray (#64748b).
BOTTOM (14%): Small white translucent pill/card (70% opacity, rounded) containing legend: purple dot + "휴진", amber dot + "단축", and "09:30~18:00" operating hours.
Vibrant colorful gradient background contrasting with clean white calendar card. Modern, eye-catching, premium design.`,
    },
    {
      id: 'sfc_warm_kraft', name: '크래프트 내추럴', color: '#92400e', accent: '#78350f', bg: '#fffbeb',
      desc: '따뜻한 크래프트지',
      layoutHint: 'cal_kraft',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream/beige (#fefce8) at 60% opacity. Clean and simple, no decorative lines or borders.
TOP SECTION — ILLUSTRATION AREA (top 42%): White/cream rounded rectangle area.
⚠️ CHARACTER SHAPE: The tooth character is NOT a realistic tooth/molar shape. It is a SIMPLE white ROUNDED RECTANGLE (like a marshmallow or pillow shape, aspect ratio ~1:1.2, border-radius very large ~30%). TWO small solid black dot eyes (simple circles, no detail). ONE curved smile line below eyes (simple arc path, no other facial features — no rosy cheeks, no blush, no nose). This is a MINIMAL, FLAT, GEOMETRIC character.
⚠️ CROWN: Small golden zigzag crown (#fbbf24 at 50% opacity) sitting directly on TOP of the rectangle. Small — about 60% width of the rectangle.
⚠️ DECORATIONS — MINIMAL: Only 1 small gold star (★) to the left, 1 small sparkle (✦) to the right, at ~30% opacity. DO NOT add more than 2-3 tiny symbols total. NO hearts scattered around. NO sparkles everywhere.
⚠️ CLOUDS — TINY: Left side: one VERY SMALL light blue horizontal ellipse (like a tiny pill, ~15px wide). Right side: one VERY SMALL light pink ellipse. These are barely visible accents, NOT prominent decorative clouds. Absolutely NO big fluffy realistic clouds.
Below illustration: bold text "N월 휴진 안내" in warm brown (#92400e).
DIVIDER: A light green (#bef264 at 30%) rectangular masking tape strip, slightly rotated (-1°), placed horizontally. Looks like washi tape. Thin strip.
BOTTOM SECTION — MINI CALENDAR GRID (bottom 42%): White/cream rounded rectangle. 7-column COMPACT calendar grid. Day headers: 일(red #dc2626) 월화수목금(brown #78350f) 토(blue #2563eb), small bold text. 5 rows of date numbers in warm brown. CLOSED DAYS: soft red circle (#fee2e2 at 60%) CLEARLY VISIBLE behind the number, number in BOLD RED (#dc2626). Every closed day MUST have a visible red circle highlight. Grid is compact with tight spacing.
FOOTER (bottom 5%): ONLY 3 elements: tiny pink heart outline (♡) bottom-left, hospital name in italic warm brown center, tiny green clover (☘) bottom-right. Nothing else.
Overall: MINIMAL, SIMPLE, CLEAN. Like a cute but understated Korean stationery illustration. NOT busy, NOT colorful, NOT detailed.`,
    },
    {
      id: 'sfc_glassmorphism', name: '기와지붕 전통', color: '#92400e', accent: '#78350f', bg: '#fef3c7',
      desc: '한국 전통 기와 달력',
      layoutHint: 'cal_glass',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream/beige (#f5e6d0) full background. Traditional Korean aesthetic.
TOP SECTION (25%): Large warm coral/salmon (#e8795a) half-circle sun shape centered behind text. Bold white month number "N월" prominently inside the sun. Below: "진료일정 안내" in white bold text. Traditional Korean tiled roof (기와지붕) silhouette in dark charcoal (#3f3f46) spanning full width below the sun, with wavy tile pattern. Thin brown bar below roof.
DECORATIVE CORNERS: Small traditional Korean bracket ornaments (전통 문양) in warm brown (#92400e) at corners of the calendar area.
FULL CALENDAR GRID (middle 55%): White card (95% opacity, rounded corners, soft shadow) with notebook ring holes at top edge. Dark charcoal (#3f3f46) header bar with white day-name text (일월화수목금토). Below: 5 rows × 7 columns of date numbers. CLOSED DAYS: soft coral circle (#e8795a at 15%) behind number, number in bold coral. Below closed dates: tiny "휴진" label in coral. Sunday numbers in red (#ef4444), others in dark gray (#1f2937).
BOTTOM (20%): Traditional corner bracket ornaments matching top. Hospital name centered in warm brown (#92400e) bold text.
Overall: Warm traditional Korean architectural theme. Professional dental clinic feel with 기와지붕 motif.`,
    },
  ],

  // ─── 진료 일정: 한 주 레이아웃 (6개) ───
  schedule_week: [
    {
      id: 'swk_horizontal_bar', name: '기와지붕 전통', color: '#d97706', accent: '#92400e', bg: '#fef3c7',
      desc: '전통 기와 + 주간 달력',
      layoutHint: 'wk_bar',
      aiPrompt: `Korean dental clinic weekly schedule design inspired by traditional Korean architecture.
TOP SECTION (40%): Large warm coral/salmon (#e8795a) half-circle sun shape behind text. Bold thick Korean text "N월" in dark brown, then "진료일정 안내" below in heavy black rounded font. Traditional Korean tiled roof (기와지붕) silhouette in dark charcoal sitting below the text, with decorative 전통 문양 corner elements.
MIDDLE SECTION (40%): Clean white rounded card with subtle shadow, containing a 2-row weekly mini calendar table. Header row: 일 월 화 수 목 금 토 in clean font. Data rows show date numbers. Closed days highlighted with coral/orange rounded pill background with white text. Normal days in black. The card has traditional decorative corner bracket ornaments.
BOTTOM SECTION (20%): Warm beige/cream background. Important notice text in dark brown and coral red, like "OO원장님 OO일 휴진" and "정상진료" in large bold text. Hospital logo at bottom-left corner.
Overall: Warm beige/cream background (#f5e6d0), traditional Korean aesthetic with modern clean layout. Professional dental clinic feel.`,
    },
    {
      id: 'swk_card_stack', name: '단풍 가을', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '단풍잎 + 주간 카드',
      layoutHint: 'wk_cards',
      aiPrompt: `Autumn-themed Korean dental clinic weekly schedule design.
BACKGROUND: Warm gradient from orange (#f97316) at top to soft peach/pink (#fecaca) at bottom. Large realistic autumn maple leaves (단풍잎) scattered decoratively at top-left and top-right corners in red, orange, gold colors. Subtle white curved line decoration flowing across.
TOP (30%): Large bold white text "N월 진료일정" in heavy rounded Korean font. Below: "진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다." in smaller white text.
MIDDLE (50%): Clean white rounded rectangle card containing weekly calendar table. Dark charcoal header row (일 월 화 수 목 금 토) with white text. Below: date number rows with clean grid lines. Closed days marked with warm yellow/amber (#fbbf24) pill badge saying "정기휴진". Sunday dates in red. Clean, organized table layout.
BOTTOM (20%): Dental clinic logo with tooth icon, clinic name in warm brown and coral colors. Centered at bottom.
Professional Korean healthcare design with rich autumn seasonal atmosphere.`,
    },
    {
      id: 'swk_timeline_dot', name: '수묵화 한국풍', color: '#525252', accent: '#292524', bg: '#f5f5f4',
      desc: '수묵화 + 태극기 모티프',
      layoutHint: 'wk_timeline',
      aiPrompt: `Traditional Korean ink wash painting (수묵화) style clinic schedule design.
BACKGROUND: Light warm gray/beige (#f0ece4). Bottom section features dramatic Korean ink wash mountain landscape (산수화) in black/gray watercolor, fading into the background.
TOP-LEFT: Male character in traditional Korean clothing (한복) waving Korean flag (태극기), simple illustration style. TOP-RIGHT: Female character in traditional Korean clothing waving flag. Both in cheerful poses.
CENTER: Large bold "대체공휴일" in coral/red (#e8634a) bold text. Below: massive black bold Korean text "삼일절" and "휴무 안내" in heavy weight font. Below in smaller gray text: "N월 N일(요일명) 대체공휴일은 휴무일입니다. 이용에 착오 없으시길 바랍니다."
BOTTOM (35%): White rounded card with calendar-ring decoration at top (like a desk calendar). Inside: 3-column layout showing 3 consecutive days. Each column has day name (일요일/월요일/화요일), large bold date number, and status text (휴무 in red, 정상 영업 in black). Closed day column has red accent.
TOP-RIGHT CORNER: Clinic name in small clean text.
Traditional Korean patriotic holiday notice with ink painting atmosphere.`,
    },
    {
      id: 'swk_pill_shape', name: '벚꽃 봄', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '벚꽃 + 부드러운 핑크',
      layoutHint: 'wk_pill',
      aiPrompt: `Spring cherry blossom themed Korean dental clinic weekly schedule.
BACKGROUND: Soft pink gradient (#fdf2f8 to white). Delicate cherry blossom (벚꽃) petals scattered around corners and floating down, soft watercolor style in light pink.
TOP (25%): Clinic name in small elegant text. Large bold Korean text "N월 N주차 진료안내" in deep pink (#be185d). Decorative cherry blossom branch illustration.
MIDDLE (50%): 7 individual rounded pill/capsule cards arranged in a row, one for each day of the week. Each pill card shows: day name at top, date number in center (large bold), and status (정상/휴진/단축). Closed day pills have solid pink (#ec4899) fill with white text. Normal pills have white fill with soft pink border. Shortened day pills have amber border.
BOTTOM (25%): Pink rounded info card showing "진료시간 안내" with hours listed. Hospital contact info. Small cherry blossom decoration.
Soft, feminine, spring atmosphere. Professional Korean dental clinic aesthetic.`,
    },
    {
      id: 'swk_ribbon_flag', name: '블루 클린', color: '#2563eb', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '클린 블루 깔끔한',
      layoutHint: 'wk_flag',
      aiPrompt: `Clean blue corporate Korean dental clinic weekly schedule design.
TOP (8%): Solid blue (#2563eb) header bar spanning full width. Clinic name or logo in small white text.
BELOW HEADER: Clean white background. Small subtle blue decorative line or shape accent.
TITLE AREA (20%): Large bold black/dark text "N월 N주차" and "진료안내" in heavy Korean font. Subtext in gray.
MAIN CONTENT (50%): Clean white card or table showing the week's 7 days in a horizontal layout. Each day shows: day name (요일), date number, operating hours, and status. Closed days clearly marked with red text or red background badge saying "휴진". Clean thin border lines separating columns. Day headers in blue background with white text.
BOTTOM (20%): Hospital info section with contact details, address, operating hours listed neatly. Blue accent elements. Hospital logo centered.
Ultra-clean, professional, corporate healthcare design. Like a modern hospital official notice.`,
    },
    {
      id: 'swk_neon_glow', name: '눈꽃 겨울', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '겨울 눈꽃 + 화이트',
      layoutHint: 'wk_neon',
      aiPrompt: `Winter snowflake themed Korean dental clinic weekly schedule design.
BACKGROUND: Soft gradient from light icy blue (#e0f2fe) at top to white at bottom. Delicate snowflake (눈꽃) crystal patterns scattered around in white/light blue, varying sizes.
TOP (25%): Large bold text "N월 N주차 진료안내" in deep blue (#0c4a6e). Sparkle/snowflake decorative elements. Clinic name in small elegant text.
MIDDLE (50%): Frosted white card with subtle blue border, containing weekly schedule. 7 day columns with clean layout. Each column: day name, date, hours, status. Closed days marked with icy blue (#0ea5e9) pill badge. Snowflake icon accents within the card. Clean grid lines.
BOTTOM (25%): Light blue info section with operating hours and contact info. Small snowman or winter illustration accent. Hospital logo.
Cold, crisp, clean winter atmosphere. Professional Korean dental clinic seasonal design.`,
    },
  ],

  // ─── 진료 일정: 강조형 레이아웃 (6개) ───
  schedule_highlight: [
    {
      id: 'shl_dark_green', name: '클래식 그린', color: '#2d5a4a', accent: '#1a3c32', bg: '#f5f1eb',
      desc: '다크 그린 + 다이아몬드',
      layoutHint: 'hl_bignum',
      aiPrompt: `Elegant dark green Korean dental clinic monthly schedule with diamond-shaped date markers.
BACKGROUND: Soft cream/beige (#f5f1eb) upper half. Bottom 40% is deep forest green (#2d5a4a) with subtle semi-transparent clinic interior photo overlay.
TOP (15%): Clinic logo (tooth icon) + clinic name in dark green, centered. Small English subtitle below.
TITLE (15%): Large green rounded rectangle banner with bold white text "N월 진료일정" in heavy Korean font.
CENTER (45%): White card with thin border and decorative corner brackets. Inside:
- Header row: 일 월 화 수 목 금 토 with 일 in coral, 토 in blue, rest in dark text. Thin line separator below.
- Calendar grid showing only the 1-2 weeks that contain marked days. Large clear date numbers.
- CLOSED DAYS: Dark green (#2d5a4a) diamond (45-degree rotated square) behind the date number in white. Below diamond: holiday name in small gray text + "휴진" in green bold text.
- NORMAL/SPECIAL DAYS: Green circle behind date in white. Below: label + "정상진료" in green text.
- Regular dates in gray/black, clean spacing.
BOTTOM (25%): On green background: centered notice text in white "N월 N일 OO은 정상진료입니다. N월 N일 OO, N월 N일 OO 휴진입니다. 참고하여 내원에 차질이 없으시기 바랍니다." Clean, professional Korean dental clinic seasonal calendar.`,
    },
    {
      id: 'shl_navy_highlight', name: '네이비 모던', color: '#1e3a5f', accent: '#0f2444', bg: '#0f2444',
      desc: '다크 네이비 + 하이라이트',
      layoutHint: 'hl_stamp',
      aiPrompt: `Modern dark navy Korean dental clinic monthly schedule with highlighted cells.
BACKGROUND: Deep navy blue (#0f2444) with subtle diagonal gradient and halftone dot pattern decorations in corners (lighter blue dots).
TOP (20%): Centered white thin-bordered rectangle frame containing: clinic name in small sky blue text, then very large bold white text "N월 휴진 일정" in heavy Korean font.
CENTER (50%): White/light card with clean table layout:
- Header row: 일 월 화 수 목 금 토 — each in separate cells with light blue (#dbeafe) background, bold text.
- Calendar grid showing 1-2 weeks with marked days. Clean cell borders.
- CLOSED/HOLIDAY DAYS: Cell background is light sky blue (#dbeafe). Date number in bold dark blue. Below: holiday name (e.g., "임시공휴일", "개천절", "한글날") in smaller text.
- Regular dates in dark navy, clean cells.
- Sunday dates in coral/red.
BOTTOM (30%): Navy background continues. White text notice: "N월 N일 임시공휴일, N월 N일 개천절, N월 N일 한글날 공휴일 휴진입니다. 참고하여 내원에 차질 없으시길 바랍니다."
Bottom-center: Clinic logo and name in sky blue/white.
Corporate, trustworthy dark navy dental clinic design.`,
    },
    {
      id: 'shl_lavender', name: '라벤더 퍼플', color: '#7c3aed', accent: '#6d28d9', bg: '#faf5ff',
      desc: '연보라 + 스파클 장식',
      layoutHint: 'hl_rip',
      aiPrompt: `Elegant lavender purple Korean dental clinic monthly schedule with sparkle decorations.
BACKGROUND: Soft lavender gradient from light purple (#f3e8ff) to white. Subtle abstract purple watercolor/glass shapes floating.
TOP (20%): Decorative four-pointed star sparkles (✦) in purple on left and right. Very large bold dark purple text "✦✦ N월 진료일정 ✦✦" in heavy Korean font, centered.
CENTER (55%): Clean white area with:
- Header row: SUN MON TUE WED THU FRI SAT in English, inside light lavender (#e9d5ff) background bar. Bold purple text.
- Calendar grid showing 1-2 weeks with marked days. Clean layout with thin lines.
- CLOSED/HOLIDAY DAYS: Purple circle behind date number in white. Below: holiday name + "휴진" in purple bold text.
- CONSECUTIVE CLOSED DAYS: Light lavender/pink (#f3e8ff) rounded rectangle spanning multiple cells horizontally. Date numbers inside, with "병원 휴진" label below each in purple text.
- Regular dates in dark gray, clean spacing.
BOTTOM (25%): Rounded rectangle callout box with light purple border containing notice text in dark text. Important words ("정상진료", "휴진") in bold purple.
Bottom: Clinic logo and name centered in purple.
Feminine, elegant Korean dental clinic design with purple sparkle accents.`,
    },
    {
      id: 'shl_autumn_illust', name: '가을 일러스트', color: '#b45309', accent: '#92400e', bg: '#b45309',
      desc: '단풍 일러스트 + 노트',
      layoutHint: 'hl_slash',
      aiPrompt: `Beautiful autumn illustration Korean dental clinic monthly schedule with notepad design.
BACKGROUND: Warm brown/amber (#b45309) solid color. Top-right: stylized cream/white cloud shapes. Top-left: illustrated autumn maple leaves in red, orange, yellow, green colors — vivid colored pencil/flat illustration style. Bottom 30%: dense, lush autumn forest illustration — many overlapping round tree shapes in rich red, orange, golden, brown, burgundy colors with thin tree trunks visible. Flat illustration style, warm and cozy.
TOP (25%): Clinic logo (tooth icon + name) centered in small white text. Below: HUGE bold white text "N월" in massive heavy font + "휴진 안내" in large bold white text below. Below title: white text "N월 N일, N일, N일은 추석연휴 휴진입니다. 진료 예약 및 내원에 참고 부탁 드립니다."
CENTER (45%): White rounded card with spiral/ring binding decoration at top edge (gray circles). Inside card:
- Header row: 일 월 화 수 목 금 토 in dark text with thin separator line below.
- Calendar grid showing 1-2 weeks. Clean, spacious layout.
- CLOSED DAYS: Dark red (#b91c1c) rounded rectangle spanning consecutive closed days. White date numbers inside. Label "추석연휴 휴진" below in dark text.
- SHORTENED DAYS: Warm amber/brown (#b45309) rounded rectangle. "1시까지 진료" label below.
- Regular dates in dark gray.
Warm, charming autumn illustration dental clinic notice. Cozy seasonal feel.`,
    },
    {
      id: 'shl_autumn_leaf', name: '단풍 수채화', color: '#dc2626', accent: '#991b1b', bg: '#fef3e2',
      desc: '단풍잎 프레임 + 서클',
      layoutHint: 'hl_circle',
      aiPrompt: `Watercolor autumn leaves frame Korean dental clinic closure notice.
BACKGROUND: Soft warm cream (#fef3e2) with peach tint. All four corners and edges decorated with large watercolor autumn leaves — maple leaves in vibrant red, golden yellow, deep green, brown. Brush stroke style leaves with natural watercolor texture. Also small branches, acorns, berries scattered. Creates a beautiful natural frame.
TOP: Small masking tape decoration (beige rectangle). Below: small green text "Holiday Notice" in English.
CENTER WHITE CARD (60%): Large white rounded card with subtle shadow, framed by the autumn leaves.
Inside card:
- Title: Very large bold black text "N월 휴무" in heavy Korean font.
- Thin decorative line separator.
- Calendar header: Sun Mon Tue Wed Thu Fri Sat in English, dark text.
- Calendar grid showing 1-2 weeks:
  - CLOSED DAYS: Dark red/muted brown circle behind date number in white. Below: holiday name (e.g., "개천절") in small text + "휴진" label.
  - NORMAL OPERATION DAYS: Bright red (#dc2626) circle behind date. Below: "정상 영업" in red bold text.
  - Regular dates in gray.
- Thin line separator.
- Notice text: "N월 N일 OO, N월 N일 OO은 공휴일로 쉽니다. N월 N일, N일은 정상적으로 영업하오니 방문 시 참고 부탁드립니다!"
BOTTOM: Clinic name in dark text, centered.
Artistic autumn watercolor botanical frame. Elegant, warm seasonal design.`,
    },
    {
      id: 'shl_clean_minimal', name: '미니멀 화이트', color: '#374151', accent: '#111827', bg: '#ffffff',
      desc: '깔끔한 미니멀 스타일',
      layoutHint: 'hl_countdown',
      aiPrompt: `Ultra-clean minimal white Korean dental clinic monthly schedule notice.
BACKGROUND: Pure white (#ffffff) with very subtle light gray geometric shapes or thin line decorations.
TOP (15%): Clinic logo and name centered in small dark text. Thin accent line below.
TITLE (20%): Large bold black text "N월 진료일정" in clean sans-serif heavy Korean font. Subtle thin line below.
CENTER (45%): Clean white card or area:
- Header row: 일 월 화 수 목 금 토 in dark gray, clean sans-serif. 일 in red, 토 in blue.
- Calendar grid showing 1-2 weeks with marked days. Very clean, spacious cells with thin light gray borders.
- CLOSED DAYS: Soft gray (#f3f4f6) circle behind date number in bold black. Below: holiday name and "휴진" in red bold text.
- NORMAL DAYS: Light blue (#dbeafe) circle behind date. "정상진료" in blue text below.
- Regular dates in gray, minimal styling.
BOTTOM (20%): Clean notice text in dark gray. Important dates and "휴진"/"정상진료" highlighted in bold. Thin line separator. Clinic info at bottom.
Extremely clean, professional, modern Korean dental clinic design. No clutter, clear hierarchy. Swiss/Scandinavian minimal aesthetic.`,
    },
  ],

  // ─── 진료 일정: 기본 (레이아웃 미선택 시 fallback) ───
  schedule: [
    {
      id: 'sch_clean_calendar', name: '클린 캘린더', color: '#3b82f6', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '깔끔한 달력형',
      layoutHint: 'calendar',
      aiPrompt: 'Clean modern medical clinic monthly calendar design, crisp white background with soft blue accents, organized grid layout showing dates clearly, closed days marked in red circles, shortened hours in amber, professional healthcare aesthetic, minimal decorations, clear sans-serif typography, hospital logo area at top',
    },
    {
      id: 'sch_pastel_card', name: '파스텔 카드', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '부드러운 카드형',
      layoutHint: 'card',
      aiPrompt: 'Soft pastel pink and cream dental clinic schedule card design, rounded corners and soft shadows, important dates displayed as individual cards with icons, gentle watercolor texture background, friendly and approachable healthcare design, cute minimal illustrations of teeth or dental tools',
    },
    {
      id: 'sch_bold_highlight', name: '볼드 강조형', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '휴진일 대형 강조',
      layoutHint: 'highlight',
      aiPrompt: 'Bold and eye-catching clinic closure notice design, large prominent date numbers in red, clear hierarchy with main closure dates as hero element, strong contrast between normal and special dates, modern hospital announcement style, dark navy or charcoal text on white, accent red for closures, professional medical poster layout',
    },
    {
      id: 'sch_warm_wood', name: '따뜻한 우드', color: '#92400e', accent: '#78350f', bg: '#fffbeb',
      desc: '따뜻한 내추럴',
      layoutHint: 'list',
      aiPrompt: 'Warm natural wood-toned dental clinic schedule design, cozy beige and brown palette, hand-crafted feel with subtle wood grain texture, organized date list format, warm golden lighting atmosphere, friendly neighborhood clinic vibe, kraft paper aesthetic with clean modern typography',
    },
    {
      id: 'sch_mint_fresh', name: '민트 프레시', color: '#14b8a6', accent: '#0f766e', bg: '#f0fdfa',
      desc: '상쾌한 민트톤',
      layoutHint: 'cal_nature',
      aiPrompt: 'Fresh mint and teal colored medical clinic monthly schedule, clean modern design with mint green accent borders, calendar grid with soft teal highlights for special dates, fresh and hygienic healthcare aesthetic, light gradient background, professional yet refreshing mood, green cross medical symbol accent',
    },
    {
      id: 'sch_dark_premium', name: '다크 프리미엄', color: '#c084fc', accent: '#7c3aed', bg: '#faf5ff',
      desc: '고급 다크 테마',
      layoutHint: 'cal_dark',
      aiPrompt: 'Premium dark-themed dental clinic schedule design, deep navy or charcoal background with gold and purple accents, elegant typography, luxury medical aesthetic, sophisticated layout with dates displayed as refined cards, subtle gradient overlays, high-end clinic branding feel, metallic gold text accents',
    },
  ],

  // ─── 이벤트 (6개) ───
  event: [
    {
      id: 'evt_sale_banner', name: '할인 배너', color: '#ef4444', accent: '#b91c1c', bg: '#fef2f2',
      desc: '가격 강조 할인형',
      layoutHint: 'price',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white (#ffffff) with very subtle warm gradient at bottom.
ZONE 1 — TOP BANNER (top 18%): Full-width rounded rectangle with bold red (#ef4444 → #b91c1c) gradient fill. Hospital name in small white text (12px). Below: event title "임플란트 특별 할인" in large bold white text (24px, heavy weight).
ZONE 2 — DISCOUNT BADGE (middle 35%): Large circular badge centered. Outer ring: subtle red glow at 10% opacity. Inner circle: white with thin red border. Inside: massive "30%" text in bold red (#ef4444, 60px weight 900). Below: "OFF" in smaller bold red. Above the badge: thin red starburst rays radiating outward at very low opacity (5%).
ZONE 3 — PRICE CARD (middle 25%): White rounded card (border-radius 12px, soft shadow 0 4px 20px rgba(0,0,0,0.08)). Inside: original price "990,000원" in gray (#94a3b8) with strikethrough line. Below: discounted price "690,000원" in massive bold red (#ef4444, 40px, weight 900). Clear price hierarchy — old price small, new price dominant.
ZONE 4 — PERIOD + CTA (bottom 22%): Event period "2026.03.01 ~ 03.31" in gray text on subtle gray pill background. Below: full-width rounded CTA button with red gradient, white bold text "지금 바로 예약하세요". Hospital name small at very bottom.
NO illustrations. Pure typographic promotional design. Urgent, attention-grabbing retail-inspired medical event.`,
    },
    {
      id: 'evt_elegant_event', name: '엘레강스 이벤트', color: '#a855f7', accent: '#7e22ce', bg: '#faf5ff',
      desc: '고급스러운 이벤트',
      layoutHint: 'elegant',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft lavender gradient (#faf5ff to white). Very subtle radial glow of purple at center (5% opacity).
ZONE 1 — HEADER (top 12%): Hospital name in small elegant text with letter-spacing 2px, purple (#7e22ce). Thin decorative line (0.5px, purple at 15% opacity) below.
ZONE 2 — TITLE (20%): Small caps English subtitle "IMPLANT EVENT" in purple (#a855f7), letter-spacing 3px. Below: Large elegant Korean title "임플란트 이벤트" in bold purple (#7e22ce, 32px, weight 800). Thin decorative line below.
ZONE 3 — PRICE SHOWCASE (35%): Centered white card with very subtle purple border (0.5px, 10% opacity), border-radius 16px, soft shadow. Inside: "SPECIAL PRICE" in small gray letters with spacing. Below: huge price "690,000원" in bold purple (#a855f7, 44px, weight 800). Elegant, refined spacing.
ZONE 4 — DETAILS + CTA (bottom 33%): Thin divider line. Period dates in gray. Below: rounded pill CTA button with purple gradient (#a855f7 → #7e22ce), white text "예약 상담". Hospital name at bottom in small purple text.
Luxury, sophisticated, premium dental clinic promotion. Gold-foil-inspired refinement without actual gold — pure purple elegance.`,
    },
    {
      id: 'evt_pop_colorful', name: '팝 컬러풀', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '활기찬 팝 스타일',
      layoutHint: 'pop',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fffbeb) with scattered small confetti dots (amber, orange, yellow) at very low opacity (8-12%) around edges.
ZONE 1 — HEADER (top 10%): Hospital name in bold amber (#d97706) text.
ZONE 2 — BURST BADGE (35%): Large starburst/explosion shape centered — 8 radiating triangular rays from center in amber (#f59e0b) at 10% opacity, creating a burst effect. Outer ring: amber circle at 10%. Inner ring: amber circle at 12%. Inside: "EVENT" in small bold text. Below: massive "30%" in bold amber (#f59e0b, 48px, weight 900). Below: "할인" in bold.
ZONE 3 — EVENT TITLE (10%): "임플란트" in large bold amber (#f59e0b, 28px, weight 800). Playful, chunky feel.
ZONE 4 — PRICE + CTA (bottom 35%): White rounded card with shadow. Inside: bold price "690,000원" in amber (36px, weight 900). Below: period "2026.03.01 ~ 03.31" in gray. Below: full-width rounded CTA button with amber gradient, white bold text "지금 바로 예약!". Energetic, fun, attention-grabbing.
Vibrant pop-art inspired promotional poster. Fun and exciting. Korean dental clinic event with comic-book energy.`,
    },
    {
      id: 'evt_minimal_modern', name: '미니멀 모던', color: '#64748b', accent: '#334155', bg: '#f8fafc',
      desc: '심플 미니멀',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Pure white (#ffffff) with barely visible cool gray tint.
ZONE 1 — SPACIOUS TOP (top 15%): Maximum whitespace. Small caps "IMPLANT EVENT" in light gray (#94a3b8), letter-spacing 4px, centered.
ZONE 2 — TITLE (25%): Very large bold Korean text "임플란트" on first line, "특별 할인" on second line. Both in charcoal (#334155, 28px, weight 800). Below: ultra-thin line (0.5px, gray at 20% opacity), width 30%, centered.
ZONE 3 — PRICE (30%): White card with extremely subtle shadow (0 2px 12px rgba(0,0,0,0.04)), border-radius 12px. Inside: "Special Offer" in light gray small caps. Below: massive price "690,000원" in charcoal (#334155, 40px, weight 800). Generous vertical padding.
ZONE 4 — DETAILS (bottom 30%): Period in light gray (#94a3b8). Below: subtle pill button with gray fill at 8% opacity, "예약 문의" in charcoal. Hospital name at very bottom in tiny gray text.
Ultra-minimalist. Maximum whitespace. Architectural precision. Less is more luxury medical aesthetic.`,
    },
    {
      id: 'evt_gradient_wave', name: '그라데이션 웨이브', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '물결 그라데이션',
      layoutHint: 'wave',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Light cyan (#ecfeff) to white gradient.
ZONE 1 — HEADER (top 12%): Hospital name in teal (#0891b2) text. Below: large bold title "임플란트 이벤트" in cyan (#06b6d4, 28px, weight 800).
ZONE 2 — WAVE DECORATION (12%): Two flowing sine-wave shapes spanning full width. First wave: cyan (#06b6d4) at 6% opacity, smooth curve. Second wave: slightly offset, 4% opacity. Creates a calm ocean-wave visual separator.
ZONE 3 — PRICE CARD (35%): White rounded card (85% opacity, border-radius 16px, soft shadow) floating over the waves. Inside: "Limited Time Offer" in small teal text with letter-spacing. Below: huge price "690,000원" in bold cyan (#06b6d4, 40px, weight 800).
ZONE 4 — WAVE + CTA (bottom 25%): Another set of gentle wave shapes at 4% opacity. Period "2026.03.01 ~ 03.31" in gray. Below: rounded CTA button with cyan gradient (#06b6d4 → #0891b2), white bold text "예약하기".
Modern, flowing, dynamic. Ocean-inspired calm yet exciting. Tech-forward healthcare design.`,
    },
    {
      id: 'evt_season_special', name: '시즌 스페셜', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '계절 한정 이벤트',
      layoutHint: 'season',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft mint (#f0fdf4) to white gradient. Very subtle leaf/floral shapes at corners in green at 5-8% opacity.
ZONE 1 — HEADER (top 10%): Hospital name in green (#15803d) text.
ZONE 2 — SEASON BANNER (20%): Rounded rectangle with green (#22c55e) at 6% opacity fill, thin green border at 10%. Inside: "SEASON SPECIAL" in small green letters with spacing. Below: large bold "임플란트 이벤트" in green (#22c55e, 24px, weight 800). Small decorative circles in green at edges (5-6% opacity).
ZONE 3 — PRICE CARD (35%): White rounded card (90% opacity, border-radius 16px, soft shadow). Inside: "Season Special" in small green text. Below: massive price "690,000원" in bold green (#22c55e, 40px, weight 800).
ZONE 4 — PERIOD + CTA (bottom 25%): Period on subtle green pill background. Below: full-width rounded CTA button with green gradient (#22c55e → #15803d), white bold text "지금 바로 예약하세요".
Fresh, natural, inviting. Seasonal limited-time offer feel. Professional Korean dental clinic event with spring/nature atmosphere.`,
    },
  ],

  // ─── 의사 소개 (6개) ───
  doctor: [
    {
      id: 'doc_portrait_formal', name: '정장 포트레이트', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '공식 프로필형',
      layoutHint: 'portrait',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white with very subtle blue tint.
ZONE 1 — PHOTO AREA (top 45%): White rounded card (border-radius 12px, soft shadow). Top section: subtle blue (#1e40af) gradient band at 6% opacity. Center: large rectangular photo placeholder (50x50px equivalent, border-radius 8px, subtle blue border at 10%). "PHOTO" watermark text inside in light blue.
ZONE 2 — NAME + TITLE (20%): Doctor name "김윈에이드" in large bold navy (#1e40af, 28px, weight 800). Below: rounded pill with navy gradient background, white bold text "치과 전문의".
ZONE 3 — CREDENTIALS (25%): Alternating light/white stripe rows. Each row: "서울대 치의학 박사", "임플란트 전문", "경력 10년" — centered text in gray (#64748b). Clean professional list.
BOTTOM: Hospital name in navy text, centered.
Formal, authoritative, trust-building. Corporate medical profile card.`,
    },
    {
      id: 'doc_friendly_curve', name: '친근한 곡선', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '부드러운 곡선형',
      layoutHint: 'curve',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft mint (#ecfdf5) to white gradient. Gentle curved wave shape dividing upper and lower sections at ~35% height, green (#10b981) at 4% opacity.
ZONE 1 — PHOTO (top 40%): Large circular photo frame (radius 22px equivalent) centered. White background with soft shadow. Subtle green (#10b981) border at 8% opacity. "PHOTO" watermark inside.
ZONE 2 — NAME + TITLE (18%): "김윈에이드" in bold green (#10b981, 28px, weight 800). Below: rounded pill with green at 8% opacity, "치과 전문의" in green accent text.
ZONE 3 — GREETING (30%): White rounded card with soft shadow, border-radius 16px. Inside: italic greeting text "환자분의 미소가 저의 보람입니다" in green accent color. Warm, personal, inviting.
BOTTOM: Hospital name in green text.
Friendly, approachable, warm. Organic curved shapes. Patient-friendly dental clinic aesthetic.`,
    },
    {
      id: 'doc_modern_split', name: '모던 분할', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '좌우 분할 레이아웃',
      layoutHint: 'split',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
LAYOUT: Two-column split design.
LEFT COLUMN (42% width): Full-height area with indigo (#6366f1) at 6% opacity background. Large circular photo frame centered vertically — white background, subtle indigo border. Square photo placeholder inside (border-radius 6px, indigo at 8%). "PHOTO" watermark.
RIGHT COLUMN (58% width): White background.
TOP-RIGHT: Doctor name "김윈에이드" in bold indigo (#6366f1, 26px, weight 800). Below: rounded pill with indigo at 8% opacity, "치과 전문의" in indigo accent.
MIDDLE-RIGHT: Bullet list with small indigo dots: "서울대 치대 졸업", "임플란트 전문", "경력 10년" in gray (#64748b).
BOTTOM-RIGHT: Italic quote "환자분의 미소가 저의 보람입니다" in indigo accent.
Modern, geometric split-layout. Clean division. Contemporary medical profile.`,
    },
    {
      id: 'doc_warm_story', name: '따뜻한 스토리', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '인사말 중심 스토리형',
      layoutHint: 'story',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fff7ed) with subtle white overlay card at 50% opacity, border-radius 12px.
ZONE 1 — COMPACT HEADER (top 25%): Left: small circular photo frame (radius 12px). Right: "치과 전문의" in small orange text, below: "김윈에이드" in bold orange (#f97316, 22px, weight 800). Thin divider line below in orange at 8% opacity.
ZONE 2 — GREETING MESSAGE (45%): Rounded area with orange at 3% opacity. Large storytelling text centered: "안녕하세요. 여러분의 건강한 미소를 위해 항상 노력하겠습니다. 편안하게 찾아주세요." in warm gray (#475569). Last line "편안하게 찾아주세요." in bold orange accent. Personal, heartfelt narrative style.
ZONE 3 — CREDENTIALS (15%): White card with soft shadow. Single line: "서울대 치대 | 임플란트 전문 | 경력 10년" in light gray, centered.
BOTTOM: Hospital name in orange accent text.
Warm, personal, storytelling. Emphasis on doctor's greeting over credentials. Trust-building human touch.`,
    },
    {
      id: 'doc_dark_luxury', name: '다크 럭셔리', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '프리미엄 다크',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep navy (#0f172a) full background.
ZONE 1 — GOLD HEADER (top 8%): Thin gold (#d4a017) decorative double line spanning 70% width, centered. Elegant separator.
ZONE 2 — PHOTO (35%): Large circular frame centered. Gold (#d4a017) border at 20% opacity, subtle gold glow at 5%. Dark inner circle with "PHOTO" in gold at 40% opacity.
ZONE 3 — NAME + TITLE (20%): "김윈에이드" in large bold gold (#d4a017, 28px, weight 800). Below: rounded pill with gold at 8% opacity, "치과 전문의" in gold (#b8860b).
ZONE 4 — CREDENTIALS (15%): "서울대 치대 | 임플란트 전문" in light gray (#94a3b8). Thin gold divider line below.
BOTTOM: Hospital name in gold text. Gold decorative line.
Premium dark luxury. Deep navy with gold accents. VIP doctor profile. High-end dental specialist branding.`,
    },
    {
      id: 'doc_clean_grid', name: '클린 그리드', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '정보 정리형 그리드',
      layoutHint: 'grid',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Light sky blue (#f0f9ff) to white gradient.
ZONE 1 — COMPACT HEADER (top 25%): Left: circular photo frame (radius 14px) with white background, subtle sky blue border, soft shadow. Right: "김윈에이드" in bold sky blue (#0ea5e9, 22px). Below right: rounded pill with sky blue at 8%, "치과 전문의" in blue accent.
ZONE 2 — INFO GRID (50%): 2x2 grid of white cards with soft shadow, border-radius 8px. Each card:
- Top: category label in bold sky blue ("학력", "전공", "경력", "학회")
- Bottom: value in gray ("서울대 치대", "임플란트", "10년 이상", "대한치과의사협회")
Cards arranged in neat grid with 8px gaps.
ZONE 3 — CTA (10%): Rounded pill button with sky blue gradient, width 60%, centered.
BOTTOM: Hospital name in blue accent text.
Clean, organized, infographic-style. Dashboard aesthetic. Easy-to-read structured profile.`,
    },
  ],

  // ─── 공지사항 (6개) ───
  notice: [
    {
      id: 'ntc_bulletin_board', name: '클린 블루 안내', color: '#2563eb', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '블루 진료시간 안내형',
      layoutHint: 'bulletin',
      aiPrompt: `Clean blue Korean dental clinic official notice design (inspired by professional medical notices).
TOP (8%): Solid blue (#2563eb) bar with small centered icon (tooth/clinic logo shape).
TITLE AREA (18%): Small gray English text "CLINIC NAME DENTAL CLINIC". Below: bold Korean clinic name. Below: very large bold black text "진료시간 안내" or notice title.
MAIN CONTENT (55%): White card with light blue border and subtle shadow. Structured content displayed as organized rows with clear dividing lines. Each row contains:
- Category label on left (in regular weight)
- Colon separator
- Details on right in bold
- Optional small colored badge for special notes (like "야간진료", "휴게시간 없음")
Clean, organized, table-like layout. Each information row clearly separated.
BOTTOM (19%): Location/contact info section. Subway station icon with station name and exit info. Address details. Small clinic logo at bottom-right.
Ultra-professional, corporate Korean healthcare design. Clean blue accent on white.`,
    },
    {
      id: 'ntc_modern_alert', name: '코럴 공지', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '따뜻한 코럴 공지',
      layoutHint: 'alert',
      aiPrompt: `Warm coral/red Korean dental clinic important notice design.
BACKGROUND: Soft gradient from warm coral (#f87171) at top to light peach (#fef2f2) at bottom.
TOP (30%): Large bold white text with notice title (e.g., "진료 안내", "휴진 안내") in heavy rounded Korean font. Important dates highlighted. Clinic name in small text.
CENTER (45%): Clean white rounded card with notice content. Key information displayed prominently:
- Date/period in large bold text
- Details in organized rows
- Important items highlighted with red/coral accent badges
- Clean section dividers
BOTTOM (25%): Additional info, contact details, clinic logo centered.
Warm, attention-grabbing Korean healthcare notice. Professional yet inviting.`,
    },
    {
      id: 'ntc_soft_info', name: '라벤더 안내', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '부드러운 라벤더 안내',
      layoutHint: 'soft',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Gentle gradient from soft lavender (#f5f3ff) to white. Subtle decorative circles at corners in light purple at 5-8% opacity.
ZONE 1 — HEADER (top 15%): Rounded pill with purple at 6% opacity. Left: "i" icon circle in purple at 10%. Right: bold purple title "진료실 이전 안내" (#8b5cf6, 20px, weight 700).
ZONE 2 — CONTENT CARDS (55%): 3 individual rounded pill cards (border-radius 14px, white 90% opacity, soft shadow), stacked vertically with 8px gaps. Each card: small purple circle (10% opacity) on left, content text in gray (#475569) on right. Cards contain: "2026년 4월 1일부터", "새 장소에서 진료합니다", "서울시 강남구 ...".
ZONE 3 — CTA (15%): Rounded pill with purple at 6% opacity, centered text "양해 부탁드립니다" in purple accent.
BOTTOM: Hospital name in light gray.
Soft, calming, gentle. All rounded shapes. Approachable and friendly dental clinic notice. Lavender palette.`,
    },
    {
      id: 'ntc_corporate_formal', name: '공식 문서', color: '#1f2937', accent: '#111827', bg: '#f9fafb',
      desc: '격식있는 공문 스타일',
      layoutHint: 'formal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Pure white (#ffffff).
ZONE 1 — HEADER (top 8%): Full-width 2px solid black (#1f2937) line. Below: hospital name centered in formal font.
ZONE 2 — TITLE (12%): Large bold text "공 지 사 항" with letter-spacing 4px in charcoal (#1f2937, 26px, weight 800), centered. Below: thin horizontal line at 30% opacity.
ZONE 3 — CONTENT (50%): White area with thin border frame. Clean formal text layout: "2026년 4월 1일부터 새로운 장소에서 진료합니다." in dark text. Indented paragraphs. "신주소: 서울시 강남구 ..." Numbered items with proper Korean formal document formatting. Clear section headings.
ZONE 4 — CLOSING (15%): Thin divider line at 20% opacity. "위와 같이 알려드리오니 참고하시기 바랍니다." in formal closing. Date and clinic name.
BOTTOM: Thin black border line matching top.
Formal, authoritative, institutional Korean official document format. Black and white with no color.`,
    },
    {
      id: 'ntc_card_popup', name: '민트 팝업', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '민트 팝업 카드',
      layoutHint: 'popup',
      aiPrompt: `Modern mint/cyan Korean dental clinic pop-up notice design.
BACKGROUND: Light mint gradient (#ecfeff to white) with soft geometric shapes.
FLOATING CARD: Large white card with cyan top border (4px solid #06b6d4), rounded corners, prominent drop shadow. Looks like it's floating above the background.
CARD CONTENT:
- Top bar: Cyan accent with icon (megaphone/bell) and "공지" badge
- Title: Large bold dark text with notice subject
- Body: Organized content with cyan bullet points
- Key dates/info in highlighted cyan boxes
- Divider lines between sections
- Bottom: Action info (contact/visit) with cyan button-style elements
OUTSIDE CARD: Small decorative elements in mint tones. Clinic branding.
Modern, digital-native Korean healthcare notice. Clean and contemporary.`,
    },
    {
      id: 'ntc_timeline', name: '그린 타임라인', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '변경 타임라인 안내',
      layoutHint: 'timeline',
      aiPrompt: `Timeline-style Korean dental clinic change notice design.
BACKGROUND: Soft green (#f0fdf4) to white gradient.
TOP (20%): Clinic logo. Bold title "변경 안내" or notice title in dark green.
CENTER (60%): Vertical timeline with green line connecting nodes:
- BEFORE node: Circle with old information, struck-through or faded
- Arrow/transition indicator
- AFTER node: Circle with new information, highlighted in green
- Effective date badge in green
Each node is a white card with shadow containing relevant details.
BOTTOM (20%): Summary of changes, contact info for questions. Green accent footer with clinic info.
Infographic-style change notice. Clear before/after comparison. Green palette.`,
    },
  ],

  // ─── 명절 인사: 설날 (6개) ───
  greeting_설날: [
    {
      id: 'grt_seol_traditional', name: '전통 한복', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '단청 문양 전통',
      layoutHint: 'traditional',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep crimson-to-burgundy gradient (#dc2626 → #991b1b) full bleed. Thin gold (#d4a017) double-line border inset 3% from edges. Subtle dancheong (단청) geometric pattern overlay at 10% opacity across entire background.
ZONE 1 — TOP HEADER (top 20%): Traditional Korean gate roof (기와지붕) silhouette in dark burgundy (#7f1d1d) spanning full width at very top. Below roof: "새해 복 많이 받으세요" in large bold gold (#fbbf24) calligraphy-style Korean font, centered. Hospital/clinic name in smaller white text (80% opacity) directly below.
ZONE 2 — MAIN ILLUSTRATION (middle 40%): Centered composition — a pair of Korean traditional lucky knot (매듭) ornaments in red and gold flanking a large stylized "福" / "복" character rendered in shimmering gold foil (#d4a017) inside a circular frame. Pine branch (소나무) with green needles extending from top-left, plum blossom (매화) branch with pink-white flowers from top-right, meeting behind the central character.
ZONE 3 — GREETING MESSAGE (next 25%): White semi-transparent rounded card (85% opacity, border-radius 16px) centered with 8% side margins. Inside: 2–3 lines of New Year greeting text in dark burgundy (#7f1d1d), font-size medium, line-height 1.6. Dental clinic personalized message area. Small gold divider line above and below text.
ZONE 4 — FOOTER (bottom 15%): Korean traditional cloud motifs (구름문) in gold (#d4a017) at 25% opacity, flowing left-to-right. Centered small tooth icon wearing a tiny hanbok (한복) hat in gold outline. Year "2026" in small elegant gold text below.
Overall: Dignified, festive, traditional Korean Seollal atmosphere. Red-and-gold royal palette. No cartoonish elements — elegant and sophisticated for a dental clinic.`,
    },
    {
      id: 'grt_seol_tteokguk', name: '떡국 일러스트', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '따뜻한 설 음식',
      layoutHint: 'warm',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream-to-peach gradient (#fff7ed → #fed7aa) full bleed. Soft watercolor texture overlay at 15% opacity. Faint steam/bokeh light circles in warm white (#fffbeb) at 10% opacity scattered across upper half.
ZONE 1 — TOP HEADER (top 18%): "설날 인사드립니다" in large bold warm brown (#92400e) Korean font, centered. Hospital/clinic name in smaller soft orange (#ea580c) text below. Thin dashed orange (#f97316) horizontal line as divider.
ZONE 2 — MAIN ILLUSTRATION (middle 45%): Large hand-drawn watercolor illustration of a steaming bowl of tteokguk (떡국) centered. Bowl is white ceramic with subtle blue rim pattern. Inside: sliced rice cakes (흰 떡), green onion garnish, egg strips (지단) in yellow, seaweed flakes. Three wavy steam lines rising in warm white above the bowl. Wooden chopsticks and a metal spoon placed neatly to the right of bowl on a warm-toned wooden table surface. Small side dishes (kimchi, namul) in tiny bowls flanking left and right at smaller scale.
ZONE 3 — GREETING TEXT (next 22%): Rounded rectangle card with very soft orange border (#fdba74, 1px) and white fill (90% opacity), border-radius 12px. Inside: warm heartfelt New Year greeting in dark brown (#78350f) text, font-size medium, line-height 1.8. "따뜻한 새해 되세요" as highlight line in bold orange (#f97316).
ZONE 4 — FOOTER (bottom 15%): Small cute tooth character (simple rounded rectangle shape, two dot eyes, curved smile) wearing a chef hat, holding a tiny spoon — in line-drawing style, warm brown (#92400e) outline. Year "2026" and clinic info in small warm brown text centered below.
Overall: Cozy, heartwarming, hand-drawn food illustration style. Warm orange and cream palette. Feels like a homemade family meal invitation from a friendly dental clinic.`,
    },
    {
      id: 'grt_seol_modern', name: '모던 세뱃돈', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 봉투 디자인',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean off-white (#eef2ff) full bleed. Generous whitespace throughout. Subtle geometric Korean traditional pattern (격자문) in very faint indigo (#6366f1 at 5%) as background texture, barely visible.
ZONE 1 — TOP HEADER (top 15%): Hospital/clinic name in small indigo (#4f46e5) text, left-aligned with 10% left margin. Thin indigo (#6366f1) horizontal line spanning 80% width below, centered.
ZONE 2 — MAIN VISUAL (middle 40%): Single elegant sebatdon envelope (세뱃돈 봉투) illustration centered. Envelope is clean white with indigo (#6366f1) minimal line art, gold (#d4a017) clasp/seal at top. Korean traditional simplified geometric border pattern on envelope in thin indigo lines. Small "복" character in gold on envelope center. Envelope slightly tilted at 5° angle. Behind envelope: one thin gold circle outline as abstract decoration. No other elements — maximum negative space.
ZONE 3 — TYPOGRAPHY (next 30%): "새해 복 많이 받으세요" in large bold indigo (#4f46e5) sans-serif modern Korean font, centered, generous letter-spacing (0.05em). Below: 2 lines of clean greeting text in medium gray (#64748b), font-size small-medium, centered. "2026 설날" in small gold (#d4a017) accent text.
ZONE 4 — FOOTER (bottom 15%): Minimal footer — small indigo tooth icon (geometric/minimal style) centered. Clinic contact info in tiny gray (#94a3b8) text. Thin indigo line above footer matching header line.
Overall: Ultra-clean, contemporary, corporate. Swiss/minimalist typography. Indigo and gold only. Feels like a premium medical brand holiday card — sophisticated and restrained.`,
    },
    {
      id: 'grt_seol_bokjumeoni', name: '복주머니', color: '#e11d48', accent: '#be123c', bg: '#fff1f2',
      desc: '복주머니 장식',
      layoutHint: 'cute',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft rose-pink gradient (#fff1f2 → #fce7f3) full bleed. Small festive confetti dots in gold (#fbbf24), red (#e11d48), and pink (#f9a8d4) scattered randomly at 20% opacity across entire background. Subtle radial glow in center (white at 15%).
ZONE 1 — TOP HEADER (top 15%): "복 많이 받으세요!" in large bold rose-red (#e11d48) rounded Korean font with slight text-shadow in pink. Small gold sparkle icons (✦) flanking the text left and right. Hospital name in smaller deep rose (#be123c) below.
ZONE 2 — MAIN ILLUSTRATION (middle 45%): Three adorable 3D-style bokjumeoni (복주머니) pouches arranged in a row — left pouch in red (#dc2626) with gold drawstring, center pouch (largest, 1.3x scale) in hot pink (#e11d48) with traditional flower embroidery pattern, right pouch in coral (#fb7185) with gold drawstring. Each pouch has a small gold "복" character embroidered. Gold coins (동전) floating above and around pouches (5–7 coins with square holes). Between the pouches: a kawaii tooth character (white rounded rectangle, dot eyes, big curved smile, pink blush circles on cheeks) wearing a miniature hanbok jeogori (저고리) in pink and yellow.
ZONE 3 — GREETING MESSAGE (next 25%): Rounded pill-shape card with pink border (#fda4af, 2px) and white fill, border-radius 24px. Inside: cheerful New Year greeting in deep rose (#9f1239) text, playful rounded font. Lucky symbols: tiny four-leaf clover (☘) and star (★) as bullet points.
ZONE 4 — FOOTER (bottom 15%): Row of tiny bouncing lucky symbols — horseshoe, clover, star, coin — in gold outline, evenly spaced. Year "2026" in bubbly pink (#e11d48) text centered. Small clinic info in rose (#be123c).
Overall: Cheerful, kawaii, playful. Pink-red-gold palette. Cute character-driven design perfect for a family-friendly dental clinic Seollal card.`,
    },
    {
      id: 'grt_seol_gold_luxury', name: '금박 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '고급 금박 효과',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Rich burgundy (#7f1d1d) full bleed with subtle luxury paper/linen texture overlay at 8% opacity. Thin gold (#d4a017) ornamental border inset 4% from all edges — double line with tiny diamond shapes at corners.
ZONE 1 — TOP ACCENT (top 12%): Centered gold foil pine branch (소나무) illustration spanning 60% width — intricate needle detail in gold (#d4a017) with subtle gold shimmer effect. Small gold sparkle dots around branch tips.
ZONE 2 — MAIN CENTERPIECE (middle 40%): Large circular gold frame (3px gold #d4a017 line, radius ~30% of image width) centered. Inside circle: "복" character in extra-large, elegant gold calligraphy (#fbbf24 to #d4a017 gradient), brush stroke style. Circle surrounded by intricate Korean traditional patterns (보상화문 / 연꽃문) in gold foil at 40% opacity forming a mandala-like ring. Four small gold corner ornaments (traditional Korean 모서리 장식) at diagonal positions around the circle.
ZONE 3 — GREETING TEXT (next 28%): "새해 복 많이 받으세요" in elegant gold (#fbbf24) serif/calligraphy Korean font, centered, generous letter-spacing. Below: thin gold divider line (60% width). 2 lines of refined greeting text in soft gold (#d4a017 at 70%) on burgundy, font-size small-medium. Hospital/clinic name in small bright gold below.
ZONE 4 — FOOTER (bottom 20%): Gold foil embossed effect — symmetric arrangement of Korean traditional motifs: two mirrored phoenix (봉황) silhouettes in gold at 25% opacity flanking a small gold tooth icon (premium shield-shaped dental emblem). Year "2026" in small gold text at very bottom.
Overall: Ultra-premium, VIP luxury feel. Only burgundy and gold — no other colors. Gold foil metallic shimmer throughout. Feels like an exclusive invitation from a high-end dental practice.`,
    },
    {
      id: 'grt_seol_sunrise', name: '새해 일출', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '해돋이 풍경',
      layoutHint: 'nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Dawn sky gradient transitioning from deep navy (#1e3a5f) at top through warm amber (#f59e0b) and soft peach (#fbbf24) to pale gold (#fffbeb) at bottom — mimicking a real Korean mountain sunrise. Faint horizontal cloud wisps in warm white at 15% opacity across the mid-section.
ZONE 1 — TOP SKY (top 20%): Deep navy-to-indigo (#1e3a5f → #312e81) fading into warm tones. Small scattered stars in white at 30% opacity fading out as sky brightens. Thin crescent moon outline in pale gold (#fde68a) at 15% opacity, top-right corner, nearly invisible as dawn arrives.
ZONE 2 — SUNRISE & MOUNTAINS (middle 35%): Large radiant sun disc rising from behind mountain range — sun is a luminous gradient circle (#fbbf24 → #f59e0b) with soft golden glow rays radiating outward at 20% opacity. Korean mountain silhouettes (산) in 3 layered ridges: far mountains in dusty purple (#6b5b73), mid mountains in warm brown (#92400e at 60%), near mountains in deep amber (#78350f). Between mountains: a small traditional Korean village — 3–4 hanok (한옥) rooftop silhouettes with curved eaves in dark brown, wisps of chimney smoke rising in warm white.
ZONE 3 — GREETING TEXT (next 30%): Golden sunrise glow area. "새해 복 많이 받으세요" in large bold dark warm brown (#78350f) elegant Korean font, centered, with subtle gold text-shadow. Below: thin golden line divider (#d97706, 50% width). 2–3 lines of heartfelt New Year greeting in medium brown (#92400e) text, font-size medium, line-height 1.7. Hospital/clinic name in small amber (#d97706) text below greeting. Small sunrise icon (semicircle with rays) as decorative element.
ZONE 4 — FOOTER (bottom 15%): Silhouette of pine trees (소나무) along bottom edge in dark amber (#92400e at 40%), creating a natural treeline. Centered: small tooth icon styled as a rising sun (tooth shape with tiny radiating lines) in gold (#d97706) outline. Year "2026" in small warm gold text. Clinic contact info in tiny brown (#78350f at 60%).
Overall: Serene, hopeful, nature-inspired Korean sunrise landscape. Warm amber-gold-brown palette. Watercolor/painted landscape atmosphere. Evokes the feeling of a fresh new beginning — peaceful and uplifting for a dental clinic Seollal greeting.`,
    },
  ],

  // ─── 명절 인사: 추석 (6개) ───
  greeting_추석: [
    {
      id: 'grt_chsk_fullmoon', name: '보름달 전통', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '보름달 한국풍',
      layoutHint: 'traditional',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep warm navy (#1a1a2e) to dark amber (#451a03) gradient full bleed, evoking an autumn night sky. Subtle traditional Korean geometric pattern (팔각문) overlay at 5% opacity in gold (#d4a017). Faint golden radial glow emanating from center-top where moon will be placed.
ZONE 1 — TOP / MOON (top 35%): Massive luminous full moon (보름달) centered — a large perfect circle with realistic moon texture in pale gold (#fde68a) to warm white gradient, soft outer glow in amber (#f59e0b at 30%) radiating outward. Inside moon: very faint silhouette of a rabbit pounding rice cake (달토끼) in slightly darker gold at 15% opacity. Thin wispy clouds in warm gold (#d4a017 at 15%) drifting across moon edges.
ZONE 2 — HARVEST FRAME (middle 25%): Symmetrical arrangement flanking center — left side: golden wheat stalks (벼이삭) and rice grain clusters in warm gold (#d4a017) curving inward; right side: mirrored wheat stalks. Between them at center: 2–3 ripe persimmons (감) in deep orange (#ea580c) with green stems, and 2 chestnuts (밤) in warm brown (#92400e) below. Small traditional Korean knot (매듭) in red (#dc2626) and gold hanging as accent.
ZONE 3 — GREETING TEXT (next 25%): "풍성한 한가위 보내세요" in large bold gold (#fbbf24) calligraphy-style Korean font, centered. Below: thin gold ornamental divider line with small diamond center. 2–3 lines of warm Chuseok greeting in soft gold (#d4a017 at 80%) text, font-size medium, line-height 1.7. Hospital/clinic name in small bright gold below. Traditional bracket-style (「 」) gold frame around text area.
ZONE 4 — FOOTER (bottom 15%): Traditional Korean wave/cloud pattern (구름문) in gold (#d4a017) at 20% opacity flowing across bottom. Centered: small tooth icon with a tiny full moon motif in gold outline. Year "2026 추석" in small elegant gold text. Clinic info in tiny warm gold (#d4a017 at 50%).
Overall: Majestic, dignified, traditional Korean Chuseok harvest festival atmosphere. Deep navy and gold palette. Rich autumn harvest abundance feeling — warm yet elegant for a dental clinic.`,
    },
    {
      id: 'grt_chsk_songpyeon', name: '송편 일러스트', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '송편과 과일',
      layoutHint: 'warm',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft sage-green to warm cream gradient (#f0fdf4 → #fefce8) full bleed. Delicate watercolor wash texture at 12% opacity. Faint pine needle pattern (솔잎) scattered diagonally at 5% opacity in soft green (#86efac) across background.
ZONE 1 — TOP HEADER (top 18%): "즐거운 추석 보내세요" in large bold forest green (#15803d) hand-lettering style Korean font, centered. Small pine branch (솔가지) illustrations flanking text left and right in soft green (#22c55e). Hospital/clinic name in smaller muted green (#166534) below. Thin dotted green line as divider.
ZONE 2 — MAIN ILLUSTRATION (middle 45%): Large hand-drawn watercolor illustration of songpyeon (송편) arrangement centered. A round wooden plate (소반) with fresh green pine needles spread as base. On plate: 8–10 songpyeon in assorted colors — white, pale pink (#fda4af), pale green (#86efac), pale yellow (#fde68a) — half-moon shaped with sesame/bean filling visible in cross-section on one piece. Surrounding the plate: a whole Korean pear (배) in golden-brown on the left, 2 ripe persimmons (감) in orange (#ea580c) on the right, a small bunch of jujubes (대추) in dark red, and 2 chestnuts (밤). Small stack of Korean pancakes (전) on a tiny side plate in background. Rising steam wisps from freshly made songpyeon in warm white.
ZONE 3 — GREETING TEXT (next 22%): Rounded rectangle card with soft green border (#86efac, 1.5px) and white fill (92% opacity), border-radius 14px. Inside: warm Chuseok greeting in dark green (#14532d) text, font-size medium, line-height 1.7. "건강한 한가위 되세요" as highlight line in bold green (#15803d). Small songpyeon icon as decorative bullet.
ZONE 4 — FOOTER (bottom 15%): Small kawaii tooth character (white rounded shape, dot eyes, happy curved smile, pink cheek blush) wearing a tiny traditional Korean apron (앞치마), holding a miniature songpyeon — in simple line-drawing style, green (#15803d) outline. Year "2026" and clinic info in small forest green text centered.
Overall: Warm, homey, hand-drawn food illustration style. Green and earth-tone palette. Feels like a heartfelt family gathering invitation from a friendly neighborhood dental clinic.`,
    },
    {
      id: 'grt_chsk_modern', name: '모던 한가위', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 추석',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean off-white (#eef2ff) full bleed. Maximum whitespace throughout. Extremely subtle geometric grid pattern in faint indigo (#6366f1 at 4%) as background texture, barely perceptible. No visual clutter.
ZONE 1 — TOP HEADER (top 15%): Hospital/clinic name in small indigo (#4f46e5) sans-serif text, left-aligned with 10% left margin. Thin indigo (#6366f1) horizontal line spanning 80% width below, centered. Small "추석" label in tiny uppercase-style indigo text, right-aligned.
ZONE 2 — MAIN VISUAL (middle 40%): Large perfect circle (full moon) centered — thin indigo (#6366f1, 2px) stroke outline only, no fill. Inside the circle: a single elegant rabbit silhouette in solid indigo (#4f46e5), minimalist geometric style (composed of simple shapes — circles and rounded rectangles), sitting in profile facing right, small and positioned in lower-third of circle. Below the rabbit inside circle: a tiny stylized mortar and pestle (절구) in thin indigo line art. Outside circle, bottom-right: one single maple leaf (단풍잎) in muted silver-indigo (#a5b4fc) at 40% opacity, geometric/simplified form. Maximum negative space around the circle.
ZONE 3 — TYPOGRAPHY (next 30%): "풍성한 한가위 보내세요" in large bold indigo (#4f46e5) modern sans-serif Korean font, centered, generous letter-spacing (0.05em). Below: 2 lines of refined greeting text in medium gray (#64748b), font-size small-medium, centered, line-height 1.8. "2026 추석" in small silver (#a5b4fc) accent text below.
ZONE 4 — FOOTER (bottom 15%): Minimal footer — small geometric tooth icon in indigo (#6366f1) outline centered. Clinic contact info in tiny gray (#94a3b8) text. Thin indigo line above footer matching header line style.
Overall: Ultra-clean, contemporary, Swiss-inspired minimalism. Indigo and silver-gray only — absolutely no warm colors. Sophisticated medical brand Chuseok card. Restrained, intellectual, premium feel.`,
    },
    {
      id: 'grt_chsk_rabbit', name: '토끼 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '달토끼 귀여운',
      layoutHint: 'cute',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft pink-to-lavender gradient (#fdf2f8 → #f3e8ff) full bleed. Scattered small stars and sparkles (✦) in gold (#fbbf24) and pink (#f9a8d4) at 20% opacity across entire background. Soft circular bokeh lights in warm pink (#fda4af at 10%) floating in upper portion.
ZONE 1 — TOP HEADER (top 15%): "즐거운 한가위!" in large bold hot pink (#ec4899) bubbly rounded Korean font with subtle pink text-shadow. Small crescent moon and star icons in gold (#fbbf24) flanking text. Hospital name in smaller deep pink (#be185d) below.
ZONE 2 — MAIN ILLUSTRATION (middle 45%): Large luminous full moon circle in pale yellow (#fef3c7) as backdrop, centered. On the moon surface: an adorable kawaii moon rabbit (달토끼) character — white fluffy bunny with large round eyes, pink inner ears (#f9a8d4), pink nose, rosy cheek circles (#fda4af), wearing a tiny pastel pink hanbok jeogori (저고리). Rabbit is cheerfully pounding rice cake (떡) with a small wooden mallet (떡메) into a mortar (절구). Rice cake pieces bouncing up playfully. Next to the rabbit: a cute chibi tooth character (white rounded rectangle body, dot eyes, big curved smile, pink blush, tiny pink ribbon/bow on top) wearing a miniature hanbok치마 (chima) in lavender, holding a tiny Korean fan (부채). Floating around them: 3–4 colorful cartoon autumn leaves (maple in red #ef4444, ginkgo in yellow #fbbf24) and small floating songpyeon in pastel colors.
ZONE 3 — GREETING MESSAGE (next 25%): Rounded pill-shape card with pink border (#f9a8d4, 2px) and white fill (95% opacity), border-radius 24px. Inside: cheerful Chuseok greeting in deep pink (#9f1239) text, playful rounded font, line-height 1.6. "달토끼와 함께 행복한 추석!" as highlight in bold pink (#ec4899). Small star (★) and moon (☽) as decorative bullet points.
ZONE 4 — FOOTER (bottom 15%): Row of tiny bouncing characters — small rabbit, moon, songpyeon, maple leaf, tooth — as repeating icons in pink (#ec4899) outline, evenly spaced. Year "2026 추석" in bubbly pink text centered. Clinic info in small rose (#be185d).
Overall: Adorable, kawaii, character-driven playful design. Pink-lavender-gold palette. Cheerful and family-friendly — perfect for a pediatric or family dental clinic Chuseok greeting card.`,
    },
    {
      id: 'grt_chsk_premium', name: '달빛 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '고급 달빛 골드',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep midnight navy (#1a1a2e) full bleed with subtle luxury silk/satin texture overlay at 6% opacity. Thin gold (#d4a017) ornamental double-line border inset 4% from all edges, with small traditional Korean corner motifs (모서리 장식) at each corner in gold.
ZONE 1 — TOP ACCENT (top 12%): Symmetrical arrangement of golden wheat stalks (벼이삭) and grain clusters in gold foil (#d4a017) curving inward from left and right edges, meeting near center. Small gold sparkle dots at grain tips. Subtle golden light glow at center-top hinting at moonrise.
ZONE 2 — MOONLIT CENTERPIECE (middle 40%): Massive luminous full moon centered — large perfect circle with rich gold gradient (#fbbf24 → #d4a017), realistic moon surface texture, dramatic outer glow in warm gold (#f59e0b at 25%) radiating outward creating a moonlight halo effect. Inside moon: very faint traditional rabbit silhouette in slightly deeper gold at 12% opacity. Flanking moon left and right: elegant gold foil persimmon branches (감나무) — 2 ripe persimmons each side in deep gold (#b8860b) with delicate gold leaves. Below moon: small arrangement of traditional Korean offering fruits (제수용 과일) — pears, apples, chestnuts — as gold silhouettes.
ZONE 3 — GREETING TEXT (next 28%): "풍성한 한가위 보내세요" in large elegant gold (#fbbf24) serif/calligraphy Korean font, centered, with subtle gold shimmer effect. Below: thin gold ornamental divider with lotus motif center. 2 lines of refined greeting in soft gold (#d4a017 at 70%) on navy, font-size small-medium. Hospital/clinic name in small bright gold (#fbbf24). Traditional gold bracket frame (「 」style) around entire text zone.
ZONE 4 — FOOTER (bottom 20%): Gold foil embossed effect — two mirrored traditional Korean phoenix (봉황) silhouettes in gold at 20% opacity flanking a premium tooth icon (shield-shaped dental emblem with crescent moon detail) in gold (#d4a017). "2026 추석" in small gold text at very bottom. Gold wave pattern (파도문) at 10% opacity along bottom edge.
Overall: Ultra-premium, VIP luxury Chuseok card. Deep navy and gold exclusively — no other colors. Gold foil metallic shimmer throughout. Feels like an exclusive harvest festival invitation from a premium dental practice.`,
    },
    {
      id: 'grt_chsk_autumn', name: '가을 풍경', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '단풍 자연풍',
      layoutHint: 'nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm autumn sunset gradient — soft peach (#fff7ed) at top transitioning through warm amber (#fed7aa) to muted burnt orange (#ea580c at 20%) at bottom. Delicate watercolor wash texture at 15% opacity throughout. Faint falling leaf particles (tiny dots in red, orange, gold) at 8% opacity scattered across background.
ZONE 1 — TOP SKY & MOON (top 25%): Warm sunset sky in soft peach-to-amber tones. A full moon rising in upper-right area — pale cream circle (#fef3c7) with soft warm glow at 20% opacity. Faint silhouettes of migrating geese (기러기) in a V-formation (3–5 birds) in warm brown (#92400e at 30%) flying across the sky near the moon.
ZONE 2 — AUTUMN LANDSCAPE (middle 35%): Watercolor-painted Korean autumn countryside panorama. Rolling hills with colorful maple trees (단풍나무) in vivid red (#dc2626), burnt orange (#ea580c), and golden yellow (#f59e0b). A winding country path through golden rice paddies (황금 들판) ready for harvest. In the middle distance: a small traditional Korean farmhouse (초가집) with thatched roof, thin smoke from chimney. A few persimmon trees (감나무) with bright orange fruit visible. Foreground: close-up maple branches framing left and right edges with detailed colorful leaves — red, orange, gold, some still green. Soft watercolor bleeding edges for painterly effect.
ZONE 3 — GREETING TEXT (next 25%): Semi-transparent warm white card (88% opacity) with rounded corners (border-radius 14px), subtle burnt orange border (#fb923c, 1px). Inside: "풍성한 한가위 보내세요" in large bold dark brown (#78350f) Korean font. Below: 2–3 lines of warm autumn Chuseok greeting in medium brown (#92400e) text, line-height 1.7. "건강하고 행복한 추석 되세요" as highlight in bold burnt orange (#ea580c). Small maple leaf icon as decorative accent.
ZONE 4 — FOOTER (bottom 15%): Scattered fallen autumn leaves along bottom edge — maple leaves in red and orange, ginkgo leaves in golden yellow — in watercolor style at 40% opacity creating a natural ground cover. Centered: small tooth icon with a tiny maple leaf accent in burnt orange (#ea580c) outline. Year "2026 추석" and clinic info in small warm brown (#92400e) text.
Overall: Nostalgic, warm, painterly Korean autumn landscape. Red-orange-gold-brown harvest palette. Watercolor painting atmosphere. Evokes the beauty and abundance of Korean autumn countryside — peaceful and heartwarming for a dental clinic Chuseok greeting.`,
    },
  ],

  // ─── 명절 인사: 새해 (6개) ───
  greeting_새해: [
    {
      id: 'grt_newy_fireworks', name: '불꽃놀이', color: '#7c3aed', accent: '#6d28d9', bg: '#f5f3ff',
      desc: '화려한 불꽃놀이',
      layoutHint: 'traditional',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep midnight navy (#0f0a2e) to dark purple (#1a0533) gradient. Scattered tiny star-like sparkles at 15% opacity across entire background.
ZONE 1 — FIREWORKS BURST (top 40%): 3–5 large firework explosions in gold (#FFD700), purple (#7c3aed), and electric blue (#3b82f6). Each burst has radiating thin lines and glowing particle trails. Subtle smoke wisps at burst origins. Light bloom/glow effect around each explosion center.
ZONE 2 — YEAR DISPLAY (center, 20%): "2026" in massive bold font (48px, weight 900) with sparkler-glow effect — warm gold (#FFD700) fill, outer glow (#fbbf24) at 40% opacity, 8px blur. Thin gold confetti pieces (small rectangles, circles) scattered around the number at varying angles and 30–60% opacity.
ZONE 3 — GREETING TEXT (below center, 15%): "새해 복 많이 받으세요" in white (24px, weight 700), soft text-shadow (0 0 12px rgba(255,215,0,0.5)). Below: hospital/clinic name in gold (#FFD700, 14px, weight 500, letter-spacing 2px).
ZONE 4 — BOTTOM ACCENT (bottom 10%): Faint city skyline silhouette in dark navy (#1a1a4e) at 20% opacity. Thin gold gradient line (1px) separating skyline from card edge. Tiny rising gold confetti particles fading upward.
Glamorous, celebratory, midnight party atmosphere. Vibrant firework colors against deep dark sky.`,
    },
    {
      id: 'grt_newy_champagne', name: '샴페인 토스트', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '샴페인 파티',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Rich black (#0a0a0a) to deep charcoal (#1a1a1a) gradient. Subtle diagonal gold shimmer streaks at 5% opacity.
ZONE 1 — CHAMPAGNE GLASSES (top 45%): Two elegant champagne flutes clinking at center, rendered in gold (#d4a017) line-art with metallic sheen. Golden bubbles (circles, 4–8px) rising from each glass at varying opacity (20–80%). Splash of champagne at clink point with radiating gold droplets.
ZONE 2 — CELEBRATION ACCENTS (middle band, 15%): Thin gold (#FFD700) confetti strips and small star shapes scattered across, 30–60% opacity, rotated at random angles. Subtle gold ribbon streamers curving from sides.
ZONE 3 — GREETING TEXT (center-lower, 20%): "Happy New Year" in elegant serif font (16px, weight 400, letter-spacing 3px, gold #d4a017). Below: "새해 복 많이 받으세요" in white (22px, weight 700). Below: hospital/clinic name in gold (#b8860b, 13px, weight 500).
ZONE 4 — BOTTOM BORDER (bottom 8%): Ornate thin gold double-line border. Small gold bow accent at center bottom.
Luxurious, sophisticated, premium celebration. Black-tie New Year gala aesthetic.`,
    },
    {
      id: 'grt_newy_minimal', name: '미니멀 2026', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '깔끔한 연도 강조',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white (#ffffff). No textures, no gradients — pure white.
ZONE 1 — TOP MARGIN (top 20%): Empty white space. Single thin horizontal line in navy (#1e40af) at 8% opacity, spanning center 60% width.
ZONE 2 — YEAR TYPOGRAPHY (center, 35%): "2026" in ultra-bold sans-serif (72px, weight 900, navy #1e40af). Tight letter-spacing (-2px). Subtle drop shadow (2px 2px 0 rgba(30,64,175,0.08)). Numbers fill the horizontal center with commanding presence.
ZONE 3 — GREETING TEXT (below numbers, 20%): "새해 복 많이 받으세요" in navy (#1e3a8a, 18px, weight 500). Below: thin gold (#d4a017) horizontal line, 40px wide, centered, 1px height. Below line: hospital/clinic name in light navy (#93c5fd, 12px, weight 400, letter-spacing 3px).
ZONE 4 — BOTTOM (bottom 15%): Empty white space. Clean, breathing room.
Ultra-minimalist, typographic, contemporary graphic design. Maximum whitespace, zero clutter. Scandinavian design sensibility.`,
    },
    {
      id: 'grt_newy_confetti', name: '컨페티 파티', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '화려한 컨페티',
      layoutHint: 'cute',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft pink (#fdf2f8) to white gradient (top to bottom).
ZONE 1 — CONFETTI EXPLOSION (top 35%): Dense burst of colorful confetti pieces — circles, rectangles, stars, triangles in pink (#ec4899), gold (#fbbf24), sky blue (#38bdf8), mint (#34d399), lavender (#a78bfa). Pieces at varying sizes (4–12px), random rotations, 40–90% opacity. Two small party hats (pink with gold stripes) near top corners.
ZONE 2 — GREETING BANNER (center, 25%): Rounded rectangle banner with pink (#ec4899) fill at 90% opacity. White bold text "2026 새해 복 많이 받으세요" (22px, weight 800). Small cute star decorations (★) flanking the text. Below banner: 2 small balloon illustrations (pink and gold) with curly strings.
ZONE 3 — CHARACTER ROW (below center, 20%): 3 small kawaii-style celebration characters (simple round faces with party hats, rosy cheeks, happy expressions) in a row, each holding a noisemaker or small flag. Pastel colored. Cute and child-friendly.
ZONE 4 — BOTTOM (bottom 15%): Hospital/clinic name in pink (#be185d, 13px, weight 500). Scattered small confetti pieces continuing downward at 20% opacity.
Joyful, energetic, family-friendly party mood. Kawaii-cute celebration aesthetic.`,
    },
    {
      id: 'grt_newy_sunrise', name: '첫 일출', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '새해 첫 일출',
      layoutHint: 'nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Gradient sky — deep indigo (#312e81) at top fading through warm orange (#f97316) to golden yellow (#fbbf24) at horizon line (60% from top), then soft peach (#fed7aa) below.
ZONE 1 — SKY AND CLOUDS (top 45%): Dramatic cloud formations painted in watercolor style, lit from below with golden-orange glow. Cloud edges highlighted in warm gold (#fbbf24). Upper sky transitioning from night indigo to dawn orange. 2–3 subtle star remnants fading in upper-left at 15% opacity.
ZONE 2 — SUNRISE HORIZON (middle, 20%): Brilliant sun half-circle rising from ocean horizon line, radiating warm light rays (thin lines, gold #FFD700, 10–30% opacity) fanning upward. Ocean surface reflecting golden light with gentle horizontal ripple lines in orange (#ea580c) at 20% opacity. "2026" subtly formed in cloud wisps or light rays near sun (30% opacity, 36px).
ZONE 3 — GREETING TEXT (lower portion, 20%): "새해 복 많이 받으세요" in warm brown (#92400e, 22px, weight 700) with soft glow. Below: hospital/clinic name in orange (#ea580c, 13px, weight 500).
ZONE 4 — BOTTOM WATER (bottom 10%): Calm ocean surface in muted teal (#0d9488) at 30% opacity, gentle watercolor wash effect.
Majestic, hopeful, new beginning. Watercolor landscape painting style. Serene and inspirational dawn.`,
    },
    {
      id: 'grt_newy_clock', name: '자정 시계', color: '#64748b', accent: '#475569', bg: '#f8fafc',
      desc: '카운트다운 시계',
      layoutHint: 'warm',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm off-white (#f8fafc) with subtle aged paper texture at 5% opacity.
ZONE 1 — DECORATIVE TOP (top 10%): Thin ornate line in slate (#64748b) at 15% opacity. Small gear/cog icon centered (16px, slate at 30% opacity).
ZONE 2 — CLOCK FACE (center, 50%): Large vintage pocket watch face — outer double-circle border in gold (#d4a017) with Roman numeral hour markers (XII at top, slate #475569, 10px). Ornate hour and minute hands pointing to 12:00 in gold (#b8860b) with decorative filigree. Inner circle with fine tick marks. Small exposed gear/mechanical details visible through sub-dial at 6 o'clock position (slate at 20% opacity). Warm sepia tone overall (#92400e at 5% wash).
ZONE 3 — GREETING TEXT (below clock, 20%): "새해 복 많이 받으세요" in slate (#475569, 20px, weight 700). Below: "2026" in gold (#d4a017, 14px, weight 600, letter-spacing 4px). Below: hospital/clinic name in light slate (#94a3b8, 12px, weight 400).
ZONE 4 — BOTTOM ACCENT (bottom 8%): Thin ornate line mirroring top. Two small decorative scrollwork flourishes flanking center.
Elegant, vintage, warm. Pocket-watch steampunk aesthetic. Transitional midnight moment captured with warmth.`,
    },
  ],

  // ─── 명절 인사: 어버이날 (6개) ───
  greeting_어버이날: [
    {
      id: 'grt_parent_carnation', name: '카네이션 전통', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '빨간 카네이션',
      layoutHint: 'traditional',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fef2f2) to soft white gradient.
ZONE 1 — FLORAL FRAME (outer border, 10% inset): Delicate red (#dc2626) carnation petal border — small carnation buds and green leaves arranged along all four edges, watercolor style, 60–80% opacity. Corner clusters slightly larger with 2–3 full blooms.
ZONE 2 — MAIN CARNATION (center-top, 40%): Large realistic red carnation (#dc2626) as centerpiece, detailed layered petal texture with subtle pink (#fca5a5) highlights on petal edges. Dark green (#166534) stem with 2 leaves. Green satin ribbon tied in bow at stem base. Soft shadow beneath flower (4px blur, 10% opacity).
ZONE 3 — GREETING TEXT (center-lower, 25%): "감사합니다" in elegant brush calligraphy style (28px, weight 700, deep red #991b1b). Below: "어버이날을 축하합니다" in warm gray (#78716c, 14px, weight 400). Below: hospital/clinic name in red accent (#b91c1c, 13px, weight 500).
ZONE 4 — BOTTOM ACCENT (bottom 10%): Scattered small carnation petals falling gently (5–7 petals, rotated, 20–40% opacity). Thin red (#dc2626) line at 10% opacity.
Traditional, heartfelt, Korean gratitude aesthetic. Warm red and cream. Respectful and loving.`,
    },
    {
      id: 'grt_parent_watercolor', name: '수채화 꽃다발', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8',
      desc: '수채화 꽃다발',
      layoutHint: 'warm',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft pink wash (#fdf2f8) with subtle watercolor paper texture (fine grain, 8% opacity).
ZONE 1 — WATERCOLOR BOUQUET (top-center, 50%): Loose, expressive watercolor carnation bouquet — 5–7 carnations in varying pinks (#f472b6, #ec4899, #fda4af) and reds (#ef4444), painted with visible brush strokes and soft color bleeds where petals meet. Green (#86efac) stems and leaves with wet-on-wet watercolor effect. Paint drips and splashes at bouquet base (pink, 15% opacity). No hard outlines — everything soft and painterly.
ZONE 2 — ARTISTIC SPLASHES (sides, 10% each): Small abstract watercolor dots and splashes in pink and mint green along left and right margins, 15–25% opacity, artistic accent.
ZONE 3 — GREETING TEXT (center-lower, 25%): "감사합니다" in handwritten brush-script style (26px, weight 600, warm pink #ec4899). Slight natural variation in letter weight as if hand-painted. Below: "사랑하는 부모님께" in soft gray (#9ca3af, 13px, weight 400, handwritten style). Below: hospital/clinic name in pink (#f472b6, 12px, weight 500).
ZONE 4 — BOTTOM (bottom 10%): Faint watercolor wash stripe in blush pink (#fce7f3) at 20% opacity, soft feathered edges.
Artistic, emotional, hand-painted watercolor aesthetic. Warm family love expressed through painterly beauty.`,
    },
    {
      id: 'grt_parent_modern', name: '모던 감사', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 감사 카드',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white (#ffffff) to very faint indigo (#eef2ff) gradient (top to bottom, barely perceptible).
ZONE 1 — TOP SPACE (top 20%): Pure white space. Single thin horizontal line in indigo (#6366f1) at 6% opacity, 50% width, centered.
ZONE 2 — LINE-ART CARNATION (center, 35%): Single elegant carnation stem in fine line-art — thin indigo (#6366f1) strokes (1.5px weight), minimal detail, architectural drawing style. Flower head with simplified geometric petal shapes. Long straight stem with two leaves. Small outline heart shape (indigo, 15% opacity) floating near top-right of flower. Clean, precise, no fills — outlines only.
ZONE 3 — TYPOGRAPHY (below flower, 25%): "감사합니다" in contemporary sans-serif (28px, weight 700, indigo #4f46e5). Generous letter-spacing (1px). Below: thin indigo line, 30px wide, centered, 1px height, 30% opacity. Below: hospital/clinic name in light indigo (#a5b4fc, 12px, weight 400, letter-spacing 2px).
ZONE 4 — BOTTOM (bottom 15%): Two small outline hearts in indigo at 8% opacity, slightly offset from center. Clean white space.
Modern, minimalist, refined. Line-art sophistication with maximum whitespace. Understated medical brand elegance.`,
    },
    {
      id: 'grt_parent_photo', name: '포토 프레임', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '가족 사진 프레임',
      layoutHint: 'cute',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fff7ed) with subtle kraft paper texture at 6% opacity.
ZONE 1 — DECORATIVE TOP (top 15%): Hand-drawn style banner with orange (#f97316) outline, scalloped edge, containing "Happy Parents Day" in playful handwritten font (14px, weight 600, orange). Small heart doodles (orange, hand-drawn style) flanking banner.
ZONE 2 — PHOTO FRAME (center, 40%): Polaroid-style white photo frame (tilted 3° clockwise), soft drop shadow (4px, 10% opacity). Heart-shaped clip at top of frame in orange (#ea580c). Inside frame: warm gradient placeholder in peach (#fed7aa) to orange (#fdba74). Below frame: small "소중한 우리 가족" handwritten text (12px, gray #78716c). Carnation garland — small pink and red carnation buds connected by green vine — arching over top of polaroid frame.
ZONE 3 — SCRAPBOOK ACCENTS (sides, 15% each): Hand-drawn heart doodles, small star stickers, washi tape strips (orange stripe pattern, tilted), circular stamp with "LOVE" text — scattered at 30–50% opacity. Scrapbook/journal aesthetic.
ZONE 4 — BOTTOM (bottom 15%): Hospital/clinic name in orange (#ea580c, 13px, weight 500). Small hand-drawn arrow pointing to name. Tiny carnation sticker accent.
Playful, warm, scrapbook aesthetic. Family album memory-book feel. Cute yet heartfelt.`,
    },
    {
      id: 'grt_parent_gold', name: '금장 카네이션', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '골드 프리미엄',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep burgundy (#450a0a) to dark wine (#7f1d1d) gradient. Subtle embossed linen paper texture at 5% opacity.
ZONE 1 — GOLD FRAME (outer border, 8% inset): Ornate double-line gold (#d4a017) frame border with decorative corner flourishes (scrollwork). Inner line thin (1px), outer line medium (2px), 4px gap between. Gold at 80% opacity with subtle metallic sheen effect.
ZONE 2 — GOLDEN CARNATION (center-top, 40%): Elegant carnation illustration in metallic gold (#d4a017) with highlights in bright gold (#FFD700). Foil-stamped effect — subtle shine gradient across petals. Stem and leaves in dark gold (#92400e). Gold ribbon bow at stem with flowing ribbon tails. Soft gold glow (8px blur, 15% opacity) around flower.
ZONE 3 — GREETING TEXT (center-lower, 25%): "감사합니다" in gold (#FFD700, 26px, weight 700, serif font). Metallic foil text effect with subtle highlight. Below: "어버이날을 축하합니다" in light gold (#fde68a, 13px, weight 400). Below: hospital/clinic name in gold (#d4a017, 13px, weight 500, letter-spacing 2px).
ZONE 4 — BOTTOM ACCENT (bottom 10%): Centered gold ribbon bow illustration (small). Thin gold line at 20% opacity.
Luxurious, prestigious, premium gold-on-burgundy. Metallic foil elegance. High-end medical practice appreciation.`,
    },
    {
      id: 'grt_parent_garden', name: '정원 풍경', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '카네이션 정원',
      layoutHint: 'nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft morning sky blue (#f0fdf4) at top fading to garden green (#dcfce7) at bottom. Warm golden light wash at 8% opacity overall.
ZONE 1 — SKY AND LIGHT (top 25%): Soft blue sky with 2–3 gentle white clouds. Morning sunlight rays filtering diagonally from upper-right — thin golden beams (#fbbf24) at 10% opacity fanning downward. Warm, peaceful morning atmosphere.
ZONE 2 — CARNATION GARDEN (center, 40%): Lush garden scene — dense rows of blooming carnations in red (#dc2626), pink (#f472b6), and white, painted in watercolor botanical illustration style. Varied heights, some buds, some full bloom. Rich green (#22c55e) foliage between flowers. Small garden path (warm stone color #d6d3d1) winding through center. Wooden garden bench on right side, partially surrounded by flowers.
ZONE 3 — GREETING TEXT (lower, 20%): "감사합니다" in forest green (#15803d, 24px, weight 700). Below: "사랑과 감사를 담아" in warm green (#4ade80, 13px, weight 400). Below: hospital/clinic name in green (#22c55e, 12px, weight 500).
ZONE 4 — BOTTOM GARDEN EDGE (bottom 10%): Soft grass texture fading out in green (#86efac) at 15% opacity. Small butterfly silhouette in green at 20% opacity near bottom-right.
Peaceful, nurturing, nature-garden aesthetic. Watercolor botanical beauty. Warm morning sunlight in a carnation garden.`,
    },
  ],

  // ─── 명절 인사: 크리스마스 (6개) ───
  greeting_크리스마스: [
    {
      id: 'grt_xmas_tree', name: '크리스마스 트리', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '화려한 트리',
      layoutHint: 'traditional',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fffbeb) to soft white gradient. Subtle warm glow at center (radial, gold #fbbf24 at 3% opacity).
ZONE 1 — STAR TOPPER (top 15%): Large golden star (#FFD700) at tree peak with radiating light rays (thin lines, 8% opacity). Small sparkle dots around star (gold, 3–5px, 30% opacity).
ZONE 2 — CHRISTMAS TREE (center, 50%): Beautiful triangular evergreen tree in rich green (#22c55e to #15803d gradient). Layered branch tiers with texture. Decorated with: colorful ornament balls (red #dc2626, gold #d4a017, blue #3b82f6, 8–12px circles), twinkling light dots (white/yellow, 3px, glow effect), golden garland (#d4a017) draped in swooping curves across tree. Warm brown (#92400e) trunk at base.
ZONE 3 — GIFTS AND GREETING (below tree, 20%): 3–4 gift boxes in red, green, and gold with ribbon bows arranged at tree base. "Merry Christmas" in red (#dc2626, 12px, weight 400, letter-spacing 2px). Below: "메리 크리스마스" in green (#15803d, 22px, weight 700). Below: hospital/clinic name in red (#b91c1c, 13px, weight 500).
ZONE 4 — BOTTOM (bottom 10%): Soft golden glow at floor level (8% opacity). Thin green decorative line.
Festive, traditional, warm living-room Christmas atmosphere. Classic holiday card with rich green-red-gold palette.`,
    },
    {
      id: 'grt_xmas_snow', name: '눈 내리는 밤', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '눈 오는 겨울밤',
      layoutHint: 'nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep winter night blue (#0c1445) to midnight (#1e1b4b) gradient.
ZONE 1 — FALLING SNOW (full overlay): Scattered snowflake particles across entire image — mix of small dots (2–3px, white, 40–70% opacity) and larger crystal snowflakes (8–12px, white, 20–30% opacity, six-pointed). Varying sizes create depth. Slight motion blur on some for falling effect.
ZONE 2 — VILLAGE SCENE (center-bottom, 45%): 3–4 cozy houses with snow-covered rooftops (white #f0f9ff caps, thick), warm golden light (#fbbf24) glowing from windows. Small church steeple on right with lit window. Watercolor painting style with soft edges. Snow-covered ground in soft blue-white (#e0f2fe). Single vintage street lamp on left with warm golden glow circle (radial gradient, #fbbf24 at 30% opacity, 40px radius).
ZONE 3 — GREETING TEXT (upper-center, 25%): "Merry Christmas" in white (14px, weight 400, letter-spacing 3px, 80% opacity). Below: "메리 크리스마스" in white (22px, weight 700), soft glow (text-shadow 0 0 8px rgba(255,255,255,0.3)). Below: hospital/clinic name in ice blue (#7dd3fc, 12px, weight 500).
ZONE 4 — GROUND SNOW (bottom 10%): Undulating snow-covered ground in blue-white, soft watercolor edge fading at bottom.
Peaceful, magical, silent night atmosphere. Watercolor winter landscape. Cozy village Christmas eve.`,
    },
    {
      id: 'grt_xmas_minimal', name: '미니멀 노엘', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '심플 레드&화이트',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Pure white (#ffffff). Extremely subtle snowflake pattern — geometric six-pointed snowflakes in light gray (#f1f5f9) at 4% opacity, scattered sparsely.
ZONE 1 — HANGING LINE (top 30%): Single thin vertical line (1px, red #dc2626 at 40% opacity) dropping from top-center, 30% of card height. Clean, precise, geometric.
ZONE 2 — ORNAMENT BALL (center, 25%): Single elegant Christmas ornament ball hanging from the line — perfect circle (50px diameter), solid red (#dc2626) fill, small gold (#d4a017) cap and hook at top connecting to line. Subtle highlight reflection (white arc, 15% opacity) on upper-left of ball surface. Minimal soft shadow beneath (4px blur, 5% opacity).
ZONE 3 — TYPOGRAPHY (below ornament, 20%): "Merry Christmas" in clean sans-serif (14px, weight 400, letter-spacing 4px, red #b91c1c). Below: "메리 크리스마스" in red (#dc2626, 20px, weight 700). Below: hospital/clinic name in light gray (#d1d5db, 11px, weight 400, letter-spacing 2px).
ZONE 4 — BOTTOM (bottom 20%): Vast white space. Nothing else. Breathing room.
Ultra-minimalist, red-and-white only. Single ornament as focal point. Sophisticated graphic design. Less is more.`,
    },
    {
      id: 'grt_xmas_character', name: '산타 캐릭터', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '귀여운 산타',
      layoutHint: 'cute',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft warm red (#fef2f2) to white gradient. Subtle candy cane diagonal stripe pattern in red (#fca5a5) and white at 4% opacity.
ZONE 1 — BANNER (top 15%): Scalloped red (#ef4444) banner with white text "Merry Christmas!" (14px, weight 700). Small holly leaf accents at banner ends. Tiny gold stars scattered above (5–8 stars, 4px, 30% opacity).
ZONE 2 — CHARACTER SCENE (center, 45%): Adorable chibi Santa (round body, oversized red hat with white pom-pom, rosy cheeks, happy closed-eye smile) at center carrying red gift bag. To Santa's left: cute kawaii tooth character dressed as elf (green hat, pointy ears, big smile). To Santa's right: small round snowman with orange carrot nose and red scarf. All characters in kawaii style — simple shapes, big heads, tiny bodies, pastel shading. Small candy canes, gingerbread man cookie, and lollipop scattered around feet.
ZONE 3 — GREETING TEXT (below characters, 20%): "메리 크리스마스" in bright red (#ef4444, 22px, weight 800). Below: "즐거운 성탄절 보내세요" in green (#16a34a, 13px, weight 400). Below: hospital/clinic name in red (#dc2626, 12px, weight 500).
ZONE 4 — BOTTOM (bottom 10%): Row of small gift box icons (red, green, gold) with bows. Snow-like white dots along very bottom edge.
Cute, kawaii, cheerful Christmas party. Child-friendly, adorable character illustrations. Bright and playful.`,
    },
    {
      id: 'grt_xmas_gold', name: '골드 오너먼트', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '럭셔리 골드 장식',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep navy (#1a1a2e) to black (#0a0a1a) gradient. Subtle gold dust particles (1–2px dots, gold #d4a017) scattered at 5% opacity.
ZONE 1 — HANGING ORNAMENTS (top 40%): 5 elegant Christmas ornaments hanging from thin gold (#d4a017) lines of varying lengths from top edge. Ornament shapes: round ball, teardrop, elongated oval, star, round ball — in gold (#d4a017) and bright gold (#FFD700) with metallic sheen highlights. Each has decorative gold cap. Gold ribbon bows at suspension points. Subtle shimmer/sparkle dots (white, 2px, 50% opacity) around ornaments.
ZONE 2 — CRYSTAL SNOWFLAKES (middle band, 15%): 3–4 large geometric crystal snowflakes in white at 10–20% opacity, intricate six-pointed fractal design. Elegant, jewel-like precision.
ZONE 3 — GREETING TEXT (center-lower, 25%): "Merry Christmas" in gold foil effect (#FFD700 to #d4a017 gradient, 16px, weight 400, letter-spacing 3px, serif font). Below: "메리 크리스마스" in bright gold (#FFD700, 24px, weight 700). Metallic text effect with highlight. Below: hospital/clinic name in muted gold (#b8860b, 12px, weight 500).
ZONE 4 — BOTTOM (bottom 10%): Thin gold double-line border. Small gold bow at center.
Luxurious, opulent, premium. Gold-on-navy elegance. High-end luxury Christmas card. Metallic shimmer throughout.`,
    },
    {
      id: 'grt_xmas_wreath', name: '리스 장식', color: '#16a34a', accent: '#15803d', bg: '#f0fdf4',
      desc: '초록 리스 프레임',
      layoutHint: 'warm',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#f0fdf4) with soft warm golden glow at center (radial, #fbbf24 at 5% opacity).
ZONE 1 — WREATH CIRCLE (centered, 70% of card): Circular Christmas wreath — lush pine branches (#16a34a to #15803d) forming thick ring (wreath width ~15% of diameter). Branches have needle texture, layered and full. Decorated with: red holly berries (#dc2626) in clusters of 3, dark green holly leaves (#166534), 3–4 small pine cones (#92400e) at natural positions, small mistletoe sprigs with white berries. Subtle shadow behind wreath (6px blur, 8% opacity).
ZONE 2 — RED BOW (bottom of wreath): Large decorative red (#dc2626) satin ribbon bow at 6 o'clock position of wreath. Two flowing ribbon tails hanging down. Bow is focal accent point.
ZONE 3 — CENTER TEXT (inside wreath circle): "Merry Christmas" in dark green (#15803d, 13px, weight 400, letter-spacing 2px). Below: "메리 크리스마스" in red (#dc2626, 22px, weight 700). Below: hospital/clinic name in green (#16a34a, 12px, weight 500). Text centered within the open circle of the wreath. Warm candlelight glow behind text (radial, #fbbf24 at 6% opacity).
ZONE 4 — CORNERS (outside wreath): Small scattered pine needles and single berries at corners, 15% opacity. Clean and uncluttered outside wreath.
Warm, cozy, family Christmas wreath. Traditional green-and-red. Welcoming and festive.`,
    },
  ],

  // ─── 명절 인사: 기본 fallback (구 greeting) ───
  greeting: [
    {
      id: 'grt_traditional_korean', name: '전통 한국풍', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '전통 명절 디자인',
      layoutHint: 'traditional',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fef2f2) with subtle hanji (Korean paper) texture at 5% opacity.
ZONE 1 — TRADITIONAL FRAME (outer border, 8% inset): Decorative red (#dc2626) and gold (#d4a017) traditional Korean frame border — dancheong-inspired geometric patterns along edges. Corner accents with stylized cloud motifs (구름문) in gold at 60% opacity. Double-line inner border (red 1px outer, gold 1px inner, 3px gap).
ZONE 2 — DECORATIVE ELEMENTS (top-center, 30%): Elegant plum blossom (매화) branch illustration — dark brown (#57534e) branch with red (#dc2626) and pink (#fca5a5) five-petal blossoms. 2–3 crane (학) silhouettes in gold (#d4a017) at 20% opacity flying in upper portion. Small traditional cloud patterns scattered.
ZONE 3 — GREETING TEXT (center, 30%): Main greeting in brush calligraphy style — "명절을 축하합니다" in deep red (#991b1b, 26px, weight 800). Below: holiday closure period in warm gray (#78716c, 13px, weight 400) — "휴진 안내: OO월 OO일 ~ OO월 OO일". Below: hospital/clinic name in red (#dc2626, 14px, weight 600) with small traditional frame underline.
ZONE 4 — BOTTOM ACCENT (bottom 15%): Pine tree (소나무) silhouette illustration in dark green (#166534) at 15% opacity. Thin red and gold decorative line. Small Korean traditional knot (매듭) ornament in red at center.
Traditional, dignified, Korean festive aesthetic. Red-and-gold dancheong elegance. Respectful holiday greeting.`,
    },
    {
      id: 'grt_warm_family', name: '따뜻한 가족', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '가족 중심 따뜻한',
      layoutHint: 'warm',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft warm cream (#fff7ed) to peach (#fed7aa) gradient (top to bottom, very subtle). Soft bokeh light circles — 5–8 warm gold (#fbbf24) circles at 8–15% opacity, varying sizes (20–60px), blurred edges, scattered across background.
ZONE 1 — WARM HEADER (top 15%): Small candle flame illustration (warm orange #f97316, gentle glow effect) at top-center. Thin hand-drawn style wavy line in orange (#fdba74) at 20% opacity below flame.
ZONE 2 — FAMILY ILLUSTRATION (center, 40%): Gentle hand-drawn style illustration — simple, warm line art of family silhouette (2 adults, 1–2 children) holding hands, drawn in warm brown (#92400e) at 50% opacity. Watercolor wash behind figures in soft orange (#fed7aa) at 15% opacity. Cozy, simple, heartfelt — not overly detailed. Small heart shape above family group in orange at 30% opacity.
ZONE 3 — GREETING TEXT (below illustration, 25%): "따뜻한 명절 보내세요" in warm orange-brown (#ea580c, 22px, weight 700). Below: holiday closure info in warm gray (#78716c, 12px, weight 400). Below: hospital/clinic name in orange (#f97316, 13px, weight 500).
ZONE 4 — BOTTOM GLOW (bottom 10%): Warm candlelight glow — radial gradient in gold (#fbbf24) at 5% opacity fading outward from center-bottom. Thin hand-drawn line in peach at 15% opacity.
Warm, emotional, family-centered. Soft watercolor candlelight mood. Caring medical practice greeting.`,
    },
    {
      id: 'grt_modern_minimal', name: '모던 미니멀', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 미니멀',
      layoutHint: 'minimal',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Pure white (#ffffff). Extremely subtle geometric grid pattern in light indigo (#e0e7ff) at 3% opacity.
ZONE 1 — TOP SPACE (top 25%): Clean white space. Single thin horizontal line in indigo (#6366f1) at 8% opacity, spanning center 40% width. Above line: small geometric holiday symbol (simple line-art star or ornament, indigo #6366f1 at 25% opacity, 24px).
ZONE 2 — MAIN TYPOGRAPHY (center, 30%): "Happy Holidays" in clean sans-serif (14px, weight 400, letter-spacing 4px, indigo #6366f1 at 60% opacity). Below: main greeting "행복한 명절 되세요" in bold indigo (#4f46e5, 24px, weight 700). Generous whitespace between lines (20px gap).
ZONE 3 — SCHEDULE INFO (below center, 20%): Thin indigo line (30px wide, centered, 1px, 15% opacity). Below: "휴진 안내" in indigo (#6366f1, 11px, weight 600, letter-spacing 2px). Below: closure dates in light gray (#94a3b8, 12px, weight 400). Below: hospital/clinic name in indigo (#a5b4fc, 12px, weight 400, letter-spacing 2px).
ZONE 4 — BOTTOM (bottom 20%): Pure white space. Single small geometric dot in indigo at 10% opacity, centered.
Modern minimalist, typographic precision. Indigo and white only. Maximum whitespace. Refined medical brand.`,
    },
    {
      id: 'grt_nature_season', name: '자연 사계절', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '계절감 자연풍',
      layoutHint: 'nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft sage green (#f0fdf4) to warm cream (#fefce8) gradient (top to bottom).
ZONE 1 — BOTANICAL HEADER (top 30%): Watercolor botanical arch — eucalyptus branches, small leaves, and seasonal foliage arranged in soft arch/garland shape across top. Colors: sage green (#22c55e), olive (#65a30d), mint (#86efac), with earth brown (#92400e) stems. Watercolor style with soft bleeds and natural imperfections. Small seasonal flowers (cherry blossoms for spring, sunflower for summer, maple for autumn, pine for winter) tucked into arrangement.
ZONE 2 — LANDSCAPE VIGNETTE (center, 30%): Small circular vignette (watercolor, soft feathered edge) showing serene seasonal landscape — rolling green hills, single tree, gentle sky. Earth tones (#92400e, #22c55e, #38bdf8) in loose watercolor wash. Peaceful and calming miniature scene.
ZONE 3 — GREETING TEXT (below vignette, 25%): "행복한 명절 되세요" in forest green (#15803d, 22px, weight 700). Below: closure dates in warm gray (#78716c, 12px, weight 400). Below: hospital/clinic name in green (#22c55e, 13px, weight 500).
ZONE 4 — BOTTOM BOTANICAL (bottom 10%): Small watercolor leaf sprigs at bottom corners (sage green, 20% opacity). Thin natural-style line (hand-drawn feel) in green at 10% opacity.
Serene, nature-inspired, seasonal. Watercolor botanical elegance. Peaceful and refreshing.`,
    },
    {
      id: 'grt_luxury_gold', name: '럭셔리 골드', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '프리미엄 골드',
      layoutHint: 'luxury',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Deep navy (#0f172a) to dark charcoal (#1e293b) gradient. Subtle premium linen paper texture at 4% opacity.
ZONE 1 — GOLD BORDER (outer frame, 6% inset): Elegant gold (#d4a017) double-line frame — outer line 2px, inner line 1px, 4px gap. Corner ornamental flourishes (gold scrollwork, Art Deco style). Metallic foil effect with subtle highlight gradient across border.
ZONE 2 — ORNAMENT DISPLAY (top-center, 35%): 3 sophisticated holiday ornaments hanging from thin gold lines — center ornament larger (round, 40px, gold with intricate engraved pattern), flanking ornaments smaller (teardrop shapes, 28px). All in gold (#d4a017 to #FFD700 gradient). Metallic sheen highlights. Small gold stars (4px, 30% opacity) scattered around ornaments.
ZONE 3 — GREETING TEXT (center, 30%): "Happy Holidays" in gold foil serif (14px, weight 400, letter-spacing 3px, #FFD700). Below: "행복한 명절 되세요" in bright gold (#FFD700, 24px, weight 700). Metallic text shimmer effect. Below: thin gold line (40px, centered, 1px). Below: hospital/clinic name in muted gold (#b8860b, 12px, weight 500, letter-spacing 2px).
ZONE 4 — BOTTOM (bottom 12%): Closure dates in light gold (#fde68a at 60% opacity, 11px, weight 400). Small gold bow ornament at very bottom center.
Luxurious, prestigious, premium. Gold-on-navy. High-end medical practice. Metallic foil sophistication.`,
    },
    {
      id: 'grt_cute_character', name: '귀여운 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '캐릭터 일러스트',
      layoutHint: 'cute',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft pink (#fdf2f8) to white gradient. Tiny pastel confetti dots (pink #f9a8d4, yellow #fde68a, mint #a7f3d0, lavender #c4b5fd) scattered at 8% opacity, 2–4px circles.
ZONE 1 — FESTIVE ACCENTS (top 15%): Small pastel star shapes and sparkle dots in pink (#ec4899), gold (#fbbf24), mint (#34d399) scattered across top — 15–30% opacity, 4–8px. Playful and scattered randomly. Thin festive bunting/flag banner in pastel colors across top edge.
ZONE 2 — CHARACTER SCENE (center, 45%): Adorable kawaii-style tooth character at center — white tooth shape with big sparkly eyes, rosy pink cheeks, wide happy smile, wearing small festive party hat (pink with gold dot). Character holding small flag or sparkler. To character's left: small cute star companion character (yellow, happy face). To right: small heart companion (pink, happy face). All in kawaii style — simple round shapes, minimal detail, maximum cuteness. Small confetti pieces around characters.
ZONE 3 — SPEECH BUBBLE (above or beside character, 20%): Rounded speech bubble (white fill, pink #ec4899 border 2px) with "행복한 명절 보내세요!" in pink (#be185d, 18px, weight 700). Small heart accent inside bubble. Bubble tail pointing to tooth character.
ZONE 4 — BOTTOM (bottom 15%): Hospital/clinic name in pink (#ec4899, 13px, weight 500). Row of tiny festive icons (gift, star, heart, candy) in pastel colors at 25% opacity.
Cute, kawaii, playful. Pastel pink celebration. Child-friendly dental practice greeting. Adorable and cheerful.`,
    },
  ],

  // ─── 채용/공고 (6개) ───
  hiring: [
    {
      id: 'hir_corporate_clean', name: '기업 클린', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '공식 채용공고',
      layoutHint: 'corporate',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white.
ZONE 1 — HEADER BAR (top 5%): Full-width 2px solid navy (#1e40af → #1e3a8a) gradient bar. Clean corporate feel.
ZONE 2 — TITLE (15%): "RECRUITMENT" in small navy text with letter-spacing 2px. Below: large bold "간호사 모집" in navy (#1e40af, 26px, weight 800).
ZONE 3 — SUBTITLE (5%): "함께 성장할 인재를 찾습니다" in navy accent text.
ZONE 4 — REQUIREMENTS CARD (40%): White rounded card (border-radius 12px, soft shadow). 4 rows of requirements, each with: small navy circle (8% opacity) with inner dot (30% opacity) on left, text on right: "정규직 / 경력 1년 이상", "4대보험 완비", "중식 제공 / 인센티브", "채용시까지 상시 모집" in gray (#475569).
ZONE 5 — CTA (12%): Full-width rounded button with navy gradient, white bold text "지원하기".
BOTTOM: Hospital name in light gray.
Professional, corporate, structured. Official recruitment announcement style.`,
    },
    {
      id: 'hir_friendly_team', name: '팀워크 친근', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '친근한 팀 소개형',
      layoutHint: 'team',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft mint (#f0fdf4) to white gradient.
ZONE 1 — BANNER (top 18%): Rounded rectangle with green (#22c55e) at 6% opacity. "We're Hiring!" in small green text. Below: large bold "간호사 모집" in green (#22c55e, 26px, weight 800).
ZONE 2 — SUBTITLE (5%): "함께 성장할 인재를 찾습니다" in green accent text.
ZONE 3 — REQUIREMENTS CARD (40%): White rounded card (border-radius 12px, soft shadow). 4 rows with green circle icons and requirement text in gray. Friendly, welcoming icon style.
ZONE 4 — CTA (12%): Full-width rounded button with green gradient (#22c55e → #16a34a), white bold text "지원하기".
BOTTOM: Hospital name in green text.
Friendly, approachable, welcoming. "Join our family" feeling. Warm team recruitment aesthetic.`,
    },
    {
      id: 'hir_modern_startup', name: '모던 스타트업', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '트렌디 모던',
      layoutHint: 'modern',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Light lavender (#f5f3ff) to white gradient.
ZONE 1 — BADGE (top 12%): Centered rounded pill with purple gradient (#8b5cf6 → #7c3aed) at 80%, white bold text "JOIN OUR TEAM" with letter-spacing.
ZONE 2 — TITLE (10%): Large bold "간호사 모집" in purple (#8b5cf6, 26px, weight 800).
ZONE 3 — SUBTITLE (5%): "함께 성장할 인재를 찾습니다" in purple accent text.
ZONE 4 — REQUIREMENTS CARD (40%): White rounded card with soft shadow. 4 rows with circle icons in purple and requirement text. Modern, clean layout.
ZONE 5 — CTA (12%): Full-width rounded button with purple gradient, white bold text "지원하기".
BOTTOM: Hospital name in light gray.
Modern, trendy, startup vibe. Bold contemporary typography. Energetic and innovative feel.`,
    },
    {
      id: 'hir_benefits_focus', name: '복리후생 강조', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '혜택 중심 디자인',
      layoutHint: 'benefits',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fffbeb) to white gradient.
ZONE 1 — HEADER (top 12%): "We're Hiring" in small amber text. Below: large bold "간호사 모집" in amber (#f59e0b, 26px, weight 800).
ZONE 2 — SUBTITLE (5%): "함께 성장할 인재를 찾습니다" in amber accent text.
ZONE 3 — BENEFITS GRID (40%): White rounded card with soft shadow. 4 rows, each: amber circle icon (8% opacity with inner dot at 30%), benefit text: "정규직 / 경력 1년 이상", "4대보험 완비", "중식 제공 / 인센티브", "채용시까지 상시 모집" in gray (#475569). Icon-heavy infographic style highlighting benefits.
ZONE 4 — CTA (12%): Full-width rounded button with amber gradient (#f59e0b → #d97706), white bold text "지원하기".
BOTTOM: Hospital name in amber text.
Benefits-focused, warm, inviting. Employee perks prominently displayed. Compelling recruitment.`,
    },
    {
      id: 'hir_urgent_now', name: '급구 긴급', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '긴급 채용 강조',
      layoutHint: 'urgent',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white.
ZONE 1 — URGENT BANNER (top 18%): Full-width rounded rectangle with bold red (#ef4444) fill. "URGENT" in small white text with letter-spacing, 70% opacity. Below: large bold white text "간호사 급구" (26px, weight 900). Eye-catching, attention-grabbing red banner.
ZONE 2 — SUBTITLE (5%): "함께 성장할 인재를 찾습니다" in red accent text.
ZONE 3 — REQUIREMENTS CARD (40%): White rounded card with soft shadow. 4 rows with red circle indicators and requirement text in gray. Urgent, direct, clear.
ZONE 4 — CTA (12%): Full-width rounded button with red gradient (#ef4444 → #dc2626), white bold text "지원하기".
BOTTOM: Hospital name in light gray.
Urgent, time-sensitive. Bold red. Attention-grabbing recruitment. Immediate action needed feel.`,
    },
    {
      id: 'hir_premium_brand', name: '프리미엄 브랜드', color: '#78716c', accent: '#57534e', bg: '#fafaf9',
      desc: '고급 브랜딩',
      layoutHint: 'brand',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm off-white (#fafaf9).
ZONE 1 — HEADER (top 12%): Thin decorative line in charcoal (#78716c) at 10% opacity. "CAREER OPPORTUNITY" in small charcoal text with letter-spacing 3px. Below: large bold "간호사 모집" in charcoal (#57534e, 26px, weight 800).
ZONE 2 — SUBTITLE (5%): "함께 성장할 인재를 찾습니다" in charcoal accent text.
ZONE 3 — REQUIREMENTS CARD (40%): White rounded card with soft shadow. 4 rows with subtle charcoal circle icons and requirement text. Refined, elegant spacing.
ZONE 4 — CTA (12%): Full-width rounded button with charcoal gradient, white bold text "지원하기".
BOTTOM: Hospital name in charcoal text.
Premium, sophisticated, executive-level. Gold-inspired refinement. High-end dental clinic branding.`,
    },
  ],

  // ─── 주의사항 (6개) ───
  caution: [
    {
      id: 'cau_medical_checklist', name: '의료 체크리스트', color: '#3b82f6', accent: '#2563eb', bg: '#eff6ff',
      desc: '체크리스트형 안내',
      layoutHint: 'checklist',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white with very subtle blue tint.
ZONE 1 — HEADER (top 8%): Hospital name in blue (#2563eb) text. Below: bold "시술 후 주의사항" in blue (#3b82f6, 22px, weight 800).
ZONE 2 — CHECKLIST (65%): 4 individual white rounded cards stacked vertically with 8px gaps. Each card (border-radius 10px, soft shadow): LEFT: numbered square badge (border-radius 6px, blue at 8% opacity), bold number "1/2/3/4" in blue inside. RIGHT: instruction text in gray (#475569). Items: "혀로 건드리지 마세요", "음주/흡연 금지", "부기 2~3일 내 소실", "딱딱한 음식 금지". Clean, organized checklist format.
BOTTOM: Hospital name in light gray.
Professional medical checklist. Clear numbered instructions. Blue and white clinical aesthetic.`,
    },
    {
      id: 'cau_warning_bold', name: '경고 강조형', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '주의 경고 강조',
      layoutHint: 'warning',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Clean white.
ZONE 1 — WARNING BANNER (top 15%): Rounded rectangle with red at 8% opacity. Warning triangle icon (▲) in red at 30% left side. Bold "시술 후 주의사항" in red (#ef4444, 22px, weight 800).
ZONE 2 — CAUTION LIST (60%): 4 rows of instructions. Each row: horizontal bar with alternating subtle red background (4% opacity). Left: red circle with "!" inside. Right: caution text in dark gray. Items: "혀로 건드리지 마세요", "음주/흡연 금지", "부기 2~3일 내 소실", "딱딱한 음식 금지". Bold, clear, urgent formatting.
BOTTOM: Hospital name in light gray.
Bold warning style. Red and white. Urgent medical safety emphasis. Clear DO/DON'T instructions.`,
    },
    {
      id: 'cau_friendly_guide', name: '친절한 가이드', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '부드러운 안내 가이드',
      layoutHint: 'guide',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft mint (#ecfdf5) to white gradient.
ZONE 1 — HEADER (top 10%): Hospital name in green accent. Below: bold "시술 후 주의사항" in green (#10b981, 22px, weight 800).
ZONE 2 — GUIDE CARD (60%): Large white rounded card (border-radius 16px, 70% opacity, soft shadow). Inside: 4 step-by-step items connected by a thin vertical green line on the left. Each step: outer circle (green at 6%), inner circle (green at 10%), numbered "1/2/3/4" in bold green. Right: instruction text in gray (#475569). Connecting line between circles (green at 10% opacity). Items: "혀로 건드리지 마세요", "음주/흡연 금지", "부기 2~3일 내 소실", "딱딱한 음식 금지".
BOTTOM: Hospital name in green text.
Friendly, caring, encouraging. Step-by-step guide format. Warm and approachable green palette.`,
    },
    {
      id: 'cau_timeline_recovery', name: '회복 타임라인', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '회복 단계별 안내',
      layoutHint: 'timeline',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft lavender (#f5f3ff) to white gradient.
ZONE 1 — HEADER (top 12%): Purple pill badge with "시술 후 안내" at 5% opacity. Below: bold "회복 가이드" in purple (#8b5cf6, 22px, weight 800).
ZONE 2 — TIMELINE (65%): Vertical timeline with purple line (8% opacity) on the left. 4 milestone nodes connected by the line:
- Each node: outer circle (white, purple stroke at 30%), inner filled circle (purple at 50%). RIGHT: bold time label in purple ("당일", "1주일", "2주일", "1개월"). Below: instruction in gray ("혀로 건드리지 마세요", "딱딱한 음식 금지", "정상 식사 가능", "정기검진 내원").
Chronological recovery stages. Clear progression from Day 1 to Month 1.
BOTTOM: Hospital name in purple text.
Medical recovery infographic. Purple palette. Milestone-based healing progress.`,
    },
    {
      id: 'cau_infographic', name: '인포그래픽', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '시각적 인포그래픽',
      layoutHint: 'infographic',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Warm cream (#fffbeb) to white gradient.
ZONE 1 — HEADER (top 8%): Hospital name in amber accent. Below: bold "시술 후 주의사항" in amber (#f59e0b, 22px, weight 800).
ZONE 2 — ICON GRID (65%): 2x2 grid of white cards (border-radius 10px, soft shadow). Each card: TOP: colored circle icon — red (#fef2f2) with "X" for don'ts, green (#ecfdf5) with "O" for dos. BOTTOM: short instruction text. Grid items: "혀 금지" (X), "음주 금지" (X), "냉찜질" (O), "부드러운 음식" (O). Visual-heavy, icon-dominant. Minimal text, maximum visual communication.
BOTTOM: Hospital name in amber text.
Visual infographic style. Icon-heavy. Easy-to-understand at a glance. Pictogram-based instructions.`,
    },
    {
      id: 'cau_clean_card', name: '클린 카드', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '깔끔한 카드형',
      layoutHint: 'card',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Light sky blue (#f0f9ff) to white gradient.
ZONE 1 — HEADER (top 8%): Hospital name in sky blue accent. Below: bold "시술 후 주의사항" in sky blue (#0ea5e9, 22px, weight 800).
ZONE 2 — CARD GRID (65%): 2x2 grid of individual white cards (border-radius 12px, 95% opacity, soft shadow). Each card: colored circle icon at top — red for warnings (#fef2f2 bg, "X" in red), green for recommendations (#ecfdf5 bg, "O" in green). Below: short instruction text in gray (#475569). Cards: "혀로 건드리지 마세요" (X), "음주/흡연 금지" (X), "딱딱한 음식 금지" (X), "냉찜질 권장" (O). Modern UI card layout.
BOTTOM: Hospital name in sky blue text.
Clean, modern, card-based. Individual items as separate cards. Contemporary healthcare design.`,
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

interface AiTemplateRequest {
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution';
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
};

// =============================================
// DESIGNER PERSONA - 10-year veteran graphic designer identity
// Injected into ALL image generation prompts for consistent quality
// =============================================
export const DESIGNER_PERSONA = `[DESIGNER IDENTITY]
You are a veteran graphic designer with 10+ years of experience designing for hospitals, clinics, corporations, and public institutions.
You specialize in notice images, card news, recruitment posts, and announcement banners.
Your work is recognized for its taste, clarity, and organization.

[DESIGN CHARACTERISTICS]
- Fresh and creative, but NEVER messy or cluttered
- Excellent readability above all else
- Clear information delivery with strong visual hierarchy
- Title > Key Info > Supporting Info - always in this reading order
- Generous whitespace for clean, organized layouts
- Elegant but never exaggerated
- Trustworthy medical/healthcare-appropriate aesthetic
- Mobile-friendly legible notice images
- Series-capable: multiple images look unified as one brand system

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

function buildTemplateAiPrompt(req: AiTemplateRequest): string {
  const { category, stylePrompt, textContent, hospitalName, extraPrompt, imageSize, calendarTheme } = req;

  const categoryLabels: Record<string, string> = {
    schedule: 'hospital monthly schedule / clinic calendar announcement - clean, modern, trustworthy medical design',
    event: 'hospital promotion / medical event announcement - eye-catching yet professional, clear price hierarchy',
    doctor: 'doctor introduction / new physician announcement - professional, trustworthy portrait-style medical profile',
    notice: 'hospital notice / important announcement - clean, authoritative, easy to read at a glance',
    greeting: 'holiday greeting / seasonal message from hospital - warm, heartfelt, culturally appropriate Korean design',
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
[DESIGN STYLE]
${stylePrompt}

DESIGN QUALITY REQUIREMENTS:
- Modern, clean aesthetic inspired by premium Korean hospital/clinic SNS posts
- Visual hierarchy: clear distinction between heading, body, and footer
- Generous whitespace and breathing room between elements
- Rounded corners (8-16px) on cards and containers
- Soft shadows for depth, not harsh borders
- Color consistency: use 2-3 colors max from the style palette
- Typography: bold headings (700-900 weight), regular body (400-500)
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

export async function generateTemplateWithAI(
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution',
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
  }
): Promise<string> {
  const ai = getAiClient();

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

      const result = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents,
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
          imageSize: '4K',
        },
      });

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
