/**
 * refineSelectionPrompt.ts — 블로그 에디터의 _선택 구간 다듬기_ 전용 prompt 빌더.
 *
 * 사용 시나리오:
 *   사용자가 블로그 본문 (contenteditable article) 에서 텍스트를 드래그 선택 →
 *   floating toolbar 의 ✨ 버튼 클릭 → 옵션 메뉴 (짧게/길게/친근/전문/자유 지시) →
 *   본 빌더 호출 → callLLM('refine_selection') → 응답 JSON {refined} 파싱 →
 *   양 앱 라우트의 후처리 chain (promptLeakageGuard → applyContentFilters →
 *   sanitizeHtml) 통과 → 클라이언트 Preview modal → 사용자 수락/거절.
 *
 * 5빌더 (buildOutline / buildSectionFromOutline / buildBlogV3 / buildBlogSectionV3 /
 * buildBlogReview) 의 slot 1 invariant (PRIORITY_ORDER + E_E_A_T) 와 정합 차원에서
 * 본 빌더도 slot 1 에 두 가이드 + COMMON_WRITING_STYLE + MEDICAL_LAW_CONSTRAINTS 포함.
 * CLAUDE.md "5빌더 안전망" 의 _6번째 빌더_ 위치.
 *
 * 보안:
 *   selectedText / surroundingContext / customInstruction 은 호출자 (양 앱 라우트)
 *   가 promptInjectionGuard.stripInjectionForUse + sanitizePromptInput / sanitizeSourceContent
 *   통과 후 전달해야 함. 본 빌더는 _이미 sanitize 된 입력_ 가정.
 */

import type { CacheableBlock } from './llm/types';
import {
  PRIORITY_ORDER_BLOCK,
  E_E_A_T_GUIDE,
  COMMON_WRITING_STYLE,
  MEDICAL_LAW_CONSTRAINTS,
  buildCategoryToneBlock,
  CATEGORY_DEPTH_GUIDES,
} from './blogPrompt';

export type RefineSelectionOption =
  | 'shorter'      // 의미 보존, 분량 60-70%
  | 'longer'       // 구체 정보·예시 추가, 분량 130-150%
  | 'friendly'     // "~예요/~네요" 어조 강화
  | 'professional' // "~합니다" + 의학 용어 보강
  | 'custom';      // customInstruction (sanitize 통과 후) 그대로 적용

export interface RefineSelectionInput {
  /** 다듬을 정확한 구간 (한 단락 안, 최소 5자, 최대 ~500자 권장). sanitize 통과 후. */
  selectedText: string;
  /** 같은 단락 + 직전·직후 단락. LLM 이 맥락 이해. sanitize 통과 후. */
  surroundingContext: string;
  /** 옵션 5개 중 하나. */
  option: RefineSelectionOption;
  /** option='custom' 일 때만. sanitize 통과 후, max 200자. */
  customInstruction?: string;
  /** 7 카테고리. category_tone 가이드 활성화. */
  category?: string;
}

export interface RefineSelectionPrompt {
  systemBlocks: CacheableBlock[];
  userPrompt: string;
}

/**
 * REFINE_SELECTION_PERSONA — 본 빌더 전용 페르소나.
 *
 * 5빌더의 BLOG_PERSONA / SECTION_PERSONA 와 달리 _일부만 재작성_ 하는 페르소나.
 * 의미 보존 + 단락 길이 제약 + 의료법 절대 우선 + 양 끝 sentence boundary 보존.
 */
