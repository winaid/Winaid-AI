import Link from 'next/link';

const FEATURES = [
  {
    icon: '📝',
    title: '블로그 생성',
    desc: 'SEO 최적화된 병원 블로그 글을 AI가 자동 작성',
    href: '/blog',
    color: 'from-blue-500 to-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    icon: '🎨',
    title: '카드뉴스 생성',
    desc: '슬라이드별 원고를 자동 기획하고 카드뉴스로 제작',
    href: '/card_news',
    color: 'from-pink-500 to-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-100',
  },
  {
    icon: '🗞️',
    title: '보도자료 생성',
    desc: '기자 문체의 언론 보도자료를 의료광고법 준수하며 작성',
    href: '/press',
    color: 'from-amber-500 to-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    icon: '✨',
    title: 'AI 보정',
    desc: '기존 글을 붙여넣으면 원하는 방향으로 자동 다듬기',
    href: '/refine',
    color: 'from-violet-500 to-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
  {
    icon: '🕐',
    title: '생성 이력',
    desc: '생성한 모든 콘텐츠를 저장하고 언제든 다시 확인',
    href: '/history',
    color: 'from-slate-500 to-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
];

const TRUST_POINTS = [
  {
    icon: '🔒',
    title: '서버 저장 원칙',
    desc: '생성된 콘텐츠는 Supabase에 안전하게 저장됩니다. 브라우저를 닫아도 데이터가 유지됩니다.',
  },
  {
    icon: '⚖️',
    title: '의료광고법 준수',
    desc: 'AI가 글을 작성할 때 의료광고법 위반 표현을 자동으로 검출하고 안전한 문구로 대체합니다.',
  },
  {
    icon: '🏥',
    title: '병원 실무 최적화',
    desc: '진료과 선택부터 글쓰기 스타일, SEO 키워드까지 병원 마케팅 실무 흐름에 맞춰 설계했습니다.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">

      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          {/* 로고 */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/280_logo.png" alt="WINAID" className="h-9 rounded-lg" />
            <span className="text-2xl font-black tracking-tight text-slate-900">
              WIN<span className="text-blue-500">AID</span>
            </span>
          </div>

          {/* 메인 카피 */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15] text-slate-900 mb-5">
            병원 콘텐츠,<br />
            <span className="text-blue-600">AI가 대신 씁니다</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-500 leading-relaxed max-w-lg mb-10">
            블로그 · 카드뉴스 · 보도자료까지<br className="hidden md:inline" />
            의료광고법을 지키면서 자동으로 생성합니다.
          </p>

          {/* CTA 버튼 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth"
              className="inline-flex items-center justify-center px-7 py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 hover:-translate-y-0.5"
            >
              시작하기
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center justify-center px-7 py-3.5 bg-white text-slate-700 text-sm font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all hover:-translate-y-0.5"
            >
              바로 사용해보기
            </Link>
          </div>
        </div>
      </section>

      {/* ── 핵심 기능 카드 ── */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <div className="text-center mb-14">
          <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            병원 마케팅에 필요한 콘텐츠,<br className="hidden md:inline" />
            한 곳에서 만드세요
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className={`group relative rounded-2xl border ${f.border} ${f.bg} p-6 transition-all hover:shadow-lg hover:-translate-y-1`}
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-xl mb-4 shadow-sm`}>
                {f.icon}
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              <div className="absolute top-6 right-6 text-slate-300 group-hover:text-slate-400 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 신뢰 섹션 ── */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center mb-14">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Why WINAID</p>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              병원 실무에 맞춘 설계
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TRUST_POINTS.map((tp) => (
              <div key={tp.title} className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg mb-4">
                  {tp.icon}
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">{tp.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{tp.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 하단 CTA ── */}
      <section className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-14 md:px-16 md:py-20 text-center overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-60" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-4">
              지금 바로 시작하세요
            </h2>
            <p className="text-sm md:text-base text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
              회원가입 후 바로 사용할 수 있습니다.<br />
              블로그 글 하나를 만들어보면 차이를 느낄 수 있습니다.
            </p>
            <Link
              href="/auth"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-slate-900 text-sm font-bold rounded-xl hover:bg-slate-100 transition-all shadow-lg hover:-translate-y-0.5"
            >
              무료로 시작하기
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-400">
              WIN<span className="text-blue-400">AID</span>
            </span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">병원 AI 콘텐츠 생성 플랫폼</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">로그인</Link>
            <Link href="/blog" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">블로그 생성</Link>
            <Link href="/history" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">생성 이력</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
