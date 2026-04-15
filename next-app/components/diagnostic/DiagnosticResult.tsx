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
  return '개선 여지가 큽니다. 기술 기반과 콘텐츠 구조부터 순차 보강이 필요합니다.';
}

// ── PSI 해석 (규칙 기반) ───────────────────────────────────
type Band = 'good' | 'warn' | 'bad';
function bandPsi(score: number | null): Band | 'unknown' {
  if (score === null) return 'unknown';
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}
function bandMs(v: number | null, good: number, warn: number): Band | 'unknown' {
  if (v === null) return 'unknown';
  if (v <= good) return 'good';
  if (v <= warn) return 'warn';
  return 'bad';
}
function bandCls(v: number | null): Band | 'unknown' {
  if (v === null) return 'unknown';
  if (v <= 0.1) return 'good';
  if (v <= 0.25) return 'warn';
  return 'bad';
}
function badgeFor(b: Band | 'unknown'): { emoji: string; label: string; color: string } {
  switch (b) {
    case 'good': return { emoji: '🟢', label: '양호', color: 'text-emerald-600 bg-emerald-50' };
    case 'warn': return { emoji: '🟡', label: '주의', color: 'text-amber-600 bg-amber-50' };
    case 'bad':  return { emoji: '🔴', label: '미흡', color: 'text-red-600 bg-red-50' };
    default:     return { emoji: '⚪', label: '측정X', color: 'text-slate-400 bg-slate-100' };
  }
}

function psiInterpretation(score: number | null, lcp: number | null): string {
  if (score === null) return '';
  if (score < 50 && lcp !== null && lcp > 10000) return '로딩이 매우 느려 모바일 환자 이탈 위험이 큽니다.';
  if (score < 50) return '로딩 성능이 검색 노출에 불리한 수준입니다.';
  if (score < 90) return '로딩 속도 개선 여지가 있습니다.';
  return '로딩 성능은 양호합니다.';
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
            {result.siteSummary && (
              <p className="mt-2 text-[12px] text-slate-500 leading-relaxed italic">{result.siteSummary}</p>
            )}
            <p className="mt-2 text-[11px] text-slate-400">분석 시각: {formatDate(result.analyzedAt)}</p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {result.heroSummary || scoreHeadline(result.overallScore)}
            </p>
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
              <div className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-5 space-y-1.5">
                <p className="font-semibold">PageSpeed Insights 측정 결과를 받지 못했습니다.</p>
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  · 서버 환경변수 <code className="px-1 py-0.5 rounded bg-white text-slate-700 text-[11px]">PAGESPEED_API_KEY</code> 가 설정되어 있는지 확인해주세요
                  (Google 정책상 무키 호출은 일일 쿼터가 0입니다).<br />
                  · 키가 있는데도 실패하면 Google Cloud Console 에서 <em>PageSpeed Insights API</em> 가
                  활성화되어 있는지 확인하세요.<br />
                  · 측정 시간이 40초를 넘어가면 서버 로그(<code className="px-1 py-0.5 rounded bg-white text-slate-700 text-[11px]">[psi]</code>)에 사유가 기록됩니다.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <PerfTile
                    label="PSI 점수"
                    value={result.performance.score === null ? '—' : `${result.performance.score}`}
                    suffix="/100"
                    highlight
                    band={bandPsi(result.performance.score)}
                  />
                  <PerfTile label="FCP" value={fmtMs(result.performance.fcp)} suffix="ms" band={bandMs(result.performance.fcp, 1800, 3000)} />
                  <PerfTile label="LCP" value={fmtMs(result.performance.lcp)} suffix="ms" band={bandMs(result.performance.lcp, 2500, 4000)} />
                  <PerfTile label="CLS" value={result.performance.cls === null ? '—' : result.performance.cls.toFixed(3)} band={bandCls(result.performance.cls)} />
                  <PerfTile label="TBT" value={fmtMs(result.performance.tbt)} suffix="ms" band={bandMs(result.performance.tbt, 200, 600)} />
                </div>
                {psiInterpretation(result.performance.score, result.performance.lcp) && (
                  <p className="mt-3 text-[12px] text-slate-500 leading-relaxed">
                    {psiInterpretation(result.performance.score, result.performance.lcp)}
                  </p>
                )}
              </>
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

      {/* 탭 3: AI 노출 — 2개 플랫폼(ChatGPT + Gemini) 2열 1행 레이아웃 */}
      {tab === 'ai' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
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

function PerfTile({ label, value, suffix, highlight, band }: { label: string; value: string; suffix?: string; highlight?: boolean; band?: Band | 'unknown' }) {
  const badge = band ? badgeFor(band) : null;
  return (
    <div className={`rounded-xl p-3 border ${highlight ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        {badge && (
          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${badge.color}`} aria-label={badge.label}>
            {badge.emoji}
          </span>
        )}
      </div>
      <p className={`mt-1 text-lg font-black ${highlight ? 'text-blue-700' : 'text-slate-700'}`}>
        {value}
        {suffix && value !== '—' && <span className="text-[10px] font-semibold text-slate-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
