/**
 * geminiService.ts — Gemini 서비스 진입점 (re-export bridge)
 *
 * 이 파일은 더 이상 직접 구현을 품지 않는다.
 * 역할: 기존 소비자(import from './geminiService')에 대한 역호환 bridge.
 *
 * 실제 구현 위치:
 * - blogPipelineService.ts    → generateBlogWithPipeline (주 경로, Stage A/B/C)
 * - legacyBlogGeneration.ts   → generateBlogPostText (폴백 전용, @deprecated)
 * - faqService.ts             → generateFaqSection, regenerateSection, generateSmartBlockFaq
 * - contentQualityService.ts  → runAiSmellCheck, integrateAiSmellToFactCheck
 * - core/generation/generateContentJob.ts → generateFullPost 오케스트레이션
 *
 * 새 코드에서는 위 파일을 직접 import하라.
 */

// ── 파이프라인 (주 경로) ──
export { generateBlogWithPipeline } from './blogPipelineService';

// ── 레거시 단일 생성 (폴백 전용) ──
export { generateBlogPostText } from './legacyBlogGeneration';

// ── FAQ / 섹션 재생성 ──
export { generateFaqSection, regenerateSection, generateSmartBlockFaq } from './faqService';

// ── 품질 검사 ──
export { runAiSmellCheck, integrateAiSmellToFactCheck } from './contentQualityService';

// ── 오케스트레이션 bridge (@deprecated) ──
import { GenerationRequest, GeneratedContent } from "../types";

/**
 * @deprecated 오케스트레이션은 core/generation/generateContentJob.ts로 이관됨.
 * 이 함수는 기존 소비자 호환용 re-export 브릿지다.
 * 새 코드에서는 runContentJob()을 사용하라.
 */
export const generateFullPost = async (request: GenerationRequest, onProgress?: (msg: string) => void): Promise<GeneratedContent> => {
  const { _orchestrateFullPostBridge } = await import('../core/generation/generateContentJob');
  return _orchestrateFullPostBridge(request, onProgress);
};
