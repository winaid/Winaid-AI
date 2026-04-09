'use client';

import type { PipelineState, StepSilenceState, SilenceIntensity } from './types';

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
