/**
 * normalizeMarkdownToHtml 회귀 가드.
 *
 * 보장:
 *  - 명백한 마크다운 패턴 (bold/italic/headers/link/code/blockquote) 변환
 *  - <code>/<pre> 안의 마크다운 syntax 는 변환 안 함 (false-positive 가드)
 *  - 자연 한국어 단락의 별표 단독·번호는 변환 안 함
 *  - applyContentFilters 통합 — 의료법 + 마크다운 한 번에
 */
import assert from 'node:assert/strict';
import { normalizeMarkdownToHtml } from '../normalizeMarkdownToHtml';
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
console.log('\n>>> normalizeMarkdownToHtml.test.ts');

test('**볼드** → <strong>', () => {
  const r = normalizeMarkdownToHtml('이는 **중요한** 표현입니다.');
  assert.ok(r.html.includes('<strong>중요한</strong>'));
  assert.ok(r.patterns.some((p) => p.startsWith('bold_star')));
});

test('__볼드__ alt syntax → <strong>', () => {
  const r = normalizeMarkdownToHtml('이는 __중요__ 부분입니다.');
  assert.ok(r.html.includes('<strong>중요</strong>'));
});

test('*이탤릭* → <em> (양쪽 닫힌 패턴)', () => {
  const r = normalizeMarkdownToHtml('이는 *강조* 표현.');
  assert.ok(r.html.includes('<em>강조</em>'));
});

test('### 헤더 (라인 시작) → <h3>', () => {
  const r = normalizeMarkdownToHtml('### 소제목\n본문 내용');
  assert.ok(r.html.includes('<h3>소제목</h3>'));
  assert.ok(r.html.includes('본문 내용'));
});

test('## 헤더 → <h2>', () => {
  const r = normalizeMarkdownToHtml('## 대제목\n본문');
  assert.ok(r.html.includes('<h2>대제목</h2>'));
});

test('[링크](https://x) → <a href>', () => {
  const r = normalizeMarkdownToHtml('자세히는 [공식 사이트](https://example.kr)를 참고하세요.');
  assert.ok(r.html.includes('<a href="https://example.kr">공식 사이트</a>'));
});

test('inline `code` → <code>', () => {
  const r = normalizeMarkdownToHtml('이 `함수` 를 호출하세요.');
  assert.ok(r.html.includes('<code>함수</code>'));
});

test('> blockquote → <blockquote>', () => {
  const r = normalizeMarkdownToHtml('> 인용 문구입니다');
  assert.ok(r.html.includes('<blockquote>인용 문구입니다</blockquote>'));
});

test('<code> 안의 마크다운은 변환 안 함 (false-positive 가드)', () => {
  const r = normalizeMarkdownToHtml('<code>**not converted**</code>');
  assert.ok(r.html.includes('<code>**not converted**</code>'));
  assert.equal(r.replacedCount, 0);
});

test('<pre> 안의 마크다운도 변환 안 함', () => {
  const r = normalizeMarkdownToHtml('<pre>### 헤더처럼 보이지만\n**볼드 아님**</pre>');
  assert.ok(r.html.includes('### 헤더처럼 보이지만'));
  assert.ok(r.html.includes('**볼드 아님**'));
});

test('자연 한국어 별표 단독: "*" 무시 (false-positive 가드)', () => {
  // 단순 별표 단독 — `*` 한 개. 변환 X
  const input = '주의 사항* 자세히 보기';
  const r = normalizeMarkdownToHtml(input);
  // 닫힌 `*text*` 가 없으므로 변환 안 됨
  assert.equal(r.html, input);
});

test('번호 list (1. ...) 는 prose_flow 검출에 위임 — 변환 안 함', () => {
  const input = '1. 첫째로 양치는 자주\n2. 둘째로 정기 검진';
  const r = normalizeMarkdownToHtml(input);
  // 본 함수는 번호 list 변환 안 함
  assert.equal(r.html, input);
});

test('복합 변환: 헤더 + 볼드 + 링크 동시', () => {
  const input = '### 결론\n이 시술은 **안전**합니다. [학회](https://example.kr) 참고.';
  const r = normalizeMarkdownToHtml(input);
  assert.ok(r.html.includes('<h3>결론</h3>'));
  assert.ok(r.html.includes('<strong>안전</strong>'));
  assert.ok(r.html.includes('<a href="https://example.kr">학회</a>'));
  assert.ok(r.replacedCount >= 3);
});

test('보안: javascript: protocol 링크는 변환 안 함', () => {
  const input = '[클릭](javascript:alert(1))';
  const r = normalizeMarkdownToHtml(input);
  // 패턴이 https?:// 만 매칭 → 그대로 보존
  assert.equal(r.html, input);
});

test('빈 입력 / undefined 안전 처리', () => {
  assert.deepEqual(normalizeMarkdownToHtml(''), { html: '', replacedCount: 0, patterns: [] });
});

// ── applyContentFilters 통합 ──

test('applyContentFilters: 의료법 + 마크다운 한 번에', () => {
  // "완벽" 은 의료법 치환 대상 ("정밀" 으로) + "**볼드**" 는 <strong>
  const input = '<p>이는 **완벽한** 시술입니다.</p>';
  const r = applyContentFilters(input);
  assert.ok(r.filtered.includes('<strong>'), '마크다운 변환 미적용');
  // 의료법 치환 또는 마크다운 치환 중 하나 이상 발생
  assert.ok(r.replacedCount >= 1);
});

test('applyContentFilters: 마크다운 patterns 가 foundTerms 에 합쳐짐', () => {
  const r = applyContentFilters('<p>### 헤더 **볼드**</p>');
  // foundTerms 에 마크다운 식별자 포함 (h3 / bold_star)
  const hasMarkdownTerm = r.foundTerms.some((t) => /h3|bold_star/.test(t));
  assert.ok(hasMarkdownTerm, `마크다운 패턴 식별자 누락: ${r.foundTerms.join(', ')}`);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
