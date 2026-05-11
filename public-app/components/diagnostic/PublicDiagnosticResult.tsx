'use client';

import React from 'react';
import ScoreRing from './ScoreRing';
import type { PublicDiagnosticView } from '../../lib/diagnostic/publicShare';

interface Props {
  view: PublicDiagnosticView;
}

function scoreHeadline(score: number): string {
  if (score >= 85) return '전반적으로 매우 우수합니다. AI 검색에 잘 노출될 가능성이 높습니다.';
  if (score >= 70) return '기본기는 탄탄합니다. 몇 가지 보강으로 AI 노출을 더 끌어올릴 수 있습니다.';
  if (score >= 50) return '중간 수준입니다. 핵심 개선 항목을 순차 적용하면 노출이 크게 늘어납니다.';
  return '개선 여지가 큽니다. 기술 기반과 콘텐츠 구조부터 순차 보강이 필요합니다.';
}

function likelihoodLabel(likelihood: 'high' | 'medium' | 'low'): { text: string; color: string } {
  switch (likelihood) {
    case 'high':   return { text: '높음', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    case 'medium': return { text: '보통', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    case 'low':    return { text: '낮음', color: 'text-red-700 bg-red-50 border-red-200' };
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return iso; }
}

export default function PublicDiagnosticResult({ view }: Props) {
  const headline = view.heroSummary || scoreHeadline(view.overallScore);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 상단 브랜드 바 */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-black text-indigo-600 tracking-tight">Winaid</span>
        <span className="text-[11px] text-slate-400">AI 검색 노출 진단</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* 섹션 1: 히어로 — 점수 게이지 + 병원명 + 분석 요약 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <ScoreRing score={view.overallScore} size={160} label="종합 점수" />
            <div className="flex-1 min-w-0 text-center md:text-left">
              <h1 className="text-xl font-black text-slate-800 break-words">{view.siteName}</h1>
              <p className="mt-1 text-[12px] text-slate-400 break-all">{view.url}</p>
              <p className="mt-2 text-[11px] text-slate-400">
                진단 일자: {formatDate(view.analyzedAt)}
                {view.detectedCategory && ` · ${view.detectedCategory}`}
                {view.detectedRegion && ` · ${view.detectedRegion}`}
              </p>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">{headline}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                  페이지 {view.crawlMeta.pagesAnalyzed}개
                </span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                  이미지 {view.crawlMeta.totalImages}개
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 섹션 2: 신뢰 배지 (score ≥ 70 카테고리) */}
        {view.trustBadges.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-700 mb-3">✅ 우수 영역</h2>
            <div className="flex flex-wrap gap-2">
              {view.trustBadges.map((b) => (
                <span
                  key={b.categoryId}
                  className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 섹션 3: 카테고리별 점수 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 mb-4">카테고리별 점수</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {view.categories.map((c) => (
              <ScoreRing key={c.id} score={c.score} size={90} label={c.name} />
            ))}
          </div>
        </div>

        {/* 섹션 4: AI 플랫폼별 노출 가능성 */}
        {view.aiVisibility.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-700 mb-3">🤖 AI 플랫폼별 노출 가능성</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {view.aiVisibility.map((v) => {
                const badge = likelihoodLabel(v.likelihood);
                return (
                  <div key={v.platform} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-700">{v.platform}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.color}`}>
                      {badge.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 섹션 4.5: 우선 조치 잠금 카드 */}
        {view.priorityActionsTeaser.total > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🔒</span>
              <h2 className="text-sm font-bold text-slate-700">우선 조치 가이드</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              이 사이트는 <strong className="text-slate-900">{view.priorityActionsTeaser.total}개</strong>의 개선 항목이 발견됐어요.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {view.priorityActionsTeaser.highImpact > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                  영향 큼 {view.priorityActionsTeaser.highImpact}개
                </span>
              )}
              {view.priorityActionsTeaser.mediumImpact > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  영향 중 {view.priorityActionsTeaser.mediumImpact}개
                </span>
              )}
              {view.priorityActionsTeaser.lowImpact > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                  영향 낮음 {view.priorityActionsTeaser.lowImpact}개
                </span>
              )}
            </div>
            {/* 블러된 잠금 미리보기 */}
            <div className="relative">
              <div className="space-y-2 blur-sm select-none pointer-events-none" aria-hidden="true">
                <div className="h-12 rounded-lg bg-slate-100" />
                <div className="h-12 rounded-lg bg-slate-100" />
                <div className="h-12 rounded-lg bg-slate-100" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/40 to-white/90">
                <div className="text-center px-4">
                  <p className="text-[12px] text-slate-500 mb-3 leading-relaxed">
                    각 항목별 상세 가이드 (이게 뭐예요? · 어떻게 하나요? · 팁) 는<br />
                    <strong className="text-slate-700">Winaid 전문 컨설팅</strong>에서 확인하실 수 있어요.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <a
                      href="tel:025849400"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 transition-colors"
                    >
                      📞 02-584-9400
                    </a>
                    <a
                      href="mailto:winaid@daum.net"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-white text-indigo-600 text-[12px] font-bold border border-indigo-200 hover:bg-indigo-50 transition-colors"
                    >
                      ✉️ winaid@daum.net
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 섹션 5: CTA */}
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-indigo-800 mb-1">내 병원 AI 검색 노출 진단받기</p>
          <p className="text-[12px] text-indigo-600 mb-4">ChatGPT·Gemini 등 AI 검색에서 내 병원이 잘 보이는지 무료로 확인하세요.</p>
          <a
            href="/"
            className="inline-block px-6 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
          >
            무료 진단 시작
          </a>
        </div>

        {/* 섹션 6: 푸터 */}
        <div className="text-center text-[11px] text-slate-400 pb-4">
          <p>Powered by <strong className="text-indigo-500">Winaid</strong> — 병원 마케팅 AI</p>
          <p className="mt-1">이 결과는 {formatDate(view.analyzedAt)} 기준 스냅샷입니다.</p>
        </div>

      </div>
    </div>
  );
}
