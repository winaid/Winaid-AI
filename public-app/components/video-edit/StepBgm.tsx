'use client';

import { useMemo } from 'react';
import type { PipelineState, StepBgmState, BgmMoodOption } from './types';
import { BGM_LIBRARY, BGM_MOOD_LABELS, getBgmByMood, getRandomBgm, type BgmMood } from '../../lib/sfxLibrary';

const MOOD_OPTIONS: { id: BgmMoodOption; label: string; desc: string }[] = [
  { id: 'bright', label: '밝고 경쾌한', desc: '우쿨렐레, 휘파람' },
  { id: 'calm', label: '차분하고 신뢰감', desc: '병원 영상 추천' },
  { id: 'emotional', label: '감성적인', desc: '피아노, 첼로' },
  { id: 'trendy', label: '트렌디/힙한', desc: '로파이, 일렉트로닉' },
  { id: 'corporate', label: '기업/전문적', desc: '프레젠테이션' },
  { id: 'skip', label: '스킵', desc: 'BGM 없이 진행' },
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
  const { step5_bgm: bgm } = state;
  const hasResult = !!bgm.resultBlobUrl || bgm.mood === 'skip' || !bgm.enabled;

  // 선택된 분위기의 BGM 목록
  const bgmList = useMemo(() => {
    if (bgm.mood === 'skip') return [];
    return getBgmByMood(bgm.mood as BgmMood);
  }, [bgm.mood]);

  // 선택된 BGM 이름
  const selectedBgm = bgmList.find(b => b.id === bgm.bgmId) || bgmList[0];

  // 랜덤 선택
  const handleRandom = () => {
    if (bgm.mood === 'skip') return;
    const rand = getRandomBgm(bgm.mood as BgmMood);
    if (rand) onUpdate({ bgmId: rand.id });
  };

  // 분위기 변경 시 첫 번째 BGM 자동 선택
  const handleMoodChange = (mood: BgmMoodOption) => {
    onUpdate({ mood });
    if (mood !== 'skip') {
      const list = getBgmByMood(mood as BgmMood);
      if (list.length > 0) onUpdate({ mood, bgmId: list[0].id });
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
            <span>✅</span> BGM 삽입 완료 — {selectedBgm?.name || 'BGM'} (볼륨 {bgm.volume}%)
          </div>
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          {/* 분위기 선택 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">BGM 분위기</label>
            <div className="grid grid-cols-2 gap-2">
              {MOOD_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => handleMoodChange(opt.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${bgm.mood === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${bgm.mood === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {opt.id === 'skip' ? '⏭ ' : '🎶 '}{opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {bgm.mood !== 'skip' && (
            <>
              {/* BGM 목록 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-500">BGM 선택</label>
                  <button type="button" onClick={handleRandom}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800">
                    🎲 랜덤
                  </button>
                </div>
                <div className="space-y-1.5">
                  {bgmList.map(b => (
                    <button key={b.id} type="button" onClick={() => onUpdate({ bgmId: b.id })}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all ${bgm.bgmId === b.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${bgm.bgmId === b.id ? 'border-blue-500' : 'border-slate-300'}`}>
                        {bgm.bgmId === b.id && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                      </span>
                      <span className={`text-sm font-bold ${bgm.bgmId === b.id ? 'text-blue-700' : 'text-slate-700'}`}>{b.name}</span>
                      <span className="text-[9px] text-slate-400 ml-auto">{b.tags.slice(0, 3).join(', ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 볼륨 슬라이더 */}
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
            </>
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
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '🎶 BGM 삽입'}
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
