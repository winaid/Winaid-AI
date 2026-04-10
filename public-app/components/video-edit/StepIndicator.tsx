'use client';

import { useEffect, useRef } from 'react';
import { STEP_LABELS, isStepDone, isStepSkipped, type PipelineState } from './types';

interface Props {
  state: PipelineState;
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ state, onStepClick }: Props) {
  const current = state.currentStep;
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // 현재 step이 가로 스크롤 안에서 중앙에 오도록 자동 스크롤 (주로 모바일에서 유용)
  useEffect(() => {
    const el = currentRef.current;
    const container = containerRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const conRect = container.getBoundingClientRect();
    if (elRect.left < conRect.left || elRect.right > conRect.right) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [current]);

  return (
    <div ref={containerRef} className="flex items-center gap-0.5 overflow-x-auto py-2 px-1 -mx-1 scrollbar-none">
      {STEP_LABELS.map((label, idx) => {
        const isCurrent = current === idx;
        const done = isStepDone(state, idx);
        const skipped = isStepSkipped(state, idx);
        const isFuture = idx > current && !done && !skipped;
        const canClick = onStepClick && (done || skipped || idx <= current);

        return (
          <div key={idx} className="flex items-center gap-0.5 flex-shrink-0">
            {idx > 0 && (
              <div className={`w-3 h-0.5 ${done || skipped || isCurrent ? 'bg-blue-300' : 'bg-slate-200'}`} />
            )}

            <button
              ref={isCurrent ? currentRef : undefined}
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
