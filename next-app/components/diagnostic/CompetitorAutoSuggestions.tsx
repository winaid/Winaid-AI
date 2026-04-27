'use client';

import { useState } from 'react';
import { isBlockedDomain } from '../../lib/diagnostic/discovery';

export interface AutoSuggestionResult {
  url: string;
  title: string;
  domain: string;
  rank: number;
}

interface Props {
  ownDomain: string;
  topResults: AutoSuggestionResult[];
  /** 클릭된 URL 로 GAP 분석 시작. 부모는 await 로 완료 시점까지 대기. */
  onSelect: (competitorUrl: string) => Promise<void>;
}

/**
 * Phase 3: AI 실측 결과에서 본인 외 도메인 자동 추출 → 클릭 시 경쟁사 분석.
 *
 * 필터:
 *  - 본인 도메인 제외 (양방향 includes 체크)
 *  - isBlockedDomain (cashdoc·blog.naver 등 노이즈) 제외
 *  - 최대 3건 표시
 *
 * 후보가 없으면 null 반환 (UI 숨김).
 */
export default function CompetitorAutoSuggestions({ ownDomain, topResults, onSelect }: Props) {
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const cleanOwn = ownDomain.replace(/^www\./, '').toLowerCase();
  const candidates = topResults
    .filter((r) => {
      const d = r.domain.replace(/^www\./, '').toLowerCase();
      if (!d) return false;
      if (cleanOwn && (d.includes(cleanOwn) || cleanOwn.includes(d))) return false;
      if (isBlockedDomain(d)) return false;
      return true;
    })
    .slice(0, 3);

  if (candidates.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm max-w-4xl mx-auto">
      <h3 className="text-sm font-bold text-slate-700 mb-2">🏆 자동 경쟁사 분석</h3>
      <p className="text-[11px] text-slate-500 mb-3">
        AI 검색 결과 상위 도메인을 자동 발굴했습니다. 클릭하면 경쟁사 GAP 분석을 시작합니다.
      </p>
      <div className="grid gap-2">
        {candidates.map((c) => (
          <button
            key={c.domain}
            type="button"
            onClick={async () => {
              if (analyzing !== null) return;
              setAnalyzing(c.url);
              try {
                await onSelect(c.url);
              } finally {
                setAnalyzing(null);
              }
            }}
            disabled={analyzing !== null}
            className="text-left rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-700 truncate">
                  {c.title || c.domain}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  #{c.rank} · {c.domain}
                </div>
              </div>
              <span className="text-[11px] text-indigo-500 font-bold whitespace-nowrap">
                {analyzing === c.url ? '분석 중…' : '분석 →'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
