'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  const { step4_subtitle: sub } = state;
  const hasResult = !!sub.subtitles || sub.style === 'skip' || !sub.enabled;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const movingRef = useRef(false); // Enter로 이동 중인지 추적
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // 자막 변경 래퍼 — violations 재검증 + 위반 집계 + 부모 state 반영
  // (훅은 pure한 조작만 하고, 검증은 여기서 한 번에 처리)
  const handleSubtitlesChange = useCallback((next: SubtitleSegment[]) => {
    const revalidated = next.map(s => ({
      ...s,
      violations: validateMedicalAd(s.text),
    }));
    const allV = revalidated.flatMap(s => s.violations) as Array<{ severity: 'high' | 'medium' }>;
    const counts = countViolations(allV as never[]);
    onUpdate({
      subtitles: revalidated,
      highViolations: counts.high,
      mediumViolations: counts.medium,
    });
  }, [onUpdate]);

  const editor = useSubtitleEditor(sub.subtitles, handleSubtitlesChange);

  // 특정 자막 textarea로 포커스 + 커서 위치 지정
  const focusSubtitle = useCallback((index: number, cursorPos: number) => {
    const ta = textareaRefs.current[index];
    if (ta) {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    }
  }, []);

  // textarea 키보드 이벤트 — 분할/병합/포커스 이동
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    if (!sub.subtitles) return;
    const ta = e.currentTarget;
    const cursorPos = ta.selectionStart;
    const text = ta.value;

    // Enter → 커서 위치에서 분할 (커서가 양 끝이면 다음 자막으로 포커스 이동)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (cursorPos > 0 && cursorPos < text.length) {
        editor.splitSubtitle(idx, cursorPos, text.length);
        movingRef.current = true;
        requestAnimationFrame(() => {
          setEditingIdx(idx + 1);
          requestAnimationFrame(() => focusSubtitle(idx + 1, 0));
        });
      } else if (idx < sub.subtitles.length - 1) {
        movingRef.current = true;
        setEditingIdx(idx + 1);
      } else {
        setEditingIdx(null);
      }
      return;
    }

    // Backspace (맨 앞) → 이전 자막과 병합
    if (e.key === 'Backspace' && cursorPos === 0 && ta.selectionEnd === 0 && idx > 0) {
      e.preventDefault();
      const prevTextLength = sub.subtitles[idx - 1].text.length;
      editor.mergeWithPrev(idx);
      movingRef.current = true;
      requestAnimationFrame(() => {
        setEditingIdx(idx - 1);
        requestAnimationFrame(() => focusSubtitle(idx - 1, prevTextLength + 1));
      });
      return;
    }

    // Delete (맨 뒤) → 다음 자막과 병합
    if (e.key === 'Delete' && cursorPos === text.length && idx < sub.subtitles.length - 1) {
      e.preventDefault();
      editor.mergeWithNext(idx);
      return;
    }

    // ArrowUp (맨 앞) → 이전 자막 포커스
    if (e.key === 'ArrowUp' && cursorPos === 0 && idx > 0) {
      e.preventDefault();
      const prevLen = sub.subtitles[idx - 1].text.length;
      movingRef.current = true;
      setEditingIdx(idx - 1);
      requestAnimationFrame(() => focusSubtitle(idx - 1, prevLen));
      return;
    }

    // ArrowDown (맨 뒤) → 다음 자막 포커스
    if (e.key === 'ArrowDown' && cursorPos === text.length && idx < sub.subtitles.length - 1) {
      e.preventDefault();
      movingRef.current = true;
      setEditingIdx(idx + 1);
      requestAnimationFrame(() => focusSubtitle(idx + 1, 0));
      return;
    }
  }, [editor, sub.subtitles, focusSubtitle]);

  // Ctrl+Z / Cmd+Z 전역 단축키 — 편집 중일 때만 동작 (다른 단계 오발 방지)
  useEffect(() => {
    if (editingIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingIdx, editor]);

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
                          <textarea value={seg.text}
                            ref={el => {
                              textareaRefs.current[idx] = el;
                              if (el && document.activeElement !== el) {
                                // 편집 진입 시 1회 자동 포커스 (분할/병합 케이스는 focusSubtitle에서 별도 처리)
                                requestAnimationFrame(() => {
                                  if (textareaRefs.current[idx] === el && document.activeElement !== el) {
                                    el.focus();
                                    el.setSelectionRange(el.value.length, el.value.length);
                                  }
                                });
                              }
                            }}
                            onChange={e => editor.updateText(idx, e.target.value)}
                            onBlur={() => { setTimeout(() => { if (!movingRef.current) setEditingIdx(null); movingRef.current = false; }, 10); }}
                            onKeyDown={e => handleKeyDown(e, idx)}
                            rows={1}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-lg outline-none resize-none leading-snug font-sans" />
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

// ══════════════════════════════════════════════════════════════════
// 자막 타임라인 편집 유틸 + 훅 (캡컷 스타일 분할/병합)
// ══════════════════════════════════════════════════════════════════

/**
 * 자막 구간을 커서 위치 비율로 시간 분할
 * 예: 3.0~8.0초 자막에서 20/30 위치 커서 → 3.0~6.3, 6.3~8.0
 */
function splitSubtitleTime(
  originalStart: number,
  originalEnd: number,
  cursorPosition: number,
  totalLength: number,
): { first: { start: number; end: number }; second: { start: number; end: number } } {
  const totalDuration = originalEnd - originalStart;
  const ratio = totalLength > 0 ? cursorPosition / totalLength : 0.5;
  const splitTime = Math.round((originalStart + totalDuration * ratio) * 10) / 10;
  return {
    first: { start: originalStart, end: splitTime },
    second: { start: splitTime, end: originalEnd },
  };
}

function generateSubId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function reindex(subs: SubtitleSegment[]): SubtitleSegment[] {
  return subs.map((s, i) => ({ ...s, index: i, id: s.id ?? generateSubId() }));
}

/**
 * useSubtitleEditor — 자막 타임라인 조작 훅
 *
 * 설계 원칙:
 *  - pipeline state(sub.subtitles)를 단일 소스로 유지 (이중 상태 동기화 지옥 방지)
 *  - 훅은 조작 함수만 제공하고, 실제 값은 props로 받은 subtitles를 매번 참조
 *  - undo 히스토리만 훅 내부에 별도 보관 (deep copy)
 *  - onChange는 violations 재검증/집계/부모 state 반영 래퍼 (컴포넌트에서 주입)
 */
function useSubtitleEditor(
  subtitles: SubtitleSegment[] | undefined,
  onChange: (next: SubtitleSegment[]) => void,
) {
  const [history, setHistory] = useState<SubtitleSegment[][]>([]);

  const saveHistory = useCallback(() => {
    if (!subtitles) return;
    const snapshot = JSON.parse(JSON.stringify(subtitles)) as SubtitleSegment[];
    setHistory(prev => [...prev.slice(-19), snapshot]); // 최대 20단계
  }, [subtitles]);

  // ── 분할 ──
  const splitSubtitle = useCallback((idx: number, cursorPos: number, totalLength: number) => {
    if (!subtitles) return;
    const target = subtitles[idx];
    if (!target) return;
    const textBefore = target.text.substring(0, cursorPos).trim();
    const textAfter = target.text.substring(cursorPos).trim();
    if (!textBefore || !textAfter) return;

    saveHistory();
    const { first, second } = splitSubtitleTime(
      target.start_time, target.end_time, cursorPos, totalLength,
    );
    const next = [...subtitles];
    next.splice(idx, 1,
      { ...target, id: target.id ?? generateSubId(), text: textBefore, start_time: first.start, end_time: first.end, violations: [] },
      { ...target, id: generateSubId(), text: textAfter, start_time: second.start, end_time: second.end, violations: [] },
    );
    onChange(reindex(next));
  }, [subtitles, onChange, saveHistory]);

  // ── 이전과 병합 ──
  const mergeWithPrev = useCallback((idx: number) => {
    if (!subtitles || idx <= 0) return;
    saveHistory();
    const prev = subtitles[idx - 1];
    const cur = subtitles[idx];
    const merged: SubtitleSegment = {
      ...prev,
      id: prev.id ?? generateSubId(),
      end_time: cur.end_time,
      text: `${prev.text} ${cur.text}`.trim(),
      violations: [],
    };
    const next = [...subtitles];
    next.splice(idx - 1, 2, merged);
    onChange(reindex(next));
  }, [subtitles, onChange, saveHistory]);

  // ── 다음과 병합 ──
  const mergeWithNext = useCallback((idx: number) => {
    if (!subtitles || idx >= subtitles.length - 1) return;
    saveHistory();
    const cur = subtitles[idx];
    const nx = subtitles[idx + 1];
    const merged: SubtitleSegment = {
      ...cur,
      id: cur.id ?? generateSubId(),
      end_time: nx.end_time,
      text: `${cur.text} ${nx.text}`.trim(),
      violations: [],
    };
    const next = [...subtitles];
    next.splice(idx, 2, merged);
    onChange(reindex(next));
  }, [subtitles, onChange, saveHistory]);

  // ── 삭제 ── (앞/뒤 자막이 삭제된 구간 시간을 흡수)
  const deleteSubtitle = useCallback((idx: number) => {
    if (!subtitles || subtitles.length <= 1) return;
    saveHistory();
    const next = [...subtitles];
    const [deleted] = next.splice(idx, 1);
    if (idx > 0 && next[idx - 1]) {
      next[idx - 1] = { ...next[idx - 1], end_time: deleted.end_time };
    } else if (next.length > 0) {
      next[0] = { ...next[0], start_time: deleted.start_time };
    }
    onChange(reindex(next));
  }, [subtitles, onChange, saveHistory]);

  // ── 텍스트 변경 ── (시간 불변 — 스펙)
  const updateText = useCallback((idx: number, text: string) => {
    if (!subtitles) return;
    const next = subtitles.map((s, i) => (i === idx ? { ...s, text } : s));
    onChange(next);
  }, [subtitles, onChange]);

  // ── 시간 변경 ── (인접 자막의 경계도 따라 이동해서 갭 없이 연결 유지)
  const updateTime = useCallback((idx: number, field: 'start_time' | 'end_time', value: number) => {
    if (!subtitles) return;
    saveHistory();
    const next = [...subtitles];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'end_time' && idx < next.length - 1) {
      next[idx + 1] = { ...next[idx + 1], start_time: value };
    }
    if (field === 'start_time' && idx > 0) {
      next[idx - 1] = { ...next[idx - 1], end_time: value };
    }
    onChange(next);
  }, [subtitles, onChange, saveHistory]);

  // ── 되돌리기 ──
  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onChange(last);
      return prev.slice(0, -1);
    });
  }, [onChange]);

  return {
    splitSubtitle,
    mergeWithPrev,
    mergeWithNext,
    deleteSubtitle,
    updateText,
    updateTime,
    undo,
    canUndo: history.length > 0,
  };
}
