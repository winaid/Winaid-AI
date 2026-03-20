/**
 * Post-fix validation — medical fallback improvement
 * 3x medical + 1x photo + 1x illustration
 */
import { test, expect, type Page } from '@playwright/test';

const TOPIC = '임플란트 수술 과정과 비용';
const GENERATION_TIMEOUT = 180_000;

const STYLES_TO_TEST = [
  { code: 'medical', label: '의학 3D', runs: 3 },
  { code: 'photo', label: '실사', runs: 1 },
  { code: 'illustration', label: '일러스트', runs: 1 },
] as const;

interface RunResult {
  styleCode: string;
  runNum: number;
  resultVisible: boolean;
  imageCount: number;
  summary: { selected: number; planned: number; returned: number; ai: number; template: number; placeholder: number } | null;
  heroResult: string;
  durationMs: number;
  wavePlan: string;
  proxyCount: number;
  directCalls: number;
  imgFinals: string[];
}

async function runGeneration(page: Page, styleCode: string, styleLabel: string, runNum: number): Promise<RunResult> {
  const logs: string[] = [];
  const imgSummary: string[] = [];
  const imgFinal: string[] = [];
  const imgPlan: string[] = [];
  let proxyCount = 0;
  let directCalls = 0;

  page.on('console', (msg) => {
    const t = msg.text();
    logs.push(t);
    if (t.includes('[IMG-SUMMARY]')) imgSummary.push(t);
    if (t.includes('[IMG-FINAL]')) imgFinal.push(t);
    if (t.includes('[IMG-PLAN]') && t.includes('웨이브 계획')) imgPlan.push(t);
  });

  page.on('requestfinished', async (req) => {
    const u = req.url();
    if (u.includes('vercel-proxy') || u.includes('/api/gemini')) proxyCount++;
    if (u.includes('generativelanguage.googleapis.com')) directCalls++;
  });

  await page.route('**/*.{woff,woff2,ttf,eot}', r => r.abort());
  await page.route('**/cdn.portone.io/**', r => r.abort());
  await page.route('**/fonts.googleapis.com/**', r => r.abort());

  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const topicInput = page.locator('input[placeholder*="블로그 제목"]').or(page.locator('input[placeholder*="블로그"]')).first();
  await topicInput.waitFor({ state: 'visible', timeout: 15_000 });
  await topicInput.fill(TOPIC);

  // Set 5 images
  await page.evaluate(() => {
    const s = document.querySelector('input[type="range"][min="0"][max="5"]') as HTMLInputElement;
    if (s) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; set?.call(s, '5'); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(300);

  // Select style
  const btn = page.locator(`button:has-text("${styleLabel}")`).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.waitForTimeout(300);

  const t0 = Date.now();
  await page.locator('button:has-text("블로그 원고 생성")').click();

  try {
    await page.locator('.naver-preview').first().waitFor({ state: 'visible', timeout: GENERATION_TIMEOUT });
  } catch {}
  const durationMs = Date.now() - t0;
  await page.waitForTimeout(12000);

  await page.screenshot({ path: `test-results/postfix-${styleCode}-run${runNum}.png`, fullPage: true }).catch(() => {});

  const resultVisible = await page.evaluate(() => !!(document.querySelector('.naver-preview') || document.querySelector('[contenteditable]'))).catch(() => false);
  const imageCount = await page.locator('.naver-preview img, [contenteditable] img').count().catch(() => 0);

  // Parse summary
  let summary: RunResult['summary'] = null;
  const lastSummary = imgSummary.filter(l => l.includes('selected=')).pop();
  if (lastSummary) {
    const e = (k: string) => { const m = lastSummary.match(new RegExp(`${k}=(\\d+)`)); return m ? parseInt(m[1]) : -1; };
    summary = { selected: e('selected'), planned: e('planned'), returned: e('returned'), ai: e('ai'), template: e('template'), placeholder: e('placeholder') };
  }

  const heroResult = imgFinal.length > 0 && imgFinal[0].includes('ai-image') ? 'ai-image' : imgFinal.length > 0 ? 'template' : 'unknown';
  const wavePlan = imgPlan.length > 0 ? imgPlan[0].replace(/.*웨이브 계획:\s*/, '').replace(/\s*\(.*/, '') : 'N/A';

  return { styleCode, runNum, resultVisible, imageCount, summary, heroResult, durationMs, wavePlan, proxyCount, directCalls, imgFinals: imgFinal.slice(0, 8) };
}

test.describe('Post-fix Validation — Medical Fallback Improvement', () => {
  test.setTimeout(GENERATION_TIMEOUT * 8);

  const allResults: RunResult[] = [];

  // Generate flat test list
  const tests: { code: string; label: string; run: number }[] = [];
  for (const s of STYLES_TO_TEST) {
    for (let r = 1; r <= s.runs; r++) {
      tests.push({ code: s.code, label: s.label, run: r });
    }
  }

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    test(`[${i + 1}/${tests.length}] ${t.label} (${t.code}) run ${t.run}`, async ({ page }) => {
      const r = await runGeneration(page, t.code, t.label, t.run);
      allResults.push(r);

      expect(r.resultVisible, `${t.code} run${t.run}: visible`).toBe(true);
      expect(r.proxyCount, `${t.code} run${t.run}: proxy > 0`).toBeGreaterThan(0);
      expect(r.directCalls, `${t.code} run${t.run}: direct = 0`).toBe(0);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`  ${t.label} (${t.code}) — RUN ${t.run}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`  visible=${r.resultVisible} images=${r.imageCount} time=${r.durationMs}ms hero=${r.heroResult}`);
      console.log(`  wavePlan: ${r.wavePlan}`);
      console.log(`  proxy=${r.proxyCount} direct=${r.directCalls}`);
      if (r.summary) console.log(`  sel=${r.summary.selected} plan=${r.summary.planned} ret=${r.summary.returned} ai=${r.summary.ai} tpl=${r.summary.template} ph=${r.summary.placeholder}`);
      for (const f of r.imgFinals) console.log(`  ${f.substring(0, 120)}`);
    });
  }

  test.afterAll(() => {
    console.log('\n' + '═'.repeat(80));
    console.log('  POST-FIX VALIDATION SUMMARY');
    console.log('═'.repeat(80));

    console.log('\n┌──────────────┬─────┬────────┬─────────────┬────────────┬──────────┬───────┬─────────────────────────────┐');
    console.log('│ Style        │ Run │ Time   │ sel/pln/ret │ ai/tpl/ph  │ Hero     │ Proxy │ Wave Plan                   │');
    console.log('├──────────────┼─────┼────────┼─────────────┼────────────┼──────────┼───────┼─────────────────────────────┤');
    for (const r of allResults) {
      const s = r.summary;
      const spr = s ? `${s.selected}/${s.planned}/${s.returned}` : 'N/A';
      const atp = s ? `${s.ai}/${s.template}/${s.placeholder}` : 'N/A';
      console.log(`│ ${r.styleCode.padEnd(12)} │ ${String(r.runNum).padEnd(3)} │ ${String(Math.round(r.durationMs/1000)).padEnd(4)}s  │ ${spr.padEnd(11)} │ ${atp.padEnd(10)} │ ${r.heroResult.padEnd(8)} │ ${String(r.proxyCount).padEnd(5)} │ ${r.wavePlan.padEnd(27)} │`);
    }
    console.log('└──────────────┴─────┴────────┴─────────────┴────────────┴──────────┴───────┴─────────────────────────────┘');

    // Medical aggregate
    const medRuns = allResults.filter(r => r.styleCode === 'medical');
    if (medRuns.length > 0) {
      const totalAi = medRuns.reduce((s, r) => s + (r.summary?.ai ?? 0), 0);
      const totalTpl = medRuns.reduce((s, r) => s + (r.summary?.template ?? 0), 0);
      const totalPh = medRuns.reduce((s, r) => s + (r.summary?.placeholder ?? 0), 0);
      const totalImages = medRuns.reduce((s, r) => s + (r.summary?.returned ?? 0), 0);
      const avgTime = Math.round(medRuns.reduce((s, r) => s + r.durationMs, 0) / medRuns.length / 1000);
      console.log(`\n── MEDICAL AGGREGATE (${medRuns.length} runs) ──`);
      console.log(`  Total images: ${totalImages}, AI: ${totalAi}, Template: ${totalTpl}, Placeholder: ${totalPh}`);
      console.log(`  AI rate: ${totalImages > 0 ? Math.round(totalAi / totalImages * 100) : 0}%`);
      console.log(`  Template rate: ${totalImages > 0 ? Math.round(totalTpl / totalImages * 100) : 0}%`);
      console.log(`  Avg time: ${avgTime}s`);
      console.log(`  Before: ai=3/5 tpl=2/5 (60% AI, 40% template)`);
      console.log(`  After:  ai=${totalAi}/${totalImages} tpl=${totalTpl}/${totalImages} (${totalImages > 0 ? Math.round(totalAi / totalImages * 100) : 0}% AI, ${totalImages > 0 ? Math.round(totalTpl / totalImages * 100) : 0}% template)`);
    }

    console.log('═'.repeat(80));
  });
});
