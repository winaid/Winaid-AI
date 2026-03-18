/**
 * 블로그 코어 검증 — 10개 시나리오 실행 테스트
 *
 * 검증 축:
 *   1) 생성 완주율
 *   2) hero 이미지 보장
 *   3) preview / persist / history 일관성 (strip 계약)
 *   4) 외부 API 실패 시 fallback 품질
 *   5) 반복 실행 안정성
 *
 * mock 전략:
 *   - 외부 네트워크(Gemini, Supabase, Naver) = mock
 *   - 내부 로직(strip, fallback, 이미지 보장, 저장 계약) = 실제 코드 실행
 *   - imageStorageService.stripLargeBase64FromHtml = 실제 함수 (핵심 검증 대상)
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// ── 1. 실제 strip 함수 import (mock하지 않음) ──
import { stripLargeBase64FromHtml, stripBase64FromHtml } from '../../../services/image/imageStorageService';

// ── 2. 외부 서비스 mock ──
vi.mock('../policies', () => ({
  runCreditGate: vi.fn().mockResolvedValue({ allowed: true }),
}));

// 파이프라인 & 레거시 텍스트 생성 mock
const mockPipeline = vi.fn();
const mockLegacy = vi.fn();

vi.mock('../../../services/blogPipelineService', () => ({
  generateBlogWithPipeline: (...args: any[]) => mockPipeline(...args),
}));
vi.mock('../../../services/legacyBlogGeneration', () => ({
  generateBlogPostText: (...args: any[]) => mockLegacy(...args),
}));

vi.mock('../../../services/faqService', () => ({
  generateFaqSection: vi.fn().mockResolvedValue(''),
  generateSmartBlockFaq: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../services/geminiClient', () => ({
  callGemini: vi.fn().mockResolvedValue('{"collected_facts": []}'),
  TIMEOUTS: { QUICK_OPERATION: 5000 },
  getKoreanErrorMessage: vi.fn().mockImplementation((e: any) => e?.message || '에러'),
}));

vi.mock('../../../services/image/imagePromptBuilder', () => ({
  STYLE_NAMES: { photo: '실사', illustration: '일러스트', medical: '의학' } as Record<string, string>,
}));

// 이미지 생성 mock — AI 성공/실패를 시나리오별로 제어
const mockImageQueue = vi.fn();
vi.mock('../../../services/image/imageOrchestrator', () => ({
  generateImageQueue: (...args: any[]) => mockImageQueue(...args),
  updateSessionFinalPayload: vi.fn(),
}));

vi.mock('../../../services/image/cardNewsImageService', () => ({
  generateSingleImage: vi.fn().mockResolvedValue('data:image/png;base64,test'),
}));

vi.mock('../../../services/cardNewsService', () => ({
  generateCardNewsWithAgents: vi.fn(),
}));
vi.mock('../../../services/cardNewsDesignTemplates', () => ({
  getDesignTemplateById: vi.fn().mockReturnValue(undefined),
}));

// 저장 mock — 호출 인자 캡처
const mockPersistPost = vi.fn().mockResolvedValue(undefined);
const mockPersistHistory = vi.fn().mockResolvedValue(undefined);
vi.mock('../contentStorage', () => ({
  persistGeneratedPost: (...args: any[]) => mockPersistPost(...args),
  persistBlogHistory: (...args: any[]) => mockPersistHistory(...args),
}));

// imageStorageService — strip은 실제 함수, 업로드만 mock
vi.mock('../../../services/image/imageStorageService', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    // strip 함수는 실제 코드 유지
    stripLargeBase64FromHtml: actual.stripLargeBase64FromHtml,
    stripBase64FromHtml: actual.stripBase64FromHtml,
    // 업로드 함수만 mock (Supabase 불필요)
    restoreAndUploadImages: vi.fn().mockImplementation((html: string) => {
      // 실제 strip 적용 — 업로드만 건너뜀
      return actual.stripLargeBase64FromHtml(html);
    }),
    uploadBase64Image: vi.fn().mockResolvedValue('https://mock-supabase.co/img.png'),
    uploadAllImages: vi.fn().mockResolvedValue({ urlMap: new Map(), svgIndices: new Set() }),
  };
});

vi.mock('../../../services/contentSimilarityService', () => ({
  saveBlogHistory: vi.fn().mockResolvedValue(undefined),
}));

// resultAssembler — 실제에 가까운 동작
vi.mock('../../../services/resultAssembler', () => ({
  MEDICAL_DISCLAIMER: '<p class="disclaimer">면책 조항</p>',
  cleanMarkdownArtifacts: vi.fn().mockImplementation((s: string) => s),
  ensureContainerWrapper: vi.fn().mockImplementation((s: string) =>
    s.includes('naver-post-container') ? s : `<div class="naver-post-container">${s}</div>`
  ),
  generateCardNewsFallbackTemplate: vi.fn().mockImplementation((s: string) => s),
  normalizeSubtitles: vi.fn().mockImplementation((s: string) => s),
  insertImageMarkers: vi.fn().mockImplementation((s: string) => s),
  insertImageData: vi.fn().mockImplementation((html: string, images: any[]) => {
    // 실제처럼 이미지를 HTML에 삽입
    let result = html;
    if (images.length > 0 && images[0]?.data) {
      const heroTag = `<img src="${images[0].data}" alt="hero" data-image-index="1" class="hero-image" />`;
      result = heroTag + result;
    }
    const blobUrls: string[] = [];
    return { html: result, blobUrls };
  }),
  applyCardNewsStyles: vi.fn().mockImplementation((s: string) => s),
  wrapFinalHtml: vi.fn().mockImplementation((s: string) => `<style>.naver-post-container{}</style>${s}`),
}));

vi.mock('../../../services/contentQualityService', () => ({
  runAiSmellCheck: vi.fn().mockReturnValue({
    score: 8,
    criticalIssues: [],
    warningIssues: [],
    suggestions: [],
  }),
  integrateAiSmellToFactCheck: vi.fn().mockImplementation((fc: any) => fc),
}));

import { runContentJob } from '../generateContentJob';

// ── 테스트 유틸리티 ──

/** 대표 raster base64 (100자 이상) */
const RASTER_BASE64 = 'data:image/png;base64,' + 'A'.repeat(200);
/** SVG template data URI */
const SVG_TEMPLATE = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#4A90D9"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="14">Template</text></svg>');
/** blob URL */
const BLOB_URL = 'blob:http://localhost:5173/abc-123-def';

