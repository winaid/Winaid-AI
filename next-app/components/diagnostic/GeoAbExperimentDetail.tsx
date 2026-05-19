'use client';

/**
 * GeoAbExperimentDetail — GEO-13 실험 상세 + variant 비교.
 *
 * analyzeResult 응답을 시각화: variant 별 citation_rate + winner + notes.
 */

import type { AbAnalysisResult } from '@winaid/blog-core';

interface Props {
  analysis: AbAnalysisResult;
  onClose: () => void;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const CONFIDENCE_LABELS: Record<string, { label: string; cls: string }> = {
  high: { label: 'high (확신)', cls: 'bg-emerald-100 text-emerald-700' },
  medium: { label: 'medium (보통)', cls: 'bg-amber-100 text-amber-700' },
  low: { label: 'low (낮음)', cls: 'bg-slate-100 text-slate-600' },
};

export default function GeoAbExperimentDetail({ analysis, onClose }: Props) {
  const { experiment, variants, winner, notes } = analysis;

  // 최대 combined_rate 산출 (winner bar 강조용)
  const maxRate = Math.max(
    ...variants.map((v) => (v.metric_summary.chatgpt_citation_rate + v.metric_summary.gemini_citation_rate) / 2),
    0.001,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="text-base font-bold text-slate-800">{experiment.topic}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {experiment.hospital_name} · {experiment.status} · {new Date(experiment.created_at).toLocaleDateString('ko-KR')}
              {experiment.hypothesis_dimension && ` · 차원: ${experiment.hypothesis_dimension}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {experiment.hypothesis && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
              <p className="text-[10px] font-medium text-indigo-700 uppercase mb-0.5">가설</p>
              <p className="text-xs text-indigo-900">{experiment.hypothesis}</p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-slate-700 mb-2">Variant 비교</h4>
            <div className="space-y-3">
              {variants.map((v) => {
                const cg = v.metric_summary.chatgpt_citation_rate;
                const gm = v.metric_summary.gemini_citation_rate;
                const combined = (cg + gm) / 2;
                const widthPct = (combined / maxRate) * 100;
                const isWinner = winner?.variant_id === v.variant_id;

                return (
                  <div
                    key={v.variant_id}
                    className={`border rounded-md p-3 ${isWinner ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">Variant {v.variant_name}</span>
                        {isWinner && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-medium">WINNER</span>}
                      </div>
                      <span className="text-[11px] text-slate-500">samples: {v.metric_summary.total_samples}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div>
                        <p className="text-[10px] text-slate-500">ChatGPT 인용률</p>
                        <p className="text-sm font-semibold text-slate-800">{formatPct(cg)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Gemini 인용률</p>
                        <p className="text-sm font-semibold text-slate-800">{formatPct(gm)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">네이버 평균 순위</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {v.metric_summary.avg_naver_rank != null ? v.metric_summary.avg_naver_rank.toFixed(1) : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        className={`h-2 rounded ${isWinner ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">combined: {formatPct(combined)}</p>

                    <details className="mt-2">
                      <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">format_config</summary>
                      <pre className="text-[10px] text-slate-600 bg-slate-50 rounded p-2 mt-1 overflow-x-auto">
{JSON.stringify(v.format_config, null, 2)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>

          {winner && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-emerald-800">Winner: Variant {variants.find((v) => v.variant_id === winner.variant_id)?.variant_name ?? '—'}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_LABELS[winner.confidence]?.cls ?? ''}`}>
                  {CONFIDENCE_LABELS[winner.confidence]?.label ?? winner.confidence}
                </span>
              </div>
              <p className="text-[11px] text-emerald-900">{winner.reason}</p>
            </div>
          )}

          {notes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <p className="text-[10px] font-medium text-amber-700 uppercase mb-1">Notes</p>
              <ul className="text-xs text-amber-900 space-y-0.5 list-disc list-inside">
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          {experiment.queries && experiment.queries.length > 0 && (
            <details>
              <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-800 font-medium">측정 쿼리 ({experiment.queries.length})</summary>
              <ul className="text-[11px] text-slate-600 mt-1 ml-3 space-y-0.5">
                {experiment.queries.map((q, i) => <li key={i}>· {q}</li>)}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
