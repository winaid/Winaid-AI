/**
 * blog-quality-2 회귀 방지 테스트 — medicalLawFilter false positive 5건 fix.
 *
 * 보장:
 *  - Fix 1: 접속부사 (또한/더불어/아울러/나아가/뿐만 아니라) 줄 시작 보존
 *  - Fix 2: 정보문 "하는 것이 중요합니다" 강제 명령조 변환 폐기
 *  - Fix 3: "보장합니다" 조사 일치 변환 (목적격/주격/fallback)
 *  - Fix 4: "무조건" 광고 컨텍스트 한정 (응급 권고 보존)
 *  - Fix 5: "가장 좋은/뛰어난/우수한" 격하 폐기 (정보문 보존)
 *  - 의료광고법 본 95 규칙 무영향 (최고/유일/완벽/100% 등 차단 그대로)
 *  - PR #248 invariant 유지 (어미 무작위 치환 폐기)
 */
import assert from 'node:assert/strict';
import {
  filterOutputArtifacts,
  filterMedicalLawViolations,
} from '../medicalLawFilter';

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
console.log('\n>>> blogQuality2.test.ts');

// ─────────────────────────────────────────────────────────────────────
// Fix 1 — 접속부사 줄 시작 자동 삭제 폐기
// ─────────────────────────────────────────────────────────────────────

test('Fix 1: "또한" 줄 시작 보존', () => {
  const input = '또한 환자분이 통증을 호소합니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(result.includes('또한'), `회귀: "또한" 삭제됨 — "${result}"`);
});

test('Fix 1: 줄 시작 접속부사 5종 (또한/더불어/아울러/나아가/뿐만 아니라) 모두 보존', () => {
  const inputs = [
    '또한 정기 검진이 중요합니다.',
    '더불어 식습관도 챙겨야 합니다.',
    '아울러 흡연을 줄이는 것이 좋습니다.',
    '나아가 스트레스 관리도 필요합니다.',
    '뿐만 아니라 운동도 도움이 됩니다.',
  ];
  for (const i of inputs) {
    const r = filterOutputArtifacts(i);
    assert.equal(r, i, `회귀: "${i}" → "${r}" 변경됨`);
  }
});

test('Fix 1: PR #248 자연 흐름 정합 — 줄 중간 접속부사 그대로', () => {
  // 줄 시작/중간 무관하게 모든 위치 보존되어야 함
  const input = '치료가 시작되고 또한 회복이 빨라집니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(result.includes('또한'), '줄 중간 또한 삭제 회귀');
});

// ─────────────────────────────────────────────────────────────────────
// Fix 2 — "하는 것이 중요합니다" 강제 명령조 변환 폐기
// ─────────────────────────────────────────────────────────────────────

test('Fix 2: 정보문 "이해하는 것이 중요합니다" 보존 (명령조 변질 차단)', () => {
  const input = '환자분이 자신의 상태를 정확히 이해하는 것이 중요합니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(
    result.includes('이해하는 것이 중요합니다'),
    `회귀: 강제 명령조 변환 — "${result}"`,
  );
  assert.ok(!result.includes('이해해야 합니다'), '회귀: 명령조 치환 발생');
});

test('Fix 2: "검진을 받는 것이 중요합니다" 권고문도 보존 (LLM 책임 이관)', () => {
  // 후처리는 더 이상 변환하지 않음. 권고문 변환은 LLM 이 prompt 가이드대로 자체 처리.
  const input = '정기 검진을 받는 것이 중요합니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(result.includes('받는 것이 중요합니다'), `회귀: 후처리 변환 — "${result}"`);
});

// ─────────────────────────────────────────────────────────────────────
// Fix 3 — "보장합니다" 조사 일치 변환
// ─────────────────────────────────────────────────────────────────────

