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

type AspectRatio = '1:1' | '4:5' | 'A4' | '16:9' | '3:4' | '9:16' | '4:3' | 'auto';

function getAspectInstruction(ratio: AspectRatio): string {
  switch (ratio) {
    case '1:1': return '정사각형(1:1, 1080x1080) 비율로 생성해주세요.';
    case '16:9': return '가로형(16:9, 1920x1080) 와이드 비율로 생성해주세요.';
    case '3:4': return '세로형(3:4, 1080x1440) 비율로 생성해주세요.';
    case '4:5': return '세로형(4:5, 1080x1350) 인스타그램 세로 비율로 생성해주세요.';
    case '9:16': return '세로형(9:16, 1080x1920) 모바일 비율로 생성해주세요.';
    case '4:3': return '4:3 비율로 생성해주세요.';
    case 'A4': return 'A4 인쇄용(세로방향, 210mm×297mm) 비율로 생성해주세요. 인쇄 품질에 적합한 고해상도로 생성하세요.';
    case 'auto': return '콘텐츠에 가장 적합한 비율을 자동으로 선택해주세요.';
    default: return '';
  }
}

const DESIGNER_PERSONA = `[DESIGNER IDENTITY]
You are a world-class Korean hospital marketing designer with 15+ years at top agencies (똑닥, 강남언니, 미리캔버스).
Your work is featured on premium Korean medical clinic Instagram accounts — 치과, 피부과, 성형외과, 내과, 한의원.

[DESIGN PHILOSOPHY — PREMIUM QUALITY]
- Every image must look like a ₩500,000+ professional design agency deliverable
- Reference quality: Apple-level clean design meets Korean medical professionalism
- Typography: Pretendard/Noto Sans KR style. Headings bold and impactful (28-40pt), body clean and readable (14-16pt)
- Color: Maximum 3 colors. Sophisticated palette — NO cheap neon, NO garish combinations. Think: soft blue + navy + white, beige + gold + charcoal, sage green + cream + dark green
- Layout: Generous whitespace, clear visual hierarchy, balanced proportions, aligned grids
- Surfaces: Subtle soft shadows, refined rounded corners, clean card layouts
- Textures: Subtle gradients, soft frosted glass effects, elegant line dividers — NOT flat or boring
- Korean text: Crystal clear rendering, perfect kerning, appropriate line-height
- Mobile-first: All content legible on phone at arm's distance
- Information hierarchy: title (biggest) > key data > supporting details > footer

[PREMIUM DESIGN MARKERS — MUST INCLUDE]
- Sophisticated color gradients (subtle, two to three stops max)
- Refined typography scale with clear contrast between heading, body, caption
- Elegant spacing rhythm with consistent padding and generous margins
- Professional icon usage if needed (line icons, NOT clip art)
- Clean information blocks with subtle separators
- Polished, cohesive visual identity throughout the image
- DO NOT render any CSS code, technical specs, or design tokens as visible text in the image`;

const DESIGN_RULE = `[디자인 규칙 — 프리미엄 품질 필수]
1. 사용자가 지정한 색상, 레이아웃, 분위기를 정확히 따르되, 항상 고급스럽게 표현하세요.
2. 한국어 텍스트를 크고 선명하게 렌더링하세요. 최소 14pt, 제목은 28pt 이상.
3. 여백을 넉넉하게 쓰세요 — 빽빽한 디자인은 금지. 요소 간 충분한 간격을 두세요.
4. 색상은 세련되고 조화로운 팔레트를 사용하세요. 원색 그대로 쓰지 말고 톤 다운된 프리미엄 컬러를 쓰세요.
5. 그라데이션은 미묘하고 우아하게. 2-3 스톱, 부드러운 전환.
6. 카드/박스는 둥근 모서리와 미세한 그림자로 고급스러운 입체감.
7. 사용자가 입력하지 않은 전화번호, URL, 이메일을 절대 넣지 마세요. "02-000-0000", "www.hospital.com" 같은 더미 텍스트 금지.
8. 휴진/휴무 표시는 지정된 색상으로 모든 해당 날짜에 일관되게 적용.
9. 결과물은 실제 프리미엄 병원 인스타그램에 바로 올릴 수 있는 수준이어야 합니다.

[금지 사항]
- 싸구려 느낌의 starburst, 폭발 효과, 만화 스타일
- 클립아트, 스톡 사진 느낌
- 12pt 미만의 작은 텍스트
- 여러 폰트 혼용
- 원색 위주의 촌스러운 색 조합
- 빽빽하고 답답한 레이아웃
- 워터마크, 스티커 효과

[FONT]
콘텐츠의 목적과 분위기에 가장 어울리는 Google Fonts 한국어 폰트를 자동으로 선택하세요.
제목과 본문에 서로 다른 폰트를 쓸 수 있습니다.
단, 한국어 텍스트가 깨지거나 읽기 어려울 바에는 깔끔한 고딕체(sans-serif)를 기본으로 사용하세요.
가독성 > 디자인. 예쁘지만 읽을 수 없는 폰트보다 평범하지만 또렷한 폰트가 낫습니다.`;

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
[PRIORITY] Text readability > visual aesthetics. Mobile-first. Korean medical ad law compliant.
[FONT] 콘텐츠 분위기에 맞는 Google Fonts 한국어 폰트를 자동 선택. 한국어가 깨질 바에는 깔끔한 고딕체(sans-serif) 기본 사용. 가독성 > 디자인.`;

const CARD_FRAME_RULE = `[LAYOUT RULES]
- NO colored borders, frames, or outlines around the edges
- Fill the entire image area edge-to-edge with content
- Rounded corners on the overall image only
- Clean minimal design, no decorative borders`;

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
  const hasRefImage = !!body.referenceImage;

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

  // 참조 이미지 스타일 복제 지시
  const refImageRule = hasRefImage ? `
