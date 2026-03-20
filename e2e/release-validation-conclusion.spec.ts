/**
 * Release Validation — Conclusion Separation Browser E2E
 *
 * Validates via REAL browser → REAL production URL → REAL SaaS proxy → REAL model responses.
 * 3 blog generation runs + conclusion structure verification + network evidence.
 *
 * Run:
 *   E2E_BASE_URL=https://story-darugi.com npx playwright test e2e/release-validation-conclusion.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const TOPIC = '임플란트 수술 과정과 비용';
const GENERATION_TIMEOUT = 180_000;

// ── Log collector ──
interface RunLogs {
  all: string[];
  blogFlow: string[];
  pipeline: string[];
  imgSummary: string[];
  imgPlan: string[];
  imgTier: string[];
  imgFinal: string[];
  stageC: string[];
  errors: string[];
}

function collectLogs(page: Page): RunLogs {
  const logs: RunLogs = {
    all: [], blogFlow: [], pipeline: [], imgSummary: [],
    imgPlan: [], imgTier: [], imgFinal: [], stageC: [], errors: [],
  };
  page.on('console', (msg) => {
    const text = msg.text();
    logs.all.push(text);
    if (text.includes('[BLOG_FLOW]')) logs.blogFlow.push(text);
    if (text.includes('[PIPELINE]')) logs.pipeline.push(text);
    if (text.includes('[IMG-SUMMARY]')) logs.imgSummary.push(text);
    if (text.includes('[IMG-PLAN]')) logs.imgPlan.push(text);
    if (text.includes('[IMG-TIER]')) logs.imgTier.push(text);
    if (text.includes('[IMG-FINAL]')) logs.imgFinal.push(text);
    if (text.includes('Stage C') || text.includes('stage_c') || text.includes('polish')) logs.stageC.push(text);
    if (msg.type() === 'error') logs.errors.push(text);
  });
  return logs;
}

// ── Network evidence collector ──
interface NetworkEvidence {
  proxyRequests: { url: string; method: string; status: number; duration: number }[];
  directProviderCalls: string[];
}

function collectNetwork(page: Page): NetworkEvidence {
  const evidence: NetworkEvidence = { proxyRequests: [], directProviderCalls: [] };

  page.on('requestfinished', async (request) => {
    const url = request.url();
    if (url.includes('vercel-proxy') || url.includes('/api/gemini')) {
      const response = await request.response();
      evidence.proxyRequests.push({
        url,
        method: request.method(),
        status: response?.status() || 0,
        duration: (request.timing?.responseEnd || 0) - (request.timing?.requestStart || 0),
      });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      evidence.directProviderCalls.push(url);
    }
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('vercel-proxy') || url.includes('/api/gemini')) {
      evidence.proxyRequests.push({
        url,
        method: request.method(),
        status: -1,
        duration: 0,
      });
    }
  });

  return evidence;
}

// ── HTML structure analysis ──
interface StructureAnalysis {
  h3Count: number;
  sectionLengths: number[];
  maxMinRatio: string;
  median: number;
  lastSectionLen: number;
  lastVsMedian: string;
  conclusionLen: number;
  hasConclusionWrapper: boolean;
  conclusionSeparated: boolean;
  hasIntro: boolean;
  totalTextLen: number;
  visiblePlaceholder: boolean;
  emptySections: number;
}

async function analyzeStructure(page: Page): Promise<StructureAnalysis | null> {
  return page.evaluate(() => {
    // Find the rendered blog HTML
    const container = document.querySelector('.naver-post-container')
      || document.querySelector('[contenteditable="true"]')
      || document.querySelector('.naver-preview');
    if (!container) return null;

    const html = container.innerHTML;

    // Conclusion marker detection
    const conclusionMarkerMatch = html.match(/<section[^>]*data-blog-part="conclusion"[^>]*>([\s\S]*?)<\/section>/i);
    const contentEndForSections = conclusionMarkerMatch
      ? html.indexOf(conclusionMarkerMatch[0])
      : html.length;

    // H3 detection (outside conclusion)
    const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    const h3Matches: { index: number; title: string }[] = [];
    let m;
    while ((m = h3Regex.exec(html)) !== null) {
      if (m.index >= contentEndForSections) break;
      h3Matches.push({ index: m.index, title: m[1].replace(/<[^>]+>/g, '').trim() });
    }

    // Section lengths
    const sectionLengths: number[] = [];
    for (let i = 0; i < h3Matches.length; i++) {
      const start = h3Matches[i].index;
      const end = i + 1 < h3Matches.length ? h3Matches[i + 1].index : contentEndForSections;
      const sectionHtml = html.substring(start, end);
      sectionLengths.push(sectionHtml.replace(/<[^>]+>/g, '').trim().length);
    }

    const sorted = [...sectionLengths].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const maxLen = Math.max(...sectionLengths, 1);
    const minLen = Math.min(...sectionLengths, 1);
    const lastLen = sectionLengths[sectionLengths.length - 1] || 0;

    // Conclusion
    const conclusionLen = conclusionMarkerMatch
      ? conclusionMarkerMatch[1].replace(/<[^>]+>/g, '').trim().length
      : 0;

    // Intro detection
    const firstH3Pos = h3Matches.length > 0 ? h3Matches[0].index : contentEndForSections;
    const introHtml = html.substring(0, firstH3Pos);
    const hasIntro = introHtml.replace(/<[^>]+>/g, '').trim().length > 10;

    // Total text
    const totalTextLen = html.replace(/<[^>]+>/g, '').trim().length;

    // Placeholder check
    const visiblePlaceholder = /일시적으로 생성되지 않았습니다|생성 실패|내용 생성 중 오류/.test(html);

    // Empty sections
    const emptySections = sectionLengths.filter(l => l < 30).length;

    return {
      h3Count: h3Matches.length,
      sectionLengths,
      maxMinRatio: minLen > 0 ? (maxLen / minLen).toFixed(2) : 'N/A',
      median,
      lastSectionLen: lastLen,
      lastVsMedian: median > 0 ? (lastLen / median).toFixed(2) : 'N/A',
      conclusionLen,
      hasConclusionWrapper: !!conclusionMarkerMatch,
      conclusionSeparated: !!conclusionMarkerMatch && conclusionLen > 10,
      hasIntro: hasIntro,
      totalTextLen,
      visiblePlaceholder,
      emptySections,
    };
  });
}

// ── Single blog generation run ──
async function runBlogGeneration(page: Page, runNum: number): Promise<{
  structure: StructureAnalysis | null;
  logs: RunLogs;
  network: NetworkEvidence;
  imageCount: number;
  durationMs: number;
  resultVisible: boolean;
}> {
  const logs = collectLogs(page);
  const network = collectNetwork(page);

  // Block heavy CDNs
  await page.route('**/*.{woff,woff2,ttf,eot}', route => route.abort());
  await page.route('**/cdn.portone.io/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());

  // Navigate to blog page
  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Fill topic
  const topicInput = page.locator('input[placeholder*="블로그 제목"]').or(
    page.locator('input[placeholder*="블로그"]')
  ).first();
  await topicInput.waitFor({ state: 'visible', timeout: 15_000 });
  await topicInput.fill(TOPIC);

  // Set image count to 5
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"][min="0"][max="5"]') as HTMLInputElement;
    if (slider) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(slider, '5');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(300);

  // Select photo style
  const styleBtn = page.locator('button:has-text("실사")').first();
  if (await styleBtn.isVisible().catch(() => false)) {
    await styleBtn.click();
    await page.waitForTimeout(300);
  }

  // Click generate
  const t0 = Date.now();
  const generateBtn = page.locator('button:has-text("블로그 원고 생성")');
  await generateBtn.click();

  // Wait for result
  const resultLocator = page.locator('.naver-preview').first();
  try {
    await resultLocator.waitFor({ state: 'visible', timeout: GENERATION_TIMEOUT });
  } catch {
    console.log(`[E2E] RUN ${runNum}: .naver-preview not visible after ${GENERATION_TIMEOUT}ms`);
  }
  const durationMs = Date.now() - t0;

  // Wait for images to load
  await page.waitForTimeout(10000);

  // Screenshot
  await page.screenshot({
    path: `test-results/release-validation-run${runNum}.png`,
    fullPage: true,
  }).catch(() => {});

  // Check result visibility
  const resultVisible = await page.evaluate(() => {
    return !!(document.querySelector('.naver-preview') || document.querySelector('[contenteditable]'));
  }).catch(() => false);

  // Count images
  const imageCount = await page.locator('.naver-preview img, [contenteditable] img').count().catch(() => 0);

  // Analyze HTML structure
  const structure = await analyzeStructure(page);

  return { structure, logs, network, imageCount, durationMs, resultVisible };
}

