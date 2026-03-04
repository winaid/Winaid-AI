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
  hospitalName?: string;
  notices?: string[];       // 하단 안내 문구
  colorTheme?: 'blue' | 'green' | 'pink' | 'purple';
}

export interface ClosedDay {
  day: number;
  reason?: string; // "어린이날", "원장님 학회" 등
}

// ── 프롬프트에서 달력 데이터 추출 (AI 텍스트) ──

export async function parseCalendarPrompt(prompt: string): Promise<CalendarData | null> {
  const ai = getAiClient();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const systemPrompt = `당신은 사용자의 병원 달력 요청을 분석하여 JSON으로 변환하는 전문가입니다.
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "month": 숫자(1-12),
  "title": "달력 제목 문자열",
  "closedDays": [{"day": 숫자, "reason": "사유"}],
  "hospitalName": "병원명 또는 null",
  "notices": ["안내문구1", "안내문구2"] 또는 [],
  "colorTheme": "blue" | "green" | "pink" | "purple"
}

규칙:
- month: 프롬프트에서 언급된 월. 없으면 ${currentMonth}
- title: 프롬프트에서 파악되는 제목. 없으면 "N월 진료 안내"
- closedDays: 휴진/휴무로 언급된 날짜들. "매주 X요일"은 해당 월의 모든 X요일 날짜로 변환하세요.
  - ${currentYear}년 기준으로 요일을 계산하세요.
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

    // JSON 추출 (```json ... ``` 감싸기 대응)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      month: parsed.month || currentMonth,
      year: currentYear,
      title: parsed.title || `${parsed.month || currentMonth}월 진료 안내`,
      closedDays: (parsed.closedDays || []).map((d: any) => ({
        day: Number(d.day),
        reason: d.reason || undefined,
      })),
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
  const { month, year, title, closedDays, hospitalName, notices, colorTheme } = data;
  const theme = THEMES[colorTheme || 'blue'];

  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const holidays = getHolidays(year, month);
  const closedSet = new Map<number, string>();
  for (const cd of closedDays) {
    closedSet.set(cd.day, cd.reason || '휴진');
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
      const holidayName = holidays.get(d);
      const closedReason = closedSet.get(d);

      let color = '#333333';
      if (isClosed) color = '#ef4444'; // 휴진일은 무조건 빨간색으로 통일
      else if (isSunday || isHoliday) color = '#ef4444';
      else if (isSaturday) color = '#3b82f6';

      let bgColor = 'transparent';
      let badge = '';

      if (isClosed) {
        bgColor = '#fef2f2';
        badge = `<div style="margin-top:2px;font-size:11px;color:#ef4444;font-weight:700;">휴진</div>`;
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

  const hospitalLine = hospitalName
    ? `<div style="font-size:14px;color:rgba(255,255,255,0.9);margin-top:4px;font-weight:400;">${hospitalName}</div>`
    : '';

  const noticesHTML = (notices && notices.length > 0)
    ? `<div style="margin-top:20px;padding:16px 20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
        ${notices.map(n => `<div style="font-size:13px;color:#475569;line-height:1.8;">• ${n}</div>`).join('')}
      </div>`
    : '';

  // 휴진일 범례
  const closedLegend = closedDays.length > 0
    ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${closedDays.map(cd => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fef2f2;border-radius:20px;font-size:12px;color:#ef4444;font-weight:600;">
          <span style="width:6px;height:6px;background:#ef4444;border-radius:50%;display:inline-block;"></span>
          ${cd.day}일 ${cd.reason || '휴진'}
        </span>`).join('')}
      </div>`
    : '';

  return `<div id="calendar-render-target" style="width:700px;background:#ffffff;border-radius:20px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- 헤더 -->
    <div style="background:linear-gradient(135deg, ${theme.primary}, ${theme.accent});padding:28px 32px;text-align:center;">
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
