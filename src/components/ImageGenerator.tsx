import React, { useState, useCallback } from 'react';
import type { ImageAspectRatio } from '../services/mediaGenerationService';
import PromptGenerator from './PromptGenerator';

const ASPECT_RATIOS: { value: ImageAspectRatio; label: string; icon: string }[] = [
  { value: '1:1', label: '정사각형', icon: '⬜' },
  { value: '16:9', label: '가로형', icon: '🖥️' },
  { value: '9:16', label: '세로형', icon: '📱' },
  { value: '4:3', label: '4:3', icon: '🖼️' },
];

interface Props {
  onProgress?: (msg: string) => void;
}

export default function ImageGenerator({ onProgress }: Props) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setProgress('준비 중...');

    try {
      const { generateCustomImage } = await import('../services/mediaGenerationService');
      const res = await generateCustomImage(
        { prompt: prompt.trim(), aspectRatio },
        (msg) => { setProgress(msg); onProgress?.(msg); }
      );
      setResult(res.imageDataUrl);
      setProgress('');
    } catch (err: any) {
      setError(err?.message || '이미지 생성에 실패했습니다.');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  }, [prompt, aspectRatio, onProgress]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result;
    link.download = `hospital-image-${Date.now()}.png`;
    link.click();
  }, [result]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-100">
        <h2 className="text-xl font-bold text-gray-800 mb-1">이미지 생성기</h2>
        <p className="text-sm text-gray-500">Gemini 3.1 Flash Image로 병원 콘텐츠 이미지를 만들어보세요</p>
      </div>

      {/* 프롬프트 입력 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">이미지 설명</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="어떤 이미지를 만들고 싶으신가요? 내용, 스타일, 분위기를 자세히 설명해주세요..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
          disabled={generating}
        />
      </div>

      {/* AI 프롬프트 생성기 */}
      <PromptGenerator
        mediaType="image"
        onApplyPrompt={(p) => setPrompt(p)}
        disabled={generating}
      />

      {/* 비율 선택 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">이미지 비율</label>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r.value}
              onClick={() => setAspectRatio(r.value)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                aspectRatio === r.value
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
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
        className={`w-full py-3.5 rounded-xl text-white font-semibold text-base transition-all ${
          generating || !prompt.trim()
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-200 hover:shadow-xl'
        }`}
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {progress || '생성 중...'}
          </span>
        ) : '이미지 생성하기'}
      </button>

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <img
              src={result}
              alt="생성된 이미지"
              className="w-full h-auto"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all shadow-md"
            >
              다운로드
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all"
            >
              다시 생성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
