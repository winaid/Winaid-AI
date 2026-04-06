/**
 * 프로 카드뉴스 레이아웃 타입 정의
 *
 * AI가 JSON으로 구조화된 슬라이드 데이터를 출력하면,
 * CardNewsProRenderer가 레이아웃별로 다른 HTML/CSS로 렌더링한다.
 *
 * 목표: 네이비 배경 + 비교표 + 아이콘 그리드 + 수치 강조 같은
 * 실제 프로 치과 카드뉴스(더찬한치과/라이프치과)급 퀄리티 달성.
 */

/** 슬라이드 레이아웃 유형 (16종) */
export type SlideLayoutType =
  // 기본 8종
  | 'cover'           // 표지: 큰 제목 + 부제
  | 'info'            // 정보형: 제목 + 본문 텍스트
  | 'comparison'      // 비교표: 2~3열 비교 (행 라벨 선택)
  | 'icon-grid'       // 아이콘 그리드: 2x2 또는 3열 아이콘 + 텍스트
  | 'steps'           // 단계형: 화살표 플로우
  | 'checklist'       // 체크리스트: 체크 아이콘 + 항목
  | 'data-highlight'  // 수치 강조: 큰 숫자 + 라벨
  | 'closing'         // 마무리: 병원명 + CTA
  // 확장 8종
  | 'before-after'    // 시술 전후 비교 (좌우 분할)
  | 'qna'             // Q&A (질문+답변)
  | 'timeline'        // 타임라인 (시술 후 1일·1주·1달)
  | 'quote'           // 인용/후기
  | 'numbered-list'   // 번호 리스트 (TOP 5·3가지 이유)
  | 'pros-cons'       // 장단점 (O/X)
  | 'price-table'     // 가격표/비용 비교
  | 'warning';        // 주의사항/경고

export interface SlideComparisonColumn {
  header: string;
  highlight?: boolean; // 강조 컬럼 (대개 자사/추천안)
  items: string[];
}

export interface SlideIconItem {
  emoji: string; // 이모지 또는 간단한 심볼
  title: string;
  desc?: string;
}

export interface SlideStep {
  label: string;
  desc?: string;
}

export interface SlideDataPoint {
  value: string;   // "90%", "3~6개월" 등
  label: string;
  highlight?: boolean;
}

export type SlideImagePosition = 'background' | 'top' | 'center' | 'bottom';

/** 슬라이드 이미지 생성 스타일 프리셋 */
export const SLIDE_IMAGE_STYLES = [
  { id: 'illustration',  name: '일러스트',    prompt: 'soft 3D pastel illustration, cute rounded style, clean background' },
  { id: 'medical-3d',    name: '3D 해부',     prompt: 'medical 3D anatomical render, scientific visualization, detailed cross-section' },
  { id: 'photo',         name: '실사 사진',    prompt: 'professional medical photograph, clinic setting, natural lighting' },
  { id: 'infographic',   name: '인포그래픽',  prompt: 'flat design infographic element, minimal vector style, clean icons' },
  { id: 'xray',          name: 'X-ray/CT',    prompt: 'dental X-ray or CT scan style, dark background, medical imaging' },
  { id: 'watercolor',    name: '수채화',      prompt: 'soft watercolor painting style, gentle colors, artistic medical illustration' },
] as const;

export type SlideImageStyle = typeof SLIDE_IMAGE_STYLES[number]['id'];

export interface SlideData {
  index: number;
  layout: SlideLayoutType;
  title: string;
  subtitle?: string;

  // info / closing
  body?: string;

  // comparison
  columns?: SlideComparisonColumn[];
  compareLabels?: string[]; // 행 라벨 (저작력, 치료기간 등)

  // icon-grid
  icons?: SlideIconItem[];

  // steps
  steps?: SlideStep[];

  // checklist
  checkItems?: string[];

  // data-highlight
  dataPoints?: SlideDataPoint[];

  // before-after
  beforeLabel?: string;
  afterLabel?: string;
  beforeItems?: string[];
  afterItems?: string[];

  // qna
  questions?: { q: string; a: string }[];

  // timeline
  timelineItems?: { time: string; title: string; desc?: string }[];

  // quote
  quoteText?: string;
  quoteAuthor?: string;
  quoteRole?: string;

  // numbered-list
  numberedItems?: { num?: string; title: string; desc?: string }[];

  // pros-cons
  pros?: string[];
  cons?: string[];
  prosLabel?: string;
  consLabel?: string;

  // price-table
  priceItems?: { name: string; price: string; note?: string }[];

