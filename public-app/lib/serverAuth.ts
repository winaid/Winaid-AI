import type { NextRequest } from 'next/server';
import { supabase } from '@winaid/blog-core';

/**
 * Bearer 토큰으로 이미지 리소스 소유자 판정.
 * 토큰 없음/검증 실패 시 'guest' 반환.
 * 게스트끼리 user_id='guest' 공유 — 완전 격리는 Phase 2.
 */
export async function resolveImageOwner(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return 'guest';
  }
  const token = authHeader.slice(7).trim();
  if (!token || !supabase) return 'guest';

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return 'guest';
    return data.user.id;
  } catch {
    return 'guest';
  }
}
