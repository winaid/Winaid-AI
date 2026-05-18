/**
 * 양 앱 blog 영역 컴포넌트 lockstep invariant (PR 2026-05-18).
 *
 * 배경: 내부 next-app 에만 있던 이미지 교체·삽입 기능을 public-app 에 lockstep
 * 회복. 다음 5개 UI 컴포넌트는 양 앱이 **완전 동일**해야 한다.
 * 한쪽만 수정 시 즉시 fail → 다른 쪽도 함께 sync 강제.
 *
 * 게이트 로직 (useCredit / gateGuestRequest / useAuthGuard) 은 page.tsx 에만
 * 있으므로 본 invariant 범위 외 — 양 앱이 의도적으로 다름.
 *
 * 신규 lockstep 추가 시 LOCKSTEP_FILES 에 한 줄만 더하면 된다.
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
console.log('\n>>> blogLockstepInvariant.test.ts');

// 양 앱이 100% 동일해야 하는 파일 (path: next-app, path: public-app)
const LOCKSTEP_FILES: Array<{ label: string; next: string; pub: string }> = [
  {
    label: 'ImageReplaceModal — 라이브러리 이미지 교체 모달',
    next: 'next-app/components/blog/ImageReplaceModal.tsx',
    pub: 'public-app/components/blog/ImageReplaceModal.tsx',
  },
  {
    label: 'ImageInsertModal — 단락 hover [+] / placeholder 클릭 모달',
    next: 'next-app/components/ImageInsertModal.tsx',
    pub: 'public-app/components/ImageInsertModal.tsx',
  },
  {
    label: 'ImageInsertButton — 단락 사이 [+] 트리거 버튼',
    next: 'next-app/components/ImageInsertButton.tsx',
    pub: 'public-app/components/ImageInsertButton.tsx',
  },
  {
    label: 'GenerationResult — 결과 패널 + 인라인 편집 + SelectionRefineToolbar',
    next: 'next-app/components/GenerationResult.tsx',
    pub: 'public-app/components/GenerationResult.tsx',
  },
  {
    label: 'BlogResultArea — 생성 중 / 결과 / 에러 / 빈 상태 렌더링',
    next: 'next-app/app/(dashboard)/blog/BlogResultArea.tsx',
    pub: 'public-app/app/(dashboard)/blog/BlogResultArea.tsx',
  },
];

for (const { label, next, pub } of LOCKSTEP_FILES) {
  test(`diff=0: ${label}`, () => {
    const nextPath = resolve(REPO_ROOT, next);
    const pubPath = resolve(REPO_ROOT, pub);
    assert.ok(existsSync(nextPath), `next-app 파일 부재: ${next}`);
    assert.ok(existsSync(pubPath), `public-app 파일 부재: ${pub}`);
    const nextSrc = readFileSync(nextPath, 'utf-8');
    const pubSrc = readFileSync(pubPath, 'utf-8');
    if (nextSrc !== pubSrc) {
      // diff hint — 첫 다른 라인 위치
      const nextLines = nextSrc.split('\n');
      const pubLines = pubSrc.split('\n');
      let firstDiff = -1;
      const maxLen = Math.min(nextLines.length, pubLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (nextLines[i] !== pubLines[i]) {
          firstDiff = i + 1;
          break;
        }
      }
      if (firstDiff === -1) firstDiff = maxLen + 1;
      throw new Error(
        `양 앱 drift 발견. 첫 다른 라인 ${firstDiff} (next ${nextLines.length}줄 / pub ${pubLines.length}줄). ` +
        `한쪽 수정 시 반드시 양쪽 동시 sync.`,
      );
    }
  });
}

// 결과
// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
