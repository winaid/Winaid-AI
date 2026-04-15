'use client';

import type { AIVisibility } from '../../lib/diagnostic/types';

interface AIVisibilityCardProps {
  visibility: AIVisibility;
}

const LIKELIHOOD_META: Record<AIVisibility['likelihood'], { label: string; color: string; emoji: string }> = {
  high: { label: '높음', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', emoji: '🟢' },
  medium: { label: '보통', color: 'bg-amber-50 text-amber-700 border-amber-200', emoji: '🟡' },
  low: { label: '낮음', color: 'bg-red-50 text-red-700 border-red-200', emoji: '🔴' },
};

const PLATFORM_META: Record<AIVisibility['platform'], { emoji: string }> = {
  ChatGPT: { emoji: '💬' },
  Gemini: { emoji: '✨' },
  Perplexity: { emoji: '🔎' },
  Copilot: { emoji: '🧭' },
};

export default function AIVisibilityCard({ visibility }: AIVisibilityCardProps) {
  const meta = LIKELIHOOD_META[visibility.likelihood];
  const pm = PLATFORM_META[visibility.platform];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">{pm.emoji}</span>
          <h3 className="text-base font-bold text-slate-800">{visibility.platform}</h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-bold border ${meta.color}`}
          aria-label={`노출 가능성 ${meta.label}`}
        >
          {meta.emoji} {meta.label}
        </span>
      </div>
      <p className="mt-3 text-[13px] text-slate-600 leading-relaxed">{visibility.reason}</p>
    </div>
  );
}
