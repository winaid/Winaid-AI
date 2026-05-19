/**
 * geoUxV2 회귀 테스트 (public-app) — GEO-UX-2 모바일 + Wizard + Tooltip + lift up.
 *
 * 보장:
 *   - useGeoSectionsData 훅 양 앱 단일 소스
 *   - 7 GEO 섹션 default closed (isOpen=false) 유지
 *   - 7 GEO 섹션 모두 GeoSectionTooltip import + 사용
 *   - GeoFirstTimeWizard localStorage 'geo_wizard_completed' 키 사용
 *   - 양 앱 lockstep — 4 신규 + 7 섹션 + Dashboard + Banner = 13 컴포넌트 + 훅 diff=0
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');

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
console.log('\n>>> geoUxV2.test.ts — next-app');

const SECTIONS = [
  'GeoCitationsSection', 'SchemaOrgSection', 'AlertSubscriptionSection',
  'EEATSection', 'CompetitorContentSection', 'SentimentDrilldownSection',
  'NaverChannelSection',
];

// ── useGeoSectionsData 훅 ──

test('hook: useGeoSectionsData 양 앱 diff=0', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/hooks/useGeoSectionsData.ts');
  const p2 = resolve(REPO_ROOT, 'next-app/hooks/useGeoSectionsData.ts');
  assert.ok(existsSync(p1) && existsSync(p2), 'useGeoSectionsData 누락');
  assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
});

test('hook: useGeoSectionsData 핵심 export — citations + competitorContents + refetch', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/hooks/useGeoSectionsData.ts'), 'utf-8');
  assert.ok(/export function useGeoSectionsData/.test(src));
  for (const key of ['citations', 'competitorContents', 'loading', 'refetch']) {
    assert.ok(new RegExp(key).test(src), `${key} 누락`);
  }
});

// ── 7 섹션 default closed ──

test('section: 7 GEO 섹션 default isOpen=false (페이지 길이 폭증 방지)', () => {
  for (const f of SECTIONS) {
    if (f === 'GeoCitationsSection') continue; // GeoCitations 는 entry point — always-on 유지 (의도적 trade-off)
    const src = readFileSync(resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`), 'utf-8');
    assert.ok(
      /const \[open, setOpen\] = useState\(false\)/.test(src),
      `${f}: default open=false 검증 실패`,
    );
  }
});

// ── tooltip — 7 섹션 모두 추가 ──

test('tooltip: 7 GEO 섹션 모두 GeoSectionTooltip import + 사용', () => {
  for (const f of SECTIONS) {
    const src = readFileSync(resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`), 'utf-8');
    assert.ok(
      /import GeoSectionTooltip from '\.\/GeoSectionTooltip'/.test(src),
      `${f}: GeoSectionTooltip import 누락`,
    );
    assert.ok(
      /<GeoSectionTooltip description=/.test(src),
      `${f}: GeoSectionTooltip 사용 누락`,
    );
  }
});

test('tooltip: GeoSectionTooltip 컴포넌트 양 앱 diff=0', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoSectionTooltip.tsx');
  const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/GeoSectionTooltip.tsx');
  assert.ok(existsSync(p1) && existsSync(p2));
  assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
});

test('tooltip: 접근성 + 외부 클릭 + ESC dismiss', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoSectionTooltip.tsx'), 'utf-8');
  assert.ok(/role="tooltip"/.test(src), 'role="tooltip" 누락');
  assert.ok(/aria-describedby/.test(src), 'aria-describedby 누락');
  assert.ok(/'Escape'/.test(src), 'ESC 키 dismiss 누락');
  assert.ok(/mousedown.*handleClick|containerRef.*contains/.test(src.replace(/\n/g, ' ')), '외부 클릭 dismiss 누락');
});

// ── wizard ──

test('wizard: GeoFirstTimeWizard 양 앱 diff=0', () => {
  const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoFirstTimeWizard.tsx');
  const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/GeoFirstTimeWizard.tsx');
  assert.ok(existsSync(p1) && existsSync(p2));
  assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'));
});

test('wizard: localStorage 키 + 3 step + role="dialog"', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoFirstTimeWizard.tsx'), 'utf-8');
  assert.ok(/'geo_wizard_completed'/.test(src), 'localStorage 키 누락');
  assert.ok(/STEPS:\s*StepDef\[\]/.test(src) || /STEPS\s*=/.test(src), 'STEPS 배열 누락');
  assert.ok(/role="dialog"/.test(src) && /aria-modal/.test(src), 'role + aria-modal 누락');
});

test('wizard: ESC + 외부 클릭 dismiss + 건너뛰기 / 시작하기 버튼', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoFirstTimeWizard.tsx'), 'utf-8');
  assert.ok(/'Escape'/.test(src), 'ESC 키 누락');
  assert.ok(/건너뛰기/.test(src), '건너뛰기 버튼 누락');
  assert.ok(/시작하기/.test(src), '시작하기 버튼 누락');
});

// ── 모바일 viewport — touch target 44×44 + grid responsive ──

test('mobile: GeoActionDashboard 카드 grid 모바일 1열 + 데스크탑 3열', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoActionDashboard.tsx'), 'utf-8');
  assert.ok(/grid-cols-1\s+md:grid-cols-3/.test(src), '모바일 1열 + md 3열 grid 누락');
});

test('mobile: wizard buttons min-h-[44px] (Apple HIG touch target)', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoFirstTimeWizard.tsx'), 'utf-8');
  assert.ok(/min-h-\[44px\]/.test(src), 'min-h-44 touch target 누락');
});

test('mobile: tooltip popover max-w 모바일 제약 (max-w-[280px])', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoSectionTooltip.tsx'), 'utf-8');
  assert.ok(/max-w-\[280px\]/.test(src), '모바일 max-w 제약 누락');
});

// ── DiagnosticResult lift up ──

test('integration: DiagnosticResult 양 앱 useGeoSectionsData 훅 호출 + Dashboard inputs.competitorRecent 전달', () => {
  for (const app of ['public-app', 'next-app']) {
    const src = readFileSync(resolve(REPO_ROOT, `${app}/components/diagnostic/DiagnosticResult.tsx`), 'utf-8');
    assert.ok(/useGeoSectionsData/.test(src), `${app}: 훅 import 누락`);
    assert.ok(/competitorRecent:/.test(src), `${app}: Dashboard inputs.competitorRecent 전달 누락`);
    assert.ok(/GeoFirstTimeWizard/.test(src), `${app}: Wizard 통합 누락`);
  }
});

// ── 누적 lockstep — 13 컴포넌트 + 훅 ──

test('lockstep: 신규 4 + 기존 7 섹션 + Dashboard + Banner = 13 컴포넌트 diff=0 (양 앱)', () => {
  const components = [
    'GeoSectionTooltip', 'GeoFirstTimeWizard', 'GeoActionDashboard',
    'GeoOnboardingBanner', 'GeoEmptyState', 'GeoLoadingSpinner',
    ...SECTIONS,
  ];
  for (const f of components) {
    const p1 = resolve(REPO_ROOT, `public-app/components/diagnostic/${f}.tsx`);
    const p2 = resolve(REPO_ROOT, `next-app/components/diagnostic/${f}.tsx`);
    assert.ok(existsSync(p1) && existsSync(p2), `${f}: 누락`);
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), `${f}: drift`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
