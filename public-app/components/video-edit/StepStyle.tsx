'use client';

import type { PipelineState, StepStyleState } from './types';
import { getStylesByCategory, getStyleById, type VideoStyle } from '../../lib/videoStyles';
import VideoPlayer from './VideoPlayer';

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepStyleState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepStyle({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step2_style: style } = state;
  const isOriginal = style.styleId === 'original';
  const hasResult = !!style.resultBlobUrl || isOriginal;
  const selectedStyle = getStyleById(style.styleId);
  const groups = getStylesByCategory();

  // 음성 파일이면 자동 스킵
  if (state.fileInfo?.isAudio) {
    return (
      <div className="space-y-6">
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
          <div className="text-2xl mb-2">✅</div>
          <div className="text-sm font-bold text-emerald-700">음성 파일이므로 스타일 변환을 건너뜁니다.</div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onPrev} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">← 이전</button>
          <button type="button" onClick={onNext} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">다음 단계 →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 결과 */}
      {style.resultBlobUrl && (
        <div className="space-y-3">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 스타일 변환 완료 — {selectedStyle?.name}
            </div>
          </div>
          <VideoPlayer src={style.resultBlobUrl} compact />
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.label} className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500">{group.label}</label>
              <div className="grid grid-cols-3 gap-2">
                {group.styles.map(s => {
                  const selected = style.styleId === s.id;
                  return (
                    <button key={s.id} type="button" onClick={() => onUpdate({ styleId: s.id })}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
                      }`}>
                      {/* 썸네일 플레이스홀더 */}
                      <div className={`w-full aspect-video rounded-lg mb-1.5 flex items-center justify-center text-lg ${
                        selected ? 'bg-blue-100' : 'bg-slate-100'
                      }`}>
                        {s.category === 'original' ? '📷' :
                         s.category === 'cartoon' ? '🎨' :
                         s.category === 'illustration' ? '✏️' :
                         s.category === '3d' ? '🎮' :
                         s.category === 'mood' ? '✨' : '🏥'}
                      </div>
                      <div className={`text-[11px] font-bold ${selected ? 'text-blue-700' : 'text-slate-700'}`}>
                        {s.name}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{s.description}</div>
                      {s.processingTime && s.id !== 'original' && (
                        <div className="text-[8px] text-slate-400 mt-0.5">{s.processingTime}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 스킵(원본) 상태 */}
      {isOriginal && !style.resultBlobUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">"실사 그대로" 선택 — 스타일 변환을 건너뜁니다.</div>
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev}
          className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
          ← 이전
        </button>
        {!hasResult && !isOriginal ? (
          <button type="button" onClick={onProcess}
            disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) :
             `🎨 스타일 변환 (${selectedStyle?.processingTime || ''})`}
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
