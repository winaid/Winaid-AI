'use client';

import type { PipelineState, StepSilenceState, SilenceIntensity } from './types';
import VideoPlayer from './VideoPlayer';
import WaveformBar from './WaveformBar';
import { useInputBlobUrl } from '../../hooks/usePipelineInput';

// 강도별 무음 임계값 — 사용자가 강도를 바꿀 때 파형의 빨간 영역도 미리 변함
const SILENCE_THRESHOLD_BY_INTENSITY: Record<SilenceIntensity, number> = {
  soft: 0.04,
  normal: 0.03,
  tight: 0.02,
  skip: 0.03,
};

const INTENSITY_OPTIONS: { id: SilenceIntensity; label: string; desc: string }[] = [
  { id: 'soft', label: '부드럽게', desc: '자연스러운 호흡 유지' },
  { id: 'normal', label: '보통', desc: '적절한 무음 제거' },
  { id: 'tight', label: '빡빡하게', desc: '최대한 잘라내기' },
  { id: 'skip', label: '스킵', desc: '이 단계 건너뛰기' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepSilenceState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepSilence({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step3_silence: silence } = state;
  const hasResult = !!silence.resultBlobUrl || silence.intensity === 'skip' || !silence.enabled;
  // 처리 전 원본 파형용 — step3 입력은 step1(crop) → step2(style) 결과 또는 원본
  const inputBlobUrl = useInputBlobUrl(state, 3);

  return (
    <div className="space-y-6">
      {/* 결과 표시 */}
      {hasResult && silence.resultBlobUrl && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 무음 제거 완료
            </div>
          </div>

          {/* 미리보기 */}
          <VideoPlayer src={silence.resultBlobUrl} compact />

          {/* 결과 파형 (초록) */}
          <div>
            <p className="text-[10px] text-slate-500 mb-1">결과 파형 — 무음이 제거되어 빨간 구간이 거의 없음</p>
            <WaveformBar
              src={silence.resultBlobUrl}
              height={48}
              color="#10B981"
              silenceColor="#FCA5A5"
            />
          </div>

          {/* 통계 */}
          {silence.originalDuration !== undefined && silence.resultDuration !== undefined && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-500 mb-0.5">원본</div>
                <div className="text-sm font-bold text-slate-800">{formatDuration(silence.originalDuration)}</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-blue-600 mb-0.5">결과</div>
                <div className="text-sm font-bold text-blue-700">{formatDuration(silence.resultDuration)}</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-emerald-600 mb-0.5">단축</div>
                <div className="text-sm font-bold text-emerald-700">
                  -{Math.round(silence.removedPercent || 0)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 스킵 상태 */}
      {silence.intensity === 'skip' && !silence.resultBlobUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">이 단계를 건너뛰었습니다.</div>
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-3">
          {/* 원본 파형 — 강도에 따라 빨간 영역(무음 후보) 미리보기 */}
          {inputBlobUrl && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-slate-500">원본 파형</p>
                <p className="text-[10px] text-red-500">빨간색 = 잘릴 무음 구간</p>
              </div>
              <WaveformBar
                src={inputBlobUrl}
                silenceThreshold={SILENCE_THRESHOLD_BY_INTENSITY[silence.intensity]}
                height={56}
                color="#3B82F6"
                silenceColor="#FCA5A5"
              />
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-500">편집 강도</label>
          <div className="grid grid-cols-2 gap-3">
            {INTENSITY_OPTIONS.map(opt => (
              <button key={opt.id} type="button" onClick={() => onUpdate({ intensity: opt.id })}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${silence.intensity === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                <div className={`text-sm font-bold ${silence.intensity === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                  {opt.id === 'skip' ? '⏭ ' : ''}{opt.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev}
          className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
          ← 이전
        </button>

        {!hasResult && silence.intensity !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '✂️ 무음 제거 실행'}
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
