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

console.log('=== diagnostic accuracy audit — next-app ===');

// ── HTTPS 검사 정확화 ─────────────────────────────────────

test('crawler.ts: fetchInsecure 가 x-diagnostic-ssl-relaxed marker 부착', () => {
  const p = resolve(REPO_ROOT, 'next-app/lib/diagnostic/crawler.ts');
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
  const p = resolve(REPO_ROOT, 'next-app/lib/diagnostic/crawler.ts');
  const src = readFileSync(p, 'utf-8');
  assert.ok(
    /sslRelaxed\s*=\s*!!res\.headers\.get\(['"]x-diagnostic-ssl-relaxed['"]\)/.test(src),
    'crawler.ts: crawlSite 가 marker 헤더 평탄화 누락',
  );
  assert.ok(
    /hasSSL\s*=\s*finalUrl\.startsWith\(['"]https:\/\/['"]\)\s*&&\s*!sslRelaxed/.test(src),
    'crawler.ts: hasSSL 가 SSL relaxed marker 와 AND 결합 누락 → false positive 가능',
  );
});

// ── 모바일 viewport 검사 정확화 ───────────────────────────

test('scoring.ts: viewport 검사가 width=device-width 명시 검증', () => {
  const p = resolve(REPO_ROOT, 'next-app/lib/diagnostic/scoring.ts');
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
  const p = resolve(REPO_ROOT, 'next-app/lib/diagnostic/scoring.ts');
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

// ════════════════════════════════════════════════════════════
// Phase A — 6 false positive 후보 일괄 박멸 (PR #234 audit)
// ════════════════════════════════════════════════════════════

const SCORING_SRC = readFileSync(resolve(REPO_ROOT, 'next-app/lib/diagnostic/scoring.ts'), 'utf-8');

function extractRegexLiteral(name: string): RegExp {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(/[^\\n]+/[a-z]*)\\s*;`, 'm');
  const m = SCORING_SRC.match(re);
  if (!m) throw new Error(`${name} 정의 추출 실패 (scoring.ts 에 변수 부재)`);
  // eslint-disable-next-line no-eval
  return eval(m[1]) as RegExp;
}

// ── 후보 1: has_doctor_page — DOCTOR_PAGE_PATH + DOCTOR_NAME_PATTERN ──

test('Phase A #1: DOCTOR_PAGE_PATH — pass 케이스 (dedicated path)', () => {
  const re = extractRegexLiteral('DOCTOR_PAGE_PATH');
  assert.ok(re.test('/doctor'));
  assert.ok(re.test('/doctor/'));
  assert.ok(re.test('/physician/profile'));
  assert.ok(re.test('/medical-staff'));
  assert.ok(re.test('/의료진'));
  assert.ok(re.test('/진료진/'));
});

test('Phase A #1: DOCTOR_PAGE_PATH — false positive 차단', () => {
  const re = extractRegexLiteral('DOCTOR_PAGE_PATH');
  assert.ok(!re.test('/about'));
  assert.ok(!re.test('/greeting'));
  assert.ok(!re.test('/원장-인사말'));
  assert.ok(!re.test(''));
});

test('Phase A #1: DOCTOR_NAME_PATTERN — pass / fail 케이스', () => {
  const re = extractRegexLiteral('DOCTOR_NAME_PATTERN');
  assert.ok(re.test('원장 홍길동입니다.'));
  assert.ok(re.test('대표원장 김철수가 진료합니다'));
  assert.ok(re.test('부원장 이영희'));
  assert.ok(!re.test('원장 인사말'));
  assert.ok(!re.test('원장님이 진료'));
  assert.ok(!re.test('원장의 진료'));
});

// ── 후보 2: has_treatment_page — TREATMENT_PAGE_PATH + svcCount ≥ 2 ──

test('Phase A #2: TREATMENT_PAGE_PATH — pass 케이스', () => {
  const re = extractRegexLiteral('TREATMENT_PAGE_PATH');
  assert.ok(re.test('/treatment'));
  assert.ok(re.test('/service/dental'));
  assert.ok(re.test('/진료'));
  assert.ok(re.test('/시술/implant'));
  assert.ok(re.test('/진료안내'));
  assert.ok(re.test('/clinic/'));
});

test('Phase A #2: TREATMENT_PAGE_PATH — false positive 차단', () => {
  const re = extractRegexLiteral('TREATMENT_PAGE_PATH');
  assert.ok(!re.test('/about'));
  assert.ok(!re.test('/blog/진료시간'));
  assert.ok(!re.test('/'));
});

test('Phase A #2: scoring.ts — has_treatment_page 가 path AND svcCount 조합 사용', () => {
  assert.ok(
    /hasTreatmentPath/.test(SCORING_SRC),
    'scoring.ts: hasTreatmentPath 변수 누락 (path 기반 검증 적용 안 됨)',
  );
  assert.ok(
    !/const\s+trtRegex\s*=/.test(SCORING_SRC),
    'scoring.ts: 옛 trtRegex 부활 — 광범위 키워드 매칭 회귀',
  );
});

// ── 후보 3: has_service_details — 임계값 ≥ 3 / ≥ 2 / < 2 ──

test('Phase A #3: scoring.ts — has_service_details 3단계 임계값', () => {
  assert.ok(
    /svcCount >= 3[\s\S]*?LABELS\.has_service_details[\s\S]*?'pass'/.test(SCORING_SRC),
    'scoring.ts: has_service_details pass 가 svcCount >= 3 임계값 아님',
  );
  assert.ok(
    /svcCount >= 2[\s\S]*?LABELS\.has_service_details[\s\S]*?'warning'/.test(SCORING_SRC),
    'scoring.ts: has_service_details warning 단계 누락 (>= 2)',
  );
});

// ── 후보 4: has_pricing_page — PRICING_PAGE_PATH 만 ──

test('Phase A #4: PRICING_PAGE_PATH — pass 케이스', () => {
  const re = extractRegexLiteral('PRICING_PAGE_PATH');
  assert.ok(re.test('/price'));
  assert.ok(re.test('/cost/dental'));
  assert.ok(re.test('/요금'));
  assert.ok(re.test('/진료비'));
  assert.ok(re.test('/pricing/'));
});

test('Phase A #4: PRICING_PAGE_PATH — false positive 차단', () => {
  const re = extractRegexLiteral('PRICING_PAGE_PATH');
  assert.ok(!re.test('/about'));
  assert.ok(!re.test('/blog/'));
  assert.ok(!re.test('/contact?상담=true'));
  assert.ok(!re.test(''));
});

test('Phase A #4: 옛 priceRegex 부재 (상담 키워드 박멸)', () => {
  assert.ok(
    !/const\s+priceRegex\s*=/.test(SCORING_SRC),
    'scoring.ts: 옛 priceRegex 부활 — "상담 신청" false positive 회귀',
  );
  assert.ok(
    /PRICING_PAGE_PATH/.test(SCORING_SRC),
    'scoring.ts: PRICING_PAGE_PATH 누락 (path 기반 검증 적용 안 됨)',
  );
});

// ── 후보 5: 외부 채널 — hostname suffix 매칭 ──

interface ChMatcher { host: string; pathPrefix?: string }
function matchesCh(url: string, matchers: ChMatcher[]): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  return matchers.some(m =>
    (host === m.host || host.endsWith('.' + m.host)) &&
    (!m.pathPrefix || path.startsWith(m.pathPrefix))
  );
}

test('Phase A #5: 외부 채널 hostname suffix — naver 정확 매칭', () => {
  const naver: ChMatcher[] = [
    { host: 'place.naver.com' }, { host: 'm.place.naver.com' },
    { host: 'blog.naver.com' }, { host: 'm.blog.naver.com' }, { host: 'naver.me' },
  ];
  assert.ok(matchesCh('https://blog.naver.com/clinic', naver));
  assert.ok(matchesCh('https://place.naver.com/restaurant/123', naver));
  assert.ok(matchesCh('https://naver.me/abc', naver));
  assert.ok(!matchesCh('https://naver-clinic.com/about', naver));
  assert.ok(!matchesCh('https://example.com/?ref=naver', naver));
});

test('Phase A #5: 외부 채널 hostname suffix — google pathPrefix (goo.gl/maps)', () => {
  const google: ChMatcher[] = [
    { host: 'maps.google.com' }, { host: 'business.google.com' },
    { host: 'g.co' }, { host: 'goo.gl', pathPrefix: '/maps' },
  ];
  assert.ok(matchesCh('https://maps.google.com/?q=clinic', google));
  assert.ok(matchesCh('https://business.google.com/dashboard', google));
  assert.ok(matchesCh('https://g.co/kgs/abc', google));
  assert.ok(matchesCh('https://goo.gl/maps/abc', google));
  assert.ok(!matchesCh('https://goo.gl/abc', google));
  assert.ok(!matchesCh('https://goo.gl/forms', google));
});

test('Phase A #5: 외부 채널 hostname suffix — kakao pathPrefix (/_)', () => {
  const kakao: ChMatcher[] = [
    { host: 'pf.kakao.com' }, { host: 'kakao.com', pathPrefix: '/_' }, { host: 'kko.to' },
  ];
  assert.ok(matchesCh('https://pf.kakao.com/_abc', kakao));
  assert.ok(matchesCh('https://kakao.com/_clinic', kakao));
  assert.ok(matchesCh('https://kko.to/abc', kakao));
  assert.ok(!matchesCh('https://kakao.com/about', kakao));
  assert.ok(!matchesCh('https://kakao.com/', kakao));
});

test('Phase A #5: 외부 채널 hostname suffix — youtube / instagram', () => {
  const yt: ChMatcher[] = [{ host: 'youtube.com' }, { host: 'm.youtube.com' }, { host: 'youtu.be' }];
  const ig: ChMatcher[] = [{ host: 'instagram.com' }];
  assert.ok(matchesCh('https://www.youtube.com/@channel', yt));
  assert.ok(matchesCh('https://youtu.be/abc', yt));
  assert.ok(matchesCh('https://instagram.com/clinic', ig));
  assert.ok(matchesCh('https://www.instagram.com/clinic', ig));
  assert.ok(!matchesCh('https://fakeinstagram.com/clinic', ig));
  assert.ok(!matchesCh('https://youtube-clone.com/abc', yt));
});

test('Phase A #5: 외부 채널 — link text 매칭 회귀 차단', () => {
  assert.ok(
    /hasChannelMatch.*\bexternalLinks\.some\(l => matchesChannelMatcher\(l\.href/.test(
      SCORING_SRC.replace(/\n/g, ' '),
    ),
    'scoring.ts: hasChannelMatch 가 l.href 만 검사 안 함 — text 매칭 회귀',
  );
});

// ── 후보 6: alt_ratio unknown 문구 명확화 ──

test('Phase A #1: scoring.ts — has_doctor_page 3단계 구조 (path AND name)', () => {
  assert.ok(
    /hasDoctorPath/.test(SCORING_SRC) && /hasDoctorName/.test(SCORING_SRC),
    'scoring.ts: hasDoctorPath/hasDoctorName 변수 누락 (path + name 조합 검증 X)',
  );
  assert.ok(
    !/const\s+docRegex\s*=/.test(SCORING_SRC),
    'scoring.ts: 옛 docRegex 부활 — 광범위 키워드 매칭 회귀',
  );
  assert.ok(
    /LABELS\.has_doctor_page,\s*20,\s*20,\s*'pass'/.test(SCORING_SRC),
    'scoring.ts: has_doctor_page pass 분기 누락',
  );
  assert.ok(
    /LABELS\.has_doctor_page,\s*20,\s*\d+,\s*'warning'/.test(SCORING_SRC),
    'scoring.ts: has_doctor_page warning 분기 누락',
  );
});

test('Phase A #6: alt_ratio unknown detail 문구 명확화', () => {
  assert.ok(
    /이미지 0개 — 측정 불가 \(점수 집계에서 제외됨\)\./.test(SCORING_SRC),
    'scoring.ts: alt_ratio unknown 신규 문구 ("점수 집계에서 제외됨") 누락',
  );
});

// ── 양 앱 lockstep 추가 invariant ──

test('Phase A lockstep: 양 앱 DOCTOR_PAGE_PATH / TREATMENT_PAGE_PATH / PRICING_PAGE_PATH 동일', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/lib/diagnostic/scoring.ts');
  const p2 = resolve(REPO_ROOT, 'next-app/lib/diagnostic/scoring.ts');
  const s1 = readFileSync(p1, 'utf-8');
  const s2 = readFileSync(p2, 'utf-8');
  for (const name of ['DOCTOR_PAGE_PATH', 'DOCTOR_NAME_PATTERN', 'TREATMENT_PAGE_PATH', 'PRICING_PAGE_PATH']) {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*(/[^\\n]+/[a-z]*)\\s*;`, 'm');
    const m1 = s1.match(re); const m2 = s2.match(re);
    assert.ok(m1, `public-app: ${name} 누락`);
    assert.ok(m2, `next-app: ${name} 누락`);
    assert.equal(m1![1], m2![1], `양 앱 ${name} drift — public-app: ${m1![1]} ≠ next-app: ${m2![1]}`);
  }
});

test('Phase A lockstep: 양 앱 CHANNEL hostname 화이트리스트 동일', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/lib/diagnostic/scoring.ts');
  const p2 = resolve(REPO_ROOT, 'next-app/lib/diagnostic/scoring.ts');
  const s1 = readFileSync(p1, 'utf-8');
  const s2 = readFileSync(p2, 'utf-8');
  for (const name of ['NAVER_CHANNELS', 'GOOGLE_CHANNELS', 'KAKAO_CHANNELS', 'YOUTUBE_CHANNELS', 'INSTAGRAM_CHANNELS']) {
    const re = new RegExp(`const\\s+${name}[\\s\\S]*?\\];`, 'm');
    const b1 = s1.match(re); const b2 = s2.match(re);
    assert.ok(b1, `public-app: ${name} 블록 누락`);
    assert.ok(b2, `next-app: ${name} 블록 누락`);
    assert.equal(b1![0], b2![0], `양 앱 ${name} 블록 drift`);
  }
});

console.log('=== diagnostic accuracy: all checks loaded (Phase A included) ===');
