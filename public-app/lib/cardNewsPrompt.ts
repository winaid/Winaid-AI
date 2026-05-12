/**
 * lib/cardNewsPrompt.ts — C2 (AI-first 카드뉴스) LLM 프롬프트 빌더 + 파서
 *
 * C2 단계별 승인 흐름의 두 LLM 호출에 대응:
 *   1) buildOutlinePrompt — 주제 + 슬라이드 수 → 구성 안 (가벼움, Gemini flash)
 *   2) buildTextPrompt    — 구성 안 + 주제 → 각 슬라이드 SlideData (Gemini pro)
 *
 * v1 레이아웃 5종 (blog-core/cardNewsLayouts.ts 16종 sub-set):
 *   cover · info · checklist · comparison · closing
 *
 * v2 확장 후보: icon-grid, steps, data-highlight, qna, timeline, quote 등.
 *
 * C0 (2026-05-08) 에서 삭제된 cardNewsPrompt.ts (500 LoC) 재작성 slim 버전.
 * 캔버스 에디터·디자인 템플릿·스타일 학습 등 v1 scope-out 항목은 모두 제외.
 *
 * 의존성:
 *   @winaid/blog-core — sanitizePromptInput, SlideData, ensureSlideIds, generateSlideId
 */

import {
  sanitizePromptInput,
  generateSlideId,
  type SlideData,
} from '@winaid/blog-core';

// ── v1 레이아웃 sub-set ────────────────────────────────────────────────────

/** v1 에서 허용하는 레이아웃 (5종). C2b UI 가 이 순서대로 노출. */
export const V1_LAYOUTS = ['cover', 'info', 'checklist', 'comparison', 'closing'] as const;
export type V1Layout = (typeof V1_LAYOUTS)[number];

/** 허용 슬라이드 수. UI selector + API validation 양쪽에서 사용.
 *  C2-fix-1f: 3장 케이스가 outline 생성에서 500 에러 발생 → 임시로 옵션 제거. */
export const ALLOWED_SLIDE_COUNTS = [5, 7, 10] as const;
export type AllowedSlideCount = (typeof ALLOWED_SLIDE_COUNTS)[number];

// ── Theme preset (C2-fix-1, 2026-05-08) ────────────────────────────────────
//
// 5장 카드뉴스의 이미지·텍스트 톤 일관성을 강제하기 위한 4 preset.
// 사용자 결정 사항 잠금:
//   - 4종 (5번째 추가 금지)
//   - default = 'friendly_illust' (가장 범용)
//   - palette = 3 hex (이미지 prompt 안에 직접 inject)
//   - imageStyleEn = GPT Image 2.0 친화 영문 prefix
//   - textToneKo  = Gemini 텍스트 톤 가이드 (한글)
//   - previewBg   = SlidePreview 배경 (단색 또는 그라데이션 base)

export type ThemeId =
  | 'friendly_illust'
  | 'professional_medical'
  | 'warm_care'
  | 'modern_minimal';

