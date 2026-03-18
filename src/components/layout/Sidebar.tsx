import React, { useState } from 'react';

export type ContentTabType = 'blog' | 'refine' | 'card_news' | 'press' | 'image' | 'history';

interface SidebarProps {
  darkMode: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleDarkMode: () => void;
  contentTab: ContentTabType;
  currentPage: string;
  onSelectTab: (tab: ContentTabType) => void;
  onNavigateHome: () => void;
  isLoggedIn: boolean;
  userEmail?: string;
  onLogout: () => void;
}

export function Sidebar({
  darkMode,
  collapsed,
  onToggleCollapse,
  onToggleDarkMode,
  contentTab,
  currentPage,
  onSelectTab,
  onNavigateHome,
  isLoggedIn,
  userEmail,
  onLogout,
}: SidebarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <aside className={`hidden lg:flex flex-col flex-none h-screen sticky top-0 z-30 transition-all duration-300 border-r ${
      collapsed ? 'w-[68px]' : 'w-[210px]'
    } ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-[1px_0_0_0_rgba(0,0,0,0.04)]'}`}>
      {/* 로고 */}
      <div className={`h-14 flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'} border-b ${darkMode ? 'border-[#30363d]' : 'border-slate-100'}`}>
        <a href="/app" onClick={(e) => { e.preventDefault(); onNavigateHome(); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer group">
          <img src="/280_logo.png" alt="WINAID" className={`h-8 w-8 group-hover:scale-105 transition-transform flex-none ${darkMode ? 'rounded-md bg-white p-0.5' : ''}`} />
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className={`font-black text-base tracking-[-0.02em] ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>WIN<span className="text-blue-600">AID</span></span>
              <span className={`text-[8px] font-semibold tracking-wider uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>AI Marketing</span>
            </div>
          )}
        </a>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        <div className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${collapsed ? 'text-center' : ''} ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          {collapsed ? '···' : '콘텐츠'}
        </div>
        {([
          { id: 'blog' as ContentTabType, label: '블로그', icon: '📝' },
          { id: 'card_news' as ContentTabType, label: '카드뉴스', icon: '🎨' },
          { id: 'press' as ContentTabType, label: '언론보도', icon: '🗞️' },
        ]).map(item => (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${
              contentTab === item.id && currentPage !== 'home'
                ? darkMode ? 'bg-blue-500/20 text-blue-400 font-bold' : 'bg-blue-50 text-blue-700 font-bold'
                : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2128]' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span className="text-base flex-none">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}

        <div className={`px-2 py-1.5 mt-4 text-[10px] font-bold uppercase tracking-wider ${collapsed ? 'text-center' : ''} ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          {collapsed ? '···' : '도구'}
        </div>
        {([
          { id: 'refine' as ContentTabType, label: 'AI 보정', icon: '✨' },
          { id: 'image' as ContentTabType, label: '이미지 생성', icon: '🖼️' },
          { id: 'history' as ContentTabType, label: '히스토리', icon: '🕐' },
        ]).map(item => (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${
              contentTab === item.id && currentPage !== 'home'
                ? darkMode ? 'bg-blue-500/20 text-blue-400 font-bold' : 'bg-blue-50 text-blue-700 font-bold'
                : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2128]' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span className="text-base flex-none">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* 하단: 다크모드 + 유저 + 접기 */}
      <div className={`border-t py-3 px-2 space-y-1 ${darkMode ? 'border-[#30363d]' : 'border-slate-100'}`}>
        <button
          onClick={onToggleDarkMode}
          title={darkMode ? '라이트 모드' : '다크 모드'}
          className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          } ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/80'}`}
        >
          <span className="text-base flex-none">{darkMode ? '☀️' : '🌙'}</span>
          {!collapsed && <span>{darkMode ? '라이트 모드' : '다크 모드'}</span>}
        </button>

        {isLoggedIn && userEmail && (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={userEmail}
              className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/80'}`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-none ${darkMode ? 'bg-slate-700 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                {userEmail[0].toUpperCase()}
              </span>
              {!collapsed && <span className="truncate text-xs">{userEmail}</span>}
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className={`absolute left-full bottom-0 ml-2 w-48 rounded-xl shadow-lg border z-50 overflow-hidden ${darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'}`}>
                  <button
                    onClick={() => { setShowUserMenu(false); onLogout(); }}
                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${darkMode ? 'text-red-400 hover:bg-slate-700' : 'text-red-500 hover:bg-red-50'}`}
                  >
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className={`w-full flex items-center gap-2.5 rounded-xl transition-all text-[13px] font-semibold ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          } ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/80'}`}
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
