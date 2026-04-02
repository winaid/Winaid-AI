'use client';

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl font-black text-slate-200 mb-4">500</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">문제가 발생했습니다</h1>
        <p className="text-sm text-slate-500 mb-8">일시적인 오류입니다. 잠시 후 다시 시도해주세요.</p>
        <button onClick={reset} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all">
          다시 시도
        </button>
      </div>
    </div>
  );
}
