/**
 * Rate Limiter Worker 호출 헬퍼
 *
 * Pages Functions에서 Service Binding 또는 HTTP로 Worker를 호출
 *
 * 사용법 (Pages Function 내):
 *   const { allowed, remaining } = await checkRateLimit(context, '/api/generate');
 *   if (!allowed) return new Response('Too many requests', { status: 429 });
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  dailyUsage?: { totalToday: number };
}

export async function checkRateLimit(
  context: { request: Request; env: Record<string, any> },
  path: string,
  userId?: string,
): Promise<RateLimitResult> {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';

  // Service Binding이 있으면 사용 (더 빠름)
  if (context.env.RATE_LIMITER) {
    try {
      const workerResponse = await context.env.RATE_LIMITER.fetch(
        new Request('https://internal/check-rate-limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, path, userId }),
        }),
      );
      return await workerResponse.json();
    } catch (e) {
      console.error('Service binding call failed:', e);
      // fallback: 허용
      return { allowed: true, remaining: -1, resetAt: 0 };
    }
  }

  // Service Binding이 없으면 HTTP로 호출
  const workerUrl = context.env.RATE_LIMITER_URL;
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl}/check-rate-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, path, userId }),
      });
      return await res.json();
    } catch (e) {
      console.error('HTTP rate limit call failed:', e);
      return { allowed: true, remaining: -1, resetAt: 0 };
    }
  }

  // Worker 연결 없으면 항상 허용
  return { allowed: true, remaining: -1, resetAt: 0 };
}
