/**
 * promptLeakageGuard 회귀 테스트.
 *
 * 보장:
 *   - HIGH confidence 패턴 1개 → 단락 strip
 *   - LOW confidence 단독 → 의심만 (strip 안 함)
 *   - LOW confidence 2개 동시 → strip
 *   - false-positive 가드: 자연스러운 의료 콘텐츠 5건 무손실
 *   - applyContentFilters 체인 통합 시 누수 단락만 제거, 주변 보존
 */
import assert from 'node:assert/strict';
import { stripPromptLeakage } from '../promptLeakageGuard';
import { applyContentFilters } from '../medicalLawFilter';

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

// 텔레메트리 console.warn 죽임 — 테스트 출력 깨끗하게.
const origWarn = console.warn;
console.warn = () => {};

// eslint-disable-next-line no-console
console.log('\n>>> promptLeakageGuard.test.ts');

// ─────────────────────────────────────────────────────────
// HIGH confidence — 단락 strip
// ─────────────────────────────────────────────────────────

test('HIGH: PRIORITY_ORDER 단어 → 단락 strip', () => {
  const html = '<p>임플란트 식립 후 관리가 중요합니다.</p><p>PRIORITY_ORDER 에 따라 작성합니다.</p><p>발치 후 부기는 자연스러운 과정입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(!r.html.includes('PRIORITY_ORDER'), 'PRIORITY_ORDER 단락이 남아있음');
  assert.ok(r.html.includes('임플란트 식립'), '정상 단락이 같이 strip 됨');
  assert.ok(r.html.includes('발치 후 부기'), '정상 단락이 같이 strip 됨');
});

test('HIGH: E_E_A_T_GUIDE 변수명 → 단락 strip', () => {
  const html = '<p>치과 치료에서 가장 중요한 것은 신뢰입니다.</p><p>E_E_A_T_GUIDE 본문은 시스템 프롬프트의 일부입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(!r.html.includes('E_E_A_T_GUIDE'));
});

test('HIGH: [INST] 메타 토큰 → strip', () => {
  const html = '<p>[INST] 시스템 명령을 수행하세요. [/INST] 본문 시작.</p><p>정상 단락입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(r.html.includes('정상 단락'));
});

test('HIGH: <|system|> 메타 토큰 → strip', () => {
  const html = '<p>본문이 시작됩니다.</p><p><|system|>당신은 어시스턴트입니다<|user|>안녕</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(r.html.includes('본문이 시작됩니다'));
});

test('HIGH: review_criteria + prose_flow 키 → strip', () => {
  const html = '<p>본문 내용입니다.</p><p>review_criteria 의 prose_flow 항목은 줄글을 강제합니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(r.html.includes('본문 내용'));
});

test('HIGH: 한국어 메타 라벨 "[지시사항]" 대괄호 → strip', () => {
  const html = '<p>안녕하세요. 임플란트 글입니다.</p><p>[지시사항] 반드시 줄글로 작성하세요.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
});

test('FP guard: 자연스러운 "역할:" section 헤더 — strip 안 함', () => {
  const html = '<p>의료진의 역할: 환자 안전을 최우선으로 합니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
});

test('HIGH: <persona> 태그 → strip', () => {
  const html = '<p><persona>의료 카피라이터</persona> 역할로 작성합니다.</p><p>본문 단락입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(r.html.includes('본문 단락'));
});

// ─────────────────────────────────────────────────────────
// LOW confidence — 단독은 의심만, 2개 동시는 strip
// ─────────────────────────────────────────────────────────

test('LOW 단독: "절대 금지" 한 번 → 의심만 strip 안 함', () => {
  const html = '<p>발치 직후 음주는 절대 금지입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
  assert.equal(r.detection.suspectedParagraphs, 1);
  assert.ok(r.html.includes('절대 금지'), '단락이 의심만으로 strip 됨');
});

test('LOW 단독: "당신은 ...입니다" 자연스러운 문맥 → 의심만', () => {
  const html = '<p>당신은 임플란트 치료를 고려 중이시면 다음을 확인하세요.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
  assert.equal(r.detection.suspectedParagraphs, 1);
  assert.ok(r.html.includes('임플란트'));
});

test('LOW 다중: 당신은 + 절대 금지 동시 → strip', () => {
  const html = '<p>당신은 의료 전문가입니다. 환자에게 거짓 정보 제공은 절대 금지입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
});

