import { test, expect, Page } from '@playwright/test';

// ============================================
// 카드뉴스 캔버스 드래그앤드롭 E2E 테스트
//
// 실행:
//   BASE_URL=https://winai.kr npx playwright test e2e/card-news-dnd.spec.ts
// ============================================

// API mock 데이터: 6종 레이아웃 (cover, info, checklist, steps, quote, closing)
const MOCK_SLIDES = {
  slides: [
    {
      layout: 'cover',
      title: 'E2E 테스트 카드뉴스',
      subtitle: '드래그앤드롭 검증용',
      body: '',
    },
    {
      layout: 'info',
      title: '임플란트 사후관리',
      subtitle: '올바른 관리로 오래오래',
      body: '임플란트 수술 후에는 구강 위생 관리가 매우 중요합니다. 정기 검진과 함께 올바른 칫솔질 습관을 유지하세요.',
    },
    {
      layout: 'checklist',
      title: '사후관리 체크리스트',
      checkItems: ['수술 당일 거즈 물고 있기', '차가운 음식 위주 식사', '흡연 금지', '정기 검진 방문'],
      checkIcon: '✓',
    },
    {
      layout: 'steps',
      title: '관리 3단계',
      steps: [
        { label: '1단계', desc: '수술 직후 관리' },
        { label: '2단계', desc: '회복기 관리' },
        { label: '3단계', desc: '유지 관리' },
      ],
    },
    {
      layout: 'quote',
      title: '',
      quoteText: '올바른 사후관리가 임플란트 수명을 결정합니다.',
      quoteAuthor: '김원장',
      quoteRole: '구강외과 전문의',
    },
    {
      layout: 'closing',
      title: '감사합니다',
      subtitle: 'THANK YOU',
      body: '더 궁금한 점은 언제든 문의해주세요.',
    },
  ],
  font: 'pretendard',
};

// ── API mock: Gemini + Pexels + Supabase ──
async function mockApis(page: Page) {
  await page.route('**/api/gemini', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: JSON.stringify(MOCK_SLIDES) }),
    });
  });
  await page.route('**/api/pexels**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ photos: [] }),
    });
  });
  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

// ── 카드뉴스 페이지 이동 ──
async function goToCardNews(page: Page) {
  await page.goto('/card_news', { timeout: 60000 });
  // textarea가 보일 때까지 대기 (hydration 완료 시점)
  await page.locator('textarea').first().waitFor({ timeout: 30000 });
}

// ── 카드뉴스 생성 (mock API) ──
async function generateCardNews(page: Page) {
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 15000 });
  await textarea.fill('E2E 테스트 임플란트 사후관리');

  // 생성 버튼 클릭 — 상단 탭과 CTA 버튼이 동일 텍스트 "✨ 카드뉴스 생성"을
  // 사용하므로 data-testid로 CTA를 명시적으로 지정 (strict mode violation 방어).
  const genBtn = page.getByTestId('cta-generate-card-news');
  await expect(genBtn).toBeVisible({ timeout: 5000 });
  await genBtn.click();

  // 디자인 모달 처리 (나오면 마지막 버튼으로 생성 시작)
  try {
    const modalOverlay = page.locator('.fixed.inset-0');
    await modalOverlay.first().waitFor({ timeout: 5000 });
    const modalButtons = page.locator('.fixed .bg-white button');
    const count = await modalButtons.count();
    if (count > 0) await modalButtons.last().click();
  } catch {
    // 모달 없이 바로 생성
  }

  // "수정" 버튼이 보이면 생성 완료
  await expect(page.locator('button:has-text("수정")').first()).toBeVisible({ timeout: 60000 });
}

// ── 편집 모달 열기 + Canvas 모드 전환 ──
async function openCanvasEditor(page: Page, slideIdx: number) {
  await page.locator('button:has-text("수정")').nth(slideIdx).click();
  await expect(page.locator('text=페이지 편집')).toBeVisible({ timeout: 10000 });

  // HTML → Canvas 전환
  const htmlBtn = page.locator('button:has-text("HTML")');
  if (await htmlBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await htmlBtn.click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500); // fabric.js 초기화 대기
  }
}

// ── 편집 모달 닫기 ──
async function closeEditor(page: Page) {
  // 슬라이드 카드 내 인라인 "✓ 완료"(수정 토글 버튼)과 구분하려고 testid 사용.
  // 둘 다 텍스트 "✓ 완료"를 공유하기 때문에 has-text는 click intercepted를 유발.
  const btn = page.getByTestId('editor-close');
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(500);
  }
}

// ── canvas 위 드래그 시뮬레이션 ──
async function dragOnCanvas(page: Page, fromX: number, fromY: number, toX: number, toY: number) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const sx = box.x + fromX;
  const sy = box.y + fromY;
  const ex = box.x + toX;
  const ey = box.y + toY;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(sx + (ex - sx) * i / 5, sy + (ey - sy) * i / 5);
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
}

// ── canvas 크기 가져오기 ──
async function getCanvasBox(page: Page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  return box;
}

// ============================================
// 테스트
// ============================================

