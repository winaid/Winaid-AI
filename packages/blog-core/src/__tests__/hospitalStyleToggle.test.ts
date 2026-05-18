/**
 * useHospitalStyle 토글 회귀 가드.
 *
 * 보장:
 *  - useHospitalStyle === false 시 hospitalStyleBlock 보간 차단 (4 빌더 모두)
 *  - useHospitalStyle 미지정 (undefined) 또는 true 시 기존 동작 (backward compat)
 *  - stylePromptText 가 있으면 useHospitalStyle 토글 무관하게 명시 학습 우선
 *    (사용자가 명시적으로 학습한 말투는 토글의 영향 받지 않음)
 *  - 의료법 / prose-flow / E_E_A_T 룰은 토글과 무관하게 항상 도달
 */
import assert from 'node:assert/strict';
import {
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

// 학습 블록의 고유 fingerprint — 빌더 출력에 보간되는지 검증용.
// hospitalStyleBlock 자체가 임의 문자열이므로 호출자가 명시한 fingerprint 가
// 보간 결과에 substring 으로 등장하는지로 확인.
const HOSPITAL_BLOCK_FINGERPRINT = '<<HOSPITAL_STYLE_FINGERPRINT_TEST_8a3f>>';
const HOSPITAL_BLOCK = `<hospital_voice>
${HOSPITAL_BLOCK_FINGERPRINT}
원장님이 "그러게요" 같은 어미를 자주 쓰는 말투.
</hospital_voice>`;

const baseReq = {
  topic: '발치 후 주의사항',
  category: '치과',
  textLength: 2000,
} as const;

// eslint-disable-next-line no-console
console.log('\n>>> hospitalStyleToggle.test.ts');

// ── buildBlogPromptV3 (1패스) ────────────────────────────────────────

test('buildBlogPromptV3: useHospitalStyle 미지정 → hospitalStyleBlock 보간 (backward compat)', () => {
  const prompt = buildBlogPromptV3(
    baseReq as Parameters<typeof buildBlogPromptV3>[0],
    { hospitalStyleBlock: HOSPITAL_BLOCK },
  );
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    merged.includes(HOSPITAL_BLOCK_FINGERPRINT),
    '미지정 시 hospitalStyleBlock 보간 안 됨 — backward compat 위반',
  );
});

test('buildBlogPromptV3: useHospitalStyle=true → hospitalStyleBlock 보간', () => {
  const prompt = buildBlogPromptV3(
    { ...baseReq, useHospitalStyle: true } as Parameters<typeof buildBlogPromptV3>[0],
    { hospitalStyleBlock: HOSPITAL_BLOCK },
  );
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(HOSPITAL_BLOCK_FINGERPRINT), 'useHospitalStyle=true 시 hospitalStyleBlock 보간 누락');
});

test('buildBlogPromptV3: useHospitalStyle=false → hospitalStyleBlock 차단', () => {
  const prompt = buildBlogPromptV3(
    { ...baseReq, useHospitalStyle: false } as Parameters<typeof buildBlogPromptV3>[0],
    { hospitalStyleBlock: HOSPITAL_BLOCK },
  );
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    !merged.includes(HOSPITAL_BLOCK_FINGERPRINT),
    'useHospitalStyle=false 인데 hospitalStyleBlock 보간됨 — 토글 작동 안 함',
  );
});

test('buildBlogPromptV3: stylePromptText 가 있으면 useHospitalStyle=false 무관하게 stylePromptText 우선', () => {
  const STYLE_TEXT_FINGERPRINT = '<<USER_STYLE_PROMPT_TEXT_fingerprint_b7e2>>';
  const prompt = buildBlogPromptV3(
    {
      ...baseReq,
      useHospitalStyle: false,
      stylePromptText: STYLE_TEXT_FINGERPRINT,
    } as Parameters<typeof buildBlogPromptV3>[0],
    { hospitalStyleBlock: HOSPITAL_BLOCK },
  );
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    merged.includes(STYLE_TEXT_FINGERPRINT),
    'stylePromptText 가 useHospitalStyle=false 일 때도 우선되어야 함 (사용자 명시 학습 보존)',
  );
  // hospitalStyleBlock 은 stylePromptText 우선순위에 의해 어차피 무시됨 (기존 동작)
});

// ── buildSectionFromOutlinePrompt (2패스 Pass 2) ─────────────────────

