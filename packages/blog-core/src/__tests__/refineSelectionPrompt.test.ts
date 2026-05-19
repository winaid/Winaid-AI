/**
 * refineSelectionPrompt 회귀 가드.
 *
 * 보장:
 *  - buildRefineSelectionPrompt slot 1 에 PRIORITY_ORDER_BLOCK + E_E_A_T_GUIDE
 *    + COMMON_WRITING_STYLE + MEDICAL_LAW_CONSTRAINTS 본문 도달 (5빌더 invariant 와 정합)
 *  - prose-flow 회귀 케이스 인용 ("1시간 이상 지혈이 안 될 때") 도달
 *  - userPrompt 에 selected_text / surrounding_context / option / task 블록 존재
 *  - option=custom + customInstruction 보간 시 <custom_instruction> 블록 등장
 *  - category 가 7 카테고리 중 하나일 때 CATEGORY_DEPTH_GUIDES + category_tone 슬롯 2 활성화
 *  - 신규 페르소나 REFINE_SELECTION_PERSONA 의 핵심 룰 (scope_constraint / length_constraint /
 *    medical_law_priority / sentence_boundary) 모두 도달
 */
import assert from 'node:assert/strict';
import { buildRefineSelectionPrompt, tryParseRefinedFromLLM } from '../refineSelectionPrompt';

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

const PROSE_REGRESSION_QUOTE = '1시간 이상 지혈이 안 될 때';

const baseInput = {
  selectedText: '시술 후 통증이 길어지면 병원에 연락해 주세요.',
  surroundingContext: '(현재 단락) 시술 후 통증이 길어지면 병원에 연락해 주세요.',
  option: 'shorter' as const,
};

// eslint-disable-next-line no-console
console.log('\n>>> refineSelectionPrompt.test.ts');

test('slot 1 — PRIORITY_ORDER 본문 substring 도달', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  const merged = p.systemBlocks.map((b) => b.text).join('\n');
  // PRIORITY_ORDER_BLOCK 본문의 고유 표현 — "의료광고법 준수 (constraints 블록)"
  assert.ok(
    merged.includes('의료광고법 준수') && merged.includes('learned_style') &&
      merged.includes('가독성'),
    'PRIORITY_ORDER_BLOCK 본문 미전달 — 5빌더 invariant 위반',
  );
});

test('slot 1 — E_E_A_T 본문 4축 도달', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  const merged = p.systemBlocks.map((b) => b.text).join('\n');
  // E_E_A_T_GUIDE 본문은 lowercase XML tag + Korean label 패턴 사용
  // (대문자 영어 단어는 BLOG_PERSONA <e_e_a_t> 블록에서만 등장 — 본 빌더는 그 블록 미포함)
  assert.ok(merged.includes('<e_e_a_t_signals>'), 'E_E_A_T 래퍼 태그 미전달');
  assert.ok(merged.includes('<experience'), 'experience (경험) 축 미전달');
  assert.ok(merged.includes('<expertise'), 'expertise (전문성) 축 미전달');
  assert.ok(merged.includes('<authoritativeness'), 'authoritativeness (권위) 축 미전달');
  assert.ok(merged.includes('<trustworthiness'), 'trustworthiness (신뢰) 축 미전달');
});

test('slot 1 — COMMON_WRITING_STYLE 본문 + prose-flow 회귀 케이스 도달', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  const merged = p.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(
    merged.includes(PROSE_REGRESSION_QUOTE),
    'prose-flow 회귀 인용 미전달 — CLAUDE.md 룰 위반',
  );
  assert.ok(
    merged.includes('마크다운 syntax 절대 금지'),
    'COMMON_WRITING_STYLE 의 no_markdown 룰 미전달',
  );
});

test('slot 1 — MEDICAL_LAW_CONSTRAINTS 본문 도달', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  const merged = p.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes('의료법 제56조'), 'MEDICAL_LAW_CONSTRAINTS 본문 미전달');
  assert.ok(merged.includes('완치'), 'MEDICAL_LAW_CONSTRAINTS 금지어 본문 미전달');
});

test('REFINE_SELECTION_PERSONA — 핵심 룰 4개 모두 도달', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  const merged = p.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes('scope_constraint'), 'scope_constraint 룰 미전달');
  assert.ok(merged.includes('length_constraint'), 'length_constraint 룰 미전달');
  assert.ok(merged.includes('medical_law_priority'), 'medical_law_priority 룰 미전달');
  assert.ok(merged.includes('sentence_boundary'), 'sentence_boundary 룰 미전달');
});

test('userPrompt — selection_context + option_block + task 모두 존재', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  assert.ok(p.userPrompt.includes('<selection_context>'), 'selection_context 누락');
  assert.ok(p.userPrompt.includes('<selected_text>'), 'selected_text 누락');
  assert.ok(p.userPrompt.includes('<surrounding_context>'), 'surrounding_context 누락');
  assert.ok(p.userPrompt.includes('<option>shorter</option>'), 'option 누락');
  assert.ok(p.userPrompt.includes('<task>'), 'task 블록 누락');
});

test('option=custom + customInstruction — <custom_instruction> 보간', () => {
  const p = buildRefineSelectionPrompt({
    ...baseInput,
    option: 'custom',
    customInstruction: '환자분 입장에서 더 따뜻하게',
  });
  assert.ok(
    p.userPrompt.includes('<option>custom</option>'),
    'option=custom 누락',
  );
  assert.ok(
    p.userPrompt.includes('<custom_instruction>환자분 입장에서 더 따뜻하게</custom_instruction>'),
    'custom_instruction 보간 누락',
  );
});

