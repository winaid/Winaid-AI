import React, { useState } from 'react';

interface PasswordLoginProps {
  onSuccess: () => void;
}

const PasswordLogin: React.FC<PasswordLoginProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password === '0000') {
      sessionStorage.setItem('hospital_ai_auth', 'true');
      onSuccess();
    } else {
      setError('비밀번호가 올바르지 않습니다.');
      setPassword('');
    }
  };

  const handleNumberClick = (num: string) => {
    if (password.length < 4) {
      setPassword(password + num);
    }
  };

  const handleDelete = () => {
    setPassword(password.slice(0, -1));
  };

  const handleClear = () => {
    setPassword('');
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-emerald-50 to-green-100 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
        {/* 로고 */}
        <div className="flex items-center justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
            H
          </div>
        </div>

        {/* 제목 */}
        <h1 className="text-2xl font-black text-center text-slate-800 mb-2">
          WIN<span className="text-blue-500">AID</span></h1>
        <p className="text-center text-slate-500 mb-8">
          비밀번호를 입력하세요
        </p>

        {/* 비밀번호 표시 */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all ${
                password.length > i
                  ? 'bg-emerald-500 text-white shadow-lg scale-110'
                  : 'bg-slate-100 text-slate-300'
              }`}
            >
              {password.length > i ? '●' : '○'}
            </div>
          ))}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* 숫자 패드 */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleNumberClick(num)}
                disabled={password.length >= 4}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl text-xl font-bold text-slate-800 transition-all disabled:opacity-50"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 bg-red-100 hover:bg-red-200 active:bg-red-300 rounded-xl text-sm font-bold text-red-700 transition-all"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => handleNumberClick('0')}
              disabled={password.length >= 4}
              className="h-14 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl text-xl font-bold text-slate-800 transition-all disabled:opacity-50"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="h-14 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl text-sm font-bold text-slate-700 transition-all"
            >
              ←
            </button>
          </div>

          {/* 확인 버튼 */}
          <button
            type="submit"
            disabled={password.length !== 4}
            className={`w-full py-4 rounded-xl font-bold text-white transition-all ${
              password.length === 4
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg'
                : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            확인
          </button>
        </form>
      </div>
    </div>
  );
};

export default PasswordLogin;
