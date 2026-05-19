'use client';

/**
 * GeoActionDashboard — "오늘 우선 액션 3가지" 대시보드 (GEO-UX-1).
 *
 * 8 GEO 섹션 결과 → priority signal 추출 → 최우선 3 액션 카드 grid (3열 데스크탑 / 1열 모바일).
 * 각 카드 클릭 시 blog 빌더 deeplink 또는 해당 GEO 섹션으로 스크롤.
 *
 * 위치: DiagnosticResult.tsx 의 8 GEO 섹션 위.
 * 양 앱 lockstep — public-app / next-app 같은 파일.
 */

import { useMemo } from 'react';
import type { PriorityAction, AggregateInputs } from '@winaid/blog-core';
import { aggregateTop3Actions } from '@winaid/blog-core';
import { IMPACT_BADGE, GEO_CARD } from './geo-design-tokens';

export interface GeoActionDashboardProps {
  inputs: AggregateInputs;
}

const SOURCE_ICON: Record<PriorityAction['source_kind'], string> = {
  medical_law_violation: '⚠️',
  missing_naver_channel: '🇰🇷',
  eeat_weakness: '⭐',
  competitor_new_content: '🚨',
  sentiment_weakness: '💭',
  low_naver_citation: '🇰🇷',
};

const IMPACT_LABEL: Record<PriorityAction['impact'], string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

function ActionCard({ action, idx }: { action: PriorityAction; idx: number }) {
  const inner = (
    <>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-indigo-600">{idx + 1}</span>
          <span className="text-2xl">{SOURCE_ICON[action.source_kind]}</span>
        </div>
        <span className={'inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ' + IMPACT_BADGE[action.impact]}>
          {IMPACT_LABEL[action.impact]}
        </span>
      </div>
      <h4 className="text-[13px] font-bold text-slate-800 mb-1 leading-snug">{action.title}</h4>
      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">{action.reason}</p>
      <div className="text-[12px] font-medium text-indigo-600">
        {action.href ? '✨ 지금 만들기 →' : '아래 섹션에서 확인 →'}
      </div>
    </>
  );

  if (action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className={GEO_CARD.interactive + ' block no-underline'}
      >
        {inner}
      </a>
    );
  }
  return <div className={GEO_CARD.base}>{inner}</div>;
}

export default function GeoActionDashboard({ inputs }: GeoActionDashboardProps) {
  const actions = useMemo(() => aggregateTop3Actions(inputs), [inputs]);

  if (actions.length === 0) {
    return (
      <div className={GEO_CARD.base + ' bg-slate-50'}>
        <h3 className="text-sm font-bold text-slate-700 mb-1">📋 오늘 우선 액션</h3>
        <p className="text-[11px] text-slate-500">
          아직 분석 데이터가 부족합니다. 아래 섹션에서 AI 인용 분석을 먼저 실행하세요 (🔍 AI 가 우리를 어디서 인용하나).
        </p>
      </div>
    );
  }

  return (
    <div className={GEO_CARD.base + ' bg-gradient-to-br from-indigo-50/50 to-white'}>
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-800">📋 오늘 우선 액션 {actions.length}가지</h3>
        <p className="text-[11px] text-slate-500 mt-1">
          전체 진단 결과를 자동으로 분석한 최우선 액션. 카드 클릭 시 콘텐츠 초안이 자동 prefill 됩니다.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {actions.map((action, idx) => (
          <ActionCard key={`${action.source_kind}-${action.source_id || idx}`} action={action} idx={idx} />
        ))}
      </div>
    </div>
  );
}
