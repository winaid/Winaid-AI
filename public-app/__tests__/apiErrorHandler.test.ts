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

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
}

run();
