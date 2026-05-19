'use client';

/**
 * useGeoSectionsData — 8 GEO 섹션 데이터 통합 fetch (GEO-UX-2 lift up).
 *
 * 문제 (UX-1 한계 #1): Dashboard 와 8 섹션이 각자 자체 fetch → 데이터 중복 + Dashboard 가
 * priority 집계 못 함.
 *
 * 해결: DiagnosticResult 가 본 훅을 호출 → state 보유 → Dashboard + 8 섹션에 props 전달.
 * 각 섹션은 props 전달되면 자체 fetch skip (back-compat).
 *
 * 양 앱 lockstep — public-app / next-app 같은 파일.
 */

import { useCallback, useEffect, useState } from 'react';
import type { CitationRow, CompetitorContentItem } from '@winaid/blog-core';

export interface GeoSectionsData {
  /** geo_citations 최근 N 건 — GeoCitations / Sentiment / Naver / EEAT 공통 사용. */
  citations: CitationRow[];
  /** competitor_contents 미응답 list — Competitor / Dashboard 공통. */
  competitorContents: Array<CompetitorContentItem & { id?: string; competitor_domain: string }>;
  /** 로딩 여부 (8 섹션 통합). */
  loading: boolean;
  /** 마지막 fetch 시각 — UI 표시용. */
  lastFetchedAt?: string;
  /** 수동 refetch trigger. */
  refetch: () => void;
}

interface CitationsResponse { rows?: CitationRow[] }
interface CompetitorListResponse {
  contents?: Array<CompetitorContentItem & { id?: string; competitor_domain: string }>;
}

export function useGeoSectionsData(hospitalName: string | undefined): GeoSectionsData {
  const [citations, setCitations] = useState<CitationRow[]>([]);
  const [competitorContents, setCompetitorContents] = useState<GeoSectionsData['competitorContents']>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | undefined>();

  const fetchAll = useCallback(async () => {
    if (!hospitalName) return;
    setLoading(true);
    try {
      // 병렬 fetch — 401 등 실패는 silent (각 섹션은 props 없으면 자체 fetch 로 fallback)
      const [citRes, compRes] = await Promise.allSettled([
        fetch(`/api/geo/citations?hospital_name=${encodeURIComponent(hospitalName)}&limit=50`),
        fetch(`/api/geo/competitor/list?hospital_name=${encodeURIComponent(hospitalName)}&limit=20&responded=false`),
      ]);

      if (citRes.status === 'fulfilled' && citRes.value.ok) {
        const data = (await citRes.value.json()) as CitationsResponse;
        if (Array.isArray(data?.rows)) setCitations(data.rows);
      }
      if (compRes.status === 'fulfilled' && compRes.value.ok) {
        const data = (await compRes.value.json()) as CompetitorListResponse;
        if (Array.isArray(data?.contents)) setCompetitorContents(data.contents);
      }
      setLastFetchedAt(new Date().toISOString());
    } catch {
      // silent — props 없는 섹션은 자체 fetch fallback
    } finally {
      setLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { citations, competitorContents, loading, lastFetchedAt, refetch: fetchAll };
}
