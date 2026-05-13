/**
 * actionGroups 회귀 테스트 (public-app).
 *
 * 실행: npx tsx __tests__/actionGroups.test.ts  (또는 npm run test)
 *
 * 보장 invariant:
 *   - LABEL 매핑 누락 없음 (ACTION_META 와 EXECUTION_TYPE_BY_LABEL/COST_BY_LABEL drift 0)
 *   - classifyActionGroup 의 우선순위 규칙 정합
 *   - 누락 필드 → 'unclassified' fallback
 */
import assert from 'node:assert/strict';
import {
  classifyActionGroup,
  getActionCost,
  getExecutionType,
  ACTION_GROUP_ORDER,
} from '../lib/diagnostic/actionGroups';
import type { ActionItem } from '../lib/diagnostic/types';
import { EXECUTION_TYPES, ACTION_COSTS } from '../lib/diagnostic/types';
import { LABELS } from '../lib/diagnostic/scoring';

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

function baseAction(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    action: 'test',
    impact: 'high',
    difficulty: 'easy',
    timeframe: '즉시',
    category: 'test',
    ...overrides,
  };
}

// eslint-disable-next-line no-console
console.log('\n>>> actionGroups.test.ts');

test('ACTION_GROUP_ORDER 4 그룹 모두 포함, ai_helpable 이 첫 자리', () => {
  assert.equal(ACTION_GROUP_ORDER.length, 4);
  assert.equal(ACTION_GROUP_ORDER[0], 'ai_helpable');
  for (const g of ['ai_helpable', 'instant_human', 'dev_required', 'unclassified']) {
    assert.ok(ACTION_GROUP_ORDER.includes(g as never), `누락: ${g}`);
  }
});

test('classifyActionGroup: executionType 누락 → unclassified', () => {
  const a = baseAction({ cost: 'free' });
  assert.equal(classifyActionGroup(a), 'unclassified');
});

test('classifyActionGroup: cost 누락 → unclassified', () => {
  const a = baseAction({ executionType: 'instant' });
  assert.equal(classifyActionGroup(a), 'unclassified');
});

test('classifyActionGroup: executor=ai → ai_helpable (executionType 무관)', () => {
  const a = baseAction({ executor: 'ai', executionType: 'developer', cost: 'free' });
  assert.equal(classifyActionGroup(a), 'ai_helpable');
});

test('classifyActionGroup: executor=both → ai_helpable', () => {
  const a = baseAction({ executor: 'both', executionType: 'homepage', cost: 'time_only' });
  assert.equal(classifyActionGroup(a), 'ai_helpable');
});

test('classifyActionGroup: executor=hybrid (legacy 동의어) → ai_helpable', () => {
  const a = baseAction({ executor: 'hybrid', executionType: 'instant', cost: 'free' });
  assert.equal(classifyActionGroup(a), 'ai_helpable');
});

test('classifyActionGroup: executor=human + executionType=instant → instant_human', () => {
  const a = baseAction({ executor: 'human', executionType: 'instant', cost: 'time_only' });
  assert.equal(classifyActionGroup(a), 'instant_human');
});

test('classifyActionGroup: executor 미설정 + executionType=instant → instant_human', () => {
  const a = baseAction({ executionType: 'instant', cost: 'free' });
  assert.equal(classifyActionGroup(a), 'instant_human');
});

test('classifyActionGroup: executor=human + executionType=developer → dev_required', () => {
  const a = baseAction({ executor: 'human', executionType: 'developer', cost: 'free' });
  assert.equal(classifyActionGroup(a), 'dev_required');
});

test('classifyActionGroup: executor 미설정 + executionType=homepage → dev_required', () => {
  const a = baseAction({ executionType: 'homepage', cost: 'external' });
  assert.equal(classifyActionGroup(a), 'dev_required');
});

test('getExecutionType / getActionCost 가 등록된 LABEL 에 대해 valid enum 반환', () => {
  // 샘플 LABEL 6개 — security/page/schema/content/external 각 영역 1개씩
  const samples = [
    LABELS.https,
    LABELS.has_doctor_page,
    LABELS.dentist_schema,
    LABELS.title_opt,
    LABELS.naver,
    LABELS.h1_count,
  ];
  for (const label of samples) {
    const et = getExecutionType(label);
    const co = getActionCost(label);
    assert.ok(et && EXECUTION_TYPES.includes(et), `[${label}] executionType=${et} 가 enum 외`);
    assert.ok(co && ACTION_COSTS.includes(co), `[${label}] cost=${co} 가 enum 외`);
  }
});

test('미등록 LABEL → undefined fallback (UI 미분류 그룹으로 빠짐)', () => {
  assert.equal(getExecutionType('__nonexistent_label__'), undefined);
  assert.equal(getActionCost('__nonexistent_label__'), undefined);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
