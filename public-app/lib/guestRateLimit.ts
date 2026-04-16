/**
 * 게스트 IP 기반 rate limit 공통 유틸
 *
 * 왜 있는가?
 *   public-app은 비로그인 게스트도 크레딧 5개로 핵심 기능(블로그/카드뉴스/이미지)을
 *   체험할 수 있게 한다. 모든 API route에서 쿠키가 없으면 401을 반환하던 정책을
 *   "허용하되 IP 기반으로 분당 요청 수를 제한"하는 방향으로 변경.
 *
 * 한계:
 *   in-memory Map이라 서버리스 인스턴스 간 공유되지 않는다. 일반 브라우저 봇/남용
 *   방지에는 충분하지만 분산 환경에서 완벽히 일치시키려면 Upstash Redis 등으로
 *   전환 필요. 현 단계에서는 단일 Vercel 함수 인스턴스 기준 충분한 방어선.
 */

const rateLimitMap = new Map<string, number[]>();

// 모듈이 서버리스 콜드스타트 때마다 새로 로드되는 환경을 고려해 setInterval은
// 최초 import 시 한 번만 설정. Node.js 환경에서만 동작 (Edge runtime 주의).
let cleanupStarted = false;
function ensureCleanup() {
  if (cleanupStarted) return;
  if (typeof setInterval !== 'function') return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of rateLimitMap.entries()) {
      const fresh = timestamps.filter(t => now - t < 300_000);
      if (fresh.length === 0) rateLimitMap.delete(ip);
      else rateLimitMap.set(ip, fresh);
    }
  }, 300_000).unref?.();
}

/**
 * 게스트 요청을 허용할지 판단한다.
 * @param ip 클라이언트 IP (getClientIp로 추출)
 * @param maxPerMinute 분당 허용 요청 수 (기본 30)
 * @param route 경로 (IP+경로 조합으로 분리 카운팅. 안 넘기면 IP만 사용)
 * @returns true면 허용, false면 차단 (호출자가 429 응답)
 */
export function checkGuestRateLimit(ip: string, maxPerMinute = 30, route?: string): boolean {
  ensureCleanup();
  const now = Date.now();
  const windowMs = 60_000;
  const key = route ? `${ip}:${route}` : ip;
  const list = rateLimitMap.get(key) ?? [];
  const fresh = list.filter(t => now - t < windowMs);

  if (fresh.length >= maxPerMinute) {
    rateLimitMap.set(key, fresh);
    return false;
  }

  fresh.push(now);
  rateLimitMap.set(key, fresh);
  return true;
}

/** x-forwarded-for / x-real-ip에서 클라이언트 IP 추출 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/** Supabase 세션 쿠키 존재 여부로 로그인 여부 판정 */
export function isAuthenticatedByCookie(request: Request): boolean {
  const cookies = request.headers.get('cookie') || '';
  return /sb-[a-z]+-auth-token/.test(cookies);
}

/**
 * 편의 함수: 인증 체크 + 게스트 rate limit을 한 번에 처리.
 * @returns { ok: true } 또는 { ok: false, status, error }
 */
export function gateGuestRequest(
  request: Request,
  maxPerMinute = 30,
  route?: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (isAuthenticatedByCookie(request)) return { ok: true };
  const ip = getClientIp(request);
  const routeKey = route || new URL(request.url).pathname;
  if (!checkGuestRateLimit(ip, maxPerMinute, routeKey)) {
    return { ok: false, status: 429, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  return { ok: true };
}

// ── 진단 도구 전용 rate limit (Phase 1.2) ─────────────────────
//
// 기존 gateGuestRequest 와 차이:
//  - 로그인 사용자: 쿠키 해시 기반 키로 분당 5회 (기존은 bypass)
//  - 게스트: IP + User-Agent 해시 조합으로 분당 3회 (NAT 충돌 90% 감소)
//  - 다른 API route 에 영향 0 (이 함수를 호출하는 건 /api/diagnostic 만)

/** 간단한 32bit 해시 — 문자열을 정수로. 암호학적 보안 불필요, rate limit 키 구분용. */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function gateDiagnosticRequest(
  request: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const route = '/api/diagnostic';
  const ip = getClientIp(request);

  if (isAuthenticatedByCookie(request)) {
    // 로그인 사용자: auth 쿠키 값 해시를 키로 → 같은 NAT 이라도 로그인별 독립 카운트
    const cookies = request.headers.get('cookie') || '';
    const tokenMatch = cookies.match(/sb-[a-z]+-auth-token=([^;]+)/);
    const userKey = tokenMatch ? `auth:${simpleHash(tokenMatch[1])}` : `auth:${ip}`;
    if (!checkGuestRateLimit(userKey, 5, route)) {
      return { ok: false, status: 429, error: '진단 요청이 너무 많습니다. 1분 후 다시 시도해주세요.' };
    }
    return { ok: true };
  }

  // 게스트: IP + User-Agent 해시 → 같은 NAT 이라도 브라우저별 독립 카운트
  const ua = request.headers.get('user-agent') || '';
  const guestKey = `guest:${ip}:${simpleHash(ua)}`;
  if (!checkGuestRateLimit(guestKey, 3, route)) {
    return { ok: false, status: 429, error: '진단 요청이 너무 많습니다. 1분 후 다시 시도해주세요.' };
  }
  return { ok: true };
}
