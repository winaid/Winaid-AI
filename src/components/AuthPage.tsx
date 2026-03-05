import React, { useState, useEffect } from 'react';
import { 
  signUpWithEmail, 
  signInWithEmail, 
  signInWithOAuth, 
  resetPassword,
  supabase 
} from '../lib/supabase';

interface AuthPageProps {
  onNavigate: (page: 'app' | 'admin' | 'auth') => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
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
        // URL 정리 후 앱으로
        window.history.replaceState(null, '', window.location.pathname + '#app');
        onNavigate('app');
        return;
      }
      
      // 일반 세션 체크
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[AuthPage] Session check:', session?.user?.email);
      if (session) {
        onNavigate('app');
      }
    };
    checkSessionAndOAuth();
  }, [onNavigate]);

  // 이메일 로그인
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      const { data, error } = await signInWithEmail(email, password);
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('이메일 인증이 필요합니다. 메일함을 확인해주세요.');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }
      
      if (data.user) {
        // 로그인 성공
        onNavigate('app');
      }
    } catch {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
    }
    setIsLoading(false);
  };

  // 이메일 회원가입
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
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
      const { data, error } = await signUpWithEmail(email, password, name);
      
      if (error) {
        if (error.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다.');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }
      
      if (data.user) {
        // 이미 가입된 이메일인 경우
        if (data.user.identities?.length === 0) {
          setError('이미 가입된 이메일입니다.');
        } 
        // 세션이 있으면 바로 로그인 성공 (이메일 확인 비활성화 시)
        else if (data.session) {
          setMessage('회원가입이 완료되었습니다!');
          // 약간의 딜레이 후 앱으로 이동
          setTimeout(() => {
            onNavigate('app');
          }, 500);
        }
        // 이메일 확인이 필요한 경우
        else {
          setMessage('회원가입이 완료되었습니다! 이메일을 확인해주세요.');
          setMode('login');
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setName('');
        }
      }
    } catch {
      setError('회원가입에 실패했습니다. 다시 시도해주세요.');
    }
    setIsLoading(false);
  };

  // 비밀번호 재설정
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      const { error } = await resetPassword(email);
      
      if (error) {
        setError(error.message);
        setIsLoading(false);
        return;
      }
      
      setMessage('비밀번호 재설정 링크가 이메일로 전송되었습니다.');
    } catch {
      setError('이메일 전송에 실패했습니다.');
    }
    setIsLoading(false);
  };

  // OAuth 로그인 (현재 Google만 지원)
  const handleOAuthLogin = async (provider: 'google' | 'kakao' | 'naver') => {
    setError(null);
    setIsLoading(true);
    
    // 현재 Google만 지원
    if (provider !== 'google') {
      setError(`${provider.charAt(0).toUpperCase() + provider.slice(1)} 로그인은 준비 중입니다.`);
      setIsLoading(false);
      return;
    }
    
    try {
      const { error } = await signInWithOAuth('google');
      
      if (error) {
        setError('Google 로그인 설정이 필요합니다. Supabase 대시보드에서 Google OAuth를 활성화해주세요.');
      }
      // OAuth는 리다이렉트되므로 여기서 로딩 해제 안함
    } catch {
      setError('소셜 로그인에 실패했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white">
            <svg className="w-12 h-12" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 86L26 14h14L16 86H2z" fill="#ffffff"/>
              <path d="M26 14L54 86H40L26 14z" fill="#ffffff"/>
              <path d="M9 54h28v11H9z" fill="#ffffff"/>
              <path d="M47 14h11v72H47z" fill="#3B82F6"/>
              <path d="M58 14h11c17 0 29 16 29 34s-12 34-29 34H58V72h11c10 0 17-10 17-24s-7-24-17-24H58V14z" fill="#ffffff"/>
            </svg>
            <span className="text-2xl font-bold">WINAID</span>
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-8">
          {/* Mode Tabs */}
          {mode !== 'forgot' && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => { setMode('login'); setError(null); setMessage(null); }}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                로그인
              </button>
              <button
                onClick={() => { setMode('register'); setError(null); setMessage(null); }}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                  mode === 'register'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                회원가입
              </button>
            </div>
          )}

          {/* Error/Message Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-lg text-emerald-300 text-sm">
              {message}
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setMessage(null); }}
                  className="text-sm text-emerald-400 hover:text-emerald-300"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>
          )}

          {/* Register Form */}
          {mode === 'register' && (
            <form onSubmit={handleEmailRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">닉네임</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="병원마케터"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 재입력"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    가입 중...
                  </span>
                ) : '회원가입'}
              </button>
              <p className="text-xs text-slate-500 text-center">
                가입 시 <span className="text-emerald-400">서비스 이용약관</span> 및 <span className="text-emerald-400">개인정보 처리방침</span>에 동의합니다.
              </p>
            </form>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold text-white">비밀번호 재설정</h3>
                <p className="text-slate-400 text-sm mt-1">가입한 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '전송 중...' : '재설정 링크 전송'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setMessage(null); }}
                className="w-full py-3 text-slate-400 hover:text-white transition-colors"
              >
                로그인으로 돌아가기
              </button>
            </form>
          )}

          {/* OAuth Divider */}
          {mode !== 'forgot' && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-slate-800 text-slate-400">또는</span>
                </div>
              </div>

              {/* OAuth Buttons */}
              <div className="space-y-3">
                {/* Google */}
                <button
                  onClick={() => handleOAuthLogin('google')}
                  disabled={isLoading}
                  className="w-full py-3 bg-white text-gray-800 font-medium rounded-xl hover:bg-gray-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google로 계속하기
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
