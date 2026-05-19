/**
 * blog-quality-3 회귀 방지 테스트 — 후킹 SSOT 통합 + 어미 가이드 역할 분리.
 *
 * 보장:
 *  - 후킹 SSOT: COMMON_WRITING_STYLE ## C 가 5 패턴 + topic 매핑 + 의료법 차단 + 피하기 흡수
 *  - BLOG_PERSONA <hook_patterns> 는 참조 한 줄로 축약 (정보 손실 0)
 *  - 어미 가이드 역할 분리: ## A "어미 의미 선택" / writing_style "어미 분포·리듬"
 *  - 5 빌더 slot 1 invariant 유지 (PRIORITY + E_E_A_T 도달 — outline 포함 5,
 *    COMMON_WRITING_STYLE 은 4 빌더 + reviewer 변형 = 5)
 */
import assert from 'node:assert/strict';
import {
  COMMON_WRITING_STYLE,
  BLOG_PERSONA,
  buildOutlinePrompt,
  buildSectionFromOutlinePrompt,
  buildBlogPromptV3,
  buildBlogSectionPromptV3,
  buildBlogReviewPrompt,
} from '../blogPrompt';

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
console.log('\n>>> blogQuality3.test.ts');

// ─────────────────────────────────────────────────────────────────────
// invariant 1: 후킹 SSOT — C 섹션이 5 패턴 + topic 매핑 + 피하기 + 의료법 차단
// ─────────────────────────────────────────────────────────────────────

test('C 섹션 SSOT — 5 핵심 패턴 키워드 모두 존재', () => {
  const keys = ['숫자 + 질문', '미스터리 강조', '통계 갭', '전제 부정', '격하 / 재정의'];
  for (const k of keys) {
    assert.ok(COMMON_WRITING_STYLE.includes(k), `5 패턴 키워드 누락: "${k}"`);
  }
});

test('C 섹션 SSOT — Topic 별 추천 매핑 흡수 (C-2)', () => {
  // BLOG_PERSONA hook_patterns 에만 있던 topic-fit 정보가 C 섹션에 흡수
  assert.ok(
    /정보형\s*\/\s*비교형 topic|정보형\s*·\s*비교형/.test(COMMON_WRITING_STYLE),
    '정보형/비교형 topic 매핑 누락',
  );
  assert.ok(
    /증상형\s*\/\s*케어형 topic|증상형\s*·\s*케어형/.test(COMMON_WRITING_STYLE),
    '증상형/케어형 topic 매핑 누락',
  );
  assert.ok(
    /general topic|일반\s+topic/.test(COMMON_WRITING_STYLE),
    'general topic 매핑 누락',
  );
});

test('C 섹션 SSOT — BLOG_PERSONA 흡수 예시 보존 (정보 손실 0)', () => {
  // 질문형 예시 3개
  assert.ok(COMMON_WRITING_STYLE.includes('계절 탓이라고 넘기신'), '질문형 예시 1 누락');
  assert.ok(COMMON_WRITING_STYLE.includes('병원마다 이렇게 차이'), '질문형 예시 2 누락');
  assert.ok(COMMON_WRITING_STYLE.includes('브라켓이 좋을지 투명교정'), '질문형 예시 3 누락');
  // 장면형 예시 3개
  assert.ok(COMMON_WRITING_STYLE.includes('어제까지 멀쩡했던 어금니'), '장면형 예시 1 누락');
  assert.ok(COMMON_WRITING_STYLE.includes('칫솔에 피가 묻어나오는'), '장면형 예시 2 누락');
  assert.ok(COMMON_WRITING_STYLE.includes('수술 후 일주일'), '장면형 예시 3 누락');
  // 통계형 예시 2개 + 일반화 표현
  assert.ok(COMMON_WRITING_STYLE.includes('성인 세 명 중 두 명'), '통계형 예시 1 누락');
  assert.ok(COMMON_WRITING_STYLE.includes('잇몸 문제로 병원'), '통계형 예시 2 누락');
  assert.ok(/흔히.*대부분.*많은 분들|흔히|대부분|많은 분들/.test(COMMON_WRITING_STYLE), '일반화 표현 가이드 누락');
});

test('C 섹션 SSOT — 의료법 차단 (C-3) 명시 + "성공률 99%" 차단 인용', () => {
  assert.ok(COMMON_WRITING_STYLE.includes('성공률 99%'), '의료법 수치 단정 차단 인용 누락');
  assert.ok(
    /최고.*100%.*유일.*보장|최고|유일|보장/.test(COMMON_WRITING_STYLE),
    '의료법 차단 단정 어구 누락',
  );
});

test('C 섹션 SSOT — 피하기 (C-4) 흡수: "이 글에서는" + "안녕하세요 저희는" 단독', () => {
  assert.ok(
    COMMON_WRITING_STYLE.includes('이 글에서는'),
    '"이 글에서는" 피하기 누락',
  );
  assert.ok(
    /안녕하세요.*저희는|저희는 ~ 입니다 단독/.test(COMMON_WRITING_STYLE),
    '"안녕하세요 저희는" 단독 피하기 누락',
  );
});

