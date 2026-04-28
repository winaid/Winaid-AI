'use client';

import { useState, useRef, useEffect } from 'react';
import { buildClinicalPrompt, ARTICLE_TYPES } from '../../../lib/clinicalPrompt';
import { getSessionSafe, supabase } from '../../../lib/supabase';
import { useCreditContext } from '../layout';
import { useCredit } from '../../../lib/creditService';
import { consumeGuestCredit } from '../../../lib/guestCredits';
import { CATEGORIES } from '../../../lib/constants';
import { sanitizeHtml } from '../../../lib/sanitize';
import { stripDoctype } from '../../../lib/htmlUtils';
import { applyContentFilters } from '@winaid/blog-core';

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300';

interface SuggestedTopic {
  topic: string;
  title: string;
  keywords: string;
}

export default function ClinicalPage() {
  const creditCtx = useCreditContext();

  // ── Step 1: 이미지 분석 ──
  const [images, setImages] = useState<{ file: File; dataUrl: string }[]>([]);
  const [category, setCategory] = useState('치과');
  const [hospitalName, setHospitalName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [imageDescription, setImageDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 2: 설정 ──
  const [selectedTopic, setSelectedTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [articleType, setArticleType] = useState<'case' | 'procedure' | 'comparison' | 'general'>('case');
  const [textLength, setTextLength] = useState(3000);
  const [keywords, setKeywords] = useState('');

  // ── Step 3: 결과 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [scores, setScores] = useState<{ accuracy?: number; depth?: number; readability?: number } | null>(null);
  const [pipelineStep, setPipelineStep] = useState<'upload' | 'configure' | 'result'>('upload');
  const [copyToast, setCopyToast] = useState(false);

  // ── 개인정보 보호 동의 ──
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);

  // 첫 방문 시 개인정보 주의 모달
  useEffect(() => {
    try {
      const acked = localStorage.getItem('clinical_privacy_ack');
      if (!acked) setShowPrivacyNotice(true);
    } catch { /* ignore */ }
  }, []);

  // 외부용: 프로필에서 병원명 로드
  useEffect(() => {
    (async () => {
      try {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.name) setHospitalName(user.user_metadata.name);
      } catch { /* ignore */ }
    })();
  }, []);

  // ── 이미지 핸들러 ──
  const compressImage = (file: File): Promise<string> => {
    const MAX_DIM = 1024;
    const QUALITY = 0.8;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round(height * (MAX_DIM / width));
              width = MAX_DIM;
            } else {
              width = Math.round(width * (MAX_DIM / height));
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', QUALITY));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: File[]) => {
    const remaining = 10 - images.length;
    if (remaining <= 0) return;
    const toAdd = files.filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024).slice(0, remaining);
    for (const file of toAdd) {
      try {
        const compressedDataUrl = await compressImage(file);
        setImages(prev => [...prev, { file, dataUrl: compressedDataUrl }]);
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          setImages(prev => [...prev, { file, dataUrl: reader.result as string }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    processFiles(Array.from(e.dataTransfer.files));
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Step 1: 분석 ──
  const handleAnalyze = async () => {
    if (images.length === 0) return;
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
          prompt: `⚠️ [최우선 규칙: 환자 식별 정보 보호]
- 얼굴, 이름, 차트번호, 생년월일이 보이면 절대 분석 결과에 포함 금지
- 모니터/서류에 환자 정보가 반영되면 "[환자 정보 — 분석 제외]"로 명시

당신은 한국 병원 임상 콘텐츠 전문가입니다.
아래 임상/의료 이미지 ${images.length}장을 분석하세요.

${imageDescription ? `[사용자 설명] ${imageDescription}` : ''}
[진료과] ${category}

[분석 항목]
1. 시술/장비/상태: 정확한 의료 용어로 구체적 설명 (실제 존재하는 장비명만 사용)
2. 의학적 맥락: 어떤 치료/시술/진단 과정인지
3. 환자에게 유용한 정보: 이 이미지로 전달할 수 있는 핵심 메시지

[의료광고법 주의]
- "완치 전후 비교" 형식의 분석 금지
- "이 치료로 100% 개선" 단정 금지
- 특정 환자 사례 → 임상 일반화로 작성

[블로그 주제 추천]
위 분석 기반 원장 1인칭 임상 블로그 주제 5개 추천.
- topic: 글의 방향 (20자 이내)
- title: 네이버 블로그 제목 (30~40자, 의료법 준수)
- keywords: SEO 키워드 2~3개

JSON만 출력: { "analysis": "...", "topics": [{ "topic": "...", "title": "...", "keywords": "..." }] }`,
          images: imageData,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.7,
          maxOutputTokens: 8192,
          timeout: 30000,
          thinkingLevel: 'none',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || '분석 실패');

      const cleanText = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
      try {
        const parsed = JSON.parse(cleanText);
        setAnalysisResult(parsed.analysis || '');
        setSuggestedTopics(parsed.topics || []);
        setPipelineStep('configure');
      } catch {
        setAnalysisResult(data.text);
        setPipelineStep('configure');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Step 2 → 3: 생성 ──
  const handleGenerate = async () => {
    const topic = selectedTopic || customTopic.trim();
    if (!topic) return;

    // 크레딧 체크 (차감은 성공 후)
    if (creditCtx.creditInfo && creditCtx.creditInfo.credits <= 0) {
      setError(creditCtx.userId ? '크레딧이 모두 소진되었습니다.' : '무료 체험 크레딧이 모두 소진되었습니다.');
      return;
    }

    setIsGenerating(true);
    setGeneratedContent(null);
    setScores(null);

    try {
      const { systemInstruction, prompt } = buildClinicalPrompt({
        topic,
        category,
        hospitalName: hospitalName || undefined,
        doctorName: doctorName || undefined,
        imageAnalysis: analysisResult,
        imageCount: images.length,
        articleType,
        textLength,
        keywords: keywords || undefined,
      });

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 65536,
          timeout: 120000,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || '생성 실패');

      let html = stripDoctype(data.text.trim());
      html = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');

      // SCORES 파싱
      const scoresIdx = html.lastIndexOf('---SCORES---');
      if (scoresIdx !== -1) {
        const after = html.substring(scoresIdx + 12);
        try {
          const jsonMatch = after.match(/\{[\s\S]*?\}/);
          if (jsonMatch) setScores(JSON.parse(jsonMatch[0]));
        } catch { /* ignore */ }
        html = html.substring(0, scoresIdx).trim();
      }

      // [CLINICAL_IMG_N] → 실제 이미지 삽입
      images.forEach((img, i) => {
        const marker = `[CLINICAL_IMG_${i + 1}]`;
        const imgHtml = `<div class="clinical-img" style="margin:20px 0;text-align:center;"><img src="${img.dataUrl}" alt="임상 이미지 ${i + 1}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;" /></div>`;
        html = html.replace(marker, imgHtml);
      });
      html = html.replace(/\[CLINICAL_IMG_\d+\]/g, '');

      // 의료광고법 금지어 자동 대체 + 출력 아티팩트 필터 (lib/medicalLawFilter.ts)
      {
        const { filtered, replacedCount, foundTerms } = applyContentFilters(html);
        html = filtered;
        if (replacedCount > 0) {
          console.info(`[CLINICAL] 의료법 금지어 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
        }
      }

      setGeneratedContent(html);
      setPipelineStep('result');

      // 생성 성공 → 크레딧 차감
      if (creditCtx.creditInfo) {
        if (creditCtx.userId) {
          const cr = await useCredit(creditCtx.userId);
          if (cr.success) creditCtx.setCreditInfo({ credits: cr.remaining, totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 1 });
        } else {
          const next = consumeGuestCredit();
          if (next) creditCtx.setCreditInfo({ credits: next.credits, totalUsed: next.totalUsed });
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '생성 실패');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── 복사 (출처 제외) ──
  const handleCopy = () => {
    if (!generatedContent) return;
    const temp = document.createElement('div');
    temp.innerHTML = generatedContent;
    const refFooter = temp.querySelector('.references-footer');
    if (refFooter) refFooter.remove();
    navigator.clipboard.writeText(temp.innerHTML);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 1500);
  };

  // ── UI ──
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 첫 방문 개인정보 보호 주의 모달 */}
      {showPrivacyNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-black text-slate-800">임상 이미지 업로드 전 필독</h2>
            </div>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>업로드 전 <strong className="text-slate-800">환자 얼굴·이름·차트번호·생년월일</strong> 등 개인 식별 정보를 반드시 제거하세요.</li>
              <li>환자 동의 없이 식별 가능한 이미지를 업로드하면 <strong className="text-slate-800">의료법·개인정보보호법상 법적 책임</strong>이 발생할 수 있습니다.</li>
              <li>업로드된 이미지는 <strong className="text-slate-800">AI 분석 목적으로만</strong> 일회성 사용됩니다.</li>
              <li>이미지는 서버에 <strong className="text-slate-800">저장되지 않으며</strong>, 분석 완료 후 즉시 폐기됩니다.</li>
            </ul>
            <button
              onClick={() => {
                try { localStorage.setItem('clinical_privacy_ack', '1'); } catch { /* ignore */ }
                setShowPrivacyNotice(false);
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              이해했습니다
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800">🔬 임상글 작성</h1>
        <p className="text-sm text-slate-500 mt-1">시술 사진을 업로드하면 AI가 분석하여 임상 블로그 글을 작성합니다</p>
      </div>

      {/* 파이프라인 인디케이터 */}
      <div className="flex items-center gap-2 mb-6">
        {(['upload', 'configure', 'result'] as const).map((step, i) => {
          const labels = ['📷 이미지 분석', '⚙️ 설정 + 생성', '📄 결과'];
          const isActive = pipelineStep === step;
          const isDone = (['upload', 'configure', 'result'] as const).indexOf(pipelineStep) > i;
          return (
            <div key={step} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-0.5 ${isDone || isActive ? 'bg-blue-400' : 'bg-slate-200'}`} />}
              <button
                onClick={() => {
                  if (isDone) setPipelineStep(step);
                }}
                disabled={!isDone && !isActive}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive ? 'bg-blue-500 text-white' : isDone ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {labels[i]}
              </button>
            </div>
          );
        })}
      </div>

      {/* ═══ Step 1: 이미지 업로드 + 분석 ═══ */}
      {pipelineStep === 'upload' && (
        <div className="space-y-4">
          {/* 이미지 업로드 */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          >
            {images.length === 0 ? (
              <>
                <div className="text-4xl mb-3">📷</div>
                <p className="text-sm font-semibold text-slate-600">이미지를 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-slate-400 mt-1">시술 사진, 장비 사진, 임상 자료 (최대 10장, 각 10MB)</p>
              </>
            ) : (
              <div className="flex gap-3 flex-wrap justify-center">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.dataUrl} className="w-24 h-24 object-cover rounded-xl border" />
                    <button onClick={e => { e.stopPropagation(); removeImage(i); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-600">✕</button>
                  </div>
                ))}
                {images.length < 10 && (
                  <div className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-2xl hover:border-blue-300">+</div>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {/* 기본 설정 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">진료과</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">병원명 (선택)</label>
              <input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="OO치과" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">원장명 (선택)</label>
            <input value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="홍길동" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">이미지 설명 (선택)</label>
            <textarea value={imageDescription} onChange={e => setImageDescription(e.target.value)} rows={2}
              placeholder="예: 임플란트 식립 후 3개월 차 파노라마, 자체 기공소에서 제작한 지르코니아 크라운"
              className={inputCls + ' resize-none'} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* 개인정보 보호 동의 */}
          <label className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition-colors">
            <input
              type="checkbox"
              checked={privacyConsent}
              onChange={e => setPrivacyConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-bold">환자 개인 식별 정보(얼굴·이름·차트번호·생년월일 등)가 제거된 이미지</strong>만 업로드하며,
              환자 동의 없는 식별 이미지 업로드 시 법적 책임은 업로더에게 있음을 확인합니다.
            </span>
          </label>

          <button onClick={handleAnalyze} disabled={isAnalyzing || images.length === 0 || !privacyConsent}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
            {isAnalyzing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />이미지 분석 중...</>) : '🔬 이미지 분석 시작'}
          </button>
        </div>
      )}

      {/* ═══ Step 2: 설정 + 생성 ═══ */}
      {pipelineStep === 'configure' && (
        <div className="space-y-5">
          {/* 분석 결과 */}
          {analysisResult && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-700 mb-2">🔬 이미지 분석 결과</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{analysisResult}</p>
            </div>
          )}

          {/* 주제 선택 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">주제 선택</label>
            {suggestedTopics.map((t, i) => (
              <button key={i} onClick={() => { setSelectedTopic(t.topic); setKeywords(t.keywords); setCustomTopic(''); }}
                className={`w-full text-left p-3 mb-1.5 rounded-xl border transition-all ${
                  selectedTopic === t.topic ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
                }`}>
                <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">키워드: {t.keywords}</div>
              </button>
            ))}
            <input value={customTopic} onChange={e => { setCustomTopic(e.target.value); setSelectedTopic(''); }}
              placeholder="직접 입력 (예: 상악 전체 임플란트 치료 과정)" className={inputCls + ' mt-2'} />
          </div>

          {/* 글 유형 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">글 유형</label>
            <div className="grid grid-cols-2 gap-2">
              {ARTICLE_TYPES.map(t => (
                <button key={t.value} onClick={() => setArticleType(t.value as typeof articleType)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    articleType === t.value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
                  }`}>
                  <span className="text-lg">{t.icon}</span>
                  <div className="text-xs font-semibold mt-1">{t.label}</div>
                  <div className="text-[10px] text-slate-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 글자수 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">분량</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: 2000, l: '짧은 글', d: '1,500~2,500자' }, { v: 3000, l: '중간 글', d: '2,500~3,500자' }, { v: 4000, l: '긴 글', d: '3,500자~' }].map(o => (
                <button key={o.v} onClick={() => setTextLength(o.v)}
                  className={`py-2.5 rounded-xl border text-center transition-all ${
                    textLength === o.v ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <span className="text-[11px] font-semibold block">{o.l}</span>
                  <span className={`text-[9px] ${textLength === o.v ? 'text-blue-400' : 'text-slate-400'}`}>{o.d}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 키워드 */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">SEO 키워드 (선택)</label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 강남 임플란트, 상악동 거상술" className={inputCls} />
          </div>

          {/* 생성 버튼 */}
          <button onClick={handleGenerate} disabled={isGenerating || (!selectedTopic && !customTopic.trim())}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-[15px]">
            {isGenerating ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />임상글 생성 중...</>) : '🔬 임상글 생성'}
          </button>
        </div>
      )}

      {/* ═══ Step 3: 결과 ═══ */}
      {pipelineStep === 'result' && generatedContent && (
        <div className="space-y-5">
          {/* 점수 */}
          {scores && (
            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              {[
                { label: '정확성', value: scores.accuracy, color: 'text-blue-600' },
                { label: '전문성', value: scores.depth, color: 'text-purple-600' },
                { label: '가독성', value: scores.readability, color: 'text-green-600' },
              ].map(s => s.value != null && (
                <div key={s.label} className="flex-1 text-center">
                  <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* 본문 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <style>{`
              .clinical-content h3 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 28px 0 14px 0; line-height: 1.4; }
              .clinical-content p { font-size: 15px; color: #444; margin: 0 0 12px 0; line-height: 1.8; }
              .clinical-content ul { margin: 12px 0; padding-left: 24px; }
              .clinical-content li { font-size: 15px; color: #444; margin: 6px 0; line-height: 1.7; }
              .clinical-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
              .clinical-content th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; border: 1px solid #e2e8f0; }
              .clinical-content td { padding: 10px 12px; border: 1px solid #e2e8f0; }
              .clinical-content strong { color: #1e293b; }
              .clinical-img { margin: 20px 0; text-align: center; }
              .clinical-img img { max-width: 100%; border-radius: 12px; border: 1px solid #e2e8f0; }
              .references-footer { user-select: none; opacity: 0.6; }
            `}</style>
            <div className="clinical-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedContent) }} />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2">
            <button onClick={handleCopy}
              className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition-colors">
              📋 복사 (출처 제외)
            </button>
            <button onClick={() => { setPipelineStep('configure'); setGeneratedContent(null); setScores(null); }}
              className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm transition-colors">
              ↩ 다시 생성
            </button>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {copyToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg">
          📋 복사되었습니다 (출처 제외)
        </div>
      )}
    </div>
  );
}
