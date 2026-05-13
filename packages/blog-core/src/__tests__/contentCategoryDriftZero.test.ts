/**
 * ContentCategory enum 5중 정합 invariant — quartet (PR #194-197) + crawler 7 카테고리.
 *
 * 보장:
 *   - ContentCategory enum value set === VALID_CONTENT_CATEGORIES Set
 *   - === CATEGORY_TONE keys (블로그 본문)
 *   - === PRESS_CATEGORY_TONE keys (보도자료)
 *   - === CLINICAL_CATEGORY_TONE keys (임상글)
 *   - === CATEGORY_CTA_HINT keys (진단 dashboard CTA)
 *
 * 5중 정합 깨지면 fail-fast — 새 카테고리 추가 시 모든 record 동기화 강제.
 */
import assert from 'node:assert/strict';
import { ContentCategory, VALID_CONTENT_CATEGORIES } from '../types';
import { CATEGORY_TONE } from '../blogPrompt';
import { PRESS_CATEGORY_TONE } from '../pressCategoryTone';
import { CLINICAL_CATEGORY_TONE } from '../clinicalCategoryTone';
import { CATEGORY_CTA_HINT } from '../categoryCtaHint';

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
console.log('\n>>> contentCategoryDriftZero.test.ts');

const EXPECTED = ['치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과'];

test('ContentCategory enum: 정확히 7 values', () => {
  const values = Object.values(ContentCategory);
  assert.equal(values.length, 7);
  assert.deepEqual(values.sort(), [...EXPECTED].sort());
});

test('ContentCategory enum 7 entries', () => {
  assert.equal(ContentCategory.DENTAL, '치과');
  assert.equal(ContentCategory.DERMATOLOGY, '피부과');
  assert.equal(ContentCategory.ORTHOPEDICS, '정형외과');
  assert.equal(ContentCategory.PLASTIC_SURGERY, '성형외과');
  assert.equal(ContentCategory.INTERNAL_MEDICINE, '내과');
  assert.equal(ContentCategory.OPHTHALMOLOGY, '안과');
  assert.equal(ContentCategory.KOREAN_MEDICINE, '한의원');
});

test('VALID_CONTENT_CATEGORIES === ContentCategory value set', () => {
  const enumValues = Object.values(ContentCategory).sort();
  const valid = [...VALID_CONTENT_CATEGORIES].sort();
  assert.deepEqual(enumValues, valid);
});

test('drift-zero: CATEGORY_TONE keys === enum values', () => {
  const enumValues = Object.values(ContentCategory).sort();
  const toneKeys = Object.keys(CATEGORY_TONE).sort();
  assert.deepEqual(toneKeys, enumValues);
});

test('drift-zero: PRESS_CATEGORY_TONE keys === enum values', () => {
  const enumValues = Object.values(ContentCategory).sort();
  const pressKeys = Object.keys(PRESS_CATEGORY_TONE).sort();
  assert.deepEqual(pressKeys, enumValues);
});

test('drift-zero: CLINICAL_CATEGORY_TONE keys === enum values', () => {
  const enumValues = Object.values(ContentCategory).sort();
  const clinKeys = Object.keys(CLINICAL_CATEGORY_TONE).sort();
  assert.deepEqual(clinKeys, enumValues);
});

test('drift-zero: CATEGORY_CTA_HINT keys === enum values', () => {
  const enumValues = Object.values(ContentCategory).sort();
  const ctaKeys = Object.keys(CATEGORY_CTA_HINT).sort();
  assert.deepEqual(ctaKeys, enumValues);
});

test('VALID_CONTENT_CATEGORIES: 신규 4 카테고리 hit', () => {
  assert.ok(VALID_CONTENT_CATEGORIES.has('성형외과'));
  assert.ok(VALID_CONTENT_CATEGORIES.has('내과'));
  assert.ok(VALID_CONTENT_CATEGORIES.has('안과'));
  assert.ok(VALID_CONTENT_CATEGORIES.has('한의원'));
});

test('VALID_CONTENT_CATEGORIES: 미등록 reject', () => {
  assert.ok(!VALID_CONTENT_CATEGORIES.has('미등록과'));
  assert.ok(!VALID_CONTENT_CATEGORIES.has('__proto__'));
  assert.ok(!VALID_CONTENT_CATEGORIES.has(''));
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
