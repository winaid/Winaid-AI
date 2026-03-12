// POST /api-keys/save - API 키 저장 (admin 인증 필수)

import { verifyAdmin, CORS_HEADERS } from './_auth.js';

export const onRequestPost = async (context) => {
  // admin 인증
  const authResult = await verifyAdmin(context);
  if (authResult) return authResult; // 인증 실패 응답

  try {
    const { geminiKey, openaiKey } = await context.request.json();
    const saved = {};

    if (geminiKey) {
      await context.env.API_KEYS.put('gemini', geminiKey);
      saved.gemini = true;
    }

    if (openaiKey) {
      await context.env.API_KEYS.put('openai', openaiKey);
      saved.openai = true;
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'API 키가 저장되었습니다.',
      saved
    }), { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }), { status: 500, headers: CORS_HEADERS });
  }
};

// OPTIONS - CORS Preflight
export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
};
