/**
 * normalizeBlog leak filter 회귀 테스트 (public-app).
 *
 * 실행: npx tsx __tests__/normalizeBlog.test.ts  (또는 `npm run test`)
 *
 * next-app/__tests__/normalizeBlog.test.ts 와 동일 케이스, 동일 invariants.
 * 양 앱 normalizeBlog 가 drift 하면 두 앱 중 한쪽이 fail.
 */

import assert from 'node:assert/strict';
import { normalizeBlogStructure } from '../app/(dashboard)/blog/normalizeBlog';
import {
  ALL_CASES,
  wasStripped,
  type LeakTestCase,
} from '../../packages/blog-core/src/__tests__/normalizeBlogCases';

let passed = 0;
let failed = 0;
const failures: string[] = [];

const warnSpy: { count: number; reset: () => void } = (() => {
  const original = console.warn;
  let count = 0;
  console.warn = () => { count++; };
  return {
    get count() { return count; },
    reset: () => { count = 0; },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    restore: () => { console.warn = original; },
  };
})() as { count: number; reset: () => void; restore: () => void };

function runCase(c: LeakTestCase): void {
  warnSpy.reset();
  const { html: out } = normalizeBlogStructure(c.input, '');
  const stripped = wasStripped(c.input, out);

  if (stripped !== c.shouldStrip) {
    failed++;
    failures.push(
      `[FAIL] ${c.id} (${c.source}) — ${c.label}\n` +
      `  input    : ${c.input}\n` +
      `  expected : ${c.shouldStrip ? 'STRIPPED' : 'PRESERVED'}\n` +
      `  actual   : ${stripped ? 'STRIPPED' : 'PRESERVED'}\n` +
      `  output   : ${out.slice(0, 200)}${out.length > 200 ? '...' : ''}`,
    );
    return;
  }

  const isHeadingCase = /^<h[23]/i.test(c.input);
  if (!c.shouldStrip && isHeadingCase && warnSpy.count > 0) {
    failed++;
    failures.push(
      `[FAIL] ${c.id} (${c.source}) — 정상 헤딩인데 console.warn 발생\n` +
      `  input : ${c.input}\n` +
      `  warn count : ${warnSpy.count}`,
    );
    return;
  }
  if (c.shouldStrip && isHeadingCase && warnSpy.count === 0) {
    failed++;
    failures.push(
      `[FAIL] ${c.id} (${c.source}) — 헤딩 strip 됐지만 console.warn 0건\n` +
      `  input : ${c.input}`,
    );
    return;
  }

  passed++;
}

console.log(`=== normalizeBlog leak filter regression — public-app ===`);
console.log(`총 ${ALL_CASES.length} 케이스 실행 중...\n`);

for (const c of ALL_CASES) {
  runCase(c);
}

console.log(`\n${passed}/${ALL_CASES.length} passed`);

if (failed > 0) {
  console.error(`\n${failed} FAILURES:\n`);
  for (const f of failures) console.error(f + '\n');
  process.exit(1);
}

assert.equal(passed, ALL_CASES.length, 'all cases must pass');
process.exit(0);
