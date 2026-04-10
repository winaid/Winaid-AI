'use client';

import type { PipelineState, StepZoomState, ZoomIntensity, ZoomPoint } from './types';
import VideoPlayer from './VideoPlayer';

const INTENSITY_OPTIONS: { id: ZoomIntensity; label: string; desc: string }[] = [
  { id: 'auto', label: '자동', desc: 'AI가 강조 포인트에 줌' },
  { id: 'strong', label: '강하게', desc: '더 자주, 더 크게' },
  { id: 'subtle', label: '약하게', desc: '살짝만 부드럽게' },
  { id: 'skip', label: '스킵', desc: '이 단계 건너뛰기' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepZoomState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepZoom({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step6_zoom: zoom } = state;
  const hasResult = !!zoom.zoomPoints || zoom.intensity === 'skip' || !zoom.enabled;

  // 음성 파일이면 스킵
  if (state.fileInfo?.isAudio) {
    return (
      <div className="space-y-6">
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
          <div className="text-2xl mb-2">✅</div>
          <div className="text-sm font-bold text-emerald-700">음성 파일이므로 줌 효과를 건너뜁니다.</div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onPrev} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm">← 이전</button>
          <button type="button" onClick={onNext} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 text-sm">다음 단계 →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 스킵 */}
      {zoom.intensity === 'skip' && !zoom.zoomPoints && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">줌 효과를 건너뛰었습니다.</div>
        </div>
      )}

      {/* 결과: 줌 포인트 목록 */}
      {zoom.zoomPoints && zoom.zoomPoints.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 줌 효과 {zoom.zoomPoints.length}개 배치 완료
            </div>
          </div>

          {/* 미리보기 */}
          {zoom.resultBlobUrl && <VideoPlayer src={zoom.resultBlobUrl} compact />}

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">줌 포인트</span>
            </div>
            <div className="max-h-[250px] overflow-y-auto divide-y divide-slate-50">
              {zoom.zoomPoints.map((zp, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="text-[9px] text-slate-400 font-mono min-w-[40px]">
                    {fmtTime(zp.start_time)}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-800">
                      {zp.type === 'emphasis' ? '🔍 줌인' : zp.type === 'transition' ? '🔭 줌아웃' : zp.type === 'question' ? '❓ 줌인' : '📌 줌 유지'}
                    </div>
                    <div className="text-[9px] text-slate-400">×{zp.zoom_level.toFixed(2)}</div>
                  </div>
                  <button type="button"
                    onClick={() => {
                      if (!zoom.zoomPoints) return;
                      onUpdate({ zoomPoints: zoom.zoomPoints.filter((_, i) => i !== idx) });
                    }}
                    className="px-2 py-1 text-[9px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">줌 강도</label>
            <div className="grid grid-cols-2 gap-2">
              {INTENSITY_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ intensity: opt.id })}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all ${zoom.intensity === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${zoom.intensity === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {opt.id === 'skip' ? '⏭ ' : '🔍 '}{opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {zoom.intensity !== 'skip' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500">
                줌 배율: ×{zoom.zoomLevel.toFixed(2)}
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-400">×1.0</span>
                <input type="range" min={1.0} max={1.3} step={0.05} value={zoom.zoomLevel}
                  onChange={e => onUpdate({ zoomLevel: parseFloat(e.target.value) })}
                  className="flex-1 accent-blue-500" />
                <span className="text-[10px] text-slate-400">×1.3</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm">← 이전</button>
        {!hasResult && zoom.intensity !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '🔍 줌 효과 적용'}
          </button>
        ) : (
          <button type="button" onClick={onNext} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 text-sm">다음 단계 →</button>
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
