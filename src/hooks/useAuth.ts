/**
 * useAuth — Supabase 인증/세션 관리 훅
 *
 * App.tsx에서 추출.
 * OAuth 콜백 처리, 세션 확인, 프로필 자동 생성, 인증 상태 변경 감시.
 */
import { useState, useEffect } from 'react';
import { supabase, signOut } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  name: string;
}

interface UseAuthReturn {
  supabaseUser: User | null;
  userProfile: UserProfile | null;
  isLoggedIn: boolean;
  authLoading: boolean;
  isAdmin: boolean;
  handleLogout: () => Promise<void>;
}

export function useAuth(
  onLoginRedirect: (page: string) => void,
): UseAuthReturn {
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // 관리자 인증 상태 확인
    const adminAuth = sessionStorage.getItem('ADMIN_AUTHENTICATED');
    if (adminAuth === 'true') setIsAdmin(true);

    // OAuth 콜백 처리
    const handleOAuthCallback = async () => {
      const hash = window.location.hash;
      if (hash && (hash.includes('access_token') || hash.includes('error'))) {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          window.history.replaceState(null, '', '/auth');
          return null;
        }
        if (session?.user) {
          window.history.replaceState(null, '', '/blog');
          return session;
        }
      }
      return null;
    };

    // 세션 확인
    const checkSession = async () => {
      const oauthSession = await handleOAuthCallback();
      const session = oauthSession || (await supabase.auth.getSession()).data.session;

      if (session?.user) {
        setSupabaseUser(session.user);
        setIsLoggedIn(true);
        setUserProfile({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자',
        });

        if (window.location.pathname === '/auth') {
          onLoginRedirect('home');
        }
      }
      setAuthLoading(false);
    };

    checkSession();

    // 인증 상태 변경 감시
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setSupabaseUser(session.user);
        setIsLoggedIn(true);
        setUserProfile({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자',
        });

        // 프로필 자동 생성
        if (event === 'SIGNED_IN') {
          try {
            const { data: profile } = await supabase.from('profiles').select('id').eq('id', session.user.id).single();
            if (!profile) {
              await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                full_name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '사용자',
                avatar_url: session.user.user_metadata?.avatar_url || null,
                created_at: new Date().toISOString(),
              } as any, { onConflict: 'id' });

              await supabase.from('subscriptions').upsert({
                user_id: session.user.id,
                plan_type: 'free',
                credits_total: 3,
                credits_used: 0,
                expires_at: null,
              } as any, { onConflict: 'user_id' });
            }
          } catch (e) {
            console.error('프로필 확인/생성 실패 (무시):', e);
          }
        }

        // 로그인 성공 시 리다이렉트
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setAuthLoading(false);
          const currentHash = window.location.hash;
          const currentPath = window.location.pathname;

          if (currentHash.includes('access_token') || currentHash.includes('refresh_token')) {
            window.history.replaceState(null, '', '/app');
            onLoginRedirect('home');
          } else if (currentPath === '/auth' || currentPath === '/login' || currentPath === '/register') {
            onLoginRedirect('home');
          }
        }
      } else {
        setSupabaseUser(null);
        setUserProfile(null);
        setIsLoggedIn(false);
        setAuthLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('로그아웃 에러 (무시하고 강제 로그아웃 진행):', error);
    } finally {
      setSupabaseUser(null);
      setUserProfile(null);
      setIsLoggedIn(false);
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-hospitalai-auth-token');
      sessionStorage.clear();
      window.history.replaceState(null, '', '/auth');
      window.location.reload();
    }
  };

  return { supabaseUser, userProfile, isLoggedIn, authLoading, isAdmin, handleLogout };
}
