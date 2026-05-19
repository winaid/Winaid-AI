/**
 * AI 인용 출처 역추적기 (GEO-1.1) — 공통 타입.
 *
 * ChatGPT (OpenAI Responses API web_search) + Gemini (googleSearch grounding)
 * 두 모델 답변에서 citation URL 을 정규화 + is_ours 매칭 후 저장/표시.
 */

/** 한 건의 인용 URL — DB jsonb 컬럼의 한 원소 + UI 한 줄. */
export interface Citation {
  /** 정규화된 절대 URL (http/https). 단축 URL 1단 unwrap 후 결과. */
  url: string;
  /** 페이지 타이틀 (제공된 경우만). */
  title?: string;
  /** 답변 본문에서 인용된 부분 발췌 (제공된 경우만). 50자 ellipsis 는 UI 책임. */
  snippet?: string;
  /** 답변 본문의 몇 번째 단락이 이 URL 을 인용하는지 (0-based). 제공된 경우만. */
  paragraph_index?: number;
  /** ourDomains 와 hostname suffix 매칭되면 true. */
  is_ours?: boolean;
  /** GEO-1.2 (decompose) 가 분류한 primary 패턴. MVP 는 API 응답만, DB 영속은 별도 PR. */
  pattern_type?: PatternType;
}

// ── GEO-1.2: 콘텐츠 패턴 분류기 (decompose) ───────────────

/**
 * 패턴 6종 + 메타 상태.
 * - 'unknown': 분류 임계값 미달
 * - 'fetch_failed' / 'parse_failed': 분류 시도조차 못 함 (URL fetch 실패 / HTML 파싱 실패)
 */
export type PatternType =
  | 'faq'
  | 'comparison_table'
  | 'list'
  | 'doctor_interview'
  | 'pricing'
  | 'case_study'
  | 'unknown'
  | 'fetch_failed';

export interface PatternMeta {
  paragraph_count: number;
  heading_count: number;
  table_count: number;
  list_count: number;
  image_count: number;
}

/** classifyUrlPattern 의 단일 URL 결과 — UI 칩 + 카드 종합 통계의 source-of-truth. */
export interface PatternResult {
  url: string;
  status: 'ok' | 'fetch_failed' | 'parse_failed';
  /** scores 의 최고점이 임계값 ≥ 40 일 때만 set. */
  primary_pattern?: PatternType;
  /** primary 외 30~39 점 패턴 (있으면). */
  secondary_pattern?: PatternType;
  /**
   * 6 패턴 각 점수 (0~100). 임계값 미달도 점수는 채워서 운영자 디버깅에 도움.
   * status='fetch_failed' / 'parse_failed' 시 omit.
   */
  scores?: Partial<Record<Exclude<PatternType, 'unknown' | 'fetch_failed'>, number>>;
  meta?: PatternMeta;
  /** fetch / parse 실패 사유 — UI tooltip 노출용. */
  error?: string;
}

/** AI 모델 별 citations 쿼리 결과 — DB row 1건의 핵심 payload. */
export interface CitationQueryResult {
  /** 답변 본문 — stripPromptLeakage 통과 후 plain text. */
  answer: string;
  /** 정규화된 citation list. is_ours 가 채워진 항목 우선 정렬은 UI 책임. */
  citations: Citation[];
  /** 정규화/unwrap 전의 원본 URL list (디버깅 + 운영자 검수용). */
  rawSources: string[];
  /** 실제 호출한 model id (예: 'gpt-4o', 'gemini-3.1-pro-preview'). */
  model: string;
}

/** queryChatGptWithCitations / queryGeminiWithCitations 공통 옵션. */
export interface CitationQueryOpts {
  /** 우리 hostname list — is_ours 매칭 기준. ['mysmile.co.kr', 'm.mysmile.co.kr'] 등. */
  ourDomains?: string[];
  /** 호출자 abort signal (route handler abort 전파). */
  abortSignal?: AbortSignal;
  /** 단축 URL unwrap timeout (ms, 기본 3000). 0 이면 unwrap 건너뜀. */
  unwrapTimeoutMs?: number;
}

/** API route 가 받는 분석 요청 body. */
export interface AnalyzeCitationsRequest {
  hospital_name: string;
  query: string;
  our_domains: string[];
  /** geo_citations.campaign_id 컬럼 — diagnostic run 등 상위 entity link 용 (옵션). */
  campaign_id?: string | null;
  /** 기본 ['chatgpt', 'gemini'] (둘 다 호출). */
  models?: Array<'chatgpt' | 'gemini'>;
}

/** geo_citations 테이블 1 row 의 application-level 표현. */
export interface CitationRow {
  id?: string;
  campaign_id: string | null;
  hospital_name: string;
  query: string;
  ai_model: 'chatgpt' | 'gemini';
  answer_text: string;
  citations: Citation[];
  our_domains: string[];
  created_at?: string;
  created_by?: string;
}

// ── GEO-13: A/B 실험 인프라 ─────────────────────────────────────────

/**
 * variant 별 콘텐츠 형식 설정. JSONB 컬럼으로 저장됨.
 * hook_type / faq_block / list_style 는 known dimension — UI 마법사가 선택.
 * 그 외 자유 키 (string => unknown) 도 허용 — 향후 확장.
 */
export interface AbVariantFormatConfig {
  hook_type?: 'question' | 'scene' | 'statistic' | 'number_question' | 'mystery';
  faq_block?: boolean;
  list_style?: 'prose' | 'light_list' | 'numbered';
  [key: string]: unknown;
}

export interface AbVariantInput {
  variant_name: string;
  format_config: AbVariantFormatConfig;
}

export interface AbExperimentRow {
  id: string;
  hospital_name: string;
  topic: string;
  hypothesis: string | null;
  hypothesis_dimension: string | null;
  status: 'draft' | 'running' | 'completed' | 'cancelled';
  queries: string[];
  our_domains: string[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AbVariantRow {
  id: string;
  experiment_id: string;
  variant_name: string;
  format_config: AbVariantFormatConfig;
  post_id: string | null;
  post_url: string | null;
  created_at: string;
}

export type AbMetricSource = 'chatgpt' | 'gemini' | 'naver' | 'organic';

export interface AbMetricRow {
  id: string;
  variant_id: string;
  measured_at: string;
  source: AbMetricSource;
  queries_run: number;
  citation_count: number;
  citation_rate: number | null;
  naver_rank: number | null;
  visit_count: number | null;
  raw_payload: Record<string, unknown> | null;
}

/** analyzeResult 의 variant 별 요약 통계. */
export interface AbVariantSummary {
  variant_id: string;
  variant_name: string;
  format_config: AbVariantFormatConfig;
  metric_summary: {
    total_samples: number;
    chatgpt_citation_rate: number;
    gemini_citation_rate: number;
    avg_naver_rank: number | null;
  };
}

export interface AbAnalysisResult {
  experiment: AbExperimentRow;
  variants: AbVariantSummary[];
  winner?: { variant_id: string; reason: string; confidence: 'low' | 'medium' | 'high' };
  notes: string[];
}
