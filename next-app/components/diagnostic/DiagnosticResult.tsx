'use client';

import { useState } from 'react';
import type { DiagnosticResponse } from '../../lib/diagnostic/types';
import ScoreRing from './ScoreRing';
import CategoryCard from './CategoryCard';
import AIVisibilityCard from './AIVisibilityCard';
import ActionPlan from './ActionPlan';

interface DiagnosticResultProps {
  result: DiagnosticResponse;
}

type Tab = 'summary' | 'details' | 'ai' | 'actions';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'summary', label: '종합 진단', emoji: '📊' },
  { id: 'details', label: '항목별 상세', emoji: '🧾' },
  { id: 'ai', label: 'AI 플랫폼별 노출', emoji: '🤖' },
  { id: 'actions', label: '우선 조치', emoji: '🎯' },
];

function scoreHeadline(score: number): string {
  if (score >= 85) return '전반적으로 매우 우수합니다. 소수 개선으로 상위권 유지 가능합니다.';
  if (score >= 70) return '기본기는 탄탄합니다. 몇 가지 보강으로 AI 노출을 크게 끌어올릴 수 있습니다.';
  if (score >= 50) return '중간 수준입니다. 우선 조치 목록부터 순차 적용을 권장합니다.';
  return '개선 여지가 큽니다. 기술 기반과 콘텐츠 구조부터 전면 재정비가 필요합니다.';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch { return iso; }
}

export default function DiagnosticResult({ result }: DiagnosticResultProps) {
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5">
      {/* 히어로 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          <ScoreRing score={result.overallScore} size={180} label="종합 점수" />
          <div className="flex-1 min-w-0 text-center md:text-left">
            <h2 className="text-xl font-black text-slate-800 break-words">{result.siteName}</h2>
            <p className="mt-1 text-[12px] text-slate-400 break-all">{result.url}</p>
            <p className="mt-2 text-[11px] text-slate-400">분석 시각: {formatDate(result.analyzedAt)}</p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">{scoreHeadline(result.overallScore)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                페이지 {result.crawlMeta.pagesAnalyzed}개
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                링크 {result.crawlMeta.totalLinks}개
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                이미지 {result.crawlMeta.totalImages}개
              </span>
              {result.crawlMeta.schemaTypesFound.length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                  스키마 {result.crawlMeta.schemaTypesFound.length}종
                </span>
              )}
              {result.crawlMeta.detectedServices.length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700">
                  시술 {result.crawlMeta.detectedServices.length}개 감지
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg text-[13px] font-bold transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="mr-1">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {/* 탭 1: 종합 */}
      {tab === 'summary' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4">카테고리별 점수</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {result.categories.map((c) => (
                <ScoreRing key={c.id} score={c.score} size={90} label={c.name} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-3">로딩 성능 (Core Web Vitals)</h3>
            {result.performance === null ? (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-6 text-center">
                PageSpeed Insights 를 측정할 수 없었습니다. <span className="text-slate-400">(API 미동작 또는 키 누락)</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <PerfTile label="PSI 점수" value={result.performance.score === null ? '—' : `${result.performance.score}`} suffix="/100" highlight />
                <PerfTile label="FCP" value={fmtMs(result.performance.fcp)} suffix="ms" />
                <PerfTile label="LCP" value={fmtMs(result.performance.lcp)} suffix="ms" />
                <PerfTile label="CLS" value={result.performance.cls === null ? '—' : result.performance.cls.toFixed(3)} />
                <PerfTile label="TBT" value={fmtMs(result.performance.tbt)} suffix="ms" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 탭 2: 항목별 */}
      {tab === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {result.categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      )}

      {/* 탭 3: AI 노출 */}
      {tab === 'ai' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {result.aiVisibility.map((v) => (
            <AIVisibilityCard key={v.platform} visibility={v} />
          ))}
        </div>
      )}

      {/* 탭 4: 우선 조치 */}
      {tab === 'actions' && <ActionPlan actions={result.priorityActions} />}
    </div>
  );
}

function fmtMs(v: number | null): string {
  if (v === null) return '—';
  return String(Math.round(v));
}

function PerfTile({ label, value, suffix, highlight }: { label: string; value: string; suffix?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${highlight ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${highlight ? 'text-blue-700' : 'text-slate-700'}`}>
        {value}
        {suffix && value !== '—' && <span className="text-[10px] font-semibold text-slate-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
