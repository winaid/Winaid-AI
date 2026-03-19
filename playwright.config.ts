/**
 * Playwright E2E 설정 — 블로그 이미지 생성 흐름 검증
 *
 * vitest와 완전 분리: 이 설정은 playwright test 명령에서만 사용.
 * vitest.config.ts / vite.config.ts와 충돌 없음.
 */
import { defineConfig, devices } from '@playwright/test';

/**
 * 환경변수:
 *   E2E_BASE_URL — 스테이징 URL (기본값: https://story-darugi.com)
 *   E2E_TIMEOUT  — 생성 대기 시간 ms (기본값: 180000 = 3분)
 */
const baseURL = process.env.E2E_BASE_URL || 'https://story-darugi.com';
const generationTimeout = parseInt(process.env.E2E_TIMEOUT || '180000', 10);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,        // 블로그 생성은 API rate limit이 있어 순차 실행
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                  // API rate limit 보호
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',  // ffmpeg 미설치 환경 호환
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },

  // 개별 테스트 timeout: 생성 대기 시간 포함
  timeout: generationTimeout + 60_000,

  projects: [
    {
      name: 'blog-e2e',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,        // 시스템 chromium 사용
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH
            || '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
