/**
 * Admin HttpOnly cookie 발급/검증 — XSS 차단용.
 *
 * 과거: localStorage.ADMIN_TOKEN 에 admin password 평문 저장 → admin 페이지 어디든
 * stored XSS 1건이면 권한 전체 탈취. 본 모듈은 다음을 갖춘 cookie 인증을 제공:
 *  - HttpOnly: JS 에서 document.cookie 로 못 읽음
 *  - Secure: https 만
 *  - SameSite=Strict: cross-site 요청에 자동 첨부 안 됨 (CSRF 일부 방어)
 *  - HMAC + expiry timestamp: stateless 검증, rotation 시 즉시 무효화
 *  - 1 시간 유효
 *
 * Cookie 값 포맷: `<exp>.<hmac>` (둘 다 hex, '.' 분리)
 *   exp  = expiresAt (Date.now() ms, base 16)
 *   hmac = HMAC-SHA256(key=ADMIN_API_TOKEN, msg=exp).digest('hex')
 *
 * 비밀: process.env.ADMIN_API_TOKEN — 서버 전용 (NEXT_PUBLIC 접두사 X).
 * production 에서 미설정 시 verify/issue 모두 실패 → 호출 라우트가 503 반환해야.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'admin_session';
export const ADMIN_COOKIE_MAX_AGE_SEC = 60 * 60; // 1시간

function getSecret(): string | null {
  const s = process.env.ADMIN_API_TOKEN || '';
  return s ? s : null;
}

function hmacHex(secret: string, msg: string): string {
  return createHmac('sha256', secret).update(msg).digest('hex');
}

/**
 * 새 admin_session cookie 값 생성.
 * @param maxAgeSec 유효 시간 초 (기본 1시간)
 * @returns cookie value (Set-Cookie 의 value 부분 — 헤더 자체는 호출자가 구성)
 */
export function issueAdminCookieValue(maxAgeSec: number = ADMIN_COOKIE_MAX_AGE_SEC): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = (Date.now() + maxAgeSec * 1000).toString(16);
  const hmac = hmacHex(secret, exp);
  return `${exp}.${hmac}`;
}

/**
 * 요청 cookie 헤더에서 admin_session 검증.
 * @returns valid=true 면 인증 통과, false 면 거부 사유
 */
export function verifyAdminCookie(req: NextRequest | Request): { valid: true } | { valid: false; reason: string } {
  const secret = getSecret();
  if (!secret) return { valid: false, reason: 'admin_token_not_configured' };

  // NextRequest 와 Request 양쪽 지원
  const cookieHeader = (req as Request).headers.get('cookie') || '';
  const value = parseCookieValue(cookieHeader, ADMIN_COOKIE_NAME);
  if (!value) return { valid: false, reason: 'no_cookie' };

  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return { valid: false, reason: 'malformed' };
  const expHex = value.slice(0, dot);
  const providedHmac = value.slice(dot + 1);

  // HMAC 비교 — timing-safe
  const expectedHmac = hmacHex(secret, expHex);
  if (providedHmac.length !== expectedHmac.length) return { valid: false, reason: 'hmac_length_mismatch' };
  let hmacOk = false;
  try {
    hmacOk = timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
  } catch {
    return { valid: false, reason: 'hmac_decode' };
  }
  if (!hmacOk) return { valid: false, reason: 'hmac_mismatch' };

  // 만료 검사 (HMAC 가 통과해야 의미 있음 — 위조된 exp 는 위에서 차단)
  const expMs = parseInt(expHex, 16);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true };
}

/**
 * Set-Cookie 헤더 값 (login route 용).
 * production 에서 Secure 활성화 (NODE_ENV !== 'production' 이면 dev http 환경에서 자동으로 빠짐).
 */
export function buildAdminSetCookieHeader(value: string, maxAgeSec: number = ADMIN_COOKIE_MAX_AGE_SEC): string {
  const flags = [
    `${ADMIN_COOKIE_NAME}=${value}`,
    `Path=/`,
    `Max-Age=${maxAgeSec}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ];
  if (process.env.NODE_ENV === 'production') {
    flags.push('Secure');
  }
  return flags.join('; ');
}

/** 쿠키 삭제 (logout route 용). */
export function buildAdminClearCookieHeader(): string {
  const flags = [
    `${ADMIN_COOKIE_NAME}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Strict`,
  ];
  if (process.env.NODE_ENV === 'production') {
    flags.push('Secure');
  }
  return flags.join('; ');
}

/**
 * Cookie 헤더 문자열에서 특정 이름의 값 추출.
 * Express `cookie` 라이브러리 의존성 없이 단순 파싱 — admin_session 한 항목만 다룸.
 */
function parseCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    if (k === name) {
      return p.slice(idx + 1).trim();
    }
  }
  return null;
}

/**
 * password ↔ ADMIN_API_TOKEN timing-safe 비교 (login route 용).
 * 미설정 시 항상 false (호출자가 503 처리).
 */
export function verifyAdminPassword(provided: string): boolean {
  const secret = getSecret();
  if (!secret) return false;
  if (typeof provided !== 'string') return false;
  if (provided.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

/** ADMIN_API_TOKEN 설정 여부 — 503 분기용. */
export function isAdminConfigured(): boolean {
  return !!getSecret();
}
