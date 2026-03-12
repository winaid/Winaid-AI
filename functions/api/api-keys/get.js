// GET /api-keys/get - API 키 조회
// 인증된 admin → 실제 키 반환 (프론트 localStorage 세팅용)
// 미인증 → 존재 여부만 반환

import { verifyAdmin, CORS_HEADERS } from './_auth.js';

export const onRequestGet = async (context) => {
  try {
    // API 키 존재 여부 확인
    let geminiKey = null;
    let openaiKey = null;

    if (context.env.API_KEYS) {
      geminiKey = await context.env.API_KEYS.get('gemini');
      openaiKey = await context.env.API_KEYS.get('openai');
    }
    if (!geminiKey) {
      geminiKey = context.env.VITE_GEMINI_API_KEY || context.env.GEMINI_API_KEY || null;
    }
    if (!openaiKey) {
      openaiKey = context.env.VITE_OPENAI_API_KEY || context.env.OPENAI_API_KEY || null;
    }

    // admin 인증 시도 (실패해도 차단하지 않고 존재 여부만 반환)
    const authResult = await verifyAdmin(context);
    const isAdmin = authResult === null;

    if (isAdmin) {
      // 인증된 admin → 실제 키 반환
      return new Response(JSON.stringify({
        success: true,
        apiKeys: {
          gemini: geminiKey || null,
          openai: openaiKey || null,
        }
      }), { status: 200, headers: CORS_HEADERS });
    }

    // 미인증 → 존재 여부만 반환 (실제 키 노출 금지)
    return new Response(JSON.stringify({
      success: true,
      apiKeys: {
        gemini: geminiKey ? '***' : null,
        openai: openaiKey ? '***' : null,
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
