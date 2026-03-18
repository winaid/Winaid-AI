/**
 * generateContentJob 분기 계약 테스트
 *
 * 목적: runContentJob의 분기 로직과 에러 핸들링 계약을 보호한다.
 * - postType별 올바른 경로 디스패치
 * - credit gate 차단 시 gateBlocked 반환
 * - 입력 검증 (postType 누락)
 *
 * mock 전략: 최소한으로만. orchestrateFullPost를 통째로 mock하지 않고,
 * policies.ts의 runCreditGate만 mock하여 분기 계약을 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// policies mock — runCreditGate의 반환값만 제어
vi.mock('../policies', () => ({
  runCreditGate: vi.fn(),
}));

// 동적 import로 호출되는 무거운 모듈들을 mock
// orchestrateFullPost가 내부에서 await import()를 사용하므로 모듈 자체를 mock
vi.mock('../../../services/pressReleaseService', () => ({
  generatePressRelease: vi.fn().mockResolvedValue({
    title: '보도자료 테스트',
    htmlContent: '<p>보도자료</p>',
    imageUrl: '',
    fullHtml: '<p>보도자료</p>',
    tags: [],
    postType: 'press_release',
    imageStyle: 'photo',
    cssTheme: 'modern',
  }),
}));

vi.mock('../../../services/blogPipelineService', () => ({
  generateBlogWithPipeline: vi.fn().mockResolvedValue({
    title: '블로그 테스트',
    rawHtml: '<p>블로그 내용</p>',
    polishPromise: Promise.resolve({
      content: '<p>폴리시된 블로그</p>',
      polishModel: 'test',
      finalQualityPath: 'test_path',
      stageCMs: 100,
    }),
    imagePrompts: ['테스트 프롬프트'],
  }),
}));
vi.mock('../../../services/legacyBlogGeneration', () => ({
  generateBlogPostText: vi.fn().mockResolvedValue({
    title: '레거시 블로그',
    content: '<p>레거시 내용</p>',
    imagePrompts: [],
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

vi.mock('../../../services/image/cardNewsImageService', () => ({
  generateSingleImage: vi.fn().mockResolvedValue('data:image/png;base64,test'),
}));

vi.mock('../../../services/cardNewsService', () => ({
  generateCardNewsWithAgents: vi.fn().mockResolvedValue({
    title: '카드뉴스 테스트',
    imagePrompts: ['프롬프트1'],
    cardPrompts: [],
    styleConfig: {},
  }),
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

import { runContentJob } from '../generateContentJob';
import { runCreditGate } from '../policies';

const mockedRunCreditGate = vi.mocked(runCreditGate);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════
// 입력 검증
// ═══════════════════════════════════════

describe('runContentJob — 입력 검증', () => {
  it('postType 누락 시 실패를 반환한다', async () => {
    const result = await runContentJob({
      postType: '' as any,
      topic: '테스트',
    } as any);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('콘텐츠 타입');
    }
  });
});

// ═══════════════════════════════════════
// 크레딧 게이트 분기
// ═══════════════════════════════════════

describe('runContentJob — 크레딧 게이트', () => {
  it('gate blocked → { success: false, gateBlocked: true }', async () => {
    mockedRunCreditGate.mockResolvedValue({
      allowed: false,
      message: '크레딧이 부족합니다.',
    });

    const result = await runContentJob({
      postType: 'blog',
      topic: '임플란트',
    } as any);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.gateBlocked).toBe(true);
      expect(result.error).toContain('크레딧');
    }
  });

  it('gate allowed → 생성 진행', async () => {
    mockedRunCreditGate.mockResolvedValue({ allowed: true });

    const result = await runContentJob({
      postType: 'blog',
      topic: '임플란트',
      imageStyle: 'illustration',
      imageCount: 0,
    } as any);

    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════
// postType별 디스패치
// ═══════════════════════════════════════

describe('runContentJob — postType 분기', () => {
  beforeEach(() => {
    mockedRunCreditGate.mockResolvedValue({ allowed: true });
  });

  it('blog 요청 → ContentArtifact 반환, postType=blog', async () => {
    const result = await runContentJob({
      postType: 'blog',
      topic: '임플란트 비용',
      imageStyle: 'illustration',
      imageCount: 0,
    } as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.postType).toBe('blog');
      expect(result.artifact.title).toBeTruthy();
      expect(result.artifact.content).toBeDefined();
      expect(result.artifact.imageMeta).toBeDefined();
      expect(result.artifact.createdAt).toBeTruthy();
    }
  });

  it('press_release 요청 → pressReleaseService 디스패치', async () => {
    const result = await runContentJob({
      postType: 'press_release',
      topic: '새 의료장비 도입',
      imageStyle: 'photo',
      imageCount: 0,
    } as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.postType).toBe('press_release');
    }

    const { generatePressRelease } = await import('../../../services/pressReleaseService');
    expect(generatePressRelease).toHaveBeenCalled();
  });

  it('card_news 요청 → cardNewsService 디스패치', async () => {
    const result = await runContentJob({
      postType: 'card_news',
      topic: '스케일링 안내',
      imageStyle: 'illustration',
      slideCount: 4,
      imageCount: 0,
    } as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.postType).toBe('card_news');
    }

    const { generateCardNewsWithAgents } = await import('../../../services/cardNewsService');
    expect(generateCardNewsWithAgents).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════
// ContentArtifact 래핑 계약
// ═══════════════════════════════════════

describe('runContentJob — artifact 래핑', () => {
  beforeEach(() => {
    mockedRunCreditGate.mockResolvedValue({ allowed: true });
  });

  it('성공 결과는 ContentArtifact shape를 갖는다', async () => {
    const result = await runContentJob({
      postType: 'blog',
      topic: '치아 미백',
      keywords: '미백,화이트닝',
      category: '치과',
      imageStyle: 'illustration',
      imageCount: 0,
    } as any);

    expect(result.success).toBe(true);
    if (result.success) {
      // artifact 필수 필드 존재 확인
      expect(result.artifact).toHaveProperty('postType');
      expect(result.artifact).toHaveProperty('createdAt');
      expect(result.artifact).toHaveProperty('title');
      expect(result.artifact).toHaveProperty('content');
      expect(result.artifact).toHaveProperty('imageMeta');
      expect(result.artifact).toHaveProperty('warnings');
      expect(result.artifact.imageMeta).toHaveProperty('successCount');
      expect(result.artifact.imageMeta).toHaveProperty('failCount');
      expect(result.artifact.imageMeta).toHaveProperty('prompts');

      // deprecated data 필드도 존재 (호환)
      expect(result.data).toBeDefined();
    }
  });
});
