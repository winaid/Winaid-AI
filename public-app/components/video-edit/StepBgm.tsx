'use client';

import { useRef, useState } from 'react';
import type { PipelineState, StepBgmState } from './types';

interface JamendoTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  previewUrl: string;
  downloadUrl: string;
  coverUrl: string;
  genres: string[];
}

const MOOD_OPTIONS = [
  { id: 'bright', label: '밝은', emoji: '☀️' },
  { id: 'calm', label: '차분한', emoji: '🏥' },
  { id: 'emotional', label: '감성', emoji: '🎹' },
  { id: 'trendy', label: '트렌디', emoji: '🎧' },
  { id: 'corporate', label: '전문', emoji: '💼' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepBgmState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepBgm({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step7_bgm: bgm } = state;
  const hasResult = !!bgm.resultBlobUrl || bgm.mood === 'skip' || !bgm.enabled;

  const [tab, setTab] = useState<'search' | 'ai' | 'upload'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMood, setSearchMood] = useState('calm');
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<JamendoTrack | null>(null);

  // AI 생성
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [loadingRetry, setLoadingRetry] = useState(false);

  // 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // 미리듣기
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const togglePlay = (url: string, id: string) => {
    if (playingId === id && audioRef.current) {
      audioRef.current.pause(); audioRef.current = null; setPlayingId(null); return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const a = new Audio(url);
    a.volume = 0.5;
    a.play().catch(() => {});
    a.onended = () => setPlayingId(null);
    audioRef.current = a;
    setPlayingId(id);
  };

  // Jamendo 검색
  const searchBgm = async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ mood: searchMood, limit: '10' });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const res = await fetch(`/api/video/search-bgm?${params}`);
      const data = await res.json();
      if (data.tracks) setTracks(data.tracks);
    } catch { /* */ }
    finally { setSearching(false); }
  };

  // AI BGM 생성
  const generateBgm = async () => {
    setGenerating(true); setLoadingRetry(false);
    try {
      const res = await fetch('/api/video/ai-generate-bgm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: searchMood, custom_prompt: customPrompt.trim() || undefined }),
      });
      if (res.status === 503) { setLoadingRetry(true); return; }
      if (!res.ok) throw new Error('생성 실패');
      const blob = await res.blob();
      setGeneratedUrl(URL.createObjectURL(blob));
    } catch { /* */ }
    finally { setGenerating(false); }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploadedFile(f); setUploadedUrl(URL.createObjectURL(f)); e.target.value = '';
  };

  // 현재 선택된 BGM URL
  const currentBgmUrl = tab === 'search' ? selectedTrack?.downloadUrl : tab === 'ai' ? generatedUrl : uploadedUrl;

  const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {bgm.mood === 'skip' && <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm text-slate-500">BGM 없이 진행합니다.</div>}
      {bgm.resultBlobUrl && <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700">✅ BGM 삽입 완료 (볼륨 {bgm.volume}%)</div>}

      {!hasResult && (
        <div className="space-y-5">
          {/* 탭 */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button type="button" onClick={() => setTab('search')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === 'search' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
              🔍 무료 음악 검색
            </button>
            <button type="button" onClick={() => setTab('ai')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === 'ai' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
              🤖 AI 생성
            </button>
            <button type="button" onClick={() => setTab('upload')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === 'upload' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
              📁 업로드
            </button>
            <button type="button" onClick={() => onUpdate({ mood: 'skip' })}
              className="px-2 py-2 text-xs font-bold text-slate-400 hover:text-slate-600">⏭</button>
          </div>

          {/* 🔍 무료 음악 검색 (Jamendo) */}
          {tab === 'search' && (
            <div className="space-y-3">
              {/* 분위기 필터 */}
              <div className="flex gap-1.5">
                {MOOD_OPTIONS.map(m => (
                  <button key={m.id} type="button" onClick={() => { setSearchMood(m.id); }}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg ${searchMood === m.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>

              {/* 검색 */}
              <div className="flex gap-2">
                <input type="text" value={searchQuery} placeholder="검색어 (선택사항)"
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchBgm(); }}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400" />
                <button type="button" onClick={searchBgm} disabled={searching}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  {searching ? '...' : '검색'}
                </button>
              </div>

              {/* 결과 목록 */}
              {tracks.length > 0 && (
                <div className="max-h-[280px] overflow-y-auto space-y-1.5">
                  {tracks.map(t => (
                    <div key={t.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${selectedTrack?.id === t.id ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                      onClick={() => { setSelectedTrack(t); onUpdate({ bgmId: `jamendo_${t.id}` }); }}>
                      {t.coverUrl && <img src={t.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">{t.title}</div>
                        <div className="text-[9px] text-slate-400">{t.artist} · {fmtDur(t.duration)}</div>
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); togglePlay(t.previewUrl, t.id); }}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md flex-shrink-0 ${playingId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-blue-50'}`}>
                        {playingId === t.id ? '⏹' : '▶️'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {tracks.length === 0 && !searching && (
                <div className="text-center py-6 text-xs text-slate-400">
                  분위기를 선택하고 검색을 누르세요<br />
                  <span className="text-[9px]">Jamendo — 50만곡 무료 음악 라이브러리</span>
                </div>
              )}
            </div>
          )}

          {/* 🤖 AI 생성 */}
          {tab === 'ai' && (
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {MOOD_OPTIONS.map(m => (
                  <button key={m.id} type="button" onClick={() => setSearchMood(m.id)}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg ${searchMood === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
              <input type="text" value={customPrompt} placeholder="직접 설명 (선택) — 예: 밝은 피아노, 치과 홍보용"
                onChange={e => setCustomPrompt(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400" />
              <button type="button" onClick={generateBgm} disabled={generating}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl disabled:opacity-40 text-xs flex items-center justify-center gap-2">
                {generating ? (<><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />음악 생성 중...</>) : '🤖 AI 음악 생성'}
              </button>
              {loadingRetry && <div className="text-[10px] text-amber-600 text-center">모델 로딩 중 — 30초 후 다시 시도</div>}
              {generatedUrl && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-700 mb-1">✅ 생성 완료</div>
                  <audio controls src={generatedUrl} className="w-full h-8" />
                </div>
              )}
            </div>
          )}

          {/* 📁 업로드 */}
          {tab === 'upload' && (
            <div className="space-y-3">
              <div onClick={() => fileInputRef.current?.click()}
                className={`p-5 border-2 border-dashed rounded-xl text-center cursor-pointer ${uploadedFile ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 hover:border-blue-300'}`}>
                <input ref={fileInputRef} type="file" accept=".mp3,.wav,.aac,.m4a,.ogg,.flac" className="hidden" onChange={handleUpload} />
                {uploadedFile ? (
                  <div><div className="text-xl">🎶</div><div className="text-xs font-bold text-slate-800 mt-1">{uploadedFile.name}</div></div>
                ) : (
                  <div><div className="text-2xl text-slate-300">🎵</div><div className="text-xs text-slate-500 mt-1">MP3 파일 선택</div></div>
                )}
              </div>
              {uploadedUrl && <audio controls src={uploadedUrl} className="w-full h-8" />}
            </div>
          )}

          {/* 볼륨 */}
          {currentBgmUrl && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">
                볼륨: {bgm.volume}% {bgm.volume <= 15 && <span className="text-emerald-500">✓ 말소리 OK</span>}
              </label>
              <input type="range" min={0} max={50} step={1} value={bgm.volume}
                onChange={e => onUpdate({ volume: parseInt(e.target.value) })} className="w-full accent-blue-500" />
            </div>
          )}
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm">← 이전</button>
        {!hasResult && bgm.mood !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing || !currentBgmUrl}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) :
             !currentBgmUrl ? '🎵 BGM을 선택하세요' : '🎶 BGM 삽입'}
          </button>
        ) : (
          <button type="button" onClick={onNext} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 text-sm">다음 단계 →</button>
        )}
      </div>
    </div>
  );
}
