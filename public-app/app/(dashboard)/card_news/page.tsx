/**
 * /card_news — 카드뉴스 진입 placeholder (C0, 2026-05-08).
 *
 * 카드뉴스 안쪽 기능 (page 본체, 캔버스 에디터, AI 액션, 프롬프트, 드래프트 등)
 * 21 파일 약 13,500 LoC 일괄 삭제됐다. C2 단계에서 AI-first 자동 생성 카드뉴스로
 * 재구축 예정.
 *
 * UI 진입점 (Sidebar/MobileHeader/dashboard 홈의 /card_news 링크) + ContentTab 타입 +
 * postStorage union + DB CHECK constraint 는 모두 보존 — 같은 위치에 C2 가 새로 들어옴.
 *
 * 본 placeholder 는 다음 조건을 만족하는 최소 컴포넌트:
 *   - 외부 import 0 (블로그·refine·image lib 의존성 없음)
 *   - Tailwind 인라인 클래스만 (다른 dashboard 페이지 톤: bg-slate / rounded-xl /
 *     border-slate / text-slate / blue accent — image/page.tsx 참고, 본문 복붙은 X)
 *   - 'use client' (다른 dashboard 페이지와 동일 디렉티브)
 *   - 사용자 진입 시 혼란 없도록 명확한 안내 문구 + 다른 콘텐츠 진입 동선
 */

'use client';

export default function CardNewsPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
        <div className="text-5xl mb-5" aria-hidden="true">🚧</div>
        <h1 className="text-xl font-semibold text-slate-800 mb-3">
          카드뉴스 새 버전 준비 중
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-2">
          AI 자동 생성 카드뉴스로 곧 다시 만나요.
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          주제 한 줄로 슬라이드 + 이미지가 자동 생성되는 새로운 흐름을 준비하고 있습니다.
        </p>
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            그동안에는{' '}
            <a href="/blog" className="text-blue-500 hover:text-blue-600 hover:underline">블로그</a>{' '}·{' '}
            <a href="/press" className="text-blue-500 hover:text-blue-600 hover:underline">보도자료</a>{' '}·{' '}
            <a href="/image" className="text-blue-500 hover:text-blue-600 hover:underline">이미지</a>{' '}생성을 이용해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
