'use client';

// 카드뉴스 리뉴얼 진행 중. 복구·삭제 결정은 핸드오프 §5.1 / R3 (시니어 검토)

export default function CardNewsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <div className="text-8xl mb-6">🚧</div>
      <h1 className="text-2xl font-bold text-slate-800 mb-3">카드뉴스 리뉴얼 중!</h1>
      <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
        더 프로페셔널한 카드뉴스를 위해<br/>
        열심히 공사 중입니다 🔨<br/><br/>
      </p>
    </div>
  );
}
