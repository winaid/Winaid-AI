/**
 * Cloudflare Pages Function: Gemini API 서버 프록시
 *
 * 클라이언트에서 직접 Gemini API를 호출하지 않고,
 * 이 엔드포인트를 통해 서버 측에서 API 키를 관리하고 호출합니다.
 *
 * POST /api/gemini/generate
 */

interface Env {
  API_KEYS: KVNamespace;
  GEMINI_API_KEY?: string;
  VITE_GEMINI_API_KEY?: string;
  GEMINI_API_KEY_2?: string;
  VITE_GEMINI_API_KEY_2?: string;
  GEMINI_API_KEY_3?: string;
  VITE_GEMINI_API_KEY_3?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// API 키를 환경에서 로드 (KV 우선, env 폴백)
async function getGeminiKeys(env: Env): Promise<string[]> {
  const keys: string[] = [];

  // KV에서 키 로드
  try {
    const kvKey = await env.API_KEYS.get('gemini');
    if (kvKey) keys.push(kvKey);
    const kvKey2 = await env.API_KEYS.get('gemini_2');
    if (kvKey2) keys.push(kvKey2);
    const kvKey3 = await env.API_KEYS.get('gemini_3');
    if (kvKey3) keys.push(kvKey3);
  } catch (e) {
    // KV 접근 실패 시 무시
  }

  // 환경변수 폴백
  if (keys.length === 0) {
    const envKey1 = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
    const envKey2 = env.GEMINI_API_KEY_2 || env.VITE_GEMINI_API_KEY_2;
    const envKey3 = env.GEMINI_API_KEY_3 || env.VITE_GEMINI_API_KEY_3;
    if (envKey1) keys.push(envKey1);
    if (envKey2) keys.push(envKey2);
    if (envKey3) keys.push(envKey3);
  }

  return keys;
}

// 간단한 라운드 로빈 키 선택 (per-request stateless)
let keyIndex = 0;

interface GenerateRequest {
  prompt?: string;
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
  // Raw 모드 (이미지 생성 등)
  raw?: boolean;
  apiBody?: any;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    // 요청 파싱
    const body: GenerateRequest = await request.json();

    // ── Raw 모드: apiBody를 그대로 Gemini REST API에 프록시 ──
    if (body.raw === true) {
      if (!body.model || !body.apiBody) {
        return new Response(
          JSON.stringify({ error: 'raw mode requires model and apiBody' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const keys = await getGeminiKeys(env);
      if (keys.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Gemini API key not configured on server' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }

      const timeout = Math.min(body.timeout || 180000, 300000); // 최대 5분
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      let response: Response | undefined;
      let lastError: any = null;

      for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
        const currentKey = keys[(keyIndex + attempt) % keys.length];
        keyIndex++;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent?key=${currentKey}`;

        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body.apiBody),
            signal: controller.signal,
          });

          if (response.ok || response.status !== 429) {
            break;
          }
          // 429 → 다음 키로 재시도
          lastError = await response.text();
        } catch (fetchErr: any) {
          lastError = fetchErr;
          if (fetchErr.name === 'AbortError') {
            clearTimeout(timeoutId);
            return new Response(
              JSON.stringify({ error: 'Gemini API timeout' }),
              { status: 504, headers: CORS_HEADERS }
            );
          }
          if (attempt >= keys.length - 1) break;
        }
      }

      clearTimeout(timeoutId);

      if (!response) {
        return new Response(
          JSON.stringify({ error: 'All API keys failed', details: String(lastError) }),
          { status: 502, headers: CORS_HEADERS }
        );
      }

      if (!response.ok) {
        const errorBody = await response.text();
        return new Response(
          JSON.stringify({ error: `Gemini API error (${response.status})`, details: errorBody }),
          { status: response.status, headers: CORS_HEADERS }
        );
      }

      // Raw 모드: Gemini 응답 JSON을 그대로 반환
      const rawResult = await response.json();
      return new Response(JSON.stringify(rawResult), { status: 200, headers: CORS_HEADERS });
    }

    // ── 일반 텍스트 생성 모드 ──
    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: 'prompt is required' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // API 키 로드
    const keys = await getGeminiKeys(env);
    if (keys.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured on server' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 라운드 로빈 키 선택
    const apiKey = keys[keyIndex % keys.length];
    keyIndex++;

    // Gemini API 호출 구성
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

    // System instruction
    if (body.systemInstruction) {
      apiConfig.systemInstruction = { parts: [{ text: systemText }] };
    }

    // Thinking config
    if (body.thinkingLevel && body.thinkingLevel !== 'none') {
      const budgetMap = { low: 1024, medium: 4096, high: 8192 };
      apiConfig.generationConfig.thinkingConfig = {
        thinkingBudget: budgetMap[body.thinkingLevel] || 4096,
      };
    }

    // Google Search tool
    if (body.googleSearch) {
      apiConfig.tools = [{ googleSearch: {} }];
    }

    // Response type
    if (body.responseType === 'json') {
      apiConfig.generationConfig.responseMimeType = 'application/json';
      if (body.schema) {
        apiConfig.generationConfig.responseSchema = body.schema;
      }
    } else {
      apiConfig.generationConfig.responseMimeType = 'text/plain';
    }

    // Gemini REST API 호출
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const timeout = Math.min(body.timeout || 120000, 180000); // 최대 3분
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    let lastError: any = null;

    // 최대 2회 시도 (키 로테이션)
    for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
      const currentKey = keys[(keyIndex + attempt) % keys.length];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiConfig),
          signal: controller.signal,
        });

        if (response.ok) {
          clearTimeout(timeoutId);
          break;
        }

        // 429 (quota exceeded) → 다음 키로 재시도
        if (response.status === 429 && attempt < keys.length - 1) {
          lastError = await response.text();
          continue;
        }

        // 다른 에러는 그대로 반환
        clearTimeout(timeoutId);
        const errorBody = await response.text();
        return new Response(
          JSON.stringify({
            error: `Gemini API error (${response.status})`,
            details: errorBody,
          }),
          { status: response.status, headers: CORS_HEADERS }
        );
      } catch (fetchErr: any) {
        lastError = fetchErr;
        if (fetchErr.name === 'AbortError') {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ error: 'Gemini API timeout' }),
            { status: 504, headers: CORS_HEADERS }
          );
        }
        if (attempt >= keys.length - 1) break;
      }
    }

    clearTimeout(timeoutId);

    if (!response!) {
      return new Response(
        JSON.stringify({ error: 'All API keys failed', details: String(lastError) }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const result = await response!.json() as any;

    // 응답에서 텍스트 추출
    const candidates = result.candidates || [];
    const textParts = candidates[0]?.content?.parts || [];
    const text = textParts.map((p: any) => p.text || '').join('');

    // 사용량 메타데이터
    const usageMetadata = result.usageMetadata || null;

    return new Response(
      JSON.stringify({
        text,
        usageMetadata,
        candidates: candidates.length,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
