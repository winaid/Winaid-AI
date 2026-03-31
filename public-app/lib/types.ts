/**
 * 콘텐츠 생성 관련 타입
 */

export type CardNewsDesignTemplateId = 'medical-clean' | 'spring-floral' | 'modern-grid' | 'simple-pin' | 'medical-illust';

export enum ContentCategory {
  DENTAL = '치과',
  DERMATOLOGY = '피부과',
  ORTHOPEDICS = '정형외과',
}

export type AudienceMode =
  | '환자용(친절/공감)'
  | '보호자용(가족걱정)'
  | '전문가용(신뢰/정보)';

export type ImageStyle = 'photo' | 'illustration' | 'medical' | 'custom';
export type PostType = 'blog' | 'card_news' | 'press_release';
export type WorkflowType = 'generate' | 'refine';
export type CssTheme = 'modern' | 'premium' | 'minimal' | 'warm' | 'professional';
export type WritingStyle = 'expert' | 'empathy' | 'conversion';

export interface GenerationRequest {
  category: ContentCategory;
  topic: string;
  keywords: string;
  disease?: string;
  tone: string;
  audienceMode: AudienceMode;
  persona: string;
  imageStyle: ImageStyle;
  referenceUrl?: string;
  postType: PostType;
  textLength?: number;
  imageCount?: number;
  cssTheme?: CssTheme;
  writingStyle?: WritingStyle;
  customImagePrompt?: string;
  learnedStyleId?: string;
  customSubheadings?: string;
  medicalLawMode?: 'strict' | 'relaxed';
  includeFaq?: boolean;
  faqCount?: number;
  includeHospitalIntro?: boolean;
  hospitalName?: string;
  hospitalStyleSource?: 'explicit_selected_hospital' | 'generic_default';
  clinicContext?: {
    actualServices: string[];
    specialties: string[];
    locationSignals: string[];
  } | null;
}

export interface TrendingItem {
  topic: string;
  keywords: string;
  score: number;
  seasonal_factor: string;
}

export interface SeoTitleItem {
  title: string;
  score: number;
  type: '신뢰' | '안전' | '정보' | '공감';
}

/** 블로그 섹션 (소제목 단위) — root app parseBlogSections 기준 */
export interface BlogSection {
  index: number;
  type: 'intro' | 'section' | 'conclusion';
  title: string;
  html: string;
}

/** 크롤링 글 채점 결과 — root writingStyleService.scoreCrawledPost 기준 */
export interface CrawledPostScore {
  score_typo: number;
  score_spelling: number;
  score_medical_law: number;
  score_naver_seo: number;
  score_total: number;
  typo_issues: Array<{ original: string; correction: string; context: string; type?: string }>;
  law_issues: Array<{ word: string; severity: string; replacement: string[]; context: string; law_article?: string }>;
  seo_issues?: Array<{ item: string; score: number; reason: string }>;
}

/** DB 크롤링 글 — root types.ts CrawledPost 기준 */
export interface DBCrawledPost {
  id: string;
  hospital_name: string;
  url: string;
  content: string;
  source_blog_id?: string;
  title?: string;
  published_at?: string;
  summary?: string;
  thumbnail?: string;
  score_typo?: number;
  score_spelling?: number;
  score_medical_law?: number;
  score_naver_seo?: number;
  score_total?: number;
  typo_issues?: CrawledPostScore['typo_issues'];
  law_issues?: CrawledPostScore['law_issues'];
  seo_issues?: CrawledPostScore['seo_issues'];
  corrected_content?: string;
  naver_rank?: number | null;
  naver_rank_keyword?: string;
  crawled_at: string;
  scored_at?: string;
}

// ── SEO 상세 평가 리포트 (Gemini 반환 구조) ──

export interface SeoReportCategory {
  score: number;
  feedback: string;
  [key: string]: number | string;
}

export interface SeoReport {
  total: number;
  title: SeoReportCategory;
  keyword_structure: SeoReportCategory;
  user_retention: SeoReportCategory;
  medical_safety: SeoReportCategory;
  conversion: SeoReportCategory;
  improvement_suggestions: string[];
}
