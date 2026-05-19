'use client';

/**
 * EEATSection — E-E-A-T 신뢰도 4축 채점 (GEO-7 — 14 기능 7번).
 *
 * Experience / Expertise / Authoritativeness / Trust — Google + AI 모델 신뢰도
 * 평가의 핵심 4축. 진단 결과 (categories items + internalLinks + schemaTypes 등) 에서
 * medical-specific 신호 detect → 각 0~100 → 종합 점수 + 강점/약점 + 권고.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면 AlertSubscriptionSection 다음에 통합.
 * 양 앱 lockstep — public-app / next-app 같은 파일 (eeatScore.test 가 diff=0 강제).
 *
 * 데이터 한계: DiagnosticResponse 에는 textContent 미노출 → text-based 신호 (학회/논문/
 * 의료진 이름) 는 'awaiting_data' 표시. category-derived 신호 (HTTPS / schema / contact)
 * 는 정상 평가. 후속 PR 에서 textContent 노출 시 자동 보강.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  scoreEEAT,
  buildPrefillFromEEATWeakness,
  buildPrefillDeeplink,
  type EEATInput,
  type EEATResult,
  type EEATAxis,
} from '@winaid/blog-core';

export interface EEATSectionProps {
  /** 진단 URL — HTTPS 검출용. */
  url: string;
  /** crawl meta — internalLinks + schemaTypes + detectedServices 추출. */
  crawlMeta?: {
    internalLinks?: Array<{ href: string; text: string }>;
    schemaTypesFound?: string[];
    detectedServices?: string[];
  };
  /** categories flatten — items[] (status + label). */
  categories?: Array<{ items: Array<{ label: string; status: 'pass'|'fail'|'warning'|'unknown'; earnedPoints?: number; maxPoints?: number }> }>;
}

const AXIS_LABEL: Record<EEATAxis, string> = {
  experience: 'Experience (경험)',
  expertise: 'Expertise (전문성)',
  authority: 'Authority (권위)',
  trust: 'Trust (신뢰)',
};

const AXIS_COLOR: Record<EEATAxis, string> = {
  experience: 'bg-pink-500',
  expertise: 'bg-blue-500',
  authority: 'bg-purple-500',
  trust: 'bg-emerald-500',
};

const AXIS_BG: Record<EEATAxis, string> = {
  experience: 'bg-pink-50 border-pink-200 text-pink-700',
  expertise: 'bg-blue-50 border-blue-200 text-blue-700',
  authority: 'bg-purple-50 border-purple-200 text-purple-700',
  trust: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  // 단순 원형 — SVG circle stroke-dashoffset.
  const r = 48;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center">
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#e2e8f0" strokeWidth={10} />
        <circle
          cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text x={60} y={60} textAnchor="middle" dominantBaseline="middle" fontSize={26} fontWeight={700} fill="#334155">{score}</text>
        <text x={60} y={82} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#64748b">/ 100</text>
      </svg>
      <div className="text-[12px] font-medium text-slate-700 mt-1">{label}</div>
    </div>
  );
}

