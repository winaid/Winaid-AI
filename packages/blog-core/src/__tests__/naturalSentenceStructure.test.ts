/**
 * blog-quality-1 회귀 방지 테스트 (자연스러운 문장 구조).
 *
 * 보장:
 *  - filterOutputArtifacts: 어미 무작위 치환 폐기 (입력 보존)
 *  - COMMON_WRITING_STYLE: <natural_sentence_structure> 본문 + 4 섹션 (A·B·C·D) 포함
 *  - 7 빌더 모두 자연 문장 구조 가이드 도달 (5빌더 안전망 패턴 + refine + dm)
 *  - buildBlogReviewPrompt: review_criteria 10번 natural_sentence_structure 항목 존재
 *  - 기존 invariant 번호 (6/7/8/9) drift-zero 유지
 *  - 의료광고법 본 규칙 (filterMedicalLawViolations) 무영향
 */
import assert from 'node:assert/strict';
import {
  COMMON_WRITING_STYLE,
  buildOutlinePrompt,
  buildSectionFromOutlinePrompt,
  buildBlogPromptV3,
  buildBlogSectionPromptV3,
  buildBlogReviewPrompt,
} from '../blogPrompt';
import { buildRefineSelectionPrompt } from '../refineSelectionPrompt';
import { buildDmPrompt } from '../dmPrompt';
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

const baseReq = {
  topic: '발치 후 주의사항',
  category: '치과',
  textLength: 2000,
} as const;

// eslint-disable-next-line no-console
console.log('\n>>> naturalSentenceStructure.test.ts');

// ─────────────────────────────────────────────────────────────────────
// Layer 1 — filterOutputArtifacts 어미 치환 폐기 (입력 보존)
// ─────────────────────────────────────────────────────────────────────

test('filterOutputArtifacts: "좋습니다" 3회 연속 → 치환 0 (입력 보존)', () => {
  const input = '치료가 좋습니다. 관리가 좋습니다. 결과가 좋습니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(!/낫습니다/.test(result), `회귀: "낫습니다" 치환 발생 — ${result}`);
  assert.ok(!/바람직합니다/.test(result), `회귀: "바람직합니다" 치환 발생 — ${result}`);
  assert.equal(result, input, `회귀: 입력 변경 발생 — "${result}"`);
});

test('filterOutputArtifacts: "있습니다" 3회 연속 → 치환 0 ("있는 편입니다" 미발생)', () => {
  const input = '정보가 있습니다. 방법이 있습니다. 효과가 있습니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(!/있는 편입니다/.test(result), `회귀: "있는 편입니다" 치환 발생`);
  assert.ok(!/있어요/.test(result), `회귀: "있어요" 치환 발생`);
  assert.equal(result, input);
});

test('filterOutputArtifacts: "됩니다" 3회 연속 → 치환 0 ("되는 편입니다" 미발생)', () => {
  const input = '시작됩니다. 진행됩니다. 마무리됩니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(!/되는 편입니다/.test(result));
  assert.ok(!/돼요/.test(result));
  assert.equal(result, input);
});

test('filterOutputArtifacts: "합니다" 3회 연속 → 치환 0', () => {
  const input = '권장합니다. 추천합니다. 안내합니다.';
  const result = filterOutputArtifacts(input);
  assert.ok(!/하는 편입니다/.test(result));
  assert.ok(!/해요/.test(result));
  assert.equal(result, input);
});

test('filterOutputArtifacts: 다른 기능은 유지 (브랜드 누설 + AI 패턴)', () => {
  // 브랜드 누설 제거는 그대로 동작
  const brand = '안녕하세요 winaid 입니다.';
  const stripped = filterOutputArtifacts(brand);
  assert.ok(!/winaid/i.test(stripped), '브랜드 누설 제거 회귀');

  // AI 패턴 ("이러한 ", "상기 ") 치환 그대로 동작
  const ai = '이러한 방법은 상기 내용과 동일한 효과를 줍니다.';
  const replaced = filterOutputArtifacts(ai);
  assert.ok(!/이러한/.test(replaced), '이러한 → 이런 치환 회귀');
  assert.ok(!/상기/.test(replaced), '상기 → 위 치환 회귀');
});

