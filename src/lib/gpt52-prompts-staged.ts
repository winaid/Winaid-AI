/**
 * 프롬프트 통합 버전
 * 기존 복잡한 프롬프트를 삭제하고 새 프롬프트로 대체 예정
 */

// 빈 시스템 프롬프트 (새 프롬프트로 대체 예정)
export const SYSTEM_PROMPT = ``;

// 빈 단계별 프롬프트 (import 에러 방지)
export const getStage1_ContentGeneration = (textLength: number = 1500) => {
  return '';
};

export const getStage2_AiRemovalAndCompliance = (textLength: number = 1500) => {
  return '';
};

export const getStage2_RemoveAiSmell = getStage2_AiRemovalAndCompliance;
export const getStage3_SeoOptimization = () => getStage1_ContentGeneration();
export const getStage4_FinalCheck = () => getStage2_AiRemovalAndCompliance();

export const getDynamicSystemPrompt = async (): Promise<string> => {
  return '';
};

export const getStagePrompt = (stageNumber: 1 | 2 | 3 | 4, textLength: number = 1500): string => {
  return '';
};

export const getFullPrompt = async (stageNumber: 1 | 2, textLength: number = 1500) => {
  return '';
};

export const getAllStages = async (textLength: number = 1500) => {
  return {
    stage1: '',
    stage2: '',
    stage3: '',
    stage4: ''
  };
};
