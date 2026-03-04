/**
 * 병원 달력 이미지 생성 서비스
 * HTML/CSS 템플릿 + html2canvas로 100% 정확한 달력 이미지를 프로그래밍으로 생성
 */
import { getAiClient } from './geminiClient';

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
  colorTheme?: 'blue' | 'green' | 'pink' | 'purple';
  logoBase64?: string;      // data:image/...;base64,xxx 형식의 로고 이미지
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
      model: 'gemini-2.0-flash',
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

const THEMES = {
  blue:   { primary: '#2563eb', light: '#eff6ff', accent: '#1d4ed8', headerBg: '#2563eb' },
  green:  { primary: '#16a34a', light: '#f0fdf4', accent: '#15803d', headerBg: '#16a34a' },
  pink:   { primary: '#db2777', light: '#fdf2f8', accent: '#be185d', headerBg: '#db2777' },
  purple: { primary: '#7c3aed', light: '#f5f3ff', accent: '#6d28d9', headerBg: '#7c3aed' },
};

// ── HTML 달력 생성 ──

export function buildCalendarHTML(data: CalendarData): string {
  const { month, year, title, closedDays, shortenedDays, vacationDays, hospitalName, notices, colorTheme, logoBase64 } = data;
  const theme = THEMES[colorTheme || 'blue'];

  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const holidays = getHolidays(year, month);
  const closedSet = new Map<number, string>();
  for (const cd of closedDays) {
    closedSet.set(cd.day, cd.reason || '휴진');
  }
  const shortenedSet = new Map<number, string>();
  for (const sd of (shortenedDays || [])) {
    shortenedSet.set(sd.day, sd.hours || '단축');
  }
  const vacationSet = new Map<number, string>();
  for (const vd of (vacationDays || [])) {
    vacationSet.set(vd.day, vd.reason || '휴가');
  }

  // 주 단위로 날짜 배열 생성
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const cellsHTML = weeks.map(w => {
    const cells = w.map((d, col) => {
      if (d === null) return `<td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;"></td>`;

      const isSunday = col === 0;
      const isSaturday = col === 6;
      const isHoliday = holidays.has(d);
      const isClosed = closedSet.has(d);
      const isShortened = shortenedSet.has(d);
      const isVacation = vacationSet.has(d);
      const holidayName = holidays.get(d);

      let color = '#333333';
      if (isClosed || isVacation) color = '#ef4444';
      else if (isShortened) color = '#d97706';
      else if (isSunday || isHoliday) color = '#ef4444';
      else if (isSaturday) color = '#3b82f6';

      let bgColor = 'transparent';
      let badge = '';

      if (isClosed) {
        bgColor = '#fef2f2';
        badge = `<div style="margin-top:2px;font-size:11px;color:#ef4444;font-weight:700;">휴진</div>`;
      } else if (isVacation) {
        bgColor = '#f5f3ff';
        badge = `<div style="margin-top:2px;font-size:11px;color:#7c3aed;font-weight:700;">휴가</div>`;
        color = '#7c3aed';
      } else if (isShortened) {
        bgColor = '#fffbeb';
        badge = `<div style="margin-top:2px;font-size:10px;color:#d97706;font-weight:700;">단축</div>`;
      }
      if (isHoliday) {
        badge = `<div style="margin-top:2px;font-size:11px;color:#ef4444;font-weight:600;">${holidayName}</div>${isClosed ? '<div style="font-size:11px;color:#ef4444;font-weight:700;">휴진</div>' : ''}`;
      }

      return `<td style="padding:10px 8px;text-align:center;vertical-align:top;border-bottom:1px solid #f0f0f0;background:${bgColor};min-height:60px;">
        <div style="font-size:18px;font-weight:600;color:${color};">${d}</div>
        ${badge}
      </td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const dayHeadersHTML = dayNames.map((name, i) => {
    let color = '#666666';
    if (i === 0) color = '#ef4444';
    if (i === 6) color = '#3b82f6';
    return `<th style="padding:12px 8px;font-size:14px;font-weight:700;color:${color};text-align:center;border-bottom:2px solid ${theme.primary};">${name}</th>`;
  }).join('');

  const logoHTML = logoBase64
    ? `<img src="${logoBase64}" style="max-height:48px;margin-bottom:6px;object-fit:contain;" />`
    : '';

  const hospitalLine = hospitalName
    ? `<div style="font-size:14px;color:rgba(255,255,255,0.9);margin-top:4px;font-weight:400;">${hospitalName}</div>`
    : '';

  const noticesHTML = (notices && notices.length > 0)
    ? `<div style="margin-top:20px;padding:16px 20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
        ${notices.map(n => `<div style="font-size:13px;color:#475569;line-height:1.8;">• ${n}</div>`).join('')}
      </div>`
    : '';

  // 범례 (휴진 + 단축 + 휴가)
  const legendItems: string[] = [];
  closedDays.forEach(cd => {
    legendItems.push(`<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fef2f2;border-radius:20px;font-size:12px;color:#ef4444;font-weight:600;">
      <span style="width:6px;height:6px;background:#ef4444;border-radius:50%;display:inline-block;"></span>
      ${cd.day}일 ${cd.reason || '휴진'}
    </span>`);
  });
  (shortenedDays || []).forEach(sd => {
    legendItems.push(`<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fffbeb;border-radius:20px;font-size:12px;color:#d97706;font-weight:600;">
      <span style="width:6px;height:6px;background:#d97706;border-radius:50%;display:inline-block;"></span>
      ${sd.day}일 단축${sd.hours ? ` (${sd.hours})` : ''}
    </span>`);
  });
  (vacationDays || []).forEach(vd => {
    legendItems.push(`<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#f5f3ff;border-radius:20px;font-size:12px;color:#7c3aed;font-weight:600;">
      <span style="width:6px;height:6px;background:#7c3aed;border-radius:50%;display:inline-block;"></span>
      ${vd.day}일 ${vd.reason || '휴가'}
    </span>`);
  });
  const closedLegend = legendItems.length > 0
    ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">${legendItems.join('')}</div>`
    : '';

  return `<div id="calendar-render-target" style="width:700px;background:#ffffff;border-radius:20px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- 헤더 -->
    <div style="background:linear-gradient(135deg, ${theme.primary}, ${theme.accent});padding:${logoBase64 ? '20px' : '28px'} 32px;text-align:center;">
      ${logoHTML}
      <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${title}</div>
      ${hospitalLine}
    </div>

    <!-- 달력 그리드 -->
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr>${dayHeadersHTML}</tr></thead>
        <tbody>${cellsHTML}</tbody>
      </table>

      ${closedLegend}
      ${noticesHTML}
    </div>
  </div>`;
}

// ── HTML → 이미지 변환 ──

export async function renderCalendarToImage(html: string): Promise<string> {
  // 숨겨진 컨테이너에 HTML 삽입
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

  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(target, {
      scale: 6, // 700px * 6 = 4200px (4K급 해상도)
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } finally {
    document.body.removeChild(container);
  }
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
  const imageDataUrl = await renderCalendarToImage(html);

  return { imageDataUrl, mimeType: 'image/png' };
}
