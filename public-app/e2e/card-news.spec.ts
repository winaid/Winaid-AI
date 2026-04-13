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
    // NOTE: Playwright 는 기본적으로 테스트마다 격리된 browser context 를 생성하므로
    // localStorage 도 독립적이다. 이전 세션 실패(1회)는 첫 실행 빌드 캐시 + 브라우저
    // 설치 직후의 일회성 timing 이슈로 판단됨 (3회 연속 실행 시 재현 안 됨).
    // 여기서 `addInitScript(localStorage.clear)` 를 추가하면 page.reload() 마다 드래프트가
    // 지워져 기존 테스트를 깨뜨리므로 추가하지 않는다.
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

  // ── ShapedBackground (40a14db) 회귀 방어 ──
  //
  // 설계 노트: Konva canvas 위 mouse click 은 Playwright headless 에서 Konva hit
  // detection 과 정확히 맞물리지 않아(Text 노드 hit 영역이 넓어 배경 Rect 를
  // 맞추기 어려움) 불안정하다. 따라서 "실제로 hexagon 버튼을 UI 로 눌렀을 때
  // state 가 바뀌는지" 는 canvas click 없이 검증할 수 없음. 대신:
  //  1) 컴포넌트 구조 단언 — elementShapes 가 세팅된 드래프트 편집 시 7종 shape
  //     전부에 대해 canvas 렌더가 크래시 없이 성공하는지 (회귀 방어의 핵심).
  //  2) 구버전 호환 — elementShapes 키 자체가 없는 드래프트도 크래시 없음.
  // 두 테스트 모두 canvas 의 존재 + 기본 UI 요소만 DOM 수준에서 검증한다.

  test('ShapedBackground — 7종 shape 전부 지정된 드래프트 렌더 크래시 없음', async ({ page }) => {
    // 7개 shape 모두에 대해 렌더 경로를 타도록 구성. 이전 구현(cornerRadius 숫자)
    // 에서는 diamond/hexagon/circle/outlined 가 Rect 로 fallback 되어 시각적으로
    // 는 틀렸어도 크래시는 없었지만, 새 ShapedBackground(Circle/Ellipse/RegularPolygon)
    // 는 타입이 다른 Konva 노드를 생성하므로 react-konva 통합 오류 가능성이 있다.
    // 이 테스트는 모든 타입의 노드가 문제없이 마운트됨을 커버한다.
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'all-shapes E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          {
            id: 'ig-all',
            index: 1,
            layout: 'icon-grid',
            title: '7종 도형',
            icons: [
              { emoji: '🦷', title: 'A', desc: 'rounded' },
              { emoji: '💊', title: 'B', desc: 'pill' },
              { emoji: '🩺', title: 'C', desc: 'circle' },
              { emoji: '❤️', title: 'D', desc: 'diamond' },
            ],
            elementShapes: {
              'icon-card-0': 'rounded',
              'icon-card-1': 'pill',
              'icon-card-2': 'circle',
              'icon-card-3': 'diamond',
            },
          },
          {
            id: 'dh-all',
            index: 2,
            layout: 'data-highlight',
            title: '하이라이트',
            dataPoints: [
              { value: '90', label: 'hexagon' },
              { value: '80', label: 'sharp' },
              { value: '70', label: 'outlined' },
            ],
            elementShapes: {
              'datapoint-0': 'hexagon',
              'datapoint-1': 'sharp',
              'datapoint-2': 'outlined',
            },
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
    // 그리드에 slide 별 canvas 가 렌더됨. 크래시 없으면 canvas 가 존재한다.
    await page.locator('canvas').first().waitFor({ timeout: 10000 });
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThanOrEqual(1);

    // 수정 버튼으로 편집 모달까지 열어 내부 Stage 에도 크래시 없음을 확인
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });
    await expect(page.locator('.fixed canvas').first()).toBeVisible({ timeout: 5000 });
    // 편집 모달이 정상 오픈되었으면 shape popover 소스(버튼 7개)는 DOM 트리에
    // 이미 선언되어 있어야 한다 (선택된 요소 없으면 popover 비렌더지만, 이후
    // production code 에서 data-testid 속성이 map 으로 일관 적용되는지는 소스
    // 수준에서 단언). 여기선 편집 모달 닫기 버튼 존재만 확인.
    await expect(page.locator('[data-testid="editor-close"]')).toBeVisible({ timeout: 5000 });
  });

  test('ShapedBackground — elementShapes 없는 구버전 드래프트도 Konva 렌더 성공', async ({ page }) => {
    // elementShapes 키 자체가 없는 슬라이드가 주입되어도 크래시 없이 Konva canvas 가
    // 마운트되어야 한다 (shape 미지정 → Rect + defaultCorner 경로).
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'legacy draft E2E',
        hospitalName: 'E2E치과',
        proSlides: [
          { id: 's0', index: 1, layout: 'cover', title: '표지' },
          {
            id: 's1', index: 2, layout: 'icon-grid', title: '아이콘 그리드',
            icons: [
              { emoji: '🦷', title: '항목1', desc: 'A' },
              { emoji: '💊', title: '항목2', desc: 'B' },
            ],
          },
          {
            id: 's2', index: 3, layout: 'checklist', title: '체크',
            checkItems: ['항목 A', '항목 B'],
          },
        ],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    });
    await page.reload();
    await page.locator('button:has-text("이어서 편집")').first().click();
    // 그리드에 canvas 가 렌더되는지만 확인
    await page.locator('canvas').first().waitFor({ timeout: 10000 });
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThanOrEqual(1);
  });

  // ── editingMaxWidth (36e4ddf) 회귀 방어 ──

  /**
   * timeline desc 와 checklist item 을 더블클릭하면 document.body 에 DOM
   * textarea 가 삽입된다. textarea.style.maxWidth 를 측정해 카테고리
   * (DESC=500 / ITEM=380) 상한 이하인지 확인한다.
   *
   * 정확한 Konva text 노드 위치 계산은 취약하므로, canvas 내부 좌표 대신
   * 화면 비율 기반 dblclick 을 여러 후보 위치에 시도해 textarea 가 생성되면
   * 측정한다.
   */
  async function openLayoutEditor(
    page: import('@playwright/test').Page,
    slide: Record<string, unknown>,
  ) {
    await page.goto(guestUrl('/card_news'));
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    await page.evaluate((slideJson) => {
      localStorage.setItem('winai-cardnews-draft', JSON.stringify({
        userId: null,
        topic: 'maxw E2E',
        hospitalName: 'E2E치과',
        proSlides: [slideJson],
        proTheme: {},
        proCardRatio: '1:1',
        savedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
    }, slide);
    await page.reload();
    await expect(page.locator('text=이전 작업이 있어요').first()).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("이어서 편집")').first().click();
    await page.locator('button:has-text("수정")').first().click({ timeout: 10000 });
    const modalCanvas = page.locator('.fixed canvas').first();
    await expect(modalCanvas).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    return modalCanvas;
  }

  /** 후보 지점들에 순차적으로 dblclick, 그 중 textarea 가 나타난 것을 채택 */
  async function dblclickUntilTextarea(
    page: import('@playwright/test').Page,
    modalCanvas: ReturnType<import('@playwright/test').Page['locator']>,
    ratios: Array<[number, number]>,
  ): Promise<{ maxWidth: number; width: number } | null> {
    const box = await modalCanvas.boundingBox();
    if (!box) return null;
    for (const [rx, ry] of ratios) {
      await page.mouse.dblclick(box.x + box.width * rx, box.y + box.height * ry);
      // body 에 파란 테두리 텍스트 편집용 textarea 가 부착됨
      const ta = page.locator('textarea[style*="border: 2px solid"]').first();
      try {
        await ta.waitFor({ state: 'visible', timeout: 1500 });
        const measured = await ta.evaluate((el) => {
          const s = (el as HTMLTextAreaElement).style;
          return {
            maxWidth: parseFloat(s.maxWidth || '0'),
            width: parseFloat(s.width || '0'),
          };
        });
        // 측정 후 textarea 닫기 (blur)
        await page.keyboard.press('Escape');
        await ta.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => { /* noop */ });
        return measured;
      } catch {
        // 이 지점에선 textarea 안 뜸 → 다음 후보
      }
    }
    return null;
  }

  test('editingMaxWidth — cover body 편집 박스 maxWidth <= 500 (DESC)', async ({ page }) => {
    // cover.body 는 x=w/2, y=h*0.72, width=w*0.8 로 canvas 하단 25% 영역에
    // 단독 렌더되어 dblclick 좌표가 안정적. DESC(500) 카테고리 적용 대상.
    const canvas = await openLayoutEditor(page, {
      id: 'cv', index: 1, layout: 'cover',
      title: '표지 제목',
      subtitle: '부제',
      body: '긴 본문 설명을 넣어서 편집 박스 autoGrow 가 DOM 상한까지 확장되도록',
    });
    const measured = await dblclickUntilTextarea(page, canvas, [
      [0.5, 0.72], [0.5, 0.70], [0.5, 0.74], [0.5, 0.68], [0.5, 0.76],
      [0.45, 0.72], [0.55, 0.72], [0.4, 0.72], [0.6, 0.72],
    ]);
    expect(measured, 'textarea 측정 실패 — 더블클릭 좌표가 cover body 영역에 맞지 않음').not.toBeNull();
    // DESC 카테고리 상한 500px 이하
    expect(measured!.maxWidth).toBeLessThanOrEqual(500);
    // TITLE 기본값(420)보다 더 큼이 보장되어야 "카테고리 적용됨"이 확인됨
    expect(measured!.maxWidth).toBeGreaterThan(420);
  });

  test('editingMaxWidth — checklist 항목 편집 박스 maxWidth <= 380 (ITEM)', async ({ page }) => {
    const canvas = await openLayoutEditor(page, {
      id: 'cl', index: 1, layout: 'checklist', title: '체크리스트',
      checkItems: [
        '항목 하나는 조금 더 길게 작성하여 autoGrow 가 DOM 상한까지 도달하도록',
        '두 번째 체크 항목',
      ],
    });
    // checklist item 0: x=115, y=p.y+p.height/2-12. 첫 행 중앙.
    // item 2개면 각 행의 높이가 절반이라 상단 행 중심은 대략 0.4~0.5 구간.
    const measured = await dblclickUntilTextarea(page, canvas, [
      [0.5, 0.40], [0.5, 0.45], [0.5, 0.50], [0.4, 0.42], [0.6, 0.42],
      [0.3, 0.42], [0.7, 0.42], [0.5, 0.35], [0.5, 0.55], [0.5, 0.65],
    ]);
    expect(measured, 'textarea 측정 실패 — 더블클릭 좌표가 checklist item 영역에 맞지 않음').not.toBeNull();
    // ITEM 카테고리 상한 380px 이하
    expect(measured!.maxWidth).toBeLessThanOrEqual(380);
  });
});
