'use client';

import type { PipelineState, StepThumbnailState, ThumbnailTextColor, ThumbnailTextPosition } from './types';

const COLOR_OPTIONS: { id: ThumbnailTextColor; label: string; cls: string }[] = [
  { id: 'white', label: '흰색', cls: 'bg-white border-2 border-slate-300' },
  { id: 'yellow', label: '노랑', cls: 'bg-yellow-400' },
  { id: 'red', label: '빨강', cls: 'bg-red-500' },
];

const POSITION_OPTIONS: { id: ThumbnailTextPosition; label: string }[] = [
  { id: 'top', label: '상단' },
  { id: 'center', label: '중앙' },
  { id: 'bottom', label: '하단' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepThumbnailState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepThumbnail({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step9_thumbnail: thumb } = state;
  const hasResult = !!thumb.thumbnailUrl;

  return (
    <div className="space-y-6">
      {/* 결과 */}
      {thumb.thumbnailUrl && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 썸네일 생성 완료
            </div>
          </div>
          <div className="flex justify-center">
            <div className="rounded-xl overflow-hidden shadow-lg" style={{ maxWidth: '280px' }}>
              <img src={thumb.thumbnailUrl} alt="썸네일" className="w-full" style={{ aspectRatio: '9/16' }} />
            </div>
          </div>
          {thumb.text && (
            <div className="text-center text-xs text-slate-500">
              텍스트: &quot;{thumb.text}&quot;
            </div>
          )}
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          {/* 썸네일 텍스트 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">썸네일 텍스트</label>
            <input type="text" value={thumb.text || ''} placeholder="비우면 AI가 자동 생성"
              onChange={e => onUpdate({ text: e.target.value })}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-blue-400" />

            {/* AI 추천 텍스트 */}
            {thumb.textSuggestions && thumb.textSuggestions.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400">AI 추천:</div>
                {thumb.textSuggestions.map((s, i) => (
                  <button key={i} type="button" onClick={() => onUpdate({ text: s })}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-all">
                    &quot;{s}&quot;
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 텍스트 색상 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">텍스트 색상</label>
            <div className="flex gap-3">
              {COLOR_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ textColor: opt.id })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${thumb.textColor === opt.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <span className={`w-4 h-4 rounded-full ${opt.cls}`} />
                  <span className="text-xs font-bold text-slate-700">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 텍스트 위치 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">텍스트 위치</label>
            <div className="flex gap-2">
              {POSITION_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ textPosition: opt.id })}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${thumb.textPosition === opt.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 스킵 옵션 */}
          <button type="button" onClick={onNext}
            className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-all">
            ⏭ 썸네일 없이 건너뛰기
          </button>
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm">← 이전</button>
        {!hasResult ? (
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '🖼️ 썸네일 생성'}
          </button>
        ) : (
          <button type="button" onClick={onNext}
            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-xl shadow-lg text-sm">
            🎬 완성 화면 보기
          </button>
        )}
      </div>
    </div>
  );
}
