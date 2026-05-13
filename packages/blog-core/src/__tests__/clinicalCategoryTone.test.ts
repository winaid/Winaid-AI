/**
 * 임상글 카테고리 톤 invariant 테스트 (카테고리 quartet 완결).
 *
 * 실행: tsx packages/blog-core/src/__tests__/clinicalCategoryTone.test.ts
 *
 * 보장 (PR #196 패턴 + register 분리 추가 검증):
 *   - 7개 카테고리 모두 CLINICAL_CATEGORY_TONE 매핑 (drift-zero)
 *   - 필드 최소 요건 (tone 길이, vocabulary ≥5, avoid ≥3)
 *   - FALLBACK 정의
 *   - buildClinicalCategoryToneBlock 등록/미등록 분기
 *   - 차별화 (치과 vs 한의원)
 *   - register 분리: 의학 술어 register 가 환자 호소형(블로그) / 보도 어휘(보도자료) 와 구별
 */
import assert from 'node:assert/strict';
import {
  CLINICAL_CATEGORY_TONE,
  FALLBACK_CLINICAL_CATEGORY_TONE,
  buildClinicalCategoryToneBlock,
} from '../clinicalCategoryTone';

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
console.log('\n>>> clinicalCategoryTone.test.ts');

test('drift-zero: 7개 카테고리 모두 CLINICAL_CATEGORY_TONE 매핑 존재', () => {
  for (const c of MEDICAL_CATEGORIES) {
    assert.ok(CLINICAL_CATEGORY_TONE[c], `[${c}] CLINICAL_CATEGORY_TONE 누락`);
  }
});

test('필드 최소 요건: tone ≥20자 / vocabulary ≥5 / avoid ≥3', () => {
  for (const c of MEDICAL_CATEGORIES) {
    const t = CLINICAL_CATEGORY_TONE[c];
    assert.ok(t.tone.length >= 20, `[${c}] tone 짧음 (${t.tone.length}자)`);
    assert.ok(t.vocabulary.length >= 5, `[${c}] vocabulary ${t.vocabulary.length} < 5`);
    assert.ok(t.avoid.length >= 3, `[${c}] avoid ${t.avoid.length} < 3`);
  }
});

test('FALLBACK_CLINICAL_CATEGORY_TONE 정의 + 필드 비어있지 않음', () => {
  assert.ok(FALLBACK_CLINICAL_CATEGORY_TONE.tone.length > 0);
  assert.ok(FALLBACK_CLINICAL_CATEGORY_TONE.vocabulary.length > 0);
  assert.ok(FALLBACK_CLINICAL_CATEGORY_TONE.avoid.length > 0);
});

test('buildClinicalCategoryToneBlock: 등록 카테고리 → 가이드 블록', () => {
  const block = buildClinicalCategoryToneBlock('치과');
  assert.ok(block, 'null 반환됨');
  assert.ok(block!.includes('[치과 임상글 톤 가이드]'));
  assert.ok(block!.includes('어조:'));
  assert.ok(block!.includes('권장 임상 어휘'));
  assert.ok(block!.includes('금기 표현'));
});

test('buildClinicalCategoryToneBlock: 미등록 / undefined / null / 빈 → null', () => {
  assert.equal(buildClinicalCategoryToneBlock(undefined), null);
  assert.equal(buildClinicalCategoryToneBlock(null), null);
  assert.equal(buildClinicalCategoryToneBlock(''), null);
  assert.equal(buildClinicalCategoryToneBlock('비뇨의학과'), null);
});

test('차별화: 치과 vs 한의원 vocabulary 동일 X', () => {
  const dental = CLINICAL_CATEGORY_TONE['치과'];
  const korean = CLINICAL_CATEGORY_TONE['한의원'];
  assert.notDeepEqual(dental.vocabulary, korean.vocabulary);
  // 카테고리 고유 술어
  assert.ok(dental.vocabulary.some((v) => /panoramic|골유착|근관/.test(v)), '치과 임상 술어 누락');
  assert.ok(korean.vocabulary.some((v) => /변증|사진|침구|체질/.test(v)), '한방 임상 술어 누락');
});

test('register 분리: 의학 술어가 dominant — 영문 원어 병기 + 의학 약어 빈도', () => {
  // 7개 중 적어도 5개 카테고리에 영문 원어 병기 형태 (괄호) 또는 의학 약어 존재
  const englishRegister = MEDICAL_CATEGORIES.filter((c) =>
    CLINICAL_CATEGORY_TONE[c].vocabulary.some((v) => /\([A-Za-z]/.test(v) || /[A-Z]{2,}/.test(v)),
  ).length;
  assert.ok(
    englishRegister >= 5,
    `의학 register 미흡: 영문 원어/약어 ${englishRegister}/7. 임상글은 학술 register 필요`,
  );
});

test('register 분리: 환자 호소형 + 광고성 둘 다 avoid (블로그/보도자료보다 엄격)', () => {
  // 임상글은 환자 호소(~하세요)와 광고성(최고/완벽) 둘 다 부적합 — 적어도 5개 카테고리에서
  // avoid 에 호소형 또는 광고성 어휘 포함
  const strictAvoid = MEDICAL_CATEGORIES.filter((c) => {
    const a = CLINICAL_CATEGORY_TONE[c].avoid;
    const hasPatientCall = a.some((v) => /~하세요|~받으세요|걱정 없이|안심하세요/.test(v));
    const hasAdvertising = a.some((v) => /최고|완벽|보장|0%|평생/.test(v));
    return hasPatientCall || hasAdvertising;
  }).length;
  assert.ok(strictAvoid >= 5, `임상 register avoid 미흡: ${strictAvoid}/7`);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
