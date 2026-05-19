/**
 * Gemini grounding (googleSearch) → Citation 추출.
 *
 * 기존 packages/blog-core/src/llm/gemini.ts 는 텍스트만 반환 — groundingMetadata
 * 가 손실됨. 본 모듈은 직접 generativelanguage.googleapis.com 을 호출해 raw 응답에서
 * `candidates[0].groundingMetadata.groundingChunks[].web.{uri, title}` +
 * `groundingSupports[].segment` 를 추출.
 *
 * 멀티키 로테이션 — `GEMINI_API_KEY` / `_2` / `_3` ... 까지 (기존 gemini.ts 동일 패턴).
 * 키 미설정 시 throw — 호출자(API route) 가 503 으로 변환.
 */

import { stripPromptLeakage } from '../promptLeakageGuard';
import { sanitizePromptInput } from '../promptSanitize';
import { normalizeCitations } from './citationExtractor';
import type { Citation, CitationQueryOpts, CitationQueryResult } from './types';

const GEMINI_MODEL = 'gemini-3.1-pro-preview';

interface GeminiGroundingWeb {
  uri?: string;
  title?: string;
}
interface GeminiGroundingChunk {
  web?: GeminiGroundingWeb;
}
interface GeminiGroundingSupport {
  segment?: { startIndex?: number; endIndex?: number; text?: string };
  groundingChunkIndices?: number[];
}
interface GeminiGroundingMetadata {
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: GeminiGroundingSupport[];
}
interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  groundingMetadata?: GeminiGroundingMetadata;
}
interface GeminiSuccessData {
  candidates?: GeminiCandidate[];
}

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

async function fetchGeminiGrounded(
  key: string,
  query: string,
  abortSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<GeminiSuccessData> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = abortSignal
    ? AbortSignal.any([controller.signal, abortSignal])
    : controller.signal;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini grounded HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
    return (await res.json()) as GeminiSuccessData;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Gemini grounding 으로 query 실행 → Citation 추출.
 *
 * @throws GEMINI_API_KEY 미설정 / API 실패 시 (호출자가 503/500 변환)
 */
export async function queryGeminiWithCitations(
  rawQuery: string,
  opts: CitationQueryOpts = {},
): Promise<CitationQueryResult> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_API_KEY not set');

  const query = sanitizePromptInput(rawQuery, 500);
  if (!query) throw new Error('query empty after sanitize');

  // 첫 번째 키로 시도, 429/5xx 면 다음 키로 한 번 재시도
  let data: GeminiSuccessData | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i < Math.min(keys.length, 2); i++) {
    try {
      data = await fetchGeminiGrounded(keys[i], query, opts.abortSignal, 30_000);
      break;
    } catch (e) {
      lastErr = e;
      if (i + 1 < Math.min(keys.length, 2)) continue;
      throw e;
    }
  }
  if (!data) throw lastErr instanceof Error ? lastErr : new Error('Gemini failed');

  const cand = data.candidates?.[0];
  const answerRaw = (cand?.content?.parts || [])
    .map(p => p.text || '')
    .join('')
    .trim();
  const answer = stripPromptLeakage(answerRaw, false).html;

  const chunks: GeminiGroundingChunk[] = cand?.groundingMetadata?.groundingChunks || [];
  const supports: GeminiGroundingSupport[] = cand?.groundingMetadata?.groundingSupports || [];

  // chunk index → support 의 첫 등장 segment.text (snippet) 매핑
  const chunkSnippet = new Map<number, string>();
  for (const sup of supports) {
    const seg = sup.segment?.text;
    if (!seg) continue;
    for (const ci of sup.groundingChunkIndices || []) {
      if (!chunkSnippet.has(ci)) chunkSnippet.set(ci, seg);
    }
  }

  const rawSources: string[] = [];
  const extra: Record<string, { title?: string; snippet?: string }> = {};
  chunks.forEach((c, idx) => {
    const uri = c.web?.uri;
    if (!uri) return;
    rawSources.push(uri);
    extra[uri] = {};
    if (c.web?.title) extra[uri].title = c.web.title;
    const snip = chunkSnippet.get(idx);
    if (snip) extra[uri].snippet = snip;
  });

  const citations: Citation[] = await normalizeCitations(
    rawSources,
    opts.ourDomains || [],
    opts.unwrapTimeoutMs ?? 3000,
    extra,
  );

  return {
    answer,
    citations,
    rawSources,
    model: GEMINI_MODEL,
  };
}
