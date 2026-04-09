'use client';

import { useState } from 'react';
import { validateMedicalAd, countViolations } from '../../lib/medicalAdValidation';
import { downloadSrt, type SrtSegment } from '../../lib/srtUtils';
import type { PipelineState, StepSubtitleState, SubtitleStyle, SubtitlePosition, SubtitleSegment } from './types';

const STYLE_OPTIONS: { id: SubtitleStyle; label: string; desc: string }[] = [
  { id: 'basic', label: '기본', desc: '깔끔한 하단 자막' },
  { id: 'highlight', label: '강조', desc: '단어별 하이라이트 — 쇼츠 추천' },
  { id: 'single_line', label: '한줄씩', desc: '한 문장씩 중앙 표시' },
  { id: 'skip', label: '스킵', desc: '이 단계 건너뛰기' },
];

const POSITION_OPTIONS: { id: SubtitlePosition; label: string }[] = [
  { id: 'top', label: '상단' },
  { id: 'center', label: '중앙' },
  { id: 'bottom', label: '하단' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepSubtitleState>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepSubtitle({ state, onUpdate, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step3_subtitle: sub } = state;
  const hasResult = !!sub.subtitles || sub.style === 'skip' || !sub.enabled;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // 자막 텍스트 편집
  const updateSubtitleText = (idx: number, text: string) => {
    if (!sub.subtitles) return;
    const updated = sub.subtitles.map((s, i) => {
      if (i !== idx) return s;
      const violations = validateMedicalAd(text);
      return { ...s, text, violations };
    });
    const allV = updated.flatMap(s => s.violations) as Array<{ severity: 'high' | 'medium' }>;
    const counts = countViolations(allV as never[]);
    onUpdate({ subtitles: updated, highViolations: counts.high, mediumViolations: counts.medium });
  };

  // SRT 다운로드
  const handleDownloadSrt = () => {
    if (!sub.subtitles) return;
    const srtSegs: SrtSegment[] = sub.subtitles.map(s => ({ start_time: s.start_time, end_time: s.end_time, text: s.text }));
    const name = state.fileInfo?.name.replace(/\.[^.]+$/, '') || 'subtitles';
    downloadSrt(srtSegs, name);
  };

  return (
    <div className="space-y-6">
      {/* 스킵 */}
      {sub.style === 'skip' && !sub.subtitles && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">이 단계를 건너뛰었습니다.</div>
        </div>
      )}

      {/* 결과: 자막 타임라인 */}
      {sub.subtitles && sub.subtitles.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 자막 생성 완료
            </div>
          </div>

          {/* 통계 */}
          <div className="flex gap-3">
            <div className="flex-1 bg-slate-50 rounded-xl p-2.5 text-center">
              <div className="text-[10px] text-slate-500">자막</div>
              <div className="text-sm font-bold text-slate-800">{sub.subtitles.length}개</div>
            </div>
            {(sub.highViolations || 0) > 0 && (
              <div className="flex-1 bg-red-50 rounded-xl p-2.5 text-center">
                <div className="text-[10px] text-red-600">위반</div>
                <div className="text-sm font-bold text-red-700">{sub.highViolations}건</div>
              </div>
            )}
            {(sub.mediumViolations || 0) > 0 && (
              <div className="flex-1 bg-amber-50 rounded-xl p-2.5 text-center">
                <div className="text-[10px] text-amber-600">주의</div>
                <div className="text-sm font-bold text-amber-700">{sub.mediumViolations}건</div>
              </div>
            )}
          </div>

          {/* 자막 목록 */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">자막 타임라인</span>
              <button type="button" onClick={handleDownloadSrt}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800">
                📥 SRT 다운로드
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-50">
              {sub.subtitles.map((seg, idx) => {
                const isEditing = editingIdx === idx;
                const hasHigh = seg.violations.some(v => v.severity === 'high');
                const hasMed = seg.violations.some(v => v.severity === 'medium');
                return (
                  <div key={idx} className={`px-4 py-2.5 ${hasHigh ? 'bg-red-50/50' : hasMed ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-start gap-2">
                      <div className="text-[9px] text-slate-400 font-mono pt-0.5 min-w-[70px]">
                        {fmtTime(seg.start_time)}–{fmtTime(seg.end_time)}
                      </div>
                      <div className="flex-1">
                        {isEditing ? (
                          <input type="text" value={seg.text} autoFocus
                            onChange={e => updateSubtitleText(idx, e.target.value)}
                            onBlur={() => setEditingIdx(null)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditingIdx(null); }}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-lg outline-none" />
                        ) : (
                          <div onClick={() => setEditingIdx(idx)} className="text-xs text-slate-800 cursor-text hover:bg-blue-50 rounded px-1 -mx-1">
                            {seg.text}
                          </div>
                        )}
                        {seg.violations.length > 0 && !isEditing && (
                          <div className="mt-1 space-y-0.5">
                            {seg.violations.map((v, vi) => (
                              <div key={vi} className={`text-[9px] ${v.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`}>
                                {v.severity === 'high' ? '⛔' : '⚠️'} &apos;{v.keyword}&apos; → {v.suggestion}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          {/* 스타일 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">자막 스타일</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ style: opt.id })}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${sub.style === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${sub.style === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {opt.id === 'skip' ? '⏭ ' : ''}{opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {sub.style !== 'skip' && (
            <>
              {/* 위치 */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500">자막 위치</label>
                <div className="flex gap-2">
                  {POSITION_OPTIONS.map(opt => (
                    <button key={opt.id} type="button" onClick={() => onUpdate({ position: opt.id })}
                      className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${sub.position === opt.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 토글들 */}
              <div className="space-y-3">
                <ToggleOption label="치과 용어 자동 인식" desc="임플란트, 지르코니아 등 정확 인식"
                  value={sub.dentalTerms} onChange={v => onUpdate({ dentalTerms: v })} />
                <ToggleOption label="의료광고법 검증" desc="위반 키워드 자동 감지 + 대체 표현 제안"
                  value={sub.medicalCheck} onChange={v => onUpdate({ medicalCheck: v })} />
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
        {!hasResult && sub.style !== 'skip' ? (
          <button type="button" onClick={onProcess} disabled={isProcessing}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '💬 자막 생성'}
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

// ── 토글 컴포넌트 ──
function ToggleOption({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
      <div>
        <div className="text-sm font-bold text-slate-700">{label}</div>
        <div className="text-[10px] text-slate-500">{desc}</div>
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
