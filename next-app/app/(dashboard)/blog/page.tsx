'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES, PERSONAS, TONES } from '../../../lib/constants';
import { TEAM_DATA } from '../../../lib/teamData';
import { ContentCategory, type GenerationRequest, type AudienceMode, type ImageStyle, type WritingStyle, type CssTheme } from '../../../lib/types';
import { buildBlogPrompt } from '../../../lib/blogPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { ErrorPanel, ResultPanel, type ScoreBarData } from '../../../components/GenerationResult';

function BlogForm() {
  const searchParams = useSearchParams();

  // ── 폼 상태 ──
  const topicParam = searchParams.get('topic');
  const [topic, setTopic] = useState(topicParam || '');
  const [keywords, setKeywords] = useState('');
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [tone, setTone] = useState(TONES[0].value);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');
  const [cssTheme, setCssTheme] = useState<CssTheme>('modern');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [imageCount, setImageCount] = useState(0);
  const [textLength, setTextLength] = useState(1500);
  const [hospitalName, setHospitalName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [selectedManager, setSelectedManager] = useState('');
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [medicalLawMode] = useState<'strict' | 'relaxed'>('strict');
  const [includeFaq, setIncludeFaq] = useState(false);
  const [faqCount, setFaqCount] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreBarData | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const request: GenerationRequest = {
      category,
      topic: topic.trim(),
      keywords: keywords.trim(),
      tone,
      audienceMode,
      persona,
      imageStyle,
      postType: 'blog',
      textLength,
      imageCount,
      cssTheme,
      writingStyle,
      medicalLawMode,
      includeFaq,
      faqCount: includeFaq ? faqCount : undefined,
      hospitalName: hospitalName || undefined,
      hospitalStyleSource: hospitalName ? 'explicit_selected_hospital' : 'generic_default',
    };

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);
    setScores(undefined);
    setSaveStatus(null);

    try {
      const { systemInstruction, prompt } = buildBlogPrompt(request);

      // 병원 말투 프로파일 자동 주입
      let finalPrompt = prompt;
      if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) {
            finalPrompt = `${prompt}\n\n[병원 블로그 학습 말투 - 반드시 적용]\n${stylePrompt}`;
          }
        } catch { /* 프로파일 없으면 기본 동작 */ }
      }

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          systemInstruction,
          model: 'gemini-2.5-flash-preview-05-20',
          temperature: 0.85,
          maxOutputTokens: 8192,
        }),
      });

      const data = await res.json() as { text?: string; error?: string; details?: string };

      if (!res.ok || !data.text) {
        setError(data.error || data.details || `서버 오류 (${res.status})`);
        return;
      }

      // 점수 블록 파싱: ---SCORES--- 이후 JSON 추출
      let blogText = data.text;
      let parsed: ScoreBarData | undefined;
      const marker = '---SCORES---';
      const idx = blogText.lastIndexOf(marker);
      if (idx !== -1) {
        const afterMarker = blogText.substring(idx + marker.length);
        try {
          const jsonMatch = afterMarker.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
            const seo = typeof raw.seo === 'number' ? raw.seo : undefined;
            const medical = typeof raw.medical === 'number' ? raw.medical : undefined;
            const conversion = typeof raw.conversion === 'number' ? raw.conversion : undefined;
            if (seo != null || medical != null || conversion != null) {
              parsed = { seoScore: seo, safetyScore: medical, conversionScore: conversion };
            }
          }
        } catch {
          // JSON 파싱 실패 — parsed는 undefined로 유지
        }
        // 마커가 있으면 항상 마커 이후를 제거 (파싱 성공 여부와 무관)
        // 마커 바로 앞의 코드블록 fence(```)도 함께 제거
        blogText = blogText.substring(0, idx).replace(/\n*```\s*$/, '').replace(/\n+$/, '');
        // 본문에 혹시 남은 마커 잔여물도 제거
        blogText = blogText.replace(/---SCORES---[\s\S]*$/, '').replace(/\n+$/, '');
      }

      setGeneratedContent(blogText);
      setScores(parsed);

      // 저장 — Supabase 또는 guest localStorage
      try {
        const { userId, userEmail } = await getSessionSafe();
        const titleMatch = blogText.match(/^#\s+(.+)/m) || blogText.match(/^(.+)/);
        const extractedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, '').trim().substring(0, 200) : topic.trim();

        const saveResult = await savePost({
          userId,
          userEmail,
          hospitalName: hospitalName || undefined,
          postType: 'blog',
          title: extractedTitle,
          content: blogText,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
          imageStyle: imageCount > 0 ? imageStyle : undefined,
        });

        if ('error' in saveResult) {
          setSaveStatus('저장 실패: ' + saveResult.error);
        } else {
          setSaveStatus('저장 완료');
        }
      } catch {
        setSaveStatus('저장 실패: Supabase 연결 불가');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '네트워크 오류';
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 ── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📝</span>
            <h2 className="text-base font-bold text-slate-800">블로그 생성</h2>
          </div>

          {/* 팀 선택 + 병원명 (old 동일) */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {TEAM_DATA.map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => { setSelectedTeam(team.id); setShowHospitalDropdown(true); }}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                  selectedTeam === team.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {team.label}
              </button>
            ))}
          </div>

          <div className="relative">
            {selectedTeam !== null ? (
            <>
              <div className="relative">
                <input
                  type="text"
                  value={hospitalName}
                  onChange={e => setHospitalName(e.target.value)}
                  placeholder="병원명 선택"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowHospitalDropdown(!showHospitalDropdown)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${showHospitalDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
              {showHospitalDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowHospitalDropdown(false)} />
                  <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                    {/* 팀 헤더 */}
                    <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                      <span className="text-xs font-bold text-blue-600">{TEAM_DATA.find(t => t.id === selectedTeam)?.label}</span>
                    </div>
                    {/* 병원 목록 (매니저별 그룹) */}
                    {(() => {
                      const team = TEAM_DATA.find(t => t.id === selectedTeam);
                      if (!team || team.hospitals.length === 0) {
                        return <div className="p-4 text-center text-xs text-slate-400">등록된 병원이 없습니다</div>;
                      }
                      const managers = [...new Set(team.hospitals.map(h => h.manager))];
                      return (
                        <div className="max-h-64 overflow-y-auto">
                          {managers.map(manager => (
                            <div key={manager}>
                              <div className="px-3 py-2 bg-slate-50 text-[11px] font-bold text-slate-500 sticky top-0">
                                {manager}
                              </div>
                              {team.hospitals.filter(h => h.manager === manager).map(hospital => (
                                <button
                                  key={`${hospital.name}-${hospital.manager}`}
                                  type="button"
                                  onClick={() => {
                                    setHospitalName(hospital.name.replace(/ \(.*\)$/, ''));
                                    setSelectedManager(hospital.manager);
                                    setShowHospitalDropdown(false);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center justify-between"
                                >
                                  <span>{hospital.name.replace(/ \(.*\)$/, '')}</span>
                                  {hospitalName === hospital.name.replace(/ \(.*\)$/, '') && (
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
              {selectedManager && hospitalName && (
                <p className="mt-1 text-[11px] text-slate-400">담당: {selectedManager}</p>
              )}
            </>
            ) : (
              <div className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">
                팀을 먼저 선택해주세요
              </div>
            )}
          </div>

          {/* 진료과 + 대상 독자 (old 동일: grid-cols-2 select) */}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ContentCategory)}
              className={inputCls}
              disabled={isGenerating}
              aria-label="진료과 선택"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select
              value={audienceMode}
              onChange={e => setAudienceMode(e.target.value as AudienceMode)}
              className={inputCls}
              disabled={isGenerating}
              aria-label="타겟 청중 선택"
            >
              <option value="환자용(친절/공감)">환자용 (친절/공감)</option>
              <option value="보호자용(가족걱정)">보호자용 (부모님/자녀 걱정)</option>
              <option value="전문가용(신뢰/정보)">전문가용 (신뢰/정보)</option>
            </select>
          </div>

          {/* 주제 */}
          <div>
            <label className={labelCls}>주제 *</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="예: 임플란트 수술 후 관리법"
              required
              className={inputCls}
            />
          </div>

          {/* 키워드 */}
          <div>
            <label className={labelCls}>SEO 키워드 (쉼표 구분)</label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="예: 임플란트, 치과, 관리"
              className={inputCls}
            />
          </div>

          {/* 상세 설정 토글 */}
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-500 transition-all border border-slate-100">
            <span>⚙️ 상세 설정</span>
            <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>

          {/* 상세 설정 패널 */}
          {showAdvanced && (
          <div className="space-y-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-3">
              {/* 글자 수 */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500">글자 수</label>
                  <span className="text-xs font-semibold text-blue-600">{textLength}자</span>
                </div>
                <input type="range" min={1500} max={3500} step={100} value={textLength} onChange={e => setTextLength(Number(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`글자 수: ${textLength}자`} />
                <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>1500</span><span>2500</span><span>3500</span></div>
              </div>
              {/* AI 이미지 수 */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500">AI 이미지 수</label>
                  <span className={`text-xs font-semibold ${imageCount === 0 ? 'text-slate-400' : 'text-blue-600'}`}>{imageCount === 0 ? '없음' : `${imageCount}장`}</span>
                </div>
                <input type="range" min={0} max={5} step={1} value={imageCount} onChange={e => setImageCount(Number(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`AI 이미지 수: ${imageCount}장`} />
                <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>0장</span><span>5장</span></div>
              </div>
              {/* FAQ 토글 */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm">❓</span>
                  <div>
                    <span className="text-xs font-semibold text-slate-700">FAQ 섹션</span>
                    <p className="text-[10px] text-slate-400">네이버 질문 + 질병관리청 정보</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {includeFaq && (
                    <div className="flex gap-0.5">
                      {[3, 4, 5].map(num => (
                        <button key={num} type="button" onClick={() => setFaqCount(num)}
                          className={`w-7 h-7 rounded-md text-[10px] font-semibold transition-all ${faqCount === num ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >{num}</button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setIncludeFaq(!includeFaq)}
                    className={`relative rounded-full transition-colors ${includeFaq ? 'bg-blue-500' : 'bg-slate-300'}`}
                    style={{ width: 40, height: 22 }}
                  >
                    <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${includeFaq ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
              {/* 이미지 스타일 */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">이미지 스타일</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { id: 'photo' as ImageStyle, icon: '📸', label: '실사' },
                    { id: 'illustration' as ImageStyle, icon: '🎨', label: '일러스트' },
                    { id: 'medical' as ImageStyle, icon: '🫀', label: '의학 3D' },
                  ]).map(s => (
                    <button key={s.id} type="button"
                      onClick={() => setImageStyle(s.id)}
                      className={`py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${imageStyle === s.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                    >
                      <span className="text-base">{s.icon}</span>
                      <span className="text-[10px] font-semibold">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* 화자/어조 */}
              <div className="grid grid-cols-2 gap-2">
                <select value={persona} onChange={e => setPersona(e.target.value)} className={inputCls}>
                  {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select value={tone} onChange={e => setTone(e.target.value)} className={inputCls}>
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>
          )}

          {/* 생성 버튼 */}
          <button
            type="submit"
            disabled={isGenerating || !topic.trim()}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                생성 중...
              </>
            ) : (
              '블로그 생성하기'
            )}
          </button>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {isGenerating ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-blue-50 text-blue-600 border border-blue-100">
              <span>✍️</span>
              <span>글 준비 중</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              좋은 문장을 한 줄씩 꺼내고 있어요
            </p>
            <p className="text-xs text-slate-400">
              전문 의료 콘텐츠를 작성하고 있습니다
            </p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : generatedContent ? (
          <ResultPanel content={generatedContent} saveStatus={saveStatus} postType="blog" scores={scores} cssTheme={cssTheme} />
        ) : (
          /* EmptyState */
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              {['B', 'I', 'U'].map(t => (
                <div key={t} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-300">{t}</div>
              ))}
              <div className="w-px h-4 mx-1 bg-slate-200" />
              {[1, 2, 3].map(i => (
                <div key={i} className="w-7 h-7 rounded flex items-center justify-center text-slate-300">
                  <div className="space-y-[3px]">
                    {Array.from({ length: i === 1 ? 3 : i === 2 ? 2 : 1 }).map((_, j) => (
                      <div key={j} className="h-0.5 rounded bg-slate-300" style={{ width: j === 0 ? '14px' : j === 1 ? '10px' : '12px' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
                <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 작성하는<br /><span className="text-blue-600">의료 콘텐츠</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">
                  키워드 하나로 SEO 최적화된<br />블로그 글을 자동 생성합니다
                </p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['병원 말투 학습 기반 생성', 'SEO 키워드 자동 최적화', '의료광고법 준수 검토'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-blue-400">✦</span>
                    {text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-blue-50 text-blue-500 border border-blue-100">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// useSearchParams를 쓰는 컴포넌트는 Suspense로 감싸야 함
export default function BlogPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <BlogForm />
    </Suspense>
  );
}
