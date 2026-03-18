/**
 * templateAiEngine — AI 이미지 생성 엔진
 *
 * calendarTemplateService.ts에서 추출.
 * DESIGNER_PERSONA, DESIGN_SYSTEM_V2, generateTemplateWithAI,
 * 카테고리별 텍스트 콘텐츠 빌더, 프롬프트 조립 로직.
 */

import { callGeminiRaw, TIMEOUTS } from '../../../services/geminiClient';
import { isDemoSafeMode } from '../../../services/image/imageOrchestrator';
import { buildCalendarHTML } from '../builders/calendarBuilders';
import {
  buildEventHTML,
  buildDoctorHTML,
  buildNoticeHTML,
  buildGreetingHTML,
  buildHiringHTML,
  buildCautionHTML,
  buildPricingHTML,
} from '../builders/templateBuilders';

export type TemplateApplicationMode = 'strict' | 'inspired';

interface AiTemplateRequest {
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution' | 'pricing';
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
  calendarTheme?: string;
  applicationMode?: TemplateApplicationMode;
}

/** 달력 테마별 AI 스타일 프롬프트 — SVG 템플릿의 실제 디자인 특성을 반영 */
const CALENDAR_THEME_AI_STYLE: Record<string, string> = {
  spring_kids: `[CALENDAR THEME: Spring Kindergarten / 봄 어린이]
MANDATORY VISUAL STYLE:
- Background: soft sky-blue gradient (top #AEE0F5 → bottom #EAF8F0), warm and cheerful
- Top decoration: large GREEN RIBBON BOW (forest green #5D9A3C) crossing the top like a gift wrap
- White oval center area containing the calendar content
- Yellow BUTTERFLY decoration on the right side
- Small STAR-SHAPED FLOWERS (yellow petals #FFD54F, orange center) scattered as accents
- Flower text markers (✿) beside the clinic name
- Green BANNER RIBBON behind the month title (light green #D5E9C0 with darker edges)
- WHITE FLUFFY CLOUDS in the sky area
- Bottom landscape: rolling GREEN HILLS with WOODEN FENCE (brown #8D6E63), round TREES with yellow/orange foliage, small yellow GROUND FLOWERS
- Scalloped green grass edge along the hills
- Calendar header row: dark background with white text for day names
- Sunday dates in pink/red, weekday dates in dark gray
- Events shown with pencil-style dashed underlines
- Overall mood: bright, cheerful, kindergarten-like, spring garden feel
- Color palette: sky blue, forest green, yellow, orange, white, pink
- NO confetti, NO party decorations — this is a nature/garden theme`,

  cherry_blossom: `[CALENDAR THEME: Cherry Blossom Dental / 벚꽃 치과]
MANDATORY VISUAL STYLE:
- Background: soft pink gradient (#FFF0F5 → #FFE4EC), romantic spring feel
- Large CHERRY BLOSSOM PETALS (soft pink ellipses) scattered around edges, overlapping the borders
- Each petal cluster has 5 rounded petals with a darker pink center
- Falling petals effect throughout the design
- Calendar header: pink (#E91E63) background with white text
- Event markers: colored CIRCLE BADGES with event type text inside
- Night events: purple (#8E24AA), Seminar: dark blue (#283593), Closed: pink (#E91E63)
- Month title in elegant serif-style font, dark pink color
- Clinic name in a soft banner above the calendar
- Notices at bottom with small bullet points
- Overall mood: elegant, feminine, soft, romantic spring
- Color palette: pink, soft pink, white, dark rose, touches of purple
- NO cartoon characters — sophisticated floral design`,

  autumn: `[CALENDAR THEME: Autumn Maple / 가을 단풍]
MANDATORY VISUAL STYLE:
- Background: warm cream/beige (#FFF8E7) with FALLING MAPLE LEAVES
- Large detailed MAPLE LEAVES in various autumn colors: deep orange (#D84315), red-brown, golden yellow, burnt sienna
- Leaves scattered around the edges, some overlapping the calendar card
- Calendar sits inside a white rounded CARD with subtle shadow, slight inset from edges
- Warm brown header text for month title
- Subtitle text in warm gray below the title
- Calendar header: warm orange/brown background
- Event markers: golden yellow PILL-SHAPED badges with dark text
- Closed days highlighted with warm accent colors
- Compact 5-week layout (last row may show dual dates like "23/30")
- Bottom area: more maple leaves and a warm gradient fade
- Overall mood: cozy, warm, autumnal, harvest season
- Color palette: orange, brown, golden yellow, cream, deep red
- NO cold colors — everything warm-toned`,

  korean_traditional: `[CALENDAR THEME: Korean Traditional / 한국 전통]
MANDATORY VISUAL STYLE:
- Background: elegant beige/parchment (#F5EDD5) with subtle texture feel
- Traditional Korean CRANE (학) silhouettes in gray, flying gracefully (one left, one right)
- MOUNTAIN/LANDSCAPE silhouette at bottom in soft muted blue-gray, inspired by Korean ink painting (산수화)
- Pine tree silhouettes along the mountain edges
- Calendar inside a clean white card with very subtle border
- Title area: refined serif-style typography with traditional feel
- Subtitle in classical Korean style
- Calendar header: dark navy/charcoal (#37474F) background
- Event markers: colored CIRCLES with Korean text — deep red (#8B1A2A) for closed, purple for night, blue for normal
- Traditional Korean patterns as subtle border decorations (optional)
- Overall mood: dignified, classical, refined, cultured
- Color palette: beige, navy, deep red, soft gold (#D4A853), gray-blue
- Inspired by Korean traditional art (한국화) — NOT cartoonish`,

  medical_notebook: `[CALENDAR THEME: Medical Notebook / 의료 노트북]
MANDATORY VISUAL STYLE:
- Background: clean sky blue (#E3F2FD) or soft blue
- Main content area styled like a SPIRAL NOTEBOOK page: white with blue LEFT MARGIN LINE, horizontal RULED LINES
- SPIRAL BINDING rings along the left edge (gray circles/ovals)
- Cute DOCTOR CHARACTER illustration: person in white coat with stethoscope, friendly smile
- Doctor character placed prominently above or beside the calendar
- Teal/turquoise (#26A69A) accent color for doctor's undershirt and highlights
- Calendar below the doctor character area
- Calendar header: teal/blue (#0097A7) background with white text
- Event markers with clean medical-style badges
- Font style: clean sans-serif, slightly casual/friendly
- A small tooth or medical icon as accent
- Overall mood: friendly, approachable, medical but not intimidating, slightly playful
- Color palette: white, teal, sky blue, gray, touches of coral
- Like a friendly doctor's personal notebook`,

  winter: `[CALENDAR THEME: Winter Christmas / 겨울 크리스마스]
MANDATORY VISUAL STYLE:
- Background: deep navy blue (#1A2A4A → #2C3E6B gradient), cold winter night sky
- SNOWFLAKES scattered throughout: 6-pointed crystal snowflakes in soft blue-white (#7BA7CF), varying sizes and opacities
- SANTA SLEIGH with REINDEER silhouette in the upper portion (subtle, semi-transparent)
- Pine TREE silhouettes along the bottom in dark navy/forest green
- Small warm LIGHTS or stars twinkling in the sky
- Calendar sits inside a white rounded card with soft shadow
- Title area: white or light text on dark background, elegant winter typography
- Red accent (#D32F2F) for Christmas-specific events
- Calendar header: dark blue (#283593) or navy background
- Snowdrift or snow-covered ground at the bottom
- Overall mood: serene, magical, winter wonderland, festive but elegant
- Color palette: deep navy, white, soft blue, red accent, silver
- NOT overly cartoonish — elegant winter/holiday aesthetic`,

  autumn_spring_note: `[CALENDAR THEME: Autumn Spring Note / 가을 스프링노트]
MANDATORY VISUAL STYLE:
- Background: warm off-white/cream with subtle gradient
- Main content area styled like a SPIRAL-BOUND NOTEBOOK: spiral binding dots/rings along the top edge
- MAPLE LEAVES (orange-brown #D2691E) scattered around edges with 0.85 opacity
- Decorative cloud shapes in warm cream (#F5E6C8)
- Simplified AUTUMN TREES with brown trunks (#6B4C2A) and warm foliage crowns
- Earth tone color palette: browns, tans, creams, warm oranges
- Calendar sits inside the notebook page area
- Title in warm brown/dark chocolate color
- Event markers in warm autumn tones
- Overall mood: cozy, nostalgic, warm autumn notebook feel
- Color palette: cream, chocolate brown, burnt orange, tan, warm gold
- Like a personal planner page for autumn — handcrafted feel`,

  autumn_holiday: `[CALENDAR THEME: Autumn Holiday / 가을 Holiday]
MANDATORY VISUAL STYLE:
- Background: warm beige/cream (#FDF5EC)
- Large AUTUMN LEAVES at corners: maple-style with stems in rust (#C0543B), golden brown (#C97B3A), and amber (#D4A24E)
- Brush stroke accents with low opacity for East Asian ink-wash aesthetic
- Calendar inside a white card with subtle drop shadow
- Round leaf shapes for variety mixed with pointed maple leaves
- Various leaf rotations creating natural scattered effect
- Clean title typography in dark brown
- Event markers: ROUND CIRCLE BADGES with colored backgrounds
- Closed days in red, normal in warm accents
- Overall mood: refined autumn with traditional East Asian artistic sensibility
- Color palette: beige, rust brown, golden amber, dark brown (#8B6914), cream white
- Elegant and minimal — NOT cartoonish`,

  hanok_roof: `[CALENDAR THEME: Hanok Roof / 한옥 기와]
MANDATORY VISUAL STYLE:
- Background: warm beige (#F0E6D3)
- Large SALMON/CORAL HALF-CIRCLE (#E8856A) at top center (stylized sun)
- Traditional Korean HANOK ROOF TILES structure: curved ridge line with repeated tile pattern in dark gray (#4A4A4A, #3A3A3A)
- Beige CLOUDS with 0.5 opacity in East Asian ink-painting style
- Korean traditional CORNER PATTERNS: concentric geometric squares in brown (#8B7355)
- Calendar inside a bordered frame with traditional feel
- Title in dignified serif-style Korean typography
- Event colors: red for closed, purple for night, coral for normal, brown for seminar
- Overall mood: cultural heritage, sophisticated, celebrating Korean traditional architecture
- Color palette: beige, coral/salmon, dark gray, brown, cream
- Inspired by Korean hanok buildings — dignified and respectful`,

  dark_green_clinic: `[CALENDAR THEME: Dark Green Clinic / 다크그린 클리닉]
MANDATORY VISUAL STYLE:
- Background: split design — dark teal/green header (#2C4A4A) on top, lighter area below
- Professional medical palette: dark teals, forest greens (#3A7D5C, #2E7D52)
- WHITE TOOTH ICON (molar silhouette) as medical branding element
- Event markers: DIAMOND-SHAPED BADGES (45-degree rotated squares) for type differentiation
- Layered green rectangles with low opacity suggesting healthcare facility
- Calendar with clean grid layout on white/light background
- Red accents (#D32F2F) for closed days
- Title in white text on dark green header
- Overall mood: professional, trustworthy, medical/dental clinic branding
- Color palette: dark teal, forest green, white, red accent, light gray
- Clean and clinical — premium healthcare aesthetic`,

  dark_blue_modern: `[CALENDAR THEME: Dark Blue Modern / 다크블루 모던]
MANDATORY VISUAL STYLE:
- Background: DEEP NAVY gradient (#0D1B3E → #162850), dark and premium
- QUARTER-CIRCLE HALFTONE DOT PATTERNS in all four corners: blue dots (#5A8DBF) with varying sizes, 0.25 opacity
- Modern tech/corporate aesthetic with elegant bokeh-like dot effects
- Calendar displayed as a TABLE GRID with clear borders on dark background
- White or light text on dark navy background throughout
- Clean modern sans-serif typography
- Day headers in bold, dates in clean grid cells
- Closed days highlighted with red or contrasting accent
- Event text inside the calendar cells with subtle color coding
- Overall mood: contemporary, minimalist, premium, sleek corporate
- Color palette: deep navy, white, cool blue (#5A8DBF), subtle gray, red accent
- Like a premium tech company's internal calendar — NOT a typical hospital design
- NO cute illustrations — pure modern minimalist design`,

  lavender_sparkle: `[CALENDAR THEME: Lavender Sparkle / 라벤더 스파클]
MANDATORY VISUAL STYLE:
- Background: soft LAVENDER GRADIENT (#F3E8FF → #FDFCFF), light and airy
- SPARKLE/STAR shapes scattered throughout: four-pointed stars in various purple shades (#7C3AED, #A78BFA, #C4B5FD) with 0.7 opacity
- Multiple sparkles in varying sizes creating magical, whimsical effect
- Calendar header: rounded rectangle in light purple (#E8D5F5)
- Title in deep purple (#5B21B6), elegant and bold
- Vibrant purple (#7C3AED) as primary accent color
- Sunday dates in red (#DC2626), other dates in dark gray
- Clean rounded shapes throughout the design
- Event markers with purple-toned badges
- Overall mood: playful, magical, feminine, modern and cheerful
- Color palette: lavender, deep purple, light violet, white, red accent
- Sparkly and enchanting — like a magical planner design`,
};

