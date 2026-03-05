import React, { useState, useEffect } from 'react';

interface LandingPageProps {
  onStart: () => void;
  darkMode?: boolean;
}

// 라이트 테마 일러스트
const IllustBlog = () => (
  <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 p-6 flex flex-col justify-center items-center relative overflow-hidden">
    <div className="absolute top-4 right-4 w-20 h-20 bg-blue-100 rounded-full blur-2xl" />
    <div className="relative w-full max-w-[260px]">
      <div className="bg-white rounded-xl shadow-lg p-4 border border-slate-200">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-red-300" />
          <div className="w-2 h-2 rounded-full bg-yellow-300" />
          <div className="w-2 h-2 rounded-full bg-green-300" />
        </div>
        <div className="h-2.5 bg-slate-800 rounded w-3/4 mb-3" />
        <div className="space-y-1.5">
          <div className="h-1.5 bg-slate-200 rounded w-full" />
          <div className="h-1.5 bg-slate-200 rounded w-5/6" />
          <div className="h-1.5 bg-slate-200 rounded w-full" />
          <div className="h-1.5 bg-slate-200 rounded w-2/3" />
        </div>
        <div className="mt-3 h-12 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 bg-slate-200 rounded w-full" />
          <div className="h-1.5 bg-slate-200 rounded w-4/5" />
        </div>
      </div>
      <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg">
        AI
      </div>
    </div>
    <p className="text-xs text-blue-400 font-semibold mt-4">키워드 입력 한번이면 끝</p>
  </div>
);

const IllustCompliance = () => (
  <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-6 flex flex-col justify-center items-center relative overflow-hidden">
    <div className="absolute bottom-4 left-4 w-24 h-24 bg-emerald-100 rounded-full blur-2xl" />
    <div className="relative w-full max-w-[260px]">
      <div className="bg-white rounded-xl shadow-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <span className="text-xs font-bold text-slate-700">의료광고법 검증</span>
        </div>
        <div className="space-y-2.5">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="h-1.5 bg-slate-200 rounded flex-1" />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="h-1.5 bg-amber-200 rounded w-full" />
              <div className="h-1.5 bg-emerald-200 rounded w-full mt-1" />
            </div>
            <span className="text-[9px] text-emerald-500 font-bold">수정됨</span>
          </div>
        </div>
        <div className="mt-3 bg-emerald-50 rounded-lg p-2 text-center">
          <span className="text-[10px] font-bold text-emerald-600">검증 완료 - 위반 요소 0건</span>
        </div>
      </div>
    </div>
    <p className="text-xs text-emerald-500 font-semibold mt-4">자동으로 안전하게</p>
  </div>
);

