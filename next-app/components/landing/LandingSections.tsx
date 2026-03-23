import {
  PARTNER_HOSPITALS,
  PARTNER_LABEL,
  IMPACT_STATS,
  AI_SOLUTIONS,
  SUB_FEATURES,
  USE_CASES,
  type AiSolution,
  type SubFeature,
  type UseCase,
} from './landingData';

/* ── Icon maps ── */

const solutionIcons: Record<AiSolution['iconName'], React.ReactNode> = {
  blog: (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  law: (
    <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  image: (
    <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
    </svg>
  ),
};

const solutionStyles: Record<AiSolution['iconName'], { gradient: string; borderHover: string }> = {
  blog:  { gradient: 'from-blue-500/10 to-cyan-500/10',    borderHover: 'hover:border-blue-200' },
  law:   { gradient: 'from-emerald-500/10 to-teal-500/10', borderHover: 'hover:border-emerald-200' },
  image: { gradient: 'from-violet-500/10 to-purple-500/10', borderHover: 'hover:border-violet-200' },
};

const subFeatureIcons: Record<SubFeature['iconName'], React.ReactNode> = {
  seo: (
    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>
  ),
  refine: (
    <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
  ),
  press: (
    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>
  ),
};

const useCaseIcons: Record<UseCase['iconName'], React.ReactNode> = {
  time: (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  law: (
    <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
  ),
  image: (
    <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
  ),
};

const statGradients = [
  'from-blue-400 to-cyan-400',
  'from-emerald-400 to-teal-400',
  'from-violet-400 to-purple-400',
  'from-amber-400 to-orange-400',
];

/* ── Component ── */

function LandingSections() {
  return (
    <>
      {/* ═══ PARTNERS — Marquee ═══ */}
      <section className="py-16 bg-white border-y border-slate-100/80 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-30" />
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent to-slate-200" />
            <p className="text-sm font-bold text-slate-400 tracking-widest uppercase">
              {PARTNER_LABEL}
            </p>
            <div className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent to-slate-200" />
          </div>

          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent z-10" />

            {/* Marquee via CSS animation */}
            <style>{`
              @keyframes landing-marquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
              .landing-marquee {
                animation: landing-marquee 30s linear infinite;
              }
              .landing-marquee:hover {
                animation-play-state: paused;
              }
            `}</style>

            <div className="landing-marquee flex gap-6 whitespace-nowrap">
              {[...PARTNER_HOSPITALS, ...PARTNER_HOSPITALS].map((name, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-slate-50/80 backdrop-blur-sm border border-slate-100/80 flex-shrink-0 hover:bg-white hover:border-slate-200 hover:shadow-md transition-all duration-300"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-400/5 flex items-center justify-center flex-shrink-0">
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

      {/* ═══ IMPACT — Stats ═══ */}
      <section className="py-28 bg-gradient-to-br from-slate-900 via-[#0f172a] to-blue-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-30" />
        <div className="absolute top-0 right-[20%] w-[500px] h-[500px] bg-blue-500/8 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-[15%] w-[400px] h-[400px] bg-violet-500/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[200px]" />

        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur border border-white/10 mb-6">
              <span className="text-blue-400 font-bold text-xs tracking-widest uppercase">IMPACT</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-white leading-tight">
              수치로 증명되는<br />
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">압도적인 성과</span>
            </h2>
          </div>

          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-5">
            {IMPACT_STATS.map((stat, i) => (
              <div
                key={i}
                className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-7 hover:bg-white/10 hover:border-white/15 transition-all duration-500 group hover:-translate-y-1"
              >
                <div className="text-2xl mb-3">{stat.icon}</div>
                <div className={`text-4xl md:text-5xl font-black bg-gradient-to-r ${statGradients[i]} bg-clip-text text-transparent mb-2`}>
                  {stat.number}<span className="text-3xl md:text-4xl">{stat.unit}</span>
                </div>
                <div className="text-base font-bold text-white mb-1">{stat.label}</div>
                <div className="text-xs text-slate-400 font-medium">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ AI SOLUTIONS — Feature Cards ═══ */}
      <section className="py-28 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-20" />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-100/20 rounded-full blur-[120px]" />

        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 mb-6">
              <span className="text-blue-600 font-bold text-xs tracking-widest uppercase">AI SOLUTIONS</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight">
              병원에 필요한 모든 마케팅,<br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">AI가 해결합니다</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {AI_SOLUTIONS.map((card, i) => {
              const style = solutionStyles[card.iconName];
              return (
                <div
                  key={i}
                  className={`text-left p-8 rounded-2xl border border-slate-100/80 ${style.borderHover} bg-white/80 backdrop-blur-sm hover:shadow-2xl hover:shadow-blue-100/30 hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                      {solutionIcons[card.iconName]}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">{card.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6">{card.desc}</p>
                    <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-2 transition-colors">
                      시작하기
                      <svg className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sub-features */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            {SUB_FEATURES.map((feat, i) => (
              <div
                key={i}
                className="text-left p-5 rounded-2xl border border-slate-100/80 bg-white/60 backdrop-blur-sm hover:bg-white hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100/50 hover:-translate-y-0.5 transition-all duration-300 group"
              >
                <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  {subFeatureIcons[feat.iconName]}
                </div>
                <div className="text-sm font-bold text-slate-800">{feat.label}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">{feat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DASHBOARD PREVIEW ═══ */}
      <section className="py-28 bg-gradient-to-b from-white via-slate-50/80 to-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-20" />
        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200/60 mb-6">
              <span className="text-slate-600 font-bold text-xs tracking-widest uppercase">PRODUCT PREVIEW</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight">
              키워드 입력 한 번이면<br />블로그 원고가 완성
            </h2>
            <p className="text-lg text-slate-400 mt-6 font-medium">직접 체험해보세요. 지금 바로 무료로 시작할 수 있습니다.</p>
          </div>

          {/* Dashboard mockup */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -inset-8 bg-gradient-to-r from-blue-200/40 via-violet-200/30 to-cyan-200/40 rounded-[48px] blur-3xl" />
            <div className="absolute -inset-4 bg-gradient-to-br from-blue-100/20 to-violet-100/20 rounded-[36px] blur-xl" />
            <div className="relative bg-white rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.1)] border border-slate-200/40 overflow-hidden ring-1 ring-slate-100/50">
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

      {/* ═══ USE CASES ═══ */}
      <section className="py-28 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-violet-50/60 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-20" />
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-blue-200/20 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-violet-200/20 rounded-full blur-[150px]" />

        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur border border-white/60 shadow-sm mb-6">
              <span className="text-blue-600 font-bold text-xs tracking-widest uppercase">USE CASES</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black leading-tight text-slate-900">
              이런 고민,<br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">WINAID AI가 해결합니다</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {USE_CASES.map((item, i) => (
              <div
                key={i}
                className="bg-white/60 backdrop-blur border border-white/80 rounded-2xl p-8 hover:bg-white hover:shadow-2xl hover:shadow-blue-100/40 hover:-translate-y-1 transition-all duration-500 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {useCaseIcons[item.iconName]}
                </div>
                <p className="text-slate-400 text-sm line-through mb-2 font-medium">{item.pain}</p>
                <p className="text-xl font-bold text-slate-900 mb-3">{item.solution}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default LandingSections;
