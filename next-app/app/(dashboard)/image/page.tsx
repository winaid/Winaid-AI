/**
 * Image Generator — "/image" 경로
 *
 * 핵심 플로우: 프롬프트 입력 → 비율 선택 → 로고/병원정보 → 이미지 생성 → 결과/다운로드
 */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string }[] = [
  { value: '1:1', label: '정사각형', icon: '⬜' },
  { value: '16:9', label: '가로형', icon: '🖥️' },
  { value: '9:16', label: '세로형', icon: '📱' },
  { value: '4:3', label: '4:3', icon: '🖼️' },
];

const LOGO_STORAGE_KEY = 'hospital-logo-dataurl';
const HOSPITAL_NAME_KEY = 'hospital-logo-name';

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal';

export default function ImagePage() {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // localStorage 복원
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
    } catch { /* ignore */ }
  }, []);

  const saveHospitalInfo = useCallback(() => {
    localStorage.setItem('hospital_info', JSON.stringify({
      phone: clinicPhone, hours: clinicHours, address: clinicAddress,
      brandColor, brandAccent,
    }));
  }, [clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent]);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoDataUrl(dataUrl);
      setLogoEnabled(true);
      try { localStorage.setItem(LOGO_STORAGE_KEY, dataUrl); } catch { /* ignore */ }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleHospitalNameChange = useCallback((name: string) => {
    setHospitalName(name);
    try { localStorage.setItem(HOSPITAL_NAME_KEY, name); } catch { /* ignore */ }
  }, []);

  const removeLogo = useCallback(() => {
    setLogoDataUrl(null);
    setLogoEnabled(false);
    try { localStorage.removeItem(LOGO_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ── 프롬프트 조립 + API 호출 ──

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setProgress('이미지 생성 중...');

    // 로고 지시문
    let logoInstruction = '';
    if (logoEnabled && hospitalName.trim()) {
      const posLabel = logoPosition === 'top' ? '상단' : '하단';
      logoInstruction = `[로고+병원명 배치 규칙 - 반드시 준수!]
첨부된 로고 이미지와 "${hospitalName}" 병원명 텍스트를 반드시 하나의 세트로 묶어서 디자인의 ${posLabel}에 배치해주세요.
- 로고 이미지 바로 옆에 "${hospitalName}" 텍스트를 나란히 배치
- 로고와 병원명은 절대 떨어뜨리지 말고, 항상 함께 붙어있어야 합니다
- 이미지 전체에서 로고+병원명은 딱 한 번만 표시 (중복 금지!)
- ${posLabel} 한 곳에만 배치하고, 다른 위치에 또 넣지 마세요`;
    } else if (logoEnabled && logoDataUrl) {
      const posLabel = logoPosition === 'top' ? '상단' : '하단';
      logoInstruction = `첨부된 로고 이미지를 디자인의 ${posLabel}에 자연스럽게 한 번만 배치해주세요. 다른 위치에 중복으로 넣지 마세요.`;
    }

    // 병원 기본 정보
    const infoLines = [clinicPhone, clinicHours, clinicAddress].filter(Boolean);
    const hospitalInfo = infoLines.length > 0
      ? `[병원 기본 정보 - 이미지 하단에 작지만 읽을 수 있는 크기로 표시]\n${infoLines.map(l => `"${l}"`).join('\n')}`
      : '';

    // 브랜드 컬러
    let brandColors = '';
    if (brandColor || brandAccent) {
      brandColors = '[브랜드 컬러 - 디자인의 메인 컬러로 사용]';
      if (brandColor) brandColors += `\nMain color: ${brandColor}`;
      if (brandAccent) brandColors += `\nAccent color: ${brandAccent}`;
      brandColors += '\n이 색상을 헤딩, 배경, 강조 요소에 우선 적용해주세요.';
    }

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          logoInstruction: logoInstruction || undefined,
          hospitalInfo: hospitalInfo || undefined,
          brandColors: brandColors || undefined,
        }),
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
  }, [prompt, aspectRatio, generating, logoEnabled, logoDataUrl, hospitalName, logoPosition, clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent]);

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
                rows={4}
                className={`${inputCls} resize-none`}
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

            {/* 로고 설정 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">병원 로고</label>
                <button
                  onClick={() => setLogoEnabled(!logoEnabled)}
                  className={`relative rounded-full transition-colors ${logoEnabled && logoDataUrl ? 'bg-blue-500' : 'bg-slate-300'}`}
                  style={{ width: 36, height: 20 }}
                >
                  <span className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full shadow transition-transform ${logoEnabled && logoDataUrl ? 'translate-x-[16px]' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {logoDataUrl ? (
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                      <img src={logoDataUrl} alt="로고" className="max-w-full max-h-full object-contain" />
                    </div>
                    <button onClick={removeLogo} className="text-[11px] text-red-500 hover:text-red-700">삭제</button>
                  </div>
                ) : (
                  <button onClick={() => logoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-all bg-white"
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
                  <input type="text" value={hospitalName} onChange={(e) => handleHospitalNameChange(e.target.value)} placeholder="병원명 (선택)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white" />
                  <div className="flex bg-white rounded-lg p-0.5 border border-slate-200">
                    <button type="button" onClick={() => setLogoPosition('top')} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${logoPosition === 'top' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}>상단</button>
                    <button type="button" onClick={() => setLogoPosition('bottom')} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${logoPosition === 'bottom' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}>하단</button>
                  </div>
                </div>
              )}
            </div>

            {/* 상세 설정 토글 */}
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-500 transition-all border border-slate-100">
              <span>상세 설정</span>
              <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <input type="text" value={clinicPhone} onChange={e => setClinicPhone(e.target.value)} onBlur={saveHospitalInfo} placeholder="전화번호: 02-1234-5678" className={inputCls} />
                <input type="text" value={clinicHours} onChange={e => setClinicHours(e.target.value)} onBlur={saveHospitalInfo} placeholder="진료시간: 평일 09:00~18:00" className={inputCls} />
                <input type="text" value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} onBlur={saveHospitalInfo} placeholder="주소: 서울시 강남구 테헤란로 123" className={inputCls} />
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500 whitespace-nowrap">메인</label>
                    <input type="color" value={brandColor || '#4F46E5'} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5" />
                    <input type="text" value={brandColor} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} placeholder="#4F46E5" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:border-blue-400 bg-white" />
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500 whitespace-nowrap">포인트</label>
                    <input type="color" value={brandAccent || '#F59E0B'} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5" />
                    <input type="text" value={brandAccent} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} placeholder="#F59E0B" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:border-blue-400 bg-white" />
                  </div>
                </div>
                {(brandColor || brandAccent) && (
                  <div className="flex gap-2 items-center">
                    <div className="h-3 flex-1 rounded-md" style={{ background: `linear-gradient(135deg, ${brandColor || '#4F46E5'}, ${brandAccent || '#F59E0B'})` }} />
                    <button type="button" onClick={() => { setBrandColor(''); setBrandAccent(''); saveHospitalInfo(); }} className="text-[10px] text-slate-400 hover:text-red-500">초기화</button>
                  </div>
                )}
              </div>
            )}

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
                '병원 로고 자동 배치',
                '브랜드 컬러 반영',
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
