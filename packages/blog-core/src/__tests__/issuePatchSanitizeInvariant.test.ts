/**
 * 감사 #2 (Top 5) 회귀 가드 — issues 패치 후 HTML sanitize 통합.
 *
 * 보장 (양 앱 lockstep):
 *   - 양 앱 blog/page.tsx 가 lib/sanitize 의 sanitizeHtml 을 import 함
 *   - applyIssuesPatch 결과를 sanitizeHtml 통과 후 applyContentFilters 적용하는
 *     순서 패턴이 존재함
 *
 * 회귀 시: suggestion 이 LLM 출력이라 <script>/onerror= 등 XSS 벡터 가능.
 * sanitize 단계가 빠진 채 dangerouslySetInnerHTML / setGeneratedContent 로
 * 흐르면 즉시 XSS 표면.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

// eslint-disable-next-line no-console
console.log('\n>>> issuePatchSanitizeInvariant.test.ts');

const APPS: Array<{ label: string; path: string }> = [
  { label: 'next-app', path: 'next-app/app/(dashboard)/blog/page.tsx' },
  { label: 'public-app', path: 'public-app/app/(dashboard)/blog/page.tsx' },
];

for (const app of APPS) {
  test(`${app.label}: lib/sanitize 의 sanitizeHtml import`, () => {
    const p = resolve(REPO_ROOT, app.path);
    assert.ok(existsSync(p), `${app.label}: page.tsx 부재 — ${p}`);
    const src = readFileSync(p, 'utf-8');
    assert.ok(
      /import\s+\{\s*sanitizeHtml\s*\}\s+from\s+['"][^'"]*lib\/sanitize['"]/.test(src),
      `${app.label}: sanitizeHtml import 누락 — XSS 가드 회귀`,
    );
  });

  test(`${app.label}: applyIssuesPatch 결과를 sanitizeHtml 통과 후 applyContentFilters`, () => {
    const p = resolve(REPO_ROOT, app.path);
    const src = readFileSync(p, 'utf-8');
    // 패턴 추출: applyIssuesPatch(...) → sanitizeHtml(...) → applyContentFilters(...)
    // 정확한 패턴 — sanitizeHtml 호출이 applyIssuesPatch 와 applyContentFilters 사이에 있어야 함.
    // 단순화: const sanitized = sanitizeHtml(patch.html); 라인 존재 + applyContentFilters(sanitized) 라인 존재.
    assert.ok(
      /sanitizeHtml\s*\(\s*patch\.html\s*\)/.test(src),
      `${app.label}: sanitizeHtml(patch.html) 호출 누락 — issue 패치가 sanitize 우회`,
    );
    assert.ok(
      /applyContentFilters\s*\(\s*sanitized\s*\)/.test(src),
      `${app.label}: applyContentFilters(sanitized) 호출 누락 — sanitize 결과가 안 쓰임`,
    );
  });
}

// 양 앱 sanitizeHtml 자체의 최소 차단 패턴 (DOMPurify SSR fallback regex) 회귀 가드.
test('lib/sanitize: SSR fallback 가 <script> / <iframe> / on* 차단', () => {
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/lib/sanitize.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    // SSR fallback 정규식 키워드 — script / iframe / on\w+ 차단 확인
    assert.ok(/<script[\\s>]/i.test(src), `${app}: <script> 차단 regex 누락`);
    assert.ok(/<iframe[\\s>]/i.test(src), `${app}: <iframe> 차단 regex 누락`);
    assert.ok(/on\\w\+/i.test(src), `${app}: on* attribute 차단 regex 누락`);
  }
});

// prose-flow invariant 호환성 — DOMPurify ALLOWED_TAGS 에 의료 마크업 포함
test('lib/sanitize: ALLOWED_TAGS 에 의료 콘텐츠 필수 태그 (h2/h3/p/ul/li/strong) 포함', () => {
  for (const app of ['next-app', 'public-app']) {
    const p = resolve(REPO_ROOT, `${app}/lib/sanitize.ts`);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf-8');
    for (const tag of ['h2', 'h3', 'p', 'ul', 'li', 'strong']) {
      assert.ok(
        new RegExp(`['"]${tag}['"]`).test(src),
        `${app}: ALLOWED_TAGS 에 <${tag}> 누락 — prose-flow 콘텐츠 손실 위험`,
      );
    }
  }
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
