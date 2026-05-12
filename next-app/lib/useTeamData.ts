/**
 * useTeamData — client-side 팀/병원 데이터 로드 훅
 *
 * 과거: 모든 client component 가 lib/teamData.ts 의 TEAM_DATA (manager 실명·주소·블로그
 * URL 30+ entry) 를 직접 import → Next.js client bundle 에 PII 평문 포함 → 권한
 * 없는 사용자 (anon, 일반 회원) 가 dev tools / .next/static/chunks/*.js 에서 매니저
 * 명단 + 병원 매핑 조회 가능 (PIPA 위반 표면).
 *
 * 수정: lib/teamData.ts 는 빈 fallback 으로 축소. 모든 client component 는 본 훅을
 * 통해 hospitals 테이블 조회 (anon SELECT 정책 허용 — manager/address 는 DB 안에만
 * 저장, RLS 가 service_role/authenticated 만 허용 예정 별도 PR).
 *
 * 사용:
 *   const { teamData, loading } = useTeamData();
 *   teamData.filter(...).map(...)
 *
 * 초기 렌더 시 teamData=[] / loading=true. fetch 완료 후 갱신.
 */

'use client';

import { useEffect, useState } from 'react';
import { TEAM_DATA, type TeamData } from './teamData';

export function useTeamData(): { teamData: TeamData[]; loading: boolean } {
  // 초기값을 TEAM_DATA fallback 으로 — 첫 렌더에서 드롭다운 비어 보이는 회귀 차단.
  // /api/teams 응답이 들어오면 enrich 된 결과로 교체.
  //
  // 과거 (회귀): client (anon supabase) 가 hospitals 테이블 직접 SELECT →
  // RLS / 프로젝트 일시 장애 시 CORS 에러로 콘솔 폭발 + fallback 만 보임.
  // 수정: server-side `/api/teams` (supabaseAdmin) 경유 → CORS 무관 + RLS 우회.
  const [teamData, setTeamData] = useState<TeamData[]>(TEAM_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/teams', { cache: 'no-store' });
        if (!res.ok) throw new Error(`/api/teams ${res.status}`);
        const data = (await res.json()) as TeamData[];
        if (mounted && Array.isArray(data) && data.length > 0) setTeamData(data);
      } catch (e) {
        console.warn('[useTeamData] /api/teams 조회 실패 — TEAM_DATA fallback 유지:', (e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { teamData, loading };
}
