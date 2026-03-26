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

type AspectRatio = '1:1' | '16:9' | '3:4' | '9:16' | '4:3' | 'auto';

function getAspectInstruction(ratio: AspectRatio): string {
  switch (ratio) {
    case '1:1': return '정사각형(1:1, 1080x1080) 비율로 생성해주세요.';
    case '16:9': return '가로형(16:9, 1920x1080) 와이드 비율로 생성해주세요.';
    case '3:4': return '세로형(3:4, 1080x1440) 비율로 생성해주세요.';
    case '9:16': return '세로형(9:16, 1080x1920) 모바일 비율로 생성해주세요.';
    case '4:3': return '4:3 비율로 생성해주세요.';
    case 'auto': return '콘텐츠에 가장 적합한 비율을 자동으로 선택해주세요.';
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
4. 한국어 텍스트를 명확하고 읽기 쉽게 렌더링하세요.
5. 사용자가 직접 입력하지 않은 전화번호, 홈페이지 URL, 이메일 주소를 절대 넣지 마세요. "02-000-0000", "www.hospital.com", "02-1234-5678" 같은 예시/더미 연락처를 이미지에 렌더링하지 마세요. 연락처가 필요하면 빈 칸으로 두거나 아예 생략하세요.`;

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

// ── 카드뉴스 전용 페르소나 + 프레임/스타일 블록 (OLD cardNewsImageService.ts 동일) ──

const CARD_NEWS_PERSONA = `[ROLE] Korean medical SNS card news designer.
[GOAL] Generate a 1:1 square card image with Korean text rendered directly into pixels.
[PRIORITY] Text readability > visual aesthetics. Mobile-first. Korean medical ad law compliant.`;

const CARD_FRAME_RULE = `[FRAME LAYOUT - FOLLOW REFERENCE STYLE]
- Border color: #787fff (lavender purple/violet) around the edges
- White content area inside the border
- Rounded corners
- Clean minimal design`;

function buildCardStyleBlock(imageStyle: string): string {
  if (imageStyle === 'photo') return `[STYLE - 실사 촬영 (PHOTOREALISTIC)]
- photorealistic, DSLR, 35mm lens, natural lighting, shallow depth of field, bokeh
- realistic skin texture, real fabric texture, 4K ultra high resolution
- 실제 한국인 인물, 실제 병원/의료 환경
⛔ 금지: 3D render, illustration, cartoon, anime, vector, clay`;

  if (imageStyle === 'medical') return `[STYLE - 의학 3D (MEDICAL 3D RENDER)]
- medical 3D illustration, anatomical render, scientific visualization
- clinical lighting, x-ray style glow, translucent organs
- 인체 해부학, 장기 단면도, 뼈/근육/혈관 구조
⛔ 금지: cute cartoon, photorealistic human face`;

  if (imageStyle === 'custom') return ''; // 사용자 지정 스타일 — 추가 규칙 없음

  // default: illustration
  return `[STYLE - 3D 일러스트 (3D ILLUSTRATION)]
- 3D rendered illustration, Blender/Cinema4D style, soft 3D render
- soft studio lighting, ambient occlusion, gentle shadows
- smooth plastic-like surfaces, matte finish, rounded edges
- 밝은 파스텔 톤, 파란색/흰색/연한 색상 팔레트
- cute stylized characters, friendly expressions
⛔ 금지: photorealistic, real photo, DSLR, realistic texture`;
}

function buildCardNewsPromptFull(body: ImageRequestBody): string {
  const style = body.imageStyle || 'illustration';
  const styleBlock = buildCardStyleBlock(style);

  // 텍스트 필드 파싱
  const parseField = (text: string, key: string): string => {
    const match = text.match(new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i'))
      || text.match(new RegExp(`${key}:\\s*([^\\n,]+)`, 'i'));
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
  };

  const subtitle = parseField(body.prompt, 'subtitle');
  const mainTitle = parseField(body.prompt, 'mainTitle');
  const description = parseField(body.prompt, 'description');
  const visualMatch = body.prompt.match(/비주얼:\s*([^\n]+)/i);
  const visual = visualMatch?.[1]?.trim() || '';

  // 배경색 추출 (디자인 템플릿에서)
  const bgMatch = body.prompt.match(/배경색:\s*(#[A-Fa-f0-9]{6}|#[A-Fa-f0-9]{3})/i);
  const bgColor = bgMatch?.[1] || '#E8F4FD';

  // 디자인 템플릿 블록 추출
  const tmplMatch = body.prompt.match(/\[디자인 템플릿:[^\]]*\][\s\S]*$/m);
  const templateBlock = tmplMatch?.[0] || '';

  const hasText = subtitle || mainTitle;

  if (hasText) {
    return `${CARD_NEWS_PERSONA}

🚨 RENDER THIS EXACT KOREAN TEXT IN THE IMAGE:
MAIN TITLE (big, bold, center): "${mainTitle}"
SUBTITLE (small, above title): "${subtitle}"
${description ? `DESCRIPTION (small, below title): "${description}"` : ''}

${visual ? `ILLUSTRATION: "${visual}" — draw exactly this!` : ''}

1:1 square card. Background: ${bgColor} gradient.
${CARD_FRAME_RULE}
${styleBlock}

Text: subtitle(small) → mainTitle(LARGE) → description(small). Clean readable Korean font.
${templateBlock}
⛔ No hashtags, watermarks, logos, placeholder text.`.trim();
  }

  return `${CARD_NEWS_PERSONA}

1:1 square social media card image.
${CARD_FRAME_RULE}
${styleBlock}

[CONTENT TO RENDER]
${body.prompt}

Background: ${bgColor} gradient. Clean readable Korean font.
⛔ No hashtags, watermarks, logos. Do NOT render instruction labels.`.trim();
}

interface ImageRequestBody {
  prompt: string;
  aspectRatio?: AspectRatio;
  mode?: 'blog' | 'card_news' | 'default';
  imageStyle?: string;       // card_news: illustration | photo | medical
  logoInstruction?: string;
  hospitalInfo?: string;
  brandColors?: string;
  logoBase64?: string;
  calendarImage?: string;
  referenceImage?: string;   // card_news: 참고 이미지 base64
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

  const isBlogMode = body.mode === 'blog';
  const isCardNewsMode = body.mode === 'card_news';

  const BLOG_IMAGE_RULE = `[STRICT IMAGE RULES — BLOG ILLUSTRATION MODE]
You are generating a blog body illustration image. This is NOT a poster, flyer, ad, or infographic.
ABSOLUTE PROHIBITIONS:
- NO readable text, titles, captions, labels, signage, logos, or watermarks anywhere in the image
- NO hospital names, brand names, phone numbers, URLs, social handles
- NO bullet lists, numbered lists, tables, charts, diagrams, infographics
- NO poster layout, flyer layout, brochure layout, card news layout, banner layout
- NO typography of any kind — zero letters, zero words, zero characters
OUTPUT DIRECTION:
- Generate a clean editorial-style photograph or natural scene illustration
- Focus on visual mood, people, spaces, objects, lighting, atmosphere
- The image must work as a blog body illustration that contains NO information text`;

  const fullPrompt = isCardNewsMode
    ? buildCardNewsPromptFull(body)
    : isBlogMode
    ? [
        BLOG_IMAGE_RULE,
        body.prompt.trim(),
        aspectInstruction,
        'Generate at high resolution. Sharp edges, no blur, no compression artifacts. Absolutely no text in the image.',
      ].filter(Boolean).join('\n\n')
    : [
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
        '⛔ NEVER render placeholder contact info like "02-000-0000", "www.hospital.com", "02-1234-5678", or any phone/URL/email that was not explicitly provided by the user. If no contact info was given, leave that area empty or omit it entirely.',
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

  // 카드뉴스 참고 이미지를 inlineData로 추가
  if (body.referenceImage) {
    const refMatch = body.referenceImage.match(/^data:(image\/\w+);base64,(.+)$/);
    if (refMatch) {
      parts.push({
        inlineData: { mimeType: refMatch[1], data: refMatch[2] },
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

  // 모델 우선순위: PRO → FLASH → 2.5 fallback
  const MODELS = [
    'gemini-3-pro-image-preview',       // Nano Banana Pro: 고품질
    'gemini-3.1-flash-image-preview',   // Nano Banana 2: 속도+안정성
    'gemini-2.5-flash-image',           // Nano Banana: 안정 GA 모델
  ];

  const apiBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 0.6,
    },
  };

  const perAttemptTimeout = 120000;
  let lastError = '';

  // 각 모델 × 각 키 조합으로 시도
  for (const model of MODELS) {
    for (let ki = 0; ki < keys.length; ki++) {
      const keyIdx = (keyIndex + ki) % keys.length;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeout);
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[keyIdx]}`;

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
          lastError = `${model} key${ki}: ${status} ${errorText.substring(0, 200)}`;

          // 429/503 → 다음 키 또는 다음 모델로
          if (status === 429 || status === 503) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }

          // 400 (모델 미존재 등) → 다음 모델로
          if (status === 400 || status === 404) break;

          // 기타 에러 → 다음 시도
          continue;
        }

        keyIndex = (keyIdx + 1) % keys.length;
        const data = await response.json();

        const resParts = data?.candidates?.[0]?.content?.parts || [];
        const imagePart = resParts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);

        if (imagePart?.inlineData) {
          const mimeType = imagePart.inlineData.mimeType || 'image/png';
          const base64 = imagePart.inlineData.data;

          return NextResponse.json({
            imageDataUrl: `data:${mimeType};base64,${base64}`,
            mimeType,
            model,
          });
        }

        // 이미지 없는 응답 → 다음 시도
        lastError = `${model}: 응답에 이미지 데이터 없음`;
        continue;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const error = err as Error;
        lastError = `${model} key${ki}: ${error.name === 'AbortError' ? 'timeout' : error.message}`;

        if (error.name === 'AbortError') {
          // 타임아웃 → 다음 모델로 (같은 모델 재시도 무의미)
          break;
        }
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
    }
  }

  return NextResponse.json(
    { error: `이미지 생성 실패 (${MODELS.length}개 모델 모두 실패)`, details: lastError },
    { status: 502 },
  );
}
