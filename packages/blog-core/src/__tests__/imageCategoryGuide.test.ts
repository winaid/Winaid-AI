/**
 * 카테고리 이미지 가이드 invariant 테스트 (블로그 7).
 *
 * 실행: tsx packages/blog-core/src/__tests__/imageCategoryGuide.test.ts
 * (next-app/package.json test glob 으로 자동 실행)
 *
 * 보장:
 *   - 7개 카테고리 모두 CATEGORY_IMAGE_GUIDES + categoryHints 매핑 존재 (drift 0)
 *   - 가이드 필드 3개(setting/subject/style) 모두 비어있지 않음
 *   - buildImagePrompt 출력에 카테고리별 가이드 토큰 포함
 *   - 미등록 카테고리 → guideBlock 미주입 (기존 fallback 동작 보존)
 *   - 두 카테고리(치과 vs 한의원) substantially 다름
 */
import assert from 'node:assert/strict';
import { CATEGORY_IMAGE_GUIDES, buildImagePrompt } from '../blogPrompt';

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

function basePromptArgs(category: string) {
  return {
    altText: 'a calm scene of a patient and a doctor having consultation',
    imageStyle: 'photo' as const,
    category,
    topic: '진료 안내',
  };
}

// eslint-disable-next-line no-console
console.log('\n>>> imageCategoryGuide.test.ts');

test('drift-zero: 7개 카테고리 모두 CATEGORY_IMAGE_GUIDES 매핑 존재', () => {
  for (const c of MEDICAL_CATEGORIES) {
    assert.ok(CATEGORY_IMAGE_GUIDES[c], `[${c}] CATEGORY_IMAGE_GUIDES 누락 — drift`);
  }
});

test('가이드 필드 3개 모두 비어있지 않음', () => {
  for (const c of MEDICAL_CATEGORIES) {
    const g = CATEGORY_IMAGE_GUIDES[c];
    assert.ok(g.setting.length >= 10, `[${c}] setting 너무 짧음`);
    assert.ok(g.subject.length >= 10, `[${c}] subject 너무 짧음`);
    assert.ok(g.style.length >= 10, `[${c}] style 너무 짧음`);
  }
});

test('buildImagePrompt: 치과 출력에 categoryHint + setting/subject/style 토큰 포함', () => {
  const prompt = buildImagePrompt(basePromptArgs('치과'));
  // categoryHints[치과] 의 핵심 키워드
  assert.ok(prompt.includes('dental clinic') || prompt.includes('dental office'), 'categoryHint 누락');
  // CATEGORY_IMAGE_GUIDES.치과 의 핵심 키워드
  assert.ok(prompt.includes('dental operatory'), 'setting 누락');
  assert.ok(prompt.includes('Korean adult patient'), 'subject 누락');
  assert.ok(prompt.includes('warm natural light'), 'style 누락');
});

test('buildImagePrompt: 한의원 출력에 한방 특화 가이드 포함', () => {
  const prompt = buildImagePrompt(basePromptArgs('한의원'));
  assert.ok(prompt.includes('Korean oriental medicine clinic'), 'categoryHint(한의원) 누락');
  assert.ok(prompt.includes('traditional medicine clinic with wood'), 'setting(한방 특화) 누락');
  assert.ok(prompt.includes('hanui practitioner'), 'subject(한의 의료진) 누락');
});

test('차별화: 치과 vs 한의원 프롬프트 substantially 다름', () => {
  const dental = buildImagePrompt(basePromptArgs('치과'));
  const korean = buildImagePrompt(basePromptArgs('한의원'));
  assert.notEqual(dental, korean);
  assert.ok(!dental.includes('wood accents'), '치과에 한방 키워드 오염');
  assert.ok(!korean.includes('dental operatory'), '한의원에 치과 키워드 오염');
});

test('미등록 카테고리: guideBlock 미주입 — fallback subjectHint 만 사용', () => {
  const prompt = buildImagePrompt(basePromptArgs('비뇨의학과'));
  // fallback subjectHint
  assert.ok(prompt.includes('Korean medical clinic interior'), 'fallback subjectHint 누락');
  // CATEGORY_IMAGE_GUIDES 토큰 미포함 — drift 0
  assert.ok(!prompt.includes('dental operatory'), '치과 토큰 오염');
  assert.ok(!prompt.includes('wood accents'), '한의원 토큰 오염');
});

test('removed aliases 회귀: 한방·이비인후과·소아과·산부인과 → fallback', () => {
  // 7개로 정합되면서 제거된 4개는 미등록 카테고리로 빠짐 → fallback subjectHint 사용
  for (const removed of ['한방', '이비인후과', '소아과', '산부인과']) {
    const prompt = buildImagePrompt(basePromptArgs(removed));
    assert.ok(
      prompt.includes('Korean medical clinic interior'),
      `[${removed}] fallback 미적용 — 가이드 정합 회귀`,
    );
  }
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
