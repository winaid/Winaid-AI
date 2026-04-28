'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AIVisibility, AIPlatform, MeasurementData } from '../../lib/diagnostic/types';
import { authFetch } from '../../lib/authFetch';

// ── 출처·본문 파싱 유틸 ────────────────────────────────────
// 서버는 프롬프트 최소화로 원본 그대로를 돌려주니 클라이언트에서 마크다운을 정리한다.
// 외부 dependency 금지 — 허용 태그 이외는 React 가 자동 이스케이프하므로 안전.

export interface BadgeSource {
  host: string;
  url: string;
}

const TRACKING_KEYS = /^(utm_|ref$|gclid$|fbclid$|mc_|yclid$|_hsenc$|_hsmi$)/i;

function stripTrackingParams(raw: string): string {
  try {
    const u = new URL(raw);
    const toDelete: string[] = [];
    u.searchParams.forEach((_, k) => {
      if (TRACKING_KEYS.test(k)) toDelete.push(k);
    });
    for (const k of toDelete) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return raw;
  }
}

function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url;
  }
}

/** http(s) 스킴만 허용. 그 외(javascript:, data:, file:…)는 버림. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * 본문에서 URL 을 추출해 host 기준 dedupe, 등장 순서 유지.
 * [label](url) 마크다운 링크 + 맨 URL 둘 다 커버.
 */
function extractSources(text: string): BadgeSource[] {
  const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const BARE_URL = /https?:\/\/[^\s)>\]"',]+/g;
  const seen = new Set<string>();
  const out: BadgeSource[] = [];
  const push = (raw: string) => {
    const safe = safeHref(raw);
    if (!safe) return;
    const clean = stripTrackingParams(safe);
    const host = prettyHost(clean);
    if (!host || seen.has(host)) return;
    seen.add(host);
    out.push({ host, url: clean });
  };
  for (const m of text.matchAll(MD_LINK)) push(m[2]);
  for (const m of text.matchAll(BARE_URL)) push(m[0]);
  return out;
}

