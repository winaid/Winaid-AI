import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * env가 세팅되어 있으면 실제 클라이언트, 없으면 null.
 * import 시점에 throw하지 않으므로 앱 전체가 죽지 않는다.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
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
