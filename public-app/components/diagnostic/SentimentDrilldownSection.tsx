'use client';

/**
 * SentimentDrilldownSection — AI 평판 점수 원인 추적 (GEO-10 — 14 기능 10번).
 *
 * geo_citations 의 answer_text + citation snippet 에서 우리 병원 언급 단락을 추출 →
 * 부정/긍정/중립 + signal (약점/강점/의료법) 자동 분석 → 운영자에게 원인 + 권고.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면 CompetitorContentSection 다음에 통합.
 * 양 앱 lockstep — public-app / next-app 같은 파일 (sentimentDrilldown.test 가 diff=0 강제).
 *
 * 데이터 소스: GeoCitationsSection 의 최근 N건 (GET /api/geo/citations).
 * 클라이언트 only — LLM 호출 0, DB 변경 0 (rule-based MVP).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import GeoSectionTooltip from './GeoSectionTooltip';
import {
  aggregateSentiment,
  buildPrefillFromSentimentWeakness,
  buildPrefillDeeplink,
  type CitationRow,
  type MentionAnalysis,
  type Polarity,
  type SentimentSummary,
} from '@winaid/blog-core';

export interface SentimentDrilldownSectionProps {
  /** 진단 결과 finalUrl — ourDomains prefill. */
  diagnosticUrl: string;
  /** 진단 결과 siteName — hospital_name (조회 키). */
  hospitalName: string;
}

interface ListResponse {
  rows?: CitationRow[];
}

const POLARITY_COLOR: Record<Polarity, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-rose-500',
  neutral: 'bg-slate-400',
};

const POLARITY_BG: Record<Polarity, string> = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-rose-50 text-rose-700 border-rose-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

const POLARITY_LABEL: Record<Polarity, string> = {
  positive: '긍정',
  negative: '부정',
  neutral: '중립',
};

function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return '';
  }
}

function DoughnutChart({ summary }: { summary: SentimentSummary }) {
  const total = summary.totalMentions;
  if (total === 0) return null;
  const pos = summary.polarityCounts.positive;
  const neg = summary.polarityCounts.negative;
  const neu = summary.polarityCounts.neutral;
  const r = 48;
  const c = 2 * Math.PI * r;
  const posLen = (pos / total) * c;
  const negLen = (neg / total) * c;
  const neuLen = (neu / total) * c;
  const posOffset = 0;
  const negOffset = -posLen;
  const neuOffset = -(posLen + negLen);
  return (
    <div className="flex flex-col items-center">
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#e2e8f0" strokeWidth={14} />
        {pos > 0 && (
          <circle cx={60} cy={60} r={r} fill="none" stroke="#10b981" strokeWidth={14}
            strokeDasharray={`${posLen} ${c}`} strokeDashoffset={posOffset}
            transform="rotate(-90 60 60)" strokeLinecap="butt" />
        )}
        {neg > 0 && (
          <circle cx={60} cy={60} r={r} fill="none" stroke="#ef4444" strokeWidth={14}
            strokeDasharray={`${negLen} ${c}`} strokeDashoffset={negOffset}
            transform="rotate(-90 60 60)" strokeLinecap="butt" />
        )}
        {neu > 0 && (
          <circle cx={60} cy={60} r={r} fill="none" stroke="#94a3b8" strokeWidth={14}
            strokeDasharray={`${neuLen} ${c}`} strokeDashoffset={neuOffset}
            transform="rotate(-90 60 60)" strokeLinecap="butt" />
        )}
        <text x={60} y={56} textAnchor="middle" fontSize={20} fontWeight={700} fill="#334155">{total}</text>
        <text x={60} y={74} textAnchor="middle" fontSize={9} fill="#64748b">언급</text>
      </svg>
      <div className="flex gap-2 text-[10px] mt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" />긍정 {pos}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded-full" />부정 {neg}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-slate-400 rounded-full" />중립 {neu}</span>
      </div>
    </div>
  );
}

