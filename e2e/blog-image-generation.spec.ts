/**
 * 블로그 이미지 0~5장 실측 E2E 검증 — Playwright
 *
 * 대상: https://preview.story-darugi.com (실제 API)
 * 주제: 임플란트 (고정)
 * 스타일: photo 0~5장 각 1회 + illustration 5장 1회 + photo 5장 추가 1회
 *
 * 실행:
 *   E2E_BASE_URL=https://preview.story-darugi.com npx playwright test
 */
import { test, expect } from '@playwright/test';
import {
  runBlogGeneration,
  type BlogGenerationResult,
  type ImageStyleOption,
} from './blog-generation.helper';

const TOPIC = '임플란트 시술 비용과 과정 총정리';
const TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '180000', 10);

// ── 결과 테이블 행 ──
interface ResultRow {
  count: number;
  style: ImageStyleOption;
  selected: number;
  planned: number;
  returned: number;
  ai: number;
  template: number;
  placeholder: number;
  inserted: number;
  persisted: number;
  heroResult: string;
  heroAIHit: string;
  subAICoverage: string;
  totalMs: number;
  warning: string;
  verdict: string;
}

const allResults: ResultRow[] = [];

function buildRow(label: string, count: number, style: ImageStyleOption, r: BlogGenerationResult): ResultRow {
  const s = r.summary;
  const ai = s?.ai ?? -1;
  const template = s?.template ?? -1;
  const returned = s?.returned ?? -1;

  // hero 판정
  const heroAIHit = count === 0 ? 'N/A'
    : r.heroResult === 'ai-image' ? 'YES'
    : r.heroResult === 'template' ? 'NO(tpl)'
    : r.heroResult;

  // sub AI coverage (hero 제외)
  let subAICoverage = 'N/A';
  if (count > 1 && s && s.returned > 1) {
    const heroAI = r.heroResult === 'ai-image' ? 1 : 0;
    const subAI = ai - heroAI;
    const subTotal = returned - 1;
    subAICoverage = subTotal > 0 ? `${Math.round((subAI / subTotal) * 100)}%` : 'N/A';
  }

  // 판정
  let verdict = '?';
  if (count === 0) {
    verdict = (!r.resultVisible) ? 'FAIL(no result)'
      : (r.imageCount === 0 && (!s || s.selected === 0)) ? 'PASS' : 'FAIL';
  } else if (count >= 1 && count <= 3) {
    if (!r.resultVisible) { verdict = 'FAIL(no result)'; }
    else if (s && s.selected === count && s.returned === count) {
      verdict = template > 0 && count <= 2 ? 'PARTIAL' : 'PASS';
    } else { verdict = 'FAIL(mismatch)'; }
  } else {
    // 4~5장
    if (!r.resultVisible) { verdict = 'FAIL(no result)'; }
    else if (!s) { verdict = 'FAIL(no summary)'; }
    else if (s.selected !== count || s.returned !== count) { verdict = 'FAIL(mismatch)'; }
    else if (r.heroResult === 'template') { verdict = 'FAIL(hero=tpl)'; }
    else if (template >= 2) { verdict = 'FAIL(tpl>=2)'; }
    else {
      const aiCov = returned > 0 ? (ai / returned) * 100 : 0;
      if (aiCov < 60) { verdict = 'FAIL(aiCov<60%)'; }
      else if (aiCov < 80) { verdict = 'PARTIAL'; }
      else { verdict = 'PASS'; }
    }
  }

  const warning = r.hasImageWarning ? r.warningText.substring(0, 60) : '';

  return {
    count, style,
    selected: s?.selected ?? -1,
    planned: s?.planned ?? -1,
    returned: s?.returned ?? -1,
    ai, template, placeholder: s?.placeholder ?? -1,
    inserted: r.persistedInfo.inserted,
    persisted: r.persistedInfo.persisted,
    heroResult: r.heroResult,
    heroAIHit,
    subAICoverage,
    totalMs: r.durationMs,
    warning,
    verdict,
  };
}

