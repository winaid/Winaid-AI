'use client';

/**
 * GeoAbExperimentsSection — A/B 테스트 인프라 (GEO-13 — 14 기능 13번).
 *
 * 동일 주제·다른 콘텐츠 형식 variant 들을 운영하면서 4주간 AI 인용률 차이를
 * 측정·비교. 결과는 GEO-3 (룰북) 데이터 소스.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면에 통합 (어드민 도구).
 * next-app only — public-app 미접촉 (geo_ab_experiments 정책).
 *
 * 흐름:
 *   STEP 1: 실험 list (carousel) + "새 실험 만들기" 버튼
 *   STEP 2: 실험 클릭 → DetailModal — variant 비교 + winner + notes
 *   STEP 3: "새 실험 만들기" → Wizard — topic + variants 2~4 + queries
 */

import { useCallback, useEffect, useState } from 'react';
import type { AbExperimentRow, AbAnalysisResult } from '@winaid/blog-core';
import GeoAbExperimentWizard from './GeoAbExperimentWizard';
import GeoAbExperimentDetail from './GeoAbExperimentDetail';

export interface GeoAbExperimentsSectionProps {
  diagnosticUrl: string;
  hospitalName: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  running: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-rose-100 text-rose-600',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '대기',
  running: '진행 중',
  completed: '완료',
  cancelled: '취소',
};

export default function GeoAbExperimentsSection({ diagnosticUrl, hospitalName }: GeoAbExperimentsSectionProps) {
  const [rows, setRows] = useState<AbExperimentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [openDetail, setOpenDetail] = useState<AbAnalysisResult | null>(null);

  const loadExperiments = useCallback(async () => {
    if (!hospitalName) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ hospital_name: hospitalName, limit: '30' });
      const res = await fetch(`/api/geo/ab/list?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { rows?: AbExperimentRow[] };
      setRows(j.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => {
    void loadExperiments();
  }, [loadExperiments]);

  const handleOpenDetail = useCallback(async (exp: AbExperimentRow) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/geo/ab/${encodeURIComponent(exp.id)}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as AbAnalysisResult;
      setOpenDetail(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">A/B 콘텐츠 실험 (GEO-13)</h3>
          <p className="text-xs text-slate-500 mt-1">
            동일 주제·다른 형식의 variant 를 운영하며 AI 인용률 차이를 측정합니다. (어드민 전용)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
        >
          + 새 실험
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-3">{error}</p>
      )}

      {loading && rows.length === 0 && (
        <p className="text-xs text-slate-400">불러오는 중…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-xs text-slate-400 py-6 text-center">실험이 없습니다. 새 실험을 만들어보세요.</p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="border border-slate-200 rounded-md px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
              onClick={() => void handleOpenDetail(r)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{r.topic}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {r.hypothesis_dimension && `· ${r.hypothesis_dimension}`}
                  {r.queries?.length ? ` · ${r.queries.length} queries` : ''}
                  {r.created_at && ` · ${new Date(r.created_at).toLocaleDateString('ko-KR')}`}
                </p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showWizard && (
        <GeoAbExperimentWizard
          hospitalName={hospitalName}
          diagnosticUrl={diagnosticUrl}
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
            void loadExperiments();
          }}
        />
      )}

      {openDetail && (
        <GeoAbExperimentDetail
          analysis={openDetail}
          onClose={() => setOpenDetail(null)}
        />
      )}
    </section>
  );
}
