/**
 * 영상 편집 파이프라인 공용 타입
 */

export type PipelineMode = 'auto' | 'manual';

export type CropMode = 'face_tracking' | 'center' | 'skip';
export type CropAspect = '9:16' | '4:5' | '1:1';
export type SilenceIntensity = 'soft' | 'normal' | 'tight' | 'skip';

export interface FileInfo {
  name: string;
  size: number;
  duration: number;
  width?: number;
  height?: number;
  isVertical: boolean;
  isAudio: boolean;
}

export interface StepCropState {
  enabled: boolean;
  resultBlobUrl?: string;
  mode: CropMode;
  aspect: CropAspect;
  facesDetected?: number;
}

export interface StepSilenceState {
  enabled: boolean;
  resultBlobUrl?: string;
  intensity: SilenceIntensity;
  originalDuration?: number;
  resultDuration?: number;
  removedPercent?: number;
}

// STEP 3~6 — 다음 프롬프트에서 정의
export interface StepSubtitleState {
  enabled: boolean;
  resultBlobUrl?: string;
}

export interface StepEffectsState {
  enabled: boolean;
  resultBlobUrl?: string;
}

export interface StepBgmState {
  enabled: boolean;
  resultBlobUrl?: string;
}

export interface StepIntroState {
  enabled: boolean;
  resultBlobUrl?: string;
}

export interface PipelineState {
  originalFile: File | null;
  fileInfo: FileInfo | null;

  step1_crop: StepCropState;
  step2_silence: StepSilenceState;
  step3_subtitle: StepSubtitleState;
  step4_effects: StepEffectsState;
  step5_bgm: StepBgmState;
  step6_intro: StepIntroState;

  currentStep: number; // 0=업로드, 1~6=각 단계
  mode: PipelineMode;
  isProcessing: boolean;
  autoProgress?: string; // 자동 모드 진행 메시지
}

export const INITIAL_PIPELINE_STATE: PipelineState = {
  originalFile: null,
  fileInfo: null,
  step1_crop: { enabled: true, mode: 'face_tracking', aspect: '9:16' },
  step2_silence: { enabled: true, intensity: 'normal' },
  step3_subtitle: { enabled: true },
  step4_effects: { enabled: true },
  step5_bgm: { enabled: true },
  step6_intro: { enabled: true },
  currentStep: 0,
  mode: 'manual',
  isProcessing: false,
};

export const STEP_LABELS = [
  '업로드',
  '세로 크롭',
  '무음 제거',
  '자막',
  '효과음',
  'BGM/인트로',
  '완성',
];

/** 특정 단계의 완료 상태를 판단 */
export function isStepDone(state: PipelineState, step: number): boolean {
  switch (step) {
    case 0: return !!state.fileInfo;
    case 1: return !!state.step1_crop.resultBlobUrl || state.step1_crop.mode === 'skip' || !state.step1_crop.enabled;
    case 2: return !!state.step2_silence.resultBlobUrl || state.step2_silence.intensity === 'skip' || !state.step2_silence.enabled;
    case 3: return !!state.step3_subtitle.resultBlobUrl || !state.step3_subtitle.enabled;
    case 4: return !!state.step4_effects.resultBlobUrl || !state.step4_effects.enabled;
    case 5: return !!state.step5_bgm.resultBlobUrl || !state.step5_bgm.enabled;
    case 6: return !!state.step6_intro.resultBlobUrl || !state.step6_intro.enabled;
    default: return false;
  }
}

/** 특정 단계가 스킵되었는지 판단 */
export function isStepSkipped(state: PipelineState, step: number): boolean {
  switch (step) {
    case 1: return state.step1_crop.mode === 'skip' || !state.step1_crop.enabled;
    case 2: return state.step2_silence.intensity === 'skip' || !state.step2_silence.enabled;
    case 3: return !state.step3_subtitle.enabled;
    case 4: return !state.step4_effects.enabled;
    case 5: return !state.step5_bgm.enabled;
    case 6: return !state.step6_intro.enabled;
    default: return false;
  }
}

/** 이전 단계까지의 최종 결과 blob URL (스킵된 단계는 패스스루) */
export function getInputForStep(state: PipelineState, step: number): string | File | null {
  // 역순으로 가장 최근 결과 찾기
  for (let s = step - 1; s >= 1; s--) {
    const url = getStepResultUrl(state, s);
    if (url) return url;
  }
  return state.originalFile;
}

function getStepResultUrl(state: PipelineState, step: number): string | undefined {
  switch (step) {
    case 1: return state.step1_crop.resultBlobUrl;
    case 2: return state.step2_silence.resultBlobUrl;
    case 3: return state.step3_subtitle.resultBlobUrl;
    case 4: return state.step4_effects.resultBlobUrl;
    case 5: return state.step5_bgm.resultBlobUrl;
    case 6: return state.step6_intro.resultBlobUrl;
    default: return undefined;
  }
}
