/**
 * 공용 LLM 레이어 — 타입 정의.
 *
 * Phase 0 스코프: 인프라만. 기존 라우트 교체 없음.
 *   - Gemini / Claude 양쪽을 동일한 callLLM(req) 인터페이스로 호출
 *   - systemBlocks 의 cacheable === true 블록은 Claude prompt caching 대상
 *   - Gemini는 캐싱 미지원이므로 단순 concat
 *   - Batch API: 실시간 UX 비의존 태스크는 queueLLMBatch 로 50% 할인
 *
 * 주의: Batch 호출자는 제출 후 poll 주기를 기다려야 하며, 실시간 UX에는
 * 적합하지 않다. (실시간 태스크는 router.isBatchable 에서 false 처리)
 */

export type LLMProvider = 'gemini' | 'claude';

export type LLMTaskKind =
  // ── 블로그 V3 (Phase 2A v3 — Sonnet 통합 초안 + Opus 검수) ──
  | 'blog_unified'           // Sonnet 4.6: 초안+SEO+의료법 1회 통합
  | 'blog_unified_section'   // Sonnet 4.6: 섹션 재생성
  | 'blog_review'            // Opus 4.6: 감수 (JSON 출력)
  // ── 블로그 레거시 (deprecated — Phase 2A v3 에서 blog_unified 로 통합. 호환성만 유지) ──
  | 'blog_draft'
  | 'blog_section_regen'
  | 'blog_polish'
  | 'blog_seo'
  | 'blog_lawcheck'
  | 'blog_final'
  // ── 보도자료 ──
  | 'press'
  // ── 리파인 (실시간 UX) ──
  | 'refine_auto'
  | 'refine_chat'
  // ── 카드뉴스 ──
  | 'card_news'
  // ── 말투 학습 ──
  | 'style_learn'
  // ── 크롤링 글 채점 ──
  | 'score_crawled_post'
  // ── 랜딩 챗봇 (실시간 UX) ──
  | 'landing_chat'
  // ── AEO/GEO 진단 도구 (Gemini 추출 + Sonnet 해설) ──
  | 'diagnostic_extract'
  | 'diagnostic_narrative'
  // ── Gemini googleSearch 강제용 — Claude로 넘어가지 않음 ──
  | 'search_ground';

export interface CacheableBlock {
  type: 'text';
  text: string;
  /** true면 Claude에 cache_control: { type: 'ephemeral' } 주입. Gemini는 무시. */
  cacheable?: boolean;
  /**
   * 기본 '5m'. Batch 대상은 queueLLMBatch 에서 '1h' 로 승격 (Batch 지연 고려).
   * Gemini는 무시.
   */
  cacheTtl?: '5m' | '1h';
}

export interface LLMRequest {
  task: LLMTaskKind;
  /**
   * 순서대로 system 에 합쳐진다. 캐시 대상은 앞쪽에 배치할 것.
   * (Anthropic은 앞쪽 블록이 캐시 prefix가 됨 → 변동 프롬프트는 뒤로)
   */
  systemBlocks: CacheableBlock[];
  /** 사용자 변동 입력 (캐시 안 함) */
  userPrompt: string;
  /** 기본 0.7 */
  temperature?: number;
  /** 기본 8192 */
  maxOutputTokens?: number;
  /** Phase 0에서는 false만 구현. true면 throw */
  stream?: boolean;
  /** true면 provider/model → gemini-3.1-pro-preview 강제 + googleSearch tool on */
  googleSearch?: boolean;
  /** 로깅용 user_id (미지정 시 null) */
  userId?: string | null;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  /** Claude prompt caching read hit (Gemini에서는 항상 0) */
  cacheReadTokens: number;
  /** Claude prompt caching create (Gemini에서는 항상 0) */
  cacheWriteTokens: number;
  /** USD (cost.ts 의 단가표로 산출) */
  costUsd: number;
  /** Batch 경로로 처리됐으면 true (cost 50% 할인 반영됨) */
  isBatch: boolean;
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  usage: LLMUsage;
  latencyMs: number;
  /** Batch 결과일 때만 세팅 */
  customId?: string;
}

// ── Batch 전용 타입 ──

export interface BatchItem {
  /** 호출자가 지정. [A-Za-z0-9_-]{1,64}, 배치 내 중복 금지. */
  customId: string;
  request: LLMRequest;
}

export interface BatchSubmission {
  /** Anthropic batch_id */
  batchId: string;
  /** 현재는 'claude' 만 지원 */
  provider: LLMProvider;
  /** 배치 내 모든 항목이 같은 task 여야 함 */
  task: LLMTaskKind;
  itemCount: number;
  /** ISO */
  submittedAt: string;
  /** Anthropic 미제공 시 null */
  estimatedCompletionAt: string | null;
}

export interface BatchResult {
  batchId: string;
  status: 'in_progress' | 'canceling' | 'ended';
  processedCount: number;
  succeededCount: number;
  erroredCount: number;
  expiredCount: number;
  results: Array<{
    customId: string;
    response: LLMResponse | null;
    error: string | null;
  }>;
}
