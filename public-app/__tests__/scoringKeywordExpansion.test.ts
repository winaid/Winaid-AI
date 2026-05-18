/**
 * scoring.ts locRegex / faqRegex 어휘 회귀 가드.
 *
 * 이 테스트는 원래 5 regex (doc/trt/loc/faq/price) 의 어휘 확장을 가드했으나,
 * Phase A (PR diagnostic accuracy 6-fix) 에서 doc/trt/price 3개가 path 기반
 * dedicated page 검증으로 대체됨 → 정규식 어휘 확장 모델은 더 이상 무관.
 * 변경 안 된 2개 (loc/faq) 만 회귀 가드 유지.
 *
 * doc/trt/price 신규 path 검증은 diagnosticAccuracy.test.ts 의 Phase A 케이스
 * 에서 별도 보장.
 *
 * regex 본문은 scoring.ts 의 source code 에서 직접 추출 (export 안 됨) — file
 * regex 정적 분석으로 검증.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCORING = readFileSync(
  join(__dirname, '../lib/diagnostic/scoring.ts'),
  'utf-8',
);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`✗ ${name}\n    ${msg}`);
    // eslint-disable-next-line no-console
    console.log(`  ✗ ${name}\n    ${msg}`);
  }
}

// eslint-disable-next-line no-console
console.log('\n>>> scoringKeywordExpansion.test.ts');

function extractRegex(name: string): RegExp {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(/[^\\n]+/[a-z]*)\\s*;`, 'm');
  const m = SCORING.match(re);
  if (!m) throw new Error(`${name} 추출 실패`);
  // eslint-disable-next-line no-eval
  return eval(m[1]) as RegExp;
}

const locRegex = extractRegex('locRegex');
const faqRegex = extractRegex('faqRegex');

// ── locRegex — 신규 어휘 ──
const LOC_NEW = ['약도', '길찾기', 'directions', '방문', '위치안내'];
const LOC_LEGACY = ['오시는', '위치', 'location', '찾아오', 'map', 'contact'];

for (const kw of LOC_NEW) {
  test(`locRegex: 신규 어휘 "${kw}" 매치`, () => {
    assert.ok(locRegex.test(kw), `${kw} 매치 실패`);
  });
}
test('locRegex: 기존 어휘 회귀 0', () => {
  for (const kw of LOC_LEGACY) {
    assert.ok(locRegex.test(kw), `기존 "${kw}" 매치 회귀`);
  }
});

// ── faqRegex — 신규 어휘 ──
const FAQ_NEW = ['qna', 'q&a', '궁금증', '묻는'];
const FAQ_LEGACY = ['faq', '자주', '질문', '궁금'];

for (const kw of FAQ_NEW) {
  test(`faqRegex: 신규 어휘 "${kw}" 매치`, () => {
    assert.ok(faqRegex.test(kw), `${kw} 매치 실패`);
  });
}
test('faqRegex: 기존 어휘 회귀 0', () => {
  for (const kw of FAQ_LEGACY) {
    assert.ok(faqRegex.test(kw), `기존 "${kw}" 매치 회귀`);
  }
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