test('의료광고법 본 규칙 (filterMedicalLawViolations) 무영향', () => {
  // MEDICAL_LAW_REPLACEMENTS 는 filterOutputArtifacts 가 아닌 별도 함수
  // — 폐기 변경이 의료법 본 규칙에 누수되지 않는지 확인
  const violation = '저희는 최고의 임플란트를 100% 보장합니다.';
  const result = filterMedicalLawViolations(violation);
  assert.ok(result.replacedCount > 0, '의료법 본 규칙 미동작 — 회귀');
  assert.ok(!/최고/.test(result.filtered) || /\[전문\]/.test(result.filtered), '최고 치환 회귀');
});

// ─────────────────────────────────────────────────────────────────────
// Layer 2 — COMMON_WRITING_STYLE 4 섹션 본문 invariant
// ─────────────────────────────────────────────────────────────────────

test('COMMON_WRITING_STYLE: <natural_sentence_structure> 블록 존재', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes('<natural_sentence_structure>'),
    '자연 문장 구조 블록 누락',
  );
  assert.ok(
    COMMON_WRITING_STYLE.includes('</natural_sentence_structure>'),
    '자연 문장 구조 블록 닫는 태그 누락',
  );
});

test('COMMON_WRITING_STYLE: A. 문맥별 어미 매핑 (5 분류) 명시', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes('## A. 문맥별 어미 매핑'),
    'A 섹션 누락',
  );
  // 5 분류 모두 본문 존재
  const required = ['정보문', '권고문', '추측', '통계', '질문', '부정'];
  for (const key of required) {
    assert.ok(
      COMMON_WRITING_STYLE.includes(key),
      `A 섹션 분류 "${key}" 누락`,
    );
  }
});

test('COMMON_WRITING_STYLE: B. 어색한 패턴 절대 금지 명시', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes('## B. 어색한 패턴 절대 금지'),
    'B 섹션 누락',
  );
  assert.ok(
    COMMON_WRITING_STYLE.includes('무차별 비교형'),
    'B 섹션: 무차별 비교형 키워드 누락',
  );
  assert.ok(
    COMMON_WRITING_STYLE.includes('편입니다'),
    'B 섹션: 추측 어미 키워드 누락',
  );
});

test('COMMON_WRITING_STYLE: C. 도입부 후킹 패턴 5종 명시', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes('## C. 도입부 후킹 패턴'),
    'C 섹션 누락',
  );
  const required = ['숫자 + 질문', '미스터리 강조', '통계 갭', '전제 부정', '격하 / 재정의'];
  for (const key of required) {
    assert.ok(
      COMMON_WRITING_STYLE.includes(key),
      `C 섹션 후킹 "${key}" 누락`,
    );
  }
});

test('COMMON_WRITING_STYLE: D. 자연스러운 문장 흐름 명시', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes('## D. 자연스러운 문장 흐름'),
    'D 섹션 누락',
  );
  // 접속·부사 가이드 키워드
  assert.ok(
    /또한.*다만.*특히|또한·다만·특히/.test(COMMON_WRITING_STYLE),
    'D 섹션: 접속·종속 가이드 누락',
  );
});

test('COMMON_WRITING_STYLE: 단순 치환 회귀 경고문 명시', () => {
  // "단어만 바꿔서는 자연스러워지지 않습니다" 또는 동급 경고문
  assert.ok(
    COMMON_WRITING_STYLE.includes('단어만 바꿔서는') ||
      COMMON_WRITING_STYLE.includes('단순 어미 치환'),
    '단순 치환 회귀 경고문 누락',
  );
});

// ─────────────────────────────────────────────────────────────────────
// Layer 2 — 7 빌더 모두 자연 문장 구조 가이드 도달 (drift-zero)
// ─────────────────────────────────────────────────────────────────────

const STRUCTURE_TAG = '<natural_sentence_structure>';

test('drift-zero: buildSectionFromOutlinePrompt 가 자연 구조 가이드 받음', () => {
  const section = { type: 'body' as const, heading: '주의사항', summary: '회복', charTarget: 400 };
  const prompt = buildSectionFromOutlinePrompt({
    req: baseReq,
    outline: {
      keyMessage: '발치 후 관리',
      sections: [
        { type: 'intro', heading: '들어가며', summary: '인사', charTarget: 200 },
        section,
      ],
    },
    sectionIndex: 1,
    section,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(STRUCTURE_TAG), 'SectionFromOutline 빌더 누락');
});

test('drift-zero: buildBlogPromptV3 가 자연 구조 가이드 받음', () => {
  const prompt = buildBlogPromptV3({
    req: baseReq,
  } as Parameters<typeof buildBlogPromptV3>[0]);
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(STRUCTURE_TAG), 'V3 빌더 누락');
});

