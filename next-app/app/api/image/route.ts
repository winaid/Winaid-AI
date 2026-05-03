/**
 * /api/image — OpenAI gpt-image-2 이미지 생성 프록시 (next-app, 내부 운영용)
 *
 * 모델: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2' (스냅샷 핀 가능: 'gpt-image-2-2026-04-21')
 * 응답: { imageDataUrl: data URL, mimeType: 'image/png', model } — 호출부 호환 위해 shape 고정.
 *
 * referenceImage / logoBase64 / calendarImage 첨부는 현재 generate 텍스트 힌트로 변환 —
 * openai-node 이슈 #1844 로 images.edit 가 gpt-image-2 거부 중. 픽스되면
 * OPENAI_IMAGE_EDIT_ENABLED=1 로 활성화 가능 (TODO 분기 마련됨).
 *
 * next-app 은 internal admin 도구라 게스트 IP rate limit 미적용 (대시보드 자체에 인증 가드).
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── 멀티키 로테이션 ──
// Gemini 키는 보존 (route.gemini.ts.bak 에서 사용. 활성 경로는 OpenAI).

function getKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

function getOpenAIKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'OPENAI_API_KEY' : `OPENAI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

let keyIndex = 0;

// ── aspect ratio → gpt-image-2 size 문자열 ──
// gpt-image-2 는 size 변이 16 의 배수, 최대 변 3840px, 2K(2560x1440) 이내 안정 권장.
// 사용자 매핑 + 16 배수 보정 ('3:4' / '4:3' 의 1366 → 1376).
function aspectRatioToSize(ratio: AspectRatio): string {
  switch (ratio) {
    case '1:1': return '1024x1024';
    case '16:9': return '1536x1024';
    case '9:16': return '1024x1536';
    case '4:5': return '1024x1280';
    case '3:4': return '1024x1376';
    case '4:3': return '1376x1024';
    case 'A4': return '1024x1456';
    case 'auto': return 'auto';
    default: return '1024x1024';
  }
}

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

function getAspectInstructionEn(ratio: AspectRatio): string {
  switch (ratio) {
    case '1:1': return 'Aspect ratio: square 1:1 (1080x1080).';
    case '16:9': return 'Aspect ratio: landscape 16:9 (1920x1080).';
    case '3:4': return 'Aspect ratio: portrait 3:4 (1080x1440).';
    case '4:5': return 'Aspect ratio: portrait 4:5 (1080x1350).';
    case '9:16': return 'Aspect ratio: vertical 9:16 (1080x1920).';
    case '4:3': return 'Aspect ratio: 4:3.';
    case 'A4': return 'Aspect ratio: A4 portrait (210x297mm). High resolution for print.';
    case 'auto': return 'Choose the best aspect ratio for the content.';
    default: return '';
  }
}

const DESIGNER_PERSONA = `[ROLE] Premium Korean hospital marketing designer.

[CORE STYLE]
- Apple-clean meets Korean medical professionalism. Editorial, aspirational, never generic.
- Information hierarchy: title (largest) > key data > supporting > footer.
- Subtle shadows, rounded corners, refined gradients.
- Render Korean text crystal clear. Keep titles ≤10 chars, subtitles ≤20 chars.`;

const DESIGN_RULE = `[DESIGN RULES]
- Follow user-specified colors/layout/mood; always elevate to premium quality.
- Generous whitespace. Never cramped.
- Max 3 colors. Refined palette over primary colors. Subtle gradients (2-3 stops).
- Cards/boxes: rounded corners + soft shadows for tasteful depth.
- NEVER invent text the user did not provide (phone, URL, address, hospital name).
- Holiday/closed days: apply specified color consistently across all matching dates.
- Output should be ready to post on a premium hospital Instagram account.

[FORBIDDEN]
- Cheap effects: starbursts, explosions, cartoon stickers, clipart, stock-photo feel
- Text below 12pt, mixed fonts, garish primary color combos, cramped layouts
- Watermarks, fake placeholders, instruction labels rendered as visible text`;

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
[GOAL] 1:1 square (1080x1080px) card image. Korean text rendered directly into pixels. Output MUST be exactly square.
[PRIORITY] Text readability > visual aesthetics. Korean medical ad law compliant.
[HOSPITAL NAME] 프롬프트에 명시된 병원명만 사용하세요. 명시되지 않은 병원명, 로고, 브랜드를 절대 지어내지 마세요.
[SERIES CONSISTENCY — MOST IMPORTANT]
This card is part of a multi-slide series. ALL slides MUST look identical except for text content and illustration subject.
EXACT same background, text layout zones, font style/size/color, padding, decorative elements.
Text zones: Top 15% subtitle, Center 40% mainTitle (bold), Bottom 25% description+visual.
[TEXT RENDERING QUALITY]
Every Korean character must be perfectly readable. If any character is garbled, the entire card fails.
Keep titles under 10 characters, subtitles under 20. Shorter text = safer rendering.
[CRITICAL — DESIGN SYSTEM LOCK]
If style cues are described in this prompt (background color, gradient, text positions, illustration style, decorative elements), replicate them EXACTLY across all cards in the series.
Consistency score: If a human cannot instantly tell these cards are from the same series, the generation has FAILED.`;

const CARD_FRAME_RULE = `[LAYOUT RULES]
- Fill the entire canvas area edge-to-edge
- NO colored borders, frames, or outlines around the edges
- Rounded corners on overall image only
- Clean minimal design
- Text must be centered horizontally
- Minimum 40px padding from all edges
- All text must be legible at mobile phone size`;

function buildCardStyleBlock(imageStyle: string): string {
  if (imageStyle === 'photo') return `[STYLE - 실사 촬영 (PHOTOREALISTIC)]
- photorealistic, DSLR, 35mm lens, natural lighting, shallow depth of field, bokeh
- realistic skin texture, real fabric texture, 4K ultra high resolution
- 실제 한국인 인물, 실제 병원/의료 환경
QUALITY REFERENCE: Think Apple product page or Samsung Health app photography — clean, editorial, aspirational. NOT stock photo website or generic hospital brochure.
[FORBIDDEN] 3D render, illustration, cartoon, anime, vector, clay`;

  if (imageStyle === 'medical') return `[STYLE - 의학 3D (MEDICAL 3D RENDER)]
- medical 3D illustration, anatomical render, scientific visualization
- clinical lighting, x-ray style glow, translucent organs
- 인체 해부학, 장기 단면도, 뼈/근육/혈관 구조
[FORBIDDEN] cute cartoon, photorealistic human face`;

  if (imageStyle === 'infographic') return `[STYLE - 플랫 아이콘/벡터 (FLAT VECTOR)]
- flat 2D vector icon style, solid fill colors, no gradients, no shadows
- geometric shapes only, clean line art, single color background
- simple and bold, like a mobile app icon or emoji
- 밝고 깨끗한 단색 배경, 심플한 도형 기반 의료 아이콘
QUALITY REFERENCE: Think Google Material Icons or Apple SF Symbols — minimal, clean, geometric.
[FORBIDDEN] 3D render, realistic photo, illustration with shadows, gradients, complex textures`;

  if (imageStyle === 'custom') return ''; // 사용자 지정 스타일 — 추가 규칙 없음

  // default: illustration
  return `[STYLE - 3D 일러스트 (3D ILLUSTRATION)]
- 3D rendered illustration, Blender/Cinema4D style, soft 3D render
- soft studio lighting, ambient occlusion, gentle shadows
- clean matte 3D surfaces with subtle texture, rounded edges
- 밝은 파스텔 톤, 파란색/흰색/연한 색상 팔레트
- cute stylized characters, friendly expressions
QUALITY REFERENCE: Think 카카오프렌즈/LINE Friends level 3D quality — smooth, polished, professional. NOT cheap mobile game ad or low-poly 3D.
[FORBIDDEN] photorealistic, real photo, DSLR, realistic texture`;
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

  // 참조 이미지 스타일 복제 지시 (현재 generate 모드는 텍스트 힌트로 변환되므로
  // "image attached" 가정을 빼고 prompt 내 style cues 기반으로 복제 지시).
  const refImageRule = hasRefImage ? `
🔒 [STYLE LOCK — ZERO DEVIATION ALLOWED]
This card is part of a series. The reference style is described above.
CLONE these from the reference style: same background color/gradient, same Y-position for subtitle/mainTitle/description, same font weight/color/size, same padding, same decorative elements.
CHANGE only: the actual text words and the illustration subject.
The viewer should instantly tell these cards are from the SAME series.` : '';

  const hasText = subtitle || mainTitle;

  if (hasText) {
    return `${CARD_NEWS_PERSONA}
${refImageRule}

🚨 RENDER THIS EXACT KOREAN TEXT IN THE IMAGE:
MAIN TITLE (big, bold, center): "${mainTitle}"
SUBTITLE (small, above title): "${subtitle}"
${description ? `DESCRIPTION (small, below title): "${description}"` : ''}

${visual ? `ILLUSTRATION: "${visual}" — draw exactly this!` : ''}

Background: ${bgColor} gradient.
${CARD_FRAME_RULE}
${styleBlock}

Text: subtitle(small) → mainTitle(LARGE) → description(small). Clean readable Korean font.
${templateBlock}
⛔ No hashtags, watermarks, logos, placeholder text.`.trim();
  }

  return `${CARD_NEWS_PERSONA}
${refImageRule}

${CARD_FRAME_RULE}
${styleBlock}

[CONTENT TO RENDER]
${body.prompt}

Background: ${bgColor} gradient. Clean readable Korean font.
⛔ No hashtags, watermarks, logos. Do NOT render instruction labels.`.trim();
}

/** Stage 1: Flash용 — 일러스트/배경만 (텍스트 없이) */
function buildCardNewsIllustrationPrompt(body: ImageRequestBody): string {
  const style = body.imageStyle || 'illustration';
  const styleBlock = buildCardStyleBlock(style);
  const hasRefImage = !!body.referenceImage;

  const visualMatch = body.prompt.match(/비주얼:\s*([^\n]+)/i);
  const visual = visualMatch?.[1]?.trim() || '';
  const bgMatch = body.prompt.match(/배경색:\s*(#[A-Fa-f0-9]{3,6})/i);
  const bgColor = bgMatch?.[1] || '#E8F4FD';
  const tmplMatch = body.prompt.match(/\[디자인 템플릿:[^\]]*\][\s\S]*/m);
  const templateBlock = tmplMatch?.[0] || '';

  const refImageRule = hasRefImage ? `
🔒 [STYLE CLONE] A reference image is attached.
Clone its EXACT design: same background color/gradient, same illustration style, same layout, same decorative elements.
Change ONLY the illustration subject.` : '';

  return `[ROLE] Korean medical card news BACKGROUND DESIGNER.
[GOAL] 1:1 square (1080x1080px) card background image.
[CRITICAL] Generate ONLY the background and illustration. DO NOT render ANY text, letters, words, or characters.

${refImageRule}

🚫 ABSOLUTE RULE: ZERO TEXT IN THIS IMAGE
- No Korean text, no English text, no numbers, no letters
- No title, no subtitle, no description, no labels
- No watermarks, no logos, no brand names
- The image must be PURE VISUAL — illustration and background ONLY

[LAYOUT ZONES — leave space for text overlay later]
- Top 15%: clean background (subtitle will be added later)
- Center 30%: clean background (main title will be added later)
- Bottom 40%: illustration/visual element here
- Bottom 15%: clean background (description will be added later)

${visual ? `[ILLUSTRATION] ${visual}` : ''}
[BACKGROUND] ${bgColor} gradient, clean and minimal
${CARD_FRAME_RULE}
${styleBlock}
${templateBlock}

Generate a beautiful card background. NO TEXT WHATSOEVER.`.trim();
}

/** Stage 2: Pro용 — 기존 이미지 위에 한글 텍스트만 추가 */
function buildCardNewsTextOverlayPrompt(body: ImageRequestBody): string {
  const parseField = (text: string, key: string): string => {
    const match = text.match(new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i'))
      || text.match(new RegExp(`${key}:\\s*([^\\n,]+)`, 'i'));
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
  };

  const subtitle = parseField(body.prompt, 'subtitle');
  const mainTitle = parseField(body.prompt, 'mainTitle');
  const description = parseField(body.prompt, 'description');

  if (!subtitle && !mainTitle) return '';

  return `[ROLE] Korean typography specialist. You add text to existing images.
[GOAL] Take the attached image and add ONLY Korean text. Do NOT change the background, illustration, or any visual element.

🔒 [IMAGE PRESERVATION — MOST IMPORTANT]
The attached image is the final background. You MUST keep it EXACTLY as is:
- Same background color, gradient, illustration
- Same layout, decorative elements, everything
- ONLY ADD text on top. Nothing else changes.

🚨 [RENDER THIS EXACT KOREAN TEXT]
${subtitle ? `SUBTITLE (small, top area, 14-16pt): "${subtitle}"` : ''}
MAIN TITLE (large, bold, center area, 28-36pt): "${mainTitle}"
${description ? `DESCRIPTION (small, below title, 12-14pt): "${description}"` : ''}

[TEXT STYLE]
- Clean, modern Korean sans-serif font
- Title: bold, dark color (#1A1A1A or white depending on background)
- Subtitle: lighter weight, slightly muted color
- Description: small, muted color
- All text horizontally centered
- Ensure maximum readability against the background

[QUALITY]
- Every Korean character MUST be perfectly readable
- If any character might be garbled, use fewer/shorter words
- Text must be crisp and sharp, not blurry

⛔ Do NOT add new visual elements, decorations, or change the background in any way.
⛔ Do NOT add hashtags, watermarks, or placeholder text.`.trim();
}

// ── 이미지 카테고리 감지 (default 모드용) ──

function detectImageCategory(prompt: string): string {
  if (/진료.*일정|휴진|달력|캘린더/.test(prompt)) return 'schedule';
  if (/이벤트|할인|프로모션|특가/.test(prompt)) return 'event';
  if (/의사.*소개|전문의.*부임|원장/.test(prompt)) return 'doctor';
  if (/공지|안내|변경|이전/.test(prompt)) return 'notice';
  if (/명절|설날|추석|새해|인사/.test(prompt)) return 'greeting';
  if (/채용|모집|구인/.test(prompt)) return 'hiring';
  if (/주의.*사항|시술.*후|관리/.test(prompt)) return 'caution';
  if (/비급여|가격|수가|비용/.test(prompt)) return 'pricing';
  return 'general';
}

const CATEGORY_DESIGN_HINTS: Record<string, string> = {
  schedule: `[진료일정 디자인 가이드]
- 달력이 메인. 날짜 숫자가 크고 명확하게.
- 휴진일은 빨간색, 단축은 주황, 야간은 파란 배경으로 확실히 구분.
- 정보 전달이 최우선. 장식은 최소화.`,

  event: `[이벤트 디자인 가이드]
- 시선을 끄는 강렬한 제목. 할인율이나 혜택이 가장 크게.
- 기간, 조건이 명확히 읽혀야 함.
- 밝고 활기찬 색감. 단, 의료 신뢰감 유지.`,

  doctor: `[의사소개 디자인 가이드]
- 이름, 전문분야, 주요 경력이 핵심 정보.
- 전문적이고 신뢰감 있는 레이아웃. 차분한 색감.
- 사진 영역과 텍스트 영역이 명확히 분리.`,

  notice: `[공지사항 디자인 가이드]
- 정보 전달 최우선. 깔끔하고 명확하게.
- 변경 사항/날짜가 가장 눈에 띄게.
- 심플한 디자인. 장식 최소.`,

  greeting: `[명절인사 디자인 가이드]
- 따뜻하고 한국적인 분위기. 전통 색감 활용 가능.
- 병원명 + 인사 메시지가 핵심.
- 휴진 기간이 있으면 하단에 명확히 표시.`,

  hiring: `[채용공고 디자인 가이드]
- 모집 직종과 조건이 핵심.
- 전문적이면서도 친근한 톤.
- 지원 방법/연락처 영역 확보.`,

  caution: `[주의사항 디자인 가이드]
- 항목별로 읽기 쉽게 구조화. 번호 또는 아이콘 활용.
- 중요 항목은 색상으로 강조.
- 의료 신뢰감 있는 차분한 디자인.`,

  pricing: `[비급여안내 디자인 가이드]
- 표 형태가 가장 적합. 시술명-가격 깔끔하게.
- 가격 숫자가 크고 명확하게 읽혀야 함.
- "~부터", "상담 후 결정" 같은 범위 표현 허용.`,

  general: '',
};

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
  quality?: 'fast' | 'premium';  // 기본 'fast' — 'premium'이면 2-Stage (card_news만 의미)
}

export async function POST(request: NextRequest) {
  // next-app 은 internal admin (대시보드 인증 가드 의존). guest rate limit 미적용.
  const keys = getOpenAIKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: '[env] OPENAI_API_KEY 누락' },
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
  // size 파라미터로 처리되므로 prompt 자연어 비율 지시는 제거 (중복 방지).
  // getAspectInstruction / getAspectInstructionEn 함수 정의는 롤백 대비 보존.

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

  const BLOG_IMAGE_RULE = `[BLOG ILLUSTRATION]
Pure visual illustration for a blog body image — never a poster, flyer, infographic, or card news layout.

[FORBIDDEN]
- Any text, letters, words, labels, logos, watermarks, phone numbers, URLs in the image
- Poster / infographic / card-news layout

[KOREAN MEDICAL CONTEXT]
- Real Korean hospital or clinic interior: clean white walls, wood accents, modern minimalist
- Korean-style white coats (not American scrubs), modern equipment, warm accent lighting
- Korean patients and staff, warm approachable atmosphere

[COMPOSITION]
- Rule of thirds, breathing room around subjects, foreground/midground/background depth
- Natural eye-level or slightly elevated angle, no dead-center placement
- Directional natural lighting with soft shadows`;

  const fullPrompt = isCardNewsMode
    ? buildCardNewsPromptFull(body)
    : isBlogMode
    ? [
        BLOG_IMAGE_RULE,
        body.prompt.trim(),
      ].filter(Boolean).join('\n\n')
    : (() => {
      const imageCategory = detectImageCategory(body.prompt);
      const categoryHint = CATEGORY_DESIGN_HINTS[imageCategory] || '';
      return [
        DESIGNER_PERSONA,
        DESIGN_RULE,
        categoryHint,
        languageRule,
        calendarInstruction,
        calendarContext,
        body.prompt.trim(),
        body.logoInstruction || '',
        body.hospitalInfo || '',
        body.brandColors || '',
        'Generate at high resolution. Sharp edges, crisp text, no blur, no compression artifacts.',
        `⛔ TEXT SAFETY:
- ONLY render Korean text that appears in "quotes" in the prompt. Do NOT invent text.
- NEVER render placeholder contact info, garbled Korean, or fake information.
- Do NOT render instruction labels like "[MAIN TITLE]", "날짜:", "제목:". If no info given, leave empty.`,
      ].filter(Boolean).join('\n\n');
    })()

  // ── 모델 / 사이즈 / 품질 매핑 ──
  // Default: gpt-image-2 (2026-04-21 출시, organization verification 완료).
  // Snapshot pin 권장: OPENAI_IMAGE_MODEL=gpt-image-2-2026-04-21 (silent 업그레이드 차단).
  const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const sizeStr = aspectRatioToSize(aspectRatio);
  // 시연 안정성 우선 — 'low' 강제 (5-15s/이미지 vs 30-290s).
  // 시연 후 원복 PR 예정 (premium → quality='high' 복원).
  const qualityStr: 'low' | 'medium' | 'high' | 'auto' = 'low';

  // ── 첨부 이미지 (referenceImage / logoBase64 / calendarImage) → prompt 텍스트 힌트로 변환 ──
  // gpt-image-2 의 images.edit 는 2026-04-27 부터 SDK v6.34 에서 model validation 으로 거부됨
  // (openai-node 이슈 #1844). 현재는 generate 단일 호출 + 텍스트 힌트로 우회.
  // OpenAI 가 픽스하면 OPENAI_IMAGE_EDIT_ENABLED=1 환경변수 + edit 분기 활성화 가능 (TODO).
  // (참고: isCardNewsMode/buildCardNewsIllustrationPrompt/buildCardNewsTextOverlayPrompt 함수는
  //  edit 활성화 시 2-Stage 복원용으로 보존.)
  const editEnabled = process.env.OPENAI_IMAGE_EDIT_ENABLED === '1';
  const hasAttachment = !!body.referenceImage || !!body.logoBase64 || !!body.calendarImage;
  let promptForGenerate = fullPrompt;
  if (hasAttachment && !editEnabled) {
    const hints: string[] = [];
    if (body.referenceImage) hints.push('Reference image attached — clone its background, layout zones, font style, and decorative elements per the [STYLE LOCK] / [STYLE CLONE] block above.');
    if (body.logoBase64) hints.push('Hospital logo attached — render the logo subtly in a corner, small and tasteful (do not invent a different logo).');
    if (body.calendarImage) hints.push('Calendar reference image attached — follow the date-weekday placement strictly per the [정확한 달력 데이터] block above.');
    promptForGenerate = `${fullPrompt}\n\n[ATTACHED IMAGE CONTEXT]\n${hints.join('\n')}`;
  }
  // (isCardNewsMode + premium quality 는 quality='high' 로 자동 매핑 — 기존 2-Stage 우회.)

  // ── OpenAI 호출 + 멀티키 로테이션 ──
  // 시연: 키 캐스케이드 캡 — 60s × 2 + waits ≤ 130s. Vercel 300s 한도 절반 이하 유지.
  // (이전: 11키 × 120s = 최악 1320s → 300s 초과로 timeout 발생.)
  const MAX_KEY_ATTEMPTS = Math.min(keys.length, 2);
  let lastError = '';
  for (let ki = 0; ki < MAX_KEY_ATTEMPTS; ki++) {
    const keyIdx = (keyIndex + ki) % keys.length;
    const openai = new OpenAI({ apiKey: keys[keyIdx], timeout: 60_000 });

    try {
      const result = await openai.images.generate({
        model: MODEL,
        prompt: promptForGenerate,
        size: sizeStr as 'auto',
        quality: qualityStr,
        n: 1,
      });

      keyIndex = (keyIdx + 1) % keys.length;
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        lastError = `${MODEL} key${ki}: 응답에 이미지 데이터 없음`;
        continue;
      }

      return NextResponse.json({
        imageDataUrl: `data:image/png;base64,${b64}`,
        mimeType: 'image/png',
        model: MODEL,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; name?: string };
      const status = e.status ?? 0;
      lastError = `${MODEL} key${ki}: ${status} ${(e.message || '').slice(0, 200)}`;
      // 429 / 503 → 다음 키 (rate limit / 서비스 일시 불가)
      if (status === 429 || status === 503) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      // 400 / 401 / 404 → 모든 키 동일 결과 (요청/모델/인증 오류) → 즉시 종료
      if (status === 400 || status === 401 || status === 404) break;
      // 기타 (5xx, 네트워크) → 다음 키
      continue;
    }
  }

  return NextResponse.json(
    { error: `이미지 생성 실패 (모든 OpenAI 키 시도 실패)`, details: lastError },
    { status: 502 },
  );
}