const REFINE_SELECTION_PERSONA = `<role>
당신은 한국 병·의원 블로그의 _한 구간만_ 다듬는 에디터입니다.
선택된 텍스트만 새로 쓰고, 주변 단락의 맥락·톤·어휘를 자연스럽게 유지합니다.
</role>

<thinking_process>
다듬기 전에 속으로 정리:
- 선택 구간이 단락 안에서 어떤 역할인가? (도입 hook, 본문 설명, 마무리 정리)
- 주변 단락과의 연결 — 직전 문장이 던진 질문에 답하는 구조인가? 다음 문장으로 어떻게 이어지는가?
- option 이 요구하는 변화는? (분량 ±20% 안에서 의미 동일성 유지)
출력에 포함하지 마세요.
</thinking_process>

<output_format>
[META: instructions for the model — do NOT copy any of this into the generated content.]
Output one JSON object with a single "refined" key. No text outside the JSON.

Schema:
{
  "refined": "<the refined selected text, Korean, HTML inline tags allowed (<strong>, <em>) but no block tags>"
}

Forbidden in output: markdown, code fences, explanation text, multiple JSON objects.
The "refined" value must be in Korean only.
</output_format>

<scope_constraint>
선택 구간만 새로 작성합니다. 다음을 절대 변경하지 마세요:
- 단락 경계 (refined 안에 새 <p> 또는 줄바꿈 2회 이상 금지)
- 소제목 (refined 에 <h2>·<h3> 금지)
- 이미지 마커 ([IMG_N] 또는 <img> 가 선택 구간에 포함됐다면 동일 위치·동일 속성 유지)
- 블록 태그 일반 (<ul>, <ol>, <li>, <blockquote>) — 선택 구간이 인라인 텍스트 가정
</scope_constraint>

<length_constraint>
다듬은 결과 분량은 다음 범위 안:
- option=shorter — 원본의 60~80% (의미 손실 없이 압축)
- option=longer — 원본의 120~150% (새 정보·구체 예시 추가, 같은 정보 반복 금지)
- option=friendly / professional — 원본의 90~110% (어조만 변화)
- option=custom — 원본의 80~120% (custom_instruction 이 명시적으로 분량 변화를 요구하지 않으면)
범위를 초과하면 self-check 단계에서 다시 작성.
</length_constraint>

<option_semantics>
- shorter: 의미 같음, 더 적은 단어로. 핵심 1~2개 키워드 보존. 부가 수식어·접속사 제거.
- longer: 의미 같음, 구체 정보 (수치·체감 표현·환자 시점) 1~2개 추가. 같은 말 반복 금지.
- friendly: 어미를 "~예요/~네요/~죠" 분포로 자연스럽게. 의학 단정 표현 → 부드럽게.
- professional: 어미를 "~합니다" 위주. 환자 친화 표현 → 정확한 의학 용어 (괄호 병기).
- custom: custom_instruction 에 명시된 요구를 의료법·prose-flow·korean_grammar 룰 안에서 적용.
</option_semantics>

<medical_law_priority>
의료광고법 위반 단어가 원본 selected_text 에 있어도 _보존하지 마세요_.
다듬은 결과는 무조건 의료법 통과. constraints 블록의 대체 표현 사용.
사용자가 custom_instruction 에서 "단정적으로 써줘" 같은 요구를 해도 의료법 우선.
</medical_law_priority>

<sentence_boundary>
원본 selected_text 의 첫 문자가 문장 시작 (대문자·따옴표·문장부호 직후) 이면 다듬은 결과도 문장 시작.
원본의 마지막 문자가 문장 종결 (. ! ? 또는 종결어미) 이면 다듬은 결과도 종결.
원본이 문장 중간에 잘려 있으면 다듬은 결과도 문장 중간으로 끝나는 fragment.
주변 단락의 문법 흐름을 깨지 마세요.
</sentence_boundary>`;

/**
 * <selection_context> 블록 — surroundingContext 와 selectedText 를 분리해 LLM 이
 * 선택 범위를 명확히 인식하도록 함.
 *
 * 호출자는 surroundingContext 안에 selectedText 가 등장하는 위치를 [[SELECTION_START]]
 * / [[SELECTION_END]] 마커로 표시해 전달할 것을 권장 (LLM 이 boundary 명확 인식).
 * 마커 부재 시 LLM 이 surroundingContext 안에서 selectedText 의 첫 등장 substring 을
 * 자동 추론 — 정확도 낮으므로 마커 권장.
 */