function printReport(label: string, r: BlogGenerationResult) {
  const s = r.summary;
  console.log(`\n═══ ${label} ═══`);
  console.log(`결과화면: ${r.resultVisible ? '✅' : '❌'}`);
  console.log(`이미지렌더: ${r.imageCount}장 / 경고: ${r.hasImageWarning ? r.warningText.substring(0, 80) : '없음'}`);
  console.log(`소요시간: ${(r.durationMs / 1000).toFixed(1)}s`);
  console.log(`heroResult: ${r.heroResult}`);
  if (s) {
    console.log(`selected=${s.selected} planned=${s.planned} returned=${s.returned} ai=${s.ai} template=${s.template} placeholder=${s.placeholder}`);
    const aiCov = s.returned > 0 ? Math.round((s.ai / s.returned) * 100) : 0;
    console.log(`aiCoverage=${aiCov}%`);
  } else {
    console.log('IMG-SUMMARY 로그 미수집');
  }
  // 핵심 로그 출력
  if (r.logs.imgContract.length > 0) console.log(`[IMG-CONTRACT] ${r.logs.imgContract.join(' | ')}`);
  if (r.logs.imgPlan.length > 0) console.log(`[IMG-PLAN] ${r.logs.imgPlan.join(' | ')}`);
  if (r.logs.imgTier.length > 0) r.logs.imgTier.forEach(l => console.log(`  ${l}`));
  if (r.logs.imgFinal.length > 0) r.logs.imgFinal.forEach(l => console.log(`  ${l}`));
  if (r.logs.imgSession.length > 0) r.logs.imgSession.forEach(l => console.log(`  ${l}`));
  if (r.logs.imgHeroRetry.length > 0) r.logs.imgHeroRetry.forEach(l => console.log(`  ${l}`));
  if (r.debugVerify) console.log(`[DEBUG-VERIFY] ${r.debugVerify}`);
  console.log(`═══════════════════\n`);
}

function printFinalTable() {
  console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           블로그 이미지 실측 검증 결과표                                        ║');
  console.log('╠══════╤═══════════════╤══════╤══════╤══════╤════╤═════╤═════╤══════╤═══════╤════════╤═════════════╣');
  console.log('║count │ style         │sel   │plan  │ret   │ai  │tpl  │ph   │ins   │per    │heroAI  │verdict      ║');
  console.log('╠══════╪═══════════════╪══════╪══════╪══════╪════╪═════╪═════╪══════╪═══════╪════════╪═════════════╣');
  for (const r of allResults) {
    const line = `║${String(r.count).padStart(5)} │${r.style.padEnd(14)} │${String(r.selected).padStart(5)} │${String(r.planned).padStart(5)} │${String(r.returned).padStart(5)} │${String(r.ai).padStart(3)} │${String(r.template).padStart(4)} │${String(r.placeholder).padStart(4)} │${String(r.inserted).padStart(5)} │${String(r.persisted).padStart(6)} │${r.heroAIHit.padEnd(7)} │${r.verdict.padEnd(12)} ║`;
    console.log(line);
  }
  console.log('╚══════╧═══════════════╧══════╧══════╧══════╧════╧═════╧═════╧══════╧═══════╧════════╧═════════════╝');

  // 5장 KPI 비교
  const fivePhoto = allResults.filter(r => r.count === 5 && r.style === 'photo');
  const fiveIllu = allResults.filter(r => r.count === 5 && r.style === 'illustration');
  if (fivePhoto.length > 0 || fiveIllu.length > 0) {
    console.log('\n── 5장 KPI 비교 ──');
    for (const r of [...fivePhoto, ...fiveIllu]) {
      const aiCov = r.returned > 0 ? Math.round((r.ai / r.returned) * 100) : 0;
      console.log(`  ${r.style} | ai=${r.ai} tpl=${r.template} aiCov=${aiCov}% hero=${r.heroAIHit} time=${(r.totalMs/1000).toFixed(1)}s → ${r.verdict}`);
    }
  }

  // 최종 판정
  const failures = allResults.filter(r => r.verdict.startsWith('FAIL'));
  const partials = allResults.filter(r => r.verdict === 'PARTIAL');
  console.log(`\n── 최종 판정 ──`);
  console.log(`  총 ${allResults.length}건 실행 / PASS=${allResults.length - failures.length - partials.length} / PARTIAL=${partials.length} / FAIL=${failures.length}`);
  if (failures.length > 0) {
    console.log(`  실패 케이스: ${failures.map(f => `${f.count}장(${f.style}): ${f.verdict}`).join(', ')}`);
  }
  console.log('');
}

