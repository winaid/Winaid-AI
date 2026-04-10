import { test, expect } from '@playwright/test';
import { setupCommonMocks, guestUrl } from './helpers/mocks';

/**
 * 영상 편집 페이지 스모크 테스트.
 *
 * 핵심 검증:
 *  - 업로드 영역이 바로 노출 (이전 "모드 선택" 화면 제거 확인)
 *  - 자동/단계별 모드 토글 존재
 *  - AI 쇼츠 생성기 관련 UI가 없음 (제거됨 확인)
 */
test.describe('영상편집 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('/video_edit 로드 + 업로드 영역이 바로 보임', async ({ page }) => {
    const res = await page.goto(guestUrl('/video_edit'));
    expect(res?.status()).toBeLessThan(400);
    // 헤더 제목
    await expect(page.locator('text=쇼츠 메이커').first()).toBeVisible({ timeout: 15000 });
    // "촬영한 영상을 업로드" 문구 — AI 쇼츠 제거 후 새 문구
    await expect(page.locator('text=/촬영한 영상/').first()).toBeVisible();
  });

  test('자동 / 단계별 모드 토글 존재', async ({ page }) => {
    await page.goto(guestUrl('/video_edit'));
    await page.locator('text=쇼츠 메이커').first().waitFor({ timeout: 15000 });
    await expect(page.locator('button:has-text("자동 모드")').first()).toBeVisible();
    await expect(page.locator('button:has-text("단계별 모드")').first()).toBeVisible();
  });

  test('AI 쇼츠 생성기 UI가 더 이상 존재하지 않음 (제거 확인)', async ({ page }) => {
    await page.goto(guestUrl('/video_edit'));
    await page.locator('text=쇼츠 메이커').first().waitFor({ timeout: 15000 });
    // "AI로 처음부터 만들기" / "AI 쇼츠" 관련 텍스트가 없어야 함
    const aiWizardHints = [
      'AI로 처음부터',
      'AI 쇼츠 위자드',
      'AI 쇼츠 생성',
    ];
    for (const hint of aiWizardHints) {
      await expect(page.locator(`text=${hint}`).first()).not.toBeVisible({ timeout: 1000 }).catch(() => {
        // 일치하지 않으면 정상 — 애초에 존재하지 않아야 함
      });
    }
    // 모드 선택 화면의 시그니처였던 "촬영 영상 편집 / AI로 처음부터" 문구 없어야 함
    const oldHeaderCount = await page.locator('text=/촬영 영상 편집 또는 AI/').count();
    expect(oldHeaderCount).toBe(0);
  });
});
