// ── 기본 상수 ──

const SINCE_YEAR = 2011;
export const YEARS_OF_EXPERIENCE = new Date().getFullYear() - SINCE_YEAR;

// ── Quick Tags ──

export const QUICK_TAGS = [
  '#임플란트 블로그 자동 생성',
  '#의료광고법 검증',
  '#카드뉴스 제작',
  '#네이버 상위노출 SEO',
  '#교정 마케팅 콘텐츠',
  '#보도자료 작성',
] as const;

export const MORE_TAGS = [
  '#치과 블로그 글감 추천',
  '#AI 이미지 생성',
  '#병원 SNS 마케팅',
  '#휴진 안내 템플릿',
  '#시술 전후 비교 콘텐츠',
  '#병원 브랜딩 전략',
] as const;

// ── Partners ──

export const PARTNER_HOSPITALS = [
  '연세올데이치과', '라온치과', '강남에스플란트치과', '뉴연세치과',
  '서울리마치과', '디오르치과', '예쁜미소치과', '바른이치과',
  '플란트치과', '하나로치과', '미르치과', '서울봄치과',
  '리더스치과', '에덴치과', '더미소치과', '연세퍼스트치과',
  '서울미소치과', '래미안치과', '클린치과', '서울밝은치과',
  '예담치과', '수플란트치과', '서울S치과', '뉴욕치과',
] as const;

export const PARTNER_LABEL = '300+ 병원이 신뢰합니다';

// ── Impact Stats ──

export interface ImpactStat {
  number: string;
  unit: string;
  label: string;
  sub: string;
  icon: string;
}

export const IMPACT_STATS: ImpactStat[] = [
  { number: String(YEARS_OF_EXPERIENCE), unit: '년+', label: '병원마케팅 노하우', sub: '2011년부터 축적', icon: '🏆' },
  { number: '300', unit: '+', label: '병원 진행건', sub: '전국 치과 마케팅', icon: '🏥' },
  { number: '500', unit: '+', label: '원장님과 함께', sub: '지속적인 파트너십', icon: '🤝' },
  { number: '1', unit: '분', label: 'AI 콘텐츠 생성', sub: '블로그 자동 완성', icon: '⚡' },
];

// ── AI Solutions ──

export interface AiSolution {
  title: string;
  desc: string;
  iconName: 'blog' | 'law' | 'image';
}

export const AI_SOLUTIONS: AiSolution[] = [
  {
    title: 'AI 블로그 자동 생성',
    desc: '키워드 하나면 의료광고법을 준수하는 네이버 최적화 블로그 원고가 1분 만에 완성됩니다.',
    iconName: 'blog',
  },
  {
    title: '의료광고법 자동 검증',
    desc: '과장, 비교, 보장성 표현을 실시간 감지하고 자동 수정합니다. 법률 위반 걱정 제로.',
    iconName: 'law',
  },
  {
    title: 'AI 이미지 & 카드뉴스',
    desc: '저작권 걱정 없는 고품질 이미지와 카드뉴스를 AI가 자동 생성합니다.',
    iconName: 'image',
  },
];

export interface SubFeature {
  label: string;
  desc: string;
  iconName: 'seo' | 'refine' | 'press';
}

export const SUB_FEATURES: SubFeature[] = [
  { label: 'SEO 최적화', desc: '네이버 상위노출', iconName: 'seo' },
  { label: 'AI 정밀보정', desc: 'AI 흔적 제거', iconName: 'refine' },
  { label: '보도자료', desc: '언론보도 작성', iconName: 'press' },
];

// ── Use Cases ──

export interface UseCase {
  pain: string;
  solution: string;
  desc: string;
  iconName: 'time' | 'law' | 'image';
}

export const USE_CASES: UseCase[] = [
  {
    pain: '블로그 쓸 시간이 없다',
    solution: 'AI가 1분 만에 작성',
    desc: '키워드 하나면 네이버 스마트블록 최적화 원고가 자동 완성',
    iconName: 'time',
  },
  {
    pain: '의료광고법이 복잡하다',
    solution: '자동 법률 검증 시스템',
    desc: '과장/비교/보장성 표현을 실시간 감지하고 자동 수정',
    iconName: 'law',
  },
  {
    pain: '이미지 만들기 귀찮다',
    solution: 'AI 이미지 자동 생성',
    desc: '저작권 걱정 없는 고품질 이미지를 원클릭으로 생성',
    iconName: 'image',
  },
];

// ── How It Works ──

export interface HowItWorksStep {
  step: string;
  title: string;
  desc: string;
}

