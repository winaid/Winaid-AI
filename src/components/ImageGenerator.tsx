import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ImageAspectRatio } from '../services/mediaGenerationService';
import PromptGenerator from './PromptGenerator';

const ASPECT_RATIOS: { value: ImageAspectRatio; label: string; icon: string }[] = [
  { value: '1:1', label: '정사각형', icon: '⬜' },
  { value: '16:9', label: '가로형', icon: '🖥️' },
  { value: '9:16', label: '세로형', icon: '📱' },
  { value: '4:3', label: '4:3', icon: '🖼️' },
];

const LOGO_STORAGE_KEY = 'hospital-logo-dataurl';
const HOSPITAL_NAME_KEY = 'hospital-logo-name';

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

  // 로고 관련
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState('');
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoPosition, setLogoPosition] = useState<'top' | 'bottom'>('bottom');
  const logoInputRef = useRef<HTMLInputElement>(null);

  // localStorage에서 로고/병원명 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGO_STORAGE_KEY);
      const savedName = localStorage.getItem(HOSPITAL_NAME_KEY);
      if (saved) { setLogoDataUrl(saved); setLogoEnabled(true); }
      if (savedName) setHospitalName(savedName);
    } catch {}
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoDataUrl(dataUrl);
      setLogoEnabled(true);
      try { localStorage.setItem(LOGO_STORAGE_KEY, dataUrl); } catch {}
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleHospitalNameChange = useCallback((name: string) => {
    setHospitalName(name);
    try { localStorage.setItem(HOSPITAL_NAME_KEY, name); } catch {}
  }, []);

  const removeLogo = useCallback(() => {
    setLogoDataUrl(null);
    setLogoEnabled(false);
    try { localStorage.removeItem(LOGO_STORAGE_KEY); } catch {}
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setProgress('준비 중...');

    try {
      const { generateCustomImage } = await import('../services/mediaGenerationService');

      // 병원명이 있으면 프롬프트에 자연스럽게 포함
      let finalPrompt = prompt.trim();
      if (logoEnabled && hospitalName.trim()) {
        const posLabel = logoPosition === 'top' ? '상단' : '하단';
        finalPrompt += `\n\n디자인 ${posLabel}에 "${hospitalName}" 병원명을 자연스럽게 포함하여 디자인의 일부로 렌더링해주세요. 별도의 로고 박스가 아니라 전체 디자인과 어울리는 타이포그래피로 배치해주세요.`;
      }

      const res = await generateCustomImage(
        {
          prompt: finalPrompt,
          aspectRatio,
          logoBase64: logoEnabled && logoDataUrl ? logoDataUrl : undefined,
        },
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
  }, [prompt, aspectRatio, onProgress, logoEnabled, logoDataUrl, hospitalName, logoPosition]);

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

      {/* 로고 설정 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">병원 로고 삽입</label>
          <button
            onClick={() => setLogoEnabled(!logoEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${logoEnabled && logoDataUrl ? 'bg-purple-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${logoEnabled && logoDataUrl ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* 로고 업로드 / 미리보기 */}
        <div className="flex items-center gap-3">
          {logoDataUrl ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                <img src={logoDataUrl} alt="로고" className="max-w-full max-h-full object-contain" />
              </div>
              <button
                onClick={removeLogo}
                className="text-xs text-red-500 hover:text-red-700"
              >
                삭제
              </button>
            </div>
          ) : (
            <button
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-purple-400 hover:text-purple-600 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              로고 업로드
            </button>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </div>

        {/* 병원명 + 위치 (로고가 있을 때만) */}
        {logoDataUrl && (
          <div className="flex gap-2">
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => handleHospitalNameChange(e.target.value)}
              placeholder="병원명 (선택사항)"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setLogoPosition('top')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  logoPosition === 'top' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
                }`}
              >
                상단
              </button>
              <button
                type="button"
                onClick={() => setLogoPosition('bottom')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  logoPosition === 'bottom' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
                }`}
              >
                하단
              </button>
            </div>
          </div>
        )}
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
              style={{ imageRendering: 'auto' }}
              draggable={false}
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
