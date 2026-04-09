/**
 * 영상 편집 파이프라인 공용 타입
 *
 * 10단계 파이프라인:
 * 0: 업로드
 * 1: 세로 크롭
 * 2: 스타일 변환
 * 3: 무음 제거
 * 4: AI 자막
 * 5: 효과음
 * 6: 줌인/줌아웃 (TODO)
 * 7: BGM
 * 8: 인트로/아웃로
 * 9: 썸네일 (TODO)
 * 10: 완성
 */

export type PipelineMode = 'auto' | 'manual';

export type CropMode = 'face_tracking' | 'center' | 'skip';
export type CropAspect = '9:16' | '4:5' | '1:1';
export type SilenceIntensity = 'soft' | 'normal' | 'tight' | 'skip';
export type SubtitleStyle = 'basic' | 'highlight' | 'single_line' | 'skip';
export type SubtitlePosition = 'top' | 'center' | 'bottom';
export type EffectsStyle = 'shorts' | 'vlog' | 'explanation' | 'interview' | 'skip';
export type BgmMoodOption = 'bright' | 'calm' | 'emotional' | 'trendy' | 'corporate' | 'skip';
export type ZoomIntensity = 'auto' | 'strong' | 'subtle' | 'skip';
export type ThumbnailTextColor = 'white' | 'yellow' | 'red';
export type ThumbnailTextPosition = 'center' | 'top' | 'bottom';
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

// ── STEP 1: 세로 크롭 ──
export interface StepCropState {
  enabled: boolean;
  resultBlobUrl?: string;
  mode: CropMode;
  aspect: CropAspect;
  facesDetected?: number;
}

// ── STEP 2: 스타일 변환 ──
export interface StepStyleState {
  enabled: boolean;
  resultBlobUrl?: string;
  styleId: string; // 'original' = 스킵
}

// ── STEP 3: 무음 제거 ──
export interface StepSilenceState {
  enabled: boolean;
  resultBlobUrl?: string;
  intensity: SilenceIntensity;
  originalDuration?: number;
  resultDuration?: number;
  removedPercent?: number;
}

// ── 자막/효과음 공용 타입 ──
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

export interface SoundEffect {
  id: string;
  time: number;
  sfxId: string;
  sfxName: string;
  sfxPath: string;
  category: string;
  reason: string;
}

// ── STEP 4: AI 자막 ──
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

// ── STEP 5: 효과음 ──
export interface StepEffectsState {
  enabled: boolean;
  resultBlobUrl?: string;
  style: EffectsStyle;
  density: number;
  effects?: SoundEffect[];
}

// ── 줌 포인트 ──
export interface ZoomPoint {
  start_time: number;
  end_time: number;
  zoom_level: number;
  type: 'emphasis' | 'transition' | 'question' | 'conclusion';
}

// ── STEP 6: 줌인/줌아웃 ──
export interface StepZoomState {
  enabled: boolean;
  resultBlobUrl?: string;
  intensity: ZoomIntensity;
  zoomLevel: number; // 1.0~1.3
  zoomPoints?: ZoomPoint[];
}

// ── STEP 7: BGM ──
export interface StepBgmState {
  enabled: boolean;
  resultBlobUrl?: string;
  mood: BgmMoodOption;
  bgmId?: string;
  volume: number;
}

// ── STEP 8: 인트로/아웃로 ──
export interface StepIntroState {
  enabled: boolean;
  resultBlobUrl?: string;
  introStyle: IntroStyle;
  outroStyle: OutroStyle;
  hospital: HospitalInfo;
  saveInfo: boolean;
}

// ── STEP 9: 썸네일 ──
export interface StepThumbnailState {
  enabled: boolean;
  thumbnailUrl?: string;
  text?: string;
  textColor: ThumbnailTextColor;
  textPosition: ThumbnailTextPosition;
  textSuggestions?: string[];
  frameTime?: number;
}

// ── 파이프라인 전체 상태 ──

