export enum ContentCategory {
  DENTAL = '치과'
}

export type AudienceMode =
  | '환자용(친절/공감)'
  | '보호자용(가족걱정)'
  | '전문가용(신뢰/정보)';
export type ImageStyle = 'photo' | 'illustration' | 'medical' | 'custom';
export type CardNewsDesignTemplateId = 'medical-clean' | 'spring-floral' | 'modern-grid' | 'simple-pin' | 'medical-illust';
export type PostType = 'blog' | 'card_news' | 'press_release';
export type CssTheme = 'modern' | 'premium' | 'minimal' | 'warm' | 'professional';
export type WritingStyle = 'expert' | 'empathy' | 'conversion';  // 전문가형 / 공감형 / 전환형

// AI 제공자 선택 타입
export type AIProvider = 'gemini' | 'openai';
export interface AIProviderSettings {
  textGeneration: AIProvider;  // 글쓰기에 사용할 AI
  imageGeneration: AIProvider; // 이미지 생성에 사용할 AI
}

// 말투 학습 데이터 타입
export interface LearnedWritingStyle {
  id: string;
  name: string;
  description: string;
  sampleText: string; // 학습에 사용된 원본 텍스트
  analyzedStyle: {
    tone: string; // 어조 (친근한, 전문적인, 유머러스 등)
    sentenceEndings: string[]; // 문장 마무리 패턴 ("~요", "~습니다" 등)
    vocabulary: string[]; // 자주 사용하는 단어/표현
    structure: string; // 글 구조 특징
    emotionLevel: 'low' | 'medium' | 'high'; // 감정 표현 정도
    formalityLevel: 'casual' | 'neutral' | 'formal'; // 격식 수준
    // ── 심층 문체 분석 (2단계 프레임워크) ──
    speakerIdentity?: string; // 화자 정체성 (대표원장 직접 설명형 / 객관적 칼럼형 / 환자 상담형 / 보호자 안심형)
    readerDistance?: string; // 독자와의 거리감 (전문가 설명 / 친절 상담 대화 / 공감·위로 / 차분·객관)
    sentenceRhythm?: string; // 문장 리듬 (평균 길이, 끊김 패턴, 어미 반복, 질문형/단정형/권유형 비중)
    paragraphFlow?: string; // 문단 전개 구조 (사례→설명→정리, 문제→원인→해결 등)
    persuasionStyle?: string; // 설득 방식 (정보 전달 / 신뢰 형성 / 치료 필요성 설득 / 두려움 완화)
    uniqueExpressions?: string[]; // 고유 표현 습관 (접속어, 명사 표현, 반복 문장 구조, 상담 문장 패턴)
    bannedGenericStyle?: string[]; // 금지할 범용 문체 (진부한 표현, AI체, 과장 광고)
    oneLineSummary?: string; // 이 병원 문체 한 줄 정의
    goodExamples?: string[]; // 이 병원다운 문장 예시 5개
    badExamples?: string[]; // 이 병원답지 않은 문장 예시 5개
  };
  stylePrompt: string; // AI에게 전달할 스타일 프롬프트
  createdAt: string;
}

