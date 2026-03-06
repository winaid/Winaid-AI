import React, { useState, useEffect } from 'react';

interface LandingPageProps {
  onStart: () => void;
  darkMode?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const [scrollY, setScrollY] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [showMoreTags, setShowMoreTags] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* Sticky Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrollY > 50 ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-slate-100' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className={`flex items-center gap-2.5 transition-opacity duration-300 ${scrollY > 50 ? 'opacity-100' : 'opacity-0'}`}>
            <img src="/280_logo.png" alt="" className="h-7 w-7 border-0 outline-none block" />
            <span className="font-black text-lg tracking-tight text-slate-800">
              WIN<span className="text-blue-500">AID</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onStart}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm shadow-blue-500/20"
            >
              무료 시작
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section - RX SOFT Style */}
      <section className="relative min-h-[100vh] flex flex-col items-center justify-center px-6">
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-white to-slate-50" />
        <div className="absolute top-20 left-1/4 w-[600px] h-[600px] bg-blue-100/30 rounded-full blur-[150px]" />
        <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-cyan-100/20 rounded-full blur-[120px]" />

        <div className="relative max-w-4xl mx-auto text-center w-full">
          {/* 로고 */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <img src="/280_logo.png" alt="" className="h-12 w-12 border-0 outline-none block" />
            <span className="font-black text-3xl tracking-tight text-slate-800">
              WIN<span className="text-blue-500">AID</span>
            </span>
          </div>

          {/* 서브 라벨 */}
          <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-5">
            AI HOSPITAL MARKETING
          </p>

          {/* 메인 헤드라인 */}
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 leading-[1.15] tracking-tight">
            병원 마케팅에<br />
            <span className="text-blue-600">AI 두뇌</span>를 장착하세요
          </h1>

          {/* 서브카피 */}
          <p className="text-base md:text-lg text-slate-500 mb-12 max-w-xl mx-auto leading-relaxed">
            아래 검색창에 병원 마케팅 고민을 입력해 보세요.<br className="hidden md:block" />
            WINAID의 AI가 해결책을 찾아드립니다.
          </p>

          {/* 검색창 - RX SOFT 스타일 */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 p-2 flex items-center gap-3 hover:shadow-2xl hover:shadow-slate-200/60 transition-shadow">
              <div className="pl-4">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="임플란트 블로그를 AI로 자동 생성하고 싶어요"
                className="flex-1 py-3 text-base text-slate-700 placeholder-slate-400 bg-transparent outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter') onStart(); }}
              />
              <button
                onClick={onStart}
                className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center transition-all shadow-sm shadow-blue-500/20 flex-shrink-0"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* 해시태그 - RX SOFT 스타일 */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {quickTags.map((tag) => (
                <button
                  key={tag}
                  onClick={onStart}
                  className="px-4 py-2 rounded-full text-sm text-slate-600 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  {tag}
                </button>
              ))}
            </div>
            {showMoreTags && (
              <div className="flex flex-wrap justify-center gap-2 mb-3 animate-fadeIn">
                {moreTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={onStart}
                    className="px-4 py-2 rounded-full text-sm text-slate-600 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowMoreTags(!showMoreTags)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 mx-auto mt-2"
            >
              <svg className={`w-4 h-4 transition-transform ${showMoreTags ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
              {showMoreTags ? '접기' : '더보기'}
            </button>
          </div>
        </div>
      </section>

      {/* 서비스 카드 섹션 */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">AI SOLUTIONS</p>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
              병원에 필요한 모든 마케팅,<br />AI가 해결합니다
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                ),
                title: 'AI 블로그 자동 생성',
                desc: '키워드 하나면 의료광고법을 준수하는 네이버 최적화 블로그 원고가 1분 만에 완성됩니다.',
                color: 'bg-blue-50 text-blue-600 border-blue-100',
                iconBg: 'bg-blue-100',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                ),
                title: '의료광고법 자동 검증',
                desc: '과장, 비교, 보장성 표현을 실시간 감지하고 자동 수정합니다. 법률 위반 걱정 제로.',
                color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                iconBg: 'bg-emerald-100',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                ),
                title: 'AI 이미지 & 카드뉴스',
                desc: '저작권 걱정 없는 고품질 이미지와 카드뉴스를 AI가 자동 생성합니다.',
                color: 'bg-violet-50 text-violet-600 border-violet-100',
                iconBg: 'bg-violet-100',
              },
            ].map((card, i) => (
              <button
                key={i}
                onClick={onStart}
                className={`text-left p-8 rounded-2xl border ${card.color} hover:shadow-lg hover:-translate-y-1 transition-all group`}
              >
                <div className={`w-14 h-14 rounded-2xl ${card.iconBg} flex items-center justify-center mb-6`}>
                  {card.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{card.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{card.desc}</p>
                <span className="text-sm font-semibold text-blue-600 group-hover:underline flex items-center gap-1">
                  시작하기
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 데모 프리뷰 섹션 */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">AI CONTENT PREVIEW</p>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
              키워드 입력 한 번이면<br />블로그 원고가 완성
            </h2>
            <p className="text-lg text-slate-400 mt-4">직접 체험해보세요. 지금 바로 무료로 시작할 수 있습니다.</p>
          </div>

          {/* 대시보드 미리보기 */}
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-100/40 via-blue-50/20 to-cyan-100/40 rounded-[32px] blur-2xl" />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden">
              {/* 브라우저 바 */}
              <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="flex-1 flex items-center justify-center">
                  <div className="bg-white rounded-lg px-4 py-1.5 text-xs text-slate-400 border border-slate-200 font-mono">app.winaid.co.kr</div>
                </div>
              </div>
              {/* 콘텐츠 */}
              <div className="p-6">
                <div className="grid grid-cols-12 gap-5">
                  {/* 입력 폼 */}
                  <div className="col-span-4 space-y-3">
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center">
                          <span className="text-white text-[8px] font-bold">AI</span>
                        </div>
                        <div className="h-2.5 bg-slate-700 rounded w-16" />
                      </div>
                      <div>
                        <div className="h-1.5 bg-slate-300 rounded w-12 mb-1.5" />
                        <div className="h-8 bg-white rounded-lg border border-slate-200 flex items-center px-2">
                          <div className="h-1.5 bg-slate-300 rounded w-20" />
                        </div>
                      </div>
                      <div>
                        <div className="h-1.5 bg-slate-300 rounded w-10 mb-1.5" />
                        <div className="h-8 bg-white rounded-lg border border-slate-200 flex items-center px-2">
                          <div className="h-1.5 bg-blue-300 rounded w-14" />
                        </div>
                      </div>
                      <div className="h-9 bg-blue-600 rounded-lg flex items-center justify-center mt-2">
                        <span className="text-white text-[10px] font-bold">블로그 생성하기</span>
                      </div>
                    </div>
                  </div>
                  {/* 결과 미리보기 */}
                  <div className="col-span-8">
                    <div className="bg-slate-50 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div className="h-1.5 bg-emerald-300 rounded w-20" />
                      </div>
                      <div className="h-4 bg-slate-800 rounded w-2/3" />
                      <div className="space-y-1.5 mt-2">
                        <div className="h-1.5 bg-slate-200 rounded w-full" />
                        <div className="h-1.5 bg-slate-200 rounded w-11/12" />
                        <div className="h-1.5 bg-slate-200 rounded w-full" />
                      </div>
                      <div className="h-24 bg-gradient-to-br from-blue-100 via-sky-50 to-cyan-100 rounded-xl mt-2 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                      <div className="space-y-1.5 mt-2">
                        <div className="h-1.5 bg-slate-200 rounded w-full" />
                        <div className="h-1.5 bg-slate-200 rounded w-4/5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x divide-slate-200">
            {[
              { number: '13', unit: '년+', label: '병원마케팅 노하우' },
              { number: '300', unit: '+', label: '병원 진행건' },
              { number: '95', unit: '%', label: '거래처 재계약률' },
              { number: '1', unit: '분', label: 'AI 콘텐츠 생성' },
            ].map((stat, i) => (
              <div key={i} className="text-center px-4">
                <div className="text-3xl md:text-4xl font-black text-slate-900">
                  {stat.number}<span className="text-blue-600">{stat.unit}</span>
                </div>
                <div className="text-sm text-slate-400 mt-1 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain Point -> Solution */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">PROBLEM & SOLUTION</p>
            <h2 className="text-3xl md:text-5xl font-black leading-tight">
              매년 감소하는 신규 환자,<br />줄어드는 매출...
            </h2>
            <p className="text-lg text-slate-400 mt-4">이제 원장님은 진료에만 집중하세요!</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { pain: '블로그 쓸 시간이 없다', solution: 'AI가 1분 만에 작성', desc: '키워드 하나면 네이버 스마트블록 최적화 원고가 자동 완성', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ), color: 'border-blue-100 hover:border-blue-200', iconBg: 'bg-blue-50 text-blue-600' },
              { pain: '의료광고법이 복잡하다', solution: '자동 법률 검증 시스템', desc: '과장/비교/보장성 표현을 실시간 감지하고 자동 수정', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              ), color: 'border-emerald-100 hover:border-emerald-200', iconBg: 'bg-emerald-50 text-emerald-600' },
              { pain: '이미지 만들기 귀찮다', solution: 'AI 이미지 자동 생성', desc: '저작권 걱정 없는 고품질 이미지를 원클릭으로 생성', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              ), color: 'border-violet-100 hover:border-violet-200', iconBg: 'bg-violet-50 text-violet-600' },
            ].map((item, i) => (
              <div key={i} className={`bg-white rounded-2xl p-8 border-2 ${item.color} hover:shadow-lg transition-all`}>
                <div className={`w-12 h-12 rounded-xl ${item.iconBg} flex items-center justify-center mb-6`}>{item.icon}</div>
                <p className="text-slate-400 text-sm line-through mb-2">{item.pain}</p>
                <p className="text-xl font-bold text-slate-900 mb-2">{item.solution}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">HOW IT WORKS</p>
            <h2 className="text-3xl md:text-5xl font-black">3단계면 끝</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: '정보 입력', desc: '치과명과 키워드를 입력합니다.', icon: (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" /></svg>
              )},
              { step: '02', title: 'AI가 작성', desc: '의료광고법 준수 블로그와 이미지를 생성합니다.', icon: (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
              )},
              { step: '03', title: '복사 & 게시', desc: '완성된 콘텐츠를 네이버 블로그에 바로 게시합니다.', icon: (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
              )},
            ].map((item, i) => (
              <div key={i} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px bg-blue-200" />
                )}
                <div className="relative bg-white rounded-2xl p-8 border border-slate-200 hover:shadow-lg transition-all">
                  <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-600/20">
                    {item.icon}
                  </div>
                  <span className="text-xs font-bold text-blue-600 mb-2 block">{item.step}</span>
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-slate-500 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About WINAID */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-blue-600 font-bold text-sm tracking-widest uppercase mb-4">ABOUT WINAID</p>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900">
              13년 노하우를<br />AI에 담았습니다
            </h2>
            <p className="text-lg text-slate-500 mt-6 max-w-2xl mx-auto leading-relaxed">
              2017년 설립 이후 300곳 이상의 치과와 함께해온<br className="hidden md:block" />
              윈에이드의 병원 마케팅 전문성이 AI에 녹아있습니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              '300+ 치과 마케팅 운영 경험',
              '네이버 플레이스 상위노출 전략',
              '거래처 재계약률 95%의 신뢰',
              '치과 의료광고법 전문 컨설팅 & AI 검증',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-5 py-4 border border-slate-200/60 hover:border-blue-200 transition-colors">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-medium text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800" />
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-400/10 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 leading-tight">
            병원 마케팅의 미래,<br />지금 시작하세요
          </h2>
          <p className="text-xl text-blue-200 mb-12 max-w-lg mx-auto">
            원장님은 진료에만 집중하세요.<br />마케팅은 WINAID AI가 책임집니다.
          </p>
          <button
            onClick={onStart}
            className="group px-10 py-5 bg-white text-blue-700 font-bold text-lg rounded-2xl hover:bg-blue-50 transition-all shadow-2xl hover:-translate-y-1"
          >
            지금 무료로 시작하기
            <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">&rarr;</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-slate-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-center gap-2 mb-6">
            <img src="/280_logo.png" alt="" className="h-6 w-6 border-0 outline-none block rounded bg-white p-0.5" />
            <span className="font-black text-base tracking-tight text-slate-300">
              WIN<span className="text-blue-400">AID</span>
            </span>
          </div>
          <p className="text-slate-400 text-sm text-center leading-relaxed">
            (07206) 서울 영등포구 양평로20길 16-1 2층 윈에이드&nbsp;&nbsp;|&nbsp;&nbsp;회사명 (주)윈에이드&nbsp;&nbsp;|&nbsp;&nbsp;대표 이현승&nbsp;&nbsp;|&nbsp;&nbsp;사업자등록번호 178-88-00714
          </p>
          <p className="text-slate-400 text-sm text-center mt-3 leading-relaxed">
            Email&nbsp;&nbsp;<a href="mailto:winaid@daum.net" className="text-slate-300 hover:text-white transition-colors">winaid@daum.net</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;Tel&nbsp;&nbsp;<a href="tel:025849400" className="text-slate-300 hover:text-white transition-colors">02 584 9400</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;Fax.&nbsp;&nbsp;<span className="text-slate-300">02-332-9407</span>
          </p>
          <div className="mt-6 pt-6 border-t border-slate-700 text-center text-xs text-slate-500">
            &copy; {new Date().getFullYear()} WINAID. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
