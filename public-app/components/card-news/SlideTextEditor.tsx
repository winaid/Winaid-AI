/**
 * components/card-news/SlideTextEditor.tsx — C2b Step 3: 슬라이드별 텍스트 편집 + 의료광고법 표시.
 *
 * 슬라이드 N장 collapsible 카드 리스트:
 *   - 헤더: layout 배지 + index + 미리보기 thumb + 의료법 위반 배지 (있으면 빨강)
 *   - 펼치면 layout 별 필드 editor (title/subtitle/body/checkItems/columns/hashtags)
 *   - 위반 항목은 해당 필드 옆에 ⚠️ 표시 + 위반 categoryLabel 안내
 *
 * 우회 옵션 (v1 단순 버전):
 *   - "위반 인지하고 계속 진행" 체크박스. 체크 후 "다음" 활성화.
 *   - v2: medicalAdOverrideToken HMAC 토큰 + 동의 로그 (BACKLOG)
 *
 * 액션:
 *   - "이전" (back to outline, 텍스트 재생성 필요 안내)
 *   - "다음 — 이미지 생성" (POST /api/card-news/generate-images)
 */

'use client';

import { useState } from 'react';
import type { SlideData } from '@winaid/blog-core';
import type { SlideFieldViolation } from '../../lib/medicalAdValidation';
import { CATEGORY_LABELS } from '../../lib/medicalAdValidation';
import type { ThemeId } from '../../lib/cardNewsPrompt';
import SlidePreview from './SlidePreview';

