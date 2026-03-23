'use client';

import { useState } from 'react';
import { TEAM_DATA } from '../../../lib/teamData';
import { buildPressPrompt, PRESS_TYPES, DOCTOR_TITLES, type PressType } from '../../../lib/pressPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSupabaseClient } from '../../../lib/supabase';
import { ErrorPanel, ResultPanel } from '../../../components/GenerationResult';

export default function PressPage() {
  // ── 폼 상태 ──
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [doctorTitle, setDoctorTitle] = useState('원장');
  const [pressType, setPressType] = useState<PressType>('achievement');
  const [textLength, setTextLength] = useState(1200);

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !doctorName.trim()) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);
    setSaveStatus(null);

    try {
      const { systemInstruction, prompt } = buildPressPrompt({
        topic: topic.trim(),
        keywords: keywords.trim() || undefined,
        hospitalName: hospitalName || undefined,
        doctorName: doctorName.trim(),
        doctorTitle,
        pressType,
        textLength,
      });

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction,
          model: 'gemini-2.5-flash-preview-05-20',
          temperature: 0.7,
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
        const titleMatch = data.text.match(/^#\s+(.+)/m) || data.text.match(/^(.+)/);
        const extractedTitle = titleMatch
          ? titleMatch[1].replace(/^[#*\s]+/, '').trim().substring(0, 200)
          : topic.trim();

        const saveResult = await savePost({
          userId: session?.user?.id || null,
          userEmail: session?.user?.email || null,
          hospitalName: hospitalName || undefined,
          postType: 'press_release',
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

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 ── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🗞️</span>
            <h2 className="text-base font-bold text-slate-800">보도자료 생성</h2>
          </div>

          {/* 면책 안내 */}
          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
            본 보도자료는 홍보 목적의 자료이며, 의학적 조언이나 언론 보도로 사용될 경우 법적 책임은 사용자에게 있습니다.
          </p>

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
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
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

          {/* 의료진 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>의료진 *</label>
              <input
                type="text"
                value={doctorName}
                onChange={e => setDoctorName(e.target.value)}
                placeholder="홍길동"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>직함</label>
              <select value={doctorTitle} onChange={e => setDoctorTitle(e.target.value)} className={inputCls}>
                {DOCTOR_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* 주제 */}
          <div>
            <label className={labelCls}>주제 *</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="예: 최소침습 임플란트 수술법 도입"
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
              placeholder="예: 임플란트, 최소침습, 디지털"
              className={inputCls}
            />
          </div>

          {/* 보도 유형 */}
          <div>
            <label className={labelCls}>보도 유형</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESS_TYPES.map(pt => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setPressType(pt.value)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    pressType === pt.value
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {pt.icon} {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 글자 수 */}
          <div>
            <label className={labelCls}>글자 수: {textLength.toLocaleString()}자</label>
            <input
              type="range"
              min={800}
              max={2000}
              step={200}
              value={textLength}
              onChange={e => setTextLength(Number(e.target.value))}
              className="w-full accent-amber-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>800자</span>
              <span>2,000자</span>
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            type="submit"
            disabled={isGenerating || !topic.trim() || !doctorName.trim()}
            className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              '보도자료 생성하기'
            )}
          </button>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {isGenerating ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-amber-50 text-amber-600 border border-amber-100">
              <span>🗞️</span>
              <span>기사 작성 중</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-amber-100 border-t-amber-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              언론사 기사 문체로 보도자료를 작성하고 있어요
            </p>
            <p className="text-xs text-slate-400">
              전문의 인용과 의료광고법 준수를 확인하고 있습니다
            </p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : generatedContent ? (
          <ResultPanel content={generatedContent} saveStatus={saveStatus} postType="press_release" completionText="보도자료 생성 완료" />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="text-[10px] text-slate-300 font-medium">PRESS RELEASE</div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 작성하는<br /><span className="text-amber-600">언론 보도자료</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">
                  주제와 의료진 정보로<br />기자 문체의 보도자료를 생성합니다
                </p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['3인칭 기자 문체 자동 적용', '전문의 인용 2회 이상 포함', '의료광고법 준수 검토'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-amber-400">✦</span>
                    {text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-amber-50 text-amber-500 border border-amber-100">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
