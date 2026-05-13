'use client';

import { useState } from 'react';
import { deriveToneRecommendation, hasToneRecommendation } from '../../lib/diagnostic/categoryToneAdapter';
import { buildFunnelUrl } from '../../lib/diagnostic/contentFunnel';

interface ToneRecommendationCardsProps {
  category: string | undefined | null;
}

/**
 * 카테고리 톤 추천 3-카드 row — 블로그 본문 톤 / 보도자료 톤 / CTA 힌트.
 * 각 카드에 funnel 액션 버튼:
 *   - 블로그 → /blog?category=...&source=diagnostic
 *   - 보도자료 → /press?category=...&source=diagnostic
 *   - CTA → 클립보드 복사 (행선지 페이지 없음, in-place 액션)
 *
 * 미감지 카테고리 → 컴포넌트 전체 미렌더 (null 반환).
 */
export default function ToneRecommendationCards({ category }: ToneRecommendationCardsProps) {
  const rec = deriveToneRecommendation(category);
  const [copied, setCopied] = useState(false);

  if (!hasToneRecommendation(rec)) return null;

  async function copyCtaHint(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  const cat = category ?? undefined;

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
            action={
              <a
                href={buildFunnelUrl('blog', { category: cat, source: 'diagnostic' })}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline"
              >
                이 톤으로 블로그 만들기 →
              </a>
            }
          />
        )}
        {rec.pressTone && (
          <ToneCard
            emoji="📰"
            label="보도자료 톤"
            body={rec.pressTone}
            accent="bg-violet-50 border-violet-100 text-violet-900"
            action={
              <a
                href={buildFunnelUrl('press', { category: cat, source: 'diagnostic' })}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900 hover:underline"
              >
                이 톤으로 보도자료 만들기 →
              </a>
            }
          />
        )}
        {rec.ctaHint && (
          <ToneCard
            emoji="📣"
            label="추천 CTA 한 줄"
            body={rec.ctaHint}
            accent="bg-emerald-50 border-emerald-100 text-emerald-900"
            action={
              <button
                type="button"
                onClick={() => copyCtaHint(rec.ctaHint!)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline bg-transparent border-0 p-0 cursor-pointer"
              >
                {copied ? '✅ 복사됨!' : '📋 클립보드에 복사'}
              </button>
            }
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
  action,
}: {
  emoji: string;
  label: string;
  body: string;
  accent: string;
  action: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 ${accent}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">
        {emoji} {label}
      </div>
      <p className="text-[12px] leading-relaxed flex-1">{body}</p>
      <div className="mt-1">{action}</div>
    </div>
  );
}
