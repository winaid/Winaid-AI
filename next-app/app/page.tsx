/**
 * Landing Page — "/" 경로
 *
 * TODO: 기존 src/components/LandingPage.tsx를 이 파일에서 import
 * 현재는 마이그레이션 뼈대만 구성
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          WINAID
        </h1>
        <p className="text-lg text-slate-600 mb-8">
          병원 AI 콘텐츠 생성 플랫폼
        </p>
        <p className="text-sm text-slate-400">
          Next.js App Router 마이그레이션 뼈대
        </p>
      </div>
    </main>
  );
}