// ═══════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════

test.describe('Release Validation — Conclusion Separation', () => {
  test.setTimeout(GENERATION_TIMEOUT * 4); // 4x for 3 runs + overhead

  const allResults: Array<{
    run: number;
    structure: StructureAnalysis | null;
    network: NetworkEvidence;
    imageCount: number;
    durationMs: number;
    resultVisible: boolean;
    logExcerpts: { blogFlow: string[]; pipeline: string[]; imgSummary: string[]; stageC: string[] };
  }> = [];

  test('Run 1/3 — Blog generation with conclusion separation', async ({ page }) => {
    const r = await runBlogGeneration(page, 1);
    allResults.push({
      run: 1, structure: r.structure, network: r.network,
      imageCount: r.imageCount, durationMs: r.durationMs, resultVisible: r.resultVisible,
      logExcerpts: {
        blogFlow: r.logs.blogFlow.slice(0, 10),
        pipeline: r.logs.pipeline.slice(0, 10),
        imgSummary: r.logs.imgSummary.slice(0, 5),
        stageC: r.logs.stageC.slice(0, 5),
      },
    });

    // Assertions
    expect(r.resultVisible, 'Result should be visible').toBe(true);
    expect(r.network.proxyRequests.length, 'Should have proxy requests').toBeGreaterThan(0);
    expect(r.network.directProviderCalls.length, 'No direct provider calls').toBe(0);

    if (r.structure) {
      expect(r.structure.h3Count, 'Should have 3+ h3s').toBeGreaterThanOrEqual(3);
      expect(r.structure.hasConclusionWrapper, 'Conclusion wrapper present').toBe(true);
      expect(r.structure.conclusionSeparated, 'Conclusion separated').toBe(true);
      expect(r.structure.visiblePlaceholder, 'No placeholders').toBe(false);
    }
  });

  test('Run 2/3 — Blog generation with conclusion separation', async ({ page }) => {
    const r = await runBlogGeneration(page, 2);
    allResults.push({
      run: 2, structure: r.structure, network: r.network,
      imageCount: r.imageCount, durationMs: r.durationMs, resultVisible: r.resultVisible,
      logExcerpts: {
        blogFlow: r.logs.blogFlow.slice(0, 10),
        pipeline: r.logs.pipeline.slice(0, 10),
        imgSummary: r.logs.imgSummary.slice(0, 5),
        stageC: r.logs.stageC.slice(0, 5),
      },
    });

    expect(r.resultVisible).toBe(true);
    expect(r.network.proxyRequests.length).toBeGreaterThan(0);
    expect(r.network.directProviderCalls.length).toBe(0);

    if (r.structure) {
      expect(r.structure.hasConclusionWrapper).toBe(true);
      expect(r.structure.conclusionSeparated).toBe(true);
    }
  });

  test('Run 3/3 — Blog generation + save/reload verification', async ({ page }) => {
    const r = await runBlogGeneration(page, 3);

    // Structure before save
    const preStructure = r.structure;

    // Attempt save: click save button if available
    let saveSucceeded = false;
    const saveBtn = page.locator('button:has-text("저장")').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      saveSucceeded = true;
    }

    // Attempt reload: go to history and reopen
    let reloadStructure: StructureAnalysis | null = null;
    if (saveSucceeded) {
      // Try navigating to history page
      const historyLink = page.locator('a[href*="history"], button:has-text("히스토리"), button:has-text("기록")').first();
      if (await historyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await historyLink.click();
        await page.waitForTimeout(2000);

        // Click first history item
        const firstItem = page.locator('.history-item, [class*="history"] a, [class*="history"] button').first();
        if (await firstItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstItem.click();
          await page.waitForTimeout(5000);
          reloadStructure = await analyzeStructure(page);
        }
      }
    }

    allResults.push({
      run: 3, structure: preStructure, network: r.network,
      imageCount: r.imageCount, durationMs: r.durationMs, resultVisible: r.resultVisible,
      logExcerpts: {
        blogFlow: r.logs.blogFlow.slice(0, 10),
        pipeline: r.logs.pipeline.slice(0, 10),
        imgSummary: r.logs.imgSummary.slice(0, 5),
        stageC: r.logs.stageC.slice(0, 5),
      },
    });

    expect(r.resultVisible).toBe(true);
    expect(r.network.proxyRequests.length).toBeGreaterThan(0);

    if (preStructure) {
      expect(preStructure.hasConclusionWrapper).toBe(true);
      expect(preStructure.conclusionSeparated).toBe(true);
    }

    // Save/reload verification
    if (reloadStructure && preStructure) {
      console.log(`[SAVE-RELOAD] Before: h3=${preStructure.h3Count}, concl=${preStructure.conclusionLen}`);
      console.log(`[SAVE-RELOAD] After:  h3=${reloadStructure.h3Count}, concl=${reloadStructure.conclusionLen}`);
      expect(reloadStructure.h3Count).toBe(preStructure.h3Count);
      expect(reloadStructure.hasConclusionWrapper).toBe(true);
    } else {
      console.log('[SAVE-RELOAD] ⚠️ Save/reload could not be fully verified (auth required or UI flow differs)');
    }
  });

  test.afterAll(() => {
    // Print final report
    console.log('\n' + '═'.repeat(80));
    console.log('  RELEASE VALIDATION — FINAL REPORT');
    console.log('═'.repeat(80));

    for (const r of allResults) {
      console.log(`\n── RUN ${r.run} ──`);
      console.log(`  resultVisible: ${r.resultVisible}`);
      console.log(`  durationMs: ${r.durationMs}`);
      console.log(`  imageCount: ${r.imageCount}`);
      console.log(`  proxyRequests: ${r.network.proxyRequests.length}`);
      console.log(`  directProviderCalls: ${r.network.directProviderCalls.length}`);

      if (r.structure) {
        const s = r.structure;
        console.log(`  h3Count: ${s.h3Count}`);
        console.log(`  sectionLengths: [${s.sectionLengths.join(', ')}]`);
        console.log(`  maxMinRatio: ${s.maxMinRatio}`);
        console.log(`  lastSection: ${s.lastSectionLen}자`);
        console.log(`  median: ${s.median}자`);
        console.log(`  lastVsMedian: ${s.lastVsMedian}`);
        console.log(`  conclusionLen: ${s.conclusionLen}자 (별도)`);
        console.log(`  conclusionWrapper: ${s.hasConclusionWrapper ? '✅' : '❌'}`);
        console.log(`  conclusionSeparated: ${s.conclusionSeparated ? '✅' : '❌'}`);
        console.log(`  visiblePlaceholder: ${s.visiblePlaceholder ? '⚠️' : '✅ NONE'}`);
        console.log(`  totalTextLen: ${s.totalTextLen}자`);
      } else {
        console.log(`  structure: ❌ COULD NOT ANALYZE`);
      }

      // Network evidence
      console.log(`  networkEvidence:`);
      for (const req of r.network.proxyRequests.slice(0, 5)) {
        console.log(`    ${req.method} ${req.url.substring(0, 80)} → ${req.status}`);
      }
      if (r.network.proxyRequests.length > 5) {
        console.log(`    ... +${r.network.proxyRequests.length - 5} more`);
      }

      // Log excerpts
      console.log(`  blogFlow logs (first 3):`);
      for (const l of r.logExcerpts.blogFlow.slice(0, 3)) {
        console.log(`    ${l.substring(0, 120)}`);
      }
      console.log(`  pipeline logs (first 3):`);
      for (const l of r.logExcerpts.pipeline.slice(0, 3)) {
        console.log(`    ${l.substring(0, 120)}`);
      }
    }

    // Overall verdict
    const successRuns = allResults.filter(r => r.resultVisible);
    const separatedRuns = allResults.filter(r => r.structure?.conclusionSeparated);
    const balancedRuns = allResults.filter(r => {
      const ratio = parseFloat(r.structure?.lastVsMedian || '999');
      return ratio <= 1.7;
    });
    const proxyConfirmed = allResults.every(r => r.network.proxyRequests.length > 0 && r.network.directProviderCalls.length === 0);

    console.log('\n── VERDICT ──');
    console.log(`프록시 실검증: ${proxyConfirmed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`블로그 생성: ${successRuns.length}/3 성공 ${successRuns.length >= 2 ? '✅' : '❌'}`);
    console.log(`conclusion 분리: ${separatedRuns.length}/${successRuns.length} ${separatedRuns.length === successRuns.length ? '✅' : '❌'}`);
    console.log(`글 균형: ${balancedRuns.length}/${successRuns.length} ${balancedRuns.length >= 2 ? '✅' : '⚠️'}`);
    console.log('═'.repeat(80));
  });
});