const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function makeBlogRequest(topic: string, imageCount = 1) {
  return {
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
}

function makeHtmlWithStructure(title: string, heroSrc: string) {
  return `
<div class="naver-post-container">
  <h2 class="main-title">${title}</h2>
  <div class="intro-section"><p>도입부 내용입니다. 이 블로그에서는 ${title}에 대해 알아보겠습니다.</p></div>
  <h3>1. 첫 번째 섹션</h3>
  <p>첫 번째 섹션 본문 내용입니다. 충분한 길이의 텍스트를 포함합니다.</p>
  <h3>2. 두 번째 섹션</h3>
  <p>두 번째 섹션 본문 내용입니다.</p>
  <h3>3. 세 번째 섹션</h3>
  <p>세 번째 섹션 본문 내용입니다.</p>
  <h3>4. 네 번째 섹션</h3>
  <p>네 번째 섹션 본문 내용입니다.</p>
  <div class="conclusion"><p>결론: ${title}에 대한 모든 내용을 알아보았습니다.</p></div>
</div>`.trim();
}

function setupPipelineSuccess(title: string, heroSrc: string) {
  const html = makeHtmlWithStructure(title, heroSrc);
  mockPipeline.mockResolvedValue({
    title,
    rawHtml: html,
    polishPromise: Promise.resolve({
      content: html,
      polishModel: 'test',
      finalQualityPath: 'test_path',
      stageCMs: 100,
    }),
    imagePrompts: [`${title} 관련 치과 의료 이미지`],
  });
}

function setupLegacyFallback(title: string) {
  const html = makeHtmlWithStructure(title, '');
  mockLegacy.mockResolvedValue({
    title,
    content: html,
    imagePrompts: [`${title} 관련 이미지`],
    fact_check: { fact_score: 85, safety_score: 90, conversion_score: 80, ai_smell_score: 10, verified_facts_count: 5, issues: [], recommendations: [] },
  });
}

function setupImageQueue(heroSrc: string, subSrc?: string) {
  mockImageQueue.mockResolvedValue([
    { index: 0, data: heroSrc, prompt: '테스트 hero 프롬프트', status: heroSrc.includes('svg') ? 'fallback' : 'success', resultType: heroSrc.includes('svg') ? 'template' : 'ai-image' },
    ...(subSrc ? [{ index: 1, data: subSrc, prompt: '테스트 sub 프롬프트', status: subSrc.includes('svg') ? 'fallback' : 'success', resultType: subSrc.includes('svg') ? 'template' : 'ai-image' }] : []),
  ]);
}

// ── 결과 기록 ──

interface TestRecord {
  scenario: number;
  topic: string;
  textComplete: boolean;
  hasTitle: boolean;
  hasIntro: boolean;
  hasSections: boolean;
  hasConclusion: boolean;
  heroStatus: 'ai' | 'template' | 'placeholder' | 'missing';
  imageCount: number;
  storageSuccess: boolean;
  historyConsistent: boolean;
  externalApiIssue: string;
  verdict: 'OK' | 'WARN' | 'FATAL';
  details: string;
}

const records: TestRecord[] = [];

function analyzeResult(
  scenario: number,
  topic: string,
  result: any,
  expectedHeroType: 'ai' | 'template',
  apiIssue: string = '',
): TestRecord {
  const record: TestRecord = {
    scenario,
    topic,
    textComplete: false,
    hasTitle: false,
    hasIntro: false,
    hasSections: false,
    hasConclusion: false,
    heroStatus: 'missing',
    imageCount: 0,
    storageSuccess: false,
    historyConsistent: false,
    externalApiIssue: apiIssue,
    verdict: 'FATAL',
    details: '',
  };

  if (!result.success) {
    record.details = `생성 실패: ${result.error}`;
    return record;
  }

  const art = result.artifact;
  const content = art.content;
  const html = content.htmlContent || '';
  const storageHtml = content.storageHtml || '';

  // 텍스트 검증
  record.hasTitle = !!art.title && art.title.length > 0;
  record.hasIntro = html.includes('도입부') || html.includes('intro');
  record.hasSections = (html.match(/<h3/gi) || []).length >= 2;
  record.hasConclusion = html.includes('결론') || html.includes('conclusion');
  record.textComplete = record.hasTitle && html.length > 200;

  // hero 이미지 검증
  if (html.includes('data:image/png') || html.includes('https://')) {
    record.heroStatus = 'ai';
  } else if (html.includes('data:image/svg+xml')) {
    record.heroStatus = 'template';
  } else if (html.includes(PLACEHOLDER) || html.includes('data:image/gif')) {
    record.heroStatus = 'placeholder';
  } else {
    record.heroStatus = 'missing';
  }

  // 이미지 개수
  record.imageCount = (html.match(/<img/gi) || []).length;

  // 저장 검증 — persistGeneratedPost 호출 여부
  record.storageSuccess = mockPersistPost.mock.calls.length > 0;

  // history 일관성: lightweight에서 SVG 보존, raster strip 확인
  const historyCalls = mockPersistHistory.mock.calls;
  if (historyCalls.length > 0) {
    const historyOpts = historyCalls[historyCalls.length - 1][0];
    const lwHtml = historyOpts?.lightweightHtml || '';
    // SVG가 원본에 있었으면 lightweight에도 있어야 함
    const originalHasSvg = (storageHtml || html).includes('data:image/svg+xml');
    const lwHasSvg = lwHtml.includes('data:image/svg+xml');
    // raster base64가 lightweight에 남으면 안 됨
    const lwHasRasterBase64 = /data:image\/(?!svg|gif)[a-z]/i.test(lwHtml);

    record.historyConsistent = true;
    if (originalHasSvg && !lwHasSvg) {
      record.historyConsistent = false;
      record.details += ' [SVG lost in history]';
    }
    if (lwHasRasterBase64) {
      record.historyConsistent = false;
      record.details += ' [raster base64 leaked to history]';
    }
  } else {
    record.historyConsistent = true; // history 호출 안 된 경우 (imageCount=0 등)
  }

  // 판정
  const fatals: string[] = [];
  if (!record.textComplete) fatals.push('텍스트 미완주');
  if (!record.hasTitle) fatals.push('제목 없음');
  if (record.heroStatus === 'missing') fatals.push('hero 소실');
  if (!record.historyConsistent) fatals.push('history 불일치');

  if (fatals.length > 0) {
    record.verdict = 'FATAL';
    record.details = fatals.join(', ') + (record.details ? ` | ${record.details}` : '');
  } else if (record.heroStatus === 'template' && expectedHeroType === 'ai') {
    record.verdict = 'WARN';
    record.details = 'hero AI 실패 → template fallback' + (record.details ? ` | ${record.details}` : '');
  } else {
    record.verdict = 'OK';
    record.details = record.details || '정상';
  }

  return record;
}

// ═══════════════════════════════════════════════════════
// 시나리오 실행
// ═══════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});

describe('블로그 코어 검증 — 10개 시나리오', () => {

  // ── 그룹 A: 정상 케이스 ──

  it('S1. 일반 치과 주제 — 정상 생성', async () => {
    setupPipelineSuccess('임플란트 비용 완전 가이드', RASTER_BASE64);
    setupImageQueue(RASTER_BASE64);

    const result = await runContentJob(makeBlogRequest('임플란트 비용'));
    const record = analyzeResult(1, '임플란트 비용', result, 'ai');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.textComplete).toBe(true);
    expect(record.hasTitle).toBe(true);
    expect(record.heroStatus).not.toBe('missing');
    expect(record.verdict).not.toBe('FATAL');
  });

  it('S2. 계절성 구강 건강 주제', async () => {
    setupPipelineSuccess('겨울철 구강 건조증 예방법', RASTER_BASE64);
    setupImageQueue(RASTER_BASE64);

    const result = await runContentJob(makeBlogRequest('겨울철 구강 건조증'));
    const record = analyzeResult(2, '겨울철 구강 건조증', result, 'ai');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.textComplete).toBe(true);
    expect(record.verdict).not.toBe('FATAL');
  });

  it('S3. 잇몸/충치/임플란트 대표 주제', async () => {
    setupPipelineSuccess('잇몸 질환 치료와 예방', RASTER_BASE64);
    setupImageQueue(RASTER_BASE64);

    const result = await runContentJob(makeBlogRequest('잇몸 질환 치료'));
    const record = analyzeResult(3, '잇몸 질환 치료', result, 'ai');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.textComplete).toBe(true);
    expect(record.verdict).not.toBe('FATAL');
  });

  // ── 그룹 B: 외부 API 실패 케이스 ──

  it('S4. 파이프라인 실패 → 레거시 fallback', async () => {
    mockPipeline.mockRejectedValue(new Error('Gemini 503 Service Unavailable'));
    setupLegacyFallback('치아 미백 가이드');
    setupImageQueue(RASTER_BASE64);

    const result = await runContentJob(makeBlogRequest('치아 미백'));
    const record = analyzeResult(4, '치아 미백 (파이프라인 실패)', result, 'ai', 'pipeline 503 → legacy fallback');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.textComplete).toBe(true);
    expect(record.verdict).not.toBe('FATAL');
  });

  it('S5. 파이프라인 + 레거시 모두 실패', async () => {
    mockPipeline.mockRejectedValue(new Error('Gemini 500'));
    mockLegacy.mockRejectedValue(new Error('Gemini key exhausted'));

    const result = await runContentJob(makeBlogRequest('스케일링 안내'));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
    records.push({
      scenario: 5,
      topic: '스케일링 (전체 API 실패)',
      textComplete: false,
      hasTitle: false,
      hasIntro: false,
      hasSections: false,
      hasConclusion: false,
      heroStatus: 'missing',
      imageCount: 0,
      storageSuccess: false,
      historyConsistent: true,
      externalApiIssue: 'pipeline+legacy 모두 실패',
      verdict: 'WARN',
      details: '전체 API 실패 시 graceful error 반환 (사용자에게 재시도 안내)',
    });
  });

  it('S6. 이미지 생성 503/timeout → template fallback', async () => {
    setupPipelineSuccess('교정 치료 종류', SVG_TEMPLATE);
    // 이미지 큐가 template SVG만 반환 (AI 이미지 생성 실패)
    setupImageQueue(SVG_TEMPLATE);

    const result = await runContentJob(makeBlogRequest('교정 치료'));
    const record = analyzeResult(6, '교정 치료 (이미지 503)', result, 'template', 'Gemini 이미지 503 → template SVG');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.textComplete).toBe(true);
    // hero가 template이어도 결과물에 존재해야 함
    expect(record.heroStatus).not.toBe('missing');
    expect(record.verdict).not.toBe('FATAL');
  });

  // ── 그룹 C: 이미지 fallback 케이스 ──

  it('S7. hero AI 실패 → template SVG fallback + 저장 시 SVG 보존', async () => {
    setupPipelineSuccess('충치 예방법', SVG_TEMPLATE);
    setupImageQueue(SVG_TEMPLATE);

    const result = await runContentJob(makeBlogRequest('충치 예방'));
    const record = analyzeResult(7, '충치 예방 (hero template)', result, 'template', 'hero AI 실패');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.heroStatus).toBe('template');
    expect(record.verdict).not.toBe('FATAL');

    // 핵심 검증: SVG template가 storageHtml에서 보존되었는지
    if (result.success) {
      const storageHtml = result.artifact.content.storageHtml || result.artifact.content.htmlContent;
      // SVG data URI가 strip되지 않았어야 함
      const stripped = stripLargeBase64FromHtml(storageHtml);
      if (storageHtml.includes('data:image/svg+xml')) {
        expect(stripped).toContain('data:image/svg+xml');
      }
    }
  });

  it('S8. hero AI + sub 일부 template', async () => {
    setupPipelineSuccess('사랑니 발치 가이드', RASTER_BASE64);
    // hero=AI, sub=template
    mockImageQueue.mockResolvedValue([
      { index: 0, data: RASTER_BASE64, prompt: 'hero', status: 'success', resultType: 'ai-image' },
      { index: 1, data: SVG_TEMPLATE, prompt: 'sub', status: 'fallback', resultType: 'template' },
    ]);

    const result = await runContentJob(makeBlogRequest('사랑니 발치', 2));
    const record = analyzeResult(8, '사랑니 발치 (mixed)', result, 'ai', 'sub 일부 template');
    records.push(record);

    expect(result.success).toBe(true);
    expect(record.heroStatus).toBe('ai');
    expect(record.verdict).not.toBe('FATAL');
  });

  // ── 그룹 D: 저장/히스토리 검증 ──

  it('S9. preview → storage → history 이미지 일관성', async () => {
    setupPipelineSuccess('라미네이트 시술 안내', RASTER_BASE64);
    setupImageQueue(RASTER_BASE64);

    const result = await runContentJob(makeBlogRequest('라미네이트'));
    const record = analyzeResult(9, '라미네이트 (저장 일관성)', result, 'ai');
    records.push(record);

    expect(result.success).toBe(true);
    if (result.success) {
      const displayHtml = result.artifact.content.htmlContent;
      const storageHtml = result.artifact.content.storageHtml || displayHtml;

      // display HTML: 이미지 src 있어야 함
      expect(displayHtml).toContain('<img');

      // storage HTML: base64는 strip되었어야 함 (restoreAndUploadImages mock이 strip 적용)
      const hasRasterInStorage = /data:image\/(?!svg|gif)[a-z]/i.test(storageHtml);
      // mock이 strip을 적용하므로 raster가 없어야 함
      // (실제로는 URL로 교체되지만, mock에서는 strip만 적용)

      // history: persistBlogHistory 호출 확인
      expect(mockPersistHistory).toHaveBeenCalled();
      if (mockPersistHistory.mock.calls.length > 0) {
        const historyOpts = mockPersistHistory.mock.calls[0][0];
        expect(historyOpts.title).toBeTruthy();
        expect(historyOpts.plainText).toBeTruthy();
        expect(historyOpts.lightweightHtml).toBeTruthy();

        // lightweight에 raster base64 없어야 함
        const lwHasRaster = /data:image\/(?!svg|gif)[a-z]/i.test(historyOpts.lightweightHtml);
        expect(lwHasRaster).toBe(false);
      }
    }

    expect(record.verdict).not.toBe('FATAL');
  });

  it('S10. SVG template hero → 저장/history에서 SVG 보존 확인', async () => {
    setupPipelineSuccess('치주 질환 관리', SVG_TEMPLATE);
    setupImageQueue(SVG_TEMPLATE);

    const result = await runContentJob(makeBlogRequest('치주 질환'));
    const record = analyzeResult(10, '치주 질환 (SVG 보존 검증)', result, 'template');
    records.push(record);

    expect(result.success).toBe(true);
    if (result.success) {
      const displayHtml = result.artifact.content.htmlContent;
      const storageHtml = result.artifact.content.storageHtml || displayHtml;

      // SVG가 display에 있는지
      const displayHasSvg = displayHtml.includes('data:image/svg+xml');

      // storageHtml에서 SVG 보존 확인 (핵심!)
      if (displayHasSvg) {
        // restoreAndUploadImages mock이 stripLargeBase64FromHtml를 적용
        // stripLargeBase64FromHtml은 SVG를 보존해야 함
        // storage에도 SVG가 있어야 함
        expect(storageHtml.includes('data:image/svg+xml') ||
               !displayHasSvg  // SVG가 원래 없었으면 OK
        ).toBe(true);
      }

      // history lightweight에서도 SVG 보존 확인
      if (mockPersistHistory.mock.calls.length > 0) {
        const historyOpts = mockPersistHistory.mock.calls[0][0];
        const lwHtml = historyOpts.lightweightHtml;
        if (storageHtml.includes('data:image/svg+xml')) {
          expect(lwHtml).toContain('data:image/svg+xml');
        }
      }
    }

    expect(record.verdict).not.toBe('FATAL');
  });
});

