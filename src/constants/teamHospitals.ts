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
    hospitals: [
      { name: '맘애든어린이치과', manager: '주열' },
      { name: '코랄치과', manager: '주열' },
      { name: '미소모아치과', manager: '주열' },
      { name: '에버유의원', manager: '주열' },
      { name: '청주새롬탑치과', manager: '주열' },
      { name: '서울삼성치과', manager: '주열' },
      { name: '논산중앙치과', manager: '소영' },
      { name: '코랄치과 (소영)', manager: '소영' },
      { name: '아산베스트치과', manager: '소영' },
      { name: '검단일등치과', manager: '소영' },
      { name: '바른플란트치과', manager: '소영' },
      { name: '닥터신치과', manager: '소영' },
    ],
  },
  {
    id: 2,
    label: '2팀',
    hospitals: [
      { name: '최창수치과', manager: '미정' },
      { name: '다대치과', manager: '미정' },
      { name: 'A플란트치과', manager: '미정' },
      { name: '유성온치과', manager: '미정' },
      { name: '에이스플란트치과', manager: '진희' },
      { name: '신사이사랑치과', manager: '진희' },
      { name: '동그라미치과', manager: '진희' },
      { name: '청담클린치과', manager: '진희' },
    ],
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
