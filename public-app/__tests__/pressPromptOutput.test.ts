/**
 * buildPressPrompt 출력 invariant — PR #196 wire-up 회귀 가드 (public-app).
 *
 * 보장: 7 카테고리 각각에 대해 buildPressPrompt 출력 (systemInstruction + prompt)
 *      안에 PRESS_CATEGORY_TONE[cat].tone substring + vocabulary 1개 이상 포함.
 *
 * 회귀 시나리오 차단:
 *   - pressPrompt.ts 의 `${buildPressCategoryToneBlock(req.category) || ''}` 라인 삭제
 *   - import 누락
 *   - category 인자 누락 (undefined 전달)
 *   - record 본문 변경 후 wire-up 깨짐
 *
 * PR #208 보고서가 "press 페이지 quartet press tone 미사용" 으로 오인했던 갭이
 * 실제로는 wire-up intact 였지만, 출력 substring 검증 invariant 가 없어 회귀
 * 가능성 잠재. 본 테스트로 fail-fast.
 *
 * next-app/__tests__/pressPromptOutput.test.ts 와 동일 케이스 — drift 0.
 */
import assert from 'node:assert/strict';
import { buildPressPrompt, type PressReleaseRequest } from '../lib/pressPrompt';
import { PRESS_CATEGORY_TONE } from '@winaid/blog-core';

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
console.log('\n>>> pressPromptOutput.test.ts (public-app)');

function buildSample(category: string): string {
  const req: PressReleaseRequest = {
    topic: '신규 디지털 장비 도입',
    hospitalName: 'WINAID',
    doctorName: '홍길동',
    doctorTitle: '대표원장',
    pressType: 'achievement',
    category,
    keywords: '',
    textLength: 1200,
  };
  const { systemInstruction, prompt } = buildPressPrompt(req);
  return `${systemInstruction || ''}\n${prompt || ''}`;
}

for (const cat of MEDICAL_CATEGORIES) {
  test(`buildPressPrompt(${cat}): 출력에 PRESS_CATEGORY_TONE.tone substring 포함`, () => {
    const merged = buildSample(cat);
    const tone = PRESS_CATEGORY_TONE[cat].tone;
    // 본문 일부 (앞 25자) substring 검증 — escape 안전한 substring 으로 매칭
    const probe = tone.slice(0, 25);
    assert.ok(
      merged.includes(probe),
      `${cat} tone substring 누락. 기대: "${probe}..."`,
    );
  });

  test(`buildPressPrompt(${cat}): 가이드 블록 헤더 "[${cat} 보도자료 톤 가이드]" 포함`, () => {
    const merged = buildSample(cat);
    assert.ok(
      merged.includes(`[${cat} 보도자료 톤 가이드]`),
      `${cat} 가이드 블록 헤더 누락 — buildPressCategoryToneBlock wire-up 갭`,
    );
  });

  test(`buildPressPrompt(${cat}): vocabulary 최소 1개 substring 포함`, () => {
    const merged = buildSample(cat);
    const vocab = PRESS_CATEGORY_TONE[cat].vocabulary;
    const matched = vocab.filter((v) => merged.includes(v));
    assert.ok(
      matched.length >= 1,
      `${cat} vocabulary 0건 매칭 (전체 ${vocab.length}개 중) — wire-up 깨짐 가능성`,
    );
  });
}

test('미감지 카테고리 (undefined): 가이드 블록 미렌더 — fallback 강제 안 함', () => {
  const merged = buildSample('');
  assert.ok(!merged.includes('보도자료 톤 가이드]'), 'fallback 강제 주입됨 (의도와 다름)');
});

test('미등록 카테고리 ("비뇨의학과"): 가이드 블록 미렌더', () => {
  const merged = buildSample('비뇨의학과');
  assert.ok(!merged.includes('[비뇨의학과 보도자료 톤 가이드]'), '미등록 카테고리 가이드 출력됨');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
