import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import type { ImageAspectRatio } from '../services/mediaGenerationService';
import PromptGenerator from './PromptGenerator';

const TemplateGenerator = lazy(() => import('./TemplateGenerator'));

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
  const [mode, setMode] = useState<'free' | 'template'>('template');
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

  // 병원 기본 정보 / 브랜드 컬러
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicHours, setClinicHours] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [brandAccent, setBrandAccent] = useState('');
  const [showHospitalInfo, setShowHospitalInfo] = useState(false);

  // localStorage에서 로고/병원명/병원정보 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGO_STORAGE_KEY);
      const savedName = localStorage.getItem(HOSPITAL_NAME_KEY);
      if (saved) { setLogoDataUrl(saved); setLogoEnabled(true); }
      if (savedName) setHospitalName(savedName);
      const info = localStorage.getItem('hospital_info');
      if (info) {
        const p = JSON.parse(info);
        if (p.phone) setClinicPhone(p.phone);
        if (p.hours) setClinicHours(p.hours);
        if (p.address) setClinicAddress(p.address);
        if (p.brandColor) setBrandColor(p.brandColor);
        if (p.brandAccent) setBrandAccent(p.brandAccent);
      }
    } catch {}
  }, []);

  const saveHospitalInfo = useCallback(() => {
    localStorage.setItem('hospital_info', JSON.stringify({
      phone: clinicPhone, hours: clinicHours, address: clinicAddress,
      brandColor, brandAccent,
    }));
  }, [clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent]);

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

      let finalPrompt = prompt.trim();

      // 로고+병원명: AI에게 함께 배치하도록 지시
      if (logoEnabled && hospitalName.trim()) {
        const posLabel = logoPosition === 'top' ? '상단' : '하단';
        finalPrompt += `\n\n[로고+병원명 배치 규칙 - 반드시 준수!]
첨부된 로고 이미지와 "${hospitalName}" 병원명 텍스트를 반드시 하나의 세트로 묶어서 디자인의 ${posLabel}에 배치해주세요.
- 로고 이미지 바로 옆에 "${hospitalName}" 텍스트를 나란히 배치 (로고 왼쪽 + 텍스트 오른쪽, 또는 로고 위 + 텍스트 아래)
- 로고와 병원명은 절대 떨어뜨리지 말고, 항상 함께 붙어있어야 합니다
- 이미지 전체에서 로고+병원명은 딱 한 번만 표시 (중복 금지!)
- ${posLabel} 한 곳에만 배치하고, 다른 위치에 또 넣지 마세요`;
      } else if (logoEnabled && logoDataUrl) {
        const posLabel = logoPosition === 'top' ? '상단' : '하단';
        finalPrompt += `\n\n첨부된 로고 이미지를 디자인의 ${posLabel}에 자연스럽게 한 번만 배치해주세요. 다른 위치에 중복으로 넣지 마세요.`;
      }

      // 병원 기본 정보 삽입
      const infoLines = [clinicPhone, clinicHours, clinicAddress].filter(Boolean);
      if (infoLines.length > 0) {
        finalPrompt += `\n\n[병원 기본 정보 - 이미지 하단에 작지만 읽을 수 있는 크기로 표시]\n${infoLines.map(l => `"${l}"`).join('\n')}`;
      }

      // 브랜드 컬러 반영
      if (brandColor || brandAccent) {
        finalPrompt += `\n\n[브랜드 컬러 - 디자인의 메인 컬러로 사용]`;
        if (brandColor) finalPrompt += `\nMain color: ${brandColor}`;
        if (brandAccent) finalPrompt += `\nAccent color: ${brandAccent}`;
        finalPrompt += `\n이 색상을 헤딩, 배경, 강조 요소에 우선 적용해주세요.`;
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
  }, [prompt, aspectRatio, onProgress, logoEnabled, logoDataUrl, hospitalName, logoPosition, clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result;
    link.download = `hospital-image-${Date.now()}.png`;
    link.click();
  }, [result]);

  // 템플릿 모드
  if (mode === 'template') {
    return (
      <div className="h-full flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">이미지 생성</h2>
              <p className="text-xs text-slate-500">칸만 채우면 바로 이미지 생성</p>
            </div>
          </div>
          <div className="flex bg-slate-100/80 rounded-xl p-1">
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/20">템플릿</button>
            <button onClick={() => setMode('free')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 transition-all">자유 입력</button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" /></div>}>
            <TemplateGenerator />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 + 모드 토글 */}
      <div className="flex items-center justify-between pb-4 mb-2 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">이미지 생성</h2>
            <p className="text-xs text-slate-500">자유 프롬프트로 이미지 생성</p>
          </div>
        </div>
        <div className="flex bg-slate-100/80 rounded-xl p-1">
          <button onClick={() => setMode('template')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 transition-all">템플릿</button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/20">자유 입력</button>
        </div>
      </div>

      {/* 프롬프트 입력 */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">이미지 설명</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="예: 임플란트 시술 과정을 설명하는 깔끔한 인포그래픽, 밝고 신뢰감 있는 치과 분위기..."
          rows={4}
          className="w-full px-4 py-3 border border-slate-200/60 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 focus:bg-white resize-none text-sm outline-none bg-white/80 transition-all"
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
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">이미지 비율</label>
        <div className="flex gap-1.5">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r.value}
              onClick={() => setAspectRatio(r.value)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                aspectRatio === r.value
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <span>{r.icon}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 로고 설정 */}
      <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-600">병원 로고</label>
          <button
            onClick={() => setLogoEnabled(!logoEnabled)}
            className={`relative rounded-full transition-colors ${logoEnabled && logoDataUrl ? 'bg-blue-500' : 'bg-slate-300'}`}
            style={{ width: 40, height: 22 }}
          >
            <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${logoEnabled && logoDataUrl ? 'translate-x-[18px]' : ''}`} />
          </button>
        </div>

        {/* 로고 업로드 / 미리보기 */}
        <div className="flex items-center gap-2">
          {logoDataUrl ? (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                <img src={logoDataUrl} alt="로고" className="max-w-full max-h-full object-contain" />
              </div>
              <button onClick={removeLogo} className="text-[11px] text-red-500 hover:text-red-700">삭제</button>
            </div>
          ) : (
            <button onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              로고 업로드
            </button>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
        </div>

        {logoDataUrl && (
          <div className="flex gap-2">
            <input type="text" value={hospitalName} onChange={(e) => handleHospitalNameChange(e.target.value)} placeholder="병원명 (선택)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button type="button" onClick={() => setLogoPosition('top')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${logoPosition === 'top' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>상단</button>
              <button type="button" onClick={() => setLogoPosition('bottom')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${logoPosition === 'bottom' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>하단</button>
            </div>
          </div>
        )}
      </div>

      {/* 병원 기본 정보 / 브랜드 컬러 */}
      <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4 space-y-3">
        <button type="button" onClick={() => setShowHospitalInfo(!showHospitalInfo)} className="w-full flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-600 cursor-pointer">병원 정보 / 브랜드 컬러</label>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${showHospitalInfo ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {showHospitalInfo && (
          <div className="space-y-2.5 pt-1">
            <input type="text" value={clinicPhone} onChange={e => setClinicPhone(e.target.value)} onBlur={saveHospitalInfo} placeholder="전화번호: 02-1234-5678" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            <input type="text" value={clinicHours} onChange={e => setClinicHours(e.target.value)} onBlur={saveHospitalInfo} placeholder="진료시간: 평일 09:00~18:00" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            <input type="text" value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} onBlur={saveHospitalInfo} placeholder="주소: 서울시 강남구 테헤란로 123" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            <div className="flex gap-3">
              <div className="flex-1 flex items-center gap-2">
                <label className="text-[11px] text-slate-500 whitespace-nowrap">메인</label>
                <input type="color" value={brandColor || '#4F46E5'} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
                <input type="text" value={brandColor} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} placeholder="#4F46E5" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:border-blue-400" />
              </div>
              <div className="flex-1 flex items-center gap-2">
                <label className="text-[11px] text-slate-500 whitespace-nowrap">포인트</label>
                <input type="color" value={brandAccent || '#F59E0B'} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
                <input type="text" value={brandAccent} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} placeholder="#F59E0B" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:border-blue-400" />
              </div>
            </div>
            {(brandColor || brandAccent) && (
              <div className="flex gap-2 items-center">
                <div className="h-4 flex-1 rounded-md" style={{ background: `linear-gradient(135deg, ${brandColor || '#4F46E5'}, ${brandAccent || '#F59E0B'})` }} />
                <button type="button" onClick={() => { setBrandColor(''); setBrandAccent(''); saveHospitalInfo(); }} className="text-[11px] text-slate-400 hover:text-red-500">초기화</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleGenerate}
        disabled={generating || !prompt.trim()}
        className={`w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-all ${
          generating || !prompt.trim()
            ? 'bg-slate-200 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25'
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

      {/* 생성 중 로딩 */}
      {generating && (
        <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 rounded-2xl border border-purple-100 p-10 flex flex-col items-center justify-center gap-5">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-purple-100" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
            <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-blue-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl animate-pulse">🎨</span>
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-base font-bold text-gray-700">{progress || 'AI가 이미지 만드는 중...'}</p>
            <p className="text-xs text-gray-400">잠시만 기다려주세요</p>
          </div>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* 결과 */}
      {!generating && result && (
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
