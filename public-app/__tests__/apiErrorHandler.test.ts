/**
 * apiErrorHandler 단위 테스트.
 *
 * 실행: npx tsx __tests__/apiErrorHandler.test.ts (또는 npm run test)
 *
 * 보장:
 *  1) 정상 응답 → passthrough (status/body 무변경)
 *  2) 의도 4xx (Response) → 그대로 반환 (래퍼 미관여)
 *  3) throw → 500 응답 + 한국어 generic 메시지
 *  4) dev → _debug 필드 (name/message/stack) 포함
 *  5) prod → _debug 미포함, stack 정보 미노출
 *  6) Sentry import 자체로는 런타임 에러 없음 (Sentry 호출 검증은 sealed module 로 spy 불가 — 응답 형태로 간접 검증)
 */
import assert from 'node:assert/strict';
import { withApiError } from '../lib/apiErrorHandler';
import { getRequestId } from '../lib/requestContext';

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

function makeReq(url = 'http://localhost/api/test', method = 'POST'): Request {
  return new Request(url, { method });
}

async function run() {
  // eslint-disable-next-line no-console
  console.log('\n>>> apiErrorHandler.test.ts');

  await test('정상 응답 → status/body passthrough', async () => {
    const handler = withApiError(async () => new Response('ok', { status: 200 }));
    const res = await handler(makeReq(), undefined);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  await test('의도 4xx Response → 그대로 반환 (래퍼 미관여)', async () => {
    const handler = withApiError(async () =>
      new Response(JSON.stringify({ error: 'bad_request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await handler(makeReq(), undefined);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'bad_request');
  });

  await test('throw → 500 + generic 메시지 (한국어)', async () => {
    const handler = withApiError(async () => {
      throw new Error('boom');
    });
    const res = await handler(makeReq(), undefined);
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.includes('오류'), `generic 메시지 누락: ${body.error}`);
  });

  await test('dev: _debug 필드 (name/message/stack) 포함', async () => {
    const originalEnv = process.env.NODE_ENV;
    // @ts-expect-error — test 환경 임시 변경
    process.env.NODE_ENV = 'development';
    try {
      const handler = withApiError(async () => {
        throw new Error('dev boom');
      });
      const res = await handler(makeReq(), undefined);
      const body = (await res.json()) as {
        error: string;
        _debug?: { name: string; message: string; stack: string };
      };
      assert.ok(body._debug, '_debug 누락');
      assert.equal(body._debug!.name, 'Error');
      assert.equal(body._debug!.message, 'dev boom');
      assert.ok(body._debug!.stack && body._debug!.stack.length > 0, 'stack 누락');
    } finally {
      // @ts-expect-error — 복원
      process.env.NODE_ENV = originalEnv;
    }
  });

  await test('prod: _debug 미포함, stack 정보 누설 0', async () => {
    const originalEnv = process.env.NODE_ENV;
    // @ts-expect-error — test 환경 임시 변경
    process.env.NODE_ENV = 'production';
    try {
      const handler = withApiError(async () => {
        throw new Error('prod secret stack details');
      });
      const res = await handler(makeReq(), undefined);
      const body = (await res.json()) as { error: string; _debug?: unknown };
      assert.ok(body.error.includes('오류'));
      assert.equal(body._debug, undefined, 'prod 에서 _debug 노출 — 회귀');
      const raw = JSON.stringify(body);
      assert.ok(
        !raw.includes('prod secret stack details'),
        'prod 응답에 원본 메시지/stack 누설',
      );
    } finally {
      // @ts-expect-error — 복원
      process.env.NODE_ENV = originalEnv;
    }
  });

  await test('Sentry 호출 시 wrap 자체 실패 없음 (sealed module 안전 catch)', async () => {
    // captureException 실패해도 wrapper 가 try/catch 로 swallow → 500 응답 반환되는지
    const handler = withApiError(async () => {
      throw new Error('safe');
    });
    const res = await handler(makeReq(), undefined);
    assert.equal(res.status, 500);
  });

  // ── request_id 전파 / 응답 헤더 / ALS ──

  await test('X-Request-Id 헤더 없는 요청 → UUID 발급 + 응답 헤더 부착', async () => {
    const handler = withApiError(async () => new Response('ok', { status: 200 }));
    const res = await handler(makeReq(), undefined);
    const rid = res.headers.get('X-Request-Id');
    assert.ok(rid, 'X-Request-Id 헤더 누락');
    // UUID 형태 (대략)
    assert.match(rid!, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  await test('X-Request-Id 헤더 있는 요청 → 그 값 재사용', async () => {
    const incomingId = 'incoming-abc-123';
    const handler = withApiError(async () => new Response('ok', { status: 200 }));
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-Request-Id': incomingId },
    });
    const res = await handler(req, undefined);
    assert.equal(res.headers.get('X-Request-Id'), incomingId);
  });

  await test('X-Request-Id 헤더가 패턴 위반(특수문자) → 발급 fallback', async () => {
    const handler = withApiError(async () => new Response('ok', { status: 200 }));
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-Request-Id': 'bad;injection<script>' },
    });
    const res = await handler(req, undefined);
    const rid = res.headers.get('X-Request-Id');
    assert.ok(rid && !rid.includes(';'), `악성 패턴이 그대로 통과: ${rid}`);
  });

  await test('throw 시에도 응답에 X-Request-Id 헤더 부착', async () => {
    const handler = withApiError(async () => {
      throw new Error('boom');
    });
    const res = await handler(makeReq(), undefined);
    assert.equal(res.status, 500);
    assert.ok(res.headers.get('X-Request-Id'), 'error 응답에 헤더 누락');
  });

  await test('handler 내부 lib 함수가 getRequestId() 호출 시 ALS 로 값 획득', async () => {
    let observed: string | undefined;
    const handler = withApiError(async () => {
      // 라우트 본문에서 lib 함수처럼 ALS 접근
      observed = getRequestId();
      return new Response('ok', { status: 200 });
    });
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-Request-Id': 'als-test-id' },
    });
    const res = await handler(req, undefined);
    assert.equal(observed, 'als-test-id', 'ALS 로 requestId 미전파');
    assert.equal(res.headers.get('X-Request-Id'), 'als-test-id');
  });

  // ── Cache-Control ─────────────────────────────────────

  await test('기본 응답에 Cache-Control: no-store, must-revalidate 자동 부착', async () => {
    const handler = withApiError(async () => new Response('ok', { status: 200 }));
    const res = await handler(makeReq(), undefined);
    assert.equal(res.headers.get('Cache-Control'), 'no-store, must-revalidate');
  });

  await test('opts.cacheControl opt-in 값이 응답 헤더에 반영', async () => {
    const handler = withApiError(
      async () => new Response('ok', { status: 200 }),
      { cacheControl: 'public, max-age=60' },
    );
    const res = await handler(makeReq(), undefined);
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60');
  });

  await test('라우트 본문이 직접 Cache-Control 설정 → wrapper 가 덮어쓰지 않음 (idempotent)', async () => {
    const handler = withApiError(async () =>
      new Response('ok', {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
      }),
    );
    const res = await handler(makeReq(), undefined);
    assert.equal(
      res.headers.get('Cache-Control'),
      'public, max-age=300, stale-while-revalidate=60',
      'wrapper 가 라우트의 명시 캐시 정책을 덮어씀 — 회귀',
    );
  });

  await test('throw → 500 응답에도 Cache-Control: no-store 부착', async () => {
    const handler = withApiError(async () => {
      throw new Error('boom');
    });
    const res = await handler(makeReq(), undefined);
    assert.equal(res.status, 500);
    assert.equal(res.headers.get('Cache-Control'), 'no-store, must-revalidate');
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
