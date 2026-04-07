'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  PARTNER_HOSPITALS,
  PARTNER_LABEL,
  IMPACT_STATS,
  AI_SOLUTIONS,
  SUB_FEATURES,
  USE_CASES,
  HOW_IT_WORKS,
  TESTIMONIALS,
  ABOUT_ITEMS,
  ABOUT_DESC,
  ABOUT_HEADING_SUFFIX,
  YEARS_OF_EXPERIENCE,
  CTA,
  FOOTER,
  type AiSolution,
  type SubFeature,
  type UseCase,
  type AboutItem,
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

const howItWorksIcons: React.ReactNode[] = [
  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" /></svg>,
  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>,
  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>,
];

const aboutIcons: Record<AboutItem['iconName'], React.ReactNode> = {
  hospital: (
    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008V7.5z" /></svg>
  ),
  chart: (
    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
  ),
  people: (
    <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
  ),
  law: (
    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>
  ),
};

const statGradients = [
  'from-blue-400 to-cyan-400',
  'from-emerald-400 to-teal-400',
  'from-violet-400 to-purple-400',
  'from-amber-400 to-orange-400',
];

/* ── Fade-in hook ── */

function useFadeIn(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, visible];
}

const fade = (visible: boolean) =>
  `transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`;

/* ── Component ── */

