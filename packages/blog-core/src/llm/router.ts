/**
 * LLM 라우터 — task → { provider, model, batchPreferred }.
 *
 * 결정 순서:
 *   1. opts.googleSearch === true → ('gemini', 'gemini-3.1-pro-preview') 강제
 *      (search_ground 태스크와 동일 동작)
 *   2. LLM_OVERRIDE_<TASK_UPPER> 환경변수 — 예: LLM_OVERRIDE_BLOG_FINAL=claude:claude-sonnet-4-6
 *   3. 기본 매핑 (DEFAULT_ROUTING)
 *
 * LLM_DISABLE_CLAUDE === 'true' 이면 모든 Claude 태스크가 Gemini로 폴백.
 * (오버라이드가 Claude 라도 fallback 모델로 치환)
 */

import type { LLMProvider, LLMTaskKind } from './types';

export interface Route {
  provider: LLMProvider;
  model: string;
  /** Batch API 적합 여부 (실시간 UX가 아닌 태스크만 true) */
  batchPreferred: boolean;
}

interface RouteDefinition {
  provider: LLMProvider;
  model: string;
  batchPreferred: boolean;
}

const DEFAULT_ROUTING: Record<LLMTaskKind, RouteDefinition> = {
  // ── Phase 2A v3: 통합 초안 + Opus 검수 ──
  blog_unified:         { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  blog_unified_section: { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  blog_review:          { provider: 'claude', model: 'claude-opus-4-7',           batchPreferred: false },
  // ── 레거시 (deprecated — blog_unified 로 통합됨. 호환성만 유지) ──
  blog_draft:         { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  blog_section_regen: { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  blog_polish:        { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  blog_seo:           { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  blog_lawcheck:      { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  blog_final:         { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  press:              { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: true  },
  refine_auto:        { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  refine_chat:        { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  card_news:          { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: false },
  style_learn:        { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: true  },
  score_crawled_post: { provider: 'claude', model: 'claude-haiku-4-5-20251001', batchPreferred: true  },
  landing_chat:       { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview', batchPreferred: false },
  diagnostic_extract: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview', batchPreferred: false },
  diagnostic_narrative: { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  search_ground:      { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview', batchPreferred: false },
  // Gemini→Claude 전환용 신규 task
  blog_title_recommend: { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  blog_seo_eval:        { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  blog_image_prompt:    { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
  blog_outline:         { provider: 'claude', model: 'claude-sonnet-4-6',         batchPreferred: false },
};

/** Claude 전역 비활성 시 떨어질 Gemini 모델 */
const GEMINI_FALLBACK_MODEL: Record<LLMTaskKind, string> = {
  // ── Phase 2A v3 ──
  blog_unified:         'gemini-3.1-pro-preview',
  blog_unified_section: 'gemini-3.1-pro-preview',
  blog_review:          'gemini-3.1-pro-preview',
  // ── 레거시 ──
  blog_draft:         'gemini-3.1-flash-lite-preview',
  blog_section_regen: 'gemini-3.1-flash-lite-preview',
  blog_polish:        'gemini-3.1-flash-lite-preview',
  blog_seo:           'gemini-3.1-flash-lite-preview',
  blog_lawcheck:      'gemini-3.1-flash-lite-preview',
  blog_final:         'gemini-3.1-pro-preview',
  press:              'gemini-3.1-pro-preview',
  refine_auto:        'gemini-3.1-flash-lite-preview',
  refine_chat:        'gemini-3.1-flash-lite-preview',
  card_news:          'gemini-3.1-flash-lite-preview',
  style_learn:        'gemini-3.1-pro-preview',
  score_crawled_post: 'gemini-3.1-flash-lite-preview',
  landing_chat:       'gemini-3.1-flash-lite-preview',
  diagnostic_extract: 'gemini-3.1-flash-lite-preview',
  diagnostic_narrative: 'gemini-3.1-pro-preview',
  search_ground:      'gemini-3.1-flash-lite-preview',
  blog_title_recommend: 'gemini-3.1-flash-lite-preview',
  blog_seo_eval:        'gemini-3.1-flash-lite-preview',
  blog_image_prompt:    'gemini-3.1-flash-lite-preview',
  blog_outline:         'gemini-3.1-flash-lite-preview',
};

/**
 * LLMTaskKind exhaustive check — 새 태스크 추가 시 컴파일 에러로 강제.
 * (DEFAULT_ROUTING / GEMINI_FALLBACK_MODEL 에 매핑 누락 방지)
 */
function assertNever(x: never): never {
  throw new Error(`Unhandled LLMTaskKind: ${String(x)}`);
}
function exhaustiveCheck(task: LLMTaskKind): void {
  switch (task) {
    case 'blog_unified':
    case 'blog_unified_section':
    case 'blog_review':
    case 'blog_draft':
    case 'blog_section_regen':
    case 'blog_polish':
    case 'blog_seo':
    case 'blog_lawcheck':
    case 'blog_final':
    case 'press':
    case 'refine_auto':
    case 'refine_chat':
    case 'card_news':
    case 'style_learn':
    case 'score_crawled_post':
    case 'landing_chat':
    case 'diagnostic_extract':
    case 'diagnostic_narrative':
    case 'search_ground':
    case 'blog_title_recommend':
    case 'blog_seo_eval':
    case 'blog_image_prompt':
    case 'blog_outline':
      return;
    default:
      assertNever(task);
  }
}

function parseOverride(raw: string | undefined): { provider: LLMProvider; model: string } | null {
  if (!raw) return null;
  const [providerRaw, ...rest] = raw.split(':');
  const provider = providerRaw?.trim().toLowerCase();
  const model = rest.join(':').trim();
  if ((provider !== 'gemini' && provider !== 'claude') || !model) {
    console.warn(`[llm/router] invalid override: "${raw}" (expected "gemini:<model>" or "claude:<model>")`);
    return null;
  }
  return { provider, model };
}

function isClaudeDisabled(): boolean {
  return String(process.env.LLM_DISABLE_CLAUDE || '').toLowerCase() === 'true';
}

/**
 * task → Route 해결.
 *
 * @param task  태스크 종류
 * @param opts.googleSearch true면 무조건 gemini-3.1-pro-preview 강제
 */
export function resolveRoute(
  task: LLMTaskKind,
  opts?: { googleSearch?: boolean },
): Route {
  exhaustiveCheck(task);

  // 1. googleSearch 최우선
  if (opts?.googleSearch === true) {
    return { provider: 'gemini', model: 'gemini-3.1-pro-preview', batchPreferred: false };
  }

  const base = DEFAULT_ROUTING[task];
  const disabled = isClaudeDisabled();

  // 2. 태스크별 오버라이드
  const envName = `LLM_OVERRIDE_${task.toUpperCase()}`;
  const override = parseOverride(process.env[envName]);
  if (override) {
    if (disabled && override.provider === 'claude') {
      return {
        provider: 'gemini',
        model: GEMINI_FALLBACK_MODEL[task],
        batchPreferred: false, // Gemini는 Batch 미지원
      };
    }
    return {
      provider: override.provider,
      model: override.model,
      batchPreferred: override.provider === 'claude' ? base.batchPreferred : false,
    };
  }

  // 3. 기본
  if (disabled && base.provider === 'claude') {
    return {
      provider: 'gemini',
      model: GEMINI_FALLBACK_MODEL[task],
      batchPreferred: false,
    };
  }
  return { ...base };
}

/** Batch API 적합 여부 (실시간 UX 아닌 것만 true) */
export function isBatchable(task: LLMTaskKind): boolean {
  exhaustiveCheck(task);
  return DEFAULT_ROUTING[task].batchPreferred;
}