function ModelBars({ summary }: { summary: SentimentSummary }) {
  return (
    <div className="space-y-2">
      {(['chatgpt', 'gemini'] as const).map(m => {
        const s = summary.byModel[m];
        if (s.total === 0) {
          return (
            <div key={m} className="text-[11px] text-slate-400">
              {m === 'chatgpt' ? '💬 ChatGPT' : '✨ Gemini'}: 언급 없음
            </div>
          );
        }
        const pos = (s.positive / s.total) * 100;
        const neg = (s.negative / s.total) * 100;
        const neu = (s.neutral / s.total) * 100;
        return (
          <div key={m}>
            <div className="flex items-center justify-between text-[11px] mb-0.5">
              <span className="text-slate-700 font-medium">{m === 'chatgpt' ? '💬 ChatGPT' : '✨ Gemini'}</span>
              <span className="text-slate-500">{s.total}건 (긍 {s.positive} · 부 {s.negative} · 중 {s.neutral})</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
              {pos > 0 && <div className="bg-emerald-500" style={{ width: `${pos}%` }} />}
              {neg > 0 && <div className="bg-rose-500" style={{ width: `${neg}%` }} />}
              {neu > 0 && <div className="bg-slate-400" style={{ width: `${neu}%` }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MentionRow({ m }: { m: MentionAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const preview = m.paragraph.length > 80 && !expanded
    ? m.paragraph.slice(0, 80) + '…'
    : m.paragraph;
  return (
    <li className="text-[11px] border border-slate-200 bg-white rounded-lg p-2">
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className={'inline-block text-[9px] px-1.5 py-0.5 rounded border ' + POLARITY_BG[m.polarity]}>
          {POLARITY_LABEL[m.polarity]}
        </span>
        {m.ai_model && (
          <span className="text-[9px] text-slate-500">{m.ai_model === 'chatgpt' ? '💬 ChatGPT' : '✨ Gemini'}</span>
        )}
        {m.signals.length > 0 && (
          <span className="text-[9px] text-slate-400">신호 {m.signals.length}</span>
        )}
      </div>
      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{preview}</p>
      {m.paragraph.length > 80 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-indigo-600 hover:underline cursor-pointer bg-transparent border-0 p-0 mt-0.5"
        >
          {expanded ? '접기' : '펼치기'}
        </button>
      )}
    </li>
  );
}

export default function SentimentDrilldownSection({
  diagnosticUrl,
  hospitalName,
}: SentimentDrilldownSectionProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CitationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllMentions, setShowAllMentions] = useState(false);

  const ourDomains = useMemo(() => {
    const h = hostnameFromUrl(diagnosticUrl);
    return h ? [h] : [];
  }, [diagnosticUrl]);

  const fetchRows = useCallback(async () => {
    if (!hospitalName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/geo/citations?hospital_name=${encodeURIComponent(hospitalName)}&limit=50`);
      const data = (await res.json()) as ListResponse;
      if (Array.isArray(data?.rows)) setRows(data.rows);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  const summary: SentimentSummary | null = useMemo(() => {
    if (rows.length === 0) return null;
    return aggregateSentiment(rows, hospitalName, ourDomains);
  }, [rows, hospitalName, ourDomains]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between cursor-pointer bg-transparent border-0 p-0 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1">
            💭 AI 가 우리를 어떻게 말하나
            <GeoSectionTooltip description="AI 답변에서 우리 병원 언급 부분의 부정·긍정 표현 자동 분석. 약점 신호 클릭 시 보강 콘텐츠 초안 자동 생성." />
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            ChatGPT / Gemini 답변에서 우리 병원 언급 단락을 추출 → 부정/긍정/중립 자동 분류 + 약점 signal 별 권고.
            <span className="text-slate-400 ml-1">{open ? '접기 ▲' : '펼치기 ▼'}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-4">
          {loading && (
            <div className="text-[11px] text-slate-400">최근 인용 데이터 로딩 중…</div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-3 border border-slate-200">
              인용 데이터가 없습니다. 먼저 <strong>🔍 AI 인용 출처</strong> 섹션에서 분석을 한 번 실행하세요.
            </div>
          )}

          {summary && summary.totalMentions === 0 && (
            <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-3 border border-slate-200">
              인용 데이터 {rows.length}건은 있지만, 답변 본문에 우리 병원명({hospitalName}) 언급이 감지되지 않았습니다.
              병원명 정확성을 확인하거나 더 많은 쿼리로 분석해보세요.
            </div>
          )}

          {summary && summary.totalMentions > 0 && (
            <>
              {/* 종합 차트 + 모델별 분포 */}
              <div className="flex flex-col md:flex-row gap-5 items-center md:items-start">
                <DoughnutChart summary={summary} />
                <div className="flex-1 w-full">
                  <ModelBars summary={summary} />
                </div>
              </div>

              {/* 의료법 위반 warning */}
              {summary.medicalLawViolations.length > 0 && (
                <div className="text-[11px] bg-amber-50 border border-amber-300 rounded-lg p-3">
                  <p className="font-bold text-amber-800 mb-1.5">⚠️ 의료법 위반 가능 표현 감지</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.medicalLawViolations.map(v => (
                      <span key={v.keyword} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        {v.label} ({v.count}회)
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-700 mt-2">
                    AI 가 우리 사이트의 의료법 위반 표현을 그대로 인용하면 환자 민원·처분 위험. 본문에서 절대 표현 ("최고", "100%", "보장" 등) 을 즉시 교체하세요.
                  </p>
                </div>
              )}

              {/* 약점 signal — GEO-12: 클릭 시 콘텐츠 초안 prefill */}
              {summary.weaknesses.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-bold text-rose-700 mb-2">⚠ 약점 signal ({summary.weaknesses.length}) — 클릭 시 콘텐츠 초안</h4>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {summary.weaknesses.map(w => {
                      const prefill = buildPrefillFromSentimentWeakness(w.label, summary.recommendations, undefined, w.keyword);
                      const href = buildPrefillDeeplink(prefill);
                      return (
                        <a
                          key={w.keyword}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 cursor-pointer no-underline"
                          title="클릭 시 blog 빌더 새 창 + 보강 콘텐츠 prefill (GEO-12)"
                        >
                          {w.label} ({w.count}회) ✨
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 강점 signal */}
              {summary.strengths.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-bold text-emerald-700 mb-2">✓ 강점 signal ({summary.strengths.length})</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.strengths.map(s => (
                      <span key={s.keyword} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {s.label} ({s.count}회)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 권고 list */}
              {summary.recommendations.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-bold text-indigo-700 mb-2">💡 권고 ({summary.recommendations.length})</h4>
                  <ul className="space-y-1">
                    {summary.recommendations.map((r, i) => (
                      <li key={i} className="text-[11px] bg-indigo-50 border border-indigo-200 rounded p-2 text-indigo-800">
                        → {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 원본 단락 */}
              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAllMentions(!showAllMentions)}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
                >
                  {showAllMentions ? '▲ 원본 단락 숨기기' : `▼ 원본 단락 보기 (${summary.totalMentions}건)`}
                </button>
                {showAllMentions && (
                  <ul className="mt-2 space-y-1.5">
                    {summary.mentions.slice(0, 30).map((m, i) => (
                      <MentionRow key={i} m={m} />
                    ))}
                    {summary.mentions.length > 30 && (
                      <li className="text-[10px] text-slate-500">… 외 {summary.mentions.length - 30}건</li>
                    )}
                  </ul>
                )}
              </div>

              {/* 안내 — rule-based MVP */}
              <div className="text-[10px] text-slate-500 bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
                ℹ️ 현재 분석은 rule-based (키워드 사전 매칭). 미묘한 표현은 누락될 수 있으며, 후속 PR 에서 LLM 강화 예정.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
