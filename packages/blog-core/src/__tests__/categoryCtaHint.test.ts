/**
 * CATEGORY_CTA_HINT 회귀 가드 (drift-zero invariant).
 *
 * quartet (PR #194-197):
 *   - CATEGORY_TONE (블로그 본문)
 *   - PRESS_CATEGORY_TONE (보도자료)
 *   - CLINICAL_CATEGORY_TONE (임상글)
 *   - CATEGORY_CTA_HINT (본 record — 진단 dashboard CTA chip)
 *
 * 4 record 의 카테고리 set 이 정확히 일치해야 함 (drift-zero).
 */
import assert from 'node:assert/strict';
import { CATEGORY_CTA_HINT, getCategoryCtaHint } from '../categoryCtaHint';
import { CATEGORY_TONE } from '../blogPrompt';
import { PRESS_CATEGORY_TONE } from '../pressCategoryTone';
import { CLINICAL_CATEGORY_TONE } from '../clinicalCategoryTone';

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
console.log('\n>>> categoryCtaHint.test.ts');

const EXPECTED_CATEGORIES = ['치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과'];

test('정확히 7 카테고리 정의', () => {
  const keys = Object.keys(CATEGORY_CTA_HINT).sort();
  assert.deepEqual(keys, [...EXPECTED_CATEGORIES].sort());
});

test('drift-zero invariant: CATEGORY_TONE 과 동일 카테고리 set', () => {
  const ctaKeys = Object.keys(CATEGORY_CTA_HINT).sort();
  const toneKeys = Object.keys(CATEGORY_TONE).sort();
  assert.deepEqual(ctaKeys, toneKeys, 'CATEGORY_TONE 과 set 불일치');
});

test('drift-zero invariant: PRESS_CATEGORY_TONE 과 동일 카테고리 set', () => {
  const ctaKeys = Object.keys(CATEGORY_CTA_HINT).sort();
  const pressKeys = Object.keys(PRESS_CATEGORY_TONE).sort();
  assert.deepEqual(ctaKeys, pressKeys, 'PRESS_CATEGORY_TONE 과 set 불일치');
});

test('drift-zero invariant: CLINICAL_CATEGORY_TONE 과 동일 카테고리 set', () => {
  const ctaKeys = Object.keys(CATEGORY_CTA_HINT).sort();
  const clinKeys = Object.keys(CLINICAL_CATEGORY_TONE).sort();
  assert.deepEqual(ctaKeys, clinKeys, 'CLINICAL_CATEGORY_TONE 과 set 불일치');
});

for (const cat of EXPECTED_CATEGORIES) {
  test(`"${cat}" CTA 힌트 — 30~200자, 자연 한국어`, () => {
    const hint = CATEGORY_CTA_HINT[cat];
    assert.ok(hint, `${cat} 누락`);
    assert.ok(hint.length >= 30 && hint.length <= 200, `${cat} 길이 ${hint.length}자 (30~200 범위 벗어남)`);
    assert.ok(/[가-힣]/.test(hint), `${cat} 한글 없음`);
  });
}

const MEDICAL_LAW_BLOCKLIST = ['최고', '완치', '보장', '100%', '확실', '평생', '단연', '단 한 번', '부작용 없'];

for (const cat of EXPECTED_CATEGORIES) {
  test(`"${cat}" 의료법 위반 substring 0건`, () => {
    const hint = CATEGORY_CTA_HINT[cat];
    for (const term of MEDICAL_LAW_BLOCKLIST) {
      assert.ok(!hint.includes(term), `${cat} 에 금기 어휘 "${term}" 포함`);
    }
  });
}

test('prose 룰 정합: 글머리표·번호·하이픈 list 없음', () => {
  for (const [cat, hint] of Object.entries(CATEGORY_CTA_HINT)) {
    assert.ok(!/^\s*[-•·▪◦*]\s/m.test(hint), `${cat}: 글머리표 발견`);
    assert.ok(!/^\s*\d+[).]\s/m.test(hint), `${cat}: 번호 list 발견`);
    assert.ok(!hint.includes('\n'), `${cat}: 줄바꿈 — 한 줄 권장`);
  }
});

test('getCategoryCtaHint: 등록 카테고리 정확 조회', () => {
  assert.equal(getCategoryCtaHint('치과'), CATEGORY_CTA_HINT['치과']);
  assert.equal(getCategoryCtaHint('한의원'), CATEGORY_CTA_HINT['한의원']);
});

test('getCategoryCtaHint: 미등록 / undefined / null → null', () => {
  assert.equal(getCategoryCtaHint(undefined), null);
  assert.equal(getCategoryCtaHint(null), null);
  assert.equal(getCategoryCtaHint(''), null);
  assert.equal(getCategoryCtaHint('미등록과'), null);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
