/**
 * 진단 결과 공개 공유 유틸리티
 *
 * - generateShareToken(): 12자 URL-safe base64 토큰 생성
 * - PublicDiagnosticView: 외부 노출용 sanitized 뷰 인터페이스
 * - buildPublicView(): DiagnosticResponse → PublicDiagnosticView 변환
 *   (fail/warning 세부사항, 우선 조치, AI 실측 답변 등 제거)
 */

import { randomBytes } from 'node:crypto';
import type { DiagnosticResponse, AIVisibility } from './types';

export interface PublicTrustBadge {
  label: string;
  categoryId: string;
}

export interface PublicCategoryScore {
  id: string;
  name: string;
  score: number;
  weight: number;
}

export interface PublicAIVisibility {
  platform: AIVisibility['platform'];
  likelihood: AIVisibility['likelihood'];
}

export interface PublicDiagnosticView {
  token: string;
  url: string;
  siteName: string;
  analyzedAt: string;
  overallScore: number;
  heroSummary?: string;
  categories: PublicCategoryScore[];
  trustBadges: PublicTrustBadge[];
  aiVisibility: PublicAIVisibility[];
  crawlMeta: {
    pagesAnalyzed: number;
    totalImages: number;
  };
  detectedCategory?: string;
  detectedRegion?: string;
}

/** 12자 URL-safe base64 토큰 (randomBytes(9) → 72bit) */
export function generateShareToken(): string {
  return randomBytes(9).toString('base64url');
}

/**
 * 내부 DiagnosticResponse → 외부 공개 뷰로 변환.
 * 세부 실패 이유·우선 조치·AI 실측 답변 등 내부 정보는 포함하지 않음.
 */
export function buildPublicView(
  result: DiagnosticResponse,
  token: string,
): PublicDiagnosticView {
  const categories: PublicCategoryScore[] = result.categories.map((c) => ({
    id: c.id,
    name: c.name,
    score: Math.round(c.score),
    weight: c.weight,
  }));

  // score ≥ 70 인 카테고리를 신뢰 배지로 노출
  const trustBadges: PublicTrustBadge[] = result.categories
    .filter((c) => c.score >= 70)
    .map((c) => ({ label: c.name, categoryId: c.id }));

  const aiVisibility: PublicAIVisibility[] = result.aiVisibility.map((v) => ({
    platform: v.platform,
    likelihood: v.likelihood,
  }));

  return {
    token,
    url: result.url,
    siteName: result.siteName,
    analyzedAt: result.analyzedAt,
    overallScore: Math.round(result.overallScore),
    heroSummary: result.heroSummary,
    categories,
    trustBadges,
    aiVisibility,
    crawlMeta: {
      pagesAnalyzed: result.crawlMeta.pagesAnalyzed,
      totalImages: result.crawlMeta.totalImages,
    },
    detectedCategory: result.detectedCategory,
    detectedRegion: result.detectedRegion,
  };
}
