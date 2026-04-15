'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiagnosticResponse, DiagnosticErrorResponse } from '../../../lib/diagnostic/types';
import DiagnosticForm from '../../../components/diagnostic/DiagnosticForm';
import DiagnosticResult from '../../../components/diagnostic/DiagnosticResult';

type Status = 'idle' | 'loading' | 'success' | 'error';

/** 로딩 단계 — 명사형으로 저장, 상태 접미사(완료/중)는 렌더 시점에 자동 부착. */
const LOADING_STAGES = [
  '웹사이트 접속',
  '페이지 구조 분석',
  '성능 측정',
  'AI 노출 예측',
  '보고서 생성',
];

const LOADING_TIPS = [
  'AI 검색은 공식 홈페이지를 가진 병원을 3배 더 추천해요.',
  'Dentist 스키마(JSON-LD)가 있으면 AI 가 병원 정보를 더 정확히 읽어요.',
  '네이버 블로그만 있고 홈페이지가 없으면 AI 추천에서 누락되기 쉬워요.',
  '의료진 소개에 "전문의" 타이틀이 명시되면 AI 신뢰도가 올라갑니다.',
];

// ── 가치 제안 카드 ────────────────────────────────────────
const VALUE_CARDS = [
  { emoji: '📊', title: '6가지 기준 종합 점수', body: '보안·사이트 구조·콘텐츠 품질 등을 한눈에 확인' },
  { emoji: '🤖', title: 'ChatGPT & Gemini 노출 예측', body: '실제로 AI 검색에 뜨는지 즉시 실측' },
  { emoji: '📝', title: '맞춤형 개선 로드맵', body: 'AI 로 바로 할 수 있는 것 / 사람이 해야 할 것 분류' },
];

// ── 미리보기 bullet ──────────────────────────────────────
const PREVIEW_BULLETS = [
  '현재 홈페이지의 AI 검색 노출 점수 (0~100)',
  'ChatGPT 와 Gemini 에 우리 병원이 실제 뜨는지',
  '경쟁사 대비 우리가 부족한 요소',
  '오늘부터 할 수 있는 구체적 개선 순서',
];

// ── FAQ 문항 ─────────────────────────────────────────────
const FAQS: { q: string; a: string }[] = [
  {
    q: '어떻게 점수가 나오나요?',
    a: '6가지 카테고리(보안/구조/스키마/콘텐츠/외부 채널/AEO)로 각각 100점 만점 채점 후 가중 평균을 냅니다. Google 공식 SEO 가이드와 실전 AEO 인사이트를 함께 반영했습니다.',
  },
  {
    q: '얼마나 걸리나요?',
    a: '약 30~60초. 홈페이지 크롤링 + 성능 측정 + ChatGPT/Gemini 실측 + 맞춤 해설 생성까지 포함된 시간입니다.',
  },
  {
    q: '결과는 저장되나요?',
    a: '현재 버전은 저장 없이 즉시 보여드립니다. 같은 URL 다시 진단하려면 새로고침 후 재입력해주세요.',
  },
  {
    q: '"측정 불가"가 뜨면 어떻게 하나요?',
    a: 'PSI(로딩 성능) 측정에 Google API 키가 필요합니다. 환경변수 PAGESPEED_API_KEY 설정 여부를 관리자에게 확인해주세요. 다른 카테고리는 정상 채점됩니다.',
  },
];

