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
      id: 'sfc_pastel_bubble', name: '파스텔 버블', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '파스텔 핑크 달력',
      layoutHint: 'cal_bubble',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
STRUCTURE: 3 vertical zones stacked. Soft pastel pink (#fdf2f8) background.
ZONE 1 — HEADER + DECORATIONS (top 22%): Left and right top corners: balloon shapes (oval + thin string line) in pink/purple at ~15% opacity. Tiny star symbols (✦ ✧) scattered sparsely. Hospital name in small accent text (#be185d) centered. Below: large bold "N월 진료안내" in vivid pink (#ec4899).
ZONE 2 — FULL CALENDAR GRID (middle 58%): One large white rounded card (border-radius 20px, soft shadow) centered. Inside: 7 day-name headers (일월화수목금토, Sun=red, Sat=blue, others=gray). Below: 5 rows × 7 columns of date numbers showing ALL dates of the month. CLOSED DAYS: soft pink circle behind number (#ec4899 at 15%), number in bold pink. SHORTENED DAYS: soft amber circle behind number, number in bold amber. Sunday numbers in light red, others in gray (#64748b). Full month dates 1-31 clearly visible.
ZONE 3 — LEGEND (bottom 10%): Small colored dots with labels: pink dot + "휴진", amber dot + "단축". Tiny star decorations (★) at bottom corners.
Pastel pink, playful yet professional. FULL monthly calendar grid is the main content.`,
    },
    {
      id: 'sfc_mint_fresh', name: '민트 프레시', color: '#14b8a6', accent: '#0f766e', bg: '#f0fdfa',
      desc: '상쾌한 민트 달력',
      layoutHint: 'cal_nature',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
STRUCTURE: Header + 5 horizontal card rows stacked vertically. Light mint (#f0fdfa) background.
DECORATIONS: Top-left and top-right corners: small leaf/ellipse shapes in teal at ~10% opacity, rotated slightly. Tiny pink and purple dots near leaves. Very subtle botanical accents.
HEADER (top 15%): Hospital name centered in small accent text (#0f766e). Below: "N월 진료안내" in bold teal (#14b8a6), medium-large size.
BODY — 5 WEEK CARDS (75% of image): Five horizontal white rounded rectangle cards (border-radius 12px, subtle shadow) stacked vertically with ~8px gap between each. Each card structure:
- LEFT SECTION (15% of card width): Light teal (#14b8a6 at 6%) background square area with "N주" label in small bold teal text, centered.
- RIGHT SECTION (85% of card width): 7 date numbers evenly spaced in a horizontal row. Closed dates have a teal circle highlight (15% opacity) behind their number, number in bold teal. Shortened dates in bold amber. Sunday numbers in light red (#fca5a5), other numbers in gray (#64748b).
Cards for week 1 show dates 1-7, week 2 shows 8-14, etc. Last card may have fewer dates.
BOTTOM: Small leaf decorations at bottom corners matching top, very subtle.
NO traditional 7×5 grid. This design groups dates BY WEEK in separate cards for easy scanning.`,
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
      id: 'sfc_glassmorphism', name: '글래스모피즘', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '유리 효과 달력',
      layoutHint: 'cal_glass',
      aiPrompt: `EXACT LAYOUT BLUEPRINT — replicate this structure precisely:
BACKGROUND: Soft gradient with 4 large colorful blurred blob circles creating depth:
- Top-left: large indigo (#6366f1) circle at 12% opacity
- Bottom-right: large accent (#4f46e5) circle at 10% opacity
- Top-right: medium purple (#818cf8) circle at 8% opacity
- Bottom-left: medium pink (#f472b6) circle at 6% opacity
HEADER (top 18%): Hospital name in small indigo accent (#4f46e5) centered. Below: large bold "N월 진료안내" in indigo (#6366f1).
FULL CALENDAR GRID (middle 60%): One large frosted glass card (translucent white at 30%, white border at 50%, border-radius 24px, soft shadow/blur). Inside: 7 day-name headers (일월화수목금토, Sun=red, Sat=blue, others=gray). Below: 5 rows × 7 columns of date numbers showing ALL dates of the month. CLOSED DAYS: soft indigo circle behind number (#6366f1 at 15%), number in bold indigo. SHORTENED DAYS: soft amber circle behind number, number in bold amber (#d97706). Sunday numbers in light red, others in gray (#64748b).
BOTTOM (12%): Two small frosted glass rectangular cards side by side (rounded corners 16px, white at 30%, white border):
- Left card: colored dots + "휴진" + "단축" legend
- Right card: "09:30~18:00" operating hours in indigo
Modern glassmorphism UI with FULL calendar grid on frosted glass card. Translucent layers on vibrant blurred background.`,
    },
  ],

  // ─── 진료 일정: 한 주 레이아웃 (6개) ───
  schedule_week: [
    {
      id: 'swk_horizontal_bar', name: '수평 바', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '가로 주간 스트립',
      layoutHint: 'wk_bar',
      aiPrompt: 'SINGLE WEEK calendar view (NOT full month) for dental clinic - show ONLY one row of 7 days (일~토). Horizontal weekly strip design, 7-day bar layout with equal-width cells, closed days highlighted with bold red background pill shape, clean sky blue accents, modern minimal healthcare design, each day clearly labeled with date number below day name, compact and information-dense single-week layout',
    },
    {
      id: 'swk_card_stack', name: '카드 스택', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '요일별 카드 나열',
      layoutHint: 'wk_cards',
      aiPrompt: 'SINGLE WEEK calendar view (NOT full month) for dental clinic - show ONLY 7 days as individual cards. Each day as a separate rounded card with shadow arranged in one row, orange and warm tone accents, closed day cards flipped/rotated style with X mark, card game inspired layout, playful yet professional medical design, 3D card depth effect',
    },
    {
      id: 'swk_timeline_dot', name: '타임라인 점', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '점 연결 타임라인',
      layoutHint: 'wk_timeline',
      aiPrompt: 'SINGLE WEEK calendar view (NOT full month) for dental clinic - show ONLY 7 days as timeline dots. Horizontal line with 7 circle nodes for each day of the week, connected by elegant purple line, closed days as large solid red dots, normal days as outlined circles, hanging labels below with date info, modern infographic style, minimalist purple and white palette',
    },
    {
      id: 'swk_pill_shape', name: '필 모양', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '알약 모양 요일',
      layoutHint: 'wk_pill',
      aiPrompt: 'SINGLE WEEK calendar view (NOT full month) for dental clinic - show ONLY 7 days as pill shapes. Each day as a rounded pill/capsule shape in one row, closed days in red pills, normal days in green-white pills, medical pharmacy inspired design, cute medicine-themed icons, clean green and white healthcare palette',
    },
    {
      id: 'swk_ribbon_flag', name: '리본 플래그', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '깃발 리본 스타일',
      layoutHint: 'wk_flag',
      aiPrompt: 'SINGLE WEEK calendar view (NOT full month) for dental clinic - show ONLY 7 days as hanging flags. Each day displayed as a hanging banner/pennant flag in one row, closed days with red crossed-out flags, festive bunting decoration style, bold red accents on white, triangular pennant shapes connected by string, clear day labels on each flag',
    },
    {
      id: 'swk_neon_glow', name: '네온 글로우', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '네온 빛 효과',
      layoutHint: 'wk_neon',
      aiPrompt: 'SINGLE WEEK calendar view (NOT full month) for dental clinic on dark background - show ONLY 7 days as neon signs. Each day as a neon-lit sign box in one row, closed days with red neon X or OFF text, open days with cyan/teal neon glow, retro neon sign aesthetic, glowing tube-light borders, dark navy background, futuristic medical design',
    },
  ],

  // ─── 진료 일정: 강조형 레이아웃 (6개) ───
  schedule_highlight: [
    {
      id: 'shl_big_number', name: '빅 넘버', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '대형 날짜 숫자',
      layoutHint: 'hl_bignum',
      aiPrompt: 'Bold big-number clinic closure notice, huge oversized date numbers (72pt+) as the hero element in bold red, remaining text small and secondary, stark black/white/red contrast, modern typographic poster design, dramatic hierarchy between closure dates and supporting info, industrial bold font style',
    },
    {
      id: 'shl_stamp_seal', name: '도장 스탬프', color: '#b91c1c', accent: '#991b1b', bg: '#fef2f2',
      desc: '공식 도장 스타일',
      layoutHint: 'hl_stamp',
      aiPrompt: 'Official stamp/seal style clinic closure notice, closure dates displayed inside circular red rubber stamp marks, CLOSED text in bold stamp font, official document aesthetic with ruled lines, vintage government notice feel, red ink stamp texture, manila envelope background color, formal medical institution announcement',
    },
    {
      id: 'shl_calendar_rip', name: '캘린더 찢기', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '찢어진 달력 효과',
      layoutHint: 'hl_rip',
      aiPrompt: 'Torn calendar page effect for clinic closure notice, closure dates shown on dramatically torn/ripped calendar pages with ragged edges, torn paper texture revealing red background beneath, dynamic and eye-catching composition, amber and red color scheme, paper curl effects, dramatic shadow casting',
    },
    {
      id: 'shl_slash_through', name: '사선 취소', color: '#7c3aed', accent: '#6d28d9', bg: '#f5f3ff',
      desc: '사선으로 날짜 취소',
      layoutHint: 'hl_slash',
      aiPrompt: 'Diagonal slash-through closure date design for dental clinic, large date numbers with dramatic red diagonal lines crossing through them, grunge brush stroke cancel marks, bold and impactful visual communication, purple and red high contrast, street art meets medical notice aesthetic, spray paint texture accents',
    },
    {
      id: 'shl_circle_frame', name: '원형 프레임', color: '#0891b2', accent: '#0e7490', bg: '#ecfeff',
      desc: '원 안에 날짜 강조',
      layoutHint: 'hl_circle',
      aiPrompt: 'Circular frame emphasis closure notice for dental clinic, closure dates enclosed in large bold circle rings like target/bullseye, concentric circle decorations radiating outward, clean teal and white medical design, spotlight/focus effect on dates, infographic magnifying-glass style, important dates as focal points',
    },
    {
      id: 'shl_countdown', name: '카운트다운', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '디지털 카운트다운',
      layoutHint: 'hl_countdown',
      aiPrompt: 'Digital countdown timer style clinic closure notice, dates displayed in LED/digital clock font segments, flip-clock aesthetic with mechanical digit display, dark navy background with bright LED-style numbers, tech-forward medical notice design, each digit in its own flip panel, modern dashboard/scoreboard feel',
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
      aiPrompt: 'Eye-catching dental clinic sale banner design, bold red discount percentage badge, crossed-out original price with new price highlighted, urgent promotional feeling, modern retail-inspired medical event design, starburst or ribbon elements, clear price hierarchy, white and red color scheme',
    },
    {
      id: 'evt_elegant_event', name: '엘레강스 이벤트', color: '#a855f7', accent: '#7e22ce', bg: '#faf5ff',
      desc: '고급스러운 이벤트',
      layoutHint: 'elegant',
      aiPrompt: 'Elegant luxury dental clinic event promotion design, purple and gold color scheme, sophisticated serif typography mixed with modern sans-serif, refined medical aesthetic, subtle geometric patterns, premium treatment promotion feel, gentle gradient background, gold foil accent effects',
    },
    {
      id: 'evt_pop_colorful', name: '팝 컬러풀', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '활기찬 팝 스타일',
      layoutHint: 'pop',
      aiPrompt: 'Fun and colorful pop-style dental clinic event poster, vibrant yellow and orange with playful shapes, comic-book inspired burst elements, bold chunky typography, energetic and exciting mood, confetti and star decorations, attention-grabbing design with clear event details, friendly dental character illustration',
    },
    {
      id: 'evt_minimal_modern', name: '미니멀 모던', color: '#64748b', accent: '#334155', bg: '#f8fafc',
      desc: '심플 미니멀',
      layoutHint: 'minimal',
      aiPrompt: 'Minimalist modern dental clinic event design, clean white space with subtle gray accents, elegant thin typography, restrained color palette with single accent color, sophisticated simplicity, premium medical brand aesthetic, generous whitespace, architectural clean lines, understated luxury',
    },
    {
      id: 'evt_gradient_wave', name: '그라데이션 웨이브', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '물결 그라데이션',
      layoutHint: 'wave',
      aiPrompt: 'Modern gradient wave dental clinic event design, flowing cyan to blue gradient waves, dynamic curved shapes, contemporary medical aesthetic, smooth transitions and soft shadows, ocean-inspired calm yet exciting feeling, clear typography floating over gradient backgrounds, tech-forward healthcare design',
    },
    {
      id: 'evt_season_special', name: '시즌 스페셜', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '계절 한정 이벤트',
      layoutHint: 'season',
      aiPrompt: 'Seasonal special event dental clinic design, fresh green and natural tones, seasonal floral or nature elements as borders, limited-time offer badge, warm and inviting healthcare promotion, seasonal fruits or flowers as decorative accents, friendly and approachable medical event poster with clear period dates',
    },
  ],

  // ─── 의사 소개 (6개) ───
  doctor: [
    {
      id: 'doc_portrait_formal', name: '정장 포트레이트', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '공식 프로필형',
      layoutHint: 'portrait',
      aiPrompt: 'Formal professional doctor introduction card design, clean navy and white color scheme, large circular or rectangular photo placeholder, name and specialty in elegant serif font, career highlights in organized bullet list, medical credentials prominently displayed, professional headshot layout, hospital logo placement, trust-building authoritative design',
    },
    {
      id: 'doc_friendly_curve', name: '친근한 곡선', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '부드러운 곡선형',
      layoutHint: 'curve',
      aiPrompt: 'Friendly and approachable doctor profile design, soft green and cream tones, organic curved shapes and rounded elements, warm and welcoming healthcare aesthetic, doctor photo with soft circular frame, gentle botanical or leaf decorations, patient-friendly medical design, conversational greeting text area, comforting and reassuring mood',
    },
    {
      id: 'doc_modern_split', name: '모던 분할', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '좌우 분할 레이아웃',
      layoutHint: 'split',
      aiPrompt: 'Modern split-layout doctor introduction design, left side for large photo area with indigo overlay, right side for text information on white background, bold modern typography, clean geometric division, contemporary medical profile card, specialty and career details in organized sections, sleek professional aesthetic',
    },
    {
      id: 'doc_warm_story', name: '따뜻한 스토리', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '인사말 중심 스토리형',
      layoutHint: 'story',
      aiPrompt: 'Warm storytelling doctor introduction design, warm orange and cream palette, emphasis on doctor greeting message in large handwriting-style font, small photo with soft frame, personal and heartfelt narrative layout, cozy medical office atmosphere, stethoscope or heart icon accents, trust-building personal touch design',
    },
    {
      id: 'doc_dark_luxury', name: '다크 럭셔리', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '프리미엄 다크',
      layoutHint: 'luxury',
      aiPrompt: 'Premium dark luxury doctor introduction design, deep navy or black background with gold accents, sophisticated gold typography for name and title, elegant medical professional aesthetic, refined geometric borders, premium dental specialist branding, metallic shimmer effects, high-end medical practice feel, VIP doctor profile card',
    },
    {
      id: 'doc_clean_grid', name: '클린 그리드', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '정보 정리형 그리드',
      layoutHint: 'grid',
      aiPrompt: 'Clean grid-based doctor information card design, sky blue and white, organized grid sections for photo, name, specialty, education, and career, infographic-style medical credentials layout, clear data visualization aesthetic, professional healthcare dashboard feel, structured and easy-to-read medical staff profile',
    },
  ],

  // ─── 공지사항 (6개) ───
  notice: [
    {
      id: 'ntc_bulletin_board', name: '게시판 스타일', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '전통 게시판형',
      layoutHint: 'bulletin',
      aiPrompt: 'Traditional bulletin board style dental clinic notice design, warm amber and cream colors, pin or thumbtack decorative elements, paper texture background, classic announcement board aesthetic, clear notice title with date, organized content sections, cork board or wooden frame border, familiar and easy-to-read public notice format',
    },
    {
      id: 'ntc_modern_alert', name: '모던 알림', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '중요 알림 강조형',
      layoutHint: 'alert',
      aiPrompt: 'Modern urgent alert style clinic notice design, bold red accent with clean white background, exclamation mark or bell icon, important announcement hierarchy, sharp clean lines, contemporary notification card aesthetic, clear date and effective period display, medical institution official notice feel, attention-grabbing header',
    },
    {
      id: 'ntc_soft_info', name: '소프트 안내', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '부드러운 안내문',
      layoutHint: 'soft',
      aiPrompt: 'Soft and gentle dental clinic information notice design, lavender and light purple palette, rounded shapes and soft shadows, friendly informational tone, organized content with cute icon bullets, approachable medical notice aesthetic, gentle gradient background, warm and caring communication style',
    },
    {
      id: 'ntc_corporate_formal', name: '공식 문서형', color: '#1f2937', accent: '#111827', bg: '#f9fafb',
      desc: '격식있는 공문 스타일',
      layoutHint: 'formal',
      aiPrompt: 'Formal corporate dental clinic official notice design, black and white with minimal accent color, document-style layout with header letterhead, professional institutional communication format, clear section dividers, serif typography for titles, clean structured content area, official stamp or seal area, authoritative medical institution announcement',
    },
    {
      id: 'ntc_card_popup', name: '카드 팝업', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '팝업 카드 스타일',
      layoutHint: 'popup',
      aiPrompt: 'Pop-up card style clinic notice design, bright cyan and white, floating card with prominent shadow, modern UI card aesthetic, clear title bar with icon, organized body text, action-oriented design with date highlighted, contemporary digital notification inspired layout, rounded corners and modern spacing',
    },
    {
      id: 'ntc_timeline', name: '타임라인형', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '변경 일정 타임라인',
      layoutHint: 'timeline',
      aiPrompt: 'Timeline-style dental clinic notice design, green and white with clear chronological layout, vertical timeline with date nodes, before and after comparison for changes, organized step-by-step information flow, modern infographic-inspired medical notice, clear arrows or flow indicators, effective date prominently displayed',
    },
  ],

  // ─── 명절 인사: 설날 (6개) ───
  greeting_설날: [
    {
      id: 'grt_seol_traditional', name: '전통 한복', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '단청 문양 전통',
      layoutHint: 'traditional',
      aiPrompt: 'Traditional Korean Lunar New Year (Seollal) greeting card for dental clinic, elegant red and gold dancheong patterns, traditional Korean gate frame (대문), pine tree and plum blossom decorations, calligraphy-style 새해 복 text, Korean traditional cloud motifs, han-bok inspired color palette, lucky knot (매듭) ornaments, dignified and festive',
    },
    {
      id: 'grt_seol_tteokguk', name: '떡국 일러스트', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '따뜻한 설 음식',
      layoutHint: 'warm',
      aiPrompt: 'Warm Seollal greeting with cute tteokguk (rice cake soup) illustration for dental clinic, steaming bowl of tteokguk as center piece, chopsticks and spoon, warm orange and cream watercolor, cozy family meal atmosphere, hand-drawn food illustration style, soft bokeh lights, Korean New Year feast feeling, heartwarming',
    },
    {
      id: 'grt_seol_modern', name: '모던 세뱃돈', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 봉투 디자인',
      layoutHint: 'minimal',
      aiPrompt: 'Modern minimalist Seollal greeting with sebatdon (New Year money) envelope motif, clean indigo and gold design, single elegant Korean lucky bag illustration, contemporary typography with generous whitespace, geometric pattern frame inspired by Korean traditional patterns simplified, sophisticated medical brand holiday card',
    },
    {
      id: 'grt_seol_bokjumeoni', name: '복주머니', color: '#e11d48', accent: '#be123c', bg: '#fff1f2',
      desc: '복주머니 장식',
      layoutHint: 'cute',
      aiPrompt: 'Cute bokjumeoni (fortune pouch) themed Seollal greeting for dental clinic, adorable 3D-style fortune pouches with Korean patterns, gold coins floating around, kawaii tooth character wearing hanbok, cheerful pink and red palette, festive confetti, cute lucky symbols (four-leaf clover, horseshoe), playful Korean New Year celebration',
    },
    {
      id: 'grt_seol_gold_luxury', name: '금박 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '고급 금박 효과',
      layoutHint: 'luxury',
      aiPrompt: 'Premium gold foil Seollal greeting card for dental clinic, rich burgundy background with intricate gold foil Korean traditional patterns, 복 character in elegant gold calligraphy, pine branch gold embossing, luxury paper texture, sophisticated Oriental aesthetic, high-end medical practice Lunar New Year card, VIP premium feel',
    },
    {
      id: 'grt_seol_sunrise', name: '새해 일출', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '해돋이 풍경',
      layoutHint: 'nature',
      aiPrompt: 'Beautiful New Year sunrise landscape Seollal greeting for dental clinic, golden sunrise over Korean mountains and traditional village, warm amber and golden sky gradients, silhouette of hanok rooftops, peaceful morning atmosphere, watercolor landscape style, hopeful new beginning feeling, nature-inspired Korean New Year scene',
    },
  ],

  // ─── 명절 인사: 추석 (6개) ───
  greeting_추석: [
    {
      id: 'grt_chsk_fullmoon', name: '보름달 전통', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '보름달 한국풍',
      layoutHint: 'traditional',
      aiPrompt: 'Traditional Korean Chuseok greeting with large full moon as centerpiece, golden wheat and rice stalks framing the design, persimmon and chestnut decorations, traditional Korean pattern borders, warm amber and gold palette, harvest moon atmosphere, calligraphy-style greeting text, dignified autumn festival feeling',
    },
    {
      id: 'grt_chsk_songpyeon', name: '송편 일러스트', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '송편과 과일',
      layoutHint: 'warm',
      aiPrompt: 'Cute Chuseok greeting with songpyeon (rice cakes) illustration for dental clinic, colorful songpyeon arranged on pine needles plate, Korean pear and persimmon fruits around, soft green and earth tone watercolor, hand-drawn food illustration, warm family gathering atmosphere, harvest abundance feeling',
    },
    {
      id: 'grt_chsk_modern', name: '모던 한가위', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 추석',
      layoutHint: 'minimal',
      aiPrompt: 'Modern minimalist Chuseok greeting card for dental clinic, clean geometric representation of full moon circle, single elegant rabbit silhouette, contemporary indigo and silver color scheme, generous whitespace, subtle autumn leaf accent, sophisticated medical brand Chuseok card, understated Korean harvest festival design',
    },
    {
      id: 'grt_chsk_rabbit', name: '토끼 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '달토끼 귀여운',
      layoutHint: 'cute',
      aiPrompt: 'Adorable moon rabbit (달토끼) Chuseok greeting for dental clinic, kawaii rabbit character pounding rice cakes on the moon, cute tooth fairy in Korean hanbok costume, playful pink and purple moonlit scene, festive stars and sparkles, chibi character style, cheerful family-friendly Chuseok celebration, cartoon autumn leaves falling',
    },
    {
      id: 'grt_chsk_premium', name: '달빛 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '고급 달빛 골드',
      layoutHint: 'luxury',
      aiPrompt: 'Premium dark navy Chuseok greeting with golden full moon for dental clinic, deep midnight blue background with luminous gold moon, golden wheat stalks and persimmon ornaments, luxury gold foil text and borders, elegant moonlight glow effects, sophisticated Oriental harvest festival aesthetic, high-end medical practice card',
    },
    {
      id: 'grt_chsk_autumn', name: '가을 풍경', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '단풍 자연풍',
      layoutHint: 'nature',
      aiPrompt: 'Beautiful autumn landscape Chuseok greeting for dental clinic, colorful maple leaves in red orange gold, Korean countryside harvest scene with rice paddies, warm sunset atmosphere, watercolor painting style, full moon rising over autumn mountains, peaceful and abundant nature scene, nostalgic Korean autumn feeling',
    },
  ],

  // ─── 명절 인사: 새해 (6개) ───
  greeting_새해: [
    {
      id: 'grt_newy_fireworks', name: '불꽃놀이', color: '#7c3aed', accent: '#6d28d9', bg: '#f5f3ff',
      desc: '화려한 불꽃놀이',
      layoutHint: 'traditional',
      aiPrompt: 'Spectacular New Year fireworks greeting for dental clinic, colorful fireworks bursting against dark night sky, 2026 in large sparkler-written numbers, gold and purple and blue firework explosions, celebration confetti, midnight countdown atmosphere, glamorous and exciting New Year party feeling, city skyline silhouette',
    },
    {
      id: 'grt_newy_champagne', name: '샴페인 토스트', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '샴페인 파티',
      layoutHint: 'luxury',
      aiPrompt: 'Elegant champagne toast New Year greeting for dental clinic, clinking champagne glasses with golden bubbles, luxury gold and black color scheme, metallic gold confetti and streamers, premium celebration aesthetic, sparkle and shimmer effects, sophisticated New Year party card, high-end medical practice holiday greeting',
    },
    {
      id: 'grt_newy_minimal', name: '미니멀 2026', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '깔끔한 연도 강조',
      layoutHint: 'minimal',
      aiPrompt: 'Ultra-minimalist New Year 2026 greeting for dental clinic, bold oversized "2026" in clean navy typography, single thin golden line decoration, maximum whitespace, elegant sans-serif font, subtle shadow effect on numbers, contemporary graphic design aesthetic, less is more medical brand New Year card',
    },
    {
      id: 'grt_newy_confetti', name: '컨페티 파티', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '화려한 컨페티',
      layoutHint: 'cute',
      aiPrompt: 'Fun confetti party New Year greeting for dental clinic, explosion of colorful confetti and streamers, party hat and noisemaker illustrations, bright pink and multicolor palette, cute kawaii-style celebration characters, playful balloon decorations, joyful and energetic mood, family-friendly New Year party card',
    },
    {
      id: 'grt_newy_sunrise', name: '첫 일출', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '새해 첫 일출',
      layoutHint: 'nature',
      aiPrompt: 'Majestic New Year first sunrise greeting for dental clinic, breathtaking sunrise over ocean horizon, golden and orange sky with dramatic cloud formations, hopeful new beginning atmosphere, watercolor landscape painting style, 2026 subtly integrated into sky, serene and inspirational New Year morning scene',
    },
    {
      id: 'grt_newy_clock', name: '자정 시계', color: '#64748b', accent: '#475569', bg: '#f8fafc',
      desc: '카운트다운 시계',
      layoutHint: 'warm',
      aiPrompt: 'Midnight countdown clock New Year greeting for dental clinic, elegant vintage clock face showing 12:00, ornate clock hands in gold, pocket watch aesthetic with mechanical gear details, warm sepia and gold tones, countdown to midnight atmosphere, steampunk-inspired elegant timepiece design, transitional moment captured',
    },
  ],

  // ─── 명절 인사: 어버이날 (6개) ───
  greeting_어버이날: [
    {
      id: 'grt_parent_carnation', name: '카네이션 전통', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '빨간 카네이션',
      layoutHint: 'traditional',
      aiPrompt: 'Beautiful red carnation Parents Day greeting for dental clinic, large realistic red carnation flower as centerpiece, green ribbon tied in bow, traditional Korean gratitude card aesthetic, warm red and cream palette, soft petal texture details, heartfelt 감사합니다 calligraphy, elegant floral frame border',
    },
    {
      id: 'grt_parent_watercolor', name: '수채화 꽃다발', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8',
      desc: '수채화 꽃다발',
      layoutHint: 'warm',
      aiPrompt: 'Watercolor carnation bouquet Parents Day greeting for dental clinic, loose watercolor painting of carnation bouquet in pink and red, gentle color bleeds and artistic brush strokes, soft pink and cream background, handwritten-style thankyou message, artistic and emotional, warm family love atmosphere, hand-painted aesthetic',
    },
    {
      id: 'grt_parent_modern', name: '모던 감사', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 감사 카드',
      layoutHint: 'minimal',
      aiPrompt: 'Modern minimalist Parents Day greeting for dental clinic, single elegant carnation stem illustration in line art style, clean indigo and white, contemporary typography spelling 감사합니다, generous whitespace, subtle heart shapes, sophisticated medical brand gratitude card, refined and understated love expression',
    },
    {
      id: 'grt_parent_photo', name: '포토 프레임', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '가족 사진 프레임',
      layoutHint: 'cute',
      aiPrompt: 'Cute photo frame Parents Day greeting for dental clinic, polaroid-style photo frame area with heart-shaped clips, surrounding carnation garland decoration, warm orange and cream scrapbook aesthetic, hand-drawn heart doodles, family album memory book feel, sticker and stamp decorations, playful yet touching',
    },
    {
      id: 'grt_parent_gold', name: '금장 카네이션', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '골드 프리미엄',
      layoutHint: 'luxury',
      aiPrompt: 'Premium gold-accented Parents Day greeting for dental clinic, golden carnation illustration with metallic foil effect, deep burgundy and gold color scheme, ornate gold frame border, luxury ribbon with bow, premium paper embossed texture, elegant and prestigious gratitude card, refined medical practice appreciation',
    },
    {
      id: 'grt_parent_garden', name: '정원 풍경', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '카네이션 정원',
      layoutHint: 'nature',
      aiPrompt: 'Carnation garden landscape Parents Day greeting for dental clinic, lush garden full of blooming red and pink carnations, morning sunlight filtering through, green garden path with bench, watercolor botanical illustration style, peaceful and grateful atmosphere, nature-inspired gratitude scene, warm and nurturing feeling',
    },
  ],

  // ─── 명절 인사: 크리스마스 (6개) ───
  greeting_크리스마스: [
    {
      id: 'grt_xmas_tree', name: '크리스마스 트리', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '화려한 트리',
      layoutHint: 'traditional',
      aiPrompt: 'Festive Christmas tree greeting for dental clinic, beautifully decorated Christmas tree with ornaments and star topper, colorful lights twinkling, green and red traditional Christmas palette, gift boxes under tree, golden garland decorations, warm holiday living room atmosphere, classic Christmas card aesthetic',
    },
    {
      id: 'grt_xmas_snow', name: '눈 내리는 밤', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '눈 오는 겨울밤',
      layoutHint: 'nature',
      aiPrompt: 'Snowy winter night Christmas greeting for dental clinic, gentle snowflakes falling against dark blue sky, cozy village with lit windows and snow-covered rooftops, street lamp with warm golden glow, soft blue and white palette, peaceful silent night atmosphere, watercolor winter landscape, magical Christmas eve scene',
    },
    {
      id: 'grt_xmas_minimal', name: '미니멀 노엘', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '심플 레드&화이트',
      layoutHint: 'minimal',
      aiPrompt: 'Ultra-minimalist Christmas greeting for dental clinic, single elegant red ornament ball hanging from thin line, vast white space, clean modern sans-serif Merry Christmas text, subtle snowflake pattern in background, red and white only, sophisticated graphic design Christmas card, less is more holiday elegance',
    },
    {
      id: 'grt_xmas_character', name: '산타 캐릭터', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '귀여운 산타',
      layoutHint: 'cute',
      aiPrompt: 'Cute Santa Claus character Christmas greeting for dental clinic, adorable chibi Santa with red hat carrying gift bag, cute tooth character dressed as elf or reindeer, kawaii style illustration, bright red and green with candy cane stripes, playful snowman and gingerbread decorations, cheerful Christmas party mood',
    },
    {
      id: 'grt_xmas_gold', name: '골드 오너먼트', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '럭셔리 골드 장식',
      layoutHint: 'luxury',
      aiPrompt: 'Luxury gold ornament Christmas greeting for dental clinic, dark navy/black background with elegant gold Christmas ornaments hanging, gold ribbon bows, metallic sparkle and shimmer, crystal snowflake decorations, premium gold foil typography, high-end luxury Christmas card, sophisticated and opulent holiday greeting',
    },
    {
      id: 'grt_xmas_wreath', name: '리스 장식', color: '#16a34a', accent: '#15803d', bg: '#f0fdf4',
      desc: '초록 리스 프레임',
      layoutHint: 'warm',
      aiPrompt: 'Christmas wreath frame greeting for dental clinic, beautiful circular wreath of pine branches holly and berries as border frame, red bow at bottom, warm candlelight glow, cozy green and red palette, pine cone and mistletoe details, warm family Christmas atmosphere, greeting text centered in wreath circle',
    },
  ],

  // ─── 명절 인사: 기본 fallback (구 greeting) ───
  greeting: [
    {
      id: 'grt_traditional_korean', name: '전통 한국풍', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '전통 명절 디자인',
      layoutHint: 'traditional',
      aiPrompt: 'Traditional Korean holiday greeting card design for dental clinic, elegant red and gold colors, traditional Korean patterns (dancheong, clouds, cranes), beautiful calligraphy-style greeting text, pine tree or plum blossom decorations, festive yet dignified Asian traditional aesthetic, holiday closure period notice area, hospital name with traditional frame border',
    },
    {
      id: 'grt_warm_family', name: '따뜻한 가족', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '가족 중심 따뜻한',
      layoutHint: 'warm',
      aiPrompt: 'Warm family-oriented holiday greeting from dental clinic, soft orange and cream watercolor style, gentle hand-drawn family illustration, heartfelt greeting message in warm typography, cozy home atmosphere, soft bokeh light effects, emotional and caring medical practice greeting, warm candlelight mood',
    },
    {
      id: 'grt_modern_minimal', name: '모던 미니멀', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세련된 미니멀',
      layoutHint: 'minimal',
      aiPrompt: 'Modern minimalist holiday greeting card from dental clinic, clean indigo and white design, single elegant holiday symbol, contemporary typography with generous whitespace, sophisticated greeting message, subtle geometric patterns, refined medical brand holiday card, understated elegance with clear closure schedule',
    },
    {
      id: 'grt_nature_season', name: '자연 사계절', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '계절감 자연풍',
      layoutHint: 'nature',
      aiPrompt: 'Nature-inspired seasonal holiday greeting from dental clinic, lush green and earth tones, beautiful seasonal landscape illustration, serene natural atmosphere, watercolor botanical elements, peaceful and refreshing holiday greeting, clinic closure info elegantly placed',
    },
    {
      id: 'grt_luxury_gold', name: '럭셔리 골드', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '프리미엄 골드',
      layoutHint: 'luxury',
      aiPrompt: 'Luxury premium gold holiday greeting card from dental clinic, rich gold and deep burgundy or navy, elegant metallic gold text and borders, sophisticated holiday ornaments, premium quality paper texture, high-end medical practice holiday card, refined gold foil effect decorations, prestigious and exclusive feel',
    },
    {
      id: 'grt_cute_character', name: '귀여운 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '캐릭터 일러스트',
      layoutHint: 'cute',
      aiPrompt: 'Cute character-based holiday greeting from dental clinic, adorable pink and pastel colors, kawaii-style tooth or dental character celebrating holiday, fun and playful holiday illustration, bright and cheerful mood, family-friendly dental practice greeting, cute speech bubble with greeting text, festive confetti and stars',
    },
  ],

  // ─── 채용/공고 (6개) ───
  hiring: [
    {
      id: 'hir_corporate_clean', name: '기업 클린', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '공식 채용공고',
      layoutHint: 'corporate',
      aiPrompt: 'Professional corporate dental clinic job posting design, clean navy blue and white, structured resume-style layout, clear job title and requirements sections, organized benefits list, professional HR recruitment aesthetic, medical institution official job announcement, company logo area prominent, application method clearly displayed',
    },
    {
      id: 'hir_friendly_team', name: '팀워크 친근', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '친근한 팀 소개형',
      layoutHint: 'team',
      aiPrompt: 'Friendly team-oriented dental clinic hiring design, warm green and white, team photo placeholder area, welcoming workplace culture emphasis, employee testimonial quotes area, benefits highlighted with friendly icons, approachable medical team recruitment, casual yet professional tone, join our family messaging',
    },
    {
      id: 'hir_modern_startup', name: '모던 스타트업', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '트렌디 모던',
      layoutHint: 'modern',
      aiPrompt: 'Modern startup-style dental clinic hiring design, trendy purple and gradient accents, bold contemporary typography, emoji or icon-based benefits list, dynamic layout with angled shapes, tech-forward medical practice recruitment, growth opportunity emphasis, modern workspace photo area, energetic and innovative feel',
    },
    {
      id: 'hir_benefits_focus', name: '복리후생 강조', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '혜택 중심 디자인',
      layoutHint: 'benefits',
      aiPrompt: 'Benefits-focused dental clinic hiring design, warm amber and cream, large icon grid showcasing workplace benefits (insurance, meals, vacation, bonuses), visual infographic-style benefit comparison, attractive employee perks highlighted, compelling workplace culture showcase, medical staff recruitment with competitive advantages emphasis',
    },
    {
      id: 'hir_urgent_now', name: '급구 긴급', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '긴급 채용 강조',
      layoutHint: 'urgent',
      aiPrompt: 'Urgent hiring notice dental clinic design, bold red and white, large HIRING NOW banner, attention-grabbing urgent recruitment aesthetic, deadline prominently displayed, immediate start emphasis, bold exclamation elements, direct and clear job requirements, quick-apply information, energetic and time-sensitive medical staff recruitment',
    },
    {
      id: 'hir_premium_brand', name: '프리미엄 브랜드', color: '#78716c', accent: '#57534e', bg: '#fafaf9',
      desc: '고급 브랜딩',
      layoutHint: 'brand',
      aiPrompt: 'Premium branded dental clinic hiring design, sophisticated gray and charcoal with gold accents, luxury medical practice recruitment, high-end workplace photography area, elegant typography and refined spacing, exclusive career opportunity positioning, premium clinic interior showcase, professional development emphasis, executive-level recruitment feel',
    },
  ],

  // ─── 주의사항 (6개) ───
  caution: [
    {
      id: 'cau_medical_checklist', name: '의료 체크리스트', color: '#3b82f6', accent: '#2563eb', bg: '#eff6ff',
      desc: '체크리스트형 안내',
      layoutHint: 'checklist',
      aiPrompt: 'Medical checklist style post-treatment caution notice from dental clinic, clean blue and white, numbered or checkmarked list of precautions, clear medical instruction format, professional healthcare aftercare design, stethoscope or medical cross icon, easy-to-follow step-by-step care instructions, organized patient guide layout',
    },
    {
      id: 'cau_warning_bold', name: '경고 강조형', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '주의 경고 강조',
      layoutHint: 'warning',
      aiPrompt: 'Bold warning-style dental treatment caution notice, red and white with warning triangle icons, important precautions highlighted with red background bars, clear DO and DONT sections, urgent medical warning aesthetic, bold typography for critical instructions, patient safety emphasis, emergency contact prominently displayed',
    },
    {
      id: 'cau_friendly_guide', name: '친절한 가이드', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '부드러운 안내 가이드',
      layoutHint: 'guide',
      aiPrompt: 'Friendly patient guide style dental aftercare notice, soft green and cream, cute dental health illustrations, gentle and caring instruction tone, icon-based precaution items with friendly explanations, warm healthcare communication style, encouraging recovery message, approachable medical advice layout with smiley elements',
    },
    {
      id: 'cau_timeline_recovery', name: '회복 타임라인', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '회복 단계별 안내',
      layoutHint: 'timeline',
      aiPrompt: 'Recovery timeline dental aftercare design, purple and white, chronological recovery stages (Day 1, Week 1, Month 1), visual progress timeline, stage-by-stage care instructions, medical recovery infographic style, healing progress indicator, encouraging milestone-based patient guide, professional medical aftercare chart',
    },
    {
      id: 'cau_infographic', name: '인포그래픽', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '시각적 인포그래픽',
      layoutHint: 'infographic',
      aiPrompt: 'Visual infographic dental aftercare caution design, warm amber and white, icon-heavy visual instructions, food to avoid shown with X marks, recommended actions with checkmarks, graphical medical information design, easy-to-understand visual patient guide, pictogram-based instructions, minimal text maximum visual communication',
    },
    {
      id: 'cau_clean_card', name: '클린 카드', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '깔끔한 카드형',
      layoutHint: 'card',
      aiPrompt: 'Clean card-style dental treatment caution notice, sky blue and white, individual caution items as separate cards with icons, modern UI card layout, clear and organized medical aftercare instructions, soft shadows and rounded corners, contemporary healthcare communication design, numbered instruction cards with brief clear text',
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
}

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
  const { category, stylePrompt, textContent, hospitalName, extraPrompt, imageSize } = req;

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
${calendarAccuracyBlock}
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
        model: 'gemini-3.1-pro-image-preview',
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
