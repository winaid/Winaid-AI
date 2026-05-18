/**
 * 의료광고법 위반 override 토큰 — server-side 발급/검증.
 *
 * 사용자가 위반 가능성 인지 후 "동의하고 다운로드" 클릭 시 server-side 토큰 발급.
 * API 가 토큰을 검증해 client-only 우회를 차단한다.
 *
 * 구현:
 *   - 무상태 (DB 미사용) — HMAC-SHA256 서명. payload + 서명을 base64url 합쳐 전달.
 *   - 단명: 5분 (300초). 그 이상 다운로드를 끌면 재요청 필요.
 *   - 시크릿: MEDICAL_AD_OVERRIDE_SECRET || SUPABASE_SERVICE_ROLE_KEY 폴백
 *     (서비스 키도 부재면 발급/검증 모두 실패 — 운영자가 둘 중 하나는 반드시 설정)
 *
 * 비고:
 *   - JWT 라이브러리 의존 회피 (현재 의존성에 jsonwebtoken/jose 없음 — 패키지 추가 안 함)
 *   - 서버 전용 모듈. 클라이언트 import 금지 (process.env 접근).
 */

import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_SECONDS = 5 * 60; // 5분

/** 토큰 payload (JSON 직렬화 후 base64url 인코딩) */
export interface OverrideTokenPayload {
  /** 사용자 id (auth.users.id) */
  user_id: string;
  /** 콘텐츠 해시 — 슬라이드 내용 변조 감지 (SHA-256 기반 32자 prefix = 128-bit) */
  content_hash: string;
  /** 만료 시각 (ms epoch) */
  expires_at: number;
  /** 동의 시점 위반 건수 — 운영 로그 일치 검증용 */
  violations_count: number;
  /** 발급 시각 (ms epoch) */
  issued_at: number;
}

export type OverrideTokenVerifyResult =
  | { ok: true; payload: OverrideTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' | 'no_secret' };

// service_role 폴백 사용 시 모듈당 1회 warn — 토큰 시그니처에 service_role 키가
// 사용되는 보안 표면을 운영자에게 가시화. 별도 시크릿 설정 권장 (audit §9.4).
let _fallbackWarned = false;

function getSecret(): string | null {
  const explicit = process.env.MEDICAL_AD_OVERRIDE_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallback && fallback.length >= 16) {
    if (!_fallbackWarned) {
      _fallbackWarned = true;
      console.warn(
        '[medical-ad-override] MEDICAL_AD_OVERRIDE_SECRET 미설정 — SUPABASE_SERVICE_ROLE_KEY 폴백 사용. ' +
        'service_role 키가 토큰 시그니처에 사용되는 것은 보안 표면 확대. 별도 시크릿 설정 권장.',
      );
    }
    return fallback;
  }
  return null;
}

function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * 토큰 발급. 시크릿 미설정 시 null.
 */
export function issueOverrideToken(args: {
  userId: string;
  contentHash: string;
  violationsCount: number;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;

  const now = Date.now();
  const payload: OverrideTokenPayload = {
    user_id: args.userId,
    content_hash: args.contentHash,
    expires_at: now + TOKEN_TTL_SECONDS * 1000,
    violations_count: args.violationsCount,
    issued_at: now,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  const sigB64 = base64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

/**
 * 토큰 검증. 서명 일치 + 미만료 + payload 형식 확인.
 */
export function verifyOverrideToken(token: string): OverrideTokenVerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no_secret' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { ok: false, reason: 'malformed' };

  // 서명 검증 (timing-safe)
  let expectedSig: Buffer;
  let providedSig: Buffer;
  try {
    expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
    providedSig = base64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (expectedSig.length !== providedSig.length) {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (!timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  // payload 파싱
  let payload: OverrideTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof payload.user_id !== 'string' ||
    typeof payload.content_hash !== 'string' ||
    typeof payload.expires_at !== 'number' ||
    typeof payload.violations_count !== 'number' ||
    typeof payload.issued_at !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  // 만료
  if (Date.now() > payload.expires_at) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}

/** 토큰 TTL (테스트/문서용 노출) */
export const OVERRIDE_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