export interface ThemePreset {
  id: ThemeId;
  label: string;
  description: string;
  /** 3색 팔레트. cover/closing 그라데이션은 [0], [1] 사용. */
  palette: [string, string, string];
  /** GPT Image 2.0 prompt prefix (영문). visualKeyword 앞에 prepend. */
  imageStyleEn: string;
  /** Gemini 텍스트 톤 가이드 (한글). systemInstruction + prompt 양쪽에 inject. */
  textToneKo: string;
  /** SlidePreview 단색 배경 (info/checklist/comparison). 보통 흰색에 가깝게. */
  previewBg: string;
  /**
   * C2-fix-1e: 운영자가 업로드한 theme reference 이미지 경로 (public/ 기준).
   * GPT Image 2.0 의 images.edit 호출에 base64 변환 후 전달 — 5장 이미지가
   * 본 reference 의 디자인·색감을 모방하도록 강제. OPENAI_IMAGE_EDIT_ENABLED=0
   * 또는 edit API 실패 시 prompt-text-hint 로 fallback.
   * 확장자는 실제 업로드 파일에 맞춰 mixed (jpg / png).
   */
  referencePath: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'friendly_illust',
    label: '친근 일러스트',
    description: '다정하고 안심되는 톤. 환자에게 친절히 설명할 때.',
    palette: ['#FFD6E1', '#FFE8C9', '#C8E6C9'],
    imageStyleEn:
      'soft pastel card news template design with pastel pink (#FFD6E1), cream (#FFE8C9), sage green (#C8E6C9), subtle dotted pattern background overlay, rounded info graphic elements, gentle watercolor accents at corners (flowers or hearts), centered title zone reserved blank, structured info card slots, premium graphic design, friendly atmosphere. NO TEXT, NO LETTERS, NO TYPOGRAPHY in image. Pure visual template design — title and body text will be overlaid by code. Leave centered title area blank, leave bottom 12% strip blank for footer logo.',
    textToneKo:
      '친근하고 다정한 톤. 환자에게 말하듯 쉬운 표현. "~예요/~어요" 어미 권장. 의학 전문 용어는 풀어서 설명. 격식보다 따뜻함 우선.',
    previewBg: '#FFFBF7',
    referencePath: '/theme-references/friendly_illust.jpg',
  },
  {
    id: 'professional_medical',
    label: '전문 의료',
    description: '신뢰감과 차분함. 병원 소개·전문 시술 안내.',
    palette: ['#2C5282', '#4A5568', '#E2E8F0'],
    imageStyleEn:
      'professional infographic card news template, deep navy (#2C5282) solid background with subtle geometric triangular pattern overlay, slate gray (#4A5568) secondary tone, light gray (#E2E8F0) accent details, white outlined medical icons (stethoscope/cross/clipboard placeholder shapes) in dedicated graphic boxes, clinical premium quality, structured info graphic zones with thin border frames, bold title area reserved blank at top, footer logo strip reserved blank at bottom. NO TEXT, NO LETTERS, NO TYPOGRAPHY in image. Pure visual template design — title and body text will be overlaid by code. Leave centered title area blank, leave bottom 12% strip blank for footer logo.',
    textToneKo:
      '신뢰감 있고 차분한 톤. "~합니다/~입니다" 격식체. 의학 용어 사용 가능하되 1회는 풀어서 설명. 정확한 수치·근거 위주. 감정 표현 절제.',
    previewBg: '#F7FAFC',
    referencePath: '/theme-references/professional_medical.png',
  },
  {
    id: 'warm_care',
    label: '따뜻한 케어',
    description: '부드럽고 가족적인 톤. 산부인과·소아·가정의학.',
    palette: ['#F4E4D6', '#FFB4A2', '#B5C99A'],
    imageStyleEn:
      'warm care card news template design, warm beige (#F4E4D6) solid background with soft coral (#FFB4A2) accent zones, muted sage (#B5C99A) decorative elements, gentle botanical decoration at corners (leaves/small flowers), family-friendly atmosphere, structured info card slots with rounded frames, soft lighting and nurturing visual tone, centered title area reserved blank, footer logo strip reserved blank. NO TEXT, NO LETTERS, NO TYPOGRAPHY in image. Pure visual template design — title and body text will be overlaid by code. Leave centered title area blank, leave bottom 12% strip blank for footer logo.',
    textToneKo:
      '부드럽고 가족적인 톤. "~예요/~어요" 친근체. 가족·돌봄·안심 같은 단어 자연스럽게. 환자뿐 아니라 보호자도 함께 안내한다는 느낌.',
    previewBg: '#FDF8F3',
    referencePath: '/theme-references/warm_care.png',
  },
  {
    id: 'modern_minimal',
    label: '모던 미니멀',
    description: '정확하고 깔끔. 데이터·통계·체크리스트.',
    palette: ['#1A1A2E', '#E94560', '#FFFFFF'],
    imageStyleEn:
      'modern minimal infographic card news template, monotone deep navy (#1A1A2E) solid background with sharp geometric pattern overlay (subtle white triangles or thin diagonal lines), single coral red accent (#E94560) used sparingly for emphasis dots and icon highlights, flat icon placeholder zones (square or circle frames), info chart placeholder squares with thin outlines, data-focused premium graphic design, clean structured layout, bold title zone reserved blank at top, footer logo strip reserved blank at bottom. NO TEXT, NO LETTERS, NO TYPOGRAPHY in image. Pure visual template design — title and body text will be overlaid by code. Leave centered title area blank, leave bottom 12% strip blank for footer logo.',
    textToneKo:
      '정확하고 깔끔한 톤. "~합니다" 또는 명사체. 군더더기 없이 핵심만. 숫자·비율·단계 같은 데이터 강조. 형용사는 최소.',
    previewBg: '#FFFFFF',
    referencePath: '/theme-references/modern_minimal.jpg',
  },
] as const;