export interface GenerationRequest {
  category: ContentCategory;
  topic: string;
  keywords: string;
  disease?: string; // 질환명 (예: 석회성건염) - 글의 실제 주제
  tone: string;
  audienceMode: AudienceMode;
  persona: string;
  imageStyle: ImageStyle;
  referenceUrl?: string;
  postType: PostType;
  textLength?: number;
  slideCount?: number;
  imageCount?: number; // 블로그 포스트 이미지 장수
  cssTheme?: CssTheme;
  writingStyle?: WritingStyle; // 글 스타일: 안전형/공감형/전환형
  coverStyleImage?: string; // 카드뉴스 표지 스타일 참고 이미지 (Base64)
  contentStyleImage?: string; // 카드뉴스 본문 스타일 참고 이미지 (Base64)
  customImagePrompt?: string; // 커스텀 이미지 스타일 프롬프트
  styleCopyMode?: boolean; // true=레이아웃 복제, false=느낌만 참고
  learnedStyleId?: string; // 학습된 말투 스타일 ID
  designTemplateId?: CardNewsDesignTemplateId; // 카드뉴스 디자인 템플릿
  customSubheadings?: string; // 사용자가 직접 입력한 소제목들 (줄바꿈으로 구분)
  // 의료광고법 모드
  medicalLawMode?: 'strict' | 'relaxed'; // strict=엄격 준수(기본), relaxed=아슬아슬 모드
  // FAQ 옵션
  includeFaq?: boolean; // FAQ 섹션 포함 여부 (네이버 질문 + 질병관리청 정보)
  faqCount?: number; // FAQ 질문 개수 (3~5개)
  includeHospitalIntro?: boolean; // 병원 소개 섹션 포함 여부 (홈페이지 크롤링 + 자동 삽입)
  // 보도자료용 필드
  hospitalName?: string; // 병원명
  hospitalStyleSource?: 'explicit_selected_hospital' | 'generic_default'; // 병원 말투 소스
  hospitalWebsite?: string; // 병원 웹사이트 URL (크롤링용)
  doctorName?: string; // 의료진 이름
  doctorTitle?: string; // 직함 (예: 원장, 부원장, 과장)
  pressType?: 'achievement' | 'new_service' | 'research' | 'event' | 'award' | 'health_tips'; // 보도 유형
}

export interface FactCheckReport {
  fact_score: number;
  verified_facts_count: number;
  safety_score: number;
  conversion_score: number;  // 전환력 점수 (0~100) - 의료법 준수하면서 행동 유도하는 능력
  ai_smell_score?: number;   // AI 냄새 점수 v2.0 (0~100) - 낮을수록 좋음, 15점 초과 시 재작성 대상
  ai_smell_analysis?: AiSmellAnalysis;  // AI 냄새 상세 분석 (8~15점 구간 수정 가이드)
  seo_score?: SeoScoreReport;  // SEO 최적화 점수 (총 100점)
  issues: string[];
  recommendations: string[];
}

// AI 냄새 상세 분석 리포트 (8~15점 구간 수정 가이드용)
export interface AiSmellAnalysis {
  total_score: number;  // 총점 (낮을수록 좋음)
  sentence_rhythm: {  // ① 문장 리듬 단조로움 (0~25점)
    score: number;
    issues: string[];  // 문제 문장/패턴 목록
    fix_suggestions: string[];  // 수정 제안
  };
  judgment_avoidance: {  // ② 판단 단정형 글쓰기 (0~20점)
    score: number;
    issues: string[];
    fix_suggestions: string[];
  };
  lack_of_realism: {  // ③ 현장감 부재 (0~20점)
    score: number;
    issues: string[];
    fix_suggestions: string[];
  };
  template_structure: {  // ④ 템플릿 구조 (0~15점)
    score: number;
    issues: string[];
    fix_suggestions: string[];
  };
  fake_empathy: {  // ⑤ 가짜 공감 (0~10점)
    score: number;
    issues: string[];
    fix_suggestions: string[];
  };
  cta_failure: {  // ⑥ 행동 유도 실패 (0~10점)
    score: number;
    issues: string[];
    fix_suggestions: string[];
  };
  priority_fixes: string[];  // 우선 수정해야 할 항목 (가장 점수가 높은 순)
}