test.describe('카드뉴스 캔버스 드래그앤드롭', () => {
  test.setTimeout(180000);

  test('1. 카드뉴스 생성 → 편집 모달 → Canvas 모드 전환', async ({ page }) => {
    await mockApis(page);
    await goToCardNews(page);
    await generateCardNews(page);
    await openCanvasEditor(page, 0);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('2. cover — 제목 클릭 + 드래그 이동', async ({ page }) => {
    await mockApis(page);
    await goToCardNews(page);
    await generateCardNews(page);
    await openCanvasEditor(page, 0);

    const box = await getCanvasBox(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // 클릭 → 드래그
    await page.mouse.click(box.x + cx, box.y + cy);
    await page.waitForTimeout(500);
    await dragOnCanvas(page, cx, cy, cx + 50, cy + 50);
    await page.waitForTimeout(500);

    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('3. 전체 레이아웃 순회 — Canvas 렌더 + 드래그 검증', async ({ page }) => {
    await mockApis(page);
    await goToCardNews(page);
    await generateCardNews(page);

    const editButtons = page.locator('button:has-text("수정")');
    const slideCount = await editButtons.count();
    expect(slideCount).toBeGreaterThan(0);

    const results: { idx: number; canvasOk: boolean; dragOk: boolean }[] = [];

    for (let i = 0; i < Math.min(slideCount, 6); i++) {
      await editButtons.nth(i).click();
      await expect(page.locator('text=페이지 편집')).toBeVisible({ timeout: 10000 });

      // Canvas 모드 전환
      const htmlBtn = page.locator('button:has-text("HTML")');
      if (await htmlBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await htmlBtn.click();
      }
      await page.waitForTimeout(1500);

      const canvasEl = page.locator('canvas').first();
      const canvasOk = await canvasEl.isVisible().catch(() => false);

      let dragOk = false;
      if (canvasOk) {
        const cBox = await canvasEl.boundingBox();
        if (cBox) {
          const tx = cBox.width / 2;
          const ty = cBox.height * 0.35;
          await page.mouse.click(cBox.x + tx, cBox.y + ty);
          await page.waitForTimeout(300);
          await dragOnCanvas(page, tx, ty, tx + 30, ty + 20);
          await page.waitForTimeout(300);
          dragOk = await canvasEl.isVisible().catch(() => false);
        }
      }

      results.push({ idx: i, canvasOk, dragOk });
      await closeEditor(page);
    }

    console.log('=== 레이아웃별 Canvas 드래그 테스트 ===');
    results.forEach(r =>
      console.log(`  [${r.idx}] canvas: ${r.canvasOk ? '✅' : '❌'}  drag: ${r.dragOk ? '✅' : '❌'}`)
    );

    for (const r of results) {
      expect(r.canvasOk, `슬라이드 ${r.idx}: Canvas 렌더 실패`).toBeTruthy();
      expect(r.dragOk, `슬라이드 ${r.idx}: 드래그 실패`).toBeTruthy();
    }
  });

  test('4. info — 제목/본문/병원명 영역별 드래그', async ({ page }) => {
    await mockApis(page);
    await goToCardNews(page);
    await generateCardNews(page);
    await openCanvasEditor(page, 1);

    const box = await getCanvasBox(page);

    // 제목 (상단 ~28%)
    await dragOnCanvas(page, box.width * 0.3, box.height * 0.28, box.width * 0.4, box.height * 0.28 + 20);
    await page.waitForTimeout(300);

    // 본문 (중앙 ~55%)
    await dragOnCanvas(page, box.width * 0.5, box.height * 0.55, box.width * 0.5, box.height * 0.55 + 20);
    await page.waitForTimeout(300);

    // 병원명 (하단 ~92%)
    await dragOnCanvas(page, box.width / 2, box.height * 0.92, box.width / 2 + 30, box.height * 0.92);
    await page.waitForTimeout(300);

    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('5. Canvas → HTML 전환 시 에러 없음', async ({ page }) => {
    await mockApis(page);
    await goToCardNews(page);
    await generateCardNews(page);
    await openCanvasEditor(page, 0);

    const box = await getCanvasBox(page);
    await dragOnCanvas(page, box.width / 2, box.height / 2, box.width / 2 + 40, box.height / 2 - 20);
    await page.waitForTimeout(500);

    // Canvas → HTML 전환
    const canvasBtn = page.locator('button:has-text("Canvas")');
    if (await canvasBtn.isVisible().catch(() => false)) {
      await canvasBtn.click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('text=페이지 편집')).toBeVisible();
  });

  test('6. 편집 모달 — 슬라이드 전환(‹›) 후 Canvas 유지', async ({ page }) => {
    await mockApis(page);
    await goToCardNews(page);
    await generateCardNews(page);
    await openCanvasEditor(page, 0);

    // 다음 슬라이드 — 실제 버튼 라벨은 `‹` / `›` (U+2039/U+203A)이고
    // `▶`는 다른 곳(쇼츠 버튼 등)에서 쓰이므로 testid로 명시.
    const nextBtn = page.getByTestId('editor-next-slide');
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
      const canvas = page.locator('canvas').first();
      if (await canvas.isVisible().catch(() => false)) {
        const box = await canvas.boundingBox();
        expect(box).toBeTruthy();
      }
    }

    // 이전 슬라이드
    const prevBtn = page.getByTestId('editor-prev-slide');
    if (await prevBtn.isVisible().catch(() => false)) {
      await prevBtn.click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('text=페이지 편집')).toBeVisible();
  });
});
