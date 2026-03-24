'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

type ContentTab = 'blog' | 'card_news' | 'press' | 'refine' | 'image' | 'history' | 'feedback';

interface MobileHeaderProps {
  isLoggedIn: boolean;
  userEmail?: string;
  showUserMenu?: boolean;
  onToggleUserMenu: () => void;
}

const tabs: { id: ContentTab; label: string; icon: string; href: string }[] = [
  { id: 'blog', label: '블로그', icon: '📝', href: '/blog' },
  { id: 'card_news', label: '카드뉴스', icon: '🎨', href: '/card_news' },
  { id: 'press', label: '언론보도', icon: '🗞️', href: '/press' },
  { id: 'refine', label: 'AI 보정', icon: '✨', href: '/refine' },
  { id: 'image', label: '이미지 생성', icon: '🖼️', href: '/image' },
  { id: 'history', label: '히스토리', icon: '🕐', href: '/history' },
  { id: 'feedback', label: '피드백', icon: '💬', href: '/feedback' },
];

export function MobileHeader({
  isLoggedIn,
  userEmail,
  showUserMenu: _showUserMenu,
  onToggleUserMenu,
}: MobileHeaderProps) {
  const pathname = usePathname();
  const isAppHome = pathname === '/app';

  return (
    <header className="lg:hidden backdrop-blur-2xl border-b sticky top-0 z-30 flex-none transition-all duration-300 bg-white/80 border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="h-14 w-full px-5 flex justify-between items-center">
        <Link href="/app" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
          <img src="/280_logo.png" alt="WINAID" className="h-8 w-8 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col leading-none">
            <span className="font-black text-base tracking-[-0.02em] text-slate-800">WIN<span className="text-blue-600">AID</span></span>
            <span className="text-[8px] font-semibold tracking-wider uppercase text-slate-400">AI Marketing</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {isLoggedIn && userEmail ? (
            <button
              onClick={onToggleUserMenu}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-600 hover:from-blue-100 hover:to-blue-200/80 border border-blue-100/80 shadow-sm"
              title={userEmail}
            >
              {userEmail[0].toUpperCase()}
            </button>
          ) : null}
        </div>
      </div>
      {/* 모바일 네비 탭 (대시보드가 아닌 하위 페이지에서만 표시) */}
      {!isAppHome && (
        <div className="border-t border-slate-100/80">
          <nav className="w-full px-3 flex items-center gap-1 overflow-x-auto" role="tablist">
            {tabs.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative py-3 px-3 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  pathname === item.href
                    ? 'text-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className="text-sm">{item.icon}</span>
                  {item.label}
                </span>
                {pathname === item.href && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-blue-600 rounded-full" />
                )}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
