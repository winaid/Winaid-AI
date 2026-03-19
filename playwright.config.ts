/**
 * Playwright E2E 설정 — 블로그 이미지 생성 흐름 검증
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://story-darugi.com';
const generationTimeout = parseInt(process.env.E2E_TIMEOUT || '180000', 10);

// 프록시: 컨테이너 환경에서 https_proxy 자동 감지 + 인증 분리
const rawProxy = process.env.https_proxy || process.env.HTTPS_PROXY || '';
let proxyConfig: { server: string; username?: string; password?: string } | undefined;

if (rawProxy) {
  try {
    const url = new URL(rawProxy);
    proxyConfig = {
      server: `${url.protocol}//${url.host}`,
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    };
  } catch {
    // URL 파싱 실패 시 그대로 사용
    proxyConfig = { server: rawProxy };
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 120_000,
    ignoreHTTPSErrors: true,  // 프록시 환경 SSL 인증서 무시
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  },

  timeout: generationTimeout + 120_000,

  projects: [
    {
      name: 'blog-e2e',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH
            || '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
