/**
 * 팀/병원 데이터 — public-app 측 lockstep wrapper (BlogFormPanel 양 앱 lockstep용).
 *
 * 배경:
 *   next-app 의 BlogFormPanel 은 useTeamData() 훅으로 내부 병원 list 를 dropdown 에
 *   표시한다. public-app 외부 사용자는 본인 병원만 다루므로 team list 가 의미 없지만,
 *   BlogFormPanel.tsx 자체가 양 앱 lockstep (diff=0) 이려면 동일 시그너처 export 가
 *   필요해서 본 모듈을 신설한다.
 *
 * 동작:
 *   - 타입 (TeamData / HospitalEntry) 은 next-app 과 동일
 *   - TEAM_DATA 는 빈 배열 — public-app 은 team list 노출 안 함
 *   - useTeamData() 는 항상 { teamData: [], loading: false } 반환 (PII 0)
 *
 * 양 앱 lockstep invariant:
 *   - BlogFormPanel.tsx 의 import path '../../../lib/useTeamData' 가 양 앱 모두 동일
 *   - 결과 시각적 UI 는 양 앱 동일 (단, public-app 의 team dropdown 은 비어서 자동 숨김)
 */

export interface HospitalEntry {
  name: string;
  manager: string;
  address?: string;
  naverBlogUrls?: string[];
}

export interface TeamData {
  id: number;
  label: string;
  hospitals: HospitalEntry[];
}

/** public-app 은 team list 미사용 — 빈 배열. */
export const TEAM_DATA: TeamData[] = [];
