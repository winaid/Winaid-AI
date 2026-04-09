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

  // 정렬
  titleAlign?: 'left' | 'center' | 'right';
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

/** 디자인 프리셋 — 색상 + 레이아웃 스타일 + 장식 패턴 조합 */
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

export interface DesignPreset {
  id: string;
  name: string;
  category: 'professional' | 'modern' | 'minimal' | 'warm' | 'bold';
  thumbnail: string;
  theme: CardNewsTheme;
  style: DesignPresetStyle;
}

export const DESIGN_PRESETS: DesignPreset[] = [
  // ════ 밝은 톤 (병원/의료에 적합) ════
  { id: 'clean-white', name: '클린 화이트', category: 'minimal',
    thumbnail: 'linear-gradient(160deg, #FFFFFF, #EDF2F7)',
    theme: { backgroundColor: '#FFFFFF', backgroundGradient: 'linear-gradient(160deg, #FFFFFF, #EDF2F7)', titleColor: '#1A202C', subtitleColor: '#2D3748', bodyColor: '#4A5568', accentColor: '#3182CE', cardBgColor: '#F7FAFC', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 4, bottomBarHeight: 0, titleAlign: 'left', innerCardStyle: 'outlined', innerCardRadius: 12, accentBarWidth: 40, footerStyle: 'simple', shadowIntensity: 'light' },
  },
  { id: 'sky-blue', name: '스카이 블루', category: 'minimal',
    thumbnail: 'linear-gradient(160deg, #E3F0FB, #C5DCF0)',
    theme: { backgroundColor: '#E3F0FB', backgroundGradient: 'linear-gradient(160deg, #E3F0FB, #C5DCF0)', titleColor: '#0F2B46', subtitleColor: '#1A5A8A', bodyColor: '#3A5068', accentColor: '#2176C7', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 6, bottomBarHeight: 3, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 16, accentBarWidth: 50, footerStyle: 'simple', shadowIntensity: 'light' },
  },
  { id: 'cream-brown', name: '크림 브라운', category: 'warm',
    thumbnail: 'linear-gradient(160deg, #FDF6EC, #F5E0C0)',
    theme: { backgroundColor: '#FDF6EC', backgroundGradient: 'linear-gradient(160deg, #FDF6EC, #F5E0C0)', titleColor: '#4A230A', subtitleColor: '#8B4513', bodyColor: '#6B4226', accentColor: '#C7873A', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'dots', patternOpacity: 0.03, topBarHeight: 6, bottomBarHeight: 3, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 20, accentBarWidth: 50, footerStyle: 'bordered', shadowIntensity: 'light' },
  },
  { id: 'rose-pink', name: '로즈 핑크', category: 'warm',
    thumbnail: 'linear-gradient(160deg, #FFF0F5, #FFD6E8)',
    theme: { backgroundColor: '#FFF0F5', backgroundGradient: 'linear-gradient(160deg, #FFF0F5, #FFD6E8)', titleColor: '#4A1034', subtitleColor: '#B83280', bodyColor: '#702459', accentColor: '#D53F8C', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 6, bottomBarHeight: 3, titleAlign: 'center', innerCardStyle: 'pill', innerCardRadius: 999, accentBarWidth: 50, footerStyle: 'simple', shadowIntensity: 'light' },
  },
  { id: 'mint-fresh', name: '민트 프레시', category: 'warm',
    thumbnail: 'linear-gradient(160deg, #E0F5EC, #B2DFDB)',
    theme: { backgroundColor: '#E0F5EC', backgroundGradient: 'linear-gradient(160deg, #E0F5EC, #B2DFDB)', titleColor: '#1A3C34', subtitleColor: '#2E7D6E', bodyColor: '#37574D', accentColor: '#38A89D', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'dots', patternOpacity: 0.02, topBarHeight: 4, bottomBarHeight: 2, titleAlign: 'left', innerCardStyle: 'rounded', innerCardRadius: 16, accentBarWidth: 40, footerStyle: 'simple', shadowIntensity: 'light' },
  },
  { id: 'lavender', name: '라벤더', category: 'warm',
    thumbnail: 'linear-gradient(160deg, #F3EEFF, #E2D4F5)',
    theme: { backgroundColor: '#F3EEFF', backgroundGradient: 'linear-gradient(160deg, #F3EEFF, #E2D4F5)', titleColor: '#2D1B69', subtitleColor: '#6B46C1', bodyColor: '#553C9A', accentColor: '#805AD5', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 4, bottomBarHeight: 2, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 20, accentBarWidth: 50, footerStyle: 'simple', shadowIntensity: 'light' },
  },
  { id: 'peach', name: '피치', category: 'warm',
    thumbnail: 'linear-gradient(160deg, #FFF5F0, #FDDCCC)',
    theme: { backgroundColor: '#FFF5F0', backgroundGradient: 'linear-gradient(160deg, #FFF5F0, #FDDCCC)', titleColor: '#7B341E', subtitleColor: '#C05621', bodyColor: '#9C4221', accentColor: '#ED8936', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 6, bottomBarHeight: 3, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 16, accentBarWidth: 50, footerStyle: 'simple', shadowIntensity: 'light' },
  },
  { id: 'soft-gray', name: '소프트 그레이', category: 'minimal',
    thumbnail: 'linear-gradient(160deg, #F7FAFC, #E2E8F0)',
    theme: { backgroundColor: '#F7FAFC', backgroundGradient: 'linear-gradient(160deg, #F7FAFC, #E2E8F0)', titleColor: '#1A202C', subtitleColor: '#4A5568', bodyColor: '#718096', accentColor: '#4A5568', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 0, bottomBarHeight: 0, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 12, accentBarWidth: 30, footerStyle: 'none', shadowIntensity: 'light' },
  },
  // ════ 어두운 톤 (프리미엄/고급) ════
  { id: 'navy-gold', name: '네이비 골드', category: 'professional',
    thumbnail: 'linear-gradient(135deg, #1B2A4A, #1E3A5F)',
    theme: { backgroundColor: '#1B2A4A', backgroundGradient: 'linear-gradient(180deg, #1B2A4A, #152238)', titleColor: '#FFFFFF', subtitleColor: '#F5A623', bodyColor: '#D6D8E0', accentColor: '#F5A623', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'herringbone', patternOpacity: 0.02, topBarHeight: 8, bottomBarHeight: 4, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 20, accentBarWidth: 60, footerStyle: 'simple', shadowIntensity: 'medium' },
  },
  { id: 'charcoal-coral', name: '차콜 코랄', category: 'professional',
    thumbnail: 'linear-gradient(135deg, #2D3436, #3D4547)',
    theme: { backgroundColor: '#2D3436', backgroundGradient: 'linear-gradient(180deg, #2D3436, #232829)', titleColor: '#FFFFFF', subtitleColor: '#FF6B6B', bodyColor: '#B2BEC3', accentColor: '#FF6B6B', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'dots', patternOpacity: 0.03, topBarHeight: 6, bottomBarHeight: 0, titleAlign: 'left', innerCardStyle: 'rounded', innerCardRadius: 16, accentBarWidth: 40, footerStyle: 'simple', shadowIntensity: 'strong' },
  },
  { id: 'deep-purple', name: '딥 퍼플', category: 'professional',
    thumbnail: 'linear-gradient(135deg, #2D1B69, #44337A)',
    theme: { backgroundColor: '#2D1B69', backgroundGradient: 'linear-gradient(180deg, #2D1B69, #1A0F40)', titleColor: '#FFFFFF', subtitleColor: '#B794F4', bodyColor: '#C4B5E0', accentColor: '#B794F4', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'diamond', patternOpacity: 0.03, topBarHeight: 8, bottomBarHeight: 4, titleAlign: 'center', innerCardStyle: 'pill', innerCardRadius: 999, accentBarWidth: 70, footerStyle: 'bordered', shadowIntensity: 'medium' },
  },
  { id: 'mono-black', name: '모노 블랙', category: 'minimal',
    thumbnail: 'linear-gradient(135deg, #000000, #1A202C)',
    theme: { backgroundColor: '#000000', backgroundGradient: 'linear-gradient(180deg, #0A0A0A, #000000)', titleColor: '#FFFFFF', subtitleColor: '#A0AEC0', bodyColor: '#718096', accentColor: '#FFFFFF', cardBgColor: '#1A202C', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 2, bottomBarHeight: 0, titleAlign: 'left', innerCardStyle: 'sharp', innerCardRadius: 0, accentBarWidth: 30, footerStyle: 'simple', shadowIntensity: 'none' },
  },
  { id: 'forest-green', name: '포레스트 그린', category: 'modern',
    thumbnail: 'linear-gradient(135deg, #064E3B, #065F46)',
    theme: { backgroundColor: '#064E3B', backgroundGradient: 'linear-gradient(180deg, #064E3B, #053D30)', titleColor: '#FFFFFF', subtitleColor: '#6EE7B7', bodyColor: '#A7F3D0', accentColor: '#34D399', cardBgColor: '#ECFDF5', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'dots', patternOpacity: 0.02, topBarHeight: 6, bottomBarHeight: 3, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 24, accentBarWidth: 60, footerStyle: 'simple', shadowIntensity: 'medium' },
  },
  // ════ 비비드 (눈에 띄는) ════
  { id: 'electric-blue', name: '일렉트릭 블루', category: 'bold',
    thumbnail: 'linear-gradient(135deg, #0052D4, #4364F7)',
    theme: { backgroundColor: '#0052D4', backgroundGradient: 'linear-gradient(135deg, #0052D4, #4364F7, #6FB1FC)', titleColor: '#FFFFFF', subtitleColor: '#BEE3F8', bodyColor: '#E2E8F0', accentColor: '#FFFFFF', cardBgColor: 'rgba(255,255,255,0.15)', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 0, bottomBarHeight: 0, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 20, accentBarWidth: 0, footerStyle: 'simple', shadowIntensity: 'strong' },
  },
  { id: 'sunset-gradient', name: '선셋 그라데이션', category: 'bold',
    thumbnail: 'linear-gradient(135deg, #F093FB, #F5576C)',
    theme: { backgroundColor: '#F093FB', backgroundGradient: 'linear-gradient(135deg, #F093FB, #F5576C)', titleColor: '#FFFFFF', subtitleColor: '#FFF5F5', bodyColor: '#FED7D7', accentColor: '#FFFFFF', cardBgColor: 'rgba(255,255,255,0.15)', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 0, bottomBarHeight: 0, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 24, accentBarWidth: 0, footerStyle: 'simple', shadowIntensity: 'strong' },
  },
  { id: 'ocean-gradient', name: '오션 그라데이션', category: 'bold',
    thumbnail: 'linear-gradient(135deg, #43E97B, #38F9D7)',
    theme: { backgroundColor: '#43E97B', backgroundGradient: 'linear-gradient(135deg, #43E97B, #38F9D7)', titleColor: '#064E3B', subtitleColor: '#065F46', bodyColor: '#047857', accentColor: '#064E3B', cardBgColor: 'rgba(255,255,255,0.25)', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 0, bottomBarHeight: 0, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 20, accentBarWidth: 0, footerStyle: 'simple', shadowIntensity: 'medium' },
  },
  { id: 'fire-red', name: '파이어 레드', category: 'bold',
    thumbnail: 'linear-gradient(135deg, #C62828, #B71C1C)',
    theme: { backgroundColor: '#C62828', backgroundGradient: 'linear-gradient(180deg, #C62828, #8E0000)', titleColor: '#FFFFFF', subtitleColor: '#FFCDD2', bodyColor: '#FFEBEE', accentColor: '#FFD54F', cardBgColor: 'rgba(255,255,255,0.12)', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'herringbone', patternOpacity: 0.03, topBarHeight: 8, bottomBarHeight: 4, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 16, accentBarWidth: 60, footerStyle: 'bordered', shadowIntensity: 'strong' },
  },
  { id: 'warm-yellow', name: '웜 옐로', category: 'bold',
    thumbnail: 'linear-gradient(135deg, #F6E05E, #ECC94B)',
    theme: { backgroundColor: '#F6E05E', backgroundGradient: 'linear-gradient(160deg, #F6E05E, #ECC94B)', titleColor: '#744210', subtitleColor: '#975A16', bodyColor: '#744210', accentColor: '#D69E2E', cardBgColor: '#FFFFFF', fontFamily: PRETENDARD },
    style: { backgroundPattern: 'none', patternOpacity: 0, topBarHeight: 6, bottomBarHeight: 3, titleAlign: 'center', innerCardStyle: 'rounded', innerCardRadius: 16, accentBarWidth: 50, footerStyle: 'simple', shadowIntensity: 'light' },
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