test('Fix 3: "효과를 보장합니다" 조사 일치 (목적격 → 자동사 정합)', () => {
  const r = filterMedicalLawViolations('이 시술은 효과를 보장합니다').filtered;
  assert.ok(
    r.includes('효과를 기대할 수 있습니다'),
    `목적격 조사 일치 실패: "${r}"`,
  );
  assert.ok(
    !r.includes('효과를 도움이 됩니다'),
    `회귀: 비문 ("를 + 자동사") 생성 — "${r}"`,
  );
});

test('Fix 3: "결과가 보장됩니다" 조사 일치 (주격 → 피동 정합)', () => {
  const r = filterMedicalLawViolations('치료 결과가 보장됩니다').filtered;
  assert.ok(r.includes('결과가 기대됩니다'), `주격 조사 일치 실패: "${r}"`);
  assert.ok(!r.includes('결과가 도움이 됩니다'), `회귀: 비문 — "${r}"`);
});

test('Fix 3: "보장하는" → "기대할 수 있는" (관형형)', () => {
  const r = filterMedicalLawViolations('성공을 보장하는 시술').filtered;
  assert.ok(r.includes('기대할 수 있는'), `관형형 변환 실패: "${r}"`);
  assert.ok(!r.includes('보장하는'), '회귀: 미변환');
});

test('Fix 3: 조사 없는 fallback "보장합니다" → "기대할 수 있습니다"', () => {
  // 조사 없이 단독 등장 (드문 케이스)
  const r = filterMedicalLawViolations('우리 시술은 보장합니다').filtered;
  assert.ok(r.includes('기대할 수 있습니다'), `fallback 변환 실패: "${r}"`);
  assert.ok(!r.includes('보장합니다'), '회귀: 미변환');
});

test('Fix 3: 의료광고법 의도 유지 — "보장" 단정 표현 차단', () => {
  const r = filterMedicalLawViolations('치료가 효과를 보장합니다').filtered;
  // "보장" 단어 자체가 본문에 단정 표현으로 남으면 안 됨
  assert.ok(!/효과를 보장합니다/.test(r), '의료광고법 차단 회귀');
});

// ─────────────────────────────────────────────────────────────────────
// Fix 4 — "무조건" 광고 컨텍스트 한정
// ─────────────────────────────────────────────────────────────────────

test('Fix 4: "응급실에 무조건 즉시 가세요" 응급 권고 보존', () => {
  const r = filterMedicalLawViolations('응급실에 무조건 즉시 가세요').filtered;
  assert.ok(r.includes('무조건'), `응급 권고 약화 회귀: "${r}"`);
});

test('Fix 4: "무조건 진찰을 받으세요" 필수 권고 보존', () => {
  const r = filterMedicalLawViolations('통증이 있으면 무조건 진찰을 받으세요').filtered;
  assert.ok(r.includes('무조건'), '필수 권고 약화 회귀');
});

test('Fix 4: 자기 병원 찬양 "무조건 우리 병원" 차단', () => {
  const r = filterMedicalLawViolations('무조건 우리 병원으로 오세요').filtered;
  assert.ok(!/무조건\s*우리\s*병원/.test(r), `자기 병원 찬양 차단 실패: "${r}"`);
});

test('Fix 4: 자기 병원 찬양 변형 (저희/당사/본 의원) 차단', () => {
  const cases = [
    ['무조건 저희 클리닉이 답입니다', /무조건\s*저희/],
    ['무조건 본 병원이 최고', /무조건\s*본\s*병원/],
    ['무조건 본 의원에서', /무조건\s*본\s*의원/],
  ];
  for (const [input, pat] of cases as Array<[string, RegExp]>) {
    const r = filterMedicalLawViolations(input).filtered;
    assert.ok(!pat.test(r), `자기 병원 찬양 변형 회귀: "${input}" → "${r}"`);
  }
});

