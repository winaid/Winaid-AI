import React, { useState, useEffect } from 'react';
import {
  signUpWithTeam,
  signInWithTeam,
  supabase
} from '../lib/supabase';
import { TEAM_DATA } from '../constants/teamHospitals';

interface AuthPageProps {
  onNavigate: (page: 'blog' | 'admin' | 'auth') => void;
}

type AuthMode = 'login' | 'register';

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [teamId, setTeamId] = useState<number>(TEAM_DATA[0].id);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 이미 로그인된 경우 또는 OAuth 콜백 처리
  useEffect(() => {
    const checkSessionAndOAuth = async () => {
      const hash = window.location.hash;
      console.log('[AuthPage] Checking session, hash:', hash);

      // OAuth 토큰이 URL에 있는 경우 (콜백)
      if (hash && (hash.includes('access_token') || hash.includes('refresh_token'))) {
        console.log('[AuthPage] OAuth callback detected, redirecting to app');
        window.history.replaceState(null, '', window.location.pathname + '#blog');
        onNavigate('blog');
        return;
      }

      // 일반 세션 체크
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[AuthPage] Session check:', session?.user?.email);
      if (session) {
        onNavigate('blog');
      }
    };
    checkSessionAndOAuth();
  }, [onNavigate]);

  // 팀 로그인
  const handleTeamLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data, error } = await signInWithTeam(name.trim(), teamId, password);

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('이름 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }

      if (data.user) {
        onNavigate('blog');
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
      const { data, error } = await signUpWithTeam(name.trim(), teamId, password);

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already registered')) {
          setError('이미 가입된 이름입니다. 다른 이름을 사용하거나 로그인해주세요.');
        } else {
          setError(error.message);
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
            onNavigate('blog');
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

  const inputCls = "w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all";
  const btnPrimaryCls = "w-full py-3.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const spinner = <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>;

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
};
