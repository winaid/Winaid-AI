import { supabase } from './supabase';

/**
 * Supabase 세션 있으면 Authorization: Bearer <access_token> 자동 첨부.
 * 세션 없거나 실패 시 헤더 없이 그대로 fetch.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers((init.headers as HeadersInit | undefined) || {});
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`);
      }
    } catch { /* 세션 조회 실패 — 헤더 없이 진행 */ }
  }
  return fetch(input, { ...init, headers });
}
