'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ModeSelector from '../../../components/video-edit/ModeSelector';
import AiShortsWizard from '../../../components/video-edit/AiShortsWizard';
import StepIndicator from '../../../components/video-edit/StepIndicator';
import StepCrop from '../../../components/video-edit/StepCrop';
import StepSilence from '../../../components/video-edit/StepSilence';
import StepSubtitle from '../../../components/video-edit/StepSubtitle';
import StepEffects from '../../../components/video-edit/StepEffects';
import StepZoom from '../../../components/video-edit/StepZoom';
import StepBgm from '../../../components/video-edit/StepBgm';
import StepIntroOutro from '../../../components/video-edit/StepIntroOutro';
import StepThumbnail from '../../../components/video-edit/StepThumbnail';
import CompletionScreen from '../../../components/video-edit/CompletionScreen';
import VideoPlayer from '../../../components/video-edit/VideoPlayer';
import RecentVideos from '../../../components/video-edit/RecentVideos';
import PipelineProgress, { type AutoStepStatus } from '../../../components/video-edit/PipelineProgress';
import StepStyle from '../../../components/video-edit/StepStyle';
import {
  type PipelineState, type PipelineMode, type FileInfo, type HospitalInfo, type EntryMode,
  type StepCropState, type StepStyleState, type StepSilenceState, type StepSubtitleState,
  type StepEffectsState, type StepZoomState, type StepBgmState, type StepIntroState, type StepThumbnailState,
  type SubtitleSegment, type SoundEffect,
  INITIAL_PIPELINE_STATE, TOTAL_STEPS, getInputForStep,
} from '../../../components/video-edit/types';

// ── 상수 ──

const ACCEPT_TYPES = '.mp4,.mov,.avi,.mp3,.wav,.aac,.m4a';
const MAX_SIZE_MB = 500;
const MAX_DURATION_SEC = 600;

// ── 유틸 ──

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ══════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════

