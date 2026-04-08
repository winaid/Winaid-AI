'use client';

export default function InfluencerPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <div className="text-8xl mb-6">🔍</div>
      <h1 className="text-2xl font-bold text-slate-800 mb-3">인플루언서 탐색 준비 중!</h1>
      <p className="text-slate-500 text-sm leading-relaxed max-w-md">
        병원 근처 로컬 마이크로 인플루언서를 찾고<br/>
        협업 제안 DM을 자동 생성하는 기능입니다 🤝<br/><br/>
        <span className="text-amber-600 font-semibold">⚠️ Instagram API 유료 플랜 전환 필요</span><br/>
        <span className="text-xs text-slate-400">RapidAPI Instagram Scraper Pro ($10/월) 구독 후 활성화됩니다</span>
      </p>
    </div>
  );
}
