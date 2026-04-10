'use client';

import { useState } from 'react';
import type { PipelineState, StepCropState, CropMode, CropAspect } from './types';
import VideoPlayer from './VideoPlayer';

const CROP_MODE_OPTIONS: { id: CropMode; icon: string; label: string; desc: string }[] = [
  { id: 'face_tracking', icon: '👤', label: '얼굴 추적', desc: '화자 얼굴을 자동 추적하며 크롭' },
  { id: 'center', icon: '⊹', label: '중앙 고정', desc: '항상 화면 중앙 기준으로 크롭' },
  { id: 'skip', icon: '⏭', label: '스킵', desc: '이 단계 건너뛰기' },
];

const CROP_ASPECT_OPTIONS: { id: CropAspect; label: string; desc: string }[] = [
  { id: '9:16', label: '9:16', desc: '쇼츠/릴스' },
  { id: '4:5', label: '4:5', desc: '인스타 피드' },
  { id: '1:1', label: '1:1', desc: '정사각형' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepCropState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepCrop({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step1_crop: crop, fileInfo } = state;
  const autoSkipped = !!(fileInfo?.isAudio || fileInfo?.isVertical);
  const hasResult = !!crop.resultBlobUrl || crop.mode === 'skip' || autoSkipped;

  // 자동 스킵 안내
  if (autoSkipped) {
    return (
      <div className="space-y-6">
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
          <div className="text-2xl mb-2">✅</div>
          <div className="text-sm font-bold text-emerald-700">
            {fileInfo?.isAudio ? '음성 파일이므로 세로 크롭을 건너뜁니다.' : '이미 세로 영상입니다.'}
          </div>
          {fileInfo && !fileInfo.isAudio && (
            <div className="text-xs text-emerald-600 mt-1">
              {fileInfo.width}×{fileInfo.height} — 세로 비율 감지됨
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onPrev}
            className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
            ← 이전
          </button>
          <button type="button" onClick={onNext}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
            다음 단계 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 결과 표시 */}
      {hasResult && crop.resultBlobUrl && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 세로 크롭 완료
            </div>
          </div>

          <div className="flex justify-center">
            <div style={{ maxWidth: '220px', width: '100%' }}>
              <VideoPlayer
                src={crop.resultBlobUrl}
                compact
                aspectRatio={crop.aspect === '9:16' ? '9/16' : crop.aspect === '4:5' ? '4/5' : '1/1'}
              />
            </div>
          </div>
        </div>
      )}

      {/* 스킵 상태 */}
      {crop.mode === 'skip' && !crop.resultBlobUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">이 단계를 건너뛰었습니다.</div>
        </div>
      )}

      {/* 옵션 (아직 처리 안 했거나 다시 설정할 때) */}
      {!hasResult && (
        <div className="space-y-5">
          {/* 크롭 모드 */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500">크롭 모드</label>
            <div className="space-y-2">
              {CROP_MODE_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ mode: opt.id })}
                  className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${crop.mode === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${crop.mode === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {opt.icon} {opt.label}
                    {opt.id === 'face_tracking' && <span className="ml-2 text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Beta</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 출력 비율 (스킵이 아닐 때만) */}
          {crop.mode !== 'skip' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-500">출력 비율</label>
              <div className="flex gap-3">
                {CROP_ASPECT_OPTIONS.map(opt => (
                  <button key={opt.id} type="button" onClick={() => onUpdate({ aspect: opt.id })}
                    className={`flex-1 p-3 rounded-xl border-2 text-center transition-all ${crop.aspect === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                    <div className={`text-lg font-black ${crop.aspect === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 영상 메타 요약 */}
          {fileInfo && (
            <div className="text-[11px] text-slate-500">
              원본: {fileInfo.width}×{fileInfo.height} · {formatDuration(fileInfo.duration)}
            </div>
          )}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev}
          className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
          ← 이전
        </button>

        {!hasResult && crop.mode !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '📐 크롭 실행'}
          </button>
        ) : (
          <button type="button" onClick={onNext}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
            다음 단계 →
          </button>
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
