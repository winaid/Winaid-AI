/**
 * 블로그 카테고리 가이드 invariant 테스트.
 *
 * 실행: tsx packages/blog-core/src/__tests__/categoryGuide.test.ts
 * (next-app/package.json test glob 으로 자동 실행)
 *
 * 보장:
 *   - 현행 7개 카테고리 모두 CATEGORY_DEPTH_GUIDES + TERMINOLOGY_GUIDE + CATEGORY_TONE 에 매핑 존재 (drift 0)
 *   - 톤 가이드 3 필드 모두 비어있지 않음 (tone 길이, vocabulary 최소 5, avoid 최소 3)
 *   - buildCategoryToneBlock: 등록 카테고리 → XML 블록 / 미등록 → null
 *   - buildOutlinePrompt 출력에 톤 가이드 섹션 포함 (smoke)
 *   - 두 카테고리(치과/한의원) 프롬프트 출력이 substantially 다름 (차별화 확인)
 */
import assert from 'node:assert/strict';
import {
  CATEGORY_DEPTH_GUIDES,
  TERMINOLOGY_GUIDE,
  CATEGORY_TONE,
  FALLBACK_CATEGORY_TONE,
  buildCategoryToneBlock,
  buildOutlinePrompt,
} from '../blogPrompt';

// pressPrompt.ts:45 의 enum 과 일치 — 본 테스트가 drift 0 invariant 보증
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
console.log('\n>>> categoryGuide.test.ts');

test('drift-zero: 모든 7개 카테고리가 CATEGORY_DEPTH_GUIDES 매핑 존재', () => {
  for (const c of MEDICAL_CATEGORIES) {
    assert.ok(CATEGORY_DEPTH_GUIDES[c], `[${c}] specialist_guide 누락 — drift`);
    assert.ok(CATEGORY_DEPTH_GUIDES[c].includes('specialist_guide'), `[${c}] XML tag 누락`);
  }
});

test('drift-zero: 모든 7개 카테고리가 TERMINOLOGY_GUIDE 매핑 존재', () => {
  for (const c of MEDICAL_CATEGORIES) {
    assert.ok(TERMINOLOGY_GUIDE[c], `[${c}] terminology 누락 — drift`);
    assert.ok(TERMINOLOGY_GUIDE[c].includes('patient_friendly'), `[${c}] patient_friendly 섹션 누락`);
  }
});

test('drift-zero: 모든 7개 카테고리가 CATEGORY_TONE 매핑 존재', () => {
  for (const c of MEDICAL_CATEGORIES) {
    assert.ok(CATEGORY_TONE[c], `[${c}] CATEGORY_TONE 누락 — drift`);
  }
});

test('CATEGORY_TONE 필드 최소 요건: tone 길이 / vocabulary ≥ 5 / avoid ≥ 3', () => {
  for (const c of MEDICAL_CATEGORIES) {
    const t = CATEGORY_TONE[c];
    assert.ok(t.tone.length >= 20, `[${c}] tone 너무 짧음 (${t.tone.length}자)`);
    assert.ok(t.vocabulary.length >= 5, `[${c}] vocabulary ${t.vocabulary.length} < 5`);
    assert.ok(t.avoid.length >= 3, `[${c}] avoid ${t.avoid.length} < 3`);
  }
});

test('FALLBACK_CATEGORY_TONE 정의 + 필드 비어있지 않음', () => {
  assert.ok(FALLBACK_CATEGORY_TONE.tone.length > 0);
  assert.ok(FALLBACK_CATEGORY_TONE.vocabulary.length > 0);
  assert.ok(FALLBACK_CATEGORY_TONE.avoid.length > 0);
});

test('buildCategoryToneBlock: 등록 카테고리 → XML 블록', () => {
  const block = buildCategoryToneBlock('치과');
  assert.ok(block, 'null 반환됨');
  assert.ok(block!.includes('<category_tone category="치과">'));
  assert.ok(block!.includes('어조:'));
  assert.ok(block!.includes('권장 어휘'));
  assert.ok(block!.includes('금기 표현'));
});

test('buildCategoryToneBlock: 미등록 / undefined / null → null (fallback 미강제)', () => {
  assert.equal(buildCategoryToneBlock(undefined), null);
  assert.equal(buildCategoryToneBlock(null), null);
  assert.equal(buildCategoryToneBlock(''), null);
  assert.equal(buildCategoryToneBlock('비뇨의학과'), null); // 미등록
});

test('buildOutlinePrompt: category="치과" systemBlocks 에 specialist + terminology + category_tone 모두 포함', () => {
  const prompt = buildOutlinePrompt({
    topic: '임플란트 관리법',
    category: '치과',
    textLength: 2000,
  } as Parameters<typeof buildOutlinePrompt>[0]);
  // systemBlocks 배열의 각 text 를 합쳐 raw 검색 (JSON escape 회피)
  const merged = (prompt.systemBlocks ?? []).map((b) => b.text).join('\n');
  assert.ok(merged.includes('specialist_guide'), 'specialist_guide 누락');
  assert.ok(merged.includes('topic="dental"'), 'dental topic 누락');
  assert.ok(merged.includes('terminology'), 'terminology 누락');
  assert.ok(merged.includes('category_tone'), 'category_tone 누락');
});

test('buildOutlinePrompt: 미등록 카테고리(빈 string) → 가이드 섹션 미포함 (fallback 단일 톤 유지)', () => {
  const prompt = buildOutlinePrompt({
    topic: '일반 주제',
    category: '',
    textLength: 2000,
  } as Parameters<typeof buildOutlinePrompt>[0]);
  const merged = (prompt.systemBlocks ?? []).map((b) => b.text).join('\n');
  assert.ok(!merged.includes('category_tone'), '미등록인데 category_tone 노출');
});

test('카테고리 차별화: 치과 vs 한의원 톤이 substantially 다름', () => {
  const dental = buildCategoryToneBlock('치과')!;
  const korean = buildCategoryToneBlock('한의원')!;
  assert.notEqual(dental, korean);
  // 카테고리 고유 키워드 교차 검증 — 어휘가 진짜 카테고리에 맞게 분기됐는지
  assert.ok(dental.includes('구강 위생') || dental.includes('정기 검진'));
  assert.ok(korean.includes('체질') || korean.includes('한약'));
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
