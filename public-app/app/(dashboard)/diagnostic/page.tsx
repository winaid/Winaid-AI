'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiagnosticResponse, DiagnosticErrorResponse } from '../../../lib/diagnostic/types';
import DiagnosticForm from '../../../components/diagnostic/DiagnosticForm';
import DiagnosticResult from '../../../components/diagnostic/DiagnosticResult';

type Status = 'idle' | 'loading' | 'success' | 'error';

const LOADING_STAGES = [
  '웹사이트 접속 중',
  '페이지 구조 분석 중',
  '성능 측정 중',
  'AI 노출 예측 중',
  '보고서 생성 중',
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

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 헤더 */}
        <header className="text-center pb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200 mb-3">
            🔍 AEO/GEO 진단 도구
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800">
            병원 홈페이지가 AI 검색에서 얼마나 잘 보일까요?
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            URL을 입력하면 구조/콘텐츠/AI 노출 가능성을 6개 카테고리로 진단합니다.
          </p>
        </header>

        {/* 폼 */}
        <DiagnosticForm onSubmit={handleSubmit} disabled={status === 'loading'} />

        {/* 로딩 */}
        {status === 'loading' && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-700">
                {LOADING_STAGES[loadingStage]}...
              </p>
            </div>
            <div className="mt-4 flex gap-1">
              {LOADING_STAGES.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    idx <= loadingStage ? 'bg-blue-500' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              사이트 응답 속도에 따라 최대 45초까지 걸릴 수 있습니다.
            </p>
          </div>
        )}

        {/* 에러 */}
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

        {/* 결과 */}
        {status === 'success' && result && <DiagnosticResult result={result} />}
      </div>
    </div>
  );
}
