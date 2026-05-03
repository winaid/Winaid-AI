import { supabase } from '@winaid/blog-core';

/**
 * 인증 헤더 자동 첨부:
 *  1. Supabase 세션 있으면 Authorization: Bearer <access_token>
 *  2. admin 인증은 HttpOnly cookie 자동 전송 — 헤더 X (XSS 차단).
 *     credentials: 'include' 명시로 same-origin 외에서도 cookie 보장.
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

  return fetch(input, { ...init, headers, credentials: 'include' });
}
