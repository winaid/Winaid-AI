/**
 * Claude 어댑터 (sync, 서버 전용).
 *
 * Prompt Caching 1급 구현:
 *   - CacheableBlock.cacheable === true → cache_control: { type: 'ephemeral', ttl }
 *   - Anthropic 제약: 연속 캐시 블록 최대 4개. 초과분은 text-only 로 다운그레이드.
 *   - cacheTtl 기본 '5m'. queueLLMBatch 경로는 '1h' 로 승격 (claudeBatch.ts).
 *
 * 재시도:
 *   - 429 / 529 / 500 / 502 / 503 / 504 / "overloaded_error" → 지수 백오프 (1s → 2s → 4s, 최대 3회)
 *   - 다른 4xx → 즉시 throw
 *   - 멀티키: ANTHROPIC_API_KEY / _2 / _3 순환 (키 1개면 같은 키로 백오프)
 *
 * Phase 0 에서는 stream 미지원 → stream: true 요청 시 throw.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import type { CacheableBlock, LLMRequest, LLMResponse, LLMUsage } from './types';
import { resolveRoute } from './router';
import { fillClaudeUsage } from './cost';

const MAX_CACHE_BLOCKS = 4;

function getClaudeKeys(): string[] {
  const keys: string[] = [];
  for (const envName of ['ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY_2', 'ANTHROPIC_API_KEY_3']) {
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}


/**
 * CacheableBlock[] → Anthropic TextBlockParam[].
 *
 * - cacheable === true 블록을 앞에서부터 최대 4개까지만 cache_control 주입.
 * - 5번째 이상의 cacheable 블록은 경고 + non-cacheable 로 다운그레이드.
 * - cacheTtl 기본 '5m'. overrideTtl 전달 시 블록 레벨 지정 무시하고 통일.
 *
 * claudeBatch.ts 에서도 그대로 재사용 (Batch 의 each request 는 동일한 system 파라미터).
 */
export function buildClaudeSystemParam(
  systemBlocks: CacheableBlock[],
  overrideTtl?: '5m' | '1h',
): TextBlockParam[] {
  const out: TextBlockParam[] = [];
  let cacheBudget = MAX_CACHE_BLOCKS;
  let dropped = 0;

  for (const b of systemBlocks) {
    if (!b.text) continue;
    if (b.cacheable) {
      if (cacheBudget > 0) {
        const ttl = overrideTtl ?? b.cacheTtl ?? '5m';
        out.push({
          type: 'text',
          text: b.text,
          cache_control: { type: 'ephemeral', ttl },
        });
        cacheBudget -= 1;
      } else {
        out.push({ type: 'text', text: b.text });
        dropped += 1;
      }
    } else {
      out.push({ type: 'text', text: b.text });
    }
  }

  if (dropped > 0) {
    console.warn(
      `[llm/claude] cache_control limit reached: ${dropped} cacheable block(s) downgraded to non-cacheable (max ${MAX_CACHE_BLOCKS})`,
    );
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: string; error?: { type?: string } };
  if (e.status && [429, 500, 502, 503, 504, 529].includes(e.status)) return true;
  if (e.error?.type === 'overloaded_error') return true;
  if (typeof e.message === 'string' && /overloaded|rate[_ ]?limit/i.test(e.message)) return true;
  return false;
}

/**
 * Claude 호출 (sync).
 *
 * router.resolveRoute 로 모델을 결정 — 호출자는 req.task 만 신경쓰면 됨.
 * LLM_DISABLE_CLAUDE=true 일 때 router 가 provider='gemini' 를 반환하면 callGemini 를
 * 쓸 것. (이 함수는 provider==='claude' 가 아니면 throw)
 */
export async function callClaude(req: LLMRequest): Promise<LLMResponse> {
  if (req.stream === true) {
    throw new Error('stream is not supported in Phase 0');
  }

  const route = resolveRoute(req.task, { googleSearch: req.googleSearch });
  if (route.provider !== 'claude') {
    throw new Error(`callClaude invoked for non-claude task: ${req.task} → ${route.provider}`);
  }

  const keys = getClaudeKeys();
  if (keys.length === 0) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const system = buildClaudeSystemParam(req.systemBlocks);
  const backoffs = [1000, 2000, 4000];
  const maxAttempts = 3;

  let lastErr: unknown = null;
  const started = Date.now();
  // per-request 랜덤 시작점 — 전역 keyIndex race condition 제거
  const startIdx = Math.floor(Math.random() * keys.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ki = (startIdx + attempt) % keys.length;
    const client = new Anthropic({ apiKey: keys[ki] });

    try {
      // abortSignal 전달 (audit Q-3) — SSE client disconnect 시 SDK 가 in-flight 종료.
      // SDK v0.88+ 의 RequestOptions 두 번째 인자로 signal 전달.
      const resp = await client.messages.create(
        {
          model: route.model,
          max_tokens: req.maxOutputTokens ?? 8192,
          // temperature: 신 reasoning 모델 (claude-opus-4-7, claude-sonnet-4-6 등) 에서
          // "deprecated for this model" 400 응답. SDK 가 받지 않게 아예 omit.
          // 구 모델은 default temperature 사용 (Anthropic 기본값).
          system,
          messages: [{ role: 'user', content: req.userPrompt }],
        },
        req.abortSignal ? { signal: req.abortSignal } : undefined,
      );

      const text = resp.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('');

      const u = resp.usage;
      const usage: LLMUsage = fillClaudeUsage(
        route.model,
        {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        },
        false,
        // cacheTtl: system 에 '1h' 쓴 블록이 하나라도 있으면 1h, 아니면 5m
        req.systemBlocks.some(b => b.cacheable && b.cacheTtl === '1h') ? '1h' : '5m',
      );

      return {
        text,
        provider: 'claude',
        model: route.model,
        usage,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt >= maxAttempts - 1) break;
      const wait = backoffs[Math.min(attempt, backoffs.length - 1)];
      const status = (err as { status?: number })?.status;
      console.warn(`[llm/claude] retry attempt=${attempt + 1} status=${status} wait=${wait}ms`);
      await sleep(wait);
    }
  }

  // 모든 키/재시도 소진 — kill-switch 용 로그
  const errMsg = (lastErr as { message?: string })?.message || 'unknown Anthropic error';
  console.error(`[llm/claude] all attempts exhausted: ${errMsg}`);
  throw new Error(`Claude error: ${errMsg}`);
}
