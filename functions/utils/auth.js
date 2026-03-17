// 공통 admin 인증 가드
// Supabase RPC get_admin_stats를 재사용하여 비밀번호 검증

export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Authorization 헤더에서 admin 비밀번호를 추출하고 Supabase RPC로 검증
 * @returns {string|null} null이면 인증 성공, Response 객체면 실패 응답
 */
export async function verifyAdmin(context) {
  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({
      success: false,
      error: '관리자 인증이 필요합니다.',
    }), { status: 401, headers: CORS_HEADERS });
  }

  const adminPassword = authHeader.slice(7); // "Bearer " 제거
  if (!adminPassword) {
    return new Response(JSON.stringify({
      success: false,
      error: '인증 토큰이 비어 있습니다.',
    }), { status: 401, headers: CORS_HEADERS });
  }

  // Supabase RPC로 비밀번호 검증
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const supabaseKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Supabase 미설정 시: 환경변수 ADMIN_PASSWORD로 대체 검증
    const envPassword = context.env.ADMIN_PASSWORD;
    if (envPassword && adminPassword === envPassword) {
      return null; // 인증 성공
    }
    return new Response(JSON.stringify({
      success: false,
      error: '인증 서버 설정 오류',
    }), { status: 500, headers: CORS_HEADERS });
  }

  try {
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_admin_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ admin_password: adminPassword }),
    });

    if (!rpcResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: '관리자 인증 실패',
      }), { status: 403, headers: CORS_HEADERS });
    }

    const rpcData = await rpcResponse.json();
    // RPC가 에러를 반환하거나 빈 결과면 인증 실패
    if (!rpcData || rpcData.error || (typeof rpcData === 'object' && rpcData.success === false)) {
      return new Response(JSON.stringify({
        success: false,
        error: '관리자 비밀번호가 올바르지 않습니다.',
      }), { status: 403, headers: CORS_HEADERS });
    }

    return null; // 인증 성공
  } catch {
    return new Response(JSON.stringify({
      success: false,
      error: '인증 서버 연결 실패',
    }), { status: 502, headers: CORS_HEADERS });
  }
}
