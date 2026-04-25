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

  // ── Tier 3-A 확장 필드 ────────────────────────────────────
  /** #8 콘텐츠 신선도 — meta 또는 JSON-LD datePublished/dateModified */
  datePublished?: string;
  dateModified?: string;
  /** #9 AI 크롤러 허용 — robots.txt User-agent 별 정책 */
  aiCrawlerPolicy?: Record<string, 'allowed' | 'blocked' | 'unknown'>;
  /** #10 llms.txt 존재 여부 */
  hasLlmsTxt?: boolean;
  /** #12 Author 정보 — meta name="author" 또는 JSON-LD author.name */
  author?: string;
  /** #13 이미지 최적화 통계 */
  imageOptimization?: {
    webpCount: number;
    lazyCount: number;
    srcsetCount: number;
    totalImages: number;
  };

  // ── Phase 1 확장 필드 ────────────────────────────────────
  /** HTTP 응답 상태 코드 (메인 페이지 최종 응답) */
  httpStatus?: number;
  /** HTTP 보안 헤더 — 메인 페이지 응답에서 추출 */
  securityHeaders?: {
    csp: string | null;
    hsts: string | null;
    xFrame: string | null;
    xContentType: string | null;
    referrer: string | null;
  };
  /** 파비콘 URL (<link rel="icon"> 등) */
  favicon?: string;
  /** Twitter Card 메타 태그 (meta name="twitter:*") */
  twitterTags?: Record<string, string>;
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

export type AIPlatform = 'ChatGPT' | 'Gemini';

export interface AIVisibility {
  platform: AIPlatform;
  likelihood: 'high' | 'medium' | 'low';
  reason: string;
}

export type ActionExecutor = 'ai' | 'human' | 'hybrid';

export interface ActionItem {
  action: string;
  impact: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  timeframe: '즉시' | '1주' | '2주' | '1개월';
  category: string;
  /** 단계 5-B: Sonnet 이 분류하는 실행 주체. 규칙 기반 fallback 은 undefined. */
  executor?: ActionExecutor;
  /** 60대 원장님이 직접 제작사에 요청할 수 있도록 한 상세 가이드 (이게 뭐예요? / 어떻게 하나요? / 팁). */
  detailedGuide?: string;
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

  // ── 단계 5-A: LLM 기반 맞춤 해설 (optional — LLM 실패 시 전부 undefined, base 동작 유지) ──
  /** AI 검색 노출 관점 3~4문장 — 히어로 카드용 */
  heroSummary?: string;
  /** 이 병원 요약 2문장 — Gemini 추출 */
  siteSummary?: string;
  /** 플랫폼별 맞춤 해설 — AIVisibility.reason 을 대체/보완 */
  aiNarratives?: Partial<Record<AIPlatform, string>>;

  // ── 단계 C-a-1: AI 실측 (stream 으로 분리, 여기선 메타만) ──
  /** crawl 본문에서 추출한 지역 (예: "강남구", "논산시") */
  detectedRegion?: string;
  /** 업종 (기본: "치과", 향후 확장 여지) */
  detectedCategory?: string;
}

// ── 단계 5-A: LLM 추출·생성 중간 타입 ───────────────────────────

/** Gemini 가 crawl 결과에서 추출하는 병원 메타 */
export interface SiteMeta {
  siteSummary: string;
  detectedStrengths: string[];
  detectedGaps: string[];
}

// ── AI 실측 보조 타입 ──────────────────────────────────────

/** 실측 답변에서 추출한 URL 매칭 결과 (selfIncluded 판정용 best-effort) */
export interface CompetitorResult {
  url: string;
  title: string;
  snippet: string;
  domain: string; // 호스트명 (www. prefix 제거)
  rank: number;   // 1~5
}

// CompetitorFinding interface — 제거됨 (stream 분리 후 미사용. git history 에서 복구 가능).

/** Sonnet 이 기본 진단 + SiteMeta 를 받아 만드는 맞춤 해설 묶음 */
export interface Narratives {
  heroSummary: string;
  aiNarratives: Partial<Record<AIPlatform, string>>;
  /** key 는 CategoryScore.id (security_tech / site_structure / ...) */
  categoryRecommendations: Record<string, string[]>;
  /** 단계 5-B: key 는 priorityActions 인덱스 문자열 ("0", "1", ...). text + executor 쌍. */
  actionTexts: Record<string, { text: string; executor: ActionExecutor }>;
}

export interface DiagnosticErrorResponse {
  success: false;
  error: string;
  code?: 'INVALID_URL' | 'UNREACHABLE' | 'TIMEOUT' | 'PARSE_ERROR' | 'UNKNOWN';
}

// ── 실측 → 해설 갱신 (C+B 강화안) ────────────────────────

/** 단일 플랫폼의 실측 결과 (카드 → 부모 → /refresh-narrative 전달용) */
export interface MeasurementData {
  selfIncluded: boolean;
  selfRank: number | null;
  queryUsed: string;
  answerText: string;
  /** Tier 3-B: 실측 답변에서 추출된 경쟁사 URL 목록 (GAP 분석 자동 채움용, 최대 5) */
  topResultUrls?: string[];
}

/** POST /api/diagnostic/refresh-narrative 응답 — 갱신된 필드만. */
export interface RefreshNarrativeResponse {
  heroSummary: string;
  aiNarratives: Partial<Record<AIPlatform, string>>;
  aiVisibility: AIVisibility[];
  priorityActions?: ActionItem[];
}

/** 진단 히스토리 — 점수 추이 바 차트용 (GET /api/diagnostic/history 응답 아이템). */
export interface HistoryEntry {
  overall_score: number;
  analyzed_at: string;
}

// ── Tier 3-B: 경쟁사 GAP 분석 ──────────────────────────────

export interface CategoryDiff {
  categoryId: string;
  categoryName: string;
  selfScore: number;
  competitorScore: number;
  diff: number;
}

export interface GapAnalysis {
  competitor: {
    url: string;
    siteName: string;
    overallScore: number;
    categories: CategoryScore[];
  };
  gap: {
    overallDiff: number;
    categoryDiffs: CategoryDiff[];
    weakerItems: string[];
    strongerItems: string[];
  };
  narrative: string;
}
