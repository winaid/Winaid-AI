import React, { useState, useCallback, useRef } from 'react';
import type { VideoAspectRatio } from '../services/mediaGenerationService';
import PromptGenerator from './PromptGenerator';

interface Props {
  onProgress?: (msg: string) => void;
}

export default function VideoGenerator({ onProgress }: Props) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    setVideoUrl(null);
    setProgress('준비 중...');

    try {
      const { generateVideo } = await import('../services/mediaGenerationService');
      const res = await generateVideo(
        { prompt: prompt.trim(), aspectRatio },
        (msg) => { setProgress(msg); onProgress?.(msg); }
      );
      setVideoUrl(res.videoUrl);
      setProgress('');
    } catch (err: any) {
      setError(err?.message || '동영상 생성에 실패했습니다.');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  }, [prompt, aspectRatio, onProgress]);

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `hospital-video-${Date.now()}.mp4`;
    link.click();
  }, [videoUrl]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-2xl p-6 border border-rose-100">
        <h2 className="text-xl font-bold text-gray-800 mb-1">동영상 생성기</h2>
        <p className="text-sm text-gray-500">병원 홍보 영상을 만들어보세요 (5~8초)</p>
      </div>

      {/* 프롬프트 입력 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">영상 설명</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="어떤 영상을 만들고 싶으신가요? 장면, 분위기, 카메라 움직임을 설명해주세요..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none text-sm"
          disabled={generating}
        />
      </div>

      {/* AI 프롬프트 생성기 */}
      <PromptGenerator
        mediaType="video"
        onApplyPrompt={(p) => setPrompt(p)}
        disabled={generating}
      />

      {/* 비율 선택 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">영상 비율</label>
        <div className="flex gap-3">
          <button
            onClick={() => setAspectRatio('16:9')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
              aspectRatio === '16:9'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-rose-300'
            }`}
          >
            🖥️ 가로형 (16:9)
          </button>
          <button
            onClick={() => setAspectRatio('9:16')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
              aspectRatio === '9:16'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-rose-300'
            }`}
          >
            📱 세로형 (9:16)
          </button>
        </div>
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleGenerate}
        disabled={generating || !prompt.trim()}
        className={`w-full py-3.5 rounded-xl text-white font-semibold text-base transition-all ${
          generating || !prompt.trim()
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-700 hover:to-orange-600 shadow-lg shadow-rose-200 hover:shadow-xl'
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
        ) : '동영상 생성하기'}
      </button>

      {/* 생성 중 안내 */}
      {generating && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          동영상 생성에는 1~3분 정도 걸립니다. 페이지를 닫지 마세요!
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 결과 */}
      {videoUrl && (
        <div className="space-y-4">
          <div className="bg-black rounded-2xl overflow-hidden shadow-lg">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              loop
              className="w-full h-auto"
              style={{ maxHeight: '500px' }}
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
