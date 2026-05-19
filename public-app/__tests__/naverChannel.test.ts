/**
 * naverChannel 회귀 테스트 (public-app) — GEO-11 네이버 채널 분류기.
 *
 * 실행: npx tsx __tests__/naverChannel.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - classifyNaverChannel: 8 채널 각각 + 모바일 (m.) prefix + 비-네이버 null
 *   - aggregateNaverChannels: 채널 카운트 + 모델별 + 우리/경쟁사 분리 + missingChannels
 *   - formatNaverRecommendations: registerable 채널만 권고
 *   - 양 앱 lockstep (NaverChannelSection diff=0 + classifier 단일 소스)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyNaverChannel,
  isNaverDomain,
  aggregateNaverChannels,
  formatNaverRecommendations,
  getNaverChannelLabel,
  type CitationRow,
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
console.log('\n>>> naverChannel.test.ts — public-app');

function makeRow(
  ai_model: 'chatgpt' | 'gemini',
  urls: Array<{ url: string; is_ours?: boolean }>,
): CitationRow {
  return {
    campaign_id: null,
    hospital_name: 'h',
    query: 'q',
    ai_model,
    answer_text: 'a',
    citations: urls.map(u => ({ url: u.url, is_ours: u.is_ours })),
    our_domains: ['mysmile.co.kr'],
    created_at: new Date().toISOString(),
  };
}

(async () => {
  // ── classifyNaverChannel 8 채널 각각 ──

  await test('classify: naver_blog (desktop + 모바일)', () => {
    assert.equal(classifyNaverChannel('https://blog.naver.com/clinic/123'), 'naver_blog');
    assert.equal(classifyNaverChannel('https://m.blog.naver.com/clinic/123'), 'naver_blog');
  });

  await test('classify: naver_cafe (desktop + 모바일)', () => {
    assert.equal(classifyNaverChannel('https://cafe.naver.com/cafe1/123'), 'naver_cafe');
    assert.equal(classifyNaverChannel('https://m.cafe.naver.com/cafe1/123'), 'naver_cafe');
  });

  await test('classify: naver_kin (지식인)', () => {
    assert.equal(classifyNaverChannel('https://kin.naver.com/qna/detail.naver?d1id=7&dirId=70212'), 'naver_kin');
  });

  await test('classify: naver_place + naver_news + naver_post', () => {
    assert.equal(classifyNaverChannel('https://place.naver.com/restaurant/123'), 'naver_place');
    assert.equal(classifyNaverChannel('https://m.place.naver.com/restaurant/123'), 'naver_place');
    assert.equal(classifyNaverChannel('https://news.naver.com/article/001/0014'), 'naver_news');
    assert.equal(classifyNaverChannel('https://post.naver.com/viewer/postView.naver?volumeNo=1'), 'naver_post');
  });

  await test('classify: naver_smartstore + naver_me', () => {
    assert.equal(classifyNaverChannel('https://smartstore.naver.com/shop/products/1'), 'naver_smartstore');
    assert.equal(classifyNaverChannel('https://naver.me/abc'), 'naver_me');
  });

  await test('classify: 비-네이버 URL → null', () => {
    assert.equal(classifyNaverChannel('https://mysmile.co.kr/post/1'), null);
    assert.equal(classifyNaverChannel('https://google.com'), null);
    assert.equal(classifyNaverChannel('https://hidoc.co.kr/article/123'), null);
    assert.equal(classifyNaverChannel('not-a-url'), null);
  });

  await test('classify: naver-clinic.com (substring naver, 다른 도메인) → null (false positive 차단)', () => {
    assert.equal(classifyNaverChannel('https://naver-clinic.com/about'), null);
    assert.equal(classifyNaverChannel('https://example.com/?ref=naver'), null);
  });

  await test('isNaverDomain: 8 채널 + naver.com 그 외 (예: search.naver.com)', () => {
    assert.ok(isNaverDomain('https://blog.naver.com/x'));
    assert.ok(isNaverDomain('https://search.naver.com/search.naver?query=치과'));
    assert.ok(!isNaverDomain('https://naver-clinic.com'));
    assert.ok(!isNaverDomain('https://google.com'));
  });

  // ── aggregateNaverChannels ──

  await test('aggregate: 모델별 + 채널별 카운트 정확', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', [
        { url: 'https://blog.naver.com/a/1' },
        { url: 'https://cafe.naver.com/b/2' },
        { url: 'https://google.com/search' },
      ]),
      makeRow('gemini', [
        { url: 'https://blog.naver.com/c/3' },
        { url: 'https://place.naver.com/d' },
        { url: 'https://kin.naver.com/qna/1' },
        { url: 'https://hidoc.co.kr/x' },
      ]),
    ];
    const sum = aggregateNaverChannels(rows, []);
    assert.equal(sum.totalCitations, 7);
    assert.equal(sum.naverCitations, 5);
    assert.equal(sum.byModel.chatgpt.total, 3);
    assert.equal(sum.byModel.chatgpt.naver, 2);
    assert.equal(sum.byModel.gemini.total, 4);
    assert.equal(sum.byModel.gemini.naver, 3);
    // 빈도 desc 정렬 — blog 2, place 1, cafe 1, kin 1
    assert.equal(sum.channels[0].channel, 'naver_blog');
    assert.equal(sum.channels[0].count, 2);
  });

  await test('aggregate: 우리 사이트 분리 (is_ours=true 매칭)', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', [
        { url: 'https://blog.naver.com/our-blog/1', is_ours: true },
        { url: 'https://blog.naver.com/competitor/2', is_ours: false },
        { url: 'https://blog.naver.com/competitor2/3', is_ours: false },
      ]),
    ];
    const sum = aggregateNaverChannels(rows, []);
    const blog = sum.channels.find(c => c.channel === 'naver_blog')!;
    assert.equal(blog.count, 3);
    assert.equal(blog.oursCount, 1);
    assert.deepEqual(sum.ourChannels, ['naver_blog']);
  });

  await test('aggregate: missingChannels (등록 가능한 4 채널 중 보유 안 한 것)', () => {
    // 보유 = naver_blog → missing = cafe / place / post
    const rows: CitationRow[] = [
      makeRow('chatgpt', [
        { url: 'https://blog.naver.com/ours/1', is_ours: true },
      ]),
    ];
    const sum = aggregateNaverChannels(rows, []);
    assert.deepEqual(sum.missingChannels.sort(), ['naver_cafe', 'naver_place', 'naver_post']);
  });

  await test('aggregate: 보유 채널 0 → 등록 가능 4 채널 모두 missing', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', [{ url: 'https://hidoc.co.kr/x' }]),
    ];
    const sum = aggregateNaverChannels(rows, []);
    assert.equal(sum.missingChannels.length, 4);
  });

  await test('aggregate: 빈 rows → 빈 summary (throw X)', () => {
    const sum = aggregateNaverChannels([], []);
    assert.equal(sum.totalCitations, 0);
    assert.equal(sum.naverCitations, 0);
    assert.equal(sum.channels.length, 0);
  });

  // ── formatNaverRecommendations ──

  await test('formatNaverRecommendations: missing 채널 label + 권고 포함', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', [{ url: 'https://blog.naver.com/x' }]),
    ];
    const sum = aggregateNaverChannels(rows, []);
    const recs = formatNaverRecommendations(sum);
    assert.ok(recs.length > 0);
    // 라벨 + 권고 형식: "[네이버 카페] ..."
    for (const r of recs) {
      assert.ok(r.startsWith('['), `권고 prefix 누락: ${r}`);
    }
  });

  await test('getNaverChannelLabel: 8 채널 모두 한국어 라벨', () => {
    const channels = ['naver_blog', 'naver_cafe', 'naver_kin', 'naver_place', 'naver_news', 'naver_post', 'naver_smartstore', 'naver_me'] as const;
    for (const c of channels) {
      const label = getNaverChannelLabel(c);
      assert.ok(label.length > 0);
      assert.ok(label.includes('네이버'), `${c}: 라벨에 "네이버" 누락`);
    }
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: NaverChannelSection 양 앱 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/NaverChannelSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/NaverChannelSection.tsx');
    assert.ok(existsSync(p1) && existsSync(p2));
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
  });

  await test('lockstep: naverChannelClassifier blog-core 단일 소스 + 양 앱 import', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/naverChannelClassifier.ts');
    assert.ok(existsSync(p));
    const s1 = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/NaverChannelSection.tsx'), 'utf-8');
    const s2 = readFileSync(resolve(REPO_ROOT, 'next-app/components/diagnostic/NaverChannelSection.tsx'), 'utf-8');
    assert.ok(/aggregateNaverChannels/.test(s1) && /@winaid\/blog-core/.test(s1));
    assert.ok(/aggregateNaverChannels/.test(s2) && /@winaid\/blog-core/.test(s2));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
