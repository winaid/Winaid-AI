import { test, expect, type Page } from '@playwright/test';
import { setupCommonMocks, guestUrl } from './helpers/mocks';

/**
 * 말투 학습 파이프라인 — E2E 회귀 방지 스펙
 *
 * 우선순위 1~4 작업의 회귀 방지망. UI 클릭 → 실제 handleSubmit/handleSectionRegenerate
 * 가 만드는 fetch payload 를 page.route 로 인터셉트해 assert 한다.
 *
 * 커버:
 *  - 4가지 케이스 매트릭스 (payload 검증)
 *  - 섹션 재생성 (stylePromptText 전달)
 *  - UI 충돌 안내 배지 토글
 *
 * 커버하지 못하는 것 (manual QA 필요):
 *  - 실제 LLM 출력 품질 / 학습 말투 재현도
 *  - WritingStyleLearner.handleAnalyze 경로 (UI 단계 많아 취약 → 단위 테스트 인프라 없음)
 *  - localStorage 저장 구조 (handleAnalyze 흐름 의존)
 */

const SEED_STYLE_PROMPT_MARKER = '__STYLE_PROMPT_SEED_MARKER__';
const SEED_STYLE_NAME = 'E2E학습스타일';
const HOSPITAL_NAME = 'E2E치과';

// LearnedWritingStyle 타입 최소형 시드.
// styleService.ts 의 buildStylePrompt 가 사용하는 필드는 전부 채우고,
// stylePrompt 에 마커를 심어 payload 가 진짜 여기서 왔는지 검증 가능하게 함.
const SEED_STYLE = {
  id: 'style_e2e_seed_1',
  name: SEED_STYLE_NAME,
  // buildStylePrompt 가 description 을 [한 줄 정의] 블록에 넣으므로 마커를 여기 심는다.
  // (stylePrompt 필드는 getStylePromptForGeneration 에서 무시됨 — 주의)
  description: `E2E 회귀용 학습 스타일 ${SEED_STYLE_PROMPT_MARKER}`,
  sampleText: 'E2E 샘플 텍스트',
  analyzedStyle: {
    tone: '친근',
    sentenceEndings: ['~입니다', '~해요'],
    vocabulary: ['치료', '관리'],
    structure: '도입-본문-마무리',
    emotionLevel: 'medium',
    formalityLevel: 'neutral',
    // speakerIdentity 가 있어야 buildStylePrompt 의 deepBlock 이 렌더됨.
    // 동시에 시스템 프롬프트에서 마커를 검증할 수 있도록 여기에 심는다.
    speakerIdentity: `E2E 화자 정체성 ${SEED_STYLE_PROMPT_MARKER}`,
    goodExamples: [],
    badExamples: [],
    representativeParagraphs: [
      '치주염은 잇몸 질환입니다. 조기 진단이 중요합니다.\n\n정기 검진을 권합니다.',
      '스케일링 후에는 일시적으로 시린 느낌이 있을 수 있습니다.',
      '임플란트 관리는 자연치와 비슷하지만 추가 관리가 필요합니다.',
    ],
    paragraphStats: {
      avgSentencesPerParagraph: 3,
      avgCharsPerParagraph: 80,
      lineBreakStyle: 'mixed',
      doubleBreakFrequency: 'medium',
      paragraphLengthPattern: '짧게 → 길게 → 짧게',
    },
  },
  stylePrompt: `${SEED_STYLE_PROMPT_MARKER} — 학습된 말투 전문`,
  createdAt: new Date().toISOString(),
};

async function seedLearnedStyle(page: Page): Promise<void> {
  await page.evaluate((style) => {
    localStorage.setItem('hospital_learned_writing_styles', JSON.stringify([style]));
  }, SEED_STYLE);
}

type Captured = { body: Record<string, unknown> | null };

async function captureBlogPost(page: Page): Promise<Captured> {
  const captured: Captured = { body: null };
  await page.unroute('**/api/generate/blog');
  await page.route('**/api/generate/blog', async route => {
    try { captured.body = route.request().postDataJSON() as Record<string, unknown>; }
    catch { captured.body = {}; }
    // page.tsx 의 "글 잘림" 가드(textLength*0.5 미만) 통과를 위해 1400자+ 본문 구성.
    // h2 섹션 1개만 있어 parseBlogSections → BlogSectionPanel → "재생성" 버튼 하나 렌더.
    const paragraph = '테스트 본문 내용입니다. 이 섹션은 회귀 방지를 위한 충분히 긴 텍스트를 포함합니다. '.repeat(40);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `<h2>테스트 소제목</h2><p>${paragraph}</p>`,
        violations: [],
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, isBatch: false },
        model: 'mock',
      }),
    });
  });
  return captured;
}

