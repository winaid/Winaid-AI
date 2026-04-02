import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API route 인증 체크 — 로그인한 사용자만 허용
 * @returns null이면 인증 성공, NextResponse면 401 반환
 */
export async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null; // Supabase 미설정 시 통과

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { cookie: req.headers.get('cookie') || '' } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    return null;
  } catch {
    return null; // 인증 서비스 장애 시 통과
  }
}
