/**
 * 카드뉴스 제거 회귀 가드 (PR1 / 2026-05-18).
 *
 * 카드뉴스 기능을 제거했다. 향후 누가 실수로 다시 추가하지 않도록 invariant 로 차단.
 * 회귀 시: 사이드바·라우트·placeholder 다시 살아남 → 사용자 클릭 시 미완성 신호 노출.
 *
 * 추가하려면: 이 테스트부터 지우고 시작 (의도적 변경 표시).
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`✗ ${name}\n    ${msg}`);
    console.log(`  ✗ ${name}\n    ${msg}`);
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

console.log('\n>>> cardNewsRemovedInvariant.test.ts');

// ── 1. 디렉토리·파일 부재 ─────────────────────────────────────────────

const FORBIDDEN_PATHS = [
  // 라우트
  'public-app/app/(dashboard)/card_news',
  'public-app/app/api/card-news',
  'public-app/app/api/video/card-to-shorts',
  'next-app/app/(dashboard)/card_news',
  // 컴포넌트
  'public-app/components/card-news',
  'next-app/components/CardNewsRenderer.tsx',
  'next-app/components/CardTemplateManager.tsx',
  'next-app/components/CardRegenModal.tsx',
  // lib
  'public-app/lib/cardNewsPrompt.ts',
  'public-app/lib/cardDownloadUtils.ts',
  'next-app/lib/cardNewsPrompt.ts',
  'next-app/lib/cardNewsDesignTemplates.ts',
  'next-app/lib/cardAiActions.ts',
  'next-app/lib/cardTemplateService.ts',
  // blog-core
  'packages/blog-core/src/cardNewsLayouts.ts',
  'packages/blog-core/src/brandPreset.ts',
  'packages/blog-core/src/normalize/leakFilterJson.ts',
];

for (const p of FORBIDDEN_PATHS) {
  test(`삭제됨: ${p}`, () => {
    const full = resolve(REPO_ROOT, p);
    assert.ok(!existsSync(full), `${p} 가 다시 생성됨. 회귀.`);
  });
}

// ── 2. 의존성 부재 (package.json) ────────────────────────────────────

test('public-app/package.json: konva / react-konva / jspdf 미포함', () => {
  const pkg = JSON.parse(
    require('node:fs').readFileSync(resolve(REPO_ROOT, 'public-app/package.json'), 'utf-8'),
  ) as { dependencies?: Record<string, string> };
  const deps = pkg.dependencies || {};
  for (const dep of ['konva', 'react-konva', 'jspdf']) {
    assert.ok(!(dep in deps), `public-app 에 ${dep} 가 다시 추가됨. 카드뉴스 외 사용처 없으니 제거.`);
  }
});

// ── 3. 소스 트리 grep — 'card_news' literal 부재 ────────────────────

function walkTs(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '_archive') continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, out);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

test('소스 트리에 "card_news" / "cardNews" 문자열 0건', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const files: string[] = [];
  for (const sub of ['public-app', 'next-app', 'packages/blog-core/src']) {
    walkTs(resolve(REPO_ROOT, sub), files);
  }
  const offenders: string[] = [];
  for (const f of files) {
    // 본 invariant 파일 자체는 키워드 보유 — 제외
    if (f.endsWith('cardNewsRemovedInvariant.test.ts')) continue;
    const src = fs.readFileSync(f, 'utf-8');
    if (/card_news|cardNews/i.test(src)) offenders.push(f.replace(REPO_ROOT + '/', ''));
  }
  assert.equal(offenders.length, 0, `card_news/cardNews 흔적 발견 (${offenders.length}건):\n  ${offenders.join('\n  ')}`);
});

// ── 결과 ───────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
