import React from 'react';

interface LandingPageProps {
  onStart: () => void;
  darkMode?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, darkMode = false }) => {
  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-36">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-white/90 text-sm font-medium">13년 병원마케팅 노하우 + AI 기술</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
              병원 마케팅,<br />
              <span className="text-blue-200">AI가 30초 만에</span> 해결합니다
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              의료광고법을 100% 준수하는 블로그 원고와 AI 이미지를<br className="hidden md:block" />
              자동으로 생성하세요. 원장님은 진료에만 집중하세요.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onStart}
                className="px-8 py-4 bg-white text-blue-700 font-bold text-lg rounded-xl hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
              >
                무료로 시작하기
              </button>
              <a
                href="https://winaid.co.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-bold text-lg rounded-xl border border-white/30 hover:bg-white/20 transition-all"
              >
                윈에이드 알아보기
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className={`py-16 ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { number: '13+', label: '년 마케팅 노하우', color: 'text-blue-500' },
              { number: '300+', label: '병원 클라이언트', color: 'text-emerald-500' },
              { number: '30', label: '초 만에 콘텐츠 생성', color: 'text-violet-500' },
              { number: '100%', label: '의료광고법 준수', color: 'text-amber-500' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className={`text-3xl md:text-4xl font-black ${stat.color}`}>{stat.number}</div>
                <div className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              왜 <span className="text-blue-500">WINAID</span>인가요?
            </h2>
            <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              병원마케팅 전문 기업 윈에이드의 기술력으로 만든 AI 플랫폼
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                title: '30초 만에 블로그 완성',
                desc: '병원명, 진료과목, 키워드만 입력하면 AI가 네이버 스마트블록에 최적화된 블로그 원고를 즉시 생성합니다.',
                color: 'bg-blue-500',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                title: '의료광고법 100% 준수',
                desc: '과장 광고, 비교 광고 등 의료광고법 위반 요소를 AI가 자동으로 필터링합니다. 안심하고 사용하세요.',
                color: 'bg-emerald-500',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ),
                title: 'AI 이미지 자동 생성',
                desc: '블로그에 딱 맞는 고품질 이미지를 AI가 자동으로 생성합니다. 저작권 걱정 없이 마음껏 사용하세요.',
                color: 'bg-violet-500',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                title: '네이버 상위노출 최적화',
                desc: '네이버 플레이스, 스마트블록 검색에서 상위 노출될 수 있도록 SEO 최적화된 콘텐츠를 생성합니다.',
                color: 'bg-amber-500',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                ),
                title: '유사도 검사 & 리라이팅',
                desc: '생성된 콘텐츠의 유사도를 자동 검사하고, 필요시 리라이팅하여 100% 오리지널 콘텐츠를 보장합니다.',
                color: 'bg-rose-500',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                ),
                title: '카드뉴스 & 보도자료',
                desc: '블로그 외에도 카드뉴스, 보도자료 등 다양한 마케팅 콘텐츠를 한 곳에서 생성할 수 있습니다.',
                color: 'bg-cyan-500',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className={`p-8 rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-14 h-14 ${feature.color} rounded-xl flex items-center justify-center text-white mb-5`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className={`leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={`py-20 ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">이렇게 간단합니다</h2>
            <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>3단계로 블로그 완성</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '01',
                title: '정보 입력',
                desc: '병원명, 진료 과목, 키워드를 입력하세요.',
              },
              {
                step: '02',
                title: 'AI 생성',
                desc: 'AI가 의료광고법을 준수하는 블로그 원고와 이미지를 생성합니다.',
              },
              {
                step: '03',
                title: '복사 & 게시',
                desc: '생성된 콘텐츠를 복사해서 네이버 블로그에 바로 게시하세요.',
              },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-6xl font-black text-blue-500/20 mb-4">{item.step}</div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              <span className="text-blue-500">윈에이드</span>가 만들었습니다
            </h2>
            <p className={`text-lg max-w-2xl mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              2017년 설립, 치과/성형외과/피부과 등 300곳 이상의 병원과 함께한<br />
              병원마케팅 전문 기업의 노하우가 담겨있습니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              { title: '환자 유치 극대화', desc: '맞춤 전략으로 신규 환자 방문을 극대화합니다' },
              { title: '매출 성장 지원', desc: '지속 가능한 마케팅으로 병원의 매출 성장을 지원합니다' },
              { title: '플레이스 상위노출', desc: '네이버 플레이스 검색에서 상위 노출을 확보합니다' },
              { title: '무료 마케팅 진단', desc: '전문 컨설턴트가 병원의 마케팅 현황을 무료 분석합니다' },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex gap-4 p-6 rounded-xl ${
                  darkMode ? 'bg-slate-800' : 'bg-slate-50'
                }`}
              >
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-1">{item.title}</h3>
                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-indigo-700">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-6">
            매년 감소하는 신규 환자,<br />이제 AI로 해결하세요
          </h2>
          <p className="text-lg text-blue-100 mb-10">
            원장님은 진료에만 집중하세요. 마케팅은 WINAID가 하겠습니다.
          </p>
          <button
            onClick={onStart}
            className="px-10 py-5 bg-white text-blue-700 font-bold text-lg rounded-xl hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
          >
            지금 무료로 시작하기
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-12 ${darkMode ? 'bg-slate-800 border-t border-slate-700' : 'bg-slate-900'}`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <svg className="w-7 h-7" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 20L18 80h2L30 35l10 45h2L55 20h-8L38 62 28 20H22L12 62 5 20z" fill="#3B82F6"/>
                <path d="M52 80L68 20h4L88 80h-8L76 64H64l-4 16h-8zm14-24h10L71 32 66 56z" fill="#e2e8f0"/>
              </svg>
              <span className="font-black text-lg text-white"><span className="text-blue-400">W</span>INAID</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <span>winaid@daum.net</span>
              <span>02-584-9400</span>
              <a href="https://winaid.co.kr" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">winaid.co.kr</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-slate-700 text-center text-sm text-slate-500">
            &copy; {new Date().getFullYear()} WINAID. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
