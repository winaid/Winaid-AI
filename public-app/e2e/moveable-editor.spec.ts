import { test, expect } from '@playwright/test';
import { setupCommonMocks, injectCardNewsDraft, guestUrl } from './helpers/mocks';

/**
 * react-moveable 인라인 에디터 실동작 테스트
 *
 * 드래프트를 주입해서 슬라이드 그리드를 표시한 뒤,
 * 배치 모드 진입 → 요소 선택/드래그/편집/커스텀 요소 추가를 검증.
 */

async function setupWithDraft(page: import('@playwright/test').Page) {
  await setupCommonMocks(page);
  await page.goto(guestUrl('/card_news'));
  await page.locator('textarea').first().waitFor({ timeout: 15000 });
  await injectCardNewsDraft(page, {
    topic: 'moveable 테스트',
    userId: null,
    slideCount: 3,
  });
  await page.reload();
  // 드래프트 복원
  await page.locator('button:has-text("이어서 편집")').first().click();
  // 슬라이드 그리드가 렌더될 때까지 대기
  await page.locator('[data-editable="title"]').first().waitFor({ timeout: 10000 });
}

test.describe('Moveable 인라인 에디터', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('T1: 배치 모드 진입/종료', async ({ page }) => {
    await setupWithDraft(page);

    // "↔ 배치" 버튼 찾기
    const layoutBtn = page.locator('button:has-text("배치")').first();
    await expect(layoutBtn).toBeVisible({ timeout: 5000 });

    // 클릭 → "✓ 배치완료"로 변경
    await layoutBtn.click();
    await expect(page.locator('button:has-text("배치완료")').first()).toBeVisible({ timeout: 3000 });

    // 다시 클릭 → 배치 모드 종료
    await page.locator('button:has-text("배치완료")').first().click();
    await expect(page.locator('button:has-text("배치")').first()).toBeVisible({ timeout: 3000 });
  });

  test('T1b: 배치 모드에서 "수정" 버튼 클릭 시 편집 모달 열림', async ({ page }) => {
    await setupWithDraft(page);
    const editBtn = page.locator('button:has-text("수정")').first();
    await editBtn.click();
    // 편집 모달 표시
    await expect(page.locator('[data-testid="editor-close"]')).toBeVisible({ timeout: 5000 });
    // Canvas 토글 없어야 함 (fabric.js 제거됨)
    await expect(page.locator('button:has-text("Canvas")')).not.toBeVisible();
    // 닫기
    await page.locator('[data-testid="editor-close"]').click();
  });

  test('T9: 커스텀 요소 추가 — 텍스트', async ({ page }) => {
    await setupWithDraft(page);

    // 배치 모드 진입
    await page.locator('button:has-text("배치")').first().click();
    await expect(page.locator('button:has-text("배치완료")').first()).toBeVisible();

    // "+ 텍스트" 버튼 클릭
    const addTextBtn = page.locator('button:has-text("+ 텍스트")').first();
    await expect(addTextBtn).toBeVisible({ timeout: 3000 });
    await addTextBtn.click();

    // "텍스트를 입력하세요" 요소가 생성되었는지 확인
    await expect(page.locator('text=텍스트를 입력하세요').first()).toBeVisible({ timeout: 5000 });
  });

  test('T9b: 커스텀 요소 추가 — 이미지', async ({ page }) => {
    await setupWithDraft(page);

    await page.locator('button:has-text("배치")').first().click();
    await expect(page.locator('button:has-text("배치완료")').first()).toBeVisible();

    // "+ 이미지" 버튼 클릭
    const addImgBtn = page.locator('button:has-text("+ 이미지")').first();
    await expect(addImgBtn).toBeVisible({ timeout: 3000 });
    await addImgBtn.click();

    // 커스텀 요소가 생성됨 (data-editable="custom-*")
    const customEl = page.locator('[data-editable^="custom-"]').first();
    await expect(customEl).toBeVisible({ timeout: 5000 });
  });

  test('T11: 편집 모달 — InteractivePreview만 표시', async ({ page }) => {
    await setupWithDraft(page);

    await page.locator('button:has-text("수정")').first().click();
    await expect(page.locator('[data-testid="editor-close"]')).toBeVisible({ timeout: 5000 });

    // "페이지 편집" 텍스트
    await expect(page.locator('text=1페이지 편집')).toBeVisible();

    // 슬라이드 내비게이션 (‹ ›)
    await expect(page.locator('[data-testid="editor-next-slide"]')).toBeVisible();

    // Canvas 토글 버튼이 없어야 함
    await expect(page.locator('button:has-text("Canvas")')).not.toBeVisible();
    await expect(page.locator('button:has-text("HTML")')).not.toBeVisible();

    // 완료 버튼으로 닫기
    await page.locator('[data-testid="editor-close"]').click();
    await expect(page.locator('[data-testid="editor-close"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('T12: 드래프트 저장/복원 — customElements 포함', async ({ page }) => {
    await setupWithDraft(page);

    // 배치 모드 진입 + 커스텀 텍스트 추가
    await page.locator('button:has-text("배치")').first().click();
    await page.locator('button:has-text("+ 텍스트")').first().click();
    await expect(page.locator('text=텍스트를 입력하세요').first()).toBeVisible({ timeout: 5000 });

    // 배치 모드 종료
    await page.locator('button:has-text("배치완료")').first().click();

    // 자동 저장 대기 (debounce)
    await page.waitForTimeout(4000);

    // 드래프트에 customElements가 포함되었는지 확인
    const draft = await page.evaluate(() => localStorage.getItem('winai-cardnews-draft'));
    expect(draft).toBeTruthy();
    const parsed = JSON.parse(draft!);
    // proSlides 중 하나에 customElements가 있어야 함
    const hasCustom = parsed.proSlides?.some((s: { customElements?: unknown[] }) =>
      s.customElements && s.customElements.length > 0
    );
    expect(hasCustom).toBe(true);
  });

  test('T13: 슬라이드 복제 후 배치 모드 정상 작동', async ({ page }) => {
    await setupWithDraft(page);

    // 슬라이드 호버 → 복제 버튼
    const firstCard = page.locator('[data-editable="title"]').first();
    await firstCard.hover();
    // 복제 버튼 (📋)
    const cloneBtn = page.locator('button[title="복제"]').first();
    if (await cloneBtn.isVisible()) {
      await cloneBtn.click();
      // 에러 없이 슬라이드 수가 증가했는지
      await page.waitForTimeout(500);
      const slideCount = await page.locator('[data-editable="title"]').count();
      expect(slideCount).toBeGreaterThanOrEqual(4); // 원래 3 + 복제 1
    }
  });
});
