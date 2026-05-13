'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { authFetch } from '../../lib/authFetch';
import {
  applyHistoryFilter,
  parseFilter,
  serializeFilter,
  DEFAULT_FILTER,
  PERIOD_LABEL,
  SCORE_LABEL,
  SORT_LABEL,
  type DiagnosticHistoryRow,
  type HistoryFilterState,
  type PeriodFilter,
  type ScoreFilter,
  type SortKey,
} from '../../lib/diagnostic/historyFilter';

/**
 * 진단 히스토리 섹션 — /mypage 진단 탭에서 사용.
 *
 * - 데이터: GET /api/diagnostic/user-history (한 번 fetch, 클라이언트 필터)
 * - URL state: ?q=&score=&period=&sort= (빈 값은 직렬화 안 함)
 * - 검색/필터/정렬은 lib/diagnostic/historyFilter 의 순수 함수 호출
 */
export default function DiagnosticHistorySection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<DiagnosticHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const filter: HistoryFilterState = useMemo(() => {
    const sp = new URLSearchParams(searchParams.toString());
    return parseFilter(sp);
  }, [searchParams]);

  const updateFilter = useCallback(
    (patch: Partial<HistoryFilterState>) => {
      const next = { ...filter, ...patch };
      const sp = serializeFilter(next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filter, pathname, router],
  );

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    authFetch('/api/diagnostic/user-history')
      .then(async (res) => {
        if (res.status === 401) {
          if (!aborted) {
            setUnauthorized(true);
            setRows([]);
          }
          return;
        }
        const data = (await res.json()) as { history?: DiagnosticHistoryRow[] };
        if (!aborted) setRows(data.history || []);
      })
      .catch((e: unknown) => {
        if (!aborted) setError(e instanceof Error ? e.message : '진단 히스토리를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, []);

  const filtered = useMemo(() => applyHistoryFilter(rows, filter), [rows, filter]);
  const isFiltered =
    filter.q !== '' || filter.score !== 'all' || filter.period !== 'all' || filter.sort !== 'recent';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="text-center py-16">
        <div className="text-3xl mb-3">🔒</div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">로그인이 필요합니다</h3>
        <p className="text-sm text-slate-400">진단 히스토리는 로그인 후 이용하실 수 있습니다.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">진단 히스토리</h2>
        <span className="text-xs text-slate-400">
          {isFiltered ? `${filtered.length}건 (전체 ${rows.length}건 중)` : `${rows.length}건`}
        </span>
      </div>

      {/* 검색·필터·정렬 컨트롤 */}
      <div className="space-y-2">
        <input
          type="search"
          value={filter.q}
          onChange={(e) => updateFilter({ q: e.target.value })}
          placeholder="URL 또는 사이트명 검색..."
          aria-label="진단 히스토리 검색"
          maxLength={200}
          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        />
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            점수
            <select
              value={filter.score}
              onChange={(e) => updateFilter({ score: e.target.value as ScoreFilter })}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
            >
              {(Object.entries(SCORE_LABEL) as [ScoreFilter, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            기간
            <select
              value={filter.period}
              onChange={(e) => updateFilter({ period: e.target.value as PeriodFilter })}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
            >
              {(Object.entries(PERIOD_LABEL) as [PeriodFilter, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            정렬
            <select
              value={filter.sort}
              onChange={(e) => updateFilter({ sort: e.target.value as SortKey })}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
            >
              {(Object.entries(SORT_LABEL) as [SortKey, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          {isFiltered && (
            <button
              type="button"
              onClick={reset}
              className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold"
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* 결과 */}
      {rows.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-3xl mb-3">🔍</div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">아직 진단 이력이 없습니다</h3>
          <p className="text-sm text-slate-400">진단 페이지에서 첫 분석을 시작해보세요.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-3xl mb-3">🪄</div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">조건에 맞는 진단이 없습니다</h3>
          <p className="text-sm text-slate-400 mb-3">검색어나 필터를 조정해보세요.</p>
          <button
            type="button"
            onClick={reset}
            className="text-xs px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all p-4"
            >
              <div className="flex items-start gap-4">
                <div className={`flex-none w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black ${scoreBadgeCls(row.overallScore)}`}>
                  {row.overallScore}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 truncate">{row.siteName || row.url}</h3>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{row.url}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {new Date(row.analyzedAt).toLocaleString('ko-KR', {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function scoreBadgeCls(score: number): string {
  if (score >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (score >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-red-50 text-red-700 border border-red-200';
}
