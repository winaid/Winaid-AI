import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './helpers/mocks';

/**
 * 인증 페이지 UI 스모크 테스트 — 실제 Supabase 회원가입/로그인 X.
 * 폼 요소 존재와 탭 전환만 검증.
 *
 * (실제 회원가입/로그인 플로우는 기존 smoke.spec.ts가 수행)
 */
test.describe('인증 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('/auth 페이지 로드 + 로그인 폼 요소 존재', async ({ page }) => {
    const res = await page.goto('/auth');
    expect(res?.status()).toBeLessThan(400);
    // Supabase 미설정 시 "로그인 서비스 준비 중" 화면이 나올 수 있음 — 둘 다 허용
    const readyState = await Promise.race([
      page.locator('input[type="email"]').first().waitFor({ timeout: 5000 }).then(() => 'form' as const).catch(() => null),
      page.locator('text=로그인 서비스 준비 중').first().waitFor({ timeout: 5000 }).then(() => 'unconfigured' as const).catch(() => null),
    ]);

    if (readyState === 'form') {
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    } else {
      // Supabase 미설정 상태 — 이것도 정상 동작 (의도된 안내)
      await expect(page.locator('text=로그인 서비스 준비 중').first()).toBeVisible();
    }
  });

  test('로그인 ↔ 회원가입 탭 전환', async ({ page }) => {
    await page.goto('/auth');
    // Supabase 미설정이면 탭 없음 → 이 테스트는 건너뛴다
    const hasForm = await page.locator('input[type="email"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasForm, 'Supabase 미설정 환경 — 로그인 폼 미노출');

    // 회원가입 탭
    const signupTab = page.locator('button:has-text("회원가입")').first();
    await signupTab.click();
    // 회원가입 폼 특징: "비밀번호 재입력" 필드
    await expect(page.locator('input[placeholder*="재입력"]').first()).toBeVisible({ timeout: 5000 });

    // 로그인 탭으로 복귀
    const loginTab = page.locator('button:has-text("로그인")').first();
    await loginTab.click();
    // "재입력" 필드가 사라져야 함
    await expect(page.locator('input[placeholder*="재입력"]').first()).not.toBeVisible({ timeout: 3000 });
  });
});
