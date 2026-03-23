'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PERSONAS, TONES, WRITING_STYLES, CSS_THEMES } from '../../../lib/constants';
import { TEAM_DATA } from '../../../lib/teamData';
import { ContentCategory, type GenerationRequest, type AudienceMode, type ImageStyle, type WritingStyle, type CssTheme } from '../../../lib/types';
import { buildBlogPrompt } from '../../../lib/blogPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSupabaseClient } from '../../../lib/supabase';
import { ErrorPanel, ResultPanel, type ScoreBarData } from '../../../components/GenerationResult';

function BlogForm() {
  const searchParams = useSearchParams();

  // ── 폼 상태 ──
  const topicParam = searchParams.get('topic');
  const [topic, setTopic] = useState(topicParam || '');
  const [keywords, setKeywords] = useState('');
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [tone, setTone] = useState(TONES[0].value);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');
  const [cssTheme, setCssTheme] = useState<CssTheme>('modern');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [imageCount, setImageCount] = useState(0);
  const [textLength, setTextLength] = useState(1500);
  const [hospitalName, setHospitalName] = useState('');
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [medicalLawMode, setMedicalLawMode] = useState<'strict' | 'relaxed'>('strict');
  const [includeFaq, setIncludeFaq] = useState(false);

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
      category: ContentCategory.DENTAL,
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

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
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
      try {
        const marker = '---SCORES---';
        const idx = blogText.lastIndexOf(marker);
        if (idx !== -1) {
          const afterMarker = blogText.substring(idx + marker.length);
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
          // 점수 블록을 콘텐츠에서 제거
          blogText = blogText.substring(0, idx).replace(/\n+$/, '');
        }
      } catch {
        // 파싱 실패 시 조용히 무시 — 전체 텍스트를 그대로 사용
      }

      setGeneratedContent(blogText);
      setScores(parsed);

      // Supabase 저장 — 실패해도 생성 결과 표시에 영향 없음
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        const titleMatch = blogText.match(/^#\s+(.+)/m) || blogText.match(/^(.+)/);
        const extractedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, '').trim().substring(0, 200) : topic.trim();

        const saveResult = await savePost({
          userId: session?.user?.id || null,
          userEmail: session?.user?.email || null,
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

          {/* 병원 선택 */}
          <div>
            <label className={labelCls}>병원 선택 (선택)</label>
            <div className="relative">
              <input
                type="text"
                value={hospitalName}
                onChange={e => setHospitalName(e.target.value)}
                onFocus={() => setShowHospitalPicker(true)}
                placeholder="병원명 입력 또는 선택"
                className={inputCls}
              />
              {showHospitalPicker && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowHospitalPicker(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
                    {TEAM_DATA.map(team => (
                      <div key={team.id}>
                        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 sticky top-0">
                          {team.label}
                        </div>
                        {team.hospitals.map(h => (
                          <button
                            key={`${team.id}-${h.name}`}
                            type="button"
                            onClick={() => {
                              setHospitalName(h.name);
                              setShowHospitalPicker(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          >
                            {h.name}
                            <span className="text-[11px] text-slate-400 ml-2">{h.manager}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
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

          {/* 화자/어조 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>화자</label>
              <select value={persona} onChange={e => setPersona(e.target.value)} className={inputCls}>
                {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>어조</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className={inputCls}>
                {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* 대상 독자 */}
          <div>
            <label className={labelCls}>대상 독자</label>
            <div className="flex gap-1.5">
              {(['환자용(친절/공감)', '보호자용(가족걱정)', '전문가용(신뢰/정보)'] as AudienceMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAudienceMode(mode)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    audienceMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {mode.split('(')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* 글 스타일 */}
          <div>
            <label className={labelCls}>글 스타일</label>
            <div className="flex gap-1.5">
              {WRITING_STYLES.map(ws => (
                <button
                  key={ws.value}
                  type="button"
                  onClick={() => setWritingStyle(ws.value as WritingStyle)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    writingStyle === ws.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {ws.label}
                </button>
              ))}
            </div>
          </div>

          {/* 글 길이 */}
          <div>
            <label className={labelCls}>글 길이: {textLength.toLocaleString()}자</label>
            <input
              type="range"
              min={800}
              max={3000}
              step={100}
              value={textLength}
              onChange={e => setTextLength(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>800자</span>
              <span>3,000자</span>
            </div>
          </div>

          {/* 이미지 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>이미지 수</label>
              <select value={imageCount} onChange={e => setImageCount(Number(e.target.value))} className={inputCls}>
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>{n === 0 ? '없음' : `${n}장`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>이미지 스타일</label>
              <select value={imageStyle} onChange={e => setImageStyle(e.target.value as ImageStyle)} className={inputCls} disabled={imageCount === 0}>
                <option value="photo">사진</option>
                <option value="illustration">일러스트</option>
                <option value="medical">의료 이미지</option>
              </select>
            </div>
          </div>

          {/* CSS 테마 */}
          <div>
            <label className={labelCls}>디자인 테마</label>
            <div className="flex gap-1.5 flex-wrap">
              {CSS_THEMES.map(th => (
                <button
                  key={th.value}
                  type="button"
                  onClick={() => setCssTheme(th.value as CssTheme)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    cssTheme === th.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {th.label}
                </button>
              ))}
            </div>
          </div>

          {/* 옵션 토글 */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={medicalLawMode === 'relaxed'}
                onChange={e => setMedicalLawMode(e.target.checked ? 'relaxed' : 'strict')}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600">아슬아슬 모드 (의료광고법 경계)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFaq}
                onChange={e => setIncludeFaq(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600">FAQ 섹션 포함</span>
            </label>
          </div>

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
          <ResultPanel content={generatedContent} saveStatus={saveStatus} postType="blog" scores={scores} />
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
