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
  { id: 'illustration',  name: '일러스트',    prompt: 'soft 3D rendered illustration, Blender/Cinema4D style, rounded cute characters, pastel color palette, soft studio lighting, ambient occlusion, gentle shadows. NOT flat, NOT 2D, NOT vector.' },
  { id: 'medical-3d',    name: '3D 해부',     prompt: 'medical 3D anatomical render, scientific visualization, detailed cross-section, clinical lighting, translucent organs, x-ray glow effect' },
  { id: 'photo',         name: '실사 사진',    prompt: 'professional DSLR photograph, Korean medical clinic setting, natural window lighting, shallow depth of field, warm tone, realistic skin texture. NOT illustration, NOT 3D render.' },
  { id: 'infographic',   name: '아이콘/벡터',  prompt: 'flat 2D vector icon, solid colors, no gradients, no shadows, no 3D, geometric shapes only, single color background, SVG-like clean line art. Like a simple app icon or emoji. NOT 3D, NOT realistic, NOT illustration.' },
  { id: 'xray',          name: 'X-ray/CT',    prompt: 'dental X-ray or CT scan style, dark background, medical imaging, blue-white glow, high contrast' },
  { id: 'watercolor',    name: '수채화',      prompt: 'traditional watercolor painting, visible brush strokes, paint bleeding edges, soft wet-on-wet technique, muted artistic colors, paper texture visible. NOT digital, NOT clean edges.' },
] as const;

export type SlideImageStyle = typeof SLIDE_IMAGE_STYLES[number]['id'];

export interface SlideDecoration {
  id: string;
  type: 'star' | 'circle' | 'line' | 'arrow' | 'badge' | 'corner' | 'dots' | 'wave';
  position: { top: string; left: string };
  size: number;
  color: string;
  opacity: number;
  rotation: number;
}

export interface SlideData {
  /**
   * 카드뉴스 슬라이드의 안정적인 고유 식별자.
   * 드래그 reorder 후에도 DOM ref 추적/다운로드 정확성을 보장하기 위해 사용.
   * AI 생성 결과 파싱, 수동 추가, 복제, 드래프트/히스토리 복원 시 생성/유지.
   */
  id: string;
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
  imageRatio?: '1:1' | '4:5' | '9:16' | '16:9' | '3:4'; // AI 이미지 생성 비율
  imageFocalPoint?: { x: number; y: number }; // 초점 위치 (0~100%, 기본 50,50)

  // 카드별 폰트 오버라이드 — 비어 있으면 상단 전체 폰트를 따름
  fontId?: string;

  // 요소별 스타일 오버라이드 (Mirra 스타일 편집)
  titleFontId?: string;
  titleFontSize?: number;
  titleFontWeight?: string;
  titleColor?: string;
  titleLetterSpacing?: number;
  titleLineHeight?: number;

  subtitleFontId?: string;
  subtitleFontSize?: number;
  subtitleFontWeight?: string;
  subtitleColor?: string;
  subtitleLetterSpacing?: number;
  subtitleLineHeight?: number;

  bodyFontSize?: number;
  bodyColor?: string;
  bodyLineHeight?: number;

  // 장식 요소
  decorations?: SlideDecoration[];

  // 커버/마무리 전용
  coverTemplateId?: string;
  hashtags?: string[];
  badge?: string;
  showArrows?: boolean;
  showBadge?: boolean;
  showHashtags?: boolean;
  showHandle?: boolean;
  showLine?: boolean;

  // 텍스트 위치 (드래그로 변경, % 기준)
  titlePosition?: { x: number; y: number };
  subtitlePosition?: { x: number; y: number };

  // 요소 크기 (리사이즈, % 기준)
  titleSize?: { w: number; h: number };
  subtitleSize?: { w: number; h: number };
  bodySize?: { w: number; h: number };
  imageSize?: { w: number; h: number };

  // 정렬
  titleAlign?: 'left' | 'center' | 'right';
  subtitleAlign?: 'left' | 'center' | 'right';
  bodyAlign?: 'left' | 'center' | 'right';
  contentAlignV?: 'top' | 'center' | 'bottom';
  textShadow?: boolean;
  bgColor?: string;
  bgGradient?: string;

  // 로고/병원명 위치
  logoPosition?: { x: number; y: number };
  hospitalNamePosition?: { x: number; y: number };

  // 커스텀 아이콘 (요소 클릭으로 변경)
  baArrowIcon?: string;
  vsIcon?: string;
  checkIcon?: string;
  prosIcon?: string;
  consIcon?: string;

  // 도형 스타일 (data-highlight 등)
  dataShape?: 'circle' | 'rounded' | 'pill' | 'diamond' | 'hexagon';

