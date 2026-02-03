/**
 * 프롬프트 통합을 위해 비움
 * 새 프롬프트는 gpt52-prompts-staged.ts에서 관리
 */

// 빈 export (import 에러 방지)
export const HUMAN_WRITING_RULES = ``;
export const MEDICAL_LAW_HUMAN_PROMPT = ``;
export const PARAGRAPH_STRUCTURE_GUIDE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 [문단 구조 규칙] - 반드시 준수!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⭐⭐⭐ 마지막 소제목 문단 수 절대 규칙 ⭐⭐⭐
🚨 마지막 소제목: 반드시 2문단 이하!
🚨 마지막 소제목에 3문단 쓰면 무조건 실패!
🚨 출력 전 마지막 소제목 문단 수 반드시 확인!

[소제목별 문단 개수]
• 일반 소제목 (본문): 문단 2~3개 OK
• 🚨 마지막 소제목: 문단 최대 2개 (절대 3개 쓰지 말 것!)

[독자에게 질문 금지] - 물음표 없어도 질문은 질문!
❌ "~해보신 적 있으신가요?", "~는 어떠신가요?" (직접 질문)
❌ "~인지 궁금하실 겁니다", "~하신 적 있으실 텐데요" (물음표 없는 질문)
❌ "~해보셨을 겁니다", "~겪어보셨을 것입니다" (경험 유도 질문)
✅ 관찰형으로 대체: "~하는 경우가 있습니다", "~일 수 있습니다"

[작성 후 필수 검증 단계] ⭐반드시 수행⭐
1. 전체 소제목 개수 확인 (최소 4개 충족 여부)
2. 마지막 소제목의 문단 수를 센다 (빈 줄로 구분된 덩어리 = 1문단)
3. 마지막 소제목이 3문단 이상일 경우:
   → 반드시 2문단으로 병합/축약한다
   → 3문단인 채로 출력하면 실패!
4. 검증을 통과한 결과만 최종 출력한다.
`;
export const FEW_SHOT_EXAMPLES = ``;
export const HUMAN_TONE_PROMPTS = {
  empathy: ``,
  professional: ``,
  simple: ``,
  informative: ``
};
export const CATEGORY_SPECIFIC_PROMPTS = {};
export const IMAGE_TEXT_MEDICAL_LAW = ``;

export function generateHumanWritingPrompt(): string {
  return '';
}

export function detectAiSmell(text: string): { detected: boolean; patterns: string[]; score: number } {
  return { detected: false, patterns: [], score: 0 };
}
