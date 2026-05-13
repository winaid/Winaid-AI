/**
 * deriveAIVisibilityKPI 단위 테스트.
 *
 * 실행: npx tsx __tests__/aiVisibilityKPI.test.ts
 *
 * 보장:
 *  - 양쪽 휴리스틱 점수 + 차이 ≥5 → strongest/weakest 정확
 *  - 차이 < 5 → 'equal'
 *  - 한쪽 null → 반대쪽이 strongest, null 인 쪽이 weakest
 *  - 양쪽 null → strongest/weakest 모두 null
 *  - 실측 있으면 휴리스틱보다 우선
 *  - 실측 점수 변환 (rank→score)
 *  - avgPosition: 실측 selfRank 평균, 0건이면 null
 *  - selfIncluded=false → 0 점
 */
import assert from 'node:assert/strict';
import { deriveAIVisibilityKPI } from '../lib/diagnostic/aiVisibilityKPI';
import type { AIVisibility, MeasurementData } from '../lib/diagnostic/types';

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

const heuristic = (cg: number, gm: number): AIVisibility[] => [
  { platform: 'ChatGPT', likelihood: 'medium', reason: '', score: cg },
  { platform: 'Gemini', likelihood: 'medium', reason: '', score: gm },
];

const measure = (selfRank: number | null, included = true): MeasurementData => ({
  selfIncluded: included,
  selfRank,
  queryUsed: 'q',
  answerText: '',
});

// eslint-disable-next-line no-console
console.log('\n>>> aiVisibilityKPI.test.ts');

test('휴리스틱: 양쪽 점수 + 차이 ≥5 → strongest/weakest 정확', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(72, 60));
  assert.equal(kpi.chatGPT.score, 72);
  assert.equal(kpi.gemini.score, 60);
  assert.equal(kpi.strongest, 'chatGPT');
  assert.equal(kpi.weakest, 'gemini');
});

test('휴리스틱: 차이 < 5 → equal', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(70, 67));
  assert.equal(kpi.strongest, 'equal');
  assert.equal(kpi.weakest, 'equal');
});

test('한쪽 점수 null → 반대쪽 strongest', () => {
  const kpi = deriveAIVisibilityKPI([
    { platform: 'ChatGPT', likelihood: 'low', reason: '' },
    { platform: 'Gemini', likelihood: 'medium', reason: '', score: 50 },
  ]);
  assert.equal(kpi.chatGPT.score, null);
  assert.equal(kpi.gemini.score, 50);
  assert.equal(kpi.strongest, 'gemini');
  assert.equal(kpi.weakest, 'chatGPT');
});

test('양쪽 null → strongest/weakest = null (UI 측정 미완료)', () => {
  const kpi = deriveAIVisibilityKPI([
    { platform: 'ChatGPT', likelihood: 'low', reason: '' },
    { platform: 'Gemini', likelihood: 'low', reason: '' },
  ]);
  assert.equal(kpi.strongest, null);
  assert.equal(kpi.weakest, null);
});

test('실측 우선: live 가 휴리스틱보다 우선 적용', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(90, 30), {
    ChatGPT: measure(3),
    Gemini: measure(1),
  });
  // ChatGPT rank=3 → 70, Gemini rank=1 → 100
  assert.equal(kpi.chatGPT.score, 70, `live(70) 가 휴리스틱(90) 보다 우선해야 함`);
  assert.equal(kpi.gemini.score, 100);
  assert.equal(kpi.strongest, 'gemini');
});

test('실측 점수 변환: rank → score', () => {
  // rank=1 → 100, rank=2 → 85, rank=3 → 70, rank=4 → 55, rank=5 → 40, rank=10 → 25
  const cases: [number, number][] = [[1, 100], [2, 85], [3, 70], [4, 55], [5, 40], [10, 25]];
  for (const [rank, expected] of cases) {
    const kpi = deriveAIVisibilityKPI(heuristic(0, 0), { ChatGPT: measure(rank) });
    assert.equal(kpi.chatGPT.score, expected, `rank=${rank}: expected ${expected}, got ${kpi.chatGPT.score}`);
  }
});

test('selfIncluded=false → 0 점 + position null', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(50, 50), {
    ChatGPT: measure(null, false),
  });
  assert.equal(kpi.chatGPT.score, 0);
  assert.equal(kpi.chatGPT.position, null);
});

test('avgPosition: 실측 selfRank 평균', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(0, 0), {
    ChatGPT: measure(2),
    Gemini: measure(4),
  });
  assert.equal(kpi.avgPosition, 3);
});

test('avgPosition: 실측 0건 → null', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(50, 50), {});
  assert.equal(kpi.avgPosition, null);
});

test('avgPosition: selfIncluded=false 인 platform 은 평균 제외', () => {
  const kpi = deriveAIVisibilityKPI(heuristic(0, 0), {
    ChatGPT: measure(null, false),
    Gemini: measure(2),
  });
  assert.equal(kpi.avgPosition, 2, 'included=false 제외하고 Gemini rank=2 만 평균');
});

test('휴리스틱이 score 필드 누락한 경우 → null', () => {
  const kpi = deriveAIVisibilityKPI([
    { platform: 'ChatGPT', likelihood: 'medium', reason: '' }, // score 없음
    { platform: 'Gemini', likelihood: 'medium', reason: '', score: 60 },
  ]);
  assert.equal(kpi.chatGPT.score, null);
  assert.equal(kpi.gemini.score, 60);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
