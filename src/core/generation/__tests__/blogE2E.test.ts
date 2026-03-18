/**
 * 블로그 코어 E2E 검증 — 실제 Gemini 프록시 + Supabase 사용
 *
 * mock 전략: ZERO mock.
 *   - Gemini 프록시: 실제 호출 (https://vercel-proxy-ten-jade.vercel.app/api/gemini)
 *   - Supabase: 실제 연결 (blog-images 버킷, generated_posts, blog_history)
 *   - 이미지 생성: 실제 Gemini Image API
 *   - Credit gate: anonymous_demo 모드 → 항상 통과 (실제 코드)
 *   - strip/fallback/저장: 전부 실제 코드
 *
 * 환경:
 *   - Vitest jsdom (localStorage, sessionStorage, fetch 제공)
 *   - VITE_GEMINI_PROXY_URL inject via vitest env
 *
 * timeout:
 *   - 블로그 1건: 최대 210초 (텍스트 120s + 이미지 60s + 저장 30s)
 *   - 전체 suite: 최대 30분
 */

import { describe, it, expect, afterAll } from 'vitest';
import { runContentJob } from '../generateContentJob';

// ── E2E 결과 기록 ──

interface E2ERecord {
  id: number;
  topic: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  error?: string;

  // 텍스트
  title: string;
  hasIntro: boolean;
  sectionCount: number;
  hasConclusion: boolean;
  textLength: number;
  fallbackPath: string; // pipeline | legacy | none

  // 이미지
  heroStatus: 'ai-raster' | 'template-svg' | 'placeholder' | 'url' | 'missing';
  totalImages: number;
  imageFailCount: number;
  svgCount: number;
  rasterBase64InFinal: boolean;
  blobInFinal: boolean;

  // 저장
  storageHtmlLength: number;
  storageHasRasterBase64: boolean;
  storageHasSvg: boolean;
  storageHasBlob: boolean;

  // history
  historyLightweightLength: number;

  // 판정
  verdict: 'OK' | 'WARN' | 'FATAL';
  warnings: string[];
  fatals: string[];
}

const records: E2ERecord[] = [];

function classifyHero(html: string): E2ERecord['heroStatus'] {
  // hero = 첫 번째 <img>
  const firstImg = html.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
  if (!firstImg) return 'missing';
  const src = firstImg[1];
  if (src.startsWith('https://')) return 'url';
  if (src.startsWith('data:image/svg+xml')) return 'template-svg';
  if (src.startsWith('data:image/') && !src.includes('svg')) return 'ai-raster';
  if (src.startsWith('data:image/gif;base64,R0lGOD')) return 'placeholder';
  return 'missing';
}

