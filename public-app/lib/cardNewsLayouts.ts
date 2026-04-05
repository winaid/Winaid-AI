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

/** 추가 테마 프리셋 (향후 테마 선택 UI에서 사용) */
export const THEME_PRESETS: Record<string, CardNewsTheme> = {
  navy: DEFAULT_THEME,
  emerald: {
    ...DEFAULT_THEME,
    backgroundColor: '#0F3D3E',
    backgroundGradient: 'linear-gradient(180deg, #0F3D3E 0%, #072A2B 100%)',
    subtitleColor: '#F4D35E',
    accentColor: '#F4D35E',
  },
  burgundy: {
    ...DEFAULT_THEME,
    backgroundColor: '#4A1B2A',
    backgroundGradient: 'linear-gradient(180deg, #4A1B2A 0%, #2E0F1A 100%)',
    subtitleColor: '#F5C16C',
    accentColor: '#F5C16C',
  },
};

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
