/**
 * scoring.ts 5 regex 확장 회귀 가드 — 사용자 운영 호출 (진료 안내·가격 footer 미감지).
 *
 * 보장:
 *   - 5 regex 모두 신규 추가 어휘 매치 (진료안내·요금·약도·qna·전문의 등)
 *   - 기존 어휘 매치 회귀 0
 *
 * regex 본문은 scoring.ts 의 source code 에서 직접 추출 (export 안 됨) — file regex
 * 정적 분석으로 검증.
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

const docRegex = extractRegex('docRegex');
const trtRegex = extractRegex('trtRegex');
const locRegex = extractRegex('locRegex');
const faqRegex = extractRegex('faqRegex');
const priceRegex = extractRegex('priceRegex');

// ── docRegex — 신규 어휘 ──
const DOC_NEW = ['전문의', '진료진', '닥터', 'physician', '소개'];
const DOC_LEGACY = ['의료진', '원장', 'doctor', 'medical-team', 'staff'];

for (const kw of DOC_NEW) {
  test(`docRegex: 신규 어휘 "${kw}" 매치`, () => {
    assert.ok(docRegex.test(kw), `${kw} 매치 실패`);
  });
}
test('docRegex: 기존 어휘 회귀 0', () => {
  for (const kw of DOC_LEGACY) {
    assert.ok(docRegex.test(kw), `기존 "${kw}" 매치 회귀`);
  }
});

// ── trtRegex — 사용자 호출 case (진료안내 footer 미감지) ──
const TRT_NEW = ['진료안내', '진료과목', '진료영역', 'care', '클리닉'];
const TRT_LEGACY = ['진료', '치료', '서비스', 'services', 'treatment'];

for (const kw of TRT_NEW) {
  test(`trtRegex: 신규 어휘 "${kw}" 매치 (사용자 운영 호출 case)`, () => {
    assert.ok(trtRegex.test(kw), `${kw} 매치 실패 — footer 미감지 회귀`);
  });
}
test('trtRegex: 기존 어휘 회귀 0', () => {
  for (const kw of TRT_LEGACY) {
    assert.ok(trtRegex.test(kw), `기존 "${kw}" 매치 회귀`);
  }
});

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

// ── priceRegex — 사용자 호출 case (요금/진료비 미감지) ──
const PRICE_NEW = ['요금', '진료비', '수가표', 'fee', 'cost', 'pricing'];
const PRICE_LEGACY = ['비용', '가격', 'price', '상담', '수가'];

for (const kw of PRICE_NEW) {
  test(`priceRegex: 신규 어휘 "${kw}" 매치 (사용자 운영 호출 case)`, () => {
    assert.ok(priceRegex.test(kw), `${kw} 매치 실패 — footer 미감지 회귀`);
  });
}
test('priceRegex: 기존 어휘 회귀 0', () => {
  for (const kw of PRICE_LEGACY) {
    assert.ok(priceRegex.test(kw), `기존 "${kw}" 매치 회귀`);
  }
});

// ── false-positive 가드 ──
test('false-positive: "정형외과" 같은 카테고리명 → trt 매치 X (정상)', () => {
  // 진료/치료 vs 무관 단어는 false positive 안 함
  assert.ok(!trtRegex.test('정형외과'));
  assert.ok(!docRegex.test('정형외과'));
});

test('false-positive: "blog" → trt 매치 X', () => {
  assert.ok(!trtRegex.test('blog'));
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
