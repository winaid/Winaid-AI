import { test, expect } from '@playwright/test';
import { setupCommonMocks, injectCardNewsDraft, guestUrl } from './helpers/mocks';

/**
 * Konva 에디터 통합 테스트
 *
 * 드래프트를 주입해서 슬라이드 그리드를 표시한 뒤,
 * Konva 프리뷰 렌더링 + 편집 모달 동작을 검증.
 */

async function setupWithDraft(page: import('@playwright/test').Page) {
  await setupCommonMocks(page);
  await page.goto(guestUrl('/card_news'));
  await page.locator('textarea').first().waitFor({ timeout: 15000 });
  await injectCardNewsDraft(page, { topic: 'konva 테스트', userId: null, slideCount: 3 });
  await page.reload();
  await page.locator('button:has-text("이어서 편집")').first().click();
  // Konva canvas가 렌더될 때까지 대기
  await page.locator('canvas').first().waitFor({ timeout: 10000 });
}

test.describe('Konva 에디터', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('T1: 그리드에 Konva canvas 렌더됨', async ({ page }) => {
    await setupWithDraft(page);
    // Konva Stage는 canvas 요소를 생성
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThanOrEqual(3); // 슬라이드 3장
  });

  test('T2: 편집 모달 열기/닫기', async ({ page }) => {
    await setupWithDraft(page);
    // "수정" 버튼으로 편집 모달 열기
    const editBtn = page.locator('button:has-text("수정")').first();
    await editBtn.click();
    await expect(page.locator('[data-testid="editor-close"]')).toBeVisible({ timeout: 5000 });
    // 모달 안에도 Konva canvas가 있어야 함
    const modalCanvas = page.locator('.fixed canvas').first();
    await expect(modalCanvas).toBeVisible({ timeout: 5000 });
    // 닫기
    await page.locator('[data-testid="editor-close"]').click();
    await expect(page.locator('[data-testid="editor-close"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('T3: 배치 버튼 없음 (Konva 전환 후 제거)', async ({ page }) => {
    await setupWithDraft(page);
    await expect(page.locator('button:has-text("배치")')).not.toBeVisible();
  });

  test('T4: 드래프트 저장/복원', async ({ page }) => {
    await setupWithDraft(page);
    // 자동 저장 대기
    await page.waitForTimeout(4000);
    const draft = await page.evaluate(() => localStorage.getItem('winai-cardnews-draft'));
    expect(draft).toBeTruthy();
    const parsed = JSON.parse(draft!);
    expect(parsed.proSlides?.length).toBeGreaterThanOrEqual(3);
  });

  test('T5: 슬라이드 복제', async ({ page }) => {
    await setupWithDraft(page);
    const firstCard = page.locator('canvas').first();
    await firstCard.hover();
    const cloneBtn = page.locator('button[title="복제"]').first();
    if (await cloneBtn.isVisible()) {
      await cloneBtn.click();
      await page.waitForTimeout(500);
      const canvasCount = await page.locator('canvas').count();
      expect(canvasCount).toBeGreaterThanOrEqual(4);
    }
  });
});
