/**
 * normalizeKoreanGrammar 회귀 가드 — false-positive ≈ 0 패턴만.
 *
 * 회귀 케이스 (2026-05): LLM 응답에 "필요하는", "되어진다" 같은 비문 잔여.
 */
import assert from 'node:assert/strict';
import { normalizeKoreanGrammar, ADJECTIVE_STEMS } from '../koreanGrammarFilter';
import { applyContentFilters } from '../medicalLawFilter';

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

// eslint-disable-next-line no-console
console.log('\n>>> koreanGrammarFilter.test.ts');

test('"필요하는" → "필요한" (회귀 케이스)', () => {
  const r = normalizeKoreanGrammar('필요하는 정보입니다');
  assert.equal(r.html, '필요한 정보입니다');
  assert.equal(r.replacedCount, 1);
});

test('등록된 모든 형용사 어간이 변환됨', () => {
  for (const stem of ADJECTIVE_STEMS) {
    const r = normalizeKoreanGrammar(`이건 ${stem}하는 경우입니다.`);
    assert.equal(r.html, `이건 ${stem}한 경우입니다.`, `[${stem}] 변환 실패`);
  }
});

test('이중 피동: "되어진다" → "된다"', () => {
  const r = normalizeKoreanGrammar('진행되어진다');
  assert.equal(r.html, '진행된다');
});

test('이중 피동: "되어지는" → "되는"', () => {
  const r = normalizeKoreanGrammar('흔히 사용되어지는 방법');
  assert.equal(r.html, '흔히 사용되는 방법');
});

test('이중 피동: "되어진" → "된"', () => {
  const r = normalizeKoreanGrammar('완료되어진 작업');
  assert.equal(r.html, '완료된 작업');
});

test('이중 피동: "되어질" → "될"', () => {
  const r = normalizeKoreanGrammar('진행되어질 예정');
  assert.equal(r.html, '진행될 예정');
});

test('이중 피동: "되어졌" → "됐"', () => {
  const r = normalizeKoreanGrammar('완료되어졌습니다');
  assert.equal(r.html, '완료됐습니다');
});

test('"어떻해" → "어떡해"', () => {
  const r = normalizeKoreanGrammar('어떻해 할지');
  assert.equal(r.html, '어떡해 할지');
});

test('false-positive 가드: 동사 "구하는" (구하다) 는 변환 안 함', () => {
  // "구하다" 는 동사이므로 "-는" 활용 정상. 등록 어간에 없으니 변환 안 됨.
  const input = '도움을 구하는 환자';
  assert.equal(normalizeKoreanGrammar(input).html, input);
});

test('false-positive 가드: 동사 "사용하는" (사용하다) 는 변환 안 함', () => {
  // "사용하다" 는 동사. 등록 어간에 "사용" 없음 → 변환 안 됨
  const input = '치료에 사용하는 약물';
  assert.equal(normalizeKoreanGrammar(input).html, input);
});

test('false-positive 가드: <code> 안 비문은 보존', () => {
  const input = '<code>필요하는 example</code>';
  const r = normalizeKoreanGrammar(input);
  assert.equal(r.html, input);
  assert.equal(r.replacedCount, 0);
});

test('false-positive 가드: <pre> 안 비문은 보존', () => {
  const input = '<pre>function() {\n  // 필요하는 라벨\n}</pre>';
  const r = normalizeKoreanGrammar(input);
  assert.equal(r.html, input);
});

test('복합 변환: 비문 여러 종류 동시', () => {
  const input = '<p>필요하는 정보가 진행되어집니다. 어떻해 할까요?</p>';
  const r = normalizeKoreanGrammar(input);
  // "필요하는" → "필요한" + "되어집" → "됩" (되어지는 → 되는 패턴 적용)
  assert.ok(r.html.includes('필요한 정보'));
  assert.ok(r.html.includes('어떡해'));
  assert.ok(r.replacedCount >= 2);
});

test('빈 입력 안전 처리', () => {
  assert.deepEqual(normalizeKoreanGrammar(''), { html: '', replacedCount: 0, patterns: [] });
});

// ── applyContentFilters 통합 ──

test('applyContentFilters: 의료법 + 마크다운 + 한국어 비문 통합', () => {
  // "필요하는" + "**볼드**" 한 번에
  const input = '<p>**중요한** 시술이 필요하는 환자분께</p>';
  const r = applyContentFilters(input);
  assert.ok(r.filtered.includes('<strong>'), '마크다운 변환 미적용');
  assert.ok(r.filtered.includes('필요한'), '한국어 비문 변환 미적용');
  assert.ok(!r.filtered.includes('필요하는'), '비문 잔여');
});

test('applyContentFilters: foundTerms 에 grammar 패턴 식별자 포함', () => {
  const r = applyContentFilters('<p>필요하는 부분이 진행되어진다</p>');
  const hasGrammarTerm = r.foundTerms.some((t) => /adj_hanun_|double_passive/.test(t));
  assert.ok(hasGrammarTerm, `grammar 패턴 식별자 누락: ${r.foundTerms.join(', ')}`);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
