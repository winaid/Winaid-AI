'use client';

import { useState, useEffect, useRef } from 'react';
import { HERO, QUICK_TAGS, MORE_TAGS } from './landingData';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// systemInstruction은 /api/landing-chat 서버에서 하드코딩. 클라이언트가 임의로 지정할 수 없음.

const FALLBACK_MSG = '죄송해요, 답변을 생성하지 못했어요. 윈에이드 서비스에서 직접 확인해보시는 건 어떨까요?';

function LandingHero() {
  const [scrolled, setScrolled] = useState(false);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [chatCount, setChatCount] = useState(0);
  const MAX_CHAT_COUNT = 10;
  const chatOpen = chatMessages.length > 0;
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = async () => {
    const question = searchText.trim();
    if (!question || isChatting) return;

    // 세션당 최대 호출 횟수 제한
    if (chatCount >= MAX_CHAT_COUNT) {
      setChatMessages(prev => [...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: '무료 대화 횟수를 모두 사용했어요. 더 많은 기능을 사용하려면 로그인하세요! 👉 윈에이드에서 블로그, 카드뉴스, 보도자료까지 무제한으로 만들 수 있어요.' },
      ]);
      setSearchText('');
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: question };
    setChatMessages(prev => [...prev, userMsg]);
    setSearchText('');
    setIsChatting(true);
    setChatCount(prev => prev + 1);

    try {
      const history = [...chatMessages, userMsg]
        .slice(-6)
        .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
        .join('\n');

      const res = await fetch('/api/landing-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${history}\n\n사용자의 마지막 질문에 답변하세요.`,
        }),
      });

      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const text = data.text || data.candidates?.[0]?.content?.parts?.[0]?.text || FALLBACK_MSG;
      setChatMessages(prev => [...prev, { role: 'assistant', content: text }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: FALLBACK_MSG }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <>
      {/* ── Sticky Nav ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-slate-200/50'
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <div className={`flex items-center gap-3 transition-all duration-500 ${scrolled ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <img src="/280_logo.png" alt="" className="h-8 w-8" />
            <span className="font-black text-xl tracking-tight text-slate-800">
              WIN<span className="text-blue-600">AID</span>
            </span>
          </div>
          <a
            href="/auth"
            className="px-7 py-3 rounded-full font-black text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 hover:-translate-y-0.5 ring-2 ring-blue-600/20"
          >
            무료로 시작하기 &rarr;
          </a>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-blue-50/60 to-white" />
          <div className="absolute top-20 left-[10%] w-[300px] h-[300px] md:w-[600px] md:h-[600px] bg-gradient-to-br from-blue-300/30 to-cyan-200/20 rounded-full blur-[100px] md:blur-[150px]" />
          <div className="absolute bottom-20 right-[10%] w-[250px] h-[250px] md:w-[500px] md:h-[500px] bg-gradient-to-br from-violet-300/25 to-indigo-200/15 rounded-full blur-[80px] md:blur-[130px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[900px] md:h-[900px] bg-gradient-to-br from-blue-100/15 to-transparent rounded-full blur-[100px] md:blur-[180px]" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center w-full pt-20">
          {/* Logo */}
          <div className="flex flex-col items-center mb-12">
            <div className="flex items-center gap-3.5 mb-3">
              <img src="/280_logo.png" alt="" className="h-14 w-14" />
              <div className="flex items-center gap-0">
                {'윈에이드'.split('').map((char, i) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && <span className="w-px h-6 bg-slate-300 mx-2.5" />}
                    <span className="font-black text-3xl text-slate-800 tracking-tight">{char}</span>
                  </span>
                ))}
              </div>
            </div>
            <span className="text-[11px] font-semibold tracking-[0.35em] uppercase text-slate-400">advertising company</span>
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/60 backdrop-blur border border-white/40 shadow-lg shadow-blue-500/5 mb-8">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
            <span className="text-blue-700 font-bold text-xs tracking-wider">{HERO.badge}</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-900 mb-8 leading-[1.05] tracking-tight">
            {HERO.headingLine1}<br />
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">{HERO.headingHighlight}</span>
              <span className="absolute -bottom-2 left-0 right-0 h-4 bg-gradient-to-r from-blue-200/40 to-cyan-200/40 blur-lg rounded-full" />
            </span>
            {HERO.headingLine2}
          </h1>

          {/* Subcopy */}
          <p className="text-lg md:text-xl text-slate-500 mb-14 max-w-2xl mx-auto leading-relaxed font-medium">
            {HERO.sub}<br className="hidden md:block" />
            <strong className="text-slate-700">{HERO.subBold}</strong> {HERO.subSuffix}
          </p>

          {/* AI Chat Bar */}
          <div className="max-w-2xl mx-auto mb-10">
            <div className={`relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-slate-200/60 transition-all duration-500 overflow-hidden ${chatOpen ? 'shadow-[0_16px_60px_rgba(0,0,0,0.12)]' : 'hover:shadow-[0_12px_50px_rgba(0,0,0,0.12)]'}`}>
              {/* Chat messages */}
              {chatOpen && (
                <div className="max-h-[320px] overflow-y-auto px-5 pt-5 pb-2 space-y-3">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] ${msg.role === 'assistant' ? 'flex gap-2.5' : ''}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                          </div>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-slate-100 text-slate-700 rounded-bl-md'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex justify-start">
                      <div className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                        </div>
                        <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'assistant' && !isChatting && (
                    <div className="flex justify-center pt-2 pb-1">
                      <a
                        href="/auth"
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-bold rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                      >
                        윈에이드에서 직접 체험해보기 &rarr;
                      </a>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input */}
              <div className="p-2.5 flex items-center gap-3 group">
                <div className="pl-3">
                  {chatOpen ? (
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  )}
                </div>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={chatOpen ? HERO.chatActivePlaceholder : HERO.chatPlaceholder}
                  className="flex-1 py-3.5 text-base text-slate-700 placeholder-slate-400 bg-transparent outline-none font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (searchText.trim()) handleChatSubmit();
                    }
                  }}
                />
                {searchText.trim() ? (
                  <button
                    onClick={handleChatSubmit}
                    disabled={isChatting}
                    className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-black text-sm transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 disabled:opacity-60"
                  >
                    {isChatting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                    )}
                  </button>
                ) : (
                  <a
                    href="/auth"
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-black text-sm transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
                  >
                    시작하기
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Quick Tags */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-center gap-2.5 mb-3">
              {QUICK_TAGS.map((tag) => (
                <a
                  key={tag}
                  href="/auth"
                  className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-500 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/80 hover:shadow-sm transition-all"
                >
                  {tag}
                </a>
              ))}
            </div>
            {showMoreTags && (
              <div className="flex flex-wrap justify-center gap-2.5 mb-3">
                {MORE_TAGS.map((tag) => (
                  <a
                    key={tag}
                    href="/auth"
                    className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-500 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/80 hover:shadow-sm transition-all"
                  >
                    {tag}
                  </a>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowMoreTags(!showMoreTags)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1.5 mx-auto mt-3 font-medium"
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${showMoreTags ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
              {showMoreTags ? '접기' : '더 많은 기능 보기'}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export default LandingHero;