test('BLOG_PERSONA <hook_patterns> 는 참조 한 줄 (≤ 500 자) + common_writing_style 참조', () => {
  const m = BLOG_PERSONA.match(/<hook_patterns>([\s\S]*?)<\/hook_patterns>/);
  assert.ok(m, '<hook_patterns> 블록 누락');
  const body = m![1];
  assert.ok(
    body.length < 500,
    `참조 한 줄 축약 실패 — 본문 길이 ${body.length} (≥ 500 자)`,
  );
  assert.ok(
    /common_writing_style/i.test(body),
    'common_writing_style 참조 키워드 누락',
  );
  // 기존 예시 본문이 잔존하면 SSOT 통합 실패
  assert.ok(
    !body.includes('계절 탓이라고 넘기신'),
    'BLOG_PERSONA hook_patterns 에 옛 예시 잔존 (SSOT 통합 실패)',
  );
  assert.ok(
    !body.includes('성공률 99%'),
    'BLOG_PERSONA hook_patterns 에 옛 의료법 차단 인용 잔존',
  );
});

// ─────────────────────────────────────────────────────────────────────
// invariant 2: 어미 가이드 역할 분리
// ─────────────────────────────────────────────────────────────────────

test('A 섹션 헤더에 "어미 의미 선택" 역할 명시 + writing_style 참조', () => {
  // ## A. 문맥별 어미 매핑 직후 본문에 역할 라벨
  const a = COMMON_WRITING_STYLE.indexOf('## A. 문맥별 어미 매핑');
  const b = COMMON_WRITING_STYLE.indexOf('## B.', a);
  assert.ok(a >= 0 && b > a, 'A 섹션 범위 추출 실패');
  const aSection = COMMON_WRITING_STYLE.slice(a, b);
  assert.ok(
    /역할\s*=\s*어미\s*의미\s*선택/.test(aSection),
    'A 섹션에 "역할 = 어미 의미 선택" 헤더 누락',
  );
  assert.ok(
    /writing_style/i.test(aSection),
    'A 섹션에 writing_style 참조 누락',
  );
});

test('BLOG_PERSONA <writing_style> 에 "어미 분포" 역할 + ## A 참조 명시', () => {
  const m = BLOG_PERSONA.match(/<writing_style>([\s\S]*?)<\/writing_style>/);
  assert.ok(m, 'BLOG_PERSONA writing_style 블록 누락');
  const body = m![1];
  assert.ok(/역할\s*=.*분포/.test(body), '"역할 = 분포" 명시 누락');
  assert.ok(
    /common_writing_style[^\n]*##\s*A|## A\. 문맥별 어미 매핑/.test(body),
    'A 섹션 참조 누락',
  );
});

