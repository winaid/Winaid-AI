/**
 * logger 단위 테스트.
 *
 * 실행: npx tsx __tests__/logger.test.ts (또는 npm run test)
 *
 * 보장:
 *  1) prod (NODE_ENV=production) → 단일 라인 JSON 출력
 *  2) dev → 가독 포맷 ([LEVEL] msg + ctx JSON)
 *  3) err 인자 → err 필드 포함 (name/message/stack)
 *  4) warn/error → stderr (console.error), info/debug → stdout (console.log)
 *  5) ALS context 안에서 ctx.requestId 자동 fallback
 */
import assert from 'node:assert/strict';
import { logger } from '../lib/logger';
import { runWithRequestContext } from '../lib/requestContext';

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

interface CapturedSinks {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

function captureConsole(): CapturedSinks {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return {
    stdout,
    stderr,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

async function withEnv(value: 'production' | 'development', fn: () => Promise<void> | void) {
  const original = process.env.NODE_ENV;
  // @ts-expect-error — test 환경 임시 변경
  process.env.NODE_ENV = value;
  try {
    await fn();
  } finally {
    // @ts-expect-error — 복원
    process.env.NODE_ENV = original;
  }
}

async function run() {
  // eslint-disable-next-line no-console
  console.log('\n>>> logger.test.ts');

  await test('prod: info → stdout, 단일 라인 JSON', async () => {
    await withEnv('production', () => {
      const cap = captureConsole();
      try {
        logger.info('hello', { route: '/api/x' });
      } finally {
        cap.restore();
      }
      assert.equal(cap.stdout.length, 1, 'stdout 1 호출 기대');
      assert.equal(cap.stderr.length, 0, 'stderr 호출 안 됨');
      const parsed = JSON.parse(cap.stdout[0]) as Record<string, unknown>;
      assert.equal(parsed.level, 'info');
      assert.equal(parsed.msg, 'hello');
      assert.equal(parsed.route, '/api/x');
      assert.ok(typeof parsed.ts === 'string');
    });
  });

  await test('prod: error → stderr (console.error), err 필드 포함', async () => {
    await withEnv('production', () => {
      const cap = captureConsole();
      try {
        logger.error('failed', { route: '/api/y' }, new Error('boom'));
      } finally {
        cap.restore();
      }
      assert.equal(cap.stderr.length, 1);
      assert.equal(cap.stdout.length, 0);
      const parsed = JSON.parse(cap.stderr[0]) as { err?: { name?: string; message?: string; stack?: string } };
      assert.equal(parsed.err?.name, 'Error');
      assert.equal(parsed.err?.message, 'boom');
      assert.ok(parsed.err?.stack);
    });
  });

  await test('prod: warn → stderr', async () => {
    await withEnv('production', () => {
      const cap = captureConsole();
      try {
        logger.warn('careful');
      } finally {
        cap.restore();
      }
      assert.equal(cap.stderr.length, 1);
      assert.equal(cap.stdout.length, 0);
    });
  });

  await test('dev: 가독 포맷 ([LEVEL] msg + ctx)', async () => {
    await withEnv('development', () => {
      const cap = captureConsole();
      try {
        logger.info('dev msg', { user: 'u1' });
      } finally {
        cap.restore();
      }
      assert.equal(cap.stdout.length, 1);
      assert.ok(cap.stdout[0].includes('[INFO]'));
      assert.ok(cap.stdout[0].includes('dev msg'));
      assert.ok(cap.stdout[0].includes('u1'));
    });
  });

  await test('ALS: ctx.requestId 누락 시 getRequestId() 자동 첨부', async () => {
    await withEnv('production', () => {
      const cap = captureConsole();
      runWithRequestContext('rid-als-1', () => {
        try {
          logger.info('lib call', { detail: 'x' });
        } finally {
          cap.restore();
        }
      });
      const parsed = JSON.parse(cap.stdout[0]) as { requestId?: string };
      assert.equal(parsed.requestId, 'rid-als-1');
    });
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
