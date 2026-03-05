/**
 * WINAID Rate Limiter Worker
 *
 * 다수 사용자 대비 API 호출 제한 + 캐싱 Worker
 * Pages Functions와 별도로 동작하며, Service Binding으로 연결 가능
 *
 * 기능:
 * 1. IP 기반 Rate Limiting (KV 사용)
 * 2. 사용자별 일일 API 사용량 추적
 * 3. 응답 캐싱 (동일 요청 중복 방지)
 */

export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  // Pages에서 Service Binding으로 호출 시 사용
}

interface RateLimitConfig {
  maxRequests: number;   // 시간 윈도우 내 최대 요청 수
  windowSeconds: number; // 시간 윈도우 (초)
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/generate': { maxRequests: 30, windowSeconds: 3600 },     // 이미지 생성: 시간당 30회
  '/api/blog': { maxRequests: 60, windowSeconds: 3600 },         // 블로그 생성: 시간당 60회
  '/api/crawler': { maxRequests: 100, windowSeconds: 3600 },     // 크롤링: 시간당 100회
  default: { maxRequests: 200, windowSeconds: 3600 },            // 기본: 시간당 200회
};

// IP에서 Rate Limit 키 생성
function getRateLimitKey(ip: string, path: string): string {
  const hour = Math.floor(Date.now() / 3600000);
  return `rl:${ip}:${path}:${hour}`;
}

// 사용자별 일일 사용량 키
function getDailyUsageKey(userId: string): string {
  const day = new Date().toISOString().split('T')[0];
  return `usage:${userId}:${day}`;
}

async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;
  const resetAt = (Math.floor(Date.now() / (config.windowSeconds * 1000)) + 1) * config.windowSeconds * 1000;

  if (count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  await kv.put(key, String(count + 1), { expirationTtl: config.windowSeconds });
  return { allowed: true, remaining: config.maxRequests - count - 1, resetAt };
}

async function trackDailyUsage(
  kv: KVNamespace,
  userId: string,
  endpoint: string,
): Promise<{ totalToday: number }> {
  const key = getDailyUsageKey(userId);
  const raw = await kv.get(key);
  const usage = raw ? JSON.parse(raw) : { total: 0, endpoints: {} };

  usage.total += 1;
  usage.endpoints[endpoint] = (usage.endpoints[endpoint] || 0) + 1;

  await kv.put(key, JSON.stringify(usage), { expirationTtl: 86400 });
  return { totalToday: usage.total };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
        },
      });
    }

    // Health check
    if (path === '/health') {
      return Response.json({
        status: 'ok',
        service: 'winaid-rate-limiter',
        timestamp: new Date().toISOString(),
      });
    }

    // Rate limit check endpoint (Pages Functions에서 호출)
    if (path === '/check-rate-limit' && request.method === 'POST') {
      try {
        const body = await request.json() as { ip: string; path: string; userId?: string };
        const config = RATE_LIMITS[body.path] || RATE_LIMITS.default;
        const key = getRateLimitKey(body.ip, body.path);

        const result = await checkRateLimit(env.RATE_LIMIT_KV, key, config);

        // 사용자 ID가 있으면 일일 사용량도 추적
        let dailyUsage = null;
        if (body.userId) {
          dailyUsage = await trackDailyUsage(env.RATE_LIMIT_KV, body.userId, body.path);
        }

        return Response.json({
          ...result,
          dailyUsage,
        }, {
          headers: {
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(result.resetAt),
          },
        });
      } catch {
        return Response.json({ allowed: true, remaining: -1, resetAt: 0 }, { status: 200 });
      }
    }

    // 일일 사용량 조회
    if (path === '/usage' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) {
        return Response.json({ error: 'userId required' }, { status: 400 });
      }

      const key = getDailyUsageKey(userId);
      const raw = await env.RATE_LIMIT_KV.get(key);
      const usage = raw ? JSON.parse(raw) : { total: 0, endpoints: {} };

      return Response.json({ userId, date: new Date().toISOString().split('T')[0], ...usage });
    }

    // 캐시 저장/조회 (동일 프롬프트 중복 생성 방지)
    if (path === '/cache' && request.method === 'POST') {
      try {
        const body = await request.json() as { key: string; value?: string; ttl?: number };

        if (body.value) {
          // 캐시 저장
          await env.CACHE_KV.put(body.key, body.value, {
            expirationTtl: body.ttl || 3600,
          });
          return Response.json({ stored: true });
        } else {
          // 캐시 조회
          const cached = await env.CACHE_KV.get(body.key);
          return Response.json({ hit: !!cached, value: cached });
        }
      } catch {
        return Response.json({ hit: false, value: null });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
