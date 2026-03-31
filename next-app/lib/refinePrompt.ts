/**
 * AI 보정 프롬프트 — OLD ContentRefiner.tsx parity
 *
 * 2가지 모드: 자동 보정 (6종 방향) + 채팅 수정 (대화형)
 * HTML 출력, 의료광고법 준수, AI 냄새 제거, Google Search 연동
 */

import { getMedicalLawPromptBlock } from './medicalLawRules';

export type RefineMode = 'natural' | 'professional' | 'shorter' | 'longer' | 'medical_law' | 'seo';

export interface RefineRequest {
  originalText: string;
  mode: RefineMode;
}

export interface ChatRefineRequest {
  workingContent: string;   // 현재 보정 중인 콘텐츠
  userMessage: string;      // 사용자 수정 요청
  crawledContent?: string;  // URL 크롤링 결과 (있으면)
}

export const REFINE_OPTIONS: { value: RefineMode; label: string; icon: string; description: string }[] = [
  { value: 'natural', label: '더 자연스럽게', icon: '💬', description: '딱딱한 표현을 부드럽고 읽기 편하게' },
  { value: 'professional', label: '더 전문적으로', icon: '🎓', description: '전문 용어와 근거 기반 서술 강화' },
  { value: 'shorter', label: '더 짧게', icon: '✂️', description: '핵심만 남기고 간결하게 압축' },
  { value: 'longer', label: '더 길게', icon: '📝', description: '설명과 사례를 추가하여 풍성하게' },
  { value: 'medical_law', label: '의료광고법 자동 수정', icon: '⚖️', description: '과장·단정 표현을 중립적으로 자동 수정' },
  { value: 'seo', label: 'SEO 최적화', icon: '🔍', description: '검색 노출에 유리한 구조로 개선' },
];

// ── 자동 보정 프롬프트 ──

// ── 규칙 블록 ──

// 모든 모드 공통
const BASE_RULES = `
[공통 규칙]
- ${getMedicalLawPromptBlock(true)}
- AI 냄새 제거: "또한", "더불어", "아울러", "이러한", "해당" → 삭제 또는 자연스러운 표현
- 출처/인용 표현 금지: "~에 따르면", "연구에 따르면" → 정보를 자연스럽게 녹여서 서술
- 만연체 금지: 한 문장 최대 50자, 쉼표 2개 이상이면 문장 분리
- "해당/상기/동일한" → "이런/이"

[출력 형식]
반드시 순수 HTML로 출력. (<p>, <h2>, <h3> 태그)
마크다운 금지. JSON 금지. 코드블록 금지. 설명/코멘트 금지.
수정된 글만 출력하세요.`;

// 격식체 모드 전용 (professional, medical_law, seo)
const FORMAL_RULES = `
[격식체 규칙]
- "~요/~죠" 종결어미 → "~입니다/~합니다" 사용
- "~하세요" 행동유도 → "~할 수 있습니다" 가능성 표현`;

// 원문 어투 보존 (natural, shorter, longer)
const PRESERVE_TONE_RULES = `
[원문 어투 보존 — 가장 중요!]
- 원문이 "~는데요", "~거든요", "~해요" 체면 그 어투를 그대로 유지하세요.
- 원문이 "~입니다" 체면 그대로 유지하세요.
- 어투를 바꾸는 것이 아니라, 같은 어투 안에서 다듬는 것이 목표입니다.
- 원문의 문장 길이를 존중하세요. 긴 문장을 무조건 자르지 마세요.`;

// 하위 호환: 채팅 모드에서 사용
const COMMON_RULES = `${BASE_RULES}\n${FORMAL_RULES}`;

/*
 * natural 모드 전후 비교:
 * 원문: "임플란트는 치아를 대체하는 시술인데요. 잇몸뼈에 인공치근을 심는 거예요."
 * ✅ 좋은 보정: "임플란트는 치아를 대체하는 시술인데요. 잇몸뼈에 인공치근을 심게 됩니다."  (어투 유지, 어색한 부분만 수정)
 * ❌ 나쁜 보정: "임플란트는 치아를 대체하는 시술입니다. 잇몸뼈에 인공치근을 식립합니다."  (어투를 ~입니다로 일괄 변경)
 */
