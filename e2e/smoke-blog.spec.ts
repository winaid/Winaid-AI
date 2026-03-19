/**
 * Blog 생성 Smoke Test — 배포 전 핵심 흐름 검증
 *
 * 목적: 블로그 페이지 진입 → 입력 → 생성 시작까지의 UI 흐름이 깨지지 않았는지 확인.
 * 실제 API 호출 없이도 UI 레벨 검증 가능한 범위를 커버한다.
 *
 * 실행:
 *   E2E_BASE_URL=http://localhost:5173 npx playwright test smoke-blog
 *   E2E_BASE_URL=https://ai-hospital.pages.dev npx playwright test smoke-blog
 */
import { test, expect } from '@playwright/test';
import { blockHeavyResources, navigateTo, assertResultPreview } from './helpers/common';

test.describe('Blog 생성 Smoke Test', () => {

  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('블로그 페이지 진입 및 입력 폼 표시', async ({ page }) => {
    await navigateTo(page, '/blog');

    // 주제 입력란이 보이는지
    const topicInput = page.locator('input[placeholder*="블로그"]').first();
    await expect(topicInput).toBeVisible({ timeout: 15_000 });

    // 이미지 수 슬라이더가 보이는지
    const slider = page.locator('input[type="range"]').first();
    await expect(slider).toBeVisible();

    // 생성 버튼이 보이는지
    const genBtn = page.locator('button:has-text("블로그 원고 생성")');
    await expect(genBtn).toBeVisible();
  });

  test('주제 입력 후 생성 버튼 활성 상태', async ({ page }) => {
    await navigateTo(page, '/blog');

    const topicInput = page.locator('input[placeholder*="블로그"]').first();
    await topicInput.waitFor({ state: 'visible', timeout: 15_000 });
    await topicInput.fill('임플란트 시술 과정');
    await page.waitForTimeout(500);

    // 생성 버튼이 활성화되어야 함
    const genBtn = page.locator('button:has-text("블로그 원고 생성")');
    await expect(genBtn).toBeEnabled();
  });

  test('이미지 수 슬라이더 0~5 조절', async ({ page }) => {
    await navigateTo(page, '/blog');

    // 슬라이더 값 변경
    await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"][min="0"][max="5"]') as HTMLInputElement;
      if (slider) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(slider, '3');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // 이미지 수 표시가 3장인지 확인
    const imgCountText = page.locator('text=3장').first();
    await expect(imgCountText).toBeVisible();
  });

  test('이미지 스타일 버튼 선택 가능', async ({ page }) => {
    await navigateTo(page, '/blog');

    // 스타일 버튼들이 보이는지 (일러스트/실사/메디컬 중 하나)
    const styleButtons = page.locator('button').filter({ hasText: /일러스트|실사|메디컬/ });
    const count = await styleButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('빈 주제로 생성 시도 시 차단', async ({ page }) => {
    await navigateTo(page, '/blog');

    const topicInput = page.locator('input[placeholder*="블로그"]').first();
    await topicInput.waitFor({ state: 'visible', timeout: 15_000 });

    // 주제 비우기
    await topicInput.fill('');
    await page.waitForTimeout(300);

    // 생성 버튼이 비활성이거나 클릭해도 에러
    const genBtn = page.locator('button:has-text("블로그 원고 생성")');
    const isDisabled = await genBtn.isDisabled().catch(() => false);

    if (!isDisabled) {
      // 클릭해도 생성이 시작되지 않아야 함
      await genBtn.click();
      await page.waitForTimeout(1000);
      // 결과 화면으로 넘어가지 않아야 함
      const result = await assertResultPreview(page);
      expect(result.visible).toBe(false);
    }
  });
});
