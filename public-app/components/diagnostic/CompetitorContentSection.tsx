'use client';

/**
 * CompetitorContentSection — 경쟁사 신규 콘텐츠 자동 감지 (GEO-9 — 14 기능 9번).
 *
 * geo_citations 에서 추출한 경쟁사 도메인 + 운영자 수동 추가 도메인 → RSS / sitemap /
 * 네이버 검색 통합 → 신규 콘텐츠 감지 + pattern_type 분류 + "대응 콘텐츠 초안" trigger.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면 EEATSection 다음에 통합.
 * 양 앱 lockstep — public-app / next-app 같은 파일 (competitorWatch.test 가 diff=0 강제).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import GeoSectionTooltip from './GeoSectionTooltip';

export interface CompetitorContentSectionProps {
  /** 진단 결과 siteName — hospital_name (조회 키). */
  hospitalName: string;
}

interface ContentRow {
  id?: string;
  competitor_domain: string;
  url: string;
  title?: string;
  snippet?: string;
  discovered_at?: string;
  published_at?: string;
  pattern_type?: string;
  source: string;
  responded?: boolean;
}

interface DomainRow {
  id?: string;
  domain: string;
  source: 'auto_citation' | 'manual';
  enabled?: boolean;
  added_at?: string;
}

interface DetectResponse {
  success?: boolean;
  discovered?: number;
  items?: ContentRow[];
  note?: string;
  error?: string;
}

interface ListResponse {
  contents?: ContentRow[];
  domains?: DomainRow[];
}

interface RespondResponse {
  success?: boolean;
  prefillUrl?: string;
  error?: string;
}

const PATTERN_LABEL: Record<string, string> = {
  faq: 'FAQ형',
  comparison_table: '비교표형',
  list: '리스트형',
  doctor_interview: '의료진 인터뷰형',
  pricing: '가격 비교형',
  case_study: '치료 사례형',
  unknown: '미분류',
  fetch_failed: '분석 실패',
};

const PATTERN_COLOR: Record<string, string> = {
  faq: 'bg-blue-100 text-blue-700',
  comparison_table: 'bg-purple-100 text-purple-700',
  list: 'bg-slate-100 text-slate-700',
  doctor_interview: 'bg-emerald-100 text-emerald-700',
  pricing: 'bg-orange-100 text-orange-700',
  case_study: 'bg-pink-100 text-pink-700',
  unknown: 'bg-slate-50 text-slate-400',
  fetch_failed: 'bg-rose-50 text-rose-500',
};

const SOURCE_LABEL: Record<string, string> = {
  citation: '🔗 인용',
  naver_blog: '✏️ 네이버 블로그',
  naver_cafe: '☕ 네이버 카페',
  website: '🌐 웹사이트 RSS',
};

function hostnameOnly(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso; }
}

