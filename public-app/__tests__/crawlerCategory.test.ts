/**
 * crawler.detectCategory 회귀 가드 — 7 카테고리 자동검출.
 *
 * 보장:
 *  - drift-zero invariant — CATEGORY_KEYWORDS key set === quartet (CATEGORY_TONE /
 *    PRESS_CATEGORY_TONE / CLINICAL_CATEGORY_TONE / CATEGORY_CTA_HINT) 정확 일치
 *  - 기존 4 카테고리 detect 동작 회귀 0
 *  - 신규 3 카테고리 (한의원·안과·내과) 정상 detect
 *  - fallback 동작 (빈 corpus / 0 매치 → '치과')
 *  - priority tie-break (동률 score → CATEGORY_PRIORITY 순)
 */
import assert from 'node:assert/strict';
import { detectCategory } from '../lib/diagnostic/crawler';
import type { CrawlResult } from '../lib/diagnostic/types';
import {
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
console.log('\n>>> crawlerCategory.test.ts');

function mockCrawl(text: string): CrawlResult {
  return {
    finalUrl: 'https://example.com',
    title: '',
    metaDescription: '',
    ogTags: {},
    canonical: '',
    lang: 'ko',
    h1: [],
    h2: [],
    headingStructure: [],
    schemaMarkup: [],
    schemaTypes: [],
    internalLinks: [],
    externalLinks: [],
    navLinks: [],
    images: [],
    imagesWithoutAlt: 0,
    totalImages: 0,
    textContent: text,
    wordCount: text.length,
    hasContactInfo: false,
    hasAddress: false,
    hasBusinessHours: false,
    hasSSL: true,
    hasSitemap: false,
    hasRobotsTxt: false,
    robotsTxtContent: '',
    viewport: '',
    charset: 'utf-8',
    hasDoctorInfo: false,
    hasServicePages: false,
    hasFAQ: false,
    hasMap: false,
    detectedServices: [],
    subpagesReached: [],
  };
}

// ── drift-zero invariant ──

test('drift-zero: detect 결과가 quartet (CATEGORY_TONE) 키 set 의 부분집합', () => {
  // detectCategory 가 반환할 수 있는 모든 카테고리 set
  const allCategories = ['치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과'];
  const toneKeys = Object.keys(CATEGORY_TONE).sort();
  assert.deepEqual(allCategories.sort(), toneKeys, 'detect 가능 카테고리 ≠ CATEGORY_TONE 키 set');
});

test('drift-zero: quartet 4 record 모두 동일 7 카테고리 set', () => {
  const tone = Object.keys(CATEGORY_TONE).sort();
  const press = Object.keys(PRESS_CATEGORY_TONE).sort();
  const clin = Object.keys(CLINICAL_CATEGORY_TONE).sort();
  const cta = Object.keys(CATEGORY_CTA_HINT).sort();
  assert.deepEqual(tone, press, 'TONE vs PRESS drift');
  assert.deepEqual(tone, clin, 'TONE vs CLINICAL drift');
  assert.deepEqual(tone, cta, 'TONE vs CTA_HINT drift');
});

// ── 기존 4 카테고리 회귀 가드 ──

test('치과 corpus → 치과 detect (기존 회귀 0)', () => {
  assert.equal(detectCategory(mockCrawl('우리 치과는 임플란트 교정 사랑니 발치')), '치과');
});

test('피부과 corpus → 피부과 detect (기존 회귀 0)', () => {
  assert.equal(detectCategory(mockCrawl('피부 여드름 색소 레이저 보톡스 필러')), '피부과');
});

test('정형외과 corpus → 정형외과 detect (기존 회귀 0)', () => {
  assert.equal(detectCategory(mockCrawl('정형외과 관절 척추 디스크 도수치료')), '정형외과');
});

test('성형외과 corpus → 성형외과 detect (기존 회귀 0)', () => {
  assert.equal(detectCategory(mockCrawl('성형 코성형 눈성형 안면윤곽 가슴성형')), '성형외과');
});

// ── 신규 3 카테고리 ──

test('한의원 corpus → 한의원 detect', () => {
  assert.equal(detectCategory(mockCrawl('한의원에서 침치료 한약 추나 체질 진료')), '한의원');
});

test('안과 corpus → 안과 detect', () => {
  assert.equal(detectCategory(mockCrawl('안과 시력 백내장 라식 망막 노안 검사')), '안과');
});

test('내과 corpus → 내과 detect', () => {
  assert.equal(detectCategory(mockCrawl('내과 소화기 내시경 위염 당뇨 고혈압 건강검진')), '내과');
});

// ── fallback / edge ──

test('빈 corpus → 치과 fallback (기존 동작 유지)', () => {
  assert.equal(detectCategory(mockCrawl('')), '치과');
});

test('의료 무관 corpus (0 매치) → 치과 fallback', () => {
  assert.equal(detectCategory(mockCrawl('카페 메뉴 아메리카노 라떼')), '치과');
});

// ── priority tie-break ──

test('동률 score (치과 1 + 한의원 1) → 치과 우선 (priority)', () => {
  // 임플란트(치과 1) + 침치료(한의원 1) — 동률
  assert.equal(detectCategory(mockCrawl('임플란트 침치료')), '치과');
});

test('동률 score (내과 1 + 안과 1) → 내과 우선 (priority append 순)', () => {
  // 당뇨(내과 1) + 시력(안과 1) — 동률
  assert.equal(detectCategory(mockCrawl('당뇨 시력')), '내과');
});

// ── 우세 score 확인 ──

test('한의원 키워드 3개 vs 치과 1개 → 한의원 우세', () => {
  assert.equal(detectCategory(mockCrawl('치아 한방 한약 침치료')), '한의원');
});

test('안과 키워드 3개 vs 내과 1개 → 안과 우세', () => {
  assert.equal(detectCategory(mockCrawl('당뇨 백내장 라식 망막')), '안과');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
