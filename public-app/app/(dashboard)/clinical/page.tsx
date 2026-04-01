'use client';

import { useState, useRef } from 'react';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { CATEGORIES } from '../../../lib/constants';
import type { ContentCategory } from '../../../lib/types';

interface UploadedImage { file: File; dataUrl: string; }
interface SuggestedTopic { topic: string; title: string; keywords: string; }

export default function ClinicalPage() {
  useAuthGuard();

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [category, setCategory] = useState<ContentCategory>(CATEGORIES[0].value as ContentCategory);
  const [hospitalName, setHospitalName] = useState('');
  const [imageDescription, setImageDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: File[]) => {
    const remaining = 10 - images.length;
    if (remaining <= 0) return;
    const valid = files.filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024).slice(0, remaining);
    for (const file of valid) {
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => prev.length < 10 ? [...prev, { file, dataUrl: reader.result as string }] : prev);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = async () => {
    if (images.length === 0 || isAnalyzing) return;
    setIsAnalyzing(true);
    setError('');
    setAnalysisResult('');
    setSuggestedTopics([]);

    try {
      const imageData = images.map(img => {
        const base64 = img.dataUrl.split(',')[1];
        const mimeType = img.dataUrl.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
        return { base64, mimeType };
      });

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `당신은 한국 병원 마케팅 전문가이자 의료 콘텐츠 작성자입니다.
아래 임상/의료 이미지 ${images.length}장을 분석하세요.

${imageDescription ? `[사용자 설명] ${imageDescription}` : ''}
[진료과] ${category}

[분석 항목]
1. 이미지에 보이는 것: 시술/장비/상태를 구체적으로 설명
2. 의학적 맥락: 어떤 치료/시술/진단 과정인지
3. 환자에게 유용한 정보: 블로그 글로 전달할 수 있는 핵심 메시지

[블로그 주제 추천]
위 분석을 바탕으로 병원 블로그 주제 5개를 추천하세요.
각 주제: topic(20자), title(30~40자 SEO 제목), keywords(2~3개)

⚠️ 안전: 환자 식별 정보(얼굴/이름) 포함 금지. 자극적 장면은 "시술 과정 이미지"로만 언급.

JSON만 출력: {"analysis":"...","topics":[{"topic":"...","title":"...","keywords":"..."}]}`,
          images: imageData,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseType: 'json',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || '분석 실패');

      try {
        const clean = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
        const parsed = JSON.parse(clean);
        setAnalysisResult(parsed.analysis || '');
        setSuggestedTopics(parsed.topics || []);
      } catch {
        setAnalysisResult(data.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleWriteBlog = (t: SuggestedTopic) => {
    const params = new URLSearchParams({
      topic: t.topic,
      title: t.title,
      keywords: t.keywords,
      clinicalContext: analysisResult.slice(0, 2000),
    });
    window.location.href = `/blog?${params.toString()}`;
  };

  const inputCls = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* 입력 */}
      <div className="w-full lg:w-[400px] lg:flex-none">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔬</span>
            <h2 className="text-base font-bold text-slate-800">임상 이미지 → 블로그 글</h2>
          </div>
          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
            시술 사진, 장비 사진, 임상 자료를 업로드하면 AI가 분석하여 블로그 주제를 추천합니다
          </p>

          {/* 이미지 업로드 */}
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
            {images.length === 0 ? (
              <>
                <div className="text-3xl mb-2">📷</div>
                <p className="text-sm font-semibold text-slate-600">이미지를 드래그하거나 클릭</p>
                <p className="text-xs text-slate-400 mt-1">최대 10장, 각 10MB</p>
              </>
            ) : (
              <div className="flex gap-2 flex-wrap justify-center">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.dataUrl} className="w-20 h-20 object-cover rounded-xl border" />
                    <button onClick={e => { e.stopPropagation(); removeImage(i); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center">✕</button>
                  </div>
                ))}
                {images.length < 10 && <div className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-xl">+</div>}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {/* 진료과 + 병원명 */}
          <div className="grid grid-cols-2 gap-3">
            <select value={category} onChange={e => setCategory(e.target.value as ContentCategory)} className={inputCls}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="병원명 (선택)" className={inputCls} />
          </div>

          {/* 이미지 설명 */}
          <textarea value={imageDescription} onChange={e => setImageDescription(e.target.value)}
            placeholder="예: 임플란트 식립 후 3개월 차 파노라마, 자체 기공소 지르코니아 크라운"
            rows={2} className={`${inputCls} resize-none`} />

          <button onClick={handleAnalyze} disabled={isAnalyzing || images.length === 0}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
            {isAnalyzing ? (
              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>분석 중...</>
            ) : '🔬 분석 시작'}
          </button>
        </div>
      </div>

      {/* 결과 */}
      <div className="flex-1 min-w-0">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={() => setError('')} className="mt-2 text-xs text-red-400">닫기</button>
          </div>
        ) : analysisResult ? (
          <div className="space-y-4">
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-700 mb-2">🔬 이미지 분석 결과</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{analysisResult}</p>
            </div>
            {suggestedTopics.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-700">📝 추천 블로그 주제</h3>
                {suggestedTopics.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400 transition-all">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">주제: {t.topic} · 키워드: {t.keywords}</div>
                    </div>
                    <button onClick={() => handleWriteBlog(t)}
                      className="px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 flex-shrink-0">
                      블로그 쓰기 →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !isAnalyzing ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px] flex flex-col items-center justify-center px-12 py-16">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
              <span className="text-3xl">🔬</span>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">임상 이미지 분석</h2>
            <p className="text-sm text-slate-400 text-center">시술 사진이나 장비 사진을 업로드하면<br />AI가 분석하여 블로그 주제를 추천합니다</p>
            <div className="mt-6 flex flex-col items-center gap-2">
              {['시술/장비 이미지 AI 분석', '블로그 주제 5개 자동 추천', '클릭 한 번으로 블로그 작성 연결'].map(t => (
                <div key={t} className="flex items-center gap-3 px-4 py-2 text-xs text-slate-400">
                  <span className="text-[10px] text-blue-400">✦</span>{t}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center min-h-[400px] justify-center">
            <div className="w-14 h-14 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin mb-6" />
            <p className="text-sm font-medium text-slate-700">이미지를 분석하고 있어요</p>
            <p className="text-xs text-slate-400 mt-1">이미지 수에 따라 10~30초 정도 걸립니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
