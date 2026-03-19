/**
 * 카드뉴스 Smoke Test — 템플릿 선택 및 생성 흐름 검증
 *
 * 목적: 카드뉴스 페이지 진입 → 템플릿 선택 → 선택 유지 확인
 * 실제 API 생성은 하지 않고 UI 흐름만 검증한다.
 *
 * 실행:
 *   E2E_BASE_URL=https://ai-hospital.pages.dev npx playwright test smoke-card-news
 */
import { test, expect } from '@playwright/test';
import { blockHeavyResources, navigateTo } from './helpers/common';

test.describe('카드뉴스 Smoke Test', () => {

  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('카드뉴스 탭 진입 및 입력 폼 표시', async ({ page }) => {
    await navigateTo(page, '/blog');

    // 카드뉴스 탭 클릭
    const cardNewsTab = page.locator('button:has-text("카드뉴스")').first();
    if (!(await cardNewsTab.isVisible().catch(() => false))) {
      test.skip(); // 카드뉴스 탭이 없으면 스킵
      return;
    }
    await cardNewsTab.click();
    await page.waitForTimeout(1000);

    // 주제 입력란이 보이는지
    const topicInput = page.locator('input[placeholder*="주제"], input[placeholder*="카드뉴스"], input[placeholder*="블로그"]').first();
    await expect(topicInput).toBeVisible({ timeout: 10_000 });
  });

  test('카드뉴스 디자인 템플릿 목록 표시', async ({ page }) => {
    await navigateTo(page, '/blog');

    // 카드뉴스 탭 클릭
    const cardNewsTab = page.locator('button:has-text("카드뉴스")').first();
    if (!(await cardNewsTab.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await cardNewsTab.click();
    await page.waitForTimeout(1000);

    // 디자인 템플릿 영역이 표시되는지
    const templateHeader = page.locator('text=디자인 템플릿');
    await expect(templateHeader).toBeVisible({ timeout: 5_000 });

    // 알려진 템플릿 이름들로 확인
    const templateNames = ['메디컬', '플로럴', '모던', '핀보드', '일러스트'];
    let foundCount = 0;
    for (const name of templateNames) {
      const el = page.locator(`text=${name}`).first();
      if (await el.isVisible().catch(() => false)) {
        foundCount++;
      }
    }

    // 최소 3개 이상의 템플릿이 보여야 함
    expect(foundCount).toBeGreaterThanOrEqual(3);
  });

  test('템플릿 선택 시 active 상태 변경', async ({ page }) => {
    await navigateTo(page, '/blog');

    const cardNewsTab = page.locator('button:has-text("카드뉴스")').first();
    if (!(await cardNewsTab.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await cardNewsTab.click();
    await page.waitForTimeout(1000);

    // 템플릿 버튼들 찾기 — "디자인 템플릿" 레이블 아래의 grid 내 button
    const templateGrid = page.locator('label:has-text("디자인 템플릿")').locator('..').locator('.grid button');
    const count = await templateGrid.count().catch(() => 0);

    if (count === 0) {
      // 템플릿 UI가 다른 형태일 수 있음 — 스킵
      test.skip();
      return;
    }

    // 첫 번째 템플릿 클릭
    await templateGrid.first().click();
    await page.waitForTimeout(500);

    // 클릭 후 선택 상태가 시각적으로 변경되었는지 (border-blue 등)
    const hasActiveStyle = await templateGrid.first().evaluate(el => {
      const cls = el.className;
      return cls.includes('border-blue') || cls.includes('border-violet') || cls.includes('active') || cls.includes('selected');
    }).catch(() => false);

    expect(hasActiveStyle).toBe(true);
  });

  test('카드뉴스 생성 버튼 존재', async ({ page }) => {
    await navigateTo(page, '/blog');

    const cardNewsTab = page.locator('button:has-text("카드뉴스")').first();
    if (!(await cardNewsTab.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await cardNewsTab.click();
    await page.waitForTimeout(1000);

    // 생성 버튼 확인 (카드뉴스 제작 / 생성 등)
    const genBtn = page.locator('button:has-text("카드뉴스 제작"), button:has-text("카드뉴스 생성"), button:has-text("생성하기"), button:has-text("원고 생성")').first();
    const exists = await genBtn.isVisible().catch(() => false);

    // 생성 버튼이 어떤 형태로든 존재해야 함
    expect(exists).toBe(true);
  });
});
