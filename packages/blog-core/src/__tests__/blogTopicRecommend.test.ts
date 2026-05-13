/**
 * buildBlogTopicRecommendPrompt invariant 테스트 (블로그 8).
 *
 * 보장:
 *  - 키워드 있음/없음 두 path 모두 prompt 생성
 *  - 7 카테고리 톤 substring 포함 (drift-zero)
 *  - 의료법 가드 포함
 *  - 다양성 가드 (5 intent) 포함
 *  - specificity (long-tail) 가드 포함
 *  - count default = 8 / count override 동작
 *  - 미등록 카테고리 fallback
 *  - responseSchema 에 intent enum 5종 포함
 */
import assert from 'node:assert/strict';
import {
  buildBlogTopicRecommendPrompt,
  TOPIC_INTENTS,
} from '../blogTopicRecommendPrompt';

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
console.log('\n>>> blogTopicRecommend.test.ts');

test('키워드 있음: prompt 생성 + 키워드 인용', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과', keyword: '임플란트' });
  assert.ok(r.prompt.includes('"임플란트"'), '키워드 인용 누락');
  assert.ok(r.prompt.includes('관련된 병원 마케팅용 블로그 주제'), '키워드 path 누락');
});

test('키워드 없음: 진료과 트렌드 path', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과' });
  assert.ok(r.prompt.includes('치과 분야에서 요즘 환자들'), '진료과 트렌드 path 누락');
});

test('drift-zero: 7 카테고리 모두 톤 section 포함 (등록 카테고리)', () => {
  for (const c of MEDICAL_CATEGORIES) {
    const r = buildBlogTopicRecommendPrompt({ category: c });
    assert.ok(r.prompt.includes(`[${c} 카테고리 톤]`), `[${c}] 톤 section 누락 — drift`);
    assert.ok(r.prompt.includes('어조:'), `[${c}] 어조 라인 누락`);
    assert.ok(r.prompt.includes('권장 어휘:'), `[${c}] 권장 어휘 라인 누락`);
    assert.ok(r.prompt.includes('금기 표현:'), `[${c}] 금기 표현 라인 누락`);
  }
});

test('의료법 가드 substring 포함 (양 path)', () => {
  for (const kw of ['임플란트', undefined]) {
    const r = buildBlogTopicRecommendPrompt({ category: '치과', keyword: kw });
    assert.ok(r.prompt.includes('의료광고법 준수 필수'), `[kw=${kw}] 의료법 가드 누락`);
    assert.ok(r.prompt.includes('과대광고'), `[kw=${kw}] 과대광고 키워드 누락`);
  }
});

test('다양성 가드: 5 intent 모두 prompt 에 명시', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과', keyword: 'x' });
  for (const intent of TOPIC_INTENTS) {
    assert.ok(r.prompt.includes(`- ${intent}:`), `intent "${intent}" 누락`);
  }
});

test('specificity 가드: long-tail 가이드 포함', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과', keyword: '임플란트' });
  assert.ok(r.prompt.includes('long-tail'), 'long-tail 가이드 누락');
  assert.ok(r.prompt.includes('흔한 단일 키워드 회피'), 'specificity 가드 누락');
});

test('count default = 8', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과' });
  assert.ok(r.prompt.includes('8개'), 'default count 8 미반영');
});

test('count override 동작', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과', count: 12 });
  assert.ok(r.prompt.includes('12개'), 'count override 미반영');
});

test('미등록 카테고리: 톤 section 없이 fallback prompt 생성', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '비뇨의학과' });
  assert.ok(!r.prompt.includes('[비뇨의학과 카테고리 톤]'), '미등록인데 톤 section 노출');
  // 의료법·다양성·specificity 가드는 그대로 (카테고리 무관)
  assert.ok(r.prompt.includes('의료광고법'), 'fallback 에서 의료법 가드 누락');
});

test('responseSchema: intent enum 5종 포함', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과' });
  const schema = r.responseSchema as {
    items?: { properties?: { intent?: { enum?: string[] } } };
  };
  const enumValues = schema.items?.properties?.intent?.enum;
  assert.ok(enumValues, 'intent enum 누락');
  assert.equal(enumValues!.length, 5);
  for (const intent of TOPIC_INTENTS) {
    assert.ok(enumValues!.includes(intent), `enum 에서 ${intent} 누락`);
  }
});

test('systemInstruction: 의료광고법 명시', () => {
  const r = buildBlogTopicRecommendPrompt({ category: '치과' });
  assert.ok(r.systemInstruction.includes('의료광고법'), 'systemInstruction 에 의료법 미명시');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