🔒 [STYLE CONSISTENCY — CRITICAL]
A reference image is attached. You MUST replicate its exact style:
- SAME background color, gradient direction, and color palette
- SAME layout structure (text position: top/center/bottom)
- SAME illustration style (3D render / flat / watercolor / photo)
- SAME decorative elements (flowers, icons, shapes) in similar positions
- SAME text styling (font weight, color, size ratio between title/subtitle)
- SAME overall composition and whitespace ratio
- ONLY change the text content and specific illustration subject
- The card must look like it belongs to the SAME series as the reference` : '';

  const hasText = subtitle || mainTitle;

  if (hasText) {
    return `${CARD_NEWS_PERSONA}
${refImageRule}

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
${refImageRule}

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
- The image must work as a blog body illustration that contains NO information text

[AI ARTIFACT PREVENTION — CRITICAL]
- NO perfectly symmetrical faces or poses
- NO unnaturally smooth/porcelain skin
- NO unrealistic perfect teeth or hair
- NO studio-perfect lighting without any shadows
- NO empty/blank backgrounds — always include environmental context
- NO stock photo poses (thumbs up, pointing, crossed arms with smile)
- ADD subtle imperfections: natural skin texture, slight asymmetry, environmental clutter
- ADD realistic lighting: directional light source, natural shadows, ambient occlusion
- The image should be indistinguishable from a real photograph taken in a Korean medical clinic

[KOREAN MEDICAL CLINIC AUTHENTICITY]
- The setting MUST look like a real Korean hospital/clinic (한국 병원)
- Korean-style interior: clean white walls, wood accents, modern minimalist design
- Medical staff: Korean-style white coats (not American hospital scrubs)
- Waiting room: comfortable modern chairs, reception desk
- Equipment: modern but not futuristic-looking
- Lighting: fluorescent ceiling lights mixed with warm accent lighting

[COMPOSITION RULES]
- Rule of thirds composition
- Leave breathing room around subjects (not too tightly cropped)
- Include foreground/midground/background depth
- Avoid dead center subject placement
- Natural eye-level or slightly elevated camera angle

[CAMERA POV — CRITICAL FOR MIRROR/REFLECTION SCENES]
- Mirror scenes: Camera MUST be positioned BEHIND or BESIDE the subject
  - Show the subject's back/side + their face reflected in the mirror
  - NEVER shoot from the front with the mirror facing the camera
- Consultation scenes: Camera at slight angle (30-45 degrees), not dead-on frontal
- Treatment scenes: Camera at patient's eye level or slightly above
- AVOID: Subjects looking directly at camera (breaks editorial/documentary feel)`;

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
        `⛔ ABSOLUTE TEXT RULES:
- ONLY render Korean text that appears in "quotes" in the prompt above. Do NOT invent any Korean text.
- NEVER render placeholder contact info (02-000-0000, www.hospital.com, etc.)
- NEVER render garbled/random Korean (찬당쩡, 맘보행, 양모가능 = WRONG)
- NEVER render fake operating hours, fake addresses, or fake info the user didn't provide
- If no contact info was given, leave that area COMPLETELY EMPTY or omit it
- Do NOT render instruction labels like "[MAIN TITLE]", "날짜:", "제목:"`,
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
