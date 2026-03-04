import React, { useState, useCallback, useRef } from 'react';
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
  const [refImage, setRefImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('10MB 이하의 이미지만 업로드할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRefImage(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!input.trim() && !refImage) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { generateOptimizedPrompt } = await import('../services/mediaGenerationService');
      const res = await generateOptimizedPrompt(
        input.trim(),
        mediaType,
        refImage || undefined,
      );
      setResult(res);
    } catch (err: any) {
      setError(err?.message || '프롬프트 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [input, mediaType, refImage]);

  const colorClasses = {
    bg: mediaType === 'image' ? 'bg-purple-50' : 'bg-rose-50',
    border: mediaType === 'image' ? 'border-purple-200' : 'border-rose-200',
    btnBg: mediaType === 'image' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700',
    btnRing: mediaType === 'image' ? 'focus:ring-purple-500' : 'focus:ring-rose-500',
    headerBg: mediaType === 'image'
      ? 'from-purple-100 to-indigo-100 border-purple-200'
      : 'from-rose-100 to-amber-100 border-rose-200',
  };

  const canGenerate = (input.trim() || refImage) && !disabled && !loading;

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
          <span className="text-xs font-normal text-gray-500">(Gemini 3.1 Pro)</span>
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
          {/* 참고 이미지 업로드 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {refImage ? (
              <div className="relative inline-block">
                <img
                  src={refImage}
                  alt="참고 이미지"
                  className="h-24 rounded-lg border border-gray-200 object-cover"
                />
                <button
                  onClick={() => { setRefImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                >
                  x
                </button>
                <span className="block text-xs text-gray-400 mt-1">참고 이미지</span>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || loading}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                참고 이미지 첨부 (선택)
              </button>
            )}
          </div>

          {/* 텍스트 입력 + 생성 버튼 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={refImage
                ? '추가 요청사항 (선택) - 없으면 이미지만 분석합니다'
                : mediaType === 'image'
                  ? '예: 치과 스케일링 할인 이벤트 포스터'
                  : '예: 병원 로비 투어 영상'}
              className={`flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 ${colorClasses.btnRing} focus:border-transparent`}
              disabled={disabled || loading}
              onKeyDown={(e) => e.key === 'Enter' && canGenerate && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all whitespace-nowrap ${
                !canGenerate
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