// =============================================
// DESIGNER PERSONA - 10-year veteran graphic designer identity
// Injected into ALL image generation prompts for consistent quality
// =============================================
export const DESIGNER_PERSONA = `[DESIGNER IDENTITY]
You are a veteran Korean hospital marketing designer with 10+ years of experience at 똑닥, 강남언니, and major Korean hospital groups.
You specialize in Korean medical clinic SNS images — monthly schedules, event promotions, doctor introductions, notices, holiday greetings, hiring posts, patient care guides, and price lists.
Your work is used daily by real Korean hospitals (치과, 피부과, 성형외과, 내과, 한의원, 정형외과). Patients and staff see these images on Instagram, KakaoTalk, and clinic waiting room displays.

[DESIGN PHILOSOPHY — PRACTICAL HOSPITAL TOOL, NOT CONCEPT ART]
- Every image must function as a REAL hospital communication tool that patients can read and act on
- Design like 똑닥/미리캔버스 Korean hospital templates — clean, professional, immediately usable
- NEVER design like a design school portfolio piece, art exhibition poster, or creative concept
- If a patient cannot understand the information within 3 seconds on their phone, the design has FAILED
- Korean text readability is the #1 priority — minimum 14pt equivalent for body text, 28pt+ for headings
- Information hierarchy: title > key data (dates, prices, names) > supporting details > contact/footer
- Generous whitespace, clear section separation, structured information rows
- Mobile-first: all content must be legible on a phone screen without zooming

[DESIGN CHARACTERISTICS]
- Clean, organized, professional — NEVER messy, cluttered, or overly decorative
- Excellent readability above all else — Korean 가독성 is non-negotiable
- Clear information delivery with strong visual hierarchy
- Title > Key Info > Supporting Info — always in this reading order
- Generous whitespace for clean, organized layouts
- Elegant but never exaggerated — no Art Deco, no thermometer gauges, no code editor motifs
- Trustworthy medical/healthcare-appropriate aesthetic
- Mobile-friendly legible notice images — designed for Instagram feed (4:5 ratio)
- Series-capable: multiple images look unified as one brand system
- Korean medical advertising law compliant: no superlatives (최고/유일/첫/독보적), no outcome guarantees

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

// =============================================
// DESIGN SYSTEM V2 — 2025-2026 Medical Image Standard
// =============================================
export const DESIGN_SYSTEM_V2 = `[DESIGN SYSTEM V2 — 2025-2026 Korean Medical SNS Standard]
FORMAT: 4:5 vertical ratio (1080×1350px recommended). Important content within center 1080×1080px safe zone. Side margins 48px+, top safe 12%, bottom safe 10%.
3-SECOND RULE: Core message must be comprehensible within 3 seconds at mobile phone distance.
TYPOGRAPHY: Sans-serif only (Pretendard/Noto Sans KR style). Heading Bold 28-36pt tracking -0.02em, subheading SemiBold 18-22pt, body Regular 14-16pt lh1.6 (minimum 14px for mobile readability), caption Light 11-13pt 60% opacity, price Bold 40-56pt. Sufficient line-height (행간) for Korean text.
COLOR: max 3 colors per design (primary+accent+neutral). text-primary #0f172a, text-secondary #64748b. Medical trust palette: soft blue (#B3E5FC/#29B6F6), navy (#37474F), teal (#00BCD4), mint/sage green, clean white. Dermatology/aesthetics: beige/cream/ivory. No neon/fluorescent.
SURFACES: cards white radius 16px shadow 0 4px 24px rgba(0,0,0,0.06), badges primary/10% radius 8px, dividers 1px rgba(0,0,0,0.06).
INFO HIERARCHY: title > key information > supporting details > contact/footer. Each zone clearly separated.
INFO BLOCKS: date/time=icon+text left-aligned, contact=phone icon+number, price=large number right-aligned, caution=warning icon+amber/red.
TEXT LIMITS: title max 15chars, subtitle max 25chars, body max 3lines per block, max 4 text zones per image.
ICONS: simple line or flat minimal only. No 3D, no icon gradients, no stock photos. Small clock/calendar/tooth icons are acceptable.
CTA: pill radius 24px, max 1 per image, max 10chars.
KOREAN MEDICAL LAW: No superlatives (최고/유일/첫/독보적). No unverified before/after comparisons. No guarantees of treatment outcome. All claims must be objective and verifiable.
FEED COHESION: Consistent ton-and-manner (톤앤매너) across posts. Same color palette, typography weight, spacing rhythm within a template set.
FORBIDDEN: starburst/explosion, comic-book energy lines, confetti/sparkle/glitter, multiple fonts, <12pt text, >1px borders, sharp corners, >rgba(0,0,0,0.1) shadows, fake urgency (!! ★★★), watermarks, sticker/flyer effects, clip-art medical illustrations, 3D metallic text, handwritten notices, Comic Sans equivalent fonts.
CONCEPT ART FORBIDDEN: Art Deco arches, thermometer gauges, code editor braces, film strip frames, vinyl record layouts, retro TV screens, origami shapes, DNA helix structures, circuit board patterns, blueprint grids. These are design school concepts, NOT hospital tools.
PRACTICAL REQUIREMENT: Every generated image must look like it could be posted TODAY on a real Korean hospital's Instagram account. If it looks like a design portfolio piece or creative concept rather than a functional hospital communication, it has FAILED.`;

