'use client';

import { deriveToneRecommendation, hasToneRecommendation } from '../../lib/diagnostic/categoryToneAdapter';

interface ToneRecommendationCardsProps {
  category: string | undefined | null;
}

/**
 * 카테고리 톤 추천 3-카드 row — 블로그 본문 톤 / 보도자료 톤 / CTA 힌트.
 *
 * 미감지 카테고리 (혹은 quartet 미등록) → 컴포넌트 전체 미렌더 (null 반환).
 * 단일 source: categoryToneAdapter.ts → @winaid/blog-core quartet record.
 */
export default function ToneRecommendationCards({ category }: ToneRecommendationCardsProps) {
  const rec = deriveToneRecommendation(category);
  if (!hasToneRecommendation(rec)) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold text-slate-700">
          🎨 {category} 콘텐츠 톤 가이드
        </h3>
        <span className="text-[10px] text-slate-400">진단된 카테고리 기반</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rec.blogTone && (
          <ToneCard
            emoji="🖊"
            label="블로그 본문 톤"
            body={rec.blogTone}
            accent="bg-indigo-50 border-indigo-100 text-indigo-900"
          />
        )}
        {rec.pressTone && (
          <ToneCard
            emoji="📰"
            label="보도자료 톤"
            body={rec.pressTone}
            accent="bg-violet-50 border-violet-100 text-violet-900"
          />
        )}
        {rec.ctaHint && (
          <ToneCard
            emoji="📣"
            label="추천 CTA 한 줄"
            body={rec.ctaHint}
            accent="bg-emerald-50 border-emerald-100 text-emerald-900"
          />
        )}
      </div>
    </div>
  );
}

function ToneCard({
  emoji,
  label,
  body,
  accent,
}: {
  emoji: string;
  label: string;
  body: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${accent}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1.5">
        {emoji} {label}
      </div>
      <p className="text-[12px] leading-relaxed">{body}</p>
    </div>
  );
}
