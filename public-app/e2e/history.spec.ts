import { test, expect } from '@playwright/test';
import { setupCommonMocks, guestUrl } from './helpers/mocks';

/**
 * 히스토리 페이지 스모크.
 *
 * 주의: /history는 /mypage로 리다이렉트되도록 최근 변경됨.
 * 따라서 이 테스트는 리다이렉트 자체가 동작하는지만 확인한다.
 */
test.describe('히스토리 리다이렉트', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('/history → /mypage 로 리다이렉트', async ({ page }) => {
    await page.goto(guestUrl('/history'));
    // 클라이언트 리다이렉트(useEffect + router.replace)이므로 URL 변경 대기
    await expect(page).toHaveURL(/\/mypage/, { timeout: 10000 });
  });
});
