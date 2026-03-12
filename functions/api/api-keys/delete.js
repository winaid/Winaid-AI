// DELETE /api-keys/delete - API 키 삭제 (admin 인증 필수)

import { verifyAdmin, CORS_HEADERS } from './_auth.js';

export const onRequestDelete = async (context) => {
  // admin 인증
  const authResult = await verifyAdmin(context);
  if (authResult) return authResult; // 인증 실패 응답

  try {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type'); // 'gemini' or 'openai'

    if (type === 'gemini') {
      await context.env.API_KEYS.delete('gemini');
      return new Response(JSON.stringify({
        success: true,
        message: 'Gemini API 키가 삭제되었습니다.'
      }), { status: 200, headers: CORS_HEADERS });
    } else if (type === 'openai') {
      await context.env.API_KEYS.delete('openai');
      return new Response(JSON.stringify({
        success: true,
        message: 'OpenAI API 키가 삭제되었습니다.'
      }), { status: 200, headers: CORS_HEADERS });
    } else if (!type) {
      await context.env.API_KEYS.delete('gemini');
      await context.env.API_KEYS.delete('openai');
      return new Response(JSON.stringify({
        success: true,
        message: '모든 API 키가 삭제되었습니다.'
      }), { status: 200, headers: CORS_HEADERS });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: '올바른 키 타입을 지정해주세요. (gemini, openai)'
      }), { status: 400, headers: CORS_HEADERS });
    }
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
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
};
