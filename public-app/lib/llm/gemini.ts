/**
 * Gemini 어댑터 (sync, 서버 전용).
 *
 * 기존 app/api/gemini/route.ts 의 멀티키 로테이션/폴백을 내부 함수로 이식.
 * self-fetch 금지 — 같은 프로세스에서 직접 Gemini API 호출.
 *
 * systemBlocks 는 '\n\n' join → systemInstruction. Gemini는 prompt caching 미지원이므로
 * CacheableBlock.cacheable / cacheTtl 필드는 무시한다.
 */

import type { CacheableBlock, LLMRequest, LLMResponse, LLMUsage } from './types';
import { resolveRoute } from './router';
import { fillGeminiUsage } from './cost';

const PRO = 'gemini-3.1-pro-preview';
const FLASH = 'gemini-3.1-flash-lite-preview';

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}
interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}
interface GeminiSuccessData {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}
type GeminiResult =
  | { ok: true; data: GeminiSuccessData }
  | { ok: false; status: number; error: string; details?: string };

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

// 모듈 레벨 라운드로빈 인덱스 (기존 route.ts 와 동일 패턴)
let keyIndex = 0;

function redactKey(text: string): string {
  return text.replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
}

async function fetchGemini(
  keys: string[],
  model: string,
  apiBody: Record<string, unknown>,
  timeoutMs: number,
): Promise<GeminiResult> {
  const maxAttempts = Math.min(Math.max(keys.length, 1), 3);
  const perAttemptTimeout = Math.min(Math.floor(timeoutMs * 0.85), 150_000);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ki = (keyIndex + attempt) % keys.length;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeout);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': keys[ki],
        },
        body: JSON.stringify(apiBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        keyIndex = (ki + 1) % keys.length;
        try {
          const data = (await response.json()) as GeminiSuccessData;
          return { ok: true, data };
        } catch {
          return { ok: false, status: 502, error: 'Invalid JSON from Gemini API' };
        }
      }

      const errorText = await response.text();
      const status = response.status;

      if ((status === 429 || status === 503 || status === 500 || status === 504) && attempt < maxAttempts - 1) {
        const wait = status === 503 ? 3000 : status === 429 ? 2000 : 500;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const safeDetails = redactKey(errorText.substring(0, 500));
      return { ok: false, status, error: `upstream ${status}`, details: safeDetails };
    } catch (err) {
      clearTimeout(timeoutId);
      const e = err as Error;
      if (e.name === 'AbortError') {
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        return { ok: false, status: 504, error: 'Gemini API timeout' };
      }
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      return { ok: false, status: 502, error: redactKey(e.message || 'fetch failed') };
    }
  }

  return { ok: false, status: 500, error: 'all keys exhausted' };
}

/**
 * systemBlocks → single systemInstruction 문자열.
 * cacheable 플래그는 Gemini에서 의미 없음 (prompt caching 미지원). 무시.
 */
function joinSystem(blocks: CacheableBlock[]): string {
  return blocks
    .filter(b => b.text && b.text.trim().length > 0)
    .map(b => b.text)
    .join('\n\n');
}

/**
 * Gemini 호출. router.resolveRoute 에서 이미 모델이 결정되어 있는 req 를 받음.
 * PRO 모델 실패 시 FLASH 폴백 (googleSearch 요청은 폴백 안 함 — 품질 유지).
 */
export async function callGemini(req: LLMRequest): Promise<LLMResponse> {
  if (req.stream === true) {
    throw new Error('stream is not supported in Phase 0');
  }

  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const route = resolveRoute(req.task, { googleSearch: req.googleSearch });
  // router는 이미 googleSearch 처리 완료. provider가 claude이면 호출자 실수.
  if (route.provider !== 'gemini') {
    throw new Error(`callGemini invoked for non-gemini task: ${req.task} → ${route.provider}`);
  }

  const model = route.model;
  const systemText = joinSystem(req.systemBlocks);

  const apiBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxOutputTokens ?? 8192,
    },
  };
  if (systemText) {
    apiBody.systemInstruction = { parts: [{ text: systemText }] };
  }
  if (req.googleSearch) {
    apiBody.tools = [{ googleSearch: {} }];
  }

  const started = Date.now();
  let result = await fetchGemini(keys, model, apiBody, 60_000);

  // PRO → FLASH 폴백 (googleSearch 요청은 품질 유지 위해 폴백 금지)
  if (
    !result.ok &&
    model === PRO &&
    !req.googleSearch &&
    (result.status === 500 || result.status === 503 || result.status === 429 || result.status === 504)
  ) {
    console.warn(`[llm/gemini] FALLBACK ${model} ${result.status} → ${FLASH}`);
    result = await fetchGemini(keys, FLASH, apiBody, 25_000);
  }

  const latencyMs = Date.now() - started;

  if (!result.ok) {
    const detail = result.details ? `: ${result.details}` : '';
    throw new Error(`Gemini error (${result.status}) ${result.error}${detail}`);
  }

  const usedModel = model; // (폴백이 일어났어도 위 로그로 이미 노출)
  const text = (result.data.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '')
    .join('');

  const meta = result.data.usageMetadata || {};
  const usage: LLMUsage = fillGeminiUsage(usedModel, {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
  });

  return {
    text,
    provider: 'gemini',
    model: usedModel,
    usage,
    latencyMs,
  };
}
