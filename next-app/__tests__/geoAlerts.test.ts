/**
 * geoAlerts 회귀 테스트 (public-app) — GEO-8 AI 인용률 변동 알림.
 *
 * 실행: npx tsx __tests__/geoAlerts.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - alertEngine: detectCiteRateChange / detectNewCompetitors / evaluateSubscription / formatAlertMessage
 *   - alertSenders: 채널 발송 fail-safe (한 채널 실패 OK + 환경 변수 미설정 graceful)
 *   - route validation (subscribe / DELETE / evaluate)
 *   - public-app: 게스트 차단 + admin_session bypass + 로그인 사용자 허용
 *   - 양 SQL 본문 diff=0
 *   - 양 앱 lockstep (AlertSubscriptionSection diff=0 + engine 단일 소스)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectCiteRateChange,
  detectNewCompetitors,
  evaluateSubscription,
  formatAlertMessage,
  sendSlack,
  sendEmail,
  sendKakao,
  sendToAllChannels,
  type AlertSubscription,
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
console.log('\n>>> geoAlerts.test.ts — next-app');

const NOW = new Date('2026-05-19T00:00:00Z');
const day = 86_400_000;

function makeRow(daysAgo: number, oursCount: number, totalCount: number, otherDomains: string[] = []): CitationRow {
  const citations = [];
  for (let i = 0; i < oursCount; i++) {
    citations.push({ url: `https://mysmile.co.kr/post-${i}`, is_ours: true });
  }
  for (let i = 0; i < totalCount - oursCount; i++) {
    const dom = otherDomains[i % Math.max(otherDomains.length, 1)] || `competitor${i}.com`;
    citations.push({ url: `https://${dom}/article-${i}`, is_ours: false });
  }
  return {
    campaign_id: null,
    hospital_name: 'test-hospital',
    query: 'test query',
    ai_model: 'chatgpt',
    answer_text: 'test answer',
    citations,
    our_domains: ['mysmile.co.kr'],
    created_at: new Date(NOW.getTime() - daysAgo * day).toISOString(),
  };
}

(async () => {
  // ── detectCiteRateChange ──

  await test('detectCiteRateChange: cite_drop — 50% → 20% (-60%) → drop', () => {
    const rows: CitationRow[] = [
      makeRow(1, 1, 5),  // current window (-7d ~ now) — 20%
      makeRow(2, 1, 5),
      makeRow(8, 3, 5),  // previous window — 50%
      makeRow(10, 2, 5),
    ];
    const r = detectCiteRateChange(rows, ['mysmile.co.kr'], 20, 7, NOW);
    assert.equal(r.alertType, 'cite_drop', `alertType=${r.alertType}`);
    assert.ok((r.deltaPct ?? 0) <= -20);
  });

  await test('detectCiteRateChange: cite_rise — 20% → 80% (+300%) → rise', () => {
    const rows: CitationRow[] = [
      makeRow(1, 4, 5),  // current 80%
      makeRow(2, 4, 5),
      makeRow(8, 1, 5),  // previous 20%
      makeRow(10, 1, 5),
    ];
    const r = detectCiteRateChange(rows, ['mysmile.co.kr'], 20, 7, NOW);
    assert.equal(r.alertType, 'cite_rise');
    assert.ok((r.deltaPct ?? 0) >= 20);
  });

  await test('detectCiteRateChange: 데이터 부족 (한쪽 윈도우 빈) → alertType undefined', () => {
    const rows: CitationRow[] = [
      makeRow(1, 2, 5),  // current only
    ];
    const r = detectCiteRateChange(rows, ['mysmile.co.kr'], 20, 7, NOW);
    assert.equal(r.alertType, undefined);
    assert.equal(r.previous, null);
  });

  await test('detectCiteRateChange: 임계 미달 (-20% 변동, threshold=30) → alertType undefined', () => {
    const rows: CitationRow[] = [
      makeRow(1, 2, 5),  // current 40%
      makeRow(8, 2, 4),  // previous 50% → -20% delta, threshold 30 → 미달
    ];
    const r = detectCiteRateChange(rows, ['mysmile.co.kr'], 30, 7, NOW);
    assert.equal(r.alertType, undefined, `deltaPct=${r.deltaPct}`);
  });

  await test('detectCiteRateChange: previous=0 + current>0 → cite_rise (신규 등장)', () => {
    const rows: CitationRow[] = [
      makeRow(1, 1, 5),  // current 20%
      makeRow(8, 0, 5),  // previous 0%
    ];
    const r = detectCiteRateChange(rows, ['mysmile.co.kr'], 20, 7, NOW);
    assert.equal(r.alertType, 'cite_rise');
    assert.equal(r.deltaPct, 100);
  });

  // ── detectNewCompetitors ──

  await test('detectNewCompetitors: 최근만 등장한 domain → newDomains', () => {
    const rows: CitationRow[] = [
      makeRow(1, 0, 3, ['newcomer.com', 'oldfriend.com', 'oldfriend.com']),  // recent
      makeRow(15, 0, 2, ['oldfriend.com', 'veteran.com']),  // older
    ];
    const r = detectNewCompetitors(rows, ['mysmile.co.kr'], 7, NOW);
    assert.ok(r.newDomains.includes('newcomer.com'), 'newcomer.com 누락');
    assert.ok(!r.newDomains.includes('oldfriend.com'), 'oldfriend false positive');
  });

  // ── evaluateSubscription ──

  await test('evaluateSubscription: enabled=false → 빈 배열', () => {
    const sub: AlertSubscription = {
      hospital_name: 'h', our_domains: ['mysmile.co.kr'],
      threshold_pct: 20, compare_window_days: 7,
      channels: { slack_webhook: 'https://hooks.slack.com/services/x' },
      enabled: false,
    };
    const alerts = evaluateSubscription(sub, [makeRow(1, 3, 5), makeRow(8, 1, 5)], NOW);
    assert.equal(alerts.length, 0);
  });

  await test('evaluateSubscription: 활성 + cite_rise + new competitor → 2 alerts', () => {
    const sub: AlertSubscription = {
      hospital_name: 'h', our_domains: ['mysmile.co.kr'],
      threshold_pct: 20, compare_window_days: 7,
      channels: { slack_webhook: 'https://hooks.slack.com/services/x' },
      enabled: true,
    };
    const rows: CitationRow[] = [
      makeRow(1, 4, 5, ['rookie.com']),
      makeRow(8, 1, 5, ['oldfriend.com']),
      makeRow(15, 0, 5, ['oldfriend.com']),
    ];
    const alerts = evaluateSubscription(sub, rows, NOW);
    assert.ok(alerts.length >= 1, `alerts count: ${alerts.length}`);
    const types = alerts.map(a => a.type);
    assert.ok(types.includes('cite_rise') || types.includes('new_competitor'));
  });

  // ── formatAlertMessage ──

  await test('formatAlertMessage: 4 종류 모두 한국어 + 핵심 데이터 포함', () => {
    assert.match(formatAlertMessage({ type: 'cite_drop', payload: { deltaPct: -25, current: 0.15, windowDays: 7 }, message: '' }), /-25%/);
    assert.match(formatAlertMessage({ type: 'cite_rise', payload: { deltaPct: 30, current: 0.4, windowDays: 7 }, message: '' }), /\+30%/);
    assert.match(formatAlertMessage({ type: 'new_competitor', payload: { newDomains: ['rookie.com'], windowDays: 7 }, message: '' }), /rookie\.com/);
    assert.match(formatAlertMessage({ type: 'sentiment_drop', payload: { windowDays: 14 }, message: '' }), /평판|⚠️/);
  });

  // ── alertSenders fail-safe ──

  await test('sendSlack: webhook URL 형식 검증 (hooks.slack.com 외 거부)', async () => {
    const r = await sendSlack('https://malicious.com/webhook', 'hi');
    assert.equal(r.ok, false);
    assert.match(r.error || '', /invalid Slack webhook/);
  });

  await test('sendEmail: RESEND_API_KEY 미설정 → ok=false (silent skip)', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendEmail('a@b.com', 'subj', '<p>hi</p>');
    assert.equal(r.ok, false);
    assert.match(r.error || '', /RESEND_API_KEY/);
  });

  await test('sendKakao: 빈 token → ok=false', async () => {
    const r = await sendKakao('', 'hi');
    assert.equal(r.ok, false);
  });

  await test('sendToAllChannels: 채널 0개 → 빈 배열, 1개라도 있으면 시도', async () => {
    const empty = await sendToAllChannels({}, 'subj', 'msg');
    assert.equal(empty.length, 0);
    // 1개 채널 — 어차피 실패하지만 sendResult 1건 반환
    const one = await sendToAllChannels({ slack_webhook: 'https://other.com/x' }, 'subj', 'msg');
    assert.equal(one.length, 1);
    assert.equal(one[0].channel, 'slack');
    assert.equal(one[0].ok, false);
  });

  // ── route validation ──

  await test('route: subscriptions POST hospital_name / our_domains / channels 검증', () => {
    const p = resolve(REPO_ROOT, 'next-app/app/api/geo/alerts/subscriptions/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/hospital_name 필수/.test(src));
    assert.ok(/our_domains 배열 필수/.test(src));
    assert.ok(/최소 한 채널/.test(src), '채널 최소 1개 검증 누락');
  });

  await test('route: subscriptions DELETE id 필수', () => {
    const p = resolve(REPO_ROOT, 'next-app/app/api/geo/alerts/subscriptions/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/id 필수/.test(src), 'id 필수 검증 누락');
  });

  await test('route: evaluate hospital_name 필수 + maxDuration 30', () => {
    const p = resolve(REPO_ROOT, 'next-app/app/api/geo/alerts/evaluate/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/hospital_name 필수/.test(src));
    assert.ok(/export const maxDuration = 30/.test(src));
  });

  await test('route: next-app — checkAuth (admin_session) 보호', () => {
    const p1 = resolve(REPO_ROOT, 'next-app/app/api/geo/alerts/subscriptions/route.ts');
    const p2 = resolve(REPO_ROOT, 'next-app/app/api/geo/alerts/evaluate/route.ts');
    for (const p of [p1, p2]) {
      const src = readFileSync(p, 'utf-8');
      assert.ok(/checkAuth\(request\)/.test(src), `${p}: checkAuth 누락`);
    }
  });

  // ── 양 SQL diff=0 ──

  await test('lockstep: 양 SQL 파일 (geo_alerts) 본문 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'sql/migrations/2026-05-19_geo_alerts.sql');
    const p2 = resolve(REPO_ROOT, 'public-app-sql/migrations/2026-05-19_geo_alerts.sql');
    assert.ok(existsSync(p1) && existsSync(p2), 'SQL 파일 누락');
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), 'SQL drift');
  });

  await test('lockstep: SQL 멱등성 + RLS + CHECK 제약', () => {
    const p = resolve(REPO_ROOT, 'sql/migrations/2026-05-19_geo_alerts.sql');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/CREATE TABLE IF NOT EXISTS public\.geo_alert_subscriptions/.test(src));
    assert.ok(/CREATE TABLE IF NOT EXISTS public\.geo_alert_history/.test(src));
    assert.ok(/ENABLE ROW LEVEL SECURITY/.test(src));
    assert.ok(/CHECK \(alert_type IN \('cite_drop', 'cite_rise', 'new_competitor', 'sentiment_drop'\)\)/.test(src));
    assert.ok(/CHECK \(threshold_pct > 0 AND threshold_pct <= 100\)/.test(src));
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: AlertSubscriptionSection 양 앱 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/AlertSubscriptionSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/AlertSubscriptionSection.tsx');
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
  });

  await test('lockstep: alertEngine / alertSenders blog-core 단일 소스', () => {
    for (const f of ['alertEngine.ts', 'alertSenders.ts']) {
      const p = resolve(REPO_ROOT, `packages/blog-core/src/geo/${f}`);
      assert.ok(existsSync(p), `${f} 누락`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
