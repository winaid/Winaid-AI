'use client';

import { useState } from 'react';
import { useAuthGuard } from '../../../hooks/useAuthGuard';

export default function YoutubePage() {
  useAuthGuard();

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcriptLanguage, setTranscriptLanguage] = useState('');
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'transcript' | 'gif'>('transcript');
  const [copyFeedback, setCopyFeedback] = useState('');

  const handleAnalyze = async () => {
    if (!youtubeUrl.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setError('');
    setTranscript('');
    setSummary('');
    setTranscriptLanguage('');

    try {
      const res = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || '자막 추출에 실패했습니다.');
        return;
      }

      setTranscript(data.transcript);
      setTranscriptLanguage(data.language);

      // AI 요약 자동 실행
      setIsSummarizing(true);
      try {
        const sumRes = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `아래는 병원 관련 유튜브 영상의 자막입니다. 핵심 내용을 3~5개 포인트로 요약해주세요. 각 포인트는 한 줄로 간결하게.\n\n${data.transcript.slice(0, 8000)}`,
            model: 'gemini-3.1-flash-lite-preview',
            temperature: 0.3,
            maxOutputTokens: 500,
          }),
        });
        const sumData = await sumRes.json();
        if (sumData.text) setSummary(sumData.text);
      } catch { /* 요약 실패 무시 */ }
      finally { setIsSummarizing(false); }
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(''), 1500);
  };

  const handleUseBlog = () => {
    const encoded = encodeURIComponent(transcript.slice(0, 8000));
    window.location.href = `/blog?youtubeTranscript=${encoded}`;
  };

  const inputCls = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* 입력 패널 */}
      <div className="w-full lg:w-[380px] lg:flex-none">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">▶️</span>
            <h2 className="text-base font-bold text-slate-800">유튜브 영상 분석</h2>
          </div>
          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
            원장님 인터뷰, 시술 설명 영상의 자막을 추출하고 핵심을 요약합니다.
            추출된 자막을 블로그 원고의 참고 자료로 활용할 수 있습니다.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">유튜브 URL</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className={inputCls}
              onKeyDown={e => { if (e.key === 'Enter') handleAnalyze(); }}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !youtubeUrl.trim()}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAnalyzing ? (
              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>분석 중...</>
            ) : '분석 시작'}
          </button>
        </div>
      </div>

      {/* 결과 영역 */}
      <div className="flex-1 min-w-0">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <button onClick={() => setError('')} className="mt-3 text-xs text-red-500 hover:text-red-700">닫기</button>
          </div>
        ) : transcript ? (
          <div className="space-y-4">
            {/* 탭 전환 */}
            <div className="flex p-1 rounded-xl bg-slate-100 w-fit">
              <button onClick={() => setActiveTab('transcript')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'transcript' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>
                📝 자막/원고
              </button>
              <button onClick={() => setActiveTab('gif')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'gif' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>
                🎬 GIF 추출
              </button>
            </div>

            {activeTab === 'transcript' && (
              <div className="space-y-4">
                {/* AI 요약 */}
                {(isSummarizing || summary) && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-violet-700">✨ 핵심 요약</span>
                      {summary && (
                        <button onClick={() => handleCopy(summary, '요약')} className="text-[10px] text-violet-500 hover:text-violet-700">
                          {copyFeedback === '요약' ? '✅ 복사됨' : '📋 복사'}
                        </button>
                      )}
                    </div>
                    {isSummarizing ? (
                      <div className="flex items-center gap-2 text-xs text-violet-500">
                        <div className="w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                        요약 생성 중...
                      </div>
                    ) : (
                      <p className="text-sm text-violet-800 whitespace-pre-wrap leading-relaxed">{summary}</p>
                    )}
                  </div>
                )}

                {/* 자막 전문 */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/80">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">전체 자막</span>
                      <span className="text-[10px] text-slate-400">{transcript.length.toLocaleString()}자</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                        {transcriptLanguage === 'ko' ? '한국어' : transcriptLanguage === 'en' ? '영어' : '자동'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopy(transcript, '자막')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
                        {copyFeedback === '자막' ? '✅ 복사됨' : '📋 복사'}
                      </button>
                      <button onClick={handleUseBlog}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all">
                        📝 블로그에 활용
                      </button>
                    </div>
                  </div>
                  <div className="p-5 max-h-[400px] overflow-y-auto">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{transcript}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'gif' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto bg-slate-50">
                  <span className="text-3xl">🎬</span>
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">GIF 추출 기능</h3>
                <p className="text-sm text-slate-400">곧 추가 예정입니다</p>
              </div>
            )}
          </div>
        ) : !isAnalyzing ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[480px] flex flex-col items-center justify-center px-12 py-16">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-red-50 to-pink-50 border border-red-100">
              <span className="text-3xl">▶️</span>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">유튜브 영상 분석</h2>
            <p className="text-sm text-slate-400 text-center leading-relaxed">
              유튜브 URL을 입력하면<br />자막을 추출하고 핵심을 요약합니다
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              {['자막 자동 추출 (한국어 우선)', 'AI 핵심 요약', '블로그 원고에 바로 활용'].map(text => (
                <div key={text} className="flex items-center gap-3 px-4 py-2 text-xs text-slate-400">
                  <span className="text-[10px] text-blue-400">✦</span>{text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-14 h-14 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin mb-6" />
            <p className="text-sm font-medium text-slate-700">자막을 추출하고 있어요</p>
            <p className="text-xs text-slate-400 mt-1">영상 길이에 따라 10~30초 정도 걸립니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
