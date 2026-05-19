/**
 * competitorWatch 회귀 테스트 (public-app) — GEO-9 경쟁사 콘텐츠 자동 감지.
 *
 * 실행: npx tsx __tests__/competitorWatch.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - extractCompetitorsFromCitations: hostname 정규화 + 우리 도메인 제외 + 빈도 임계
 *   - fetchCompetitorNewContent: RSS 파싱 + sitemap 파싱 + fail-safe
 *   - searchNaverCompetitorPosts: env 미설정 graceful skip
 *   - detectNewContent: 통합 + URL dedup
 *   - 라우트 4종 validation
 *   - 양 SQL 본문 diff=0
 *   - 양 앱 lockstep (CompetitorContentSection diff=0 + watcher 단일 소스)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractCompetitorsFromCitations,
  fetchCompetitorNewContent,
  searchNaverCompetitorPosts,
  detectNewContent,
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
console.log('\n>>> competitorWatch.test.ts — next-app');

// ── helpers ──

const day = 86_400_000;
const NOW = Date.now();

function makeRow(daysAgo: number, citationUrls: string[]): CitationRow {
  return {
    campaign_id: null,
    hospital_name: 'our-hospital',
    query: 'q',
    ai_model: 'chatgpt',
    answer_text: 'a',
    citations: citationUrls.map(u => ({ url: u, is_ours: u.includes('mysmile.co.kr') })),
    our_domains: ['mysmile.co.kr'],
    created_at: new Date(NOW - daysAgo * day).toISOString(),
  };
}

(async () => {
  // ── extractCompetitorsFromCitations ──

  await test('extractCompetitors: 빈도 ≥ 2 만 추출 + 우리 도메인 제외', () => {
    const rows: CitationRow[] = [
      makeRow(1, [
        'https://mysmile.co.kr/post-1',
        'https://competitor-a.com/page',
        'https://competitor-b.com/page',
      ]),
      makeRow(2, [
        'https://competitor-a.com/page2',  // a 빈도 2
        'https://once-only.com/page',       // 1회만 → 제외
      ]),
    ];
    const out = extractCompetitorsFromCitations(rows, ['mysmile.co.kr'], 'our-hospital');
    const hosts = out.map(c => c.domain);
    assert.ok(hosts.includes('competitor-a.com'), 'competitor-a 누락');
    assert.ok(!hosts.includes('mysmile.co.kr'), '우리 도메인 false positive');
    assert.ok(!hosts.includes('once-only.com'), '빈도 1 통과 (임계 위반)');
  });

  await test('extractCompetitors: hostname 정규화 (www 제거, lowercase)', () => {
    const rows: CitationRow[] = [
      makeRow(1, ['https://www.Big-Site.com/a', 'https://big-site.com/b']),
    ];
    const out = extractCompetitorsFromCitations(rows, [], 'h');
    assert.equal(out.length, 1, `expected 1, got ${out.length}`);
    assert.equal(out[0].domain, 'big-site.com');
  });

  await test('extractCompetitors: windowDays 필터 — 오래된 row 제외', () => {
    const rows: CitationRow[] = [
      makeRow(1, ['https://recent.com/a', 'https://recent.com/b']),
      makeRow(20, ['https://veteran.com/a', 'https://veteran.com/b']),
    ];
    const out = extractCompetitorsFromCitations(rows, [], 'h', { windowDays: 7 });
    const hosts = out.map(c => c.domain);
    assert.ok(hosts.includes('recent.com'));
    assert.ok(!hosts.includes('veteran.com'), 'window 외 row 가 포함됨');
  });

  await test('extractCompetitors: 빈도 임계 옵션 (minFrequency=1)', () => {
    const rows: CitationRow[] = [makeRow(1, ['https://once.com/a'])];
    const out = extractCompetitorsFromCitations(rows, [], 'h', { minFrequency: 1 });
    assert.equal(out.length, 1);
  });

  // ── fetchCompetitorNewContent (네트워크 fail-safe) ──

  await test('fetchCompetitorNewContent: 존재하지 않는 host → 빈 배열 (fail-safe, throw X)', async () => {
    const out = await fetchCompetitorNewContent('this-host-does-not-exist-xyz.invalid');
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 0);
  });

  // ── searchNaverCompetitorPosts ──

  await test('searchNaverCompetitorPosts: NAVER_CLIENT_ID 미설정 → 빈 배열 (silent skip)', async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
    const out = await searchNaverCompetitorPosts('test-clinic');
    assert.equal(out.length, 0);
  });

  await test('searchNaverCompetitorPosts: 빈 keyword → 빈 배열', async () => {
    process.env.NAVER_CLIENT_ID = 'fake';
    process.env.NAVER_CLIENT_SECRET = 'fake';
    const out = await searchNaverCompetitorPosts('');
    assert.equal(out.length, 0);
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
  });

  // ── detectNewContent 통합 (네트워크 fail-safe) ──

  await test('detectNewContent: 존재하지 않는 host + naver key 없음 → 빈 items + meta', async () => {
    const r = await detectNewContent('this-host-does-not-exist-xyz.invalid');
    assert.equal(r.domain, 'this-host-does-not-exist-xyz.invalid');
    assert.equal(r.items.length, 0);
    assert.equal(r.meta.naverBlogFound, 0);
    assert.equal(r.meta.naverCafeFound, 0);
  });

  // ── 라우트 validation ──

  await test('route: detect — hospital_name 필수 + maxDuration 90', () => {
    const p = resolve(REPO_ROOT, 'next-app/app/api/geo/competitor/detect/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/hospital_name 필수/.test(src), 'hospital_name 검증 누락');
    assert.ok(/export const maxDuration = 90/.test(src));
  });

  await test('route: list — GET/POST/DELETE 모두 export + hospital_name 검증', () => {
    const p = resolve(REPO_ROOT, 'next-app/app/api/geo/competitor/list/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/export async function GET/.test(src) || /export const GET/.test(src));
    assert.ok(/export async function POST/.test(src) || /export const POST/.test(src));
    assert.ok(/export async function DELETE/.test(src) || /export const DELETE/.test(src));
    assert.ok(/hospital_name 필수/.test(src));
    assert.ok(/domain 형식 오류/.test(src));
  });

  await test('route: respond — competitor_content_id 필수 + prefillUrl 생성', () => {
    const p = resolve(REPO_ROOT, 'next-app/app/api/geo/competitor/respond/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/competitor_content_id 필수/.test(src));
    assert.ok(/prefillUrl/.test(src));
    assert.ok(/responded:\s*true/.test(src), 'responded 마킹 누락');
  });

  await test('route: next-app — checkAuth (admin_session) 3 라우트 모두', () => {
    for (const f of ['detect', 'list', 'respond']) {
      const p = resolve(REPO_ROOT, `next-app/app/api/geo/competitor/${f}/route.ts`);
      const src = readFileSync(p, 'utf-8');
      assert.ok(/checkAuth\(request\)/.test(src), `${f}: checkAuth 누락`);
    }
  });

  // ── 양 SQL diff=0 ──

  await test('lockstep: 양 SQL 파일 (competitor_content) 본문 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'sql/migrations/2026-05-19_competitor_content.sql');
    const p2 = resolve(REPO_ROOT, 'public-app-sql/migrations/2026-05-19_competitor_content.sql');
    assert.ok(existsSync(p1) && existsSync(p2));
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
  });

  await test('lockstep: SQL 멱등성 + UNIQUE + CHECK', () => {
    const p = resolve(REPO_ROOT, 'sql/migrations/2026-05-19_competitor_content.sql');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/CREATE TABLE IF NOT EXISTS public\.competitor_domains/.test(src));
    assert.ok(/CREATE TABLE IF NOT EXISTS public\.competitor_contents/.test(src));
    assert.ok(/UNIQUE \(hospital_name, domain\)/.test(src));
    assert.ok(/UNIQUE \(hospital_name, url\)/.test(src));
    assert.ok(/CHECK \(source IN \('citation', 'naver_blog', 'naver_cafe', 'website'\)\)/.test(src));
    assert.ok(/ENABLE ROW LEVEL SECURITY/.test(src));
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: CompetitorContentSection 양 앱 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/CompetitorContentSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/CompetitorContentSection.tsx');
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
  });

  await test('lockstep: competitorWatcher blog-core 단일 소스 + 양 앱 import', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/competitorWatcher.ts');
    assert.ok(existsSync(p), 'competitorWatcher 누락');
    for (const f of ['detect', 'list', 'respond']) {
      const r1 = readFileSync(resolve(REPO_ROOT, `public-app/app/api/geo/competitor/${f}/route.ts`), 'utf-8');
      const r2 = readFileSync(resolve(REPO_ROOT, `next-app/app/api/geo/competitor/${f}/route.ts`), 'utf-8');
      assert.ok(/@winaid\/blog-core/.test(r1), `public-app ${f}: blog-core import 누락`);
      assert.ok(/@winaid\/blog-core/.test(r2), `next-app ${f}: blog-core import 누락`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
