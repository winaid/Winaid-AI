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

// ── HTML 달력 생성 ──

export function buildCalendarHTML(data: CalendarData): string {
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

const HOLIDAY_EMOJI: Record<string, string> = {
  '설날': '&#127982;', '추석': '&#127765;', '새해': '&#127882;',
  '어버이날': '&#127801;', '크리스마스': '&#127876;',
};

export function buildGreetingHTML(data: GreetingTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const emoji = HOLIDAY_EMOJI[data.holiday] || '&#127881;';
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;opacity:0.8;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 24px;background:rgba(255,255,255,0.7);border-radius:16px;backdrop-filter:blur(4px);text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const closureHTML = data.closurePeriod?.trim()
    ? `<div style="margin:28px auto;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:14px 28px;background:rgba(255,255,255,0.85);border-radius:16px;border:1px solid ${theme.border};box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1px;">CLOSED</div>
            <div style="font-size:15px;color:#334155;font-weight:700;margin-top:2px;">${esc(data.closurePeriod)}</div>
          </div>
        </div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:linear-gradient(180deg, ${theme.light} 0%, #ffffff 40%, ${theme.light} 100%);border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);position:relative;">
    <!-- 장식 원형 -->
    <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:${theme.primary}08;border-radius:50%;"></div>
    <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:${theme.primary}06;border-radius:50%;"></div>

    <div style="padding:56px 40px 48px;text-align:center;position:relative;">
      ${logoHTML ? `<div style="margin-bottom:20px;">${logoHTML}</div>` : ''}

      <div style="font-size:72px;margin-bottom:20px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.1));">${emoji}</div>

      <div style="display:inline-block;padding:6px 24px;background:${theme.primary}15;border-radius:24px;margin-bottom:20px;">
        <span style="font-size:14px;color:${theme.primary};font-weight:700;letter-spacing:2px;">${esc(data.holiday || '명절')}</span>
      </div>

      <div style="font-size:30px;font-weight:900;color:#1e293b;line-height:1.6;white-space:pre-line;letter-spacing:-0.5px;">${esc(data.greeting || '행복한 명절 되세요')}</div>

      ${closureHTML}${customMsgHTML}

      ${data.hospitalName ? `<div style="margin-top:36px;padding-top:20px;border-top:2px solid ${theme.subtle};">
        <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:3px;">${esc(data.hospitalName)}</div>
      </div>` : ''}
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
    id: 'clean_modern', name: '클린 모던', color: '#2563eb', accent: '#1d4ed8', bg: '#eff6ff',
    desc: '깔끔한 · 전문적',
    mood: '미니멀하고 전문적인 병원 느낌',
    aiPrompt: 'Clean minimal modern design, white background with subtle blue accents, professional hospital aesthetic, flat design with soft shadows, geometric shapes, sans-serif typography, calm and trustworthy mood',
  },
  {
    id: 'warm_friendly', name: '따뜻한 감성', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
    desc: '따뜻한 · 친근한',
    mood: '따뜻하고 친근한 동네병원 느낌',
    aiPrompt: 'Warm friendly design with soft rounded shapes, pastel yellow and cream tones, hand-drawn feel, cozy atmosphere, watercolor texture accents, gentle and approachable mood, soft gradient background',
  },
  {
    id: 'premium_elegant', name: '프리미엄', color: '#1e3a5f', accent: '#0f2942', bg: '#f0f4f8',
    desc: '고급 · 세련된',
    mood: '고급스럽고 세련된 프리미엄 클리닉 느낌',
    aiPrompt: 'Premium elegant design, deep navy and gold accents, marble texture hints, sophisticated serif typography, luxury clinic aesthetic, subtle gradient, refined and exclusive mood, thin gold line decorations',
  },
  {
    id: 'soft_nature', name: '내추럴 힐링', color: '#16a34a', accent: '#15803d', bg: '#f0fdf4',
    desc: '자연 · 치유',
    mood: '자연스럽고 치유적인 힐링 느낌',
    aiPrompt: 'Natural healing design, soft green and earth tones, botanical leaf illustrations, organic shapes, light linen texture background, fresh and soothing mood, eco-friendly aesthetic, subtle plant decorations',
  },
  {
    id: 'cute_pop', name: '귀여운 팝', color: '#ec4899', accent: '#db2777', bg: '#fdf2f8',
    desc: '귀여운 · 발랄한',
    mood: '귀엽고 발랄한 소아과/피부과 느낌',
    aiPrompt: 'Cute pop design, bright pink and lavender colors, rounded bubbly shapes, playful illustrations, confetti decorations, fun and cheerful mood, kawaii aesthetic, bold colorful accents, soft pastel gradients',
  },
  {
    id: 'classic_trust', name: '클래식 신뢰', color: '#7c3aed', accent: '#6d28d9', bg: '#f5f3ff',
    desc: '전통적 · 신뢰감',
    mood: '클래식하고 신뢰감 있는 종합병원 느낌',
    aiPrompt: 'Classic trustworthy design, deep purple and white, clean structured layout, traditional hospital aesthetic, balanced symmetrical composition, professional medical icons, authoritative and reliable mood',
  },
  {
    id: 'fresh_energy', name: '프레시 에너지', color: '#0d9488', accent: '#0f766e', bg: '#f0fdfa',
    desc: '활기 · 청결한',
    mood: '활기차고 청결한 건강 느낌',
    aiPrompt: 'Fresh energetic design, teal and white gradient, dynamic angular shapes, clean modern aesthetic, bright and vibrant mood, health and wellness vibe, crisp edges, refreshing color palette',
  },
  {
    id: 'minimal_mono', name: '미니멀 모노', color: '#374151', accent: '#1f2937', bg: '#f9fafb',
    desc: '미니멀 · 모던',
    mood: '극도로 미니멀한 흑백 모던 느낌',
    aiPrompt: 'Ultra minimal monochrome design, black and white with subtle gray tones, lots of white space, thin line icons, modern sans-serif typography, sophisticated and understated mood, editorial magazine style',
  },
];

// ── AI 이미지 생성: 템플릿 데이터 → Nano Banana Pro ──

// 스타일 히스토리 (localStorage에 저장)
export interface SavedStyleHistory {
  id: string;
  name: string;
  stylePrompt: string; // 재사용 가능한 스타일 프롬프트
  thumbnailDataUrl: string; // 결과 이미지 축소 썸네일
  presetId?: string; // 기반 프리셋 ID (있으면)
  createdAt: number;
}

const STYLE_HISTORY_KEY = 'template_style_history';
const MAX_STYLE_HISTORY = 20;

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

// 이미지를 작은 썸네일로 리사이즈 (localStorage 용량 절약)
export function resizeImageToThumbnail(dataUrl: string, maxSize: number = 120): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(dataUrl); // 실패시 원본
    img.src = dataUrl;
  });
}

interface AiTemplateRequest {
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting';
  stylePrompt: string;
  textContent: string;
  hospitalName?: string;
  logoBase64?: string | null;
  brandingPosition?: 'top' | 'bottom';
  extraPrompt?: string;
  imageSize?: { width: number; height: number };
}

function buildTemplateAiPrompt(req: AiTemplateRequest): string {
  const { category, stylePrompt, textContent, hospitalName, extraPrompt, imageSize } = req;

  const categoryLabels: Record<string, string> = {
    schedule: 'hospital monthly schedule / clinic calendar announcement',
    event: 'hospital promotion / medical event announcement',
    doctor: 'doctor introduction / new physician announcement',
    notice: 'hospital notice / important announcement',
    greeting: 'holiday greeting / seasonal message from hospital',
  };

  const aspectDesc = imageSize && imageSize.width > 0 && imageSize.height > 0
    ? (imageSize.width > imageSize.height ? 'landscape (wide)' : imageSize.width < imageSize.height ? 'portrait (tall)' : 'square 1:1')
    : 'square 1:1';

  // 스타일 프롬프트와 텍스트 프롬프트를 명확히 분리
  return `🚨 RENDER ALL KOREAN TEXT EXACTLY AS PROVIDED - DO NOT TRANSLATE OR CHANGE! 🚨

[IMAGE TYPE]
${categoryLabels[category] || 'hospital announcement'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
[DESIGN STYLE PROMPT - VISUAL LOOK & FEEL]
${stylePrompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━
[TEXT CONTENT PROMPT - EXACT TEXT TO RENDER]
${textContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${hospitalName ? (() => {
  const pos = req.brandingPosition || 'top';
  const posLabel = pos === 'top' ? 'HEADER (top of image)' : 'FOOTER (bottom of image)';
  const posDetail = pos === 'top'
    ? 'Place branding at the TOP of the image, above all content. It should be the first visual element.'
    : 'Place branding at the BOTTOM of the image, below all content. It should be the last visual element.';
  const logoInstructions = req.logoBase64
    ? `- Show hospital LOGO (small, 24-32px) and hospital NAME side by side horizontally: [LOGO] [NAME]
- They must be visually grouped as ONE unit with consistent alignment
- Logo on the left, name on the right, vertically centered to each other`
    : `- Display hospital name "${hospitalName}" in a clean, readable font`;
  return `
[HOSPITAL BRANDING - POSITION: ${posLabel}]
Hospital name: "${hospitalName}"
${posDetail}
${logoInstructions}
- Use subtle styling that matches the overall design (not too large, not too small)
- Branding should feel integrated into the design, not floating or disconnected
- Recommended: 12-16px font size for name, clean sans-serif font`;
})() : ''}

[IMAGE SPECIFICATIONS]
- Aspect ratio: ${aspectDesc}
- Resolution: high quality, crisp text
- Professional hospital/clinic announcement image
- All text must be in Korean, rendered clearly and legibly
- Clean layout with proper visual hierarchy

[DESIGN RULES]
✅ Korean text must be pixel-perfect and readable
✅ Professional medical/hospital aesthetic
✅ Calendar dates and numbers must be ACCURATE
✅ Clean visual hierarchy: title → content → footer
✅ Use the design style keywords above for mood and atmosphere
${extraPrompt ? `\n[ADDITIONAL USER REQUEST]\n${extraPrompt}` : ''}

⛔ FORBIDDEN:
- Do NOT render instruction labels like "날짜:", "제목:", "TITLE:", "SUBTITLE:", "[MAIN TITLE]", etc.
- Only render the actual content text inside the quotes ("...")
- Do NOT change or translate any Korean text
- No watermarks, no logos (unless hospital logo provided)
- No English text (except decorative labels like "SCHEDULE", "INFORMATION")
- No generic stock photo feel - must look like designed template
- No blurry or hard-to-read text
- No raw data labels or metadata in the image`.trim();
}

function buildScheduleTextContent(data: {
  month: number; year: number; title: string;
  closedDays?: { day: number }[];
  shortenedDays?: { day: number; hours?: string }[];
  vacationDays?: { day: number; reason?: string }[];
  notices?: string[];
}): string {
  const { month, year, title, closedDays, shortenedDays, vacationDays, notices } = data;

  // 해당 월의 달력 그리드 텍스트 생성
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  let calGrid = `${year}년 ${month}월 달력:\n일 월 화 수 목 금 토\n`;
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

  let content = `"${title}"\n${year}년 ${month}월\n\n${calGrid}`;

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
  doctorName: string; specialty: string; career: string[]; greeting?: string;
}): string {
  let content = `[NAME - largest, bold] "${data.doctorName}"`;
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
  // 명절별 테마 장식 힌트
  const holidayDecorations: Record<string, string> = {
    '설날': 'Traditional Korean New Year theme: lucky bags (복주머니), Korean patterns, red/gold accents, plum blossoms',
    '추석': 'Korean Chuseok/Harvest Moon theme: full moon, songpyeon rice cakes, autumn leaves, warm golden tones',
    '새해': 'New Year celebration theme: fireworks, confetti, champagne vibes, midnight blue and gold',
    '어버이날': 'Korean Parents Day theme: carnation flowers, warm pink/red tones, heartfelt and tender mood',
    '크리스마스': 'Christmas theme: snowflakes, Christmas tree, red/green/gold, festive and warm, winter wonderland',
  };
  const deco = holidayDecorations[data.holiday] || 'Festive holiday theme with appropriate seasonal decorations';

  let content = `[HOLIDAY VISUAL THEME - decorate the image with these elements]\n${deco}`;
  content += `\n\n[GREETING MESSAGE - largest, bold, center, beautiful typography]\n"${data.greeting}"`;
  if (data.closurePeriod) content += `\n\n[CLOSURE INFO - small, subtle, bottom area] "휴진 안내: ${data.closurePeriod}"`;
  return content;
}

export async function generateTemplateWithAI(
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting',
  templateData: Record<string, any>,
  stylePrompt: string,
  options?: {
    hospitalName?: string;
    logoBase64?: string | null;
    brandingPosition?: 'top' | 'bottom';
    extraPrompt?: string;
    imageSize?: { width: number; height: number };
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
      textContent = buildDoctorTextContent(templateData as any);
      break;
    case 'notice':
      textContent = buildNoticeTextContent(templateData as any);
      break;
    case 'greeting':
      textContent = buildGreetingTextContent(templateData as any);
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
  });

  // 로고 이미지 파트 준비
  const logoPart = options?.logoBase64?.startsWith('data:')
    ? (() => {
        const [meta, base64] = options.logoBase64!.split(',');
        const mimeType = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';
        return { inlineData: { data: base64, mimeType } };
      })()
    : null;

  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🎨 템플릿 AI 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (${category})...`);

      const contents: any[] = logoPart
        ? [logoPart, { text: `[Hospital Logo Image - place this logo NEXT TO the hospital name in the header, side by side as one unit]\n\n${prompt}` }]
        : [{ text: prompt }];

      const result = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents,
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.5,
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
      console.error(`❌ 템플릿 AI 이미지 생성 에러 (시도 ${attempt}):`, error?.message || error);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  // AI 생성 실패 시 기존 HTML 방식으로 폴백
  console.warn('⚠️ AI 이미지 생성 실패, HTML 렌더링으로 폴백:', lastError?.message);
  throw new Error(`AI 이미지 생성 실패: ${lastError?.message || '알 수 없는 오류'}. 다시 시도해주세요.`);
}
