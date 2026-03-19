/**
 * Admin 페이지 Smoke Test — 전체삭제 UI/흐름 검증
 *
 * 목적: admin 인증 → 대시보드 → 전체삭제 모달 UI 흐름이 정상인지 확인.
 * 실제 삭제(destructive action)는 실행하지 않는다.
 *
 * 실행:
 *   E2E_BASE_URL=http://localhost:5173 npx playwright test smoke-admin
 *   E2E_BASE_URL=https://ai-hospital.pages.dev npx playwright test smoke-admin
 *
 * 환경변수:
 *   E2E_ADMIN_PASSWORD — admin 비밀번호 (기본: 테스트용 'winaid')
 */
import { test, expect } from '@playwright/test';
import { blockHeavyResources, navigateTo, openAdminAndAuthenticate } from './helpers/common';

const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD || 'winaid';

test.describe('Admin 페이지 Smoke Test', () => {

  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('admin 로그인 폼 표시', async ({ page }) => {
    await navigateTo(page, '/admin');

    // 비밀번호 입력란
    const pwInput = page.locator('input[type="password"]');
    await expect(pwInput).toBeVisible({ timeout: 10_000 });

    // 로그인 버튼
    const loginBtn = page.locator('button[type="submit"]');
    await expect(loginBtn).toBeVisible();

    // "관리자 비밀번호를 입력하세요" 문구
    await expect(page.locator('text=관리자 비밀번호')).toBeVisible();
  });

  test('잘못된 비밀번호 → 에러 메시지', async ({ page }) => {
    await navigateTo(page, '/admin');

    const pwInput = page.locator('input[type="password"]').first();
    await pwInput.waitFor({ state: 'visible', timeout: 10_000 });
    await pwInput.fill('wrong_password_12345');

    const loginBtn = page.locator('button[type="submit"]').first();
    await loginBtn.click();

    // 에러 메시지 표시 대기 (최대 15초 — RPC 응답 대기)
    const errorMsg = page.locator('[class*="red"]').first();
    await expect(errorMsg).toBeVisible({ timeout: 15_000 });
  });

  test('올바른 비밀번호 → 대시보드 진입', async ({ page }) => {
    const { authenticated } = await openAdminAndAuthenticate(page, ADMIN_PW);
    expect(authenticated).toBe(true);

    // 로그아웃 버튼이 보이면 대시보드에 진입한 것
    await expect(page.locator('button:has-text("로그아웃")')).toBeVisible({ timeout: 5_000 });
  });

  test('대시보드 콘텐츠 목록 로드', async ({ page }) => {
    const { authenticated } = await openAdminAndAuthenticate(page, ADMIN_PW);
    if (!authenticated) { test.skip(); return; }

    // 콘텐츠 로드 대기 (RPC 응답 + 렌더 대기)
    await page.waitForTimeout(8000);

    // "콘텐츠 관리" 제목이 표시되어야 함
    const contentHeading = page.locator('h2:has-text("콘텐츠 관리")');
    await expect(contentHeading).toBeVisible({ timeout: 10_000 });

    // 콘텐츠 목록 또는 빈 상태 메시지 중 하나 확인
    const hasList = await page.locator('button:has-text("보기")').first().isVisible().catch(() => false);
    const hasRefresh = await page.locator('button:has-text("새로고침")').isVisible().catch(() => false);
    const isEmpty = await page.locator('text=저장된 콘텐츠가 없습니다').isVisible().catch(() => false);
    expect(hasList || hasRefresh || isEmpty).toBe(true);
  });

  test('전체삭제 모달 — 확인 문구 미입력 시 삭제 버튼 비활성', async ({ page }) => {
    const { authenticated } = await openAdminAndAuthenticate(page, ADMIN_PW);
    if (!authenticated) { test.skip(); return; }

    await page.waitForTimeout(8000);

    const deleteAllBtn = page.locator('button:has-text("전체 삭제")');
    if (!(await deleteAllBtn.isVisible().catch(() => false))) {
      // 전체삭제 기능이 배포되지 않았거나 콘텐츠 없음 → 스킵
      test.skip();
      return;
    }

    // 모달 열기
    await deleteAllBtn.click();
    await page.waitForTimeout(500);

    // 모달 요소 확인
    await expect(page.locator('text=콘텐츠 전체 삭제')).toBeVisible();
    await expect(page.locator('text=사용자 계정, 결제, 설정, 말투 학습 데이터는 영향 없습니다')).toBeVisible();

    // 확인 문구 입력란
    const confirmInput = page.locator('input[placeholder="전체삭제"]');
    await expect(confirmInput).toBeVisible();

    // 삭제 버튼이 비활성 상태인지
    const confirmBtn = page.locator('button:has-text("영구 삭제")');
    await expect(confirmBtn).toBeDisabled();

    // 잘못된 문구 입력 → 여전히 비활성
    await confirmInput.fill('삭제');
    await page.waitForTimeout(200);
    await expect(confirmBtn).toBeDisabled();

    // 올바른 문구 입력 → 활성화
    await confirmInput.fill('전체삭제');
    await page.waitForTimeout(200);
    await expect(confirmBtn).toBeEnabled();

    // 모달 닫기 (실제 삭제 실행하지 않음!)
    const cancelBtn = page.locator('button:has-text("취소")');
    await cancelBtn.click();
    await page.waitForTimeout(300);

    // 모달이 닫혔는지
    await expect(page.locator('text=콘텐츠 전체 삭제')).not.toBeVisible();
  });

  test('admin 로그아웃 정상 동작', async ({ page }) => {
    const { authenticated } = await openAdminAndAuthenticate(page, ADMIN_PW);
    if (!authenticated) { test.skip(); return; }

    // 로그아웃 버튼 클릭
    const logoutBtn = page.locator('button:has-text("로그아웃")');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();
    await page.waitForTimeout(1000);

    // 로그인 화면으로 돌아갔는지
    const pwInput = page.locator('input[type="password"]');
    await expect(pwInput).toBeVisible({ timeout: 5_000 });
  });
});