export const HOW_IT_WORKS: HowItWorksStep[] = [
  { step: '01', title: '정보 입력', desc: '치과명과 키워드를 입력합니다.' },
  { step: '02', title: 'AI가 작성', desc: '의료광고법 준수 블로그와 이미지를 자동 생성합니다.' },
  { step: '03', title: '복사 & 게시', desc: '완성된 콘텐츠를 네이버 블로그에 바로 게시합니다.' },
];

// ── Testimonials ──

export interface Testimonial {
  name: string;
  hospital: string;
  text: string;
  rating: number;
}

export const TESTIMONIALS: Testimonial[] = [
  { name: '김OO 원장님', hospital: '서울 강남 S치과', text: '블로그 글 하나 쓰는 데 2시간 걸렸는데, 이제 1분이면 끝나요. 의료광고법 검증까지 자동이라 너무 편합니다.', rating: 5 },
  { name: '이OO 원장님', hospital: '부산 해운대 M치과', text: '마케팅 대행 비용 월 200만원 쓰다가 윈에이드로 바꿨어요. 퀄리티는 오히려 더 좋아졌습니다.', rating: 5 },
  { name: '박OO 원장님', hospital: '대전 유성 P치과', text: '카드뉴스 자동 생성이 정말 혁신적이에요. 인스타그램 콘텐츠를 매일 올릴 수 있게 됐습니다.', rating: 5 },
  { name: '정OO 원장님', hospital: '인천 연수 J치과', text: 'SEO 최적화가 정말 잘 되어 있어요. 블로그 포스팅 후 네이버 상위노출이 확실히 개선됐습니다.', rating: 5 },
  { name: '최OO 원장님', hospital: '경기 분당 C치과', text: 'AI가 생성한 글이 자연스러워서 놀랐어요. 환자들도 블로그를 보고 많이 찾아오시더라고요.', rating: 5 },
  { name: '한OO 원장님', hospital: '광주 서구 H치과', text: '보도자료 작성 기능이 특히 좋아요. 언론보도가 쉬워지니 병원 신뢰도가 확실히 올랐습니다.', rating: 5 },
];

// ── About ──

export const ABOUT_HEADING_SUFFIX = 'AI에 담았습니다';
export const ABOUT_DESC = '2011년부터 300곳 이상의 치과와 함께해온 윈에이드의 병원 마케팅 전문성이 AI에 녹아있습니다.';

export interface AboutItem {
  text: string;
  iconName: 'hospital' | 'chart' | 'people' | 'law';
}

export const ABOUT_ITEMS: AboutItem[] = [
  { text: '300+ 치과 마케팅 운영 경험', iconName: 'hospital' },
  { text: '네이버 플레이스 상위노출 전략', iconName: 'chart' },
  { text: '500+ 원장님과의 지속적 파트너십', iconName: 'people' },
  { text: '의료광고법 전문 컨설팅 & AI 검증', iconName: 'law' },
];

// ── CTA ──

export const CTA = {
  badge: '지금 바로 시작 가능',
  heading: '병원 마케팅의 미래,',
  headingHighlight: '지금 시작하세요',
  sub: '원장님은 진료에만 집중하세요.\n마케팅은 WINAI AI가 책임집니다.',
  primaryButton: '지금 무료로 시작하기',
  secondaryButton: '상담 문의',
  phone: '02-584-9400',
  phoneHref: 'tel:025849400',
} as const;

// ── Footer ──

export const FOOTER = {
  companyName: '(주)윈에이드',
  ceo: '대표 이현승',
  bizNo: '사업자등록번호 178-88-00714',
  address: '(07206) 서울 영등포구 양평로20길 16-1 2층',
  email: 'winaid@daum.net',
  phone: '02-584-9400',
  phoneHref: 'tel:025849400',
  fax: 'Fax 02-332-9407',
} as const;

// ── Hero ──

export const HERO = {
  badge: `Since 2011, ${YEARS_OF_EXPERIENCE}년 업력의 신뢰`,
  headingLine1: '병원 마케팅에',
  headingHighlight: 'AI 두뇌',
  headingLine2: '를 장착하세요',
  sub: '콘텐츠 제작, 의료광고법 검증, SEO 최적화까지',
  subBold: '300+ 병원이 선택한',
  subSuffix: 'AI 마케팅 플랫폼',
  chatPlaceholder: '임플란트 블로그를 AI로 자동 생성하고 싶어요',
  chatActivePlaceholder: '병원 마케팅에 대해 무엇이든 물어보세요...',
} as const;
