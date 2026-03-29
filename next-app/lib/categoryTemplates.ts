/**
 * categoryTemplates — 카테고리별 AI 이미지 생성 프리셋
 *
 * calendarTemplateService.ts에서 추출.
 * 78개 템플릿 프리셋 (진료일정 12 + 이벤트 6 + 의사소개 6 + 공지 6 + 명절 30 + 채용 6 + 주의사항 6 + 비급여 6)
 * 각 프리셋은 AI 프롬프트 + 색상 + 레이아웃 힌트를 포함.
 */

// 타입은 별도 파일에서 re-export (번들 최적화: 타입만 필요한 곳에서 데이터 import 방지)
export type { CategoryTemplate } from './categoryTemplateTypes';
import type { CategoryTemplate } from './categoryTemplateTypes';

export const CATEGORY_TEMPLATES: Record<string, CategoryTemplate[]> = {

  // ─── 진료 일정 (12개) ───
  // 4계절(봄/여름/가을/겨울) + 전통(한방/보자기/수묵화) + 모던(네이비/민트/코랄) + 특수(키즈/베이지골드)
  // 모든 템플릿에 AI가 그릴 수 있는 구체적 일러스트/장식 소재 포함
  schedule: [
    {
      id: "sch_cherry_blossom", name: "벚꽃 봄", color: "#ec4899", accent: "#be185d", bg: "#fdf2f8",
      desc: "수채화 벚꽃잎 코너 장식 + 로즈핑크 프레임 — 3~5월 봄", layoutHint: "cal_spring", previewImage: "/calendar-previews/sch_cherry_blossom.jpg",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Premium Spring Cherry Blossom theme.

BACKGROUND: Entire background filled with soft pink watercolor wash (#fdf2f8 to #fce7f3 gradient). Scattered cherry blossom petals ACROSS THE ENTIRE background at varying sizes and 15-30% opacity — not just corners. Creates a dreamy, immersive spring atmosphere.

DECORATIVE LAYER: 2-3 detailed cherry blossom branches with flowers — one reaching in from top-right, one from bottom-left. Petals caught mid-fall throughout the image. Watercolor painting style, not clip-art.

CALENDAR CARD: White frosted card (backdrop-blur feel, 90% opacity, rounded 16px, soft shadow) floating on the pink background. The pink background and petals should be visible around and slightly through the card.

TITLE: Deep rose (#9f1239) elegant bold text on pink background above the card. Subtle petal accents near the title.

TYPOGRAPHY: Clean, modern Korean sans-serif. Title large and impactful. Date numbers crisp and readable.

COLOR PALETTE: Soft pink #fdf2f8, deep rose #9f1239, white, warm coral accent for closed days.

QUALITY: This must look like a premium template — sophisticated, not cute or childish. Think luxury skincare brand aesthetic applied to a hospital calendar.

STRICT ANCHORS: Full-background petal scatter, watercolor branch illustrations, frosted white card, rose color family, immersive spring mood.
INSPIRED FREEDOM: Branch placement, petal density, pink shade variation, card opacity.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },

    {
      id: "sch_maple_autumn", name: "단풍 가을", color: "#ea580c", accent: "#c2410c", bg: "#fff7ed",
      desc: "수채화 단풍잎 + 오렌지 그라데이션 — 9~11월 가을", layoutHint: "cal_autumn", previewImage: "/calendar-previews/sch_maple_autumn.jpg",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Premium Autumn Maple Leaf theme.

BACKGROUND: Rich warm gradient filling entire background — burnt orange (#ea580c) at top fading to warm cream (#fff7ed) at bottom. Scattered autumn leaves (maple, ginkgo) ACROSS THE ENTIRE background at varying sizes, colors (red, orange, gold, brown), and 20-40% opacity. Creates immersive autumn atmosphere.

DECORATIVE LAYER: Cluster of detailed watercolor maple leaves at top-left and bottom-right — vivid reds, oranges, and golds. 3-4 individual leaves caught mid-fall across the middle area. Watercolor painting style with visible brush texture.

CALENDAR CARD: White card (rounded 14px, warm-toned shadow) floating on the gradient. Warm cream tint. A leaf or two slightly overlapping the card edge.

TITLE: Bold white text on the orange gradient area at top. Large, confident, with subtle leaf accent beside it.

COLOR PALETTE: Burnt orange #ea580c, warm cream #fff7ed, maple red #dc2626, gold #eab308, brown #92400e.

QUALITY: Premium autumn harvest poster — rich, warm, abundant. Like a luxury hotel's seasonal announcement. Watercolor art quality, not digital clip-art.

STRICT ANCHORS: Full orange-to-cream gradient, scattered leaves across entire background, watercolor leaf clusters at corners, warm autumn palette, immersive fall mood.
INSPIRED FREEDOM: Leaf density and color mix, gradient angle, additional fall elements (ginkgo, acorns), card tint.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },

    {
      id: "sch_snowflake_winter", name: "눈꽃 겨울", color: "#0ea5e9", accent: "#0284c7", bg: "#f0f9ff",
      desc: "기하학적 눈 결정 패턴 + 아이시 블루 — 12~2월 겨울", layoutHint: "cal_winter", previewImage: "/calendar-previews/sch_snowflake_winter.jpg",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Winter Snowflake theme.
VISUAL MOTIFS: Geometric snowflake crystal patterns scattered at 12% opacity in background. Sparkle accents. Frosted glass effect on calendar card.
COLORS: Background icy blue gradient #e0f2fe to white. Title deep blue #0c4a6e. Accent sky blue #0ea5e9.
HEADER: Icy gradient with snowflake patterns. Bold deep blue title with sparkle accents.
CALENDAR: Frosted white card (border 1px #bae6fd). Closed days in icy blue pill badge + "휴진" label below. Shortened in amber + "단축" label below.
FOOTER: Light icy background with legend.
STRICT ANCHORS: Geometric snowflakes, ice-blue gradient, frosted card effect, blue monochrome, sparkle accents.
INSPIRED FREEDOM: Snowflake density/size, gradient direction, additional winter elements.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },

    {
      id: "sch_korean_classic", name: "한방 전통", color: "#92400e", accent: "#78350f", bg: "#fef3c7",
      desc: "기와지붕 실루엣 + 전통 꽃살문양 — 한의원/명절", layoutHint: "cal_hanok", previewImage: "/calendar-previews/sch_korean_classic.png",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure must be: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header, styled frame.
The calendar grid is ONE ELEMENT inside the poster, not the whole image.
DO NOT make the calendar grid fill 100% of the image.
⛔ If no footer text was provided by the user, do NOT draw any footer area, empty box, or blank rectangle below the calendar. End the poster cleanly after the calendar grid.
Think of this as an Instagram-worthy hospital announcement poster that happens to show a monthly calendar.

Korean hospital monthly schedule poster — Korean Traditional Hanok Style.
STRUCTURE: Warm cream (#f5e6d0) background evoking traditional Korean paper. Traditional roof tile (기와) silhouette decorative border at TOP EDGE ONLY — a single horizontal strip across the top. Small flower lattice (꽃살) decorations in top corners only. ⛔ Do NOT draw roof tiles on the left side, right side, or bottom of the image. ⛔ Do NOT draw a sun, half-circle sun, or sunrise motif anywhere. The left, right, and bottom edges must be clean with NO decorative borders — just the warm cream background.
CALENDAR GRID: Warm brown (#92400e) text. Grid styled with traditional aesthetic, subtle borders.
MARKERS: Closed — deep red seal stamp style marker + "휴진" label below. Shortened — amber brush stroke accent + "단축" label below. Vacation — purple marker + "휴가" label below. ONLY mark the dates specified by the user.
STRICT MODE ANCHORS: (1) Roof tile border decoration (2) Traditional pattern corners (3) Warm brown palette (4) Cream background (5) 꽃살 lattice motifs.
INSPIRED MODE FREEDOM: (1) Traditional motif variety (2) Color warmth level (3) Pattern complexity.
⛔ Do NOT add any information the user didn't provide — no business hours, lunch hours, phone numbers, addresses. Do NOT draw empty boxes or blank placeholder sections. If no notice text was provided, end the poster after the calendar grid with NO empty area below.
Dignified traditional Korean aesthetic with warm readable typography.`,
    },

    {
      id: "sch_bojagi_holiday", name: "보자기 명절", color: "#b91c1c", accent: "#991b1b", bg: "#fef2f2",
      desc: "보자기 매듭 장식 + 금색 테두리 + 전통 색동 — 설날/추석", layoutHint: "cal_holiday", previewImage: "/calendar-previews/sch_bojagi_holiday.jpg",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Korean Traditional Bojagi Holiday theme.
VISUAL MOTIFS: Korean bojagi (wrapping cloth) knot decoration at top center, large and prominent. Gold border frame around entire image. Color stripe accents (red, blue, yellow, green — Korean saekdong).
COLORS: Background warm hanji texture cream. Frame gold #c9a96e. Title deep red #991b1b. Saekdong accents.
HEADER: Bojagi knot decoration + gold frame top. Bold title below knot.
CALENDAR: White area inside gold frame. Closed days in red circle + "휴진" label below. Holidays in gold circle with name.
FOOTER: Gold frame bottom with legend.
STRICT ANCHORS: Bojagi knot, gold frame border, saekdong color accents, hanji texture, traditional Korean motifs.
INSPIRED FREEDOM: Knot style variation, additional traditional patterns, texture intensity.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },

    {
      id: "sch_ink_wash", name: "수묵화", color: "#374151", accent: "#1f2937", bg: "#f9fafb",
      desc: "먹 번짐 효과 + 대나무/매화 수묵 일러스트 — 고급 한의원", layoutHint: "cal_inkwash", previewImage: "/calendar-previews/sch_ink_wash.jpg",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — East Asian Ink Wash Painting theme.
VISUAL MOTIFS: Ink wash bamboo or plum blossom branch illustration at one corner (subtle, elegant). Ink wash splash/bleed effect at header background. Single red seal stamp as accent.
COLORS: Background pure white #ffffff. Text charcoal #1f2937. Ink wash grays from light to dark. One red seal accent #dc2626.
HEADER: Ink wash splash background fading to white. Elegant serif-style title in dark charcoal.
CALENDAR: Clean white area with minimal thin gray lines. Closed days marked with small red circle (seal style) + "휴진" label below.
FOOTER: Minimal, ink wash fade at bottom edge.
STRICT ANCHORS: Ink wash bamboo/plum illustration, ink splash background, red seal stamp, monochrome palette, traditional east asian painting style.
INSPIRED FREEDOM: Plant type (bamboo vs plum vs orchid), ink intensity, seal position.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },

    {
      id: "sch_kids_pastel", name: "키즈 파스텔", color: "#a855f7", accent: "#7c3aed", bg: "#faf5ff",
      desc: "파스텔 무지개 + 구름/별 일러스트 — 소아과/소아치과", layoutHint: "cal_kids",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Kids Pastel Rainbow theme.
VISUAL MOTIFS: Pastel rainbow arch at top of image (large, prominent). Cute cloud illustrations floating. Small star decorations scattered. Everything soft and rounded.
COLORS: Background light lavender #faf5ff. Rainbow colors in soft pastel (pink, peach, yellow, mint, sky blue, lavender). Title purple #7c3aed.
HEADER: Large pastel rainbow arch with clouds. Cute bold title below rainbow.
CALENDAR: White rounded card with colorful pastel cell backgrounds. Closed days in purple circle + "휴진" label below. Shortened in pink + "단축" label below.
FOOTER: Pastel area with star decorations and legend.
STRICT ANCHORS: Pastel rainbow arch, cloud illustrations, star decorations, soft rounded shapes, playful kids aesthetic.
INSPIRED FREEDOM: Rainbow size, cloud density, star placement, pastel color intensity.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },
    {
      id: "sch_clean_blue", name: "클린 블루", color: "#3b82f6", accent: "#1d4ed8", bg: "#eff6ff",
      desc: "파란 그라데이션 헤더 + 흰 카드 — 가장 보편적 병원 스타일", layoutHint: "cal_corporate",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Premium Clean Blue Corporate theme.

BACKGROUND: Entire background is a SMOOTH, CLEAN blue gradient — deep navy (#1e3a8a) at top corners fading to sky blue (#93c5fd) at center, then to very light blue (#eff6ff) at bottom. NO patterns, NO hexagons, NO waves, NO geometric shapes. Just a pure, smooth, elegant blue gradient like a clear winter sky. The gradient itself is the decoration.

DECORATIVE LAYER: MINIMAL decoration. Only a thin white horizontal line (1px, 40% opacity) separating title area from calendar area. A single small white medical cross icon (+) at top-right corner at 20% opacity. That is it — no other decorations.

CALENDAR CARD: Large white card (rounded 16px, soft shadow 0 4px 20px rgba(0,0,0,0.1)) taking up 65% of the image. Card should feel like it is floating elegantly on the blue gradient. Clean grid inside with thin light gray (#e5e7eb) lines. Day header row has very light blue (#dbeafe) background.

TITLE: Bold white text on the blue gradient area above the card. Large, clean, sans-serif. Hospital name small white text above the main title.

TYPOGRAPHY: Modern Korean sans-serif throughout. Title 28pt+ bold white. Date numbers 14pt clean black. Sunday red, Saturday blue.

FOOTER: Below the card, on the blue gradient — small white text legend only. No box, no background.

COLOR PALETTE: Navy #1e3a8a, sky blue #93c5fd, light blue #eff6ff, white, light gray #e5e7eb. ONLY blue family + white + gray. No other colors except red for closed days.

QUALITY: Think Samsung Medical Center or university hospital official notice level. Extremely clean, trustworthy, no-nonsense corporate medical design. The beauty comes from the smooth gradient and generous whitespace, not from decorations.

STRICT ANCHORS: Smooth blue gradient (no patterns), large white floating card, minimal decoration (cross icon only), corporate sans-serif typography, generous whitespace, trustworthy medical mood.
INSPIRED FREEDOM: Gradient blue shade range, card shadow intensity, cross icon opacity, title alignment.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },
    {
      id: "sch_rose_gold", name: "로즈 골드", color: "#be185d", accent: "#9f1239", bg: "#fdf2f8",
      desc: "대리석 질감 + 로즈골드 라인 — 피부과/성형외과 프리미엄", layoutHint: "cal_premium",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Rose Gold Premium theme.

BACKGROUND: Entire background white marble texture with very subtle gray veining at 5-8% opacity. Luxurious, high-end aesthetic clinic feel throughout.

DECORATIVE LAYER: Thin rose-gold (#b76e79) decorative lines — one below title, one above footer. Rose-gold corner ornaments (simple geometric). Subtle pink (#fdf2f8) wash over the marble at edges.

CALENDAR CARD: White area with very subtle marble texture continuing. Thin rose-gold border (0.5px). Elegant, minimal grid lines in light warm gray.

TITLE: Deep rose (#9f1239) elegant text, slightly serif feel. Hospital name in rose-gold (#b76e79) small above.

COLOR PALETTE: Rose-gold #b76e79, deep rose #9f1239, white marble, warm gray #9ca3af, subtle pink #fdf2f8.

QUALITY: High-end beauty clinic or dermatology office. Think luxury brand aesthetic. Marble + rose gold = instant luxury.

STRICT ANCHORS: Marble texture background, rose-gold decorative lines, rose-gold corner ornaments, serif-leaning typography, luxury minimal aesthetic.
INSPIRED FREEDOM: Marble vein intensity, ornament complexity, pink wash amount, line style.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },
    {
      id: "sch_green_botanical", name: "그린 보태니컬", color: "#16a34a", accent: "#15803d", bg: "#f0fdf4",
      desc: "유칼립투스 잎 일러스트 + 내추럴 톤 — 웰니스/재활", layoutHint: "cal_botanical",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Green Botanical Natural theme.

BACKGROUND: Entire background soft natural green (#f0fdf4 to #ecfdf5) with subtle linen/paper texture at 3% opacity. Organic, calming, natural wellness mood throughout.

DECORATIVE LAYER: Watercolor eucalyptus branches and leaves reaching in from top-right and bottom-left corners. Leaves in sage green, olive, and emerald tones. Natural, organic painting style. 2-3 small individual leaves scattered at 15-25% opacity across the background.

CALENDAR CARD: White card (rounded 14px, soft natural shadow) floating on the green background. Subtle sage border.

TITLE: Dark green (#15803d) clean text on the natural background. Small leaf accent beside title.

COLOR PALETTE: Sage green #86efac, dark green #15803d, olive #4d7c0f, white, warm linen cream.

QUALITY: Premium wellness clinic or health spa. Think Aesop brand aesthetic. Natural, calming, sophisticated botanical illustration quality.

STRICT ANCHORS: Watercolor eucalyptus illustrations, natural green palette, linen texture, organic mood, botanical art style.
INSPIRED FREEDOM: Leaf type (eucalyptus/olive/monstera), branch placement, texture intensity, green shade range.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },
    {
      id: "sch_taegeuk_national", name: "태극기", color: "#1e3a5f", accent: "#c81e1e", bg: "#f8f9fa",
      desc: "세련된 태극 모티프 + 건곤 패턴 — 삼일절/광복절", layoutHint: "cal_national",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Korean National Flag Patriotic theme for national holidays.

BACKGROUND: Clean white (#f8f9fa) background. Subtle watermark of taegeuk (yin-yang symbol) at 5-8% opacity in center background, very large and elegant. Refined, modern patriotic design.

DECORATIVE LAYER: Modern, stylized taegeuk symbol (red #c81e1e and blue #1e3a5f) at top center, medium size, clean geometric rendering. Trigram patterns used as subtle decorative borders or corner accents at 15% opacity. Thin navy and red accent lines framing the calendar area.

CALENDAR CARD: White card with thin navy (#1e3a5f) border. Clean grid. National holidays highlighted with red circle.

TITLE: Bold navy (#1e3a5f) text. Confident, dignified. Small taegeuk accent beside title.

COLOR PALETTE: Navy #1e3a5f, red #c81e1e, white, light gray #f8f9fa. ONLY these colors.

QUALITY: REFINED and MODERN — like a government ministry official design. Clean typography, generous whitespace, sophisticated use of national colors.

STRICT ANCHORS: Taegeuk symbol, navy/red/white only palette, trigram pattern accents, refined patriotic mood, generous whitespace.
INSPIRED FREEDOM: Taegeuk size and placement, trigram pattern density, line thickness, typography weight.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },
    {
      id: "sch_christmas", name: "크리스마스", color: "#dc2626", accent: "#15803d", bg: "#fef2f2",
      desc: "크리스마스 트리 + 선물 + 눈 — 연말 특별 안내", layoutHint: "cal_christmas",
      aiPrompt: `[CRITICAL — THIS IS A POSTER, NOT A SPREADSHEET]
This is a DESIGNED POSTER that contains a calendar section — NOT a calendar that fills the entire image.
Structure: decorative header/frame (30-40%) + calendar grid (50-60%) + footer ONLY if user provided notice text.
The poster must have visual identity: background texture, decorative elements, branded header.
DO NOT make the calendar grid fill 100% of the image.
DO NOT add any information the user did not provide (no clinic hours, no lunch time, no phone number unless user entered them).

Korean hospital monthly schedule poster — Christmas Holiday theme for December/year-end.

BACKGROUND: Entire background deep festive red (#991b1b) to dark green (#14532d) diagonal gradient, OR rich cream/ivory with red and green accents. Scattered snowflakes across the entire background at 10-15% opacity. Warm, festive, joyful Christmas atmosphere.

DECORATIVE LAYER: Christmas tree illustration at one corner (stylized, elegant). Gift boxes with ribbons at opposite corner. Gold star at tree top. Holly leaves and berries as small accents. String lights (small dots of warm yellow) along the top edge.

CALENDAR CARD: White or cream card (rounded 14px, warm shadow) floating on the festive background. Red and green accent colors for grid elements.

TITLE: Bold white or gold text on the dark festive background. Christmas star accent.

COLOR PALETTE: Christmas red #dc2626, forest green #15803d, gold #eab308, white, cream, warm brown.

QUALITY: Premium Christmas card quality — warm, inviting, festive but sophisticated.

STRICT ANCHORS: Christmas tree illustration, gift boxes, snowflake scatter, red/green/gold palette, festive warm mood, string light dots.
INSPIRED FREEDOM: Tree style, gift placement, snowflake density, gradient direction, gold amount.
Mobile readability: minimum body text 11pt, date numbers 14pt bold, title 24pt+.`,
    },
  ],

  event: [
    {
      id: "evt_gold_luxury", name: "골드 럭셔리", color: "#b8860b", accent: "#8b6914", bg: "#faf5ef",
      desc: "메탈릭 골드 텍스처 + 크림 배경 — 고급스러운 프리미엄 스타일", layoutHint: "luxury",
      aiPrompt: `[CRITICAL — THIS IS A PREMIUM DESIGNED POSTER, NOT A GENERIC FLYER]
DO NOT add any information the user did not provide.
DO NOT write any placeholder hospital name.

Korean hospital event/promotion poster — Luxury Gold theme. Pure design style — works for ANY type of event.

BACKGROUND: Rich cream (#faf5ef) base. Entire background covered with subtle METALLIC GOLD SHIMMER effect — brushed gold leaf texture at 5-8% opacity across the whole surface. At top and bottom edges: soft gold (#d4a853) gradient fade (15% opacity) creating warm glow frame. NOT random dots — elegant metallic texture.

TYPOGRAPHY HERO (top 45%): Event title (user-provided) in MASSIVE display typography — 60pt+, weight 900, deep gold (#8B6914). Typography IS the decoration. Below: thin gold line (1px, width 25%, centered). Below line: subtitle in warm charcoal (#3c3228), 16pt, elegant spacing.

CONTENT CARD (middle 35%): Frosted white card (rounded 20px, backdrop-blur, border: 0.5px solid rgba(212,168,83,0.3)). Event details in warm charcoal. Numbers in bold gold (#b8860b). Clean hierarchy, generous line spacing. NO bullet points.

SIGNATURE DETAIL: Two thin parallel gold lines (0.5px each, 4px gap) at 30% and 75% from top — structural decoration replacing confetti.

FOOTER (bottom 20%): Cream continues. Small warm charcoal text.

BANNED: No confetti, no dots, no scattered shapes, no ribbons, no balloons. Decoration from typography weight, gold lines, metallic texture ONLY.

STRICT ANCHORS: Metallic gold shimmer, massive display typography, parallel gold lines, frosted card, cream/gold/charcoal palette, luxury brand aesthetic.
INSPIRED FREEDOM: Gold shade, shimmer intensity, line placement, card opacity.
Mobile readability: title 48pt+, body 12pt+.`,
    },
    {
      id: "evt_deep_navy", name: "딥 네이비", color: "#0a1628", accent: "#1e3a5f", bg: "#0a1628",
      desc: "다크 네이비 + 흰 대형 타이포 + 골드 라인 — 권위 있는 모던 스타일", layoutHint: "navy",
      aiPrompt: `[CRITICAL — THIS IS A PREMIUM CORPORATE POSTER]
DO NOT add any information the user did not provide.
DO NOT write any placeholder hospital name.

Korean hospital event/promotion poster — Deep Navy Corporate theme. Pure design style — works for ANY type of event.

BACKGROUND: Deep navy (#0a1628) filling entire image — darker than typical navy, almost black-navy. Single subtle spotlight effect: slightly lighter circle (#0f2444) at center (20% of image), creating depth like stage light. NO patterns, NO textures — pure deep color with lighting.

TYPOGRAPHY HERO (top 50%): Massive white (#ffffff) title — 56pt+, weight 900, tight letter-spacing (-1px). Feels like projected onto a dark screen. Below: single thin gold (#c9a96e) horizontal line (width 20%, centered, 1px). Below line: subtitle in sky blue (#7dd3fc), 14pt, letter-spacing +2px.

CONTENT AREA (middle 30%): NO card — text floats directly on navy. Details in white, 14pt. Important numbers in gold (#c9a96e), bold. Dates in sky blue (#7dd3fc). Each line separated by generous spacing (24px+). Center-aligned, floating in dark space.

BOTTOM EDGE (bottom 20%): Subtle gold gradient line (1px, gold to transparent) at 80%. Hospital name in small sky blue at very bottom. Nothing else.

BANNED: No white cards, no boxes, no frames, no borders. Power is in DARKNESS + WHITE TYPOGRAPHY + NEGATIVE SPACE. Like a movie title sequence.

STRICT ANCHORS: Near-black navy, spotlight effect, massive white title, gold accent line, sky blue secondary, cinematic typography, extreme minimalism.
INSPIRED FREEDOM: Spotlight position, navy darkness, gold line placement, text alignment.
Mobile readability: title 44pt+, body 12pt+ (white on navy contrast 15:1+).`,
    },
    {
      id: "evt_sky_blue", name: "스카이 블루", color: "#3b82f6", accent: "#1e3a8a", bg: "#eff6ff",
      desc: "하늘색 그라데이션 + 클린 카드 — 깔끔하고 신뢰감 있는 스타일", layoutHint: "sky",
      aiPrompt: `[CRITICAL — THIS IS A CLEAN PROFESSIONAL POSTER]
DO NOT add any information the user did not provide.
DO NOT write any placeholder hospital name.

Korean hospital event/promotion poster — Clean Sky Blue theme. Pure design style — works for ANY type of event.

BACKGROUND: Smooth vertical gradient — medium blue (#3b82f6) at very top (10%) through sky blue (#7dd3fc) to very light blue (#eff6ff) at 40%, then to pure white at bottom. SMOOTH like clear morning sky. NO clouds, NO patterns.

SINGLE ICON: Top-right area, ONE simple geometric plus-sign (+) in white, 25% opacity, medium size. ONLY non-text visual element.

TITLE AREA (top 35%): Bold white title (32pt+, weight 800) on blue gradient. Hospital name in light blue (#bfdbfe), small, above title.

CONTENT AREA (middle 40%): As gradient reaches white, content in deep blue (#1e3a8a) text. Generous spacing. List items with thin blue (#93c5fd) left-border accent (2px) — NOT bullet points. Numbers in bold deep blue.

FOOTER (bottom 25%): Pure white. Info in medium blue (#3b82f6), small. Thin blue line (1px, #93c5fd) divider.

BANNED: No hearts, no pulse lines, no stethoscopes, no medical illustrations. Blue gradient IS the trust signal.

STRICT ANCHORS: Blue-to-white smooth gradient, single plus icon, white-on-blue title, deep blue body text, left-border list style, zero clutter.
INSPIRED FREEDOM: Blue shade range, plus icon size/position, gradient speed.
Mobile readability: title 28pt+, body 12pt+.`,
    },
    {
      id: "evt_sage_botanical", name: "세이지 보태니컬", color: "#16a34a", accent: "#14532d", bg: "#f0fdf4",
      desc: "세이지 워터컬러 + 유칼립투스 실루엣 — 자연스럽고 차분한 스타일", layoutHint: "botanical",
      aiPrompt: `[CRITICAL — THIS IS A PREMIUM WELLNESS-MOOD POSTER]
DO NOT add any information the user did not provide.
DO NOT write any placeholder hospital name.

Korean hospital event/promotion poster — Sage Botanical theme. Pure design style — works for ANY type of event.

BACKGROUND: Soft sage (#f0fdf4) filling entire image. Subtle watercolor wash — lighter (#ecfdf5) and darker (#dcfce7) sage areas blending organically. At bottom-right corner: single eucalyptus branch silhouette in sage green (#86efac) at 10-15% opacity, reaching about 25% into image.

TYPOGRAPHY (top 40%): Dark forest green (#14532d) title — bold, 32pt+, modern sans-serif. Below: thin emerald (#10b981) line (1px, width 20%). Below: subtitle in medium green (#16a34a), 14pt.

CONTENT AREA (middle 40%): White card (rounded 16px, soft shadow, border: 1px solid #dcfce7). Dark green text inside. Sections separated by thin sage lines. Numbers in bold emerald (#059669). Generous padding (24px+).

FOOTER (bottom 20%): Sage continues. Small dark green text. Thin emerald line above.

BANNED: No check marks, no checklists, no leaf illustrations except the ONE silhouette. Botanical presence is MINIMAL.

STRICT ANCHORS: Sage watercolor wash, single eucalyptus silhouette, dark green typography, white card, emerald accents, organic minimal mood.
INSPIRED FREEDOM: Watercolor intensity, branch type, green shade range.
Mobile readability: title 28pt+, body 12pt+.`,
    },
    {
      id: "evt_ocean_cool", name: "오션 쿨", color: "#0ea5e9", accent: "#0e7490", bg: "#ecfeff",
      desc: "틸→시안 그라데이션 + 물결 패턴 — 시원하고 세련된 스타일", layoutHint: "ocean",
      aiPrompt: `[CRITICAL — THIS IS A PREMIUM POSTER, NOT A BEACH FLYER]
DO NOT add any information the user did not provide.
DO NOT write any placeholder hospital name.

Korean hospital event/promotion poster — Ocean Cool theme. Pure design style — works for ANY type of event.

BACKGROUND: Deep-to-light blue gradient — deep teal (#0e7490) at top corners through cerulean (#0ea5e9) to light cyan (#cffafe) at center-bottom. Across ENTIRE background: subtle flowing wave lines (smooth sine curves, 3-4 waves) in lighter blue (#67e8f9) at 6-10% opacity. Smooth and elegant, NOT cartoon waves.

TYPOGRAPHY HERO (top 40%): Bold white title (36pt+, weight 900). Below: thin white line (1px, width 15%). Below: subtitle in light cyan (#a5f3fc), 14pt.

CONTENT AREA (middle 35%): Frosted white card (rounded 16px, backdrop-blur, 88% opacity). Dark teal (#134e4a) text inside. Numbers in bold cerulean (#0891b2).

FOOTER (bottom 25%): Gradient continues lighter. Small teal text.

ACCENT: 2-3 very small sparkle marks in white at 10% opacity. No other decoration.

BANNED: No sun, no beach, no palm trees, no ice cream. Blue gradient is the mood signal.

STRICT ANCHORS: Teal-to-cyan gradient, subtle wave lines, frosted card, white bold title, sparkle accents, sophisticated cool mood.
INSPIRED FREEDOM: Blue/teal range, wave count, card opacity, sparkle count.
Mobile readability: title 32pt+, body 12pt+.`,
    },
    {
      id: "evt_blush_warm", name: "블러시 웜", color: "#881337", accent: "#9f1239", bg: "#fef7ed",
      desc: "샴페인→블러시 그라데이션 + 기하학 눈꽃 — 따뜻하고 우아한 스타일", layoutHint: "warm",
      aiPrompt: `[CRITICAL — THIS IS A PREMIUM POSTER, NOT A CHRISTMAS CARD]
DO NOT add any information the user did not provide.
DO NOT write any placeholder hospital name.

Korean hospital event/promotion poster — Blush Warm theme. Pure design style — works for ANY type of event.

BACKGROUND: Warm gradient — soft champagne (#fef3c7) at top through blush pink (#fce7f3) at middle to warm cream (#fefce8) at bottom. Across ENTIRE background: geometric snowflake crystals (hexagonal, precise, NOT cartoon) in white at 6-10% opacity, various sizes. GEOMETRIC and ELEGANT.

TYPOGRAPHY HERO (top 40%): Deep wine red (#881337) title — bold, 36pt+, modern sans-serif with slight serif accent. Below: thin rose-gold (#b76e79) line (1px, width 20%). Below: subtitle in warm brown (#78350f), 14pt.

CONTENT AREA (middle 35%): White card (rounded 16px, warm shadow rgba(252,231,243,0.5)). Warm brown text inside. Numbers in bold wine (#9f1239).

FOOTER (bottom 25%): Warm gradient continues. Small warm brown text. Rose-gold line above.

BANNED: No scarves, no mugs, no mittens, no Christmas trees, no Santa. Geometric snowflakes + warm gradient is the mood signal.

STRICT ANCHORS: Champagne-to-blush gradient, geometric snowflake crystals, wine red typography, rose-gold accents, white card, luxury warm mood.
INSPIRED FREEDOM: Gradient warmth, snowflake style, wine red shade, card treatment.
Mobile readability: title 32pt+, body 12pt+.`,
    },
  ],

  // ─── 의사 소개 (6개) ───
  // 연구 기반: 좌우 분할 레이아웃 우세, 자격증 목록, 스튜디오 촬영 사진(백의), 중립 배경
  // 의료법 준수: 최고/유일/첫 등 최상급 표현 금지, 미검증 비교 금지
  // 색상: 화이트/라이트그레이 + 네이비(신뢰), 브랜드 컬러 악센트바, 베이지/크림(피부과)
  doctor: [
    {
      id: 'doc_portrait_formal', name: '매거진 커버', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '매거진 커버형 + 하단 정보 오버레이',
      layoutHint: 'portrait',
      aiPrompt: `Korean hospital doctor profile — formal, authoritative, top photo + bottom info.
TOP SECTION (55%): Light gray (#f1f5f9) or soft blue tint background. Hospital name with short accent underline at top-left. Large circular photo placeholder centered — white fill, soft shadow. This is a professional headshot area (white coat, neutral background).
BOTTOM SECTION (45%): Clean white band. Doctor name in massive bold navy (#1e40af, 32px, weight 800). Rounded navy pill badge with white text for specialty (e.g., "치과 전문의"). Credentials listed below in clean gray text — each on its own line (학력, 경력, 자격). Clear separation between photo zone and info zone.
Information hierarchy: photo → name → specialty badge → credentials. Formal, trustworthy. Korean medical law: no superlatives.`,
    },
    {
      id: 'doc_friendly_curve', name: '친근한 곡선', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '민트 곡선 + 인사말 강조 (가정의학)',
      layoutHint: 'curve',
      aiPrompt: `Korean neighborhood clinic doctor profile — friendly, approachable, mint/green accent.
BACKGROUND: Clean white with very subtle mint (#ecfdf5) tint.
TOP (15%): Hospital name in small green (#10b981) text centered.
MIDDLE-TOP (35%): Large circular photo placeholder centered — white fill, thin green (#10b981) border, soft shadow. Professional headshot area.
MIDDLE-BOTTOM (30%): Doctor name in large bold green (#10b981, 28px, weight 800) centered. Specialty in green accent text (e.g., "가정의학과 전문의"). Credentials listed in gray text — clean bullet points or vertical list.
BOTTOM (20%): Doctor greeting message in warm gray italic (e.g., "온 가족의 주치의가 되겠습니다"). Hospital name small at bottom.
Rounded, soft shapes throughout. Friendly, warm, patient-first aesthetic. Green = health, freshness. For family medicine, pediatrics, neighborhood clinics.`,
    },
    {
      id: 'doc_modern_split', name: '모던 분할', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '좌우 2단 분할 — 좌측 사진+우측 정보, 한국 병원 가장 보편적 레이아웃, 종합병원/전문의 프로필',
      layoutHint: 'split',
      aiPrompt: `Korean hospital doctor profile — left-right split layout (가장 많이 사용되는 의사 소개 형식). Inspired by 네이버 병원 찾기 의사 프로필 and 병원 홈페이지 의료진 소개.

=== ZONE LAYOUT (horizontal split: left photo | right info) ===
LEFT PANEL (42% width, full height):
  Light indigo (#eef2ff) background, full height. Hospital name "○○병원" in small indigo (#6366f1, 10px) at top-left corner (8px margin). Large circular photo placeholder centered both horizontally and vertically within panel (diameter ~70% of panel width). White fill, indigo (#6366f1, 2px) border, soft shadow (0 4px 16px rgba(0,0,0,0.08)). Professional studio headshot: white coat, neutral background, shoulders-up. Below photo: thin indigo decorative line (50% of panel width) centered.

RIGHT PANEL (58% width, full height):
  White background. Content vertically centered with top padding ~15%.
  ROW 1 – NAME: Doctor name "박○○" in bold indigo (#6366f1, 28px, weight 800). Left-aligned.
  ROW 2 – SPECIALTY BADGE: Rounded indigo (#6366f1) pill badge "정형외과 전문의" in white text (12px, bold). 8px below name.
  ROW 3 – CREDENTIALS: Structured list, 12px below badge:
    • "학력: 연세대학교 의과대학 졸업" (gray #4b5563, 12px)
    • "경력: ○○대학교병원 정형외과 전임의" (gray, 12px)
    • "전공: 관절경 수술, 스포츠 의학" (gray, 12px)
    • "학회: 대한정형외과학회 정회원" (gray, 12px)
  Each with small indigo (#6366f1) dot bullet. 5px line spacing.
  ROW 4 – GREETING: Thin indigo hairline above (80% width). "환자 한 분 한 분에게 정성을 다하겠습니다" in italic gray (#6b7280, 12px). 12px below credentials.

=== SPLIT DIVIDER ===
Vertical thin indigo (#6366f1, 1px opacity 30%) line between left and right panels, or clean edge with no visible divider.

=== STRICT MODE ANCHORS ===
• Left-right split must be maintained (not top-bottom)
• Photo on left, info on right (never reversed)
• Split ratio: 42/58 (± 5%)
• Photo always circular within left panel
• Credentials structured as labeled list (학력/경력/전공/학회)
• Korean medical law: NEVER use 최고, 유일, 첫, 가장 or any superlative

=== INSPIRED MODE FREEDOM ===
• Split ratio can shift 35/65 to 50/50
• Left panel background tint can vary
• Photo shape can be rounded rectangle
• Divider can be visible line, color edge, or gradient blend
• Right panel can have subtle indigo accent bar at top

=== MOBILE READABILITY ===
• Doctor name ≥ 24px. Credentials ≥ 11px. Badge ≥ 11px.
• On very narrow canvas, layout can stack vertically (photo top, info bottom)
• Credential labels (학력/경력) in bold for scanability`,
    },
    {
      id: 'doc_warm_story', name: '따뜻한 스토리', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '좌측 사이드바+우측 인사말 매거진 — 인사말이 주역, 소형 프로필 사이드바, 소아과/가정의학 친화',
      layoutHint: 'story',
      aiPrompt: `Korean hospital doctor profile — magazine-style with sidebar photo and greeting as main content. Inspired by 소아과/가정의학과 블로그형 원장 인사말 페이지.

=== ZONE LAYOUT (horizontal: narrow sidebar | wide content) ===
LEFT SIDEBAR (22% width, full height):
  Warm orange (#f97316) at 8% opacity fill, full height. Top (20% of sidebar): small circular photo placeholder (diameter ~80% of sidebar width), centered. White fill, thin orange (#f97316, 1.5px) border. Below photo: doctor name "이○○ 원장" in warm orange (#f97316, 13px, weight 700) centered. Bottom of sidebar: hospital name "○○소아과" in tiny orange (#ea580c, 9px) centered. Thin orange (#f97316, 1px) right border separating sidebar from main.

RIGHT MAIN AREA (78% width, full height):
  Warm cream (#fff7ed) background.
  ZONE A – GREETING (top 50%): Generous padding (20px top, 16px sides). Doctor greeting in warm dark gray (#374151, 16px, line-height 1.8, weight 400): e.g. "아이들의 건강한 성장을 위해 항상 곁에서 함께하겠습니다. 작은 증상도 꼼꼼히 살피고, 부모님의 걱정을 덜어드리는 의사가 되겠습니다." This is the MAIN CONTENT — 2–3 sentences of warm, personal commitment. Opening quotation mark "「" in large orange (#f97316, 32px) as decorative element at top-left of greeting.
  ZONE B – CREDENTIALS (middle 30%): Thin orange hairline above. Specialty "소아청소년과 전문의" in bold orange (#f97316, 14px). Below: credentials as pipe-separated byline: "고려대 의대 졸업 | ○○병원 소아과 전임의 | 대한소아과학회 정회원" in gray (#6b7280, 11px, line-height 1.6).
  ZONE C – FOOTER (bottom 20%): Thin orange hairline above. Hospital name + contact in small gray (10px).

=== STRICT MODE ANCHORS ===
• Sidebar always on LEFT, narrow (20–25% width)
• Greeting text is the dominant content (largest text area)
• Photo is small and contained in sidebar (not main area)
• Sidebar has tinted background; main area has cream/white
• Korean medical law: NEVER use 최고, 유일, 첫, 가장 or any superlative
• Greeting must be warm and patient-centered, never boastful

=== INSPIRED MODE FREEDOM ===
• Sidebar can be right instead of left
• Greeting can be 1–4 sentences
• Decorative quotation mark style can vary (「」, "", ornamental)
• Sidebar tint color intensity can vary 5–15%
• Credentials can be vertical list instead of pipe-separated

=== MOBILE READABILITY ===
• Greeting text ≥ 14px with line-height ≥ 1.6
• Doctor name ≥ 12px. Credentials ≥ 10px.
• Sidebar photo ≥ 48px diameter
• On narrow canvas, sidebar can collapse to horizontal strip at top`,
    },
    {
      id: 'doc_dark_luxury', name: '다크 럭셔리', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '다크 네이비+골드 전면 — VIP 원장 프로필, 성형외과/에스테틱 특화, 골드 프레임+코너 장식',
      layoutHint: 'luxury',
      aiPrompt: `Korean premium clinic doctor profile — dark navy full-bleed with gold accents. Inspired by 청담/강남 성형외과 VIP 원장 소개 페이지 and 호텔급 피부과 브랜딩.

=== ZONE LAYOUT (centered vertical axis on dark background) ===
ZONE A – BRAND HEADER (10%): Deep navy (#0f172a) background. Hospital name "○○성형외과" in small gold (#d4a017, 11px, letter-spacing 3px) centered. Thin gold horizontal rule (0.5px, 40% width) below.
ZONE B – PHOTO SHOWCASE (40%): Navy background continues. Circular photo placeholder centered (diameter ~50% of canvas width). Gold (#d4a017, 2.5px) ring border around photo. Four L-shaped gold corner brackets positioned at corners of an imaginary square around the photo (each bracket ~12px). Inside photo: professional studio headshot — white coat or suit, dark/neutral background. Subtle gold glow effect (box-shadow 0 0 20px rgba(212,160,23,0.15)) around photo.
ZONE C – IDENTITY + CREDENTIALS (35%): Doctor name "최○○ 대표원장" in bold gold (#d4a017, 28px, weight 800) centered. Below: specialty "성형외과 전문의" in smaller gold (#b8860b, 14px) centered. Thin gold line (30% width) divider. Credentials in light gray (#94a3b8, 12px) centered, each on own line:
  • "서울대학교 의과대학 졸업"
  • "○○대학교병원 성형외과 전문의 취득"
  • "대한성형외과학회 정회원"
  • "대한미용성형외과학회 정회원"
  5px line spacing. No bullets — clean centered lines.
ZONE D – FOOTER (15%): Thin gold horizontal line (60% width). Hospital name in small gold (#d4a017, 10px) centered. "상담 예약: 02-XXX-XXXX" in muted gold (#b8976a, 10px) below.

=== FRAMING ===
Gold double-line border around entire canvas: outer 1px, inner 0.5px, 5px gap. Creates luxury frame effect.

=== STRICT MODE ANCHORS ===
• Navy (#0f172a) background must be full bleed — no white areas anywhere
• Gold (#d4a017) and gray (#94a3b8) are the only text colors
• Corner brackets around photo always present
• Photo always circular with gold ring border
• Zone proportions: 10/40/35/15 (± 3%)
• Korean medical law: NEVER use 최고, 유일, 첫, 가장, 독보적 or any superlative

=== INSPIRED MODE FREEDOM ===
• Corner brackets can be ornamental flourishes or minimal angles
• Gold ring can have double-ring effect
• Subtle navy gradient (radial, slightly lighter center) allowed
• Credentials can have small gold dot separators
• Additional decorative thin gold lines between credential items

=== MOBILE READABILITY ===
• Doctor name ≥ 24px. Credentials ≥ 11px.
• Photo diameter ≥ 40% of canvas width
• Gold text on navy must maintain contrast ratio ≥ 4.5:1
• Frame border inset ≥ 6px from canvas edge`,
    },
    {
      id: 'doc_clean_grid', name: '클린 그리드', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '2x2 인포그래픽 카드 그리드 — 자격사항 4분할 카드, 빠른 스캔 최적화, 치과/종합병원 특화',
      layoutHint: 'grid',
      aiPrompt: `Korean hospital doctor profile — infographic 2x2 card grid layout for credential highlights. Inspired by 네이버 의사 프로필 카드 and 병원 앱 의료진 정보 UI.

=== ZONE LAYOUT (vertical: photo header + grid + footer) ===
ZONE A – PHOTO + NAME (30%): Light sky blue (#f0f9ff) gradient to white background. Hospital name "○○치과" in small sky blue (#0ea5e9, 10px) top-left. Circular photo placeholder centered (diameter ~40% of canvas width). White fill, sky blue (#0ea5e9, 2px) border, soft shadow. Below photo: doctor name "정○○ 원장" in bold sky blue (#0ea5e9, 24px, weight 800) centered. "치과보존과 전문의" in sky blue (#0284c7, 13px) centered below name.

ZONE B – CREDENTIAL GRID (45%): White background. 2x2 grid of info cards with 8px gap between cards. Each card: white fill, subtle sky blue (#0ea5e9, 1px) border, radius 8px, soft shadow (0 1px 4px rgba(0,0,0,0.05)), internal padding 10px.
  Card layout — sky blue label at top (bold, 10px, letter-spacing 1px, uppercase-style) + value text below in dark gray (#1f2937, 12px):
  TOP-LEFT card:  "학력" → "서울대학교 치의학대학원"
  TOP-RIGHT card: "전공" → "근관치료, 심미수복"
  BOTTOM-LEFT card:  "경력" → "○○병원 보존과 5년"
  BOTTOM-RIGHT card: "학회" → "대한치과보존학회 정회원"
  Each card identical size (48% width, auto height). Grid centered in zone.

ZONE C – FOOTER (15%): Light sky blue (#f0f9ff) background. Hospital name in small gray (10px) centered. Optional: rounded sky blue (#0ea5e9) pill badge with specialty summary.

=== STRICT MODE ANCHORS ===
• 2x2 grid layout must be maintained (4 cards)
• Each card has identical dimensions and styling
• Card labels are always: 학력, 전공, 경력, 학회 (in this order)
• Photo above grid, footer below grid
• Zone proportions: 30/45/15 (± 3%, remaining 10% spacing)
• Korean medical law: NEVER use 최고, 유일, 첫, 가장 or any superlative

=== INSPIRED MODE FREEDOM ===
• Grid can shift to 1x4 vertical stack on narrow canvas
• Cards can have colored left-border accent instead of full border
• Card backgrounds can have subtle sky blue tint
• Additional 5th card can be added as full-width row below grid
• Icons can accompany card labels (🎓 학력, 🏥 경력, 📋 전공, 🏛️ 학회)

=== MOBILE READABILITY ===
• Doctor name ≥ 20px. Card labels ≥ 10px. Card values ≥ 11px.
• Card minimum width: 45% of canvas width
• Card internal padding ≥ 8px
• Grid gap ≥ 6px for touch-friendly separation`,
    },
  ],

  // ─── 공지사항 (6개) ───
  // 연구 기반: 똑닥 템플릿(PDF/PPT/SNS), 중앙 단일카드, 구조화된 행, 연락처 포함
  // 색상: 화이트+네이비/다크그레이(기본), 계절 악센트(핑크/오렌지), 서브듀드 전문적
  notice: [
    {
      id: 'ntc_bulletin_board', name: '클린 블루 안내', color: '#2563eb', accent: '#1d4ed8', bg: '#eff6ff',
      desc: '블루 헤더+오버랩 카드 표준형 — 똑닥/병원 표준 공지 포맷, 일반 긴급도, 구조화된 항목 나열',
      layoutHint: 'bulletin',
      aiPrompt: `Korean hospital official notice — standard blue header + overlapping white card. Modeled on 똑닥 공지 템플릿 and 네이버 예약 병원 공지 스타일. Normal urgency level.

=== ZONE LAYOUT (header + overlapping card) ===
ZONE A – BLUE HEADER (35%): Solid blue (#2563eb) full-width block. Hospital name "○○병원" in small white (11px) top-center. Below: notice title e.g. "진료시간 변경 안내" or "휴진 안내" in large bold white (26px, weight 800) centered. Optional subtitle "안내드립니다" in white (13px, opacity 80%) below title.
ZONE B – OVERLAPPING CARD (50%): Light blue (#eff6ff) background behind card. White rounded card (radius 12px, shadow 0 4px 16px rgba(0,0,0,0.08)), width 90%, overlapping Zone A bottom edge by ~10%. Inside card, structured content:
  • "📅 기간: 2024.03.01(금) ~ 03.05(수)" — bold dark text (13px)
  • "📋 사유: 병원 내부 시설 보수 공사" — gray text (13px)
  • "🏥 대체진료: ○○병원 (02-XXX-XXXX)" — gray text (13px)
  • "⏰ 재개일: 2024.03.06(목) 정상 진료" — bold dark text (13px)
  Each item with blue (#2563eb) dot bullet, 8px vertical spacing. Key info (dates, contact) in bold (#1f2937), supporting text in gray (#4b5563).
ZONE C – CTA + CONTACT (15%): Light blue background continues. Full-width rounded blue (#2563eb) button "전화 문의하기" in bold white (15px). Below: "📞 대표전화: 02-XXX-XXXX | 진료시간: 평일 09:00~18:00" in gray (10px) centered.

=== EMERGENCY CONTACT BAR ===
At very bottom: thin light blue (#dbeafe) bar, full width. "응급 시 연락처: 02-XXX-XXXX" in blue (#2563eb, 11px) centered.

=== INFO HIERARCHY ===
1st: Notice title (largest, white on blue) 2nd: Key dates/period (bold in card) 3rd: Details (gray in card) 4th: CTA button 5th: Contact info

=== STRICT MODE ANCHORS ===
• Blue header + white overlapping card structure must be maintained
• Card overlaps header bottom edge
• Structured bullet items inside card (not free-flowing text)
• Emergency contact bar at bottom
• Zone proportions: 35/50/15 (± 3%)

=== INSPIRED MODE FREEDOM ===
• Number of bullet items can vary (3–6)
• Icons/emojis beside items can be omitted or changed
• Card can have blue left-border accent
• Header can have subtle gradient (blue to darker blue)
• Additional "참고사항" section inside card allowed

=== MOBILE READABILITY ===
• Title ≥ 22px. Card items ≥ 12px. Contact ≥ 10px.
• Card width 85–95% of canvas. Card padding ≥ 14px.
• CTA button tap target ≥ 44px height`,
    },
    {
      id: 'ntc_modern_alert', name: '코럴 공지', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '긴급 경고 배너형 — 긴급 휴진/응급 안내, 높은 긴급도, 응급연락처 강조 바, 대체병원 정보 포함',
      layoutHint: 'alert',
      aiPrompt: `Korean hospital URGENT notice — red alert banner for 긴급 휴진, 응급 상황, 긴급 변경. HIGH urgency level. Inspired by 병원 긴급공지 카카오톡 알림톡 디자인.

=== ZONE LAYOUT (alert banner + content + emergency bar) ===
ZONE A – ALERT BANNER (25%): Solid coral-red (#ef4444) full-width block. Hospital name "○○병원" in small white (10px) top-left. Center: "⚠️ 긴급 안내" or "긴급 휴진 안내" in large bold white (28px, weight 800). Below title: "긴급" pill badge (white border, white text "URGENT", 10px) for additional emphasis.
ZONE B – CONTENT CARD (45%): Light red (#fef2f2) background. White rounded card (radius 10px, shadow 0 2px 12px rgba(0,0,0,0.08)), width 90%. Inside card, structured with red (#ef4444) left border accent (3px):
  • "🚨 휴진 기간: 2024.03.01(금) ~ 03.03(일)" — bold dark text (14px, weight 700)
  • "📋 사유: 의료진 긴급 사정" — gray text (13px)
  • "🏥 대체 병원: ○○의원 (도보 5분)" — gray text (13px)
  • "📍 대체 병원 주소: 서울시 ○○구 ○○로 123" — gray text (12px)
  • "⏰ 정상 진료 재개: 2024.03.04(월)" — bold dark text (14px)
  Each with 8px vertical spacing. Dates and key info in bold (#1f2937).
ZONE C – EMERGENCY CONTACT BAR (15%): Rounded pill bar with light red (#fef2f2) background, red (#ef4444) border (1.5px), centered. Inside: "📞 응급 연락처: 010-XXXX-XXXX (24시간)" in bold red (#dc2626, 14px). This is the most prominent contact element.
ZONE D – CLOSING (15%): White background. "환자분들께 불편을 드려 진심으로 죄송합니다." in gray italic (12px) centered. Hospital name "○○병원 원장 ○○○" in small gray (10px). "대표전화: 02-XXX-XXXX" in gray (10px).

=== STRICT MODE ANCHORS ===
• Red alert banner always at top — signals urgency immediately
• Emergency contact bar must be prominently displayed (not buried in text)
• Card must have red left-border accent
• "긴급" or "URGENT" indicator always visible
• Zone proportions: 25/45/15/15 (± 3%)
• Apology closing message always present

=== INSPIRED MODE FREEDOM ===
• Alert icon can be ⚠️, 🚨, or ❗
• Card can have full red border instead of left-only
• Emergency bar can be full-width strip instead of pill shape
• Additional "안내" items can be added (3–7 items)
• Banner can have gradient (red to darker red)

=== MOBILE READABILITY ===
• Alert title ≥ 24px. Emergency phone ≥ 13px. Card items ≥ 12px.
• Emergency contact bar always visible without scrolling
• Card padding ≥ 12px. Red border accent ≥ 3px for visibility`,
    },
    {
      id: 'ntc_soft_info', name: '라벤더 안내', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '번호 매긴 필 카드 3단 — 낮은 긴급도, 피부과/소아과 친화, 변경사항을 단계별로 안내',
      layoutHint: 'soft',
      aiPrompt: `Korean hospital soft notice — numbered pill cards for friendly step-by-step announcements. LOW urgency level. For 진료시간 변경, 리모델링 안내, 새 서비스 도입. Preferred by 피부과/에스테틱/소아과. Inspired by 카카오톡 채널 안내 메시지 디자인.

=== ZONE LAYOUT (vertical: header + 3 numbered cards + CTA) ===
ZONE A – HEADER (20%): Soft lavender (#f5f3ff) background. Rounded lavender (#8b5cf6) circle icon with white "ℹ" (or 📢) centered at top (32px diameter). Below: notice title e.g. "진료시간 변경 안내" or "새로운 서비스 안내" in bold purple (#8b5cf6, 22px, weight 800) centered. Hospital name "○○피부과" in small gray (#6b7280, 10px) centered below title.

ZONE B – NUMBERED CARDS (50%): Lavender background continues. 3 pill-shaped cards stacked vertically with 8px gap:
  CARD 1: White card (radius 20px, shadow 0 1px 6px rgba(0,0,0,0.05)), width 90%. Left: purple (#8b5cf6) circle with white "1" (bold, 14px). Right: "변경사항: 오후 진료시간이 18:00에서 19:00으로 연장됩니다" in dark gray (#374151, 13px). Internal padding 12px.
  CARD 2: Same style. Circle "2". "적용일: 2024년 3월 1일(금)부터 적용" in dark gray.
  CARD 3: Same style. Circle "3". "참고사항: 토요일 진료시간은 변동 없습니다 (09:00~13:00)" in dark gray.
  Each card identical dimensions. Content left-aligned after number circle.

ZONE C – CTA + FOOTER (20%): Rounded purple (#8b5cf6) pill button "자세히 보기" or "문의하기" in bold white (14px), centered, 70% width. Below: "문의: 02-XXX-XXXX" in gray (10px). 10px below: thin lavender bar full-width with "응급 연락처: 010-XXXX-XXXX" in purple (#7c3aed, 10px) centered.

=== STRICT MODE ANCHORS ===
• Exactly 3 numbered pill cards (no more, no fewer)
• Cards have pill shape (high border-radius ≥ 20px)
• Number circles on left, text on right within each card
• Lavender/purple palette throughout — no warm or contrasting colors
• Zone proportions: 20/50/20 (± 3%, remaining 10% spacing)
• Emergency contact bar at bottom

=== INSPIRED MODE FREEDOM ===
• Number of cards can extend to 4–5 for complex notices
• Card shape can be standard rounded rectangle instead of pill
• Number indicators can be icons instead of numbers
• Background can have subtle gradient (lavender to white)
• Cards can have left purple border accent instead of number circle

=== MOBILE READABILITY ===
• Title ≥ 20px. Card text ≥ 12px. Number in circle ≥ 13px.
• Card padding ≥ 10px. Cards width 85–95% of canvas.
• CTA button tap target ≥ 44px height`,
    },
    {
      id: 'ntc_corporate_formal', name: '공식 문서', color: '#1f2937', accent: '#111827', bg: '#f9fafb',
      desc: '공문서 이중선 형식 — 대학병원/종합병원 공식 고지, 원장 명의 발신, 무채색 권위체',
      layoutHint: 'formal',
      aiPrompt: `Korean hospital official document notice — formal 공문서 style. Used by 대학병원/종합병원 for 원장 명의 공지, 법적 고지, 정책 변경, 의료수가 변경. FORMAL urgency level. Inspired by Korean government 공문서 and 대한병원협회 공지 양식.

=== ZONE LAYOUT (document format with double-line borders) ===
ZONE A – TOP BORDER + HEADER (15%): Pure white (#ffffff) background. Double horizontal lines at top: thick line (2px, charcoal #1f2937) above, thin line (0.5px, charcoal) below, 4px gap. Below lines: hospital name "○○대학교병원" in formal charcoal (#1f2937, 16px, weight 700, letter-spacing 3px) centered. Optional small hospital logo placeholder above name.

ZONE B – TITLE (12%): "공 지 사 항" in very large bold charcoal (#111827, 28px, weight 900, letter-spacing 8px) centered. Thin charcoal hairline (40% width) below title.

ZONE C – BODY CONTENT (48%): Left-aligned with 24px left indent. All text in charcoal (#1f2937) on white. Structured as formal numbered items:
  "1. 변경 내용: 2024년 3월 1일부로 외래 진료시간이 아래와 같이 변경됩니다." (13px)
  "   - 평일: 09:00 ~ 17:30 (변경 전: 09:00 ~ 17:00)" (12px, gray #4b5563)
  "   - 토요일: 09:00 ~ 12:30 (변경 없음)" (12px, gray)
  "2. 적용일: 2024년 3월 1일(금)" (13px)
  "3. 사유: 의료진 진료 환경 개선" (13px)
  "4. 문의: 원무과 02-XXX-XXXX (내선 XXX)" (13px)
  Numbered items in bold charcoal. Sub-items indented with dash. 6px line spacing.

ZONE D – CLOSING (15%): "위 사항을 안내드리오니 양해하여 주시기 바랍니다." in charcoal (12px) centered. 16px gap. "○○대학교병원" in bold charcoal (14px) centered. "병원장 ○○○" in charcoal (12px) centered. Double horizontal lines at bottom matching top border.

=== EMERGENCY CONTACT ===
Below bottom border: "응급실: 02-XXX-XXXX (24시간)" in small charcoal (#374151, 10px) centered.

=== STRICT MODE ANCHORS ===
• Double-line borders at TOP and BOTTOM — defining feature
• Black/white/charcoal only — NO colors, NO decorations, NO icons
• Left-aligned body with indent (공문서 style)
• Numbered items for content (not bullets)
• Closing with hospital name + 원장 title
• Zone proportions: 15/12/48/15 (± 3%, remaining 10% spacing)

=== INSPIRED MODE FREEDOM ===
• Number of body items can vary (2–6)
• Indent depth can vary (16–32px)
• Letter-spacing in title can vary
• Light gray (#f9fafb) background instead of pure white allowed
• Sub-items can use ·, -, or ① style markers

=== MOBILE READABILITY ===
• Title ≥ 24px. Body text ≥ 12px. Closing ≥ 11px.
• Left indent ≥ 16px. Right margin ≥ 16px.
• Double lines must be visible (top line ≥ 1.5px thick)`,
    },
    {
      id: 'ntc_card_popup', name: '민트 팝업', color: '#06b6d4', accent: '#0891b2', bg: '#ecfeff',
      desc: '다크 배경+플로팅 모달 카드 — 신규 개원/장비 도입/특별 안내, 중간 긴급도, 팝업 주목 효과',
      layoutHint: 'popup',
      aiPrompt: `Korean hospital modern popup-style notice — dark overlay with floating white modal card. MEDIUM urgency level. For attention-grabbing announcements: 신규 개원, 최신 장비 도입, 진료과목 추가, 특별 안내. Inspired by 앱 팝업 공지 UI and 카카오톡 채널 공지 팝업.

=== ZONE LAYOUT (dark backdrop + centered modal card) ===
BACKGROUND: Dark semi-transparent overlay (#0f172a at 60% opacity) full bleed. Creates focus on the modal card.

MODAL CARD (centered, 85% width, ~75% height): White rounded card (radius 14px, shadow 0 8px 32px rgba(0,0,0,0.2)).
  CARD ZONE A – ICON + TITLE (20% of card): Rounded mint (#06b6d4) circle icon (48px diameter) with white "📢" or "🔔" centered, positioned at top-center of card (overlapping card top edge by 50%). Below icon: notice title e.g. "신규 장비 도입 안내" or "진료과목 확대 안내" in bold dark (#1f2937, 22px, weight 800) centered. Hospital name "○○병원" in gray (#6b7280, 11px) centered below.
  CARD ZONE B – CONTENT (50% of card): Structured items with generous spacing (10px between items):
    • "📅 적용일: 2024년 3월 1일(금)부터" — bold dark (13px)
    • "🔬 도입 장비: ○○○ (최신 CT 촬영 장비)" — gray (13px)
    • "💡 특징: 저선량 고해상도 촬영으로 정확한 진단 가능" — gray (13px)
    • "📍 위치: 본원 2층 영상의학과" — gray (12px)
    • "ℹ️ 참고: 기존 예약 환자분께는 개별 안내드립니다" — gray (12px)
  Each with mint (#06b6d4) dot bullet. Key info in bold (#1f2937).
  CARD ZONE C – CTA + CONTACT (20% of card): Rounded mint (#06b6d4) to teal (#0891b2) gradient button "확인했습니다" or "예약 문의" in bold white (15px), 70% width, centered. Below: "문의: 02-XXX-XXXX" in gray (10px).
  CARD ZONE D – EMERGENCY BAR (10% of card): Thin mint (#ecfeff) bar at card bottom with rounded bottom corners. "응급 연락처: 02-XXX-XXXX" in teal (#0891b2, 10px) centered.

=== STRICT MODE ANCHORS ===
• Dark overlay backdrop always present
• White modal card centered on dark background
• Icon circle overlaps card top edge
• Content structured as bulleted items (not paragraph text)
• CTA button inside card
• Emergency contact at card bottom
• Card proportions: 20/50/20/10 (± 3%)

=== INSPIRED MODE FREEDOM ===
• Icon can be any relevant emoji or abstract symbol
• Dark overlay opacity can vary 40–70%
• Card size can vary 75–90% width, 65–80% height
• Number of content items: 3–6
• CTA button text freely changeable
• Card can have mint top-border accent (3px)

=== MOBILE READABILITY ===
• Title ≥ 20px. Content items ≥ 12px. CTA ≥ 14px.
• Card internal padding ≥ 16px. CTA tap target ≥ 44px.
• Icon circle ≥ 40px diameter`,
    },
    {
      id: 'ntc_timeline', name: '그린 타임라인', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '변경 전/후 좌우 비교 카드 — 진료시간/위치/담당의 변경, 빨강→초록 시각 비교, 즉시 파악 가능',
      layoutHint: 'timeline',
      aiPrompt: `Korean hospital change notice — before/after side-by-side comparison cards. For 진료시간 변경, 위치 이전, 담당의 변경, 시스템 변경. MEDIUM urgency level. Inspired by 은행/관공서 변경 안내문 and 병원 리모델링 이전 공지.

=== ZONE LAYOUT (header + side-by-side cards + footer) ===
ZONE A – HEADER (18%): White background. Hospital name "○○의원" in green (#16a34a, 11px) top-left. Notice title e.g. "진료시간 변경 안내" or "병원 위치 이전 안내" in bold green (#22c55e, 24px, weight 800) centered. Thin green hairline (50% width) below title.

ZONE B – COMPARISON CARDS (50%): White background. Two cards side by side (each ~44% width, 8px gap between, centered):
  LEFT CARD "변경 전": Light red (#fef2f2) background, radius 10px, padding 12px.
    "변경 전" label in bold red (#ef4444, 14px, weight 700) at top.
    Thin red (#fca5a5) line below label.
    Content listed in dark gray (#374151, 12px):
      "평일: 09:00 ~ 17:00"
      "토요일: 09:00 ~ 12:00"
      "점심: 12:30 ~ 13:30"
    Each on own line, 5px spacing.
  CENTER ARROW: Between the two cards, vertically centered: green (#22c55e) circle (28px) with white "→" arrow inside. Represents the change direction.
  RIGHT CARD "변경 후": Light green (#f0fdf4) background, radius 10px, padding 12px.
    "변경 후" label in bold green (#22c55e, 14px, weight 700) at top.
    Thin green (#86efac) line below label.
    Content listed in dark gray (#1f2937, 12px, weight 600):
      "평일: 09:00 ~ 18:00" ← changed items in bold
      "토요일: 09:00 ~ 13:00" ← changed items in bold
      "점심: 12:30 ~ 13:30 (변동 없음)" ← unchanged in regular weight

ZONE C – DETAILS + CONTACT (22%): White background.
  "📅 적용일: 2024년 3월 1일(금)부터" in bold dark text (13px) centered.
  "참고하여 내원에 차질 없으시기 바랍니다." in gray italic (11px) centered.
  Thin green line divider.
  Contact bar: light green (#f0fdf4) rounded bar, full width. "📞 문의: 02-XXX-XXXX | 응급: 010-XXXX-XXXX" in green (#16a34a, 11px) centered.

=== STRICT MODE ANCHORS ===
• Two cards MUST be side by side (left = before, right = after)
• Left card red-tinted, right card green-tinted — color coding mandatory
• Arrow indicator between cards
• Changed items in right card must be visually differentiated (bold)
• Zone proportions: 18/50/22 (± 3%, remaining 10% spacing)
• Emergency/contact bar at bottom

=== INSPIRED MODE FREEDOM ===
• Arrow can be →, ▶, or animated-style chevron
• Cards can be stacked vertically on very narrow canvas
• Additional "변경 사유" section below cards allowed
• Card borders can be added for definition
• Background can have very subtle green tint instead of pure white

=== MOBILE READABILITY ===
• Title ≥ 20px. Card labels ≥ 13px. Card content ≥ 11px.
• Cards minimum width: 40% each. Gap ≥ 6px.
• Arrow circle ≥ 24px diameter
• Contact bar padding ≥ 8px`,
    },
  ],

  // ─── 명절 인사: 설날 (6개) ───
  // 연구 기반: 네이비+골드(보름달), 베이지+전통색동(현대적), 서예체 인사말
  // 캔바/미리캔버스 한국 명절 템플릿 패턴 참고, 2025 뱀띠해 등 동물 테마
  greeting_설날: [
    {
      id: 'grt_seol_traditional', name: '전통 한복', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '단청·기와지붕 격식 있는 전통 설날 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[설날 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 18% → 중앙 40% → 인사말 27% → 푸터 15%
• 단청(丹靑) 색상 팔레트: 적색 #dc2626, 금색 #d4a017, 버건디 #991b1b
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보 (ZONE 1 또는 ZONE 3)
• 휴진 기간 안내 영역 확보 (ZONE 3 카드 내부 하단)

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 매화·소나무 배치 각도 및 밀도 자유
• 한복 인물 실루엣 추가 가능
• 구름문·보상화문·당초문 등 전통 문양 선택 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 18%): 기와지붕(瓦) 실루엣이 전체 폭을 덮는 진한 버건디(#7f1d1d) 지붕선. 지붕 아래 중앙에 "새해 복 많이 받으세요" — 큰 금색(#fbbf24) 궁서체/캘리그래피. 병원명은 흰색 80% 불투명도로 바로 아래 작게 배치.

ZONE 2 — 메인 일러스트 (middle 40%): 중앙 구도 — 큰 원형 프레임 안에 금박 "福/복" 글자(#d4a017 shimmer). 원 좌측에서 소나무(松) 가지가 녹색 솔잎과 함께 뻗어 나오고, 우측에서 매화(梅) 가지가 분홍-흰 꽃과 함께 진입. 원 아래로 빨강·금 매듭(매듭) 장식 한 쌍이 대칭으로 늘어짐. 배경 전체에 단청 기하 패턴 10% 불투명도 오버레이.

ZONE 3 — 인사말·휴진 안내 (next 27%): 흰색 반투명 라운드 카드(85% opacity, border-radius 16px), 좌우 8% 여백. 카드 안: ① 2~3줄 새해 인사 (버건디 #7f1d1d, 중간 크기, line-height 1.6) ② 금색 가는 구분선 ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기). 카드 상하에 금색 세선 디바이더.

ZONE 4 — 푸터 (bottom 15%): 금색(#d4a017) 구름문(雲紋) 25% 불투명도로 좌→우 흐름. 중앙에 작은 치아 아이콘(금색 외곽선)에 한복 갓을 얹은 형태. "2026" 금색 작은 텍스트.

=== BACKGROUND ===
적색-버건디 그라디언트(#dc2626 → #991b1b) 전면. 금색 이중선 테두리 가장자리에서 3% 안쪽. 격조 있고 왕실풍의 설날 분위기 — 만화적 요소 없이 품격 유지.`,
    },
    {
      id: 'grt_seol_tteokguk', name: '떡국 일러스트', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '손그림 떡국·설 음식 수채화풍 따뜻한 인사장',
      layoutHint: 'warm',
      aiPrompt: `[설날 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 18% → 중앙 45% → 인사말 22% → 푸터 15%
• 수채화/손그림 일러스트 스타일 유지
• 인사말 텍스트 반드시 포함: "따뜻한 새해 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 떡국 그릇 디자인·반찬 종류 변형 가능
• 수저 배치 방향 자유
• 김치·나물 등 곁들임 반찬 구성 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 18%): "설날 인사드립니다" — 큰 볼드 따뜻한 갈색(#92400e) 손글씨풍 한글, 중앙 정렬. 병원명은 부드러운 오렌지(#ea580c) 작은 텍스트. 오렌지(#f97316) 점선 가로 구분선.

ZONE 2 — 메인 일러스트 (middle 45%): 중앙에 큰 수채화 떡국 그릇 — 흰 도자기 그릇에 파란 테두리 문양, 안에 흰 떡(가래떡 어슷썰기), 파 고명, 노란 지단, 김 가루. 그릇 위로 3줄기 물결 모양 수증기(따뜻한 흰색). 오른쪽에 나무 젓가락·금속 수저 가지런히 배치, 따뜻한 나무결 식탁면. 좌우 작은 그릇에 김치·나물 반찬. 전체 수채화 번짐 효과.

ZONE 3 — 인사말·휴진 안내 (next 22%): 부드러운 오렌지 테두리(#fdba74, 1px) 라운드 사각 카드, 흰색 90% 불투명도, border-radius 12px. 안: ① 따뜻한 새해 인사 (진한 갈색 #78350f, line-height 1.8) ② "따뜻한 새해 되세요" 볼드 오렌지(#f97316) 강조 ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 작은 치아 캐릭터(둥근 사각형, 점눈, 미소) — 요리사 모자 쓰고 작은 수저 들고 있는 선 드로잉, 따뜻한 갈색(#92400e) 외곽선. "2026" 및 병원 정보 작은 갈색 텍스트.

=== BACKGROUND ===
따뜻한 크림-복숭아 그라디언트(#fff7ed → #fed7aa). 수채화 텍스처 15% 불투명도. 상단 절반에 따뜻한 흰색 보케 원형 10% 불투명도. 포근하고 가정적인 설날 식사 초대 느낌.`,
    },
    {
      id: 'grt_seol_modern', name: '모던 세뱃돈', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '세뱃돈 봉투 중심 울트라클린 타이포그래피 인사장',
      layoutHint: 'minimal',
      aiPrompt: `[설날 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 타이포 30% → 푸터 15%
• 인디고+골드 2색 제한 팔레트
• 최대 여백(negative space) 원칙 — 장식 최소화
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 세뱃돈 봉투 기울기(0~10°) 자유
• 봉투 위 문양(격자문/빗살문 등) 선택 자유
• 추상 원형 장식 크기·위치 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): 병원명 — 작은 인디고(#4f46e5) 텍스트, 좌측 정렬 10% 좌여백. 아래 가는 인디고(#6366f1) 가로선 80% 폭 중앙 정렬.

ZONE 2 — 메인 비주얼 (middle 40%): 중앙에 단일 세뱃돈 봉투(세뱃돈 봉투) — 깨끗한 흰색 바탕에 인디고(#6366f1) 미니멀 선화. 봉투 상단에 골드(#d4a017) 봉인. 봉투 중앙에 골드 "복" 자. 봉투 5° 기울임. 뒤에 가는 골드 원 외곽선 하나. 그 외 요소 없음 — 극대화된 여백.

ZONE 3 — 타이포·휴진 안내 (next 30%): "새해 복 많이 받으세요" — 큰 볼드 인디고(#4f46e5) 현대 산세리프 한글, 중앙, letter-spacing 0.05em. 2줄 인사말 중간 회색(#64748b). "2026 설날" 골드(#d4a017) 악센트. 가는 구분선 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #94a3b8, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 작은 인디고 치아 아이콘(기하학/미니멀), 중앙. 병원 연락처 작은 회색(#94a3b8). 헤더와 동일한 가는 인디고 라인.

=== BACKGROUND ===
깨끗한 오프화이트(#eef2ff). 매우 희미한 격자문(#6366f1 at 5%) 배경 텍스처. 스위스/미니멀리스트 타이포그래피. 프리미엄 의료 브랜드 명절 카드.`,
    },
    {
      id: 'grt_seol_bokjumeoni', name: '복주머니', color: '#e11d48', accent: '#be123c', bg: '#fff1f2',
      desc: '복주머니·금동전 캐릭터 중심 귀여운 설날 카드',
      layoutHint: 'cute',
      aiPrompt: `[설날 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 인사말 25% → 푸터 15%
• 핑크-빨강-골드 파스텔 팔레트
• 치아 캐릭터(한복 착용) 반드시 포함
• 인사말 텍스트 반드시 포함: "복 많이 받으세요!"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 복주머니 색상·자수 문양 변형 가능
• 금동전 개수(5~10개)·배치 자유
• 캐릭터 표정·포즈 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): "복 많이 받으세요!" — 큰 볼드 로즈레드(#e11d48) 둥근 한글 폰트, 핑크 텍스트 쉐도우. 좌우에 작은 골드 악센트 마크. 병원명 작은 딥로즈(#be123c).

ZONE 2 — 메인 일러스트 (middle 45%): 복주머니 3개 가로 배열 — 좌(빨강 #dc2626, 금 졸라매), 중앙(가장 크게 1.3배, 핫핑크 #e11d48, 전통 꽃자수), 우(코랄 #fb7185, 금 졸라매). 각 복주머니에 금색 "복" 자수. 위로 금동전(사각 구멍 있는 동전) 5~7개 떠다님. 복주머니 사이에 치아 캐릭터 — 흰 둥근 사각형, 점눈, 미소, 분홍 볼, 핑크·노랑 한복 저고리 착용.

ZONE 3 — 인사말·휴진 안내 (next 25%): 핑크 테두리(#fda4af, 2px) 알약형 카드, 흰색 채움, border-radius 24px. 안: ① 밝은 새해 인사 (딥로즈 #9f1239, 둥근 서체) ② "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기) ③ 작은 ☘ 아이콘 불릿.

ZONE 4 — 푸터 (bottom 15%): 골드 외곽선 작은 행운 아이콘 가로 배열(말굽, 클로버, 동전). "2026" 핑크(#e11d48). 병원 정보 로즈(#be123c).

=== BACKGROUND ===
부드러운 로즈핑크 그라디언트(#fff1f2 → #fce7f3). 골드·빨강·핑크 작은 기하 도트 20% 불투명도. 중앙 따뜻한 방사 글로우(흰색 15%). 밝고 활기찬 가족 친화적 설날 카드.`,
    },
    {
      id: 'grt_seol_gold_luxury', name: '금박 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '버건디·금박 봉황 문양 프리미엄 설날 인사장',
      layoutHint: 'luxury',
      aiPrompt: `[설날 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 12% → 중앙 40% → 인사말 28% → 푸터 20%
• 버건디+골드 2색 한정 팔레트 — 다른 색상 절대 금지
• 금박(gold foil) 메탈릭 질감 전체 적용
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 보상화문/연꽃문/당초문 등 전통 문양 선택 자유
• 봉황 실루엣 크기·자세 자유
• 소나무 가지 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 상단 악센트 (top 12%): 금박 소나무(松) 가지 일러스트 — 60% 폭 중앙, 정밀한 솔잎 디테일(#d4a017), 금 시머 효과. 가지 끝에 작은 골드 도트.

ZONE 2 — 메인 센터피스 (middle 40%): 큰 원형 금 프레임(3px #d4a017 선, 반지름 ~30%). 원 안에 "복" — 초대형 금 캘리그래피(#fbbf24 → #d4a017 그라디언트), 붓터치 스타일. 원 둘레에 보상화문/연꽃문 금박 40% 불투명도 만다라형 링. 대각선 위치에 전통 모서리 장식 4개.

ZONE 3 — 인사말·휴진 안내 (next 28%): "새해 복 많이 받으세요" — 우아한 금색(#fbbf24) 세리프/캘리그래피 한글, 중앙, 넓은 자간. 금 디바이더 선(60% 폭). 2줄 인사말 부드러운 금(#d4a017 70%). 병원명 밝은 금. 구분선 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금색 #d4a017 50%, 작은 크기).

ZONE 4 — 푸터 (bottom 20%): 금박 엠보싱 효과 — 대칭 봉황(鳳凰) 실루엣 2마리(골드 25% 불투명도)가 방패형 치아 엠블럼 좌우 배치. "2026" 작은 골드 텍스트.

=== BACKGROUND ===
진한 버건디(#7f1d1d) 전면. 고급 리넨 텍스처 8% 불투명도. 금 이중선 장식 테두리 4% 안쪽, 모서리에 다이아몬드. 울트라 프리미엄 VIP 설날 카드.`,
    },
    {
      id: 'grt_seol_sunrise', name: '새해 일출', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '산 능선 위 해돋이·한옥 마을 수채화 풍경 인사장',
      layoutHint: 'nature',
      aiPrompt: `[설날 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 20% → 중앙 35% → 인사말 30% → 푸터 15%
• 새벽-일출 그라디언트 하늘 (네이비 → 앰버 → 골드)
• 3겹 산 능선 실루엣 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 한옥 마을 가옥 수(3~5채) 자유
• 산 능선 색조·곡선 자유
• 별·초승달 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 상단 하늘 (top 20%): 딥네이비-인디고(#1e3a5f → #312e81)에서 따뜻한 톤으로 전환. 흰 별 30% 불투명도 흩어짐. 우상단에 초승달 외곽선(연금 #fde68a, 15% 불투명도).

ZONE 2 — 일출·산 (middle 35%): 산 능선 뒤에서 떠오르는 태양 원반 — 빛나는 그라디언트 원(#fbbf24 → #f59e0b), 부드러운 금빛 광선 20% 불투명도 방사. 산 실루엣 3겹: 먼 산(먼지 보라 #6b5b73), 중간 산(따뜻한 갈색 #92400e 60%), 가까운 산(진한 앰버 #78350f). 산 사이 한옥(韓屋) 3~4채 — 곡선 기와 지붕, 굴뚝 연기.

ZONE 3 — 인사말·휴진 안내 (next 30%): 황금빛 일출 글로우 영역. "새해 복 많이 받으세요" — 큰 볼드 진한 갈색(#78350f) 우아한 한글, 골드 텍스트 쉐도우. 가는 금 디바이더(#d97706, 50% 폭). 2~3줄 인사 중간 갈색(#92400e). 병원명 앰버(#d97706). 구분선 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (갈색 #78350f 60%, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 하단 가장자리 소나무 실루엣(진한 앰버 #92400e 40%). 중앙 치아 아이콘(떠오르는 해 형태) 골드(#d97706) 외곽선. "2026" 따뜻한 금 텍스트.

=== BACKGROUND ===
새벽 하늘 그라디언트 — 딥네이비(#1e3a5f) → 앰버(#f59e0b) → 복숭아(#fbbf24) → 연금(#fffbeb). 한국 산 일출 수채화 풍경 — 새로운 시작의 평화로움.`,
    },
  ],

  // ─── 명절 인사: 추석 (6개) ───
  greeting_추석: [
    {
      id: 'grt_chsk_fullmoon', name: '보름달 전통', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '보름달·벼이삭·감 격식 있는 한가위 전통 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[추석 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 35% → 중앙 25% → 인사말 25% → 푸터 15%
• 네이비+골드 팔레트: #1a1a2e, #d4a017, #fbbf24
• 보름달(滿月) 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 달토끼 실루엣 투명도·크기 자유
• 벼이삭·감·밤 배치 구성 자유
• 팔각문/사각문 등 전통 문양 선택 자유

=== ZONE 구성 ===
ZONE 1 — 보름달 (top 35%): 중앙에 거대한 보름달 — 연금(#fde68a) → 따뜻한 흰색 그라디언트 원, 앰버(#f59e0b 30%) 외곽 글로우. 달 안에 달토끼(절구 찧는 모습) 실루엣 15% 불투명도. 달 가장자리에 따뜻한 금빛 구름 띠(#d4a017 15%).

ZONE 2 — 풍요 프레임 (middle 25%): 좌우 대칭 — 금색 벼이삭(#d4a017) 곡선으로 안쪽 향함. 중앙에 감(#ea580c) 2~3개 + 밤(#92400e) 2개. 빨강·금 매듭 장식 악센트.

ZONE 3 — 인사말·휴진 안내 (next 25%): "풍성한 한가위 보내세요" — 큰 볼드 금색(#fbbf24) 캘리그래피 한글, 중앙. 금 다이아몬드 장식 디바이더. 2~3줄 추석 인사 부드러운 금(#d4a017 80%). 병원명 밝은 금. 「 」스타일 금 괄호 프레임. 아래에 "휴진 안내: OO월 OO일 ~ OO월 OO일" (금 50%, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 금색 구름문(#d4a017 20%) 하단 흐름. 치아 아이콘(보름달 모티프) 금 외곽선. "2026 추석" 우아한 금 텍스트.

=== BACKGROUND ===
딥 네이비(#1a1a2e) → 다크 앰버(#451a03) 그라디언트. 팔각문 5% 불투명도 골드 오버레이. 가을밤 하늘 분위기 — 장엄하고 격조 있는 한가위.`,
    },
    {
      id: 'grt_chsk_songpyeon', name: '송편 일러스트', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '손그림 송편·과일 수채화풍 따뜻한 추석 인사장',
      layoutHint: 'warm',
      aiPrompt: `[추석 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 18% → 중앙 45% → 인사말 22% → 푸터 15%
• 수채화/손그림 일러스트 스타일 유지
• 송편 일러스트 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "건강한 한가위 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 송편 색상·개수(8~12개) 자유
• 과일 종류(배, 감, 대추, 밤) 구성 자유
• 소반/접시 디자인 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 18%): "즐거운 추석 보내세요" — 큰 볼드 진녹(#15803d) 손글씨풍. 좌우 솔가지(#22c55e) 일러스트. 병원명 짙은 녹색(#166534). 점선 녹색 구분선.

ZONE 2 — 메인 일러스트 (middle 45%): 둥근 나무 소반 위 솔잎 깔고 송편 8~10개 — 흰색, 연분홍(#fda4af), 연녹(#86efac), 연노랑(#fde68a) 반달형. 한 개는 깨/팥 소 단면. 주변에 배(좌), 감(#ea580c 우), 대추·밤. 갓 찐 송편 수증기. 수채화 번짐 효과.

ZONE 3 — 인사말·휴진 안내 (next 22%): 연녹 테두리(#86efac, 1.5px) 라운드 카드, 흰색 92%, border-radius 14px. 안: ① 추석 인사 (진녹 #14532d, line-height 1.7) ② "건강한 한가위 되세요" 볼드 녹색(#15803d) ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기). 송편 아이콘 불릿.

ZONE 4 — 푸터 (bottom 15%): 작은 치아 캐릭터(앞치마, 송편 들고 있는 포즈) 녹색(#15803d) 선 드로잉. "2026" 및 병원 정보 진녹 텍스트.

=== BACKGROUND ===
세이지그린-크림 그라디언트(#f0fdf4 → #fefce8). 수채화 워시 12% 불투명도. 솔잎 패턴 5% 대각선. 포근한 가족 모임 초대 느낌.`,
    },
    {
      id: 'grt_chsk_modern', name: '모던 한가위', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '기하학적 보름달·토끼 울트라클린 추석 카드',
      layoutHint: 'minimal',
      aiPrompt: `[추석 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 타이포 30% → 푸터 15%
• 인디고+실버그레이 2색 한정 — 따뜻한 색 절대 금지
• 최대 여백 원칙
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 토끼 실루엣 포즈(앉기/서기) 자유
• 단풍잎 위치·크기 자유
• 원(보름달) 선 두께(1~3px) 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): 병원명 인디고(#4f46e5) 산세리프, 좌측 10%. 인디고(#6366f1) 가로선 80% 폭. "추석" 라벨 우측 정렬 작은 인디고.

ZONE 2 — 메인 비주얼 (middle 40%): 큰 원(보름달) — 인디고(#6366f1, 2px) 외곽선만, 채움 없음. 원 안 하단 1/3에 토끼 실루엣(#4f46e5) 미니멀 기하학. 토끼 아래 절구 선화. 원 바깥 우하에 단풍잎 하나(#a5b4fc 40%). 극대화된 여백.

ZONE 3 — 타이포·휴진 안내 (next 30%): "풍성한 한가위 보내세요" — 큰 볼드 인디고(#4f46e5) 산세리프, letter-spacing 0.05em. 2줄 인사말 회색(#64748b). "2026 추석" 실버(#a5b4fc). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #94a3b8, 작은 크기).

ZONE 4 — 푸터 (bottom 15%): 기하학 치아 아이콘 인디고 외곽선, 중앙. 병원 연락처 회색(#94a3b8). 인디고 가로선.

=== BACKGROUND ===
깨끗한 오프화이트(#eef2ff). 희미한 기하 그리드(#6366f1 4%). 스위스 미니멀리즘 — 세련되고 지적인 의료 브랜드 추석 카드.`,
    },
    {
      id: 'grt_chsk_rabbit', name: '토끼 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '달토끼·치아 캐릭터 떡 찧기 귀여운 추석 카드',
      layoutHint: 'cute',
      aiPrompt: `[추석 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 인사말 25% → 푸터 15%
• 핑크-라벤더-골드 파스텔 팔레트
• 달토끼 캐릭터 + 치아 캐릭터 반드시 포함
• 인사말 텍스트 반드시 포함: "즐거운 한가위!"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 토끼 의상(한복 색상) 변형 가능
• 떠다니는 낙엽 수·색상 자유
• 캐릭터 표정·포즈 자유

=== ZONE 구성 ===
ZONE 1 — 상단 헤더 (top 15%): "즐거운 한가위!" — 큰 볼드 핫핑크(#ec4899) 둥근 한글, 핑크 텍스트 쉐도우. 좌우 금색 초승달·별. 병원명 딥핑크(#be185d).

ZONE 2 — 메인 일러스트 (middle 45%): 연노랑(#fef3c7) 보름달 원 배경 중앙. 달 위에 달토끼 캐릭터 — 큰 눈, 핑크 귀속(#f9a8d4), 분홍 볼(#fda4af), 파스텔 핑크 한복 저고리 착용, 떡메로 떡 찧는 모습. 떡 조각 위로 튕김. 옆에 치아 캐릭터(흰 둥근 사각형, 점눈, 큰 미소, 핑크 리본) — 라벤더 한복 치마, 부채 들고 있음. 주변에 단풍잎(빨강 #ef4444), 은행잎(노랑 #fbbf24), 파스텔 송편 떠다님.

ZONE 3 — 인사말·휴진 안내 (next 25%): 핑크 테두리(#f9a8d4, 2px) 알약형 카드, 흰색 95%, border-radius 24px. 안: ① 추석 인사 (딥핑크 #9f1239, 둥근 서체) ② "달토끼와 함께 행복한 추석!" 볼드 핑크(#ec4899) ③ "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c). ☽ 아이콘 불릿.

ZONE 4 — 푸터 (bottom 15%): 작은 캐릭터 아이콘 가로 반복(토끼, 달, 송편, 단풍잎, 치아) 핑크(#ec4899) 외곽선. "2026 추석" 핑크 텍스트. 병원 정보 로즈(#be185d).

=== BACKGROUND ===
핑크-라벤더 그라디언트(#fdf2f8 → #f3e8ff). 금·핑크 작은 별 20% 불투명도. 상단 따뜻한 핑크 글로우(#fda4af 10%). 가족 친화적 소아/가족 치과 추석 카드.`,
    },
    {
      id: 'grt_chsk_premium', name: '달빛 프리미엄', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '네이비·금박 보름달 감나무 프리미엄 추석 인사장',
      layoutHint: 'luxury',
      aiPrompt: `[추석 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 12% → 중앙 40% → 인사말 28% → 푸터 20%
• 네이비+골드 2색 한정 — 다른 색상 절대 금지
• 금박 메탈릭 질감 전체 적용
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 감나무 가지 각도·감 개수 자유
• 제수용 과일 구성 자유
• 봉황 실루엣 크기·자세 자유

=== ZONE 구성 ===
ZONE 1 — 상단 악센트 (top 12%): 좌우 대칭 금박 벼이삭(#d4a017) — 좌우에서 중앙으로 곡선. 이삭 끝 금 도트. 중앙 상단에 달 떠오르는 은은한 금빛 글로우.

ZONE 2 — 달빛 센터피스 (middle 40%): 거대한 보름달 — 금 그라디언트(#fbbf24 → #d4a017), 사실적 달 표면 텍스처, 금 할로 효과(#f59e0b 25%). 달 안에 토끼 실루엣(깊은 금 12%). 좌우에 금박 감나무 가지 — 양쪽 감 2개씩(#b8860b). 달 아래 제수 과일(배, 사과, 밤) 금 실루엣.

ZONE 3 — 인사말·휴진 안내 (next 28%): "풍성한 한가위 보내세요" — 큰 우아한 금(#fbbf24) 캘리그래피. 연꽃 모티프 금 디바이더. 2줄 인사말 부드러운 금(#d4a017 70%). 병원명 밝은 금. 「 」금 괄호 프레임. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #d4a017 50%, 작은 크기).

ZONE 4 — 푸터 (bottom 20%): 금박 봉황 2마리 대칭(20% 불투명도) + 방패형 치아 엠블럼(초승달 디테일, #d4a017). "2026 추석" 금 텍스트. 파도문 10% 하단.

=== BACKGROUND ===
미드나잇 네이비(#1a1a2e) 전면. 실크 텍스처 6% 불투명도. 금 이중선 장식 테두리 4% 안쪽, 모서리 한국 전통 장식. VIP 프리미엄 추석 카드.`,
    },
    {
      id: 'grt_chsk_autumn', name: '가을 풍경', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
      desc: '단풍·황금 들판·초가집 수채화 가을 풍경 인사장',
      layoutHint: 'nature',
      aiPrompt: `[추석 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 25% → 중앙 35% → 인사말 25% → 푸터 15%
• 가을 석양 그라디언트 (복숭아 → 앰버 → 번트오렌지)
• 한국 가을 시골 풍경 필수
• 인사말 텍스트 반드시 포함: "풍성한 한가위 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 기러기 V자 편대 수(3~7마리) 자유
• 초가집/감나무 배치 자유
• 단풍나무 색조 비율 자유

=== ZONE 구성 ===
ZONE 1 — 하늘·보름달 (top 25%): 복숭아-앰버 석양 하늘. 우상에 보름달(연크림 #fef3c7, 글로우 20%). 기러기 V자 편대(3~5마리) 갈색(#92400e 30%) 실루엣.

ZONE 2 — 가을 풍경 (middle 35%): 수채화 한국 가을 시골 파노라마 — 빨강(#dc2626)·번트오렌지(#ea580c)·금노랑(#f59e0b) 단풍나무 언덕. 황금 들판 사이 오솔길. 중경에 초가집(볏짚 지붕, 굴뚝 연기). 감나무(밝은 주황 감). 전경 좌우에 클로즈업 단풍 가지 프레이밍. 수채화 번짐 효과.

ZONE 3 — 인사말·휴진 안내 (next 25%): 반투명 따뜻한 흰색 카드(88%, border-radius 14px), 번트오렌지 테두리(#fb923c, 1px). 안: ① "풍성한 한가위 보내세요" 큰 볼드 진갈(#78350f) ② 2~3줄 인사 중갈(#92400e) ③ "건강하고 행복한 추석 되세요" 번트오렌지(#ea580c) 볼드 ④ "휴진 안내: OO월 OO일 ~ OO월 OO일" (갈색 #92400e 60%, 작은 크기). 단풍잎 아이콘 악센트.

ZONE 4 — 푸터 (bottom 15%): 낙엽(단풍·은행) 수채화 40% 불투명도 하단 가장자리. 치아 아이콘(단풍잎 악센트, #ea580c 외곽선). "2026 추석" 갈색(#92400e) 텍스트.

=== BACKGROUND ===
가을 석양 그라디언트 — 연복숭아(#fff7ed) → 앰버(#fed7aa) → 번트오렌지(#ea580c 20%). 수채화 워시 15% 불투명도. 한국 가을 시골 풍경 — 풍요와 향수.`,
    },
  ],

  // ─── 명절 인사: 새해 (6개) ───
  greeting_새해: [
    {
      id: 'grt_newy_fireworks', name: '불꽃놀이', color: '#7c3aed', accent: '#6d28d9', bg: '#f5f3ff',
      desc: '밤하늘 불꽃·도시 스카이라인 화려한 새해 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[새해(양력 1/1) — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 40% → 중앙 20% → 인사말 15% → 푸터 10% (나머지 여유)
• 퍼플-골드-네이비 팔레트: #7c3aed, #FFD700, #0f0a2e
• "2026" 연도 표시 필수 (큰 타이포)
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 불꽃 폭발 개수(3~7개)·색상 배합 자유
• 도시 스카이라인 실루엣 유무 자유
• 별 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 불꽃 (top 40%): 3~5개 큰 불꽃 폭발 — 금(#FFD700), 퍼플(#7c3aed), 일렉트릭블루(#3b82f6). 방사 얇은 선 + 빛나는 파티클 트레일. 폭발 중심 블룸/글로우 효과. 희미한 연기 흔적.

ZONE 2 — 연도 표시 (center, 20%): "2026" — 초대형 볼드(48px, weight 900) 따뜻한 금(#FFD700), 글로우(#fbbf24 40%, 8px blur). 주변에 작은 금 기하 악센트(사각·원) 30~60% 불투명도.

ZONE 3 — 인사말·휴진 안내 (next 15%): "새해 복 많이 받으세요" — 흰색(24px, weight 700), 금빛 텍스트 쉐도우. 병원명 금(#FFD700, 14px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (흰 60%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 10%): 희미한 도시 스카이라인 실루엣(다크 네이비 #1a1a4e, 20%). 가는 금 그라디언트 선(1px). 위로 사라지는 작은 금 파티클.

=== BACKGROUND ===
딥 미드나잇 네이비(#0f0a2e) → 다크 퍼플(#1a0533) 그라디언트. 작은 별 15% 불투명도. 화려하고 축제적인 자정 파티 분위기.`,
    },
    {
      id: 'grt_newy_champagne', name: '샴페인 토스트', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '블랙·골드 샴페인 건배 럭셔리 새해 카드',
      layoutHint: 'luxury',
      aiPrompt: `[새해(양력 1/1) — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 45% → 중앙 15% → 인사말 20% → 푸터 8% (나머지 여유)
• 블랙+골드 2색 한정
• 샴페인 글라스 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 샴페인 거품 개수·크기 자유
• 컨페티/리본 밀도 자유
• 글라스 각도 자유

=== ZONE 구성 ===
ZONE 1 — 샴페인 글라스 (top 45%): 두 개의 우아한 샴페인 플루트 중앙에서 건배 — 금(#d4a017) 라인아트, 메탈릭 광택. 금 거품(4~8px 원) 위로 올라감(20~80% 불투명도). 건배 지점에 스플래시 + 방사 금 방울.

ZONE 2 — 셀러브레이션 악센트 (middle 15%): 얇은 금(#FFD700) 컨페티 조각 + 작은 별 — 30~60% 불투명도, 랜덤 회전. 좌우에서 곡선 금 리본 스트리머.

ZONE 3 — 인사말·휴진 안내 (next 20%): "Happy New Year" 우아한 세리프(16px, gold #d4a017, letter-spacing 3px). "새해 복 많이 받으세요" 흰색(22px, weight 700). 병원명 금(#b8860b, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #d4a017 50%, 작은 크기).

ZONE 4 — 하단 테두리 (bottom 8%): 장식적 금 이중선 테두리. 중앙 하단 작은 금 리본.

=== BACKGROUND ===
딥 블랙(#0a0a0a) → 차콜(#1a1a1a) 그라디언트. 대각선 금 시머 줄 5% 불투명도. 블랙타이 갈라 미학 — 고급스럽고 세련된 축하.`,
    },
    {
      id: 'grt_newy_minimal', name: '미니멀 2026', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '"2026" 대형 타이포 중심 울트라미니멀 새해 카드',
      layoutHint: 'minimal',
      aiPrompt: `[새해(양력 1/1) — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 20% → 중앙 35% → 인사말 20% → 하단 15% (나머지 여유)
• 네이비+골드+화이트 3색 한정
• "2026" 초대형 타이포 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 숫자 서체 선택 자유
• 드롭 쉐도우 유무 자유
• 가로선 위치·길이 자유

=== ZONE 구성 ===
ZONE 1 — 상단 여백 (top 20%): 빈 흰 공간. 가는 네이비(#1e40af 8%) 가로선, 60% 폭, 중앙.

ZONE 2 — 연도 타이포 (center, 35%): "2026" — 울트라볼드 산세리프(72px, weight 900, 네이비 #1e40af). 타이트 letter-spacing(-2px). 미묘한 드롭 쉐도우. 수평 중앙 지배적 존재감.

ZONE 3 — 인사말·휴진 안내 (next 20%): "새해 복 많이 받으세요" 네이비(#1e3a8a, 18px, weight 500). 가는 금(#d4a017) 가로선 40px, 1px. 병원명 연네이비(#93c5fd, 12px, letter-spacing 3px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연네이비 #93c5fd 60%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 빈 흰 공간. 여백의 미.

=== BACKGROUND ===
순수 화이트(#ffffff). 텍스처·그라디언트 없음. 울트라 미니멀리스트, 타이포그래피 중심 그래픽 디자인. 스칸디나비안 감성.`,
    },
    {
      id: 'grt_newy_confetti', name: '컨페티 파티', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '파스텔 컨페티·파티모자 캐릭터 귀여운 새해 카드',
      layoutHint: 'cute',
      aiPrompt: `[새해(양력 1/1) — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 35% → 중앙 25% → 캐릭터 20% → 하단 15% (나머지 여유)
• 파스텔 멀티컬러 팔레트 (핑크, 골드, 스카이블루, 민트, 라벤더)
• 파티 캐릭터 반드시 포함
• 인사말 텍스트 반드시 포함: "2026 새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 기하 도형 종류·크기·밀도 자유
• 풍선 개수·색상 자유
• 캐릭터 소품(뿔나팔/깃발/폭죽) 자유

=== ZONE 구성 ===
ZONE 1 — 기하 악센트 (top 35%): 컬러풀 기하 도형 흩뿌림 — 원, 둥근 사각, 삼각형. 핑크(#ec4899), 골드(#fbbf24), 스카이블루(#38bdf8), 민트(#34d399), 라벤더(#a78bfa). 4~12px, 랜덤 회전, 40~90% 불투명도. 상단 모서리 근처 파티모자 2개(핑크+금줄).

ZONE 2 — 인사 배너 (center, 25%): 핑크(#ec4899 90%) 라운드 사각 배너. 흰색 볼드 "2026 새해 복 많이 받으세요"(22px, weight 800). 양옆 별 장식. 배너 아래 풍선 2개(핑크·골드) 곱슬 줄.

ZONE 3 — 캐릭터·휴진 안내 (next 20%): 3개 작은 축하 캐릭터(둥근 얼굴, 파티모자, 분홍 볼, 행복 표정) 가로 배열, 각자 뿔나팔/깃발 들고. 파스텔. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (핑크 #be185d 50%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 병원명 핑크(#be185d, 13px). 작은 기하 도형 20% 불투명도 이어짐.

=== BACKGROUND ===
소프트 핑크(#fdf2f8) → 화이트 그라디언트. 즐겁고 활기찬 가족 친화적 파티 무드.`,
    },
    {
      id: 'grt_newy_sunrise', name: '첫 일출', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '바다 위 첫 일출·2026 수채화 풍경 새해 인사장',
      layoutHint: 'nature',
      aiPrompt: `[새해(양력 1/1) — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 45% → 중앙 20% → 인사말 20% → 하단 10% (나머지 여유)
• 인디고 → 오렌지 → 골드 → 복숭아 하늘 그라디언트
• 바다/해안 일출 풍경 필수
• "2026" 연도 표시 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 구름 형태·밀도 자유
• 잔별 밀도 자유
• 바다 색조 자유

=== ZONE 구성 ===
ZONE 1 — 하늘·구름 (top 45%): 수채화 스타일 드라마틱 구름 — 아래에서 금오렌지 빛. 구름 가장자리 골드(#fbbf24) 하이라이트. 밤 인디고 → 새벽 오렌지 전환. 좌상단에 사라지는 별 2~3개(15%).

ZONE 2 — 일출 수평선 (middle, 20%): 바다 수평선에서 반원 태양 떠오름 — 따뜻한 광선(얇은 선, 금 #FFD700, 10~30%) 부채꼴. 바다 표면 금빛 반사, 오렌지(#ea580c 20%) 잔물결. "2026" 구름/광선 속에 은은하게 형성(30%, 36px).

ZONE 3 — 인사말·휴진 안내 (next 20%): "새해 복 많이 받으세요" 따뜻한 갈색(#92400e, 22px, weight 700), 은은한 글로우. 병원명 오렌지(#ea580c, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (갈색 #92400e 50%, 작은 크기).

ZONE 4 — 하단 바다 (bottom 10%): 잔잔한 바다 수면 뮤트 틸(#0d9488 30%), 수채화 워시.

=== BACKGROUND ===
그라디언트 하늘 — 딥 인디고(#312e81) → 오렌지(#f97316) → 골드(#fbbf24) → 복숭아(#fed7aa). 장엄하고 희망적인 새 시작의 풍경.`,
    },
    {
      id: 'grt_newy_clock', name: '자정 시계', color: '#64748b', accent: '#475569', bg: '#f8fafc',
      desc: '빈티지 회중시계 자정 카운트다운 따뜻한 새해 카드',
      layoutHint: 'warm',
      aiPrompt: `[새해(양력 1/1) — 따뜻한/빈티지]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 10% → 중앙 50% → 인사말 20% → 하단 8% (나머지 여유)
• 슬레이트+골드+세피아 팔레트
• 12시 가리키는 시계 메인 비주얼 필수
• "2026" 연도 표시 필수
• 인사말 텍스트 반드시 포함: "새해 복 많이 받으세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 시계 장식 디테일(톱니바퀴 등) 자유
• 로마/아라비아 숫자 선택 자유
• 세피아 워시 강도 자유

=== ZONE 구성 ===
ZONE 1 — 장식 상단 (top 10%): 가는 장식선 슬레이트(#64748b 15%). 작은 톱니바퀴 아이콘 중앙(16px, 슬레이트 30%).

ZONE 2 — 시계 페이스 (center, 50%): 큰 빈티지 회중시계 — 금(#d4a017) 이중원 테두리, 로마숫자(XII 상단, 슬레이트 #475569). 금(#b8860b) 장식 시·분침 12시 가리킴. 세밀한 눈금. 6시 위치 서브다이얼에 톱니바퀴 디테일(슬레이트 20%). 전체 세피아 톤 워시(#92400e 5%).

ZONE 3 — 인사말·휴진 안내 (next 20%): "새해 복 많이 받으세요" 슬레이트(#475569, 20px, weight 700). "2026" 금(#d4a017, 14px, weight 600, letter-spacing 4px). 병원명 연슬레이트(#94a3b8, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (슬레이트 #94a3b8 50%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 8%): 상단과 대칭 장식선. 좌우 작은 스크롤워크 장식.

=== BACKGROUND ===
따뜻한 오프화이트(#f8fafc), 빈티지 종이 텍스처 5% 불투명도. 우아하고 빈티지한 자정의 순간 — 따뜻함과 클래식.`,
    },
  ],

  // ─── 명절 인사: 어버이날 (6개) ───
  greeting_어버이날: [
    {
      id: 'grt_parent_carnation', name: '카네이션 전통', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '빨간 카네이션 테두리 격식 있는 어버이날 감사 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[어버이날 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 10% → 메인 40% → 인사말 25% → 하단 10% (나머지 여유)
• 레드+크림 팔레트: #dc2626, #991b1b, #fef2f2
• 카네이션 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보 (어버이날은 5/8이므로 연휴 휴진 있을 수 있음)

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 카네이션 꽃잎 디테일 수준 자유
• 리본 색상·형태 자유
• 테두리 꽃봉오리 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 꽃 테두리 (outer border, 10% inset): 빨간(#dc2626) 카네이션 꽃잎 테두리 — 사면 가장자리에 작은 꽃봉오리·녹색 잎 수채화 스타일(60~80% 불투명도). 모서리에 2~3송이 풀블룸 클러스터.

ZONE 2 — 메인 카네이션 (center-top, 40%): 큰 사실적 빨간 카네이션(#dc2626) 중심 — 겹겹이 쌓인 꽃잎 텍스처, 가장자리에 연핑크(#fca5a5) 하이라이트. 진녹(#166534) 줄기 + 잎 2개. 줄기 아래 녹색 새틴 리본 매듭. 꽃 아래 부드러운 그림자(4px blur, 10%).

ZONE 3 — 인사말·휴진 안내 (center-lower, 25%): "감사합니다" — 우아한 붓글씨체(28px, weight 700, 딥레드 #991b1b). "어버이날을 축하합니다" 따뜻한 회색(#78716c, 14px). 병원명 레드(#b91c1c, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c 60%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 10%): 흩어지는 작은 카네이션 꽃잎(5~7개, 회전, 20~40% 불투명도). 가는 레드(#dc2626) 선 10%.

=== BACKGROUND ===
따뜻한 크림(#fef2f2) → 소프트 화이트 그라디언트. 전통적이고 진심 어린 한국식 감사 미학.`,
    },
    {
      id: 'grt_parent_watercolor', name: '수채화 꽃다발', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8',
      desc: '루즈한 수채화 카네이션 꽃다발 감성 인사장',
      layoutHint: 'warm',
      aiPrompt: `[어버이날 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 50% → 좌우 10% → 인사말 25% → 하단 10% (나머지 여유)
• 수채화 페인팅 스타일 — 하드 아웃라인 없음
• 카네이션 꽃다발 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 카네이션 색상 배합(핑크/레드/코랄) 자유
• 수채화 번짐·드립 정도 자유
• 잎사귀 톤(녹색/민트) 자유

=== ZONE 구성 ===
ZONE 1 — 수채화 꽃다발 (top-center, 50%): 자유롭고 표현적인 수채화 카네이션 꽃다발 — 5~7송이 다양한 핑크(#f472b6, #ec4899, #fda4af)와 레드(#ef4444). 보이는 붓자국, 꽃잎 만나는 곳 색 번짐. 녹색(#86efac) 줄기·잎 웻온웻 효과. 꽃다발 하단 물감 드립·스플래시(핑크 15%). 모든 요소 부드럽고 회화적.

ZONE 2 — 예술적 스플래시 (sides, 10%씩): 좌우 여백에 추상 수채화 도트·스플래시(핑크+민트그린) 15~25% 불투명도.

ZONE 3 — 인사말·휴진 안내 (center-lower, 25%): "감사합니다" — 손글씨 붓스크립트(26px, weight 600, 따뜻한 핑크 #ec4899), 자연스러운 획 두께 변화. "사랑하는 부모님께" 소프트 회색(#9ca3af, 13px, 손글씨). 병원명 핑크(#f472b6, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #9ca3af 50%, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 희미한 블러시 핑크(#fce7f3) 수채화 워시 줄무늬 20% 불투명도.

=== BACKGROUND ===
소프트 핑크 워시(#fdf2f8), 수채화 종이 텍스처(미세 결, 8%). 회화적 아름다움으로 표현하는 가족 사랑.`,
    },
    {
      id: 'grt_parent_modern', name: '모던 감사', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '카네이션 선화 울트라클린 미니멀 감사 카드',
      layoutHint: 'minimal',
      aiPrompt: `[어버이날 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 20% → 중앙 35% → 타이포 25% → 하단 15% (나머지 여유)
• 인디고+화이트 2색 한정
• 최대 여백 원칙
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 카네이션 선화 디테일 수준 자유
• 하트 외곽선 유무·위치 자유
• 선 두께(1~2px) 자유

=== ZONE 구성 ===
ZONE 1 — 상단 여백 (top 20%): 순수 흰 공간. 인디고(#6366f1 6%) 가로선 50% 폭, 중앙.

ZONE 2 — 카네이션 선화 (center, 35%): 단일 우아한 카네이션 — 인디고(#6366f1) 세밀한 선화(1.5px), 미니멀 디테일, 건축 도면 스타일. 기하학적 꽃잎 형태. 곧은 줄기 + 잎 2개. 외곽선만 — 채움 없음. 꽃 우상에 작은 하트 외곽선(인디고 15%).

ZONE 3 — 타이포·휴진 안내 (next 25%): "감사합니다" — 현대 산세리프(28px, weight 700, 인디고 #4f46e5), letter-spacing 1px. 가는 인디고 선 30px, 30% 불투명도. 병원명 연인디고(#a5b4fc, 12px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연인디고 #a5b4fc 50%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 작은 하트 외곽선 2개 인디고 8%, 중앙에서 약간 어긋남. 깨끗한 흰 공간.

=== BACKGROUND ===
화이트(#ffffff) → 매우 희미한 인디고(#eef2ff) 그라디언트. 선화의 세련됨 + 최대 여백. 절제된 의료 브랜드 우아함.`,
    },
    {
      id: 'grt_parent_photo', name: '포토 프레임', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '폴라로이드·카네이션 화환 스크랩북 귀여운 감사 카드',
      layoutHint: 'cute',
      aiPrompt: `[어버이날 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 좌우 15%씩 → 하단 15% (나머지 여유)
• 오렌지+크림+핑크 따뜻한 팔레트
• 폴라로이드 프레임 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "소중한 우리 가족"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 프레임 기울기(0~5°) 자유
• 스크랩북 스티커 종류·배치 자유
• 카네이션 화환 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 장식 상단 (top 15%): 오렌지(#f97316) 외곽선 스캘럽 에지 배너 — "Happy Parents Day" 손글씨(14px, weight 600). 좌우 하트 낙서(오렌지).

ZONE 2 — 포토 프레임 (center, 40%): 폴라로이드 스타일 흰 프레임(3° 기울임, 드롭쉐도우 4px 10%). 상단 하트 모양 클립(#ea580c). 프레임 안 복숭아(#fed7aa) → 오렌지(#fdba74) 그라디언트 플레이스홀더. 아래 "소중한 우리 가족" 손글씨(12px, 회색 #78716c). 프레임 위로 카네이션 화환 아치(핑크·레드 꽃봉오리 + 녹색 덩굴).

ZONE 3 — 스크랩북·휴진 안내 (sides, 15%씩): 하트 낙서, 별 스티커, 마스킹테이프(오렌지 줄무늬), "LOVE" 원형 스탬프 — 30~50% 불투명도. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (오렌지 #ea580c 50%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 병원명 오렌지(#ea580c, 13px). 손그림 화살표. 작은 카네이션 스티커.

=== BACKGROUND ===
따뜻한 크림(#fff7ed), 크래프트 종이 텍스처 6% 불투명도. 가족 앨범 스크랩북 감성 — 귀엽고 진심 어린.`,
    },
    {
      id: 'grt_parent_gold', name: '금장 카네이션', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '버건디·금박 카네이션 메탈릭 프리미엄 감사 카드',
      layoutHint: 'luxury',
      aiPrompt: `[어버이날 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 8% → 메인 40% → 인사말 25% → 하단 10% (나머지 여유)
• 버건디+골드 2색 한정
• 금박 카네이션 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 코너 플로리시 스타일 자유
• 카네이션 꽃잎 금박 광택 강도 자유
• 리본 형태 자유

=== ZONE 구성 ===
ZONE 1 — 금 프레임 (outer border, 8% inset): 장식적 금(#d4a017) 이중선 프레임 — 코너 스크롤워크 플로리시. 안쪽 선 1px, 바깥 선 2px, 4px 간격. 금 80% 불투명도, 메탈릭 광택.

ZONE 2 — 금 카네이션 (center-top, 40%): 메탈릭 금(#d4a017) 카네이션 일러스트, 밝은 금(#FFD700) 하이라이트. 포일 스탬핑 효과 — 꽃잎에 은은한 광택 그라디언트. 줄기·잎 다크 골드(#92400e). 줄기에 금 리본 매듭, 흐르는 리본 꼬리. 꽃 주변 금 글로우(8px blur, 15%).

ZONE 3 — 인사말·휴진 안내 (center-lower, 25%): "감사합니다" 금(#FFD700, 26px, weight 700, 세리프). 메탈릭 포일 텍스트. "어버이날을 축하합니다" 연금(#fde68a, 13px). 병원명 금(#d4a017, 13px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #fde68a 50%, 작은 크기).

ZONE 4 — 하단 악센트 (bottom 10%): 중앙 작은 금 리본 매듭 일러스트. 가는 금 선 20%.

=== BACKGROUND ===
딥 버건디(#450a0a) → 다크 와인(#7f1d1d) 그라디언트. 엠보싱 리넨 텍스처 5% 불투명도. 프리미엄 금박 우아함 — 고급 의료 브랜드.`,
    },
    {
      id: 'grt_parent_garden', name: '정원 풍경', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '아침 햇살 카네이션 정원 수채화 풍경 감사 카드',
      layoutHint: 'nature',
      aiPrompt: `[어버이날 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 25% → 중앙 40% → 인사말 20% → 하단 10% (나머지 여유)
• 녹색+따뜻한 자연색 팔레트
• 카네이션 정원 풍경 필수
• 인사말 텍스트 반드시 포함: "감사합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 정원 벤치 유무 자유
• 오솔길 형태 자유
• 나비 실루엣 유무 자유

=== ZONE 구성 ===
ZONE 1 — 하늘·빛 (top 25%): 부드러운 파란 하늘 + 흰 구름 2~3개. 우상에서 대각선 아침 햇살(#fbbf24 10%) 부채꼴. 평화로운 아침 분위기.

ZONE 2 — 카네이션 정원 (center, 40%): 풍성한 정원 장면 — 빨강(#dc2626), 핑크(#f472b6), 흰 카네이션 밀집 열. 수채화 보태니컬 스타일. 높이·개화 정도 다양. 풍성한 녹색(#22c55e) 잎. 중앙에 따뜻한 돌색(#d6d3d1) 오솔길. 우측에 나무 정원 벤치(꽃에 둘러싸인).

ZONE 3 — 인사말·휴진 안내 (lower, 20%): "감사합니다" 진녹(#15803d, 24px, weight 700). "사랑과 감사를 담아" 따뜻한 녹색(#4ade80, 13px). 병원명 녹색(#22c55e, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (녹색 #22c55e 50%, 작은 크기).

ZONE 4 — 하단 정원 가장자리 (bottom 10%): 잔디 텍스처 녹색(#86efac 15%) 페이드아웃. 우하단에 나비 실루엣(녹색 20%).

=== BACKGROUND ===
소프트 모닝 스카이 블루(#f0fdf4) → 가든 그린(#dcfce7) 그라디언트. 금빛 워시 8% 불투명도. 평화로운 카네이션 정원의 아침 햇살.`,
    },
  ],

  // ─── 명절 인사: 크리스마스 (6개) ───
  greeting_크리스마스: [
    {
      id: 'grt_xmas_tree', name: '크리스마스 트리', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '오너먼트·가랜드 장식 트리 전통 크리스마스 인사장',
      layoutHint: 'traditional',
      aiPrompt: `[크리스마스 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 50% → 인사말 20% → 하단 10% (나머지 여유)
• 녹색-빨강-골드 클래식 크리스마스 팔레트
• 크리스마스 트리 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 오너먼트 색상 조합 자유
• 트리 형태(뾰족/넓은) 자유
• 선물 상자 개수(2~5개) 자유

=== ZONE 구성 ===
ZONE 1 — 별 트리토퍼 (top 15%): 큰 금별(#FFD700) 트리 꼭대기, 방사 광선(얇은 선 8%). 주변 반짝임 도트(금 3~5px, 30%).

ZONE 2 — 크리스마스 트리 (center, 50%): 삼각형 상록수 — 진녹(#22c55e → #15803d) 그라디언트. 겹겹이 가지 텍스처. 장식: 컬러풀 오너먼트 볼(빨강 #dc2626, 금 #d4a017, 파랑 #3b82f6, 8~12px 원), 반짝이 라이트 도트(흰/노랑 3px, 글로우), 금 가랜드(#d4a017) 물결 드레이핑. 따뜻한 갈색(#92400e) 줄기.

ZONE 3 — 선물·인사·휴진 안내 (next 20%): 트리 아래 선물 상자 3~4개(빨강·녹색·금, 리본 매듭). "Merry Christmas" 빨강(#dc2626, 12px, letter-spacing 2px). "메리 크리스마스" 녹색(#15803d, 22px, weight 700). 병원명 빨강(#b91c1c, 13px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (회색 #78716c, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 바닥 금빛 글로우(8%). 가는 녹색 장식선.

=== BACKGROUND ===
따뜻한 크림(#fffbeb) → 소프트 화이트 그라디언트. 중앙 따뜻한 방사 글로우(금 #fbbf24 3%). 클래식 거실 크리스마스 분위기.`,
    },
    {
      id: 'grt_xmas_snow', name: '눈 내리는 밤', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: '눈 덮인 마을·가로등 수채화 겨울밤 풍경 카드',
      layoutHint: 'nature',
      aiPrompt: `[크리스마스 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 전면 눈 오버레이 → 마을 45% → 인사말 25% → 하단 10% (나머지 여유)
• 딥블루-화이트 겨울밤 팔레트
• 눈 내리는 마을 풍경 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 집 수(3~5채)·스타일 자유
• 가로등 유무 자유
• 눈송이 크기·밀도 자유

=== ZONE 구성 ===
ZONE 1 — 눈 (full overlay): 전체에 눈송이 파티클 — 작은 도트(2~3px, 흰, 40~70%) + 큰 결정 눈송이(8~12px, 흰, 20~30%, 육각형). 크기 변화로 깊이감. 일부에 모션 블러.

ZONE 2 — 마을 풍경 (center-bottom, 45%): 아늑한 집 3~4채 — 눈 덮인 지붕(흰 #f0f9ff 두꺼운 캡), 창문에서 따뜻한 금빛(#fbbf24) 빛. 우측 교회 첨탑. 수채화 스타일, 부드러운 가장자리. 눈 덮인 대지(연파랑흰 #e0f2fe). 좌측 빈티지 가로등 — 금빛 글로우 원(#fbbf24 30%, 40px 반지름).

ZONE 3 — 인사말·휴진 안내 (upper-center, 25%): "Merry Christmas" 흰(14px, letter-spacing 3px, 80%). "메리 크리스마스" 흰(22px, weight 700), 글로우 텍스트 쉐도우. 병원명 아이스블루(#7dd3fc, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (흰 50%, 작은 크기).

ZONE 4 — 하단 눈밭 (bottom 10%): 물결 모양 눈 덮인 대지, 수채화 가장자리 페이드아웃.

=== BACKGROUND ===
딥 겨울밤 파랑(#0c1445) → 미드나잇(#1e1b4b) 그라디언트. 평화롭고 마법 같은 고요한 밤 — 아늑한 크리스마스 이브.`,
    },
    {
      id: 'grt_xmas_minimal', name: '미니멀 노엘', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
      desc: '단일 오너먼트 볼 레드&화이트 울트라미니멀 카드',
      layoutHint: 'minimal',
      aiPrompt: `[크리스마스 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 30% → 중앙 25% → 타이포 20% → 하단 20% (나머지 여유)
• 레드+화이트 2색 한정 (골드 캡만 예외)
• 단일 오너먼트 볼 포컬 포인트
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 줄 길이(25~35%) 자유
• 오너먼트 볼 크기(40~60px) 자유
• 눈송이 패턴 유무 자유

=== ZONE 구성 ===
ZONE 1 — 매달린 줄 (top 30%): 단일 가는 세로선(1px, 레드 #dc2626 40%) 상단 중앙에서 아래로. 깔끔하고 정밀.

ZONE 2 — 오너먼트 볼 (center, 25%): 줄에 매달린 단일 크리스마스 오너먼트 — 완벽한 원(50px), 레드(#dc2626) 솔리드, 상단에 골드(#d4a017) 캡+고리. 좌상에 하이라이트 반사(흰 호, 15%). 아래 부드러운 그림자(4px blur, 5%).

ZONE 3 — 타이포·휴진 안내 (next 20%): "Merry Christmas" 깨끗한 산세리프(14px, letter-spacing 4px, #b91c1c). "메리 크리스마스" 레드(#dc2626, 20px, weight 700). 병원명 연회색(#d1d5db, 11px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연회색 #d1d5db 60%, 작은 크기).

ZONE 4 — 하단 (bottom 20%): 넓은 빈 흰 공간. 여백의 미.

=== BACKGROUND ===
순수 화이트(#ffffff). 매우 희미한 눈송이 패턴(연회색 #f1f5f9 4%). 울트라 미니멀 — 단일 오너먼트가 포컬 포인트. Less is more.`,
    },
    {
      id: 'grt_xmas_character', name: '산타 캐릭터', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '산타·엘프 치아·눈사람 캐릭터 귀여운 크리스마스 카드',
      layoutHint: 'cute',
      aiPrompt: `[크리스마스 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 인사말 20% → 하단 10% (나머지 여유)
• 레드-그린-골드 밝은 파스텔 팔레트
• 산타 + 치아 캐릭터(엘프 복장) 반드시 포함
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 눈사람 유무·크기 자유
• 과자·캔디케인 장식 개수 자유
• 캐릭터 포즈·표정 자유

=== ZONE 구성 ===
ZONE 1 — 배너 (top 15%): 스캘럽 레드(#ef4444) 배너, 흰 텍스트 "Merry Christmas!"(14px, weight 700). 배너 양 끝 홀리 잎. 위에 작은 금별 흩뿌림(5~8개, 4px, 30%).

ZONE 2 — 캐릭터 씬 (center, 45%): 중앙에 산타(둥근 몸, 큰 빨간 모자+흰 폼폼, 분홍 볼, 눈감은 미소) — 빨간 선물 보따리. 좌측에 치아 캐릭터(엘프 복장: 녹색 모자, 뾰족 귀, 큰 미소). 우측에 둥근 눈사람(당근 코, 빨간 목도리). 모두 심플 일러스트 — 큰 머리, 작은 몸, 파스텔 셰이딩. 발 주변 캔디케인, 진저브레드맨, 롤리팝.

ZONE 3 — 인사말·휴진 안내 (next 20%): "메리 크리스마스" 밝은 빨강(#ef4444, 22px, weight 800). "즐거운 성탄절 보내세요" 녹색(#16a34a, 13px). 병원명 빨강(#dc2626, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (빨강 #dc2626 50%, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 작은 선물 상자 아이콘 가로 배열(빨강·녹색·금, 리본). 하단 가장자리 눈 도트.

=== BACKGROUND ===
소프트 레드(#fef2f2) → 화이트 그라디언트. 캔디케인 대각선 줄무늬(#fca5a5+흰, 4%). 귀엽고 밝은 크리스마스 파티 — 어린이 친화적.`,
    },
    {
      id: 'grt_xmas_gold', name: '골드 오너먼트', color: '#d4a017', accent: '#b8860b', bg: '#1a1a2e',
      desc: '네이비·골드 매달린 오너먼트 럭셔리 크리스마스 카드',
      layoutHint: 'luxury',
      aiPrompt: `[크리스마스 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 40% → 중앙 15% → 인사말 25% → 하단 10% (나머지 여유)
• 네이비+골드 2색 한정
• 매달린 오너먼트 메인 비주얼 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 오너먼트 형태(원·물방울·타원·별) 조합 자유
• 결정 눈송이 밀도 자유
• 스파클 도트 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 매달린 오너먼트 (top 40%): 5개 우아한 오너먼트 — 상단에서 금(#d4a017) 가는 줄에 다른 길이로 매달림. 형태: 원·물방울·타원·별·원 — 금(#d4a017)과 밝은 금(#FFD700) 메탈릭 광택. 각각 장식 금 캡. 걸이에 금 리본 매듭. 주변 시머/스파클 도트(흰 2px, 50%).

ZONE 2 — 결정 눈송이 (middle, 15%): 3~4개 큰 기하학적 결정 눈송이(흰 10~20%, 육각형 프랙탈, 보석 같은 정밀함).

ZONE 3 — 인사말·휴진 안내 (next 25%): "Merry Christmas" 금박 효과(#FFD700 → #d4a017, 16px, 세리프, letter-spacing 3px). "메리 크리스마스" 밝은 금(#FFD700, 24px, weight 700), 메탈릭 효과. 병원명 뮤트 골드(#b8860b, 12px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #b8860b 50%, 작은 크기).

ZONE 4 — 하단 (bottom 10%): 가는 금 이중선 테두리. 중앙 작은 금 리본.

=== BACKGROUND ===
딥 네이비(#1a1a2e) → 블랙(#0a0a1a) 그라디언트. 금 더스트 파티클(1~2px, #d4a017, 5%). 고급스럽고 화려한 프리미엄 크리스마스 카드.`,
    },
    {
      id: 'grt_xmas_wreath', name: '리스 장식', color: '#16a34a', accent: '#15803d', bg: '#f0fdf4',
      desc: '솔가지·열매 리스 프레임 빨간 리본 따뜻한 카드',
      layoutHint: 'warm',
      aiPrompt: `[크리스마스 — 따뜻한/리스]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 리스 원형 레이아웃: 리스 70% → 리본 6시 방향 → 중앙 텍스트 → 모서리 여유
• 녹색-빨강 전통 크리스마스 팔레트
• 원형 리스 프레임 메인 구조 필수
• 인사말 텍스트 반드시 포함: "메리 크리스마스"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 솔방울·겨우살이 배치 자유
• 리본 크기·색조 자유
• 열매 클러스터 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 리스 원 (centered, 70% of card): 원형 크리스마스 리스 — 풍성한 솔가지(#16a34a → #15803d) 두꺼운 링(지름의 ~15%). 바늘 텍스처, 겹겹이 풍성. 장식: 빨간 홀리 열매(#dc2626) 3개씩 클러스터, 진녹 홀리 잎(#166534), 솔방울(#92400e) 3~4개, 겨우살이(흰 열매). 리스 뒤 부드러운 그림자(6px blur, 8%).

ZONE 2 — 빨간 리본 (wreath 6시): 큰 장식 빨간(#dc2626) 새틴 리본 매듭, 흐르는 리본 꼬리 2개. 포컬 악센트.

ZONE 3 — 중앙 텍스트·휴진 안내 (inside wreath): "Merry Christmas" 진녹(#15803d, 13px, letter-spacing 2px). "메리 크리스마스" 빨강(#dc2626, 22px, weight 700). 병원명 녹색(#16a34a, 12px). 리스 원 안쪽 중앙 정렬. 텍스트 뒤 따뜻한 촛불 글로우(#fbbf24 6%). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (녹색 #16a34a 50%, 작은 크기).

ZONE 4 — 모서리 (outside wreath): 모서리에 흩어진 솔잎·단일 열매(15% 불투명도). 리스 바깥은 깔끔.

=== BACKGROUND ===
따뜻한 크림(#f0fdf4), 중앙 따뜻한 금빛 글로우(#fbbf24 5%). 따뜻하고 아늑한 가족 크리스마스 리스 — 환영하는 축제 분위기.`,
    },
  ],

  // ─── 명절 인사: 기본 fallback (구 greeting) ───
  greeting: [
    {
      id: 'grt_traditional_korean', name: '전통 한국풍', color: '#dc2626', accent: '#991b1b', bg: '#fef2f2',
      desc: '단청·매화·학 격식 있는 범용 명절 인사장 (설/추석 겸용)',
      layoutHint: 'traditional',
      aiPrompt: `[범용 명절 — 전통/격식]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 8% → 장식 30% → 인사말 30% → 하단 15% (나머지 여유)
• 빨강+금 전통 팔레트: #dc2626, #d4a017, #991b1b
• 한지(韓紙) 질감 배경 필수
• 인사말 텍스트 반드시 포함: "명절을 축하합니다"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보 — 이 템플릿은 설/추석 범용이므로 휴진 안내가 매우 중요

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 매화/소나무 선택 또는 둘 다 가능
• 학 실루엣 수(1~3마리) 자유
• 구름문/매듭 장식 유무 자유

=== ZONE 구성 ===
ZONE 1 — 전통 프레임 (outer border, 8% inset): 빨강(#dc2626)+금(#d4a017) 단청풍 기하 패턴 테두리. 모서리에 양식화된 구름문(#d4a017 60%). 이중선(빨강 1px 외, 금 1px 내, 3px 간격).

ZONE 2 — 장식 요소 (top-center, 30%): 우아한 매화(梅) 가지 — 진갈(#57534e) 가지에 빨강(#dc2626)+핑크(#fca5a5) 오엽 꽃. 상부에 학(鶴) 실루엣 2~3마리 금(#d4a017 20%). 작은 구름문 흩뿌림.

ZONE 3 — 인사말·휴진 안내 (center, 30%): "명절을 축하합니다" — 붓 캘리그래피(26px, weight 800, 딥레드 #991b1b). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" — 따뜻한 회색(#78716c, 13px). 병원명 빨강(#dc2626, 14px, weight 600) + 전통 프레임 밑줄.

ZONE 4 — 하단 악센트 (bottom 15%): 소나무(松) 실루엣(진녹 #166534, 15%). 빨강+금 가는 장식선. 중앙 빨간 전통 매듭 장식.

=== BACKGROUND ===
따뜻한 크림(#fef2f2), 한지 텍스처 5% 불투명도. 격조 있는 한국 전통 축제 미학 — 빨강과 금 단청 우아함.`,
    },
    {
      id: 'grt_warm_family', name: '따뜻한 가족', color: '#f97316', accent: '#ea580c', bg: '#fff7ed',
      desc: '촛불·가족 실루엣 수채화 손그림 범용 명절 인사장',
      layoutHint: 'warm',
      aiPrompt: `[범용 명절 — 따뜻한/손그림]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 40% → 인사말 25% → 하단 10% (나머지 여유)
• 오렌지+크림+피치 따뜻한 팔레트
• 가족 실루엣/일러스트 필수
• 인사말 텍스트 반드시 포함: "따뜻한 명절 보내세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 가족 구성(어른 2명 + 아이 1~2명) 자유
• 촛불/보케 밀도 자유
• 하트 형태/위치 자유

=== ZONE 구성 ===
ZONE 1 — 따뜻한 헤더 (top 15%): 상단 중앙에 작은 촛불 일러스트(따뜻한 오렌지 #f97316, 글로우 효과). 아래 오렌지(#fdba74 20%) 손그림 물결 선.

ZONE 2 — 가족 일러스트 (center, 40%): 따뜻한 손그림 스타일 — 가족 실루엣(어른 2명, 아이 1~2명) 손잡고 있는 심플 선화, 따뜻한 갈색(#92400e 50%). 뒤에 수채화 워시 소프트 오렌지(#fed7aa 15%). 가족 위에 하트 형태(오렌지 30%). 포근하고 심플.

ZONE 3 — 인사말·휴진 안내 (next 25%): "따뜻한 명절 보내세요" 따뜻한 오렌지갈색(#ea580c, 22px, weight 700). "휴진 안내: OO월 OO일 ~ OO월 OO일" 따뜻한 회색(#78716c, 12px). 병원명 오렌지(#f97316, 13px).

ZONE 4 — 하단 글로우 (bottom 10%): 하단 중앙에서 촛불 글로우 — 금(#fbbf24 5%) 방사 그라디언트 페이드. 피치색 손그림 가로선 15%.

=== BACKGROUND ===
소프트 크림(#fff7ed) → 피치(#fed7aa) 미묘한 그라디언트. 따뜻한 금 보케 원 5~8개(#fbbf24, 8~15%, 20~60px). 가족 중심의 따뜻하고 감성적인 의료 인사.`,
    },
    {
      id: 'grt_modern_minimal', name: '모던 미니멀', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
      desc: '타이포 중심 울트라클린 범용 명절 카드 (휴진 안내 강조)',
      layoutHint: 'minimal',
      aiPrompt: `[범용 명절 — 미니멀/타이포]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 25% → 중앙 30% → 스케줄 20% → 하단 20% (나머지 여유)
• 인디고+화이트 2색 한정
• 최대 여백 원칙
• 인사말 텍스트 반드시 포함: "행복한 명절 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 강조 — 이 템플릿의 핵심 기능

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 기하 심볼(별/오너먼트/원) 선택 자유
• 가로선 위치·길이 자유
• 기하 도트 유무 자유

=== ZONE 구성 ===
ZONE 1 — 상단 여백 (top 25%): 깨끗한 흰 공간. 인디고(#6366f1 8%) 가로선 40% 폭, 중앙. 선 위에 작은 기하 명절 심볼(별 또는 오너먼트 선화, 인디고 25%, 24px).

ZONE 2 — 메인 타이포 (center, 30%): "Happy Holidays" 깨끗한 산세리프(14px, letter-spacing 4px, 인디고 #6366f1 60%). 아래 "행복한 명절 되세요" 볼드 인디고(#4f46e5, 24px, weight 700). 줄 사이 넉넉한 여백(20px gap).

ZONE 3 — 스케줄·휴진 안내 (next 20%): 가는 인디고 선(30px, 1px, 15%). "휴진 안내" 인디고(#6366f1, 11px, weight 600, letter-spacing 2px). 휴진 날짜 연회색(#94a3b8, 12px). 병원명 인디고(#a5b4fc, 12px, letter-spacing 2px).

ZONE 4 — 하단 (bottom 20%): 순수 흰 공간. 중앙 작은 기하 도트(인디고 10%).

=== BACKGROUND ===
순수 화이트(#ffffff). 매우 미세한 기하 그리드(연인디고 #e0e7ff 3%). 모던 미니멀 타이포 정밀함 — 세련된 의료 브랜드.`,
    },
    {
      id: 'grt_nature_season', name: '자연 사계절', color: '#22c55e', accent: '#15803d', bg: '#f0fdf4',
      desc: '보태니컬 아치·사계절 풍경 비네트 수채화 범용 인사장',
      layoutHint: 'nature',
      aiPrompt: `[범용 명절 — 자연/풍경]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 30% → 중앙 30% → 인사말 25% → 하단 10% (나머지 여유)
• 녹색+따뜻한 자연색 팔레트
• 수채화 보태니컬 스타일 필수
• 인사말 텍스트 반드시 포함: "행복한 명절 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 계절별 꽃(벚꽃/해바라기/단풍/소나무) 선택 자유
• 풍경 비네트 구성 자유
• 유칼립투스/올리브 잎 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 보태니컬 헤더 (top 30%): 수채화 보태니컬 아치 — 유칼립투스·작은 잎·계절 단풍 아치/가랜드 형태. 색상: 세이지그린(#22c55e), 올리브(#65a30d), 민트(#86efac), 어스브라운(#92400e) 줄기. 수채화 스타일 — 번짐, 자연스러운 불완전함. 계절 꽃(봄 벚꽃, 여름 해바라기, 가을 단풍, 겨울 소나무) 배치.

ZONE 2 — 풍경 비네트 (center, 30%): 작은 원형 비네트(수채화, 부드러운 가장자리 페더) — 고요한 계절 풍경(완만한 녹색 언덕, 나무 한 그루, 잔잔한 하늘). 어스톤(#92400e, #22c55e, #38bdf8) 루즈 수채화 워시.

ZONE 3 — 인사말·휴진 안내 (next 25%): "행복한 명절 되세요" 진녹(#15803d, 22px, weight 700). "휴진 안내: OO월 OO일 ~ OO월 OO일" 따뜻한 회색(#78716c, 12px). 병원명 녹색(#22c55e, 13px).

ZONE 4 — 하단 보태니컬 (bottom 10%): 하단 모서리에 수채화 잎 가지(세이지그린 20%). 녹색 손그림 스타일 가로선 10%.

=== BACKGROUND ===
세이지그린(#f0fdf4) → 따뜻한 크림(#fefce8) 그라디언트. 고요하고 자연 영감의 계절감 — 평화롭고 상쾌한.`,
    },
    {
      id: 'grt_luxury_gold', name: '럭셔리 골드', color: '#d4a017', accent: '#b8860b', bg: '#fefce8',
      desc: '네이비·골드 오너먼트 아르데코 프리미엄 범용 명절 카드',
      layoutHint: 'luxury',
      aiPrompt: `[범용 명절 — 럭셔리/금박]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 테두리 6% → 오너먼트 35% → 인사말 30% → 하단 12% (나머지 여유)
• 네이비+골드 2색 한정
• 금박 메탈릭 효과 전체 적용
• 인사말 텍스트 반드시 포함: "행복한 명절 되세요"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 오너먼트 형태(원/물방울) 조합 자유
• 코너 플로리시 스타일(아르데코/클래식) 자유
• 금별 밀도 자유

=== ZONE 구성 ===
ZONE 1 — 금 테두리 (outer frame, 6% inset): 금(#d4a017) 이중선 프레임 — 외선 2px, 내선 1px, 4px 간격. 모서리 장식 플로리시(아르데코 스크롤워크). 금박 효과 + 하이라이트 그라디언트.

ZONE 2 — 오너먼트 디스플레이 (top-center, 35%): 3개 우아한 오너먼트 — 중앙 크게(원, 40px, 금 + 정교한 각인 패턴), 좌우 작게(물방울, 28px). 모두 금(#d4a017 → #FFD700) 그라디언트, 메탈릭 광택. 주변 금별(4px, 30%).

ZONE 3 — 인사말·휴진 안내 (center, 30%): "Happy Holidays" 금박 세리프(14px, letter-spacing 3px, #FFD700). "행복한 명절 되세요" 밝은 금(#FFD700, 24px, weight 700), 메탈릭 시머. 가는 금 선(40px, 1px). 병원명 뮤트 골드(#b8860b, 12px, letter-spacing 2px). 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (연금 #fde68a 60%, 11px).

ZONE 4 — 하단 (bottom 12%): 하단 중앙 작은 금 리본 오너먼트.

=== BACKGROUND ===
딥 네이비(#0f172a) → 다크 차콜(#1e293b) 그라디언트. 프리미엄 리넨 텍스처 4% 불투명도. 고급스럽고 격조 있는 금-네이비 의료 브랜드 카드.`,
    },
    {
      id: 'grt_cute_character', name: '귀여운 캐릭터', color: '#ec4899', accent: '#be185d', bg: '#fdf2f8',
      desc: '치아 캐릭터·말풍선 파스텔 파티 귀여운 범용 명절 카드',
      layoutHint: 'cute',
      aiPrompt: `[범용 명절 — 귀여운/캐릭터]
=== STRICT MODE ANCHORS (반드시 유지) ===
• 4-ZONE 수직 레이아웃 비율: 상단 15% → 중앙 45% → 말풍선 20% → 하단 15% (나머지 여유)
• 파스텔 멀티컬러 팔레트 (핑크, 노랑, 민트, 라벤더)
• 치아 캐릭터(파티모자) 반드시 포함
• 인사말 텍스트 반드시 포함: "행복한 명절 보내세요!"
• 병원/의원 로고·명칭 표시 영역 확보
• 휴진 기간 안내 영역 확보

=== INSPIRED MODE FREEDOM (변형 가능) ===
• 동반 캐릭터(별/하트) 유무 자유
• 번팅/깃발 장식 유무 자유
• 말풍선 형태(둥근/구름형) 자유

=== ZONE 구성 ===
ZONE 1 — 축제 악센트 (top 15%): 파스텔 별·도트 흩뿌림 — 핑크(#ec4899), 골드(#fbbf24), 민트(#34d399) — 15~30% 불투명도, 4~8px. 파스텔 번팅/깃발 배너 상단 가장자리.

ZONE 2 — 캐릭터 씬 (center, 45%): 중앙에 치아 캐릭터 — 흰 치아 형태, 큰 둥근 눈, 분홍 볼, 넓은 미소, 핑크+금도트 파티모자. 작은 깃발 들고 있음. 좌측에 별 캐릭터(노란, 행복 표정). 우측에 하트 캐릭터(핑크, 행복 표정). 심플 일러스트 — 둥근 형태, 미니멀 디테일, 최대 귀여움. 주변 기하 악센트.

ZONE 3 — 말풍선·휴진 안내 (next 20%): 둥근 말풍선(흰 채움, 핑크 #ec4899 2px 테두리) — "행복한 명절 보내세요!" 핑크(#be185d, 18px, weight 700). 안에 작은 하트 악센트. 말풍선 꼬리 → 치아 캐릭터 향함. 아래 "휴진 안내: OO월 OO일 ~ OO월 OO일" (핑크 #ec4899 40%, 작은 크기).

ZONE 4 — 하단 (bottom 15%): 병원명 핑크(#ec4899, 13px). 작은 축제 아이콘 가로 배열(선물, 별, 하트, 사탕) 파스텔 25%.

=== BACKGROUND ===
소프트 핑크(#fdf2f8) → 화이트 그라디언트. 파스텔 기하 도트(핑크 #f9a8d4, 노랑 #fde68a, 민트 #a7f3d0, 라벤더 #c4b5fd) 8% 불투명도, 2~4px 원. 귀엽고 즐거운 파스텔 축하 — 어린이 친화적 치과 인사.`,
    },
  ],

  // ─── 채용/공고 (6개) ───
  // 연구 기반: 실제 근무환경 사진 > 스톡, FAQ 말풍선 디자인, 가독성 최우선
  // 색상: 브랜드 컬러 + 화이트 + 1악센트, 틸/민트(환영), 코랄(활기), 네이비+옐로(주목)
  // 레이아웃: 단일 볼드 카드, 분할 사진/텍스트, 캐러셀(표지+혜택+지원방법)
  hiring: [
    {
      id: 'hir_corporate_clean', name: '기업 표준형', color: '#1e40af', accent: '#1e3a8a', bg: '#eff6ff',
      desc: '네이비 헤더 + 교대색 행 테이블 — 대형병원·종합병원 정규직 공채 표준 포맷',
      layoutHint: 'corporate',
      aiPrompt: `STRUCTURED TABLE POSTING LAYOUT — standard Korean hospital recruitment format. Navy header band, striped data table rows, CTA footer. Information flows: 모집분야 → 자격요건 → 근무조건 → 복리후생 → 지원방법.

ZONE 1 — HEADER (top 18%): Solid navy (#1e40af) filled rectangle, full width. Hospital name in small white text (13px, weight 500, letter-spacing 2px) centered at top of bar. "함께할 OO을 찾습니다" in largest bold white text (28px, weight 800) centered below. This bar is a single solid block — no gradients, no rounded corners.
ZONE 2 — TABLE BODY (middle 57%): White background (#ffffff). Rows alternate white / light blue (#eff6ff at 50%). Each row is a full-width horizontal band (row height ~48px), split into LEFT LABEL COLUMN (28% width, navy #1e40af text, 14px bold) and RIGHT VALUE COLUMN (72% width, dark gray #374151 text, 14px regular). Thin navy (#1e40af, 1px) horizontal lines separate rows.
- Row 1: "모집분야" | "간호사 (정규직 / 계약직)"
- Row 2: "자격요건" | "간호사 면허 소지자, 유관 경력 2년 이상 우대"
- Row 3: "근무형태" | "주 5일 (월~금), 3교대 / 협의 가능"
- Row 4: "급여조건" | "경력에 따른 협의, 야간수당 별도"
- Row 5: "복리후생" | "4대보험 · 식대 · 교육비 · 경조금 · 연차"
- Row 6: "지원방법" | "이메일(recruit@hospital.co.kr) 또는 방문 접수"
ZONE 3 — CTA FOOTER (bottom 25%): Solid navy (#1e40af) filled rectangle, full width. "지원하기" in large bold white text (22px) centered. Contact phone "☎ 02-000-0000" in small white text (12px) below. "채용 시 마감" in tiny white text (10px, 60% opacity).

STRICT MODE ANCHORS: Navy header bar, table row structure with label|value split, navy CTA footer bar, alternating row stripes. These structural elements must be preserved.
INSPIRED MODE FREEDOM: Row count (5-8), specific label/value text, row height, label column width ratio (25-35%), additional sub-rows or merged cells.
MOBILE: Minimum 13px font. Label column can stack above value on narrow screens. Row height minimum 40px for tap targets.`,
    },
    {
      id: 'hir_friendly_team', name: '팀워크 카드형', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
      desc: '민트 배경 + 좌측 보더 스택 카드 — 동네 의원·소규모 병원 따뜻한 채용 공고',
      layoutHint: 'team',
      aiPrompt: `STACKED INFO CARDS LAYOUT — warm, approachable neighborhood clinic recruitment. Mint background, white cards with green left-border, friendly language. Information flow: 모집분야 → 자격요건 → 복리후생 → 지원방법.

BACKGROUND: Soft mint (#f0fdf4) solid fill, full canvas.
ZONE 1 — HEADER (top 20%): Rounded rectangle card (white fill, 12px border-radius, subtle shadow, 90% width centered). Inside: "함께 일할 동료를 찾습니다 :)" in bold green (#16a34a) text (22px) centered. "간호사 · 간호조무사 모집" in large bold dark text (#111827, 18px) below.
ZONE 2 — INFO CARDS (middle 55%): 4 horizontal card rows stacked vertically with 10px gap. Each card is a white rounded rectangle (90% width centered, 10px border-radius, subtle shadow) with 4px solid green (#22c55e) LEFT border. Inside each card, left-aligned with 16px padding:
- Card 1: Green circle icon (user silhouette) → "모집분야" in small bold green (11px) → "정규직 간호사 / 간호조무사 (신입·경력 무관)" in medium dark text (14px).
- Card 2: Green circle icon (clipboard) → "자격요건" in small bold green → "해당 면허 소지자, 성실하고 밝은 분 환영" in medium dark text.
- Card 3: Green circle icon (heart) → "복리후생" in small bold green → "4대보험 · 점심 제공 · 연차 · 교육비 · 명절 상여" in medium dark text.
- Card 4: Green circle icon (phone) → "지원방법" in small bold green → "전화 문의 (010-0000-0000) 또는 이메일 접수" in medium dark text.
ZONE 3 — CTA BOTTOM (bottom 25%): Green (#22c55e) rounded pill button (220px wide, 48px tall, centered) with "지원하기" in bold white text (16px). Hospital name "OO내과의원" in small green (#16a34a) text below button. "서울시 OO구 OO로 000" 주소 in tiny gray text.

STRICT MODE ANCHORS: Mint background, stacked card layout with green left-border, pill CTA button. Cards must be vertically stacked (not grid).
INSPIRED MODE FREEDOM: Card count (3-5), icon shapes, card padding, border-radius, shadow intensity, card content text, button width.
MOBILE: Cards stack naturally. Minimum card height 60px. Text minimum 13px. Button minimum 44px height for touch.`,
    },
    {
      id: 'hir_modern_startup', name: '모던 아이콘 그리드', color: '#8b5cf6', accent: '#7c3aed', bg: '#1e1b4b',
      desc: '다크 인디고 배경 + 2×3 복리후생 아이콘 그리드 — IT·스타트업 감성 모던 채용',
      layoutHint: 'modern',
      aiPrompt: `DARK ICON GRID LAYOUT — modern tech-forward recruitment poster. Dark indigo background, 2x3 icon grid showcasing benefits, purple accent CTA. Structure: Title → Benefits Grid → CTA.

BACKGROUND: Solid dark indigo (#1e1b4b), full canvas.
ZONE 1 — TITLE (top 22%): Hospital/clinic name in small light purple (#a78bfa, 11px, letter-spacing 3px, uppercase) centered at very top. "간호사 모집" in largest bold white text (26px, weight 800) centered. "정규직 · 경력우대 · 즉시 입사 가능" in medium light purple (#a78bfa, 14px) text centered below. Thin horizontal line (1px, purple #8b5cf6 at 40% opacity) spanning 50% width, centered, as divider.
ZONE 2 — ICON GRID (middle 53%): 2 columns x 3 rows grid of benefit cells, centered, 12px gap. Each cell is a rounded square (dark purple #2e1065 fill, 12px border-radius, ~46% width, equal height) containing:
- Top: Simple geometric icon shape (30px) in purple (#8b5cf6).
- Bottom: Label in small bold white (12px) + one-line description in tiny gray (#94a3b8, 10px).
Grid cells:
- [1,1]: Shield → "4대보험" / "국민·건강·고용·산재"
- [1,2]: Utensils → "식대 지원" / "중식 제공 또는 월 10만원"
- [2,1]: Calendar → "연차 보장" / "입사 즉시 발생"
- [2,2]: Coins → "인센티브" / "분기별 성과급"
- [3,1]: Book → "교육 지원" / "학회·세미나·자격증"
- [3,2]: Clock → "유연 근무" / "협의 가능"
ZONE 3 — CTA (bottom 25%): Purple (#8b5cf6) rounded button (220px wide, 48px, centered) with "지원하기" in bold white text (16px). "recruit@hospital.co.kr" in small light purple (#a78bfa, 11px) below. "☎ 02-000-0000" in small gray (#94a3b8, 11px).

STRICT MODE ANCHORS: Dark indigo background, 2x3 grid of rounded-square cells, purple accent color, dark-on-dark cell contrast. Grid structure must remain 2-column.
INSPIRED MODE FREEDOM: Grid cell content/icons, cell border-radius, gap size, description text, icon style (outline vs filled), CTA button shape.
MOBILE: Grid cells minimum 44px tall. Icon minimum 24px. Label text minimum 12px. High contrast white-on-dark required.`,
    },
    {
      id: 'hir_benefits_focus', name: '복리후생 강조형', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '2×2 혜택 카드 그리드 + 상세 설명 — 복리후생을 전면에 내세운 채용 공고',
      layoutHint: 'benefits',
      aiPrompt: `BENEFITS-FOCUSED CARD GRID — recruitment poster where benefits are the hero element. Warm cream background, 2x2 benefit card grid dominates the layout. Structure: Position → Benefits Grid → CTA.

BACKGROUND: Warm cream (#fffbeb), full canvas.
ZONE 1 — POSITION HEADER (top 18%): "간호사 · 물리치료사 모집" in large bold dark text (#78350f, 22px) centered. "정규직 · 경력우대 · 수습 3개월" in medium amber (#d97706, 14px) below. Thin amber (#f59e0b) horizontal line divider (50% width, centered, 1px).
ZONE 2 — BENEFITS GRID (middle 57%): "이런 복리후생이 준비되어 있습니다" in medium bold amber (#d97706, 15px) text, left-aligned with 6% left margin. Below: 2x2 grid of benefit cards, centered, 12px gap. Each card is a white rounded rectangle (46% width, equal height ~120px, 12px border-radius, subtle shadow, 3px top border in amber #f59e0b). Inside each card (padding 14px):
- Top: Simple geometric icon shape in amber (#f59e0b, 28px) centered.
- Middle: Benefit name in medium bold dark text (#78350f, 15px) centered.
- Bottom: Two-line description in small gray (#6b7280, 11px) centered.
Cards:
- [1,1]: Shield icon → "4대보험 완비" / "국민연금·건강보험\n고용·산재보험 전액"
- [1,2]: Utensils icon → "식대 지원" / "점심 제공 또는\n월 식대 10만원 별도"
- [2,1]: Graduation cap → "교육비 지원" / "직무교육·학회 참가비\n자격증 취득 지원"
- [2,2]: Gift icon → "경조금·상여" / "경조사 지원·경조휴가\n명절 상여금 지급"
ZONE 3 — CTA FOOTER (bottom 25%): Amber (#f59e0b) rounded pill button (220px, 48px, centered) with "지원하기" in bold white text (16px). Hospital name "병원명" in small amber text (12px) below. "☎ 02-000-0000 | recruit@hospital.co.kr" in small gray text (11px).

STRICT MODE ANCHORS: Warm cream background, 2x2 card grid with amber top-border, amber pill CTA. Grid must remain 2x2.
INSPIRED MODE FREEDOM: Card content, icon style, card dimensions, description length, additional benefit cards (can expand to 2x3), shadow/border style.
MOBILE: Cards can reflow to single column on narrow screens. Card minimum height 100px. Text minimum 12px. Touch target minimum 44px.`,
    },
    {
      id: 'hir_urgent_now', name: '급구 긴급형', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '레드 대각 분할 + "급구" 대형 타이포 — 즉시 채용이 필요한 긴급 구인 공고',
      layoutHint: 'urgent',
      aiPrompt: `DIAGONAL SPLIT URGENT LAYOUT — high-contrast urgent recruitment poster. Bold red diagonal division creates visual tension. Structure: Urgent Banner → Job Details → Immediate CTA.

BACKGROUND: Diagonal split — upper-left triangle filled with solid red (#ef4444), lower-right triangle filled with white (#ffffff). Diagonal line from top-right to bottom-left corner.
ZONE 1 — RED TRIANGLE (upper-left, ~42% of canvas): "URGENT" in small white text (10px, letter-spacing 4px, 40% opacity) centered above main text. "급구" in massive bold white text (52px, weight 900) positioned in center of red triangle. Creates immediate visual impact and urgency.
ZONE 2 — WHITE TRIANGLE (lower-right, ~40% of canvas): Job details in dark text, left-aligned within white area with 8% padding:
- "간호사 모집" in large bold red (#ef4444, 20px) as section title.
- Bullet list with red (#ef4444) filled circle bullets (6px):
  - "정규직 채용 (수습 없음)" in medium dark text (#1f2937, 14px)
  - "간호사 면허 소지자" in medium dark text
  - "경력 우대, 신입 지원 가능" in medium dark text
  - "4대보험 · 식대 · 야간수당 · 인센티브" in medium dark text
- "※ 면접 후 즉시 근무 가능" in small bold red (#dc2626, 12px) below bullet list.
ZONE 3 — BOTTOM STRIP (bottom 18%): Solid red (#dc2626) horizontal bar, full width. "지금 바로 지원하기" in bold white text (18px) centered. "☎ 02-000-0000 (평일 09:00~18:00)" in small white text (11px) below. Hospital name in tiny white text (10px, 70% opacity).

STRICT MODE ANCHORS: Diagonal split composition (red upper-left / white lower-right), "급구" oversized text, red bottom CTA bar. The diagonal is the defining structural element.
INSPIRED MODE FREEDOM: Diagonal angle (35-55 degrees), bullet content, font sizes, additional urgency indicators (blinking effect description, exclamation marks), red shade variations.
MOBILE: "급구" minimum 36px. Bullet text minimum 13px. Bottom bar minimum 60px height. Ensure white-area text doesn't overlap diagonal edge.`,
    },
    {
      id: 'hir_premium_brand', name: '프리미엄 브랜드형', color: '#78716c', accent: '#57534e', bg: '#fafaf9',
      desc: '오프화이트 + 골드 라인 에디토리얼 — 대학병원·고급 의원 브랜드 채용 공고',
      layoutHint: 'brand',
      aiPrompt: `PREMIUM EDITORIAL LAYOUT — elegant, minimal recruitment poster. Warm off-white canvas, charcoal typography, gold line accents. Magazine editorial feel. Structure: Brand → Title → Details → Contact.

BACKGROUND: Warm off-white (#fafaf9), full canvas.
ZONE 1 — TOP BRANDING (top 12%): Hospital name "OO대학교병원" in medium charcoal (#57534e, 14px, letter-spacing 4px, weight 500) text, centered. Thin gold (#b8860b) horizontal line (70% width, centered, 1px) below name with 12px spacing.
ZONE 2 — MAIN TITLE (next 23%): "함께할 인재를 모십니다" in largest bold charcoal (#44403c, 26px, weight 700) text, centered. "간호사" in large bold gold (#b8860b, 20px) text centered below. "정규직 채용 | 경력 3년 이상" in medium charcoal (#57534e, 13px) text centered below that.
ZONE 3 — DETAILS (middle 40%): Thin gold horizontal line divider (50% width, centered). Below, centered minimal list with generous line spacing (32px between items):
- Small gold diamond (◆, 8px) then "모집분야  |  내과 병동 간호사 (00명)" in medium charcoal text (14px)
- Small gold diamond (◆) then "자격요건  |  간호사 면허, 유관 경력 3년 이상" in medium charcoal text
- Small gold diamond (◆) then "근무조건  |  주 5일, 3교대, 협의 가능" in medium charcoal text
- Small gold diamond (◆) then "복리후생  |  4대보험 · 식대 · 교육비 · 학자금 · 경조금" in medium charcoal text
Gold (#b8860b) pipe "|" as separator in each line. Thin gold horizontal line divider below the list (50% width, centered).
ZONE 4 — CONTACT CTA (bottom 25%): "지원 및 문의" in medium bold charcoal (#44403c, 16px) text centered. "채용담당: recruit@hospital.ac.kr" in small charcoal text (12px) below. "☎ 02-000-0000 (인사팀)" in small charcoal text (12px). Thin gold horizontal line at very bottom (70% width). No button — elegant text-based CTA befitting premium brand.

STRICT MODE ANCHORS: Off-white background, gold horizontal line dividers, gold diamond bullets, charcoal typography, editorial vertical rhythm. No buttons, no cards — pure typography.
INSPIRED MODE FREEDOM: Gold line widths, diamond bullet style, line-spacing, detail item count (3-6), font weight variations, letter-spacing values, line lengths.
MOBILE: Body text minimum 13px. Gold lines minimum 40% width. Generous vertical spacing (24px+) between sections for thumb scrolling.`,
    },
  ],

  // ─── 주의사항 (6개) ───
  // 연구 기반: 체크리스트/번호 카드뉴스(5-10슬라이드), 아이콘+텍스트 페어링, DO/DON'T 색상 코딩
  // 대형 병원(서울아산, 서울대) 참고: 거즈관리→냉찜질→식단→금연/금주→복약→후속방문 순서
  // 색상: 라이트블루/민트+다크텍스트(신뢰), 레드/코랄(경고), 그린(허용)
  caution: [
    {
      id: 'cau_medical_checklist', name: '의료 체크리스트 표준형', color: '#3b82f6', accent: '#2563eb', bg: '#eff6ff',
      desc: '번호 원형 배지 + 세로 진행선 — 시술 후 주의사항 표준 체크리스트 (인쇄용)',
      layoutHint: 'checklist',
      aiPrompt: `MEDICAL NUMBERED CHECKLIST LAYOUT — vertical numbered list with connecting progress line. Patient safety focus. High readability for all ages. Optimized for print handout.

BACKGROUND: White with very subtle blue tint (#f8fbff), full canvas.
ZONE 1 — HEADER (top 18%): Blue (#3b82f6) solid header bar spanning full width. Hospital name "병원명" in small white text (11px, weight 500) at top-left with 5% left margin. Procedure name "발치 후 주의사항" in bold large white text (22px, weight 700) centered below. Clean, professional medical header — single solid bar, no gradient.
ZONE 2 — CHECKLIST BODY (middle 57%): White background. Left side: thin vertical line in light blue (#93c5fd, 2px) running from first to last item, 12% from left edge. 5 numbered items stacked vertically with 20px gap.
EACH ITEM: Filled blue circle (#3b82f6, 28px diameter) with white number (1-5, 14px bold) centered, positioned ON the vertical line. To the right (16px gap): instruction text in dark gray (#374151, 15px, weight 500), single line.
- Item 1: "거즈를 1시간 동안 꽉 물고 계세요"
- Item 2: "당일은 뜨거운 음식과 자극적인 음식을 피하세요"
- Item 3: "처방된 약을 시간에 맞춰 복용하세요"
- Item 4: "시술 부위를 손이나 혀로 만지지 마세요"
- Item 5: "심한 운동, 음주, 흡연은 3일간 피하세요"
ZONE 3 — EMERGENCY CONTACT (bottom 25%): Light blue (#eff6ff) rounded rectangle (90% width, centered, 12px radius, 16px padding). Inside: red warning icon (▲, #ef4444, 16px) + "이런 증상이 있으면 즉시 연락하세요" in bold dark text (14px). Below: "출혈이 30분 이상 지속 / 심한 부기·통증 / 38도 이상 발열" in dark gray (13px). Blue (#3b82f6) rounded pill (80% width, centered, 40px height): "☎ 이상 증상 시: 02-000-0000" in bold white text (14px). Hospital name in small gray text (11px) below pill.

STRICT MODE ANCHORS: Blue header bar, vertical progress line with numbered circles, emergency contact box at bottom. Numbered list structure must be preserved.
INSPIRED MODE FREEDOM: Number of items (4-6), instruction text content, circle size, vertical line position, emergency symptom list, header procedure name.
MOBILE: Instruction text minimum 14px. Number circles minimum 24px. Line spacing minimum 18px. Emergency phone number must be tappable size (minimum 44px height).`,
    },
    {
      id: 'cau_warning_bold', name: '경고 강조형', color: '#ef4444', accent: '#dc2626', bg: '#fef2f2',
      desc: '▲ 경고 삼각형 + 레드 하이라이트 행 — 긴급 주의가 필요한 시술 후 경고 카드',
      layoutHint: 'warning',
      aiPrompt: `BOLD WARNING CARD LAYOUT — high-contrast red warning design for critical post-treatment precautions. Patient safety is paramount — every element designed for unmissable visibility.

BACKGROUND: White (#ffffff) with light red tint (#fef2f2 at 30%) at edges.
ZONE 1 — WARNING HEADER (top 22%): Large warning triangle icon (▲) in red (#ef4444) centered, 44px tall. Below: "시술 후 주의사항" in bold red (#ef4444, 24px) text centered. "아래 사항을 반드시 지켜주세요" in dark gray (#4b5563, 14px) centered. Hospital name "병원명" in small gray text (11px) above triangle.
ZONE 2 — WARNING LIST (middle 53%): 5 numbered precaution items, each on its own row, full width with 5% horizontal margin.
EACH ITEM: Red filled circle (#ef4444, 26px) with white number (14px bold) on the left. Instruction text in dark (#1f2937, 15px, weight 500) to the right with 12px gap.
CRITICAL ROWS (items 1, 4): Light red background strip (#fef2f2, full row width, 8px vertical padding) to visually highlight the most dangerous warnings.
NORMAL ROWS (items 2, 3, 5): White background.
- Item 1 [CRITICAL]: "출혈이 30분 이상 멈추지 않으면 즉시 내원하세요"
- Item 2: "시술 당일 음주 및 흡연은 절대 금지입니다"
- Item 3: "뜨거운 음식, 맵고 자극적인 음식을 피하세요"
- Item 4 [CRITICAL]: "심한 부기·통증·발열 시 즉시 연락하세요"
- Item 5: "거즈는 1시간 후 제거하고, 입안을 헹구지 마세요"
ZONE 3 — EMERGENCY BAR (bottom 25%): Solid red (#ef4444) bar spanning full width, 60px height. "이상 발생 시 즉시 연락" in bold white text (16px) centered. "☎ 02-000-0000 (진료시간 외: 010-0000-0000)" in white text (13px) below. Hospital name in tiny white text (10px, 70% opacity).

STRICT MODE ANCHORS: Warning triangle icon, red numbered list with highlighted critical rows, solid red emergency bar at bottom. Critical row highlighting is essential.
INSPIRED MODE FREEDOM: Number of items (4-6), which items are critical (1-2 max), instruction text content, triangle size, highlight color intensity.
MOBILE: Warning text minimum 14px. Red bar minimum 56px height. Phone number tappable (44px+). Critical row background must be clearly distinguishable from normal rows.`,
    },
    {
      id: 'cau_friendly_guide', name: '친절한 단계 안내형', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '세로 점선 + 단계별 안내 + 다음 내원일 — 불안한 환자를 위한 친절 가이드',
      layoutHint: 'guide',
      aiPrompt: `FRIENDLY STEP-BY-STEP GUIDE LAYOUT — calming green design with connected numbered steps. Warm, reassuring tone reduces patient anxiety. Includes next-visit date field.

BACKGROUND: Soft mint (#ecfdf5) to white vertical gradient (mint at top, white at bottom).
ZONE 1 — HEADER (top 18%): Hospital name "병원명" in green (#059669, 12px, weight 500) left-aligned with 6% left margin. "임플란트 시술 후 관리 안내" in bold dark green (#065f46, 20px) below. "차근차근 따라해 주세요 :)" in warm gray (#6b7280, 13px) as friendly subtitle. Approachable, non-clinical header tone.
ZONE 2 — STEP-BY-STEP (middle 52%): 4 numbered steps arranged vertically with 24px spacing. Vertical dotted line in light green (#6ee7b7, 2px dots, 4px gap) running through all step circles, connecting top to bottom, positioned 10% from left edge.
EACH STEP: Green filled circle (#10b981, 32px) with white number (①②③④, 16px) centered ON the dotted line. To the right (14px gap): instruction text in dark gray (#374151, 15px). Friendly Korean ~세요 endings throughout.
- Step ①: "시술 후 2시간은 아무것도 드시지 마세요"
- Step ②: "부기가 있으면 찬 수건이나 아이스팩으로 찜질해 주세요"
- Step ③: "처방해 드린 약은 시간 맞춰 꼭 드세요"
- Step ④: "불편하시면 언제든지 편하게 전화주세요"
Color coding hint: green text for "허용" items, amber (#d97706) for "주의" items if mixed.
ZONE 3 — NEXT VISIT + CONTACT (bottom 30%): Light green (#d1fae5) rounded rectangle (90% width, centered, 12px radius, 16px padding).
- Top: "다음 내원 예정일" in bold dark green (#065f46, 14px). Below: "____년 __월 __일 (___요일) __시" with underline blanks for handwriting.
- Divider: thin dotted green line.
- Bottom: "궁금한 점이 있으시면 연락주세요" in green (#059669, 13px). "☎ 02-000-0000" in bold green (15px). Hospital name and address in small gray (11px).

STRICT MODE ANCHORS: Mint background, vertical dotted connecting line, numbered step circles, next-visit date box with blanks at bottom. The dotted line + circles structure is defining.
INSPIRED MODE FREEDOM: Step count (3-5), instruction text, circle size, dotted line style, next-visit box layout, additional tips section.
MOBILE: Step text minimum 14px. Circles minimum 28px. Next-visit box minimum 80px height. Generous touch spacing between steps (20px+).`,
    },
    {
      id: 'cau_timeline_recovery', name: '회복 타임라인형', color: '#8b5cf6', accent: '#7c3aed', bg: '#f5f3ff',
      desc: '당일→3일→1주→1개월 수평 타임라인 — 회복 단계별 관리법 한눈에 보기',
      layoutHint: 'timeline',
      aiPrompt: `RECOVERY TIMELINE LAYOUT — horizontal timeline showing care instructions across recovery stages. Color transitions from amber (caution) to green (healed). Patients see their recovery journey at a glance.

BACKGROUND: Soft lavender (#f5f3ff) to white gradient (lavender at top, white at bottom).
ZONE 1 — HEADER (top 15%): Hospital name "병원명" in small gray text (#6b7280, 11px) centered at top. "발치 후 회복 가이드" in bold purple (#8b5cf6, 22px) centered below. Thin purple line (#8b5cf6, 1px, 40% width) centered as divider.
ZONE 2 — TIMELINE (middle 55%): Horizontal progress bar spanning 85% width, centered, 8px tall, rounded ends. Color gradient left to right: amber (#f59e0b) then light purple (#a78bfa) then blue (#3b82f6) then green (#10b981).
4 circular markers (24px diameter) positioned ON the bar at equal intervals:
- Marker 1 (left end): Amber (#f59e0b) filled circle. Label "당일" above in bold amber text (13px).
- Marker 2 (33%): Light purple (#a78bfa) circle. Label "3일 후" above in bold purple (13px).
- Marker 3 (66%): Blue (#3b82f6) circle. Label "1주일" above in bold blue (13px).
- Marker 4 (right end): Green (#10b981) circle. Label "1개월" above in bold green (13px).
INSTRUCTIONS BELOW EACH MARKER: 2 lines of instruction text in small dark gray (#4b5563, 12px), centered under each marker, max width per column ~22%.
- 당일: "거즈 1시간 유지 / 냉찜질 / 금주·금연"
- 3일 후: "부기 서서히 감소 / 미지근한 부드러운 음식"
- 1주일: "실밥 제거 내원 / 일상 식사 서서히 가능"
- 1개월: "완전 회복 확인 / 정상 활동 가능"
ZONE 3 — EMERGENCY CONTACT (bottom 30%): Purple (#8b5cf6) rounded pill bar (80% width, centered, 44px height): "회복 중 이상 증상 시 ☎ 02-000-0000" in bold white text (14px). Below pill: "출혈 지속 · 심한 통증 · 38도 이상 발열 → 즉시 내원" in small purple text (#7c3aed, 12px). Hospital name in tiny gray text (10px).

STRICT MODE ANCHORS: Horizontal timeline bar with gradient, 4 time markers with labels above and instructions below, pill-shaped emergency contact. Timeline bar is the defining structural element.
INSPIRED MODE FREEDOM: Number of markers (3-5), time intervals, instruction text, gradient colors, marker size, instruction line count, additional recovery percentage indicators.
MOBILE: Timeline can wrap to 2 rows on very narrow screens. Marker labels minimum 12px. Instructions minimum 11px. Emergency pill minimum 44px height.`,
    },
    {
      id: 'cau_infographic', name: 'O/X 인포그래픽형', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
      desc: '2×3 O/X 카드 그리드 — 허용(O)과 금지(X)를 한눈에 구분하는 시각 인포그래픽',
      layoutHint: 'infographic',
      aiPrompt: `O/X INFOGRAPHIC GRID LAYOUT — 2x3 grid of icon cards showing DO (O) and DON'T (X) instructions. Instant visual comprehension — patients understand in seconds without reading long paragraphs. Color coding: green=allowed, red=prohibited.

BACKGROUND: Warm cream (#fffbeb), full canvas.
ZONE 1 — HEADER (top 15%): Hospital name "병원명" in small gray text (#6b7280, 11px) centered at top. "시술 후 주의사항" in bold amber (#d97706, 22px) centered. "O는 해도 좋아요, X는 하지 마세요" in medium gray (#6b7280, 13px) as explanatory subtitle.
ZONE 2 — O/X GRID (middle 60%): 2 columns x 3 rows grid, centered, 10px gap. Left column = O (DO) cards, Right column = X (DON'T) cards. Each card is a rounded rectangle (~46% width, ~80px height, 12px radius).
O CARDS (left column, green): Light green background (#f0fdf4), 2px green (#22c55e) border. Large green "O" letter (36px, bold, #22c55e) on the left side of card. Instruction text (14px, dark #1f2937) to the right.
- O Card 1: "냉찜질 해주세요"
- O Card 2: "부드러운 음식 드세요"
- O Card 3: "처방약 복용하세요"
X CARDS (right column, red): Light red background (#fef2f2), 2px red (#ef4444) border. Large red "X" letter (36px, bold, #ef4444) on the left side of card. Instruction text (14px, dark #1f2937) to the right.
- X Card 1: "뜨거운 음식 금지"
- X Card 2: "음주 · 흡연 금지"
- X Card 3: "사우나 · 찜질방 금지"
The O and X letters are the dominant visual elements — instantly recognizable at a glance.
ZONE 3 — EMERGENCY (bottom 25%): Amber (#f59e0b) rounded pill (80% width, centered, 44px): "☎ 이상 증상 시: 02-000-0000" in bold white text (14px). "출혈 · 부기 · 통증 지속 시 즉시 내원" in small amber text (#d97706, 12px) below. Hospital name in tiny gray (10px).

STRICT MODE ANCHORS: 2-column O/X grid structure, green for O cards, red for X cards, large O/X letters as primary visual. Grid layout is the defining element.
INSPIRED MODE FREEDOM: Grid size (2x2 to 2x4), card content, O/X letter size, card dimensions, additional amber "△ 주의" cards for caution-level items, icon additions.
MOBILE: O/X letters minimum 28px. Card text minimum 13px. Cards minimum 60px height. Grid can reflow to single column with O/X prefix on narrow screens.`,
    },
    {
      id: 'cau_clean_card', name: 'DO/DON\'T 분할형', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
      desc: 'DO/DON\'T 좌우 2열 분할 — 해야 할 것과 하지 말아야 할 것을 양쪽으로 비교',
      layoutHint: 'card',
      aiPrompt: `DO / DON'T TWO-COLUMN SPLIT LAYOUT — left column for recommended actions, right column for prohibited actions. Most intuitive format for behavioral instructions. Green=allowed, Red=prohibited color coding.

BACKGROUND: White (#ffffff), full canvas.
ZONE 1 — HEADER (top 18%): Hospital name "병원명" in small gray text (#6b7280, 11px) centered at top. "보톡스 시술 후 주의사항" in bold sky blue (#0ea5e9, 22px) centered. Thin sky blue line (#0ea5e9, 1px, 60% width) centered as separator.
ZONE 2 — TWO-COLUMN BODY (middle 57%): Content area split into two equal columns (48% width each) side by side with 4% center gap.
LEFT COLUMN — "이렇게 하세요 ✓": Green header bar (#22c55e, full column width, 36px height, 8px top radius) with "이렇게 하세요 ✓" in bold white text (14px) centered. Below: 4 items stacked vertically with 8px gap. Each item is a card (light green #f0fdf4 background, 8px radius, 12px padding) with small green checkmark circle (✓, #22c55e, 20px) on the left, instruction text (#374151, 14px) on the right.
- "냉찜질을 10분씩 반복하세요"
- "부드러운 미지근한 음식을 드세요"
- "처방약을 꼭 복용하세요"
- "시술 후 4시간은 충분히 쉬세요"
CENTER DIVIDER: Vertical dashed line (#d1d5db, 1px, 4px dash) from top of content area to bottom.
RIGHT COLUMN — "이것은 안 돼요 ✗": Red header bar (#ef4444, full column width, 36px height, 8px top radius) with "이것은 안 돼요 ✗" in bold white text (14px) centered. Below: 4 items with light red (#fef2f2) background cards, small red X circle (✗, #ef4444, 20px) on the left.
- "당일 음주 · 흡연 절대 금지"
- "사우나 · 찜질방 · 뜨거운 목욕 금지"
- "시술 부위를 손으로 만지지 마세요"
- "격한 운동은 3일간 피하세요"
ZONE 3 — EMERGENCY CONTACT (bottom 25%): Sky blue (#0ea5e9) rounded rectangle (90% width, centered, 12px radius, 50px height): "☎ 이상 증상 시 연락: 02-000-0000" in bold white text (15px) centered. "진료시간: 월~금 09:00~18:00 / 토 09:00~13:00" in small white text (11px, 70% opacity). Hospital name and address in tiny gray text (10px) below.

STRICT MODE ANCHORS: Two-column split with green DO header and red DON'T header, vertical center divider, checkmark/X icons, sky blue emergency bar. The dual-column comparison is the defining structure.
INSPIRED MODE FREEDOM: Item count per column (3-5), instruction text, header text, icon style, card padding, column width ratio, additional "주의" amber middle section.
MOBILE: On narrow screens, columns can stack vertically (DO on top, DON'T below). Item text minimum 13px. Header bars minimum 32px. Emergency bar minimum 48px height for touch.`,
    },
  ],  // ─── 비급여 진료비 안내 (6개) ───
  // 연구 기반: 테이블/메뉴보드 형식(법적 요구), 교대 행 배경, 최소 장식, 가격 우측 정렬
  // 의료법 제45조: 비급여 진료비 투명 공개 의무, 최종 수정일 표시
  // 색상: 화이트+다크그레이/네이비(가장 보편적), 베이지/크림(프리미엄)
  pricing: [
    {
      id: 'prc_clean_table', name: '클린 테이블 표준형', color: '#3b82f6', accent: '#2563eb', bg: '#eff6ff',
      desc: '블루 헤더 + 줄무늬 행 테이블 — 의료법 제45조 준수 비급여 진료비 표준 공시표',
      layoutHint: 'table',
      aiPrompt: `CLEAN TABLE STANDARD — the most common Korean hospital fee schedule format. Compliant with 의료법 제45조 (비급여 진료비 투명 공개 의무). Treatment name LEFT, price RIGHT alignment.

BACKGROUND: White (#ffffff) full bleed.
ZONE 1 — HEADER (top 15%): Full-width horizontal bar in blue (#3b82f6), 56px height. "비급여 진료비 안내" in bold white text (22px, weight 700) centered. Hospital name "병원명" in smaller white text (12px, weight 400) above title within the bar.
ZONE 2 — TABLE BODY (middle 65%): Full-width table layout. Rows alternate white and light blue (#eff6ff at 50%). Each row (height 48px, padding 12-16px):
- LEFT: Treatment name in dark text (#1e293b, 14px, weight 500), left-aligned with 6% left margin.
- RIGHT: Price in bold blue (#2563eb, 15px, weight 700) right-aligned with 6% right margin, "원" suffix.
Thin gray (#e2e8f0, 1px) horizontal lines between rows.
CATEGORY HEADERS: Category name rows (e.g., "임플란트", "보톡스/필러", "레이저") span full width with slightly darker blue-gray (#dbeafe) background, bold text (#1e3a8a, 13px, weight 600).
Example rows:
- Category: "임플란트"
  - "오스템 임플란트 (1개)" | "1,200,000원"
  - "스트라우만 임플란트 (1개)" | "1,800,000원"
- Category: "보톡스"
  - "이마 보톡스 (50단위)" | "150,000원"
  - "사각턱 보톡스 (50단위)" | "200,000원"
ZONE 3 — FOOTER (bottom 20%): Thin gray line (#e2e8f0, 1px) separator. Small gray text (#94a3b8, 11px):
- "※ 상기 금액은 부가세(VAT) 포함 금액입니다"
- "※ 시술 범위 및 재료에 따라 달라질 수 있습니다"
- "최종 수정일: YYYY.MM.DD"
Hospital name and phone "☎ 02-000-0000" in small text.

STRICT MODE ANCHORS: Blue header bar, alternating-row table with left-name/right-price alignment, category group headers, footer with VAT and date. Table structure is essential.
INSPIRED MODE FREEDOM: Number of categories/items, price values, category names, row height, stripe color intensity, footer disclaimer text.
MOBILE: Treatment name minimum 13px. Price minimum 14px. Row height minimum 44px for touch. Category headers clearly distinguishable from item rows.`,
    },
    {
      id: 'prc_card_grid', name: '카테고리 카드형', color: '#10b981', accent: '#059669', bg: '#ecfdf5',
      desc: '2열 카테고리별 카드 그리드 — 진료 항목별로 묶은 치과/피부과 비급여 가격표',
      layoutHint: 'cards',
      aiPrompt: `CATEGORY CARD GRID — organized by treatment category in a 2-column card layout. Each card groups related treatments. Clean, organized dental/dermatology clinic style.

BACKGROUND: Very light mint (#f0fdf9) full bleed.
ZONE 1 — HEADER (top 12%): Hospital name "병원명" in smaller dark text (#374151, 12px) centered at top. "비급여 진료비 안내" in bold teal (#059669, 22px) text centered below. Thin teal line (#10b981, 1px, 40% width) centered as divider.
ZONE 2 — CARD GRID (middle 68%): 2-column grid of category cards, centered, 14px gap. Each card represents one treatment category.
CARD DESIGN: White rounded rectangle (46% width, auto height, 12px radius, subtle shadow). Card header: category name in bold white text (14px) on a teal (#10b981) background strip (full card width, 36px height, 12px top radius). Card body (padding 14px): 2-4 treatment items listed vertically. Each item row:
- Treatment name on left in dark text (#374151, 13px)
- Price on right in bold teal (#059669, 14px, weight 700) with "원" suffix
Thin light gray (#e5e7eb, 1px) lines between items.
Cards:
- Card 1: "임플란트" — "오스템 (1개) | 1,200,000원", "스트라우만 (1개) | 1,800,000원"
- Card 2: "보톡스" — "이마 (50u) | 150,000원", "사각턱 (50u) | 200,000원"
- Card 3: "필러" — "팔자필러 (1cc) | 300,000원", "턱끝필러 (1cc) | 350,000원"
- Card 4: "레이저" — "IPL (1회) | 100,000원", "프락셀 (1회) | 250,000원"
- Card 5: "스케일링" — "일반 스케일링 | 50,000원"
- Card 6: "미백" — "전문 미백 (상·하) | 300,000원"
ZONE 3 — FOOTER (bottom 20%): Small gray text (#6b7280, 11px) centered: "※ VAT 포함 / 시술 범위에 따라 변동 가능 / 최종 수정일: YYYY.MM.DD". Hospital contact in small text.

STRICT MODE ANCHORS: 2-column card grid, teal header strip per card, treatment-name-left/price-right within each card. Card-based grouping is the defining structure.
INSPIRED MODE FREEDOM: Card count (4-8), items per card (1-4), category names, price values, card dimensions, shadow intensity, additional icons per category.
MOBILE: Cards reflow to single column. Card minimum width 280px. Treatment text minimum 12px. Price text minimum 13px.`,
    },
    {
      id: 'prc_premium_dark', name: '프리미엄 다크', color: '#1e293b', accent: '#f59e0b', bg: '#0f172a',
      desc: '다크 네이비 + 골드 가격 — 프리미엄 피부과·성형외과 고급 비급여 가격표',
      layoutHint: 'dark',
      aiPrompt: `PREMIUM DARK — dark navy background with gold accents for upscale aesthetic clinics. Luxury through restraint. Treatment name LEFT in white, price RIGHT in gold.

BACKGROUND: Dark navy (#0f172a) full bleed.
ZONE 1 — BORDER + HEADER (top 18%): Subtle gold (#f59e0b at 60%) double-line border around entire canvas — outer line 2px, inner line 1px, 6px gap. Hospital name "병원명" in smaller white text (#f1f5f9, 11px, letter-spacing 3px) centered at top. "비급여 진료비 안내" in gold (#f59e0b, 20px, weight 700) bold text centered below.
ZONE 2 — PRICE LIST (middle 60%): Vertically stacked treatment items with generous spacing (20px between rows).
CATEGORY HEADERS: Category name (e.g., "보톡스/필러", "레이저/리프팅", "피부관리") in small uppercase gold text (#f59e0b, 11px, letter-spacing 2px). Short gold line (40px, 1px) below category name.
ITEM ROWS: Treatment name in white (#f1f5f9, 14px, weight 400) left-aligned. Price in bold gold (#f59e0b, 15px, weight 700) right-aligned with "원" suffix. Thin gold separator lines (1px, 20% opacity) between items.
Example items:
- Category: "보톡스"
  - "이마 보톡스 (50단위)" | "150,000원"
  - "사각턱 보톡스 (50단위)" | "200,000원"
- Category: "필러"
  - "팔자 필러 (1cc)" | "300,000원"
  - "볼 필러 (1cc)" | "350,000원"
- Category: "레이저"
  - "제네시스 (1회)" | "100,000원"
  - "울쎄라 (전체)" | "2,500,000원"
ZONE 3 — FOOTER (bottom 22%): Thin gold line (80% width, centered, 1px). Small white text (#f1f5f9 at 50%, 10px): "※ VAT 포함 / 시술 범위에 따라 변동 가능". "최종 수정일: YYYY.MM.DD" in same style. Hospital phone in tiny gold text (10px).

STRICT MODE ANCHORS: Dark navy background, gold double-border frame, gold category headers with short underline, white-name/gold-price row layout. Dark-on-gold contrast is essential.
INSPIRED MODE FREEDOM: Category count, item count, border style (single vs double), gold opacity variations, spacing, additional decorative gold elements (corner ornaments).
MOBILE: Treatment name minimum 13px. Price minimum 14px. Row spacing minimum 16px. Gold lines minimum 30% opacity for visibility on dark background.`,
    },
    {
      id: 'prc_warm_wood', name: '카페 메뉴판형', color: '#92400e', accent: '#d97706', bg: '#fffbeb',
      desc: '크림 배경 + 도트 리더 연결선 — 카페 메뉴판 느낌의 따뜻한 동네 의원 가격표',
      layoutHint: 'wood',
      aiPrompt: `CAFE MENU BOARD — warm cream background styled like a cafe menu board. Dot-leader lines connect treatment names to prices. Approachable neighborhood clinic feel.

BACKGROUND: Warm cream (#fffbeb) full bleed.
ZONE 1 — HEADER (top 15%): Hospital name "OO내과의원" in smaller brown text (#92400e, 12px, weight 500) centered at top. "비급여 진료비 안내" in dark brown (#92400e, 22px, weight 700) bold text centered. Thin brown decorative line (1px, 60% width, centered) below title.
ZONE 2 — MENU LIST (middle 65%): Items grouped by treatment category. Each category section:
CATEGORY HEADER: Medium brown (#92400e, 15px, weight 600) bold text with short brown underline (30px, 2px). 28-32px spacing above each new category.
ITEM ROWS: Each row (line-height 24px, 20px gap between rows):
- Treatment name in dark brown (#78350f, 14px, weight 500) on the left.
- Dotted leader line: repeating dots (·····) in light brown (#d4a574, 12px) filling space between name and price.
- Price in bold amber (#d97706, 15px, weight 700) on the right with "원" suffix.
Example categories and items:
- "건강검진"
  - "기본 건강검진 ········· 80,000원"
  - "종합 건강검진 ········· 250,000원"
- "예방접종"
  - "독감 예방접종 ········· 35,000원"
  - "대상포진 ········· 150,000원"
- "비타민/수액"
  - "비타민C 수액 ········· 50,000원"
  - "피로회복 수액 ········· 80,000원"
ZONE 3 — FOOTER (bottom 20%): Thin brown line (#92400e, 1px, 50% width, centered). Small brown text (#a16207, 11px): "※ VAT 포함 금액입니다 / 최종 수정일: YYYY.MM.DD". Hospital address and phone in small text.

STRICT MODE ANCHORS: Cream background, dot-leader lines connecting name to price, brown/amber color scheme, category grouping. The dot-leader pattern is the defining visual characteristic.
INSPIRED MODE FREEDOM: Category count, item count, dot style (·, …, ---), brown shade variations, category header style, additional decorative elements (corner flourishes).
MOBILE: Treatment name minimum 13px. Price minimum 14px. Dot leaders must remain visible (minimum 10px). Category spacing minimum 20px.`,
    },
    {
      id: 'prc_gradient_modern', name: '모던 그라데이션형', color: '#7c3aed', accent: '#a855f7', bg: '#f5f3ff',
      desc: '라벤더 배경 + 퍼플 필 뱃지 가격 — 뷰티 클리닉/피부과 모던 비급여 가격표',
      layoutHint: 'gradient',
      aiPrompt: `MODERN GRADIENT — soft lavender background with purple pill badges for prices. Beauty clinic aesthetic. Treatment name LEFT, price in pill badge RIGHT.

BACKGROUND: Soft lavender (#f5f3ff) full bleed.
ZONE 1 — HEADER (top 13%): Hospital name "병원명" in smaller dark gray (#374151, 12px) centered at top. "비급여 진료비 안내" in bold purple (#7c3aed, 22px) text centered. Thin purple line (#7c3aed, 1px, 30% width) centered below.
ZONE 2 — PRICE LIST (middle 67%): Vertically stacked treatment items. Rows alternate transparent and very light purple (#ede9fe at 40%) backgrounds.
CATEGORY LABELS: Small purple (#7c3aed, 11px, letter-spacing 2px, weight 600) uppercase text above each group.
ROW LAYOUT (padding 14px vertical, 6% horizontal margin): Treatment name on left in dark text (#1f2937, 14px, weight 500). Price on right inside rounded pill-shaped badge: badge background light purple (#ede9fe), 1px purple (#c4b5fd) border, border-radius 999px, padding 6px 16px. Price text in bold purple (#7c3aed, 14px, weight 700) with "원" suffix.
Example items:
- Category: "보톡스"
  - "이마 보톡스 (50단위)" | [150,000원] (pill badge)
  - "사각턱 보톡스 (50단위)" | [200,000원]
  - "턱끝 보톡스 (30단위)" | [120,000원]
- Category: "필러"
  - "팔자 필러 (1cc)" | [300,000원]
  - "볼 필러 (1cc)" | [350,000원]
- Category: "레이저"
  - "토닝 (1회)" | [80,000원]
  - "IPL (1회)" | [100,000원]
ZONE 3 — FOOTER (bottom 20%): Small gray (#6b7280, 11px) text centered: "※ VAT 포함 / 시술 범위·횟수에 따라 변동 가능". "최종 수정일: YYYY.MM.DD". Hospital phone in small text.

STRICT MODE ANCHORS: Lavender background, pill-shaped price badges with purple border, alternating row backgrounds, category labels. The pill badge is the distinctive element.
INSPIRED MODE FREEDOM: Category count, item count, pill badge size/color, alternating row colors, category label style, additional treatment details (duration, sessions).
MOBILE: Treatment name minimum 13px. Pill badge text minimum 13px. Row height minimum 44px. Pill badges must not wrap to next line.`,
    },
    {
      id: 'prc_minimal_line', name: '미니멀 라인형', color: '#64748b', accent: '#0ea5e9', bg: '#f8fafc',
      desc: '순백 배경 + 스카이블루 가격 — 스위스 타이포그래피 미니멀 비급여 가격표',
      layoutHint: 'minimal',
      aiPrompt: `MINIMAL LINE — ultra-minimal Swiss typography-inspired price list. Pure white, maximum whitespace. No decorations whatsoever. Treatment name LEFT in charcoal, price RIGHT in sky blue.

BACKGROUND: Pure white (#ffffff) full bleed.
ZONE 1 — HEADER (top 12%): Hospital name "병원명" in lighter gray (#94a3b8, 11px, weight 400) left-aligned or centered at top. "비급여 진료비 안내" in charcoal (#374151, 20px, weight 700) bold text. Single thin horizontal line (1px, #e2e8f0) spanning full width below title with 24px spacing.
ZONE 2 — PRICE LIST (middle 70%): Each item row contains ONLY: treatment name in charcoal (#374151, 14px, weight 400) on the left, price in bold sky blue (#0ea5e9, 15px, weight 700) on the right with "원" suffix.
NO separator lines between items — only generous whitespace (24-28px vertical gap) creates visual separation. NO icons, NO borders, NO background colors, NO dot leaders, NO badges.
ALIGNMENT: All treatment names left-aligned to same position (6% left margin). All prices right-aligned to same position (6% right margin). Grid-based Swiss typographic alignment.
Example items (no categories, just a flat list):
- "임플란트 (오스템, 1개)" | "1,200,000원"
- "임플란트 (스트라우만, 1개)" | "1,800,000원"
- "이마 보톡스 (50단위)" | "150,000원"
- "사각턱 보톡스 (50단위)" | "200,000원"
- "팔자 필러 (1cc)" | "300,000원"
- "스케일링" | "50,000원"
- "전문 미백 (상·하)" | "300,000원"
ZONE 3 — FOOTER (bottom 18%): After 32px gap, single thin line (1px, #e2e8f0, full width). Small gray (#94a3b8, 10px) text: "※ VAT 포함 / 최종 수정일: YYYY.MM.DD". Hospital contact in same style.

STRICT MODE ANCHORS: Pure white background, charcoal-name/sky-blue-price only, zero decorations, generous whitespace as only separator. The absence of decoration IS the design.
INSPIRED MODE FREEDOM: Item count, treatment names, price values, font weight variations, whitespace amounts, optional single category divider lines (thin, subtle).
MOBILE: Treatment name minimum 13px. Price minimum 14px. Vertical gap minimum 20px between items. Left/right margin minimum 5%.`,
    },
  ],
};

// ── AI 이미지 생성: 템플릿 데이터 → Nano Banana Pro ──


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
