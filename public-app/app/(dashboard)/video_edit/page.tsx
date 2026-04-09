'use client';

import { useState, useRef, useCallback } from 'react';
import StepIndicator from '../../../components/video-edit/StepIndicator';
import StepCrop from '../../../components/video-edit/StepCrop';
import StepSilence from '../../../components/video-edit/StepSilence';
import {
  type PipelineState, type PipelineMode, type FileInfo,
  type StepCropState, type StepSilenceState,
  INITIAL_PIPELINE_STATE, getInputForStep,
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
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [stepProcessing, setStepProcessing] = useState(false);
  const [stepProgress, setStepProgress] = useState('');

  // ── 상태 헬퍼 ──

  const patch = (p: Partial<PipelineState>) => setState(prev => ({ ...prev, ...p }));
  const patchCrop = (p: Partial<StepCropState>) => setState(prev => ({
    ...prev,
    step1_crop: { ...prev.step1_crop, ...p },
  }));
  const patchSilence = (p: Partial<StepSilenceState>) => setState(prev => ({
    ...prev,
    step2_silence: { ...prev.step2_silence, ...p },
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

  // ── STEP 2: 무음 제거 처리 ──

  const processSilence = async () => {
    // 이전 단계 결과 또는 원본 파일을 입력으로 사용
    const input = getInputForStep(state, 2);
    if (!input) return;

    setStepProcessing(true);
    setStepProgress('무음 구간 분석 중...');
    setError('');

    try {
      // TODO: 실제 silence-remove API 연동
      // 현재는 시뮬레이션
      await new Promise(r => setTimeout(r, 1000));
      setStepProgress('무음 구간 제거 중...');
      await new Promise(r => setTimeout(r, 1500));
      setStepProgress('결과 생성 중...');
      await new Promise(r => setTimeout(r, 800));

      const intensity = state.step2_silence.intensity;
      const dur = state.fileInfo?.duration || 0;
      const pct = intensity === 'soft' ? 12 : intensity === 'normal' ? 22 : 35;
      const removed = dur * (pct / 100);

      patchSilence({
        resultBlobUrl: typeof input === 'string' ? input : URL.createObjectURL(input),
        originalDuration: dur,
        resultDuration: dur - removed,
        removedPercent: pct,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '무음 제거 실패');
    } finally {
      setStepProcessing(false);
      setStepProgress('');
    }
  };

  // ── 자동 모드 실행 ──

  const runAutoMode = async () => {
    if (!state.fileInfo) return;
    patch({ isProcessing: true });

    try {
      // STEP 1: 세로 크롭
      if (state.step1_crop.enabled && state.step1_crop.mode !== 'skip') {
        patch({ currentStep: 1, autoProgress: 'STEP 1/6: 세로 크롭...' });
        await processCrop();
      } else {
        patch({ currentStep: 1 });
      }

      // STEP 2: 무음 제거
      if (state.step2_silence.intensity !== 'skip') {
        patch({ currentStep: 2, autoProgress: 'STEP 2/6: 무음 제거...' });
        await processSilence();
      } else {
        patch({ currentStep: 2 });
      }

      // STEP 3~6: TODO (다음 프롬프트)
      patch({ currentStep: 3, autoProgress: 'STEP 3~6은 준비 중입니다.' });
      await new Promise(r => setTimeout(r, 500));

      // 완료
      patch({ currentStep: 6, autoProgress: undefined });
    } catch {
      // 에러는 각 process 함수에서 처리
    } finally {
      patch({ isProcessing: false, autoProgress: undefined });
    }
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
          영상 하나로 6단계를 거쳐 쇼츠 완성본을 만듭니다
        </p>
      </div>

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

      {/* 스텝 인디케이터 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-xl px-3 py-1">
        <StepIndicator
          state={state}
          onStepClick={state.mode === 'manual' && !stepProcessing ? goStep : undefined}
        />
      </div>

      {/* 자동 모드 진행 중 */}
      {state.isProcessing && state.mode === 'auto' && (
        <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-2xl text-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold text-blue-700">{state.autoProgress || '처리 중...'}</div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${Math.max(5, (state.currentStep / 6) * 100)}%` }} />
          </div>
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
                  onClick={e => { e.stopPropagation(); setState(prev => ({ ...INITIAL_PIPELINE_STATE, mode: prev.mode })); setError(''); }}
                  className="mt-2 text-xs text-red-500 hover:text-red-700 font-semibold">
                  파일 변경
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-4xl text-slate-300">📁</div>
                <p className="text-sm font-semibold text-slate-600">영상 또는 오디오 파일을 드래그하거나 클릭하여 선택</p>
                <p className="text-xs text-slate-400">MP4, MOV, AVI, MP3, WAV, AAC, M4A · 최대 {MAX_SIZE_MB}MB · 최대 {MAX_DURATION_SEC / 60}분</p>
              </div>
            )}
          </div>

          {/* 업로드 완료 시 다음 버튼 */}
          {state.fileInfo && (
            <div className="flex gap-3">
              {state.mode === 'auto' ? (
                <button type="button" onClick={runAutoMode} disabled={state.isProcessing || !!error}
                  className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
                  ⚡ 자동 처리 시작
                </button>
              ) : (
                <button type="button" onClick={() => goStep(1)}
                  className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
                  다음 단계 →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════ STEP 1: 세로 크롭 ══════ */}
      {state.currentStep === 1 && state.mode === 'manual' && (
        <StepCrop
          state={state}
          onUpdate={patchCrop}
          onProcess={processCrop}
          onNext={() => goStep(2)}
          onPrev={() => goStep(0)}
          isProcessing={stepProcessing}
          progress={stepProgress}
        />
      )}

      {/* ══════ STEP 2: 무음 제거 ══════ */}
      {state.currentStep === 2 && state.mode === 'manual' && (
        <StepSilence
          state={state}
          onUpdate={patchSilence}
          onProcess={processSilence}
          onNext={() => goStep(3)}
          onPrev={() => goStep(1)}
          isProcessing={stepProcessing}
          progress={stepProgress}
        />
      )}

      {/* ══════ STEP 3~6: TODO ══════ */}
      {state.currentStep >= 3 && state.mode === 'manual' && (
        <div className="space-y-6">
          <div className="p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <div className="text-3xl mb-3">🚧</div>
            <div className="text-sm font-bold text-slate-600">
              STEP {state.currentStep}: 준비 중
            </div>
            <div className="text-xs text-slate-400 mt-1">
              자막, 효과음, BGM/인트로 단계는 다음 업데이트에서 추가됩니다.
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => goStep(state.currentStep - 1)}
              className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
              ← 이전
            </button>
            {state.currentStep < 6 && (
              <button type="button" onClick={() => goStep(state.currentStep + 1)}
                className="flex-1 py-3 bg-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-300 transition-all text-sm">
                다음 단계 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