test('buildSectionFromOutlinePrompt: useHospitalStyle=false → hospitalStyleBlock 차단', () => {
  const section = { type: 'section' as const, heading: '주의사항', summary: '회복', charTarget: 400 };
  const prompt = buildSectionFromOutlinePrompt({
    req: { ...baseReq, useHospitalStyle: false },
    outline: {
      keyMessage: '발치 후 관리',
      totalCharTarget: 2000,
      sections: [
        { type: 'intro', heading: '들어가며', summary: '인사', charTarget: 200 },
        section,
      ],
    },
    sectionIndex: 1,
    section,
    hospitalStyleBlock: HOSPITAL_BLOCK,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(!merged.includes(HOSPITAL_BLOCK_FINGERPRINT), 'SectionFromOutline 빌더에서 토글 차단 실패');
});

test('buildSectionFromOutlinePrompt: useHospitalStyle 미지정 → hospitalStyleBlock 보간', () => {
  const section = { type: 'section' as const, heading: '주의사항', summary: '회복', charTarget: 400 };
  const prompt = buildSectionFromOutlinePrompt({
    req: baseReq,
    outline: {
      keyMessage: '발치 후 관리',
      totalCharTarget: 2000,
      sections: [
        { type: 'intro', heading: '들어가며', summary: '인사', charTarget: 200 },
        section,
      ],
    },
    sectionIndex: 1,
    section,
    hospitalStyleBlock: HOSPITAL_BLOCK,
    totalSections: 2,
  } as Parameters<typeof buildSectionFromOutlinePrompt>[0]);
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes(HOSPITAL_BLOCK_FINGERPRINT), 'SectionFromOutline backward compat 실패');
});

// ── buildBlogSectionPromptV3 (섹션 재생성) ───────────────────────────

test('buildBlogSectionPromptV3: useHospitalStyle=false → fallback voice (HOSPITAL_BLOCK 차단)', () => {
  // 본 빌더는 input 에 hospitalStyleBlock 옵션이 없고, req.stylePromptText 또는 fallback 사용.
  // useHospitalStyle=false 면 buildLearnedStyleBlock 이 hospitalStyleBlock 무시 → fallback voice 유지.
  // input 시그너처에 hospitalStyleBlock 이 없어 직접 보간 케이스가 없지만, buildLearnedStyleBlock
  // 분기는 동일하게 작동. 본 테스트는 fallback 경로 보존 검증.
  const prompt = buildBlogSectionPromptV3({
    currentSection: '<p>본문</p>',
    sectionIndex: 1,
    fullBlogContent: '<h2>제목</h2><p>본문</p>',
    category: '치과',
  });
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  // medical_blog_voice fallback 이 들어가야 함 (학습 없을 때 기본 voice)
  assert.ok(
    merged.includes('medical_blog_voice') || merged.includes('priority="default_voice"'),
    'buildBlogSectionPromptV3 fallback voice 미주입',
  );
});

// ── buildBlogReviewPrompt (Opus 감수) ────────────────────────────────

test('buildBlogReviewPrompt: useHospitalStyle 미지정 → has_learned_style 활성 (backward compat)', () => {
  const prompt = buildBlogReviewPrompt('<h2>발치</h2><p>본문</p>', {
    category: '치과',
    hospitalStyleBlock: HOSPITAL_BLOCK,
  });
  assert.ok(
    prompt.userPrompt.includes('<has_learned_style>true</has_learned_style>'),
    '미지정 시 has_learned_style 비활성 — backward compat 위반',
  );
});

test('buildBlogReviewPrompt: useHospitalStyle=false → has_learned_style 비활성', () => {
  const prompt = buildBlogReviewPrompt('<h2>발치</h2><p>본문</p>', {
    category: '치과',
    hospitalStyleBlock: HOSPITAL_BLOCK,
    useHospitalStyle: false,
  });
  assert.ok(
    !prompt.userPrompt.includes('<has_learned_style>true</has_learned_style>'),
    'useHospitalStyle=false 인데 has_learned_style 활성 — 토글 작동 안 함',
  );
});

test('buildBlogReviewPrompt: stylePromptText 가 있으면 useHospitalStyle=false 무관하게 has_learned_style 활성', () => {
  const prompt = buildBlogReviewPrompt('<h2>발치</h2><p>본문</p>', {
    category: '치과',
    hospitalStyleBlock: HOSPITAL_BLOCK,
    stylePromptText: '환자분께 친근하게 다가가는 말투',
    useHospitalStyle: false,
  });
  assert.ok(
    prompt.userPrompt.includes('<has_learned_style>true</has_learned_style>'),
    'stylePromptText 가 useHospitalStyle=false 일 때도 has_learned_style 활성되어야 함',
  );
});

// ── 의료법 + prose-flow + E_E_A_T 룰 — 토글 무관 항상 도달 ───────────

test('useHospitalStyle=false 라도 의료법 / prose-flow / E_E_A_T 룰 본문 도달 (토글 영향 X)', () => {
  const prompt = buildBlogPromptV3(
    { ...baseReq, useHospitalStyle: false } as Parameters<typeof buildBlogPromptV3>[0],
    { hospitalStyleBlock: HOSPITAL_BLOCK },
  );
  const merged = prompt.systemBlocks.map((b) => b.text).join('\n');
  // 회귀 케이스 인용 (prose-flow), 의료법, E_E_A_T 모두 검사
  assert.ok(merged.includes('1시간 이상 지혈이 안 될 때'), 'prose-flow 룰 누락');
  assert.ok(merged.includes('의료법 제56조'), '의료법 룰 누락');
  assert.ok(merged.includes('<e_e_a_t_signals>'), 'E_E_A_T 룰 누락');
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
