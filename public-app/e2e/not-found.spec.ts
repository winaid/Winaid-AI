import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './helpers/mocks';

/**
 * 존재하지 않는 경로 → Next.js 기본 404 페이지.
 * 주의: /admin 404 테스트는 기존 smoke.spec.ts #9와 중복되므로 여기서는 제외.
 */
test.describe('404 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('/nonexistent → 404 상태 코드', async ({ page }) => {
    const res = await page.goto('/nonexistent-path-' + Date.now());
    expect(res?.status()).toBe(404);
  });
});