test('option=custom + customInstruction 없음 — <custom_instruction> 미보간 (호출자가 사전 검증)', () => {
  const p = buildRefineSelectionPrompt({ ...baseInput, option: 'custom' });
  // customInstruction 없으면 빌더는 단순히 블록 미주입 (호출자 라우트가 400 으로 사전 거부)
  assert.ok(
    !p.userPrompt.includes('<custom_instruction>'),
    'customInstruction 없는데 블록 주입됨',
  );
});

test('category 7 카테고리 → slot 2 (CATEGORY_PACK) 활성화', () => {
  const withCategory = buildRefineSelectionPrompt({ ...baseInput, category: '치과' });
  const withoutCategory = buildRefineSelectionPrompt(baseInput);
  assert.ok(
    withCategory.systemBlocks.length > withoutCategory.systemBlocks.length,
    'category 가 있는데 slot 2 미활성',
  );
  const merged = withCategory.systemBlocks.map((b) => b.text).join('\n');
  assert.ok(merged.includes('specialist_guide'), 'CATEGORY_DEPTH_GUIDES 미전달');
  assert.ok(merged.includes('category_tone'), 'category_tone 블록 미전달');
});

test('category 미등록 → slot 2 비활성 (drift-zero 정합)', () => {
  const p = buildRefineSelectionPrompt({ ...baseInput, category: '비뇨의학과' as string });
  // 미등록 카테고리는 slot 2 skip
  assert.equal(p.systemBlocks.length, 1, '미등록 카테고리인데 slot 2 활성');
});

test('userPrompt — category 명시 시 <category> 태그 보간', () => {
  const p = buildRefineSelectionPrompt({ ...baseInput, category: '피부과' });
  assert.ok(p.userPrompt.includes('<category>피부과</category>'), '<category> 태그 누락');
});

test('systemBlocks — slot 1 cacheable:true + ttl 1h (prompt cache 안정성)', () => {
  const p = buildRefineSelectionPrompt(baseInput);
  assert.equal(p.systemBlocks[0]?.cacheable, true, 'slot 1 cacheable 미설정');
  assert.equal(p.systemBlocks[0]?.cacheTtl, '1h', 'slot 1 cacheTtl 1h 미설정');
});

test('5개 option 모두 빌드 가능 (smoke)', () => {
  const options = ['shorter', 'longer', 'friendly', 'professional', 'custom'] as const;
  for (const opt of options) {
    const p = buildRefineSelectionPrompt({
      ...baseInput,
      option: opt,
      customInstruction: opt === 'custom' ? '테스트' : undefined,
    });
    assert.ok(p.systemBlocks.length > 0, `option=${opt} systemBlocks 비어 있음`);
    assert.ok(p.userPrompt.includes(`<option>${opt}</option>`), `option=${opt} 보간 실패`);
  }
});

// ── refine-selection 502 hotfix — tryParseRefinedFromLLM ──

test('prompt: task 블록이 XML 태그 형식 명시 (JSON 단독 사용 금지 — 502 회귀 차단)', () => {
  const p = buildRefineSelectionPrompt({ ...baseInput, option: 'shorter' });
  assert.ok(/&lt;refined&gt;|<refined>/.test(p.userPrompt), 'XML 태그 명시 누락');
});

test('parser: <refined>...</refined> XML 태그 추출 (신규 형식, 따옴표/줄바꿈 자유)', () => {
  const r = tryParseRefinedFromLLM('<refined>본문에 "따옴표" 와 줄바꿈\n이 들어감</refined>');
  assert.equal(r, '본문에 "따옴표" 와 줄바꿈\n이 들어감');
});

test('parser: legacy JSON fallback 1 — 직접 JSON', () => {
  const r = tryParseRefinedFromLLM('{"refined":"옛 형식"}');
  assert.equal(r, '옛 형식');
});

test('parser: legacy JSON fallback 2 — ```json fence', () => {
  const r = tryParseRefinedFromLLM('Here:\n```json\n{"refined":"fence 안"}\n```\nDone');
  assert.equal(r, 'fence 안');
});

test('parser: legacy JSON fallback 3 — 첫 { ~ 마지막 } 추출', () => {
  const r = tryParseRefinedFromLLM('explanation\n{"refined":"brace 추출"}\nmore');
  assert.equal(r, 'brace 추출');
});

test('parser: 빈 입력 / 잘못된 JSON / 매칭 0 → null', () => {
  assert.equal(tryParseRefinedFromLLM(''), null);
  assert.equal(tryParseRefinedFromLLM('   '), null);
  assert.equal(tryParseRefinedFromLLM('완전 자유 텍스트'), null);
  assert.equal(tryParseRefinedFromLLM('{"other": "field"}'), null);
});

test('parser: XML 우선 (XML + JSON 둘 다 있으면 XML)', () => {
  const r = tryParseRefinedFromLLM('<refined>XML 본문</refined>\n{"refined":"JSON 본문"}');
  assert.equal(r, 'XML 본문');
});

test('parser: 따옴표 escape 누락된 JSON (502 회귀 원인) → JSON 실패 + null (XML 강제)', () => {
  // production 에서 발견된 패턴 — Claude 가 refined 안에 escape 안 된 " 포함
  const broken = '{"refined": "압축된 "본문" 내용"}';
  const r = tryParseRefinedFromLLM(broken);
  // JSON parse 실패 + XML 없음 → null. UI 가 "다시 시도" 안내 (502 가 아닌 의미 있는 응답)
  assert.equal(r, null);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
