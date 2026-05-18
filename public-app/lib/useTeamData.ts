/**
 * useTeamData — public-app 측 no-op wrapper (BlogFormPanel 양 앱 lockstep 용).
 *
 * 배경:
 *   next-app 의 BlogFormPanel 은 본 훅으로 내부 팀/병원 list 를 로드한다.
 *   public-app 외부 사용자는 본인 병원만 다루므로 team list 가 의미 없지만,
 *   양 앱 컴포넌트 lockstep (diff=0) 위해 동일 시그너처 export 를 제공한다.
 *
 * 동작:
 *   - 항상 빈 배열 반환 (네트워크 호출 0)
 *   - loading 도 항상 false
 *   - 결과 — BlogFormPanel 의 team dropdown 이 비어서 자동 숨김 (next-app 과 시각적 동일)
 *
 * 보안:
 *   PII 0 — TEAM_DATA fallback 도 빈 배열 (public-app/lib/teamData.ts).
 *   public-app bundle 에 매니저 실명·주소 0 byte.
 */

'use client';

import { TEAM_DATA, type TeamData } from './teamData';

export function useTeamData(): { teamData: TeamData[]; loading: boolean } {
  return { teamData: TEAM_DATA, loading: false };
}
