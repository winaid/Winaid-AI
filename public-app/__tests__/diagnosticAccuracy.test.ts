/**
 * diagnosticAccuracy.test.ts — HTTPS + viewport 검사 정확화 회귀 가드.
 *
 * 도입 배경 (PR — diagnostic accuracy audit):
 *   1. HTTPS: 인증서 만료/자체 서명 사이트에서 fetchInsecure 가 응답을 받아오면
 *      crawl.hasSSL = finalUrl.startsWith('https://') = true 가 되어 "보안 OK" 로
 *      잘못 표시됨. fetchInsecure 응답에 x-diagnostic-ssl-relaxed marker 부착 →
 *      crawlSite 가 hasSSL 평가 시 false 강제하도록 변경.
 *   2. viewport: `<meta viewport content="width=1024">` 같은 데스크탑 고정 width
 *      도 trim 후 truthy → "모바일 친화" 로 잘못 표시. width=device-width 명시
 *      검증으로 정확화.
 *
 * 양 앱 lockstep — next-app 동일 코드 + 동일 invariant.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');

console.log('=== diagnostic accuracy audit — public-app ===');

// ── HTTPS 검사 정확화 ─────────────────────────────────────

test('crawler.ts: fetchInsecure 가 x-diagnostic-ssl-relaxed marker 부착', () => {
  const p = resolve(REPO_ROOT, 'public-app/lib/diagnostic/crawler.ts');
  const src = readFileSync(p, 'utf-8');
  assert.ok(
    /x-diagnostic-ssl-relaxed/.test(src),
    'crawler.ts: fetchInsecure 에 x-diagnostic-ssl-relaxed marker 부착 누락 (SSL 완화 경로 표식)',
  );
  // marker set 위치가 fetchInsecure 내부 (HTTP fallback 보다 위) 인지 가벼운 확인
  const idxSet = src.indexOf("respHeaders.set('x-diagnostic-ssl-relaxed'");
  const idxFn = src.indexOf('async function fetchInsecure');
  assert.ok(idxFn > 0 && idxSet > idxFn, 'crawler.ts: marker set 이 fetchInsecure 함수 내부에 없음');
});

test('crawler.ts: hasSSL 평가 시 x-diagnostic-ssl-relaxed header 검사', () => {
  const p = resolve(REPO_ROOT, 'public-app/lib/diagnostic/crawler.ts');
  const src = readFileSync(p, 'utf-8');
  // crawlSite 에서 res.headers.get(...) 으로 marker 평탄화 후 parseHtml 에 전달
  assert.ok(
    /sslRelaxed\s*=\s*!!res\.headers\.get\(['"]x-diagnostic-ssl-relaxed['"]\)/.test(src),
    'crawler.ts: crawlSite 가 marker 헤더 평탄화 누락',
  );
  // parseHtml 내부에서 sslRelaxed 와 finalUrl 의 AND 결합
  assert.ok(
    /hasSSL\s*=\s*finalUrl\.startsWith\(['"]https:\/\/['"]\)\s*&&\s*!sslRelaxed/.test(src),
    'crawler.ts: hasSSL 가 SSL relaxed marker 와 AND 결합 누락 → false positive 가능',
  );
});

// ── 모바일 viewport 검사 정확화 ───────────────────────────

test('scoring.ts: viewport 검사가 width=device-width 명시 검증', () => {
  const p = resolve(REPO_ROOT, 'public-app/lib/diagnostic/scoring.ts');
  const src = readFileSync(p, 'utf-8');
  assert.ok(
    /width\s*\\s\*\s*=\s*\\s\*\s*device-width|width\s*=\s*device-width/.test(src) ||
      /\/width\\s\*=\\s\*device-width\/i\.test/.test(src),
    'scoring.ts: viewport 검사가 width=device-width 정규식 검증 누락',
  );
  // 기존 truthy-only 패턴 (`crawl.viewport ?`) 단독 분기 잔존 차단
  // 단순 truthy 분기 (`items.push(crawl.viewport`) 가 단독으로 hasMobileViewport 없이
  // 남아 있으면 false positive 회귀.
  const hasOldTruthy = /items\.push\(crawl\.viewport\s*\n\s*\?\s*makeItem\(LABELS\.viewport,\s*20,\s*20,\s*'pass'/.test(src);
  assert.ok(!hasOldTruthy, 'scoring.ts: 옛 truthy-only viewport 검사 잔존 (false positive 회귀)');
});

test('scoring.ts: hasMobileViewport 변수 사용 (3단계 메시지)', () => {
  const p = resolve(REPO_ROOT, 'public-app/lib/diagnostic/scoring.ts');
  const src = readFileSync(p, 'utf-8');
  assert.ok(
    /hasMobileViewport/.test(src),
    'scoring.ts: hasMobileViewport 변수 누락 (정확화 패치 적용 안 됨)',
  );
  // 빈 viewport vs 잘못된 viewport 메시지 분기
  assert.ok(
    /width=device-width\s*누락/.test(src),
    'scoring.ts: 잘못된 viewport 케이스 ("width=device-width 누락") 메시지 누락',
  );
});

// ── 양 앱 lockstep — 핵심 검사 로직 diff=0 ──────────────────

test('lockstep: 양 앱 crawler.ts hasSSL 평가 동일', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/lib/diagnostic/crawler.ts');
  const p2 = resolve(REPO_ROOT, 'next-app/lib/diagnostic/crawler.ts');
  if (!existsSync(p1) || !existsSync(p2)) return;
  const re = /const hasSSL = finalUrl\.startsWith\(['"]https:\/\/['"]\)\s*&&\s*!sslRelaxed;/;
  const s1 = readFileSync(p1, 'utf-8');
  const s2 = readFileSync(p2, 'utf-8');
  assert.ok(re.test(s1), 'public-app: hasSSL 패치 블록 누락');
  assert.ok(re.test(s2), 'next-app: hasSSL 패치 블록 누락 (양 앱 drift)');
});

test('lockstep: 양 앱 scoring.ts hasMobileViewport 평가 동일', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/lib/diagnostic/scoring.ts');
  const p2 = resolve(REPO_ROOT, 'next-app/lib/diagnostic/scoring.ts');
  if (!existsSync(p1) || !existsSync(p2)) return;
  const s1 = readFileSync(p1, 'utf-8');
  const s2 = readFileSync(p2, 'utf-8');
  assert.ok(/hasMobileViewport/.test(s1), 'public-app: hasMobileViewport 누락');
  assert.ok(/hasMobileViewport/.test(s2), 'next-app: hasMobileViewport 누락 (양 앱 drift)');
});

// ── 회귀 가드: 정규식 자체 검증 (오탐 0) ──────────────────

test('regex: width=device-width 매칭 정확도', () => {
  const re = /width\s*=\s*device-width/i;
  // pass 케이스
  assert.ok(re.test('width=device-width, initial-scale=1'));
  assert.ok(re.test('width= device-width'));
  assert.ok(re.test('Width=Device-Width'));
  // fail 케이스 (false positive 차단)
  assert.ok(!re.test('width=1024'));
  assert.ok(!re.test('user-scalable=no'));
  assert.ok(!re.test(''));
});

console.log('=== diagnostic accuracy: all checks loaded ===');