function buildTemplateAiPrompt(req: AiTemplateRequest): string {
  const { category, stylePrompt, textContent, hospitalName, extraPrompt, imageSize, calendarTheme } = req;

  const categoryLabels: Record<string, string> = {
    schedule: 'hospital monthly schedule / clinic calendar announcement - clean, modern, trustworthy medical design. MUST include 점심시간 (lunch break) info if provided. Use table/grid layout with clear day headers (일월화수목금토). Sunday=red, Saturday=blue. Closed days clearly marked. Mobile-readable at phone distance.',
    event: 'hospital promotion / medical event announcement - eye-catching yet professional, clear price hierarchy. CRITICAL: discount number must be largest element (48-72pt equivalent). Show original price with strikethrough + discounted price prominently. Event period dates must be clearly visible. Korean medical advertising law: no superlatives (최고/유일/첫), no guarantees of outcome.',
    doctor: 'doctor introduction / new physician announcement - professional, trustworthy portrait-style medical profile. CRITICAL Korean medical law compliance: NEVER use superlatives like 최고(best), 유일(only), 첫(first), 독보적(unrivaled). Only list verifiable credentials (학력, 전공, 자격증, 학회). Avoid subjective quality claims.',
    notice: 'hospital notice / important announcement - clean, authoritative, easy to read at a glance. Centered single-card layout preferred. Structured information rows. Include resumption date (진료 재개일) if applicable. Emergency contact or alternative clinic info at bottom.',
    greeting: 'holiday greeting / seasonal message from hospital - warm, heartfelt, culturally appropriate Korean design. Use traditional Korean motifs appropriate to the specific holiday. Calligraphic greeting text (서예체 style). Include hospital branding subtly at bottom.',
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
    pricing: `hospital non-covered treatment pricing / fee schedule announcement.
CRITICAL DESIGN RULES FOR PRICING:
- Design like a premium hospital price list or menu board
- Clean TABLE or LIST layout with clear item-price alignment
- Treatment names LEFT-aligned, prices RIGHT-aligned with dotted leader lines or clear spacing
- Bold prices in accent color for visibility
- Professional medical aesthetic — NOT like a restaurant menu
- Clean section dividers between item groups
- Title at top, disclaimer/notice at bottom in smaller text
- Use medical icons (tooth, syringe, etc.) sparingly as accents
- Generous whitespace, easy to scan at a glance`,
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

  // 달력 테마 스타일 블록 — 선택한 테마의 디자인 특성을 AI에 전달
  const calendarThemeBlock = (category === 'schedule' && calendarTheme && CALENDAR_THEME_AI_STYLE[calendarTheme])
    ? `
🎨🎨🎨 [CALENDAR DESIGN THEME - HIGHEST VISUAL PRIORITY!] 🎨🎨🎨
${CALENDAR_THEME_AI_STYLE[calendarTheme]}
You MUST follow this theme's visual style exactly. This OVERRIDES the generic [DESIGN STYLE] preset below.
The calendar must look like this specific theme — not a generic hospital calendar.
🎨🎨🎨 END OF THEME INSTRUCTIONS 🎨🎨🎨
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
${calendarAccuracyBlock}${calendarThemeBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${req.applicationMode === 'strict' ? `[DESIGN APPLICATION MODE: STRICT — 레이아웃 복제]
LAYOUT REPLICATION — less than 5% structural deviation.
- Replicate zone proportions exactly (header/body/footer ratios ±5%)
- Keep element placement order identical to template
- Use exact color codes from template — no tone shifts
- Maintain decorative element count and positions
- Only substitute text content to user's input
- Do NOT add, remove, or reposition any structural element
- Result must look like a direct variant of the same template
- PRACTICAL CHECK: the result must still function as a real Korean hospital communication tool — if strict replication produces something unusable, prioritize readability and information clarity over decorative accuracy
` : `[DESIGN APPLICATION MODE: INSPIRED — 목적 유지, 구조 재해석]
CREATIVE REFERENCE — template is mood/direction reference, NOT a blueprint.
ALLOWED: reinterpret zone proportions (±30%), reorder non-critical elements, adjust color tones within same family, add/remove subtle decorative elements, vary typography weight/size.
REQUIRED: maintain information hierarchy (title>key info>supporting), maintain readability and professional medical feel, follow DESIGN_SYSTEM_V2 spacing/safe area/text limits.
PRACTICAL REQUIREMENT: the result must look like it was designed for a REAL Korean hospital Instagram account. If the inspired interpretation produces something that looks like concept art or a design portfolio piece rather than a functional hospital post, it has FAILED. Reference 똑닥/미리캔버스 Korean hospital templates for the expected quality bar.
`}
${DESIGN_SYSTEM_V2}
━━━━━━━━━━━━━━━━━━━━━━━━━━
[DESIGN STYLE — Template Layout]
${stylePrompt}
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

function buildPricingTextContent(data: {
  title: string; items: string[]; notice?: string;
}): string {
  let content = `[MAIN TITLE - largest, bold, center] "${data.title}"`;
  if (data.items.length > 0) {
    content += `\n\n[PRICING TABLE - clean list or table layout. Each row: treatment name LEFT-aligned, price RIGHT-aligned. Use dotted leader lines or clear spacing between name and price. Bold prices in accent color.]`;
    for (const item of data.items) {
      // "항목: 가격" 형식이면 분리, 아니면 그대로
      const colonIdx = item.indexOf(':');
      if (colonIdx > 0) {
        const name = item.substring(0, colonIdx).trim();
        const price = item.substring(colonIdx + 1).trim();
        content += `\n- "${name}" → "${price}"`;
      } else {
        content += `\n- "${item}"`;
      }
    }
  }
  if (data.notice) content += `\n\n[DISCLAIMER/NOTICE - smaller text at bottom, muted color, inside a subtle box or divider] "${data.notice}"`;
  content += `\n\n[DESIGN NOTES: This is a hospital fee schedule. Must look professional and trustworthy. Clean alignment between item names and prices is CRITICAL. Use a table-like layout. Korean text only from quotes above.]`;
  return content;
}

export async function generateTemplateWithAI(
  category: 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution' | 'pricing',
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
    applicationMode?: TemplateApplicationMode; // strict=템플릿 그대로, inspired=느낌만 참고
  }
): Promise<string> {
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
    case 'pricing':
      textContent = buildPricingTextContent(templateData as any);
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
    calendarTheme: category === 'schedule' ? templateData.colorTheme : undefined,
    applicationMode: options?.applicationMode,
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

  const MAX_RETRIES = 2;
  let lastError: any = null;
  const demoSafe = isDemoSafeMode();

  // 3차 시도 판정용 — 각 시도의 에러 유형 기록
  const attemptErrors: { errorType: string; retryAfterMs: number }[] = [];

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
      console.log(`[TMPL] AI 이미지 시도 ${attempt}/${MAX_RETRIES} (${category}, ref=${!!styleRefPart})`);

      const result = await callGeminiRaw('gemini-3-pro-image-preview', {
        contents: [{role: 'user', parts: contents}],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
          imageConfig: {
            imageSize: '4K',
          },
        },
      }, TIMEOUTS.IMAGE_GENERATION);

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        const data = imagePart.inlineData.data;
        console.info(`[TMPL] ✅ AI 이미지 성공 (시도 ${attempt}) renderMode=ai-image`);
        return `data:${mimeType};base64,${data}`;
      }

      lastError = new Error('이미지 데이터를 받지 못했습니다.');
      attemptErrors.push({ errorType: 'no_data', retryAfterMs: 0 });
      console.warn(`[TMPL] ⚠️ 시도 ${attempt} no image data`);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      lastError = error;
      const st = error?.status;
      const isCooldown = error?.isCooldown === true;
      const is503 = st === 503 || (error?.message || '').includes('503');
      const isTimeout = st === 504 || (error?.message || '').includes('timeout');
      const retryAfterMs = error?.retryAfterMs || 0;
      const errorType = isCooldown ? 'all_keys_in_cooldown' : is503 ? 'upstream_503' : isTimeout ? 'timeout' : String(st || 'ERR');

      attemptErrors.push({ errorType, retryAfterMs });
      console.warn(`[TMPL] ❌ 시도 ${attempt} errorType=${errorType} ${retryAfterMs ? `retryAfterMs=${retryAfterMs}ms` : ''}`);

      if (attempt < MAX_RETRIES) {
        // 503: cooldown 기반 대기 or 고정 backoff
        const backoff = retryAfterMs > 0
          ? retryAfterMs + Math.random() * 1000
          : is503
            ? 4000 + Math.random() * 4000  // 4~8초 jitter
            : 2000;
        console.info(`[TMPL] ⏳ backoff ${Math.round(backoff)}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  // ── 3차 시도 판정 ──
  // 템플릿 이미지는 hero급 품질 — demo-safe에서도 짧은 cooldown이면 3차 허용
  // 조건: 1차 = upstream_503 or timeout, 2차 = all_keys_in_cooldown, retryAfterMs <= 4000
  const thirdChanceEligible = attemptErrors.length >= 2
    && ['upstream_503', 'timeout'].includes(attemptErrors[0].errorType)
    && attemptErrors[1].errorType === 'all_keys_in_cooldown'
    && attemptErrors[1].retryAfterMs > 0
    && attemptErrors[1].retryAfterMs <= 4000;

  console.info(`[TMPL] 🔍 thirdChanceEligible=${thirdChanceEligible} imagePriority=template attempts=[${attemptErrors.map(e => e.errorType).join(',')}] retryAfterMs=${attemptErrors[1]?.retryAfterMs || 0} demoSafe=${demoSafe}`);

  if (thirdChanceEligible) {
    const waitMs = attemptErrors[1].retryAfterMs + 200 + Math.random() * 300;
    console.info(`[TMPL] 🔄 thirdAttemptStarted imagePriority=template retryAfterMs=${attemptErrors[1].retryAfterMs} waitMs=${Math.round(waitMs)}`);
    await new Promise(resolve => setTimeout(resolve, waitMs));

    try {
      const result = await callGeminiRaw('gemini-3-pro-image-preview', {
        contents: [{role: 'user', parts: contents}],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
          imageConfig: { imageSize: '4K' },
        },
      }, TIMEOUTS.IMAGE_GENERATION);

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        console.info(`[TMPL] ✅ AI 이미지 성공 (3차 third-chance) thirdAttemptResult=success finalRenderMode=ai-image`);
        return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
      }
      lastError = new Error('no image data (3rd chance)');
      console.warn(`[TMPL] ❌ 3차 third-chance thirdAttemptResult=no_data finalRenderMode=html-fallback`);
    } catch (error: any) {
      lastError = error;
      const errorType = error?.isCooldown ? 'all_keys_in_cooldown' : String(error?.status || 'ERR');
      console.warn(`[TMPL] ❌ 3차 third-chance errorType=${errorType} thirdAttemptResult=error finalRenderMode=html-fallback`);
    }
  }

  // ── AI 실패 → HTML 렌더링 폴백 시도 ──
  const totalAttempts = MAX_RETRIES + (thirdChanceEligible ? 1 : 0);
  console.warn(`[TMPL] ⚠️ AI 이미지 ${totalAttempts}회 실패, HTML 폴백 시도 (${category}) finalResult=html-fallback`);

  try {
    const htmlBuilders: Record<string, (data: any) => string> = {
      schedule: buildCalendarHTML,
      event: buildEventHTML,
      doctor: buildDoctorHTML,
      notice: buildNoticeHTML,
      greeting: buildGreetingHTML,
      hiring: buildHiringHTML,
      caution: buildCautionHTML,
      pricing: buildPricingHTML,
    };

    const builder = htmlBuilders[category];
    if (!builder) {
      throw new Error(`HTML 폴백 미지원 카테고리: ${category}`);
    }

    const html = builder(templateData as any);
    const { renderCalendarToImage } = await import('../../../services/calendarTemplateService');
    const imageDataUrl = await renderCalendarToImage(html, options?.imageSize || { width: 1080, height: 1080 });
    console.info(`[TMPL] ✅ HTML 폴백 성공 renderMode=html-fallback (${category})`);
    return imageDataUrl;
  } catch (fallbackErr: any) {
    console.error(`[TMPL] ❌ HTML 폴백도 실패: ${fallbackErr?.message}`);
    throw new Error(`이미지 생성 실패 (AI: ${lastError?.message?.substring(0, 60)}, HTML 폴백: ${fallbackErr?.message?.substring(0, 60)}). 다시 시도해주세요.`);
  }
}
