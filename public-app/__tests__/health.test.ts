/**
 * /api/health smoke 테스트.
 *
 * 실행: npx tsx __tests__/health.test.ts
 *
 * 보장:
 *  - 200 OK + { status: 'ok', service: 'public-app', timestamp, uptime }
 *  - X-Request-Id 자동 헤더 (withApiError 통합)
 *  - Cache-Control: no-store, must-revalidate (모니터링 ping 캐시 방지)
 */
import assert from 'node:assert/strict';
import { GET } from '../app/api/health/route';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${name}`);
    })
    .catch((e: unknown) => {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${name}\n    ${msg}`);
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${name}\n    ${msg}`);
    });
}

async function run() {
  // eslint-disable-next-line no-console
  console.log('\n>>> health.test.ts');

  await test('GET /api/health → 200 + ok payload + 헤더 2종', async () => {
    const req = new Request('http://localhost/api/health', { method: 'GET' });
    const res = await (GET as (r: Request, c?: unknown) => Promise<Response>)(req, undefined);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      status: string;
      service: string;
      timestamp: string;
      uptime: number | null;
    };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'public-app');
    assert.ok(typeof body.timestamp === 'string' && body.timestamp.length > 0);
    // uptime 은 node 환경이면 정수, 아니면 null
    assert.ok(body.uptime === null || typeof body.uptime === 'number');

    assert.ok(res.headers.get('X-Request-Id'), 'X-Request-Id 헤더 누락');
    assert.equal(
      res.headers.get('Cache-Control'),
      'no-store, must-revalidate',
      'Cache-Control 기본값 미적용',
    );
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
}

run();
