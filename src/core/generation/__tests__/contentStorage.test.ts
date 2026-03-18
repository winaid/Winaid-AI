/**
 * contentStorage 어댑터 테스트
 *
 * 목적: 3-layer persistence 어댑터의 변환 계약을 보호한다.
 * - buildSavePayload: ContentArtifact → SaveContentPayload 변환
 * - persistGeneratedPost: 요청 → 저장 파라미터 변환
 * - persistBlogHistory: opts → 함수 호출 인자 매핑
 *
 * mock 전략: 외부 서비스(apiService, postStorageService, contentSimilarityService)만 mock.
 * 변환 로직 자체는 실제 코드를 실행하여 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── imageStorageService mock: static import된 strip 함수 ──
vi.mock('../../../services/image/imageStorageService', () => ({
  stripLargeBase64FromHtml: vi.fn().mockImplementation((html: string) =>
    html.replace(/src="data:image\/(?!svg)[^"]*"/gi, 'src=""').replace(/src="blob:[^"]*"/gi, 'src=""')
  ),
  stripBase64FromHtml: vi.fn().mockImplementation((html: string) =>
    html.replace(/src="data:image\/(?!svg)[^"]*"/gi, 'src=""').replace(/src="blob:[^"]*"/gi, 'src=""')
  ),
}));

// ── Layer 1 mock: apiService ──
vi.mock('../../../services/apiService', () => ({
  saveContentToServer: vi.fn().mockResolvedValue({ success: true, id: 'test-id' }),
}));

// ── Layer 1 mock: postStorageService ──
const mockSaveGeneratedPost = vi.fn().mockResolvedValue({ success: true, postId: 'post-123' });
vi.mock('../../../services/postStorageService', () => ({
  saveGeneratedPost: mockSaveGeneratedPost,
}));

// ── Layer 2 mock: contentSimilarityService ──
const mockSaveBlogHistory = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../services/contentSimilarityService', () => ({
  saveBlogHistory: mockSaveBlogHistory,
}));

import {
  buildSavePayload,
  saveArtifactToServer,
  persistGeneratedPost,
  persistBlogHistory,
} from '../contentStorage';
import type { ContentArtifact } from '../contracts';

// ── 테스트용 fixture ──

function createTestArtifact(overrides?: Partial<ContentArtifact>): ContentArtifact {
  return {
    postType: 'blog',
    createdAt: '2026-03-18T00:00:00.000Z',
    title: '테스트 블로그',
    content: {
      title: '테스트 블로그',
      htmlContent: '<div class="naver-post-container"><p>본문</p></div>',
      imageUrl: '',
      fullHtml: '<div class="naver-post-container"><p>본문</p></div>',
      tags: [],
      postType: 'blog',
      imageStyle: 'illustration' as const,
      cssTheme: 'modern',
      storageHtml: '<div>storage 최적화 HTML</div>',
    } as any,
    category: '치과' as any,
    keywords: '임플란트,치아미백',
    seoTotal: 88,
    aiSmellScore: 5,
    imageMeta: { successCount: 1, failCount: 0, prompts: ['테스트 프롬프트'] },
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════
// buildSavePayload
// ═══════════════════════════════════════

describe('buildSavePayload', () => {
  it('storageHtml 우선 사용', () => {
    const artifact = createTestArtifact();
    const payload = buildSavePayload(artifact);

    expect(payload.content).toBe('<div>storage 최적화 HTML</div>');
    expect(payload.title).toBe('테스트 블로그');
    expect(payload.postType).toBe('blog');
    expect(payload.category).toBe('치과');
  });

  it('storageHtml 없으면 htmlContent에서 base64/blob strip', () => {
    const artifact = createTestArtifact({
      content: {
        title: '테스트',
        htmlContent: '<img src="data:image/png;base64,abc123"/><img src="blob:http://localhost/xyz"/>',
        imageUrl: '',
        fullHtml: '',
        tags: [],
        postType: 'blog',
        imageStyle: 'illustration' as const,
        cssTheme: 'modern',
        // storageHtml 의도적 누락
      } as any,
    });

    const payload = buildSavePayload(artifact);
    expect(payload.content).not.toContain('data:image');
    expect(payload.content).not.toContain('blob:');
    expect(payload.content).toContain('src=""');
  });

  it('metadata에 keywords, seoScore, aiSmellScore 포함', () => {
    const artifact = createTestArtifact();
    const payload = buildSavePayload(artifact);

    expect(payload.metadata).toEqual({
      keywords: '임플란트,치아미백',
      seoScore: 88,
      aiSmellScore: 5,
    });
  });

  it('category 없으면 빈 문자열', () => {
    const artifact = createTestArtifact({ category: undefined });
    const payload = buildSavePayload(artifact);
    expect(payload.category).toBe('');
  });
});

// ═══════════════════════════════════════
// saveArtifactToServer
// ═══════════════════════════════════════

describe('saveArtifactToServer', () => {
  it('buildSavePayload 결과를 saveContentToServer에 전달', async () => {
    const artifact = createTestArtifact();
    const result = await saveArtifactToServer(artifact);

    expect(result.success).toBe(true);

    const { saveContentToServer } = await import('../../../services/apiService');
    expect(saveContentToServer).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '테스트 블로그',
        postType: 'blog',
      }),
    );
  });
});

// ═══════════════════════════════════════
// persistGeneratedPost
// ═══════════════════════════════════════

describe('persistGeneratedPost', () => {
  it('request + opts를 saveGeneratedPost 인자로 변환', async () => {
    await persistGeneratedPost(
      {
        hospitalName: '테스트 병원',
        category: '치과' as any,
        doctorName: '김의사',
        doctorTitle: '원장',
        topic: '임플란트',
        keywords: '임플란트,비용',
        imageStyle: 'photo' as any,
      } as any,
      {
        postType: 'blog',
        title: '임플란트 완전 가이드',
        contentHtml: '<p>내용</p>',
      },
    );

    expect(mockSaveGeneratedPost).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalName: '테스트 병원',
        category: '치과',
        doctorName: '김의사',
        postType: 'blog',
        title: '임플란트 완전 가이드',
        content: '<p>내용</p>',
        keywords: ['임플란트', '비용'],
        topic: '임플란트',
        imageStyle: 'photo',
      }),
    );
  });

  it('카드뉴스: slideCount 포함', async () => {
    await persistGeneratedPost(
      { topic: '스케일링', keywords: '스케일링' } as any,
      { postType: 'card_news', title: '스케일링 카드', contentHtml: '<div/>', slideCount: 6 },
    );

    expect(mockSaveGeneratedPost).toHaveBeenCalledWith(
      expect.objectContaining({
        postType: 'card_news',
        slideCount: 6,
      }),
    );
  });
});

// ═══════════════════════════════════════
// persistBlogHistory
// ═══════════════════════════════════════

describe('persistBlogHistory', () => {
  it('opts를 saveBlogHistory 인자 순서대로 전달', async () => {
    await persistBlogHistory({
      title: '테스트 제목',
      plainText: '테스트 본문 텍스트',
      lightweightHtml: '<p>경량 HTML</p>',
      keywords: ['임플란트', '비용'],
      naverUrl: 'https://blog.naver.com/test',
      category: '치과',
    });

    expect(mockSaveBlogHistory).toHaveBeenCalledWith(
      '테스트 제목',
      '테스트 본문 텍스트',
      '<p>경량 HTML</p>',
      ['임플란트', '비용'],
      'https://blog.naver.com/test',
      '치과',
    );
  });

  it('optional 필드 누락 시 undefined 전달', async () => {
    await persistBlogHistory({
      title: '제목',
      plainText: '본문',
      lightweightHtml: '<p/>',
      keywords: ['키워드'],
    });

    expect(mockSaveBlogHistory).toHaveBeenCalledWith(
      '제목',
      '본문',
      '<p/>',
      ['키워드'],
      undefined,
      undefined,
    );
  });
});
