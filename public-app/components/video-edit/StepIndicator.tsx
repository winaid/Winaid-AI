'use client';

import { STEP_LABELS, isStepDone, isStepSkipped, type PipelineState } from './types';

interface Props {
  state: PipelineState;
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ state, onStepClick }: Props) {
  const current = state.currentStep;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto py-2 px-1 -mx-1 scrollbar-none">
      {STEP_LABELS.map((label, idx) => {
        const isCurrent = current === idx;
        const done = isStepDone(state, idx);
        const skipped = isStepSkipped(state, idx);
        const isFuture = idx > current && !done && !skipped;
        const canClick = onStepClick && (done || skipped || idx <= current);

        // 모바일 축약: 현재 ±2 범위만 보이고, 나머지는 축약 dot
        const dist = Math.abs(idx - current);
        const isNearby = dist <= 2 || idx === 0 || idx === STEP_LABELS.length - 1;
        const isEllipsis = !isNearby && (idx === current - 3 || idx === current + 3);

        // 축약 dot
        if (!isNearby && !isEllipsis) {
          return null; // 완전히 숨김
        }

        if (isEllipsis) {
          return (
            <div key={idx} className="flex items-center gap-0.5 flex-shrink-0">
              <div className="w-3 h-0.5 bg-slate-200" />
              <span className="text-[9px] text-slate-300 px-0.5">···</span>
            </div>
          );
        }

        return (
          <div key={idx} className="flex items-center gap-0.5 flex-shrink-0">
            {idx > 0 && isNearby && (
              <div className={`w-3 h-0.5 ${done || skipped || isCurrent ? 'bg-blue-300' : 'bg-slate-200'}`} />
            )}

            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick?.(idx)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${
                isCurrent
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                  : done
                  ? 'text-emerald-600 hover:bg-emerald-50 cursor-pointer'
                  : skipped
                  ? 'text-slate-400 line-through'
                  : isFuture
                  ? 'text-slate-400'
                  : 'text-slate-500 hover:bg-slate-100 cursor-pointer'
              } ${!canClick ? 'cursor-default' : ''}`}
            >
              <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[8px] font-black ${
                isCurrent ? 'bg-blue-600 text-white'
                : done ? 'bg-emerald-500 text-white'
                : skipped ? 'bg-slate-300 text-white'
                : 'bg-slate-200 text-slate-500'
              }`}>
                {done && !isCurrent ? '✓' : idx === STEP_LABELS.length - 1 ? '🎬' : idx}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
