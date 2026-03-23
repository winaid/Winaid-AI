/**
 * Image Generator — "/image" 경로
 *
 * 핵심 플로우: 프롬프트 입력 → 비율 선택 → 이미지 생성 → 결과/다운로드
 */
'use client';

import { useState, useCallback } from 'react';

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string }[] = [
  { value: '1:1', label: '정사각형', icon: '⬜' },
  { value: '16:9', label: '가로형', icon: '🖥️' },
  { value: '9:16', label: '세로형', icon: '📱' },
  { value: '4:3', label: '4:3', icon: '🖼️' },
];

export default function ImagePage() {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setProgress('이미지 생성 중...');

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `서버 오류 (${res.status})`);
      }

      if (data.imageDataUrl) {
        setResult(data.imageDataUrl);
        setProgress('');
      } else {
        throw new Error('이미지 데이터를 받지 못했습니다.');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || '이미지 생성에 실패했습니다.');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  }, [prompt, aspectRatio, generating]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result;
    link.download = `hospital-image-${Date.now()}.png`;
    link.click();
  }, [result]);

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start w-full">
      {/* 좌측: 입력 폼 */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-emerald-50 border-emerald-100">
            <span>🖼️</span>
            <span className="text-xs font-bold text-emerald-700">이미지 생성</span>
          </div>

          {/* 입력 폼 */}
          <div className="p-4 space-y-3">
            {/* 프롬프트 */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">이미지 설명</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 임플란트 시술 과정 인포그래픽, 밝고 신뢰감 있는 치과 분위기..."
                rows={5}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300 resize-none"
                disabled={generating}
              />
              <div className="text-right text-[10px] text-slate-400 mt-0.5">
                {prompt.length}자
              </div>
            </div>

            {/* 비율 선택 */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">이미지 비율</label>
              <div className="flex gap-1.5">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setAspectRatio(r.value)}
                    disabled={generating}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      aspectRatio === r.value
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span>{r.icon}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 생성 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                generating || !prompt.trim()
                  ? 'bg-slate-200 cursor-not-allowed text-slate-400'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25'
              }`}
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {progress || '생성 중...'}
                </span>
              ) : '이미지 생성하기'}
            </button>
          </div>
        </div>
      </div>

      {/* 우측: 결과 영역 */}
      <div className="flex flex-col min-h-[480px] lg:flex-1 min-w-0">
        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-lg mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-700 mb-1">이미지 생성 실패</p>
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium transition-all"
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 로딩 */}
        {generating ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[480px] flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
              <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-teal-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl animate-pulse">🎨</span>
              </div>
            </div>
            <p className="text-base font-bold text-gray-700 mb-1">{progress || 'AI가 이미지 만드는 중...'}</p>
            <p className="text-xs text-gray-400">최대 2분 정도 걸릴 수 있습니다</p>
            <div className="flex gap-1.5 mt-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : result ? (
          /* 결과 표시 */
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4">
              <img
                src={result}
                alt="생성된 이미지"
                className="w-full h-auto rounded-lg"
                style={{ imageRendering: 'auto' }}
                draggable={false}
              />
            </div>
            <div className="flex gap-3 p-4 pt-0">
              <button
                onClick={handleDownload}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md"
              >
                다운로드
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-all"
              >
                다시 생성
              </button>
            </div>
          </div>
        ) : (
          /* 대기 상태 */
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[480px] flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <div className="max-w-sm">
              <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                AI가 만드는<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 underline decoration-emerald-200 underline-offset-4">
                  의료 이미지
                </span>
              </h2>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                프롬프트 하나로 병원 SNS, 안내물,<br />인포그래픽을 자동 생성합니다
              </p>
            </div>
            <div className="space-y-3 text-left max-w-xs">
              {[
                '자유 프롬프트 이미지 생성',
                '4가지 비율 지원 (1:1, 16:9, 9:16, 4:3)',
                '한국어 텍스트 자동 렌더링',
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-emerald-500 text-sm">✦</span>
                  <span className="text-sm text-slate-500">{text}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-50 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-slate-500">AI 대기 중</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
