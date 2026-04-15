'use client';

import type { ActionItem } from '../../lib/diagnostic/types';

interface ActionPlanProps {
  actions: ActionItem[];
}

const IMPACT_CLS: Record<ActionItem['impact'], string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};
const IMPACT_LABEL: Record<ActionItem['impact'], string> = { high: '영향 큼', medium: '영향 중', low: '영향 낮음' };

const DIFF_CLS: Record<ActionItem['difficulty'], string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard: 'bg-red-50 text-red-700 border-red-200',
};
const DIFF_LABEL: Record<ActionItem['difficulty'], string> = { easy: '쉬움', medium: '보통', hard: '어려움' };

const TIME_CLS = 'bg-blue-50 text-blue-700 border-blue-200';

export default function ActionPlan({ actions }: ActionPlanProps) {
  if (actions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        즉시 조치가 필요한 항목이 없습니다. 전 항목 통과.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <h3 className="text-sm font-bold text-slate-700">
          우선 조치 목록 · 상위 {actions.length}개
        </h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          가중치 높은 카테고리 · 배점 큰 항목 · 쉬운 난이도 순으로 정렬되었습니다.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {actions.map((a, idx) => (
          <li key={idx} className="px-5 py-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-start gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-relaxed">{a.action}</p>
                <p className="text-[11px] text-slate-400 mt-1">분류: {a.category}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${IMPACT_CLS[a.impact]}`}>
                    {IMPACT_LABEL[a.impact]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${DIFF_CLS[a.difficulty]}`}>
                    난이도 {DIFF_LABEL[a.difficulty]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TIME_CLS}`}>
                    {a.timeframe}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
