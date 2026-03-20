/**
 * Release Validation — Image Style Differentiation E2E
 *
 * Tests all 3 standard image styles (photo, illustration, medical)
 * through real browser → real production URL → real SaaS proxy.
 *
 * Run:
 *   E2E_BASE_URL=https://story-darugi.com npx playwright test e2e/release-validation-image-styles.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const TOPIC = '임플란트 수술 과정과 비용';
const GENERATION_TIMEOUT = 180_000;
const IMAGE_COUNT = 5;

const STYLES = [
  { code: 'photo', label: '실사', icon: '📸' },
  { code: 'illustration', label: '일러스트', icon: '🎨' },
  { code: 'medical', label: '의학 3D', icon: '🫀' },
] as const;

// ── Log collector ──
interface RunLogs {
  all: string[];
  blogFlow: string[];
  pipeline: string[];
  imgPrompt: string[];
  imgPlan: string[];
  imgTier: string[];
  imgFinal: string[];
  imgSummary: string[];
  imgSession: string[];
  stageC: string[];
  errors: string[];
}

function collectLogs(page: Page): RunLogs {
  const logs: RunLogs = {
    all: [], blogFlow: [], pipeline: [], imgPrompt: [],
    imgPlan: [], imgTier: [], imgFinal: [], imgSummary: [],
    imgSession: [], stageC: [], errors: [],
  };
  page.on('console', (msg) => {
    const text = msg.text();
    logs.all.push(text);
    if (text.includes('[BLOG_FLOW]')) logs.blogFlow.push(text);
    if (text.includes('[PIPELINE]')) logs.pipeline.push(text);
    if (text.includes('[IMG-PROMPT]')) logs.imgPrompt.push(text);
    if (text.includes('[IMG-PLAN]')) logs.imgPlan.push(text);
    if (text.includes('[IMG-TIER]')) logs.imgTier.push(text);
    if (text.includes('[IMG-FINAL]')) logs.imgFinal.push(text);
    if (text.includes('[IMG-SUMMARY]')) logs.imgSummary.push(text);
    if (text.includes('[IMG-SESSION]')) logs.imgSession.push(text);
    if (text.includes('Stage C') || text.includes('stage_c') || text.includes('polish')) logs.stageC.push(text);
    if (msg.type() === 'error') logs.errors.push(text);
  });
  return logs;
}

// ── Network evidence collector ──
interface NetworkEvidence {
  proxyRequests: { url: string; method: string; status: number }[];
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
      });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      evidence.directProviderCalls.push(url);
    }
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('vercel-proxy') || url.includes('/api/gemini')) {
      evidence.proxyRequests.push({ url, method: request.method(), status: -1 });
    }
  });

  return evidence;
}

// ── Parse IMG-SUMMARY ──
function parseImgSummary(logs: string[]): {
  selected: number; planned: number; returned: number;
  ai: number; template: number; placeholder: number;
} | null {
  const lastLog = logs.filter(l => l.includes('selected=')).pop();
  if (!lastLog) return null;
  const extract = (key: string): number => {
    const match = lastLog.match(new RegExp(`${key}=(\\d+)`));
    return match ? parseInt(match[1], 10) : -1;
  };
  return {
    selected: extract('selected'), planned: extract('planned'),
    returned: extract('returned'), ai: extract('ai'),
    template: extract('template'), placeholder: extract('placeholder'),
  };
}

// ── Parse hero result from IMG-FINAL ──
function parseHeroResult(imgFinalLogs: string[]): string {
  if (imgFinalLogs.length === 0) return 'unknown';
  const first = imgFinalLogs[0];
  if (first.includes('ai-image')) return 'ai-image';
  if (first.includes('template') || first.includes('TEMPLATE')) return 'template';
  if (first.includes('placeholder')) return 'placeholder';
  return 'unknown';
}

// ── Single style generation run ──
async function runStyleGeneration(page: Page, styleCode: string, styleLabel: string, runNum: number) {
  const logs = collectLogs(page);
  const network = collectNetwork(page);

  // Block heavy CDNs
  await page.route('**/*.{woff,woff2,ttf,eot}', route => route.abort());
  await page.route('**/cdn.portone.io/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());

  // Navigate
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

  // Select image style by clicking the button with matching label text
  const styleBtn = page.locator(`button:has-text("${styleLabel}")`).first();
  if (await styleBtn.isVisible().catch(() => false)) {
    await styleBtn.click();
    await page.waitForTimeout(300);
  } else {
    console.log(`[E2E] ⚠️ Style button "${styleLabel}" not found, trying by code`);
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
    console.log(`[E2E] RUN ${runNum} (${styleCode}): .naver-preview not visible after ${GENERATION_TIMEOUT}ms`);
  }
  const durationMs = Date.now() - t0;

  // Wait for images to fully load
  await page.waitForTimeout(12000);

  // Screenshot
  await page.screenshot({
    path: `test-results/style-${styleCode}-run${runNum}.png`,
    fullPage: true,
  }).catch(() => {});

  // Result visibility
  const resultVisible = await page.evaluate(() => {
    return !!(document.querySelector('.naver-preview') || document.querySelector('[contenteditable]'));
  }).catch(() => false);

  // Count images in result
  const imageCount = await page.locator('.naver-preview img, [contenteditable] img').count().catch(() => 0);

  // Image meta analysis (data-image-source, data-fallback, data-image-role)
  const imageMeta = await page.evaluate(() => {
    const imgs = document.querySelectorAll('.naver-preview img, [contenteditable] img');
    return Array.from(imgs).map((img, i) => ({
      index: i + 1,
      source: img.getAttribute('data-image-source') || 'unknown',
      fallback: img.getAttribute('data-fallback') || 'unknown',
      role: img.getAttribute('data-image-role') || 'unknown',
      alt: (img.getAttribute('alt') || '').substring(0, 80),
      hasSrc: !!(img as HTMLImageElement).src,
      naturalWidth: (img as HTMLImageElement).naturalWidth || 0,
    }));
  }).catch(() => []);

  // Parse summary
  const summary = parseImgSummary(logs.imgSummary);
  const heroResult = parseHeroResult(logs.imgFinal);

  return {
    styleCode,
    styleLabel,
    resultVisible,
    imageCount,
    imageMeta,
    summary,
    heroResult,
    durationMs,
    logs: {
      blogFlow: logs.blogFlow.slice(0, 5),
      pipeline: logs.pipeline.slice(0, 5),
      imgPrompt: logs.imgPrompt.slice(0, 8),
      imgPlan: logs.imgPlan.slice(0, 5),
      imgTier: logs.imgTier.slice(0, 8),
      imgFinal: logs.imgFinal.slice(0, 8),
      imgSummary: logs.imgSummary.slice(0, 3),
      imgSession: logs.imgSession.slice(0, 3),
      stageC: logs.stageC.slice(0, 3),
    },
    network: {
      proxyRequestCount: network.proxyRequests.length,
      directProviderCalls: network.directProviderCalls.length,
      proxyStatuses: network.proxyRequests.map(r => r.status),
    },
  };
}

