import { test, expect } from '@playwright/test';
import { setupCommonMocks, guestUrl } from './helpers/mocks';

/** AI 보정 페이지 스모크 — 텍스트 입력 영역과 CTA만 확인 */
test.describe('AI 보정 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('/refine 로드 + 텍스트 입력 영역 존재', async ({ page }) => {
    const res = await page.goto(guestUrl('/refine'));
    expect(res?.status()).toBeLessThan(400);
    // 페이지 hydration — textarea 1개 이상
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
  });

  test('안내 문구 "AI로 글을 다듬어보세요" 표시', async ({ page }) => {
    await page.goto(guestUrl('/refine'));
    // "AI로 글을" 문구 (\n 태그가 중간에 있을 수 있어 부분 매칭)
    await expect(page.locator('text=/AI로 글을/').first()).toBeVisible({ timeout: 15000 });
  });
});