export interface PipelineState {
  originalFile: File | null;
  fileInfo: FileInfo | null;

  step1_crop: StepCropState;
  step2_style: StepStyleState;
  step3_silence: StepSilenceState;
  step4_subtitle: StepSubtitleState;
  step5_effects: StepEffectsState;
  step6_zoom: StepZoomState;
  step7_bgm: StepBgmState;
  step8_intro: StepIntroState;
  step9_thumbnail: StepThumbnailState;

  currentStep: number; // 0=업로드, 1~9=각 단계, 10=완성
  mode: PipelineMode;
  isProcessing: boolean;
  autoProgress?: string;
}

export const INITIAL_PIPELINE_STATE: PipelineState = {
  originalFile: null,
  fileInfo: null,
  step1_crop: { enabled: true, mode: 'face_tracking', aspect: '9:16' },
  step2_style: { enabled: true, styleId: 'original' },
  step3_silence: { enabled: true, intensity: 'normal' },
  step4_subtitle: { enabled: true, style: 'highlight', position: 'bottom', dentalTerms: true, medicalCheck: true },
  step5_effects: { enabled: true, style: 'shorts', density: 3 },
  step6_zoom: { enabled: true, intensity: 'auto', zoomLevel: 1.15 },
  step7_bgm: { enabled: true, mood: 'calm', volume: 15 },
  step8_intro: { enabled: true, introStyle: 'default', outroStyle: 'default', hospital: { name: '' }, saveInfo: false },
  step9_thumbnail: { enabled: true, textColor: 'white', textPosition: 'center' },
  currentStep: 0,
  mode: 'manual',
  isProcessing: false,
};

export const STEP_LABELS = [
  '업로드',       // 0
  '세로 크롭',    // 1
  '스타일',       // 2
  '무음 제거',    // 3
  '자막',         // 4
  '효과음',       // 5
  '줌',           // 6
  'BGM',          // 7
  '인트로',       // 8
  '썸네일',       // 9
  '완성',         // 10
];

export const TOTAL_STEPS = 9; // 1~9 (0=업로드, 10=완성)

/** 특정 단계의 완료 상태를 판단 */
export function isStepDone(state: PipelineState, step: number): boolean {
  switch (step) {
    case 0: return !!state.fileInfo;
    case 1: return !!state.step1_crop.resultBlobUrl || state.step1_crop.mode === 'skip' || !state.step1_crop.enabled;
    case 2: return !!state.step2_style.resultBlobUrl || state.step2_style.styleId === 'original';
    case 3: return !!state.step3_silence.resultBlobUrl || state.step3_silence.intensity === 'skip' || !state.step3_silence.enabled;
    case 4: return !!state.step4_subtitle.subtitles || state.step4_subtitle.style === 'skip' || !state.step4_subtitle.enabled;
    case 5: return !!state.step5_effects.effects || state.step5_effects.style === 'skip' || !state.step5_effects.enabled;
    case 6: return !!state.step6_zoom.resultBlobUrl || state.step6_zoom.intensity === 'skip' || !state.step6_zoom.enabled;
    case 7: return !!state.step7_bgm.resultBlobUrl || state.step7_bgm.mood === 'skip' || !state.step7_bgm.enabled;
    case 8: return !!state.step8_intro.resultBlobUrl || (state.step8_intro.introStyle === 'none' && state.step8_intro.outroStyle === 'none') || !state.step8_intro.enabled;
    case 9: return !!state.step9_thumbnail.thumbnailUrl || !state.step9_thumbnail.enabled;
    default: return false;
  }
}