/** `**bold**` → <strong>, 그 외 텍스트는 그대로. React 가 자동 이스케이프. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const BOLD = /\*\*([^*]+)\*\*/g;
  let idx = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={`${keyPrefix}-b-${idx++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * 마크다운 링크·맨 URL·`---` 를 본문에서 제거 + 공백 정돈.
 * 순서: md link → bare url → hr line → 공백 collapse.
 */
/**
 * 마크다운 테이블 → 평탄 bullet 리스트 문자열 변환.
 * ChatGPT 가 자주 쓰는 `| a | b | c |` + `|---|---|---|` 파이프 테이블이
 * 카드 폭 좁은 UI 에서 가로 스크롤·작은 글자로 가독성 나쁨 → 60대 친화 bullet 으로.
 *
 * 행별 변환 예:
 *   | 치과명 | 특징 | 주소 |
 *   |---|---|---|
 *   | A치과 | 야간진료 | 강남구 |
 *   →
 *   - **A치과** — 특징: 야간진료 · 주소: 강남구
 *
 * 테이블이 아니면 null 반환.
 */
function parseTableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

/** 전체 텍스트를 훑어 테이블 구간만 평탄 bullet 문자열로 치환. */
function flattenMarkdownTables(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (
      TABLE_ROW_RE.test(line) &&
      i + 1 < lines.length &&
      TABLE_DIVIDER_RE.test(lines[i + 1])
    ) {
      const headers = parseTableCells(line).filter(Boolean);
      i += 2; // 헤더 + 분리자 건너뜀
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        const cells = parseTableCells(lines[i]).filter(Boolean);
        if (cells.length > 0) rows.push(cells);
        i++;
      }
      for (const cells of rows) {
        const first = cells[0] ?? '';
        const rest = cells.slice(1);
        const restStr = rest
          .map((c, idx) => {
            const h = headers[idx + 1];
            return h ? `${h}: ${c}` : c;
          })
          .filter(Boolean)
          .join(' · ');
        out.push(restStr ? `- **${first}** — ${restStr}` : `- **${first}**`);
      }
      out.push(''); // 변환 블록 다음 줄 바꿈 (후속 블록 split 의 빈 줄 확보)
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

function cleanForBody(raw: string): string {
  let t = raw;
  // 1) 파이프 테이블 → 평탄 bullet (줄 단위라 가장 먼저).
  t = flattenMarkdownTables(t);
  // 2) 마크다운 링크 [label](url) → label 만 남김.
  t = t.replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1');
  // 3) 맨 URL 제거 (출처는 배지로 별도 노출).
  t = t.replace(/https?:\/\/[^\s)>\]"',]+/g, '');
  // 4) 도메인-only 괄호 인용 "(cashdoc.me)", "(adb2023.kr)" 제거.
  //    괄호 안에 영문자·숫자·하이픈·점만 있고 최소 하나의 점을 포함할 때만.
  //    → "(평점 4.66/5)", "(인비절라인)", "(고잔동/중앙역)" 같은 정상 괄호는 보존.
  t = t.replace(/(^|\s)\(\s*([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\s*\)/gi, '$1');
  // 5) 수평선 라인 제거.
  t = t.replace(/^\s*[-_*]{3,}\s*$/gm, '');
  // 6) 공백 collapse.
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

const BULLET_RE = /^\s*[-•*]\s+/;
const NUMBER_RE = /^\s*\d+[.)]\s+/;
const HEADER_RE = /^\s*(#{2,3})\s+(.+?)\s*#*\s*$/;

/**
 * 답변을 React 노드 트리로 파싱.
 * 블록: 빈 줄 구분. 각 블록 내부에서 bullet/number 연속은 ul/ol 로 그룹핑.
 * 본문 안의 URL 은 이미 cleanForBody 에서 제거됨 — sources 는 상위에서 별도 처리.
 */
function parseAnswer(raw: string): ReactNode {
  const cleaned = cleanForBody(raw);
  if (!cleaned) return null;
  const blocks = cleaned.split(/\n\s*\n/);
  const out: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    let i = 0;
    let sub = 0;
    while (i < lines.length) {
      const headerMatch = HEADER_RE.exec(lines[i]);
      if (headerMatch) {
        // ## / ### 헤더 → <h3> (ChatGPT 의 "## ✅", "### 요약" 류 정돈)
        out.push(
          <h3
            key={`b${bi}-h${sub++}`}
            className="mt-4 mb-2 text-[14px] font-bold text-slate-800"
          >
            {renderInline(headerMatch[2], `b${bi}-h${sub}`)}
          </h3>,
        );
        i++;
      } else if (BULLET_RE.test(lines[i])) {
        const items: string[] = [];
        while (i < lines.length && BULLET_RE.test(lines[i])) {
          items.push(lines[i].replace(BULLET_RE, ''));
          i++;
        }
        out.push(
          <ul key={`b${bi}-ul${sub++}`} className="list-disc pl-5 space-y-1 my-2">
            {items.map((it, k) => <li key={k}>{renderInline(it, `b${bi}-u${k}`)}</li>)}
          </ul>,
        );
      } else if (NUMBER_RE.test(lines[i])) {
        const items: string[] = [];
        while (i < lines.length && NUMBER_RE.test(lines[i])) {
          items.push(lines[i].replace(NUMBER_RE, ''));
          i++;
        }
        out.push(
          <ol key={`b${bi}-ol${sub++}`} className="list-decimal pl-5 space-y-1 my-2">
            {items.map((it, k) => <li key={k}>{renderInline(it, `b${bi}-n${k}`)}</li>)}
          </ol>,
        );
      } else {
        const para: string[] = [];
        while (
          i < lines.length &&
          !BULLET_RE.test(lines[i]) &&
          !NUMBER_RE.test(lines[i]) &&
          !HEADER_RE.test(lines[i])
        ) {
          para.push(lines[i]);
          i++;
        }
        out.push(
          <p key={`b${bi}-p${sub++}`} className="my-1.5">
            {renderInline(para.join(' '), `b${bi}-p${sub}`)}
          </p>,
        );
      }
    }
  });
  return out;
}

// ── 출처 배지 서브컴포넌트 ─────────────────────────────────

const BADGE_BASE =
  'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 ' +
  'text-[13px] leading-none font-medium text-slate-700 whitespace-nowrap max-w-[14rem] ' +
  'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
  'active:scale-[0.98] active:bg-slate-100';

const BADGE_ACCENT: Record<AIVisibility['platform'], string> = {
  ChatGPT:
    'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 ' +
    'hover:shadow-[0_1px_2px_rgba(16,185,129,0.15)] focus-visible:ring-emerald-400 visited:text-slate-700',
  Gemini:
    'hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 ' +
    'hover:shadow-[0_1px_2px_rgba(14,165,233,0.15)] focus-visible:ring-sky-400 visited:text-slate-700',
};

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 text-slate-400"
    >
      <path d="M11 5h4v4" />
      <path d="M15 5l-7 7" />
      <path d="M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

function SourceBadge({
  source,
  platform,
}: {
  source: BadgeSource;
  platform: AIVisibility['platform'];
}) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={source.url}
      aria-label={`${source.host} 출처 새 탭 열기`}
      className={`${BADGE_BASE} ${BADGE_ACCENT[platform]}`}
    >
      <ExternalIcon />
      <span className="truncate">{source.host}</span>
    </a>
  );
}

function MoreBadge({
  count,
  expanded,
  onClick,
  controlsId,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className={
        `${BADGE_BASE} text-slate-500 hover:border-slate-300 hover:bg-slate-50 ` +
        'hover:text-slate-700 focus-visible:ring-slate-400'
      }
    >
      {expanded ? '접기' : `+${count}개`}
    </button>
  );
}

/**
 * AIVisibilityCard — 플랫폼별 AI 노출 예측 + 실측(Streaming) UI (단계 S-B)
 *
 * 각 카드가 자체 상태 머신을 가지고 /api/diagnostic/stream 을 독립 소비.
 * SSE chunk 를 실시간으로 append 해 ChatGPT 웹 경험을 재현.
 */

interface AIVisibilityCardProps {
  visibility: AIVisibility;
  siteName?: string;
  /** 진단된 URL — /api/diagnostic/stream 에 body.url 로 전달 */
  selfUrl: string;
  /** C+B 강화안: 실측 완료 시 부모에게 결과 전달 (해설 갱신 버튼 활성화용) */
  onMeasurementDone?: (platform: AIPlatform, data: MeasurementData) => void;
  /** Phase 3: 4가지 패턴 쿼리 — 진단 응답의 availableQueries. 없으면 단일 입력 모드 */
  availableQueries?: { id: string; label: string; query: string }[];
}

type StreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; query: string; answerText: string }
  | {
      phase: 'done';
      query: string;
      answerText: string;
      selfIncluded: boolean;
      selfRank: number | null;
      timestamp: string;
      /** 핫픽스: 서버가 finishReason MAX_TOKENS/SAFETY 등으로 비정상 종료라고 알리면 true */
      truncated: boolean;
      /** 서버가 done 이벤트에 실어보낸 출처 (Gemini grounding 우선, 없으면 본문 regex) */
      sources: BadgeSource[];
      /** finishReason 원문 (SAFETY 감지·디버그용) */
      reason?: string;
    }
  | { phase: 'error'; message: string; autoRetrying?: boolean };

const LIKELIHOOD_META: Record<AIVisibility['likelihood'], { label: string; color: string; emoji: string }> = {
  high: { label: '높음', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', emoji: '🟢' },
  medium: { label: '보통', color: 'bg-amber-50 text-amber-700 border-amber-200', emoji: '🟡' },
  low: { label: '낮음', color: 'bg-red-50 text-red-700 border-red-200', emoji: '🔴' },
};

const PLATFORM_META: Record<AIVisibility['platform'], { emoji: string; buttonCls: string }> = {
  ChatGPT: { emoji: '💬', buttonCls: 'bg-blue-600 hover:bg-blue-700' },
  Gemini: { emoji: '✨', buttonCls: 'bg-indigo-600 hover:bg-indigo-700' },
};

const MAX_QUERY_LEN = 100;

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm} 기준`;
  } catch {
    return '';
  }
}

