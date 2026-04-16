'use client';

import { useEffect, useState } from 'react';
import type { ActionItem, ActionExecutor } from '../../lib/diagnostic/types';

interface ActionPlanProps {
  actions: ActionItem[];
}

const IMPACT_CLS: Record<ActionItem['impact'], string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};
const IMPACT_LABEL: Record<ActionItem['impact'], string> = { high: '영향 큼', medium: '영향 중', low: '영향 낮음' };

const DIFF_CLS: Record<ActionItem['difficulty'], string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard: 'bg-red-50 text-red-700 border-red-200',
};
const DIFF_LABEL: Record<ActionItem['difficulty'], string> = { easy: '쉬움', medium: '보통', hard: '어려움' };

const TIME_CLS = 'bg-blue-50 text-blue-700 border-blue-200';

// ── executor 그룹 메타 ──────────────────────────────────────
type GroupKey = 'ai' | 'hybrid' | 'human' | 'other';
const GROUP_META: Record<GroupKey, { emoji: string; title: string; subtitle: string; badgeCls: string; badgeLabel: string }> = {
  ai: {
    emoji: '🤖',
    title: 'AI로 바로 가능',
    subtitle: 'WINAID 도구로 즉시 생성/적용할 수 있는 작업',
    badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    badgeLabel: 'AI',
  },
  hybrid: {
    emoji: '🤝',
    title: 'AI 초안 + 사람 검수·발행',
    subtitle: 'AI 가 초안을 만들고 사람이 검수·업로드해야 완성되는 작업',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeLabel: 'HYBRID',
  },
  human: {
    emoji: '👤',
    title: '사람이 직접 해야 할 것',
    subtitle: '외부 서비스 등록·계약·배포 등 사람 개입 필수',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',
    badgeLabel: 'HUMAN',
  },
  other: {
    emoji: '📎',
    title: '기타',
    subtitle: '실행 주체가 분류되지 않은 항목 (LLM 실패 시 fallback)',
    badgeCls: 'bg-slate-50 text-slate-600 border-slate-200',
    badgeLabel: '기타',
  },
};

function groupKeyOf(executor: ActionExecutor | undefined): GroupKey {
  if (executor === 'ai' || executor === 'hybrid' || executor === 'human') return executor;
  return 'other';
}

const GROUP_ORDER: GroupKey[] = ['ai', 'hybrid', 'human', 'other'];

export default function ActionPlan({ actions }: ActionPlanProps) {
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!selectedAction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAction(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedAction]);

  if (actions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        즉시 조치가 필요한 항목이 없습니다. 전 항목 통과.
      </div>
    );
  }

  // 그룹핑 — 서버 정렬(난이도→영향도→기간)을 각 그룹 내부에서 유지
  const groups: Record<GroupKey, Array<{ a: ActionItem; originalIdx: number }>> = {
    ai: [], hybrid: [], human: [], other: [],
  };
  actions.forEach((a, idx) => {
    groups[groupKeyOf(a.executor)].push({ a, originalIdx: idx });
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <h3 className="text-sm font-bold text-slate-700">
          우선 조치 · 총 {actions.length}개
        </h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          실행 주체별로 분류되었습니다. 난이도 쉬움 · 영향 큼 · 즉시 가능 순. 각 박스를 클릭하면 상세 가이드가 보입니다.
        </p>
      </div>

      {GROUP_ORDER.map((key) => {
        const items = groups[key];
        if (items.length === 0) return null;
        const meta = GROUP_META[key];
        return (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-baseline gap-2">
              <span className="text-lg">{meta.emoji}</span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-700">{meta.title} <span className="text-slate-400 font-normal">· {items.length}</span></h4>
                <p className="text-[11px] text-slate-400 mt-0.5">{meta.subtitle}</p>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map(({ a, originalIdx }) => (
                <li key={originalIdx}>
                  <button
                    type="button"
                    onClick={() => setSelectedAction(a)}
                    aria-haspopup="dialog"
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex-none w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
                        {originalIdx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">{a.action}</p>
                        <p className="text-[11px] text-slate-400 mt-1">분류: {a.category} · 클릭해서 자세히 보기 →</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeCls}`}>
                            {meta.badgeLabel}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${IMPACT_CLS[a.impact]}`}>
                            {IMPACT_LABEL[a.impact]}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${DIFF_CLS[a.difficulty]}`}>
                            난이도 {DIFF_LABEL[a.difficulty]}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TIME_CLS}`}>
                            {a.timeframe}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* ── 상세 가이드 모달 ─────────────────────────────────── */}
      {selectedAction && (() => {
        const a = selectedAction;
        const meta = GROUP_META[groupKeyOf(a.executor)];
        return (
          <>
            {/* backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/40"
              aria-hidden="true"
              onClick={() => setSelectedAction(null)}
            />
            {/* card */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="우선 조치 상세 가이드"
              className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-lg w-[90vw] max-h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-xl"
            >
              <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-800 leading-snug pr-2">
                  {a.action}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedAction(null)}
                  aria-label="닫기"
                  className="flex-none w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xl leading-none transition-colors"
                >
                  ×
                </button>
              </div>

              <div className="px-6 pt-4 pb-2">
                <p className="text-[11px] text-slate-400 mb-2">분류: {a.category}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeCls}`}>
                    {meta.badgeLabel}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${IMPACT_CLS[a.impact]}`}>
                    {IMPACT_LABEL[a.impact]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${DIFF_CLS[a.difficulty]}`}>
                    난이도 {DIFF_LABEL[a.difficulty]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TIME_CLS}`}>
                    {a.timeframe}
                  </span>
                </div>
              </div>

              <div className="px-6 py-4">
                {a.detailedGuide ? (
                  <div className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">
                    {a.detailedGuide}
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    상세 가이드 준비 중입니다.
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedAction(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
