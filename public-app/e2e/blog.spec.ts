import { test, expect } from '@playwright/test';
import { setupCommonMocks, guestUrl } from './helpers/mocks';

/**
 * 블로그 생성 페이지 스모크 — mock 기반, 실제 Gemini 호출 없음.
 *
 * 기존 smoke.spec.ts는 실제 API를 호출하는 integration 테스트라 CI에서
 * 120초 이상 걸림. 이 파일은 완전 mock으로 빠르게 "페이지가 그려지는가"만 검증.
 */
test.describe('블로그 생성 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('게스트 모드로 /blog 진입 가능', async ({ page }) => {
    const res = await page.goto(guestUrl('/blog'));
    expect(res?.status()).toBeLessThan(400);
    // 페이지가 hydrate 될 때까지 대기 — textarea 또는 input이 최소 1개 이상
    const anyInput = page.locator('textarea, input[type="text"]').first();
    await expect(anyInput).toBeVisible({ timeout: 15000 });
  });

  test('/blog 에서 "생성" 또는 유사 CTA가 존재', async ({ page }) => {
    await page.goto(guestUrl('/blog'));
    // 페이지 hydration 대기
    await page.locator('textarea, input[type="text"]').first().waitFor({ timeout: 15000 });
    // 생성/작성/만들기 중 하나는 있어야 함
    const cta = page.locator('button').filter({ hasText: /생성|작성|만들기/ }).first();
    await expect(cta).toBeVisible({ timeout: 5000 });
  });
});
