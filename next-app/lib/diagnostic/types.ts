/**
 * AEO/GEO 진단 도구 — 공유 타입
 *
 * crawler.ts / psi.ts / scoring.ts / api/diagnostic/route.ts / 프론트 컴포넌트가
 * 전부 같은 타입을 참조하도록 단일 소스.
 */

// ── 크롤링 결과 ─────────────────────────────────────────────

export interface CrawlHeading {
  level: number;
  text: string;
}

export interface CrawlLink {
  href: string;
  text: string;
}

export interface CrawlImage {
  src: string;
  alt: string;
  hasAlt: boolean;
}

export interface CrawlResult {
  // 기본 정보
  finalUrl: string; // 리다이렉트 후 실제 URL
  title: string;
  metaDescription: string;
  ogTags: Record<string, string>;
  canonical: string;
  lang: string;

  // 헤딩 구조
  h1: string[];
  h2: string[];
  headingStructure: CrawlHeading[];

  // 구조화 데이터
  schemaMarkup: Record<string, unknown>[];
  schemaTypes: string[];

  // 링크 & 네비게이션
  internalLinks: CrawlLink[];
  externalLinks: CrawlLink[];
  navLinks: string[];

  // 이미지
  images: CrawlImage[];
  imagesWithoutAlt: number;
  totalImages: number;

  // 콘텐츠
  textContent: string;
  wordCount: number;
  hasContactInfo: boolean;
  hasAddress: boolean;
  hasBusinessHours: boolean;

  // 기술
  hasSSL: boolean;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  robotsTxtContent: string;
  viewport: string;
  charset: string;

  // 의료 특화
  hasDoctorInfo: boolean;
  hasServicePages: boolean;
  hasFAQ: boolean;
  hasMap: boolean;
  detectedServices: string[];

  // 서브페이지 감지 결과 (내부 링크에서 실제 fetch 성공한 path 목록)
  subpagesReached: string[];
}

// ── PSI 결과 ────────────────────────────────────────────────

export interface PsiResult {
  score: number | null; // 0-100
  fcp: number | null; // ms
  lcp: number | null; // ms
  cls: number | null;
  tbt: number | null; // ms
}

// ── 점수 & 응답 ─────────────────────────────────────────────

export type CategoryItemStatus = 'pass' | 'fail' | 'warning' | 'unknown';

export interface CategoryItem {
  label: string;
  status: CategoryItemStatus;
  detail: string;
  rawValue?: string;
  /** 해당 항목의 만점 배점 (우선 조치 정렬에 사용) */
  maxPoints: number;
  /** 해당 항목에서 얻은 점수 */
  earnedPoints: number;
}

export interface CategoryScore {
  id: string;
  name: string;
  score: number; // 0-100 (그 카테고리 내 가중 평균)
  weight: number; // 0-100 (전체 가중치)
  items: CategoryItem[];
  recommendations: string[];
}

export type AIPlatform = 'ChatGPT' | 'Gemini' | 'Perplexity' | 'Copilot';

export interface AIVisibility {
  platform: AIPlatform;
  likelihood: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ActionItem {
  action: string;
  impact: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  timeframe: '즉시' | '1주' | '2주' | '1개월';
  category: string;
}

export interface CrawlMeta {
  pagesAnalyzed: number;
  totalLinks: number;
  totalImages: number;
  schemaTypesFound: string[];
  detectedServices: string[];
}

export interface DiagnosticResponse {
  success: boolean;
  url: string;
  analyzedAt: string;
  siteName: string;

  overallScore: number;

  categories: CategoryScore[];

  performance: PsiResult | null;

  aiVisibility: AIVisibility[];

  priorityActions: ActionItem[];

  crawlMeta: CrawlMeta;
}

export interface DiagnosticErrorResponse {
  success: false;
  error: string;
  code?: 'INVALID_URL' | 'UNREACHABLE' | 'TIMEOUT' | 'PARSE_ERROR' | 'UNKNOWN';
}
