export interface HospitalEntry {
  name: string;
  manager: string;
}

export interface TeamData {
  id: number;
  label: string;
  hospitals: HospitalEntry[];
}

export const TEAM_DATA: TeamData[] = [
  {
    id: 1,
    label: '1팀',
    hospitals: [],
  },
  {
    id: 2,
    label: '2팀',
    hospitals: [],
  },
  {
    id: 3,
    label: '3팀',
    hospitals: [
      { name: '루원퍼스트치과', manager: '김태광 팀장' },
      { name: '연세조이플란트치과', manager: '김태광 팀장' },
      { name: '예일치과', manager: '김태광 팀장' },
      { name: '연세하늘치과', manager: '김태광 팀장' },
      { name: '부천그랜드치과', manager: '김태광 팀장' },
      { name: '오늘안치과', manager: '이도화 선임' },
      { name: '라이프치과', manager: '이도화 선임' },
      { name: '미도치과', manager: '이도화 선임' },
      { name: '더착한치과', manager: '이도화 선임' },
      { name: '서울이고운치과', manager: '이도화 선임' },
      { name: '오늘안치과 (최소현)', manager: '최소현 매니저' },
      { name: '연세하늘치과 (최소현)', manager: '최소현 매니저' },
    ],
  },
];
