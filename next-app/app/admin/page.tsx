/**
 * Admin Page — "/admin" 경로
 *
 * TODO: 기존 AdminPage 컴포넌트 연결
 * 관리자 인증 체크 필요
 */
'use client';

export default function AdminPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-lg p-8 bg-white rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold text-center text-slate-900 mb-6">관리자</h1>
        <p className="text-center text-slate-500 text-sm">
          [마이그레이션 대기] AdminPage 컴포넌트 연결 예정
        </p>
      </div>
    </div>
  );
}
