'use client';

/**
 * HelpChatWidget — 대시보드 플로팅 도움말 챗봇 UI.
 *
 * 특징:
 *   - 우측 하단 고정 버튼(물음표 + "도움말")
 *   - 클릭 시 대화창 열림/닫힘 (360×520 데스크톱, 95vw×70vh 모바일)
 *   - 현재 pathname 으로 domainHint 자동 추출 (/blog|clinical|press|refine|others)
 *   - 최근 4턴만 서버에 전송 (슬라이싱은 클라이언트에서)
 *   - 전체 대화는 localStorage('winaid_help_chat') 에 최근 30턴 저장 (새로고침 복구)
 *   - Enter 전송 / Shift+Enter 줄바꿈
 *   - 429 응답 시 retryAfter 초 안내
 *   - 첫 화면에 도메인별 제안 질문 3개 버튼
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { HelpDomain } from '../lib/helpFaq';

// ── 타입 ──

type Role = 'user' | 'model';
interface ChatMessage {
  role: Role;
  text: string;
  ts: number;
}

// ── 상수 ──

const STORAGE_KEY = 'winaid_help_chat';
const MAX_STORED_TURNS = 30;
const MAX_SEND_TURNS = 4;

const DOMAIN_SUGGESTIONS: Record<HelpDomain, string[]> = {
  blog: [
    '5단계가 뭐예요?',
    '말투 학습은 어떻게 해요?',
    '이미지 스타일 어떻게 골라요?',
  ],
  press: [
    '기사 타입 뭐가 있어요?',
    '3인칭 문체가 뭐예요?',
    '길이는 어떻게 정해요?',
  ],
  refine: [
    '보정 모드 6개가 뭐예요?',
    '채팅 모드 뭐가 달라요?',
    '의료법 자동 수정 어디까지?',
  ],
  clinical: [
    '임상 글이 뭐예요?',
    '일반 블로그랑 뭐가 달라요?',
    '참고문헌 나와요?',
  ],
  general: [
    '블로그 만드는 데 얼마나 걸려요?',
    '게스트도 쓸 수 있어요?',
    '요금제가 뭐예요?',
  ],
};

function detectDomainFromPath(pathname: string | null): HelpDomain {
  if (!pathname) return 'general';
  if (pathname.startsWith('/blog')) return 'blog';
  if (pathname.startsWith('/clinical')) return 'clinical';
  if (pathname.startsWith('/press')) return 'press';
  if (pathname.startsWith('/refine')) return 'refine';
  return 'general';
}

// ── localStorage 헬퍼 (SSR 안전) ──

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ChatMessage =>
        !!m &&
        typeof m === 'object' &&
        (m as ChatMessage).role !== undefined &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'model') &&
        typeof (m as ChatMessage).text === 'string',
      )
      .slice(-MAX_STORED_TURNS);
  } catch {
    return [];
  }
}

function saveStoredMessages(msgs: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = msgs.slice(-MAX_STORED_TURNS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded 등 — 조용히 무시
  }
}

// ── 컴포넌트 ──

export interface HelpChatWidgetProps {
  disabled?: boolean;
}

export default function HelpChatWidget({ disabled = false }: HelpChatWidgetProps) {
  const pathname = usePathname();
  const domainHint = useMemo(() => detectDomainFromPath(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 최초 마운트 시 localStorage 복구
  useEffect(() => {
    setMessages(loadStoredMessages());
  }, []);

  // 메시지 변경 시 localStorage 저장 + 스크롤 하단
  useEffect(() => {
    saveStoredMessages(messages);
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // 대화창 열릴 때 포커스
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  const suggestions = DOMAIN_SUGGESTIONS[domainHint];

  // ── 전송 ──
  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;

    setErrorMsg(null);
    const userMsg: ChatMessage = { role: 'user', text, ts: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    // 최근 4턴만 서버에 전송 (현재 user 턴 포함 전까지)
    const historyForServer = nextMessages
      .slice(0, -1) // 방금 추가한 user 는 prompt 로 따로 보냄
      .slice(-MAX_SEND_TURNS)
      .map(m => ({ role: m.role, text: m.text }));

    try {
      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          domainHint,
          history: historyForServer,
        }),
      });

      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { retryAfter?: number };
        const sec = data.retryAfter ?? 30;
        setErrorMsg(`잠시 후 다시 시도해주세요. (${sec}초)`);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error || `오류가 발생했어요 (${res.status})`);
        setLoading(false);
        return;
      }

      const data = (await res.json()) as { text?: string };
      const answer = (data.text || '').trim() || '죄송해요, 답을 생성하지 못했어요.';
      setMessages(prev => [...prev, { role: 'model', text: answer, ts: Date.now() }]);
    } catch {
      setErrorMsg('네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [loading, messages, domainHint]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }, [input, send]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setErrorMsg(null);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, []);

  if (disabled) return null;

  return (
    <>
      {/* ── 플로팅 버튼 ── */}
      {!open && (
        <button
          type="button"
          aria-label="도움말 열기"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-blue-500 px-4 py-3 text-white shadow-lg transition hover:bg-blue-600 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-sm font-medium">도움말</span>
        </button>
      )}

      {/* ── 대화창 ── */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{ width: 'min(360px, 95vw)', height: 'min(520px, 70vh)' }}
          role="dialog"
          aria-label="도움말 챗봇"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-blue-500 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">WINAI 도움말</span>
              <span className="rounded bg-blue-400/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {domainHint}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="대화 초기화"
                  className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
                  title="대화 초기화"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* 메시지 리스트 */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.length === 0 && (
              <>
                <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                  안녕하세요! 블로그·임상·보도자료·AI 보정에 대해 궁금한 점을 편하게 물어봐 주세요.
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-slate-400">추천 질문</div>
                  {suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, idx) => (
              <div
                key={`${m.ts}-${idx}`}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm shadow-sm ${
                    m.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">
                  답변 생성 중...
                </div>
              </div>
            )}
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {errorMsg}
              </div>
            )}
          </div>

          {/* 입력창 */}
          <div className="border-t border-slate-100 bg-white px-3 py-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="오타·축약 OK. 편하게 물어보세요."
                rows={1}
                maxLength={1500}
                className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none"
                style={{ maxHeight: 120 }}
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={loading || !input.trim()}
                className="shrink-0 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                전송
              </button>
            </div>
            <div className="mt-1 text-[10px] text-slate-300">
              Enter 전송 · Shift+Enter 줄바꿈
            </div>
          </div>
        </div>
      )}
    </>
  );
}
