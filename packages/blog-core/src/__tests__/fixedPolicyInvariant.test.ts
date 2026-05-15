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

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
