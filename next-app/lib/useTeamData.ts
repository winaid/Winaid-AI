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
import { getTeamDataFromDB } from './hospitalService';
import type { TeamData } from './teamData';

export function useTeamData(): { teamData: TeamData[]; loading: boolean } {
  const [teamData, setTeamData] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getTeamDataFromDB();
        if (mounted) setTeamData(data);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { teamData, loading };
}
