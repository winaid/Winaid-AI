'use client';

/**
 * GeoEmptyState — 데이터 없을 때 통일 빈 상태 (GEO-UX-1).
 *
 * 양 앱 lockstep. 8 GEO 섹션 데이터 없을 때 (예: AI 인용 분석 0회) 표시.
 */

import type { ReactNode } from 'react';

export interface GeoEmptyStateProps {
  /** 큰 아이콘 (이모지). */
  icon?: string;
  /** 본문 메시지 — "아직 데이터가 없습니다" 등. */
  message: string;
  /** CTA 버튼 텍스트 (옵션). */
  ctaLabel?: string;
  /** CTA 클릭 핸들러 (옵션). */
  onCta?: () => void;
  /** 보조 설명 (옵션). */
  hint?: ReactNode;
}

export default function GeoEmptyState({ icon = '📭', message, ctaLabel, onCta, hint }: GeoEmptyStateProps) {
  return (
    <div className="text-center py-6 px-4">
      <div className="text-4xl mb-2">{icon}</div>
      <p className="text-[12px] text-slate-700 font-medium mb-1">{message}</p>
      {hint && <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{hint}</div>}
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-3 text-[12px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer font-medium"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