export default function VideoEditPage() {
  const [entryMode, setEntryMode] = useState<EntryMode>('select');
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [stepProcessing, setStepProcessing] = useState(false);
  const [stepProgress, setStepProgress] = useState('');
  const [autoStatuses, setAutoStatuses] = useState<AutoStepStatus[]>([]);
  const cancelRef = useRef(false);

  // 업로드 영역 미리보기용 — originalFile이 바뀔 때만 새 blob URL을 만들고 cleanup
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const f = state.originalFile;
    if (!f) {
      setOriginalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(f);
    setOriginalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [state.originalFile]);

  // ── 상태 헬퍼 ──

  const patch = (p: Partial<PipelineState>) => setState(prev => ({ ...prev, ...p }));
  const patchCrop = (p: Partial<StepCropState>) => setState(prev => ({
    ...prev,
    step1_crop: { ...prev.step1_crop, ...p },
  }));
  const patchStyle = (p: Partial<StepStyleState>) => setState(prev => ({
    ...prev,
    step2_style: { ...prev.step2_style, ...p },
  }));
  const patchSilence = (p: Partial<StepSilenceState>) => setState(prev => ({
    ...prev,
    step3_silence: { ...prev.step3_silence, ...p },
  }));
  const patchSubtitle = (p: Partial<StepSubtitleState>) => setState(prev => ({
    ...prev,
    step4_subtitle: { ...prev.step4_subtitle, ...p },
  }));
  const patchEffects = (p: Partial<StepEffectsState>) => setState(prev => ({
    ...prev,
    step5_effects: { ...prev.step5_effects, ...p },
  }));
  const patchZoom = (p: Partial<StepZoomState>) => setState(prev => ({
    ...prev,
    step6_zoom: { ...prev.step6_zoom, ...p },
  }));
  const patchThumbnail = (p: Partial<StepThumbnailState>) => setState(prev => ({
    ...prev,
    step9_thumbnail: { ...prev.step9_thumbnail, ...p },
  }));
  const patchBgm = (p: Partial<StepBgmState>) => setState(prev => ({
    ...prev,
    step7_bgm: { ...prev.step7_bgm, ...p },
  }));
  const patchIntro = (p: Partial<StepIntroState>) => setState(prev => ({
    ...prev,
    step8_intro: { ...prev.step8_intro, ...p },
  }));
  const patchHospital = (p: Partial<HospitalInfo>) => setState(prev => ({
    ...prev,
    step8_intro: { ...prev.step8_intro, hospital: { ...prev.step8_intro.hospital, ...p } },
  }));
  const goStep = (step: number) => { setError(''); patch({ currentStep: step }); };

  // ── 파일 업로드 ──

  const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|avi)$/i.test(f.name);
  const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|aac|m4a)$/i.test(f.name);

  const handleFile = useCallback((f: File) => {
    setError('');
    setState(prev => ({ ...INITIAL_PIPELINE_STATE, mode: prev.mode }));

    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다.`);
      return;
    }

    const isAudio = isAudioFile(f);
    const url = URL.createObjectURL(f);
    const el = document.createElement(isAudio ? 'audio' : 'video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const info: FileInfo = {
        name: f.name,
        size: f.size,
        duration: el.duration,
        width: 'videoWidth' in el ? (el as HTMLVideoElement).videoWidth : undefined,
        height: 'videoHeight' in el ? (el as HTMLVideoElement).videoHeight : undefined,
        isVertical: 'videoHeight' in el ? (el as HTMLVideoElement).videoHeight > (el as HTMLVideoElement).videoWidth : false,
        isAudio,
      };
      URL.revokeObjectURL(url);

      if (el.duration > MAX_DURATION_SEC) {
        setError(`영상 길이가 ${Math.round(MAX_DURATION_SEC / 60)}분을 초과합니다.`);
        return;
      }

      setState(prev => ({
        ...prev,
        originalFile: f,
        fileInfo: info,
        // 음성 파일이면 크롭 자동 비활성화
        step1_crop: { ...prev.step1_crop, enabled: !info.isAudio && !info.isVertical },
      }));
    };
    el.onerror = () => { URL.revokeObjectURL(url); setError('파일을 읽을 수 없습니다.'); };
    el.src = url;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  // ── STEP 1: 세로 크롭 처리 ──

  const processCrop = async () => {
    const file = state.originalFile;
    if (!file) return;

    setStepProcessing(true);
    setStepProgress('영상을 분석하고 있습니다...');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('aspect_ratio', state.step1_crop.aspect);
      formData.append('crop_mode', state.step1_crop.mode === 'face_tracking' ? 'face_tracking' : 'center');
      formData.append('output_resolution', '1080x1920');

      setStepProgress('영상을 변환하고 있습니다...');
      const res = await fetch('/api/video/crop-vertical', { method: 'POST', body: formData });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(errData.error || `크롭 실패 (${res.status})`);
      }

      const metaHeader = res.headers.get('X-Crop-Metadata');
      const meta = metaHeader ? JSON.parse(metaHeader) : {};
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      patchCrop({ resultBlobUrl: blobUrl, facesDetected: meta.faces_detected });
    } catch (err) {
      setError(err instanceof Error ? err.message : '크롭 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── STEP 2: 스타일 변환 처리 ──

  const processStyle = async () => {
    const input = getInputForStep(state, 2);
    if (!input) return;
    setStepProcessing(true);
    setStepProgress('스타일을 변환하고 있습니다...');
    setError('');
    try {
      let fileToSend: File;
      if (typeof input === 'string') {
        const r = await fetch(input); const b = await r.blob();
        fileToSend = new File([b], state.fileInfo?.name || 'video.mp4', { type: b.type });
      } else { fileToSend = input as File; }
      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('style_id', state.step2_style.styleId);
      const res = await fetch('/api/video/apply-style', { method: 'POST', body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(d.error || `스타일 변환 실패 (${res.status})`);
      }
      const blob = await res.blob();
      patchStyle({ resultBlobUrl: URL.createObjectURL(blob) });
    } catch (err) { setError(err instanceof Error ? err.message : '스타일 변환 실패'); }
    finally { setStepProcessing(false); setStepProgress(''); }
  };

  // ── STEP 3: 무음 제거 처리 ──

  const processSilence = async () => {
    const input = getInputForStep(state, 3);
    if (!input) return;

    setStepProcessing(true);
    setStepProgress('무음 구간 분석 중...');
    setError('');

    try {
      let fileToSend: File;
      if (typeof input === 'string') {
        const r = await fetch(input); const b = await r.blob();
        fileToSend = new File([b], state.fileInfo?.name || 'video.mp4', { type: b.type });
      } else { fileToSend = input as File; }

      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('intensity', state.step3_silence.intensity);

      setStepProgress('무음 구간 제거 중...');
      const res = await fetch('/api/video/silence-remove', { method: 'POST', body: formData });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(d.error || `무음 제거 실패 (${res.status})`);
      }

      const metaHeader = res.headers.get('X-Silence-Metadata');
      const meta = metaHeader ? JSON.parse(metaHeader) : {};
      const blob = await res.blob();

      patchSilence({
        resultBlobUrl: URL.createObjectURL(blob),
        originalDuration: meta.original_duration || state.fileInfo?.duration || 0,
        resultDuration: meta.result_duration || state.fileInfo?.duration || 0,
        removedPercent: meta.removed_percent || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '무음 제거 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── STEP 3: AI 자막 생성 처리 ──

  const processSubtitle = async () => {
    const input = getInputForStep(state, 4);
    if (!input && !state.originalFile) return;

    setStepProcessing(true);
    setStepProgress('음성을 분석하고 있습니다...');
    setError('');

    try {
      // 입력 파일 준비
      let fileToSend: File;
      if (typeof input === 'string') {
        // blob URL → File로 변환
        const res = await fetch(input);
        const blob = await res.blob();
        fileToSend = new File([blob], state.fileInfo?.name || 'audio.mp4', { type: blob.type });
      } else {
        fileToSend = input as File || state.originalFile!;
      }

      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('subtitle_style', state.step4_subtitle.style);
      formData.append('subtitle_position', state.step4_subtitle.position);
      formData.append('dental_terms', String(state.step4_subtitle.dentalTerms));

      setStepProgress('자막을 생성하고 있습니다...');
      const res = await fetch('/api/video/generate-subtitles', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '자막 생성 실패');

      patchSubtitle({
        subtitles: data.subtitles || [],
        highViolations: data.high_violation_count || 0,
        mediumViolations: data.medium_violation_count || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '자막 생성 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── STEP 5: 효과음 배치 처리 ──
  // video-processor /api/video/add-sound-effects를 호출해서 실제 합성된 영상을 받음.
  // 응답 헤더 X-Sfx-Metadata에 { applied, count, source, effects[] } 가 들어있고,
  // body는 합성된 영상(또는 효과음 라이브러리가 비어있으면 원본 그대로).

  const processEffects = async () => {
    const input = getInputForStep(state, 5);
    if (!input) return;
    setStepProcessing(true);
    setStepProgress('효과음을 배치하고 있습니다...');
    setError('');

    try {
      // 1. 입력 파일 준비 (이전 단계 blob URL 또는 원본 File)
      let fileToSend: File;
      if (typeof input === 'string') {
        const r = await fetch(input);
        const b = await r.blob();
        fileToSend = new File([b], state.fileInfo?.name || 'video.mp4', { type: b.type });
      } else {
        fileToSend = input as File;
      }

      // 2. FormData 구성 (자막 있으면 함께 전달 → 서버가 AI 배치에 사용)
      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('style', state.step5_effects.style);
      formData.append('density', String(state.step5_effects.density));
      const subs = state.step4_subtitle.subtitles;
      if (subs && subs.length > 0) {
        formData.append('subtitles', JSON.stringify(subs));
      }

      setStepProgress('효과음을 합성하고 있습니다...');
      const res = await fetch('/api/video/add-sound-effects', { method: 'POST', body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(d.error || `효과음 처리 실패 (${res.status})`);
      }

      // 3. 메타데이터 + blob URL
      const metaHeader = res.headers.get('X-Sfx-Metadata');
      type ServerEffect = { time?: number; category?: string; sfx_id?: string; sfx_name?: string };
      type SfxMeta = {
        applied?: boolean;
        count?: number;
        source?: 'ai' | 'rule';
        effects?: ServerEffect[];
        reason?: string;
      };
      let meta: SfxMeta = { applied: false, count: 0, effects: [] };
      try { if (metaHeader) meta = JSON.parse(metaHeader) as SfxMeta; } catch {}

      const blob = await res.blob();
      const resultBlobUrl = URL.createObjectURL(blob);

      // 4. server effects → 프론트 SoundEffect로 변환
      //    server: sfx_id = `${category}_${파일명}` (예: 'emphasis_ding_01')
      //    프론트 lib/sfxLibrary는 id가 카테고리 prefix 없이 'ding_01' 형식 → prefix 제거 후 lookup
      const { SFX_LIBRARY } = await import('../../../lib/sfxLibrary');
      const serverEffects: ServerEffect[] = Array.isArray(meta.effects) ? meta.effects : [];
      const effects: SoundEffect[] = serverEffects.map((e, idx) => {
        const cat = e.category || 'emphasis';
        const localId = String(e.sfx_id || '').replace(new RegExp(`^${cat}_`), '');
        const local = SFX_LIBRARY.find(s => s.id === localId);
        return {
          id: `fx_${idx}_${Date.now()}`,
          time: typeof e.time === 'number' ? e.time : 0,
          sfxId: local?.id || localId || e.sfx_id || `sfx_${idx}`,
          sfxName: local?.name || e.sfx_name || localId || '효과음',
          sfxPath: local?.path || '', // 프론트 라이브러리에 같은 id가 있을 때만 미리듣기 가능
          category: cat,
          reason: meta.source === 'ai' ? 'AI 자동 배치' : '키워드 기반 배치',
        };
      });

      // 5. 안내 메시지 — 효과음이 0개인 두 가지 케이스 구분
      let notice: string | undefined;
      if (effects.length === 0) {
        if (meta.reason === 'sfx_library_empty') {
          notice = 'ℹ️ 서버에 효과음 파일이 아직 없어 원본 그대로 다음 단계로 넘어갑니다.';
        } else if (meta.reason === 'video_processor_failed') {
          notice = 'ℹ️ 효과음 서버 처리에 실패해 원본 그대로 다음 단계로 넘어갑니다.';
        }
      }

      // 6. 상태 저장 — resultBlobUrl을 반드시 저장해야 다음 단계가 입력으로 받음
      patchEffects({ effects, resultBlobUrl, notice });
    } catch (err) {
      setError(err instanceof Error ? err.message : '효과음 배치 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── STEP 6: 줌 효과 처리 ──

  const processZoom = async () => {
    const input = getInputForStep(state, 6);
    if (!input) return;
    setStepProcessing(true);
    setStepProgress('줌 효과를 적용하고 있습니다...');
    setError('');
    try {
      let fileToSend: File;
      if (typeof input === 'string') {
        const r = await fetch(input); const b = await r.blob();
        fileToSend = new File([b], state.fileInfo?.name || 'video.mp4', { type: b.type });
      } else { fileToSend = input as File; }

      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('intensity', state.step6_zoom.intensity);
      formData.append('zoom_level', String(state.step6_zoom.zoomLevel));
      if (state.step4_subtitle.subtitles) {
        formData.append('subtitles', JSON.stringify(state.step4_subtitle.subtitles));
      }

      const res = await fetch('/api/video/add-zoom', { method: 'POST', body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(d.error || `줌 효과 실패 (${res.status})`);
      }

      const metaHeader = res.headers.get('X-Zoom-Metadata');
      const meta = metaHeader ? JSON.parse(metaHeader) : {};
      const blob = await res.blob();
      patchZoom({ resultBlobUrl: URL.createObjectURL(blob), zoomPoints: meta.zoom_points });
    } catch (err) { setError(err instanceof Error ? err.message : '줌 효과 실패'); }
    finally { setStepProcessing(false); setStepProgress(''); }
  };

  // ── STEP 9: 썸네일 생성 처리 ──

  const processThumbnail = async () => {
    const input = getInputForStep(state, 9);
    if (!input) return;
    setStepProcessing(true);
    setStepProgress('썸네일을 생성하고 있습니다...');
    setError('');
    try {
      let fileToSend: File;
      if (typeof input === 'string') {
        const r = await fetch(input); const b = await r.blob();
        fileToSend = new File([b], state.fileInfo?.name || 'video.mp4', { type: b.type });
      } else { fileToSend = input as File; }

      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('frame_time', String(state.step9_thumbnail.frameTime || 1));
      formData.append('text', state.step9_thumbnail.text || '');
      formData.append('text_color', state.step9_thumbnail.textColor);
      formData.append('text_position', state.step9_thumbnail.textPosition);

      const res = await fetch('/api/video/generate-thumbnail', { method: 'POST', body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(d.error || `썸네일 실패 (${res.status})`);
      }

      const blob = await res.blob();
      patchThumbnail({ thumbnailUrl: URL.createObjectURL(blob) });
    } catch (err) { setError(err instanceof Error ? err.message : '썸네일 생성 실패'); }
    finally { setStepProcessing(false); setStepProgress(''); }
  };

  // ── STEP 7: BGM 삽입 처리 ──

  const processBgm = async () => {
    const input = getInputForStep(state, 7);
    if (!input) return;

    setStepProcessing(true);
    setStepProgress('BGM을 합성하고 있습니다...');
    setError('');

    try {
      let fileToSend: File;
      if (typeof input === 'string') {
        const res = await fetch(input);
        const blob = await res.blob();
        fileToSend = new File([blob], state.fileInfo?.name || 'video.mp4', { type: blob.type });
      } else {
        fileToSend = input as File;
      }

      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('bgm_id', state.step7_bgm.bgmId || 'calm_01');
      formData.append('volume', String(state.step7_bgm.volume));

      const res = await fetch('/api/video/add-bgm', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(errData.error || `BGM 합성 실패 (${res.status})`);
      }

      const blob = await res.blob();
      patchBgm({ resultBlobUrl: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BGM 합성 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── STEP 6: 인트로/아웃로 처리 ──

  const processIntroOutro = async () => {
    const input = getInputForStep(state, 8);
    if (!input) return;

    setStepProcessing(true);
    setStepProgress('인트로/아웃로를 생성하고 있습니다...');
    setError('');

    try {
      let fileToSend: File;
      if (typeof input === 'string') {
        const res = await fetch(input);
        const blob = await res.blob();
        fileToSend = new File([blob], state.fileInfo?.name || 'video.mp4', { type: blob.type });
      } else {
        fileToSend = input as File;
      }

      const formData = new FormData();
      formData.append('file', fileToSend);
      formData.append('hospital_name', state.step8_intro.hospital.name);
      formData.append('hospital_phone', state.step8_intro.hospital.phone || '');
      formData.append('hospital_desc', state.step8_intro.hospital.desc || '');
      formData.append('hospital_link', state.step8_intro.hospital.link || '');
      formData.append('intro_style', state.step8_intro.introStyle);
      formData.append('outro_style', state.step8_intro.outroStyle);

      const res = await fetch('/api/video/add-intro-outro', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(errData.error || `인트로/아웃로 합성 실패 (${res.status})`);
      }

      const blob = await res.blob();
      patchIntro({ resultBlobUrl: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : '인트로/아웃로 합성 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── 자동 모드 실행 ──

  const runAutoMode = async () => {
    if (!state.fileInfo) return;
    cancelRef.current = false;
    patch({ isProcessing: true });

    // 초기 상태
    const statuses: AutoStepStatus[] = Array.from({ length: TOTAL_STEPS }, (_, i) => ({
      step: i + 1,
      status: 'pending' as const,
    }));
    setAutoStatuses([...statuses]);

    const updateStatus = (step: number, update: Partial<AutoStepStatus>) => {
      const idx = statuses.findIndex(s => s.step === step);
      if (idx >= 0) statuses[idx] = { ...statuses[idx], ...update };
      setAutoStatuses([...statuses]);
    };

    const steps: Array<{
      step: number;
      skip: () => boolean;
      run: () => Promise<void>;
      label: string;
    }> = [
      { step: 1, skip: () => !state.step1_crop.enabled || state.step1_crop.mode === 'skip', run: processCrop, label: '세로 크롭' },
      { step: 2, skip: () => state.step2_style.styleId === 'original', run: processStyle, label: '스타일 변환' },
      { step: 3, skip: () => state.step3_silence.intensity === 'skip', run: processSilence, label: '무음 제거' },
      { step: 4, skip: () => state.step4_subtitle.style === 'skip', run: processSubtitle, label: 'AI 자막' },
      { step: 5, skip: () => state.step5_effects.style === 'skip', run: processEffects, label: '효과음' },
      { step: 6, skip: () => state.step6_zoom.intensity === 'skip' || !state.step6_zoom.enabled || !!state.fileInfo?.isAudio, run: processZoom, label: '줌 효과' },
      { step: 7, skip: () => state.step7_bgm.mood === 'skip', run: processBgm, label: 'BGM' },
      { step: 8, skip: () => (state.step8_intro.introStyle === 'none' && state.step8_intro.outroStyle === 'none') || !state.step8_intro.hospital.name.trim(), run: processIntroOutro, label: '인트로/아웃로' },
      { step: 9, skip: () => !state.step9_thumbnail.enabled || !!state.fileInfo?.isAudio, run: processThumbnail, label: '썸네일' },
    ];

    for (const s of steps) {
      if (cancelRef.current) break;

      if (s.skip()) {
        updateStatus(s.step, { status: 'skipped' });
        patch({ currentStep: s.step });
        continue;
      }

      updateStatus(s.step, { status: 'processing' });
      patch({ currentStep: s.step, autoProgress: `STEP ${s.step}/${TOTAL_STEPS}: ${s.label}...` });

      try {
        await s.run();
        updateStatus(s.step, { status: 'done' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '실패';
        updateStatus(s.step, { status: 'error', error: msg });
      }
    }

    // 완료 — 완성 화면(step 10)으로 이동
    patch({ isProcessing: false, autoProgress: undefined, currentStep: 10 });
  };

  // 자동 모드 취소
  const cancelAutoMode = () => {
    cancelRef.current = true;
    patch({ isProcessing: false, autoProgress: undefined });
  };

  // 전체 초기화
  const resetPipeline = () => {
    setState(prev => ({ ...INITIAL_PIPELINE_STATE, mode: prev.mode }));
    setError('');
    setAutoStatuses([]);
  };

  // ══════════════════════════════════════════
  // UI
  // ══════════════════════════════════════════

  return (
    <div className="p-5 max-w-3xl mx-auto min-h-[calc(100vh-80px)]" style={{ paddingTop: '4vh' }}>

      {/* 헤더 */}
      <div className="mb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          🎬 쇼츠 메이커
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          촬영 영상 편집 또는 AI로 처음부터 만들기
        </p>
      </div>

      {/* ══════ 진입점 모드 선택 ══════ */}
      {entryMode === 'select' && (
        <>
          <ModeSelector
            onSelectVideo={() => setEntryMode('video')}
            onSelectAi={() => setEntryMode('ai')}
          />
          <RecentVideos />
        </>
      )}

      {/* ══════ AI 쇼츠 생성기 ══════ */}
      {entryMode === 'ai' && (
        <AiShortsWizard onBack={() => setEntryMode('select')} />
      )}

      {/* ══════ 촬영 영상 파이프라인 ══════ */}
      {entryMode === 'video' && (<>

      {/* 모드 토글 */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1">
        {([
          { id: 'auto' as PipelineMode, label: '⚡ 자동 모드', desc: '한 번에 처리' },
          { id: 'manual' as PipelineMode, label: '🔧 단계별 모드', desc: '하나씩 확인' },
        ]).map(m => (
          <button key={m.id} type="button"
            onClick={() => patch({ mode: m.id })}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              state.mode === m.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* 스텝 인디케이터 — 단계별 모드 or 자동 모드 처리 중에만 표시 */}
      {(state.mode === 'manual' || state.isProcessing) && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl px-3 py-1">
          <StepIndicator
            state={state}
            onStepClick={state.mode === 'manual' && !stepProcessing ? goStep : undefined}
          />
        </div>
      )}

      {/* 자동 모드 프로그레스 */}
      {state.isProcessing && state.mode === 'auto' && autoStatuses.length > 0 && (
        <div className="mb-6">
          <PipelineProgress state={state} stepStatuses={autoStatuses} onCancel={cancelAutoMode} />
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">
          {error}
        </div>
      )}

      {/* ══════ STEP 0: 업로드 ══════ */}
      {state.currentStep === 0 && (
        <div className="space-y-6">

          {/* 자동 모드 — 간결한 안내 */}
          {state.mode === 'auto' && !state.fileInfo && (
            <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl text-center space-y-2">
              <div className="text-3xl">⚡</div>
              <div className="text-base font-black text-blue-800">영상만 올리면 끝</div>
              <div className="text-xs text-blue-600 leading-relaxed">
                세로 크롭 → 무음 제거 → 자막 → 효과음 → BGM<br />
                전 단계를 기본값으로 자동 처리합니다
              </div>
            </div>
          )}

          {/* 업로드 영역 */}
          <div
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
              dragOver ? 'border-blue-400 bg-blue-50'
              : state.fileInfo ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept={ACCEPT_TYPES} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

            {state.fileInfo ? (
              <div className="space-y-2">
                <div className="text-3xl">{state.fileInfo.isAudio ? '🎵' : '🎬'}</div>
                <p className="text-sm font-bold text-slate-800">{state.fileInfo.name}</p>
                <div className="flex items-center justify-center gap-3 text-xs text-slate-500 flex-wrap">
                  <span>{formatFileSize(state.fileInfo.size)}</span>
                  <span>{formatDuration(state.fileInfo.duration)}</span>
                  {state.fileInfo.width && state.fileInfo.height && (
                    <span>{state.fileInfo.width}×{state.fileInfo.height}</span>
                  )}
                  {state.fileInfo.isVertical && <span className="text-emerald-600 font-bold">세로 영상</span>}
                  {state.fileInfo.isAudio && <span className="text-blue-600 font-bold">음성 파일</span>}
                </div>
                <button type="button"
                  onClick={e => { e.stopPropagation(); resetPipeline(); }}
                  className="mt-2 text-xs text-red-500 hover:text-red-700 font-semibold">
                  파일 변경
                </button>
                {/* 원본 미리보기 — 음성 파일이면 audio, 영상이면 video로 자동 분기 */}
                {originalPreviewUrl && (
                  <div
                    className="mt-3 mx-auto"
                    style={{ maxWidth: state.fileInfo.isVertical ? '180px' : '320px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <VideoPlayer
                      src={originalPreviewUrl}
                      type={state.fileInfo.isAudio ? 'audio' : 'video'}
                      compact
                      aspectRatio={state.fileInfo.isVertical ? '9/16' : undefined}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-4xl text-slate-300">📁</div>
                <p className="text-sm font-semibold text-slate-600">영상 또는 오디오 파일을 드래그하거나 클릭하여 선택</p>
                <p className="text-xs text-slate-400">MP4, MOV, AVI, MP3, WAV, AAC, M4A · 최대 {MAX_SIZE_MB}MB · 최대 {MAX_DURATION_SEC / 60}분</p>
              </div>
            )}
          </div>

          {/* 업로드 완료 시 — 모드별 CTA 차별화 */}
          {state.fileInfo && (
            state.mode === 'auto' ? (
              <button type="button" onClick={runAutoMode} disabled={state.isProcessing || !!error}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 transition-all text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                ⚡ 자동 처리 시작
              </button>
            ) : (
              <button type="button" onClick={() => goStep(1)}
                className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
                다음 단계 →
              </button>
            )
          )}

          {/* 단계별 모드 — 각 단계 미리 설명 */}
          {state.mode === 'manual' && !state.fileInfo && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: '📐', label: '세로 크롭', desc: '9:16' },
                { icon: '🎨', label: '스타일', desc: '변환' },
                { icon: '✂️', label: '무음 제거', desc: '자동 컷' },
                { icon: '💬', label: '자막', desc: 'AI 인식' },
                { icon: '🎵', label: '효과음', desc: '자동' },
                { icon: '🔍', label: '줌', desc: '강조' },
                { icon: '🎶', label: 'BGM', desc: '배경음' },
                { icon: '🎬', label: '인트로', desc: '오프닝' },
                { icon: '🖼️', label: '썸네일', desc: '자동' },
              ].map(s => (
                <div key={s.label} className="p-3 bg-slate-50 rounded-xl text-center">
                  <div className="text-lg">{s.icon}</div>
                  <div className="text-[11px] font-bold text-slate-700 mt-0.5">{s.label}</div>
                  <div className="text-[10px] text-slate-400">{s.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════ STEP 1: 세로 크롭 ══════ */}
      {state.currentStep === 1 && state.mode === 'manual' && (
        <StepCrop state={state} onUpdate={patchCrop} onProcess={processCrop}
          onNext={() => goStep(2)} onPrev={() => goStep(0)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 2: 스타일 변환 ══════ */}
      {state.currentStep === 2 && state.mode === 'manual' && (
        <StepStyle state={state} onUpdate={patchStyle} onProcess={processStyle}
          onNext={() => goStep(3)} onPrev={() => goStep(1)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 3: 무음 제거 ══════ */}
      {state.currentStep === 3 && state.mode === 'manual' && (
        <StepSilence state={state} onUpdate={patchSilence} onProcess={processSilence}
          onNext={() => goStep(4)} onPrev={() => goStep(2)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 4: AI 자막 ══════ */}
      {state.currentStep === 4 && state.mode === 'manual' && (
        <StepSubtitle state={state} onUpdate={patchSubtitle} onProcess={processSubtitle}
          onNext={() => goStep(5)} onPrev={() => goStep(3)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 5: 효과음 ══════ */}
      {state.currentStep === 5 && state.mode === 'manual' && (
        <StepEffects state={state} onUpdate={patchEffects} onProcess={processEffects}
          onNext={() => goStep(6)} onPrev={() => goStep(4)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 6: 줌인/줌아웃 ══════ */}
      {state.currentStep === 6 && state.mode === 'manual' && (
        <StepZoom state={state} onUpdate={patchZoom} onProcess={processZoom}
          onNext={() => goStep(7)} onPrev={() => goStep(5)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 7: BGM ══════ */}
      {state.currentStep === 7 && state.mode === 'manual' && (
        <StepBgm state={state} onUpdate={patchBgm} onProcess={processBgm}
          onNext={() => goStep(8)} onPrev={() => goStep(6)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 8: 인트로/아웃로 ══════ */}
      {state.currentStep === 8 && state.mode === 'manual' && (
        <StepIntroOutro state={state} onUpdate={patchIntro} onUpdateHospital={patchHospital} onProcess={processIntroOutro}
          onNext={() => goStep(9)} onPrev={() => goStep(7)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ STEP 9: 썸네일 ══════ */}
      {state.currentStep === 9 && state.mode === 'manual' && (
        <StepThumbnail state={state} onUpdate={patchThumbnail} onProcess={processThumbnail}
          onNext={() => goStep(10)} onPrev={() => goStep(8)} isProcessing={stepProcessing} progress={stepProgress} />
      )}

      {/* ══════ 완성 화면 ══════ */}
      {state.currentStep === 10 && (
        <CompletionScreen
          state={state}
          onGoStep={(step) => { patch({ currentStep: step }); }}
          onReset={resetPipeline}
        />
      )}

      {/* 자동 모드 완료 후 (processing 끝나고 step이 7이 아닌 경우) — 완성 화면으로 이동 버튼 */}
      {!state.isProcessing && state.mode === 'auto' && autoStatuses.length > 0 && state.currentStep !== 10 && state.currentStep > 0 && (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => patch({ currentStep: 10 })}
            className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
            🎬 완성 화면 보기
          </button>
        </div>
      )}

      </>)}
    </div>
  );
}
