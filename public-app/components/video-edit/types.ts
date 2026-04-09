/**
 * 영상 편집 파이프라인 공용 타입
 */

export type PipelineMode = 'auto' | 'manual';

export type CropMode = 'face_tracking' | 'center' | 'skip';
export type CropAspect = '9:16' | '4:5' | '1:1';
export type SilenceIntensity = 'soft' | 'normal' | 'tight' | 'skip';
export type SubtitleStyle = 'basic' | 'highlight' | 'single_line' | 'skip';
export type SubtitlePosition = 'top' | 'center' | 'bottom';
export type EffectsStyle = 'shorts' | 'vlog' | 'explanation' | 'interview' | 'skip';
export type BgmMoodOption = 'bright' | 'calm' | 'emotional' | 'trendy' | 'corporate' | 'skip';
export type IntroStyle = 'default' | 'simple' | 'none';
export type OutroStyle = 'default' | 'simple' | 'cta' | 'none';

export interface HospitalInfo {
  name: string;
  phone?: string;
  logoUrl?: string;
  link?: string;
  desc?: string;
}

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

// ── 자막 세그먼트 (STEP 3에서 사용) ──
export interface SubtitleSegment {
  start_time: number;
  end_time: number;
  text: string;
  violations: Array<{
    keyword: string;
    category: string;
    suggestion: string;
    severity: 'high' | 'medium';
  }>;
}

// ── 효과음 이벤트 (STEP 4에서 사용) ──
export interface SoundEffect {
  id: string;
  time: number;        // 삽입 시점 (초)
  sfxId: string;       // sfxLibrary의 id
  sfxName: string;
  sfxPath: string;
  category: string;
  reason: string;      // 왜 이 위치에 이 효과음인지
}

export interface StepSubtitleState {
  enabled: boolean;
  resultBlobUrl?: string;
  style: SubtitleStyle;
  position: SubtitlePosition;
  dentalTerms: boolean;
  medicalCheck: boolean;
  subtitles?: SubtitleSegment[];
  highViolations?: number;
  mediumViolations?: number;
}

export interface StepEffectsState {
  enabled: boolean;
  resultBlobUrl?: string;
  style: EffectsStyle;
  density: number;         // 1~5
  effects?: SoundEffect[];
}

export interface StepBgmState {
  enabled: boolean;
  resultBlobUrl?: string;
  mood: BgmMoodOption;
  bgmId?: string;
  volume: number; // 0~50, 기본 15
}

export interface StepIntroState {
  enabled: boolean;
  resultBlobUrl?: string;
  introStyle: IntroStyle;
  outroStyle: OutroStyle;
  hospital: HospitalInfo;
  saveInfo: boolean;
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
  step3_subtitle: { enabled: true, style: 'highlight', position: 'bottom', dentalTerms: true, medicalCheck: true },
  step4_effects: { enabled: true, style: 'shorts', density: 3 },
  step5_bgm: { enabled: true, mood: 'calm', volume: 15 },
  step6_intro: { enabled: true, introStyle: 'default', outroStyle: 'default', hospital: { name: '' }, saveInfo: false },
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
    case 3: return !!state.step3_subtitle.subtitles || state.step3_subtitle.style === 'skip' || !state.step3_subtitle.enabled;
    case 4: return !!state.step4_effects.effects || state.step4_effects.style === 'skip' || !state.step4_effects.enabled;
    case 5: return !!state.step5_bgm.resultBlobUrl || state.step5_bgm.mood === 'skip' || !state.step5_bgm.enabled;
    case 6: return !!state.step6_intro.resultBlobUrl || (state.step6_intro.introStyle === 'none' && state.step6_intro.outroStyle === 'none') || !state.step6_intro.enabled;
    default: return false;
  }
}

/** 특정 단계가 스킵되었는지 판단 */
export function isStepSkipped(state: PipelineState, step: number): boolean {
  switch (step) {
    case 1: return state.step1_crop.mode === 'skip' || !state.step1_crop.enabled;
    case 2: return state.step2_silence.intensity === 'skip' || !state.step2_silence.enabled;
    case 3: return state.step3_subtitle.style === 'skip' || !state.step3_subtitle.enabled;
    case 4: return state.step4_effects.style === 'skip' || !state.step4_effects.enabled;
    case 5: return state.step5_bgm.mood === 'skip' || !state.step5_bgm.enabled;
    case 6: return (state.step6_intro.introStyle === 'none' && state.step6_intro.outroStyle === 'none') || !state.step6_intro.enabled;
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