test('buildBlogPromptV3 / buildBlogSectionPromptV3 의 writing_style 도 역할 분리 명시', () => {
  const v3Prompt = buildBlogPromptV3({
    req: baseReq,
  } as Parameters<typeof buildBlogPromptV3>[0]);
  const v3Merged = v3Prompt.systemBlocks.map((b) => b.text).join('\n');
  // V3 빌더는 user prompt 에도 writing_style 이 embedded
  const v3Combined = v3Merged + '\n' + v3Prompt.userPrompt;
  // BLOG_PERSONA writing_style 자체에 역할 라벨이 있으므로 V3 빌더는 자동 도달
  assert.ok(
    /역할\s*=.*분포|역할\s*=\s*어미\s*분포/.test(v3Combined),
    'V3 빌더에 "역할 = 어미 분포" 도달 실패',
  );

  const sectionV3Prompt = buildBlogSectionPromptV3({
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
  const sectionMerged = sectionV3Prompt.systemBlocks.map((b) => b.text).join('\n');
  const sectionCombined = sectionMerged + '\n' + sectionV3Prompt.userPrompt;
  assert.ok(
    /역할\s*=.*분포|어미\s*분포/.test(sectionCombined),
    'sectionV3 빌더에 "역할 = 어미 분포" 도달 실패',
  );
});

// ─────────────────────────────────────────────────────────────────────
// invariant 3: 5 빌더 slot 1 PRIORITY + E_E_A_T 도달 (CLAUDE.md 5빌더 안전망)
//   COMMON_WRITING_STYLE 은 outline 제외 4 빌더 (CLAUDE.md drift 정합)
// ─────────────────────────────────────────────────────────────────────

const section = {
  type: 'body' as const,
  heading: '주의사항',
  summary: '회복',
  charTarget: 400,
};
const baseOutline = {
  keyMessage: '발치 후 관리',
  sections: [
    { type: 'intro' as const, heading: '들어가며', summary: '인사', charTarget: 200 },
    section,
  ],
};

function slot1Text(systemBlocks: { text: string }[]): string {
  return systemBlocks[0]?.text ?? '';
}

test('5 빌더 slot 1: PRIORITY_ORDER 키워드 도달 (CLAUDE.md 5빌더 안전망)', () => {
  const outline = buildOutlinePrompt(baseReq);
  const section1 = buildSectionFromOutlinePrompt({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
    section,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const v3 = buildBlogPromptV3({ req: baseReq } as Parameters<typeof buildBlogPromptV3>[0]);
  const sectionV3 = buildBlogSectionPromptV3({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
  } as Parameters<typeof buildBlogSectionPromptV3>[0]);
  const review = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', { category: '치과' });

  // 4 빌더 (outline / section / V3 / sectionV3): PRIORITY_ORDER_BLOCK 표준 형태 도달
  for (const [name, p] of [
    ['outline', outline],
    ['section', section1],
    ['v3', v3],
    ['sectionV3', sectionV3],
  ] as const) {
    const merged = p.systemBlocks.map((b) => b.text).join('\n');
    assert.ok(
      /priority_order|PRIORITY_ORDER|우선\s*순서/i.test(merged),
      `${name}: PRIORITY_ORDER 도달 실패`,
    );
  }
  // review 빌더: REVIEWER 변형 (CLAUDE.md PR #200) — REVIEWER_PERSONA 의 priority signal
  // ("의료법 절대 우선" 등) 으로 PRIORITY 의도 보장
  const reviewMerged = review.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    /의료법 절대 우선|priority|REVIEWER/i.test(reviewMerged),
    `review: PRIORITY (REVIEWER 변형) 도달 실패`,
  );
});

test('5 빌더 slot 1: E_E_A_T 키워드 도달 (CLAUDE.md 5빌더 안전망)', () => {
  const outline = buildOutlinePrompt(baseReq);
  const section1 = buildSectionFromOutlinePrompt({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
    section,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const v3 = buildBlogPromptV3({ req: baseReq } as Parameters<typeof buildBlogPromptV3>[0]);
  const sectionV3 = buildBlogSectionPromptV3({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
  } as Parameters<typeof buildBlogSectionPromptV3>[0]);
  const review = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', { category: '치과' });

  for (const [name, p] of [
    ['outline', outline],
    ['section', section1],
    ['v3', v3],
    ['sectionV3', sectionV3],
    ['review', review],
  ] as const) {
    const merged = p.systemBlocks.map((b) => b.text).join('\n');
    assert.ok(
      /e_e_a_t|E-E-A-T|Experience|Expertise|Authority|Trust/i.test(merged),
      `${name}: E_E_A_T 도달 실패`,
    );
  }
});

test('4 빌더 slot 1 (outline 제외): COMMON_WRITING_STYLE 도달', () => {
  // outline 은 JSON 출력 빌더라 CWS 미주입 (drift-zero 정합)
  const section1 = buildSectionFromOutlinePrompt({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
    section,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const v3 = buildBlogPromptV3({ req: baseReq } as Parameters<typeof buildBlogPromptV3>[0]);
  const sectionV3 = buildBlogSectionPromptV3({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
  } as Parameters<typeof buildBlogSectionPromptV3>[0]);
  const review = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', { category: '치과' });

  for (const [name, p] of [
    ['section', section1],
    ['v3', v3],
    ['sectionV3', sectionV3],
    ['review', review],
  ] as const) {
    const merged = p.systemBlocks.map((b) => b.text).join('\n');
    assert.ok(
      /common_writing_style/i.test(merged),
      `${name}: COMMON_WRITING_STYLE 도달 실패`,
    );
  }
});

test('5 빌더 slot 1: SSOT 통합 효과 — C 섹션 5 패턴 LLM 도달 (4 빌더)', () => {
  // outline 제외 4 빌더 + review = 5 모두 C 섹션 SSOT 도달
  const section1 = buildSectionFromOutlinePrompt({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
    section,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const v3 = buildBlogPromptV3({ req: baseReq } as Parameters<typeof buildBlogPromptV3>[0]);
  const sectionV3 = buildBlogSectionPromptV3({
    req: baseReq,
    outline: baseOutline,
    sectionIndex: 1,
  } as Parameters<typeof buildBlogSectionPromptV3>[0]);
  const review = buildBlogReviewPrompt('<h2>x</h2><p>y</p>', { category: '치과' });

  for (const [name, p] of [
    ['section', section1],
    ['v3', v3],
    ['sectionV3', sectionV3],
    ['review', review],
  ] as const) {
    const merged = p.systemBlocks.map((b) => b.text).join('\n');
    assert.ok(merged.includes('숫자 + 질문'), `${name}: hook 패턴 1 도달 실패`);
    assert.ok(merged.includes('미스터리 강조'), `${name}: hook 패턴 2 도달 실패`);
    assert.ok(merged.includes('전제 부정'), `${name}: hook 패턴 4 도달 실패`);
    // C-2 topic 매핑도 같이 도달
    assert.ok(/정보형|증상형|케어형/.test(merged), `${name}: topic 매핑 도달 실패`);
  }
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
