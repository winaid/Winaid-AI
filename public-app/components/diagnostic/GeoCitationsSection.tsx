'use client';

/**
 * GeoCitationsSection — AI 인용 출처 역추적기 (GEO-1.1) + 콘텐츠 패턴 분류 (GEO-1.2)
 *
 * diagnostic 결과 화면 하단에 통합. 별도 페이지 신설 X (사용자 정책).
 *
 * 흐름:
 *   STEP 1 (compact): our_domains chip 입력 (URL hostname prefill, 편집 가능)
 *   STEP 2: query 입력 + 모델 체크박스 (chatgpt/gemini, 기본 둘 다) + 분석 버튼
 *   STEP 3 결과: ChatGPT (좌) / Gemini (우) 카드 — answer + citations
 *                + "📊 패턴 분석" 버튼 → citations URL fetch + 패턴 chip 표시 (GEO-1.2)
 *   STEP 4 최근 분석: 테이블, 클릭 시 STEP 3 재표시
 *
 * 양 앱 lockstep — public-app / next-app 같은 파일 (geoCitations.test.ts 가 diff=0 강제).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CitationRow, Citation, PatternResult, PatternType } from '@winaid/blog-core';

export interface GeoCitationsSectionProps {
  /** 분석 대상 병원의 hostname 소스 — 진단 결과의 finalUrl. our_domains prefill 에 사용. */
  diagnosticUrl: string;
  /** 분석 대상 hospital_name — 진단 결과의 siteName 또는 사용자 입력. */
  hospitalName: string;
  /** 옵션: campaign_id (diagnostic run id 등 상위 entity 와 link). */
  campaignId?: string | null;
}

interface AnalyzeResponse {
  success?: boolean;
  results?: { chatgpt?: CitationRow; gemini?: CitationRow };
  errors?: { chatgpt?: string; gemini?: string };
  error?: string;
}

interface DecomposeResponse {
  success?: boolean;
  results?: PatternResult[];
  error?: string;
}

const DEFAULT_QUERY_SUGGESTIONS = [
  '강남 임플란트 추천',
  '신경치료 잘하는 치과',
  '교정 비용',
];

const PATTERN_LABEL: Record<PatternType, string> = {
  faq: 'FAQ형',
  comparison_table: '비교표형',
  list: '리스트형',
  doctor_interview: '의료진 인터뷰형',
  pricing: '가격 비교형',
  case_study: '치료 사례형',
  unknown: '미분류',
  fetch_failed: '분석 실패',
};

const PATTERN_COLOR: Record<PatternType, string> = {
  faq: 'bg-blue-100 text-blue-700 border-blue-200',
  comparison_table: 'bg-purple-100 text-purple-700 border-purple-200',
  list: 'bg-slate-100 text-slate-700 border-slate-200',
  doctor_interview: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pricing: 'bg-orange-100 text-orange-700 border-orange-200',
  case_study: 'bg-pink-100 text-pink-700 border-pink-200',
  unknown: 'bg-slate-50 text-slate-400 border-slate-200',
  fetch_failed: 'bg-rose-50 text-rose-500 border-rose-200',
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

function shortenSnippet(s: string | undefined, max = 80): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max).trim() + '…' : s;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** PatternResult 의 primary score (있으면) 또는 unknown 의 점수. */
function scoreOf(pr: PatternResult): number {
  if (pr.status !== 'ok') return 0;
  const p = pr.primary_pattern;
  if (!p || p === 'unknown') return 0;
  return pr.scores?.[p as Exclude<PatternType, 'unknown' | 'fetch_failed'>] ?? 0;
}

function PatternChip({ pr }: { pr?: PatternResult }) {
  if (!pr) return null;
  const type: PatternType = pr.status !== 'ok'
    ? 'fetch_failed'
    : (pr.primary_pattern || 'unknown');
  const cls = PATTERN_COLOR[type];
  const label = PATTERN_LABEL[type];
  const score = scoreOf(pr);
  const tip = pr.status !== 'ok' ? pr.error : (score > 0 ? `${score}점` : '');
  return (
    <span
      className={'inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ' + cls}
      title={tip || label}
    >
      {label}{score > 0 ? ` ${score}` : ''}
    </span>
  );
}

