/**
 * medicalLawNormalize 단위 테스트.
 *
 * 실행: tsx packages/blog-core/src/__tests__/medicalLawNormalize.test.ts
 * (next-app/package.json 의 test glob 으로 자동 실행)
 *
 * 보장: 우회 패턴 5종이 정규화 후 동일 키워드로 수렴, 화이트리스트는 무변형.
 */
import assert from 'node:assert/strict';
import { normalizeForMedicalAdMatch } from '../medicalLawNormalize';

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
console.log('\n>>> medicalLawNormalize.test.ts');

test('NFC: 자모 분리된 텍스트는 보존되지 않은 형태 그대로 통과 (NFC 결과)', () => {
  // '최' = U+CD5C (precomposed). 분리 형태 'ㅊ'+'ㅗ'+'ㅣ' 는 NFC 후 합쳐짐 (단 모음 ㅗ+ㅣ→ㅚ).
  const input = '초ᅵㄱ';
  const out = normalizeForMedicalAdMatch(input);
  assert.ok(out.length < input.length, `NFC 후 길이가 줄어야 함 (실측 ${out.length})`);
});

test('Zero-width: U+200B (zero-width space) 제거', () => {
  assert.equal(normalizeForMedicalAdMatch('최​고'), '최고');
});

test('Zero-width: U+200C / U+200D / U+FEFF / U+2060 / U+180E 제거', () => {
  assert.equal(normalizeForMedicalAdMatch('완‌벽'), '완벽');
  assert.equal(normalizeForMedicalAdMatch('완‍벽'), '완벽');
  assert.equal(normalizeForMedicalAdMatch('완﻿벽'), '완벽');
  assert.equal(normalizeForMedicalAdMatch('완⁠벽'), '완벽');
  assert.equal(normalizeForMedicalAdMatch('완᠎벽'), '완벽');
});

test('호모글리프: 로마숫자 ⅽⅼⅰⅽ → clic', () => {
  assert.equal(normalizeForMedicalAdMatch('ⅽⅼⅰⅽ'), 'clic');
});

test('호모글리프: 키릴 а/е/о 등 → a/e/o', () => {
  assert.equal(normalizeForMedicalAdMatch('реrfect'), 'perfect');
});

test('전각 영숫자 → 반각', () => {
  assert.equal(normalizeForMedicalAdMatch('Ａ급'), 'A급');
  assert.equal(normalizeForMedicalAdMatch('１００％'), '100％');
});

test('전각 공백 (U+3000) → 반각 공백', () => {
  assert.equal(normalizeForMedicalAdMatch('최　고'), '최 고');
});

test('다중 공백 → 단일 공백', () => {
  assert.equal(normalizeForMedicalAdMatch('최     고'), '최 고');
  assert.equal(normalizeForMedicalAdMatch('완벽\t\t치료'), '완벽 치료');
});

test('복합 우회: zero-width + 전각 + 호모글리프 한 문장', () => {
  const input = '저희는​ Ａ급​ рerfect　　치료를 제공합니다';
  const out = normalizeForMedicalAdMatch(input);
  assert.equal(out, '저희는 A급 perfect 치료를 제공합니다');
});

test('정상 텍스트 무변형 (오탐 회귀 가드)', () => {
  const inputs = [
    '저희 병원은 안전한 환경에서 진료합니다.',
    '최신 설비로 검진을 진행합니다.',
    '완전히 새로운 시스템을 도입했습니다.',
  ];
  for (const s of inputs) {
    assert.equal(normalizeForMedicalAdMatch(s), s, `정상 텍스트 변형됨: ${s}`);
  }
});

test('빈 문자열 / undefined 처리', () => {
  assert.equal(normalizeForMedicalAdMatch(''), '');
  // @ts-expect-error — null/undefined 입력 가드 확인
  assert.equal(normalizeForMedicalAdMatch(null), null);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
