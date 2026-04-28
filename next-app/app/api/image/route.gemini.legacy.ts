/**
 * /api/image — Gemini 이미지 생성 프록시
 *
 * gemini-2.0-flash-exp 모델로 이미지 생성.
 * responseModalities: ["IMAGE", "TEXT"] 사용.
 */
import { NextRequest, NextResponse } from 'next/server';
import { devLog } from '../../../lib/devLog';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── 멀티키 로테이션 (gemini route와 동일) ──

function getKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
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

const DESIGNER_PERSONA = `[DESIGNER IDENTITY]
You are a premium Korean hospital marketing designer.
Every image must look like a ₩500,000+ professional agency deliverable.

[CORE PRINCIPLES]
- Apple-level clean design meets Korean medical professionalism
- Information hierarchy: title (biggest) > key data > supporting details > footer
- Surfaces: subtle shadows, rounded corners, elegant gradients
- Korean text: crystal clear rendering. If text might be garbled, use fewer/shorter words.
- DO NOT render CSS specs, design tokens, or technical notes as visible text`;

const DESIGN_RULE = `[디자인 규칙 — 프리미엄 품질 필수]
1. 사용자가 지정한 색상, 레이아웃, 분위기를 정확히 따르되, 항상 고급스럽게 표현하세요.
2. 한국어 텍스트를 크고 선명하게 렌더링하세요. 최소 14pt, 제목은 28pt 이상.
3. 여백을 넉넉하게 쓰세요 — 빽빽한 디자인은 금지. 요소 간 충분한 간격을 두세요.
4. 색상은 최대 3색. 세련되고 조화로운 팔레트. 원색 대신 톤 다운된 프리미엄 컬러.
5. 그라데이션은 미묘하고 우아하게. 2-3 스톱, 부드러운 전환.
6. 카드/박스는 둥근 모서리와 미세한 그림자로 고급스러운 입체감.
7. 사용자가 제공하지 않은 텍스트(전화번호, URL, 주소, 병원명)를 절대 지어내지 마세요.
8. 휴진/휴무 표시는 지정된 색상으로 모든 해당 날짜에 일관되게 적용.
9. 결과물은 실제 프리미엄 병원 인스타그램에 바로 올릴 수 있는 수준이어야 합니다.
10. 모바일에서 팔 길이 거리에서 모든 텍스트가 읽혀야 합니다.

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
가독성 > 디자인. 예쁘지만 읽을 수 없는 폰트보다 평범하지만 또렷한 폰트가 낫습니다.

[한국어 텍스트 렌더링 — CRITICAL]
한국어 텍스트가 이미지에서 가장 중요한 요소입니다. 텍스트가 깨지면 이미지 전체가 쓸모없어집니다.
- 모든 한국어 글자가 정확히 읽혀야 합니다. 한 글자라도 깨지면 실패.
- 글자 간격(자간)이 균일해야 합니다. 글자가 겹치거나 너무 벌어지면 안 됩니다.
- 받침이 있는 글자(강, 봄, 든)가 특히 깨지기 쉬우니 주의하세요.
- 텍스트가 정확하지 않을 바에는 텍스트를 줄이세요. 긴 문장보다 짧은 키워드가 안전합니다.
- 제목은 최대 10자, 부제는 최대 20자를 권장합니다. 길수록 깨질 확률이 높아집니다.`;

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
Before generating each card, mentally recall the reference image and answer:
- What is the EXACT background color/gradient? → Use the same.
- Where is the title text positioned? → Put it in the same spot.
- What illustration style was used? → Use the same style.
- What decorative elements exist? → Replicate them.
If you cannot answer these questions, look at the reference image again.
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
⛔ 금지: 3D render, illustration, cartoon, anime, vector, clay`;

  if (imageStyle === 'medical') return `[STYLE - 의학 3D (MEDICAL 3D RENDER)]
- medical 3D illustration, anatomical render, scientific visualization
- clinical lighting, x-ray style glow, translucent organs
- 인체 해부학, 장기 단면도, 뼈/근육/혈관 구조
⛔ 금지: cute cartoon, photorealistic human face`;

  if (imageStyle === 'infographic') return `[STYLE - 플랫 아이콘/벡터 (FLAT VECTOR)]
- flat 2D vector icon style, solid fill colors, no gradients, no shadows
- geometric shapes only, clean line art, single color background
- simple and bold, like a mobile app icon or emoji
- 밝고 깨끗한 단색 배경, 심플한 도형 기반 의료 아이콘
QUALITY REFERENCE: Think Google Material Icons or Apple SF Symbols — minimal, clean, geometric.
⛔ 금지: 3D render, realistic photo, illustration with shadows, gradients, complex textures`;

  if (imageStyle === 'custom') return ''; // 사용자 지정 스타일 — 추가 규칙 없음

  // default: illustration
  return `[STYLE - 3D 일러스트 (3D ILLUSTRATION)]
