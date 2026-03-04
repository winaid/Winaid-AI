import React, { useState, useCallback } from 'react';
import type { PromptMediaType, GeneratedPrompt } from '../services/mediaGenerationService';

interface Props {
  mediaType: PromptMediaType;
  onApplyPrompt: (prompt: string) => void;
  disabled?: boolean;
}

export default function PromptGenerator({ mediaType, onApplyPrompt, disabled }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { generateOptimizedPrompt } = await import('../services/mediaGenerationService');
      const res = await generateOptimizedPrompt(input.trim(), mediaType);
      setResult(res);
    } catch (err: any) {
      setError(err?.message || '프롬프트 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [input, mediaType]);

  const accentColor = mediaType === 'image' ? 'purple' : 'rose';

  const colorClasses = {
    bg: mediaType === 'image' ? 'bg-purple-50' : 'bg-rose-50',
    border: mediaType === 'image' ? 'border-purple-200' : 'border-rose-200',
    text: mediaType === 'image' ? 'text-purple-700' : 'text-rose-700',
    btnBg: mediaType === 'image' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700',
    btnRing: mediaType === 'image' ? 'focus:ring-purple-500' : 'focus:ring-rose-500',
    headerBg: mediaType === 'image'
      ? 'from-purple-100 to-indigo-100 border-purple-200'
      : 'from-rose-100 to-amber-100 border-rose-200',
  };

  return (
    <div className={`rounded-xl border ${colorClasses.border} overflow-hidden`}>
      {/* 토글 헤더 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r ${colorClasses.headerBg} transition-all`}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI 프롬프트 생성기
          <span className="text-xs font-normal text-gray-500">(Gemini 2.5 Flash)</span>
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 펼침 내용 */}
      {isOpen && (
        <div className="p-4 space-y-3 bg-white">
          {/* 입력 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mediaType === 'image'
                ? '예: 치과 스케일링 할인 이벤트 포스터'
                : '예: 병원 로비 투어 영상'}
              className={`flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 ${colorClasses.btnRing} focus:border-transparent`}
              disabled={disabled || loading}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={disabled || loading || !input.trim()}
              className={`px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all ${
                disabled || loading || !input.trim()
                  ? 'bg-gray-300 cursor-not-allowed'
                  : colorClasses.btnBg
              }`}
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : '생성'}
            </button>
          </div>

          {/* 에러 */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* 결과 */}
          {result && (
            <div className="space-y-2">
              {/* 한국어 */}
              <div className={`${colorClasses.bg} rounded-lg p-3`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-500">한국어</span>
                  <button
                    onClick={() => { onApplyPrompt(result.korean); setIsOpen(false); }}
                    disabled={disabled}
                    className={`text-xs px-2.5 py-1 rounded-md text-white font-medium ${colorClasses.btnBg} transition-all`}
                  >
                    적용
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{result.korean}</p>
              </div>

              {/* 영어 */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-500">English</span>
                  <button
                    onClick={() => { onApplyPrompt(result.english); setIsOpen(false); }}
                    disabled={disabled}
                    className={`text-xs px-2.5 py-1 rounded-md text-white font-medium ${colorClasses.btnBg} transition-all`}
                  >
                    적용
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{result.english}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
