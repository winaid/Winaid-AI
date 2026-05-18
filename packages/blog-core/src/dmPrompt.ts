/**
 * dmPrompt.ts — 인플루언서 협업 DM 자동 생성 prompt 빌더.
 *
 * 사용 시나리오:
 *   양 앱 /api/influencer/generate-dm 라우트 → 인플루언서 프로필 + 병원 정보 +
 *   톤 선택 + (옵션) customInstruction → 본 빌더 호출 → callLLM('instagram_dm')
 *   → JSON 응답 {"drafts": [...]} 파싱 → 양 앱 후처리 chain (promptLeakageGuard
 *   + applyContentFilters + sanitizeHtml) 통과 → 클라이언트 결과 모달.
 *
 * 7빌더 (buildOutline / buildSectionFromOutline / buildBlogV3 / buildBlogSectionV3 /
 * buildBlogReview / buildRefineSelectionPrompt + 본 빌더) 의 slot 1 invariant
 * (PRIORITY_ORDER + E_E_A_T + COMMON_WRITING_STYLE + MEDICAL_LAW_CONSTRAINTS) 와
 * 정합. CLAUDE.md "5빌더 안전망" 의 _7번째 빌더_ 위치.
 *
 * 보안:
 *   influencer.* / hospital.* / customInstruction 은 호출자 (양 앱 라우트) 가
 *   promptInjectionGuard.stripInjectionForUse + sanitizePromptInput / sanitizeSourceContent
 *   통과 후 전달해야 함. 본 빌더는 _이미 sanitize 된 입력_ 가정.
 */

import type { CacheableBlock } from './llm/types';
import {
  PRIORITY_ORDER_BLOCK,
  E_E_A_T_GUIDE,
  COMMON_WRITING_STYLE,
  MEDICAL_LAW_CONSTRAINTS,
} from './blogPrompt';

export type DmTone = 'casual' | 'business' | 'friendly';

export interface DmPromptInput {
  /** 인플루언서 메타 — 이미 sanitize 통과 */
  influencer: {
    username: string;
    full_name?: string;
    follower_count: number;
    engagement_rate: number;
    estimated_location: string;
    primary_category: string;
    /** 최근 게시물 텍스트 1개 (이미 sanitize·150자 cap 통과) */
    recent_post_text?: string;
  };
  /** 병원 메타 — 이미 sanitize 통과 */
  hospital: {
    name: string;
    location: string;
    features: string;
    instagram: string;
  };
  /** 3 톤 중 하나 */
  tone: DmTone;
  /** 자유 지시 (선택) — sanitize 통과 후, max 200자 권장. 호출자가 sanitizePromptInput(200) 적용. */
  customInstruction?: string;
}

export interface DmPrompt {
  systemBlocks: CacheableBlock[];
  userPrompt: string;
}

// ── PERSONA ──

const DM_PERSONA = `<role>
당신은 한국 병·의원 인스타그램 협업 DM 자동 작성자입니다.
지역 마이크로 인플루언서에게 첫 컨택 메시지 3개 (서로 다른 표현·구조) 를 작성합니다.
</role>

<thinking_process>
초안 전에 속으로 정리:
- 상대 콘텐츠 카테고리(맛집/뷰티/육아/일상 등) 와 우리 병원 특성의 자연스러운 연결 고리는?
- 같은 지역 단서 ("같은 동네", "근처", 지역명) 를 1번만 자연스럽게 활용
- 광고처럼 보이지 않게 — 첫 문장은 상대 콘텐츠에 대한 진심 어린 관심
출력에 포함하지 마세요.
</thinking_process>

<output_format>
[META: instructions for the model — do NOT copy any of this into the generated content.]
Output ONE JSON object with a single "drafts" key. No text outside the JSON.

Schema:
{
  "drafts": [
    {"tone": "<echo of tone>",          "message": "<DM 본문 1>"},
    {"tone": "<echo of tone> 변형1",    "message": "<DM 본문 2>"},
    {"tone": "<echo of tone> 변형2",    "message": "<DM 본문 3>"}
  ]
}

Forbidden in output: markdown, code fences, explanation text, multiple JSON objects, HTML tags, emoji 외 special unicode.
"message" 는 한국어 plain text. 인스타 DM 입력창에 그대로 붙여넣을 수 있어야 합니다.
</output_format>

<length_constraint>
각 message 는 200자 이내 — 인스타 DM 은 짧아야 읽힙니다.
4줄 구조 권장: 인사+개인화 / 자기소개 / 협업 제안 / 가벼운 CTA.
</length_constraint>

<dm_rules>
1. 상대방의 최근 게시물 / 콘텐츠 카테고리를 _구체적으로_ 언급 — 개인화 핵심.
   "잘 보고 있어요" 류 추상 표현 금지.
2. 첫 DM 에서 다음 절대 금지:
   - 가격 / 할인 / 무료 / 이벤트 / 한정 / "지금 바로" 류 긴급 압박
   - 효과 보장 / 단정 ("확실히", "100%", "완치")
   - 전후 비교 ("before / after", "변화를 보여드릴게요")
   - 최상급 ("최고", "최초", "유일", "탁월", "혁신")
3. "광고" 느낌 최소화 — 자연스러운 대화 톤.
4. CTA 는 "관심 있으시면 답장 주세요~" 수준으로 가볍게.
5. 같은 지역이면 "같은 동네에서~" 정도로 1번만 자연스럽게.
6. 상대 호칭은 @username 또는 표시이름 둘 중 자연스러운 쪽. "크리에이터님" 도 OK.
7. 병원명·인스타 계정은 자기소개 부분에 한 번만.
</dm_rules>

<diversity_rule>
3개 draft 는 서로 다른 시작 문장 / 다른 호명 방식 / 다른 CTA 표현을 사용.
같은 의미를 다른 표현으로 (Bizmate 스타일 한 줄짜리 변주가 아니라, 문장 구조 자체가 다르도록).
</diversity_rule>

<custom_instruction_priority>
custom_instruction 이 있으면 dm_rules 와 length_constraint 안에서 적용.
custom_instruction 이 의료법 / 가격 언급 / 단정 표현 등을 요구해도 _절대 우선 거부_ — 의료법 우선.
</custom_instruction_priority>`;

