import { test, expect } from '@playwright/test';
import { setupCommonMocks, injectCardNewsDraft, guestUrl } from './helpers/mocks';

/**
 * 카드뉴스 페이지 스모크 테스트 — mock 기반.
 *
 * 기존 card-news-dnd.spec.ts는 캔버스 드래그앤드롭 통합 테스트 (느리고 세밀).
 * 이 파일은 "페이지 로드 + 기본 UI + 드래프트 복원 모달"만 빠르게 검증.
 */
test.describe('카드뉴스 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('게스트 모드로 /card_news 진입 + 주제 입력 UI 존재', async ({ page }) => {
    const res = await page.goto(guestUrl('/card_news'));
    expect(res?.status()).toBeLessThan(400);
    // textarea 또는 input이 보일 때까지 대기 (hydration)
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    // "카드뉴스 생성" 버튼이 존재 (비활성 상태여도 OK)
    const genBtn = page.locator('button:has-text("카드뉴스 생성")').first();
    await expect(genBtn).toBeVisible({ timeout: 5000 });
  });

  test('드래프트 주입 시 복원 모달이 표시된다', async ({ page }) => {
    // 먼저 페이지에 한 번 접근해 origin 확보 → 그 뒤 localStorage 주입 → 새로고침
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await injectCardNewsDraft(page, { topic: '테스트 드래프트 주제', userId: null, slideCount: 2 });
    await page.reload();

    // 복원 모달의 대표 문구
    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    // 주제가 모달에 표시
    await expect(page.locator('text=테스트 드래프트 주제').first()).toBeVisible();
    // "이어서 편집" 버튼 존재
    await expect(page.locator('button:has-text("이어서 편집")').first()).toBeVisible();
    // "새로 시작" 버튼 존재
    await expect(page.locator('button:has-text("새로 시작")').first()).toBeVisible();
  });

  test('드래프트 "새로 시작" 클릭 시 localStorage 비워짐', async ({ page }) => {
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await injectCardNewsDraft(page, { topic: '삭제될 드래프트', userId: null });
    await page.reload();

    await page.locator('button:has-text("새로 시작")').first().click();

    // 모달 사라짐 확인
    await expect(page.locator('text=이전 작업이 있어요').first()).not.toBeVisible({ timeout: 3000 });

    // localStorage에서 드래프트 삭제됨 확인
    const draft = await page.evaluate(() => localStorage.getItem('winai-cardnews-draft'));
    expect(draft).toBeNull();
  });

  test('pros-cons 레이아웃: 사이드바에 pros/cons 배열 편집 UI가 표시된다', async ({ page }) => {
    // 1) 페이지 접근 후 pros-cons 슬라이드를 포함한 드래프트 직접 주입
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'pros-cons E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          {
            id: 'pros-cons-slide',
            index: 1,
            layout: 'pros-cons',
            title: '장단점 비교',
            prosLabel: '장점',
            consLabel: '주의점',
            pros: ['회복이 빠름', '통증이 적음'],
            cons: ['비용 부담', '개인차'],
          },
        ],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    });
    await page.reload();

    // 2) 드래프트 이어서 편집
    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("이어서 편집")').first().click();

    // 3) 수정 버튼 클릭 → 편집 모달 열림
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });

    // 4) 사이드바에 pros-cons 편집 UI 존재 — 라벨 + 추가 버튼 + placeholder 로 검증
    await expect(page.locator('text=장점 라벨').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=주의점 라벨').first()).toBeVisible();
    await expect(page.locator('button:has-text("+ 장점 추가")')).toBeVisible();
    await expect(page.locator('button:has-text("+ 주의점 추가")')).toBeVisible();

    // 5) 기존 장점 항목 2개 (placeholder 가진 input 이 min 2 개)
    const prosInputs = page.locator('input[placeholder="장점을 입력하세요"]');
    expect(await prosInputs.count()).toBeGreaterThanOrEqual(2);

    // 6) "+ 장점 추가" 클릭 → input 개수 +1
    const beforeCount = await prosInputs.count();
    await page.locator('button:has-text("+ 장점 추가")').click();
    await expect.poll(async () => prosInputs.count(), { timeout: 3000 })
      .toBe(beforeCount + 1);
  });

  test('qna 레이아웃: 사이드바에 questions 배열 편집 UI가 표시된다', async ({ page }) => {
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'qna E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          {
            id: 'qna-slide',
            index: 1,
            layout: 'qna',
            title: '자주 묻는 질문',
            questions: [{ q: '수술 시간?', a: '약 1시간' }],
          },
        ],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    });
    await page.reload();

    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("이어서 편집")').first().click();
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });

    await expect(page.locator('button:has-text("+ Q&A 추가")')).toBeVisible({ timeout: 5000 });
    // 질문/답변 placeholder 를 가진 필드 쌍이 최소 하나
    await expect(page.locator('input[placeholder="질문"]').first()).toBeVisible();
    await expect(page.locator('textarea[placeholder="답변"]').first()).toBeVisible();
  });

  test('timeline 레이아웃: 3컬럼 input + 추가 버튼 표시', async ({ page }) => {
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'timeline E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          {
            id: 'tl-slide',
            index: 1,
            layout: 'timeline',
            title: '회복 과정',
            timelineItems: [
              { time: '1일차', title: '붓기 최고조', desc: '휴식 권장' },
              { time: '1주차', title: '실밥 제거', desc: '' },
            ],
          },
        ],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    });
    await page.reload();
    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("이어서 편집")').first().click();
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });

    // 3컬럼 input placeholder 확인
    await expect(page.locator('input[placeholder="시점 (예: 1주차)"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="제목"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="설명 (선택)"]').first()).toBeVisible();

    // "+ 타임라인 추가" 클릭 → 시점 input 개수 +1
    const timeInputs = page.locator('input[placeholder="시점 (예: 1주차)"]');
    const beforeCount = await timeInputs.count();
    await page.locator('button:has-text("+ 타임라인 추가")').click();
    await expect.poll(async () => timeInputs.count(), { timeout: 3000 })
      .toBe(beforeCount + 1);
  });

  test('warning 레이아웃: warningTitle input + warningItems 편집 UI 표시', async ({ page }) => {
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'warning E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          {
            id: 'wn-slide',
            index: 1,
            layout: 'warning',
            title: '주의',
            warningTitle: '시술 전 꼭 확인하세요',
            warningItems: ['음주 금지', '약 복용 중단'],
          },
        ],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    });
    await page.reload();
    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("이어서 편집")').first().click();
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });

    await expect(page.locator('input[placeholder="예: 시술 전 꼭 확인하세요"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("+ 주의사항 추가")')).toBeVisible();
    // warningItems input 최소 2개 (기존 항목)
    const warningInputs = page.locator('input[placeholder="주의사항 내용"]');
    expect(await warningInputs.count()).toBeGreaterThanOrEqual(2);
  });

  test('cover 레이아웃: body/badge/hashtags + 데코레이션 토글 5개', async ({ page }) => {
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'cover E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          {
            id: 'cover-slide',
            index: 1,
            layout: 'cover',
            title: '표지 제목',
            subtitle: '부제',
            badge: '이번 주',
            hashtags: ['#건강'],
          },
        ],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    });
    await page.reload();
    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("이어서 편집")').first().click();
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });

    // body/badge/hashtags UI
    await expect(page.locator('textarea[placeholder="표지 부연 설명 (사용 안 하면 비워두세요)"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="예: 이번 주 리포트"]')).toBeVisible();
    await expect(page.locator('button:has-text("+ 해시태그 추가")')).toBeVisible();

    // 데코레이션 체크박스 5개
    await expect(page.locator('text=배지 표시')).toBeVisible();
    await expect(page.locator('text=해시태그 표시')).toBeVisible();
    await expect(page.locator('text=화살표 장식')).toBeVisible();
    await expect(page.locator('text=핸들 장식')).toBeVisible();
    await expect(page.locator('text=라인 장식')).toBeVisible();

    // 화살표 장식 토글 (기본 false → true) 동작
    const arrowToggle = page.locator('label:has-text("화살표 장식") input[type="checkbox"]');
    await expect(arrowToggle).not.toBeChecked();
    await arrowToggle.check();
    await expect(arrowToggle).toBeChecked();
  });
});
