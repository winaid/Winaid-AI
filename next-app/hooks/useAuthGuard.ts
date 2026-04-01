'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';
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
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (session?.user) {
          setUser(session.user);
        } else {
          // admin 로그인 상태면 리다이렉트 안 함
          const isAdmin = typeof window !== 'undefined' && localStorage.getItem('winaid_admin') === 'true';
          if (!isAdmin && typeof window !== 'undefined') {
            window.location.href = '/auth';
            return;
          }
        }
      } catch {
        // Supabase 오류 시에도 guest로 진입
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
      if (typeof window !== 'undefined') {
        const keys = Array.from(Object.keys(localStorage));
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
        // admin 플래그도 제거
        localStorage.removeItem('winaid_admin');
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
