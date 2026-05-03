import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * env가 세팅되어 있으면 실제 클라이언트, 없으면 null.
 * import 시점에 throw하지 않으므로 앱 전체가 죽지 않는다.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// 서버 전용. RLS 우회. checkAuth 등 자체 인증 게이트 통과한 라우트에서만 사용.
export const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

/** Supabase 환경변수 세팅 여부 */
export const isSupabaseConfigured = supabase !== null;

/** supabase가 null이면 throw — 호출부에서 try/catch로 처리 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.');
  }
  return supabase;
}

/** 세션 안전 조회 — Supabase 미설정/미로그인 시 null 반환 (throw 안 함) */
export async function getSessionSafe(): Promise<{ userId: string | null; userEmail: string | null }> {
  if (!supabase) return { userId: null, userEmail: null };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      userId: session?.user?.id || null,
      userEmail: session?.user?.email || null,
    };
  } catch {
    return { userId: null, userEmail: null };
  }
}
