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

/** 허용 슬라이드 수. UI selector + API validation 양쪽에서 사용. */
export const ALLOWED_SLIDE_COUNTS = [3, 5, 7, 10] as const;
export type AllowedSlideCount = (typeof ALLOWED_SLIDE_COUNTS)[number];

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
    '응답은 반드시 유효한 JSON 만으로 출력. 코드펜스, 설명, 들여쓰기 다른 형식 절대 금지.',
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
}

export function buildTextPrompt(req: TextRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const safeTopic = sanitizePromptInput(req.topic, 200);
  const safeHospital = req.hospitalName ? sanitizePromptInput(req.hospitalName, 50) : null;
  const safeCategory = req.category ? sanitizePromptInput(req.category, 30) : null;

  const systemInstruction = [
    '당신은 한국 병원 마케팅 카드뉴스 본문 작성자다.',
    '의료광고법 (의료법 시행령 제24조) 을 항상 준수.',
    '금지 표현: "최고", "유일", "100%", "완벽", "부작용 없는", "안전한", "검증된", "효과 보장".',
    '환자 후기·체험담 단정적 인용 금지. 시술 효과를 단정하지 않고 "도움이 될 수 있다" 류 완곡 표현.',
    `병원명이 주어지면 정확히 그 병원명만 사용. 다른 병원명 지어내기 절대 금지.`,
    '응답은 유효한 JSON 배열만 출력. 코드펜스·설명·markdown 금지.',
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
    '각 슬라이드의 SlideData JSON 을 배열로 출력. 레이아웃별 필수 필드:',
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
