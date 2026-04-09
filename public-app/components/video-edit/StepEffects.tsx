'use client';

import type { PipelineState, StepEffectsState, EffectsStyle, SoundEffect } from './types';
import { SFX_CATEGORY_LABELS, getRandomSfx, type SfxCategory } from '../../lib/sfxLibrary';

const STYLE_OPTIONS: { id: EffectsStyle; label: string; desc: string }[] = [
  { id: 'shorts', label: '쇼츠/릴스', desc: '빠른 전환, 강조 효과음' },
  { id: 'vlog', label: '브이로그', desc: '자연스러운 전환' },
  { id: 'explanation', label: '설명 영상', desc: '포인트 강조' },
  { id: 'interview', label: '인터뷰', desc: '최소한의 효과음' },
  { id: 'skip', label: '스킵', desc: '이 단계 건너뛰기' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepEffectsState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepEffects({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step4_effects: fx } = state;
  const hasResult = !!fx.effects || fx.style === 'skip' || !fx.enabled;

  // 효과음 교체 (같은 카테고리 내 랜덤)
  const replaceEffect = (idx: number) => {
    if (!fx.effects) return;
    const eff = fx.effects[idx];
    const replacement = getRandomSfx(eff.category as SfxCategory);
    if (!replacement || replacement.id === eff.sfxId) return;
    const updated = fx.effects.map((e, i) =>
      i === idx ? { ...e, sfxId: replacement.id, sfxName: replacement.name, sfxPath: replacement.path } : e
    );
    onUpdate({ effects: updated });
  };

  // 효과음 삭제
  const removeEffect = (idx: number) => {
    if (!fx.effects) return;
    onUpdate({ effects: fx.effects.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      {/* 스킵 */}
      {fx.style === 'skip' && !fx.effects && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">이 단계를 건너뛰었습니다.</div>
        </div>
      )}

      {/* 결과: 효과음 목록 */}
      {fx.effects && fx.effects.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <span>✅</span> 효과음 {fx.effects.length}개 배치 완료
              </div>
            </div>
          </div>

          {/* 효과음 리스트 */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">효과음 타임라인</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-50">
              {fx.effects.map((eff, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="text-[9px] text-slate-400 font-mono min-w-[40px]">
                    {fmtTime(eff.time)}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-800">{eff.sfxName}</div>
                    <div className="text-[9px] text-slate-400">{eff.reason}</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => replaceEffect(idx)}
                      className="px-2 py-1 text-[9px] font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                      🔄
                    </button>
                    <button type="button" onClick={() => removeEffect(idx)}
                      className="px-2 py-1 text-[9px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {fx.effects && fx.effects.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
          <div className="text-sm text-amber-600">배치할 효과음이 없습니다. 밀도를 높이거나 다른 스타일을 시도해보세요.</div>
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          {/* 스타일 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">효과음 스타일</label>
            <div className="space-y-2">
              {STYLE_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ style: opt.id })}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all ${fx.style === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${fx.style === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {opt.id === 'skip' ? '⏭ ' : ''}{opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 밀도 슬라이더 */}
          {fx.style !== 'skip' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500">
                효과음 밀도: {['', '적게', '조금', '보통', '많이', '최대'][fx.density]}
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-400">적게</span>
                <input type="range" min={1} max={5} step={1} value={fx.density}
                  onChange={e => onUpdate({ density: parseInt(e.target.value) })}
                  className="flex-1 accent-blue-500" />
                <span className="text-[10px] text-slate-400">많이</span>
              </div>
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
        {!hasResult && fx.style !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '🎵 효과음 배치'}
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

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
