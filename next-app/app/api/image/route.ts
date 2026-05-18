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
 * next-app 은 internal admin 도구. POST 핸들러는 checkAuth (Bearer/cookie) 로 보호 —
 * 대시보드 인증 가드는 client route 보호일 뿐 API endpoint 직접 curl 차단 X (audit Q-1).
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkAuth } from '../../../lib/apiAuth';
import { resolveImageOwner } from '../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../lib/creditService';
import { verifyAdminCookie } from '../../../lib/adminCookie';

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
  mode?: 'blog' | 'default';
  logoInstruction?: string;
  hospitalInfo?: string;
  brandColors?: string;
  logoBase64?: string;
  calendarImage?: string;
  referenceImage?: string;
  quality?: 'fast' | 'premium';
}

// ── 비임상 행동 감지 + 임상 구문 strip (옵션 A) ────────────────────────
// 배경: blog-core/buildImagePrompt 가 categoryHints("dental clinic setting...")
// 와 SCENE_VARIANTS("examination chair, modern clinic interior" 등) 를 prefix·
// suffix 로 baked in 해서 body.prompt 가 도착함. 행동이 비임상(양치·식사 등)
// 이어도 임상 묘사가 같이 들어와서 모델이 "진료의자에서 죽 먹는" 부조리 생성.
// HARD OVERRIDE 만으로는 모델 해석 의존이라 case 누수.
// 여기선 비임상 행동 키워드를 감지해 body.prompt 의 임상 segment 를 deterministic
// 으로 strip. 모델 도달 전에 contradictions 자체를 제거.
//
// 트레이드오프: 정규식 동기화 비용. blog-core 의 SCENE_VARIANTS·categoryHints 가
// 변하면 CLINICAL_SEGMENT_PATTERN 도 같이 봐야 함. 시니어 결정으로 옵션 C
// (blog-core 직접 수정) 채택 시 본 strip 은 자연스럽게 deprecate 가능.

const NON_CLINICAL_ACTION_PATTERNS: ReadonlyArray<RegExp> = [
  /brush(?:ing)?\s+teeth|toothbrush|양치|치솔질|칫솔질/i,
  /\bfloss(?:ing)?\b|치실/i,
  /interdental|치간\s*칫솔/i,
  /mouthwash|가글|구강\s*세정/i,
  /\beating\b|식사|먹는|먹기|식단|음식\s*섭취|섭취/i,
  /\bdrinking\b|음용|마시는|마시기|hydration/i,
  /skincare\s+routine|applying\s+skincare|스킨케어\s*루틴|세안|cleansing\s+routine/i,
  /\bwalking\b|산책/i,
  /\b(?:exercise|stretching|workout)\b|운동|스트레칭|재활\s*동작/i,
  /\bsleep(?:ing)?\b|수면|잠/i,
  /medication|복용|약\s*(?:먹|복용)/i,
];

// segment(쉼표 구분) 단위로 매칭. 단일 segment 안에 임상 keyword 가 있으면 그
// segment 전체 제거. alt 텍스트는 별도 segment 라 보존됨.
const CLINICAL_SEGMENT_PATTERN: RegExp = /\b(?:clinic|dental\s+(?:office|tools?|scan|procedure|chair)|examination\s+(?:chair|area|environment|setting|room)|operatory|consultation\s+(?:environment|setting|room)|treatment\s+(?:environment|chair|setting|room)|reception\s+desk|X-ray\s+imaging|dentist\s+(?:explaining|focused)|patient\s+(?:consultation|receiving\s+treatment|context)|medical\s+clinic\s+interior)\b/i;

function isNonClinicalAction(prompt: string): boolean {
  return NON_CLINICAL_ACTION_PATTERNS.some(p => p.test(prompt));
}

function stripClinicalSegments(prompt: string): string {
  return prompt
    .split(',')
    .map(s => s.trim())
    .filter(seg => seg.length > 0 && !CLINICAL_SEGMENT_PATTERN.test(seg))
    .join(', ');
}

