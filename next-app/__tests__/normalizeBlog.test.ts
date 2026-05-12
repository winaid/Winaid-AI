/**
 * normalizeBlog leak filter 회귀 테스트 (next-app).
 *
 * 실행: npx tsx __tests__/normalizeBlog.test.ts  (또는 `npm run test`)
 *
 * 47 → 45 unique 케이스 (PR #154 / #156 / #157 의 sanity test 통합).
 * 케이스 데이터: packages/blog-core/src/__tests__/normalizeBlogCases.ts (양 앱 공유).
 *
 * 새 누수 보고 발견 시 normalizeBlogCases.ts 에 추가 → 양 앱이 자동 검증.
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

// console.warn 차단 — normalizeBlog 가 헤딩 누수 발견 시 warn 호출. 테스트 출력 노이즈 차단.
// 단, 정상 통과 케이스에서 warn 발생하면 별도 assert 로 검출 (정상 통과 = warn 0건 검증).
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

  // 추가 invariants:
  //   - 정상 케이스 (shouldStrip=false): 누수 warn 0건 발생해야 함
  //   - 누수 케이스 (shouldStrip=true): warn 1건 이상 발생해야 함 (헤딩 누수일 때).
  //     단, <p> 누수는 console.warn 안 함 (log.push 만) — 본 invariant 는 헤딩만 적용.
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

console.log(`=== normalizeBlog leak filter regression — next-app ===`);
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
