/**
 * Auth Page — "/auth" 경로
 *
 * TODO: 기존 src/components/AuthPage.tsx를 Client Component로 import
 * Supabase Auth UI 연결 필요
 */
'use client';

export default function AuthPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold text-center text-slate-900 mb-6">
          로그인
        </h1>
        <p className="text-center text-slate-500 text-sm">
          [마이그레이션 대기] 기존 AuthPage 컴포넌트 연결 예정
        </p>
      </div>
    </main>
  );
}