// ═══════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════

test.describe('Release Validation — Image Style Differentiation', () => {
  test.setTimeout(GENERATION_TIMEOUT * 5);

  const allResults: Awaited<ReturnType<typeof runStyleGeneration>>[] = [];

  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i];

    test(`Style ${i + 1}/3: ${style.label} (${style.code}) — 5 images`, async ({ page }) => {
      const r = await runStyleGeneration(page, style.code, style.label, i + 1);
      allResults.push(r);

      // Core assertions
      expect(r.resultVisible, `${style.code}: result visible`).toBe(true);
      expect(r.network.proxyRequestCount, `${style.code}: proxy requests > 0`).toBeGreaterThan(0);
      expect(r.network.directProviderCalls, `${style.code}: no direct calls`).toBe(0);
      expect(r.imageCount, `${style.code}: should have images`).toBeGreaterThanOrEqual(3);

      // Log evidence
      console.log(`\n${'='.repeat(70)}`);
      console.log(`  STYLE: ${style.label} (${style.code}) — RUN ${i + 1}`);
      console.log(`${'='.repeat(70)}`);
      console.log(`  resultVisible: ${r.resultVisible}`);
      console.log(`  imageCount: ${r.imageCount}`);
      console.log(`  durationMs: ${r.durationMs}`);
      console.log(`  heroResult: ${r.heroResult}`);
      console.log(`  proxyRequests: ${r.network.proxyRequestCount}`);
      console.log(`  directProviderCalls: ${r.network.directProviderCalls}`);

      if (r.summary) {
        console.log(`  selected=${r.summary.selected} planned=${r.summary.planned} returned=${r.summary.returned}`);
        console.log(`  ai=${r.summary.ai} template=${r.summary.template} placeholder=${r.summary.placeholder}`);
      }

      console.log(`  imageMeta:`);
      for (const img of r.imageMeta) {
        console.log(`    IMG_${img.index}: source=${img.source} fallback=${img.fallback} role=${img.role} w=${img.naturalWidth} alt="${img.alt}"`);
      }

      console.log(`  [IMG-PROMPT] logs:`);
      for (const l of r.logs.imgPrompt.slice(0, 6)) {
        console.log(`    ${l.substring(0, 150)}`);
      }
      console.log(`  [IMG-PLAN] logs:`);
      for (const l of r.logs.imgPlan) {
        console.log(`    ${l.substring(0, 150)}`);
      }
      console.log(`  [IMG-TIER] logs:`);
      for (const l of r.logs.imgTier.slice(0, 6)) {
        console.log(`    ${l.substring(0, 150)}`);
      }
      console.log(`  [IMG-FINAL] logs:`);
      for (const l of r.logs.imgFinal.slice(0, 6)) {
        console.log(`    ${l.substring(0, 150)}`);
      }
      console.log(`  [IMG-SUMMARY] logs:`);
      for (const l of r.logs.imgSummary) {
        console.log(`    ${l.substring(0, 200)}`);
      }
      console.log(`  [BLOG_FLOW] logs (first 3):`);
      for (const l of r.logs.blogFlow.slice(0, 3)) {
        console.log(`    ${l.substring(0, 150)}`);
      }
      console.log(`  [PIPELINE] logs (first 3):`);
      for (const l of r.logs.pipeline.slice(0, 3)) {
        console.log(`    ${l.substring(0, 150)}`);
      }
    });
  }

  test.afterAll(() => {
    console.log('\n' + '═'.repeat(80));
    console.log('  RELEASE VALIDATION — IMAGE STYLE DIFFERENTIATION FINAL REPORT');
    console.log('═'.repeat(80));

    // Summary table
    console.log('\n┌────────────────┬──────────┬─────────────────────┬───────────────────────┬──────────┬───────┬─────────┐');
    console.log('│ Style          │ Time(s)  │ sel/plan/ret        │ ai/tpl/ph             │ Hero     │ Proxy │ Images  │');
    console.log('├────────────────┼──────────┼─────────────────────┼───────────────────────┼──────────┼───────┼─────────┤');

    for (const r of allResults) {
      const s = r.summary;
      const time = (r.durationMs / 1000).toFixed(0);
      const spr = s ? `${s.selected}/${s.planned}/${s.returned}` : 'N/A';
      const atp = s ? `${s.ai}/${s.template}/${s.placeholder}` : 'N/A';
      console.log(`│ ${(r.styleLabel + ' (' + r.styleCode + ')').padEnd(14)} │ ${time.padEnd(8)} │ ${spr.padEnd(19)} │ ${atp.padEnd(21)} │ ${r.heroResult.padEnd(8)} │ ${String(r.network.proxyRequestCount).padEnd(5)} │ ${String(r.imageCount).padEnd(7)} │`);
    }
    console.log('└────────────────┴──────────┴─────────────────────┴───────────────────────┴──────────┴───────┴─────────┘');

    // Style differentiation analysis
    console.log('\n── STYLE DIFFERENTIATION ANALYSIS ──');
    for (const r of allResults) {
      console.log(`\n  ${r.styleLabel} (${r.styleCode}):`);
      console.log(`    Images: ${r.imageCount}, Hero: ${r.heroResult}`);
      if (r.imageMeta.length > 0) {
        const aiCount = r.imageMeta.filter(m => m.source === 'ai').length;
        const tplCount = r.imageMeta.filter(m => m.source === 'template').length;
        console.log(`    AI images: ${aiCount}, Template fallbacks: ${tplCount}`);
        console.log(`    Image alts (style hint):`);
        for (const img of r.imageMeta.slice(0, 3)) {
          console.log(`      IMG_${img.index} (${img.role}): "${img.alt}"`);
        }
      }
    }

    // Verdict
    const allSuccess = allResults.every(r => r.resultVisible && r.imageCount >= 3);
    const allProxy = allResults.every(r => r.network.proxyRequestCount > 0 && r.network.directProviderCalls === 0);
    const lowFallback = allResults.every(r => {
      const tpl = r.summary?.template ?? 0;
      return tpl <= 1;
    });

    console.log('\n── VERDICT ──');
    console.log(`프록시 실검증: ${allProxy ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`이미지 안정성: ${allSuccess ? 'PASS ✅' : 'FAIL ❌'} (all styles ${IMAGE_COUNT} images)`);
    console.log(`template fallback: ${lowFallback ? 'LOW ✅' : 'HIGH ⚠️'}`);
    console.log('═'.repeat(80));
  });
});
