/**
 * Image subsystem — public barrel
 * 외부에서는 이 파일 또는 개별 파일을 import.
 */

// Types
export type {
  SceneType,
  ImageRole,
  ImageGenMode,
  ModelTier,
  ImageResultType,
  ImageRoutePlan,
  AttemptDef,
  ImageQueueItem,
  ImageQueueResult,
  BlogImageOutput,
  BlogImageResult,
} from './imageTypes';

// Router
export { classifySceneType, buildScenePrompt } from './imageRouter';

// Prompt Builder
export {
  buildStyleBlock,
  buildFrameBlock,
  CARD_LAYOUT_RULE,
  STYLE_NAMES,
  STYLE_KEYWORDS,
  BLOG_IMAGE_STYLE_COMPACT,
  STYLE_KEYWORD_SHORT,
} from './imagePromptBuilder';

// Fallback
export { generateTemplateFallback, buildTemplateFallbackSvg } from './imageFallbackService';

// Orchestrator
export {
  generateBlogImage,
  generateImageQueue,
  isDemoSafeMode,
  setDemoSafeMode,
  initImageDebugGlobals,
  printImageSessionStats,
  updateSessionFinalPayload,
  resetImageSessionStats,
} from './imageOrchestrator';

// Storage
export {
  uploadBase64Image,
  uploadAllImages,
  replaceBase64WithUrls,
  stripBase64FromHtml,
  restoreAndUploadImages,
} from './imageStorageService';
