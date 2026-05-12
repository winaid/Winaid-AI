'use client';

import type { LeadSource } from '../../lib/diagnostic/leadTypes';

interface LockOverlayProps {
  /** "전체 우선조치 받기" 등 CTA 라벨. */
  label: string;
  /** 부 라벨 (작은 글씨, 선택). */
  sublabel?: string;
  /** 트리거 위치 — 폼 모달에 source 로 전달됨. */
  source: LeadSource;
  /** 자물쇠 클릭 → 부모가 LeadFormModal 오픈. */
  onTrigger: (source: LeadSource) => void;
  /** rounded 사이즈 (기본 'lg'). */
  rounded?: 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * 잠긴 영역에 덮이는 자물쇠 오버레이.
 * 사용처:
 *  - ActionPlan 4번째 이후 카드
 *  - SnippetsPanel 카드의 코드 영역(`<pre>`)
 *
 * 부모는 컨테이너에 `relative` 클래스 + 본문 블러 클래스(`backdrop-blur-sm bg-white/60`)
 * 를 적용하고, 본 컴포넌트는 `absolute inset-0` 으로 덮는다.
 */
export default function LockOverlay({
  label,
  sublabel,
  source,
  onTrigger,
  rounded = 'lg',
}: LockOverlayProps) {
  const roundedCls = {
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
  }[rounded];

  return (
    <button
      type="button"
      onClick={() => onTrigger(source)}
      aria-label={label}
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 ${roundedCls}
        backdrop-blur-sm bg-white/60 hover:bg-white/75
        border border-indigo-200 hover:border-indigo-400
        text-indigo-700 font-bold text-sm
        transition-colors cursor-pointer`}
    >
      <span className="text-2xl" aria-hidden="true">🔒</span>
      <span>{label}</span>
      {sublabel && (
        <span className="text-[11px] font-normal text-indigo-500">{sublabel}</span>
      )}
    </button>
  );
}