async function captureSectionPost(page: Page): Promise<Captured> {
  const captured: Captured = { body: null };
  await page.unroute('**/api/generate/blog/section');
  await page.route('**/api/generate/blog/section', async route => {
    try { captured.body = route.request().postDataJSON() as Record<string, unknown>; }
    catch { captured.body = {}; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: '<h2>테스트 소제목</h2><p>재작성된 본문.</p>',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, isBatch: false },
        model: 'mock',
      }),
    });
  });
  return captured;
}

/** 학습 스타일을 UI 로 선택. 고급 옵션 → 말투 학습 펼치기 → 스타일 버튼 클릭. */
async function selectLearnedStyleViaUI(page: Page): Promise<void> {
  // 1) 세부 옵션 펼치기
  await page.getByRole('button', { name: /세부 옵션/ }).click();
  // 2) 말투 학습 헤더 펼치기
  await page.getByRole('button', { name: /말투 학습/ }).click();
  // 3) 저장된 스타일 선택
  await page.getByRole('button', { name: new RegExp(SEED_STYLE_NAME) }).click();
  // 선택 표시 ("적용 중" 스타일 뱃지, exact match — 4-A 배지 문구와 구분) 대기
  await expect(page.getByText('적용 중', { exact: true })).toBeVisible();
}

/** topic 입력 (placeholder 가 blogTitle/customSubheadings 와 겹치므로 maxLength 로 구분). */
async function fillTopic(page: Page, value: string): Promise<void> {
  await page.locator('input[type="text"][maxlength="30"]').fill(value);
}

