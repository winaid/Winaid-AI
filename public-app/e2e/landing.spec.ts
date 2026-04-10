import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './helpers/mocks';

/**
 * 랜딩 페이지 스모크 테스트 — 외부 API 호출 없이 UI만 검증.
 * 기존 smoke.spec.ts의 랜딩 테스트와 달리 완전 mock 기반으로 빠르게 실행.
 */
test.describe('랜딩 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('/ 페이지가 200으로 로드되고 CTA가 보인다', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBeLessThan(400);
    // 히어로 섹션의 /auth 링크 — CTA 버튼 (여러 개 있을 수 있으므로 first)
    await expect(page.locator('a[href="/auth"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('CTA 클릭 시 /auth로 이동', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/auth"]').first().click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('모바일 뷰포트에서도 랜딩이 깨지지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const res = await page.goto('/');
    expect(res?.status()).toBeLessThan(400);
    // 가로 스크롤이 생기면 UI 깨짐의 신호 — body 가로 overflow 확인
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px 오차 허용
  });
});
