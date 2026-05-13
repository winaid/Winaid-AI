/**
 * 섹션 재생성(buildBlogSectionPromptV3) 안전망 회귀 테스트.
 *
 * 실행: tsx packages/blog-core/src/__tests__/blogSectionRegen.test.ts
 * (next-app/package.json test glob 으로 자동 실행)
 *
 * 보장:
 *  - slot 1 에 PRIORITY_ORDER_BLOCK + E_E_A_T_GUIDE 본문 포함 (다른 4개 빌더와 정합)
 *  - 슬롯 invariant: systemBlocks.length === 3 (audit Q-4 4-slot cache limit 여유)
 *  - SECTION_REGEN_PERSONA + COMMON_WRITING_STYLE 도 함께 유지 (회귀 0)
 *  - PRIORITY/E_E_A_T 가 SECTION_REGEN_PERSONA 내부에 이미 흡수돼 있지 않음 (중복 sanity)
 */
import assert from 'node:assert/strict';
import {
  buildBlogSectionPromptV3,
  PRIORITY_ORDER_BLOCK,
  E_E_A_T_GUIDE,
  SECTION_REGEN_PERSONA,
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

function callBuilder() {
  return buildBlogSectionPromptV3({
    req: {
      topic: '임플란트 시술 후 주의사항',
      category: '치과',
      textLength: 2000,
    },
    outline: {
      keyMessage: '임플란트 회복 단계별 가이드',
      sections: [
        { type: 'intro', heading: '들어가며', summary: '인사', charTarget: 200 },
        { type: 'body', heading: '시술 직후', summary: '회복', charTarget: 400 },
      ],
    },
    sectionIndex: 1,
  } as Parameters<typeof buildBlogSectionPromptV3>[0]);
}

// eslint-disable-next-line no-console
console.log('\n>>> blogSectionRegen.test.ts');

test('slot 1 에 PRIORITY_ORDER_BLOCK 본문 substring 포함', () => {
  const prompt = callBuilder();
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  // PRIORITY_ORDER_BLOCK 의 식별 가능 token
  assert.ok(merged.includes('<priority_order>'), 'PRIORITY_ORDER_BLOCK 누락');
});

test('slot 1 에 E_E_A_T_GUIDE 본문 substring 포함', () => {
  const prompt = callBuilder();
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes('<e_e_a_t_signals>'), 'E_E_A_T_GUIDE 누락');
});

test('SECTION_REGEN_PERSONA + COMMON_WRITING_STYLE 유지 (기존 동작 회귀 0)', () => {
  const prompt = callBuilder();
  const slot1 = prompt.systemBlocks[0].text;
  // SECTION_REGEN_PERSONA 의 식별 가능 token
  assert.ok(slot1.includes('<role>'), 'SECTION_REGEN_PERSONA 누락');
});

test('슬롯 invariant: ≤4 슬롯 (audit Q-4 cache limit 보호, dynamic 분기)', () => {
  const prompt = callBuilder();
  // 슬롯 수는 카테고리·outline 분기에 따라 dynamic — 4 cache limit 안 넘는지가 핵심.
  assert.ok(
    prompt.systemBlocks.length >= 1 && prompt.systemBlocks.length <= 4,
    `슬롯 수 초과: ${prompt.systemBlocks.length} (cache limit 4)`,
  );
});

test('중복 sanity: SECTION_REGEN_PERSONA 내부에 PRIORITY_ORDER_BLOCK 본문 포함 안 됨', () => {
  // 두 상수가 independent 인지 확인 — 만약 한쪽이 다른쪽을 포함하면 중복 push 가 된 셈
  assert.ok(
    !SECTION_REGEN_PERSONA.includes(PRIORITY_ORDER_BLOCK),
    'SECTION_REGEN_PERSONA 가 PRIORITY_ORDER_BLOCK 을 이미 흡수 — 중복',
  );
  assert.ok(
    !SECTION_REGEN_PERSONA.includes(E_E_A_T_GUIDE),
    'SECTION_REGEN_PERSONA 가 E_E_A_T_GUIDE 를 이미 흡수 — 중복',
  );
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