  // 병원명 스타일
  hospitalFontSize?: number;
  hospitalColor?: string;
  hospitalFontWeight?: string;
  hospitalFontId?: string;
  hospitalLogoSize?: number;

  // 배열 항목 공통 스타일 (icon-grid/steps/checklist/dataPoints/qna 등)
  itemTitleFontSize?: number;
  itemTitleFontWeight?: string;
  itemTitleColor?: string;
  itemTitleFontId?: string;
  itemDescFontSize?: number;
  itemDescFontWeight?: string;
  itemDescColor?: string;
  itemDescFontId?: string;
  // dataPoint value (큰 숫자) 전용
  itemValueFontSize?: number;
  itemValueFontWeight?: string;
  itemValueColor?: string;
  itemValueFontId?: string;

  // 커스텀 요소 (사용자 추가 텍스트/이미지)
  customElements?: SlideCustomElement[];

  // 범용 위치/크기 맵 (도형/카드 요소의 배치 편집 결과)
  elementPositions?: Record<string, { x: number; y: number }>;
  elementSizes?: Record<string, { w: number; h: number }>;
  // 요소별 도형 모양 오버라이드
  elementShapes?: Record<string, 'rounded' | 'pill' | 'sharp' | 'diamond' | 'hexagon' | 'circle' | 'outlined'>;
}

/** 사용자가 자유롭게 추가한 텍스트/이미지 요소 */
export interface SlideCustomElement {
  id: string;
  type: 'text' | 'image';
  x: number;   // % (0~100)
  y: number;
  w: number;
  h: number;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  imageUrl?: string;
  /** 병원 로고 요소 — localStorage에 저장된 로고 재사용 시 true */
  isLogo?: boolean;
}

// ── 커버 템플릿 ──

export interface CoverTemplate {
  id: string;
  name: string;
  thumbnail: string;
  background: {
    type: 'image-full' | 'image-half' | 'solid' | 'gradient' | 'split';
    overlayColor?: string;
    overlayGradient?: string;
    solidColor?: string;
    gradient?: string;
  };
  layout: {
    titlePosition: 'center' | 'bottom-left' | 'bottom-center' | 'top-left' | 'top-right';
    titleSize: number;
    titleWeight: number;
    titleMaxWidth: string;
    subtitlePosition: 'above-title' | 'below-title' | 'top';
    subtitleSize: number;
  };
  decorations: {
    hasHashtags: boolean;
    hasArrows: boolean;
    hasBadge: boolean;
    hasHandle: boolean;
    hasLine: boolean;
    arrowStyle: 'circle' | 'plain' | 'none';
    badgePosition: 'top-left' | 'top-right' | 'top-center';
  };
  colors: { title: string; subtitle: string; accent: string; hashtag: string };
}

export const COVER_TEMPLATES: CoverTemplate[] = [
  { id: 'full-image-bottom', name: '풀이미지 하단 제목', thumbnail: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%)',
    background: { type: 'image-full', overlayGradient: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.65) 100%)' },
    layout: { titlePosition: 'bottom-left', titleSize: 56, titleWeight: 900, titleMaxWidth: '85%', subtitlePosition: 'below-title', subtitleSize: 20 },
    decorations: { hasHashtags: false, hasArrows: false, hasBadge: false, hasHandle: false, hasLine: false, arrowStyle: 'none', badgePosition: 'top-left' },
    colors: { title: '#FFFFFF', subtitle: 'rgba(255,255,255,0.8)', accent: '#FFFFFF', hashtag: '#FFFFFF' },
  },
  { id: 'center-overlay', name: '중앙 제목 + 배경', thumbnail: 'linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.5))',
    background: { type: 'image-full', overlayGradient: 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.5))' },
    layout: { titlePosition: 'center', titleSize: 64, titleWeight: 900, titleMaxWidth: '80%', subtitlePosition: 'below-title', subtitleSize: 20 },
    decorations: { hasHashtags: false, hasArrows: false, hasBadge: false, hasHandle: false, hasLine: true, arrowStyle: 'none', badgePosition: 'top-center' },
    colors: { title: '#FFFFFF', subtitle: 'rgba(255,255,255,0.8)', accent: '#FFFFFF', hashtag: '#FFFFFF' },
  },
  { id: 'minimal-solid', name: '미니멀 단색', thumbnail: 'linear-gradient(180deg, #F5F0EB, #E8DDD4)',
    background: { type: 'solid', solidColor: '#F5F0EB' },
    layout: { titlePosition: 'center', titleSize: 48, titleWeight: 700, titleMaxWidth: '80%', subtitlePosition: 'below-title', subtitleSize: 20 },
    decorations: { hasHashtags: false, hasArrows: false, hasBadge: false, hasHandle: false, hasLine: true, arrowStyle: 'none', badgePosition: 'top-center' },
    colors: { title: '#2D2D2D', subtitle: '#666666', accent: '#2D2D2D', hashtag: '#999999' },
  },
  { id: 'hospital-pro', name: '병원 프로', thumbnail: 'linear-gradient(180deg, #1B2A4A, #152238)',
    background: { type: 'gradient', gradient: 'linear-gradient(180deg, #1B2A4A, #152238)' },
    layout: { titlePosition: 'center', titleSize: 56, titleWeight: 900, titleMaxWidth: '85%', subtitlePosition: 'below-title', subtitleSize: 22 },
    decorations: { hasHashtags: false, hasArrows: false, hasBadge: false, hasHandle: false, hasLine: true, arrowStyle: 'none', badgePosition: 'top-center' },
    colors: { title: '#FFFFFF', subtitle: '#F5A623', accent: '#F5A623', hashtag: '#F5A623' },
  },
  { id: 'left-text-right-image', name: '좌우 분할', thumbnail: 'linear-gradient(90deg, #1B2A4A 50%, #888 50%)',
    background: { type: 'split' },
    layout: { titlePosition: 'top-left', titleSize: 48, titleWeight: 900, titleMaxWidth: '90%', subtitlePosition: 'below-title', subtitleSize: 18 },
    decorations: { hasHashtags: false, hasArrows: false, hasBadge: false, hasHandle: false, hasLine: true, arrowStyle: 'none', badgePosition: 'top-left' },
    colors: { title: '#FFFFFF', subtitle: 'rgba(255,255,255,0.7)', accent: '#4299E1', hashtag: '#FFFFFF' },
  },
];

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

