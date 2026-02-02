/**
 * 프롬프트 통합을 위해 비움
 * 새 프롬프트는 gpt52-prompts-staged.ts에서 관리
 */

// 빈 export (import 에러 방지)
export const HUMAN_WRITING_RULES = ``;
export const MEDICAL_LAW_HUMAN_PROMPT = ``;
export const PARAGRAPH_STRUCTURE_GUIDE = ``;
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
