/**
 * 블로그 UI 단순화 hardcode 회귀 가드 — handoff §12.1.
 *
 * §12.1 작업 (이미 closure):
 *   1) 블로그 제목 입력 UI 제거 → LLM 자동 추천 (page.tsx:requestAutoTitle)
 *   2) 글자수 2000 고정 → page.tsx:`const textLength = 2000`
 *   3) 이미지 스타일 'photo' 고정 → page.tsx:`const imageStyle: ImageStyle = 'photo'`
 *
 * 향후 회귀 시나리오 차단:
 *   - 누군가 상수를 state 로 되돌림 → fail
 *   - BlogFormPanel 에 blogTitle/textLength/imageStyle props 다시 추가 → fail
 *   - UI 옵션 (input/select) 다시 추가 → fail
 *
 * 검증 방식: source file 내용 regex (BlogFormPanel.tsx props interface +
 * page.tsx hardcode 라인). component render 없이 정적 검증.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const PAGE = readFileSync(join(ROOT, 'app/(dashboard)/blog/page.tsx'), 'utf-8');
const FORM = readFileSync(join(ROOT, 'app/(dashboard)/blog/BlogFormPanel.tsx'), 'utf-8');

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
console.log('\n>>> blogUiInvariant.test.ts');

/** 코드 영역만 추출 — 주석·문자열은 잘못된 양성 매칭 방지를 위해 함께 둠 (regex 로 의미적 위치 검사). */
function stripComments(src: string): string {
  // 단일 줄 주석 // ... + 블록 주석 /* ... */ 제거
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const PAGE_CODE = stripComments(PAGE);
const FORM_CODE = stripComments(FORM);

// ── #2 글자수 2000 hardcode ──

test('page.tsx: `const textLength = 2000;` hardcode 존재', () => {
  assert.ok(
    /const\s+textLength\s*=\s*2000\b/.test(PAGE_CODE),
    'textLength 가 const 2000 hardcode 가 아님 — state 로 회귀했거나 값 변경됨',
  );
});

test('page.tsx: textLength 가 useState 로 선언되지 않음 (회귀 가드)', () => {
  assert.ok(
    !/\[\s*textLength\s*,\s*setTextLength\s*\]\s*=\s*useState/.test(PAGE_CODE),
    'textLength 가 useState 로 회귀',
  );
});

// ── #3 이미지 스타일 'photo' hardcode ──

test("page.tsx: `const imageStyle: ImageStyle = 'photo';` hardcode 존재", () => {
  assert.ok(
    /const\s+imageStyle\s*:\s*ImageStyle\s*=\s*['"]photo['"]/.test(PAGE_CODE),
    "imageStyle 가 const 'photo' hardcode 가 아님",
  );
});

test('page.tsx: imageStyle 가 useState 로 선언되지 않음 (회귀 가드)', () => {
  assert.ok(
    !/\[\s*imageStyle\s*,\s*setImageStyle\s*\]\s*=\s*useState/.test(PAGE_CODE),
    'imageStyle 가 useState 로 회귀',
  );
});

// ── #1 제목 UI 제거 + AI 자동 추천 ──

test('page.tsx: requestAutoTitle 헬퍼 존재 (LLM 자동 제목 추천)', () => {
  assert.ok(
    /const\s+requestAutoTitle\s*=\s*async/.test(PAGE_CODE) ||
      /function\s+requestAutoTitle/.test(PAGE_CODE),
    'requestAutoTitle 헬퍼 누락 — AI 자동 제목 흐름 깨짐',
  );
});

test('page.tsx: handleSubmit 흐름에서 requestAutoTitle 호출', () => {
  assert.ok(
    /await\s+requestAutoTitle\s*\(/.test(PAGE_CODE),
    'requestAutoTitle 호출이 없음 — 빈 제목 자동 추천 흐름 회귀',
  );
});

// ── BlogFormPanel props 부재 (UI 단순화 회귀 가드) ──

const FORBIDDEN_PROPS = ['blogTitle', 'textLength', 'imageStyle', 'customPrompt'];

for (const prop of FORBIDDEN_PROPS) {
  test(`BlogFormPanel.tsx: BlogFormPanelProps 에 "${prop}" 필드 부재`, () => {
    // BlogFormPanelProps interface 영역 안에서 prop: type 라인 검색
    const interfaceMatch = FORM_CODE.match(
      /export\s+interface\s+BlogFormPanelProps\s*\{([\s\S]*?)\}\s*$/m,
    );
    assert.ok(interfaceMatch, 'BlogFormPanelProps interface 추출 실패');
    const interfaceBody = interfaceMatch[1];
    // "blogTitle:" / "blogTitle?:" 패턴 검사 (callback setBlogTitle 도 포함)
    const re = new RegExp(`\\b${prop}\\??\\s*:`);
    const reSetter = new RegExp(`\\bset${prop[0].toUpperCase()}${prop.slice(1)}\\??\\s*:`);
    assert.ok(
      !re.test(interfaceBody),
      `BlogFormPanelProps 에 "${prop}" 필드 회귀`,
    );
    assert.ok(
      !reSetter.test(interfaceBody),
      `BlogFormPanelProps 에 "set${prop[0].toUpperCase()}${prop.slice(1)}" setter 회귀`,
    );
  });
}

// ── handleSubmit 페이로드 invariant ──

test('page.tsx: GenerationRequest 페이로드에 textLength·imageStyle 가 const 변수로 전달', () => {
  // const request: GenerationRequest = { ... textLength, ... imageStyle, ... }
  // — 직접 변수명 참조 (literal 값이 아닌 const 참조) 임을 확인
  const requestMatch = PAGE_CODE.match(
    /const\s+request\s*:\s*GenerationRequest\s*=\s*\{([\s\S]*?)\n\s*\}\s*;/,
  );
  assert.ok(requestMatch, 'GenerationRequest 페이로드 추출 실패');
  const body = requestMatch[1];
  // textLength, 또는 textLength: textLength 형태 (둘 다 const 변수 참조)
  assert.ok(
    /\btextLength\s*[,:}\n]/.test(body),
    'GenerationRequest 페이로드에 textLength 누락',
  );
  assert.ok(
    /\bimageStyle\s*[,:}\n]/.test(body),
    'GenerationRequest 페이로드에 imageStyle 누락',
  );
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
