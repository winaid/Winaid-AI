/**
 * 블로그 이미지 0~5장 E2E 검증 — Playwright
 *
 * 스테이징 URL에서 실제 생성 흐름을 검증한다.
 * 회귀(regression) 방지가 목적.
 *
 * 실행:
 *   E2E_BASE_URL=https://story-darugi.com npx playwright test
 *   E2E_BASE_URL=http://localhost:5173 npx playwright test
 *
 * 환경변수:
 *   E2E_BASE_URL  — 스테이징 URL (기본: https://story-darugi.com)
 *   E2E_TIMEOUT   — 생성 대기 ms (기본: 180000)
 */
import { test, expect } from '@playwright/test';
import { runBlogGeneration, type BlogGenerationResult } from './blog-generation.helper';

const TOPIC = '임플란트 시술 비용과 과정 총정리';
const TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '180000', 10);

// ── 결과 리포트 출력 ──

function printReport(label: string, r: BlogGenerationResult) {
  const s = r.summary;
  console.log(`\n═══ ${label} ═══`);
  console.log(`결과화면: ${r.resultVisible ? '✅' : '❌'}`);
  console.log(`이미지: ${r.imageCount}장 / 경고: ${r.hasImageWarning ? r.warningText.substring(0, 80) : '없음'}`);
  console.log(`소요시간: ${(r.durationMs / 1000).toFixed(1)}s`);
  if (s) {
    console.log(`selected=${s.selected} planned=${s.planned} returned=${s.returned} ai=${s.ai} template=${s.template} placeholder=${s.placeholder}`);
    const aiCov = s.returned > 0 ? Math.round((s.ai / s.returned) * 100) : 0;
    const tplRate = s.returned > 0 ? Math.round((s.template / s.returned) * 100) : 0;
    console.log(`aiCoverage=${aiCov}% templateFallback=${tplRate}%`);
  } else {
    console.log('IMG-SUMMARY 로그 미수집');
  }
  // hero retry 로그
  if (r.logs.imgHeroRetry.length > 0) {
    r.logs.imgHeroRetry.forEach(l => console.log(`  ${l}`));
  }
  console.log(`═══════════════════\n`);
}

// ═══════════════════════════════════════
// 1차 필수: 0장 / 1장 / 5장
// ═══════════════════════════════════════

test.describe('블로그 이미지 생성 — 1차 필수 검증', () => {

  test('0장: 이미지 생성/삽입 완전 스킵', async ({ page }) => {
    const r = await runBlogGeneration(page, {
      topic: TOPIC,
      imageCount: 0,
      timeoutMs: TIMEOUT,
    });
    printReport('0장', r);

    // 결과 화면은 표시되어야 함 (텍스트만)
    expect(r.resultVisible).toBe(true);

    // 이미지 0장이면 이미지 경고도 없어야 함
    expect(r.imageCount).toBe(0);

    // IMG-SUMMARY 로그: selected=0이면 이미지 생성 자체를 스킵
    // 로그가 없거나 selected=0이면 정상
    if (r.summary) {
      expect(r.summary.selected).toBe(0);
    }
  });

  test('1장: hero 이미지 생성 + 자연 배치', async ({ page }) => {
    const r = await runBlogGeneration(page, {
      topic: TOPIC,
      imageCount: 1,
      timeoutMs: TIMEOUT,
    });
    printReport('1장', r);

    expect(r.resultVisible).toBe(true);

    // 정합성: 이미지 1장 표시 (AI 또는 template)
    expect(r.imageCount).toBeGreaterThanOrEqual(1);

    if (r.summary) {
      expect(r.summary.selected).toBe(1);
      expect(r.summary.returned).toBe(1);
    }
  });

  test('5장: 전체 흐름 + 품질 KPI 수집', async ({ page }) => {
    const r = await runBlogGeneration(page, {
      topic: TOPIC,
      imageCount: 5,
      timeoutMs: TIMEOUT,
    });
    printReport('5장', r);

    expect(r.resultVisible).toBe(true);

    // 정합성: 5장 모두 반환
    if (r.summary) {
      expect(r.summary.selected).toBe(5);
      expect(r.summary.returned).toBe(5);

      // ── 품질 KPI (report-only, hard fail 아님) ──
      // 현재 시스템이 완전히 안정적이지 않으므로 soft assertion 사용
      const aiCov = r.summary.returned > 0
        ? Math.round((r.summary.ai / r.summary.returned) * 100) : 0;
      const tplRate = r.summary.returned > 0
        ? Math.round((r.summary.template / r.summary.returned) * 100) : 0;

      console.log(`[KPI-CHECK] aiCoverage=${aiCov}% templateFallback=${tplRate}%`);
      console.log(`[KPI-CHECK] hero template? ${r.summary.template > 0 && r.summary.ai < r.summary.returned ? '⚠️ 가능성 있음' : '✅ 양호'}`);

      // soft assertion: template 3장 이상이면 경고 (hard fail 아님)
      if (r.summary.template >= 3) {
        console.warn(`[KPI-WARN] template ${r.summary.template}장 — 품질 점검 필요`);
      }
    }

    // 이미지 5장 전부 렌더되어야 함 (AI든 template든)
    expect(r.imageCount).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════
// 2차: 2장 / 3장 / 4장
// ═══════════════════════════════════════

test.describe('블로그 이미지 생성 — 2차 확장 검증', () => {

  test('2장: intro + section 배치', async ({ page }) => {
    const r = await runBlogGeneration(page, {
      topic: '치아 미백 시술 종류와 비용',
      imageCount: 2,
      timeoutMs: TIMEOUT,
    });
    printReport('2장', r);

    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(2);

    if (r.summary) {
      expect(r.summary.selected).toBe(2);
      expect(r.summary.returned).toBe(2);
    }
  });

  test('3장: 기본 품질 유지', async ({ page }) => {
    const r = await runBlogGeneration(page, {
      topic: '잇몸 질환 원인과 예방법',
      imageCount: 3,
      timeoutMs: TIMEOUT,
    });
    printReport('3장', r);

    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(3);

    if (r.summary) {
      expect(r.summary.selected).toBe(3);
      expect(r.summary.returned).toBe(3);
    }
  });

  test('4장: 웨이브 분할 + 자연 확장', async ({ page }) => {
    const r = await runBlogGeneration(page, {
      topic: '사랑니 발치 후 관리 방법',
      imageCount: 4,
      timeoutMs: TIMEOUT,
    });
    printReport('4장', r);

    expect(r.resultVisible).toBe(true);
    expect(r.imageCount).toBeGreaterThanOrEqual(4);

    if (r.summary) {
      expect(r.summary.selected).toBe(4);
      expect(r.summary.returned).toBe(4);
    }
  });
});