// SEO 점수 상세 리포트 (총 100점)
export interface SeoScoreReport {
  total: number;  // 총점 (100점 만점) - 참고용
  title: {  // ① 제목 최적화 (25점)
    score: number;
    keyword_natural: number;      // 핵심 키워드 자연 포함 (10점)
    seasonality: number;          // 시기성·상황성 포함 (5점)
    judgment_inducing: number;    // 판단 유도형 구조 (5점)
    medical_law_safe: number;     // 의료광고 리스크 없음 (5점)
    feedback: string;
  };
  keyword_structure: {  // ② 본문 키워드 구조 (25점)
    score: number;
    main_keyword_exposure: number;   // 메인 키워드 3~5회 자연 노출 (10점)
    related_keyword_spread: number;  // 연관 키워드 분산 배치 (5점)
    subheading_variation: number;    // 소제목에 키워드 변주 포함 (5점)
    no_meaningless_repeat: number;   // 의미 없는 반복 없음 (5점)
    feedback: string;
  };
  user_retention: {  // ③ 사용자 체류 구조 (20점)
    score: number;
    intro_problem_recognition: number;  // 도입부 5줄 이내 문제 인식 (5점)
    relatable_examples: number;         // '나 얘기 같다' 생활 예시 (5점)
    mid_engagement_points: number;      // 중간 이탈 방지 포인트 (5점)
    no_info_overload: number;           // 정보 과부하 없음 (5점)
    feedback: string;
  };
  medical_safety: {  // ④ 의료법 안전성 + 신뢰 신호 (20점)
    score: number;
    no_definitive_guarantee: number;  // 단정·보장 표현 없음 (5점)
    individual_difference: number;    // 개인차/상황별 차이 자연 언급 (5점)
    self_diagnosis_limit: number;     // 자가진단 한계 명확화 (5점)
    minimal_direct_promo: number;     // 병원 직접 홍보 최소화 (5점)
    feedback: string;
  };
  conversion: {  // ⑤ 전환 연결성 (10점)
    score: number;
    cta_flow_natural: number;     // CTA가 정보 흐름을 끊지 않음 (5점)
    time_fixed_sentence: number;  // 시점 고정형 문장 존재 (5점)
    feedback: string;
  };
  improvement_suggestions?: string[];  // 개선 제안 목록 (자동 재생성 시 활용)
}

// 카드별 프롬프트 데이터 (재생성 UI용)
export interface CardPromptData {
  imagePrompt: string;
  textPrompt: {
    subtitle: string;
    mainTitle: string;
    description: string;
    tags: string[];
  };
}

// 카드뉴스 원고 (1단계: 스크립트)
export interface CardNewsScript {
  title: string;
  topic: string;
  totalSlides: number;
  slides: CardNewsSlideScript[];
  overallTheme: string;
}

export interface CardNewsSlideScript {
  slideNumber: number;
  slideType: 'cover' | 'concept' | 'content' | 'closing';
  subtitle: string;
  mainTitle: string;
  description: string;
  speakingNote: string; // 이 슬라이드에서 전달하고 싶은 핵심 메시지
  imageKeyword: string;
}

// 블로그 섹션 정보 (섹션별 재생성용)
export interface BlogSection {
  index: number;
  type: 'intro' | 'section' | 'conclusion';
  title: string; // 소제목 (intro/conclusion은 빈 문자열)
  html: string;  // 이 섹션의 HTML
}

export interface GeneratedContent {
  htmlContent: string;
  title: string;
  imageUrl: string;
  fullHtml: string;
  tags: string[];
  factCheck?: FactCheckReport;
  postType: PostType;
  cssTheme?: CssTheme;
  imageStyle?: ImageStyle;
  customImagePrompt?: string; // 커스텀 이미지 프롬프트 (재생성용)
  cardPrompts?: CardPromptData[]; // 카드별 프롬프트 (재생성용)
  designTemplateId?: CardNewsDesignTemplateId; // 카드뉴스 디자인 템플릿 ID (재생성용)
  seoScore?: SeoScoreReport; // SEO 자동 평가 결과
  sections?: BlogSection[]; // 블로그 섹션 분리 데이터 (섹션별 재생성용)
  imageFailCount?: number; // 이미지 생성 실패 수 (0이면 전체 성공, >0이면 부분 성공)
  imagePrompts?: string[]; // 이미지 재생성용 프롬프트
  conclusionLength?: number; // 파이프라인 마무리(conclusionHtml) 원본 길이 (완전성 검증용)
  generatedImages?: { index: number; data: string; prompt: string }[]; // base64 원본 이미지 (export용, HTML에는 blob URL 사용)
  blobUrls?: string[]; // 생성된 blob URL 목록 (컴포넌트 cleanup 시 revokeObjectURL용)
  storageHtml?: string; // 저장용 경량 HTML (blob/base64 → Supabase URL 치환 완료본). saveContentToServer에는 반드시 이것을 사용할 것.
}

