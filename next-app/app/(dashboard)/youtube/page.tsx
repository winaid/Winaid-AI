'use client';

import { useState, useEffect } from 'react';
import { buildYoutubePrompt, YOUTUBE_WRITING_STYLES } from '../../../lib/youtubePrompt';
import { supabase } from '../../../lib/supabase';
import { CATEGORIES } from '../../../lib/constants';

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300';

const CRAWLER_URL = process.env.NEXT_PUBLIC_CRAWLER_URL || '';

interface SuggestedTopic { topic: string; title: string; keywords: string; }
interface KeyMoment { start: number; end: number; description: string; usage: string; }

function extractVideoId(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] || '';
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function YoutubePage() {
  // ── Step 1 ──
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [error, setError] = useState('');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [videoId, setVideoId] = useState('');

  // ── Step 2: 글 생성 설정 ──
  const [selectedTopic, setSelectedTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [writingStyle, setWritingStyle] = useState<'blog' | 'clinical' | 'summary'>('blog');
  const [category, setCategory] = useState('치과');
  const [hospitalName, setHospitalName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [textLength, setTextLength] = useState(2500);
  const [keywords, setKeywords] = useState('');

  // ── Step 2: 모드 선택 (글 생성 / GIF) ──
  const [activeMode, setActiveMode] = useState<'article' | 'gif'>('article');

  // ── GIF 관련 ──
  const [keyMoments, setKeyMoments] = useState<KeyMoment[]>([]);
  const [isDetectingMoments, setIsDetectingMoments] = useState(false);
  const [generatingGifIndex, setGeneratingGifIndex] = useState<number | null>(null);
  const [generatedGifs, setGeneratedGifs] = useState<Map<number, { dataUrl: string; fileSize: number }>>(new Map());

  // ── Step 3: 결과 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [scores, setScores] = useState<{ accuracy?: number; relevance?: number; readability?: number } | null>(null);
  const [pipelineStep, setPipelineStep] = useState<'extract' | 'configure' | 'result'>('extract');
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.name) setHospitalName(user.user_metadata.name);
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Step 1: 영상 분석 ──
  const handleExtract = async () => {
    if (!youtubeUrl.trim()) return;
    setIsExtracting(true);
    setError('');
    setTranscript('');
    setSummary('');
    setSuggestedTopics([]);
    setVideoId(extractVideoId(youtubeUrl));

    try {
      const analysisPrompt = `당신은 병원 마케팅 콘텐츠 전문가입니다.
아래 YouTube 영상의 내용을 Google Search를 통해 분석해주세요.

YouTube URL: ${youtubeUrl.trim()}

[분석 규칙 — 매우 중요]
⚠️ Google Search로 이 영상의 제목, 설명, 채널 정보, 관련 기사/블로그, 댓글 요약 등을 최대한 수집하세요.
⚠️ 이 영상에서 실제로 다루는 내용만 요약하세요. 영상과 관련 없는 일반 의학 지식을 추가하지 마세요.
⚠️ 검색으로 찾은 정보가 이 영상의 내용인지 다른 영상/기사의 내용인지 구분하세요.
⚠️ 영상 제목/설명에서 확인되는 내용만 포인트로 작성하세요.
⚠️ 포인트 수가 부족하면 억지로 채우지 말고 확인된 것만 2~3개라도 작성하세요.
⚠️ "영상에서 확인 필요" 같은 문구는 쓰지 마세요.

[요청 1: 영상 요약]
영상의 핵심 내용을 구조적으로 정리:
- 영상의 전체 주제를 한 문장으로 (첫 줄)
- 빈 줄(\n\n) 후 "첫째," 로 시작하는 포인트. 각 포인트는 2~3문장.
- 각 포인트 사이에 반드시 빈 줄(\n\n)을 넣어 구분
- 각 포인트에 구체적 수치/사례/용어가 있으면 반드시 포함
- 3~5개 포인트로 빈틈 없이 채우세요. 빈 포인트나 "확인 필요" 금지.
- 마지막에 빈 줄 후 "결론적으로," 한 문장 정리

⚠️ summary 값 안에 줄바꿈(\n)을 반드시 포함하세요. 하나의 긴 문단으로 쓰지 마세요.

[요청 2: 블로그 주제 추천]
확인된 정보를 바탕으로 병원 블로그에 쓸 수 있는 주제 5개 추천.
- topic: 글의 방향 (20자 이내)
- title: 네이버 블로그 제목 (30~40자, 검색 친화적)
- keywords: SEO 키워드 2~3개

JSON만 출력:
{
  "summary": "영상 요약 (구조적으로, 첫째/둘째/셋째 형식)...",
  "topics": [{ "topic": "...", "title": "...", "keywords": "..." }]
}`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: analysisPrompt,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.2,
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
        const summaryText = (parsed.summary || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
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

  // ── 글 생성 ──
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
          prompt, systemInstruction,
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

  // ── GIF: 핵심 구간 감지 ──
  const handleDetectMoments = async () => {
    if (!summary) return;
    setIsDetectingMoments(true);

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `아래는 병원 유튜브 영상의 요약입니다.

[영상 요약]
${summary}

[요청]
블로그나 SNS에 GIF로 활용하기 좋은 핵심 장면 3~5개를 추출해주세요.

각 장면:
- start: 예상 시작 시간 (초 단위, 정수)
- end: 예상 끝 시간 (초 단위, start + 3~8초 범위)
- description: 이 구간에 어떤 장면이 있는지 (한 줄)
- usage: 추천 용도 (블로그 삽입 / SNS 공유 / 카드뉴스 배경)

⚠️ 영상의 흐름을 기준으로 시간을 추정하세요.
⚠️ 각 구간은 3~8초가 적당합니다.

JSON 배열만 출력:
[{ "start": 45, "end": 52, "description": "...", "usage": "..." }]`,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.5,
          maxOutputTokens: 1024,
          thinkingLevel: 'none',
        }),
      });

      const data = await res.json();
      if (data.text) {
        const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) setKeyMoments(parsed);
      }
    } catch { /* ignore */ }
    finally { setIsDetectingMoments(false); }
  };

  // ── GIF: 생성 (서버 사용 가능 시) ──
  const handleGenerateGif = async (index: number, start: number, end: number) => {
    if (!CRAWLER_URL) {
      // 크롤러 없으면 구간 링크 복사로 대체
      handleCopyClipLink(start);
      return;
    }
    setGeneratingGifIndex(index);

    try {
      const res = await fetch(`${CRAWLER_URL}/api/youtube/gif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: youtubeUrl, start, end, width: 480 }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (index >= 0) {
        setGeneratedGifs(prev => new Map(prev).set(index, { dataUrl: data.gifDataUrl, fileSize: data.fileSize }));
      } else {
        const newIdx = keyMoments.length;
        setKeyMoments(prev => [...prev, { start, end, description: `커스텀 구간 ${start}~${end}초`, usage: '직접 지정' }]);
        setGeneratedGifs(prev => new Map(prev).set(newIdx, { dataUrl: data.gifDataUrl, fileSize: data.fileSize }));
      }
    } catch {
      // GIF 실패 시 구간 링크 복사로 대체
      handleCopyClipLink(start);
    } finally {
      setGeneratingGifIndex(null);
    }
  };

  // ── 클립보드 복사 (focus 안전 처리) ──
  const safeCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback: textarea 방식
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 1500);
  };

  // ── 구간 링크 복사 ──
  const handleCopyClipLink = (start: number) => {
    safeCopy(`https://www.youtube.com/watch?v=${videoId}&t=${start}`);
  };

  // ── 복사 (출처 제외) ──
  const handleCopy = () => {
    if (!generatedContent) return;
    const temp = document.createElement('div');
    temp.innerHTML = generatedContent;
    const refFooter = temp.querySelector('.references-footer');
    if (refFooter) refFooter.remove();
    safeCopy(temp.innerHTML);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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

      {/* ═══ Step 1 ═══ */}
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

      {/* ═══ Step 2 ═══ */}
      {pipelineStep === 'configure' && (
        <div className="space-y-5">
          {/* 영상 요약 */}
          {summary && (
            <div className="p-4 bg-violet-50 rounded-2xl border border-violet-200">
              <h3 className="text-sm font-bold text-violet-700 mb-2">✨ 영상 요약</h3>
              <p className="text-sm text-violet-800 leading-relaxed whitespace-pre-wrap">{summary}</p>
            </div>
          )}

          {/* 모드 선택 탭 */}
          <div className="flex gap-2">
            <button onClick={() => setActiveMode('article')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeMode === 'article' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              📝 글 생성
            </button>
            <button onClick={() => { setActiveMode('gif'); if (keyMoments.length === 0 && summary) handleDetectMoments(); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeMode === 'gif' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              🎬 핵심 장면
            </button>
          </div>

          {/* ── 글 생성 모드 ── */}
          {activeMode === 'article' && (
            <div className="space-y-5">
              {/* 요약 접기 */}
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

              {writingStyle === 'clinical' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">원장명 (선택)</label>
                  <input value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="홍길동" className={inputCls} />
                </div>
              )}

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

          {/* ── GIF 모드 ── */}
          {activeMode === 'gif' && (
            <div className="space-y-4">
              {/* YouTube 임베드 */}
              {videoId && (
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <iframe
                    id="yt-player"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {isDetectingMoments ? (
                <div className="text-center py-8 text-sm text-slate-400">
                  <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  핵심 장면 분석 중...
                </div>
              ) : keyMoments.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-700">🎬 핵심 장면 ({keyMoments.length}개)</h3>
                  {keyMoments.map((m, i) => {
                    const gif = generatedGifs.get(i);
                    return (
                      <div key={i} className="p-3 bg-white rounded-xl border border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-mono text-purple-600 flex-shrink-0">
                            {formatTime(m.start)}~{formatTime(m.end)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{m.description}</div>
                            <div className="text-[10px] text-slate-400">{m.usage}</div>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button onClick={() => {
                              const iframe = document.getElementById('yt-player') as HTMLIFrameElement;
                              if (iframe) iframe.src = `https://www.youtube.com/embed/${videoId}?start=${m.start}&autoplay=1`;
                            }} className="px-2.5 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-200">
                              ▶ 재생
                            </button>
                            <button onClick={() => handleCopyClipLink(m.start)}
                              className="px-2.5 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600">
                              🔗 링크
                            </button>
                            {CRAWLER_URL && (
                              <button
                                onClick={() => handleGenerateGif(i, m.start, m.end)}
                                disabled={generatingGifIndex !== null}
                                className="px-2.5 py-1.5 bg-purple-500 text-white text-xs font-bold rounded-lg hover:bg-purple-600 disabled:opacity-50"
                              >
                                {generatingGifIndex === i ? '생성 중...' : gif ? '다시' : '🎬 GIF'}
                              </button>
                            )}
                          </div>
                        </div>
                        {gif && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <img src={gif.dataUrl} alt={`GIF ${i + 1}`} className="max-w-full rounded-lg border" />
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-slate-400">{(gif.fileSize / 1024).toFixed(0)}KB</span>
                              <button onClick={() => {
                                const a = document.createElement('a');
                                a.href = gif.dataUrl;
                                a.download = `clip_${m.start}-${m.end}.gif`;
                                a.click();
                              }} className="text-xs text-purple-600 font-semibold hover:text-purple-700">
                                💾 다운로드
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-slate-400">
                  영상 분석 결과가 필요합니다. 먼저 영상을 분석해주세요.
                </div>
              )}

              {/* 직접 구간 지정 */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 mb-2">직접 구간 지정</h4>
                <div className="flex gap-2 items-end">
                  <div>
                    <label className="text-[10px] text-slate-400">시작(초)</label>
                    <input id="gif-start" type="number" min={0} defaultValue={0} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">끝(초)</label>
                    <input id="gif-end" type="number" min={1} defaultValue={5} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <button onClick={() => {
                    const s = parseInt((document.getElementById('gif-start') as HTMLInputElement).value) || 0;
                    const iframe = document.getElementById('yt-player') as HTMLIFrameElement;
                    if (iframe) iframe.src = `https://www.youtube.com/embed/${videoId}?start=${s}&autoplay=1`;
                  }} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300">
                    ▶ 재생
                  </button>
                  <button onClick={() => {
                    const s = parseInt((document.getElementById('gif-start') as HTMLInputElement).value) || 0;
                    handleCopyClipLink(s);
                  }} className="px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600">
                    🔗 링크
                  </button>
                  {CRAWLER_URL && (
                    <button onClick={() => {
                      const s = parseInt((document.getElementById('gif-start') as HTMLInputElement).value) || 0;
                      const e = parseInt((document.getElementById('gif-end') as HTMLInputElement).value) || 5;
                      handleGenerateGif(-1, s, e);
                    }} disabled={generatingGifIndex !== null}
                      className="px-3 py-1.5 bg-purple-500 text-white text-xs font-bold rounded-lg hover:bg-purple-600 disabled:opacity-50">
                      🎬 GIF
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Step 3: 결과 ═══ */}
      {pipelineStep === 'result' && generatedContent && (
        <div className="space-y-5">
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

      {copyToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg">
          📋 복사되었습니다
        </div>
      )}
    </div>
  );
}
