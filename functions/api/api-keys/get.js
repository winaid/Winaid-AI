// GET /api-keys/get - API 키 존재 여부만 반환
// 실제 키 원문은 어떤 경우에도 응답에 포함하지 않음

import { CORS_HEADERS } from './_auth.js';

export const onRequestGet = async (context) => {
  try {
    let geminiExists = false;
    let openaiExists = false;

    if (context.env.API_KEYS) {
      geminiExists = !!(await context.env.API_KEYS.get('gemini'));
      openaiExists = !!(await context.env.API_KEYS.get('openai'));
    }
    if (!geminiExists) {
      geminiExists = !!(context.env.VITE_GEMINI_API_KEY || context.env.GEMINI_API_KEY);
    }
    if (!openaiExists) {
      openaiExists = !!(context.env.VITE_OPENAI_API_KEY || context.env.OPENAI_API_KEY);
    }

    return new Response(JSON.stringify({
      success: true,
      apiKeys: {
        gemini: geminiExists ? '***' : null,
        openai: openaiExists ? '***' : null,
      }
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
};
