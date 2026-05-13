/**
 * 진단 히스토리 필터·정렬·URL state 단위 테스트.
 *
 * 실행: npx tsx __tests__/historyFilter.test.ts
 */
import assert from 'node:assert/strict';
import {
  applyHistoryFilter,
  serializeFilter,
  parseFilter,
  DEFAULT_FILTER,
  type DiagnosticHistoryRow,
} from '../lib/diagnostic/historyFilter';

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

// 픽스처: 5건, 다양한 점수·기간
const NOW = new Date('2026-05-13T10:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const ROWS: DiagnosticHistoryRow[] = [
  { id: '1', url: 'https://gangnam-dental.kr', siteName: '강남 치과', overallScore: 92, analyzedAt: days(1) },
  { id: '2', url: 'https://busan-skin.kr', siteName: '부산 피부과', overallScore: 67, analyzedAt: days(10) },
  { id: '3', url: 'https://seoul-clinic.kr', siteName: '서울 의원', overallScore: 41, analyzedAt: days(45) },
  { id: '4', url: 'https://incheon-dental.kr', siteName: '인천 치과', overallScore: 78, analyzedAt: days(100) },
  { id: '5', url: 'https://daejeon-eye.kr', siteName: null, overallScore: 50, analyzedAt: days(5) },
];

// eslint-disable-next-line no-console
console.log('\n>>> historyFilter.test.ts');

test('DEFAULT_FILTER 적용 시 전체 반환, 최신순 정렬', () => {
  const out = applyHistoryFilter(ROWS, DEFAULT_FILTER, NOW);
  assert.equal(out.length, 5);
  assert.equal(out[0].id, '1'); // 가장 최신 (1일 전)
  assert.equal(out[4].id, '4'); // 가장 오래된 (100일 전)
});

test('검색: URL 부분 일치 (대소문자 무시)', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, q: 'GANGNAM' }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '1');
});

test('검색: siteName 한글 부분 일치', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, q: '치과' }, NOW);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.id).sort(),
    ['1', '4'],
  );
});

test('점수 필터: high (80+) 경계값 80 포함', () => {
  const out = applyHistoryFilter(
    [...ROWS, { id: '80', url: 'x', siteName: null, overallScore: 80, analyzedAt: days(1) }],
    { ...DEFAULT_FILTER, score: 'high' },
    NOW,
  );
  assert.deepEqual(out.map((r) => r.id).sort(), ['1', '80']);
});

test('점수 필터: mid (50-79) 경계값 50/79 포함, 80 제외', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, score: 'mid' }, NOW);
  // 67, 78, 50 → 3건
  assert.deepEqual(out.map((r) => r.id).sort(), ['2', '4', '5']);
});

test('점수 필터: low (<50)', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, score: 'low' }, NOW);
  assert.deepEqual(out.map((r) => r.id), ['3']);
});

test('기간 필터: 7d → 7일 이내만', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, period: '7d' }, NOW);
  assert.deepEqual(out.map((r) => r.id).sort(), ['1', '5']);
});

test('기간 필터: 30d', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, period: '30d' }, NOW);
  assert.deepEqual(out.map((r) => r.id).sort(), ['1', '2', '5']);
});

test('기간 필터: 90d', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, period: '90d' }, NOW);
  // 100일 전(4) 만 제외
  assert.deepEqual(out.map((r) => r.id).sort(), ['1', '2', '3', '5']);
});

test('정렬: 점수 높은순', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, sort: 'score_desc' }, NOW);
  assert.deepEqual(out.map((r) => r.overallScore), [92, 78, 67, 50, 41]);
});

test('정렬: 점수 낮은순', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, sort: 'score_asc' }, NOW);
  assert.deepEqual(out.map((r) => r.overallScore), [41, 50, 67, 78, 92]);
});

test('정렬: 오래된순', () => {
  const out = applyHistoryFilter(ROWS, { ...DEFAULT_FILTER, sort: 'oldest' }, NOW);
  assert.deepEqual(out.map((r) => r.id), ['4', '3', '2', '5', '1']);
});

test('조합: 검색 + 점수 + 기간', () => {
  const out = applyHistoryFilter(
    ROWS,
    { q: '치과', score: 'high', period: '30d', sort: 'recent' },
    NOW,
  );
  // 치과 중 점수 80+ + 30일 이내 → '1' (강남)
  assert.deepEqual(out.map((r) => r.id), ['1']);
});

// ── URL state ──

test('serializeFilter: DEFAULT 는 빈 URLSearchParams (dangling 회피)', () => {
  const sp = serializeFilter(DEFAULT_FILTER);
  assert.equal(sp.toString(), '');
});

test('serializeFilter: 비-기본 값만 직렬화', () => {
  const sp = serializeFilter({ q: '치과', score: 'high', period: '7d', sort: 'score_desc' });
  assert.equal(sp.get('q'), '치과');
  assert.equal(sp.get('score'), 'high');
  assert.equal(sp.get('period'), '7d');
  assert.equal(sp.get('sort'), 'score_desc');
});

test('parseFilter: 양방향 round-trip', () => {
  const original = { q: '검색어', score: 'mid', period: '90d', sort: 'oldest' } as const;
  const parsed = parseFilter(serializeFilter(original));
  assert.deepEqual(parsed, original);
});

test('parseFilter: 미인식 값은 default 로 fallback (악성 쿼리 무시)', () => {
  const sp = new URLSearchParams('score=evil&period=999d&sort=DROP TABLE');
  const parsed = parseFilter(sp);
  assert.equal(parsed.score, 'all');
  assert.equal(parsed.period, 'all');
  assert.equal(parsed.sort, 'recent');
});

test('parseFilter: q 길이 200자 cap', () => {
  const long = 'a'.repeat(500);
  const parsed = parseFilter(new URLSearchParams({ q: long }));
  assert.equal(parsed.q.length, 200);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
