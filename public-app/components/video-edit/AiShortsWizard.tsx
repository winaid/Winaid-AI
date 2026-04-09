'use client';

import { useState, useRef } from 'react';
import {
  type AiShortsState, type ScriptScene, type AiInputType, type AiTone, type AiDuration,
  AI_STEP_LABELS, INITIAL_AI_SHORTS_STATE,
} from './types';
import { validateMedicalAd } from '../../lib/medicalAdValidation';
import { getStylesByCategory, VIDEO_STYLES } from '../../lib/videoStyles';
import {
  TTS_VOICES, TTS_STYLE_PRESETS, ENGINE_LABELS,
  getVoicesByEngine, getRecommendedVoices, getVoiceById,
  type TtsEngine, type TtsVoice,
} from '../../lib/ttsVoices';

// ── 메인 위저드 ──

interface Props {
  onBack: () => void;
}

export default function AiShortsWizard({ onBack }: Props) {
  const [state, setState] = useState<AiShortsState>(INITIAL_AI_SHORTS_STATE);
  const [error, setError] = useState('');
  const patch = (p: Partial<AiShortsState>) => setState(prev => ({ ...prev, ...p }));

  return (
    <div className="space-y-6">
      {/* 상단 네비 */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-sm text-slate-400 hover:text-slate-600">← 모드 선택</button>
        <div className="flex items-center gap-1">
          {AI_STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <div className={`w-3 h-0.5 ${i <= state.currentStep ? 'bg-indigo-300' : 'bg-slate-200'}`} />}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                i === state.currentStep ? 'bg-indigo-100 text-indigo-700' :
                i < state.currentStep ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {i < state.currentStep ? '✓' : ''} {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>}

      {/* STEP A: 대본 */}
      {state.currentStep === 0 && <StepScript state={state} patch={patch} setError={setError} />}

      {/* STEP B: 스타일 */}
      {state.currentStep === 1 && <StepStyleSelect state={state} patch={patch} />}

      {/* STEP C: 목소리 */}
      {state.currentStep === 2 && <StepVoice state={state} patch={patch} />}

      {/* STEP D: 이미지 */}
      {state.currentStep === 3 && <StepImages state={state} patch={patch} />}

      {/* STEP E: 조립 */}
      {state.currentStep === 4 && <StepAssemble state={state} patch={patch} />}

      {/* 완성 */}
      {state.currentStep === 5 && <StepComplete state={state} onBack={onBack} />}
    </div>
  );
}

// ══════════════════════════════════════════
// STEP A: 대본 생성
// ══════════════════════════════════════════

function StepScript({ state, patch, setError }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void; setError: (e: string) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const movingRef = useRef(false);
  const hasScenes = state.scenes.length > 0;

  const generateScript = async () => {
    patch({ isProcessing: true, progress: '대본을 생성하고 있습니다...' });
    setError('');
    try {
      const res = await fetch('/api/video/ai-generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_type: state.inputType,
          keyword: state.keyword,
          url: state.url,
          manual_script: state.manualScript,
          duration: state.duration,
          tone: state.tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '대본 생성 실패');
      patch({ scenes: data.scenes || [] });
    } catch (err) { setError(err instanceof Error ? err.message : '대본 생성 실패'); }
    finally { patch({ isProcessing: false, progress: '' }); }
  };

  const updateNarration = (idx: number, text: string) => {
    const updated = state.scenes.map((s, i) => i === idx ? { ...s, narration: text, violations: validateMedicalAd(text) } : s);
    patch({ scenes: updated });
  };

  return (
    <div className="space-y-5">
      {!hasScenes && (
        <>
          {/* 입력 방식 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500">입력 방식</label>
            <div className="flex gap-2">
              {([['keyword', '키워드'], ['url', 'URL'], ['manual', '직접 작성']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => patch({ inputType: id })}
                  className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${state.inputType === id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 입력 필드 */}
          {state.inputType === 'keyword' && (
            <input type="text" value={state.keyword} placeholder="예: 임플란트 수명 관리 방법"
              onChange={e => patch({ keyword: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
          )}
          {state.inputType === 'url' && (
            <input type="url" value={state.url} placeholder="블로그/뉴스 URL 입력"
              onChange={e => patch({ url: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
          )}
          {state.inputType === 'manual' && (
            <textarea value={state.manualScript} placeholder="대본을 직접 작성하세요" rows={5}
              onChange={e => patch({ manualScript: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 resize-none" />
          )}

          {/* 옵션 */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-semibold text-slate-400">영상 길이</label>
              <div className="flex gap-1">
                {([30, 60, 90] as AiDuration[]).map(d => (
                  <button key={d} type="button" onClick={() => patch({ duration: d })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${state.duration === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {d}초
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-semibold text-slate-400">톤</label>
              <div className="flex gap-1">
                {([['professional', '전문'], ['friendly', '친근'], ['humorous', '유머']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => patch({ tone: id })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${state.tone === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 생성된 대본 */}
      {hasScenes && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">대본 ({state.scenes.length}장면 · {state.duration}초)</span>
            <button type="button" onClick={() => patch({ scenes: [] })} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">🔄 다시 생성</button>
          </div>
          <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
            {state.scenes.map((scene, idx) => (
              <div key={idx} className={`px-4 py-3 ${scene.violations.length > 0 ? 'bg-red-50/30' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">장면 {scene.sceneNumber}</span>
                  <span className="text-[9px] text-slate-400">{scene.startTime.toFixed(0)}~{scene.endTime.toFixed(0)}초</span>
                </div>
                {editingIdx === idx ? (
                  <textarea value={scene.narration} rows={2} autoFocus
                    onChange={e => updateNarration(idx, e.target.value)}
                    onBlur={() => { if (!movingRef.current) setEditingIdx(null); movingRef.current = false; }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (idx < state.scenes.length - 1) {
                          movingRef.current = true;
                          setEditingIdx(idx + 1);
                        } else {
                          setEditingIdx(null);
                        }
                      }
                    }}
                    className="w-full px-2 py-1 text-xs border border-indigo-400 rounded-lg outline-none resize-none" />
                ) : (
                  <div onClick={() => setEditingIdx(idx)} className="text-sm text-slate-800 cursor-text hover:bg-indigo-50 rounded px-1 -mx-1">
                    {scene.narration}
                  </div>
                )}
                {scene.violations.length > 0 && editingIdx !== idx && (
                  <div className="mt-1">
                    {scene.violations.map((v, vi) => (
                      <span key={vi} className={`text-[9px] mr-2 ${v.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`}>
                        {v.severity === 'high' ? '⛔' : '⚠️'} {v.keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 */}
      {!hasScenes ? (
        <button type="button" onClick={generateScript} disabled={state.isProcessing || (!state.keyword.trim() && !state.url.trim() && !state.manualScript.trim())}
          className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
          {state.isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{state.progress}</>) : '✨ 대본 생성'}
        </button>
      ) : (
        <button type="button" onClick={() => patch({ currentStep: 1 })}
          className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">
          다음: 스타일 선택 →
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// STEP B: 스타일 선택
// ══════════════════════════════════════════

function StepStyleSelect({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  const groups = getStylesByCategory();
  return (
    <div className="space-y-5">
      {groups.filter(g => g.label !== '원본').map(group => (
        <div key={group.label} className="space-y-2">
          <label className="text-xs font-semibold text-slate-500">{group.label}</label>
          <div className="grid grid-cols-3 gap-2">
            {group.styles.filter(s => s.id !== 'original').map(s => (
              <button key={s.id} type="button" onClick={() => patch({ styleId: s.id })}
                className={`p-2.5 rounded-xl border-2 text-center transition-all ${state.styleId === s.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                <div className={`text-[11px] font-bold ${state.styleId === s.id ? 'text-indigo-700' : 'text-slate-700'}`}>{s.name}</div>
                {!s.ready && <div className="text-[8px] text-amber-500 font-bold">준비 중</div>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 0 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        <button type="button" onClick={() => patch({ currentStep: 2 })} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm">다음: 목소리 →</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// STEP C: 목소리 (TTS)
// ══════════════════════════════════════════

function StepVoice({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [engine, setEngine] = useState<TtsEngine>((state.voiceEngine as TtsEngine) || 'gemini');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male' | 'neutral'>('all');

  const voices = getVoicesByEngine(engine).filter(v => genderFilter === 'all' || v.gender === genderFilter);
  const recommended = getRecommendedVoices();
  const selectedVoice = getVoiceById(state.voiceId);
  const stylePrompt = TTS_STYLE_PRESETS[state.voiceStylePreset]?.prompt || '';

  const selectVoice = (v: TtsVoice) => {
    patch({ voiceId: v.id, voiceName: v.name, voiceEngine: v.engine, voiceModel: v.model, audioUrl: undefined });
    setEngine(v.engine);
  };

  const previewVoice = async (v: TtsVoice) => {
    if (previewingId === v.id) { audioRef.current?.pause(); audioRef.current = null; setPreviewingId(null); return; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPreviewingId(v.id);
    try {
      const text = state.scenes[0]?.narration || '안녕하세요, 반갑습니다.';
      const res = await fetch('/api/video/ai-preview-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 60),
          voice_name: v.name,
          engine: v.engine,
          model: v.model,
          speed: state.voiceSpeed,
          style_prompt: v.engine === 'gemini' ? stylePrompt : undefined,
        }),
      });
      if (!res.ok) { setPreviewingId(null); return; }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setPreviewingId(null);
      audio.play();
      audioRef.current = audio;
    } catch { setPreviewingId(null); }
  };

  const generateTts = async () => {
    setGenerating(true);
    patch({ isProcessing: true, progress: '나레이션을 생성하고 있습니다...' });
    try {
      const res = await fetch('/api/video/ai-generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: state.scenes,
          voice_id: state.voiceId,
          voice_name: state.voiceName,
          engine: state.voiceEngine,
          model: state.voiceModel,
          speed: state.voiceSpeed,
          style_prompt: state.voiceEngine === 'gemini' ? stylePrompt : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: '실패' })); throw new Error(d.error); }
      const blob = await res.blob();
      patch({ audioUrl: URL.createObjectURL(blob) });
    } catch (err) { console.error(err); }
    finally { setGenerating(false); patch({ isProcessing: false, progress: '' }); }
  };

  return (
    <div className="space-y-5">
      {/* 엔진 탭 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(['gemini', 'chirp3_hd', 'legacy'] as TtsEngine[]).map(e => (
          <button key={e} type="button" onClick={() => setEngine(e)}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${engine === e ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
            {ENGINE_LABELS[e].label}
          </button>
        ))}
      </div>

      {/* 추천 (Gemini만) */}
      {engine === 'gemini' && recommended.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-indigo-500">⭐ 병원 영상 추천</label>
          <div className="grid grid-cols-2 gap-1.5">
            {recommended.map(v => (
              <button key={v.id} type="button" onClick={() => selectVoice(v)}
                className={`p-2 rounded-lg border text-left text-[10px] transition-all ${state.voiceId === v.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                <div className={`font-bold ${state.voiceId === v.id ? 'text-indigo-700' : 'text-slate-700'}`}>{v.name}</div>
                <div className="text-slate-400">{v.description.split('—')[0]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 성별 필터 */}
      <div className="flex gap-1">
        {([['all', '전체'], ['female', '여성'], ['male', '남성'], ['neutral', '중성']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setGenderFilter(id)}
            className={`px-2 py-1 text-[9px] font-bold rounded-md ${genderFilter === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 목소리 목록 */}
      <div className="max-h-[220px] overflow-y-auto space-y-1">
        {voices.map(v => (
          <div key={v.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all ${state.voiceId === v.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'}`}>
            <button type="button" onClick={() => selectVoice(v)} className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${state.voiceId === v.id ? 'border-indigo-500' : 'border-slate-300'}`}>
                {state.voiceId === v.id && <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />}
              </span>
              <span className={`text-[11px] font-bold truncate ${state.voiceId === v.id ? 'text-indigo-700' : 'text-slate-700'}`}>{v.label}</span>
            </button>
            <button type="button" onClick={() => previewVoice(v)}
              className={`px-1.5 py-0.5 text-[9px] font-bold rounded flex-shrink-0 ${previewingId === v.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-indigo-50'}`}>
              {previewingId === v.id ? '⏹' : '▶️'}
            </button>
          </div>
        ))}
      </div>

      {/* 스타일 프롬프트 (Gemini만) */}
      {engine === 'gemini' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500">말하기 스타일</label>
          <div className="flex gap-1 flex-wrap">
            {Object.entries(TTS_STYLE_PRESETS).map(([key, preset]) => (
              <button key={key} type="button" onClick={() => patch({ voiceStylePreset: key })}
                className={`px-2 py-1 text-[10px] font-bold rounded-md ${state.voiceStylePreset === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 속도 (Legacy만) */}
      {engine === 'legacy' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500">속도: ×{state.voiceSpeed.toFixed(1)}</label>
          <input type="range" min={0.8} max={1.2} step={0.1} value={state.voiceSpeed}
            onChange={e => patch({ voiceSpeed: parseFloat(e.target.value) })} className="w-full accent-indigo-500" />
        </div>
      )}

      {/* 나레이션 결과 */}
      {state.audioUrl && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="text-xs font-bold text-emerald-700 mb-2">✅ 나레이션 생성 완료</div>
          <audio controls src={state.audioUrl} className="w-full" />
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 1 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        {!state.audioUrl ? (
          <button type="button" onClick={generateTts} disabled={generating}
            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-40 text-sm flex items-center justify-center gap-2">
            {generating ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중...</>) : '🎙️ 나레이션 생성'}
          </button>
        ) : (
          <button type="button" onClick={() => patch({ currentStep: 3 })} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm">다음: 이미지 →</button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// STEP D: 이미지 생성
// ══════════════════════════════════════════

function StepImages({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  const [generating, setGenerating] = useState(false);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const hasAllImages = state.scenes.every(s => !!s.imageUrl);

  const generateAll = async () => {
    setGenerating(true);
    patch({ isProcessing: true, progress: '장면 이미지를 생성하고 있습니다...' });
    try {
      const res = await fetch('/api/video/ai-generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: state.scenes.map(s => ({ scene_number: s.sceneNumber, image_prompt: s.imagePrompt, narration: s.narration })),
          style_id: state.styleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const updated = state.scenes.map(s => {
        const img = (data.scene_images || []).find((si: { scene_number: number }) => si.scene_number === s.sceneNumber);
        return img?.image_url ? { ...s, imageUrl: img.image_url } : s;
      });
      patch({ scenes: updated });
    } catch (err) { console.error(err); }
    finally { setGenerating(false); patch({ isProcessing: false, progress: '' }); }
  };

  const regenerateScene = async (idx: number) => {
    const scene = state.scenes[idx];
    setRegenIdx(idx);
    try {
      const res = await fetch('/api/video/ai-regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_number: scene.sceneNumber, image_prompt: scene.imagePrompt, style_id: state.styleId }),
      });
      const data = await res.json();
      if (data.image_url) {
        const updated = state.scenes.map((s, i) => i === idx ? { ...s, imageUrl: data.image_url } : s);
        patch({ scenes: updated });
      }
    } catch { /* */ }
    finally { setRegenIdx(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-500">장면별 이미지 ({state.scenes.length}장면)</div>
        <button type="button" onClick={generateAll} disabled={generating}
          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
          {generating ? '생성 중...' : hasAllImages ? '🔄 전체 재생성' : '✨ 전체 생성'}
        </button>
      </div>
      <div className="space-y-3">
        {state.scenes.map((scene, idx) => (
          <div key={idx} className="flex gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-20 h-28 bg-slate-200 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden relative">
              {regenIdx === idx && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}
              {scene.imageUrl ? <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" /> : '🖼️'}
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-indigo-500 font-bold">장면 {scene.sceneNumber}</div>
              <div className="text-xs text-slate-700 mt-0.5">{scene.narration.slice(0, 50)}{scene.narration.length > 50 ? '...' : ''}</div>
              <div className="flex gap-1.5 mt-2">
                <button type="button" onClick={() => regenerateScene(idx)} disabled={regenIdx !== null}
                  className="px-2 py-0.5 text-[9px] font-bold text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 disabled:opacity-40">
                  🔄 재생성
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {generating && (
        <div className="p-3 bg-indigo-50 rounded-xl text-center">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-1" />
          <div className="text-xs text-indigo-600 font-bold">{state.progress || '이미지 생성 중...'}</div>
          <div className="text-[9px] text-indigo-400 mt-0.5">장면당 약 10초 소요</div>
        </div>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 2 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        <button type="button" onClick={() => patch({ currentStep: 4 })}
          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm">
          다음: 조립 →
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// STEP E: 조립
// ══════════════════════════════════════════

function StepAssemble({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  const [assembling, setAssembling] = useState(false);
  const [addBgm, setAddBgm] = useState(true);
  const [bgmMood, setBgmMood] = useState('calm');
  const [bgmVolume, setBgmVolume] = useState(15);
  const [phase, setPhase] = useState('');

  const hasImages = state.scenes.some(s => !!s.imageUrl);

  const runAssemble = async () => {
    setAssembling(true);
    patch({ isProcessing: true });

    try {
      // 장면별 이미지 + 타임스탬프
      setPhase('영상 클립을 생성하고 있습니다...');
      const sceneImages = state.scenes.map(s => ({
        scene_number: s.sceneNumber,
        image_url: s.imageUrl || '',
        duration: s.endTime - s.startTime,
      })).filter(s => !!s.image_url);

      if (sceneImages.length === 0) {
        throw new Error('이미지가 없습니다. STEP D에서 이미지를 먼저 생성해주세요.');
      }

      setPhase('영상을 조립하고 있습니다...');
      const res = await fetch('/api/video/ai-assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_images: sceneImages,
          audio_url: state.audioUrl,
          add_bgm: addBgm,
          bgm_mood: bgmMood,
          bgm_volume: bgmVolume,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '조립 실패' }));
        throw new Error(d.error);
      }

      const blob = await res.blob();
      patch({ resultUrl: URL.createObjectURL(blob), currentStep: 5 });

    } catch (err) {
      setPhase(err instanceof Error ? err.message : '조립 실패');
    } finally {
      setAssembling(false);
      patch({ isProcessing: false });
    }
  };

  return (
    <div className="space-y-5">
      <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div className="text-sm font-bold text-slate-700">🎬 최종 조립 옵션</div>
        <div className="text-xs text-slate-500">
          대본 {state.scenes.length}장면 · {state.duration}초 · {VIDEO_STYLES.find(s => s.id === state.styleId)?.name}
        </div>

        {/* BGM 옵션 */}
        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
          <div>
            <div className="text-xs font-bold text-slate-700">BGM 추가</div>
            <div className="text-[9px] text-slate-400">{bgmMood} · 볼륨 {bgmVolume}%</div>
          </div>
          <button type="button" onClick={() => setAddBgm(!addBgm)}
            className={`w-10 h-5 rounded-full transition-colors ${addBgm ? 'bg-indigo-600' : 'bg-slate-300'}`}>
            <span className={`block w-4 h-4 bg-white rounded-full shadow ml-0.5 transition-transform ${addBgm ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {!hasImages && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-bold">
            이미지가 생성되지 않았습니다. STEP D에서 이미지를 먼저 생성해주세요.
          </div>
        )}
      </div>

      {assembling && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-center space-y-2">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-bold text-indigo-700">{phase || '조립 중...'}</div>
          <div className="text-[9px] text-indigo-400">장면 수에 따라 1~3분 소요될 수 있습니다</div>
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 3 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        <button type="button" onClick={runAssemble} disabled={assembling || !hasImages}
          className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black rounded-xl disabled:opacity-40 text-sm shadow-lg flex items-center justify-center gap-2">
          {assembling ? '조립 중...' : '🎬 쇼츠 조립 시작'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// 완성
// ══════════════════════════════════════════

function StepComplete({ state, onBack }: { state: AiShortsState; onBack: () => void }) {
  const handleDownload = () => {
    if (!state.resultUrl) return;
    const a = document.createElement('a');
    a.href = state.resultUrl;
    a.download = `ai_shorts_${Date.now()}.mp4`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="text-center py-4">
        <div className="text-4xl mb-2">🎬</div>
        <h2 className="text-xl font-black text-slate-900">AI 쇼츠 완성!</h2>
        <p className="text-sm text-slate-500 mt-1">{state.scenes.length}장면 · {state.duration}초</p>
      </div>

      {/* 영상 미리보기 */}
      {state.resultUrl && (
        <div className="flex justify-center">
          <div className="rounded-2xl overflow-hidden bg-black shadow-xl" style={{ maxWidth: '220px' }}>
            <video controls src={state.resultUrl} className="w-full" style={{ aspectRatio: '9/16' }} />
          </div>
        </div>
      )}

      {/* 처리 요약 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <div className="text-xs font-bold text-slate-700 mb-1">처리 요약</div>
        <div className="text-[10px] text-slate-500 space-y-1">
          <div>✅ 대본: {state.scenes.length}장면 ({state.tone})</div>
          <div>✅ 스타일: {VIDEO_STYLES.find(s => s.id === state.styleId)?.name}</div>
          <div>{state.audioUrl ? '✅' : '⏭️'} 나레이션: {state.voiceName}</div>
          <div>{state.scenes.some(s => s.imageUrl) ? '✅' : '⏭️'} 이미지: {state.scenes.filter(s => s.imageUrl).length}장</div>
          <div>{state.resultUrl ? '✅' : '⏭️'} 영상 조립</div>
        </div>
      </div>

      {/* 다운로드 */}
      <div className="flex gap-3">
        {state.resultUrl && (
          <button type="button" onClick={handleDownload}
            className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black rounded-xl shadow-lg text-sm flex items-center justify-center gap-2">
            📥 영상 다운로드
          </button>
        )}
      </div>

      {/* 개별 수정 */}
      <div className="flex flex-wrap gap-2">
        {[
          { step: 0, label: '대본 수정' },
          { step: 1, label: '스타일 변경' },
          { step: 2, label: '목소리 변경' },
          { step: 3, label: '이미지 재생성' },
        ].map(s => (
          <button key={s.step} type="button" onClick={() => onBack()}
            className="px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-indigo-50 hover:text-indigo-700">
            {s.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={onBack}
        className="w-full py-3 bg-slate-50 text-slate-600 font-bold rounded-xl hover:bg-slate-100 text-sm border border-slate-200">
        📱 새로 만들기
      </button>
    </div>
  );
}