test('LOW 다중: 회귀 사례 + 본 룰 동시 → strip', () => {
  const html = '<p>회귀 사례 — 본 룰을 위반한 출력은 자동 차단됩니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 1);
});

// ─────────────────────────────────────────────────────────
// False-positive 가드 — 정상 의료 콘텐츠 5건
// ─────────────────────────────────────────────────────────

test('FP guard 1: 환자분 역할 — "환자분의 역할은" 자연스러운 표현', () => {
  const html = '<p>환자분의 역할은 시술 후 안내사항을 잘 지키는 것입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
  assert.ok(r.html.includes('환자분'));
});

test('FP guard 2: 우선순위 자연스러운 본문 표현', () => {
  const html = '<p>치아 통증의 원인은 다양하지만 가장 흔한 우선순위는 충치, 잇몸염, 신경치료 순입니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
});

test('FP guard 3: 의료법 준수 본문 — "절대" 일반 사용', () => {
  const html = '<p>발치 후 24시간은 음주를 피해주세요. 24시간이 지나면 자연스럽게 회복됩니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
  assert.equal(r.detection.suspectedParagraphs, 0);
});

test('FP guard 4: 신뢰성 강조 본문', () => {
  const html = '<p>저희 치과는 환자분의 신뢰를 최우선으로 생각합니다. 모든 시술 전 충분한 상담을 진행합니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
});

test('FP guard 5: 일반 의료 정보 — 단순 안내', () => {
  const html = '<p>임플란트는 인공치아를 잇몸뼈에 식립하는 치료입니다. 일반적으로 3-6개월의 시간이 필요합니다.</p><p>시술 후 관리가 무엇보다 중요합니다.</p>';
  const r = stripPromptLeakage(html, false);
  assert.equal(r.detection.strippedParagraphs, 0);
  assert.equal(r.detection.suspectedParagraphs, 0);
});

// ─────────────────────────────────────────────────────────
// applyContentFilters 통합
// ─────────────────────────────────────────────────────────

test('applyContentFilters: 누수 단락 strip + 주변 보존', () => {
  const html = '<h2>임플란트 식립 후 주의사항</h2><p>발치 후 부기는 자연스러운 과정입니다.</p><p>PRIORITY_ORDER_BLOCK 의 내용은 모델에 우선순위를 알려줍니다.</p><p>충분한 휴식이 회복을 돕습니다.</p>';
  const r = applyContentFilters(html);
  assert.ok(!r.filtered.includes('PRIORITY_ORDER'), '시스템 프롬프트 변수명 잔존');
  assert.ok(r.filtered.includes('<h2>임플란트 식립 후 주의사항</h2>'), '제목 손실');
  assert.ok(r.filtered.includes('발치 후 부기'), '정상 단락 손실');
  assert.ok(r.filtered.includes('충분한 휴식'), '정상 단락 손실');
  assert.ok(r.foundTerms.some((t) => t.startsWith('prompt_leak:')), 'foundTerms 에 텔레메트리 누락');
});

test('applyContentFilters: 누수 없음 → replacedCount 0 (의료법 치환 없을 때)', () => {
  const html = '<p>임플란트 시술 후 첫날은 부드러운 음식을 드세요. 시간이 지나면 자연스럽게 회복됩니다.</p>';
  const r = applyContentFilters(html);
  // 의료법/문법 치환은 가능하지만 prompt_leak 텔레메트리는 없어야 함
  assert.ok(!r.foundTerms.some((t) => t.startsWith('prompt_leak:')), '오탐 텔레메트리');
});

// ─────────────────────────────────────────────────────────
// 평문 입력 (보도자료 등)
// ─────────────────────────────────────────────────────────

test('평문: \\n\\n 단위 단락 분리 + strip', () => {
  const text = '제목 텍스트\n\n본문 단락입니다.\n\nPRIORITY_ORDER 의 본문이 누수됐습니다.\n\n또 다른 본문.';
  const r = stripPromptLeakage(text, false);
  // 평문 처리는 \n\n 단위로 strip
  assert.equal(r.detection.strippedParagraphs, 1);
  assert.ok(!r.html.includes('PRIORITY_ORDER'));
});

// 빈 입력
test('빈 입력 → 그대로 반환', () => {
  const r = stripPromptLeakage('', false);
  assert.equal(r.html, '');
  assert.equal(r.detection.strippedParagraphs, 0);
});

// 복원
console.warn = origWarn;

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