- 3D rendered illustration, Blender/Cinema4D style, soft 3D render
- soft studio lighting, ambient occlusion, gentle shadows
- clean matte 3D surfaces with subtle texture, rounded edges
- 밝은 파스텔 톤, 파란색/흰색/연한 색상 팔레트
- cute stylized characters, friendly expressions
QUALITY REFERENCE: Think 카카오프렌즈/LINE Friends level 3D quality — smooth, polished, professional. NOT cheap mobile game ad or low-poly 3D.
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
🔒 [STYLE LOCK — ZERO DEVIATION ALLOWED]
A reference image is attached. You MUST clone its design system exactly:
CLONE these from the reference:
✅ Background: exact same color values, gradient angle, gradient stops
✅ Text zones: exact same Y-position for subtitle, mainTitle, description
✅ Font: exact same weight, exact same color, exact same relative size
✅ Padding: exact same distance from edges
✅ Decorative elements: exact same style, position, size, opacity
✅ Card shape: exact same rounded corners, shadows, inner frame
CHANGE only:
✅ The actual text words (subtitle, mainTitle, description)
✅ The illustration subject (keep same style, size, position)
The viewer should tell these cards are from the SAME series at a glance.` : '';

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
  imageStyle?: 'photo' | 'illustration' | 'medical' | 'custom';
  customImagePrompt?: string; // imageStyle='custom'일 때 사용자 스타일 지시문
  logoInstruction?: string;
  hospitalInfo?: string;
  brandColors?: string;
  logoBase64?: string;
  calendarImage?: string;
  referenceImage?: string;   // card_news: 참고 이미지 base64
}

export async function POST(request: NextRequest) {
  // 내부용: 게스트 제한 없음

  const keys = getKeys();
  if (keys.length === 0) {
    console.error('[api/image] GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'configuration_error' }, { status: 500 });
  }
  // race-condition 방지: 모듈 레벨 keyIndex 제거, 요청마다 random start
  let keyIndex = Math.floor(Math.random() * keys.length);

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

  const BLOG_IMAGE_RULE = `[BLOG ILLUSTRATION — STRICT RULES]
You are generating a blog body illustration. NOT a poster, flyer, ad, or infographic.

ABSOLUTE PROHIBITIONS:
- NO text, letters, words, labels, logos, watermarks, signage, phone numbers, URLs
- NO poster/infographic/card news layout — pure visual illustration only

[AI ARTIFACT PREVENTION]
- NO symmetrical faces/poses, unnaturally smooth skin, unrealistic perfect teeth
- NO studio-perfect lighting without shadows, empty backgrounds, stock photo poses
- ADD natural imperfections: skin texture, slight asymmetry, environmental details
- ADD realistic lighting: directional source, natural shadows, ambient occlusion

[KOREAN MEDICAL CLINIC SETTING]
- Real Korean hospital/clinic interior: clean white walls, wood accents, modern minimalist
- Korean-style white coats (not American scrubs), modern equipment, warm accent lighting

[COMPOSITION]
- Rule of thirds, breathing room around subjects, foreground/midground/background depth
- Natural eye-level or slightly elevated angle, no dead center placement`;

  // Blog 모드 스타일별 instruction (UI 의 imageStyle 선택 → 실제 생성에 반영)
  const BLOG_STYLE_INSTRUCTIONS: Record<'photo' | 'illustration' | 'medical' | 'custom', string> = {
    photo: 'DSLR-grade realistic photograph, Korean clinic interior, natural warm lighting, professional medical environment, photojournalism style.',
    illustration: 'Soft pastel 3D illustration, semi-realistic, friendly approachable tone, smooth gradients.',
    medical: 'Anatomical illustration, clinical precision, scientific accuracy, soft medical lighting.',
    custom: '',
  };
  const blogStyle = body.imageStyle && ['photo', 'illustration', 'medical', 'custom'].includes(body.imageStyle)
    ? body.imageStyle as 'photo' | 'illustration' | 'medical' | 'custom'
    : 'photo';
  const blogStyleInstruction = blogStyle === 'custom'
    ? (body.customImagePrompt?.trim() || BLOG_STYLE_INSTRUCTIONS.photo)
    : BLOG_STYLE_INSTRUCTIONS[blogStyle];

  const fullPrompt = isCardNewsMode
    ? buildCardNewsPromptFull(body)
    : isBlogMode
    ? [
        BLOG_IMAGE_RULE,
        `[STYLE] ${blogStyleInstruction}`,
        body.prompt.trim(),
        getAspectInstructionEn(aspectRatio),
        'Generate at high resolution. Sharp edges, no blur, no compression artifacts.',
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
        aspectInstruction,
        'Generate at high resolution. Sharp edges, crisp text, no blur, no compression artifacts.',
        `⛔ TEXT SAFETY:
- ONLY render Korean text that appears in "quotes" in the prompt. Do NOT invent text.
- NEVER render placeholder contact info, garbled Korean, or fake information.
- Do NOT render instruction labels like "[MAIN TITLE]", "날짜:", "제목:". If no info given, leave empty.`,
      ].filter(Boolean).join('\n\n');
    })()

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

  // ═══ 카드뉴스 2단계 생성: Flash(밑그림) → Pro(글씨) ═══
  if (isCardNewsMode) {
    const illustrationPrompt = buildCardNewsIllustrationPrompt(body);
    const textOverlayPrompt = buildCardNewsTextOverlayPrompt(body);
    const hasTextToRender = !!textOverlayPrompt;

    // ── Stage 1: Flash로 일러스트 생성 ──
    const stage1Parts: Array<Record<string, unknown>> = [{ text: illustrationPrompt }];
    if (body.referenceImage) {
      const refMatch = body.referenceImage.match(/^data:(image\/\w+);base64,(.+)$/);
      if (refMatch) stage1Parts.push({ inlineData: { mimeType: refMatch[1], data: refMatch[2] } });
    }

    const FLASH_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];
    let stage1Image: { mimeType: string; data: string } | null = null;

    for (const model of FLASH_MODELS) {
      for (let ki = 0; ki < keys.length; ki++) {
        const keyIdx = (keyIndex + ki) % keys.length;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': keys[keyIdx],
            },
            body: JSON.stringify({ contents: [{ role: 'user', parts: stage1Parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.6 } }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) { const s = response.status; if (s === 429 || s === 503) { await new Promise(r => setTimeout(r, 1500)); continue; } if (s === 400 || s === 404) break; continue; }
          keyIndex = (keyIdx + 1) % keys.length;
          const data = await response.json();
          const imgPart = (data?.candidates?.[0]?.content?.parts || []).find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
          if (imgPart?.inlineData) { stage1Image = { mimeType: imgPart.inlineData.mimeType || 'image/png', data: imgPart.inlineData.data }; break; }
        } catch (err: unknown) { clearTimeout(timeoutId); if ((err as Error).name === 'AbortError') break; await new Promise(r => setTimeout(r, 1500)); continue; }
      }
      if (stage1Image) break;
    }

    if (!stage1Image) {
      devLog('[card_news] Stage 1 (Flash) failed, falling back to single-stage Pro');
    } else if (!hasTextToRender) {
      return NextResponse.json({ imageDataUrl: `data:${stage1Image.mimeType};base64,${stage1Image.data}`, mimeType: stage1Image.mimeType, model: 'flash(illustration)' });
    } else {
      // ── Stage 2: Pro로 텍스트 오버레이 ──
      const stage2Parts: Array<Record<string, unknown>> = [
        { text: textOverlayPrompt },
        { inlineData: { mimeType: stage1Image.mimeType, data: stage1Image.data } },
      ];
      const PRO_MODELS = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview'];

      for (const model of PRO_MODELS) {
        for (let ki = 0; ki < keys.length; ki++) {
          const keyIdx = (keyIndex + ki) % keys.length;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000);
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': keys[keyIdx],
              },
              body: JSON.stringify({ contents: [{ role: 'user', parts: stage2Parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.4 } }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) { const s = response.status; if (s === 429 || s === 503) { await new Promise(r => setTimeout(r, 1500)); continue; } if (s === 400 || s === 404) break; continue; }
            keyIndex = (keyIdx + 1) % keys.length;
            const data = await response.json();
            const imgPart = (data?.candidates?.[0]?.content?.parts || []).find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
            if (imgPart?.inlineData) {
              return NextResponse.json({ imageDataUrl: `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`, mimeType: imgPart.inlineData.mimeType || 'image/png', model: `flash(illustration)+${model}(text)` });
            }
          } catch (err: unknown) { clearTimeout(timeoutId); if ((err as Error).name === 'AbortError') break; await new Promise(r => setTimeout(r, 1500)); continue; }
        }
      }

      devLog('[card_news] Stage 2 (Pro text) failed, returning Stage 1 image without text');
      return NextResponse.json({ imageDataUrl: `data:${stage1Image.mimeType};base64,${stage1Image.data}`, mimeType: stage1Image.mimeType, model: 'flash(illustration-only)' });
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
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': keys[keyIdx],
          },
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

  console.error(`[api/image] all models failed: ${lastError}`);
  return NextResponse.json({ error: 'image_generation_failed' }, { status: 502 });
}
