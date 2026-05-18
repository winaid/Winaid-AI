/**
 * Prose flow 회귀 방지 테스트.
 *
 * 보장:
 *  - COMMON_WRITING_STYLE 에 2026-05 회귀 케이스 인용 포함 (한 줄 변경 가드)
 *  - 4 빌더 모두 COMMON_WRITING_STYLE 본문 포함 (drift-zero, review 빌더 누락 회귀 방지)
 *  - buildBlogReviewPrompt 의 review_criteria 에 prose_flow 항목 포함
 *  - 회귀 인용 substring 이 빌더 출력에 들어가는지 (실제 모델이 받는지)
 */
import assert from 'node:assert/strict';
import {
  COMMON_WRITING_STYLE,
  buildSectionFromOutlinePrompt,
  buildBlogPromptV3,
  buildBlogSectionPromptV3,
  buildBlogReviewPrompt,
} from '../blogPrompt';
import { buildRefineSelectionPrompt } from '../refineSelectionPrompt';
import { buildDmPrompt } from '../dmPrompt';

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

const REGRESSION_QUOTE = '1시간 이상 지혈이 안 될 때';

const baseReq = {
  topic: '발치 후 주의사항',
  category: '치과',
  textLength: 2000,
} as const;

// eslint-disable-next-line no-console
console.log('\n>>> proseFlowRule.test.ts');

test('COMMON_WRITING_STYLE 에 2026-05 회귀 케이스 인용 포함', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes(REGRESSION_QUOTE),
    '회귀 케이스 인용 누락 — 룰 본문에 정확 패턴 명시 필요',
  );
});

test('COMMON_WRITING_STYLE: 풀어쓰기 가이드 ("또한/한편/특히") 명시', () => {
  // 접속 부사 가이드가 본문에 명시돼 있어야 함
  const hasGuide =
    /또한.*한편.*특히|또한 \/ 한편 \/ 특히/u.test(COMMON_WRITING_STYLE);
  assert.ok(hasGuide, '접속·부사 풀어쓰기 가이드 누락');
});

test('drift-zero: buildSectionFromOutlinePrompt 가 COMMON_WRITING_STYLE 받음', () => {
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
  assert.ok(merged.includes(REGRESSION_QUOTE), 'SectionFromOutline 빌더에 prose 룰 미전달');
});

test('drift-zero: buildBlogPromptV3 가 COMMON_WRITING_STYLE 받음', () => {
  const prompt = buildBlogPromptV3({
    req: baseReq,
  } as Parameters<typeof buildBlogPromptV3>[0]);
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(REGRESSION_QUOTE), 'V3 빌더에 prose 룰 미전달');
});

test('drift-zero: buildBlogSectionPromptV3 가 COMMON_WRITING_STYLE 받음', () => {
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
  assert.ok(merged.includes(REGRESSION_QUOTE), 'SectionRegen 빌더에 prose 룰 미전달');
});

test('drift-zero: buildBlogReviewPrompt 가 COMMON_WRITING_STYLE 받음 (회귀 원인 차단)', () => {
  const prompt = buildBlogReviewPrompt('<h2>발치 후 주의사항</h2><p>본문</p>', {
    category: '치과',
    hospitalName: 'OO치과',
  });
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    merged.includes(REGRESSION_QUOTE),
    'Review 빌더에 prose 룰 미전달 — 회귀 차단 실패',
  );
});

test('review_criteria 에 prose_flow 항목 포함', () => {
  const prompt = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', {});
  // userPrompt 안에 review_criteria 6번 항목으로 prose_flow 명시
  assert.ok(prompt.userPrompt.includes('prose_flow'), 'review_criteria 에 prose_flow 누락');
  assert.ok(
    prompt.userPrompt.includes('1시간 이상 지혈이 안 될 때'),
    'review_criteria 에 회귀 케이스 인용 누락',
  );
});

test('drift-zero: buildRefineSelectionPrompt 가 COMMON_WRITING_STYLE 받음 (6번째 빌더)', () => {
  // CLAUDE.md "5빌더 안전망" 의 6번째 빌더 — refine-selection 도 prose-flow 룰 본문 전달.
  // 회귀 차단: 새 빌더가 COMMON_WRITING_STYLE 슬롯 1 에 누락된 채 머지되는 케이스.
  const prompt = buildRefineSelectionPrompt({
    selectedText: '시술 후 통증이 길어지면 병원에 연락해 주세요.',
    surroundingContext: '(현재 단락) 시술 후 통증이 길어지면 병원에 연락해 주세요.',
    option: 'shorter',
  });
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    merged.includes(REGRESSION_QUOTE),
    'buildRefineSelectionPrompt 에 prose 룰 미전달 — 회귀 차단 실패',
  );
});

test('drift-zero: buildDmPrompt 가 COMMON_WRITING_STYLE 받음 (7번째 빌더 — PR-D)', () => {
  // CLAUDE.md "5빌더 안전망" 의 7번째 빌더 — instagram_dm 도 prose-flow 룰 본문 전달.
  // 회귀 차단: generate-dm 빌더가 PR-D 이전 sanitize 안전망 외부에 있던 격리 해소.
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
  assert.ok(
    merged.includes(REGRESSION_QUOTE),
    'buildDmPrompt 에 prose 룰 미전달 — 7빌더 안전망 회귀 차단 실패',
  );
  // 추가: 5빌더 안전망 4축 모두 도달
  assert.ok(/우선\s*순서|PRIORITY/i.test(merged), 'PRIORITY_ORDER 미도달');
  assert.ok(/E_E_A_T|Experience|Expertise/i.test(merged), 'E_E_A_T 미도달');
  assert.ok(/의료법|MEDICAL_LAW|광고법/i.test(merged), 'MEDICAL_LAW 미도달');
});

test('review_criteria 항목 번호 일관성: 6=prose_flow, 7=markdown_artifact, 8=grammar_artifact, 9=학습/인사', () => {
  const prompt = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', {});
  assert.ok(/6\.\s*\*\*prose_flow/.test(prompt.userPrompt), '6번이 prose_flow 가 아님');
  assert.ok(/7\.\s*\*\*markdown_artifact/.test(prompt.userPrompt), '7번이 markdown_artifact 가 아님');
  assert.ok(/8\.\s*\*\*grammar_artifact/.test(prompt.userPrompt), '8번이 grammar_artifact 가 아님');
  assert.ok(
    /9\.\s*(학습 말투|인사 패턴)/.test(prompt.userPrompt),
    '9번이 학습/인사 가 아님 — 번호 충돌',
  );
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
