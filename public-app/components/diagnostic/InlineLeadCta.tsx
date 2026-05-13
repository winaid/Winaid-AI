'use client';

import type { LeadSource } from '../../lib/diagnostic/leadTypes';

interface InlineLeadCtaProps {
  /** 종합 점수. 80 이상이면 컴포넌트 자체가 null 을 반환 (압박 없음). */
  overallScore: number;
  /** 자물쇠/하단 배너와 동일 source 재사용 — 새 source 추가 안 함. */
  source?: LeadSource;
  /** 폼 모달 오픈 콜백. 부모가 leadModalSource state 를 set. */
  onOpen: (source: LeadSource) => void;
}

const THRESHOLD = 80;

/**
 * 진단 결과 페이지 중간 인라인 CTA.
 *
 * 노출 조건: overallScore < 80. 80 이상이면 컴포넌트가 null.
 * 위치: 부모(DiagnosticResult) tabs nav 바로 아래에 삽입 — 모든 탭에서
 *       스크롤 0 인 상태에서 즉시 노출되어 하단 배너 (스크롤 끝) 의 사각지대 보강.
 *
 * 톤: indigo 계열로 부드럽게. red/orange 는 압박감이라 회피.
 * source 는 LEAD_SOURCES 기존 3종 중 'bottom-cta' 재사용 (어드민 분포 통계 단순화).
 */
export default function InlineLeadCta({
  overallScore,
  source = 'bottom-cta',
  onOpen,
}: InlineLeadCtaProps) {
  if (!Number.isFinite(overallScore) || overallScore >= THRESHOLD) return null;

  const roundedScore = Math.round(overallScore);
  const gap = Math.max(THRESHOLD - roundedScore, 1);

  return (
    <div
      className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-blue-50 p-4 md:p-5 shadow-sm"
      role="region"
      aria-label="WINAID 무료 상담 안내"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] md:text-sm font-bold text-slate-800">
            현재 진단 점수 <span className="text-indigo-700">{roundedScore}점</span>
            <span className="text-slate-500 font-semibold"> · 목표 {THRESHOLD}점까지 {gap}점 차이</span>
          </p>
          <p className="mt-1 text-[11px] md:text-[12px] text-slate-500 leading-relaxed">
            진단 결과를 바탕으로 마케팅 전문가가 1:1 컨설팅을 드립니다.
            AEO/GEO 최적화 · 블로그 콘텐츠 · 구조화 데이터까지 한 번에.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(source)}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-bold hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
        >
          🎯 무료 상담 받기
        </button>
      </div>
    </div>
  );
}
