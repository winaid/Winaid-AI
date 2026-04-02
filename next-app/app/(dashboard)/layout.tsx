'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { Sidebar } from '../../components/Sidebar';
import { MobileHeader } from '../../components/MobileHeader';
import { UpdateNotes } from '../../components/UpdateNotes';
import { getCredits, type CreditInfo } from '../../lib/creditService';

// 크레딧 Context
interface CreditContextType {
  creditInfo: CreditInfo | null;
  userId: string | null;
  setCreditInfo: (info: CreditInfo | null) => void;
}
const CreditContext = createContext<CreditContextType>({ creditInfo: null, userId: null, setCreditInfo: () => {} });
export const useCreditContext = () => useContext(CreditContext);

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userEmail, userName, loading, isGuest, handleLogout } = useAuthGuard();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);

  // 크레딧 조회
  useEffect(() => {
    if (user?.id) {
      getCredits(user.id).then(info => {
        if (info) setCreditInfo(info);
      });
    }
  }, [user?.id]);

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
    <CreditContext.Provider value={{ creditInfo, userId: user?.id || null, setCreditInfo }}>
      <div className="min-h-screen bg-[#f7f7f8] flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          isLoggedIn={!isGuest}
          userEmail={isGuest ? 'Guest' : (userName || userEmail)}
          onLogout={handleLogout}
          credits={creditInfo?.credits ?? null}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileHeader
            isLoggedIn={!isGuest}
            userEmail={isGuest ? 'Guest' : (userName || userEmail)}
            showUserMenu={showUserMenu}
            onToggleUserMenu={() => setShowUserMenu(v => !v)}
            onLogout={handleLogout}
          />
          <main className="flex-1">
            {children}
          </main>
        </div>
        <UpdateNotes />
      </div>
    </CreditContext.Provider>
  );
}
