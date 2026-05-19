/**
 * sentimentDrilldown 회귀 테스트 (public-app) — GEO-10 sentiment 분석.
 *
 * 실행: npx tsx __tests__/sentimentDrilldown.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - extractMentionsAroundHospital: 단락 추출 + context cap + hospital/도메인 매칭
 *   - analyzeSentiment: 부정/긍정/중립 분류 + signal kind 정확
 *   - aggregateSentiment: 모델별 / signal frequency / 권고
 *   - 의료법 키워드 별도 분류 + 권고 매핑
 *   - 양 앱 lockstep (SentimentDrilldownSection diff=0 + analyzer 단일 소스)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractMentionsAroundHospital,
  analyzeSentiment,
  aggregateSentiment,
  formatRecommendations,
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
console.log('\n>>> sentimentDrilldown.test.ts — public-app');

// ── helpers ──

function makeRow(
  ai_model: 'chatgpt' | 'gemini',
  answer: string,
  snippets: string[] = [],
): CitationRow {
  return {
    campaign_id: null,
    hospital_name: 'our-hospital',
    query: 'q',
    ai_model,
    answer_text: answer,
    citations: snippets.map((s, i) => ({
      url: `https://example.com/${i}`,
      snippet: s,
    })),
    our_domains: ['mysmile.co.kr'],
    created_at: new Date().toISOString(),
  };
}

(async () => {
  // ── extractMentionsAroundHospital ──

  await test('extractMentions: hospital_name substring 매칭 단락 추출', () => {
    const answer = '서울에는 여러 치과가 있습니다.\n\n강남스마일치과는 임플란트 전문입니다.\n\n다른 단락은 무관.';
    const out = extractMentionsAroundHospital(answer, '강남스마일치과', []);
    assert.equal(out.length, 1, `expected 1, got ${out.length}`);
    assert.ok(out[0].paragraph.includes('강남스마일치과'));
    assert.equal(out[0].matchedTerm, '강남스마일치과');
    assert.equal(out[0].paragraphIndex, 1);
  });

  await test('extractMentions: 240자 cap (앞뒤 truncate)', () => {
    const long = '_'.repeat(200) + '강남스마일치과' + '_'.repeat(200);
    const out = extractMentionsAroundHospital(long, '강남스마일치과', []);
    assert.equal(out.length, 1);
    assert.ok(out[0].paragraph.length <= 250, `length=${out[0].paragraph.length}`);
    assert.ok(out[0].paragraph.includes('강남스마일치과'));
  });

  await test('extractMentions: ourDomains brand 키워드 매칭 (mysmile.co.kr → mysmile)', () => {
    const answer = '여러 치과 정보입니다.\n\nmysmile 사이트가 잘 만들어져 있습니다.';
    const out = extractMentionsAroundHospital(answer, 'OurHospital', ['mysmile.co.kr']);
    assert.equal(out.length, 1);
    assert.equal(out[0].matchedTerm, 'mysmile');
  });

  await test('extractMentions: 매칭 없으면 빈 배열', () => {
    const out = extractMentionsAroundHospital('아무 치과 정보 없음.', '없는병원', []);
    assert.equal(out.length, 0);
  });

  // ── analyzeSentiment ──

  await test('analyzeSentiment: 부정 키워드 → negative', () => {
    const r = analyzeSentiment('이 병원은 정보가 제한적이며 비교 어렵습니다.');
    assert.equal(r.polarity, 'negative');
    assert.ok(r.signals.some(s => s.kind === 'weakness'));
    const labels = r.signals.map(s => s.label);
    assert.ok(labels.includes('정보 제한'));
  });

  await test('analyzeSentiment: 긍정 키워드 → positive', () => {
    const r = analyzeSentiment('이 병원은 전문의 명시되어 있고 다양한 시술을 보유합니다.');
    assert.equal(r.polarity, 'positive');
    assert.ok(r.signals.some(s => s.kind === 'strength'));
  });

  await test('analyzeSentiment: 키워드 없음 → neutral', () => {
    const r = analyzeSentiment('이 병원은 서울 강남에 위치합니다.');
    assert.equal(r.polarity, 'neutral');
    assert.equal(r.signals.length, 0);
  });

  await test('analyzeSentiment: 부정+긍정 동시 → 부정 우선 (negative)', () => {
    const r = analyzeSentiment('전문의 명시되어 있으나 가격 정보가 제한적입니다.');
    assert.equal(r.polarity, 'negative');
    assert.ok(r.signals.some(s => s.kind === 'weakness'));
    assert.ok(r.signals.some(s => s.kind === 'strength'));
  });

  await test('analyzeSentiment: 의료법 키워드 → medical_law signal 별도 분류 (polarity 영향 X)', () => {
    const r = analyzeSentiment('이 병원은 임플란트 100% 완치 보장.');
    // 부정/긍정 키워드 없음 → polarity neutral (의료법은 별도)
    assert.equal(r.polarity, 'neutral');
    const lawSignals = r.signals.filter(s => s.kind === 'medical_law');
    assert.ok(lawSignals.length >= 2, `lawSignals count: ${lawSignals.length}`);
  });

  // ── aggregateSentiment ──

  await test('aggregate: 모델별 분포 + 권고 생성', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', '강남스마일치과는 전문의 명시되어 있습니다. 다양한 시술 보유.'),
      makeRow('gemini', '강남스마일치과는 가격 정보가 제한적이며 비교 어렵습니다.'),
      makeRow('gemini', '강남스마일치과는 서울 강남에 있습니다.'),
    ];
    const sum = aggregateSentiment(rows, '강남스마일치과', []);
    assert.equal(sum.totalMentions, 3);
    assert.equal(sum.byModel.chatgpt.positive, 1);
    assert.equal(sum.byModel.gemini.negative, 1);
    assert.equal(sum.byModel.gemini.neutral, 1);
    assert.ok(sum.weaknesses.length >= 1);
    assert.ok(sum.strengths.length >= 1);
    assert.ok(sum.recommendations.length >= 1, '부정 signal 권고 누락');
  });

  await test('aggregate: citation snippet 도 mention 으로 포함', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', '일반 안내.', [
        '강남스마일치과 후기: 만족스러웠습니다.',
        '강남스마일치과는 전문의 보유.',
      ]),
    ];
    const sum = aggregateSentiment(rows, '강남스마일치과', []);
    // snippet 2건 → mention 2건 (answer 본문 매칭 X)
    assert.ok(sum.totalMentions >= 2, `totalMentions=${sum.totalMentions}`);
  });

  await test('aggregate: 의료법 위반 키워드 별도 추적', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', '강남스마일치과는 100% 완치 보장하는 최고의 병원이라고 합니다.'),
    ];
    const sum = aggregateSentiment(rows, '강남스마일치과', []);
    assert.ok(sum.medicalLawViolations.length >= 3, `lawViolations=${sum.medicalLawViolations.length}`);
    const labels = sum.medicalLawViolations.map(v => v.label);
    assert.ok(labels.some(l => l.includes('100%')) || labels.some(l => l.includes('완치')));
  });

  await test('aggregate: 빈 rows → 빈 summary (throw X)', () => {
    const sum = aggregateSentiment([], 'h', []);
    assert.equal(sum.totalMentions, 0);
    assert.equal(sum.weaknesses.length, 0);
    assert.equal(sum.strengths.length, 0);
    assert.equal(sum.recommendations.length, 0);
  });

  await test('formatRecommendations: summary 의 recommendations 그대로 반환', () => {
    const rows: CitationRow[] = [
      makeRow('chatgpt', '강남스마일치과 정보가 제한적입니다.'),
    ];
    const sum = aggregateSentiment(rows, '강남스마일치과', []);
    const recs = formatRecommendations(sum);
    assert.equal(recs.length, sum.recommendations.length);
    assert.ok(recs.length > 0);
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: SentimentDrilldownSection 양 앱 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/SentimentDrilldownSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/SentimentDrilldownSection.tsx');
    assert.ok(existsSync(p1) && existsSync(p2));
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
  });

  await test('lockstep: sentimentAnalyzer blog-core 단일 소스 + 양 앱 import', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/sentimentAnalyzer.ts');
    assert.ok(existsSync(p), 'sentimentAnalyzer 누락');
    const s1 = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/SentimentDrilldownSection.tsx'), 'utf-8');
    const s2 = readFileSync(resolve(REPO_ROOT, 'next-app/components/diagnostic/SentimentDrilldownSection.tsx'), 'utf-8');
    assert.ok(/aggregateSentiment/.test(s1) && /@winaid\/blog-core/.test(s1), 'public-app import 누락');
    assert.ok(/aggregateSentiment/.test(s2) && /@winaid\/blog-core/.test(s2), 'next-app import 누락');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
