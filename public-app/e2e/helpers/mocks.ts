/**
 * Playwright E2E 공용 mock 헬퍼
 *
 * 모든 외부 API(Gemini, Supabase, Pexels, Pixabay, remove-bg, naver, 이미지 생성)를
 * page.route로 가로채 고정 응답을 반환한다. 테스트는 "UI가 그려지고 상호작용이
 * 작동하는가"만 확인하고 실제 네트워크는 절대 치지 않는다.
 *
 * 사용:
 *   import { setupCommonMocks } from './helpers/mocks';
 *   test.beforeEach(async ({ page }) => { await setupCommonMocks(page); });
 */
import type { Page } from '@playwright/test';

// ── 고정 응답 페이로드 ──

export const MOCK_CARD_SLIDES = {
  slides: [
    { layout: 'cover', title: 'E2E 테스트 카드뉴스', subtitle: '스모크 검증용' },
    { layout: 'info', title: '임플란트 사후관리', body: '올바른 관리가 중요합니다.' },
    { layout: 'closing', title: '감사합니다', subtitle: 'THANK YOU' },
  ],
  font: 'pretendard',
};

export const MOCK_BLOG_TEXT = '# 테스트 블로그\n\n임플란트 사후관리는 중요합니다.\n\n## 첫 번째 소제목\n\n본문 내용.';

// ── 공통 mock 세트 ──

/**
 * 기본 mock 세트 — 모든 외부 API를 차단하고 OK 응답 또는 빈 데이터를 반환.
 * 개별 테스트에서 특정 엔드포인트를 더 자세히 mock하고 싶으면 setupCommonMocks 호출
 * 이후에 page.route로 덮어쓸 것(마지막 route가 우선 매칭됨).
 */
export async function setupCommonMocks(page: Page): Promise<void> {
  // Gemini — 텍스트 생성
  await page.route('**/api/gemini', async route => {
    const body = await route.request().postDataJSON().catch(() => ({} as Record<string, unknown>));
    const hinted = typeof body?.prompt === 'string' && body.prompt.includes('카드뉴스');
    const text = hinted ? JSON.stringify(MOCK_CARD_SLIDES) : MOCK_BLOG_TEXT;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text, candidates: 1 }),
    });
  });

  // 이미지 생성
  await page.route('**/api/image', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy5lB0AAAAASUVORK5CYII=',
      }),
    });
  });

  // Pexels / Pixabay / Naver — 빈 결과
  await page.route('**/api/pexels**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ photos: [] }),
  }));
  await page.route('**/api/pexels-query**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ query: 'professional clinic' }),
  }));
  await page.route('**/api/pixabay**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ photos: [] }),
  }));
  await page.route('**/api/naver/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [], keywords: [] }),
  }));

  // Video — search-bgm (Jamendo)
  await page.route('**/api/video/search-bgm**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ tracks: [] }),
  }));

  // Remove BG
  await page.route('**/api/remove-bg', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy5lB0AAAAASUVORK5CYII=' }),
  }));

  // Supabase REST — 인증 관련 및 데이터 조회 전부 빈 배열/성공
  await page.route('**/rest/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  // Supabase auth — no session
  await page.route('**/auth/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: null, session: null }),
  }));
  // Supabase Storage
  await page.route('**/storage/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }));
}

// ── 카드뉴스 드래프트 주입 ──

/**
 * page.goto 이후에 호출해야 한다(localStorage는 origin scope).
 * userId=null이면 게스트 드래프트로 인식.
 */
export async function injectCardNewsDraft(page: Page, opts: {
  topic?: string;
  userId?: string | null;
  slideCount?: number;
} = {}): Promise<void> {
  const { topic = 'E2E 테스트 드래프트', userId = null, slideCount = 2 } = opts;
  const slides = Array.from({ length: slideCount }, (_, i) => ({
    id: `test-slide-${i}`,
    index: i + 1,
    layout: i === 0 ? 'cover' : 'info',
    title: `슬라이드 ${i + 1}`,
    subtitle: 'E2E',
    body: i === 0 ? undefined : '본문',
  }));
  await page.evaluate(({ topic, userId, slides }) => {
    localStorage.setItem('winai-cardnews-draft', JSON.stringify({
      userId,
      topic,
      hospitalName: 'E2E치과',
      proSlides: slides,
      proTheme: {},
      proCardRatio: '1:1',
      savedAt: Date.now(),
      lastAccessedAt: Date.now(),
    }));
  }, { topic, userId, slides });
}

/** guest=1 쿼리로 페이지 접근 (useAuthGuard 우회) */
export function guestUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}guest=1`;
}
