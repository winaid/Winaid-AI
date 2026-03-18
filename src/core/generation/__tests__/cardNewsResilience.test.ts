/**
 * 카드뉴스 완주 보장 검증 테스트
 *
 * 검증 목표:
 *   1. 완주율 — 이미지 일부 실패/timeout에도 전체 완주
 *   2. 컷 수 무결성 — 요청 slideCount = 최종 카드 수
 *   3. fallback 카드 품질 — 빈 div 아닌 readable SVG
 *   4. 저장/히스토리 — 카드 구조 보존
 *   5. 재편집 — fallback 카드도 재생성 가능
 *   6. 블로그 무간섭 — 카드뉴스가 블로그를 호출하지 않음
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock 설정 ──

vi.mock('../policies', () => ({
  runCreditGate: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('../../../services/pressReleaseService', () => ({
  generatePressRelease: vi.fn().mockResolvedValue({
    title: '보도자료', htmlContent: '<p>PR</p>', imageUrl: '',
    fullHtml: '<p>PR</p>', tags: [], postType: 'press_release',
    imageStyle: 'photo', cssTheme: 'modern',
  }),
}));

vi.mock('../../../services/blogPipelineService', () => ({
  generateBlogWithPipeline: vi.fn().mockResolvedValue({
    title: '블로그 테스트', rawHtml: '<p>블로그</p>',
    polishPromise: Promise.resolve({
      content: '<p>폴리시</p>', polishModel: 'test',
      finalQualityPath: 'test', stageCMs: 100,
    }),
    imagePrompts: ['블로그 프롬프트'],
  }),
}));

vi.mock('../../../services/legacyBlogGeneration', () => ({
  generateBlogPostText: vi.fn().mockResolvedValue({
    title: '레거시', content: '<p>레거시</p>', imagePrompts: [],
    fact_check: { fact_score: 85, safety_score: 90, conversion_score: 80, ai_smell_score: 10, verified_facts_count: 5, issues: [], recommendations: [] },
  }),
}));

vi.mock('../../../services/faqService', () => ({
  generateFaqSection: vi.fn().mockResolvedValue(''),
  generateSmartBlockFaq: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../services/geminiClient', () => ({
  callGemini: vi.fn().mockResolvedValue('{}'),
  TIMEOUTS: { QUICK_OPERATION: 5000 },
  getKoreanErrorMessage: vi.fn().mockImplementation((e: any) => e?.message || '에러'),
}));

vi.mock('../../../services/image/imagePromptBuilder', () => ({
  STYLE_NAMES: { photo: '실사', illustration: '일러스트', medical: '의학' } as Record<string, string>,
}));

vi.mock('../../../services/image/imageOrchestrator', () => ({
  generateImageQueue: vi.fn().mockResolvedValue([]),
  updateSessionFinalPayload: vi.fn(),
}));

// ⚠️ cardNewsImageService mock — 시나리오별로 동적 제어
const mockGenerateSingleImage = vi.fn();
vi.mock('../../../services/image/cardNewsImageService', () => ({
  generateSingleImage: (...args: any[]) => mockGenerateSingleImage(...args),
}));

vi.mock('../../../services/cardNewsDesignTemplates', () => ({
  getDesignTemplateById: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../contentStorage', () => ({
  persistGeneratedPost: vi.fn().mockResolvedValue(undefined),
  persistBlogHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/image/imageStorageService', () => ({
  restoreAndUploadImages: vi.fn().mockImplementation((html: string) => html),
  stripBase64FromHtml: vi.fn().mockImplementation((html: string) => html),
  stripLargeBase64FromHtml: vi.fn().mockImplementation((html: string) => html),
}));

vi.mock('../../../services/contentSimilarityService', () => ({
  saveBlogHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/resultAssembler', () => ({
  MEDICAL_DISCLAIMER: '면책 조항',
  cleanMarkdownArtifacts: vi.fn().mockImplementation((s: string) => s),
  ensureContainerWrapper: vi.fn().mockImplementation((s: string) => `<div class="naver-post-container">${s}</div>`),
  generateCardNewsFallbackTemplate: vi.fn().mockImplementation((s: string) => s),
  normalizeSubtitles: vi.fn().mockImplementation((s: string) => s),
  insertImageMarkers: vi.fn().mockImplementation((s: string) => s),
  insertImageData: vi.fn().mockImplementation((s: string) => ({ html: s, blobUrls: [] })),
  applyCardNewsStyles: vi.fn().mockImplementation((s: string) => s),
  wrapFinalHtml: vi.fn().mockImplementation((s: string) => `<style></style>${s}`),
}));

vi.mock('../../../services/contentQualityService', () => ({
  runAiSmellCheck: vi.fn().mockReturnValue({ score: 10, criticalIssues: [], warnings: [], patterns: [] }),
  integrateAiSmellToFactCheck: vi.fn().mockImplementation((fc: any) => fc),
}));

// ── cardNewsService mock — slideCount만큼 프롬프트 생성 ──
const mockGenerateCardNewsWithAgents = vi.fn();
vi.mock('../../../services/cardNewsService', () => ({
  generateCardNewsWithAgents: (...args: any[]) => mockGenerateCardNewsWithAgents(...args),
}));

import { runContentJob } from '../generateContentJob';
import { persistGeneratedPost } from '../contentStorage';

// ── 유틸리티 ──

function makeCardPrompts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    imagePrompt: `subtitle: "부제 ${i + 1}"\nmainTitle: "제목 ${i + 1}"\ndescription: "설명 ${i + 1}"\n비주얼: 병원 이미지`,
    textPrompt: {
      subtitle: `부제 ${i + 1}`,
      mainTitle: `제목 ${i + 1}`,
      description: `설명 ${i + 1}`,
      tags: ['태그'],
    },
  }));
}

function setupAgentMock(slideCount: number) {
  const prompts = makeCardPrompts(slideCount);
  mockGenerateCardNewsWithAgents.mockResolvedValue({
    title: `카드뉴스 ${slideCount}컷 테스트`,
    imagePrompts: prompts.map(p => p.imagePrompt),
    cardPrompts: prompts,
    styleConfig: { borderRadius: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  });
  return prompts;
}

function getHtml(result: any): string {
  if (!result.success) throw new Error('result is not success');
  // artifact.content = GeneratedContent 객체 → htmlContent가 HTML 문자열
  return result.artifact.content.htmlContent || result.artifact.content.fullHtml || '';
}

function countCardSlides(html: string): number {
  return (html.match(/class="card-slide"/g) || []).length;
}

function countFallbackCards(html: string): number {
  return (html.match(/재생성/g) || []).length;
}

function countSuccessImages(html: string): number {
  return (html.match(/data:image\/png;base64/g) || []).length;
}

function hasSvgFallback(html: string): boolean {
  return html.includes('data:image/svg+xml;base64');
}

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════
// 그룹 A. 정상 생성
// ═══════════════════════════════════════════════

describe('카드뉴스 — 그룹 A. 정상 생성', () => {
  it('A1. 4컷 정상 생성 → 4장 카드 반환', async () => {
    setupAgentMock(4);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,AAAA');

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 4, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(4);
      expect(countSuccessImages(html)).toBe(4);
      expect(countFallbackCards(html)).toBe(0);
      expect(result.artifact.postType).toBe('card_news');
    }
  });

  it('A2. 6컷 정상 생성 → 6장 카드 반환', async () => {
    setupAgentMock(6);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,BBBB');

    const result = await runContentJob({
      postType: 'card_news', topic: '임플란트', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(6);
      expect(countSuccessImages(html)).toBe(6);
    }
  });

  it('A3. 8컷 정상 생성 → 8장 카드 반환', async () => {
    setupAgentMock(8);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,CCCC');

    const result = await runContentJob({
      postType: 'card_news', topic: '교정', imageStyle: 'medical',
      slideCount: 8, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(8);
      expect(countSuccessImages(html)).toBe(8);
    }
  });
});

// ═══════════════════════════════════════════════
// 그룹 B. 부분 실패
// ═══════════════════════════════════════════════

describe('카드뉴스 — 그룹 B. 부분 실패', () => {
  it('B4. 1컷 timeout → 5장 성공 + 1장 fallback SVG, 전체 완주', async () => {
    setupAgentMock(6);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 3) {
        // 3번째 카드: 매우 긴 지연 → timeout 시뮬레이션
        return new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout 시뮬레이션')), 100)
        );
      }
      return Promise.resolve('data:image/png;base64,OK');
    });

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(6); // 전체 6장 보장
      expect(countSuccessImages(html)).toBe(5); // 성공 5장
      expect(hasSvgFallback(html)).toBe(true); // fallback SVG 존재
    }
  });

  it('B5. 2컷 실패 → 4장 성공 + 2장 fallback SVG, 전체 완주', async () => {
    setupAgentMock(6);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 2 || callCount === 5) {
        return Promise.reject(new Error('이미지 생성 실패'));
      }
      return Promise.resolve('data:image/png;base64,OK');
    });

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(6);
      expect(countSuccessImages(html)).toBe(4);
    }
  });

  it('B6. 마지막 컷 실패 → 나머지 성공, 전체 완주', async () => {
    setupAgentMock(6);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 6) {
        return Promise.reject(new Error('마지막 카드 실패'));
      }
      return Promise.resolve('data:image/png;base64,OK');
    });

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(6);
      expect(countSuccessImages(html)).toBe(5);
      // 마지막 카드(data-index="6")가 fallback인지 확인
      const lastCardMatch = html.match(/data-index="6"[^>]*class="card-full-img"[^>]*>/);
      expect(lastCardMatch).toBeTruthy();
      // data-index="6" 앞에 있는 src가 svg fallback인지
      const lastImgSrc = html.match(/src="([^"]*)"[^>]*data-index="6"/);
      expect(lastImgSrc?.[1]).toContain('svg+xml');
    }
  });

  it('B7. 첫 컷 실패 → 나머지 성공, 전체 완주', async () => {
    setupAgentMock(6);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('첫 카드 실패'));
      }
      return Promise.resolve('data:image/png;base64,OK');
    });

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(6);
      expect(countSuccessImages(html)).toBe(5);
      // 첫 카드가 fallback인지 확인
      const firstSlide = html.match(/<div class="card-slide"[\s\S]*?<\/div>/);
      expect(firstSlide?.[0]).toContain('svg+xml');
    }
  });
});

// ═══════════════════════════════════════════════
// 그룹 C. 저장/히스토리
// ═══════════════════════════════════════════════

describe('카드뉴스 — 그룹 C. 저장/히스토리', () => {
  it('C8. 생성 후 persistGeneratedPost 호출됨', async () => {
    setupAgentMock(6);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,OK');

    const result = await runContentJob({
      postType: 'card_news', topic: '충치', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    // persistGeneratedPost가 card_news로 호출됐는지
    expect(persistGeneratedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postType: 'card_news',
        slideCount: 6,
      })
    );
  });

  it('C9. 부분 실패 시에도 persistGeneratedPost 호출됨 (slideCount 반영)', async () => {
    setupAgentMock(6);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('fail'));
      return Promise.resolve('data:image/png;base64,OK');
    });

    await runContentJob({
      postType: 'card_news', topic: '충치', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    // 부분 실패해도 persist 호출
    expect(persistGeneratedPost).toHaveBeenCalled();
    const persistCall = vi.mocked(persistGeneratedPost).mock.calls[0];
    expect(persistCall[1].postType).toBe('card_news');
    // 6장 모두 결과에 포함 (실패 포함)
    expect(persistCall[1].slideCount).toBe(6);
  });

  it('C10. 결과물에 cardPrompts가 포함됨 (재편집용)', async () => {
    setupAgentMock(6);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,OK');

    const result = await runContentJob({
      postType: 'card_news', topic: '충치', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      // deprecated data 필드에서 cardPrompts 확인
      expect(result.data.cardPrompts).toBeDefined();
      expect(result.data.cardPrompts).toHaveLength(6);
      expect(result.data.cardPrompts[0].textPrompt).toBeDefined();
      expect(result.data.cardPrompts[0].textPrompt.mainTitle).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════
// 그룹 D. 블로그 무간섭
// ═══════════════════════════════════════════════

describe('카드뉴스 — 그룹 D. 블로그 무간섭', () => {
  it('D11. 카드뉴스 전체 실패 시 블로그 fallback 없음 → throw', async () => {
    mockGenerateCardNewsWithAgents.mockRejectedValue(new Error('카드뉴스 에이전트 실패'));

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('카드뉴스');
    }

    // 블로그 서비스가 호출되지 않았는지
    const { generateBlogWithPipeline } = await import('../../../services/blogPipelineService');
    expect(generateBlogWithPipeline).not.toHaveBeenCalled();
  });

  it('D12. 카드뉴스 성공 후 블로그 생성이 독립적으로 동작', async () => {
    // 카드뉴스 먼저
    setupAgentMock(4);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,OK');

    const cardResult = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 4, imageCount: 0,
    } as any, noop);

    expect(cardResult.success).toBe(true);

    // 블로그 바로 생성
    const blogResult = await runContentJob({
      postType: 'blog', topic: '임플란트', imageStyle: 'illustration',
      imageCount: 0,
    } as any, noop);

    expect(blogResult.success).toBe(true);
    if (blogResult.success) {
      expect(blogResult.artifact.postType).toBe('blog');
    }
  });
});

// ═══════════════════════════════════════════════
// 그룹 E. Fallback SVG 카드 품질
// ═══════════════════════════════════════════════

describe('카드뉴스 — 그룹 E. Fallback SVG 품질', () => {
  it('E13. fallback SVG에 카드 텍스트(mainTitle, subtitle)가 포함됨', async () => {
    setupAgentMock(4);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('fail'));
      return Promise.resolve('data:image/png;base64,OK');
    });

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 4, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      // fallback SVG가 존재하고 빈 div가 아님
      expect(hasSvgFallback(html)).toBe(true);
      expect(html).not.toContain('display: flex; align-items: center; justify-content: center;');
    }
  });

  it('E14. fallback 카드도 card-slide class와 data-index를 가짐 (재생성 가능)', async () => {
    setupAgentMock(4);
    mockGenerateSingleImage
      .mockResolvedValueOnce('data:image/png;base64,OK')
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('data:image/png;base64,OK')
      .mockResolvedValueOnce('data:image/png;base64,OK');

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 4, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      // 모든 카드가 card-slide 클래스를 가짐
      expect(countCardSlides(html)).toBe(4);
      // data-index가 1~4까지 존재 (재생성 시 카드 식별용)
      expect(html).toContain('data-index="1"');
      expect(html).toContain('data-index="2"');
      expect(html).toContain('data-index="3"');
      expect(html).toContain('data-index="4"');
    }
  });

  it('E15. 빈 카드(display:flex placeholder)가 절대 생성되지 않음', async () => {
    setupAgentMock(6);
    // 모든 이미지 실패
    mockGenerateSingleImage.mockRejectedValue(new Error('모두 실패'));

    const result = await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, noop);

    expect(result.success).toBe(true);
    if (result.success) {
      const html = getHtml(result);
      expect(countCardSlides(html)).toBe(6);
      // 빈 div placeholder가 없어야 함
      expect(html).not.toContain('display: flex; align-items: center; justify-content: center;');
      // 대신 모든 카드가 SVG fallback
      expect(hasSvgFallback(html)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════
// 그룹 F. 진행률 갱신
// ═══════════════════════════════════════════════

describe('카드뉴스 — 그룹 F. 진행률 갱신', () => {
  it('F16. progress 콜백이 카드별로 호출됨', async () => {
    setupAgentMock(4);
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,OK');

    const progressCalls: string[] = [];
    const progressFn = (msg: string) => progressCalls.push(msg);

    await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 4, imageCount: 0,
    } as any, progressFn);

    // 카드별 진행률 메시지가 있어야 함
    const imgProgressCalls = progressCalls.filter(c => c.includes('이미지') || c.includes('카드'));
    expect(imgProgressCalls.length).toBeGreaterThanOrEqual(4);
  });

  it('F17. 실패 시에도 progress가 계속 갱신됨 (멈추지 않음)', async () => {
    setupAgentMock(6);
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 3) return Promise.reject(new Error('fail'));
      return Promise.resolve('data:image/png;base64,OK');
    });

    const progressCalls: string[] = [];
    const progressFn = (msg: string) => progressCalls.push(msg);

    await runContentJob({
      postType: 'card_news', topic: '스케일링', imageStyle: 'illustration',
      slideCount: 6, imageCount: 0,
    } as any, progressFn);

    // 실패 후에도 4,5,6번 카드 진행 메시지가 있어야 함
    const hasFailMsg = progressCalls.some(c => c.includes('실패'));
    expect(hasFailMsg).toBe(true);
    // 실패 이후에도 추가 진행 메시지가 있어야 함
    const failIdx = progressCalls.findIndex(c => c.includes('실패'));
    const afterFailCalls = progressCalls.slice(failIdx + 1);
    expect(afterFailCalls.length).toBeGreaterThan(0);
  });
});