/** 특정 단계가 스킵되었는지 판단 */
export function isStepSkipped(state: PipelineState, step: number): boolean {
  switch (step) {
    case 1: return state.step1_crop.mode === 'skip' || !state.step1_crop.enabled;
    case 2: return state.step2_style.styleId === 'original';
    case 3: return state.step3_silence.intensity === 'skip' || !state.step3_silence.enabled;
    case 4: return state.step4_subtitle.style === 'skip' || !state.step4_subtitle.enabled;
    case 5: return state.step5_effects.style === 'skip' || !state.step5_effects.enabled;
    case 6: return state.step6_zoom.intensity === 'skip' || !state.step6_zoom.enabled;
    case 7: return state.step7_bgm.mood === 'skip' || !state.step7_bgm.enabled;
    case 8: return (state.step8_intro.introStyle === 'none' && state.step8_intro.outroStyle === 'none') || !state.step8_intro.enabled;
    case 9: return !state.step9_thumbnail.enabled;
    default: return false;
  }
}

/** 이전 단계까지의 최종 결과 blob URL */
export function getInputForStep(state: PipelineState, step: number): string | File | null {
  for (let s = step - 1; s >= 1; s--) {
    const url = getStepResultUrl(state, s);
    if (url) return url;
  }
  return state.originalFile;
}

function getStepResultUrl(state: PipelineState, step: number): string | undefined {
  switch (step) {
    case 1: return state.step1_crop.resultBlobUrl;
    case 2: return state.step2_style.resultBlobUrl;
    case 3: return state.step3_silence.resultBlobUrl;
    case 4: return state.step4_subtitle.resultBlobUrl;
    case 5: return state.step5_effects.resultBlobUrl;
    case 6: return state.step6_zoom.resultBlobUrl;
    case 7: return state.step7_bgm.resultBlobUrl;
    case 8: return state.step8_intro.resultBlobUrl;
    case 9: return state.step9_thumbnail.thumbnailUrl;
    default: return undefined;
  }
}

// ══════════════════════════════════════════════════
// AI 쇼츠 생성기 타입
// ══════════════════════════════════════════════════

export type EntryMode = 'select' | 'video' | 'ai';
export type AiInputType = 'keyword' | 'url' | 'manual';
export type AiTone = 'professional' | 'friendly' | 'humorous';
export type AiDuration = 30 | 60 | 90;

export interface ScriptScene {
  sceneNumber: number;
  startTime: number;
  endTime: number;
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
  violations: Array<{
    keyword: string;
    category: string;
    suggestion: string;
    severity: 'high' | 'medium';
  }>;
}

export interface AiShortsState {
  currentStep: number; // 0=A대본, 1=B스타일, 2=C목소리, 3=D이미지, 4=E조립, 5=완성

  // STEP A: 대본
  inputType: AiInputType;
  keyword: string;
  url: string;
  manualScript: string;
  duration: AiDuration;
  tone: AiTone;
  scenes: ScriptScene[];

  // STEP B: 스타일
  styleId: string;

  // STEP C: 목소리
  voiceId: string;         // ttsVoices의 id
  voiceName: string;       // API name
  voiceEngine: string;     // 'gemini' | 'chirp3_hd' | 'legacy'
  voiceModel?: string;     // Gemini 모델명
  voiceSpeed: number;
  voiceStylePreset: string; // Gemini 스타일 프리셋 key
  audioUrl?: string;

  // STEP D: 이미지
  // (imageUrl은 각 ScriptScene에 포함)

  // STEP E: 조립 결과
  resultUrl?: string;
  thumbnailUrl?: string;

  isProcessing: boolean;
  progress: string;
}

export const INITIAL_AI_SHORTS_STATE: AiShortsState = {
  currentStep: 0,
  inputType: 'keyword',
  keyword: '',
  url: '',
  manualScript: '',
  duration: 60,
  tone: 'friendly',
  scenes: [],
  styleId: 'medical_clean',
  voiceId: 'gemini-leda',
  voiceName: 'Leda',
  voiceEngine: 'gemini',
  voiceModel: 'gemini-2.5-flash-tts',
  voiceSpeed: 1.0,
  voiceStylePreset: 'professional',
  isProcessing: false,
  progress: '',
};

export const AI_STEP_LABELS = ['대본', '스타일', '목소리', '이미지', '조립', '완성'];

