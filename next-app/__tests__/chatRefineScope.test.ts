/**
 * chat refine targetScope 회귀 가드 (next-app).
 *
 * public-app/__tests__/chatRefineScope.test.ts 와 동일 케이스, 동일 invariants.
 * 양 앱 refinePrompt 가 drift 하면 두 앱 중 한쪽이 fail.
 *
 * 실행: npx tsx __tests__/chatRefineScope.test.ts
 */
import assert from 'node:assert/strict';
import {
  buildChatRefinePrompt,
  inferChatRefineTarget,
  type ChatRefineTarget,
} from '../lib/refinePrompt';

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
console.log('\n>>> chatRefineScope.test.ts (next-app)');

const CHIP_CASES: Array<[string, ChatRefineTarget]> = [
  ['도입부 자연스럽게', 'intro'],
  ['전체 톤 부드럽게', 'tone'],
  ['결론 강화', 'conclusion'],
  ['문장 다듬기', 'cleanup'],
  ['AI 느낌 제거', 'cleanup'],
];

for (const [label, expected] of CHIP_CASES) {
  test(`chip "${label}" → ${expected}`, () => {
    assert.equal(inferChatRefineTarget(label), expected);
  });
}

test('자유 텍스트 "도입부 좀 자연스럽게 해줘" → intro', () => {
  assert.equal(inferChatRefineTarget('도입부 좀 자연스럽게 해줘'), 'intro');
});

test('자유 텍스트 "결론 더 강하게" → conclusion', () => {
  assert.equal(inferChatRefineTarget('결론 더 강하게'), 'conclusion');
});

test('자유 텍스트 "전체 톤 부드럽게 바꿔" → tone', () => {
  assert.equal(inferChatRefineTarget('전체 톤 부드럽게 바꿔'), 'tone');
});

test('자유 텍스트 "AI 느낌 좀 없애줘" → cleanup', () => {
  assert.equal(inferChatRefineTarget('AI 느낌 좀 없애줘'), 'cleanup');
});

test('자유 텍스트 "전체 글 다시 써줘" → whole', () => {
  assert.equal(inferChatRefineTarget('전체 글 다시 써줘'), 'whole');
});

test('매칭 없음 → "whole" fallback', () => {
  assert.equal(inferChatRefineTarget('아무말 대잔치'), 'whole');
});

const baseContent = '<h2>발치 후 주의사항</h2><p>본문 내용</p>';

test('targetScope=intro → 도입부 + FROZEN_GUARD', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: '도입부 자연스럽게',
    targetScope: 'intro',
  });
  assert.ok(prompt.includes('도입부'), 'scope 문구에 "도입부" 누락');
  assert.ok(prompt.includes('FROZEN'), 'FROZEN 명시 누락');
  assert.ok(prompt.includes('한 글자도 변경하지 말고'), 'FROZEN_GUARD 본문 누락');
});

test('targetScope=conclusion → 결론 + FROZEN_GUARD', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: '결론 강화',
    targetScope: 'conclusion',
  });
  assert.ok(prompt.includes('결론'), '결론 누락');
  assert.ok(prompt.includes('FROZEN'), 'FROZEN 명시 누락');
});

test('targetScope=tone → 어조·어미만 조정', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: '전체 톤 부드럽게',
    targetScope: 'tone',
  });
  assert.ok(/어조|어미/.test(prompt), 'tone scope 문구 누락');
});

test('targetScope=cleanup → AI 느낌 제거', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: 'AI 느낌 제거',
    targetScope: 'cleanup',
  });
  assert.ok(/AI 느낌 제거|문장 다듬기/.test(prompt), 'cleanup scope 문구 누락');
});

test('targetScope=whole → FROZEN_GUARD 없음 (전체 동작)', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: '전체 다시 써',
    targetScope: 'whole',
  });
  assert.ok(!prompt.includes('한 글자도 변경하지 말고'), 'whole 인데 FROZEN_GUARD 강제');
});

test('targetScope 미지정 + 자유 메시지 → inferChatRefineTarget fallback', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: '도입부만 좀 자연스럽게',
  });
  assert.ok(prompt.includes('도입부'), '자동 추론 → intro scope 미적용');
  assert.ok(prompt.includes('FROZEN'), 'fallback intro 에도 FROZEN 명시 필요');
});

test('regex "1번째 소제목" 위치 매칭 → targetScope 보다 우선', () => {
  const { prompt } = buildChatRefinePrompt({
    workingContent: baseContent,
    userMessage: '1번째 소제목 바꿔줘',
    targetScope: 'intro',
  });
  assert.ok(/1번째.*소제목/.test(prompt), 'regex 위치 매칭 누락');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