const MODE_INSTRUCTIONS: Record<RefineMode, string> = {
  natural: `아래 글을 더 자연스럽고 읽기 편하게 다듬어주세요.

[핵심 원칙]
- 원문의 어투와 말투를 최대한 유지합니다.
- 어투를 바꾸는 것이 아니라, 같은 어투 안에서 매끄럽게 다듬는 것이 목표입니다.

[수정 대상]
- 어색한 문장 연결 → 자연스러운 연결
- 불필요한 반복 표현 제거
- AI 특유의 기계적 표현 → 사람이 쓸 법한 표현 (예: "해당 부분" → "이 부분", "~하는 것이 중요합니다" → 문맥에 맞게)
- 같은 종결어미 연속 반복 → 다양하게 변주

[절대 하지 말 것]
- 원문의 종결어미(~요/~죠/~입니다)를 일괄 변경
- 원문 문장을 짧게 자르기만 하는 것
- 원문에 없는 새 정보 추가
- 소제목 구조 변경
${BASE_RULES}
${PRESERVE_TONE_RULES}`,

  professional: `아래 글을 더 전문적이고 신뢰감 있게 다듬어주세요.
- 적절한 전문 용어를 사용
- 근거 기반 서술 강화
- 객관적이고 정보 전달 중심
${BASE_RULES}
${FORMAL_RULES}`,

  shorter: `아래 글을 핵심만 남기고 간결하게 줄여주세요.
- 반복되는 내용 제거
- 부연 설명 최소화
- 핵심 메시지는 반드시 유지
- 원본의 50~70% 분량
${BASE_RULES}
${PRESERVE_TONE_RULES}`,

  longer: `아래 글을 더 풍성하고 상세하게 늘려주세요.
- 구체적인 설명이나 사례 추가
- 독자가 궁금할 수 있는 부분 보충
- 원본의 130~150% 분량
- 억지로 늘리지 말고 자연스럽게
${BASE_RULES}
${PRESERVE_TONE_RULES}`,

  medical_law: `아래 글에서 의료광고법 위반 리스크가 있는 표현을 모두 찾아 자동으로 수정해주세요.
[의료법 제56조 기준 자동 수정]
- "최고", "최초", "유일" → 삭제 또는 중립 표현
- "완치", "100% 치료" → "개선될 수 있습니다"
- "효과가 뛰어난" → "도움이 될 수 있는"
- "부작용 없이" → "개인차가 있을 수 있으며"
- "~하세요", "~받으세요" → "~하는 것을 고려할 수 있습니다"
- 환자 체험기, 전후 비교 암시 → 삭제
- 수정한 부분은 원래 의미를 최대한 살리면서 의료광고법에 적합하게
${BASE_RULES}
${FORMAL_RULES}`,

  seo: `아래 글을 네이버/구글 검색 노출에 유리하도록 구조를 개선해주세요.
- 소제목(<h2>, <h3>)을 활용하여 섹션을 나눔
- 핵심 키워드가 제목, 첫 문단, 소제목에 자연스럽게 포함
- 문단 길이를 적절하게 조절 (300자 이내)
- 내용 자체는 바꾸지 않고 구조만 개선
${BASE_RULES}
${FORMAL_RULES}`,
};

export function buildRefinePrompt(req: RefineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const systemInstruction = `당신은 한국 병원 블로그 콘텐츠를 다듬는 전문 에디터입니다.
원본의 핵심 내용과 의도를 유지하면서, 요청된 방향으로 글을 수정합니다.
반드시 순수 HTML(<p>, <h2>, <h3>)로만 출력합니다.`;

  const prompt = `${MODE_INSTRUCTIONS[req.mode]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 원문
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${req.originalText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 원문을 위 지침에 따라 수정한 결과를 HTML로만 출력해주세요.`;

  return { systemInstruction, prompt };
}

// ── 채팅 수정 프롬프트 ──

export function buildChatRefinePrompt(req: ChatRefineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const { workingContent, userMessage, crawledContent } = req;

  // 의도 분석
  const wantsExpand = /자세히|자세하게|더 쓰|길게|확장|추가|더 설명|상세|구체적|늘려/.test(userMessage);
  const wantsShorter = /짧게|줄여|간결|요약|압축/.test(userMessage);
  const wantsRephrase = /다시|다르게|바꿔|고쳐|수정/.test(userMessage);
  const wantsHumanize = /사람|자연|AI|인공|딱딱|부드럽/.test(userMessage);

  // 현재 글자 수 (HTML 태그 제거)
  const textOnly = workingContent.replace(/<[^>]+>/g, '').trim();
  const currentLength = textOnly.length;

  const systemInstruction = `당신은 스마트 글 보정 AI입니다.
사용자 요청을 정확히 이해하고, 요청한 부분만 수정합니다.
순수 HTML(<p>, <h2>, <h3>)로만 출력합니다. 설명/코멘트 금지.`;

  const prompt = `[독자 인식]
이 글의 독자는 특정 증상/질환 때문에 병원을 알아보는 본인 또는 가족이다.
행동 요구 금지, 불안 자극 금지, 판단은 독자에게.

${COMMON_RULES}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 사용자 요청: ${userMessage}

[의도 파악]
• 확장: ${wantsExpand ? '예' : '아니오'}
• 축소: ${wantsShorter ? '예' : '아니오'}
• 표현 변경: ${wantsRephrase ? '예' : '아니오'}
• 자연스럽게: ${wantsHumanize ? '예' : '아니오'}

현재 글자 수: ${currentLength}자
${crawledContent ? `\n[참고 자료 — 출처 표시 없이 내용만 참고]\n${crawledContent}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 현재 콘텐츠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${workingContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${wantsExpand ? '📈 확장 모드: 1~2문장 추가 허용, 현재의 130~150%' : ''}
${wantsShorter ? '📉 축소 모드: 핵심만 남기기, 현재의 60~80%' : ''}
${wantsHumanize ? '🗣️ 자연스럽게: AI 문체 → 사람 말맛으로' : ''}

요청에 따라 수정한 전체 글을 HTML로 출력하세요. 수정하지 않은 부분도 포함하여 전체를 출력하세요.`;

  return { systemInstruction, prompt };
}