/**
 * 블로그 생성 화면 표시용 단계 번호.
 * monotonic: 한 번 올라가면 뒤로 내려가지 않는다.
 *
 *   0 = 대기/시작 전
 *   1 = 글 작성
 *   2 = 글 검토/통합 (Stage C polish)
 *   3 = 이미지 생성
 *   4 = 저장/마무리
 */
export type DisplayStage = 0 | 1 | 2 | 3 | 4;

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  warning: string | null;
  data: GeneratedContent | null;
  progress: string;
  /** UI 표시용 단계. monotonic — 뒤로 가지 않음. */
  displayStage: DisplayStage;
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

// 블로그 이력 (자체 DB용)
export interface BlogHistory {
  id: string;
  title: string;
  content: string;
  htmlContent?: string;
  keywords: string[];
  embedding?: number[]; // Gemini Embedding API로 생성한 벡터
  publishedAt: Date;
  naverUrl?: string;
  category?: string;
}

// 유사도 검사 결과
export interface SimilarityCheckResult {
  finalScore: number; // 0~100점, 높을수록 유사도 높음
  status: 'ORIGINAL' | 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK';
  message: string;
  ownBlogMatches: OwnBlogMatch[]; // 자체 블로그와의 유사도
  webSearchMatches: WebSearchMatch[]; // 웹 검색 결과
  keyPhrases: string[]; // 추출된 핵심 문장들
  checkDuration: number; // 검사 소요 시간 (ms)
  topSourceInfo?: {
    matchCount: number;
    blogKey?: string;
    blogInfo?: { link?: string; title?: string; snippet?: string; displayLink?: string };
    matchedPhrases?: string[];
  };
}

// 자체 블로그 매칭 결과
export interface OwnBlogMatch {
  blog: BlogHistory;
  similarity: number; // 0~1 (코사인 유사도)
  matchedPhrases: string[]; // 유사한 문장들
}

// 웹 검색 매칭 결과
export interface WebSearchMatch {
  phrase: string; // 검색한 핵심 문장
  url: string;
  title: string;
  snippet: string;
  matchCount: number; // 정확히 일치하는 문장 개수
}

// 크롤링된 병원 블로그 글 채점 결과
export interface CrawledPostScore {
  score_typo: number;        // 오타 점수 (0~100)
  score_spelling: number;    // 맞춤법 점수 (0~100)
  score_medical_law: number; // 의료광고법 준수 점수 (0~100)
  score_total: number;       // 종합 점수 (3개 평균)
  typo_issues: Array<{ original: string; correction: string; context: string; type?: 'typo' | 'spelling' }>;
  law_issues: Array<{ word: string; severity: 'critical' | 'high' | 'medium' | 'low'; replacement: string[]; context: string }>;
}

// 병원 크롤링 글 DB 레코드
export interface CrawledPost {
  id: string;
  hospital_name: string;
  url: string;
  content: string;
  source_blog_id?: string;               // 출처 블로그 ID (blog.naver.com/{blogId})
  title?: string;
  published_at?: string;
  summary?: string;
  thumbnail?: string;
  score_typo?: number;
  score_spelling?: number;
  score_medical_law?: number;
  score_total?: number;
  typo_issues?: CrawledPostScore['typo_issues'];
  law_issues?: CrawledPostScore['law_issues'];
  corrected_content?: string;
  crawled_at: string;
  scored_at?: string;
}
