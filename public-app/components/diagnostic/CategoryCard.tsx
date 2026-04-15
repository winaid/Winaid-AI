'use client';

import type { CategoryScore, CategoryItemStatus } from '../../lib/diagnostic/types';
import ScoreRing from './ScoreRing';

interface CategoryCardProps {
  category: CategoryScore;
}

const STATUS_META: Record<CategoryItemStatus, { icon: string; color: string; label: string }> = {
  pass: { icon: '✓', color: 'text-emerald-600 bg-emerald-50', label: '통과' },
  fail: { icon: '✗', color: 'text-red-600 bg-red-50', label: '미흡' },
  warning: { icon: '!', color: 'text-amber-600 bg-amber-50', label: '주의' },
  unknown: { icon: '?', color: 'text-slate-500 bg-slate-100', label: '측정 불가' },
};

export default function CategoryCard({ category }: CategoryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-800">{category.name}</h3>
          <p className="mt-1 text-[11px] text-slate-400">
            전체 가중치 {category.weight}% · 항목 {category.items.length}개
          </p>
        </div>
        <ScoreRing score={category.score} size={72} />
      </div>

      <ul className="mt-4 space-y-2.5">
        {category.items.map((it, idx) => {
          const meta = STATUS_META[it.status];
          return (
            <li key={idx} className="flex items-start gap-2.5">
              <span
                className={`flex-none w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${meta.color}`}
                aria-label={meta.label}
              >
                {meta.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">{it.label}</span>
                  <span className="text-[10px] text-slate-400 flex-none">
                    {it.earnedPoints}/{it.maxPoints}
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 leading-relaxed">{it.detail}</p>
                {it.rawValue && (
                  <p className="text-[11px] text-slate-400 mt-0.5">감지된 값: {it.rawValue}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {category.recommendations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            권장 조치
          </p>
          <ul className="space-y-1.5">
            {category.recommendations.map((r, idx) => (
              <li key={idx} className="text-[12px] text-slate-600 leading-relaxed flex gap-2">
                <span className="text-blue-500 flex-none">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
