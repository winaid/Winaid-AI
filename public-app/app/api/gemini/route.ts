/**
 * /api/gemini — Gemini 프록시 API Route Handler
 *
 * 기존 api/gemini.js의 핵심 텍스트 생성 로직을 Next.js Route Handler로 포팅.
 * 현재 scope: prompt → Gemini generateContent → { text } 반환
 * 미포함: 크레딧 차감, generation token, raw mode, 이미지 생성
 */
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../lib/guestRateLimit';


export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── 멀티키 로테이션 ──

function getKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

let keyIndex = 0;

// ── Gemini API 호출 (키 로테이션 + 재시도) ──

async function fetchGemini(
  keys: string[],
  model: string,
  apiBody: Record<string, unknown>,
  timeout: number,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string; details?: string }> {
  const maxAttempts = Math.min(keys.length, 3);
  const perAttemptTimeout = Math.min(Math.floor(timeout * 0.85), 150000);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ki = (keyIndex + attempt) % keys.length;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeout);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[ki]}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        keyIndex = (ki + 1) % keys.length;
        let data: Record<string, unknown>;
        try {
          data = await response.json() as Record<string, unknown>;
        } catch {
          return { ok: false, status: 502, error: 'Invalid JSON from Gemini API' };
        }
        return { ok: true, data };
      }

      const errorText = await response.text();
      const status = response.status;

      // 429/503: 재시도
      if ((status === 429 || status === 503) && attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, status === 503 ? 3000 : 2000));
        continue;
      }

      const safeDetails = errorText.substring(0, 500).replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
      return { ok: false, status, error: `upstream ${status}`, details: safeDetails };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const error = err as Error;

      if (error.name === 'AbortError') {
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
      const rawMsg = error.message || 'fetch failed';
      // Strip any API key fragments from error messages
      const safeMsg = rawMsg.replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
      return { ok: false, status: 502, error: safeMsg };
    }
  }

  return { ok: false, status: 500, error: 'all keys exhausted' };
}

// ── GET: 헬스 체크 ──

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    keys: getKeys().length,
    timestamp: new Date().toISOString(),
  });
}

// ── OPTIONS: CORS preflight ──

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ── POST: 텍스트 생성 ──

