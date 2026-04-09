'use client';

import { type PipelineState, STEP_LABELS, isStepDone, isStepSkipped } from './types';

interface AutoStepStatus {
  step: number;
  status: 'done' | 'processing' | 'pending' | 'error' | 'skipped';
  detail?: string;
  error?: string;
}

interface Props {
  state: PipelineState;
  stepStatuses: AutoStepStatus[];
  onCancel: () => void;
}

export default function PipelineProgress({ state, stepStatuses, onCancel }: Props) {
  const totalSteps = 6;
  const doneCount = stepStatuses.filter(s => s.status === 'done' || s.status === 'skipped').length;
  const progressPct = Math.max(3, (doneCount / totalSteps) * 100);
  const currentStep = stepStatuses.find(s => s.status === 'processing');

  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl space-y-4">
      {/* 타이틀 + 프로그레스 바 */}
      <div className="text-center space-y-2">
        <div className="text-sm font-black text-blue-800">
          ⚡ 쇼츠 자동 생성 중...
        </div>
        <div className="w-full bg-blue-200 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="text-xs text-blue-600 font-bold">{doneCount}/{totalSteps}</div>
      </div>

      {/* 단계별 상태 */}
      <div className="space-y-1.5">
        {stepStatuses.map(s => (
          <div key={s.step} className="flex items-center gap-2.5 px-2 py-1 rounded-lg">
            {/* 상태 아이콘 */}
            <span className="text-sm w-5 text-center flex-shrink-0">
              {s.status === 'done' ? '✅' :
               s.status === 'processing' ? (
                 <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
               ) :
               s.status === 'error' ? '❌' :
               s.status === 'skipped' ? '⏭️' :
               '⬜'}
            </span>

            {/* 라벨 */}
            <span className={`text-xs font-bold flex-1 ${
              s.status === 'processing' ? 'text-blue-700' :
              s.status === 'done' ? 'text-emerald-700' :
              s.status === 'error' ? 'text-red-600' :
              s.status === 'skipped' ? 'text-slate-400' :
              'text-slate-400'
            }`}>
              {STEP_LABELS[s.step]}
            </span>

            {/* 상세 */}
            {s.detail && (
              <span className="text-[10px] text-slate-500">{s.detail}</span>
            )}
            {s.error && (
              <span className="text-[10px] text-red-500">{s.error}</span>
            )}
          </div>
        ))}
      </div>

      {/* 현재 처리 메시지 */}
      {currentStep && (
        <div className="text-center text-xs text-blue-600 font-medium">
          {state.autoProgress || `${STEP_LABELS[currentStep.step]} 처리 중...`}
        </div>
      )}

      {/* 취소 */}
      <div className="text-center">
        <button type="button" onClick={onCancel}
          className="px-5 py-2 text-xs font-bold text-slate-500 bg-white/80 rounded-lg hover:bg-white transition-all">
          취소
        </button>
      </div>
    </div>
  );
}

export type { AutoStepStatus };
