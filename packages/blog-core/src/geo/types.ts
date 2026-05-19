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