  // warning
  warningTitle?: string;
  warningItems?: string[];

  // AI 이미지 (프로 모드 전용 — 선택)
  visualKeyword?: string;   // AI가 지정한 이미지 프롬프트 키워드(영문)
  imageUrl?: string;        // /api/image 결과 dataURL
  imagePosition?: SlideImagePosition;
  imageStyle?: SlideImageStyle; // 이미지 생성 스타일

  // 카드별 폰트 오버라이드 — 비어 있으면 상단 전체 폰트를 따름
  fontId?: string;
}

export interface CardNewsTheme {
  backgroundColor: string;
  backgroundGradient?: string;
  titleColor: string;
  subtitleColor: string;
  bodyColor: string;
  accentColor: string;
  cardBgColor: string;
  fontFamily: string;
  fontId?: string;           // CARD_FONTS[].id (없으면 fontFamily 사용)
  hospitalName?: string;
  hospitalLogo?: string;     // base64 dataUrl
}

/** 기본 테마: 네이비 배경 + 골드 악센트 (프로 치과 벤치마크) */
export const DEFAULT_THEME: CardNewsTheme = {
  backgroundColor: '#1B2A4A',
  backgroundGradient: 'linear-gradient(180deg, #1B2A4A 0%, #152238 100%)',
  titleColor: '#FFFFFF',
  subtitleColor: '#F5A623',
  bodyColor: '#D6D8E0',
  accentColor: '#F5A623',
  cardBgColor: '#FFFFFF',
  fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
};

const PRETENDARD = "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif";

