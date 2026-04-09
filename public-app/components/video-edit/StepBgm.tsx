'use client';

import { useRef, useState } from 'react';
import type { PipelineState, StepBgmState } from './types';

const MOOD_OPTIONS = [
  { id: 'bright', label: '밝고 경쾌한', emoji: '☀️', desc: '우쿨렐레, 어쿠스틱' },
  { id: 'calm', label: '차분한', emoji: '🏥', desc: '병원 영상 추천' },
  { id: 'emotional', label: '감성적인', emoji: '🎹', desc: '피아노, 스트링스' },
  { id: 'trendy', label: '트렌디', emoji: '🎧', desc: '로파이, 일렉트로닉' },
  { id: 'corporate', label: '전문적', emoji: '💼', desc: '프레젠테이션' },
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'ai' | 'upload'>('ai');
  const [generating, setGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState('calm');
  const [loadingRetry, setLoadingRetry] = useState(false);

  // AI BGM 생성
  const generateBgm = async () => {
    setGenerating(true);
    setLoadingRetry(false);
    try {
      const res = await fetch('/api/video/ai-generate-bgm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: selectedMood,
          custom_prompt: customPrompt.trim() || undefined,
        }),
      });

      if (res.status === 503) {
        // 모델 로딩 중
        setLoadingRetry(true);
        return;
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '생성 실패' }));
        throw new Error(d.error);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setGeneratedUrl(url);
      onUpdate({ bgmId: `ai_${selectedMood}`, mood: selectedMood as StepBgmState['mood'] });
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  // 파일 업로드
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadedUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  // 현재 BGM URL (AI 생성 or 업로드)
  const currentBgmUrl = tab === 'ai' ? generatedUrl : uploadedUrl;

  return (
    <div className="space-y-6">
      {bgm.mood === 'skip' && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">BGM 없이 진행합니다.</div>
        </div>
      )}

      {bgm.resultBlobUrl && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="text-sm font-bold text-emerald-700">✅ BGM 삽입 완료 (볼륨 {bgm.volume}%)</div>
        </div>
      )}

      {!hasResult && (
        <div className="space-y-5">
          {/* 탭 */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button type="button" onClick={() => setTab('ai')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'ai' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
              🤖 AI 음악 생성
            </button>
            <button type="button" onClick={() => setTab('upload')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'upload' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
              📁 직접 업로드
            </button>
            <button type="button" onClick={() => onUpdate({ mood: 'skip' })}
              className="px-3 py-2 text-xs font-bold text-slate-400 rounded-lg hover:text-slate-600">
              ⏭
            </button>
          </div>

          {/* AI 생성 탭 */}
          {tab === 'ai' && (
            <div className="space-y-4">
              {/* 분위기 선택 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">분위기</label>
                <div className="grid grid-cols-3 gap-2">
                  {MOOD_OPTIONS.map(m => (
                    <button key={m.id} type="button" onClick={() => setSelectedMood(m.id)}
                      className={`p-2.5 rounded-xl border-2 text-center transition-all ${selectedMood === m.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                      <div className="text-lg">{m.emoji}</div>
                      <div className={`text-[10px] font-bold mt-0.5 ${selectedMood === m.id ? 'text-blue-700' : 'text-slate-700'}`}>{m.label}</div>
                      <div className="text-[8px] text-slate-400">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 커스텀 프롬프트 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400">직접 설명 (선택사항)</label>
                <input type="text" value={customPrompt}
                  placeholder="예: 밝은 피아노와 우쿨렐레, 치과 홍보 영상용"
                  onChange={e => setCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-400" />
              </div>

              {/* 생성 버튼 */}
              <button type="button" onClick={generateBgm} disabled={generating}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl disabled:opacity-40 text-sm flex items-center justify-center gap-2">
                {generating ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI가 음악을 만들고 있습니다...</>) : '🎵 AI 음악 생성 (Meta MusicGen)'}
              </button>

              {loadingRetry && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 text-center">
                  AI 모델을 로딩 중입니다. 20~30초 후 다시 시도해주세요.
                </div>
              )}

              {/* 생성 결과 */}
              {generatedUrl && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-emerald-700">✅ AI 음악 생성 완료!</div>
                  <audio controls src={generatedUrl} className="w-full" />
                  <button type="button" onClick={generateBgm} disabled={generating}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800">
                    🔄 다시 생성
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 업로드 탭 */}
          {tab === 'upload' && (
            <div className="space-y-4">
              <div onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${uploadedFile ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 hover:border-blue-300'}`}>
                <input ref={fileInputRef} type="file" accept=".mp3,.wav,.aac,.m4a,.ogg,.flac" className="hidden" onChange={handleUpload} />
                {uploadedFile ? (
                  <div className="space-y-1">
                    <div className="text-2xl">🎶</div>
                    <div className="text-sm font-bold text-slate-800">{uploadedFile.name}</div>
                    <div className="text-[10px] text-slate-400">{(uploadedFile.size / 1024 / 1024).toFixed(1)}MB</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-3xl text-slate-300">🎵</div>
                    <div className="text-xs font-bold text-slate-600">MP3 파일을 선택하세요</div>
                    <div className="text-[10px] text-slate-400">Pixabay Music, YouTube Audio Library 등에서 다운로드</div>
                  </div>
                )}
              </div>
              {uploadedUrl && <audio controls src={uploadedUrl} className="w-full" />}
            </div>
          )}

          {/* 볼륨 */}
          {bgm.mood !== 'skip' && currentBgmUrl && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500">
                볼륨: {bgm.volume}%
                {bgm.volume <= 15 && <span className="text-emerald-500 ml-2">✓ 말소리 잘 들려요</span>}
              </label>
              <input type="range" min={0} max={50} step={1} value={bgm.volume}
                onChange={e => onUpdate({ volume: parseInt(e.target.value) })}
                className="w-full accent-blue-500" />
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
             !currentBgmUrl ? '🎵 먼저 BGM을 생성하거나 업로드하세요' : '🎶 BGM 삽입'}
          </button>
        ) : (
          <button type="button" onClick={onNext} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 text-sm">다음 단계 →</button>
        )}
      </div>
    </div>
  );
}