function PatternSummaryChip({ patterns }: { patterns: PatternResult[] }) {
  if (patterns.length === 0) return null;
  // 가장 많이 등장한 primary_pattern 의 count + 비율
  const ok = patterns.filter(p => p.status === 'ok' && p.primary_pattern && p.primary_pattern !== 'unknown');
  if (ok.length === 0) return (
    <div className="text-[11px] text-slate-500 mt-2">
      종합: 분류 가능한 패턴 없음 ({patterns.filter(p => p.status !== 'ok').length}건 분석 실패)
    </div>
  );
  const counts: Partial<Record<PatternType, number>> = {};
  for (const p of ok) {
    const k = p.primary_pattern as PatternType;
    counts[k] = (counts[k] || 0) + 1;
  }
  const entries = Object.entries(counts) as Array<[PatternType, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [topType, topCount] = entries[0];
  const pct = Math.round((topCount / patterns.length) * 100);
  return (
    <div className="text-[11px] mt-2 flex items-center gap-1.5 flex-wrap">
      <span className="text-slate-500">종합:</span>
      <span className={'px-2 py-0.5 rounded-full border font-medium ' + PATTERN_COLOR[topType]}>
        {PATTERN_LABEL[topType]} {topCount}/{patterns.length} ({pct}%)
      </span>
      {entries.slice(1, 3).map(([t, n]) => (
        <span key={t} className={'px-2 py-0.5 rounded-full border ' + PATTERN_COLOR[t]}>
          {PATTERN_LABEL[t]} {n}
        </span>
      ))}
    </div>
  );
}

function CitationList({
  citations,
  patternsByUrl,
}: {
  citations: Citation[];
  patternsByUrl?: Map<string, PatternResult>;
}) {
  if (!citations || citations.length === 0) {
    return <p className="text-[11px] text-slate-500">감지된 인용 없음.</p>;
  }
  // is_ours 우선 정렬
  const sorted = [...citations].sort((a, b) => Number(b.is_ours || false) - Number(a.is_ours || false));
  return (
    <ul className="space-y-2">
      {sorted.map((c, i) => {
        const pr = patternsByUrl?.get(c.url);
        return (
          <li
            key={`${c.url}-${i}`}
            className={
              'text-[11px] rounded-lg border px-2.5 py-2 ' +
              (c.is_ours
                ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200'
                : 'border-slate-200 bg-white')
            }
          >
            <div className="flex items-center gap-1 flex-wrap mb-0.5">
              {c.is_ours && (
                <span className="inline-block text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                  우리 사이트
                </span>
              )}
              {pr && <PatternChip pr={pr} />}
            </div>
            {c.title && (
              <div className="font-medium text-slate-800 truncate">{c.title}</div>
            )}
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 hover:underline break-all"
            >
              {c.url}
            </a>
            {c.snippet && (
              <div className="text-slate-600 mt-1 italic">"{shortenSnippet(c.snippet)}"</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ResultCard({
  label,
  emoji,
  row,
  error,
  patterns,
  patternsLoading,
  onDecompose,
}: {
  label: string;
  emoji: string;
  row?: CitationRow;
  error?: string;
  patterns?: PatternResult[];
  patternsLoading?: boolean;
  onDecompose?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!row && !error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 min-h-[200px]">
        <h4 className="text-sm font-bold text-slate-700 mb-2">{emoji} {label}</h4>
        <p className="text-[11px] text-slate-500">결과 없음. "분석 시작" 버튼을 눌러주세요.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 min-h-[200px]">
        <h4 className="text-sm font-bold text-rose-700 mb-2">{emoji} {label}</h4>
        <p className="text-[11px] text-rose-700">에러: {error}</p>
        <p className="text-[10px] text-rose-600 mt-1">API 키 미설정 또는 일시적 장애일 수 있어요.</p>
      </div>
    );
  }
  if (!row) return null;
  const answer = row.answer_text || '';
  const showAll = expanded || answer.length < 240;
  const visible = showAll ? answer : answer.slice(0, 240) + '…';
  const oursCount = (row.citations || []).filter(c => c.is_ours).length;
  const canDecompose = !!onDecompose && (row.citations || []).length > 0;
  const patternsByUrl = useMemo(() => {
    const m = new Map<string, PatternResult>();
    (patterns || []).forEach(p => m.set(p.url, p));
    return m;
  }, [patterns]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 min-h-[200px]">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="text-sm font-bold text-slate-700">{emoji} {label}</h4>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            인용 {row.citations.length} · 우리 {oursCount}
          </span>
          {canDecompose && (
            <button
              type="button"
              onClick={onDecompose}
              disabled={patternsLoading}
              className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white"
              title="이 카드의 모든 인용 URL 의 콘텐츠 패턴을 분류합니다 (FAQ/비교표/리스트 등)"
            >
              {patternsLoading ? '📊 분석 중…' : '📊 패턴 분석'}
            </button>
          )}
        </div>
      </div>
      <div className="text-[12px] text-slate-700 whitespace-pre-wrap mb-3 leading-relaxed">
        {visible}
        {!showAll && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-1 text-indigo-600 text-[11px] hover:underline cursor-pointer bg-transparent border-0 p-0"
          >
            펼치기
          </button>
        )}
      </div>
      <CitationList citations={row.citations} patternsByUrl={patternsByUrl} />
      {patterns && patterns.length > 0 && <PatternSummaryChip patterns={patterns} />}
    </div>
  );
}

export default function GeoCitationsSection({
  diagnosticUrl,
  hospitalName,
  campaignId,
}: GeoCitationsSectionProps) {
  const initialDomain = hostnameFromUrl(diagnosticUrl);
  const [ourDomains, setOurDomains] = useState<string[]>(initialDomain ? [initialDomain] : []);
  const [domainInput, setDomainInput] = useState('');
  const [query, setQuery] = useState('');
  const [useChatGpt, setUseChatGpt] = useState(true);
  const [useGemini, setUseGemini] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [chatgptRow, setChatgptRow] = useState<CitationRow | undefined>();
  const [geminiRow, setGeminiRow] = useState<CitationRow | undefined>();
  const [chatgptErr, setChatgptErr] = useState<string | undefined>();
  const [geminiErr, setGeminiErr] = useState<string | undefined>();
  const [topErr, setTopErr] = useState<string | undefined>();

  // GEO-1.2 — 모델별 패턴 분석 결과 + loading
  const [chatgptPatterns, setChatgptPatterns] = useState<PatternResult[] | undefined>();
  const [geminiPatterns, setGeminiPatterns] = useState<PatternResult[] | undefined>();
  const [chatgptPatternsLoading, setChatgptPatternsLoading] = useState(false);
  const [geminiPatternsLoading, setGeminiPatternsLoading] = useState(false);

  const [recent, setRecent] = useState<CitationRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const fetchRecent = useCallback(async () => {
    if (!hospitalName) return;
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/geo/citations?hospital_name=${encodeURIComponent(hospitalName)}&limit=10`);
      const data = await res.json();
      if (Array.isArray(data?.rows)) setRecent(data.rows);
    } catch {
      // silent — recent 는 UI 보조
    } finally {
      setRecentLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const addDomain = useCallback(() => {
    const t = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!t) return;
    if (ourDomains.includes(t)) { setDomainInput(''); return; }
    if (ourDomains.length >= 20) return;
    setOurDomains([...ourDomains, t]);
    setDomainInput('');
  }, [domainInput, ourDomains]);

  const removeDomain = useCallback((d: string) => {
    setOurDomains(ourDomains.filter(x => x !== d));
  }, [ourDomains]);

  const canAnalyze = useMemo(() => {
    return !analyzing && query.trim().length > 0 && (useChatGpt || useGemini);
  }, [analyzing, query, useChatGpt, useGemini]);

  const analyze = useCallback(async () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setTopErr(undefined);
    if (useChatGpt) { setChatgptRow(undefined); setChatgptErr(undefined); setChatgptPatterns(undefined); }
    if (useGemini) { setGeminiRow(undefined); setGeminiErr(undefined); setGeminiPatterns(undefined); }
    try {
      const models: Array<'chatgpt' | 'gemini'> = [];
      if (useChatGpt) models.push('chatgpt');
      if (useGemini) models.push('gemini');
      const res = await fetch('/api/geo/citations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name: hospitalName,
          query: query.trim(),
          our_domains: ourDomains,
          campaign_id: campaignId || null,
          models,
        }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok) {
        setTopErr(data?.error || `HTTP ${res.status}`);
        if (data?.errors?.chatgpt) setChatgptErr(data.errors.chatgpt);
        if (data?.errors?.gemini) setGeminiErr(data.errors.gemini);
        return;
      }
      if (data.results?.chatgpt) setChatgptRow(data.results.chatgpt);
      if (data.results?.gemini) setGeminiRow(data.results.gemini);
      if (data.errors?.chatgpt) setChatgptErr(data.errors.chatgpt);
      if (data.errors?.gemini) setGeminiErr(data.errors.gemini);
      fetchRecent();
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : 'unknown');
    } finally {
      setAnalyzing(false);
    }
  }, [canAnalyze, useChatGpt, useGemini, hospitalName, query, ourDomains, campaignId, fetchRecent]);

  /** GEO-1.2 — 단일 model row 의 citations URL 들 패턴 분석. */
  const decomposeFor = useCallback(async (
    row: CitationRow,
    setLoading: (b: boolean) => void,
    setResults: (rs: PatternResult[]) => void,
  ) => {
    const urls = (row.citations || []).map(c => c.url).filter(u => /^https?:\/\//i.test(u));
    if (urls.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/geo/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urls.slice(0, 10) }),
      });
      const data = (await res.json()) as DecomposeResponse;
      if (Array.isArray(data?.results)) setResults(data.results);
    } catch {
      // 실패는 카드 상단 chip 으로 surface — silent
    } finally {
      setLoading(false);
    }
  }, []);

  const replayRecent = useCallback((row: CitationRow) => {
    setQuery(row.query);
    if (row.ai_model === 'chatgpt') { setChatgptRow(row); setChatgptPatterns(undefined); }
    if (row.ai_model === 'gemini') { setGeminiRow(row); setGeminiPatterns(undefined); }
    // 같은 시간대의 짝 행도 함께 표시
    const pair = recent.find(r =>
      r.query === row.query &&
      r.created_at && row.created_at &&
      Math.abs(new Date(r.created_at).getTime() - new Date(row.created_at).getTime()) < 90_000 &&
      r.ai_model !== row.ai_model,
    );
    if (pair) {
      if (pair.ai_model === 'chatgpt') { setChatgptRow(pair); setChatgptPatterns(undefined); }
      if (pair.ai_model === 'gemini') { setGeminiRow(pair); setGeminiPatterns(undefined); }
    }
  }, [recent]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700">🔍 AI 인용 출처 — ChatGPT + Gemini</h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            "어떤 게시물을 써야 AI 검색에서 인용되는지" 직접 확인. 쿼리를 넣으면 두 모델이 실제로
            인용하는 URL list 를 가져옵니다. <span className="text-indigo-600 font-medium">우리 사이트</span>는 강조 표시.
            결과 후 <span className="text-indigo-600 font-medium">📊 패턴 분석</span> 으로 인용된 URL 들의 콘텐츠 형식 (FAQ/비교표/의료진 등) 자동 분류.
          </p>
        </div>
      </div>

      {/* STEP 1 — our_domains chips */}
      <div className="mb-3 pt-3 border-t border-slate-100">
        <label className="text-[11px] font-medium text-slate-600 block mb-1.5">
          STEP 1 · 우리 도메인 (인용 매칭 기준)
        </label>
        <div className="flex flex-wrap gap-1.5 items-center">
          {ourDomains.map(d => (
            <span
              key={d}
              className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[11px] px-2 py-1 rounded-full border border-indigo-200"
            >
              {d}
              <button
                type="button"
                onClick={() => removeDomain(d)}
                className="text-indigo-500 hover:text-indigo-700 cursor-pointer bg-transparent border-0 p-0 text-[12px] leading-none"
                aria-label={`${d} 제거`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
            placeholder="예: mysmile.co.kr"
            className="text-[11px] px-2 py-1 border border-slate-200 rounded-full focus:outline-none focus:border-indigo-400 min-w-[140px]"
          />
          <button
            type="button"
            onClick={addDomain}
            disabled={!domainInput.trim() || ourDomains.length >= 20}
            className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-slate-200"
          >
            추가
          </button>
        </div>
      </div>

      {/* STEP 2 — query + 모델 선택 + 분석 */}
      <div className="mb-3">
        <label className="text-[11px] font-medium text-slate-600 block mb-1.5">
          STEP 2 · 분석 쿼리 + 모델
        </label>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='예: "강남 임플란트 추천"'
            maxLength={500}
            className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
          />
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>제안:</span>
            {DEFAULT_QUERY_SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 cursor-pointer text-slate-600"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-700 cursor-pointer">
              <input type="checkbox" checked={useChatGpt} onChange={e => setUseChatGpt(e.target.checked)} />
              ChatGPT
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-slate-700 cursor-pointer">
              <input type="checkbox" checked={useGemini} onChange={e => setUseGemini(e.target.checked)} />
              Gemini
            </label>
            <div className="flex-1" />
            <button
              type="button"
              onClick={analyze}
              disabled={!canAnalyze}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[12px] font-medium px-3 py-1.5 rounded-lg cursor-pointer"
            >
              {analyzing ? '분석 중…' : '🔍 분석 시작'}
            </button>
          </div>
          {topErr && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mt-1">
              {topErr}
            </div>
          )}
        </div>
      </div>

      {/* STEP 3 — 결과 카드 (좌 ChatGPT / 우 Gemini) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <ResultCard
          label="ChatGPT"
          emoji="💬"
          row={chatgptRow}
          error={chatgptErr}
          patterns={chatgptPatterns}
          patternsLoading={chatgptPatternsLoading}
          onDecompose={chatgptRow ? () => decomposeFor(chatgptRow, setChatgptPatternsLoading, setChatgptPatterns) : undefined}
        />
        <ResultCard
          label="Gemini"
          emoji="✨"
          row={geminiRow}
          error={geminiErr}
          patterns={geminiPatterns}
          patternsLoading={geminiPatternsLoading}
          onDecompose={geminiRow ? () => decomposeFor(geminiRow, setGeminiPatternsLoading, setGeminiPatterns) : undefined}
        />
      </div>

      {/* STEP 4 — 최근 분석 N건 */}
      <div className="pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-medium text-slate-600">
            STEP 4 · 최근 분석 ({recent.length})
          </label>
          {recentLoading && <span className="text-[10px] text-slate-400">로딩…</span>}
        </div>
        {recent.length === 0 ? (
          <p className="text-[11px] text-slate-500">분석 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1.5 pr-2">시간</th>
                  <th className="py-1.5 pr-2">모델</th>
                  <th className="py-1.5 pr-2">쿼리</th>
                  <th className="py-1.5 pr-2 text-right">우리</th>
                  <th className="py-1.5 pr-2 text-right">총</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => {
                  const ours = (r.citations || []).filter(c => c.is_ours).length;
                  return (
                    <tr
                      key={r.id || `${r.created_at}-${r.ai_model}`}
                      onClick={() => replayRecent(r)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">{formatTime(r.created_at)}</td>
                      <td className="py-1.5 pr-2 text-slate-700">{r.ai_model === 'chatgpt' ? '💬 ChatGPT' : '✨ Gemini'}</td>
                      <td className="py-1.5 pr-2 text-slate-800 truncate max-w-[300px]">{r.query}</td>
                      <td className={'py-1.5 pr-2 text-right font-medium ' + (ours > 0 ? 'text-indigo-700' : 'text-slate-400')}>{ours}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-600">{(r.citations || []).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
