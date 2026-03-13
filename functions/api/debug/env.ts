/**
 * 디버그 엔드포인트: 환경변수/KV 바인딩 존재 여부 확인
 * 실제 키 값은 절대 반환하지 않음
 *
 * GET /api/debug/env
 */

interface Env {
  API_KEYS: KVNamespace;
  CONTENT_KV: KVNamespace;
  GEMINI_API_KEY?: string;
  VITE_GEMINI_API_KEY?: string;
  GEMINI_API_KEY_2?: string;
  VITE_GEMINI_API_KEY_2?: string;
  GEMINI_API_KEY_3?: string;
  VITE_GEMINI_API_KEY_3?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  // KV에서 키 존재 여부 확인
  let kvGemini = false;
  let kvGemini2 = false;
  let kvGemini3 = false;
  let kvBindingExists = false;

  try {
    kvBindingExists = !!env.API_KEYS;
    if (kvBindingExists) {
      const v1 = await env.API_KEYS.get('gemini');
      const v2 = await env.API_KEYS.get('gemini_2');
      const v3 = await env.API_KEYS.get('gemini_3');
      kvGemini = !!v1;
      kvGemini2 = !!v2;
      kvGemini3 = !!v3;
    }
  } catch (e) {
    // KV 접근 실패
  }

  const result = {
    // 환경변수 존재 여부 (값은 절대 반환 안 함)
    envVars: {
      GEMINI_API_KEY: !!env.GEMINI_API_KEY,
      VITE_GEMINI_API_KEY: !!env.VITE_GEMINI_API_KEY,
      GEMINI_API_KEY_2: !!env.GEMINI_API_KEY_2,
      VITE_GEMINI_API_KEY_2: !!env.VITE_GEMINI_API_KEY_2,
      GEMINI_API_KEY_3: !!env.GEMINI_API_KEY_3,
      VITE_GEMINI_API_KEY_3: !!env.VITE_GEMINI_API_KEY_3,
    },
    // KV 바인딩 및 키 존재 여부
    kv: {
      API_KEYS_binding: kvBindingExists,
      gemini: kvGemini,
      gemini_2: kvGemini2,
      gemini_3: kvGemini3,
    },
    // 요청 메타데이터 (디버그용)
    request: {
      url: request.url,
      cf_colo: (request as any).cf?.colo || 'unknown', // Cloudflare edge 위치
      cf_country: (request as any).cf?.country || 'unknown',
    },
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: CORS_HEADERS,
  });
};
