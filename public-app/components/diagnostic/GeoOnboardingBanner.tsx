'use client';

/**
 * GeoOnboardingBanner — 첫 진입 안내 (GEO-UX-1).
 *
 * localStorage 'geo_onboarding_dismissed' 없으면 한 번 표시 → 닫기 클릭 시 저장.
 * 양 앱 lockstep.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'geo_onboarding_dismissed';

export default function GeoOnboardingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
        setShow(true);
      }
    } catch {
      // localStorage 차단 환경 — silent skip
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // silent
    }
  };

  if (!show) return null;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-bold text-indigo-800 mb-1">
            🤖 AI 검색 (ChatGPT · Gemini) 에서 우리 병원이 얼마나 노출되는지 확인하세요
          </p>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            먼저 위 <span className="font-medium text-indigo-700">'오늘 우선 액션'</span> 부터 시작하면 좋습니다. 각 카드를 클릭하면 콘텐츠 초안이 자동으로 채워집니다.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-[11px] px-2 py-1 text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer whitespace-nowrap"
          aria-label="안내 배너 닫기"
        >
          다시 보지 않기
        </button>
      </div>
    </div>
  );
}
