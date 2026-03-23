'use client';

import { useState } from 'react';
import { TEAM_DATA } from '../../../lib/teamData';
import { buildCardNewsPrompt, type CardNewsRequest } from '../../../lib/cardNewsPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSupabaseClient } from '../../../lib/supabase';
import { ErrorPanel, ResultPanel } from '../../../components/GenerationResult';
import type { WritingStyle } from '../../../lib/types';

const WRITING_STYLE_OPTIONS: { value: WritingStyle; label: string }[] = [
  { value: 'empathy', label: '공감형' },
  { value: 'expert', label: '전문가형' },
  { value: 'conversion', label: '전환유도형' },
];

export default function CardNewsPage() {
  // ── 폼 상태 ──
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [slideCount, setSlideCount] = useState(6);
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const request: CardNewsRequest = {
      topic: topic.trim(),
      keywords: keywords.trim() || undefined,
      hospitalName: hospitalName || undefined,
      slideCount,
      writingStyle,
    };

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);
    setSaveStatus(null);

    try {
      const { systemInstruction, prompt } = buildCardNewsPrompt(request);

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

      setGeneratedContent(data.text);

      // Supabase 저장 — 실패해도 생성 결과 표시에 영향 없음
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        const titleMatch = data.text.match(/\*\*제목\*\*:\s*(.+)/m)
          || data.text.match(/^###?\s+1장[:\s]*(.+)/m)
          || data.text.match(/^#\s+(.+)/m)
          || data.text.match(/^(.+)/);
        const extractedTitle = titleMatch
          ? titleMatch[1].replace(/^[#*\s]+/, '').trim().substring(0, 200)
          : topic.trim();

        const saveResult = await savePost({
          userId: session?.user?.id || null,
          userEmail: session?.user?.email || null,
          hospitalName: hospitalName || undefined,
          postType: 'card_news',
          title: extractedTitle,
          content: data.text,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
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

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 ── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎨</span>
            <h2 className="text-base font-bold text-slate-800">카드뉴스 생성</h2>
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
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-pink-50 hover:text-pink-700 transition-colors"
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
              placeholder="예: 스케일링 후 주의사항"
              required
              className={inputCls}
            />
          </div>

          {/* 키워드 */}
          <div>
            <label className={labelCls}>키워드 (쉼표 구분)</label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="예: 스케일링, 잇몸, 관리"
              className={inputCls}
            />
          </div>

          {/* 슬라이드 수 */}
          <div>
            <label className={labelCls}>슬라이드 수: {slideCount}장</label>
            <input
              type="range"
              min={4}
              max={7}
              step={1}
              value={slideCount}
              onChange={e => setSlideCount(Number(e.target.value))}
              className="w-full accent-pink-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>4장</span>
              <span>7장</span>
            </div>
          </div>

          {/* 글 스타일 */}
          <div>
            <label className={labelCls}>글 스타일</label>
            <div className="flex gap-1.5">
              {WRITING_STYLE_OPTIONS.map(ws => (
                <button
                  key={ws.value}
                  type="button"
                  onClick={() => setWritingStyle(ws.value)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    writingStyle === ws.value
                      ? 'bg-pink-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {ws.label}
                </button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            type="submit"
            disabled={isGenerating || !topic.trim()}
            className="w-full py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              '카드뉴스 생성하기'
            )}
          </button>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {isGenerating ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-pink-50 text-pink-600 border border-pink-100">
              <span>🎨</span>
              <span>원고 작성 중</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-pink-100 border-t-pink-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {slideCount}장 분량의 카드뉴스를 기획하고 있어요
            </p>
            <p className="text-xs text-slate-400">
              슬라이드별 원고를 작성하고 있습니다
            </p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : generatedContent ? (
          <ResultPanel content={generatedContent} completionText={`생성 완료 · ${slideCount}장`} saveStatus={saveStatus} postType="card_news" />
        ) : (
          /* EmptyState */
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              {[4, 5, 6, 7].map(n => (
                <div key={n} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-300">{n}</div>
              ))}
              <div className="w-px h-4 mx-1 bg-slate-200" />
              <div className="text-[10px] text-slate-300 font-medium">slides</div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100">
                <svg className="w-7 h-7 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 만드는<br /><span className="text-pink-600">카드뉴스 원고</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">
                  주제 하나로 슬라이드별 원고를<br />자동 생성합니다
                </p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['슬라이드별 역할 자동 배분', '3초 임팩트 카피라이팅', '의료광고법 준수'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-pink-400">✦</span>
                    {text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-pink-50 text-pink-500 border border-pink-100">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
                AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
