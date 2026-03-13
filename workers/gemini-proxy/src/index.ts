/**
 * Gemini API Proxy Worker (standalone)
 *
 * 독립 Worker로 배포하여 Smart Placement (US 리전)에서 실행.
 * Gemini Developer API의 아시아 지역 제한을 우회.
 *
 * 두 가지 모드를 지원:
 * 1. 일반 모드: prompt 기반 텍스트 생성 (POST /generate)
 * 2. Raw 모드: apiBody를 Gemini API에 그대로 프록시 (이미지 생성 등)
 *
 * POST /generate
 */

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_2?: string;
  GEMINI_API_KEY_3?: string;
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://story-darugi.com',
  'https://www.story-darugi.com',
  'https://ai-hospital.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : DEFAULT_ALLOWED_ORIGINS;

  const isAllowed = allowedOrigins.some(allowed =>
    origin === allowed || origin.endsWith('.pages.dev')
  );

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : DEFAULT_ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

// 라운드 로빈 키 인덱스
let keyIndex = 0;

function getKeys(env: Env): string[] {
  const keys: string[] = [];
  if (env.GEMINI_API_KEY) keys.push(env.GEMINI_API_KEY);
  if (env.GEMINI_API_KEY_2) keys.push(env.GEMINI_API_KEY_2);
  if (env.GEMINI_API_KEY_3) keys.push(env.GEMINI_API_KEY_3);
  return keys;
}

// ── 요청 타입 ──

interface TextGenerateRequest {
  raw?: false;
  prompt: string;
  model?: string;
  systemPrompt?: string;
  systemInstruction?: string;
  responseType?: 'json' | 'text';
  schema?: any;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  googleSearch?: boolean;
  thinkingLevel?: 'none' | 'low' | 'medium' | 'high';
  timeout?: number;
}

interface RawGenerateRequest {
  raw: true;
  model: string;
  apiBody: any;
  timeout?: number;
}

type GenerateRequest = TextGenerateRequest | RawGenerateRequest;

// ── Gemini API fetch + 키 로테이션 ──

interface GeminiFetchOptions {
  keys: string[];
  model: string;
  apiBody: any;
  timeout: number;
  corsHeaders: Record<string, string>;
}

