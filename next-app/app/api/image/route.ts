/**
 * /api/image — Gemini 이미지 생성 프록시
 *
 * gemini-2.0-flash-exp 모델로 이미지 생성.
 * responseModalities: ["IMAGE", "TEXT"] 사용.
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── 멀티키 로테이션 (gemini route와 동일) ──

function getKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  return keys;
}

let keyIndex = 0;

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

function getAspectInstruction(ratio: AspectRatio): string {
  switch (ratio) {
    case '1:1': return '정사각형(1:1) 비율로 생성해주세요.';
    case '16:9': return '가로형(16:9) 와이드 비율로 생성해주세요.';
    case '9:16': return '세로형(9:16) 모바일 비율로 생성해주세요.';
    case '4:3': return '4:3 비율로 생성해주세요.';
    default: return '';
  }
}

const DESIGNER_PERSONA = `[DESIGNER IDENTITY]
You are a veteran Korean hospital marketing designer.
You specialize in Korean medical clinic SNS images — monthly schedules, event promotions, doctor introductions, notices, holiday greetings, and patient care guides.

[DESIGN PHILOSOPHY]
- Every image must function as a REAL hospital communication tool
- Design like Korean hospital templates — clean, professional, immediately usable
- Korean text readability is the #1 priority
- Information hierarchy: title > key data > supporting details > contact/footer
- Mobile-first: all content must be legible on a phone screen`;

const DESIGN_RULE = `[디자인 규칙]
1. 사용자가 프롬프트에서 지정한 색상, 위치, 레이아웃, 분위기를 정확히 따르세요.
2. 휴진/휴무 표시는 프롬프트에 지정된 색상(예: 붉은색)을 사용하세요. 모든 휴진 날짜에 동일한 색상과 스타일을 적용하세요.
3. 요소 간 간격을 최소화하세요. 모든 요소를 콤팩트하게 배치하세요.
4. 한국어 텍스트를 명확하고 읽기 쉽게 렌더링하세요.`;

// ── 달력 감지 ──

function detectDateContext(prompt: string): { needsCalendar: boolean; months: number[]; year: number } {
  const now = new Date();
  const year = now.getFullYear();
  const calendarKeywords = /달력|캘린더|calendar|일정|스케줄|진료\s*안내|휴진|휴무|공휴일|진료\s*시간/i;
  const needsCalendar = calendarKeywords.test(prompt);

  const months: number[] = [];
  const monthMatches = prompt.matchAll(/(\d{1,2})\s*월/g);
  for (const m of monthMatches) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 12) months.push(num);
  }
  if (months.length === 0 && needsCalendar) {
    months.push(now.getMonth() + 1);
  }
  return { needsCalendar, months, year };
}

function buildCalendarGrid(year: number, month: number): string {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  let grid = `${month}월 달력:\n`;
  grid += dayNames.join('  ') + '\n';
  let line = '    '.repeat(firstDay);
  let dayOfWeek = firstDay;

  for (let d = 1; d <= lastDate; d++) {
    line += String(d).padStart(2, ' ') + '  ';
    dayOfWeek++;
    if (dayOfWeek === 7) {
      grid += line.trimEnd() + '\n';
      line = '';
      dayOfWeek = 0;
    }
  }
  if (line.trim()) grid += line.trimEnd() + '\n';
  return grid;
}

function getKoreanHolidays(year: number, month: number): string[] {
  const holidays: Record<string, string> = {
    '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날',
    '6-6': '현충일', '8-15': '광복절', '10-3': '개천절',
    '10-9': '한글날', '12-25': '성탄절',
  };
  const result: string[] = [];
  for (const [key, name] of Object.entries(holidays)) {
    const [m] = key.split('-').map(Number);
    if (m === month) result.push(`${key} ${name}`);
  }
  return result;
}

interface ImageRequestBody {
  prompt: string;
  aspectRatio?: AspectRatio;
  logoInstruction?: string;
  hospitalInfo?: string;
  brandColors?: string;
  logoBase64?: string;      // data:image/...;base64,xxx
  calendarImage?: string;   // Canvas-rendered calendar reference image (data URL)
}

export async function POST(request: NextRequest) {
  const keys = getKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: '[env] GEMINI_API_KEY 누락' },
      { status: 500 },
    );
  }

  let body: ImageRequestBody;
  try {
    body = await request.json() as ImageRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const aspectRatio = body.aspectRatio || '1:1';
  const aspectInstruction = getAspectInstruction(aspectRatio);

  // 언어 감지
  const hasEnglishRequest = /\b(english|영어로)\b/i.test(body.prompt);
  const languageRule = hasEnglishRequest
    ? ''
    : '[언어 규칙] 이미지 안의 모든 텍스트는 반드시 한국어로만 작성하세요. 요일은 일/월/화/수/목/금/토로 표기하세요.';

  // 달력 자동 감지
  const dateCtx = detectDateContext(body.prompt);
  let calendarContext = '';
  let calendarInstruction = '';
  if (dateCtx.needsCalendar && dateCtx.months.length > 0) {
    const gridParts: string[] = [];
    for (const month of dateCtx.months) {
      gridParts.push(buildCalendarGrid(dateCtx.year, month));
      const holidays = getKoreanHolidays(dateCtx.year, month);
      if (holidays.length > 0) {
        gridParts.push(`공휴일: ${holidays.join(', ')}`);
      }
    }
    calendarContext = `[정확한 달력 데이터]\n${gridParts.join('\n')}`;
    if (body.calendarImage) {
      calendarInstruction = '[달력 규칙] 첨부된 달력 참조 이미지의 날짜-요일 배치를 반드시 정확히 따르세요. 각 날짜가 올바른 요일 칸에 위치해야 합니다. 날짜를 중복하거나 빠뜨리지 마세요. 달력의 숫자는 참조 이미지와 1:1로 동일해야 합니다.';
    }
  }

  const fullPrompt = [
    DESIGNER_PERSONA,
    DESIGN_RULE,
    languageRule,
    calendarInstruction,
    calendarContext,
    body.prompt.trim(),
    body.logoInstruction || '',
    body.hospitalInfo || '',
    body.brandColors || '',
    aspectInstruction,
    'Generate at high resolution. Sharp edges, crisp text, no blur, no compression artifacts.',
  ].filter(Boolean).join('\n\n');

  // 멀티모달 parts 구성: 텍스트 + 참조 이미지들
  const parts: Array<Record<string, unknown>> = [{ text: fullPrompt }];

  // 달력 참조 이미지를 inlineData로 추가
  if (body.calendarImage) {
    const calMatch = body.calendarImage.match(/^data:(image\/\w+);base64,(.+)$/);
    if (calMatch) {
      parts.push({
        inlineData: { mimeType: calMatch[1], data: calMatch[2] },
      });
    }
  }

  // 로고 이미지를 inlineData로 추가
  if (body.logoBase64) {
    const match = body.logoBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: { mimeType: match[1], data: match[2] },
      });
    }
  }

  const model = 'gemini-2.0-flash-exp';
  const apiBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 0.6,
    },
  };

  const MAX_RETRIES = 2;
  const perAttemptTimeout = 120000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ki = (keyIndex + attempt) % keys.length;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeout);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[ki]}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        if ((status === 429 || status === 503) && attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        return NextResponse.json(
          { error: `Gemini API ${status}`, details: errorText.substring(0, 500) },
          { status },
        );
      }

      keyIndex = (ki + 1) % keys.length;
      const data = await response.json();

      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        const base64 = imagePart.inlineData.data;

        return NextResponse.json({
          imageDataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
        });
      }

      // 이미지 데이터 없음 — 재시도
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      return NextResponse.json(
        { error: '이미지 데이터를 받지 못했습니다.' },
        { status: 502 },
      );
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const error = err as Error;

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (error.name === 'AbortError') {
        return NextResponse.json({ error: 'Gemini API timeout' }, { status: 504 });
      }

      return NextResponse.json(
        { error: error.message || '이미지 생성 실패' },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ error: '모든 시도 실패' }, { status: 502 });
}
