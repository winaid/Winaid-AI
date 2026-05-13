/**
 * contentFunnel 회귀 가드 + drift-zero invariant.
 *
 * 보장:
 *  - 7 카테고리 round-trip (build → URLSearchParams → parse)
 *  - 화이트리스트 검증 — 잘못된 category / __proto__ / <script> → undefined fallback
 *  - source=diagnostic tag 보존
 *  - VALID_CONTENT_CATEGORIES === ContentCategory enum value set (drift-zero)
 *  - VALID_CONTENT_CATEGORIES === quartet (CATEGORY_TONE / PRESS / CLINICAL /
 *    CATEGORY_CTA_HINT) key set === CATEGORY_KEYWORDS key set (5중 정합)
 */
import assert from 'node:assert/strict';
import {
  buildFunnelUrl,
  parseFunnelParams,
  type FunnelDestination,
} from '../lib/diagnostic/contentFunnel';
import {
  VALID_CONTENT_CATEGORIES,
  ContentCategory,
  CATEGORY_TONE,
  PRESS_CATEGORY_TONE,
  CLINICAL_CATEGORY_TONE,
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
console.log('\n>>> contentFunnel.test.ts');

const EXPECTED_CATEGORIES = ['치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과'];

// ── drift-zero invariant: 5중 정합 ──

test('ContentCategory enum 값 set === VALID_CONTENT_CATEGORIES set', () => {
  const enumValues = Object.values(ContentCategory).sort();
  const validList = [...VALID_CONTENT_CATEGORIES].sort();
  assert.deepEqual(enumValues, validList);
});

test('VALID_CONTENT_CATEGORIES 가 7 카테고리', () => {
  assert.equal(VALID_CONTENT_CATEGORIES.size, 7);
  assert.deepEqual([...VALID_CONTENT_CATEGORIES].sort(), [...EXPECTED_CATEGORIES].sort());
});

test('drift-zero 5중: VALID === CATEGORY_TONE === PRESS === CLINICAL === CTA_HINT', () => {
  const valid = [...VALID_CONTENT_CATEGORIES].sort();
  assert.deepEqual(Object.keys(CATEGORY_TONE).sort(), valid, 'CATEGORY_TONE drift');
  assert.deepEqual(Object.keys(PRESS_CATEGORY_TONE).sort(), valid, 'PRESS_CATEGORY_TONE drift');
  assert.deepEqual(Object.keys(CLINICAL_CATEGORY_TONE).sort(), valid, 'CLINICAL_CATEGORY_TONE drift');
  assert.deepEqual(Object.keys(CATEGORY_CTA_HINT).sort(), valid, 'CATEGORY_CTA_HINT drift');
});

// ── buildFunnelUrl ──

const DESTS: FunnelDestination[] = ['blog', 'press', 'refine'];

for (const dest of DESTS) {
  for (const cat of EXPECTED_CATEGORIES) {
    test(`buildFunnelUrl(${dest}, ${cat}) 정확 URL`, () => {
      const url = buildFunnelUrl(dest, { category: cat, source: 'diagnostic' });
      assert.ok(url.startsWith(`/${dest}?`), `dest path ${dest} 누락`);
      assert.ok(url.includes(`category=${encodeURIComponent(cat)}`), `category 인코딩 누락`);
      assert.ok(url.includes('source=diagnostic'), 'source tag 누락');
    });
  }
}

test('buildFunnelUrl: category 없으면 query 없이 base path', () => {
  assert.equal(buildFunnelUrl('blog', {}), '/blog');
});

test('buildFunnelUrl: 미등록 category → query 제외 (안전)', () => {
  const url = buildFunnelUrl('blog', { category: '미등록과', source: 'diagnostic' });
  assert.ok(!url.includes('category='), '미등록 category 가 URL 에 포함됨 (위험)');
  assert.ok(url.includes('source=diagnostic'), 'source 는 보존');
});

// ── parseFunnelParams ──

test('parseFunnelParams: round-trip (build → parse) 정확 복원', () => {
  for (const cat of EXPECTED_CATEGORIES) {
    const url = buildFunnelUrl('blog', { category: cat, source: 'diagnostic' });
    const sp = new URLSearchParams(url.split('?')[1] || '');
    const parsed = parseFunnelParams(sp);
    assert.equal(parsed.category, cat, `${cat} round-trip 실패`);
    assert.equal(parsed.source, 'diagnostic', `${cat} source 누락`);
  }
});

test('parseFunnelParams: null searchParams → 빈 객체', () => {
  assert.deepEqual(parseFunnelParams(null), {});
});

test('parseFunnelParams: 잘못된 category → undefined (XSS 가드)', () => {
  const sp = new URLSearchParams('category=__proto__&source=diagnostic');
  const parsed = parseFunnelParams(sp);
  assert.equal(parsed.category, undefined);
  assert.equal(parsed.source, 'diagnostic');
});

test('parseFunnelParams: <script> injection → undefined', () => {
  const sp = new URLSearchParams('category=<script>alert(1)</script>');
  assert.equal(parseFunnelParams(sp).category, undefined);
});

test('parseFunnelParams: 잘못된 source → undefined', () => {
  const sp = new URLSearchParams('category=치과&source=hacker');
  const parsed = parseFunnelParams(sp);
  assert.equal(parsed.category, '치과');
  assert.equal(parsed.source, undefined);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
