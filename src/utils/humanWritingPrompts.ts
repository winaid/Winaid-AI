/**
 * 프롬프트 통합을 위해 비움
 * 새 프롬프트는 gpt52-prompts-staged.ts에서 관리
 */

// 빈 export (import 에러 방지)
export const HUMAN_WRITING_RULES = ``;
export const MEDICAL_LAW_HUMAN_PROMPT = ``;
export const PARAGRAPH_STRUCTURE_GUIDE = `
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
📐 문단 개수 절대 규칙 (위반 시 무조건 실패!)
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

[본문 소제목] 각 소제목당 최대 3문단까지만!
- 1문단 OK ✅
- 2문단 OK ✅
- 3문단 OK ✅
- 4문단 이상 ❌ 실패!

[마지막 소제목] 반드시 2문단 이하!
- 1문단 OK ✅
- 2문단 OK ✅
- 3문단 이상 ❌ 무조건 실패!

⚠️ 문단 카운팅: <p> 태그 1개 = 1문단
⚠️ 각 소제목 작성 후 즉시 <p> 태그 개수 확인!

[독자에게 질문 금지] - 물음표 없어도 질문은 질문!
❌ "~해보신 적 있으신가요?", "~는 어떠신가요?" (직접 질문)
❌ "~인지 궁금하실 겁니다", "~하신 적 있으실 텐데요" (물음표 없는 질문)
✅ 관찰형으로 대체: "~하는 경우가 있습니다", "~일 수 있습니다"

[작성 후 필수 검증] 🚨반드시 수행🚨
1. 각 소제목 아래의 <p> 태그 개수 확인
2. 본문 소제목: 4개 이상이면 → 3개 이하로 병합
3. 마지막 소제목: 3개 이상이면 → 2개로 병합
4. 검증 통과한 결과만 출력!

❗ 본문 소제목 4문단 이상 = 실패
❗ 마지막 소제목 3문단 이상 = 실패
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
📋 소제목 개수 절대 규칙 (위반 시 무조건 실패!)
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

[최소 소제목 개수] 반드시 4개 이상!
- 3개 이하 ❌ 무조건 실패!
- 4개 이상 ✅ OK

[글자 수별 필수 소제목 개수]
- 1500~1999자 → 4개 필수
- 2000~2499자 → 5개 필수
- 2500~2999자 → 6개 필수
- 3000자 이상 → 7개 이상 필수

⚠️ <h2> 또는 <h3> 태그 개수 = 소제목 개수
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
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
