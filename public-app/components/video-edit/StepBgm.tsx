'use client';

import { useRef, useState } from 'react';
import type { PipelineState, StepBgmState, BgmMoodOption } from './types';

const MUSIC_SOURCES = [
  { label: 'Pixabay Music', url: 'https://pixabay.com/music/', desc: '무료, 저작권 표기 불필요' },
  { label: 'YouTube Audio Library', url: 'https://studio.youtube.com/channel/UC/music', desc: 'YouTube 계정 필요' },
  { label: 'Mixkit', url: 'https://mixkit.co/free-stock-music/', desc: '무료, 저작권 표기 불필요' },
  { label: 'Uppbeat', url: 'https://uppbeat.io/', desc: '무료 티어 가능' },
];

const MOOD_SEARCH: Record<string, string> = {
  bright: 'happy ukulele acoustic',
  calm: 'calm piano ambient',
  emotional: 'emotional piano cello',
  trendy: 'lofi hip hop electronic',
  corporate: 'corporate inspiring presentation',
};

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<'upload' | 'search'>('search');

  // 파일 업로드
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onUpdate({ bgmId: `custom_${file.name}` });
    e.target.value = '';
  };

  // 미리듣기
  const togglePreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      return;
    }
    if (previewUrl) {
      const audio = new Audio(previewUrl);
      audio.volume = (bgm.volume || 15) / 100;
      audio.play();
      audioRef.current = audio;
    }
  };

  return (
    <div className="space-y-6">
      {/* 스킵 */}
      {bgm.mood === 'skip' && !bgm.resultBlobUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">BGM 없이 진행합니다.</div>
        </div>
      )}

      {/* 결과 */}
      {bgm.resultBlobUrl && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <span>✅</span> BGM 삽입 완료 (볼륨 {bgm.volume}%)
          </div>
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">

          {/* 탭: 음악 검색 / 직접 업로드 */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button type="button" onClick={() => setTab('search')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'search' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
              🔍 무료 음악 검색
            </button>
            <button type="button" onClick={() => setTab('upload')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'upload' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
              📁 직접 업로드
            </button>
            <button type="button" onClick={() => { onUpdate({ mood: 'skip' }); }}
              className="px-3 py-2 text-xs font-bold text-slate-400 rounded-lg hover:text-slate-600">
              ⏭ 스킵
            </button>
          </div>

          {/* 무료 음악 검색 탭 */}
          {tab === 'search' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                <div className="text-xs font-bold text-blue-700">무료 음악 사이트에서 다운로드 후 업로드하세요</div>
                <div className="text-[10px] text-blue-600 leading-relaxed">
                  1. 아래 사이트에서 원하는 BGM을 검색하고 다운로드<br />
                  2. "직접 업로드" 탭에서 다운로드한 MP3 업로드
                </div>

                <div className="space-y-2">
                  {MUSIC_SOURCES.map(src => (
                    <a key={src.label} href={src.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-blue-100 hover:border-blue-300 transition-all group">
                      <div>
                        <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">{src.label}</div>
                        <div className="text-[9px] text-slate-400">{src.desc}</div>
                      </div>
                      <span className="text-xs text-blue-500">열기 →</span>
                    </a>
                  ))}
                </div>

                {/* 분위기별 추천 검색어 */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-blue-600">추천 검색어:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(MOOD_SEARCH).map(([mood, query]) => (
                      <a key={mood} href={`https://pixabay.com/music/search/${encodeURIComponent(query)}/`} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1 text-[9px] font-bold bg-white text-blue-600 rounded border border-blue-200 hover:bg-blue-50">
                        {mood === 'bright' ? '밝은' : mood === 'calm' ? '차분한' : mood === 'emotional' ? '감성' : mood === 'trendy' ? '트렌디' : '기업'}: {query}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 직접 업로드 탭 */}
          {tab === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                  uploadedFile ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                }`}>
                <input ref={fileInputRef} type="file" accept=".mp3,.wav,.aac,.m4a,.ogg" className="hidden" onChange={handleFileUpload} />
                {uploadedFile ? (
                  <div className="space-y-2">
                    <div className="text-2xl">🎶</div>
                    <div className="text-sm font-bold text-slate-800">{uploadedFile.name}</div>
                    <div className="text-[10px] text-slate-400">{(uploadedFile.size / 1024 / 1024).toFixed(1)}MB</div>
                    <button type="button" onClick={e => { e.stopPropagation(); setUploadedFile(null); setPreviewUrl(null); }}
                      className="text-[10px] text-red-500 font-bold">변경</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-3xl text-slate-300">🎵</div>
                    <div className="text-xs font-bold text-slate-600">MP3 파일을 클릭하여 선택</div>
                    <div className="text-[10px] text-slate-400">MP3, WAV, AAC, M4A</div>
                  </div>
                )}
              </div>

              {/* 미리듣기 + 볼륨 */}
              {previewUrl && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={togglePreview}
                      className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      ▶️ 미리듣기
                    </button>
                    <audio src={previewUrl} controls className="flex-1 h-8" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 볼륨 (공통) */}
          {bgm.mood !== 'skip' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500">
                BGM 볼륨: {bgm.volume}%
                {bgm.volume <= 15 && <span className="text-emerald-500 ml-2">✓ 말소리가 잘 들려요</span>}
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-400">0%</span>
                <input type="range" min={0} max={50} step={1} value={bgm.volume}
                  onChange={e => onUpdate({ volume: parseInt(e.target.value) })}
                  className="flex-1 accent-blue-500" />
                <span className="text-[10px] text-slate-400">50%</span>
              </div>
              <div className="text-[10px] text-slate-400">15% 이하 추천 — 말소리 방해 안 됨</div>
            </div>
          )}
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev}
          className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
          ← 이전
        </button>
        {!hasResult && bgm.mood !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing || !uploadedFile}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) :
             !uploadedFile ? '🎵 BGM 파일을 먼저 업로드하세요' : '🎶 BGM 삽입'}
          </button>
        ) : (
          <button type="button" onClick={onNext}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
            다음 단계 →
          </button>
        )}
      </div>
    </div>
  );
}
