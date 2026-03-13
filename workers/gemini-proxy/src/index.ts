/**
 * Gemini API Proxy Worker (standalone)
 *
 * Pages Functions가 아닌 독립 Worker로 배포하여
 * Smart Placement (US 리전)에서 실행.
 * Gemini Developer API의 아시아 지역 제한을 우회.
 *
 * POST /generate
 */

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_2?: string;
  GEMINI_API_KEY_3?: string;
  ALLOWED_ORIGINS?: string; // 쉼표로 구분된 허용 오리진 목록
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

interface GenerateRequest {
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

      if (!body.prompt) {
        return new Response(
          JSON.stringify({ error: 'prompt is required' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const keys = getKeys(env);
      if (keys.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No Gemini API keys configured' }),
          { status: 500, headers: corsHeaders }
        );
      }

      // Gemini API 요청 구성
      const model = body.model || 'gemini-3.1-pro-preview';
      const systemText = body.systemInstruction || body.systemPrompt || '';
      const userText = body.systemInstruction
        ? body.prompt
        : (body.systemPrompt ? `${body.systemPrompt}\n\n${body.prompt}` : body.prompt);

      const apiConfig: any = {
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: body.temperature ?? 0.85,
          topP: body.topP ?? 0.95,
          maxOutputTokens: body.maxOutputTokens ?? 8192,
        },
      };

      if (body.systemInstruction) {
        apiConfig.systemInstruction = { parts: [{ text: systemText }] };
      }

      if (body.thinkingLevel && body.thinkingLevel !== 'none') {
        const budgetMap: Record<string, number> = { low: 1024, medium: 4096, high: 8192 };
        apiConfig.generationConfig.thinkingConfig = {
          thinkingBudget: budgetMap[body.thinkingLevel] || 4096,
        };
      }

      if (body.googleSearch) {
        apiConfig.tools = [{ googleSearch: {} }];
      }

      if (body.responseType === 'json') {
        apiConfig.generationConfig.responseMimeType = 'application/json';
        if (body.schema) {
          apiConfig.generationConfig.responseSchema = body.schema;
        }
      } else {
        apiConfig.generationConfig.responseMimeType = 'text/plain';
      }

      // 타임아웃 설정
      const timeout = Math.min(body.timeout || 120000, 180000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // 키 로테이션으로 최대 2회 시도
      let response: Response | null = null;
      let lastError: string = '';

      for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
        const currentKey = keys[(keyIndex + attempt) % keys.length];
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;

        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiConfig),
            signal: controller.signal,
          });

          if (response.ok) {
            keyIndex = (keyIndex + attempt + 1) % keys.length;
            break;
          }

          // 429 (quota) → 다음 키로 재시도
          if (response.status === 429 && attempt < keys.length - 1) {
            lastError = await response.text();
            response = null;
            continue;
          }

          // 다른 에러 → 그대로 반환
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
          lastError = fetchErr.message || String(fetchErr);
          if (fetchErr.name === 'AbortError') {
            clearTimeout(timeoutId);
            return new Response(
              JSON.stringify({ error: 'Gemini API timeout' }),
              { status: 504, headers: corsHeaders }
            );
          }
          if (attempt >= keys.length - 1) break;
        }
      }

      clearTimeout(timeoutId);

      if (!response) {
        return new Response(
          JSON.stringify({ error: 'All API keys failed', details: lastError }),
          { status: 502, headers: corsHeaders }
        );
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