export default function DiagnosticPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [loadingStage, setLoadingStage] = useState(0);
  const [result, setResult] = useState<DiagnosticResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [lastUrl, setLastUrl] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startLoadingAnim = () => {
    setLoadingStage(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setLoadingStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 2000);
  };
  const stopLoadingAnim = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleSubmit = async (url: string) => {
    setLastUrl(url);
    setStatus('loading');
    setResult(null);
    setError(null);
    startLoadingAnim();

    try {
      const res = await fetch('/api/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as DiagnosticResponse | (DiagnosticErrorResponse & { message?: string });
      stopLoadingAnim();

      if (!res.ok || !('success' in data) || data.success !== true) {
        const err = data as DiagnosticErrorResponse & { message?: string };
        setError({
          code: err.code || 'UNKNOWN',
          message: err.message || err.error || '진단 중 오류가 발생했습니다.',
        });
        setStatus('error');
        return;
      }

      setResult(data);
      setStatus('success');
    } catch (e) {
      stopLoadingAnim();
      setError({
        code: 'UNKNOWN',
        message: `네트워크 오류: ${(e as Error).message}`,
      });
      setStatus('error');
    }
  };

  const handleRetry = () => {
    if (lastUrl) handleSubmit(lastUrl);
  };

  const progressPct = Math.round(((loadingStage + 1) / LOADING_STAGES.length) * 100);
  const currentTip = LOADING_TIPS[loadingStage % LOADING_TIPS.length];

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* ── 헤더 ── */}
        <header className="text-center pb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200 mb-3">
            🔍 AEO/GEO 진단 도구
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800">
            병원 홈페이지가 AI 검색에서 얼마나 잘 보일까요?
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            URL 을 입력하면 구조·콘텐츠·AI 노출 가능성을 6개 카테고리로 진단합니다.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 shadow-sm">
              💬 ChatGPT 실측
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 shadow-sm">
              ✨ Gemini 실측
            </span>
          </div>
        </header>

        {/* ── idle: 폼 + 가치 제안 + 미리보기 + FAQ ── */}
        {status === 'idle' && (
          <>
            <DiagnosticForm onSubmit={handleSubmit} disabled={false} />

            {/* 가치 제안 카드 3개 */}
            <section className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
              {VALUE_CARDS.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 flex flex-col"
                >
                  <div className="text-3xl">{c.emoji}</div>
                  <h3 className="mt-3 text-sm font-bold text-slate-800">{c.title}</h3>
                  <p className="mt-2 text-[12px] text-slate-500 leading-relaxed">{c.body}</p>
                </div>
              ))}
            </section>

            {/* 미리보기 */}
            <section className="max-w-4xl mx-auto rounded-xl border border-slate-200 bg-white shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-800">이런 걸 알 수 있어요</h2>
              <ul className="mt-4 space-y-2">
                {PREVIEW_BULLETS.map((b) => (
                  <li key={b} className="flex gap-2 text-[13px] text-slate-600 leading-relaxed">
                    <span className="text-blue-500 flex-none mt-0.5">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* FAQ */}
            <section className="max-w-2xl mx-auto space-y-2">
              <h2 className="text-base font-bold text-slate-800 mb-3">자주 묻는 질문</h2>
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <summary className="flex items-center justify-between px-5 py-3 cursor-pointer list-none text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <span>{f.q}</span>
                    <span className="text-slate-400 transition-transform group-open:rotate-180">▼</span>
                  </summary>
                  <div className="px-5 pb-4 text-[13px] text-slate-600 leading-relaxed">
                    {f.a}
                  </div>
                </details>
              ))}
            </section>
          </>
        )}

        {/* ── loading: 폼 영역 통째 교체 ── */}
        {status === 'loading' && (
          <section className="max-w-2xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h2 className="text-sm font-bold text-slate-800">진단 진행 중</h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">⏱ 약 30~60초 소요 예정</span>
            </div>

            {/* 진행률 바 + 카운트 */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                <span>진행률</span>
                <span>{loadingStage + 1} / {LOADING_STAGES.length}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* 5단계 체크리스트 */}
            <ul className="mt-5 space-y-2.5">
              {LOADING_STAGES.map((stage, idx) => {
                const isDone = idx < loadingStage;
                const isCur = idx === loadingStage;
                return (
                  <li key={stage} className="flex items-center gap-3">
                    <span
                      className={`flex-none w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        isDone
                          ? 'bg-emerald-100 text-emerald-600'
                          : isCur
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                      aria-hidden
                    >
                      {isDone ? '✓' : isCur ? (
                        <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : '○'}
                    </span>
                    <span
                      className={`text-sm ${
                        isCur ? 'font-bold text-slate-800' : isDone ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {stage}{isDone ? ' 완료' : isCur ? ' 중…' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* 팁 박스 */}
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-bold text-amber-700 mb-1">💡 알고 계셨나요?</p>
              <p className="text-[13px] text-amber-800 leading-relaxed">{currentTip}</p>
            </div>
          </section>
        )}

        {/* ── error ── (기존 유지) */}
        {status === 'error' && error && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-none">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-700">진단을 완료하지 못했습니다</p>
                <p className="mt-1 text-[13px] text-red-600 leading-relaxed break-words">{error.message}</p>
                {error.code === 'INVALID_URL' && (
                  <p className="mt-2 text-[11px] text-red-500">
                    힌트: <code>example-clinic.co.kr</code> 또는 <code>https://example-clinic.co.kr</code> 형식으로 입력해주세요.
                  </p>
                )}
                {error.code === 'TIMEOUT' && (
                  <p className="mt-2 text-[11px] text-red-500">
                    사이트가 응답이 느립니다. 잠시 후 다시 시도해주세요.
                  </p>
                )}
                {(error.code === 'UNREACHABLE' || error.code === 'UNKNOWN') && lastUrl && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold"
                  >
                    다시 시도
                  </button>
                )}
                <p className="mt-2 text-[10px] text-red-400 font-mono">code: {error.code}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── success ── */}
        {status === 'success' && result && <DiagnosticResult result={result} />}
      </div>
    </div>
  );
}