async function runBlogE2E(
  id: number,
  topic: string,
  imageCount: number = 1,
): Promise<E2ERecord> {
  const start = Date.now();
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const fatals: string[] = [];

  const request = {
    postType: 'blog' as const,
    topic,
    keywords: topic,
    category: '치과' as any,
    tone: '친근한',
    audienceMode: '환자용' as any,
    persona: '치과 전문가',
    imageStyle: 'illustration' as any,
    imageCount,
    cssTheme: 'modern' as any,
  };

  let result: any;
  try {
    result = await runContentJob(request);
  } catch (err: any) {
    return {
      id, topic, startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      success: false,
      error: err?.message || 'unknown error',
      title: '', hasIntro: false, sectionCount: 0, hasConclusion: false,
      textLength: 0, fallbackPath: 'none',
      heroStatus: 'missing', totalImages: 0, imageFailCount: 0, svgCount: 0,
      rasterBase64InFinal: false, blobInFinal: false,
      storageHtmlLength: 0, storageHasRasterBase64: false,
      storageHasSvg: false, storageHasBlob: false,
      historyLightweightLength: 0,
      verdict: 'FATAL', warnings: [], fatals: ['생성 exception'],
    };
  }

  const durationMs = Date.now() - start;
  const completedAt = new Date().toISOString();

  if (!result.success) {
    return {
      id, topic, startedAt, completedAt, durationMs,
      success: false, error: result.error,
      title: '', hasIntro: false, sectionCount: 0, hasConclusion: false,
      textLength: 0, fallbackPath: 'none',
      heroStatus: 'missing', totalImages: 0, imageFailCount: 0, svgCount: 0,
      rasterBase64InFinal: false, blobInFinal: false,
      storageHtmlLength: 0, storageHasRasterBase64: false,
      storageHasSvg: false, storageHasBlob: false,
      historyLightweightLength: 0,
      verdict: 'FATAL', warnings: [], fatals: [`생성 실패: ${result.error}`],
    };
  }

  const art = result.artifact;
  const content = art.content;
  const html = content.htmlContent || '';
  const storageHtml = content.storageHtml || '';

  // ── 텍스트 분석 ──
  const title = art.title || '';
  const hasIntro = /intro|도입/.test(html) || html.indexOf('<p>') < (html.indexOf('<h3') || Infinity);
  const sectionCount = (html.match(/<h3/gi) || []).length;
  const hasConclusion = /결론|마무리|conclusion/i.test(html);
  const textLength = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;

  // pipeline vs legacy 판단 (로그 기반은 불가 — content 길이 기반 추정)
  const fallbackPath = content.conclusionLength ? 'pipeline' : 'legacy';

  if (!title) fatals.push('제목 없음');
  if (sectionCount < 2) warnings.push(`섹션 ${sectionCount}개 (기대: 4+)`);
  if (textLength < 200) fatals.push(`텍스트 ${textLength}자 (너무 짧음)`);

  // ── 이미지 분석 ──
  const heroStatus = classifyHero(html);
  const allImgs = html.match(/<img[^>]*src="([^"]*)"[^>]*>/gi) || [];
  const totalImages = allImgs.length;
  const imageFailCount = content.imageFailCount || 0;
  const svgCount = (html.match(/data:image\/svg\+xml/gi) || []).length;
  const rasterBase64InFinal = /data:image\/(?!svg|gif;base64,R0lGOD)[a-z]/i.test(html);
  const blobInFinal = html.includes('blob:');

  if (heroStatus === 'missing') fatals.push('hero 소실');
  if (heroStatus === 'placeholder') warnings.push('hero가 placeholder (broken image 위험)');
  if (heroStatus === 'template-svg') warnings.push('hero가 template SVG (AI 실패)');
  if (blobInFinal) warnings.push('blob URL이 최종 HTML에 잔류');

  // ── storageHtml 분석 ──
  const storageHtmlLength = storageHtml.length;
  const storageHasRasterBase64 = /data:image\/(?!svg|gif;base64,R0lGOD)[a-z]/i.test(storageHtml);
  const storageHasSvg = storageHtml.includes('data:image/svg+xml');
  const storageHasBlob = storageHtml.includes('blob:');

  if (storageHasRasterBase64) fatals.push('storageHtml에 raster base64 잔류');
  if (storageHasBlob) fatals.push('storageHtml에 blob URL 잔류');
  if (storageHtml && html.includes('data:image/svg+xml') && !storageHasSvg) {
    fatals.push('display에 SVG 있는데 storage에서 소실');
  }

  // ── 판정 ──
  let verdict: 'OK' | 'WARN' | 'FATAL' = 'OK';
  if (fatals.length > 0) verdict = 'FATAL';
  else if (warnings.length > 0) verdict = 'WARN';

  return {
    id, topic, startedAt, completedAt, durationMs,
    success: true, title,
    hasIntro, sectionCount, hasConclusion, textLength, fallbackPath,
    heroStatus, totalImages, imageFailCount, svgCount,
    rasterBase64InFinal, blobInFinal,
    storageHtmlLength, storageHasRasterBase64, storageHasSvg, storageHasBlob,
    historyLightweightLength: 0, // 비동기라 직접 측정 불가
    verdict, warnings, fatals,
  };
}

// ═══════════════════════════════════════════════════════
// E2E 시나리오 실행
// ═══════════════════════════════════════════════════════

// 각 테스트는 실제 API를 호출하므로 긴 timeout 필요
const SINGLE_TEST_TIMEOUT = 240_000; // 4분

describe('블로그 코어 E2E — 실제 API', { timeout: 1800_000 }, () => {

  // ── 그룹 A: 정상 케이스 ──

  it('E2E-1. 임플란트 비용 — 정상 생성', async () => {
    const r = await runBlogE2E(1, '임플란트 비용 완전 가이드');
    records.push(r);
    console.log(`[E2E-1] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | ${r.verdict}`);
    expect(r.success).toBe(true);
    expect(r.verdict).not.toBe('FATAL');
  }, SINGLE_TEST_TIMEOUT);

  it('E2E-2. 겨울철 구강 건조증', async () => {
    const r = await runBlogE2E(2, '겨울철 구강 건조증 예방과 관리법');
    records.push(r);
    console.log(`[E2E-2] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | ${r.verdict}`);
    expect(r.success).toBe(true);
    expect(r.verdict).not.toBe('FATAL');
  }, SINGLE_TEST_TIMEOUT);

  it('E2E-3. 잇몸 질환 치료', async () => {
    const r = await runBlogE2E(3, '잇몸 질환의 증상과 치료법');
    records.push(r);
    console.log(`[E2E-3] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | ${r.verdict}`);
    expect(r.success).toBe(true);
    expect(r.verdict).not.toBe('FATAL');
  }, SINGLE_TEST_TIMEOUT);

  it('E2E-4. 치아 미백 시술', async () => {
    const r = await runBlogE2E(4, '치아 미백 시술 종류와 비용');
    records.push(r);
    console.log(`[E2E-4] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | ${r.verdict}`);
    expect(r.success).toBe(true);
    expect(r.verdict).not.toBe('FATAL');
  }, SINGLE_TEST_TIMEOUT);

  it('E2E-5. 교정 치료 가이드', async () => {
    const r = await runBlogE2E(5, '성인 교정 치료 종류와 기간 비용');
    records.push(r);
    console.log(`[E2E-5] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | ${r.verdict}`);
    expect(r.success).toBe(true);
    expect(r.verdict).not.toBe('FATAL');
  }, SINGLE_TEST_TIMEOUT);

  // ── 그룹 B: 이미지 0장 (텍스트만) ──

  it('E2E-6. 충치 예방 (이미지 0장)', async () => {
    const r = await runBlogE2E(6, '충치 예방을 위한 올바른 양치법', 0);
    records.push(r);
    console.log(`[E2E-6] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | ${r.verdict}`);
    expect(r.success).toBe(true);
    // 이미지 0장이므로 hero missing은 FATAL 아님
    if (r.heroStatus === 'missing' && r.fatals.includes('hero 소실')) {
      // 이미지 0장 케이스에서는 hero missing 허용
      r.fatals = r.fatals.filter(f => f !== 'hero 소실');
      r.verdict = r.fatals.length > 0 ? 'FATAL' : r.warnings.length > 0 ? 'WARN' : 'OK';
    }
    expect(r.fatals.filter(f => f !== 'hero 소실')).toHaveLength(0);
  }, SINGLE_TEST_TIMEOUT);

  // ── 그룹 C: 다중 이미지 ──

  it('E2E-7. 사랑니 발치 (이미지 2장)', async () => {
    const r = await runBlogE2E(7, '사랑니 발치 시기와 주의사항', 2);
    records.push(r);
    console.log(`[E2E-7] ${r.durationMs}ms | hero=${r.heroStatus} | text=${r.textLength}자 | images=${r.totalImages} | fails=${r.imageFailCount} | ${r.verdict}`);
    expect(r.success).toBe(true);
    expect(r.verdict).not.toBe('FATAL');
  }, SINGLE_TEST_TIMEOUT);
});