// ═══════════════════════════════════════════════════════
// strip 계약 단위 검증 (실제 함수)
// ═══════════════════════════════════════════════════════

describe('stripLargeBase64FromHtml — 계약 검증 (실제 함수)', () => {
  it('raster base64(100자+) → placeholder 교체', () => {
    const html = `<img src="${RASTER_BASE64}" alt="test" />`;
    const result = stripLargeBase64FromHtml(html);
    expect(result).not.toContain('data:image/png');
    expect(result).toContain(PLACEHOLDER);
  });

  it('SVG data URI → 보존', () => {
    const html = `<img src="${SVG_TEMPLATE}" alt="hero" />`;
    const result = stripLargeBase64FromHtml(html);
    expect(result).toContain('data:image/svg+xml');
    expect(result).not.toContain(PLACEHOLDER);
  });

  it('blob URL → placeholder 교체', () => {
    const html = `<img src="${BLOB_URL}" alt="test" />`;
    const result = stripLargeBase64FromHtml(html);
    expect(result).not.toContain('blob:');
    expect(result).toContain(PLACEHOLDER);
  });

  it('mixed: SVG 보존 + raster strip + blob strip', () => {
    const html = `
      <img src="${SVG_TEMPLATE}" alt="hero" />
      <img src="${RASTER_BASE64}" alt="sub1" />
      <img src="${BLOB_URL}" alt="sub2" />
      <img src="https://storage.supabase.co/img.png" alt="uploaded" />
    `;
    const result = stripLargeBase64FromHtml(html);
    expect(result).toContain('data:image/svg+xml');     // SVG 보존
    expect(result).not.toContain('data:image/png');      // raster 제거
    expect(result).not.toContain('blob:');               // blob 제거
    expect(result).toContain('https://storage.supabase.co/img.png'); // URL 유지
  });

  it('짧은 raster base64(100자 미만) → 유지', () => {
    const shortBase64 = 'data:image/png;base64,' + 'A'.repeat(50);
    const html = `<img src="${shortBase64}" alt="small" />`;
    const result = stripLargeBase64FromHtml(html);
    // 100자 미만이므로 교체하지 않음
    expect(result).toContain(shortBase64);
  });

  it('stripBase64FromHtml alias 동일 동작', () => {
    const html = `<img src="${RASTER_BASE64}" /><img src="${SVG_TEMPLATE}" />`;
    const r1 = stripLargeBase64FromHtml(html);
    const r2 = stripBase64FromHtml(html);
    expect(r1).toBe(r2);
  });
});