export interface DesignPresetStyle {
  backgroundPattern: 'herringbone' | 'diamond' | 'dots' | 'lines' | 'none';
  patternOpacity: number;
  topBarHeight: number;
  bottomBarHeight: number;
  titleAlign: 'left' | 'center';
  innerCardStyle: 'rounded' | 'pill' | 'sharp' | 'outlined';
  innerCardRadius: number;
  accentBarWidth: number;
  footerStyle: 'simple' | 'bordered' | 'none';
  shadowIntensity: 'none' | 'light' | 'medium' | 'strong';
}

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

/**
 * 슬라이드 고유 id 생성. 드래그 reorder 후에도 안정적인 DOM ref 키로 사용.
 * crypto.randomUUID 가능하면 그걸, 아니면 시간+난수 폴백.
 */
export function generateSlideId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `slide_${crypto.randomUUID()}`;
  }
  return `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 슬라이드 배열에 id를 채워 넣는다. 이미 id가 있으면 유지, 없으면 생성.
 * 드래프트/히스토리 복원이나 외부 입력을 받을 때 일괄 적용.
 * 또한 구버전 드래프트에 없던 선택 필드(customElements, elementPositions 등)가
 * 잘못된 타입으로 저장된 경우를 방어적으로 보정한다.
 */
export function ensureSlideIds(slides: SlideData[]): SlideData[] {
  return slides.map(s => {
    const withId = s.id && typeof s.id === 'string' ? s : { ...s, id: generateSlideId() };
    // 새 필드 호환성: 배열/객체 타입이 아니면 undefined로 정리
    const patch: Partial<SlideData> = {};
    if (withId.customElements && !Array.isArray(withId.customElements)) {
      patch.customElements = undefined;
    } else if (Array.isArray(withId.customElements)) {
      // 각 요소가 최소 필드를 갖는지 필터 — id/type/x/y/w/h 없는 건 제거
      patch.customElements = withId.customElements.filter(el =>
        el && typeof el === 'object' && 'id' in el && 'type' in el &&
        typeof (el as SlideCustomElement).x === 'number' &&
        typeof (el as SlideCustomElement).y === 'number'
      );
    }
    if (withId.elementPositions && typeof withId.elementPositions !== 'object') patch.elementPositions = undefined;
    if (withId.elementSizes && typeof withId.elementSizes !== 'object') patch.elementSizes = undefined;
    if (withId.elementShapes && typeof withId.elementShapes !== 'object') patch.elementShapes = undefined;
    return Object.keys(patch).length > 0 ? { ...withId, ...patch } : withId;
  });
}

function normalizeSlide(raw: Partial<SlideData>, i: number): SlideData {
  const layout = isValidLayout(raw.layout) ? raw.layout : 'info';
  const position = raw.imagePosition;
  const validPosition: SlideImagePosition | undefined =
    position === 'background' || position === 'top' || position === 'center' || position === 'bottom' ? position : undefined;
  return {
    id: (raw.id && typeof raw.id === 'string') ? raw.id : generateSlideId(),
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
