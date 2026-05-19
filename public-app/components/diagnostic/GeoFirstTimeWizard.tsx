'use client';

/**
 * GeoFirstTimeWizard — 첫 사용자 안내 3 step modal (GEO-UX-2).
 *
 * trigger: localStorage 'geo_wizard_completed' !== '1' + 마운트 시.
 * 양 앱 lockstep. 접근성: ESC + 외부 클릭 dismiss + role="dialog".
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'geo_wizard_completed';

interface StepDef {
  emoji: string;
  title: string;
  body: string;
  cta: string;
}

const STEPS: StepDef[] = [
  {
    emoji: '🔍',
    title: 'AI 검색 노출 분석',
    body: 'AI 가 우리 병원을 어떻게 보는지 진단합니다. ChatGPT·Gemini 답변에서 우리 사이트가 얼마나 인용되는지, 어떤 약점이 있는지 자동 분석.',
    cta: '다음',
  },
  {
    emoji: '✨',
    title: '약점 → 콘텐츠 1-click',
    body: '약점을 발견하면 클릭 1번으로 보강 콘텐츠 작성이 시작됩니다. 제목·카테고리·톤이 자동으로 채워져 블로그 빌더가 열려요.',
    cta: '다음',
  },
  {
    emoji: '🔔',
    title: '변동 알림',
    body: '매일 안 들여다봐도 됩니다. 인용률이 임계값 이상 변하면 Slack·이메일·카카오톡 중 선택해서 자동 알림 받기.',
    cta: '시작하기',
  },
];

export default function GeoFirstTimeWizard() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== '1') {
        setShow(true);
      }
    } catch {
      // localStorage 차단 환경 — silent skip
    }
  }, []);

  const close = useCallback((completed: boolean) => {
    setShow(false);
    if (completed) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* silent */ }
    }
  }, []);

  // ESC 키
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show, close]);

  if (!show) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="geo-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        // 외부 클릭 dismiss (localStorage 저장 안 함 — 다음번 다시 표시)
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
        <div className="text-5xl mb-3">{current.emoji}</div>
        <h2 id="geo-wizard-title" className="text-lg font-bold text-slate-800 mb-2">
          {current.title}
        </h2>
        <p className="text-[13px] text-slate-600 leading-relaxed mb-5">
          {current.body}
        </p>
        {/* step dots */}
        <div className="flex justify-center gap-2 mb-5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={'w-2 h-2 rounded-full ' + (i === step ? 'bg-indigo-600' : 'bg-slate-300')}
            />
          ))}
        </div>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => close(true)}
            className="text-[12px] px-3 py-2 text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer min-h-[44px]"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) close(true);
              else setStep(step + 1);
            }}
            className="text-[13px] px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium cursor-pointer min-h-[44px] min-w-[100px]"
          >
            {current.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
