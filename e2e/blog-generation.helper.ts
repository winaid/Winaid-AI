/**
 * 블로그 생성 E2E 헬퍼 — Playwright용 공통 동작 추상화
 *
 * 실측 검증용: preview.story-darugi.com 에서 실제 API 호출
 * 모든 [IMG-*] / [BLOG_FLOW] / [RESULT_PREVIEW] 패턴 수집
 */
import type { Page } from '@playwright/test';

// ── 콘솔 로그 수집 ──

export interface CollectedLogs {
  imgSummary: string[];
  imgContract: string[];
  imgPlan: string[];
  imgTier: string[];
  imgFinal: string[];
  imgSession: string[];
  imgHeroRetry: string[];
  blogFlow: string[];
  resultPreview: string[];
  warnings: string[];
  errors: string[];
  all: string[];
}

export function createLogCollector(page: Page): CollectedLogs {
  const logs: CollectedLogs = {
    imgSummary: [], imgContract: [], imgPlan: [], imgTier: [],
    imgFinal: [], imgSession: [], imgHeroRetry: [],
    blogFlow: [], resultPreview: [],
    warnings: [], errors: [], all: [],
  };

  page.on('console', (msg) => {
    const text = msg.text();
    logs.all.push(text);
    if (text.includes('[IMG-SUMMARY]')) logs.imgSummary.push(text);
    if (text.includes('[IMG-CONTRACT]')) logs.imgContract.push(text);
    if (text.includes('[IMG-PLAN]')) logs.imgPlan.push(text);
    if (text.includes('[IMG-TIER]')) logs.imgTier.push(text);
    if (text.includes('[IMG-FINAL]')) logs.imgFinal.push(text);
    if (text.includes('[IMG-SESSION]')) logs.imgSession.push(text);
    if (text.includes('[IMG-HERO-RETRY]')) logs.imgHeroRetry.push(text);
    if (text.includes('[BLOG_FLOW]')) logs.blogFlow.push(text);
    if (text.includes('[RESULT_PREVIEW]')) logs.resultPreview.push(text);
    if (text.includes('⚠️')) logs.warnings.push(text);
    if (msg.type() === 'error') logs.errors.push(text);
  });

  return logs;
}

// ── 로그 파싱 ──

export interface ImageSummaryData {
  selected: number;
  planned: number;
  returned: number;
  ai: number;
  template: number;
  placeholder: number;
}

/** [IMG-SUMMARY] 로그에서 수치 추출 */
export function parseImgSummary(logs: string[]): ImageSummaryData | null {
  const lastLog = logs.filter(l => l.includes('selected=')).pop();
  if (!lastLog) return null;

  const extract = (key: string): number => {
    const match = lastLog.match(new RegExp(`${key}=(\\d+)`));
    return match ? parseInt(match[1], 10) : -1;
  };

  return {
    selected: extract('selected'),
    planned: extract('planned'),
    returned: extract('returned'),
    ai: extract('ai'),
    template: extract('template'),
    placeholder: extract('placeholder'),
  };
}

/** hero 결과 판별: [IMG-FINAL] 로그 중 첫 번째(hero)가 ai-image인지 */
export function parseHeroResult(imgFinalLogs: string[]): string {
  if (imgFinalLogs.length === 0) return 'unknown';
  const first = imgFinalLogs[0];
  if (first.includes('ai-image')) return 'ai-image';
  if (first.includes('template') || first.includes('TEMPLATE')) return 'template';
  if (first.includes('placeholder')) return 'placeholder';
  return 'unknown';
}

/** inserted/persisted 관련 로그 파싱 */
export function parsePersistedInfo(allLogs: string[]): { inserted: number; persisted: number; imageFailCount: number } {
  let inserted = -1, persisted = -1, imageFailCount = 0;
  for (const l of allLogs) {
    const insMatch = l.match(/inserted[=:](\d+)/i);
    if (insMatch) inserted = parseInt(insMatch[1], 10);
    const perMatch = l.match(/persisted[=:](\d+)/i);
    if (perMatch) persisted = parseInt(perMatch[1], 10);
    const failMatch = l.match(/imageFailCount[=:](\d+)/i);
    if (failMatch) imageFailCount = parseInt(failMatch[1], 10);
  }
  return { inserted, persisted, imageFailCount };
}

// ── 블로그 생성 흐름 ──

export type ImageStyleOption = 'photo' | 'illustration';

export interface BlogGenerationResult {
  resultVisible: boolean;
  imageCount: number;
  hasImageWarning: boolean;
  warningText: string;
  logs: CollectedLogs;
  summary: ImageSummaryData | null;
  heroResult: string;
  persistedInfo: { inserted: number; persisted: number; imageFailCount: number };
  durationMs: number;
  debugVerify: string;
}

/**
 * 블로그 생성 전체 흐름 실행.
 */
