/**
 * 팀/병원 데이터 — 타입 + 빈 fallback.
 *
 * ⚠️ PII 제거 (PIPA Article 23):
 *   과거 본 파일은 TEAM_DATA 에 매니저 실명·병원 주소·네이버 블로그 URL 30+ entry
 *   하드코딩. import 한 client component 가 Next.js bundle (.next/static/chunks/*.js)
 *   에 PII 평문 포함 → anon / 권한 없는 사용자가 dev tools / 빌드 산출물에서
 *   매니저 명단 / 병원 매핑 조회 가능.
 *
 *   수정: TEAM_DATA 를 빈 array 로 축소. 실제 데이터는 hospitals / teams 테이블에
 *   저장하고 lib/hospitalService.getTeamDataFromDB() 또는 lib/useTeamData() 훅으로
 *   client-side 조회. anon SELECT 는 hospitals.RLS 정책으로 허용되지만 manager /
 *   address 컬럼 노출 정책은 별도 PR 에서 정리 권장 (column-level RLS / view).
 *
 * 단일 fallback 정책:
 *   - DB 사용 가능: getTeamDataFromDB() 가 hospitals 테이블 row 반환
 *   - DB 실패: 빈 array — 명시적 에러 처리 권장 (silent fallback 금지)
 *   - production .next/static/chunks/*.js grep '담당자 실명' → 0건
 */

export interface HospitalEntry {
  name: string;
  manager: string;          // DB 에서 항상 string (빈 값은 '')
  address?: string;
  naverBlogUrls?: string[];
}

export interface TeamData {
  id: number;
  label: string;
  hospitals: HospitalEntry[];
}

/**
 * Fallback ONLY — DB 미설정 또는 hospitals 테이블 빈 결과 시.
 * 실 운영 시 hospitals 테이블에 row 가 있어야 한다.
 *
 * `[]` 가 아닌 placeholder team 1개 유지 — 빈 array 가 admin UI 의
 * `TEAM_DATA[0].id` 같은 패턴에서 undefined access 로 깨지는 것을 방지하기 위함.
 * 실제 운영에선 DB 가 채워져 본 fallback 은 사용 안 됨.
 */
export const TEAM_DATA: TeamData[] = [
  { id: 0, label: '본부장님', hospitals: [] },
  { id: 1, label: '1팀', hospitals: [] },
  { id: 2, label: '2팀', hospitals: [] },
  { id: 3, label: '3팀', hospitals: [] },
  { id: 4, label: '콘텐츠팀', hospitals: [] },
];
