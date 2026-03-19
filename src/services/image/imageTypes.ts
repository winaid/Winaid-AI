/**
 * Image subsystem — shared types
 * 모든 이미지 계층(router, promptBuilder, orchestrator, fallback, storage)이
 * 이 파일의 타입만 import하여 circular dependency를 방지한다.
 */

import type { ImageStyle } from '../../types';

// ── SceneType: 소제목 키워드 기반 장면 유형 ──
export type SceneType =
  | 'symptom-discomfort'
  | 'cause-mechanism'
  | 'consultation-treatment'
  | 'prevention-care'
  | 'caution-checkup';

// ── ImageRole / ImageGenMode / ModelTier ──
export type ImageRole = 'hero' | 'sub';
/**
 * Timeout 정책 모드:
 *   - 'auto':   기본 (hero 25s / sub 18s) — 벤치마크, 단건 테스트
 *   - 'blog':   블로그 최초 자동 생성 (hero 35s / sub 40s) — planBlogImageWaves
 *   - 'manual': 사용자 수동 재생성/AI수정 (hero 35s / sub 40s) — useAiRefine
 */
export type ImageGenMode = 'auto' | 'blog' | 'manual';
export type ModelTier = 'pro' | 'nb2';

/** 최종 결과물 유형: AI생성 > 템플릿 > placeholder (순서=품질) */
export type ImageResultType = 'ai-image' | 'template' | 'placeholder';

// ── ImageRoutePlan: 라우터가 반환하는 실행 계획 ──
export interface ImageRoutePlan {
  role: ImageRole;
  initialTier: ModelTier;
  chain: AttemptDef[];
  timeout: number;
}

export interface AttemptDef {
  model: string;
  tier: ModelTier;
  prompt: string;
  label: string;
  /** Per-attempt timeout override (ms). Falls back to chain-level timeout if omitted. */
  timeout?: number;
}

// ── ImageQueueItem / ImageQueueResult: 큐 입출력 ──
export interface ImageQueueItem {
  index: number;
  prompt: string;
  role: ImageRole;
  style: ImageStyle;
  aspectRatio: string;
  customStylePrompt?: string;
  mode: ImageGenMode;
}

export interface ImageQueueResult {
  index: number;
  data: string;
  prompt: string;
  role: ImageRole;
  status: 'success' | 'fallback';
  resultType: ImageResultType;
  elapsedMs: number;
  queueWaitMs: number;
  errorType?: string;
  modelTier?: ModelTier;
  attemptIndex?: number;
}

// ── BlogImageOutput: generateBlogImage 반환값 ──
export interface BlogImageOutput {
  data: string;
  modelTier: ModelTier;
  attemptIndex: number;
  resultType: ImageResultType;
}

// ── BlogImageResult: 레거시 호환 (일부 컴포넌트에서 사용) ──
export interface BlogImageResult {
  imageData: string;
  status: 'success' | 'fallback';
  errorCode?: string;
}
