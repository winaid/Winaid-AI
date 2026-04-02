import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl font-black text-slate-200 mb-4">404</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">페이지를 찾을 수 없습니다</h1>
        <p className="text-sm text-slate-500 mb-8">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
        <Link href="/" className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