/** 테마 프리셋 — 실제 병원 카드뉴스에서 자주 쓰는 8가지 색상 조합 */
export const THEME_PRESETS: { id: string; name: string; theme: CardNewsTheme }[] = [
  {
    id: 'navy',
    name: '네이비',
    theme: {
      backgroundColor: '#1B2A4A',
      backgroundGradient: 'linear-gradient(180deg, #1B2A4A 0%, #152238 100%)',
      titleColor: '#FFFFFF',
      subtitleColor: '#F5A623',
      bodyColor: '#D6D8E0',
      accentColor: '#F5A623',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'sky',
    name: '스카이블루',
    theme: {
      backgroundColor: '#DCEBF8',
      backgroundGradient: 'linear-gradient(160deg, #E3F0FB 0%, #C5DCF0 100%)',
      titleColor: '#0F2B46',
      subtitleColor: '#1A5A8A',
      bodyColor: '#3A5068',
      accentColor: '#2176C7',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'pink',
    name: '소프트 핑크',
    theme: {
      backgroundColor: '#FCE4EE',
      backgroundGradient: 'linear-gradient(160deg, #FFF0F5 0%, #FFD6E8 100%)',
      titleColor: '#4A1034',
      subtitleColor: '#B02569',
      bodyColor: '#50384A',
      accentColor: '#C7317E',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'emerald',
    name: '에메랄드',
    theme: {
      backgroundColor: '#064E3B',
      backgroundGradient: 'linear-gradient(180deg, #064E3B 0%, #053B2E 100%)',
      titleColor: '#FFFFFF',
      subtitleColor: '#6EE7B7',
      bodyColor: '#D1D5DB',
      accentColor: '#34D399',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'burgundy',
    name: '버건디',
    theme: {
      backgroundColor: '#4A1942',
      backgroundGradient: 'linear-gradient(180deg, #4A1942 0%, #3A1235 100%)',
      titleColor: '#FFFFFF',
      subtitleColor: '#F9A8D4',
      bodyColor: '#D1D5DB',
      accentColor: '#EC4899',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'warm',
    name: '웜 베이지',
    theme: {
      backgroundColor: '#F7EAD2',
      backgroundGradient: 'linear-gradient(160deg, #FDF6EC 0%, #F5E0C0 100%)',
      titleColor: '#4A230A',
      subtitleColor: '#B5630E',
      bodyColor: '#62452A',
      accentColor: '#D97706',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'slate',
    name: '모던 그레이',
    theme: {
      backgroundColor: '#1E293B',
      backgroundGradient: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
      titleColor: '#F8FAFC',
      subtitleColor: '#38BDF8',
      bodyColor: '#CBD5E1',
      accentColor: '#0EA5E9',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'white',
    name: '클린 화이트',
    theme: {
      backgroundColor: '#F5F8FC',
      backgroundGradient: 'linear-gradient(160deg, #FFFFFF 0%, #EDF2F7 100%)',
      titleColor: '#0A1628',
      subtitleColor: '#1E4E8C',
      bodyColor: '#3A4A5E',
      accentColor: '#1E4E8C',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
];

/** 레이아웃 유형 → 한국어 라벨 */
export const LAYOUT_LABELS: Record<SlideLayoutType, string> = {
  cover: '표지',
  info: '정보형',
  comparison: '비교표',
  'icon-grid': '아이콘 그리드',
  steps: '단계형',
  checklist: '체크리스트',
  'data-highlight': '수치 강조',
  closing: '마무리',
  'before-after': '전후 비교',
  qna: 'Q&A',
  timeline: '타임라인',
  quote: '인용/후기',
  'numbered-list': '번호 리스트',
  'pros-cons': '장단점',
  'price-table': '가격표',
  warning: '주의사항',
};

/**
 * AI가 출력한 JSON을 파싱해 { slides, font }로 변환.
 * 누락 필드는 info 레이아웃 fallback + 기본값 채움.
 */
export interface ParsedProResult {
  slides: SlideData[];
  fontId?: string;
}

export function parseProSlidesJson(rawText: string): ParsedProResult {
  const cleaned = rawText
    .replace(/```json?\s*\n?/gi, '')
    .replace(/\n?```\s*$/g, '')
    .trim();

  let parsed: { slides?: Partial<SlideData>[]; font?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 첫 번째 { 부터 마지막 } 까지만 재시도
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON 파싱 실패: 중괄호 없음');
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }

  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides = rawSlides.map((s, i) => normalizeSlide(s, i));
  const fontId = typeof parsed.font === 'string' && CARD_FONTS.some(f => f.id === parsed.font)
    ? (parsed.font as string)
    : undefined;
  return { slides, fontId };
}

function normalizeSlide(raw: Partial<SlideData>, i: number): SlideData {
  const layout = isValidLayout(raw.layout) ? raw.layout : 'info';
  const position = raw.imagePosition;
  const validPosition: SlideImagePosition | undefined =
    position === 'background' || position === 'top' || position === 'center' || position === 'bottom' ? position : undefined;
  return {
    index: raw.index ?? i + 1,
    layout,
    title: raw.title ?? `슬라이드 ${i + 1}`,
    subtitle: raw.subtitle,
    body: raw.body,
    columns: raw.columns,
    compareLabels: raw.compareLabels,
    icons: raw.icons,
    steps: raw.steps,
    checkItems: raw.checkItems,
    dataPoints: raw.dataPoints,
    // 확장 레이아웃 필드
    beforeLabel: raw.beforeLabel,
    afterLabel: raw.afterLabel,
    beforeItems: raw.beforeItems,
    afterItems: raw.afterItems,
    questions: raw.questions,
    timelineItems: raw.timelineItems,
    quoteText: raw.quoteText,
    quoteAuthor: raw.quoteAuthor,
    quoteRole: raw.quoteRole,
    numberedItems: raw.numberedItems,
    pros: raw.pros,
    cons: raw.cons,
    prosLabel: raw.prosLabel,
    consLabel: raw.consLabel,
    priceItems: raw.priceItems,
    warningTitle: raw.warningTitle,
    warningItems: raw.warningItems,
    // AI 이미지 필드
    visualKeyword: raw.visualKeyword,
    imageUrl: raw.imageUrl,
    imagePosition: validPosition,
    imageStyle: raw.imageStyle && SLIDE_IMAGE_STYLES.some(s => s.id === raw.imageStyle)
      ? raw.imageStyle
      : undefined,
    fontId: typeof raw.fontId === 'string' ? raw.fontId : undefined,
  };
}

function isValidLayout(v: unknown): v is SlideLayoutType {
  return typeof v === 'string' &&
    [
      'cover', 'info', 'comparison', 'icon-grid', 'steps', 'checklist', 'data-highlight', 'closing',
      'before-after', 'qna', 'timeline', 'quote', 'numbered-list', 'pros-cons', 'price-table', 'warning',
    ].includes(v);
}

// ═══════════════════════════════════════════════════════════════
// Google Fonts — 한글 지원 카드뉴스 전용 폰트 목록
// ═══════════════════════════════════════════════════════════════

export interface CardFont {
  id: string;
  name: string;
  family: string;
  /** Google Fonts CSS2 families 쿼리값. null이면 로컬 폰트(Pretendard 등). */
  googleImport: string | null;
  category: '기본' | '명조' | '임팩트' | '친근' | '손글씨';
}

export const FONT_CATEGORIES = ['기본', '명조', '임팩트', '친근', '손글씨'] as const;

export const CARD_FONTS: CardFont[] = [
  // 기본 (산세리프/고딕)
  { id: 'pretendard', name: 'Pretendard', family: "'Pretendard Variable', 'Pretendard', sans-serif", googleImport: null, category: '기본' },
  { id: 'noto-sans', name: '노토 산스', family: "'Noto Sans KR', sans-serif", googleImport: 'Noto+Sans+KR:wght@400;500;700;800;900', category: '기본' },
  { id: 'gothic-a1', name: 'Gothic A1', family: "'Gothic A1', sans-serif", googleImport: 'Gothic+A1:wght@400;600;700;800;900', category: '기본' },
  { id: 'ibm-plex', name: 'IBM Plex', family: "'IBM Plex Sans KR', sans-serif", googleImport: 'IBM+Plex+Sans+KR:wght@400;500;600;700', category: '기본' },
  { id: 'nanum-gothic', name: '나눔 고딕', family: "'Nanum Gothic', sans-serif", googleImport: 'Nanum+Gothic:wght@400;700;800', category: '기본' },
  { id: 'gowun-dodum', name: '고운 돋움', family: "'Gowun Dodum', sans-serif", googleImport: 'Gowun+Dodum', category: '기본' },

  // 명조 (세리프)
  { id: 'noto-serif', name: '노토 세리프', family: "'Noto Serif KR', serif", googleImport: 'Noto+Serif+KR:wght@400;600;700;900', category: '명조' },
  { id: 'nanum-myeongjo', name: '나눔 명조', family: "'Nanum Myeongjo', serif", googleImport: 'Nanum+Myeongjo:wght@400;700;800', category: '명조' },
  { id: 'gowun-batang', name: '고운 바탕', family: "'Gowun Batang', serif", googleImport: 'Gowun+Batang:wght@400;700', category: '명조' },
  { id: 'hahmlet', name: '함렛', family: "'Hahmlet', serif", googleImport: 'Hahmlet:wght@400;500;600;700;800;900', category: '명조' },
  { id: 'song-myung', name: '송명', family: "'Song Myung', serif", googleImport: 'Song+Myung', category: '명조' },

  // 임팩트
  { id: 'black-han', name: '블랙한산스', family: "'Black Han Sans', sans-serif", googleImport: 'Black+Han+Sans', category: '임팩트' },
  { id: 'do-hyeon', name: '도현', family: "'Do Hyeon', sans-serif", googleImport: 'Do+Hyeon', category: '임팩트' },
  { id: 'gugi', name: '구기', family: "'Gugi', cursive", googleImport: 'Gugi', category: '임팩트' },
  { id: 'orbit', name: 'Orbit', family: "'Orbit', sans-serif", googleImport: 'Orbit', category: '임팩트' },

  // 친근
  { id: 'jua', name: '주아', family: "'Jua', sans-serif", googleImport: 'Jua', category: '친근' },
  { id: 'sunflower', name: '해바라기', family: "'Sunflower', sans-serif", googleImport: 'Sunflower:wght@300;500;700', category: '친근' },
  { id: 'gamja-flower', name: '감자꽃', family: "'Gamja Flower', cursive", googleImport: 'Gamja+Flower', category: '친근' },
  { id: 'stylish', name: '스타일리시', family: "'Stylish', sans-serif", googleImport: 'Stylish', category: '친근' },

  // 손글씨
  { id: 'gaegu', name: '개구', family: "'Gaegu', cursive", googleImport: 'Gaegu:wght@300;400;700', category: '손글씨' },
  { id: 'hi-melody', name: '하이멜로디', family: "'Hi Melody', cursive", googleImport: 'Hi+Melody', category: '손글씨' },
  { id: 'poor-story', name: '푸어스토리', family: "'Poor Story', cursive", googleImport: 'Poor+Story', category: '손글씨' },
  { id: 'east-sea', name: '동해독도', family: "'East Sea Dokdo', cursive", googleImport: 'East+Sea+Dokdo', category: '손글씨' },
  { id: 'yeon-sung', name: '연성', family: "'Yeon Sung', cursive", googleImport: 'Yeon+Sung', category: '손글씨' },
];

/** fontId로 CardFont 찾기. 못 찾으면 기본(Pretendard) 반환 */
export function getCardFont(fontId?: string): CardFont {
  if (!fontId) return CARD_FONTS[0];
  return CARD_FONTS.find(f => f.id === fontId) ?? CARD_FONTS[0];
}
