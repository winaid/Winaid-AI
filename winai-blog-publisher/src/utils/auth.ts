/**
 * Bearer 토큰 인증 — 사용자 머신 다른 프로세스 / DNS rebinding 차단.
 *
 * 첫 실행 시 64-byte 무작위 토큰 생성 → ~/.winai-publisher/token (0600).
 * 콘솔에 토큰 hex 출력 → 사용자가 winai.kr 페어링 페이지에 paste.
 * 모든 보호 라우트는 Authorization: Bearer <token> 검증 (timing-safe).
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { loadOrCreateSecret } from './storage';

const TOKEN_FILENAME = 'token';
const TOKEN_BYTES = 64;

let cachedToken: Buffer | null = null;

/**
 * 토큰 로드 — 없으면 새로 생성. 첫 호출 1회만 디스크 IO 발생.
 */
export function getToken(): Buffer {
  if (cachedToken) return cachedToken;
  cachedToken = loadOrCreateSecret(TOKEN_FILENAME, () => randomBytes(TOKEN_BYTES));
  return cachedToken;
}

/**
 * 토큰 hex 표현 (사용자에게 노출).
 */
export function getTokenHex(): string {
  return getToken().toString('hex');
}

/**
 * Express middleware — Authorization: Bearer <token-hex> 검증.
 * - 누락: 401 missing_authorization
 * - 형식 불일치: 401 invalid_authorization_format
 * - 값 mismatch: 401 invalid_token (timing-safe 비교)
 *
 * 옵션: skipPaths 에 정의된 경로는 검증 우회 (예: /status — 페어링 전 ping).
 */
export function bearerAuth(skipPaths: string[] = ['/status']): (
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  const expected = getToken();
  const expectedHex = expected.toString('hex');

  return (req, res, next) => {
    if (skipPaths.includes(req.path)) {
      return next();
    }

    const header = req.header('authorization') || req.header('Authorization');
    if (!header) {
      return res.status(401).json({ error: 'missing_authorization' });
    }

    const match = header.match(/^Bearer\s+([0-9a-fA-F]+)$/);
    if (!match) {
      return res.status(401).json({ error: 'invalid_authorization_format' });
    }

    const provided = match[1].toLowerCase();
    // timing-safe 비교 — 길이 다르면 false 즉시 (timingSafeEqual 은 같은 길이만 허용)
    if (provided.length !== expectedHex.length) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    next();
  };
}
