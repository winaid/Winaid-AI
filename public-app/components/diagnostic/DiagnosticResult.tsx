'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  DiagnosticResponse,
  AIPlatform,
  MeasurementData,
  RefreshNarrativeResponse,
  HistoryEntry,
  GapAnalysis,
} from '../../lib/diagnostic/types';
import ScoreRing from './ScoreRing';
import CategoryCard from './CategoryCard';
import AIVisibilityCard from './AIVisibilityCard';
import ActionPlan from './ActionPlan';

interface DiagnosticResultProps {
  result: DiagnosticResponse;
  /** C+B 강화안: 해설 갱신 시 부모의 result state 를 덮어쓰기 위한 setter */
  onResultUpdate?: (updated: DiagnosticResponse) => void;
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

export default function DiagnosticResult({ result, onResultUpdate }: DiagnosticResultProps) {
  const [tab, setTab] = useState<Tab>('summary');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!result?.url) return;
    fetch(`/api/diagnostic/history?url=${encodeURIComponent(result.url)}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  }, [result?.url]);

  // ── C+B 강화안: 실측 결과 수집 + 해설 갱신 ──
  const [measurementResults, setMeasurementResults] = useState<Partial<Record<AIPlatform, MeasurementData>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);

  // Tier 3-B: 경쟁사 GAP 분석
  const [gapResult, setGapResult] = useState<GapAnalysis | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [competitorUrl, setCompetitorUrl] = useState('');

  const handleMeasurementDone = useCallback((platform: AIPlatform, data: MeasurementData) => {
    setMeasurementResults((prev) => ({ ...prev, [platform]: data }));
  }, []);

  const handleRefreshNarrative = useCallback(async () => {
    if (refreshing || !onResultUpdate) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/diagnostic/refresh-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosticResult: result, measurements: measurementResults }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RefreshNarrativeResponse;
      onResultUpdate({
        ...result,
        heroSummary: data.heroSummary,
        aiNarratives: data.aiNarratives,
        aiVisibility: data.aiVisibility,
        ...(data.priorityActions ? { priorityActions: data.priorityActions } : {}),
      });
      setRefreshDone(true);
    } catch (e) {
      console.warn('[refresh-narrative]', e);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, result, measurementResults, onResultUpdate]);

  // Tier 3-B: 실측 topResultUrls 에서 경쟁사 URL 자동 채움
  const topUrlCandidates = Object.values(measurementResults)
    .flatMap((m) => m.topResultUrls ?? [])
    .filter((u) => u && !u.includes(result.url));

  useEffect(() => {
    if (topUrlCandidates.length > 0 && !competitorUrl) {
      setCompetitorUrl(topUrlCandidates[0]);
    }
  }, [topUrlCandidates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGapAnalysis = useCallback(async () => {
    if (gapLoading || !competitorUrl.trim()) return;
    setGapLoading(true);
    setGapResult(null);
    try {
      const res = await fetch('/api/diagnostic/competitor-gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfResult: result, competitorUrl: competitorUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }
      setGapResult((await res.json()) as GapAnalysis);
    } catch (e) {
      console.warn('[gap]', e);
    } finally {
      setGapLoading(false);
    }
  }, [gapLoading, competitorUrl, result]);

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

      {/* 📈 점수 추이 — 히스토리 2건 이상일 때만 표시 */}
      {history.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-[13px] font-bold text-slate-600 mb-3">📈 점수 추이</h3>
          <div className="flex items-end gap-2 h-16">
            {history.map((h, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[11px] font-bold text-slate-700">{h.overall_score}</span>
                <div
                  className="w-full rounded-t bg-indigo-400 min-h-[4px]"
                  style={{ height: `${(h.overall_score / 100) * 48}px` }}
                />
                <span className="text-[9px] text-slate-400">
                  {new Date(h.analyzed_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <div key={c.id} className="flex flex-col items-center">
                  <ScoreRing score={c.score} size={90} label={c.name} />
                  {c.score < 50 && (
                    <p className="mt-1 text-[10px] text-indigo-500 cursor-pointer hover:underline text-center"
                       onClick={() => window.open('https://winaid.co.kr/', '_blank')}>
                      💡 개선이 필요하면 WINAID에 맡겨보세요
                    </p>
                  )}
                </div>
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
      {/*       실측은 각 카드가 자체적으로 /api/diagnostic/stream 소비 (단계 S-B). */}
      {tab === 'ai' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {result.aiVisibility.map((v) => (
              <AIVisibilityCard
                key={v.platform}
                visibility={v}
                siteName={result.siteName}
                selfUrl={result.url}
                onMeasurementDone={handleMeasurementDone}
              />
            ))}
          </div>

          {/* C+B 강화안: "🔄 AI 해설 갱신" 버튼 — 양 플랫폼 실측 완료 후 활성화 */}
          {onResultUpdate && (
            <div className="mt-5 flex flex-col items-center gap-2 max-w-md mx-auto">
              {(() => {
                const bothDone = !!(measurementResults.ChatGPT && measurementResults.Gemini);
                if (refreshDone) {
                  return (
                    <div className="w-full text-center px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold">
                      ✅ 실측 결과가 반영된 해설로 갱신되었어요
                    </div>
                  );
                }
                return (
                  <>
                    <button
                      type="button"
                      disabled={!bothDone || refreshing}
                      onClick={handleRefreshNarrative}
                      className={`w-full px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                        bothDone && !refreshing
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {refreshing ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          실측 결과를 반영한 해설 생성 중… 약 30~60초
                        </span>
                      ) : (
                        '🔄 AI 해설 갱신'
                      )}
                    </button>
                    {!bothDone && (
                      <p className="text-[11px] text-slate-400">
                        두 플랫폼(ChatGPT · Gemini) 모두 실측 완료 후 갱신할 수 있어요
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Tier 3-B: 경쟁사 GAP 분석 */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm max-w-4xl mx-auto">
            <h3 className="text-sm font-bold text-slate-700 mb-2">🏆 경쟁사 GAP 분석</h3>
            <p className="text-[12px] text-slate-500 mb-3">
              AI 추천 1위 병원과 비교해서 약점·강점을 분석합니다.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="url"
                value={competitorUrl}
                onChange={(e) => setCompetitorUrl(e.target.value)}
                placeholder="경쟁사 홈페이지 URL"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={handleGapAnalysis}
                disabled={!competitorUrl.trim() || gapLoading}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
                  competitorUrl.trim() && !gapLoading
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {gapLoading ? '분석 중…' : '🔍 비교 분석'}
              </button>
            </div>
            {topUrlCandidates.length > 0 && !gapResult && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-[11px] text-slate-400">AI 추천 병원:</span>
                {topUrlCandidates.slice(0, 3).map((u) => (
                  <button key={u} type="button" onClick={() => setCompetitorUrl(u)}
                    className="px-2 py-0.5 rounded-full text-[11px] border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors truncate max-w-[200px]">
                    {(() => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } })()}
                  </button>
                ))}
              </div>
            )}
            {gapResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-4 py-3 bg-slate-50 rounded-xl">
                  <div className="text-center">
                    <p className="text-[11px] text-slate-500">내 병원</p>
                    <p className="text-2xl font-black text-slate-700">{Math.round(result.overallScore)}</p>
                  </div>
                  <span className="text-slate-300 text-lg">vs</span>
                  <div className="text-center">
                    <p className="text-[11px] text-slate-500">경쟁사</p>
                    <p className="text-2xl font-black text-slate-700">{gapResult.competitor.overallScore}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-slate-500">차이</p>
                    <p className={`text-lg font-black ${gapResult.gap.overallDiff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {gapResult.gap.overallDiff > 0 ? '+' : ''}{gapResult.gap.overallDiff}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {gapResult.gap.categoryDiffs.map((d) => (
                    <div key={d.categoryId} className="flex items-center gap-2 text-[12px]">
                      <span className="w-24 text-slate-600 truncate">{d.categoryName}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5"><div className="bg-indigo-400 rounded-full h-2.5" style={{ width: `${d.selfScore}%` }} /></div>
                      <span className="w-6 text-right font-bold text-slate-700">{d.selfScore}</span>
                      <span className="text-slate-300">|</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5"><div className="bg-amber-400 rounded-full h-2.5" style={{ width: `${d.competitorScore}%` }} /></div>
                      <span className="w-6 text-right font-bold text-slate-700">{d.competitorScore}</span>
                      <span className={`w-8 text-right text-[11px] font-bold ${d.diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {d.diff > 0 ? '+' : ''}{d.diff}
                      </span>
                    </div>
                  ))}
                  <div className="flex gap-3 text-[10px] text-slate-400 mt-1"><span>🟣 내 병원</span><span>🟡 경쟁사</span></div>
                </div>
                {gapResult.gap.weakerItems.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-red-500 mb-1">⚠ 경쟁사 대비 약점</p>
                    <div className="flex flex-wrap gap-1">
                      {gapResult.gap.weakerItems.map((item) => (
                        <span key={item} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] border border-red-100">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {gapResult.gap.strongerItems.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-emerald-600 mb-1">✅ 경쟁사 대비 강점</p>
                    <div className="flex flex-wrap gap-1">
                      {gapResult.gap.strongerItems.map((item) => (
                        <span key={item} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[11px] border border-emerald-100">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {gapResult.narrative && (
                  <div className="bg-indigo-50 rounded-xl p-4 text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
                    {gapResult.narrative}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 탭 4: 우선 조치 */}
      {tab === 'actions' && <ActionPlan actions={result.priorityActions} />}

      {/* CTA — WINAID 대행 문의 */}
      <div className="mt-8 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 p-8 text-white shadow-lg">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-black mb-3">
            AI 검색에 우리 병원이 노출되게 하고 싶으신가요?
          </h2>
          <p className="text-indigo-100 text-sm leading-relaxed mb-2">
            ChatGPT, Gemini에서 &quot;○○ 치과 추천&quot;을 검색하면
            <strong className="text-white"> 우리 병원이 1위로 뜨게</strong> 만들어 드립니다.
          </p>
          <p className="text-indigo-200 text-[13px] mb-6">
            AEO/GEO 최적화 · 블로그 콘텐츠 · 구조화 데이터 · 검색 노출 전략까지 원스톱 대행
          </p>

          <a
            href="https://winaid.co.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-8 py-3 bg-white text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-md"
          >
            📞 무료 상담 신청하기
          </a>

          <div className="mt-6 flex flex-wrap justify-center gap-4 text-[12px] text-indigo-200">
            <span>✅ 진단 결과 기반 맞춤 전략</span>
            <span>✅ AI 검색 1위 노출 보장형</span>
            <span>✅ 의료광고법 100% 준수</span>
          </div>
        </div>
      </div>
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
