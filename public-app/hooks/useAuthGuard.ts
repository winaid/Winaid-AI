'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured, getSupabaseClient } from '@winaid/blog-core';
import { resetGuestCredits } from '../lib/guestCredits';
import type { User } from '@supabase/supabase-js';

interface AuthGuardResult {
  user: User | null;
  userEmail: string;
  userName: string;
  loading: boolean;
  isGuest: boolean;
  handleLogout: () => Promise<void>;
}

export function useAuthGuard(): AuthGuardResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Supabase 미설정 → guest 모드로 진입
      setLoading(false);
      return;
    }

    let mounted = true;
    const supabase = getSupabaseClient();

    const checkSession = async () => {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('auth_guard_timeout')), 5_000),
        );

        const sessionPromise = (async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!mounted) return;
          if (session?.user) {
            setUser(session.user);
          } else {
            const isGuestMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('guest') === '1';
            if (!isGuestMode && typeof window !== 'undefined') {
              window.location.href = '/auth';
              return;
            }
          }
        })();

        await Promise.race([sessionPromise, timeoutPromise]);
      } catch (err) {
        console.warn('[useAuthGuard] 세션 확인 실패:', (err as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured) {
        const supabase = getSupabaseClient();
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error('로그아웃 에러:', e);
    } finally {
      setUser(null);
      // 게스트 크레딧 초기화 (재방문 시 3개 새로 받음)
      resetGuestCredits();
      if (typeof window !== 'undefined') {
        const keys = Array.from(Object.keys(localStorage));
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
        // auth 페이지로 리다이렉트
        window.location.href = '/auth';
      }
    }
  };

  const isGuest = !user;
  const userEmail = user?.email || '';
  const userName = user?.user_metadata?.name
    || user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || (isGuest ? 'Guest' : '사용자');

  return { user, userEmail, userName, loading, isGuest, handleLogout };
}
