// DELETE /content/delete-all - 모든 콘텐츠 삭제 (admin 인증 필수)

import { verifyAdmin, CORS_HEADERS } from '../api-keys/_auth.js';

export const onRequestDelete = async (context) => {
  // admin 인증
  const authResult = await verifyAdmin(context);
  if (authResult) return authResult;

  try {
    const listKey = 'content:list';
    const existingList = await context.env.CONTENT_KV.get(listKey);
    const contentIds = existingList ? JSON.parse(existingList) : [];

    let deletedCount = 0;
    for (const id of contentIds) {
      try {
        await context.env.CONTENT_KV.delete(`content:${id}`);
        deletedCount++;
      } catch (e) {
        // 개별 삭제 실패는 계속 진행
      }
    }

    await context.env.CONTENT_KV.put(listKey, JSON.stringify([]));

    return new Response(JSON.stringify({
      success: true,
      deletedCount,
      message: `${deletedCount}개의 콘텐츠가 삭제되었습니다.`
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
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
};
