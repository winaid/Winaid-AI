'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type ContentTab = 'blog' | 'clinical' | 'card_news' | 'press' | 'refine' | 'image' | 'history' | 'youtube' | 'strengths' | 'influencer';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isLoggedIn: boolean;
  userEmail?: string;
  onLogout: () => void;
  credits?: number | null;
}

const writeItems: { id: ContentTab; label: string; icon: string; href: string }[] = [
  { id: 'blog', label: '블로그', icon: '📝', href: '/blog' },
  { id: 'clinical', label: '임상글 작성', icon: '🔬', href: '/clinical' },
  { id: 'press', label: '언론보도', icon: '🗞️', href: '/press' },
];

const visualItems: { id: ContentTab; label: string; icon: string; href: string }[] = [
  { id: 'card_news', label: '카드뉴스', icon: '🎨', href: '/card_news' },
  { id: 'image', label: '이미지 생성', icon: '🖼️', href: '/image' },
];

const toolItems: { id: ContentTab; label: string; icon: string; href: string }[] = [
  { id: 'refine', label: 'AI 보정', icon: '✨', href: '/refine' },
  { id: 'youtube', label: '유튜브', icon: '▶️', href: '/youtube' },
  { id: 'influencer', label: '인플루언서 탐색', icon: '🔍', href: '/influencer' },
  { id: 'strengths', label: '특장점', icon: '💪', href: '/strengths' },
  { id: 'history', label: '히스토리', icon: '🕐', href: '/history' },
];

const extraItems: { label: string; icon: string; href: string }[] = [
  { label: '사용 가이드', icon: '📖', href: '/app?guide=1' },
  { label: '피드백', icon: '💬', href: '/feedback' },
];

export function Sidebar({
  collapsed,
  onToggleCollapse,
  isLoggedIn,
  userEmail,
  onLogout,
  credits,
}: SidebarProps) {
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (href: string) => pathname === href || (href.includes('#') && pathname === href.split('#')[0]);

  const navButton = (item: { label: string; icon: string; href: string }) => {
    const hashIndex = item.href.indexOf('#');
    const hasHash = hashIndex !== -1;
    const basePath = hasHash ? item.href.slice(0, hashIndex) : item.href;
    const hash = hasHash ? item.href.slice(hashIndex + 1) : '';

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        onClick={(e) => {
          if (hasHash && pathname === basePath) {
            e.preventDefault();
            const el = document.getElementById(hash);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            window.history.replaceState(null, '', item.href);
          }
        }}
        className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
          collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
        } ${
          isActive(item.href)
            ? 'bg-blue-50 text-blue-700 font-bold'
            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
        }`}
      >
        <span className="text-base flex-none">{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside className={`hidden lg:flex flex-col flex-none h-screen sticky top-0 z-30 transition-all duration-300 border-r ${
      collapsed ? 'w-[68px]' : 'w-[210px]'
    } bg-white border-slate-200 shadow-[1px_0_0_0_rgba(0,0,0,0.04)]`}>
      {/* 로고 */}
      <div className={`h-14 flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'} border-b border-slate-100`}>
        <Link href="/app" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
          <img src="/280_logo.png" alt="WINAID" className="h-8 w-8 group-hover:scale-105 transition-transform flex-none" />
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-black text-base tracking-[-0.02em] text-slate-800">WIN<span className="text-blue-600">AID</span></span>
              <span className="text-[8px] font-semibold tracking-wider uppercase text-slate-400">AI Marketing</span>
            </div>
          )}
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        <div className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${collapsed ? 'text-center' : ''} text-slate-400`}>
          {collapsed ? '···' : '글 작성'}
        </div>
        {writeItems.map(navButton)}

        <div className={`px-2 py-1.5 mt-4 text-[10px] font-bold uppercase tracking-wider ${collapsed ? 'text-center' : ''} text-slate-400`}>
          {collapsed ? '···' : '이미지'}
        </div>
        {visualItems.map(navButton)}

        <div className={`px-2 py-1.5 mt-4 text-[10px] font-bold uppercase tracking-wider ${collapsed ? 'text-center' : ''} text-slate-400`}>
          {collapsed ? '···' : '도구'}
        </div>
        {toolItems.map(navButton)}

        <div className="mt-3 border-t border-slate-100 pt-3">
          {extraItems.map(navButton)}
        </div>
      </nav>

      {/* 하단 */}
      <div className="border-t py-3 px-2 space-y-1 border-slate-100">
        {/* 크레딧 배지 */}
        {credits !== null && credits !== undefined && (
          <div className={`flex items-center gap-1.5 rounded-xl transition-all mb-1 ${
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
          } ${credits > 0 ? 'bg-violet-50' : 'bg-red-50'}`}>
            <span className={credits > 0 ? 'text-violet-500' : 'text-red-500'}>⚡</span>
            {!collapsed && (
              <>
                <span className={`text-xs font-bold ${credits > 0 ? 'text-violet-700' : 'text-red-600'}`}>{credits}</span>
                <span className={`text-[10px] ${credits > 0 ? 'text-violet-400' : 'text-red-400'}`}>크레딧</span>
              </>
            )}
            {collapsed && <span className={`text-[10px] font-bold ${credits > 0 ? 'text-violet-700' : 'text-red-600'}`}>{credits}</span>}
            {!collapsed && (
              <div className="group relative ml-auto">
                <span className="text-[10px] text-slate-400 cursor-help">?</span>
                <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-52 p-3 bg-white border border-slate-200 rounded-xl shadow-lg z-50 text-[10px] text-slate-600 leading-relaxed">
                  <p className="font-bold text-slate-700 mb-1">크레딧 소모 기준</p>
                  <p className="text-emerald-600">✅ 소모: 블로그/카드뉴스/보도자료/이미지 새 생성</p>
                  <p className="text-blue-600 mt-0.5">🆓 무료: 이미지 재생성, 소제목 수정, AI 채팅 수정, AI 보정</p>
                </div>
              </div>
            )}
          </div>
        )}
        {isLoggedIn && userEmail ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={userEmail}
              className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } text-slate-600 hover:text-slate-800 hover:bg-slate-100/80`}
            >
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-none bg-blue-50 text-blue-600">
                {userEmail[0].toUpperCase()}
              </span>
              {!collapsed && <span className="truncate text-xs">{userEmail}</span>}
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute left-full bottom-0 ml-2 w-48 rounded-xl shadow-lg border z-50 overflow-hidden bg-white border-slate-200">
                  <button
                    onClick={() => { setShowUserMenu(false); onLogout(); }}
                    className="w-full text-left px-4 py-3 text-sm font-medium transition-colors text-red-500 hover:bg-red-50"
                  >
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <button
          onClick={onToggleCollapse}
          className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          } text-slate-600 hover:text-slate-800 hover:bg-slate-100/80`}
        >
          <svg className={`w-4 h-4 flex-none transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span>사이드바 접기</span>}
        </button>
      </div>
    </aside>
  );
}