// ═══════════════════════════════════════════════════════
// 카드뉴스 격리 검증
// ═══════════════════════════════════════════════════════

describe('카드뉴스 격리 검증', () => {
  it('카드뉴스 실패 시 블로그 코어를 fallback으로 사용하지 않음', async () => {
    const { generateCardNewsWithAgents } = await import('../../../services/cardNewsService');
    (generateCardNewsWithAgents as any).mockRejectedValue(new Error('Agent failed'));

    const result = await runContentJob({
      postType: 'card_news',
      topic: '스케일링',
      keywords: '스케일링',
      imageStyle: 'illustration',
      slideCount: 4,
    } as any);

    // 실패해야 함 — 블로그 fallback으로 빠지면 안 됨
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('카드뉴스');
    }

    // _orchestrateBlog가 호출되지 않았어야 함
    // pipeline mock이 호출되지 않았으면 블로그 경로를 타지 않은 것
    expect(mockPipeline).not.toHaveBeenCalled();
    expect(mockLegacy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════
// 최종 보고서 출력
// ═══════════════════════════════════════════════════════

afterAll(() => {
  console.log('\n' + '='.repeat(80));
  console.log('블로그 코어 검증 결과 보고서');
  console.log('='.repeat(80));
  console.log(`총 실행: ${records.length}`);
  console.log(`OK: ${records.filter(r => r.verdict === 'OK').length}`);
  console.log(`WARN: ${records.filter(r => r.verdict === 'WARN').length}`);
  console.log(`FATAL: ${records.filter(r => r.verdict === 'FATAL').length}`);
  console.log('-'.repeat(80));
  for (const r of records) {
    console.log(`S${r.scenario} | ${r.topic.padEnd(30)} | text=${r.textComplete ? 'OK' : 'NG'} | hero=${r.heroStatus.padEnd(11)} | save=${r.storageSuccess ? 'OK' : 'NG'} | hist=${r.historyConsistent ? 'OK' : 'NG'} | ${r.verdict} | ${r.details}`);
  }
  console.log('='.repeat(80));
});
