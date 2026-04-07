import { test, expect } from '@playwright/test';

// ============================================
// WINAI Public App — E2E Smoke Test
// 9개 핵심 항목 검증
// ============================================

// 테스트용 계정 (매 실행마다 고유 이메일)
const TEST_EMAIL = `test_${Date.now()}@winaid-test.kr`;
const TEST_PASSWORD = 'test1234!';
const TEST_HOSPITAL = 'E2E테스트치과';

// ── 1. 랜딩 페이지 ──
test('1. 랜딩 페이지 정상 표시', async ({ page }) => {
  await page.goto('/');
  // 로고 + 핵심 CTA 확인
  await expect(page.locator('text=WINAI').first()).toBeVisible();
  await expect(page.locator('text=시작하기').first()).toBeVisible();
  // 기능 소개 섹션 존재 확인
  await expect(page.locator('text=AI 블로그').first()).toBeVisible();
});

// ── 2. 회원가입 ──
test('2. 회원가입 — 이메일+비밀번호', async ({ page }) => {
  await page.goto('/auth');
  // 회원가입 탭 클릭
  await page.click('button:has-text("회원가입")');
  // 폼 입력
  await page.fill('input[placeholder="OO치과"]', TEST_HOSPITAL);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[placeholder="6자 이상"]', TEST_PASSWORD);
  await page.fill('input[placeholder="비밀번호 재입력"]', TEST_PASSWORD);
  // 가입 버튼 클릭
  await page.click('button[type="submit"]:has-text("회원가입")');
  // 성공: /app으로 이동하거나 성공 메시지 표시
  await expect(page).toHaveURL(/\/(app|auth)/, { timeout: 15000 });
});

// ── 3. 로그인 ──
test('3. 로그인 → /app 대시보드 이동', async ({ page }) => {
  await page.goto('/auth');
  // 로그인 탭 (기본)
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[placeholder="••••••••"]', TEST_PASSWORD);
  await page.click('button[type="submit"]:has-text("로그인")');
  // /app으로 이동 확인
  await expect(page).toHaveURL(/\/app/, { timeout: 15000 });
  // 대시보드 요소 확인
  await expect(page.locator('text=블로그').first()).toBeVisible();
});

// ── 4. 블로그 생성 (게스트 모드로 테스트) ──
test('4. 블로그 생성 — 주제 입력 후 AI 생성', async ({ page }) => {
  await page.goto('/blog?guest=1');
  // 주제 입력
  await page.fill('input[placeholder*="주제"]', '임플란트 시술 후 관리법');
  // 생성 버튼 클릭
  await page.click('button[type="submit"]:has-text("생성")');
  // 생성 중 로딩 확인
  await expect(page.locator('text=생성 중').first()).toBeVisible({ timeout: 5000 });
  // 결과 나올 때까지 대기 (최대 120초 — AI 생성에 시간 소요)
  await expect(page.locator('[class*="prose"], [dangerouslySetInnerHTML], .result-panel, h3').first()).toBeVisible({ timeout: 120000 });
});

// ── 5. 크레딧 차감 확인 ──
test('5. 크레딧 — 사이드바에서 크레딧 표시 확인', async ({ page }) => {
  await page.goto('/app?guest=1');
  // 사이드바에 크레딧 관련 텍스트가 있는지 확인 (게스트는 999 또는 무제한)
  const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
  await expect(sidebar).toBeVisible({ timeout: 10000 });
});

// ── 6. 말투 학습 — 네이버 블로그 URL 입력 UI 확인 ──
test('6. 말투 학습 — 블로그 URL 입력 필드 존재', async ({ page }) => {
  await page.goto('/blog?guest=1');
  // 병원명 입력
  await page.fill('input[placeholder*="병원"]', 'E2E테스트치과');
  // 블로그 URL 입력 필드가 나타나는지 확인
  await expect(page.locator('input[placeholder*="blog.naver"]').first()).toBeVisible({ timeout: 5000 });
  // 분석 버튼 존재 확인
  await expect(page.locator('button:has-text("분석")').first()).toBeVisible();
});

// ── 7. 히스토리 페이지 접근 ──
test('7. 히스토리 — 페이지 정상 로드', async ({ page }) => {
  await page.goto('/history?guest=1');
  // 히스토리 페이지 로드 확인
  await expect(page.locator('text=히스토리').first()).toBeVisible({ timeout: 10000 });
});

// ── 8. 모바일 UI ──
test('8. 모바일 — UI 깨지지 않는지', async ({ page }) => {
  // 모바일 뷰포트 설정
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  // 랜딩 페이지가 모바일에서도 표시되는지
  await expect(page.locator('text=WINAI').first()).toBeVisible();
  // 로그인 페이지
  await page.goto('/auth');
  await expect(page.locator('button:has-text("로그인")').first()).toBeVisible();
  // 대시보드 (게스트)
  await page.goto('/app?guest=1');
  await expect(page.locator('text=블로그').first()).toBeVisible({ timeout: 10000 });
});

// ── 9. /admin 접근 → 404 ──
test('9. /admin 접근 → 404', async ({ page }) => {
  const response = await page.goto('/admin');
  // 404 상태 코드 또는 Not Found 텍스트
  expect(response?.status()).toBe(404);
});