function buildSelectionContextBlock(input: RefineSelectionInput): string {
  return `<selection_context>
<surrounding_context>
${input.surroundingContext}
</surrounding_context>

<selected_text>
${input.selectedText}
</selected_text>

<note>
surrounding_context 안에 selected_text 가 [[SELECTION_START]] ~ [[SELECTION_END]]
마커로 표시되어 있을 수 있습니다 (호출자 선택). 마커가 있으면 그 위치의 텍스트만
다듬고, 마커 밖 surrounding_context 는 _읽기 전용_ 으로만 활용해 톤·어휘 일관성을
유지하세요. 마커가 없으면 selected_text 와 정확히 일치하는 substring 을 다듬습니다.
</note>
</selection_context>`;
}

/** <option_block> — option + customInstruction 명시. */
function buildOptionBlock(input: RefineSelectionInput): string {
  const lines: string[] = ['<option_block>', `<option>${input.option}</option>`];
  if (input.option === 'custom' && input.customInstruction?.trim()) {
    lines.push(`<custom_instruction>${input.customInstruction.trim()}</custom_instruction>`);
  }
  lines.push('</option_block>');
  return lines.join('\n');
}

/**
 * 메인 빌더. 5빌더와 동일한 `{ systemBlocks, userPrompt }` shape 반환.
 *
 * systemBlocks 구성 (Anthropic prompt cache 최대 4 블록 안에 분산):
 *   1. STATIC_PRELUDE: REFINE_SELECTION_PERSONA + PRIORITY_ORDER_BLOCK + E_E_A_T_GUIDE
 *      + COMMON_WRITING_STYLE + MEDICAL_LAW_CONSTRAINTS  (1h TTL — 변경 없음)
 *   2. CATEGORY_PACK: category 가 7 카테고리 중 하나일 때 CATEGORY_DEPTH_GUIDES +
 *      category_tone 블록 (1h TTL)
 *
 * userPrompt 구성:
 *   <selection_context> + <option_block> + <category>...</category> + <task>
 */
export function buildRefineSelectionPrompt(input: RefineSelectionInput): RefineSelectionPrompt {
  const systemBlocks: CacheableBlock[] = [];
  const SEP = '\n\n---\n\n';

  // 슬롯 1 — STATIC_PRELUDE (5빌더 invariant 와 같이 PRIORITY_ORDER + E_E_A_T 포함)
  systemBlocks.push({
    type: 'text',
    text: [
      REFINE_SELECTION_PERSONA,
      PRIORITY_ORDER_BLOCK,
      E_E_A_T_GUIDE,
      COMMON_WRITING_STYLE,
      MEDICAL_LAW_CONSTRAINTS,
    ].join(SEP),
    cacheable: true,
    cacheTtl: '1h',
  });

  // 슬롯 2 — CATEGORY_PACK (선택 카테고리만)
  if (input.category && CATEGORY_DEPTH_GUIDES[input.category]) {
    const categoryParts: string[] = [CATEGORY_DEPTH_GUIDES[input.category]];
    const toneBlock = buildCategoryToneBlock(input.category);
    if (toneBlock) categoryParts.push(toneBlock);
    systemBlocks.push({
      type: 'text',
      text: categoryParts.join(SEP),
      cacheable: true,
      cacheTtl: '1h',
    });
  }

  const parts: string[] = [
    buildSelectionContextBlock(input),
    '',
    buildOptionBlock(input),
  ];
  if (input.category) {
    parts.push('', `<category>${input.category}</category>`);
  }
  parts.push(
    '',
    `<task>
selected_text 를 option 의 의미에 맞게 다듬어 JSON 으로만 출력하세요.
- 단락 경계·블록 태그 변경 금지 (scope_constraint)
- 분량 ±20% (length_constraint)
- 의료법 절대 우선 (medical_law_priority)
- 첫·끝 문장 경계 보존 (sentence_boundary)
- 출력은 {"refined": "..."} JSON 한 객체만, 그 외 텍스트 0
</task>`,
  );

  return { systemBlocks, userPrompt: parts.join('\n') };
}