interface GeminiRequestBody {
  prompt?: string;
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  responseType?: string;
  schema?: Record<string, unknown>;
  thinkingLevel?: string;
  timeout?: number;
  googleSearch?: boolean;
  images?: { base64: string; mimeType: string }[];
  inlineImages?: string[];  // data:image/... URL 배열 (카드뉴스 스타일 분석용)
  stream?: boolean;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

export async function POST(request: NextRequest) {
  // 게스트 허용: 로그인 쿠키 없으면 IP 기반 분당 10회 제한
  const gate = gateGuestRequest(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // ═══ body 파싱 (스트리밍/비스트리밍 공통) ═══
  let body: GeminiRequestBody;
  try {
    body = await request.json() as GeminiRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const keys = getKeys();
  if (keys.length === 0) {
    return NextResponse.json({ error: '[env] GEMINI_API_KEY 누락' }, { status: 500 });
  }

  // ═══ 스트리밍 모드 ═══
  if (body.stream === true) {
    const model = body.model || 'gemini-3.1-pro-preview';
    const ki = keyIndex % keys.length;
    keyIndex = (ki + 1) % keys.length;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${keys[ki]}&alt=sse`;

    const streamApiBody: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: body.prompt || '' }] }],
      generationConfig: {
        temperature: body.temperature ?? 0.7,
        maxOutputTokens: body.maxOutputTokens ?? 32768,
        ...(body.responseType === 'json' ? { responseMimeType: 'application/json' } : {}),
        ...(body.schema ? { responseSchema: body.schema } : {}),
      },
    };

    if (body.systemInstruction) {
      streamApiBody.system_instruction = { parts: [{ text: body.systemInstruction }] };
    }
    if (body.googleSearch) {
      streamApiBody.tools = [{ google_search: {} }];
    }
    if (body.thinkingLevel === 'none') {
      (streamApiBody.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: 0 };
    } else if (body.thinkingLevel) {
      const budget: Record<string, number> = { low: 1024, medium: 4096, high: 8192 };
      (streamApiBody.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: budget[body.thinkingLevel] || 4096 };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), body.timeout || 180000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamApiBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ error: `Gemini API ${response.status}`, details: errorText.substring(0, 300) }, { status: 502 });
      }

      const stream = new ReadableStream({
        async start(ctrl) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              for (const line of chunk.split('\n')) {
                if (line.startsWith('data: ')) {
                  try {
                    const json = JSON.parse(line.slice(6));
                    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text) ctrl.enqueue(new TextEncoder().encode(text));
                  } catch { /* partial chunk */ }
                }
              }
            }
          } catch (err) { console.error('[gemini/stream]', err); }
          finally { ctrl.close(); }
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return NextResponse.json({ error: '요청 시간 초과' }, { status: 504 });
      return NextResponse.json({ error: (err as Error).message || '서버 오류' }, { status: 500 });
    }
  }

  // ═══ 비스트리밍 모드 (기존) ═══

  if (!body.prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  if (body.prompt.length > 100000) {
    return NextResponse.json({ error: 'prompt too long (max 100000 chars)' }, { status: 400 });
  }

  // Clamp numeric inputs to safe ranges
  if (body.temperature !== undefined) body.temperature = Math.min(Math.max(body.temperature, 0), 2);
  if (body.topP !== undefined) body.topP = Math.min(Math.max(body.topP, 0), 1);
  if (body.maxOutputTokens !== undefined) body.maxOutputTokens = Math.min(Math.max(body.maxOutputTokens, 1), 65536);
  if (body.timeout !== undefined) body.timeout = Math.min(Math.max(body.timeout, 5000), 180000);

  const model = body.model || 'gemini-3.1-pro-preview';
  const systemText = body.systemInstruction || '';
  const userText = body.prompt;

  // 멀티모달: 이미지 + 텍스트
  const userParts: Array<Record<string, unknown>> = [];
  if (body.images && Array.isArray(body.images)) {
    for (const img of body.images as { base64: string; mimeType: string }[]) {
      userParts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }
  }
  // inlineImages: data:image/... URL 배열 지원
  if (body.inlineImages && Array.isArray(body.inlineImages)) {
    for (const imgUrl of body.inlineImages) {
      const match = (imgUrl as string).match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
  }
  userParts.push({ text: userText });

  // Gemini API body 조립
  const apiBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      temperature: body.temperature ?? 0.85,
      topP: body.topP ?? 0.95,
      maxOutputTokens: body.maxOutputTokens ?? 32768,
      responseMimeType: body.responseType === 'json' ? 'application/json' : 'text/plain',
    },
  };

  if (systemText) {
    apiBody.systemInstruction = { parts: [{ text: systemText }] };
  }

  if (body.schema && body.responseType === 'json') {
    (apiBody.generationConfig as Record<string, unknown>).responseSchema = body.schema;
  }

  // Google Search 연동 (보도자료 등 최신 정보 필요 시)
  if (body.googleSearch) {
    apiBody.tools = [{ googleSearch: {} }];
  }

  if (body.thinkingLevel === 'none') {
    (apiBody.generationConfig as Record<string, unknown>).thinkingConfig = {
      thinkingBudget: 0,
    };
  } else if (body.thinkingLevel) {
    const budget: Record<string, number> = { low: 1024, medium: 4096, high: 8192 };
    (apiBody.generationConfig as Record<string, unknown>).thinkingConfig = {
      thinkingBudget: budget[body.thinkingLevel] || 4096,
    };
  }

  const PRO = 'gemini-3.1-pro-preview';
  const FLASH = 'gemini-3.1-flash-lite-preview';

  const timeout = Math.min(body.timeout || 120000, 180000);
  let result = await fetchGemini(keys, model, apiBody, timeout);
  let fallbackUsed = false;

  // PRO → FLASH 자동 폴백 (500/503/429/504 + timeout)
  if (!result.ok && model === PRO && (result.status === 500 || result.status === 503 || result.status === 429 || result.status === 504)) {
    console.warn(`[FALLBACK] PRO ${result.status} → FLASH`);
    result = await fetchGemini(keys, FLASH, apiBody, 25000);
    fallbackUsed = true;
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status },
    );
  }

  // 응답에서 text 추출
  const candidates = (result.data.candidates || []) as GeminiCandidate[];
  const textParts = candidates[0]?.content?.parts || [];
  const text = textParts.map(p => p.text || '').join('');

  return NextResponse.json({
    text,
    usageMetadata: result.data.usageMetadata || null,
    candidates: candidates.length,
    ...(fallbackUsed && { fallback: FLASH }),
  });
}
