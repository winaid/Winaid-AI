/**
 * E2E 공통 헬퍼 — postType/기능 간 재사용 가능한 유틸리티
 *
 * 다음 턴 확장 순서:
 *   1. 카드뉴스: e2e/card-news-smoke.spec.ts
 *   2. 이미지 생성: e2e/image-generation-smoke.spec.ts
 *   3. 언론 보도: e2e/press-release-smoke.spec.ts
 */
import type { Page } from '@playwright/test';

// ── 외부 리소스 차단 (headless 환경 안정화) ──

export async function blockHeavyResources(page: Page): Promise<void> {
  await page.route('**/*.{woff,woff2,ttf,eot}', route => route.abort());
  await page.route('**/cdn.portone.io/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.route('**/fontawesome**', route => route.abort());
}

// ── 페이지 내비게이션 ──

export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

// ── admin 인증 헬퍼 ──

export async function openAdminAndAuthenticate(
  page: Page,
  password: string,
): Promise<{ authenticated: boolean }> {
  await navigateTo(page, '/admin');

  // 비밀번호 입력란 대기
  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.waitFor({ state: 'visible', timeout: 10_000 });
  await pwInput.fill(password);

  // 로그인 버튼 클릭
  const loginBtn = page.locator('button[type="submit"]').first();
  await loginBtn.click();

  // 인증 결과 대기: 대시보드(로그아웃 버튼 출현) 또는 에러
  const dashboardOrError = await Promise.race([
    page.locator('button:has-text("로그아웃")').waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'dashboard'),
    page.locator('[class*="red-"]').filter({ hasText: /실패|오류|올바르지/ }).waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'error'),
  ]).catch(() => 'timeout');

  return { authenticated: dashboardOrError === 'dashboard' };
}

// ── 결과 화면 검증 헬퍼 ──

export async function assertResultPreview(page: Page): Promise<{
  visible: boolean;
  hasContent: boolean;
  hasImages: boolean;
  imageCount: number;
}> {
  const visible = await page.locator('.naver-preview').or(
    page.locator('div[contenteditable="true"]')
  ).first().isVisible().catch(() => false);

  const hasContent = await page.evaluate(() => {
    const el = document.querySelector('.naver-preview') || document.querySelector('[contenteditable]');
    return el ? (el.textContent?.length || 0) > 50 : false;
  }).catch(() => false);

  let imageCount = 0;
  if (visible) {
    imageCount = await page.locator('.naver-preview img, div[contenteditable="true"] img').count().catch(() => 0);
  }

  return { visible, hasContent, hasImages: imageCount > 0, imageCount };
}

// ── 이미지 품질 경고 배너 검증 ──

export async function getImageQualityBanner(page: Page): Promise<{
  visible: boolean;
  isOrange: boolean;
  text: string;
}> {
  // orange (심각) 또는 amber (경미) 배너 확인
  const orangeBanner = page.locator('[class*="orange-50"]').first();
  const amberBanner = page.locator('[class*="amber-50"]').first();

  const isOrange = await orangeBanner.isVisible().catch(() => false);
  const isAmber = await amberBanner.isVisible().catch(() => false);
  const visible = isOrange || isAmber;

  let text = '';
  if (isOrange) {
    text = await orangeBanner.textContent().catch(() => '') || '';
  } else if (isAmber) {
    text = await amberBanner.textContent().catch(() => '') || '';
  }

  return { visible, isOrange, text };
}
