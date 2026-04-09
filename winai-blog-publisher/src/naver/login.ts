/**
 * 네이버 로그인 자동화
 *
 * Playwright로 크롬을 실행, 네이버 로그인 처리.
 * 세션을 파일로 저장하여 재로그인 최소화.
 * 캡챠/2단계 인증은 사용자가 직접 처리하도록 대기.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { getCredentials } from '../utils/crypto';
import { log } from '../utils/logger';
import { existsSync } from 'fs';
import path from 'path';

const CRED_DIR = path.join(process.cwd(), 'credentials');

let browser: Browser | null = null;
const contexts = new Map<string, BrowserContext>();

// ── 네이버 에디터 셀렉터 (변경 시 여기만 수정) ──
export const SELECTORS = {
  // 로그인 페이지
  loginId: '#id',
  loginPw: '#pw',
  loginBtn: '.btn_login, #log\\.login',
  captcha: '#captcha, .captcha_wrap',
  twoFactor: '.btn_check, .ip_check',

  // 블로그 에디터
  editorTitle: '.se-title-text .se-text-paragraph',
  editorContent: '.se-component-content .se-text-paragraph',
  tagInput: '.se-tag-input input, .post_tag input, #post-tag-input',
};

export async function initBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized'],
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  for (const [, ctx] of contexts) {
    try { await ctx.close(); } catch { /* */ }
  }
  contexts.clear();
  if (browser) {
    try { await browser.close(); } catch { /* */ }
    browser = null;
  }
}

export async function getOrCreateContext(accountId: string): Promise<BrowserContext> {
  // 이미 열려있는 컨텍스트 재사용
  const existing = contexts.get(accountId);
  if (existing) {
    try {
      const pages = existing.pages();
      if (pages.length > 0) return existing;
    } catch { /* 닫혀있으면 새로 만듦 */ }
  }

  const b = await initBrowser();
  const sessionPath = path.join(CRED_DIR, `session_${accountId}.json`);

  // 저장된 세션이 있으면 불러오기
  if (existsSync(sessionPath)) {
    try {
      const ctx = await b.newContext({
        storageState: sessionPath,
        viewport: { width: 1280, height: 900 },
      });

      // 세션 유효성 체크
      const page = await ctx.newPage();
      await page.goto('https://blog.naver.com', { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 로그인 상태 확인 — 로그인 버튼이 없으면 로그인된 상태
      const loginBtn = await page.$('a[href*="nidlogin"], .MyView-module__link_login');
      if (!loginBtn) {
        log.success(`계정 ${accountId} — 저장된 세션으로 로그인 확인`);
        await page.close();
        contexts.set(accountId, ctx);
        return ctx;
      }

      log.warn('세션 만료 — 재로그인 필요');
      await page.close();
      await ctx.close();
    } catch {
      log.warn('세션 파일 로드 실패 — 새로 로그인');
    }
  }

  // 새 컨텍스트 → 로그인
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await naverLogin(ctx, accountId);
  await ctx.storageState({ path: sessionPath });
  contexts.set(accountId, ctx);
  return ctx;
}

async function naverLogin(context: BrowserContext, accountId: string): Promise<void> {
  const creds = await getCredentials(accountId);
  const page = await context.newPage();

  log.step('네이버 로그인 페이지 이동...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });

  // ID 입력 — evaluate로 직접 값 설정 (자동입력 감지 우회)
  log.step('아이디 입력...');
  await page.click(SELECTORS.loginId);
  await page.evaluate((id: string) => {
    const el = document.querySelector('#id') as HTMLInputElement;
    if (el) { el.value = id; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, creds.naverId);

  // PW 입력
  log.step('비밀번호 입력...');
  await page.click(SELECTORS.loginPw);
  await page.evaluate((pw: string) => {
    const el = document.querySelector('#pw') as HTMLInputElement;
    if (el) { el.value = pw; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, creds.naverPw);

  await page.waitForTimeout(500);

  // 로그인 클릭
  log.step('로그인 버튼 클릭...');
  await page.click(SELECTORS.loginBtn);

  // 결과 대기 (최대 2분 — 캡챠/2FA 시간)
  try {
    await Promise.race([
      page.waitForURL('https://www.naver.com/**', { timeout: 120000 }),
      page.waitForURL('https://blog.naver.com/**', { timeout: 120000 }),
      page.waitForURL('https://nid.naver.com/nidlogin.login**', { timeout: 5000 }).then(async () => {
        // 로그인 실패 or 캡챠
        const captcha = await page.$(SELECTORS.captcha);
        const twoFa = await page.$(SELECTORS.twoFactor);

        if (captcha) {
          log.warn('캡챠가 나타났습니다. 직접 입력해주세요.');
          await page.waitForURL('https://www.naver.com/**', { timeout: 120000 });
        } else if (twoFa) {
          log.warn('2단계 인증이 필요합니다. 폰에서 승인해주세요.');
          await page.waitForURL('https://www.naver.com/**', { timeout: 120000 });
        }
      }),
    ]);
  } catch {
    log.error('로그인 시간 초과. 아이디/비밀번호를 확인해주세요.');
    throw new Error('LOGIN_TIMEOUT');
  }

  log.success('네이버 로그인 성공!');
  await page.close();
}
