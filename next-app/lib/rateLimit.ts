/**
 * IP 기반 fixed-window rate limit — Supabase 테이블 활용 (Redis 등 외부 의존성 없음).
 *
 * 키 패턴: 'share:m:1.2.3.4' / 'share:h:1.2.3.4' / 'diagnostic:m:1.2.3.4'
 * 분/시간 별로 별도 키를 두면 두 윈도우 동시 적용 가능.
 *
 * 한계 (의도적 trade-off):
 *  - NAT 환경: 회사 공유 IP 사용자 다수가 한 키 공유 — 정상 사용자 영향 미미한 수준에서 수용.
 *  - 'unknown' IP: 별개 키로 취급 (해당 IP 추출 실패 케이스만 단일 카운터 공유).
 *  - DB 왕복 2회 이상 (조회 + upsert/update). 절대 처리량 보다 spam 방지가 목적.
 */

import { getSupabaseClient } from '@winaid/blog-core';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * windowSec 마다 카운트 리셋되는 fixed-window 카운터.
 * Supabase 미설정 등으로 throw 시 — fail-open 으로 처리하라는 호출자 책임 (이 함수는 throw 그대로 전파).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const db = getSupabaseClient();
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowSec * 1000);

  const { data: existing } = await db
    .from('api_rate_limit')
    .select('count, window_start')
    .eq('key', key)
    .maybeSingle();

  // window 만료 또는 row 없음 — 신규 윈도우 시작
  if (!existing || new Date(existing.window_start) < windowStartCutoff) {
    await db.from('api_rate_limit').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
      updated_at: now.toISOString(),
    });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    const expiresAt = new Date(existing.window_start).getTime() + windowSec * 1000;
    const retryAfterSec = Math.max(1, Math.ceil((expiresAt - now.getTime()) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  await db
    .from('api_rate_limit')
    .update({ count: existing.count + 1, updated_at: now.toISOString() })
    .eq('key', key);

  return { allowed: true, remaining: limit - existing.count - 1, retryAfterSec: 0 };
}

/** Vercel/Next.js 환경에서 클라이언트 IP 추출. 우선순위: x-forwarded-for → x-real-ip → 'unknown'. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