// ═══════════════════════════════════════
// Photo 0~5장 (각 1회)
// ═══════════════════════════════════════

test.describe.serial('Photo 0~5장 실측', () => {

  test('photo 0장: 이미지 스킵', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 0, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 0장', r);
    const row = buildRow('photo 0장', 0, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible, '결과 화면 미표시').toBe(true);
    // 0장: 이미지 없어야 함
    expect(r.imageCount, '이미지 존재').toBe(0);
  });

  test('photo 1장: hero 생성', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 1, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 1장', r);
    const row = buildRow('photo 1장', 1, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(1);
    if (r.summary) {
      expect(r.summary.selected).toBe(1);
      expect(r.summary.returned).toBe(1);
    }
  });

  test('photo 2장', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 2, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 2장', r);
    const row = buildRow('photo 2장', 2, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(2);
    if (r.summary) {
      expect(r.summary.selected).toBe(2);
      expect(r.summary.returned).toBe(2);
    }
  });

  test('photo 3장', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 3, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 3장', r);
    const row = buildRow('photo 3장', 3, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(3);
    if (r.summary) {
      expect(r.summary.selected).toBe(3);
      expect(r.summary.returned).toBe(3);
    }
  });

  test('photo 4장', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 4, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 4장', r);
    const row = buildRow('photo 4장', 4, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(4);
    if (r.summary) {
      expect(r.summary.selected).toBe(4);
      expect(r.summary.returned).toBe(4);
    }
  });

  test('photo 5장 (1차)', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 5, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 5장 (1차)', r);
    const row = buildRow('photo 5장 (1차)', 5, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(5);
    if (r.summary) {
      expect(r.summary.selected).toBe(5);
      expect(r.summary.returned).toBe(5);
    }
  });
});

// ═══════════════════════════════════════
// Photo 5장 추가 (안정성)
// ═══════════════════════════════════════

test.describe.serial('Photo 5장 추가 실행', () => {

  test('photo 5장 (2차)', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 5, imageStyle: 'photo', timeoutMs: TIMEOUT });
    printReport('photo 5장 (2차)', r);
    const row = buildRow('photo 5장 (2차)', 5, 'photo', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    if (r.summary) {
      expect(r.summary.selected).toBe(5);
      expect(r.summary.returned).toBe(5);
    }
  });
});

// ═══════════════════════════════════════
// Illustration 5장
// ═══════════════════════════════════════

test.describe.serial('Illustration 5장 실측', () => {

  test('illustration 5장', async ({ page }) => {
    const r = await runBlogGeneration(page, { topic: TOPIC, imageCount: 5, imageStyle: 'illustration', timeoutMs: TIMEOUT });
    printReport('illustration 5장', r);
    const row = buildRow('illustration 5장', 5, 'illustration', r);
    allResults.push(row);
    expect(r.resultVisible).toBe(true);
    if (r.summary) {
      expect(r.summary.selected).toBe(5);
      expect(r.summary.returned).toBe(5);
    }
  });
});

// ═══════════════════════════════════════
// 최종 리포트 (teardown)
// ═══════════════════════════════════════

test.afterAll(() => {
  printFinalTable();
});