// ── Aspect ratio (C2-fix-1e) ────────────────────────────────────────────────
// v1 에선 2종만 노출 (정사각 / 세로). /api/image 의 AspectRatio 타입(8종)
// 의 narrow subset — string union 호환 (좁은 → 넓은 자동 캐스트).
// gpt-image-2 의 size 매핑은 /api/image 의 aspectRatioToSize 가 담당하므로
// 본 모듈은 UI/저장용 narrow 타입만 노출.

export type AspectRatio = '1:1' | '4:5';

export interface AspectRatioPreset {
  id: AspectRatio;
  label: string;
  /** UI 표시용 — 실제 export 픽셀. */
  size: string;
  /** SlidePreview 'export' 모드의 절대 픽셀. html2canvas / jspdf 모두 사용. */
  dims: { w: number; h: number };
  /** /api/image body.aspectRatio 로 그대로 forward — aspectRatioToSize 가 변환. */
  openaiAspectRatio: '1:1' | '4:5';
}

export const ASPECT_RATIOS: readonly AspectRatioPreset[] = [
  {
    id: '1:1',
    label: '정사각형',
    size: '1080×1080',
    dims: { w: 1080, h: 1080 },
    openaiAspectRatio: '1:1',
  },
  {
    id: '4:5',
    label: '세로형',
    size: '1080×1350',
    dims: { w: 1080, h: 1350 },
    openaiAspectRatio: '4:5',
  },
] as const;

export const DEFAULT_RATIO: AspectRatio = '1:1';

export function getRatio(id: AspectRatio | string | undefined | null): AspectRatioPreset {
  if (!id) return ASPECT_RATIOS[0];
  const found = ASPECT_RATIOS.find((r) => r.id === id);
  return found || ASPECT_RATIOS[0];
}

export function isValidRatio(v: unknown): v is AspectRatio {
  return v === '1:1' || v === '4:5';
}

export const DEFAULT_THEME: ThemeId = 'friendly_illust';

/** ThemeId → ThemePreset. 알 수 없는 ID 또는 undefined 면 default 반환. */
export function getTheme(id: ThemeId | string | undefined | null): ThemePreset {
  if (!id) return THEME_PRESETS[0];
  const found = THEME_PRESETS.find((t) => t.id === id);
  return found || THEME_PRESETS[0];
}

/** ThemeId 화이트리스트 검증 — API body 입력 sanitize. */
export function isValidThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEME_PRESETS.some((t) => t.id === v);
}

// ── Outline 단계 (1차 LLM) ─────────────────────────────────────────────────

/** 구성 안 한 슬라이드의 골격 — 텍스트 단계의 입력이 된다. */
export interface SlideOutline {
  index: number;
  layout: V1Layout;
  role: string;            // '표지' | '도입' | '핵심 체크' 등 한국어 라벨
  titleHint: string;       // 슬라이드의 제목 후보 (사용자가 검토 시 보이는 문구)
  contentHint: string;     // 이 슬라이드에 다룰 내용 1~2문장 안내
}

export interface OutlineRequest {
  topic: string;
  slideCount: AllowedSlideCount;
  hospitalName?: string;
  category?: string;
}

