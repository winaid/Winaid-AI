// GET /api-keys/get - API 키 조회
export const onRequestGet = async (context) => {
  try {
    // KV namespace에서 읽기 (있으면), 없으면 환경변수 fallback
    let geminiKey = null;
    let openaiKey = null;

    // 1순위: KV namespace (API_KEYS)
    if (context.env.API_KEYS) {
      geminiKey = await context.env.API_KEYS.get('gemini');
      openaiKey = await context.env.API_KEYS.get('openai');
    }

    // 2순위: 환경변수 (Cloudflare Dashboard에서 설정)
    if (!geminiKey) {
      geminiKey = context.env.VITE_GEMINI_API_KEY || context.env.GEMINI_API_KEY || null;
    }
    if (!openaiKey) {
      openaiKey = context.env.VITE_OPENAI_API_KEY || context.env.OPENAI_API_KEY || null;
    }

    return new Response(JSON.stringify({
      success: true,
      apiKeys: {
        gemini: geminiKey || null,
        openai: openaiKey || null
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};

// OPTIONS - CORS Preflight
export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
};
