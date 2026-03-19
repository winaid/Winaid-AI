/**
 * 블로그 생성 E2E 헬퍼 — Playwright용 공통 동작 추상화
 *
 * 반복되는 "페이지 열기 → 주제 입력 → 이미지 수 설정 → 생성 → 완료 대기 → 결과 수집"
 * 흐름을 helper로 분리하여 0~5장 각 시나리오에서 재사용.
 */
import type { Page } from '@playwright/test';

// ── 콘솔 로그 수집 ──

export interface CollectedLogs {
  imgSummary: string[];   // [IMG-SUMMARY] 패턴
  imgContract: string[];  // [IMG-CONTRACT] 패턴
  imgPlan: string[];      // [IMG-PLAN] 패턴
  imgHeroRetry: string[]; // [IMG-HERO-RETRY] 패턴
  blogFlow: string[];     // [BLOG_FLOW] 패턴
  warnings: string[];     // ⚠️ 포함 로그
  errors: string[];       // console.error
  all: string[];          // 전체 로그
}

export function createLogCollector(page: Page): CollectedLogs {
  const logs: CollectedLogs = {
    imgSummary: [], imgContract: [], imgPlan: [], imgHeroRetry: [],
    blogFlow: [], warnings: [], errors: [], all: [],
  };

  page.on('console', (msg) => {
    const text = msg.text();
    logs.all.push(text);
    if (text.includes('[IMG-SUMMARY]')) logs.imgSummary.push(text);
    if (text.includes('[IMG-CONTRACT]')) logs.imgContract.push(text);
    if (text.includes('[IMG-PLAN]')) logs.imgPlan.push(text);
    if (text.includes('[IMG-HERO-RETRY]')) logs.imgHeroRetry.push(text);
    if (text.includes('[BLOG_FLOW]')) logs.blogFlow.push(text);
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
  // 마지막 summary 로그 사용 (여러 wave가 있으면 마지막이 전체 요약)
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

// ── 블로그 생성 흐름 ──

export interface BlogGenerationResult {
  /** 결과 화면이 표시되었는지 */
  resultVisible: boolean;
  /** 결과 HTML 내 이미지 수 */
  imageCount: number;
  /** 이미지 경고 배너 존재 여부 */
  hasImageWarning: boolean;
  /** 경고 배너 텍스트 */
  warningText: string;
  /** 콘솔 로그 기반 수집 데이터 */
  logs: CollectedLogs;
  /** 파싱된 IMG-SUMMARY */
  summary: ImageSummaryData | null;
  /** 생성 소요 시간 (ms) */
  durationMs: number;
}

/**
 * 블로그 생성 전체 흐름 실행.
 *
 * 1. 페이지 진입
 * 2. (debug helper reset)
 * 3. topic 입력
 * 4. 이미지 수 설정
 * 5. 생성 버튼 클릭
 * 6. 완료 대기 (spinner 소멸 + 결과 표시)
 * 7. 결과 수집
 */
export async function runBlogGeneration(
  page: Page,
  options: {
    topic: string;
    imageCount: number;
    timeoutMs?: number;
  },
): Promise<BlogGenerationResult> {
  const { topic, imageCount, timeoutMs = 180_000 } = options;

  // ── 1. 콘솔 수집 시작 ──
  const logs = createLogCollector(page);

  // ── 2. 외부 CDN 차단 (headless 환경에서 로딩 블로킹 방지) ──
  await page.route('**/*.{woff,woff2,ttf,eot}', route => route.abort());
  await page.route('**/cdn.portone.io/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.route('**/fontawesome**', route => route.abort());

  // ── 3. 페이지 진입 ──
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // React hydration 대기
  await page.waitForTimeout(3000);

  // ── 4. 랜딩/홈 → 블로그 InputForm 진입 ──
  // 랜딩 페이지: "무료로 시작하기" 클릭
  const landingStart = page.locator('button:has-text("무료로 시작하기")').first();
  if (await landingStart.isVisible().catch(() => false)) {
    await landingStart.click();
    await page.waitForTimeout(1500);
  }
  // 홈 대시보드: 블로그 카드의 "시작하기" 클릭
  // 사이드바 "블로그" 메뉴 또는 블로그 카드 시작하기 버튼
  const blogSidebar = page.locator('text=블로그').first();
  if (await blogSidebar.isVisible().catch(() => false)) {
    await blogSidebar.click();
    await page.waitForTimeout(1500);
  }

  // ── 5. debug helper reset (가능하면) ──
  await page.evaluate(() => {
    try { (window as any).__IMG_RESET_STATS?.(); } catch {}
  }).catch(() => {});

  // ── 6. topic 입력 ──
  // 앱 진입 후 topic input 탐색 (블로그 제목 또는 일반 input)
  const topicInput = page.locator('input[placeholder*="블로그 제목"]').or(
    page.locator('input[placeholder*="블로그"]')
  ).first();
  await topicInput.waitFor({ state: 'visible', timeout: 15_000 });
  await topicInput.fill(topic);

  // ── 5. 이미지 수 설정 ──
  // range slider 값 변경 (React state 반영을 위해 input + change 이벤트)
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

  // 설정 반영 대기
  await page.waitForTimeout(300);

  // ── 6. 생성 버튼 클릭 ──
  const t0 = Date.now();
  const generateBtn = page.locator('button:has-text("블로그 원고 생성")');
  await generateBtn.click();

  // ── 7. 완료 대기 ──
  // 전략: "생성 중..." 버튼 텍스트가 원래 텍스트로 돌아오면 완료
  // + 결과 영역(contenteditable)이 나타나면 추가 확인
  try {
    // 버튼이 다시 활성화될 때까지 대기 (= 생성 완료)
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button') as HTMLButtonElement | null;
        // "생성 중..." 텍스트가 사라지면 완료
        return btn && !btn.textContent?.includes('생성 중');
      },
      { timeout: timeoutMs },
    );
  } catch {
    // timeout — 결과가 부분적으로 나왔을 수 있으므로 계속 수집
  }

  const durationMs = Date.now() - t0;

  // 결과 렌더 대기 (짧게)
  await page.waitForTimeout(2000);

  // ── 8. 결과 수집 ──
  const resultVisible = await page.locator('div[contenteditable="true"]').isVisible().catch(() => false);

  let imageCountInResult = 0;
  if (resultVisible) {
    imageCountInResult = await page.locator('div[contenteditable="true"] img').count().catch(() => 0);
  }

  const hasImageWarning = await page.locator('div.bg-amber-50').isVisible().catch(() => false);
  let warningText = '';
  if (hasImageWarning) {
    warningText = await page.locator('div.bg-amber-50').textContent().catch(() => '') || '';
  }

  // ── 9. debug helper 결과 (가능하면) ──
  await page.evaluate(() => {
    try { (window as any).__IMG_PRINT_STATS?.(); } catch {}
  }).catch(() => {});

  // 수집 대기
  await page.waitForTimeout(500);

  return {
    resultVisible,
    imageCount: imageCountInResult,
    hasImageWarning,
    warningText,
    logs,
    summary: parseImgSummary(logs.imgSummary),
    durationMs,
  };
}