export function buildOutlinePrompt(req: OutlineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const safeTopic = sanitizePromptInput(req.topic, 200);
  const safeHospital = req.hospitalName ? sanitizePromptInput(req.hospitalName, 50) : null;
  const safeCategory = req.category ? sanitizePromptInput(req.category, 30) : null;

  const systemInstruction = [
    '당신은 한국 병원 마케팅 카드뉴스의 구성 안 작성자다.',
    '의료광고법 (의료법 시행령 제24조·시행규칙 제23조) 을 항상 준수한다.',
    '"최고", "유일", "100% 안전", "완벽한", "부작용 없는" 같은 절대적 표현은 절대 쓰지 않는다.',
    '환자의 후기·체험담을 단정적으로 인용하지 않는다.',
    '[META: instructions for the model — do NOT echo this line into any JSON value.] Output a single valid JSON only. No code fences, no explanations, no markdown.',
  ].join('\n');

  const layoutSpec = V1_LAYOUTS
    .map((l) => `  - "${l}" (${LAYOUT_KO_HINT[l]})`)
    .join('\n');

  const prompt = [
    `주제: ${safeTopic}`,
    `슬라이드 수: ${req.slideCount}장`,
    safeHospital ? `병원명: ${safeHospital}` : null,
    safeCategory ? `진료과: ${safeCategory}` : null,
    '',
    `사용 가능한 레이아웃 (${V1_LAYOUTS.length}종, 다른 값 금지):`,
    layoutSpec,
    '',
    '제약:',
    `- 첫 슬라이드는 반드시 "cover" 레이아웃.`,
    `- 마지막 슬라이드는 반드시 "closing" 레이아웃.`,
    `- 중간 슬라이드는 "info" / "checklist" / "comparison" 중 주제·콘텐츠에 자연스러운 것 선택.`,
    `- 동일 레이아웃 3장 이상 연속 금지 (단조로움 방지).`,
    '',
    '응답 JSON 형식 (배열만, 다른 텍스트 금지):',
    '[',
    '  { "index": 1, "layout": "cover", "role": "표지", "titleHint": "...", "contentHint": "..." },',
    '  { "index": 2, "layout": "info", "role": "도입", "titleHint": "...", "contentHint": "..." },',
    '  ...',
    `  { "index": ${req.slideCount}, "layout": "closing", "role": "마무리", "titleHint": "...", "contentHint": "..." }`,
    ']',
  ]
    .filter(Boolean)
    .join('\n');

  return { systemInstruction, prompt };
}

/** Outline JSON parse. 실패 시 null 반환 (호출자가 fallback / error 결정). */
export function parseOutlineJson(rawText: string): SlideOutline[] | null {
  const stripped = stripCodeFences(rawText);
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set<string>(V1_LAYOUTS);
    const result: SlideOutline[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const layout = typeof o.layout === 'string' ? o.layout : '';
      if (!allowed.has(layout)) return null;
      result.push({
        index: typeof o.index === 'number' ? o.index : result.length + 1,
        layout: layout as V1Layout,
        role: typeof o.role === 'string' ? o.role : '',
        titleHint: typeof o.titleHint === 'string' ? o.titleHint : '',
        contentHint: typeof o.contentHint === 'string' ? o.contentHint : '',
      });
    }
    return result;
  } catch {
    return null;
  }
}

// ── Text 단계 (2차 LLM) ────────────────────────────────────────────────────

export interface TextRequest {
  topic: string;
  outline: SlideOutline[];
  hospitalName?: string;
  category?: string;
  /** 톤 가이드 inject 용. 미지정 시 default theme. */
  theme?: ThemeId;
}

