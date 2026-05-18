/**
 * 고정 정책 (CLAUDE.md "고정 정책" 섹션) 회귀 가드.
 *
 * 보장:
 *  - CLAUDE.md 본문에 P-1 / P-2 / "300" / "어드민 = 풀 액세스" 키워드 모두 존재
 *  - 양 앱 image route.ts 의 maxDuration 값이 300 이상
 *
 * 회귀 시: P-1 위반 → 어드민이 본인 도구에서 차단 / P-2 위반 → gpt-image-2 502 회귀.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// __tests__ 디렉토리 위치 → 레포 root 추정
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

// eslint-disable-next-line no-console
console.log('\n>>> fixedPolicyInvariant.test.ts');

test('CLAUDE.md 가 레포 root 에 존재', () => {
  const p = resolve(REPO_ROOT, 'CLAUDE.md');
  assert.ok(existsSync(p), `CLAUDE.md 부재 — 경로: ${p}`);
});

test('CLAUDE.md: P-1 키워드 존재', () => {
  const claudeMd = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
  assert.ok(claudeMd.includes('P-1'), 'P-1 키워드 누락');
  assert.ok(
    claudeMd.includes('어드민 = 풀 액세스') ||
      claudeMd.includes('어드민 = 풀액세스') ||
      claudeMd.includes('내부 어드민 = 풀 액세스'),
    '"어드민 = 풀 액세스" 표현 누락',
  );
  assert.ok(claudeMd.includes('rate limit'), 'P-1 본문 핵심어(rate limit) 누락');
});

test('CLAUDE.md: P-2 키워드 존재', () => {
  const claudeMd = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
  assert.ok(claudeMd.includes('P-2'), 'P-2 키워드 누락');
  assert.ok(/300\s*초|300s|300_000|300\b/.test(claudeMd), 'P-2 본문 300 누락');
  assert.ok(claudeMd.includes('이미지 생성 타임아웃'), 'P-2 본문 핵심어(이미지 생성 타임아웃) 누락');
});

test('CLAUDE.md: 고정 정책 섹션 헤더 존재', () => {
  const claudeMd = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
  assert.ok(
    claudeMd.includes('고정 정책 (invariant)') || claudeMd.includes('고정 정책'),
    '"고정 정책" 섹션 헤더 누락',
  );
});

test('next-app image route.ts: maxDuration === 300', () => {
  const p = resolve(REPO_ROOT, 'next-app/app/api/image/route.ts');
  assert.ok(existsSync(p), `route.ts 부재 — ${p}`);
  const src = readFileSync(p, 'utf-8');
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  assert.ok(m, 'export const maxDuration 선언 누락');
  const val = parseInt(m![1], 10);
  assert.ok(val >= 300, `maxDuration=${val} 인데 ≥300 이어야 함 (P-2 위반)`);
});

test('public-app image route.ts: maxDuration === 300', () => {
  const p = resolve(REPO_ROOT, 'public-app/app/api/image/route.ts');
  assert.ok(existsSync(p), `route.ts 부재 — ${p}`);
  const src = readFileSync(p, 'utf-8');
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  assert.ok(m, 'export const maxDuration 선언 누락');
  const val = parseInt(m![1], 10);
  assert.ok(val >= 300, `maxDuration=${val} 인데 ≥300 이어야 함 (P-2 위반)`);
});

test('public-app card-news/generate-images route: maxDuration === 300 (P-2 정의 "이미지 생성" 포함)', () => {
  const p = resolve(REPO_ROOT, 'public-app/app/api/card-news/generate-images/route.ts');
  assert.ok(existsSync(p), `route.ts 부재 — ${p}`);
  const src = readFileSync(p, 'utf-8');
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  assert.ok(m, 'export const maxDuration 선언 누락 — card-news 슬라이드 이미지 생성도 P-2 영역');
  const val = parseInt(m![1], 10);
  assert.ok(val >= 300, `maxDuration=${val} 인데 ≥300 이어야 함 (P-2 위반)`);
});

test('양 앱 hospital-images/upload route: maxDuration === 300 (P-2 정의 "라이브러리 후처리" 포함)', () => {
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/app/api/hospital-images/upload/route.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
    assert.ok(m, `${app}: maxDuration 선언 누락`);
    const val = parseInt(m![1], 10);
    assert.ok(val >= 300, `${app}: maxDuration=${val} 인데 ≥300 이어야 함 (P-2 위반)`);
  }
});

test('양 앱 .env.example: OPENAI_IMAGE_MODEL snapshot pin 안내 존재 (silent 업그레이드 차단)', () => {
  // .env.example 에 OPENAI_IMAGE_MODEL 키 안내가 있어야 함 (활성화 또는 주석 처리 OK).
  // 운영자가 production 에 snapshot pin 적용 가능하도록 가시화.
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/.env.example`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    assert.ok(
      /OPENAI_IMAGE_MODEL\s*=/.test(src),
      `${app}/.env.example: OPENAI_IMAGE_MODEL 키 안내 누락`,
    );
    // 권장 snapshot pin 값 (gpt-image-2-YYYY-MM-DD) 이 적어도 한 곳에 명시돼야 운영자가 어떤 값을 넣을지 안다.
    assert.ok(
      /gpt-image-2-\d{4}-\d{2}-\d{2}/.test(src),
      `${app}/.env.example: snapshot pin 권장 값 (gpt-image-2-YYYY-MM-DD) 누락`,
    );
  }
});

test('README.md: OPENAI_IMAGE_MODEL 환경변수 문서화 존재', () => {
  const p = resolve(REPO_ROOT, 'README.md');
  if (!existsSync(p)) return;
  const src = readFileSync(p, 'utf-8');
  assert.ok(src.includes('OPENAI_IMAGE_MODEL'), 'README.md 환경변수 표에 OPENAI_IMAGE_MODEL 누락');
  assert.ok(/snapshot\s*pin/i.test(src), 'README.md 에 snapshot pin 권장 안내 누락');
});

test('docs/INVARIANTS.md: P-1 / P-2 cross-reference 존재', () => {
  const p = resolve(REPO_ROOT, 'docs/INVARIANTS.md');
  if (!existsSync(p)) {
    // INVARIANTS.md 가 없으면 본 테스트 skip (선택 항목)
    // eslint-disable-next-line no-console
    console.log('    (INVARIANTS.md 부재 — skip)');
    return;
  }
  const md = readFileSync(p, 'utf-8');
  assert.ok(md.includes('P-1'), 'INVARIANTS.md 에 P-1 cross-reference 누락');
  assert.ok(md.includes('P-2'), 'INVARIANTS.md 에 P-2 cross-reference 누락');
});

// ── refine-selection 신규 라우트 invariant (양 앱 lockstep) ──────────────

test('양 앱 refine-selection route: maxDuration ≥ 60 (텍스트 LLM)', () => {
  // 본 라우트는 P-2 (이미지 라우트 300s) 직접 대상 아님. 텍스트 LLM 만이라 60s 충분.
  // 회귀 가드: maxDuration 미선언 또는 < 60 차단.
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/app/api/refine-selection/route.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
    assert.ok(m, `${app}: refine-selection maxDuration 선언 누락`);
    const val = parseInt(m![1], 10);
    assert.ok(val >= 60, `${app}: refine-selection maxDuration=${val} 인데 ≥60 권장`);
  }
});

test('next-app refine-selection: 인증 가드 (checkAuth) 존재', () => {
  // P-1 invariant — admin cookie 통과 자동 면제. checkAuth 가 admin_session 보유 시 OK 반환.
  const p = resolve(REPO_ROOT, 'next-app/app/api/refine-selection/route.ts');
  if (!existsSync(p)) return;
  const src = readFileSync(p, 'utf-8');
  assert.ok(/checkAuth\s*\(/.test(src), 'next-app refine-selection: checkAuth 호출 누락');
});

test('public-app refine-selection: 게스트 차단 (resolveImageOwner === guest → 401)', () => {
  // refine-selection 은 0.1 credit 차감 대상 — 식별된 user 필요. 게스트 차단 invariant.
  const p = resolve(REPO_ROOT, 'public-app/app/api/refine-selection/route.ts');
  if (!existsSync(p)) return;
  const src = readFileSync(p, 'utf-8');
  assert.ok(
    /owner\s*===\s*'guest'/.test(src),
    'public-app refine-selection: 게스트 차단 분기 누락',
  );
  assert.ok(/401/.test(src), 'public-app refine-selection: 401 응답 누락');
});

test('양 앱 refine-selection: 응답 sanitize chain (stripPromptLeakage + applyContentFilters + sanitizeHtml)', () => {
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/app/api/refine-selection/route.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    assert.ok(/stripPromptLeakage/.test(src), `${app}: stripPromptLeakage 호출 누락`);
    assert.ok(/applyContentFilters/.test(src), `${app}: applyContentFilters 호출 누락`);
    assert.ok(/sanitizeHtml/.test(src), `${app}: sanitizeHtml 호출 누락`);
  }
});

test('양 앱 refine-selection: customInstruction injection guard (stripInjectionForUse + sanitizePromptInput)', () => {
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/app/api/refine-selection/route.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    assert.ok(/stripInjectionForUse/.test(src), `${app}: stripInjectionForUse 누락 (인젝션 가드)`);
    assert.ok(/sanitizePromptInput/.test(src), `${app}: sanitizePromptInput 누락 (200자 cap)`);
  }
});

// ── useHospitalStyle 토글 invariant (양 앱 lockstep) ─────────────────

test('GenerationRequest 타입에 useHospitalStyle?: boolean 존재', () => {
  // types.ts 의 GenerationRequest interface 본문 검사 — 필드 부재 시 양 앱
  // route 가 컴파일 통과해도 토글 자체가 무시되는 회귀.
  const p = resolve(REPO_ROOT, 'packages/blog-core/src/types.ts');
  if (!existsSync(p)) return;
  const src = readFileSync(p, 'utf-8');
  assert.ok(/useHospitalStyle\?\s*:\s*boolean/.test(src), 'GenerationRequest.useHospitalStyle 필드 누락');
});

test('양 앱 generate/blog route: useHospitalStyle 토글 wiring 존재', () => {
  // 라우트가 토글을 받아 빌더에 전달하는 분기가 존재해야 함. 미존재 시
  // 빌더 단의 분기는 작동하나 lookup 자체는 skip 안 됨 (네트워크 낭비).
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/app/api/generate/blog/route.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    assert.ok(
      /useHospitalStyle\s*!==\s*false/.test(src),
      `${app}: useHospitalStyle 분기 누락 — DB 프로파일 lookup skip 작동 안 함`,
    );
  }
});

test('양 앱 generate/blog/review route: useHospitalStyle 토글 wiring 존재', () => {
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/app/api/generate/blog/review/route.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    assert.ok(
      /useHospitalStyle\s*!==\s*false/.test(src),
      `${app}: review 라우트 useHospitalStyle 분기 누락`,
    );
    assert.ok(
      /useHospitalStyle:\s*body\.useHospitalStyle/.test(src),
      `${app}: buildBlogReviewPrompt ctx 에 useHospitalStyle forward 누락`,
    );
  }
});

test('buildLearnedStyleBlock 본문에 useHospitalStyle === false 분기 존재', () => {
  const p = resolve(REPO_ROOT, 'packages/blog-core/src/blogPrompt.ts');
  if (!existsSync(p)) return;
  const src = readFileSync(p, 'utf-8');
  assert.ok(
    /req\.useHospitalStyle\s*===\s*false/.test(src),
    'buildLearnedStyleBlock 또는 buildBlogReviewPrompt 에 useHospitalStyle === false 분기 누락',
  );
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
