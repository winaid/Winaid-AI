'use client';

import { useState, useEffect } from 'react';
import { buildYoutubePrompt, YOUTUBE_WRITING_STYLES } from '../../../lib/youtubePrompt';
import { supabase } from '../../../lib/supabase';
import { CATEGORIES } from '../../../lib/constants';

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300';

interface SuggestedTopic { topic: string; title: string; keywords: string; }

export default function YoutubePage() {
  // ── Step 1: URL → 자막 추출 → AI 분석 ──
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [error, setError] = useState('');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  // ── Step 2: 설정 ──
  const [selectedTopic, setSelectedTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [writingStyle, setWritingStyle] = useState<'blog' | 'clinical' | 'summary'>('blog');
  const [category, setCategory] = useState('치과');
  const [hospitalName, setHospitalName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [textLength, setTextLength] = useState(2500);
  const [keywords, setKeywords] = useState('');

  // ── Step 3: 결과 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [scores, setScores] = useState<{ accuracy?: number; relevance?: number; readability?: number } | null>(null);
  const [pipelineStep, setPipelineStep] = useState<'extract' | 'configure' | 'result'>('extract');
  const [copyToast, setCopyToast] = useState(false);

  // 프로필 병원명 로드
  useEffect(() => {
    (async () => {
      try {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.name) setHospitalName(user.user_metadata.name);
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Step 1: 자막 추출 + AI 분석 ──
  const handleExtract = async () => {
    if (!youtubeUrl.trim()) return;
    setIsExtracting(true);
    setError('');
    setTranscript('');
    setSummary('');
    setSuggestedTopics([]);

    try {
      // Gemini + Google Search로 영상 직접 분석
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `아래 YouTube 영상의 내용을 분석해주세요.

YouTube URL: ${youtubeUrl.trim()}

[분석 요청]
1. 이 영상의 전체 내용을 상세하게 요약하세요 (500~1000자).
   - 영상에서 설명하는 핵심 내용, 치료/시술 과정, 의학적 정보를 빠짐없이 정리
   - 구체적 수치, 기간, 횟수 등이 있으면 반드시 포함
   - 영상 진행 순서대로 정리

2. 이 영상 내용을 바탕으로 병원 블로그에 쓸 수 있는 주제 5개를 추천하세요.
   각 주제:
   - topic: 글의 방향 (20자 이내)
   - title: 네이버 블로그 제목 (30~40자)
   - keywords: SEO 키워드 2~3개

⚠️ 인사말, 구독 요청, 광고 등은 무시하고 의학/치료 내용만 분석하세요.

JSON만 출력:
{
  "summary": "영상 상세 요약...",
  "topics": [{ "topic": "...", "title": "...", "keywords": "..." }]
}`,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.5,
          maxOutputTokens: 4096,
          googleSearch: true,
          thinkingLevel: 'none',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || '영상 분석에 실패했습니다.');

      const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        const summaryText = parsed.summary || '';
        setTranscript(summaryText);
        setSummary(summaryText);
        setSuggestedTopics(parsed.topics || []);
      } catch {
        setTranscript(data.text);
        setSummary(data.text);
      }

      setPipelineStep('configure');
    } catch (err) {
      setError(err instanceof Error ? err.message : '영상 분석 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Step 2 → 3: 생성 ──
  const handleGenerate = async () => {
    const topic = selectedTopic || customTopic.trim();
    if (!topic || !transcript) return;
    setIsGenerating(true);
    setGeneratedContent(null);
    setScores(null);

    try {
      const { systemInstruction, prompt } = buildYoutubePrompt({
        topic,
        transcript,
        writingStyle,
        category,
        hospitalName: hospitalName || undefined,
        doctorName: writingStyle === 'clinical' ? (doctorName || undefined) : undefined,
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
          maxOutputTokens: 16384,
          timeout: 120000,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || '생성 실패');

      let html = data.text.trim();
      html = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');

      const scoresIdx = html.lastIndexOf('---SCORES---');
      if (scoresIdx !== -1) {
        const after = html.substring(scoresIdx + 12);
        try {
          const jsonMatch = after.match(/\{[\s\S]*?\}/);
          if (jsonMatch) setScores(JSON.parse(jsonMatch[0]));
        } catch { /* ignore */ }
        html = html.substring(0, scoresIdx).trim();
      }

      setGeneratedContent(html);
      setPipelineStep('result');
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800">▶️ 유튜브 → 블로그 글</h1>
        <p className="text-sm text-slate-500 mt-1">영상을 AI가 분석하고, 원하는 문체로 블로그 글을 생성합니다</p>
      </div>

      {/* 파이프라인 인디케이터 */}
      <div className="flex items-center gap-2 mb-6">
        {(['extract', 'configure', 'result'] as const).map((step, i) => {
          const labels = ['▶️ 영상 분석', '⚙️ 설정 + 생성', '📄 결과'];
          const isActive = pipelineStep === step;
          const isDone = (['extract', 'configure', 'result'] as const).indexOf(pipelineStep) > i;
          return (
            <div key={step} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-0.5 ${isDone || isActive ? 'bg-blue-400' : 'bg-slate-200'}`} />}
              <button onClick={() => { if (isDone) setPipelineStep(step); }} disabled={!isDone && !isActive}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive ? 'bg-blue-500 text-white' : isDone ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer' : 'bg-slate-100 text-slate-400'
                }`}>{labels[i]}</button>
            </div>
          );
        })}
      </div>

      {/* ═══ Step 1: URL 입력 + 자막 추출 ═══ */}
      {pipelineStep === 'extract' && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">YouTube URL</label>
            <input type="url" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className={inputCls}
              onKeyDown={e => { if (e.key === 'Enter') handleExtract(); }} />
          </div>

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

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button onClick={handleExtract} disabled={isExtracting || !youtubeUrl.trim()}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {isExtracting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />영상 분석 중...</>) : '▶️ 영상 분석 시작'}
          </button>
        </div>
      )}

      {/* ═══ Step 2: 설정 + 생성 ═══ */}
      {pipelineStep === 'configure' && (
        <div className="space-y-5">
          {/* 요약 */}
          {summary && (
            <div className="p-4 bg-violet-50 rounded-2xl border border-violet-200">
              <h3 className="text-sm font-bold text-violet-700 mb-2">✨ 영상 요약</h3>
              <p className="text-sm text-violet-800 leading-relaxed whitespace-pre-wrap">{summary}</p>
            </div>
          )}

          {/* 자막 미리보기 (접을 수 있음) */}
          {transcript && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <button onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-left">
                <span className="text-xs font-semibold text-slate-600">📝 영상 요약 ({transcript.length.toLocaleString()}자)</span>
                <span className="text-xs text-slate-400">{transcriptExpanded ? '접기 ▲' : '펼치기 ▼'}</span>
              </button>
              {transcriptExpanded && (
                <div className="p-4 max-h-[200px] overflow-y-auto">
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{transcript}</p>
                </div>
              )}
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
              placeholder="직접 입력" className={inputCls + ' mt-2'} />
          </div>

          {/* 문체 선택 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">문체 선택</label>
            <div className="grid grid-cols-3 gap-2">
              {YOUTUBE_WRITING_STYLES.map(s => (
                <button key={s.value} onClick={() => setWritingStyle(s.value as typeof writingStyle)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    writingStyle === s.value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
                  }`}>
                  <span className="text-lg">{s.icon}</span>
                  <div className="text-xs font-semibold mt-1">{s.label}</div>
                  <div className="text-[10px] text-slate-400">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* clinical일 때만 원장명 */}
          {writingStyle === 'clinical' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">원장명 (선택)</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="홍길동" className={inputCls} />
            </div>
          )}

          {/* 분량 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">분량</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: 1500, l: '짧은 글', d: '1,200~1,800자' }, { v: 2500, l: '중간 글', d: '2,000~3,000자' }, { v: 3500, l: '긴 글', d: '3,000자~' }].map(o => (
                <button key={o.v} onClick={() => setTextLength(o.v)}
                  className={`py-2.5 rounded-xl border text-center transition-all ${
                    textLength === o.v ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'
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
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 임플란트 비용, 임플란트 과정" className={inputCls} />
          </div>

          <button onClick={handleGenerate} disabled={isGenerating || (!selectedTopic && !customTopic.trim())}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-[15px]">
            {isGenerating ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />글 생성 중...</>) : '📝 글 생성'}
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
                { label: '정확 반영', value: scores.accuracy, color: 'text-blue-600' },
                { label: '주제 집중', value: scores.relevance, color: 'text-purple-600' },
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
              .yt-content h3 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 28px 0 14px 0; line-height: 1.4; }
              .yt-content p { font-size: 15px; color: #444; margin: 0 0 12px 0; line-height: 1.8; }
              .yt-content ul { margin: 12px 0; padding-left: 24px; }
              .yt-content li { font-size: 15px; color: #444; margin: 6px 0; line-height: 1.7; }
              .yt-content strong { color: #1e293b; }
              .references-footer { user-select: none; opacity: 0.6; }
            `}</style>
            <div className="yt-content" dangerouslySetInnerHTML={{ __html: generatedContent }} />
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
