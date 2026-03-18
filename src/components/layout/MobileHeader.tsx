declare const __BUILD_HASH__: string;
import React from 'react';
import type { ContentTabType } from './Sidebar';

interface MobileHeaderProps {
  darkMode: boolean;
  currentPage: string;
  contentTab: ContentTabType;
  onSelectTab: (tab: ContentTabType) => void;
  onNavigateHome: () => void;
  isLoggedIn: boolean;
  userEmail?: string;
  showUserMenu: boolean;
  onToggleUserMenu: () => void;
}

export function MobileHeader({
  darkMode,
  currentPage,
  contentTab,
  onSelectTab,
  onNavigateHome,
  isLoggedIn,
  userEmail,
  showUserMenu,
  onToggleUserMenu,
}: MobileHeaderProps) {
  return (
    <header className={`lg:hidden backdrop-blur-2xl border-b sticky top-0 z-30 flex-none transition-all duration-300 ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/80 border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}>
      <div className="h-14 w-full px-5 flex justify-between items-center">
        <a href="/app" onClick={(e) => { e.preventDefault(); onNavigateHome(); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
          <img src="/280_logo.png" alt="WINAID" className={`h-8 w-8 group-hover:scale-105 transition-transform ${darkMode ? 'rounded-md bg-white p-0.5' : ''}`} />
          <div className="flex flex-col leading-none">
            <span className={`font-black text-base tracking-[-0.02em] ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>WIN<span className="text-blue-600">AID</span></span>
            <span className={`text-[8px] font-semibold tracking-wider uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>AI Marketing <span className="opacity-60" title={`빌드: ${typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'}`}>{typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'}</span></span>
          </div>
        </a>
        <div className="flex items-center gap-3">
          {isLoggedIn && userEmail && (
            <button
              onClick={onToggleUserMenu}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${darkMode ? 'bg-slate-700 text-blue-400 hover:bg-slate-600' : 'bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-600 hover:from-blue-100 hover:to-blue-200/80 border border-blue-100/80 shadow-sm'}`}
              title={userEmail}
            >
              {userEmail[0].toUpperCase()}
            </button>
          )}
        </div>
      </div>
      {/* 모바일 네비 탭 */}
      {currentPage !== 'home' && (
        <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100/80'}`}>
          <nav className="w-full px-3 flex items-center gap-1 overflow-x-auto custom-scrollbar scroll-smooth" role="tablist" aria-label="콘텐츠 유형 탭">
            {([
              { id: 'blog' as ContentTabType, label: '블로그', icon: '📝' },
              { id: 'card_news' as ContentTabType, label: '카드뉴스', icon: '🎨' },
              { id: 'press' as ContentTabType, label: '언론보도', icon: '🗞️' },
              { id: 'refine' as ContentTabType, label: 'AI 보정', icon: '✨' },
              { id: 'image' as ContentTabType, label: '이미지 생성', icon: '🖼️' },
              { id: 'history' as ContentTabType, label: '히스토리', icon: '🕐' },
            ]).map(item => (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`relative py-3 px-3 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  contentTab === item.id
                    ? darkMode ? 'text-blue-400' : 'text-blue-600'
                    : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className="text-sm">{item.icon}</span>
                  {item.label}
                </span>
                {contentTab === item.id && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