function LandingSections() {
  const [impactRef, impactV] = useFadeIn();
  const [solutionsRef, solutionsV] = useFadeIn();
  const [previewRef, previewV] = useFadeIn();
  const [useCasesRef, useCasesV] = useFadeIn();
  const [howRef, howV] = useFadeIn();
  const [testimonialsRef, testimonialsV] = useFadeIn();
  const [aboutRef, aboutV] = useFadeIn();
  const [ctaRef, ctaV] = useFadeIn();

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
          <div ref={impactRef} className={`text-center mb-20 ${fade(impactV)}`}>
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
          <div ref={solutionsRef} className={`text-center mb-20 ${fade(solutionsV)}`}>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
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
          <div ref={previewRef} className={`text-center mb-20 ${fade(previewV)}`}>
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
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Left: Input form mockup */}
                  <div className="md:col-span-5 space-y-4">
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
                  <div className="md:col-span-7">
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
          <div ref={useCasesRef} className={`text-center mb-20 ${fade(useCasesV)}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur border border-white/60 shadow-sm mb-6">
              <span className="text-blue-600 font-bold text-xs tracking-widest uppercase">USE CASES</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black leading-tight text-slate-900">
              이런 고민,<br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">WINAI가 해결합니다</span>
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

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-28 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-15" />
        <div className="max-w-5xl mx-auto px-6 lg:px-8 relative">
          <div ref={howRef} className={`text-center mb-20 ${fade(howV)}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200/60 mb-6">
              <span className="text-slate-600 font-bold text-xs tracking-widest uppercase">HOW IT WORKS</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900">3단계면 끝</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-14 left-[20%] right-[20%] h-px bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200" />

            {HOW_IT_WORKS.map((item, i) => (
              <div key={i} className="relative">
                <div className="bg-white rounded-2xl p-8 border border-slate-100 hover:shadow-lg hover:shadow-slate-200/40 transition-all duration-300">
                  <div className="w-14 h-14 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-slate-900/20">
                    {howItWorksIcons[i]}
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

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="py-28 bg-gradient-to-b from-white via-slate-50/50 to-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-20" />
        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <div ref={testimonialsRef} className={`text-center mb-20 ${fade(testimonialsV)}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-100 mb-6">
              <span className="text-amber-700 font-bold text-xs tracking-widest uppercase">TESTIMONIALS</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight">
              원장님들의<br />
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">실제 후기</span>
            </h2>
            <p className="text-lg text-slate-400 mt-6 font-medium">300+ 병원이 선택한 이유를 확인하세요</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((review, i) => (
              <div
                key={i}
                className="bg-white/60 backdrop-blur border border-white/80 rounded-2xl p-7 hover:bg-white hover:shadow-xl hover:shadow-amber-100/30 transition-all duration-500 group"
              >
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-5 font-medium">&ldquo;{review.text}&rdquo;</p>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                    {review.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{review.name}</div>
                    <div className="text-xs text-slate-400 font-medium">{review.hospital}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ABOUT ═══ */}
      <section className="py-28 bg-gradient-to-br from-amber-50/40 via-orange-50/20 to-yellow-50/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-15" />
        <div className="max-w-5xl mx-auto px-6 lg:px-8 relative">
          <div ref={aboutRef} className={`text-center mb-20 ${fade(aboutV)}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur border border-white/60 shadow-sm mb-6">
              <span className="text-amber-700 font-bold text-xs tracking-widest uppercase">ABOUT WINAI</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight">
              {YEARS_OF_EXPERIENCE}년 노하우를<br />
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">{ABOUT_HEADING_SUFFIX}</span>
            </h2>
            <p className="text-lg text-slate-500 mt-6 max-w-2xl mx-auto leading-relaxed font-medium">
              {ABOUT_DESC}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {ABOUT_ITEMS.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 bg-white/60 backdrop-blur border border-white/80 rounded-2xl px-6 py-5 hover:bg-white hover:shadow-lg hover:shadow-amber-100/20 hover:-translate-y-0.5 transition-all duration-300 group"
              >
                <div className="w-11 h-11 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  {aboutIcons[item.iconName]}
                </div>
                <span className="font-semibold text-slate-700">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-36 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f172a] to-blue-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-20" />
        <div className="absolute inset-0">
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[180px]" />
          <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[150px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[120px]" />
        </div>
        <div ref={ctaRef} className={`relative max-w-4xl mx-auto px-6 text-center ${fade(ctaV)}`}>
          <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur border border-white/10 mb-10">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-emerald-300 font-bold text-xs tracking-wider">{CTA.badge}</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-black text-white mb-8 leading-[1.1]">
            {CTA.heading}<br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">{CTA.headingHighlight}</span>
          </h2>
          <p className="text-xl text-slate-400 mb-16 max-w-lg mx-auto font-medium leading-relaxed whitespace-pre-line">
            {CTA.sub}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/auth"
              className="group px-14 py-6 bg-white text-blue-700 font-black text-lg rounded-2xl hover:bg-blue-50 transition-all duration-300 shadow-2xl shadow-blue-500/10 hover:-translate-y-1 ring-4 ring-white/20"
            >
              {CTA.primaryButton}
              <span className="inline-block ml-2 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
            </a>
            <a
              href={CTA.phoneHref}
              className="px-8 py-6 text-slate-400 hover:text-white font-bold text-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              {CTA.secondaryButton}
            </a>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-16 bg-slate-950 border-t border-slate-800/50 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[length:24px_24px] opacity-10" />
        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <div className="flex items-center justify-center gap-3 mb-10">
            <span className="font-black text-xl tracking-tight text-slate-300">
              WIN<span className="text-blue-400">AI</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-8">
            <span className="text-slate-500 text-sm font-medium">{FOOTER.address}</span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500 text-sm font-medium">{FOOTER.companyName}</span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500 text-sm font-medium">{FOOTER.ceo}</span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500 text-sm font-medium">{FOOTER.bizNo}</span>
          </div>
          <div className="flex items-center justify-center gap-6 mb-10">
            <a href={`mailto:${FOOTER.email}`} className="text-slate-400 hover:text-blue-400 transition-colors text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              {FOOTER.email}
            </a>
            <a href={FOOTER.phoneHref} className="text-slate-400 hover:text-blue-400 transition-colors text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              {FOOTER.phone}
            </a>
            <span className="text-slate-400 text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 12h-2.25m-7.5 0h-2.25" /></svg>
              {FOOTER.fax}
            </span>
          </div>
          <div className="pt-8 border-t border-slate-800/50 text-center text-xs text-slate-600 font-medium">
            &copy; {new Date().getFullYear()} WINAI. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}

export default LandingSections;
