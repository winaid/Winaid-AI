// GET /api-keys/get - API 키 조회 (인증 필요)
export const onRequestGet = async (context) => {
  try {
    // Authorization 헤더 확인
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // 인증 없이 요청 시 키 존재 여부만 반환 (값 노출 안 함)
      const geminiExists = !!(await context.env.API_KEYS.get('gemini'));
      const openaiExists = !!(await context.env.API_KEYS.get('openai'));

      return new Response(JSON.stringify({
        success: true,
        apiKeys: {
          gemini: geminiExists ? '***' : null,
          openai: openaiExists ? '***' : null
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // 인증된 요청: 실제 키 값 반환
    const geminiKey = await context.env.API_KEYS.get('gemini') || null;
    const openaiKey = await context.env.API_KEYS.get('openai') || null;

    return new Response(JSON.stringify({
      success: true,
      apiKeys: {
        gemini: geminiKey,
        openai: openaiKey
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
