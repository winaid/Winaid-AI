'use client';

import {
  type PipelineState, STEP_LABELS,
  isStepDone, isStepSkipped, getInputForStep,
} from './types';
import { downloadSrt, type SrtSegment } from '../../lib/srtUtils';
import VideoPlayer from './VideoPlayer';

interface Props {
  state: PipelineState;
  onGoStep: (step: number) => void;
  onReset: () => void;
}

export default function CompletionScreen({ state, onGoStep, onReset }: Props) {
  // 최종 결과 URL — 가장 마지막 단계의 결과
  const finalUrl = getFinalResultUrl(state);

  // 통계 수집
  const stats = buildStats(state);

  // SRT 다운로드
  const handleSrtDownload = () => {
    const subs = state.step4_subtitle.subtitles;
    if (!subs || subs.length === 0) return;
    const segs: SrtSegment[] = subs.map(s => ({ start_time: s.start_time, end_time: s.end_time, text: s.text }));
    downloadSrt(segs, state.fileInfo?.name.replace(/\.[^.]+$/, '') || 'subtitles');
  };

  // 영상 다운로드
  const handleDownload = () => {
    if (!finalUrl) return;
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = `shorts_${state.fileInfo?.name || 'output.mp4'}`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="text-center py-4">
        <div className="text-4xl mb-2">🎬</div>
        <h2 className="text-xl font-black text-slate-900">쇼츠 완성!</h2>
        <p className="text-sm text-slate-500 mt-1">모든 단계가 완료되었습니다</p>
      </div>

      {/* 메인: 미리보기 + 요약 */}
      <div className="flex gap-5 flex-col sm:flex-row">
        {/* 좌: 세로 영상 플레이어 */}
        {finalUrl && (
          <div className="flex-shrink-0 mx-auto sm:mx-0" style={{ width: '220px' }}>
            <VideoPlayer
              src={finalUrl}
              aspectRatio="9/16"
              className="shadow-xl"
            />
          </div>
        )}

        {/* 우: 처리 요약 */}
        <div className="flex-1 space-y-3">
          <div className="text-sm font-bold text-slate-700 mb-2">처리 요약</div>
          {STEP_LABELS.slice(1, 10).map((label, i) => {
            const step = i + 1;
            const done = isStepDone(state, step);
            const skipped = isStepSkipped(state, step);
            const detail = getStepDetail(state, step);
            const hasViolation = step === 3 && (state.step4_subtitle.highViolations || 0) > 0;

            return (
              <div key={step} className={`flex items-start gap-2 p-2 rounded-lg ${hasViolation ? 'bg-red-50' : ''}`}>
                <span className="text-sm mt-0.5">
                  {done ? '✅' : skipped ? '⏭️' : '⬜'}
                </span>
                <div className="flex-1">
                  <div className={`text-xs font-bold ${skipped ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {label}
                  </div>
                  {detail && <div className="text-[10px] text-slate-500">{detail}</div>}
                  {hasViolation && (
                    <button type="button" onClick={() => onGoStep(3)}
                      className="text-[10px] font-bold text-red-600 hover:text-red-800 mt-0.5">
                      ⛔ {state.step4_subtitle.highViolations}건 수정 필요 →
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* 통계 */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            {stats.map(s => (
              <div key={s.label} className="text-[10px]">
                <span className="text-slate-400">{s.label}: </span>
                <span className="font-bold text-slate-700">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 다운로드 버튼 */}
      <div className="flex gap-3 flex-wrap">
        <button type="button" onClick={handleDownload} disabled={!finalUrl}
          className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 transition-all text-sm shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
          📥 영상 다운로드
        </button>
        {state.step4_subtitle.subtitles && state.step4_subtitle.subtitles.length > 0 && (
          <button type="button" onClick={handleSrtDownload}
            className="px-5 py-3.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
            📥 SRT
          </button>
        )}
      </div>

      {/* 개별 수정 */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400">각 단계 개별 수정</div>
        <div className="flex flex-wrap gap-2">
          {STEP_LABELS.slice(1, 10).map((label, i) => {
            const step = i + 1;
            return (
              <button key={step} type="button" onClick={() => onGoStep(step)}
                className="px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-all">
                {label} 수정
              </button>
            );
          })}
        </div>
      </div>

      {/* 새 영상 */}
      <button type="button" onClick={onReset}
        className="w-full py-3 bg-slate-50 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm border border-slate-200">
        📱 새 영상 편집하기
      </button>
    </div>
  );
}

// ── 헬퍼 ──

function getFinalResultUrl(state: PipelineState): string | null {
  // 가장 마지막 완료된 단계의 결과
  const urls = [
    undefined,                              // 0
    state.step1_crop.resultBlobUrl,          // 1
    state.step2_style.resultBlobUrl,         // 2
    state.step3_silence.resultBlobUrl,       // 3
    state.step4_subtitle.resultBlobUrl,      // 4
    state.step5_effects.resultBlobUrl,       // 5
    state.step6_zoom.resultBlobUrl,          // 6
    state.step7_bgm.resultBlobUrl,           // 7
    state.step8_intro.resultBlobUrl,         // 8
    state.step9_thumbnail.thumbnailUrl,      // 9
  ];
  for (let s = 9; s >= 1; s--) {
    if (urls[s]) return urls[s]!;
  }
  // fallback: 원본
  if (state.originalFile) return URL.createObjectURL(state.originalFile);
  return null;
}

function getStepDetail(state: PipelineState, step: number): string {
  switch (step) {
    case 1: {
      if (state.step1_crop.mode === 'skip') return '건너뜀';
      if (!state.step1_crop.resultBlobUrl) return '';
      return `${state.step1_crop.aspect} · ${state.step1_crop.mode === 'face_tracking' ? '얼굴 추적' : '중앙 고정'}`;
    }
    case 2: {
      if (state.step2_style.styleId === 'original') return '건너뜀';
      return state.step2_style.styleId;
    }
    case 3: {
      if (state.step3_silence.intensity === 'skip') return '건너뜀';
      if (!state.step3_silence.resultBlobUrl) return '';
      const pct = state.step3_silence.removedPercent || 0;
      return `${state.step3_silence.intensity} · ${pct}% 단축`;
    }
    case 4: {
      if (state.step4_subtitle.style === 'skip') return '건너뜀';
      const count = state.step4_subtitle.subtitles?.length || 0;
      if (count === 0) return '';
      return `${state.step4_subtitle.style} · ${count}개 자막`;
    }
    case 5: {
      if (state.step5_effects.style === 'skip') return '건너뜀';
      const count = state.step5_effects.effects?.length || 0;
      if (count === 0) return '';
      return `${state.step5_effects.style} · ${count}개 효과음`;
    }
    case 6: return !state.step6_zoom.enabled ? '건너뜀' : '';
    case 7: {
      if (state.step7_bgm.mood === 'skip') return '건너뜀';
      if (!state.step7_bgm.resultBlobUrl) return '';
      return `${state.step7_bgm.mood} · 볼륨 ${state.step7_bgm.volume}%`;
    }
    case 8: {
      if (state.step8_intro.introStyle === 'none' && state.step8_intro.outroStyle === 'none') return '건너뜀';
      const parts: string[] = [];
      if (state.step8_intro.introStyle !== 'none') parts.push(`인트로(${state.step8_intro.introStyle})`);
      if (state.step8_intro.outroStyle !== 'none') parts.push(`아웃로(${state.step8_intro.outroStyle})`);
      return parts.join(' + ');
    }
    case 9: return !state.step9_thumbnail.enabled ? '건너뜀' : '';
    default: return '';
  }
}

function buildStats(state: PipelineState): Array<{ label: string; value: string }> {
  const stats: Array<{ label: string; value: string }> = [];

  if (state.fileInfo) {
    const origDur = state.fileInfo.duration;
    const resultDur = state.step3_silence.resultDuration || origDur;
    stats.push({ label: '원본 길이', value: fmtDur(origDur) });
    stats.push({ label: '결과 길이', value: fmtDur(resultDur) });
    if (state.fileInfo.width && state.fileInfo.height) {
      stats.push({ label: '원본 해상도', value: `${state.fileInfo.width}×${state.fileInfo.height}` });
    }
  }

  const subCount = state.step4_subtitle.subtitles?.length || 0;
  if (subCount > 0) stats.push({ label: '자막', value: `${subCount}개` });

  const fxCount = state.step5_effects.effects?.length || 0;
  if (fxCount > 0) stats.push({ label: '효과음', value: `${fxCount}개` });

  const violations = (state.step4_subtitle.highViolations || 0) + (state.step4_subtitle.mediumViolations || 0);
  if (violations > 0) stats.push({ label: '의료법 경고', value: `${violations}건` });

  return stats;
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
