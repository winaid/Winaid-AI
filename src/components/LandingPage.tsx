import React, { useState, useEffect, useRef } from 'react';
import { callGemini, GEMINI_MODEL } from '../services/geminiClient';

interface LandingPageProps {
  onStart: () => void;
  darkMode?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 윈에이드 실제 마케팅 병원 (winaid.co.kr 기반)
const PARTNER_HOSPITALS = [
  '연세올데이치과', '라온치과', '강남에스플란트치과', '뉴연세치과',
  '서울리마치과', '디오르치과', '예쁜미소치과', '바른이치과',
  '플란트치과', '하나로치과', '미르치과', '서울봄치과',
  '리더스치과', '에덴치과', '더미소치과', '연세퍼스트치과',
  '서울미소치과', '래미안치과', '클린치과', '서울밝은치과',
  '예담치과', '수플란트치과', '서울S치과', '뉴욕치과',
];

const CHAT_SYSTEM_PROMPT = `당신은 윈에이드(WINAID)의 AI 마케팅 어시스턴트입니다.
윈에이드는 13년 경력의 병원 마케팅 전문 회사로, AI 기반 병원 콘텐츠 자동 생성 플랫폼을 운영합니다.

주요 기능:
- 블로그 글 AI 자동 생성 (의료광고법 자동 검증 포함)
- 카드뉴스 자동 제작
- 보도자료 작성
- SEO 최적화 (네이버 스마트블록 상위노출)
- AI 이미지 생성
- 유사도 검사
- 300+ 병원 파트너, 500+ 의사 고객

규칙:
1. 사용자의 질문에 친절하고 전문적으로 답변하세요 (2-3문장으로 간결하게)
2. 답변 마지막에 반드시 윈에이드 서비스와 자연스럽게 연결하세요
3. "~요" 체로 친근하게 답변하세요
4. 병원 마케팅, 의료광고법, 블로그 SEO, 카드뉴스 등에 대한 질문에 특히 전문적으로 답변하세요
5. 답변은 한국어로만 하세요`;

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const [scrollY, setScrollY] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const marqueeRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = async () => {
    const question = searchText.trim();
    if (!question || isChatting) return;

    setChatOpen(true);
    const userMsg: ChatMessage = { role: 'user', content: question };
    setChatMessages(prev => [...prev, userMsg]);
    setSearchText('');
    setIsChatting(true);

    try {
      // Build conversation context
      const conversationHistory = [...chatMessages, userMsg]
        .slice(-6) // Keep last 6 messages for context
        .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
        .join('\n');

      const result = await callGemini({
        prompt: `${conversationHistory}\n\n사용자의 마지막 질문에 답변하세요.`,
        model: GEMINI_MODEL.FLASH,
        systemInstruction: CHAT_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 300,
      });

      const response = typeof result === 'string' ? result : (result?.text || result?.toString() || '답변을 생성하지 못했어요.');
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송해요, 답변을 생성하지 못했어요. 윈에이드 서비스에서 직접 확인해보시는 건 어떨까요?'
      }]);
    } finally {
      setIsChatting(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection Observer for fade-in animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const getAnimClass = (id: string, delay = 0) =>
    `transition-all duration-700 ${delay ? `delay-[${delay}ms]` : ''} ${
      visibleSections.has(id) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
    }`;

  const quickTags = [
    '#임플란트 블로그 자동 생성',
    '#의료광고법 검증',
    '#카드뉴스 제작',
    '#네이버 상위노출 SEO',
    '#교정 마케팅 콘텐츠',
    '#보도자료 작성',
  ];

  const moreTags = [
    '#치과 블로그 글감 추천',
    '#AI 이미지 생성',
    '#경쟁 병원 분석',
    '#휴진 안내 템플릿',
    '#시술 전후 비교 콘텐츠',
    '#병원 브랜딩 전략',
  ];

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-900 overflow-x-hidden">
      {/* 커스텀 스타일 */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-delay { animation: float 8s ease-in-out 2s infinite; }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }
      `}</style>

      {/* Sticky Nav - Glass Morphism */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrollY > 50
          ? 'bg-white/80 backdrop-blur-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-slate-200/50'
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <div className={`flex items-center gap-3 transition-all duration-500 ${scrollY > 50 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <img src="/280_logo.png" alt="" className="h-8 w-8 border-0 outline-none block" />
            <span className="font-black text-xl tracking-tight text-slate-800">
              WIN<span className="text-blue-600">AID</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onStart}
              className="px-7 py-3 rounded-full font-black text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 hover:-translate-y-0.5 ring-2 ring-blue-600/20"
            >
              무료로 시작하기 &rarr;
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════ */}
      {/* HERO SECTION */}
      {/* ═══════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/80 via-white to-[#fafbfc]" />
          <div className="absolute top-32 left-[15%] w-[500px] h-[500px] bg-gradient-to-br from-blue-200/40 to-cyan-200/30 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-32 right-[15%] w-[400px] h-[400px] bg-gradient-to-br from-violet-200/30 to-blue-200/20 rounded-full blur-[100px] animate-float-delay" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-blue-100/20 to-transparent rounded-full blur-[150px]" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center w-full pt-20">
          {/* Logo */}
          <div className="flex flex-col items-center mb-12">
            <div className="flex items-center gap-3.5 mb-3">
              <img src="/280_logo.png" alt="" className="h-14 w-14 border-0 outline-none block" />
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 mb-8">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-blue-700 font-semibold text-xs tracking-wide">AI HOSPITAL MARKETING PLATFORM</span>
          </div>

          {/* Main headline */}
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-7 leading-[1.1] tracking-tight">
            병원 마케팅에<br />
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent animate-gradient">AI 두뇌</span>를 장착하세요
          </h1>

          {/* Subcopy */}
          <p className="text-lg md:text-xl text-slate-500 mb-14 max-w-2xl mx-auto leading-relaxed font-medium">
            단순 반복 콘텐츠 제작부터 의료광고법 검증까지,<br className="hidden md:block" />
            13년 병원 마케팅 노하우가 담긴 AI로 해결하세요.
          </p>

          {/* AI Chat Bar */}
          <div className="max-w-2xl mx-auto mb-10">
            <div className={`relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-slate-200/60 transition-all duration-500 overflow-hidden ${chatOpen ? 'shadow-[0_16px_60px_rgba(0,0,0,0.12)]' : 'hover:shadow-[0_12px_50px_rgba(0,0,0,0.12)]'}`}>
              {/* Chat messages area */}
              {chatOpen && chatMessages.length > 0 && (
                <div className="max-h-[320px] overflow-y-auto px-5 pt-5 pb-2 space-y-3 custom-scrollbar">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex gap-2.5'}`}>
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
                  {/* Typing indicator */}
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
                  {/* CTA after assistant messages */}
                  {chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'assistant' && !isChatting && (
                    <div className="flex justify-center pt-2 pb-1">
                      <button
                        onClick={onStart}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-bold rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                        윈에이드에서 직접 체험해보기
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      </button>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input area */}
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
                  placeholder={chatOpen ? "병원 마케팅에 대해 무엇이든 물어보세요..." : "임플란트 블로그를 AI로 자동 생성하고 싶어요"}
                  className="flex-1 py-3.5 text-base text-slate-700 placeholder-slate-400 bg-transparent outline-none font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (searchText.trim()) {
                        handleChatSubmit();
                      } else {
                        onStart();
                      }
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
                  <button
                    onClick={onStart}
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-black text-sm transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
                  >
                    시작하기
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Tags */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-center gap-2.5 mb-3">
              {quickTags.map((tag) => (
                <button
                  key={tag}
                  onClick={onStart}
                  className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-500 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/80 hover:shadow-sm transition-all"
                >
                  {tag}
                </button>
              ))}
            </div>
            {showMoreTags && (
              <div className="flex flex-wrap justify-center gap-2.5 mb-3">
                {moreTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={onStart}
                    className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-500 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/80 hover:shadow-sm transition-all"
                  >
                    {tag}
                  </button>
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

      {/* ═══════════════════════════════════════ */}
      {/* PARTNERS - Marquee Slider */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-16 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div id="partners" data-animate className={getAnimClass('partners')}>
            <p className="text-center text-sm font-bold text-slate-400 tracking-widest uppercase mb-10">
              윈에이드와 함께하는 병원
            </p>
          </div>
          <div className="relative overflow-hidden" ref={marqueeRef}>
            {/* Gradient masks */}
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
            <div className="animate-marquee flex gap-8 whitespace-nowrap">
              {[...PARTNER_HOSPITALS, ...PARTNER_HOSPITALS].map((name, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-slate-50 border border-slate-100 flex-shrink-0"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008V7.5z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* IMPACT - Stats with counters */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/10 rounded-full blur-[100px]" />
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div id="impact" data-animate className={`${getAnimClass('impact')} relative`}>
            <div className="text-center mb-16">
              <p className="text-blue-400 font-bold text-sm tracking-widest uppercase mb-4">IMPACT</p>
              <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
                수치로 증명되는<br />압도적인 마케팅 성과
              </h2>
            </div>
          </div>

          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { number: '13', unit: '년+', label: '병원마케팅 노하우', sub: '2011년부터 축적', gradient: 'from-blue-400 to-cyan-400' },
              { number: '300', unit: '+', label: '병원 진행건', sub: '전국 치과 마케팅', gradient: 'from-emerald-400 to-teal-400' },
              { number: '500', unit: '+', label: '원장님과 함께', sub: '지속적인 파트너십', gradient: 'from-violet-400 to-purple-400' },
              { number: '1', unit: '분', label: 'AI 콘텐츠 생성', sub: '블로그 자동 완성', gradient: 'from-amber-400 to-orange-400' },
            ].map((stat, i) => (
              <div
                key={i}
                id={`stat-${i}`}
                data-animate
                className={`${getAnimClass(`stat-${i}`)} bg-white/10 backdrop-blur-sm rounded-2xl p-7 border border-white/10 hover:bg-white/15 hover:border-white/20 transition-all duration-300 group`}
              >
                <div className={`text-4xl md:text-5xl font-black bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-1`}>
                  {stat.number}<span className="text-3xl md:text-4xl">{stat.unit}</span>
                </div>
                <div className="text-base font-bold text-white mb-1">{stat.label}</div>
                <div className="text-xs text-slate-400 font-medium">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* AI SOLUTIONS - Feature Cards */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div id="solutions" data-animate className={getAnimClass('solutions')}>
            <div className="text-center mb-16">
              <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">AI SOLUTIONS</p>
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
                병원에 필요한 모든 마케팅,<br />AI가 해결합니다
              </h2>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: (
                  <svg className="w-6 h-6 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                ),
                title: 'AI 블로그 자동 생성',
                desc: '키워드 하나면 의료광고법을 준수하는 네이버 최적화 블로그 원고가 1분 만에 완성됩니다.',
                bg: 'bg-slate-100',
                border: 'hover:border-slate-300',
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                ),
                title: '의료광고법 자동 검증',
                desc: '과장, 비교, 보장성 표현을 실시간 감지하고 자동 수정합니다. 법률 위반 걱정 제로.',
                bg: 'bg-slate-100',
                border: 'hover:border-slate-300',
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                ),
                title: 'AI 이미지 & 카드뉴스',
                desc: '저작권 걱정 없는 고품질 이미지와 카드뉴스를 AI가 자동 생성합니다.',
                bg: 'bg-slate-100',
                border: 'hover:border-slate-300',
              },
            ].map((card, i) => (
              <button
                key={i}
                id={`card-${i}`}
                data-animate
                onClick={onStart}
                className={`${getAnimClass(`card-${i}`)} text-left p-8 rounded-2xl border border-slate-100 ${card.border} bg-white hover:shadow-xl hover:shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300 group`}
              >
                <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{card.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-5">{card.desc}</p>
                <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-2 transition-colors">
                  시작하기
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </button>
            ))}
          </div>

          {/* 추가 기능 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[
              { label: 'SEO 최적화', desc: '네이버 상위노출', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>
              )},
              { label: '유사도 검사', desc: '중복 콘텐츠 방지', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
              )},
              { label: 'AI 정밀보정', desc: 'AI 흔적 제거', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
              )},
              { label: '보도자료', desc: '언론보도 작성', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>
              )},
            ].map((feat, i) => (
              <button
                key={i}
                onClick={onStart}
                className="text-left p-5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 hover:shadow-md transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">{feat.icon}</div>
                <div className="text-sm font-bold text-slate-800">{feat.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{feat.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* DASHBOARD PREVIEW */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-24 bg-[#fafbfc]">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div id="preview" data-animate className={getAnimClass('preview')}>
            <div className="text-center mb-16">
              <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">PRODUCT PREVIEW</p>
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
                키워드 입력 한 번이면<br />블로그 원고가 완성
              </h2>
              <p className="text-lg text-slate-400 mt-5 font-medium">직접 체험해보세요. 지금 바로 무료로 시작할 수 있습니다.</p>
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -inset-6 bg-gradient-to-r from-blue-200/30 via-violet-200/20 to-cyan-200/30 rounded-[40px] blur-3xl" />
            <div className="relative bg-white rounded-2xl shadow-[0_20px_80px_rgba(0,0,0,0.08)] border border-slate-200/60 overflow-hidden">
              {/* Browser bar */}
              <div className="flex items-center gap-2.5 px-6 py-4 bg-slate-50/80 border-b border-slate-100">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                  <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="bg-white rounded-lg px-5 py-1.5 text-xs text-slate-400 border border-slate-200 font-mono flex items-center gap-2">
                    <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1z" clipRule="evenodd" />
                    </svg>
                    app.winaid.co.kr
                  </div>
                </div>
              </div>
              {/* Content */}
              <div className="p-8">
                <div className="grid grid-cols-12 gap-6">
                  {/* Left: Input form mockup */}
                  <div className="col-span-5 space-y-4">
                    <div className="bg-[#fafbfc] rounded-xl p-5 border border-slate-100 space-y-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center">
                          <span className="text-white text-[9px] font-black">AI</span>
                        </div>
                        <div className="h-3 bg-slate-800 rounded w-20" />
                      </div>
                      <div>
                        <div className="h-2 bg-slate-300 rounded w-14 mb-2" />
                        <div className="h-10 bg-white rounded-lg border border-slate-200 flex items-center px-3">
                          <div className="h-2 bg-blue-200 rounded w-24" />
                        </div>
                      </div>
                      <div>
                        <div className="h-2 bg-slate-300 rounded w-10 mb-2" />
                        <div className="h-10 bg-white rounded-lg border border-slate-200 flex items-center px-3">
                          <div className="h-2 bg-slate-200 rounded w-20" />
                        </div>
                      </div>
                      <div>
                        <div className="h-2 bg-slate-300 rounded w-16 mb-2" />
                        <div className="h-10 bg-white rounded-lg border border-slate-200 flex items-center px-3">
                          <div className="h-2 bg-slate-200 rounded w-16" />
                        </div>
                      </div>
                      <div className="h-11 bg-slate-900 rounded-xl flex items-center justify-center mt-3">
                        <span className="text-white text-xs font-bold">블로그 생성하기</span>
                      </div>
                    </div>
                  </div>
                  {/* Right: Result mockup */}
                  <div className="col-span-7">
                    <div className="bg-[#fafbfc] rounded-xl p-6 border border-slate-100 space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <div className="h-2 bg-emerald-300 rounded w-16" />
                        <div className="ml-auto flex gap-1">
                          <div className="w-7 h-7 rounded-md bg-white border border-slate-200" />
                          <div className="w-7 h-7 rounded-md bg-white border border-slate-200" />
                        </div>
                      </div>
                      <div className="h-5 bg-slate-800 rounded w-3/4" />
                      <div className="space-y-2">
                        <div className="h-2 bg-slate-200 rounded w-full" />
                        <div className="h-2 bg-slate-200 rounded w-11/12" />
                        <div className="h-2 bg-slate-200 rounded w-full" />
                        <div className="h-2 bg-slate-200 rounded w-4/5" />
                      </div>
                      <div className="h-32 bg-gradient-to-br from-blue-100 via-sky-50 to-cyan-100 rounded-xl flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 bg-slate-200 rounded w-full" />
                        <div className="h-2 bg-slate-200 rounded w-3/4" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* USE CASES */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-violet-50">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div id="usecases" data-animate className={getAnimClass('usecases')}>
            <div className="text-center mb-16">
              <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">USE CASES</p>
              <h2 className="text-3xl md:text-5xl font-black leading-tight">
                이런 고민,<br />WINAID AI가 해결합니다
              </h2>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { pain: '블로그 쓸 시간이 없다', solution: 'AI가 1분 만에 작성', desc: '키워드 하나면 네이버 스마트블록 최적화 원고가 자동 완성', icon: (
                <svg className="w-6 h-6 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ) },
              { pain: '의료광고법이 복잡하다', solution: '자동 법률 검증 시스템', desc: '과장/비교/보장성 표현을 실시간 감지하고 자동 수정', icon: (
                <svg className="w-6 h-6 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              ) },
              { pain: '이미지 만들기 귀찮다', solution: 'AI 이미지 자동 생성', desc: '저작권 걱정 없는 고품질 이미지를 원클릭으로 생성', icon: (
                <svg className="w-6 h-6 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              ) },
            ].map((item, i) => (
              <div
                key={i}
                id={`usecase-${i}`}
                data-animate
                className={`${getAnimClass(`usecase-${i}`)} bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-white/60 hover:bg-white hover:shadow-xl hover:shadow-blue-100/40 transition-all duration-300`}
              >
                <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center mb-6">{item.icon}</div>
                <p className="text-slate-400 text-sm line-through mb-2 font-medium">{item.pain}</p>
                <p className="text-xl font-bold text-slate-900 mb-3">{item.solution}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* HOW IT WORKS */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div id="howitworks" data-animate className={getAnimClass('howitworks')}>
            <div className="text-center mb-20">
              <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">HOW IT WORKS</p>
              <h2 className="text-3xl md:text-5xl font-black">3단계면 끝</h2>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-14 left-[20%] right-[20%] h-px bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200" />

            {[
              { step: '01', title: '정보 입력', desc: '치과명과 키워드를 입력합니다.', icon: (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" /></svg>
              )},
              { step: '02', title: 'AI가 작성', desc: '의료광고법 준수 블로그와 이미지를 자동 생성합니다.', icon: (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
              )},
              { step: '03', title: '복사 & 게시', desc: '완성된 콘텐츠를 네이버 블로그에 바로 게시합니다.', icon: (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
              )},
            ].map((item, i) => (
              <div key={i} id={`step-${i}`} data-animate className={`${getAnimClass(`step-${i}`)} relative`}>
                <div className="bg-white rounded-2xl p-8 border border-slate-100 hover:shadow-lg hover:shadow-slate-200/40 transition-all duration-300">
                  <div className="w-14 h-14 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-slate-900/20">
                    {item.icon}
                  </div>
                  <span className="text-xs font-black text-blue-600 mb-2 block tracking-wider">{item.step}</span>
                  <h3 className="text-xl font-bold mb-2 text-slate-900">{item.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* ABOUT */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-yellow-50/40">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div id="about" data-animate className={getAnimClass('about')}>
            <div className="text-center mb-16">
              <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">ABOUT WINAID</p>
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
                13년 노하우를<br />AI에 담았습니다
              </h2>
              <p className="text-lg text-slate-500 mt-6 max-w-2xl mx-auto leading-relaxed font-medium">
                2017년 설립 이후 300곳 이상의 치과와 함께해온<br className="hidden md:block" />
                윈에이드의 병원 마케팅 전문성이 AI에 녹아있습니다.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              { text: '300+ 치과 마케팅 운영 경험', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008V7.5z" /></svg>
              )},
              { text: '네이버 플레이스 상위노출 전략', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
              )},
              { text: '500+ 원장님과의 지속적 파트너십', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
              )},
              { text: '의료광고법 전문 컨설팅 & AI 검증', icon: (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>
              )},
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 bg-white/60 backdrop-blur-sm rounded-xl px-6 py-5 border border-white/60 hover:bg-white hover:shadow-md transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">{item.icon}</div>
                <span className="font-semibold text-slate-700">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* CTA */}
      {/* ═══════════════════════════════════════ */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0">
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[120px]" />
        </div>
        <div id="cta" data-animate className={`${getAnimClass('cta')} relative max-w-4xl mx-auto px-6 text-center`}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-semibold text-xs tracking-wide">지금 바로 시작 가능</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
            병원 마케팅의 미래,<br />지금 시작하세요
          </h2>
          <p className="text-xl text-slate-400 mb-14 max-w-lg mx-auto font-medium">
            원장님은 진료에만 집중하세요.<br />마케팅은 WINAID AI가 책임집니다.
          </p>
          <button
            onClick={onStart}
            className="group px-14 py-6 bg-white text-blue-700 font-black text-lg rounded-2xl hover:bg-blue-50 transition-all shadow-2xl hover:-translate-y-1 ring-4 ring-white/20"
          >
            지금 무료로 시작하기
            <span className="inline-block ml-2 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* FOOTER */}
      {/* ═══════════════════════════════════════ */}
      <footer className="py-14 bg-slate-900 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <img src="/280_logo.png" alt="" className="h-7 w-7 border-0 outline-none block rounded bg-white p-0.5" />
            <span className="font-black text-lg tracking-tight text-slate-300">
              WIN<span className="text-blue-400">AID</span>
            </span>
          </div>
          <p className="text-slate-500 text-sm text-center leading-relaxed">
            (07206) 서울 영등포구 양평로20길 16-1 2층 윈에이드&nbsp;&nbsp;|&nbsp;&nbsp;회사명 (주)윈에이드&nbsp;&nbsp;|&nbsp;&nbsp;대표 이현승&nbsp;&nbsp;|&nbsp;&nbsp;사업자등록번호 178-88-00714
          </p>
          <p className="text-slate-500 text-sm text-center mt-3 leading-relaxed">
            Email&nbsp;&nbsp;<a href="mailto:winaid@daum.net" className="text-slate-400 hover:text-white transition-colors">winaid@daum.net</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;Tel&nbsp;&nbsp;<a href="tel:025849400" className="text-slate-400 hover:text-white transition-colors">02 584 9400</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;Fax.&nbsp;&nbsp;<span className="text-slate-400">02-332-9407</span>
          </p>
          <div className="mt-8 pt-8 border-t border-slate-800 text-center text-xs text-slate-600">
            &copy; {new Date().getFullYear()} WINAID. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
