import React from 'react';

interface MaintenancePageProps {
  darkMode?: boolean;
}

/**
 * 점검 안내 페이지
 *
 * 활성화: VITE_MAINTENANCE_MODE=true 환경변수 설정
 * App.tsx에서 최상단 분기로 렌더링됨
 */
const MaintenancePage: React.FC<MaintenancePageProps> = ({ darkMode = false }) => {
  const handleRefresh = () => window.location.reload();
  const handleHome = () => { window.location.href = '/'; };

  return (
    <div className={`min-h-screen flex items-center justify-center px-6 transition-colors duration-300 ${darkMode ? 'bg-[#0f1117]' : 'bg-gradient-to-br from-sky-50 via-white to-amber-50'}`}>
      <div className="max-w-md w-full text-center">
        {/* 일러스트 영역 */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-sky-100 to-amber-100 mb-4">
            <span className="text-6xl" role="img" aria-label="옷장 정리">🧥</span>
          </div>
        </div>

        {/* 메인 문구 */}
        <h1 className={`text-2xl sm:text-3xl font-bold mb-4 leading-snug ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          겨울옷 정리하느라<br />잠깐 문 닫았어요.
        </h1>

        {/* 보조 문구 */}
        <p className={`text-base sm:text-lg leading-relaxed mb-10 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          두꺼운 패딩 넣고, 가벼운 봄옷 꺼내는 중이에요.<br />
          홈페이지도 더 산뜻하게 정리해서 다시 열게요.
        </p>

        {/* 버튼 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleRefresh}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 shadow-lg shadow-blue-200/50 transition-all duration-200 active:scale-[0.97]"
          >
            다시 문 두드려 볼게요
          </button>
          <button
            onClick={handleHome}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] ${
              darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-white text-slate-600 hover:bg-slate-50 shadow-sm border border-slate-200'
            }`}
          >
            따뜻해지면 다시 올게요
          </button>
        </div>

        {/* 하단 안내 */}
        <p className={`mt-10 text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
          정리가 끝나면 자동으로 열려요. 잠시만 기다려 주세요!
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;
