/**
 * contentStorage 어댑터 테스트
 *
 * 목적: persistence 어댑터의 변환 계약을 보호한다.
 * - persistGeneratedPost: 요청 → 저장 파라미터 변환
 * - persistBlogHistory: opts → 함수 호출 인자 매핑
 *
 * [RETIRED] buildSavePayload / saveArtifactToServer 테스트는
 * Cloudflare KV retire (2024-03)과 함께 제거됨.
 *
 * mock 전략: 외부 서비스(postStorageService, contentSimilarityService)만 mock.
 * 변환 로직 자체는 실제 코드를 실행하여 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  persistGeneratedPost,
  persistBlogHistory,
} from '../contentStorage';
import type { ContentArtifact } from '../contracts';

beforeEach(() => {
  vi.clearAllMocks();
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
