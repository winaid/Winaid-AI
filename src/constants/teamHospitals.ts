export interface HospitalEntry {
  name: string;
  manager: string;
  address?: string; // 주소 (UI에는 안 보이지만 지역 키워드 추천에 사용)
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
      { name: '맘애든어린이치과', manager: '김주열 팀장님', address: '충남 천안시 서북구 불당동' },
      { name: '코랄치과', manager: '김주열 팀장님', address: '서울 강동구 성내동' },
      { name: '미소모아치과', manager: '김주열 팀장님', address: '울산 남구 삼산동' },
      { name: '에버유의원', manager: '김주열 팀장님', address: '서울 마포구 도화동' },
      { name: '청주새롬탑치과', manager: '김주열 팀장님', address: '충북 청주시 흥덕구 복대동' },
      { name: '서울삼성치과', manager: '김주열 팀장님' },
      { name: '논산중앙치과', manager: '김소영 매니저님', address: '충남 논산시 반월동' },
      { name: '코랄치과 (김소영)', manager: '김소영 매니저님', address: '서울 강동구 성내동' },
      { name: '아산베스트치과', manager: '김소영 매니저님', address: '충남 아산시 용화동' },
      { name: '검단일등치과', manager: '김소영 매니저님', address: '인천 서구 불로동' },
      { name: '바른플란트치과', manager: '김소영 매니저님' },
      { name: '닥터신치과', manager: '김소영 매니저님' },
    ],
  },
  {
    id: 2,
    label: '2팀',
    hospitals: [
      { name: '최창수치과', manager: '신미정 팀장님' },
      { name: '다대치과', manager: '신미정 팀장님' },
      { name: 'A플란트치과', manager: '신미정 팀장님' },
      { name: '유성온치과', manager: '신미정 팀장님' },
      { name: '에이스플란트치과', manager: '오진희 매니저님' },
      { name: '신사이사랑치과', manager: '오진희 매니저님' },
      { name: '동그라미치과', manager: '오진희 매니저님' },
      { name: '청담클린치과', manager: '오진희 매니저님' },
    ],
  },
  {
    id: 3,
    label: '3팀',
    hospitals: [
      { name: '루원퍼스트치과', manager: '김태광 팀장님' },
      { name: '연세조이플란트치과', manager: '김태광 팀장님' },
      { name: '예일치과', manager: '김태광 팀장님' },
      { name: '연세하늘치과', manager: '김태광 팀장님' },
      { name: '부천그랜드치과', manager: '김태광 팀장님' },
      { name: '오늘안치과', manager: '이도화 선임님' },
      { name: '라이프치과', manager: '이도화 선임님' },
      { name: '미도치과', manager: '이도화 선임님' },
      { name: '더착한치과', manager: '이도화 선임님' },
      { name: '서울이고운치과', manager: '이도화 선임님' },
      { name: '오늘안치과 (최소현)', manager: '최소현 매니저님' },
      { name: '연세하늘치과 (최소현)', manager: '최소현 매니저님' },
    ],
  },
];
