import { HERO, QUICK_TAGS, MORE_TAGS, CTA } from './landingData';

function LandingHero() {
  return (
    <>
      {/* ── Sticky Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
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

          {/* AI Chat Bar (정적 껍데기) */}
          <div className="max-w-2xl mx-auto mb-10">
            <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-slate-200/60 hover:shadow-[0_12px_50px_rgba(0,0,0,0.12)] transition-all duration-500 overflow-hidden">
              <div className="p-2.5 flex items-center gap-3">
                <div className="pl-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <input
                  type="text"
                  readOnly
                  placeholder={HERO.chatPlaceholder}
                  className="flex-1 py-3.5 text-base text-slate-700 placeholder-slate-400 bg-transparent outline-none font-medium cursor-default"
                />
                <a
                  href="/auth"
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-black text-sm transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
                >
                  시작하기
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Quick Tags */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-center gap-2.5 mb-3">
              {QUICK_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-500 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/80 hover:shadow-sm transition-all cursor-pointer"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {MORE_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-500 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/80 hover:shadow-sm transition-all cursor-pointer"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default LandingHero;
