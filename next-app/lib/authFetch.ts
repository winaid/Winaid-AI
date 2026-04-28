import { supabase } from '@winaid/blog-core';

/**
 * 인증 헤더 자동 첨부:
 *  1. Supabase 세션 있으면 Authorization: Bearer <access_token>
 *  2. admin 모드(localStorage.winaid_admin='true' + ADMIN_TOKEN) 면 X-Admin-Token
 * 둘 다 없으면 헤더 없이 fetch (서버에서 401 처리).
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers((init.headers as HeadersInit | undefined) || {});

  // 1) Supabase Bearer
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`);
      }
    } catch { /* 세션 조회 실패 — 다음 방법 */ }
  }

  // 2) admin 토큰 (admin 페이지에서 별도 password 인증한 경우)
  if (typeof window !== 'undefined' && !headers.has('Authorization')) {
    try {
      const isAdmin = localStorage.getItem('winaid_admin') === 'true';
      const adminToken = localStorage.getItem('ADMIN_TOKEN') || sessionStorage.getItem('ADMIN_TOKEN');
      if (isAdmin && adminToken) {
        headers.set('X-Admin-Token', adminToken);
      }
    } catch { /* localStorage 접근 실패 — 그대로 진행 */ }
  }

  return fetch(input, { ...init, headers });
}
