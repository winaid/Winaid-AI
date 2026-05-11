/**
 * components/card-news/OutlineReview.tsx — C2b Step 2: 구성 안 검토.
 *
 * 받은 SlideOutline[] 을 리스트로 표시 (각 카드: layout 배지 + index + role + titleHint + contentHint).
 * 수정 액션: titleHint·contentHint inline 편집 가능 (호출자가 onChange 로 outline 갱신).
 * 액션 버튼:
 *   - "이전" (back to topic, 확정 대화상자)
 *   - "다음 — 텍스트 생성" (POST /api/card-news/generate-text)
 *
 * v1 에서는 layout 자체 변경 X (LLM 이 결정한 layout 유지). v2 후보.
 */

'use client';

import type { SlideOutline, V1Layout } from '../../lib/cardNewsPrompt';

interface OutlineReviewProps {
  outline: SlideOutline[];
  onOutlineChange: (next: SlideOutline[]) => void;
  isLoading?: boolean;
  error?: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

const LAYOUT_LABEL: Record<V1Layout, string> = {
  cover: '표지',
  info: '정보',
  checklist: '체크리스트',
  comparison: '비교',
  closing: '마무리',
};

const LAYOUT_COLOR: Record<V1Layout, string> = {
  cover: 'bg-indigo-100 text-indigo-700',
  info: 'bg-slate-100 text-slate-700',
  checklist: 'bg-emerald-100 text-emerald-700',
  comparison: 'bg-amber-100 text-amber-700',
  closing: 'bg-rose-100 text-rose-700',
};

export default function OutlineReview({
  outline,
  onOutlineChange,
  isLoading,
  error,
  onBack,
  onSubmit,
}: OutlineReviewProps) {
  const update = (i: number, patch: Partial<SlideOutline>) => {
    onOutlineChange(outline.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-10">
      <header className="space-y-1">
        <div className="text-xs font-semibold text-indigo-600">단계 2 / 4 — 구성 안 검토</div>
        <h2 className="text-xl font-bold text-slate-900">슬라이드 구성을 확인하세요</h2>
        <p className="text-sm text-slate-500">
          제목·내용 안내를 살짝 다듬을 수 있어요. 마음에 들면 "다음" 으로 텍스트를 생성합니다.
        </p>
      </header>

      <ul className="space-y-3">
        {outline.map((o, i) => (
          <li
            key={i}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 w-6 text-center">{o.index}</span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${LAYOUT_COLOR[o.layout] || 'bg-slate-100 text-slate-600'}`}
              >
                {LAYOUT_LABEL[o.layout] || o.layout}
              </span>
              <span className="text-xs text-slate-500">{o.role}</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-500">제목 안내</label>
              <input
                type="text"
                value={o.titleHint}
                onChange={(e) => update(i, { titleHint: e.target.value })}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-500">내용 안내</label>
              <input
                type="text"
                value={o.contentHint}
                onChange={(e) => update(i, { contentHint: e.target.value })}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                maxLength={100}
              />
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className={[
            'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all',
            isLoading
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
          ].join(' ')}
        >
          {isLoading ? '텍스트 생성 중...' : '다음 — 텍스트 생성 (1 크레딧)'}
        </button>
      </div>
    </div>
  );
}
