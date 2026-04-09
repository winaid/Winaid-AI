'use client';

import { useState } from 'react';
import {
  type AiShortsState, type ScriptScene, type AiInputType, type AiTone, type AiDuration,
  AI_STEP_LABELS, INITIAL_AI_SHORTS_STATE,
} from './types';
import { validateMedicalAd } from '../../lib/medicalAdValidation';
import { getStylesByCategory, VIDEO_STYLES } from '../../lib/videoStyles';

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
                    onBlur={() => setEditingIdx(null)}
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

const VOICE_OPTIONS = [
  { id: 'ko-KR-Wavenet-A', label: '자연스러운 여성', gender: '여' },
  { id: 'ko-KR-Wavenet-B', label: '자연스러운 남성', gender: '남' },
  { id: 'ko-KR-Standard-A', label: '차분한 여성', gender: '여' },
  { id: 'ko-KR-Standard-B', label: '밝은 여성', gender: '여' },
  { id: 'ko-KR-Standard-C', label: '차분한 남성', gender: '남' },
  { id: 'ko-KR-Standard-D', label: '밝은 남성', gender: '남' },
];

function StepVoice({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-500">목소리 선택</label>
        <div className="space-y-1.5">
          {VOICE_OPTIONS.map(v => (
            <button key={v.id} type="button" onClick={() => patch({ voiceName: v.id })}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${state.voiceName === v.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${state.voiceName === v.id ? 'border-indigo-500' : 'border-slate-300'}`}>
                {state.voiceName === v.id && <span className="w-2 h-2 bg-indigo-500 rounded-full" />}
              </span>
              <span className={`text-sm font-bold ${state.voiceName === v.id ? 'text-indigo-700' : 'text-slate-700'}`}>{v.label}</span>
              <span className="text-[9px] text-slate-400 ml-auto">{v.gender}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-500">속도: ×{state.voiceSpeed.toFixed(1)}</label>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400">느리게</span>
          <input type="range" min={0.8} max={1.2} step={0.1} value={state.voiceSpeed}
            onChange={e => patch({ voiceSpeed: parseFloat(e.target.value) })} className="flex-1 accent-indigo-500" />
          <span className="text-[10px] text-slate-400">빠르게</span>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 1 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        <button type="button" onClick={() => patch({ currentStep: 3 })} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm">다음: 이미지 →</button>
      </div>
      <p className="text-[10px] text-center text-slate-400">TTS 미리듣기 — 곧 지원 예정</p>
    </div>
  );
}

// ══════════════════════════════════════════
// STEP D: 이미지 생성
// ══════════════════════════════════════════

function StepImages({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  return (
    <div className="space-y-5">
      <div className="text-xs font-semibold text-slate-500">장면별 이미지 ({state.scenes.length}장면)</div>
      <div className="space-y-3">
        {state.scenes.map((scene, idx) => (
          <div key={idx} className="flex gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
              {scene.imageUrl ? <img src={scene.imageUrl} alt="" className="w-full h-full object-cover rounded-lg" /> : '🖼️'}
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-indigo-500 font-bold">장면 {scene.sceneNumber}</div>
              <div className="text-xs text-slate-700 mt-0.5">{scene.narration.slice(0, 40)}...</div>
              <div className="text-[9px] text-slate-400 mt-1">{scene.imagePrompt.slice(0, 50)}...</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-center text-amber-500 font-bold">이미지 AI 생성 — 곧 지원 예정. 지금은 플레이스홀더로 진행됩니다.</p>
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 2 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        <button type="button" onClick={() => patch({ currentStep: 4 })} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm">다음: 조립 →</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// STEP E: 조립
// ══════════════════════════════════════════

function StepAssemble({ state, patch }: { state: AiShortsState; patch: (p: Partial<AiShortsState>) => void }) {
  return (
    <div className="space-y-5">
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
        <div className="text-3xl">🎬</div>
        <div className="text-sm font-bold text-slate-700">영상 조립 준비</div>
        <div className="text-xs text-slate-500">대본 {state.scenes.length}장면 · {state.duration}초 · {VIDEO_STYLES.find(s => s.id === state.styleId)?.name}</div>
        <p className="text-[10px] text-amber-500 font-bold">영상 조립 — 곧 지원 예정. TTS + 이미지 + 자막 합성이 필요합니다.</p>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ currentStep: 3 })} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">← 이전</button>
        <button type="button" onClick={() => patch({ currentStep: 5 })} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black rounded-xl text-sm shadow-lg">🎬 완성 보기</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// 완성
// ══════════════════════════════════════════

function StepComplete({ state, onBack }: { state: AiShortsState; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div className="text-center py-4">
        <div className="text-4xl mb-2">🎬</div>
        <h2 className="text-xl font-black text-slate-900">AI 쇼츠 대본 완성!</h2>
        <p className="text-sm text-slate-500 mt-1">{state.scenes.length}장면 · {state.duration}초</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        {state.scenes.map((scene, idx) => (
          <div key={idx} className="flex gap-2 text-xs">
            <span className="text-indigo-500 font-bold min-w-[40px]">[{scene.sceneNumber}]</span>
            <span className="text-slate-700">{scene.narration}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-center text-slate-400">
        TTS 음성 생성, 이미지 생성, 영상 조립은 다음 업데이트에서 지원됩니다.<br />
        현재는 대본 생성까지 사용할 수 있습니다.
      </p>

      <button type="button" onClick={onBack}
        className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm">
        📱 처음으로 돌아가기
      </button>
    </div>
  );
}