test.describe('말투 학습 파이프라인 — 회귀 방지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    // setupCommonMocks 의 /api/gemini 핸들러가 postDataJSON().catch(...) 패턴을 쓰는데
    // 현재 Playwright 에서 postDataJSON 은 동기 반환이라 런타임 TypeError 발생 → 테스트 중
    // 파생 호출(SEO 평가 등)이 해당 경로를 타면 브라우저 컨텍스트 종료. 덮어쓰기로 회피.
    await page.unroute('**/api/gemini');
    await page.route('**/api/gemini', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: '{"total":80}', candidates: 1 }),
      });
    });
  });

  test('케이스 1: 학습 X + 병원 X → stylePromptText/learnedStyleId/hospitalName 모두 누락', async ({ page }) => {
    const capture = await captureBlogPost(page);
    await page.goto(guestUrl('/blog'));

    await fillTopic(page, '테스트 주제');
    await page.locator('button[type="submit"]:has-text("블로그 생성")').click();

    await expect.poll(() => capture.body, { timeout: 15000 }).not.toBeNull();

    const body = capture.body as { request?: Record<string, unknown>; hospitalName?: string };
    expect(body.request?.stylePromptText).toBeFalsy();
    expect(body.request?.learnedStyleId).toBeFalsy();
    expect(body.request?.hospitalName).toBeFalsy();
    expect(body.hospitalName).toBeFalsy();
  });

  test('케이스 2: 학습 X + 병원 ✓ → hospitalName 포함, stylePromptText 누락', async ({ page }) => {
    const capture = await captureBlogPost(page);
    await page.goto(guestUrl('/blog'));

    await page.getByPlaceholder(/병원 이름/).fill(HOSPITAL_NAME);
    await fillTopic(page, '테스트 주제');
    await page.locator('button[type="submit"]:has-text("블로그 생성")').click();

    await expect.poll(() => capture.body, { timeout: 15000 }).not.toBeNull();

    const body = capture.body as { request?: Record<string, unknown>; hospitalName?: string };
    expect(body.request?.hospitalName).toBe(HOSPITAL_NAME);
    expect(body.request?.stylePromptText).toBeFalsy();
    expect(body.request?.learnedStyleId).toBeFalsy();
  });

  test('케이스 3: 학습 ✓ + 병원 X → stylePromptText 포함, hospitalName 누락', async ({ page }) => {
    const capture = await captureBlogPost(page);
    await page.goto(guestUrl('/blog'));
    await seedLearnedStyle(page);
    await page.reload();

    await selectLearnedStyleViaUI(page);
    await fillTopic(page, '테스트 주제');

    // 케이스 3 (병원 없음) 에서 충돌 안내 배지는 뜨면 안 됨
    await expect(page.getByText(/🎓 학습 말투 적용 중/)).toBeHidden();

    await page.locator('button[type="submit"]:has-text("블로그 생성")').click();

    await expect.poll(() => capture.body, { timeout: 15000 }).not.toBeNull();

    const body = capture.body as { request?: Record<string, unknown>; hospitalName?: string };
    expect(body.request?.stylePromptText).toContain(SEED_STYLE_PROMPT_MARKER);
    expect(body.request?.learnedStyleId).toBe(SEED_STYLE.id);
    expect(body.request?.hospitalName).toBeFalsy();
  });

  test('케이스 4: 학습 ✓ + 병원 ✓ → 둘 다 포함 + UI 충돌 안내 배지 visible', async ({ page }) => {
    const capture = await captureBlogPost(page);
    await page.goto(guestUrl('/blog'));
    await seedLearnedStyle(page);
    await page.reload();

    await page.getByPlaceholder(/병원 이름/).fill(HOSPITAL_NAME);
    await selectLearnedStyleViaUI(page);

    // 4-A 정책 배지
    await expect(
      page.getByText('🎓 학습 말투 적용 중 — 병원 DB 프로파일은 무시됩니다'),
    ).toBeVisible();

    await fillTopic(page, '테스트 주제');
    await page.locator('button[type="submit"]:has-text("블로그 생성")').click();

    await expect.poll(() => capture.body, { timeout: 15000 }).not.toBeNull();

    const body = capture.body as { request?: Record<string, unknown>; hospitalName?: string };
    expect(body.request?.stylePromptText).toContain(SEED_STYLE_PROMPT_MARKER);
    expect(body.request?.learnedStyleId).toBe(SEED_STYLE.id);
    expect(body.request?.hospitalName).toBe(HOSPITAL_NAME);
  });

  test('UI 배지 토글: 학습 X 또는 병원 X 면 hidden (케이스 1/2/3 의 UI 측면)', async ({ page }) => {
    await page.goto(guestUrl('/blog'));

    // 초기: 둘 다 X → hidden
    await expect(page.getByText(/🎓 학습 말투 적용 중/)).toBeHidden();

    // 병원만 입력 → hidden
    await page.getByPlaceholder(/병원 이름/).fill(HOSPITAL_NAME);
    await expect(page.getByText(/🎓 학습 말투 적용 중/)).toBeHidden();

    // 병원 지우고 학습만 선택 → hidden
    await page.getByPlaceholder(/병원 이름/).fill('');
    await seedLearnedStyle(page);
    await page.reload();
    await selectLearnedStyleViaUI(page);
    await expect(page.getByText(/🎓 학습 말투 적용 중/)).toBeHidden();
  });

  test('섹션 재생성: stylePromptText 가 /api/generate/blog/section payload 에 전달', async ({ page }) => {
    const blogCapture = await captureBlogPost(page);
    const sectionCapture = await captureSectionPost(page);

    await page.goto(guestUrl('/blog'));
    await seedLearnedStyle(page);
    await page.reload();

    await selectLearnedStyleViaUI(page);
    await fillTopic(page, '테스트 주제');
    await page.locator('button[type="submit"]:has-text("블로그 생성")').click();

    // 초안 생성 완료 대기
    await expect.poll(() => blogCapture.body, { timeout: 15000 }).not.toBeNull();

    // 결과 화면의 "소제목별 수정" 토글 버튼이 나타날 때까지 대기 + 클릭 (기본 closed)
    const openPanelBtn = page.getByRole('button', { name: '소제목별 수정' });
    await openPanelBtn.waitFor({ state: 'visible', timeout: 30000 });
    await openPanelBtn.click();
    // 섹션 패널의 "재생성" 버튼 클릭 (첫 번째 섹션)
    await page.getByRole('button', { name: /^재생성$/ }).first().click();

    await expect.poll(() => sectionCapture.body, { timeout: 15000 }).not.toBeNull();

    const body = sectionCapture.body as { input?: Record<string, unknown> };
    expect(body.input?.stylePromptText).toContain(SEED_STYLE_PROMPT_MARKER);
    expect(body.input?.currentSection).toBeTruthy();
    expect(body.input?.fullBlogContent).toBeTruthy();
  });
});