test('Fix 4: 단정 효과 "무조건 효과/성공/완치/만족" 차단', () => {
  const cases = [
    '이 약은 무조건 효과가 있습니다',
    '시술은 무조건 성공합니다',
    '치료는 무조건 완치됩니다',
    '환자는 무조건 만족합니다',
  ];
  for (const input of cases) {
    const r = filterMedicalLawViolations(input).filtered;
    assert.ok(r.includes('대부분의 경우'), `단정 효과 차단 실패: "${input}" → "${r}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Fix 5 — "가장 좋은/뛰어난/우수한" 격하 폐기
// ─────────────────────────────────────────────────────────────────────

test('Fix 5: 정보문 "가장 좋은 방법은 정기 검진입니다" 보존', () => {
  const r = filterMedicalLawViolations('가장 좋은 방법은 정기 검진입니다').filtered;
  assert.ok(r.includes('가장 좋은'), `정보문 격하 회귀: "${r}"`);
  assert.ok(!r.includes('매우 좋은'), '회귀: 격하 치환 발생');
});

test('Fix 5: "가장 뛰어난 / 가장 우수한" 보존', () => {
  const r1 = filterMedicalLawViolations('가장 뛰어난 효과를 보입니다').filtered;
  assert.ok(r1.includes('가장 뛰어난'), `회귀: ${r1}`);
  const r2 = filterMedicalLawViolations('가장 우수한 결과입니다').filtered;
  assert.ok(r2.includes('가장 우수한'), `회귀: ${r2}`);
});

test('Fix 5: 자기 병원 찬양 "가장 좋은 병원" 은 별도 패턴 (line 126) 으로 차단 유지', () => {
  const r = filterMedicalLawViolations('저희가 가장 좋은 병원입니다').filtered;
  // medicalLawFilter.ts:126 의 [/가장\s?좋은\s?병원/g, '전문적인 병원'] 은 유지
  assert.ok(!/가장\s?좋은\s?병원/.test(r), `자기 병원 찬양 차단 회귀: "${r}"`);
});

// ─────────────────────────────────────────────────────────────────────
// 의료광고법 본 95 규칙 무영향 회귀 가드
// ─────────────────────────────────────────────────────────────────────

test('의료광고법 본 차단 무영향: 최고/유일/완벽/100%/완치', () => {
  const cases: Array<[string, RegExp]> = [
    ['최고의 시술입니다', /최고의/],
    ['유일한 방법입니다', /유일한/],
    ['100% 만족합니다', /100\s?%/],
    ['넘버원 클리닉', /넘버원/],
    ['반드시 성공합니다', /반드시\s*성공/],
  ];
  for (const [input, originalPattern] of cases) {
    const r = filterMedicalLawViolations(input);
    assert.ok(r.replacedCount > 0, `의료광고법 본 차단 미동작: "${input}" → ${r.replacedCount} 변환`);
    assert.ok(!originalPattern.test(r.filtered), `차단 회귀: "${r.filtered}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// PR #248 invariant 유지 (어미 무작위 치환 폐기)
// ─────────────────────────────────────────────────────────────────────

test('PR #248: 어미 무작위 치환 폐기 invariant 유지', () => {
  const input = '치료가 좋습니다. 관리가 좋습니다. 결과가 좋습니다.';
  const r = filterOutputArtifacts(input);
  assert.ok(!/낫습니다/.test(r), 'PR #248 회귀');
  assert.ok(!/편입니다/.test(r), 'PR #248 회귀');
  assert.equal(r, input);
});

test('PR #248: AI_REPLACEMENTS 다른 패턴 유지 (이러한→이런)', () => {
  // 본 PR 의 Fix 1 (Tier 4 접속부사) / Fix 2 (Tier 2 중요합니다) 외 패턴은 그대로
  const r = filterOutputArtifacts('이러한 방법은 상기 내용과 동일한 효과를 줍니다.');
  assert.ok(!/이러한/.test(r), 'Tier 3 AI 패턴 회귀');
  assert.ok(!/상기/.test(r), 'Tier 3 AI 패턴 회귀');
  assert.ok(!/동일한/.test(r), 'Tier 3 AI 패턴 회귀');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