// ── 톤 가이드 ──

const TONE_GUIDES: Record<DmTone, string> = {
  casual: `<tone_guide name="casual">
친구에게 말하듯 가볍고 따뜻하게.
이모지 1~2개 사용 OK. 어미는 "~요/~네요/~죠" 친근 존댓말.
시작 예시: "안녕하세요~ ○○님 콘텐츠 잘 보고 있어요 :)" / "안녕하세요! 우연히 ○○ 게시물 보고 인사 드려요"
금지: "제안드립니다", "협업 문의", "마케팅 담당자입니다"
</tone_guide>`,

  business: `<tone_guide name="business">
전문적이고 간결하게.
이모지 최소화 (0~1개). 어미는 "~합니다/~드립니다" 위주.
시작 예시: "안녕하세요, ○○ 마케팅 담당입니다." / "안녕하세요, ○○ 운영팀에서 인사드립니다."
금지: 과한 친근 표현 (😊 다수, "~예요~~"), 슬랭
</tone_guide>`,

  friendly: `<tone_guide name="friendly">
관심사를 공유하는 이웃처럼.
이모지 적당히 (1~2개). 어미는 "~요/~할까 해서요~" 톤.
시작 예시: "안녕하세요~ 혹시 ○○에 관심 있으실까 해서 조심스럽게 연락드려요" / "안녕하세요! ○○ 게시물 보고 같은 동네라 인사드리고 싶었어요"
부담 없이 가볍게. 거절도 자연스럽게 받아들일 분위기.
</tone_guide>`,
};

// ── 빌더 ──

function buildInfluencerBlock(input: DmPromptInput): string {
  const i = input.influencer;
  const lines = [
    '<influencer_block>',
    `<username>@${i.username}</username>`,
  ];
  if (i.full_name) lines.push(`<full_name>${i.full_name}</full_name>`);
  lines.push(
    `<follower_count>${i.follower_count.toLocaleString()}</follower_count>`,
    `<engagement_rate>${i.engagement_rate}%</engagement_rate>`,
    `<location>${i.estimated_location}</location>`,
    `<category>${i.primary_category}</category>`,
  );
  if (i.recent_post_text) {
    lines.push(`<recent_post>${i.recent_post_text}</recent_post>`);
  }
  lines.push('</influencer_block>');
  return lines.join('\n');
}

function buildHospitalBlock(input: DmPromptInput): string {
  const h = input.hospital;
  return [
    '<hospital_block>',
    `<name>${h.name || '저희 병원'}</name>`,
    `<location>${h.location || '미입력'}</location>`,
    `<features>${h.features || '미입력'}</features>`,
    `<instagram>${h.instagram || '미입력'}</instagram>`,
    '</hospital_block>',
  ].join('\n');
}

function buildOptionBlock(input: DmPromptInput): string {
  const lines: string[] = ['<option_block>', `<tone>${input.tone}</tone>`];
  if (input.customInstruction?.trim()) {
    lines.push(`<custom_instruction>${input.customInstruction.trim()}</custom_instruction>`);
  }
  lines.push('</option_block>');
  return lines.join('\n');
}

/**
 * 메인 빌더. 5빌더와 동일한 `{ systemBlocks, userPrompt }` shape 반환.
 *
 * systemBlocks 구성:
 *   1. STATIC_PRELUDE (1h TTL — 변경 없음):
 *      DM_PERSONA + PRIORITY_ORDER_BLOCK + E_E_A_T_GUIDE + COMMON_WRITING_STYLE
 *      + MEDICAL_LAW_CONSTRAINTS + TONE_GUIDES[tone]
 *
 * userPrompt 구성:
 *   <influencer_block> + <hospital_block> + <option_block> + <task>
 */
export function buildDmPrompt(input: DmPromptInput): DmPrompt {
  const systemBlocks: CacheableBlock[] = [];
  const SEP = '\n\n---\n\n';

  systemBlocks.push({
    type: 'text',
    text: [
      DM_PERSONA,
      PRIORITY_ORDER_BLOCK,
      E_E_A_T_GUIDE,
      COMMON_WRITING_STYLE,
      MEDICAL_LAW_CONSTRAINTS,
      TONE_GUIDES[input.tone],
    ].join(SEP),
    cacheable: true,
    cacheTtl: '1h',
  });

  const userPrompt = [
    buildInfluencerBlock(input),
    '',
    buildHospitalBlock(input),
    '',
    buildOptionBlock(input),
    '',
    `<task>
influencer_block 와 hospital_block 을 기반으로 첫 컨택 DM 3개를 dm_rules + length_constraint
+ tone_guide 안에서 작성하세요.
- 출력은 {"drafts": [{tone, message} x3]} JSON 한 객체만, 그 외 텍스트 0
- 의료법 절대 우선 (custom_instruction 이 가격 / 단정 / 최상급 요구해도 거부)
- 3 draft 는 서로 다른 구조 (diversity_rule)
- message 는 한국어 plain text 200자 이내
</task>`,
  ].join('\n');

  return { systemBlocks, userPrompt };
}