export async function runBlogGeneration(
  page: Page,
  options: {
    topic: string;
    imageCount: number;
    imageStyle?: ImageStyleOption;
    timeoutMs?: number;
  },
): Promise<BlogGenerationResult> {
  const { topic, imageCount, imageStyle = 'photo', timeoutMs = 180_000 } = options;

  // ── 1. 콘솔 수집 시작 ──
  const logs = createLogCollector(page);

  // ── 2. 외부 CDN 차단 (headless 환경에서 로딩 블로킹 방지) ──
  await page.route('**/*.{woff,woff2,ttf,eot}', route => route.abort());
  await page.route('**/cdn.portone.io/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.route('**/fontawesome**', route => route.abort());

  // ── 3. 페이지 진입 ── 직접 /blog 경로로 이동
  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // ── 5. debug helper reset ──
  await page.evaluate(() => {
    try { (window as any).__IMG_RESET_STATS?.(); } catch {}
  }).catch(() => {});

  // ── 6. topic 입력 ──
  const topicInput = page.locator('input[placeholder*="블로그 제목"]').or(
    page.locator('input[placeholder*="블로그"]')
  ).first();
  await topicInput.waitFor({ state: 'visible', timeout: 15_000 });
  await topicInput.fill(topic);

  // ── 7. 이미지 수 설정 (range slider) ──
  await page.evaluate((count) => {
    const slider = document.querySelector('input[type="range"][min="0"][max="5"]') as HTMLInputElement;
    if (slider) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      nativeInputValueSetter?.call(slider, String(count));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, imageCount);
  await page.waitForTimeout(300);

  // ── 8. 이미지 스타일 선택 ──
  const styleLabel = imageStyle === 'photo' ? '실사' : '일러스트';
  const styleBtn = page.locator(`button:has-text("${styleLabel}")`).first();
  if (await styleBtn.isVisible().catch(() => false)) {
    await styleBtn.click();
    await page.waitForTimeout(300);
  }

  // ── 9. 생성 버튼 클릭 ──
  const t0 = Date.now();
  const generateBtn = page.locator('button:has-text("블로그 원고 생성")');
  await generateBtn.click();

  // ── 10. 완료 대기 ──
  // Playwright locator 기반: .naver-preview (ResultPreview 렌더 컨테이너) 출현 대기
  const resultLocator = page.locator('.naver-preview').first();
  try {
    await resultLocator.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    // timeout — 부분 결과라도 수집
    console.log(`[E2E] ⚠️ .naver-preview not visible after ${timeoutMs}ms`);
  }

  const durationMs = Date.now() - t0;

  // 결과 렌더 완전 대기 (이미지 로드 등)
  await page.waitForTimeout(8000);

  // 디버깅: 현재 상태 스크린샷 + DOM 구조 로그
  await page.screenshot({ path: `test-results/debug-after-gen-${imageCount}img-${imageStyle}.png` }).catch(() => {});

  // ── 11. 결과 수집 ──
  // 여러 셀렉터 시도: contenteditable → naver-preview → 결과 컨테이너
  let resultVisible = await page.locator('div[contenteditable="true"]').isVisible().catch(() => false);
  if (!resultVisible) {
    resultVisible = await page.locator('.naver-preview').isVisible().catch(() => false);
  }
  if (!resultVisible) {
    // 결과가 있는지 더 넓게 확인 (ResultPreview 렌더 여부)
    resultVisible = await page.evaluate(() => {
      // naver-preview 클래스 또는 contentEditable div가 있는지
      const np = document.querySelector('.naver-preview');
      const ce = document.querySelector('[contenteditable]');
      return !!(np || ce);
    }).catch(() => false);
  }

  let imageCountInResult = 0;
  if (resultVisible) {
    imageCountInResult = await page.locator('div[contenteditable="true"] img').count().catch(() => 0);
    if (imageCountInResult === 0) {
      imageCountInResult = await page.locator('.naver-preview img').count().catch(() => 0);
    }
  }

  // 경고 배너: bg-amber-50 또는 bg-amber-900 (dark mode)
  let hasImageWarning = await page.locator('div.bg-amber-50').isVisible().catch(() => false);
  if (!hasImageWarning) {
    hasImageWarning = await page.locator('[class*="amber"]').first().isVisible().catch(() => false);
  }
  let warningText = '';
  if (hasImageWarning) {
    warningText = await page.locator('[class*="amber"]').first().textContent().catch(() => '') || '';
  }

  // ── 12. debug helpers ──
  await page.evaluate(() => {
    try { (window as any).__IMG_PRINT_STATS?.(); } catch {}
  }).catch(() => {});
  await page.waitForTimeout(500);

  let debugVerify = '';
  try {
    debugVerify = await page.evaluate(() => {
      try {
        const result = (window as any).__IMG_VERIFY?.();
        return typeof result === 'string' ? result : JSON.stringify(result || '');
      } catch { return ''; }
    }) || '';
  } catch {}

  // ── 13. hero & persisted 파싱 ──
  const heroResult = parseHeroResult(logs.imgFinal);
  const persistedInfo = parsePersistedInfo(logs.all);

  return {
    resultVisible,
    imageCount: imageCountInResult,
    hasImageWarning,
    warningText,
    logs,
    summary: parseImgSummary(logs.imgSummary),
    heroResult,
    persistedInfo,
    durationMs,
    debugVerify,
  };
}
