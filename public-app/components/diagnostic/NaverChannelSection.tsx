'use client';

/**
 * NaverChannelSection — 네이버 채널 인용 측정 (GEO-11 — 14 기능 11번).
 *
 * 한국 의료 검색은 네이버 영향력이 절대적. AI 답변 인용 URL 중 네이버 8 채널 (블로그/카페/
 * 지식인/플레이스/뉴스/포스트/스마트스토어/me) 분류 + 모델별 분포 + 우리 vs 경쟁사 매트릭스 +
 * 부재 채널 권고.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면 SentimentDrilldownSection 다음에 통합.
 * 양 앱 lockstep — public-app / next-app 같은 파일.
 *
 * 데이터 소스: GET /api/geo/citations (GeoCitationsSection 과 동일 endpoint, 최근 50건).
 * 클라이언트 only — LLM 호출 0, DB 변경 0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  aggregateNaverChannels,
  formatNaverRecommendations,
  getNaverChannelLabel,
  buildPrefillFromMissingNaverChannel,
  buildPrefillDeeplink,
  type CitationRow,
  type NaverChannel,
  type NaverChannelSummary,
} from '@winaid/blog-core';

export interface NaverChannelSectionProps {
  diagnosticUrl: string;
  hospitalName: string;
}

interface ListResponse {
  rows?: CitationRow[];
}

const CHANNEL_COLOR: Record<NaverChannel, string> = {
  naver_blog: 'bg-green-100 text-green-700 border-green-200',
  naver_cafe: 'bg-amber-100 text-amber-700 border-amber-200',
  naver_kin: 'bg-blue-100 text-blue-700 border-blue-200',
  naver_place: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  naver_news: 'bg-slate-100 text-slate-700 border-slate-200',
  naver_post: 'bg-purple-100 text-purple-700 border-purple-200',
  naver_smartstore: 'bg-pink-100 text-pink-700 border-pink-200',
  naver_me: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const REGISTRATION_LINK: Partial<Record<NaverChannel, { label: string; url: string }>> = {
  naver_blog: { label: '네이버 블로그 만들기', url: 'https://blog.naver.com' },
  naver_cafe: { label: '네이버 카페 만들기', url: 'https://section.cafe.naver.com/ca-fe/cafes/create' },
  naver_place: { label: '네이버 플레이스 등록', url: 'https://smartplace.naver.com' },
  naver_post: { label: '네이버 포스트 시작', url: 'https://post.naver.com' },
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

function StackBar({ pct, total, label }: { pct: number; total: number; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-slate-700 font-medium">{label}</span>
        <span className="text-slate-500">{total}건 ({pct}%)</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="bg-green-500 h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function NaverChannelSection({
  diagnosticUrl,
  hospitalName,
}: NaverChannelSectionProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CitationRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  const summary: NaverChannelSummary | null = useMemo(() => {
    if (rows.length === 0) return null;
    return aggregateNaverChannels(rows, ourDomains);
  }, [rows, ourDomains]);

  const recommendations = useMemo(() => {
    if (!summary) return [];
    return formatNaverRecommendations(summary);
  }, [summary]);

  const naverPct = summary && summary.totalCitations > 0
    ? Math.round((summary.naverCitations / summary.totalCitations) * 100)
    : 0;

  const modelPct = (which: 'chatgpt' | 'gemini'): number => {
    if (!summary) return 0;
    const s = summary.byModel[which];
    if (s.total === 0) return 0;
    return Math.round((s.naver / s.total) * 100);
  };

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
            🇰🇷 네이버 채널 인용 측정 — 한국 AI 검색 핵심
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            ChatGPT / Gemini 답변 인용 URL 중 네이버 8 채널 (블로그/카페/지식인/플레이스/뉴스/포스트/스마트스토어/me) 분류 + 우리 vs 경쟁사 매트릭스 + 부재 채널 권고.
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

          {summary && summary.totalCitations > 0 && (
            <>
              {/* 종합 + 모델별 */}
              <div>
                <h4 className="text-[12px] font-bold text-slate-700 mb-2">네이버 인용 비율</h4>
                <div className="space-y-2">
                  <StackBar pct={naverPct} total={summary.naverCitations} label={`전체 (인용 ${summary.totalCitations}건)`} />
                  <StackBar pct={modelPct('chatgpt')} total={summary.byModel.chatgpt.naver} label="💬 ChatGPT" />
                  <StackBar pct={modelPct('gemini')} total={summary.byModel.gemini.naver} label="✨ Gemini" />
                </div>
              </div>

              {/* 채널별 분포 */}
              {summary.channels.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-[12px] font-bold text-slate-700 mb-2">채널별 분포</h4>
                  <ul className="space-y-1.5">
                    {summary.channels.map(c => (
                      <li key={c.channel} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className={'px-2 py-0.5 rounded-full border ' + CHANNEL_COLOR[c.channel]}>
                          {getNaverChannelLabel(c.channel)}
                        </span>
                        <div className="flex-1 mx-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="bg-green-500 h-full"
                            style={{ width: `${Math.min(100, (c.count / Math.max(...summary.channels.map(x => x.count), 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-slate-600 whitespace-nowrap">
                          {c.count}건
                          {c.oursCount > 0 && (
                            <span className="ml-1 text-emerald-600 font-medium">(우리 {c.oursCount})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 우리 vs 부재 매트릭스 */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-[12px] font-bold text-slate-700 mb-2">우리 네이버 채널 보유 현황</h4>
                {summary.ourChannels.length === 0 ? (
                  <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="font-medium text-amber-800 mb-1">⚠ 우리 사이트의 네이버 채널 인용 0건</p>
                    <p className="text-amber-700">
                      AI 답변에 인용되려면 우선 네이버 채널 등록부터 시작하세요. 한국 의료 검색의 80% 이상이 네이버 채널 경유.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {summary.ourChannels.map(c => (
                      <span key={c} className={'text-[11px] px-2 py-0.5 rounded-full border font-medium ' + CHANNEL_COLOR[c]}>
                        ✓ {getNaverChannelLabel(c)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 부재 채널 권고 + 등록 link */}
              {summary.missingChannels.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-[12px] font-bold text-indigo-700 mb-2">
                    💡 부재 채널 권고 ({summary.missingChannels.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {summary.missingChannels.map(c => {
                      const link = REGISTRATION_LINK[c];
                      const rec = recommendations.find(r => r.startsWith(`[${getNaverChannelLabel(c)}]`));
                      // GEO-12: 콘텐츠 초안 deeplink (등록 link 와 별도)
                      const draftPrefill = buildPrefillFromMissingNaverChannel(c);
                      const draftHref = buildPrefillDeeplink(draftPrefill);
                      return (
                        <li key={c} className="text-[11px] bg-indigo-50 border border-indigo-200 rounded p-2">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0 text-indigo-800">
                              {rec || `[${getNaverChannelLabel(c)}] 권고 누락`}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={draftHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded cursor-pointer font-medium whitespace-nowrap no-underline"
                                title="이 채널용 콘텐츠 초안 — blog 빌더 새 창 (GEO-12)"
                              >
                                ✨ 초안
                              </a>
                              {link && (
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] px-2 py-0.5 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-300 rounded cursor-pointer font-medium whitespace-nowrap no-underline"
                                >
                                  {link.label} →
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* 안내 */}
              <div className="text-[10px] text-slate-500 bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
                ℹ️ "우리 네이버 채널" 매칭은 hostname 기반. 운영자가 자기 네이버 블로그 hostname 을 추적 도메인에 추가하면 자동 인식됩니다.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