async function fetchGeminiWithRotation(opts: GeminiFetchOptions): Promise<Response> {
  const { keys, model, apiBody, timeout, corsHeaders } = opts;
  const maxAttempts = Math.min(keys.length, 3);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError: string = '';

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentKey = keys[(keyIndex + attempt) % keys.length];
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiBody),
          signal: controller.signal,
        });

        // 성공 → 키 인덱스 전진
        if (response.ok) {
          keyIndex = (keyIndex + attempt + 1) % keys.length;
          clearTimeout(timeoutId);
          return response;
        }

        // 429 (quota) → 다음 키로 재시도
        if (response.status === 429 && attempt < maxAttempts - 1) {
          lastError = await response.text();
          continue;
        }

        // 그 외 에러 → Gemini 원본 상태코드 투명 전달
        clearTimeout(timeoutId);
        const errorBody = await response.text();
        return new Response(
          JSON.stringify({
            error: `Gemini API error (${response.status})`,
            details: errorBody,
          }),
          { status: response.status, headers: corsHeaders }
        );
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ error: 'Gemini API timeout', timeout }),
            { status: 504, headers: corsHeaders }
          );
        }
        lastError = fetchErr.message || String(fetchErr);
        if (attempt >= maxAttempts - 1) break;
      }
    }

    clearTimeout(timeoutId);
    return new Response(
      JSON.stringify({ error: 'All API keys failed', details: lastError }),
      { status: 502, headers: corsHeaders }
    );
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// ── Worker 엔트리포인트 ──

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // POST /generate 만 허용
    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.endsWith('/generate')) {
      return new Response(
        JSON.stringify({ error: 'POST /generate only' }),
        { status: 404, headers: corsHeaders }
      );
    }

    try {
      const body: GenerateRequest = await request.json();

      // API 키 검증
      const keys = getKeys(env);
      if (keys.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No Gemini API keys configured' }),
          { status: 500, headers: corsHeaders }
        );
      }

      // ================================================================
      // Raw 모드: apiBody를 Gemini REST API에 그대로 프록시
      // 이미지 생성/편집 등 고급 기능에 사용
      // 클라이언트: callGeminiRaw() → { raw: true, model, apiBody, timeout }
      // ================================================================
      if (body.raw === true) {
        const rawBody = body as RawGenerateRequest;

        if (!rawBody.model) {
          return new Response(
            JSON.stringify({ error: 'raw mode requires model' }),
            { status: 400, headers: corsHeaders }
          );
        }
        if (!rawBody.apiBody) {
          return new Response(
            JSON.stringify({ error: 'raw mode requires apiBody' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // 이미지 생성은 시간이 오래 걸리므로 timeout 상한을 높게
        const timeout = Math.min(rawBody.timeout || 180000, 300000);

        const response = await fetchGeminiWithRotation({
          keys,
          model: rawBody.model,
          apiBody: rawBody.apiBody,
          timeout,
          corsHeaders,
        });

        // fetchGeminiWithRotation이 에러 Response를 반환한 경우 그대로 전달
        if (!response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
          return response;
        }

        // Raw 모드: Gemini 응답 JSON을 가공 없이 그대로 반환
        const result = await response.json();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // ================================================================
      // 일반 모드: prompt 기반 텍스트 생성
      // 클라이언트: callGemini() → { prompt, model, ... }
      // ================================================================
      const textBody = body as TextGenerateRequest;

      if (!textBody.prompt) {
        return new Response(
          JSON.stringify({ error: 'prompt is required' }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Gemini API 요청 구성
      const model = textBody.model || 'gemini-3.1-pro-preview';
      const systemText = textBody.systemInstruction || textBody.systemPrompt || '';
      const userText = textBody.systemInstruction
        ? textBody.prompt
        : (textBody.systemPrompt ? `${textBody.systemPrompt}\n\n${textBody.prompt}` : textBody.prompt);

      const apiConfig: any = {
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: textBody.temperature ?? 0.85,
          topP: textBody.topP ?? 0.95,
          maxOutputTokens: textBody.maxOutputTokens ?? 8192,
        },
      };

      if (textBody.systemInstruction) {
        apiConfig.systemInstruction = { parts: [{ text: systemText }] };
      }

      if (textBody.thinkingLevel && textBody.thinkingLevel !== 'none') {
        const budgetMap: Record<string, number> = { low: 1024, medium: 4096, high: 8192 };
        apiConfig.generationConfig.thinkingConfig = {
          thinkingBudget: budgetMap[textBody.thinkingLevel] || 4096,
        };
      }

      if (textBody.googleSearch) {
        apiConfig.tools = [{ googleSearch: {} }];
      }

      if (textBody.responseType === 'json') {
        apiConfig.generationConfig.responseMimeType = 'application/json';
        if (textBody.schema) {
          apiConfig.generationConfig.responseSchema = textBody.schema;
        }
      } else {
        apiConfig.generationConfig.responseMimeType = 'text/plain';
      }

      // 텍스트 생성 timeout (이미지보다 짧게)
      const timeout = Math.min(textBody.timeout || 120000, 180000);

      const response = await fetchGeminiWithRotation({
        keys,
        model,
        apiBody: apiConfig,
        timeout,
        corsHeaders,
      });

      // 에러 Response인 경우 그대로 전달
      if (!response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
        return response;
      }

      const result: any = await response.json();
      const candidates = result.candidates || [];
      const textParts = candidates[0]?.content?.parts || [];
      const text = textParts.map((p: any) => p.text || '').join('');

      return new Response(
        JSON.stringify({
          text,
          usageMetadata: result.usageMetadata || null,
          candidates: candidates.length,
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message || 'Internal server error' }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
