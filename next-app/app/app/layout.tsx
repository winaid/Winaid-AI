/**
 * App Layout — "/app" 이하 모든 인증된 페이지의 공통 레이아웃
 *
 * TODO: 기존 Sidebar + MobileHeader를 여기서 렌더
 * 인증 체크 미들웨어 또는 서버 컴포넌트에서 처리
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* TODO: <Sidebar /> */}
      <aside className="w-64 bg-white border-r border-slate-200 p-4 hidden md:block">
        <div className="text-lg font-bold text-blue-600 mb-8">WINAID</div>
        <nav className="space-y-2">
          <div className="text-sm text-slate-400">[Sidebar placeholder]</div>
          <a href="/app" className="block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">대시보드</a>
          <a href="/blog" className="block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">블로그</a>
          <a href="/card_news" className="block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">카드뉴스</a>
          <a href="/press" className="block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">보도자료</a>
          <a href="/history" className="block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">이력</a>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
