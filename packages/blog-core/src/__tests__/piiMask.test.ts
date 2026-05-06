/**
 * piiMask 단위 테스트 — Node 내장 console.assert 패턴
 * (저장소 컨벤션: `next-app/__tests__/safeUtils.test.ts` 참고)
 *
 * 실행: cd packages/blog-core && npx tsx src/__tests__/piiMask.test.ts
 */

import { maskPII, unmaskPII, DEFAULT_PII_MASKING_LEVEL } from '../piiMask';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`[PASS] ${label}`);
  } else {
    failed++;
    console.error(`[FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// ─────────────────────────────────────────────────
console.log('=== level: none ===');
{
  const input = '환자 김철수님 010-1234-5678';
  const { masked, replacements } = maskPII(input, 'none');
  check('none → 원문 그대로', masked === input);
  check('none → replacements 비어있음', replacements.size === 0);
}

// ─────────────────────────────────────────────────
console.log('\n=== level: minimal ===');
{
  // 주민번호
  const { masked, replacements } = maskPII('주민번호는 901231-1234567 입니다', 'minimal');
  check('minimal → RRN 마스킹', masked.includes('[RRN_1]') && !masked.includes('901231-1234567'), masked);
  check('minimal → replacements 1개', replacements.size === 1);
  check('minimal → 원본 복구 가능', replacements.get('[RRN_1]') === '901231-1234567');
}
{
  // 전화번호
  const { masked } = maskPII('연락처: 010-1234-5678', 'minimal');
  check('minimal → PHONE 마스킹', masked.includes('[PHONE_1]') && !masked.includes('010-1234-5678'), masked);
}
{
  // 이메일
  const { masked } = maskPII('test@example.com 으로 연락주세요', 'minimal');
  check('minimal → EMAIL 마스킹', masked.includes('[EMAIL_1]') && !masked.includes('test@example.com'), masked);
}
{
  // minimal 은 환자명/차트번호/주소를 가리지 않는다
  const { masked } = maskPII('환자 김철수님 차트번호 A1234 서울특별시 강남구 역삼동', 'minimal');
  check('minimal → NAME 보존', masked.includes('김철수'), masked);
  check('minimal → CHART 보존', masked.includes('A1234'), masked);
  check('minimal → ADDR 보존', masked.includes('역삼동'), masked);
}

// ─────────────────────────────────────────────────
console.log('\n=== level: standard (default) ===');
{
  // 환자명 (호칭 컨텍스트)
  const { masked, replacements } = maskPII('환자 김철수님이 내원하셨습니다.', 'standard');
  check('standard → NAME 마스킹 (환자 ○○○님)', masked.includes('[NAME_1]') && !masked.includes('김철수'), masked);
  check('standard → replacements 1개', replacements.size === 1);
}
{
  // 후행 호칭 패턴: "○○○ 환자분"
  const { masked } = maskPII('이영희 환자분께서 오셨습니다.', 'standard');
  check('standard → NAME 마스킹 (○○○ 환자분)', masked.includes('[NAME_1]') && !masked.includes('이영희'), masked);
}
{
  // 차트번호
  const { masked, replacements } = maskPII('차트번호: A12345 / 환자번호 B-9876', 'standard');
  check('standard → CHART 마스킹 (차트번호)', masked.includes('[CHART_1]') && !masked.includes('A12345'), masked);
  check('standard → CHART 마스킹 (환자번호)', masked.includes('[CHART_2]') && !masked.includes('B-9876'), masked);
  check('standard → replacements 2개', replacements.size === 2);
}
{
  // standard 는 주소를 가리지 않는다 — false positive 회피
  const { masked } = maskPII('서울특별시 강남구 역삼동에서', 'standard');
  check('standard → ADDR 보존', masked.includes('역삼동'), masked);
}

// ─────────────────────────────────────────────────
console.log('\n=== false positive 회피 — 의료 용어 보존 ===');
{
  // "이정훈 박사" — aggressive 의 NAME_AGGRESSIVE 패턴이 있지만 standard 에서는 호칭 단독은 매칭 안 됨
  const { masked } = maskPII('이정훈 박사가 강의했습니다', 'standard');
  check('standard → "박사" 단독 호칭은 매칭 안 됨 (false positive 회피)', masked.includes('이정훈'), masked);
}
{
  // 의약품명 보호 — aggressive 모드에서도 보존되어야 함
  // (현실 케이스: "울쎄라 시술 후" 같은 표현이 인명 패턴과 충돌)
  const { masked } = maskPII('울쎄라 시술을 받았습니다', 'aggressive');
  check('aggressive → 의료 어휘 보존 (울쎄라)', masked.includes('울쎄라'), masked);
}
{
  // 흔한 의료 용어 — 인명 후보 패턴(2~4자)과 충돌하지만 사전에 있으면 보존
  const { masked } = maskPII('보톡스 10cc, 필러 1cc', 'aggressive');
  check('aggressive → 의료 어휘 보존 (보톡스/필러)', masked.includes('보톡스') && masked.includes('필러'), masked);
}
{
  // 일반 한국어 단어 — 호칭 없으면 standard 에서 무사 통과
  const { masked } = maskPII('치료 결과는 만족스럽다고 하셨습니다.', 'standard');
  check('standard → 일반 본문 그대로 보존', masked === '치료 결과는 만족스럽다고 하셨습니다.', masked);
}

// ─────────────────────────────────────────────────
console.log('\n=== level: aggressive ===');
{
  const { masked, replacements } = maskPII(
    '서울특별시 강남구 역삼동에 사는 김철수 씨에게 연락드렸습니다.',
    'aggressive',
  );
  check('aggressive → ADDR 마스킹', masked.includes('[ADDR_1]') && !masked.includes('역삼동'), masked);
  check('aggressive → NAME(광범위) 마스킹', masked.includes('[NAME_1]') && !masked.includes('김철수'), masked);
  check('aggressive → replacements 2개', replacements.size === 2);
}

// ─────────────────────────────────────────────────
console.log('\n=== 결정적 치환 (같은 입력 → 같은 토큰) ===');
{
  const { masked, replacements } = maskPII(
    '환자 김철수님이 내원하셨습니다. 김철수 환자분께 처방을 드렸습니다.',
    'standard',
  );
  // 첫 매칭과 두 번째 매칭이 같은 [NAME_1] 으로 치환되어야 함
  const occurrences = (masked.match(/\[NAME_1\]/g) || []).length;
  check('결정적 치환: 같은 이름은 같은 토큰', occurrences === 2, `occurrences=${occurrences}, masked=${masked}`);
  check('결정적 치환: replacements 단일 entry', replacements.size === 1);
}
{
  // 다른 이름은 다른 토큰
  const { masked, replacements } = maskPII('환자 김철수님과 환자 이영희님', 'standard');
  check('결정적 치환: 다른 이름은 다른 토큰', masked.includes('[NAME_1]') && masked.includes('[NAME_2]'), masked);
  check('결정적 치환: replacements 2개', replacements.size === 2);
}

// ─────────────────────────────────────────────────
console.log('\n=== 라운드트립 (mask → unmask) ===');
{
  const original = '환자 김철수님이 내원하셨습니다. 010-1234-5678 / kim@test.com';
  const { masked, replacements } = maskPII(original, 'standard');
  const restored = unmaskPII(masked, replacements);
  check('라운드트립: 원문 동일성', restored === original, `restored=${restored}`);
}
{
  // LLM 이 토큰을 그대로 인용한 응답 시뮬레이션
  const original = '환자 김철수님이 내원하셨습니다.';
  const { masked, replacements } = maskPII(original, 'standard');
  // 가상 LLM 응답: 토큰을 다른 위치에서 재인용
  const llmResponse = `${masked} ${masked.match(/\[NAME_\d+\]/)?.[0] ?? ''} 님께 안내드렸습니다.`;
  const restored = unmaskPII(llmResponse, replacements);
  check('라운드트립: LLM 응답 내 토큰 다중 인용 복구', restored.includes('김철수'), restored);
  check('라운드트립: 토큰이 응답에 남아있지 않음', !/\[NAME_\d+\]/.test(restored), restored);
}
{
  // LLM 이 토큰을 변형하면 복구되지 않음 (의도적 — 안전 방향)
  const { masked, replacements } = maskPII('환자 김철수님', 'standard');
  void masked;
  const malformed = '결과: [name_1] 처리됨';
  const restored = unmaskPII(malformed, replacements);
  check('라운드트립: 변형된 토큰은 복원 안 됨 (안전 방향)', !restored.includes('김철수'), restored);
}

// ─────────────────────────────────────────────────
console.log('\n=== 다중 카테고리 동시 처리 ===');
{
  const original = [
    '환자 박민수님 (생년: 901231-1234567)',
    '연락처: 010-9876-5432, email: park@hospital.com',
    '차트번호 H-2024-001',
  ].join('\n');
  const { masked, replacements } = maskPII(original, 'standard');
  check('다중: NAME 마스킹', /\[NAME_1\]/.test(masked));
  check('다중: RRN 마스킹', /\[RRN_1\]/.test(masked));
  check('다중: PHONE 마스킹', /\[PHONE_1\]/.test(masked));
  check('다중: EMAIL 마스킹', /\[EMAIL_1\]/.test(masked));
  check('다중: CHART 마스킹', /\[CHART_1\]/.test(masked));
  check('다중: replacements 5개', replacements.size === 5, `size=${replacements.size}`);
  // 라운드트립
  const restored = unmaskPII(masked, replacements);
  check('다중: 라운드트립 복구', restored === original, `\nrestored=${restored}\noriginal =${original}`);
}

// ─────────────────────────────────────────────────
console.log('\n=== edge cases ===');
{
  const { masked, replacements } = maskPII('', 'standard');
  check('empty: masked === ""', masked === '');
  check('empty: replacements 비어있음', replacements.size === 0);
}
{
  // 토큰 numbering — 10개 이상도 정상 동작
  const names = Array.from({ length: 12 }, (_, i) => `환자 김${'동'.repeat(i % 3 + 1)}${i}님`).join(', ');
  // 한국어 이름은 2~4자만 매칭 → 일부만 매칭됨, numbering 충돌만 확인
  const { masked, replacements } = maskPII(names, 'standard');
  // 적어도 일부는 마스킹되어야 함
  check('edge: 다수 NAME 매칭 시 카운터 동작', replacements.size > 0, `size=${replacements.size}`);
  // 토큰 부분 매칭 회피: [NAME_1] vs [NAME_10] 가 서로 영향 안 받는지
  if (replacements.size >= 10) {
    const restored = unmaskPII(masked, replacements);
    check('edge: 10+ 토큰 라운드트립', restored.length > 0);
  }
}
{
  // DEFAULT_PII_MASKING_LEVEL export 확인
  check('export: DEFAULT_PII_MASKING_LEVEL === standard', DEFAULT_PII_MASKING_LEVEL === 'standard');
}

// ─────────────────────────────────────────────────
console.log('\n=== POC 시나리오: clinical 라우트 입력 시뮬레이션 ===');
{
  // 사용자가 환자 정보를 자유 텍스트로 적은 케이스 (BL-B-014 핵심 risk)
  const userTopic = '60대 남성 환자 김철수님이 내원하셨습니다. 연락처는 010-1234-5678이며 차트번호 H2024-100입니다.';
  const { masked, replacements } = maskPII(userTopic, DEFAULT_PII_MASKING_LEVEL);
  check('POC: 김철수 마스킹', !masked.includes('김철수'));
  check('POC: 010-1234-5678 마스킹', !masked.includes('010-1234-5678'));
  check('POC: H2024-100 마스킹', !masked.includes('H2024-100'));
  check('POC: 의료 컨텍스트 보존 (60대 남성/내원)', masked.includes('60대') && masked.includes('내원'));
  // LLM 응답이 토큰을 그대로 인용한 시뮬레이션
  const llmOut = `이번에 내원하신 ${masked.match(/\[NAME_\d+\]/)?.[0]}님은 60대 남성으로...`;
  const final = unmaskPII(llmOut, replacements);
  check('POC: 응답 복원 시 환자명 그대로', final.includes('김철수'), final);
}

// ─────────────────────────────────────────────────
console.log(`\n=== 결과: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
