'use client';

import { useState } from 'react';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { Sidebar } from '../../components/Sidebar';
import { MobileHeader } from '../../components/MobileHeader';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userEmail, loading, isGuest, handleLogout } = useAuthGuard();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
          <div className="text-sm font-medium text-slate-400">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8] flex">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        isLoggedIn={!isGuest}
        userEmail={isGuest ? 'Guest' : userEmail}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader
          isLoggedIn={!isGuest}
          userEmail={isGuest ? 'Guest' : userEmail}
          showUserMenu={showUserMenu}
          onToggleUserMenu={() => setShowUserMenu(v => !v)}
        />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