export default function CompetitorContentSection({ hospitalName }: CompetitorContentSectionProps) {
  const [open, setOpen] = useState(false);

  const [contents, setContents] = useState<ContentRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [topErr, setTopErr] = useState<string | undefined>();
  const [authErr, setAuthErr] = useState<string | undefined>();
  const [newDomainInput, setNewDomainInput] = useState('');
  const [lastDetectAt, setLastDetectAt] = useState<string | undefined>();

  const fetchList = useCallback(async () => {
    if (!hospitalName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/geo/competitor/list?hospital_name=${encodeURIComponent(hospitalName)}&limit=30`);
      if (res.status === 401) {
        setAuthErr('경쟁사 추적은 로그인 후 사용 가능합니다.');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as ListResponse;
      if (Array.isArray(data?.contents)) setContents(data.contents);
      if (Array.isArray(data?.domains)) setDomains(data.domains);
      setAuthErr(undefined);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  const addDomain = useCallback(async () => {
    const t = newDomainInput.trim().toLowerCase();
    if (!t || !hospitalName) return;
    try {
      const res = await fetch('/api/geo/competitor/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospital_name: hospitalName, domain: t }),
      });
      if (res.ok) {
        setNewDomainInput('');
        fetchList();
      } else {
        const d = await res.json();
        setTopErr(d?.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : 'unknown');
    }
  }, [newDomainInput, hospitalName, fetchList]);

  const removeDomain = useCallback(async (id: string) => {
    if (!id) return;
    if (!confirm('이 도메인 추적을 제거하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/geo/competitor/list?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) fetchList();
    } catch {
      // silent
    }
  }, [fetchList]);

  const detect = useCallback(async () => {
    if (!hospitalName || detecting) return;
    setDetecting(true);
    setTopErr(undefined);
    try {
      const res = await fetch('/api/geo/competitor/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospital_name: hospitalName, sinceDays: 7 }),
      });
      const data = (await res.json()) as DetectResponse;
      if (!res.ok) {
        setTopErr(data?.error || `HTTP ${res.status}`);
        return;
      }
      setLastDetectAt(new Date().toISOString());
      if (data.note) setTopErr(data.note);
      fetchList();
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : 'unknown');
    } finally {
      setDetecting(false);
    }
  }, [hospitalName, detecting, fetchList]);

  const respond = useCallback(async (id?: string) => {
    if (!id) return;
    try {
      const res = await fetch('/api/geo/competitor/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitor_content_id: id }),
      });
      const data = (await res.json()) as RespondResponse;
      if (data?.prefillUrl) {
        window.open(data.prefillUrl, '_blank', 'noopener,noreferrer');
        fetchList();
      } else {
        setTopErr(data?.error || '대응 콘텐츠 URL 생성 실패');
      }
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : 'unknown');
    }
  }, [fetchList]);

  // 도메인별 그룹핑
  const byDomain = useMemo(() => {
    const m = new Map<string, ContentRow[]>();
    for (const c of contents) {
      const k = c.competitor_domain || hostnameOnly(c.url);
      const arr = m.get(k) || [];
      arr.push(c);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [contents]);

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
            🚨 경쟁 병원 새 글
            <GeoSectionTooltip description="경쟁 병원 새 콘텐츠 자동 감지 (RSS·네이버 검색) + 패턴 분류 (FAQ/비교표 등) + 우리 대응 콘텐츠 초안 1-click 생성." />
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            경쟁사 도메인의 RSS / 네이버 블로그·카페에서 신규 콘텐츠 자동 발견 + 패턴 분류 + 대응 초안 trigger.
            <span className="text-slate-400 ml-1">{open ? '접기 ▲' : '펼치기 ▼'}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-4">
          {authErr && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {authErr}
            </div>
          )}

          {/* STEP 1 — 추적 도메인 */}
          <div>
            <h4 className="text-[12px] font-bold text-slate-700 mb-2">STEP 1 · 추적 도메인 ({domains.length})</h4>
            <div className="flex flex-wrap gap-1.5 items-center">
              {domains.map(d => (
                <span
                  key={d.id || d.domain}
                  className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] px-2 py-1 rounded-full border border-slate-200"
                >
                  {d.domain}
                  <span className="text-[9px] text-slate-400">({d.source === 'manual' ? '수동' : '자동'})</span>
                  {d.id && (
                    <button
                      type="button"
                      onClick={() => removeDomain(d.id!)}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer bg-transparent border-0 p-0 text-[12px] leading-none ml-0.5"
                      aria-label={`${d.domain} 제거`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              <input
                type="text"
                value={newDomainInput}
                onChange={e => setNewDomainInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
                placeholder="예: smile-dental.kr"
                className="text-[11px] px-2 py-1 border border-slate-200 rounded-full focus:outline-none focus:border-indigo-400 min-w-[160px]"
              />
              <button
                type="button"
                onClick={addDomain}
                disabled={!newDomainInput.trim()}
                className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-slate-200"
              >
                추가
              </button>
            </div>
            {domains.length === 0 && (
              <p className="text-[11px] text-slate-500 mt-2">
                추적 도메인 없음. 위 입력란에 경쟁사 hostname 을 추가하거나, GEO-1.1 의 citation 분석으로 자동 추출됩니다.
              </p>
            )}
          </div>

          {/* STEP 2 — 감지 trigger */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={detect}
                disabled={detecting || domains.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[12px] font-medium px-3 py-1.5 rounded-lg cursor-pointer"
              >
                {detecting ? '🔍 감지 중…' : '🔍 지금 감지'}
              </button>
              {lastDetectAt && (
                <span className="text-[10px] text-slate-400">마지막 감지: {formatTime(lastDetectAt)}</span>
              )}
            </div>
            {topErr && (
              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 mt-2">
                {topErr}
              </div>
            )}
          </div>

          {/* STEP 3 — 발견 결과 (도메인별 그룹) */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[12px] font-bold text-slate-700">발견 결과 ({contents.length})</h4>
              {loading && <span className="text-[10px] text-slate-400">로딩…</span>}
            </div>
            {byDomain.length === 0 ? (
              <p className="text-[11px] text-slate-500">감지된 콘텐츠 없음. "지금 감지" 클릭으로 시작.</p>
            ) : (
              <ul className="space-y-3">
                {byDomain.map(([domain, items]) => (
                  <li key={domain} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-bold text-slate-700">{domain}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        신규 {items.length}건
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {items.slice(0, 5).map(c => (
                        <li key={c.id || c.url} className="text-[11px] border-l-2 border-slate-200 pl-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                                  {SOURCE_LABEL[c.source] || c.source}
                                </span>
                                {c.pattern_type && (
                                  <span className={'text-[9px] px-1.5 py-0.5 rounded ' + (PATTERN_COLOR[c.pattern_type] || PATTERN_COLOR.unknown)}>
                                    {PATTERN_LABEL[c.pattern_type] || c.pattern_type}
                                  </span>
                                )}
                                {c.published_at && (
                                  <span className="text-[9px] text-slate-500">{formatDate(c.published_at)}</span>
                                )}
                                {c.responded && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ 대응 완료
                                  </span>
                                )}
                              </div>
                              {c.title && <div className="font-medium text-slate-800 truncate mt-0.5">{c.title}</div>}
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 hover:underline break-all"
                              >
                                {c.url}
                              </a>
                              {c.snippet && (
                                <div className="text-slate-500 mt-0.5 italic line-clamp-2">{c.snippet}</div>
                              )}
                            </div>
                            {!c.responded && (
                              <button
                                type="button"
                                onClick={() => respond(c.id)}
                                disabled={!c.id}
                                className="shrink-0 text-[10px] px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded cursor-pointer font-medium whitespace-nowrap"
                                title="이 콘텐츠에 대한 대응 글 초안 생성 (blog 빌더 새 창)"
                              >
                                ✨ 대응 초안
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                      {items.length > 5 && (
                        <li className="text-[10px] text-slate-500 pl-2">… 외 {items.length - 5}건</li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
