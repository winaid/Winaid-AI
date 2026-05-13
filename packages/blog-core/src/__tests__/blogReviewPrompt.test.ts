/**
 * buildBlogReviewPrompt 안전망 회귀 테스트.
 *
 * 실행: tsx packages/blog-core/src/__tests__/blogReviewPrompt.test.ts
 *
 * 보장 (PR #199 후속 — 5빌더 안전망 완결):
 *  - slot 1 에 REVIEWER_E_E_A_T_GUIDE 본문 포함
 *  - REVIEWER_PERSONA 유지 (회귀 0)
 *  - 슬롯 invariant: ≤4 (cache limit 보호, category 분기 있을 때 최대치)
 *  - REVIEWER_PERSONA / REVIEWER_E_E_A_T_GUIDE 본문이 서로 중복 흡수 안 함 (sanity)
 *  - 4축 신호 패턴 (Experience/Expertise/Authoritativeness/Trustworthiness) 모두 새 가이드에 등장
 */
import assert from 'node:assert/strict';
import {
  buildBlogReviewPrompt,
  REVIEWER_PERSONA,
  REVIEWER_E_E_A_T_GUIDE,
} from '../blogPrompt';

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

function callBuilder(category?: string) {
  return buildBlogReviewPrompt('<h2>임플란트 안내</h2><p>본문</p>', {
    category,
    hospitalName: 'OO치과',
  });
}

// eslint-disable-next-line no-console
console.log('\n>>> blogReviewPrompt.test.ts');

test('slot 1 에 REVIEWER_E_E_A_T_GUIDE 본문 substring 포함', () => {
  const prompt = callBuilder('치과');
  const slot1 = prompt.systemBlocks[0].text;
  assert.ok(slot1.includes('<reviewer_e_e_a_t_check>'), 'REVIEWER_E_E_A_T_GUIDE 누락');
});

test('REVIEWER_PERSONA 유지 (회귀 0)', () => {
  const prompt = callBuilder('치과');
  const slot1 = prompt.systemBlocks[0].text;
  assert.ok(slot1.includes('<role>'), 'REVIEWER_PERSONA 누락');
  assert.ok(slot1.includes('<checklist>'), 'checklist 17개 누락');
});

test('슬롯 invariant: ≤4 (cache limit 보호)', () => {
  const prompt = callBuilder('치과');
  assert.ok(
    prompt.systemBlocks.length >= 1 && prompt.systemBlocks.length <= 4,
    `슬롯 수 초과: ${prompt.systemBlocks.length} (cache limit 4)`,
  );
});

test('중복 sanity: REVIEWER_PERSONA 가 reviewer_e_e_a_t_check 본문 흡수 안 함', () => {
  assert.ok(
    !REVIEWER_PERSONA.includes('reviewer_e_e_a_t_check'),
    'REVIEWER_PERSONA 가 새 가이드를 이미 흡수 — 중복',
  );
});

test('4축 신호 패턴 (Experience/Expertise/Authority/Trust) 모두 새 가이드 등장', () => {
  assert.ok(REVIEWER_E_E_A_T_GUIDE.includes('Experience'), 'Experience 축 누락');
  assert.ok(REVIEWER_E_E_A_T_GUIDE.includes('Expertise'), 'Expertise 축 누락');
  assert.ok(REVIEWER_E_E_A_T_GUIDE.includes('Authoritativeness'), 'Authoritativeness 축 누락');
  assert.ok(REVIEWER_E_E_A_T_GUIDE.includes('Trustworthiness'), 'Trustworthiness 축 누락');
});

test('판정 규칙 명시 (통과 신호 ≥2 / ≤1 차이)', () => {
  // 판정 규칙 명시 검증 — 감수자가 한 글에서 신호 카운트 후 issue 발급 여부 결정 가능
  assert.ok(REVIEWER_E_E_A_T_GUIDE.includes('통과 신호'), '판정 규칙 누락');
  assert.ok(REVIEWER_E_E_A_T_GUIDE.includes('issue 발급'), 'issue 발급 instruction 누락');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
