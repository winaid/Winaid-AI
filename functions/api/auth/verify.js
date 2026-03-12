// POST /auth/verify - 비밀번호 인증 (비활성화됨)
// 비밀번호 인증이 제거되었습니다.
export const onRequestPost = async () => {
  return new Response(JSON.stringify({
    success: false,
    error: '비밀번호 인증이 비활성화되었습니다.'
  }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
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
