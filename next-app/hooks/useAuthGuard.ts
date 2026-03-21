'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthGuardResult {
  user: User | null;
  userEmail: string;
  userName: string;
  loading: boolean;
  handleLogout: () => Promise<void>;
}

export function useAuthGuard(): AuthGuardResult {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      router.replace('/auth');
      return;
    }

    let mounted = true;
    const supabase = getSupabaseClient();

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session) {
        router.replace('/auth');
        return;
      }

      setUser(session.user);
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        setLoading(false);
      } else {
        setUser(null);
        router.replace('/auth');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('로그아웃 에러:', e);
    } finally {
      setUser(null);
      // localStorage에서 Supabase 세션 정리
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }
      router.replace('/auth');
    }
  };

  const userEmail = user?.email || '';
  const userName = user?.user_metadata?.name
    || user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || '사용자';

  return { user, userEmail, userName, loading, handleLogout };
}
