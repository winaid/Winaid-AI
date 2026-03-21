'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { signInWithTeam, signUpWithTeam } from '../../lib/auth';
import { TEAM_DATA } from '../../lib/teamData';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [teamId, setTeamId] = useState<number>(TEAM_DATA[0].id);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // 마운트 시 세션 체크 + OAuth 콜백 처리
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      return;
    }

    const checkSessionAndOAuth = async () => {
      const hash = window.location.hash;

      // OAuth 콜백 (access_token이 URL에 있는 경우)
      if (hash && (hash.includes('access_token') || hash.includes('refresh_token'))) {
        const { data: { session } } = await supabase!.auth.getSession();
        if (session) {
          router.push('/app');
          return;
        }
      }

      // 일반 세션 체크
      const { data: { session } } = await supabase!.auth.getSession();
      if (session) {
        router.push('/app');
        return;
      }

      setCheckingSession(false);
    };

    checkSessionAndOAuth();
  }, [router]);

  // Supabase 미설정 시 안내 화면
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2.5">
              <img src="/280_logo.png" alt="WINAID" className="h-10 rounded-lg" />
              <span className="text-2xl font-black text-slate-800">WIN<span className="text-blue-500">AID</span></span>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto bg-amber-50">
              <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">로그인 서비스 준비 중</h2>
            <p className="text-sm text-slate-500 mb-4">
              Supabase 환경변수가 설정되지 않아 인증 기능을 사용할 수 없습니다.
            </p>
            <p className="text-xs text-slate-400">
              <code className="bg-slate-100 px-1.5 py-0.5 rounded">.env.local</code>에 <code className="bg-slate-100 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</code>과 <code className="bg-slate-100 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를 설정하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 팀 로그인
  const handleTeamLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data, error: authError } = await signInWithTeam(name.trim(), teamId, password);

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('이름 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(authError.message);
        }
        setIsLoading(false);
        return;
      }

      if (data.user) {
        router.push('/app');
      }
    } catch {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
    }
    setIsLoading(false);
  };

  // 팀 회원가입
  const handleTeamRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error: authError } = await signUpWithTeam(name.trim(), teamId, password);

      if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
          setError('이미 가입된 이름입니다. 다른 이름을 사용하거나 로그인해주세요.');
        } else {
          setError(authError.message);
        }
        setIsLoading(false);
        return;
      }

      if (data.user) {
        if (data.user.identities?.length === 0) {
          setError('이미 가입된 계정입니다.');
        } else if (data.session) {
          setMessage('가입이 완료되었습니다!');
          setTimeout(() => {
            router.push('/app');
          }, 500);
        } else {
          setMessage('가입이 완료되었습니다! 로그인해주세요.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch {
      setError('회원가입에 실패했습니다. 다시 시도해주세요.');
    }
    setIsLoading(false);
  };

  // 세션 확인 중 로딩
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
          <div className="text-sm font-medium text-slate-400">세션 확인 중...</div>
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all";
  const btnPrimaryCls = "w-full py-3.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  const spinner = (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  const teamField = (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1.5">팀 선택</label>
      <select
        value={teamId}
        onChange={(e) => setTeamId(Number(e.target.value))}
        className={inputCls}
      >
        {TEAM_DATA.map((team) => (
          <option key={team.id} value={team.id}>{team.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5">
            <img src="/280_logo.png" alt="WINAID" className="h-10 rounded-lg" />
            <span className="text-2xl font-black text-slate-800">WIN<span className="text-blue-500">AID</span></span>
          </div>
          <p className="text-slate-400 text-sm mt-2">병원 마케팅 AI 플랫폼</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-8">
          {/* Mode Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            <button
              onClick={() => { setMode('login'); setError(null); setMessage(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              로그인
            </button>
            <button
              onClick={() => { setMode('register'); setError(null); setMessage(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              회원가입
            </button>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}
          {message && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-sm">{message}</div>}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleTeamLogin} className="space-y-4">
              {teamField}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={inputCls}
                />
              </div>
              <button type="submit" disabled={isLoading} className={btnPrimaryCls}>
                {isLoading ? <span className="flex items-center justify-center gap-2">{spinner} 로그인 중...</span> : '로그인'}
              </button>
            </form>
          )}

          {/* Register Form */}
          {mode === 'register' && (
            <form onSubmit={handleTeamRegister} className="space-y-4">
              {teamField}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 재입력"
                  required
                  className={inputCls}
                />
              </div>
              <button type="submit" disabled={isLoading} className={btnPrimaryCls}>
                {isLoading ? <span className="flex items-center justify-center gap-2">{spinner} 가입 중...</span> : '회원가입'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