export async function POST(request: NextRequest) {
  // 인증 가드 — Bearer/admin cookie 없으면 401. 익명 OpenAI 호출 차단 (audit Q-1).
  const auth = await checkAuth(request);
  if (auth) return auth;

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

  // 1 user action = 1 credit (audit Q-2a). validation 후 차감 — 잘못된 body 로 차감 방지.
  // OpenAI 호출 전체 실패 시 (line ~640 의 502 분기) refund.
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;
  // 🛑 INVARIANT §2 — next-app admin (admin_session cookie) 은 크레딧 무관 무제한.
  const isAdmin = verifyAdminCookie(request).valid;
  let creditDeducted = false;
  if (userId && !isAdmin) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json(
        { error: 'insufficient_credits', remaining: credit.remaining },
        { status: 402 },
      );
    }
    creditDeducted = true;
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

  const BLOG_IMAGE_RULE = `[BLOG ILLUSTRATION]
Pure visual illustration for a blog body image — never a poster, flyer, infographic, or card news layout.
ONE single cohesive scene only. NEVER a collage, grid, mosaic, diptych, triptych, quadrant layout, split frame, picture-in-picture, before/after side-by-side, or any composition that combines multiple separate sub-images into one frame.

[FORBIDDEN]
- Any text, letters, words, labels, logos, watermarks, phone numbers, URLs in the image
- Poster / infographic / card-news layout
- Collage / photo grid / 2x2 or 3x3 layout / split panels / multiple framed sub-images / mosaic
- Side-by-side comparison frames, before/after split, picture-in-picture insets
- Visible internal borders, frames, dividers, gutters, or seams that segment the image
- Staged studio shoots, isolated subjects on white background, product-catalog look

[SCENE NATURE]
- Pick ONE natural location and ONE clear human action; show the moment as it would actually happen in real life
- One subject (or one small group sharing the same activity), behaving naturally — not posing for the camera
- The location MUST match where this action actually happens — never default to a clinic just because the topic is medical

[LOCATION — pick ONE that fits the action]
- Clinical procedure (examination, treatment, consultation, X-ray, surgery, scaling, dentist explaining a model): Korean clinic interior — clean white walls, wood accents, modern minimalist operatory or consultation room, Korean-style white coats, modern equipment
- Daily oral/skin/health care at home (brushing teeth, flossing, interdental brush, mouthwash, applying skincare, taking medication, checking face in a mirror): Korean residential bathroom with sink and wall mirror, or warmly lit home interior — NOT inside a clinic
- Eating, drinking, recovery meal, hydration: Korean home dining table or kitchen — NOT a clinic break room
- Exercise, stretching, rehab movement: park path, living-room floor, or home gym — NOT on a treatment table
- General wellbeing / lifestyle (walking, reading, working, smiling outdoors): Korean cafe, park, street, or home — civilian everyday setting

[CULTURAL ANCHORING]
- Korean subject (adult or older adult as fits the topic), natural Korean styling and grooming
- Warm approachable atmosphere, soft directional lighting

[COMPOSITION]
- Rule of thirds, breathing room around subjects, foreground/midground/background depth
- Natural eye-level or slightly elevated angle, no dead-center placement
- Directional natural lighting with soft shadows
- Single unified composition with one continuous background — never partition the canvas`;

  // body.prompt 는 buildImagePrompt(blog-core) 에서 "dental clinic setting, modern
  // minimalist Korean dental office" 같은 categoryHint 가 prefix 로 붙어 들어옴.
  // 비임상 행동(양치·식사 등) 인 경우 임상 segment 를 모델 도달 전에 deterministic
  // 으로 제거. HARD OVERRIDE 는 보조적 보강.
  let processedPrompt = body.prompt.trim();
  if (isBlogMode && isNonClinicalAction(processedPrompt)) {
    const before = processedPrompt;
    processedPrompt = stripClinicalSegments(before);
    if (!processedPrompt) {
      // 모든 segment 가 임상으로 분류되어 빈 문자열이 되면 원본 유지(false-positive 방어)
      processedPrompt = before;
      console.warn('[BLOG_IMAGE] non-clinical strip 결과 빈 문자열 — 원본 유지');
    } else if (processedPrompt !== before) {
      console.info(`[BLOG_IMAGE] 비임상 행동 감지 → 임상 segment strip (${before.length}→${processedPrompt.length} chars)`);
    }
  }

  const BLOG_HARD_OVERRIDE = `[HARD OVERRIDE — applies last, wins all earlier conflicts]
The location MUST be chosen from the action above, NOT from the medical topic.
- If the action is eating, drinking, recovery meal: the setting is a Korean home dining table or kitchen with home tableware. NEVER a clinic, NEVER a treatment chair, NEVER medical instruments visible.
- If the action is brushing teeth, flossing, using an interdental brush, mouthwash, skincare, or any daily self-care: the setting is a Korean home bathroom with a sink and wall mirror, or a warmly lit home interior. NEVER a clinic chair, NEVER a dental operatory.
- Only when the action is an actual clinical procedure (treatment, examination, consultation, X-ray, scaling, dentist holding tools or a model) does a clinic interior apply.
If any earlier line in this prompt suggested "clinic setting" or "dental office" but the action is non-clinical per the rule above, IGNORE that earlier line and use the home/civilian setting that matches the action. Do NOT show clinic equipment, dental chairs, monitors, instruments, or trays in non-clinical scenes.

[GAZE COHERENCE — when two or more people are in frame]
All people in the scene must have coherent, natural gazes. NO unfocused or empty stares into space.
- Doctor + patient consultation: BOTH look at the same focal object (the X-ray monitor, the dental model, the chart, the treatment area), OR they make direct eye contact during conversation. NEVER one person pointing at the screen while the other stares blankly off to the side.
- If a doctor is explaining or pointing at a screen/model, the patient is actively looking at the same screen/model with an attentive, slightly leaned-in posture.
- If a doctor and patient are in dialogue, both faces angle toward each other with eye contact.
- Avoid the specific failure mode of "doctor points at monitor, patient looks past the camera into empty space" — this looks unnatural and disengaged.
- A single person alone may look at the camera, an object, or thoughtfully aside — that is fine. The coherence rule applies only when 2+ people share the frame.`;

  const fullPrompt = isBlogMode
    ? [
        BLOG_IMAGE_RULE,
        processedPrompt,
        BLOG_HARD_OVERRIDE,
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
  // 'medium' 복원 (audit 후속 hotfix). 'low' 의 다양성 부족 회귀 차단 —
  // 비슷 prompt 가 거의 같은 결과로 수렴해 슬롯 중복 발생.
  // 비용: $0.011 → $0.042/장 (~4배). premium → quality='high' 추가 복원은 사용자 결정.
  const qualityStr: 'low' | 'medium' | 'high' | 'auto' = 'medium';

  // ── 첨부 이미지 (referenceImage / logoBase64 / calendarImage) → prompt 텍스트 힌트로 변환 ──
  // gpt-image-2 의 images.edit 는 2026-04-27 부터 SDK v6.34 에서 model validation 으로 거부됨
  // (openai-node 이슈 #1844). 현재는 generate 단일 호출 + 텍스트 힌트로 우회.
  // OpenAI 가 픽스하면 OPENAI_IMAGE_EDIT_ENABLED=1 환경변수 + edit 분기 활성화 가능 (TODO).
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

  // ── OpenAI 호출 + 멀티키 로테이션 ──
  // 🛑 INVARIANT — per-key timeout = 120_000 ms. 절대 줄이지 말 것.
  //    docs/INVARIANTS.md §1 참조. PR #47 에서 60s 로 줄였다 prod 502 회귀 → PR #163 복구.
  //    gpt-image-2 정상 추론이 60s 를 자주 초과. 120s × 2 + waits ≤ 245s, maxDuration=300 안 안전.
  const MAX_KEY_ATTEMPTS = Math.min(keys.length, 2);
  let lastError = '';
  for (let ki = 0; ki < MAX_KEY_ATTEMPTS; ki++) {
    const keyIdx = (keyIndex + ki) % keys.length;
    const openai = new OpenAI({ apiKey: keys[keyIdx], timeout: 120_000 }); // 🛑 INVARIANT: docs/INVARIANTS.md §1

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

  // 모든 키 실패 — 차감 환불 (audit Q-2a). refund 실패는 swallow.
  if (creditDeducted && userId) {
    const refund = await refundCredit(userId).catch(() => null);
    if (refund?.success) {
      console.log(`[image] refunded 1 credit for ${userId} (remaining=${refund.remaining})`);
    }
  }

  return NextResponse.json(
    { error: `이미지 생성 실패 (모든 OpenAI 키 시도 실패)`, details: lastError },
    { status: 502 },
  );
}
