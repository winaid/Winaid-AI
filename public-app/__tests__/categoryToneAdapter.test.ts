/**
 * categoryToneAdapter 회귀 가드.
 *
 * 보장:
 *  - 7 카테고리 각각 blogTone / pressTone / ctaHint 정확 매핑
 *  - 미감지·undefined·미등록 카테고리 → 모든 필드 null
 *  - hasToneRecommendation: 3 필드 중 하나라도 있으면 true / 모두 null 일 때만 false
 *  - quartet drift-zero — CATEGORY_TONE / PRESS_CATEGORY_TONE / CATEGORY_CTA_HINT 모두
 *    동일 7 카테고리 set 정의
 */
import assert from 'node:assert/strict';
import {
  deriveToneRecommendation,
  hasToneRecommendation,
} from '../lib/diagnostic/categoryToneAdapter';
import {
  CATEGORY_TONE,
  PRESS_CATEGORY_TONE,
  CATEGORY_CTA_HINT,
} from '@winaid/blog-core';

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
console.log('\n>>> categoryToneAdapter.test.ts');

const EXPECTED_CATEGORIES = ['치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과'];

for (const cat of EXPECTED_CATEGORIES) {
  test(`"${cat}" — 3 필드 모두 매핑됨 (blogTone, pressTone, ctaHint)`, () => {
    const rec = deriveToneRecommendation(cat);
    assert.equal(rec.blogTone, CATEGORY_TONE[cat].tone, `${cat} blogTone 불일치`);
    assert.equal(rec.pressTone, PRESS_CATEGORY_TONE[cat].tone, `${cat} pressTone 불일치`);
    assert.equal(rec.ctaHint, CATEGORY_CTA_HINT[cat], `${cat} ctaHint 불일치`);
    assert.ok(hasToneRecommendation(rec), `${cat} hasToneRecommendation true 이어야 함`);
  });
}

test('미감지 카테고리 (undefined) → 모든 필드 null', () => {
  const rec = deriveToneRecommendation(undefined);
  assert.equal(rec.blogTone, null);
  assert.equal(rec.pressTone, null);
  assert.equal(rec.ctaHint, null);
  assert.equal(hasToneRecommendation(rec), false);
});

test('null 카테고리 → 모든 필드 null', () => {
  const rec = deriveToneRecommendation(null);
  assert.equal(rec.blogTone, null);
  assert.equal(rec.pressTone, null);
  assert.equal(rec.ctaHint, null);
  assert.equal(hasToneRecommendation(rec), false);
});

test('빈 문자열 카테고리 → 모든 필드 null', () => {
  const rec = deriveToneRecommendation('');
  assert.equal(rec.blogTone, null);
  assert.equal(rec.pressTone, null);
  assert.equal(rec.ctaHint, null);
  assert.equal(hasToneRecommendation(rec), false);
});

test('미등록 카테고리 ("미등록과") → 모든 필드 null', () => {
  const rec = deriveToneRecommendation('미등록과');
  assert.equal(rec.blogTone, null);
  assert.equal(rec.pressTone, null);
  assert.equal(rec.ctaHint, null);
  assert.equal(hasToneRecommendation(rec), false);
});

test('drift-zero: 4 record (CATEGORY_TONE / PRESS / CTA) 모두 7 카테고리 동일 set', () => {
  const tone = Object.keys(CATEGORY_TONE).sort();
  const press = Object.keys(PRESS_CATEGORY_TONE).sort();
  const cta = Object.keys(CATEGORY_CTA_HINT).sort();
  assert.deepEqual(tone, press, 'CATEGORY_TONE vs PRESS_CATEGORY_TONE set drift');
  assert.deepEqual(tone, cta, 'CATEGORY_TONE vs CATEGORY_CTA_HINT set drift');
  assert.deepEqual(tone, [...EXPECTED_CATEGORIES].sort(), '7 카테고리 enum 불일치');
});

test('hasToneRecommendation: 부분 null 도 true', () => {
  assert.equal(
    hasToneRecommendation({ blogTone: 'x', pressTone: null, ctaHint: null }),
    true,
  );
  assert.equal(
    hasToneRecommendation({ blogTone: null, pressTone: null, ctaHint: 'y' }),
    true,
  );
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
