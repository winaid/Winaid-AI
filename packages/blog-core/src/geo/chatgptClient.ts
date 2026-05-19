/**
 * OpenAI Responses API + web_search tool → Citation 추출.
 *
 * Responses API 응답 shape (정상 케이스):
 *   output: [
 *     { type: 'web_search_call', ... },             // tool 호출 메타 (URL 직접 노출 안 됨)
 *     { type: 'message', content: [
 *         { type: 'output_text', text: '...',
 *           annotations: [
 *             { type: 'url_citation', url, title?, start_index?, end_index? }, ...
 *           ]
 *         }
 *     ] },
 *   ]
 *
 * 멀티키 로테이션 — `OPENAI_API_KEY` / `_2` / `_3` ... (public-app image route 동일 패턴).
 *
 * openai SDK 의존성은 호출 코드에서는 안 쓰고, raw fetch — 의존 안전 + 응답 shape 직접 검증.
 */

import { stripPromptLeakage } from '../promptLeakageGuard';
import { sanitizePromptInput } from '../promptSanitize';
import { normalizeCitations } from './citationExtractor';
import type { Citation, CitationQueryOpts, CitationQueryResult } from './types';

const OPENAI_MODEL = 'gpt-4o';

interface OpenAIAnnotation {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}
interface OpenAIContentItem {
  type?: string;
  text?: string;
  annotations?: OpenAIAnnotation[];
}
interface OpenAIOutputItem {
  type?: string;
  content?: OpenAIContentItem[];
}
interface OpenAIResponseSuccess {
  output?: OpenAIOutputItem[];
  output_text?: string; // SDK convenience field (있으면 사용)
}

function getOpenAIKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'OPENAI_API_KEY' : `OPENAI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

async function fetchOpenAIResponses(
  key: string,
  query: string,
  abortSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<OpenAIResponseSuccess> {
  const url = 'https://api.openai.com/v1/responses';
  const body = {
    model: OPENAI_MODEL,
    input: query,
    tools: [{ type: 'web_search' }],
    temperature: 0.3,
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
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`OpenAI Responses HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
    return (await res.json()) as OpenAIResponseSuccess;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * ChatGPT (web_search) 로 query 실행 → Citation 추출.
 *
 * @throws OPENAI_API_KEY 미설정 / API 실패 시 (호출자가 503/500 변환)
 */
export async function queryChatGptWithCitations(
  rawQuery: string,
  opts: CitationQueryOpts = {},
): Promise<CitationQueryResult> {
  const keys = getOpenAIKeys();
  if (keys.length === 0) throw new Error('OPENAI_API_KEY not set');

  const query = sanitizePromptInput(rawQuery, 500);
  if (!query) throw new Error('query empty after sanitize');

  // 첫 번째 키로 시도, 실패 시 다음 키 한 번 재시도
  let data: OpenAIResponseSuccess | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i < Math.min(keys.length, 2); i++) {
    try {
      data = await fetchOpenAIResponses(keys[i], query, opts.abortSignal, 30_000);
      break;
    } catch (e) {
      lastErr = e;
      if (i + 1 < Math.min(keys.length, 2)) continue;
      throw e;
    }
  }
  if (!data) throw lastErr instanceof Error ? lastErr : new Error('OpenAI failed');

  // 답변 텍스트 — output_text (SDK convenience) 가 있으면 우선 사용
  let answerRaw = '';
  const messageItems = (data.output || []).filter(o => o.type === 'message');
  if (data.output_text) {
    answerRaw = data.output_text;
  } else {
    for (const m of messageItems) {
      for (const c of m.content || []) {
        if (c.type === 'output_text' && c.text) answerRaw += c.text;
      }
    }
  }
  const answer = stripPromptLeakage(answerRaw.trim(), false).html;

  // url_citation annotation 추출 + paragraph_index 추정 (start_index 기반 단락 분할)
  const paragraphBoundaries = computeParagraphBoundaries(answerRaw);
  const rawSources: string[] = [];
  const extra: Record<string, { title?: string; snippet?: string; paragraph_index?: number }> = {};

  for (const m of messageItems) {
    for (const c of m.content || []) {
      for (const a of c.annotations || []) {
        if (a.type !== 'url_citation' || !a.url) continue;
        rawSources.push(a.url);
        const entry: { title?: string; snippet?: string; paragraph_index?: number } = {};
        if (a.title) entry.title = a.title;
        if (typeof a.start_index === 'number' && typeof a.end_index === 'number') {
          entry.snippet = answerRaw.slice(a.start_index, a.end_index).trim() || undefined;
          entry.paragraph_index = findParagraphIndex(a.start_index, paragraphBoundaries);
        }
        // 동일 URL 이 여러 단락에서 인용되면 첫 등장 메타만 보존 (normalizeCitations 가 de-dup)
        if (!extra[a.url]) extra[a.url] = entry;
      }
    }
  }

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
    model: OPENAI_MODEL,
  };
}

/** 본문에서 단락 (\n\n 분할) boundary index list 반환 — [start, end] 페어. */
function computeParagraphBoundaries(text: string): Array<{ start: number; end: number }> {
  if (!text) return [];
  const result: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  const parts = text.split(/\n{2,}/);
  for (const p of parts) {
    result.push({ start: cursor, end: cursor + p.length });
    cursor += p.length + 2; // approximate '\n\n'
  }
  return result;
}

/** start_index 가 어느 단락에 속하는지 0-based index 반환 (못 찾으면 -1). */
function findParagraphIndex(idx: number, boundaries: Array<{ start: number; end: number }>): number {
  for (let i = 0; i < boundaries.length; i++) {
    if (idx >= boundaries[i].start && idx <= boundaries[i].end) return i;
  }
  return -1;
}
