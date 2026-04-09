/**
 * Google Cloud Platform 인증 헬퍼
 *
 * 서비스 계정 JWT → 액세스 토큰 교환.
 * STT, TTS 등 GCP API에서 공용으로 사용.
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGcpAccessToken(): Promise<string | null> {
  // 캐시된 토큰이 아직 유효하면 재사용 (5분 여유)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  try {
    const credJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    let sa: { client_email: string; private_key: string } | null = null;

    if (credJson) {
      sa = JSON.parse(credJson);
    } else if (credPath) {
      const fs = await import('fs');
      sa = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    }

    if (!sa?.client_email || !sa?.private_key) return null;

    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.client_email,
      sub: sa.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    };

    const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${enc(header)}.${enc(payload)}`;

    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    const signature = sign.sign(sa.private_key, 'base64url');
    const jwt = `${unsigned}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) return null;

    const tokenData = await tokenRes.json() as { access_token?: string; expires_in?: number };
    if (!tokenData.access_token) return null;

    cachedToken = {
      token: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    return cachedToken.token;
  } catch (err) {
    console.error('[gcpAuth] 인증 에러', err);
    return null;
  }
}