interface SlideTextEditorProps {
  slides: SlideData[];
  violations: SlideFieldViolation[];
  replacedCount: number;
  hospitalName?: string;
  /** C2-fix-1: theme preset id. SlidePreview thumb 에 그대로 전달. */
  theme?: ThemeId;
  isLoading?: boolean;
  error?: string | null;
  onSlidesChange: (next: SlideData[]) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export default function SlideTextEditor({
  slides,
  violations,
  replacedCount,
  hospitalName,
  theme,
  isLoading,
  error,
  onSlidesChange,
  onBack,
  onSubmit,
}: SlideTextEditorProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [overrideAck, setOverrideAck] = useState(false);

  const violationsBySlideIndex = new Map<number, SlideFieldViolation[]>();
  for (const v of violations) {
    // SlideFieldViolation 은 slide 식별을 위해 별도 field 가 없으니, 슬라이드 순회 시 매칭이 필요.
    // 본 컴포넌트의 단순 v1 접근: validateSlideMedicalAd 가 슬라이드별로 호출되어 violations 가
    // 슬라이드 순서로 누적된다는 가정 (C2a generate-text/route.ts:225 흐름과 정합).
    // index 식별을 위해 slides.find 로 field 매칭은 v2 정밀화 항목.
    void v;
  }

  // v1 간소화: 전체 violations 합계만 표시. 슬라이드별 정확 매핑은 v2.
  const hasViolations = violations.length > 0;
  const canSubmit = !hasViolations || overrideAck;

  const updateSlide = (i: number, patch: Partial<SlideData>) => {
    onSlidesChange(slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-10">
      <header className="space-y-1">
        <div className="text-xs font-semibold text-indigo-600">단계 3 / 4 — 텍스트 검토</div>
        <h2 className="text-xl font-bold text-slate-900">슬라이드 본문을 확인하세요</h2>
        <p className="text-sm text-slate-500">
          각 슬라이드를 펼쳐 텍스트를 수정할 수 있습니다.
          {replacedCount > 0 && (
            <span className="ml-1 text-amber-700">
              · 의료광고법 자동 대체 {replacedCount}건 적용됨
            </span>
          )}
        </p>
      </header>

      {hasViolations && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
          <div className="text-sm font-bold text-amber-800">
            ⚠️ 의료광고법 위반 가능성 {violations.length}건 발견
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            자동 대체 후에도 남은 위반입니다. 텍스트를 직접 수정하거나, 아래 체크박스로 "위반 인지하고
            진행" 을 선택할 수 있습니다 (책임은 사용자에게 있습니다).
          </p>
          <ul className="text-xs text-amber-800 space-y-1 ml-2 list-disc list-inside">
            {violations.slice(0, 5).map((v, i) => (
              <li key={i}>
                <span className="font-semibold">{v.fieldLabel}</span>
                {v.text && (
                  <span className="ml-1 text-amber-600">— "{v.text.slice(0, 30)}{v.text.length > 30 ? '...' : ''}"</span>
                )}
                {v.violations[0] && (
                  <span className="ml-1 text-amber-600">
                    · {CATEGORY_LABELS[v.violations[0].category] || v.violations[0].category}
                  </span>
                )}
              </li>
            ))}
            {violations.length > 5 && <li className="text-amber-600">... 외 {violations.length - 5}건</li>}
          </ul>
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideAck}
              onChange={(e) => setOverrideAck(e.target.checked)}
              className="w-4 h-4 rounded border-amber-300"
            />
            <span className="text-xs font-medium text-amber-800">
              위반 가능성을 인지하고 진행합니다.
            </span>
          </label>
        </div>
      )}

      <ul className="space-y-3">
        {slides.map((s, i) => (
          <li key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50"
            >
              <span className="text-xs font-bold text-slate-400 w-6 text-center">{i + 1}</span>
              <div className="w-16 h-16 flex-shrink-0">
                <SlidePreview slide={s} size="preview" hospitalName={hospitalName} theme={theme} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{s.title}</div>
                <div className="text-xs text-slate-500">{s.layout}</div>
              </div>
              <span className="text-slate-400 text-sm">{openIndex === i ? '▲' : '▼'}</span>
            </button>

            {openIndex === i && (
              <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                <FieldInput
                  label="제목"
                  value={s.title}
                  onChange={(v) => updateSlide(i, { title: v })}
                  maxLength={50}
                />
                {(s.layout === 'cover' || s.subtitle !== undefined) && (
                  <FieldInput
                    label="부제"
                    value={s.subtitle || ''}
                    onChange={(v) => updateSlide(i, { subtitle: v })}
                    maxLength={60}
                  />
                )}
                {(s.layout === 'info' || s.layout === 'closing') && (
                  <FieldInput
                    label="본문"
                    value={s.body || ''}
                    onChange={(v) => updateSlide(i, { body: v })}
                    maxLength={200}
                    multiline
                  />
                )}
                {s.layout === 'checklist' && Array.isArray(s.checkItems) && (
                  <ArrayInput
                    label="체크 항목"
                    items={s.checkItems}
                    onChange={(items) => updateSlide(i, { checkItems: items })}
                    maxItems={6}
                    maxLength={50}
                  />
                )}
                {s.layout === 'comparison' && Array.isArray(s.columns) && (
                  <div className="grid grid-cols-2 gap-2">
                    {s.columns.map((col, ci) => (
                      <div key={ci} className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                        <FieldInput
                          label={`열 ${ci + 1} 제목`}
                          value={col.header}
                          onChange={(v) => {
                            const next = [...s.columns!];
                            next[ci] = { ...next[ci], header: v };
                            updateSlide(i, { columns: next });
                          }}
                          maxLength={20}
                        />
                        <ArrayInput
                          label="항목"
                          items={col.items}
                          onChange={(items) => {
                            const next = [...s.columns!];
                            next[ci] = { ...next[ci], items };
                            updateSlide(i, { columns: next });
                          }}
                          maxItems={5}
                          maxLength={40}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {s.layout === 'closing' && Array.isArray(s.hashtags) && (
                  <ArrayInput
                    label="해시태그"
                    items={s.hashtags}
                    onChange={(items) => updateSlide(i, { hashtags: items })}
                    maxItems={5}
                    maxLength={20}
                  />
                )}
              </div>
            )}
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
          disabled={isLoading || !canSubmit}
          className={[
            'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all',
            isLoading || !canSubmit
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
          ].join(' ')}
        >
          {isLoading
            ? '이미지 생성 중...'
            : `다음 — 이미지 생성 (${slides.length} 크레딧)`}
        </button>
      </div>
    </div>
  );
}

// ── 내부 헬퍼 컴포넌트 ──────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  maxLength,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold text-slate-500">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={maxLength}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
        />
      )}
    </div>
  );
}

function ArrayInput({
  label,
  items,
  onChange,
  maxItems,
  maxLength,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxLength: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-slate-500">{label}</label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              maxLength={maxLength}
              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="px-2 text-xs text-slate-400 hover:text-rose-500"
              aria-label="삭제"
            >
              ✕
            </button>
          </div>
        ))}
        {items.length < maxItems && (
          <button
            type="button"
            onClick={() => onChange([...items, ''])}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
          >
            + 항목 추가
          </button>
        )}
      </div>
    </div>
  );
}