export function buildTextPrompt(req: TextRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const safeTopic = sanitizePromptInput(req.topic, 200);
  const safeHospital = req.hospitalName ? sanitizePromptInput(req.hospitalName, 50) : null;
  const safeCategory = req.category ? sanitizePromptInput(req.category, 30) : null;
  const theme = getTheme(req.theme);

  const systemInstruction = [
    '당신은 한국 병원 마케팅 카드뉴스 본문 작성자다.',
    '의료광고법 (의료법 시행령 제24조) 을 항상 준수.',
    '금지 표현: "최고", "유일", "100%", "완벽", "부작용 없는", "안전한", "검증된", "효과 보장".',
    '환자 후기·체험담 단정적 인용 금지. 시술 효과를 단정하지 않고 "도움이 될 수 있다" 류 완곡 표현.',
    `병원명이 주어지면 정확히 그 병원명만 사용. 다른 병원명 지어내기 절대 금지.`,
    '[META: instructions for the model — do NOT echo this line into any JSON value.] Output a valid JSON array only. No code fences, no explanations, no markdown.',
    // C2-fix-1: 톤 가이드 (모든 슬라이드 일관 적용)
    `[톤 가이드 — "${theme.label}"] ${theme.textToneKo}`,
  ].join('\n');

  const outlineLines = req.outline
    .map((o) => `  ${o.index}. [${o.layout}] ${o.role} — "${o.titleHint}" (${o.contentHint})`)
    .join('\n');

  const prompt = [
    `주제: ${safeTopic}`,
    safeHospital ? `병원명: ${safeHospital} (다른 병원명 금지)` : null,
    safeCategory ? `진료과: ${safeCategory}` : null,
    '',
    '구성 안:',
    outlineLines,
    '',
    '[META: instructions for the model — do NOT echo this line into any JSON value.] Output each slide as a SlideData JSON inside an array. Required fields per layout (keep these exact key names):',
    '- cover: { layout, title, subtitle, visualKeyword }',
    '- info: { layout, title, body, visualKeyword }',
    '- checklist: { layout, title, checkItems: [string, ...] (3~6개), visualKeyword }',
    '- comparison: { layout, title, compareLabels: [string, string], columns: [{ header, items: string[] }, { header, items: string[] }], visualKeyword }',
    '- closing: { layout, title, body, hashtags: [string, ...] (3~5개) }',
    '',
    '공통:',
    '- title 은 30자 이내. body 는 80자 이내. checkItems 각 항목 25자 이내.',
    '- visualKeyword 는 이미지 생성 hint (한·영 혼용 가능, 30자 이내).',
    '- 모든 필드는 한국어. 영어 단어 섞기 최소화.',
    '- index 필드는 outline 의 index 와 동일하게 1, 2, 3 ... 으로.',
    '',
    `[톤 가이드 — 모든 슬라이드에 일관 적용 · "${theme.label}"]`,
    theme.textToneKo,
    '',
    `응답: ${req.outline.length}개 객체로 구성된 JSON 배열. 다른 텍스트 금지.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { systemInstruction, prompt };
}

/** Text JSON parse → SlideData[]. 부분 실패 케이스 (1~2장 깨짐) 도 가능한 한 살린다. */
export function parseSlidesJson(rawText: string): SlideData[] | null {
  const stripped = stripCodeFences(rawText);
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (!Array.isArray(parsed)) return null;
    const slides: SlideData[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const layout = typeof o.layout === 'string' ? o.layout : '';
      if (!new Set<string>(V1_LAYOUTS).has(layout)) continue;
      const slide: SlideData = {
        id: generateSlideId(),
        index: typeof o.index === 'number' ? o.index : i + 1,
        layout: layout as SlideData['layout'],
        title: typeof o.title === 'string' ? o.title : '',
        ...(typeof o.subtitle === 'string' ? { subtitle: o.subtitle } : {}),
        ...(typeof o.body === 'string' ? { body: o.body } : {}),
        ...(typeof o.visualKeyword === 'string' ? { visualKeyword: o.visualKeyword } : {}),
        ...(Array.isArray(o.checkItems) ? { checkItems: o.checkItems.filter((x): x is string => typeof x === 'string') } : {}),
        ...(Array.isArray(o.compareLabels) && o.compareLabels.length === 2
          ? { compareLabels: o.compareLabels.filter((x): x is string => typeof x === 'string').slice(0, 2) as [string, string] }
          : {}),
        ...(Array.isArray(o.columns)
          ? {
              columns: (o.columns as Array<Record<string, unknown>>)
                .filter((c) => c && typeof c.header === 'string' && Array.isArray(c.items))
                .map((c) => ({
                  header: c.header as string,
                  items: (c.items as unknown[]).filter((x): x is string => typeof x === 'string'),
                })),
            }
          : {}),
        ...(Array.isArray(o.hashtags) ? { hashtags: o.hashtags.filter((x): x is string => typeof x === 'string') } : {}),
      };
      slides.push(slide);
    }
    return slides.length > 0 ? slides : null;
  } catch {
    return null;
  }
}

// ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

/** 레이아웃별 한국어 hint — outline prompt 안내용. */
const LAYOUT_KO_HINT: Record<V1Layout, string> = {
  cover: '표지 — 큰 제목 + 부제',
  info: '정보형 — 제목 + 본문 1~2문단',
  checklist: '체크리스트 — 3~6개 항목 나열',
  comparison: '비교표 — 2개 열 (전/후, 일반/맞춤, ...)',
  closing: '마무리 — 한 줄 요약 + 해시태그',
};

/** LLM 응답에서 ```json ... ``` 코드펜스 제거. 일반 텍스트도 그대로 통과. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // ```json\n...\n``` 또는 ```\n...\n```
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
  const m = trimmed.match(fence);
  if (m) return m[1].trim();
  return trimmed;
}
