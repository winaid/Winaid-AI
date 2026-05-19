/**
 * geoActionDashboard 회귀 테스트 (public-app) — GEO-UX-1 대시보드 + 디자인 토큰.
 *
 * 보장:
 *   - actionAggregator priority 정확 (의료법 100 > 네이버 70 > E-E-A-T 60 > 경쟁사 50 > sentiment 40 > 네이버 인용률 30)
 *   - top 3 + 같은 source_kind 중복 제거
 *   - 디자인 토큰 export 검증
 *   - 양 앱 lockstep (9 컴포넌트 + 디자인 토큰 diff=0)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateTop3Actions,
  type AggregateInputs,
  type EEATResult,
  type SentimentSummary,
  type NaverChannelSummary,
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
console.log('\n>>> geoActionDashboard.test.ts — next-app');

function makeSentiment(opts: {
  weaknesses?: number;
  medicalLaw?: number;
}): SentimentSummary {
  return {
    totalMentions: 5,
    byModel: {
      chatgpt: { total: 3, positive: 1, negative: 1, neutral: 1 },
      gemini: { total: 2, positive: 0, negative: 1, neutral: 1 },
    },
    polarityCounts: { positive: 1, negative: 2, neutral: 2 },
    weaknesses: Array.from({ length: opts.weaknesses || 0 }, (_, i) => ({
      label: `약점${i}`, keyword: `kw${i}`, count: 3 - i,
    })),
    strengths: [],
    medicalLawViolations: Array.from({ length: opts.medicalLaw || 0 }, (_, i) => ({
      label: `위반${i}`, keyword: `최고${i}`, count: 2,
    })),
    mentions: [],
    recommendations: [],
  };
}

function makeNaver(opts: { missing?: number; total?: number; naver?: number }): NaverChannelSummary {
  return {
    totalCitations: opts.total ?? 10,
    naverCitations: opts.naver ?? 5,
    oursCitations: 0,
    byModel: {
      chatgpt: { total: 5, naver: 3 },
      gemini: { total: 5, naver: 2 },
    },
    channels: [],
    ourChannels: [],
    missingChannels: (['naver_blog', 'naver_cafe', 'naver_place', 'naver_post'] as const).slice(0, opts.missing ?? 0) as never,
  };
}

function makeEEAT(weaknesses: number, overall = 50): EEATResult {
  return {
    overall,
    axes: {
      experience: { score: overall, signals: [] },
      expertise: { score: overall, signals: [] },
      authority: { score: overall, signals: [] },
      trust: { score: overall, signals: [] },
    },
    strengths: [],
    weaknesses: Array.from({ length: weaknesses }, (_, i) => ({
      label: `eeat 약점 ${i}`, recommendation: `→ Y${i} 신설`,
    })),
  };
}

(async () => {
  // ── priority 계산 ──

  await test('aggregate: 의료법 위반 → weight 100 → top 1', () => {
    const inputs: AggregateInputs = {
      sentiment: makeSentiment({ medicalLaw: 1 }),
    };
    const actions = aggregateTop3Actions(inputs);
    assert.ok(actions.length >= 1);
    assert.equal(actions[0].source_kind, 'medical_law_violation');
    assert.equal(actions[0].weight, 100);
    assert.equal(actions[0].impact, 'high');
  });

  await test('aggregate: 부재 네이버 채널 → weight 70 → impact high', () => {
    const inputs: AggregateInputs = {
      naver: makeNaver({ missing: 2 }),
    };
    const actions = aggregateTop3Actions(inputs);
    assert.equal(actions[0].source_kind, 'missing_naver_channel');
    assert.equal(actions[0].weight, 70);
    assert.equal(actions[0].impact, 'high');
  });

  await test('aggregate: E-E-A-T 약점 → weight 60 → impact medium', () => {
    const inputs: AggregateInputs = { eeat: makeEEAT(3) };
    const actions = aggregateTop3Actions(inputs);
    assert.equal(actions[0].source_kind, 'eeat_weakness');
    assert.equal(actions[0].weight, 60);
    assert.equal(actions[0].impact, 'medium');
  });

  await test('aggregate: 경쟁사 신규 → weight 50', () => {
    const inputs: AggregateInputs = {
      competitorRecent: [{
        id: 'c1', title: '수면 임플란트', pattern_type: 'faq', competitor_domain: 'rival.com',
      }],
    };
    const actions = aggregateTop3Actions(inputs);
    assert.equal(actions[0].source_kind, 'competitor_new_content');
    assert.equal(actions[0].weight, 50);
  });

  await test('aggregate: Sentiment 약점 → weight 40', () => {
    const inputs: AggregateInputs = {
      sentiment: makeSentiment({ weaknesses: 2 }),
    };
    const actions = aggregateTop3Actions(inputs);
    assert.equal(actions[0].source_kind, 'sentiment_weakness');
    assert.equal(actions[0].weight, 40);
  });

  await test('aggregate: 네이버 인용률 < 30% → weight 30', () => {
    const inputs: AggregateInputs = {
      naver: makeNaver({ total: 10, naver: 2 }),  // 20%
    };
    const actions = aggregateTop3Actions(inputs);
    const lowNaver = actions.find(a => a.source_kind === 'low_naver_citation');
    assert.ok(lowNaver, 'low_naver_citation 누락');
    assert.equal(lowNaver!.weight, 30);
  });

  // ── top 3 + 중복 제거 ──

  await test('aggregate: 같은 source_kind 중복 제거 (1건만)', () => {
    const inputs: AggregateInputs = {
      eeat: makeEEAT(10),  // 10 약점 → 같은 source_kind 10 후보
    };
    const actions = aggregateTop3Actions(inputs);
    const eeatActions = actions.filter(a => a.source_kind === 'eeat_weakness');
    assert.equal(eeatActions.length, 1, `eeat 중복: ${eeatActions.length}`);
  });

  await test('aggregate: top 3 cap — 4개 신호 들어와도 3개만', () => {
    const inputs: AggregateInputs = {
      sentiment: makeSentiment({ medicalLaw: 1, weaknesses: 2 }),
      naver: makeNaver({ missing: 4, total: 10, naver: 2 }),
      eeat: makeEEAT(5),
    };
    const actions = aggregateTop3Actions(inputs);
    assert.equal(actions.length, 3, `top 3 위반: ${actions.length}`);
    // 정렬 순서: 의료법(100) > 네이버(70) > E-E-A-T(60)
    assert.equal(actions[0].source_kind, 'medical_law_violation');
    assert.equal(actions[1].source_kind, 'missing_naver_channel');
    assert.equal(actions[2].source_kind, 'eeat_weakness');
  });

  // ── 빈 입력 ──

  await test('aggregate: 모든 입력 비어있음 → 빈 배열 (throw X)', () => {
    const actions = aggregateTop3Actions({});
    assert.equal(actions.length, 0);
  });

  // ── 디자인 토큰 ──

  await test('design tokens: 양 앱 geo-design-tokens.ts 존재 + diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/geo-design-tokens.ts');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/geo-design-tokens.ts');
    assert.ok(existsSync(p1) && existsSync(p2));
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
  });

  await test('design tokens: GEO_COLORS / GEO_CARD / GEO_TEXT / IMPACT_BADGE 모두 export', () => {
    const p = resolve(REPO_ROOT, 'public-app/components/diagnostic/geo-design-tokens.ts');
    const src = readFileSync(p, 'utf-8');
    for (const exp of ['GEO_COLORS', 'GEO_CARD', 'GEO_TEXT', 'GEO_SPACING', 'IMPACT_BADGE']) {
      assert.ok(new RegExp(`export const ${exp}`).test(src), `${exp} export 누락`);
    }
  });

  // ── 양 앱 lockstep — 9 컴포넌트 ──

  await test('lockstep: 신규 4 컴포넌트 (Dashboard / Banner / EmptyState / Spinner) 양 앱 diff=0', () => {
    for (const f of ['GeoActionDashboard', 'GeoOnboardingBanner', 'GeoEmptyState', 'GeoLoadingSpinner']) {
      const p1 = resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`);
      const p2 = resolve(REPO_ROOT, `next-app/components/diagnostic/${f}.tsx`);
      assert.ok(existsSync(p1) && existsSync(p2), `${f} 누락`);
      assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), `${f}: drift`);
    }
  });

  await test('lockstep: 8 기존 GEO 섹션 모두 헤더 한국어 단순화 + 양 앱 diff=0', () => {
    const sections = ['GeoCitationsSection', 'SchemaOrgSection', 'AlertSubscriptionSection', 'EEATSection', 'CompetitorContentSection', 'SentimentDrilldownSection', 'NaverChannelSection'];
    for (const f of sections) {
      const p1 = resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`);
      const p2 = resolve(REPO_ROOT, `next-app/components/diagnostic/${f}.tsx`);
      assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), `${f}: drift`);
    }
    // 헤더 한국어 단순화 검증 (대표 케이스)
    const eeat = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/EEATSection.tsx'), 'utf-8');
    assert.ok(/⭐ AI 가 본 우리 신뢰도/.test(eeat), 'EEAT 헤더 단순화 누락');
    const naver = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/NaverChannelSection.tsx'), 'utf-8');
    assert.ok(/🇰🇷 네이버에서의 노출/.test(naver), 'Naver 헤더 단순화 누락');
  });

  await test('lockstep: actionAggregator blog-core 단일 소스 + Dashboard import', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/actionAggregator.ts');
    assert.ok(existsSync(p), 'actionAggregator 누락');
    const dash = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoActionDashboard.tsx'), 'utf-8');
    assert.ok(/aggregateTop3Actions/.test(dash));
    assert.ok(/@winaid\/blog-core/.test(dash));
  });

  await test('lockstep: DiagnosticResult 양 앱 Dashboard + Banner import', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/DiagnosticResult.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/DiagnosticResult.tsx');
    const s1 = readFileSync(p1, 'utf-8');
    const s2 = readFileSync(p2, 'utf-8');
    for (const ref of ['GeoActionDashboard', 'GeoOnboardingBanner']) {
      assert.ok(s1.includes(ref), `public-app: ${ref} 미통합`);
      assert.ok(s2.includes(ref), `next-app: ${ref} 미통합`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
