'use client';

import { useState } from 'react';
import type { SnippetSpec, OrganizationFormInput } from '../../lib/diagnostic/snippets';
import { generateOrganizationSchema } from '../../lib/diagnostic/snippets';

interface Props {
  snippet: SnippetSpec;
}

const TYPE_META: Record<SnippetSpec['type'], { emoji: string; label: string; cls: string }> = {
  html:   { emoji: '🏷️', label: 'HTML 태그',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  header: { emoji: '🛡️', label: '서버 헤더',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  jsonld: { emoji: '📋', label: 'JSON-LD',   cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

export default function HtmlSnippetCard({ snippet }: Props) {
  const meta = TYPE_META[snippet.type];
  const [copied, setCopied] = useState(false);

  // jsonld 폼 상태 — formFields 가 있으면 입력값 보관
  const [formInput, setFormInput] = useState<Record<string, string>>(() => {
    if (!snippet.formFields) return {};
    // 초기 코드에서 name/url 만 추출은 복잡하니, formFields 기반 빈값 시작.
    // 단, snippet.code 가 이미 채워진 초기값을 가지고 있으니 코드 표시는 그대로.
    return Object.fromEntries(snippet.formFields.map((f) => [f.key, '']));
  });

  // jsonld + 사용자 입력 있으면 동적 재생성, 아니면 snippet.code 그대로
  const codeToShow = (() => {
    if (snippet.type !== 'jsonld' || !snippet.formFields) return snippet.code;
    const hasAnyInput = Object.values(formInput).some((v) => v.trim());
    if (!hasAnyInput) return snippet.code;
    return generateOrganizationSchema(formInput as unknown as OrganizationFormInput);
  })();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(codeToShow);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.warn('[snippet] clipboard write 실패', e);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3 flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800 truncate">{snippet.label}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.cls}`}>
              {meta.emoji} {meta.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">📍 {snippet.where}</p>
          {snippet.note && <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">💡 {snippet.note}</p>}
        </div>
      </div>

      {/* JSON-LD 폼 */}
      {snippet.type === 'jsonld' && snippet.formFields && (
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <p className="text-[11px] font-bold text-slate-600 mb-2">📝 입력 (필요한 항목만 채우면 자동 생성)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {snippet.formFields.map((f) => (
              <label key={f.key} className="text-[11px] text-slate-600">
                <span className="block mb-0.5 font-semibold">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </span>
                {f.key === 'sameAs' ? (
                  <textarea
                    value={formInput[f.key] || ''}
                    onChange={(e) => setFormInput((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 font-mono"
                  />
                ) : (
                  <input
                    type="text"
                    value={formInput[f.key] || ''}
                    onChange={(e) => setFormInput((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 코드 블록 */}
      <div className="relative">
        <pre className="px-5 py-4 text-[12px] leading-relaxed text-slate-700 bg-slate-900/[0.03] overflow-x-auto whitespace-pre font-mono">
          <code>{codeToShow}</code>
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className={`absolute top-2 right-2 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
            copied
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          {copied ? '✅ 복사됨' : '📋 복사'}
        </button>
      </div>
    </div>
  );
}
