import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session as _Session } from '@supabase/supabase-js';
import { supabase, reinitializeSupabase, isSupabaseConfigured } from '../lib/supabase';
import { PLANS as _PLANS, PlanType } from '../lib/database.types';
import type { Database } from '../lib/database.types';

// Supabase 테이블 타입
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface Subscription {
  plan_type: PlanType;
  credits_total: number;
  credits_used: number;
  credits_remaining: number;
  expires_at: string | null;
  is_expired: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  subscription: Subscription | null;
  loading: boolean;
  configured: boolean;
  // Auth methods
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithProvider: (provider: 'google' | 'kakao' | 'naver') => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  
  // Usage methods
  canGenerate: () => boolean;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [client, setClient] = useState(supabase);

  // 자동 로그인 해제 시: 탭/브라우저 닫으면 세션 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionOnly = sessionStorage.getItem('winaid_session_only');
      const rememberMe = localStorage.getItem('winaid_remember_me');
      if (sessionOnly === 'true' || rememberMe === 'false') {
        // localStorage에서 Supabase 세션 토큰 제거
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Supabase 설정 확인 및 인증 상태 로드
  useEffect(() => {
    let isMounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      const isConfigured = isSupabaseConfigured();
      if (isMounted) setConfigured(isConfigured);

      if (!isConfigured) {
        if (isMounted) setLoading(false);
        return;
      }

      const newClient = reinitializeSupabase();
      if (isMounted) setClient(newClient);

      // 현재 세션 확인
      const { data: { session } } = await newClient.auth.getSession();
      if (!isMounted) return;

      if (session?.user) {
        setUser(session.user);

        // 사용자 정보 추출
        const userEmail = session.user.email;
        const userName = session.user.user_metadata?.full_name ||
                        session.user.user_metadata?.name ||
                        session.user.email?.split('@')[0] || null;

        await Promise.all([
          loadProfile(session.user.id, newClient, userEmail, userName),
          loadSubscription(session.user.id, newClient)
        ]);
        if (!isMounted) return;
      }

      setLoading(false);

      // Auth 상태 변경 리스너
      const { data: { subscription: authSub } } = newClient.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;

        if (session?.user) {
          setUser(session.user);

          const userEmail = session.user.email;
          const userName = session.user.user_metadata?.full_name ||
                          session.user.user_metadata?.name ||
                          session.user.email?.split('@')[0] || null;

          await Promise.all([
            loadProfile(session.user.id, newClient, userEmail, userName),
            loadSubscription(session.user.id, newClient)
          ]);
        } else if (isMounted) {
          setUser(null);
          setProfile(null);
          setSubscription(null);
        }
      });

      authSubscription = authSub;
    };

    init();

    return () => {
      isMounted = false;
      authSubscription?.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string, supabaseClient: typeof supabase, userEmail?: string, userName?: string) => {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data as UserProfile);
    } else if (error?.code === 'PGRST116') {
      // 프로필이 없으면 생성 (OAuth 로그인 시)
      const newProfile: Omit<ProfileRow, 'created_at' | 'updated_at'> = {
        id: userId,
        email: userEmail || null,
        full_name: userName || null,
        avatar_url: null
      };
      
      const { error: insertError } = await supabaseClient
        .from('profiles')
        .insert(newProfile as any);
      
      if (!insertError) {
        setProfile(newProfile);
      }
    }
  };

  const loadSubscription = async (userId: string, supabaseClient: typeof supabase) => {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single() as { data: SubscriptionRow | null; error: any };

    if (data) {
      const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
      const creditsRemaining = data.credits_total === -1 
        ? Infinity 
        : data.credits_total - data.credits_used;

      setSubscription({
        plan_type: data.plan_type as PlanType,
        credits_total: data.credits_total,
        credits_used: data.credits_used,
        credits_remaining: creditsRemaining,
        expires_at: data.expires_at,
        is_expired: isExpired
      });
    } else if (error?.code === 'PGRST116') {
      // 구독이 없으면 무료 플랜 생성 (OAuth 로그인 시)
      const newSubscription: Omit<SubscriptionRow, 'id' | 'created_at' | 'updated_at'> = {
        user_id: userId,
        plan_type: 'free',
        credits_total: 10,
        credits_used: 0,
        expires_at: null
      };

      const { error: insertError } = await supabaseClient
        .from('subscriptions')
        .insert(newSubscription as any);

      if (!insertError) {
        setSubscription({
          plan_type: 'free',
          credits_total: 10,
          credits_used: 0,
          credits_remaining: 10,
          expires_at: null,
          is_expired: false
        });
      }
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    if (!configured) return { error: new Error('Supabase not configured') };

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });

    if (error) return { error };

    // 프로필 생성
    if (data.user) {
      await client.from('profiles').insert({
        id: data.user.id,
        email: email,
        full_name: fullName || null
      } as any);

      // 무료 구독 생성
      await client.from('subscriptions').insert({
        user_id: data.user.id,
        plan_type: 'free',
        credits_total: 10,
        credits_used: 0
      } as any);
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    if (!configured) return { error: new Error('Supabase not configured') };

    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error: error || null };
  };

  const signInWithProvider = async (_provider: 'google' | 'kakao' | 'naver') => {
    if (!configured) return { error: new Error('Supabase not configured') };

    const { error } = await client.auth.signInWithOAuth({
      provider: _provider as any,
      options: {
        redirectTo: window.location.origin + '/blog'
      }
    });
    return { error: error || null };
  };

  const signOut = async () => {
    try {
      await client.auth.signOut();
    } catch (error) {
      console.error('Supabase signOut 에러 (무시하고 로컬 세션 삭제):', error);
    } finally {
      // 🔴 강제 로그아웃: 에러가 나더라도 로컬 상태는 무조건 초기화
      setUser(null);
      setProfile(null);
      setSubscription(null);

      // 🚀 성능 개선: localStorage 정리를 백그라운드로 처리 (UI 블로킹 방지)
      requestIdleCallback(() => {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      });
    }
  };

  // 서버에서 JWT+generation token으로 크레딧 차감 — 프론트엔드는 표시용만
  const canGenerate = useCallback((): boolean => {
    if (!user || !subscription) return false; // 로그인 필수
    if (subscription.is_expired) return false;
    if (subscription.credits_total === -1) return true; // 무제한
    return subscription.credits_remaining > 0;
  }, [user, subscription]);

  const refreshSubscription = async () => {
    if (user) {
      await loadSubscription(user.id, client);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      subscription,
      loading,
      configured,
      signUp,
      signIn,
      signInWithProvider,
      signOut,
      canGenerate,
      refreshSubscription
    }}>
      {children}
    </AuthContext.Provider>
  );
};
