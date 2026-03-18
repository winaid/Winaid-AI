/**
 * postProcessingService.ts — Bridge / Re-export
 *
 * 기존 1133줄 giant file을 역할별로 분리한 뒤 남은 얇은 re-export 계층.
 * 기존 소비자의 import 경로를 깨뜨리지 않기 위해 유지.
 *
 * 실제 구현 위치:
 * - contentEditorService.ts    → regenerateSlideContent, SlideRegenMode, modifyPostWithAI
 * - contentQualityService.ts   → analyzeAiSmell, recheckAiSmell
 * - medicalLawAdjuster.ts      → refineContentByMedicalLaw
 *
 * @deprecated 신규 코드는 위 파일에서 직접 import하세요.
 */

// ── 콘텐츠 편집 ──
export { regenerateSlideContent, modifyPostWithAI } from './contentEditorService';
export type { SlideRegenMode } from './contentEditorService';

// ── 품질 분석 (LLM 기반) ──
export { analyzeAiSmell, recheckAiSmell } from './contentQualityService';

// ── 의료법 보정 ──
export { refineContentByMedicalLaw } from './medicalLawAdjuster';
