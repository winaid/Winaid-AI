'use client';

import type { AIVisibility, CompetitorFinding } from '../../lib/diagnostic/types';

interface AIVisibilityCardProps {
  visibility: AIVisibility;
  /** C-a-1 실측 결과 (해당 플랫폼). 없으면 실측 섹션 숨김. */
  finding?: CompetitorFinding;
  /** 본인 병원명 (selfIncluded 배지에 사용). */
  siteName?: string;
}

const LIKELIHOOD_META: Record<AIVisibility['likelihood'], { label: string; color: string; emoji: string }> = {
  high: { label: '높음', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', emoji: '🟢' },
  medium: { label: '보통', color: 'bg-amber-50 text-amber-700 border-amber-200', emoji: '🟡' },
  low: { label: '낮음', color: 'bg-red-50 text-red-700 border-red-200', emoji: '🔴' },
};

const PLATFORM_META: Record<AIVisibility['platform'], { emoji: string }> = {
  ChatGPT: { emoji: '💬' },
  Gemini: { emoji: '✨' },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm} 기준`;
  } catch { return ''; }
}

export default function AIVisibilityCard({ visibility, finding, siteName }: AIVisibilityCardProps) {
  const meta = LIKELIHOOD_META[visibility.likelihood];
  const pm = PLATFORM_META[visibility.platform];
  const hasAnswer = !!finding && finding.answerText.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[220px] overflow-hidden">
      {/* ── 기존: 예측 + reason ── */}
      <div className="p-5">
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
        <p className="mt-3 text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">{visibility.reason}</p>
      </div>

      {/* ── 실측 결과: AI 자연어 답변 원문 ── */}
      {hasAnswer && finding && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[12px] font-bold text-slate-700">
              🔍 &ldquo;{finding.queryUsed}&rdquo; 실제 검색 결과
            </p>
            {finding.timestamp && (
              <span className="text-[10px] text-slate-400 flex-none">{formatTimestamp(finding.timestamp)}</span>
            )}
          </div>

          {/* AI 자연어 답변 원문 그대로 노출 */}
          <div
            className="text-[14px] leading-[1.8] text-slate-700 whitespace-pre-line bg-white rounded-lg p-4 border border-slate-200"
          >
            {finding.answerText}
          </div>

          {/* 본인 포함 배지 — 답변 본문에서 추출한 URL 매칭 결과 */}
          <div className="mt-3">
            {finding.selfIncluded ? (
              <div className="rounded-lg px-3 py-2 text-sm font-medium bg-green-50 text-green-800 border border-green-200">
                ✅ {siteName || '본인 사이트'} URL 이 답변에 포함되어 있습니다
                {finding.selfRank ? ` (${finding.selfRank}번째 언급)` : ''}
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2 text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200">
                ⚠️ {siteName || '본인 사이트'} URL 이 답변에 포함되어 있지 않습니다
              </div>
            )}
          </div>

          <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
            위 답변은 {visibility.platform} 가 사용자 질문에 직접 응답한 내용입니다. 검색 시점·쿼리에 따라 달라질 수 있습니다.
          </p>
        </div>
      )}

      {/* 실측 호출 자체가 실패한 경우 — 플랫폼별 안내 */}
      {finding && !hasAnswer && finding.rawError && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <p className="text-[12px] text-slate-600 leading-relaxed">
            {finding.platform === 'ChatGPT'
              ? '🔍 ChatGPT 는 한국 지역 검색에서 결과를 찾지 못하는 경우가 있습니다. Gemini 결과를 함께 참고해 주세요.'
              : '🔍 이번엔 실측 답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.'}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">내부 사유: {finding.rawError}</p>
        </div>
      )}
    </div>
  );
}
