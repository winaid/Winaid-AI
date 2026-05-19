/**
 * campaignPrefill 회귀 테스트 (public-app) — GEO-12 AEO→콘텐츠 파이프라인.
 *
 * 실행: npx tsx __tests__/campaignPrefill.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - 4 builder 정확도 (EEAT / Sentiment / Naver / Competitor)
 *   - serializeToQueryParams (category 7 화이트리스트 + title cap + outline join)
 *   - parseCampaignPrefill (역방향 + 잘못된 값 차단)
 *   - 카테고리 7 drift-zero invariant (잘못된 카테고리 prefill 차단)
 *   - 양 앱 lockstep (4 GEO section diff=0 + blog page builder import)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPrefillFromEEATWeakness,
  buildPrefillFromSentimentWeakness,
  buildPrefillFromMissingNaverChannel,
  buildPrefillFromCompetitorContent,
  serializeToQueryParams,
  buildPrefillDeeplink,
  parseCampaignPrefill,
  ContentCategory,
} from '@winaid/blog-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
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

// eslint-disable-next-line no-console
console.log('\n>>> campaignPrefill.test.ts — public-app');

(async () => {
  // ── 4 builder 정확도 ──

  await test('buildPrefillFromEEATWeakness: 매칭 label → 적절 title + tone + pattern', () => {
    const p = buildPrefillFromEEATWeakness('의료진 dedicated 페이지', ['의료진 약력 페이지 신설']);
    assert.equal(p.source_kind, 'eeat_weakness');
    assert.ok(p.title?.includes('원장 약력'));
    assert.equal(p.tone, 'professional');
    assert.equal(p.pattern_type, 'doctor_interview');
    assert.equal(p.category, ContentCategory.DENTAL);
    assert.deepEqual(p.outline_hint, ['의료진 약력 페이지 신설']);
  });

  await test('buildPrefillFromEEATWeakness: 매칭 안 되는 label → generic fallback title', () => {
    const p = buildPrefillFromEEATWeakness('생소한 신호', ['뭐든']);
    assert.equal(p.source_kind, 'eeat_weakness');
    assert.ok(p.title?.startsWith('E-E-A-T 보강:'));
    assert.equal(p.tone, undefined);
  });

  await test('buildPrefillFromSentimentWeakness: 매칭 label → 적절 title', () => {
    const p = buildPrefillFromSentimentWeakness('비교 어려움', ['비교표 신설']);
    assert.equal(p.source_kind, 'sentiment_weakness');
    assert.equal(p.pattern_type, 'comparison_table');
    assert.ok(p.title?.includes('비교'));
  });

  await test('buildPrefillFromMissingNaverChannel: 4 채널 매핑 + source_kind', () => {
    for (const ch of ['naver_blog', 'naver_cafe', 'naver_place', 'naver_post'] as const) {
      const p = buildPrefillFromMissingNaverChannel(ch);
      assert.equal(p.source_kind, 'missing_naver');
      assert.equal(p.source_id, ch);
      assert.ok(p.title && p.title.length > 0);
    }
  });

  await test('buildPrefillFromCompetitorContent: 경쟁사 title + pattern 그대로 전달', () => {
    const p = buildPrefillFromCompetitorContent({
      title: '수면 임플란트 통증 줄이는 방법',
      pattern_type: 'faq',
      competitor_domain: 'rival.com',
      content_id: 'c-123',
    });
    assert.equal(p.source_kind, 'competitor_response');
    assert.equal(p.source_id, 'c-123');
    assert.equal(p.pattern_type, 'faq');
    assert.ok(p.title?.includes('우리 관점:'));
    assert.ok(p.title?.includes('수면 임플란트'));
  });

  // ── serializeToQueryParams ──

  await test('serialize: 7 카테고리 화이트리스트 (drift-zero invariant)', () => {
    // 정상 카테고리
    const p = buildPrefillFromEEATWeakness('의료진 dedicated 페이지', [], ContentCategory.DERMATOLOGY);
    const sp = serializeToQueryParams(p);
    assert.equal(sp.get('category'), '피부과');
    // 잘못된 카테고리 → omit
    const bad = { ...p, category: '바보병원' as ContentCategory };
    const sp2 = serializeToQueryParams(bad);
    assert.equal(sp2.get('category'), null, '잘못된 카테고리가 통과됨 (drift-zero 위반)');
  });

  await test('serialize: from + source_kind + title + tone 모두 포함', () => {
    const p = buildPrefillFromSentimentWeakness('비교 어려움', []);
    const sp = serializeToQueryParams(p);
    assert.equal(sp.get('from'), 'geo_funnel');
    assert.equal(sp.get('source_kind'), 'sentiment_weakness');
    assert.ok(sp.get('title')?.length);
    assert.equal(sp.get('tone'), 'professional');
    assert.equal(sp.get('pattern_type'), 'comparison_table');
  });

  await test('serialize: outline_hint \\n join + cap', () => {
    const p = buildPrefillFromEEATWeakness('의료진 dedicated 페이지', [
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',  // 8 → cap 6
    ]);
    const sp = serializeToQueryParams(p);
    const hint = sp.get('outline_hint');
    assert.ok(hint);
    assert.equal(hint!.split('\n').length, 6, `cap 6 위반: ${hint!.split('\n').length}`);
  });

  await test('buildPrefillDeeplink: /blog?... 형식 + URL safe', () => {
    const p = buildPrefillFromMissingNaverChannel('naver_blog');
    const url = buildPrefillDeeplink(p);
    assert.ok(url.startsWith('/blog?'));
    assert.ok(url.includes('from=geo_funnel'));
    assert.ok(url.includes('source_kind=missing_naver'));
  });

  // ── parseCampaignPrefill (역방향) ──

  await test('parse: 잘못된 카테고리 → undefined (XSS / drift-zero 가드)', () => {
    const sp = new URLSearchParams('from=geo_funnel&category=악의카테고리&source_kind=eeat_weakness');
    const parsed = parseCampaignPrefill(sp);
    assert.equal(parsed.category, undefined);
    assert.equal(parsed.from, 'geo_funnel');
  });

  await test('parse: 정상 카테고리 + source_kind + title 복원', () => {
    const sp = new URLSearchParams('from=geo_funnel&category=치과&title=원장+약력+안내&source_kind=eeat_weakness&tone=professional');
    const parsed = parseCampaignPrefill(sp);
    assert.equal(parsed.category, ContentCategory.DENTAL);
    assert.equal(parsed.title, '원장 약력 안내');
    assert.equal(parsed.source_kind, 'eeat_weakness');
    assert.equal(parsed.tone, 'professional');
  });

  await test('parse: from 이 geo_funnel 아니면 from undefined (other source 영향 0)', () => {
    const sp = new URLSearchParams('from=other&category=치과');
    const parsed = parseCampaignPrefill(sp);
    assert.equal(parsed.from, undefined);
    // category 는 일반 검증 — geo_funnel 아니라도 통과 (다른 funnel 도 사용 가능)
    assert.equal(parsed.category, ContentCategory.DENTAL);
  });

  await test('parse: outline_hint 복원 (\\n split + cap)', () => {
    const sp = new URLSearchParams();
    sp.set('outline_hint', 'a\nb\nc\nd\ne\nf\ng');
    const parsed = parseCampaignPrefill(sp);
    assert.ok(parsed.outline_hint);
    assert.equal(parsed.outline_hint!.length, 6, `cap 6 위반: ${parsed.outline_hint!.length}`);
  });

  // ── round-trip ──

  await test('round-trip: builder → serialize → parse 결과 일치', () => {
    const original = buildPrefillFromEEATWeakness('의료진 dedicated 페이지', ['약력 페이지 신설']);
    const sp = serializeToQueryParams(original);
    const parsed = parseCampaignPrefill(sp);
    assert.equal(parsed.title, original.title);
    assert.equal(parsed.tone, original.tone);
    assert.equal(parsed.category, original.category);
    assert.equal(parsed.pattern_type, original.pattern_type);
    assert.deepEqual(parsed.outline_hint, original.outline_hint);
    assert.equal(parsed.source_kind, original.source_kind);
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: 4 GEO 섹션 (EEAT/Sentiment/Naver/Competitor) 양 앱 diff=0 유지', () => {
    for (const f of ['EEATSection', 'SentimentDrilldownSection', 'NaverChannelSection', 'CompetitorContentSection']) {
      const p1 = resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`);
      const p2 = resolve(REPO_ROOT, `next-app/components/diagnostic/${f}.tsx`);
      assert.ok(existsSync(p1) && existsSync(p2), `${f} 누락`);
      assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), `${f}: 양 앱 drift`);
    }
  });

  await test('lockstep: blog page 양 앱 parseCampaignPrefill import (lockstep 양쪽)', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/app/(dashboard)/blog/page.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/app/(dashboard)/blog/page.tsx');
    const s1 = readFileSync(p1, 'utf-8');
    const s2 = readFileSync(p2, 'utf-8');
    assert.ok(/parseCampaignPrefill/.test(s1), 'public-app: parseCampaignPrefill import 누락');
    assert.ok(/parseCampaignPrefill/.test(s2), 'next-app: parseCampaignPrefill import 누락');
    // geoPrefill 변수 사용 확인 (양 앱)
    assert.ok(/geoPrefill/.test(s1) && /geoPrefill/.test(s2));
  });

  await test('lockstep: campaignPrefillBuilder blog-core 단일 소스 + 4 section + blog page import', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/campaignPrefillBuilder.ts');
    assert.ok(existsSync(p), 'campaignPrefillBuilder 누락');
    // 4 section 의 import 확인 (CompetitorContentSection 은 서버 API 사용 — 본 PR scope 외)
    const sections = ['EEATSection', 'SentimentDrilldownSection', 'NaverChannelSection'];
    for (const f of sections) {
      const s = readFileSync(resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`), 'utf-8');
      assert.ok(/buildPrefillDeeplink|buildPrefillFrom/.test(s), `${f}: builder import 누락`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
