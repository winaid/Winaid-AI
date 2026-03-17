import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';

/**
 * 전역 앱 상태 관리 (Context API)
 * - 사용자 정보
 * - 크레딧 관리
 * - 로딩 상태
 * - 에러 상태
 */

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'basic' | 'standard' | 'premium';
  remainingCredits: number;
  expiresAt?: string;
}

interface AppState {
  // 사용자 관련
  user: User | null;
  userProfile: UserProfile | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  
  // UI 상태
  isLoading: boolean;
  error: string | null;
  
  // 앱 설정
  darkMode: boolean;
}

interface AppActions {
  // 사용자 액션
  setUser: (user: User | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  updateCredits: (credits: number) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  
  // UI 액션
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // 설정 액션
  toggleDarkMode: () => void;
}

interface AppContextValue {
  state: AppState;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

// 초기 상태를 함수로 생성 (localStorage에서 darkMode 복원)
const getInitialState = (): AppState => {
  const savedDarkMode = typeof window !== 'undefined' ? localStorage.getItem('darkMode') : null;
  return {
    user: null,
    userProfile: null,
    isLoggedIn: false,
    isAdmin: false,
    isLoading: false,
    error: null,
    darkMode: savedDarkMode === 'true',
  };
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(getInitialState);

  // darkMode 변경 시 LocalStorage 저장
  useEffect(() => {
    localStorage.setItem('darkMode', state.darkMode.toString());
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.darkMode]);

  // Actions를 useMemo로 메모이제이션 (불필요한 리렌더링 방지)
  const actions = useMemo<AppActions>(() => ({
    // 사용자 액션
    setUser: (user) => {
      setState(prev => ({
        ...prev,
        user,
        isLoggedIn: !!user,
      }));
    },

    setUserProfile: (profile) => {
      setState(prev => ({
        ...prev,
        userProfile: profile,
      }));
    },

    updateCredits: (credits) => {
      setState(prev => ({
        ...prev,
        userProfile: prev.userProfile
          ? { ...prev.userProfile, remainingCredits: credits }
          : null,
      }));
    },

    setIsAdmin: (isAdmin) => {
      setState(prev => ({ ...prev, isAdmin }));
    },

    // UI 액션
    setLoading: (loading) => {
      setState(prev => ({ ...prev, isLoading: loading }));
    },

    setError: (error) => {
      setState(prev => ({ ...prev, error }));
    },

    clearError: () => {
      setState(prev => ({ ...prev, error: null }));
    },

    // 설정 액션
    toggleDarkMode: () => {
      setState(prev => ({ ...prev, darkMode: !prev.darkMode }));
    },
  }), []);

  const value = useMemo<AppContextValue>(
    () => ({ state, actions }),
    [state, actions]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

/**
 * useApp 훅
 */
export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  
  return context;
};

/**
 * 편의 훅들
 */

// 사용자 정보만 필요한 경우
export const useUser = () => {
  const { state } = useApp();
  return {
    user: state.user,
    profile: state.userProfile,
    isLoggedIn: state.isLoggedIn,
    isAdmin: state.isAdmin,
  };
};

// 크레딧 관리만 필요한 경우
export const useCredits = () => {
  const { state, actions } = useApp();
  return {
    credits: state.userProfile?.remainingCredits ?? 0,
    plan: state.userProfile?.plan ?? 'free',
    updateCredits: actions.updateCredits,
  };
};

// UI 상태만 필요한 경우
export const useUI = () => {
  const { state, actions } = useApp();
  return {
    isLoading: state.isLoading,
    error: state.error,
    setLoading: actions.setLoading,
    setError: actions.setError,
    clearError: actions.clearError,
  };
};

// 다크모드만 필요한 경우
export const useDarkMode = () => {
  const { state, actions } = useApp();
  return {
    darkMode: state.darkMode,
    toggleDarkMode: actions.toggleDarkMode,
  };
};
