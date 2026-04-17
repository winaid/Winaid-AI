/**
 * AEO/GEO 경쟁사 GAP 분석 — 카테고리·항목 레벨 비교 (Tier 3-B).
 *
 * 서버 route 에서 경쟁사 경량 진단 후 이 함수로 본인과 비교.
 * UI 가 비교 바 차트 + 약점/강점 태그로 렌더.
 */

import type { DiagnosticResponse, CategoryScore, CategoryDiff } from './types';

export function calculateGap(
  self: DiagnosticResponse,
  competitor: { overallScore: number; categories: CategoryScore[] },
): {
  overallDiff: number;
  categoryDiffs: CategoryDiff[];
  weakerItems: string[];
  strongerItems: string[];
} {
  const overallDiff = Math.round(competitor.overallScore - self.overallScore);

  const categoryDiffs: CategoryDiff[] = self.categories.map((sc) => {
    const cc = competitor.categories.find((c) => c.id === sc.id);
    return {
      categoryId: sc.id,
      categoryName: sc.name,
      selfScore: Math.round(sc.score),
      competitorScore: cc ? Math.round(cc.score) : 0,
      diff: cc ? Math.round(cc.score - sc.score) : 0,
    };
  });

  const weakerItems: string[] = [];
  const strongerItems: string[] = [];

  for (const sc of self.categories) {
    const cc = competitor.categories.find((c) => c.id === sc.id);
    if (!cc) continue;
    for (const si of sc.items) {
      const ci = cc.items.find((i) => i.label === si.label);
      if (!ci) continue;
      if ((si.status === 'fail' || si.status === 'warning') && ci.status === 'pass') {
        weakerItems.push(si.label);
      }
      if (si.status === 'pass' && (ci.status === 'fail' || ci.status === 'warning')) {
        strongerItems.push(si.label);
      }
    }
  }

  return { overallDiff, categoryDiffs, weakerItems, strongerItems };
}
