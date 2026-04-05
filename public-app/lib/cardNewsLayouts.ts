/**
 * 프로 카드뉴스 레이아웃 타입 정의
 *
 * AI가 JSON으로 구조화된 슬라이드 데이터를 출력하면,
 * CardNewsProRenderer가 레이아웃별로 다른 HTML/CSS로 렌더링한다.
 *
 * 목표: 네이비 배경 + 비교표 + 아이콘 그리드 + 수치 강조 같은
 * 실제 프로 치과 카드뉴스(더찬한치과/라이프치과)급 퀄리티 달성.
 */

/** 슬라이드 레이아웃 유형 */
export type SlideLayoutType =
  | 'cover'           // 표지: 큰 제목 + 부제
  | 'info'            // 정보형: 제목 + 본문 텍스트
  | 'comparison'      // 비교표: 2~3열 비교 (행 라벨 선택)
  | 'icon-grid'       // 아이콘 그리드: 2x2 또는 3열 아이콘 + 텍스트
  | 'steps'           // 단계형: 화살표 플로우
  | 'checklist'       // 체크리스트: 체크 아이콘 + 항목
  | 'data-highlight'  // 수치 강조: 큰 숫자 + 라벨
  | 'closing';        // 마무리: 병원명 + CTA

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
  hospitalName?: string;
  hospitalLogo?: string; // base64 dataUrl
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
      backgroundColor: '#E8F4FD',
      backgroundGradient: 'linear-gradient(180deg, #E8F4FD 0%, #D1E8F8 100%)',
      titleColor: '#1A365D',
      subtitleColor: '#2B6CB0',
      bodyColor: '#4A5568',
      accentColor: '#3182CE',
      cardBgColor: '#FFFFFF',
      fontFamily: PRETENDARD,
    },
  },
  {
    id: 'pink',
    name: '소프트 핑크',
    theme: {
      backgroundColor: '#FFF0F5',
      backgroundGradient: 'linear-gradient(180deg, #FFF0F5 0%, #FFE4EE 100%)',
      titleColor: '#702459',
      subtitleColor: '#D53F8C',
      bodyColor: '#553C4E',
      accentColor: '#ED64A6',
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
      backgroundColor: '#FDF6EC',
      backgroundGradient: 'linear-gradient(180deg, #FDF6EC 0%, #F5E6D0 100%)',
      titleColor: '#78350F',
      subtitleColor: '#D97706',
      bodyColor: '#6B5B3E',
      accentColor: '#F59E0B',
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
      backgroundColor: '#FFFFFF',
      backgroundGradient: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
      titleColor: '#1A202C',
      subtitleColor: '#4299E1',
      bodyColor: '#4A5568',
      accentColor: '#3182CE',
      cardBgColor: '#EDF2F7',
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
};

/**
 * AI가 출력한 JSON을 파싱해 SlideData[]로 변환.
 * 누락 필드는 info 레이아웃 fallback + 기본값 채움.
 */
export function parseProSlidesJson(rawText: string): SlideData[] {
  const cleaned = rawText
    .replace(/```json?\s*\n?/gi, '')
    .replace(/\n?```\s*$/g, '')
    .trim();

  let parsed: { slides?: Partial<SlideData>[] };
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
  return rawSlides.map((s, i) => normalizeSlide(s, i));
}

function normalizeSlide(raw: Partial<SlideData>, i: number): SlideData {
  const layout = isValidLayout(raw.layout) ? raw.layout : 'info';
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
  };
}

function isValidLayout(v: unknown): v is SlideLayoutType {
  return typeof v === 'string' &&
    ['cover', 'info', 'comparison', 'icon-grid', 'steps', 'checklist', 'data-highlight', 'closing'].includes(v);
}