// ═══════════════════════════════════════════════════════
// 최종 보고서
// ═══════════════════════════════════════════════════════

afterAll(() => {
  const total = records.length;
  const ok = records.filter(r => r.verdict === 'OK').length;
  const warn = records.filter(r => r.verdict === 'WARN').length;
  const fatal = records.filter(r => r.verdict === 'FATAL').length;
  const successRate = total > 0 ? Math.round((records.filter(r => r.success).length / total) * 100) : 0;
  const avgDuration = total > 0 ? Math.round(records.reduce((s, r) => s + r.durationMs, 0) / total / 1000) : 0;

  console.log('\n' + '═'.repeat(100));
  console.log('  블로그 코어 E2E 검증 결과 — 실제 API 사용');
  console.log('═'.repeat(100));
  console.log(`  총 실행: ${total} | OK: ${ok} | WARN: ${warn} | FATAL: ${fatal} | 성공률: ${successRate}% | 평균: ${avgDuration}s`);
  console.log('─'.repeat(100));
  console.log('  #  │ 주제                              │ 시간   │ hero        │ 텍스트   │ imgs │ storage │ 판정');
  console.log('─'.repeat(100));

  for (const r of records) {
    const time = `${Math.round(r.durationMs / 1000)}s`.padStart(5);
    const hero = r.heroStatus.padEnd(12);
    const text = `${r.textLength}자`.padStart(7);
    const imgs = `${r.totalImages}/${r.imageFailCount}f`.padEnd(5);
    const stor = r.storageHasRasterBase64 ? '❌b64' : r.storageHasBlob ? '❌blob' : r.storageHtmlLength > 0 ? '✅' : '—';
    const topic = r.topic.substring(0, 30).padEnd(30);
    console.log(`  ${String(r.id).padStart(2)} │ ${topic} │ ${time} │ ${hero} │ ${text} │ ${imgs} │ ${stor.padEnd(7)} │ ${r.verdict}`);
    if (r.fatals.length > 0) console.log(`     │ ❌ FATAL: ${r.fatals.join(', ')}`);
    if (r.warnings.length > 0) console.log(`     │ ⚠️  WARN: ${r.warnings.join(', ')}`);
  }

  console.log('─'.repeat(100));

  // storageHtml 계약 요약
  const storageLeaks = records.filter(r => r.storageHasRasterBase64 || r.storageHasBlob);
  const svgPreserved = records.filter(r => r.storageHasSvg);
  console.log(`  [저장 계약] raster/blob 누출: ${storageLeaks.length}건 | SVG 보존: ${svgPreserved.length}건`);

  // hero 분포
  const heroDist = records.reduce((acc, r) => {
    acc[r.heroStatus] = (acc[r.heroStatus] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`  [hero 분포] ${Object.entries(heroDist).map(([k, v]) => `${k}=${v}`).join(' | ')}`);

  console.log('═'.repeat(100));

  // 최종 판정
  if (fatal === 0 && successRate >= 80) {
    console.log('  ✅ 최종 판정: 승인 — 블로그 코어 E2E 통과');
  } else if (fatal <= 1 && successRate >= 70) {
    console.log('  ⚠️  최종 판정: 조건부 승인 — 경미한 문제 존재');
  } else {
    console.log('  ❌ 최종 판정: 불가 — 치명 실패 다수 또는 성공률 부족');
  }
  console.log('═'.repeat(100));
});
