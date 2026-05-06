/**
 * piiMask 단위 테스트 — Node.js 내장 assert (추가 의존성 없음).
 * 실행: cd packages/blog-core && npx tsx src/__tests__/piiMask.test.ts
 *
 * 커버리지:
 *   - 4 강도 (none / minimal / standard / aggressive) × 6 카테고리 (EMAIL/RRN/PHONE/NAME/CHART/ADDR)
 *   - false positive 회피 (의료 용어 / 일반 명사 denylist)
 *   - 결정적 치환 (같은 입력 → 같은 토큰)
 *   - 라운드트립 (mask → 시뮬레이션 → unmask → 원문 동일성)
 *   - 변형 토큰 복원 안 됨 (안전 방향)
 */

import assert from 'node:assert/strict';
import { maskPII, unmaskPII, DEFAULT_PII_MASKING_LEVEL } from '../piiMask';
import type { PIIMaskingLevel } from '../piiMask';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.error(`[FAIL] ${name}\n       ${msg}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 0. 기본 export / 상수
// ────────────────────────────────────────────────────────────────────────────

test('DEFAULT_PII_MASKING_LEVEL is "standard"', () => {
  assert.equal(DEFAULT_PII_MASKING_LEVEL, 'standard');
});

test('none 강도는 원문 그대로 반환', () => {
  const input = '환자 김철수님 010-1234-5678';
  const r = maskPII(input, 'none');
  assert.equal(r.masked, input);
  assert.equal(r.replacements.size, 0);
});

test('빈 문자열 입력', () => {
  const r = maskPII('', 'standard');
  assert.equal(r.masked, '');
  assert.equal(r.replacements.size, 0);
});

// ────────────────────────────────────────────────────────────────────────────
// 1. EMAIL (모든 강도 ≥ minimal 에서 적용)
// ────────────────────────────────────────────────────────────────────────────

(['minimal', 'standard', 'aggressive'] as PIIMaskingLevel[]).forEach((lv) => {
  test(`EMAIL — ${lv}: 단일 이메일 마스킹`, () => {
    const r = maskPII('연락처: hong@example.com 입니다.', lv);
    assert.match(r.masked, /\[EMAIL_1\]/);
    assert.equal(r.replacements.get('[EMAIL_1]'), 'hong@example.com');
  });
});

test('EMAIL — minimal: 의료 용어는 보존', () => {
  const r = maskPII('보톡스 시술 후 abc@x.co 로 연락주세요.', 'minimal');
  assert.ok(r.masked.includes('보톡스 시술'), '보톡스/시술 보존 실패');
  assert.match(r.masked, /\[EMAIL_1\]/);
});

// ────────────────────────────────────────────────────────────────────────────
// 2. RRN (주민등록번호)
// ────────────────────────────────────────────────────────────────────────────

(['minimal', 'standard', 'aggressive'] as PIIMaskingLevel[]).forEach((lv) => {
  test(`RRN — ${lv}: 하이픈 포함 패턴 마스킹`, () => {
    const r = maskPII('주민번호 900101-1234567', lv);
    assert.match(r.masked, /\[RRN_1\]/);
    assert.equal(r.replacements.get('[RRN_1]'), '900101-1234567');
  });
});

test('RRN — standard: 하이픈 없는 13자리 숫자도 매칭', () => {
  const r = maskPII('등록 9001011234567 확인', 'standard');
  assert.match(r.masked, /\[RRN_1\]/);
});

test('RRN — none 은 적용 안 됨', () => {
  const r = maskPII('900101-1234567', 'none');
  assert.equal(r.masked, '900101-1234567');
});

// ────────────────────────────────────────────────────────────────────────────
// 3. PHONE
// ────────────────────────────────────────────────────────────────────────────

(['minimal', 'standard', 'aggressive'] as PIIMaskingLevel[]).forEach((lv) => {
  test(`PHONE — ${lv}: 휴대폰 010-XXXX-XXXX`, () => {
    const r = maskPII('전화: 010-1234-5678', lv);
    assert.match(r.masked, /\[PHONE_1\]/);
    assert.equal(r.replacements.get('[PHONE_1]'), '010-1234-5678');
  });
});

test('PHONE — standard: 하이픈 없는 휴대폰', () => {
  const r = maskPII('연락 01012345678 부탁', 'standard');
  assert.match(r.masked, /\[PHONE_1\]/);
});

test('PHONE — standard: 지역번호 (02 / 0NN)', () => {
  const r1 = maskPII('병원 02-345-6789', 'standard');
  assert.match(r1.masked, /\[PHONE_1\]/);
  const r2 = maskPII('병원 031-123-4567', 'standard');
  assert.match(r2.masked, /\[PHONE_1\]/);
});

test('PHONE — false positive 차단: 일반 숫자열', () => {
  const r = maskPII('가격은 12345 원입니다', 'standard');
  assert.ok(!/\[PHONE_/.test(r.masked), 'PHONE 오탐');
});

// ────────────────────────────────────────────────────────────────────────────
// 4. NAME — standard (호칭 컨텍스트 동반 시)
// ────────────────────────────────────────────────────────────────────────────

test('NAME — standard: "김철수님" 호칭 후행', () => {
  const r = maskPII('김철수님 안녕하세요', 'standard');
  assert.match(r.masked, /\[NAME_1\]님/);
  assert.equal(r.replacements.get('[NAME_1]'), '김철수');
});

test('NAME — standard: "이영희 환자분" 호칭 분리 형태', () => {
  const r = maskPII('이영희 환자분께서 내원하셨습니다', 'standard');
  assert.match(r.masked, /\[NAME_1\] 환자분/);
  assert.equal(r.replacements.get('[NAME_1]'), '이영희');
});

test('NAME — standard: "환자 박민수" 라벨 선행', () => {
  const r = maskPII('환자 박민수 진료 시작', 'standard');
  assert.match(r.masked, /환자 \[NAME_1\]/);
});

test('NAME — standard: 일반 명사("환자분") 단독은 마스킹 안 함', () => {
  const r = maskPII('환자분께서 만족하셨습니다', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '환자분 단독 오탐');
});

test('NAME — false positive 회피: "남성 환자"', () => {
  const r = maskPII('60대 남성 환자가 내원하셨습니다', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"남성 환자" 오탐');
});

test('NAME — false positive 회피: "여성 환자분"', () => {
  const r = maskPII('40대 여성 환자분 상담', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"여성 환자분" 오탐');
});

test('NAME — false positive 회피: "보톡스 시술"', () => {
  const r = maskPII('보톡스 시술 후 관리 안내', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"보톡스" 오탐');
});

test('NAME — false positive 회피: "필러 환자"', () => {
  const r = maskPII('필러 환자분께 추천', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"필러" 오탐');
});

test('NAME — false positive 회피: "울쎄라 시술"', () => {
  const r = maskPII('울쎄라 시술 후기', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"울쎄라" 오탐');
});

test('NAME — false positive 회피: "라식 수술"', () => {
  const r = maskPII('라식 수술 비용', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"라식" 오탐');
});

test('NAME — false positive 회피: "원장님" 단독', () => {
  const r = maskPII('원장님께서 직접 시술합니다', 'standard');
  assert.ok(!/\[NAME_/.test(r.masked), '"원장님" 단독 오탐');
});

test('NAME — minimal 에서는 적용 안 됨', () => {
  const r = maskPII('김철수님께서 상담', 'minimal');
  assert.ok(!/\[NAME_/.test(r.masked), 'minimal 에서 NAME 적용됨');
});

// ────────────────────────────────────────────────────────────────────────────
// 5. CHART (차트번호 / 환자번호 / 등록번호)
// ────────────────────────────────────────────────────────────────────────────

test('CHART — standard: "차트번호 ABC-123"', () => {
  const r = maskPII('차트번호: ABC-123 확인', 'standard');
  assert.match(r.masked, /차트번호:?\s*\[CHART_1\]/);
  assert.equal(r.replacements.get('[CHART_1]'), 'ABC-123');
});

test('CHART — standard: "환자번호 12345"', () => {
  const r = maskPII('환자번호 12345 입니다', 'standard');
  assert.match(r.masked, /환자번호\s*\[CHART_1\]/);
});

test('CHART — minimal 에서는 적용 안 됨', () => {
  const r = maskPII('차트번호 ABC-123', 'minimal');
  assert.ok(!/\[CHART_/.test(r.masked), 'minimal 에서 CHART 적용됨');
});

// ────────────────────────────────────────────────────────────────────────────
// 6. ADDR — aggressive 에서만 적용
// ────────────────────────────────────────────────────────────────────────────

test('ADDR — aggressive: "서울특별시 강남구 역삼동"', () => {
  const r = maskPII('주소: 서울특별시 강남구 역삼동 123', 'aggressive');
  assert.match(r.masked, /\[ADDR_1\]/);
});

test('ADDR — aggressive: "경기도 성남시 분당구 정자로 99"', () => {
  const r = maskPII('병원 위치 경기도 성남시 분당구 정자로 99', 'aggressive');
  assert.match(r.masked, /\[ADDR_1\]/);
});

test('ADDR — standard 에서는 적용 안 됨', () => {
  const r = maskPII('서울특별시 강남구 역삼동', 'standard');
  assert.ok(!/\[ADDR_/.test(r.masked), 'standard 에서 ADDR 적용됨');
});

// ────────────────────────────────────────────────────────────────────────────
// 7. NAME aggressive — 호칭 없는 케이스
// ────────────────────────────────────────────────────────────────────────────

test('NAME aggressive: 호칭 없이 "김철수가" 패턴', () => {
  const r = maskPII('김철수가 방문했습니다', 'aggressive');
  assert.match(r.masked, /\[NAME_1\]가/);
});

test('NAME aggressive: 의료 용어("보톡스") 는 광범위 모드에서도 보존', () => {
  const r = maskPII('보톡스가 효과적입니다', 'aggressive');
  assert.ok(!/\[NAME_/.test(r.masked), '"보톡스" aggressive 오탐');
});

test('NAME aggressive: 일반 명사("환자가") 보존', () => {
  const r = maskPII('환자가 만족했습니다', 'aggressive');
  assert.ok(!/\[NAME_/.test(r.masked), '"환자" aggressive 오탐');
});

// ────────────────────────────────────────────────────────────────────────────
// 8. 결정적 치환 — 같은 입력 → 같은 토큰
// ────────────────────────────────────────────────────────────────────────────

test('결정적 치환: 같은 이메일 두 번 → 같은 토큰', () => {
  const r = maskPII('a@x.co 와 b@y.co 그리고 a@x.co', 'minimal');
  // a@x.co → [EMAIL_1], b@y.co → [EMAIL_2], 두 번째 a@x.co → [EMAIL_1] 재사용
  const occurrences = (r.masked.match(/\[EMAIL_1\]/g) || []).length;
  assert.equal(occurrences, 2, 'a@x.co 2회 등장 시 같은 토큰 재사용 안 됨');
  assert.equal(r.replacements.size, 2);
});

test('결정적 치환: 같은 이름 두 번 → 같은 토큰', () => {
  const r = maskPII('김철수님 그리고 다시 김철수님', 'standard');
  const occurrences = (r.masked.match(/\[NAME_1\]/g) || []).length;
  assert.equal(occurrences, 2, '같은 이름 두 번 → 같은 토큰 실패');
});

test('결정적 치환: 별개 카테고리 카운터 분리', () => {
  const r = maskPII('이메일 a@b.co 환자 김철수', 'standard');
  assert.equal(r.replacements.get('[EMAIL_1]'), 'a@b.co');
  assert.equal(r.replacements.get('[NAME_1]'), '김철수');
});

// ────────────────────────────────────────────────────────────────────────────
// 9. 라운드트립 (mask → unmask → 원문 동일성)
// ────────────────────────────────────────────────────────────────────────────

test('라운드트립: minimal 카테고리', () => {
  const orig = '연락처 hong@example.com / 010-1234-5678 / 900101-1234567';
  const { masked, replacements } = maskPII(orig, 'minimal');
  const restored = unmaskPII(masked, replacements);
  assert.equal(restored, orig);
});

test('라운드트립: standard (NAME + CHART 포함)', () => {
  const orig = '환자 김철수님 차트번호 ABC-123 진료 시작';
  const { masked, replacements } = maskPII(orig, 'standard');
  const restored = unmaskPII(masked, replacements);
  assert.equal(restored, orig);
});

test('라운드트립: aggressive (ADDR 포함)', () => {
  const orig = '주소 서울특별시 강남구 역삼동 환자 김철수님 010-1111-2222';
  const { masked, replacements } = maskPII(orig, 'aggressive');
  const restored = unmaskPII(masked, replacements);
  assert.equal(restored, orig);
});

test('라운드트립: LLM 응답에 토큰이 그대로 인용된 시뮬레이션', () => {
  // LLM 이 user prompt 의 토큰을 출력에 그대로 포함하는 케이스.
  const { masked, replacements } = maskPII('환자 김철수님 010-1234-5678 안내', 'standard');
  // 가상 LLM 응답: "환자 [NAME_1]님께 [PHONE_1] 로 연락드렸습니다"
  const llmResp = `환자 ${[...replacements.entries()].find(([_, v]) => v === '김철수')![0]}님께 ${[...replacements.entries()].find(([_, v]) => v === '010-1234-5678')![0]} 로 연락드렸습니다`;
  const restored = unmaskPII(llmResp, replacements);
  assert.equal(restored, '환자 김철수님께 010-1234-5678 로 연락드렸습니다');
  // masked 가 사용되지 않은 변수 경고 회피용
  assert.ok(masked.length > 0);
});

// ────────────────────────────────────────────────────────────────────────────
// 10. 변형 토큰 — 안전 방향 (복원 안 됨)
// ────────────────────────────────────────────────────────────────────────────

test('변형 토큰: 소문자화된 토큰은 복원 안 됨 (안전 방향)', () => {
  const { replacements } = maskPII('김철수님', 'standard');
  // LLM 이 [NAME_1] → [name_1] 로 변형한 응답
  const llmResp = '안녕하세요 [name_1]님';
  const restored = unmaskPII(llmResp, replacements);
  // 변형 토큰은 그대로 노출 — 환자명 미복원
  assert.ok(restored.includes('[name_1]'));
  assert.ok(!restored.includes('김철수'));
});

test('변형 토큰: 공백 삽입된 토큰은 복원 안 됨', () => {
  const { replacements } = maskPII('a@x.co 보냄', 'minimal');
  const llmResp = '주소 [ EMAIL_1 ] 로 회신';
  const restored = unmaskPII(llmResp, replacements);
  assert.ok(restored.includes('[ EMAIL_1 ]'));
  assert.ok(!restored.includes('a@x.co'));
});

test('변형 토큰: 정확 일치만 복원 (10번이 1번보다 먼저 매칭)', () => {
  // 10개 이상의 NAME 토큰이 있을 때 [NAME_1] 이 [NAME_10] 의 부분 매칭으로
  // 잘못 치환되지 않는지 확인.
  const replacements = new Map<string, string>();
  for (let i = 1; i <= 12; i += 1) replacements.set(`[NAME_${i}]`, `이름${i}`);
  const llmText = '[NAME_1] 그리고 [NAME_10] 과 [NAME_12]';
  const restored = unmaskPII(llmText, replacements);
  assert.equal(restored, '이름1 그리고 이름10 과 이름12');
});

// ────────────────────────────────────────────────────────────────────────────
// 11. 통합 — 블로그 라우트 시나리오
// ────────────────────────────────────────────────────────────────────────────

test('통합: 블로그 review 시나리오 (이름 + 전화 + 의료 용어 보존)', () => {
  const draft = '환자 김철수님(010-1234-5678)께서 보톡스 시술 후 만족하셨습니다.';
  const { masked, replacements } = maskPII(draft, DEFAULT_PII_MASKING_LEVEL);
  // PII 마스킹
  assert.match(masked, /\[NAME_1\]/);
  assert.match(masked, /\[PHONE_1\]/);
  // 의료 용어 보존
  assert.ok(masked.includes('보톡스 시술'), '보톡스 보존 실패');
  // 라운드트립
  assert.equal(unmaskPII(masked, replacements), draft);
});

// ────────────────────────────────────────────────────────────────────────────
// 결과
// ────────────────────────────────────────────────────────────────────────────

console.log(`\n=== piiMask test summary ===`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.log('\n--- failures ---');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