const IllustImage = () => (
  <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 p-6 flex flex-col justify-center items-center relative overflow-hidden">
    <div className="absolute top-8 left-8 w-20 h-20 bg-violet-100 rounded-full blur-2xl" />
    <div className="relative w-full max-w-[260px]">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
          <div className="h-20 bg-gradient-to-br from-blue-200 via-blue-100 to-cyan-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
          <div className="p-2">
            <div className="h-1.5 bg-slate-200 rounded w-3/4" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
          <div className="h-20 bg-gradient-to-br from-violet-200 via-purple-100 to-pink-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-violet-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="p-2">
            <div className="h-1.5 bg-slate-200 rounded w-1/2" />
          </div>
        </div>
        <div className="col-span-2 bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 flex">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-200 to-orange-200 flex-shrink-0 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div className="p-2.5 flex-1 space-y-1">
            <div className="h-1.5 bg-slate-200 rounded w-2/3" />
            <div className="h-1.5 bg-slate-100 rounded w-full" />
            <div className="h-1.5 bg-slate-100 rounded w-4/5" />
          </div>
        </div>
      </div>
      <div className="absolute -top-2 -right-2 bg-violet-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg flex items-center gap-1">
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        AI
      </div>
    </div>
    <p className="text-xs text-violet-500 font-semibold mt-4">이미지도 AI가 생성</p>
  </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const featureIllusts = [<IllustBlog key="blog" />, <IllustCompliance key="comp" />, <IllustImage key="img" />];

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* Sticky Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrollY > 50 ? 'bg-white/90 backdrop-blur-xl shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/280_logo.png" alt="WINAID" className="h-9" />
            <span className="font-black text-lg tracking-tight text-slate-800">
              WIN<span className="text-blue-500">AID</span>
            </span>
          </div>
          <button
            onClick={onStart}
            className="px-5 py-2 rounded-lg font-semibold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all"
          >
            무료 시작
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
        {/* 배경: 위 화이트 → 중간부터 윈에이드 블루 */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #ffffff 25%, #dbeafe 40%, #3b82f6 70%, #1e3a8a 100%)' }} />
        <div className="absolute bottom-0 left-0 right-0 h-[40%]">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-400/15 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-indigo-300/15 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 text-center pt-24 pb-32">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-5 py-2.5 mb-10">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-slate-500 text-sm">13년 병원마케팅 노하우 + AI</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 leading-[1.1] tracking-tight">
            병원 블로그,<br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              AI가 대신 씁니다
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 mb-12 max-w-xl mx-auto leading-relaxed">
            키워드 하나면 의료광고법 준수 블로그와 AI 이미지가 자동 완성.<br className="hidden md:block" />
            원장님은 진료에만 집중하세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onStart}
              className="group px-8 py-4 bg-blue-600 text-white font-bold text-lg rounded-2xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5"
            >
              무료로 시작하기
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">&rarr;</span>
            </button>
            <a
              href="https://winaid.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 text-slate-400 font-semibold text-lg hover:text-slate-700 transition-colors"
            >
              윈에이드 알아보기
            </a>
          </div>

          {/* Floating UI Preview */}
          <div className="mt-20 relative mx-auto max-w-3xl">
            <div className="absolute -inset-4 bg-blue-400/20 rounded-3xl blur-2xl" />
            <div className="relative bg-white/95 backdrop-blur rounded-2xl p-6 shadow-2xl border border-white/60">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-300" />
                <div className="w-3 h-3 rounded-full bg-yellow-300" />
                <div className="w-3 h-3 rounded-full bg-green-300" />
                <div className="flex-1 bg-slate-100 rounded-lg h-6 mx-4" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 space-y-3">
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="h-2 bg-slate-200 rounded w-3/4" />
                    <div className="h-6 bg-blue-100 rounded-lg" />
                    <div className="h-2 bg-slate-200 rounded w-1/2" />
                    <div className="h-6 bg-blue-100 rounded-lg" />
                    <div className="h-8 bg-blue-200 rounded-lg mt-3" />
                  </div>
                </div>
                <div className="col-span-2 bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="h-3 bg-slate-200 rounded w-1/3 mb-3" />
                  <div className="h-2 bg-slate-100 rounded w-full" />
                  <div className="h-2 bg-slate-100 rounded w-5/6" />
                  <div className="h-2 bg-slate-100 rounded w-full" />
                  <div className="h-2 bg-slate-100 rounded w-4/6" />
                  <div className="h-16 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg mt-3" />
                  <div className="h-2 bg-slate-100 rounded w-full" />
                  <div className="h-2 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2">
            <div className="w-1 h-2 bg-white/50 rounded-full" />
          </div>
        </div>
      </section>

      {/* Stats - 윈에이드 수치 */}
      <section className="py-20 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-slate-400 text-sm font-semibold mb-10 tracking-wider">윈에이드는 수치로 증명합니다</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x divide-slate-200">
            {[
              { number: '13', unit: '년+', label: '병원마케팅 노하우' },
              { number: '300', unit: '+', label: '병원 진행건' },
              { number: '95', unit: '%', label: '거래처 재계약률' },
              { number: '1', unit: '분', label: 'AI 콘텐츠 생성' },
            ].map((stat, i) => (
              <div key={i} className="text-center px-4">
                <div className="text-3xl md:text-4xl font-black text-slate-900">
                  {stat.number}<span className="text-blue-500">{stat.unit}</span>
                </div>
                <div className="text-sm text-slate-400 mt-1 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain Point -> Solution */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-blue-500 font-bold text-sm tracking-wider uppercase mb-3">Problem & Solution</p>
            <h2 className="text-3xl md:text-5xl font-black leading-tight">
              매년 감소하는 신규 환자,<br />줄어드는 매출...
            </h2>
            <p className="text-lg text-slate-400 mt-4">이제 원장님은 진료에만 집중하세요!</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { pain: '블로그 쓸 시간이 없다', solution: 'AI가 1분 만에 작성', desc: '키워드 하나면 네이버 스마트블록 최적화 원고가 자동 완성', icon: '✏️', color: 'bg-blue-100 text-blue-600' },
              { pain: '의료광고법이 복잡하다', solution: '자동 법률 검증 시스템', desc: '과장·비교·보장성 표현을 실시간 감지하고 자동 수정', icon: '🛡️', color: 'bg-emerald-100 text-emerald-600' },
              { pain: '이미지 만들기 귀찮다', solution: 'AI 이미지 자동 생성', desc: '저작권 걱정 없는 고품질 이미지를 원클릭으로 생성', icon: '🎨', color: 'bg-violet-100 text-violet-600' },
            ].map((item, i) => (
              <div key={i} className="group relative">
                <div className="bg-slate-50 rounded-2xl p-8 h-full border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className={`w-14 h-14 rounded-2xl ${item.color} flex items-center justify-center text-2xl mb-6`}>{item.icon}</div>
                  <p className="text-slate-400 text-sm line-through mb-2">{item.pain}</p>
                  <p className="text-xl font-bold text-slate-900 mb-2">{item.solution}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-blue-500 font-bold text-sm tracking-wider uppercase mb-3">Features</p>
            <h2 className="text-3xl md:text-5xl font-black">실력으로 승부하는<br />고집 있는 AI 마케팅</h2>
          </div>

          <div className="space-y-24">
            {[
              {
                title: '키워드 하나로\n블로그 자동 생성',
                desc: '병원명과 키워드만 입력하면 네이버 스마트블록에 최적화된 블로그 원고가 완성됩니다. 환자 유치에 필수인 가장 빠른 경로, 네이버 블로그를 AI가 대신 운영합니다.',
                tag: 'AI Writing',
                color: 'from-blue-500 to-cyan-500',
              },
              {
                title: '의료광고법\n자동 검증',
                desc: '과장 광고, 비교 광고, 보장성 표현 등 의료광고법 위반 요소를 실시간으로 감지하고 자동 수정합니다.',
                tag: 'Compliance',
                color: 'from-emerald-500 to-teal-500',
              },
              {
                title: 'AI 이미지 &\n카드뉴스 생성',
                desc: '블로그에 딱 맞는 고품질 이미지와 카드뉴스를 AI가 자동 생성합니다. 저작권 걱정 없이 바로 사용 가능.',
                tag: 'AI Image',
                color: 'from-violet-500 to-purple-500',
              },
            ].map((feature, i) => (
              <div key={i} className={`flex flex-col ${i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'} gap-12 items-center`}>
                <div className="flex-1">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${feature.color} mb-4`}>
                    {feature.tag}
                  </span>
                  <h3 className="text-3xl md:text-4xl font-black leading-tight mb-4 whitespace-pre-line">{feature.title}</h3>
                  <p className="text-lg text-slate-500 leading-relaxed">{feature.desc}</p>
                </div>
                <div className="flex-1 w-full">
                  {featureIllusts[i]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-blue-500 font-bold text-sm tracking-wider uppercase mb-3">How it works</p>
            <h2 className="text-3xl md:text-5xl font-black">믿고 맡기는 서비스,<br />3단계면 끝</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: '정보 입력', desc: '병원명, 진료 과목, 원하는 키워드를 입력합니다.' },
              { step: '2', title: 'AI가 작성', desc: '의료광고법을 준수하는 블로그 원고와 이미지를 생성합니다.' },
              { step: '3', title: '복사 & 게시', desc: '완성된 콘텐츠를 복사해서 블로그에 바로 게시합니다.' },
            ].map((item, i) => (
              <div key={i} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-blue-200 to-transparent" />
                )}
                <div className="relative">
                  <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mb-6 shadow-lg shadow-blue-500/20">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / About WINAID */}
      <section className="py-24 bg-gradient-to-b from-slate-900 to-blue-950 text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-blue-400 font-bold text-sm tracking-wider uppercase mb-3">About WINAID</p>
            <h2 className="text-3xl md:text-5xl font-black">
              누구보다 병원을 잘 아니까,<br />직접 만들었습니다
            </h2>
            <p className="text-lg text-slate-400 mt-6 max-w-2xl mx-auto leading-relaxed">
              2017년 설립 이후 치과, 성형외과, 피부과, 정형외과, 한의원 등<br className="hidden md:block" />
              300곳 이상의 병원과 함께해온 윈에이드의 13년 노하우가 AI에 담겨있습니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              '300+ 병원 마케팅 운영 경험',
              '네이버 플레이스 상위노출 전략',
              '거래처 재계약률 95%의 신뢰',
              '의료광고법 전문 컨설팅 & AI 검증',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/[0.08] border border-white/10 rounded-xl px-5 py-4">
                <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">{item}</span>
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
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 leading-tight">
            클라이언트의 성장이<br />윈에이드의 목표입니다
          </h2>
          <p className="text-xl text-blue-200 mb-12">
            원장님은 진료에만 집중하세요. 마케팅은 WINAID AI가 책임집니다.
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
      <footer className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/280_logo.png" alt="WINAID" className="h-8" />
              <span className="font-black text-lg text-slate-800 tracking-tight">WIN<span className="text-blue-500">AID</span></span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-600 font-medium">
              <a href="mailto:winaid@daum.net" className="hover:text-blue-500 transition-colors">winaid@daum.net</a>
              <a href="tel:025849400" className="hover:text-blue-500 transition-colors">02-584-9400</a>
              <a href="https://winaid.co.kr" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 transition-colors">winaid.co.kr</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-slate-100 text-center text-sm text-slate-400">
            &copy; {new Date().getFullYear()} WINAID. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
