'use client';

import type { AIVisibilityKPI, StrongestKey } from '../../lib/diagnostic/aiVisibilityKPI';

interface AIVisibilityKPICardsProps {
  kpi: AIVisibilityKPI;
}

/**
 * ChatGPT / Gemini 모델별 점수 + Avg Position 카드 row.
 * 실측 우선, 휴리스틱 fallback (deriveAIVisibilityKPI 에서 처리).
 */
export default function AIVisibilityKPICards({ kpi }: AIVisibilityKPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <ModelCard
        label="ChatGPT"
        emoji="🤖"
        score={kpi.chatGPT.score}
        position={kpi.chatGPT.position}
        badge={badgeFor('chatGPT', kpi.strongest, kpi.weakest)}
      />
      <ModelCard
        label="Gemini"
        emoji="✨"
        score={kpi.gemini.score}
        position={kpi.gemini.position}
        badge={badgeFor('gemini', kpi.strongest, kpi.weakest)}
      />
      <AvgPositionCard avgPosition={kpi.avgPosition} />
    </div>
  );
}

function ModelCard({
  label,
  emoji,
  score,
  position,
  badge,
}: {
  label: string;
  emoji: string;
  score: number | null;
  position: number | null;
  badge: { text: string; cls: string } | null;
}) {
  const measured = score !== null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
          {emoji} {label}
        </span>
        {badge && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {measured ? (
          <>
            <span className={`text-3xl font-black ${scoreColor(score!)}`}>{score}</span>
            <span className="text-[11px] text-slate-400">/ 100</span>
          </>
        ) : (
          <span className="text-sm text-slate-400">측정 미완료</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {measured && position !== null ? `응답 순위 #${position}` : measured ? '예측 점수' : '실측하기로 측정'}
      </p>
    </div>
  );
}

function AvgPositionCard({ avgPosition }: { avgPosition: number | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
          📍 Avg Position
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {avgPosition !== null ? (
          <>
            <span className="text-3xl font-black text-slate-700">#{avgPosition}</span>
          </>
        ) : (
          <span className="text-sm text-slate-400">측정 미완료</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {avgPosition !== null ? 'AI 응답 평균 순위' : '실측 데이터 필요'}
      </p>
    </div>
  );
}

function badgeFor(
  key: 'chatGPT' | 'gemini',
  strongest: StrongestKey,
  weakest: StrongestKey,
): { text: string; cls: string } | null {
  if (strongest === null) return null;
  if (strongest === 'equal') {
    return { text: '균등', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  }
  if (strongest === key) {
    return { text: '강한 모델', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (weakest === key) {
    return { text: '약한 모델', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  return null;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-700';
  if (score >= 50) return 'text-amber-700';
  return 'text-red-700';
}
