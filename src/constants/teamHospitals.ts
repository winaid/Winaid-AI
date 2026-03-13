export interface HospitalEntry {
  name: string;
  manager: string;
  address?: string; // 주소 (UI에는 안 보이지만 지역 키워드 추천에 사용)
  naverBlogUrls?: string[]; // 네이버 블로그 URL 목록 (말투 학습용, 복수 지원)
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
      // 김주열 팀장님
      { name: '맘애든어린이치과', manager: '김주열 팀장님', address: '충남 천안시 서북구 불당동', naverBlogUrls: ['https://blog.naver.com/x577wqy3', 'https://blog.naver.com/ekttwj8518'] },
      { name: '코랄치과', manager: '김주열 팀장님', address: '서울 강동구 성내동' },
      { name: '미소모아치과', manager: '김주열 팀장님', address: '전북 전주시 완산구 서신동', naverBlogUrls: ['https://blog.naver.com/usmisomore', 'https://blog.naver.com/w02aqvujp', 'https://blog.naver.com/qwglfo4481'] },
      { name: '에버유의원', manager: '김주열 팀장님', address: '서울 마포구 도화동', naverBlogUrls: ['https://blog.naver.com/eah8fsd9f8'] },
      { name: '청주새롬탑치과', manager: '김주열 팀장님', address: '충북 청주시 흥덕구 복대동', naverBlogUrls: ['https://blog.naver.com/qwrtuipp184', 'https://blog.naver.com/qwrtuipp169'] },
      { name: '서울삼성치과', manager: '김주열 팀장님', address: '서울 관악구 봉천동', naverBlogUrls: ['https://blog.naver.com/pagfoco0q3q', 'https://blog.naver.com/i0v5id9o'] },
      // 김소영 매니저님
      { name: '닥터신치과', manager: '김소영 매니저님', address: '경기 성남시 중원구 상대원동', naverBlogUrls: ['https://blog.naver.com/hkyrsp9710'] },
      { name: '논산중앙치과', manager: '김소영 매니저님', address: '충남 논산시 반월동', naverBlogUrls: ['https://blog.naver.com/cha1636ndsu'] },
      { name: '아산베스트치과', manager: '김소영 매니저님', address: '충남 아산시 용화동', naverBlogUrls: ['https://blog.naver.com/soiidinmfve75174', 'https://blog.naver.com/czzhuy6104'] },
      { name: '바른플란트치과', manager: '김소영 매니저님', address: '서울 중랑구 망우동', naverBlogUrls: ['https://blog.naver.com/brplant', 'https://blog.naver.com/wwwlsl123'] },
      { name: '검단일등치과', manager: '김소영 매니저님', address: '인천 서구 불로동', naverBlogUrls: ['https://blog.naver.com/geomdan1stdental', 'https://blog.naver.com/o48j69omlwlnj6'] },
      { name: '코랄치과 (김소영)', manager: '김소영 매니저님', address: '서울 강동구 성내동', naverBlogUrls: ['https://blog.naver.com/timber12502', 'https://blog.naver.com/ffpvksk4i', 'https://blog.naver.com/ran2hoho'] },
      // 휘원 매니저님 (신규)
      { name: '부천그랜드치과', manager: '휘원 매니저님', address: '경기 부천시 원미구 중동', naverBlogUrls: ['https://blog.naver.com/dnautmqq'] },
    ],
  },
  {
    id: 2,
    label: '2팀',
    hospitals: [
      // 신미정 팀장님
      { name: '유성온치과', manager: '신미정 팀장님', address: '대전 유성구 봉명동', naverBlogUrls: ['https://blog.naver.com/yuseong_on'] },
      { name: 'A플란트치과', manager: '신미정 팀장님', address: '서울 성동구 도선동', naverBlogUrls: ['https://blog.naver.com/aplant2020'] },
      { name: '다대치과', manager: '신미정 팀장님', address: '부산 사하구 다대동', naverBlogUrls: ['https://blog.naver.com/guntj185r3'] },
      { name: '최창수치과', manager: '신미정 팀장님', address: '부산 동구 초량동', naverBlogUrls: ['https://blog.naver.com/basket1992'] },
      // 오진희 매니저님
      { name: '에이스플란트치과', manager: '오진희 매니저님', address: '서울 강남구 역삼동', naverBlogUrls: ['https://blog.naver.com/stfoaiatovc57525'] },
      { name: '신사이사랑치과', manager: '오진희 매니저님', address: '서울 강남구 논현동', naverBlogUrls: ['https://blog.naver.com/pauls2001n'] },
      { name: '동그라미치과', manager: '오진희 매니저님', address: '경기 고양시 덕양구 화정동', naverBlogUrls: ['https://blog.naver.com/evacuate14570'] },
      { name: '청담클린치과', manager: '오진희 매니저님', address: '서울 강남구 삼성동', naverBlogUrls: ['https://blog.naver.com/melovenus'] },
    ],
  },
  {
    id: 3,
    label: '3팀',
    hospitals: [
      // 김태광 팀장님
      { name: '루원퍼스트치과', manager: '김태광 팀장님', address: '인천 서구 가정동', naverBlogUrls: ['https://blog.naver.com/hance1978'] },
      { name: '연세조이플란트치과', manager: '김태광 팀장님', address: '서울 강동구 성내동', naverBlogUrls: ['https://blog.naver.com/ii24h0um'] },
      { name: '전주예일치과', manager: '김태광 팀장님', address: '전북 전주시 완산구 효자동2가', naverBlogUrls: ['https://blog.naver.com/zmkz4oeq'] },
      { name: '연세하늘치과', manager: '김태광 팀장님', address: '서울 중구 충무로2가', naverBlogUrls: ['https://blog.naver.com/skydentalgreen'] },
      // 이도화 선임님
      { name: '오늘안치과', manager: '이도화 선임님', address: '경기 성남시 수정구 태평동', naverBlogUrls: ['https://blog.naver.com/spssmaster77'] },
      { name: '라이프치과', manager: '이도화 선임님', address: '서울 강서구 화곡동', naverBlogUrls: ['https://blog.naver.com/bgfsdvyhd'] },
      { name: '미도치과', manager: '이도화 선임님', address: '서울 강남구 대치동', naverBlogUrls: ['https://blog.naver.com/m02jgiaz6'] },
      { name: '더착한치과', manager: '이도화 선임님', address: '부산 강서구 명지동', naverBlogUrls: ['https://blog.naver.com/mg2032875'] },
      { name: '이고운치과', manager: '이도화 선임님', address: '경기 파주시 목동동', naverBlogUrls: ['https://blog.naver.com/tdhhnx5899'] },
      // 최소현 매니저님
      { name: '오늘안치과 (최소현)', manager: '최소현 매니저님', address: '경기 성남시 수정구 태평동', naverBlogUrls: ['https://blog.naver.com/clinical641'] },
      { name: '연세하늘치과 (최소현)', manager: '최소현 매니저님', address: '서울 중구 충무로2가', naverBlogUrls: ['https://blog.naver.com/jkj9799'] },
    ],
  },
];