export default function AIVisibilityCard({ visibility, siteName, selfUrl, onMeasurementDone, availableQueries }: AIVisibilityCardProps) {
  const meta = LIKELIHOOD_META[visibility.likelihood];
  const pm = PLATFORM_META[visibility.platform];

  const [state, setState] = useState<StreamState>({ phase: 'idle' });
  const [customQueryInput, setCustomQueryInput] = useState('');
  // Phase 3: 다중 쿼리 선택 (드롭다운). 기본값 'recommend'. customQuery 입력하면 무시.
  const [selectedQueryId, setSelectedQueryId] = useState<string>(
    availableQueries?.[0]?.id ?? 'recommend',
  );
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** 네트워크 drop 자동 재시도 횟수 — 1회만 허용. reset 시 0 으로 초기화. */
  const retryCountRef = useRef(0);
  /** 자동 재시도 타이머 — reset / unmount 시 cancel */
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // unmount 시 in-flight stream + 대기 중 자동 재시도 타이머 정리
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
    };
  }, []);

  const friendlyFailureText =
    visibility.platform === 'ChatGPT'
      ? 'ChatGPT 는 한국 지역 검색에서 결과를 찾지 못하는 경우가 있습니다. Gemini 결과를 함께 참고해 주세요.'
      : '이번엔 실측 답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.';

  async function startStream() {
    const trimmed = customQueryInput.trim().slice(0, MAX_QUERY_LEN);

    // 이전 in-flight 가 있으면 중단
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Phase 3: customQuery 가 있으면 그것 사용, 없으면 selectedQueryId 의 쿼리 텍스트 표시
    const selectedQuery = availableQueries?.find((q) => q.id === selectedQueryId)?.query;
    const displayQuery = trimmed || selectedQuery || '…';
    setState({ phase: 'streaming', query: displayQuery, answerText: '' });

    try {
      const res = await authFetch('/api/diagnostic/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: selfUrl,
          customQuery: trimmed || undefined,
          platform: visibility.platform,
          ...(trimmed ? {} : { queryId: selectedQueryId }),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` · ${text.slice(0, 120)}` : ''}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트는 \n\n 로 구분. 마지막 미완성 조각은 buffer 로 보존.
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith('data: ')) continue;
          let payload: {
            type?: string;
            query?: string;
            text?: string;
            answerText?: string;
            selfIncluded?: boolean;
            selfRank?: number | null;
            timestamp?: string;
            message?: string;
            truncated?: boolean;
            reason?: string;
            sources?: unknown;
            topResults?: unknown;
          };
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (payload.type === 'start') {
            setState({
              phase: 'streaming',
              query: typeof payload.query === 'string' ? payload.query : trimmed || '…',
              answerText: '',
            });
          } else if (payload.type === 'chunk') {
            const t = typeof payload.text === 'string' ? payload.text : '';
            if (!t) continue;
            setState((prev) =>
              prev.phase === 'streaming'
                ? { ...prev, answerText: prev.answerText + t }
                : prev,
            );
          } else if (payload.type === 'done') {
            // 서버가 done 에 실어보낸 sources 만 XSS 관점에서 재검증 후 받아씀.
            const rawSources = Array.isArray(payload.sources) ? payload.sources : [];
            const sources: BadgeSource[] = [];
            for (const s of rawSources) {
              if (!s || typeof s !== 'object') continue;
              const obj = s as { host?: unknown; url?: unknown };
              if (typeof obj.host !== 'string' || typeof obj.url !== 'string') continue;
              if (!/^https?:\/\//i.test(obj.url)) continue;
              if (sources.some((x) => x.host === obj.host)) continue;
              sources.push({ host: obj.host, url: obj.url });
            }
            setState((prev) => ({
              phase: 'done',
              query:
                typeof payload.query === 'string'
                  ? payload.query
                  : prev.phase === 'streaming'
                    ? prev.query
                    : trimmed || '…',
              answerText:
                typeof payload.answerText === 'string'
                  ? payload.answerText
                  : prev.phase === 'streaming'
                    ? prev.answerText
                    : '',
              selfIncluded: !!payload.selfIncluded,
              selfRank: typeof payload.selfRank === 'number' ? payload.selfRank : null,
              timestamp:
                typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString(),
              truncated: !!payload.truncated,
              reason: typeof payload.reason === 'string' ? payload.reason : undefined,
              sources,
            }));
            // C+B 강화안: 부모에게 실측 결과 전달 (해설 갱신 버튼 활성화용)
            // Tier 3-B: topResultUrls 추출 (경쟁사 GAP 자동 채움용)
            // Phase 3: title/domain/rank 포함 full topResults 도 함께 전달 (자동 경쟁사 카드용)
            const rawResults = Array.isArray(payload.topResults) ? payload.topResults : [];
            const fullResults = rawResults
              .filter((r: { url?: string; title?: string; domain?: string; rank?: number }) =>
                typeof r?.url === 'string' && typeof r?.domain === 'string',
              )
              .map((r: { url: string; title?: string; domain: string; rank?: number }, i: number) => ({
                url: r.url,
                title: typeof r.title === 'string' ? r.title : r.domain,
                domain: r.domain,
                rank: typeof r.rank === 'number' ? r.rank : i + 1,
              }))
              .slice(0, 5);
            const topUrls = fullResults.map((r: { url: string }) => r.url);
            onMeasurementDone?.(visibility.platform as AIPlatform, {
              selfIncluded: !!payload.selfIncluded,
              selfRank: typeof payload.selfRank === 'number' ? payload.selfRank : null,
              queryUsed: trimmed || '(자동)',
              answerText: typeof payload.answerText === 'string' ? payload.answerText : '',
              topResultUrls: topUrls.length > 0 ? topUrls : undefined,
              topResults: fullResults.length > 0 ? fullResults : undefined,
            });
          } else if (payload.type === 'error') {
            setState({
              phase: 'error',
              message: typeof payload.message === 'string' ? payload.message : 'unknown',
            });
          }
        }
      }

      // 스트림이 done/error 이벤트 없이 종료된 경우의 안전망
      setState((prev) => {
        if (prev.phase !== 'streaming') return prev;
        if (prev.answerText.length > 0) {
          // 메타가 안 왔으니 sources 는 본문 regex fallback
          const sources = extractSources(prev.answerText);
          return {
            phase: 'done',
            query: prev.query,
            answerText: prev.answerText,
            selfIncluded: false,
            selfRank: null,
            timestamp: new Date().toISOString(),
            truncated: true, // done 이벤트 없이 끊김 = 잘림으로 간주
            sources,
          };
        }
        return { phase: 'error', message: '답변을 받지 못하고 스트림이 종료되었습니다.' };
      });
      // 안전망에서 done 전이 시에도 부모 콜백 (selfIncluded=false)
      setState((prev) => {
        if (prev.phase === 'done') {
          onMeasurementDone?.(visibility.platform as AIPlatform, {
            selfIncluded: prev.selfIncluded,
            selfRank: prev.selfRank,
            queryUsed: trimmed || '(자동)',
            answerText: prev.answerText,
          });
        }
        return prev;
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // 사용자가 중단 — idle 로 복귀 (검색어 입력은 유지)
        setState({ phase: 'idle' });
      } else {
        const msg = (e as Error)?.message?.slice(0, 200) || '실측 중 오류가 발생했습니다.';
        // 네트워크 drop 등 비-Abort 예외 → 1회만 자동 재시도 (600ms 후)
        if (retryCountRef.current < 1) {
          retryCountRef.current += 1;
          setState({ phase: 'error', message: msg, autoRetrying: true });
          if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
          autoRetryTimerRef.current = setTimeout(() => {
            autoRetryTimerRef.current = null;
            startStream();
          }, 600);
        } else {
          setState({ phase: 'error', message: msg });
        }
      }
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    retryCountRef.current = 0;
    setSourcesExpanded(false);
    setState({ phase: 'idle' });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[220px] overflow-hidden">
      {/* ── 예측 + reason ── */}
      <div className="p-5 flex-1">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">{pm.emoji}</span>
            <h3 className="text-base font-bold text-slate-800">{visibility.platform}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-bold border ${meta.color}`}
              aria-label={`노출 가능성 ${meta.label}`}
            >
              {meta.emoji} {meta.label}
            </span>
            {/* 실측 배지 — done phase 에서만 표시 */}
            {state.phase === 'done' && (
              state.selfIncluded ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                  ✅ {state.selfRank ? `${state.selfRank}위 노출` : '노출 확인'}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-red-50 text-red-600 border-red-200">
                  ❌ 미노출
                </span>
              )
            )}
          </div>
        </div>
        <p className="mt-3 text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">
          {visibility.reason}
        </p>
        {/* 실측 사실 suffix — done 시 reason 아래 한 줄 */}
        {state.phase === 'done' && (
          <p className="mt-2 text-[13px] font-medium text-slate-700">
            📍 실측 결과: {visibility.platform} 답변에서{' '}
            {state.selfIncluded
              ? state.selfRank
                ? `${state.selfRank}위로 포함되었습니다.`
                : '포함된 것이 확인되었습니다.'
              : '확인되지 않았습니다. 검색어나 시점에 따라 달라질 수 있습니다.'}
          </p>
        )}
      </div>

      {/* ── 실측 섹션 — phase 별. done phase 내부에서 mt-auto 가 먹도록 flex col 보장. ── */}
      <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 flex flex-col">
        {state.phase === 'idle' && (
          <div>
            {availableQueries && availableQueries.length > 1 && !customQueryInput.trim() && (
              <div className="mb-2">
                <label
                  htmlFor={`diag-query-pattern-${visibility.platform}`}
                  className="block text-[11px] font-bold text-slate-600 mb-1"
                >
                  📋 쿼리 패턴 <span className="font-normal text-slate-400">(자동 추천)</span>
                </label>
                <select
                  id={`diag-query-pattern-${visibility.platform}`}
                  value={selectedQueryId}
                  onChange={(e) => setSelectedQueryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  {availableQueries.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label} — {q.query}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label
              htmlFor={`diag-stream-query-${visibility.platform}`}
              className="block text-[11px] font-bold text-slate-600 mb-1"
            >
              🔍 직접 입력 <span className="font-normal text-slate-400">(선택, 입력 시 위 패턴 무시)</span>
            </label>
            <input
              id={`diag-stream-query-${visibility.platform}`}
              type="text"
              value={customQueryInput}
              onChange={(e) => setCustomQueryInput(e.target.value)}
              placeholder="예: 안산 치과 추천 (비우면 위 패턴 사용)"
              maxLength={MAX_QUERY_LEN}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 mb-2"
            />
            <button
              type="button"
              onClick={startStream}
              className={`w-full px-4 py-2.5 rounded-lg text-sm font-bold text-white ${pm.buttonCls} transition-colors`}
            >
              {pm.emoji} {visibility.platform} 로 실측하기
            </button>
            <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
              클릭하면 {visibility.platform} 에 실제로 물어본 답변을 실시간으로 보여줍니다. 약 30~90초 소요.
            </p>
          </div>
        )}

        {state.phase === 'streaming' && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[12px] font-bold text-slate-700 truncate">
                🔍 &ldquo;{state.query}&rdquo; 생성 중…
              </p>
              <button
                type="button"
                onClick={cancel}
                className="flex-none text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
              >
                ⏸ 중단
              </button>
            </div>
            <div className="text-[14px] leading-[1.8] text-slate-700 whitespace-pre-line bg-white rounded-lg p-4 border border-slate-200 min-h-[100px]">
              {state.answerText}
              <span
                className="inline-block ml-0.5 animate-pulse text-slate-400"
                aria-hidden="true"
              >
                ▮
              </span>
            </div>
            {state.answerText.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                {visibility.platform} 가 답변을 준비하는 중입니다…
              </p>
            )}
          </div>
        )}

        {state.phase === 'done' && (() => {
          const trimmedAnswer = state.answerText.trim();
          const isEmpty = trimmedAnswer.length === 0;
          const isTooShort = !isEmpty && trimmedAnswer.length < 30;
          // AI 안전필터 거부 감지: finishReason SAFETY 또는 짧은 답변에 거부 키워드.
          const REFUSAL_HINTS = /죄송|도움을 드릴 수 없|제공할 수 없|답변을 드릴 수 없|I can't|I cannot/i;
          const isRefused =
            state.reason === 'SAFETY' ||
            (isTooShort && REFUSAL_HINTS.test(trimmedAnswer));
          if (isEmpty || isTooShort || isRefused) {
            const anomalyText = isRefused
              ? 'AI 가 이 질문에 대한 답변을 거부했어요. 검색어를 바꿔서 다시 시도해 보세요.'
              : 'AI 로부터 의미 있는 답변을 받지 못했어요. 잠시 후 다시 시도해 보세요.';
            return (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-[12px] font-bold text-slate-700 truncate">
                    🔍 &ldquo;{state.query}&rdquo; 실측 결과
                  </p>
                  {state.timestamp && (
                    <span className="text-[10px] text-slate-400 flex-none">
                      {formatTimestamp(state.timestamp)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 bg-white rounded-lg p-4 border border-slate-200 leading-relaxed">
                  {anomalyText}
                  {trimmedAnswer && !isRefused && (
                    <span className="mt-2 block text-[11px] text-slate-400">
                      (받은 답변: &ldquo;{trimmedAnswer.slice(0, 60)}&rdquo;)
                    </span>
                  )}
                </div>
                <div className="mt-auto pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSourcesExpanded(false);
                      reset();
                    }}
                    className="text-[12px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    🔄 다시 실측
                  </button>
                </div>
              </div>
            );
          }
          const parsedBody = parseAnswer(state.answerText);
          const MAX_VISIBLE = 5;
          const visibleSources = sourcesExpanded
            ? state.sources
            : state.sources.slice(0, MAX_VISIBLE);
          const remaining = Math.max(0, state.sources.length - MAX_VISIBLE);
          const sourcesId = `diag-sources-${visibility.platform}`;
          return (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[12px] font-bold text-slate-700 truncate">
                  🔍 &ldquo;{state.query}&rdquo; 실제 검색 결과
                </p>
                {state.timestamp && (
                  <span className="text-[10px] text-slate-400 flex-none">
                    {formatTimestamp(state.timestamp)}
                  </span>
                )}
              </div>

              {/* 본문 — parseAnswer 로 마크다운 정돈, URL/각주는 sources 로 회수 */}
              <div className="text-[14px] leading-[1.8] text-slate-700 bg-white rounded-lg p-4 border border-slate-200">
                {parsedBody ?? <span className="text-slate-400">(빈 답변을 받았습니다)</span>}
              </div>

              {/* 잘림 안내 — finishReason MAX_TOKENS/SAFETY 혹은 스트림 비정상 종료 */}
              {state.truncated && (
                <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                  <span aria-hidden="true">⚠</span>
                  <span>응답이 길어져 일부가 생략되었어요</span>
                </p>
              )}

              {/* 참고 출처 — 서버 sources 만 사용 (Gemini grounding 우선, 없으면 본문 regex fallback) */}
              {state.sources.length > 0 && (
                <div
                  id={sourcesId}
                  className="mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2"
                >
                  <span className="mr-0.5 select-none text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    참고 출처
                  </span>
                  {visibleSources.map((s) => (
                    <SourceBadge key={s.host} source={s} platform={visibility.platform} />
                  ))}
                  {remaining > 0 && !sourcesExpanded && (
                    <MoreBadge
                      count={remaining}
                      expanded={false}
                      onClick={() => setSourcesExpanded(true)}
                      controlsId={sourcesId}
                    />
                  )}
                  {sourcesExpanded && state.sources.length > MAX_VISIBLE && (
                    <MoreBadge
                      count={0}
                      expanded={true}
                      onClick={() => setSourcesExpanded(false)}
                      controlsId={sourcesId}
                    />
                  )}
                </div>
              )}

              <div className="mt-3">
                {state.selfIncluded ? (
                  <div className="rounded-lg px-3 py-2 text-sm font-medium bg-green-50 text-green-800 border border-green-200">
                    ✅ {siteName || '본인 사이트'} URL 이 답변에 포함되어 있습니다
                    {state.selfRank ? ` (${state.selfRank}번째 언급)` : ''}
                  </div>
                ) : (
                  <div className="rounded-lg px-3 py-2 text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    ⚠️ {siteName || '본인 사이트'} URL 이 답변에 포함되어 있지 않습니다
                  </div>
                )}
              </div>

              <div className="mt-auto pt-4 flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  위 답변은 {visibility.platform} 가 사용자 질문에 직접 응답한 내용입니다. 검색 시점·쿼리에 따라 달라질 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSourcesExpanded(false);
                    reset();
                  }}
                  className="flex-none text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                  🔄 다시 실측
                </button>
              </div>
            </div>
          );
        })()}

        {state.phase === 'error' && (
          <div>
            {state.autoRetrying ? (
              <p className="text-[12px] text-slate-600 leading-relaxed mb-2 flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" aria-hidden="true" />
                연결이 끊겨 자동으로 다시 시도 중이에요…
              </p>
            ) : (
              <p className="text-[12px] text-slate-600 leading-relaxed mb-2">
                {friendlyFailureText}
              </p>
            )}
            <p className="text-[10px] text-slate-400 mb-3">내부 사유: {state.message}</p>
            <button
              type="button"
              onClick={reset}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              🔄 다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
