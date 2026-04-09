'use client';

import { STEP_LABELS, isStepDone, isStepSkipped, type PipelineState } from './types';

interface Props {
  state: PipelineState;
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ state, onStepClick }: Props) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2 px-1 -mx-1">
      {STEP_LABELS.map((label, idx) => {
        const isCurrent = state.currentStep === idx;
        const done = isStepDone(state, idx);
        const skipped = isStepSkipped(state, idx);
        const isFuture = idx > state.currentStep && !done && !skipped;

        const canClick = onStepClick && (done || skipped || idx <= state.currentStep);

        return (
          <div key={idx} className="flex items-center gap-1 flex-shrink-0">
            {/* 커넥터 라인 */}
            {idx > 0 && (
              <div className={`w-4 h-0.5 ${done || skipped || isCurrent ? 'bg-blue-300' : 'bg-slate-200'}`} />
            )}

            {/* 스텝 아이콘 + 라벨 */}
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick?.(idx)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                isCurrent
                  ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300'
                  : done
                  ? 'text-emerald-600 hover:bg-emerald-50 cursor-pointer'
                  : skipped
                  ? 'text-slate-400 line-through'
                  : isFuture
                  ? 'text-slate-400'
                  : 'text-slate-500 hover:bg-slate-100 cursor-pointer'
              } ${!canClick ? 'cursor-default' : ''}`}
            >
              {/* 원/체크 */}
              <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black ${
                isCurrent
                  ? 'bg-blue-600 text-white'
                  : done
                  ? 'bg-emerald-500 text-white'
                  : skipped
                  ? 'bg-slate-300 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {done && !isCurrent ? '✓' : idx === STEP_LABELS.length - 1 ? '🎬' : idx + 1}
              </span>

              <span className="hidden sm:inline">{label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