test('drift-zero: buildBlogSectionPromptV3 가 자연 구조 가이드 받음', () => {
  const prompt = buildBlogSectionPromptV3({
    req: baseReq,
    outline: {
      keyMessage: '발치 후 관리',
      sections: [
        { type: 'intro', heading: '들어가며', summary: '인사', charTarget: 200 },
        { type: 'body', heading: '주의사항', summary: '회복', charTarget: 400 },
      ],
    },
    sectionIndex: 1,
  } as Parameters<typeof buildBlogSectionPromptV3>[0]);
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(STRUCTURE_TAG), 'SectionRegen 빌더 누락');
});

test('drift-zero: buildBlogReviewPrompt 가 자연 구조 가이드 받음 (Opus 감수)', () => {
  const prompt = buildBlogReviewPrompt('<h2>발치</h2><p>본문</p>', {
    category: '치과',
    hospitalName: 'OO치과',
  });
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    merged.includes(STRUCTURE_TAG),
    'Review 빌더 누락 — Opus 감수가 자연 구조 가이드 모름',
  );
});

test('drift-zero: buildRefineSelectionPrompt 가 자연 구조 가이드 받음 (6번째 빌더)', () => {
  const prompt = buildRefineSelectionPrompt({
    selectedText: '시술 후 통증이 길어지면 병원에 연락해 주세요.',
    surroundingContext: '(현재 단락) 시술 후 통증이 길어지면 병원에 연락해 주세요.',
    option: 'shorter',
  });
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(STRUCTURE_TAG), 'refine-selection 빌더 누락');
});

test('drift-zero: buildDmPrompt 가 자연 구조 가이드 받음 (7번째 빌더)', () => {
  const prompt = buildDmPrompt({
    influencer: {
      username: 'sample_user',
      follower_count: 5000,
      engagement_rate: 3.2,
      estimated_location: '강남',
      primary_category: '뷰티/미용',
    },
    hospital: {
      name: '서울미소치과',
      location: '강남역',
      features: '임플란트 전문',
      instagram: '@seoulsmile_dental',
    },
    tone: 'casual',
  });
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(STRUCTURE_TAG), 'dm 빌더 누락');
});

// buildOutlinePrompt 는 JSON 출력 빌더로 prose 룰 무관 — 본 검사에서 제외 (proseFlowRule 과 동일)
test('skip: buildOutlinePrompt 는 JSON 빌더로 본 검사 대상 외', () => {
  const prompt = buildOutlinePrompt(baseReq);
  // signature 만 검증 — 출력에 자연 구조 가이드 포함 여부는 무관
  assert.ok(prompt.systemBlocks.length > 0, 'outline 빌더 동작');
});

// ─────────────────────────────────────────────────────────────────────
// Layer 3 — review_criteria 10번 항목 invariant
// ─────────────────────────────────────────────────────────────────────

test('review_criteria 에 natural_sentence_structure 항목 존재', () => {
  const prompt = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', {});
  assert.ok(
    prompt.userPrompt.includes('natural_sentence_structure'),
    'review_criteria 에 natural_sentence_structure 누락',
  );
  assert.ok(
    /10\.\s*\*\*natural_sentence_structure/.test(prompt.userPrompt),
    'review_criteria 10번 위치 아님',
  );
});

test('review_criteria: 신규 항목이 category="ai_artifact" / severity="medium" 명시', () => {
  const prompt = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', {});
  assert.ok(prompt.userPrompt.includes('category="ai_artifact"'), 'category 명시 누락');
  assert.ok(prompt.userPrompt.includes('severity="medium"'), 'severity 명시 누락');
});

test('review_criteria 기존 번호 invariant 유지 (6/7/8/9 drift-zero)', () => {
  // proseFlowRule.test.ts 의 invariant 와 lockstep — 추가 시 회귀 안 나도록
  const prompt = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', {});
  assert.ok(/6\.\s*\*\*prose_flow/.test(prompt.userPrompt), '6번 prose_flow 회귀');
  assert.ok(/7\.\s*\*\*markdown_artifact/.test(prompt.userPrompt), '7번 markdown_artifact 회귀');
  assert.ok(/8\.\s*\*\*grammar_artifact/.test(prompt.userPrompt), '8번 grammar_artifact 회귀');
  assert.ok(
    /9\.\s*(학습 말투|인사 패턴)/.test(prompt.userPrompt),
    '9번 학습/인사 회귀',
  );
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
