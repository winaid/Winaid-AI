import { NextRequest, NextResponse } from 'next/server';
import { resolveImageOwner } from './serverAuth';

/**
 * API route Bearer-token 인증 체크.
 * Authorization: Bearer <access_token> 헤더 검증 (Supabase auth).
 * 토큰 없거나 무효 → 401. 유효하면 null 반환(통과).
 */
export async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  const owner = await resolveImageOwner(req);
  if (!owner || owner === 'guest') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
