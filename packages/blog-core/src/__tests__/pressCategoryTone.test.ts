/**
 * 보도자료 카테고리 톤 invariant 테스트 (블로그 6).
 *
 * 실행: tsx packages/blog-core/src/__tests__/pressCategoryTone.test.ts
 * (next-app/package.json test glob 으로 자동 실행)
 *
 * 보장:
 *   - 7개 카테고리 모두 PRESS_CATEGORY_TONE 매핑 존재 (drift-zero, PR #194 패턴)
 *   - 필드 최소 요건 (tone 길이 / vocabulary ≥ 5 / avoid ≥ 3)
 *   - FALLBACK_PRESS_CATEGORY_TONE 정의
 *   - buildPressCategoryToneBlock: 등록 → 블록 / 미등록 → null (fallback 미강제)
 *   - 차별화: 치과 vs 한의원 — vocabulary/avoid 동일 X
 *   - 블로그용 톤(CATEGORY_TONE) 과 분리: 환자 호소 어휘 (~하세요 등) 가 avoid 에
 */
import assert from 'node:assert/strict';
import {
  PRESS_CATEGORY_TONE,
  FALLBACK_PRESS_CATEGORY_TONE,
  buildPressCategoryToneBlock,
} from '../pressCategoryTone';

const MEDICAL_CATEGORIES = [
  '치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과',
] as const;

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
console.log('\n>>> pressCategoryTone.test.ts');

test('drift-zero: 7개 카테고리 모두 PRESS_CATEGORY_TONE 매핑 존재', () => {
  for (const c of MEDICAL_CATEGORIES) {
    assert.ok(PRESS_CATEGORY_TONE[c], `[${c}] PRESS_CATEGORY_TONE 누락`);
  }
});

test('필드 최소 요건: tone ≥ 20자 / vocabulary ≥ 5 / avoid ≥ 3', () => {
  for (const c of MEDICAL_CATEGORIES) {
    const t = PRESS_CATEGORY_TONE[c];
    assert.ok(t.tone.length >= 20, `[${c}] tone 짧음 (${t.tone.length}자)`);
    assert.ok(t.vocabulary.length >= 5, `[${c}] vocabulary ${t.vocabulary.length} < 5`);
    assert.ok(t.avoid.length >= 3, `[${c}] avoid ${t.avoid.length} < 3`);
  }
});

test('FALLBACK_PRESS_CATEGORY_TONE 정의 + 필드 비어있지 않음', () => {
  assert.ok(FALLBACK_PRESS_CATEGORY_TONE.tone.length > 0);
  assert.ok(FALLBACK_PRESS_CATEGORY_TONE.vocabulary.length > 0);
  assert.ok(FALLBACK_PRESS_CATEGORY_TONE.avoid.length > 0);
});

test('buildPressCategoryToneBlock: 등록 카테고리 → 가이드 블록', () => {
  const block = buildPressCategoryToneBlock('치과');
  assert.ok(block, 'null 반환됨');
  assert.ok(block!.includes('[치과 보도자료 톤 가이드]'));
  assert.ok(block!.includes('어조:'));
  assert.ok(block!.includes('권장 어휘'));
  assert.ok(block!.includes('금기 표현'));
});

test('buildPressCategoryToneBlock: 미등록 / undefined / null / 빈 → null (fallback 미강제)', () => {
  assert.equal(buildPressCategoryToneBlock(undefined), null);
  assert.equal(buildPressCategoryToneBlock(null), null);
  assert.equal(buildPressCategoryToneBlock(''), null);
  assert.equal(buildPressCategoryToneBlock('비뇨의학과'), null);
});

test('차별화: 치과 vs 한의원 vocabulary 동일 X', () => {
  const dental = PRESS_CATEGORY_TONE['치과'];
  const korean = PRESS_CATEGORY_TONE['한의원'];
  assert.notDeepEqual(dental.vocabulary, korean.vocabulary);
  // 카테고리 고유 학회명 검증
  assert.ok(dental.vocabulary.some((v) => v.includes('치과')), '치과 학회 누락');
  assert.ok(korean.vocabulary.some((v) => v.includes('한')), '한방 학회 누락');
});

test('보도자료 register 분리 확인: 환자 호소형(~하세요 등)이 avoid 에 포함', () => {
  // 7개 중 적어도 4개 카테고리에 환자 호소 어휘가 금기로 등록 (보도자료 톤 분리 증거)
  const countWithPatientAvoid = MEDICAL_CATEGORIES.filter((c) =>
    PRESS_CATEGORY_TONE[c].avoid.some((a) => /(~하세요|~받으세요|~예약|~해보세요)/.test(a)),
  ).length;
  assert.ok(countWithPatientAvoid >= 4, `보도자료-특화 avoid 항목 부족: ${countWithPatientAvoid}/7`);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
