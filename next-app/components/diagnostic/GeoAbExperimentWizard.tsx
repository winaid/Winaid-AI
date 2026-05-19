'use client';

/**
 * GeoAbExperimentWizard — GEO-13 새 실험 생성 마법사.
 *
 * 입력: topic + variants 2~4 + queries + our_domains.
 * createExperiment 호출 → 닫기 + 부모 list refresh.
 */

import { useState } from 'react';

interface VariantDraft {
  variant_name: string;
  hook_type?: 'question' | 'scene' | 'statistic' | 'number_question' | 'mystery';
  faq_block?: boolean;
  list_style?: 'prose' | 'light_list' | 'numbered';
}

interface Props {
  hospitalName: string;
  diagnosticUrl: string;
  onClose: () => void;
  onCreated: () => void;
}

const DEFAULT_VARIANTS: VariantDraft[] = [
  { variant_name: 'A', hook_type: 'question', faq_block: true, list_style: 'prose' },
  { variant_name: 'B', hook_type: 'statistic', faq_block: false, list_style: 'light_list' },
];

const HOOK_OPTIONS: Array<{ value: NonNullable<VariantDraft['hook_type']>; label: string }> = [
  { value: 'question', label: '질문형' },
  { value: 'scene', label: '장면 묘사' },
  { value: 'statistic', label: '통계 갭' },
  { value: 'number_question', label: '숫자+질문' },
  { value: 'mystery', label: '미스터리 강조' },
];

const LIST_STYLE_OPTIONS: Array<{ value: NonNullable<VariantDraft['list_style']>; label: string }> = [
  { value: 'prose', label: '단락 서술 (prose)' },
  { value: 'light_list', label: '가벼운 list (3+ 나열)' },
  { value: 'numbered', label: '번호 매김 (단계)' },
];

export default function GeoAbExperimentWizard({ hospitalName, diagnosticUrl, onClose, onCreated }: Props) {
  const [topic, setTopic] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [dimension, setDimension] = useState('hook_type');
  const [queriesText, setQueriesText] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>(DEFAULT_VARIANTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateVariant = (idx: number, patch: Partial<VariantDraft>) => {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const addVariant = () => {
    if (variants.length >= 4) return;
    const nextName = String.fromCharCode('A'.charCodeAt(0) + variants.length);
    setVariants((prev) => [...prev, { variant_name: nextName, hook_type: 'question', faq_block: false, list_style: 'prose' }]);
  };

  const removeVariant = (idx: number) => {
    if (variants.length <= 2) return;
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setError(null);
    if (!topic.trim()) {
      setError('topic 필수');
      return;
    }
    if (variants.length < 2 || variants.length > 4) {
      setError('variants 2~4개');
      return;
    }
    const queries = queriesText
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const body = {
        hospital_name: hospitalName,
        topic: topic.trim(),
        hypothesis: hypothesis.trim() || undefined,
        hypothesis_dimension: dimension,
        queries,
        our_domains: diagnosticUrl ? [new URL(diagnosticUrl.startsWith('http') ? diagnosticUrl : `https://${diagnosticUrl}`).hostname] : [],
        variants: variants.map((v) => ({
          variant_name: v.variant_name,
          format_config: {
            hook_type: v.hook_type,
            faq_block: v.faq_block,
            list_style: v.list_style,
          },
        })),
        baseReq: {
          category: '치과',
          keywords: topic.trim(),
          tone: '친절',
          audienceMode: '환자용(친절/공감)',
          persona: '의사',
          imageStyle: 'photo',
          postType: 'blog',
        },
      };
      const res = await fetch('/api/geo/ab/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-base font-bold text-slate-800">새 A/B 실험 만들기</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">주제 (topic) *</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 임플란트 비용"
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">가설 차원 (dimension)</label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="hook_type">hook_type</option>
                <option value="faq_block">faq_block</option>
                <option value="list_style">list_style</option>
                <option value="mixed">mixed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">가설 (선택)</label>
              <input
                type="text"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="질문형 hook 이 인용률 더 높을 것"
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">측정 쿼리 (1줄에 1개)</label>
            <textarea
              value={queriesText}
              onChange={(e) => setQueriesText(e.target.value)}
              rows={3}
              placeholder={'임플란트 비용\n임플란트 가격\n임플란트 시술비'}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <p className="text-[10px] text-slate-400 mt-1">4주간 cron 이 본 쿼리로 ChatGPT/Gemini 답변 인용 측정</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Variants ({variants.length}/4)</label>
              <button
                type="button"
                onClick={addVariant}
                disabled={variants.length >= 4}
                className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                + variant
              </button>
            </div>

            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="border border-slate-200 rounded-md p-3 space-y-2 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Variant {v.variant_name}</span>
                    </div>
                    {variants.length > 2 && (
                      <button onClick={() => removeVariant(i)} className="text-[10px] text-rose-500 hover:text-rose-700">제거</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Hook 유형</label>
                      <select
                        value={v.hook_type}
                        onChange={(e) => updateVariant(i, { hook_type: e.target.value as NonNullable<VariantDraft['hook_type']> })}
                        className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {HOOK_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">List 스타일</label>
                      <select
                        value={v.list_style}
                        onChange={(e) => updateVariant(i, { list_style: e.target.value as NonNullable<VariantDraft['list_style']> })}
                        className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {LIST_STYLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!v.faq_block}
                          onChange={(e) => updateVariant(i, { faq_block: e.target.checked })}
                          className="accent-indigo-500"
                        />
                        FAQ 블록
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{error}</p>}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50">취소</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="text-xs px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-60"
          >
            {submitting ? '생성 중…' : '실험 만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}
