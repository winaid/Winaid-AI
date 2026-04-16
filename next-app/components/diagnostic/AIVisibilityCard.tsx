'use client';

import { useEffect, useRef, useState } from 'react';
import type { AIVisibility } from '../../lib/diagnostic/types';

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
}

type StreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; query: string; answerText: string }
  | { phase: 'done'; query: string; answerText: string; selfIncluded: boolean; selfRank: number | null; timestamp: string }
  | { phase: 'error'; message: string };

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

export default function AIVisibilityCard({ visibility, siteName, selfUrl }: AIVisibilityCardProps) {
  const meta = LIKELIHOOD_META[visibility.likelihood];
  const pm = PLATFORM_META[visibility.platform];

  const [state, setState] = useState<StreamState>({ phase: 'idle' });
  const [customQueryInput, setCustomQueryInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // unmount 시 in-flight stream 정리
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
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

    setState({ phase: 'streaming', query: trimmed || '…', answerText: '' });

    try {
      const res = await fetch('/api/diagnostic/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: selfUrl,
          customQuery: trimmed || undefined,
          platform: visibility.platform,
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
            }));
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
          return {
            phase: 'done',
            query: prev.query,
            answerText: prev.answerText,
            selfIncluded: false,
            selfRank: null,
            timestamp: new Date().toISOString(),
          };
        }
        return { phase: 'error', message: '답변을 받지 못하고 스트림이 종료되었습니다.' };
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // 사용자가 중단 — idle 로 복귀 (검색어 입력은 유지)
        setState({ phase: 'idle' });
      } else {
        setState({
          phase: 'error',
          message: (e as Error)?.message?.slice(0, 200) || '실측 중 오류가 발생했습니다.',
        });
      }
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    setState({ phase: 'idle' });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[220px] overflow-hidden">
      {/* ── 예측 + reason ── */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">{pm.emoji}</span>
            <h3 className="text-base font-bold text-slate-800">{visibility.platform}</h3>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-bold border ${meta.color}`}
            aria-label={`노출 가능성 ${meta.label}`}
          >
            {meta.emoji} {meta.label}
          </span>
        </div>
        <p className="mt-3 text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">
          {visibility.reason}
        </p>
      </div>

      {/* ── 실측 섹션 — phase 별 ── */}
      <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 flex-1">
        {state.phase === 'idle' && (
          <div>
            <label
              htmlFor={`diag-stream-query-${visibility.platform}`}
              className="block text-[11px] font-bold text-slate-600 mb-1"
            >
              🔍 실측 검색어 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              id={`diag-stream-query-${visibility.platform}`}
              type="text"
              value={customQueryInput}
              onChange={(e) => setCustomQueryInput(e.target.value)}
              placeholder="예: 안산 치과 추천 (비우면 자동 추출)"
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

        {state.phase === 'done' && (
          <div>
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
            <div className="text-[14px] leading-[1.8] text-slate-700 whitespace-pre-line bg-white rounded-lg p-4 border border-slate-200">
              {state.answerText || '(빈 답변을 받았습니다)'}
            </div>

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

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                위 답변은 {visibility.platform} 가 사용자 질문에 직접 응답한 내용입니다. 검색 시점·쿼리에 따라 달라질 수 있습니다.
              </p>
              <button
                type="button"
                onClick={reset}
                className="flex-none text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
              >
                🔄 다시 실측
              </button>
            </div>
          </div>
        )}

        {state.phase === 'error' && (
          <div>
            <p className="text-[12px] text-slate-600 leading-relaxed mb-2">
              {friendlyFailureText}
            </p>
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