function AxisBar({ axis, score }: { axis: EEATAxis; score: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-slate-700 font-medium">{AXIS_LABEL[axis]}</span>
        <span className="text-slate-500">{score} / 100</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={'h-full rounded-full ' + AXIS_COLOR[axis]} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function EEATSection({ url, crawlMeta, categories }: EEATSectionProps) {
  const [open, setOpen] = useState(false);
  const [detailAxis, setDetailAxis] = useState<EEATAxis | null>(null);

  const input: EEATInput = useMemo(() => {
    const items = (categories || []).flatMap(c => c.items || []);
    return {
      url,
      internalLinks: crawlMeta?.internalLinks || [],
      schemaTypes: crawlMeta?.schemaTypesFound || [],
      detectedServices: crawlMeta?.detectedServices || [],
      categoryItems: items,
      // textContent 는 진단 응답 미노출 — text-based 신호는 awaiting_data
    };
  }, [url, crawlMeta, categories]);

  const result: EEATResult = useMemo(() => scoreEEAT(input), [input]);

  const detailSignals = detailAxis ? result.axes[detailAxis].signals : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between cursor-pointer bg-transparent border-0 p-0 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-bold text-slate-700">
            ⭐ AI 가 본 우리 신뢰도
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Experience · Expertise · Authority · Trust 4축으로 의료 사이트 신뢰도 자동 채점.
            Google + ChatGPT + Gemini 가 모두 중시하는 신호 기준.
            <span className="text-slate-400 ml-1">{open ? '접기 ▲' : '펼치기 ▼'}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-4">
          {/* 종합 점수 + 4축 bar */}
          <div className="flex flex-col md:flex-row gap-5 items-center md:items-start">
            <ScoreRing score={result.overall} label="종합" />
            <div className="flex-1 w-full space-y-3">
              <AxisBar axis="experience" score={result.axes.experience.score} />
              <AxisBar axis="expertise" score={result.axes.expertise.score} />
              <AxisBar axis="authority" score={result.axes.authority.score} />
              <AxisBar axis="trust" score={result.axes.trust.score} />
            </div>
          </div>

          {/* 4축 detail toggle */}
          <div className="flex flex-wrap gap-1.5">
            {(['experience', 'expertise', 'authority', 'trust'] as EEATAxis[]).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => setDetailAxis(detailAxis === a ? null : a)}
                className={
                  'text-[11px] px-2.5 py-1 rounded-lg border font-medium cursor-pointer ' +
                  (detailAxis === a
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                }
              >
                {AXIS_LABEL[a]} 상세
              </button>
            ))}
          </div>

          {detailAxis && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-[11px] font-bold text-slate-700 mb-2">
                {AXIS_LABEL[detailAxis]} — 신호별 점수
              </div>
              <ul className="space-y-1.5">
                {detailSignals.map((s, i) => (
                  <li key={i} className="flex items-center justify-between text-[11px]">
                    <span className={s.awaitingData ? 'text-slate-400' : 'text-slate-700'}>
                      {s.label}
                      {s.awaitingData && <span className="ml-1 text-[10px] text-amber-600">(awaiting data)</span>}
                    </span>
                    <span className="font-medium text-slate-600">
                      {s.awaitingData ? '—' : `${s.points} / ${s.weight}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 강점 chip */}
          {result.strengths.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-emerald-700 mb-1.5">✓ 강점 ({result.strengths.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {result.strengths.map((s, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 약점 + 권고 — GEO-12: 클릭 시 콘텐츠 초안 prefill */}
          {result.weaknesses.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-rose-700 mb-1.5">⚠ 약점 + 권고 ({result.weaknesses.length})</div>
              <ul className="space-y-1.5">
                {result.weaknesses.slice(0, 10).map((w, i) => {
                  const prefill = buildPrefillFromEEATWeakness(w.label, [w.recommendation], undefined, w.label);
                  const href = buildPrefillDeeplink(prefill);
                  return (
                    <li key={i}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[11px] bg-rose-50 border border-rose-200 rounded-lg p-2 hover:bg-rose-100 hover:border-rose-300 cursor-pointer no-underline"
                        title="클릭 시 blog 빌더 새 창 + 보강 콘텐츠 prefill (GEO-12)"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-rose-700">{w.label}</div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-600 text-white whitespace-nowrap">✨ 콘텐츠 초안</span>
                        </div>
                        <div className="text-rose-600 mt-0.5">→ {w.recommendation}</div>
                      </a>
                    </li>
                  );
                })}
                {result.weaknesses.length > 10 && (
                  <li className="text-[10px] text-slate-500">… 외 {result.weaknesses.length - 10}건 (각 축 상세 토글로 확인)</li>
                )}
              </ul>
            </div>
          )}

          {/* 안내 — text-based 신호 한계 */}
          <div className="text-[10px] text-slate-500 bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
            ℹ️ 본문 텍스트 기반 신호 (학회/논문/의료진 이름 등) 는 현재 진단 응답에서 노출되지 않아 "awaiting data" 로 표시됩니다. 후속 PR 에서 자동 노출 예정.
          </div>
        </div>
      )}
    </div>
  );
}
