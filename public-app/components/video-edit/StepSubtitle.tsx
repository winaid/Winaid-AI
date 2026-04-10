'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { validateMedicalAd, countViolations } from '../../lib/medicalAdValidation';
import { downloadSrt, type SrtSegment } from '../../lib/srtUtils';
import SubtitleTimeline, {
  validateSubtitleTimes,
  checkReadSpeed,
  autoFixOverlaps,
  TimeWarnings,
  ReadSpeedBadge,
  type ReadSpeedHint,
} from './SubtitleTimeline';
import VideoPlayer, { type VideoPlayerHandle } from './VideoPlayer';
import type { PipelineState, StepSubtitleState, SubtitleStyle, SubtitlePosition, SubtitleSegment } from './types';
import { getInputForStep } from './types';

/**
 * 자막 단계의 입력 영상 URL을 안정적으로 만든다.
 * - getInputForStep이 string(blob URL)을 반환하면 그대로 사용
 * - File을 반환하면 URL.createObjectURL로 변환하고 cleanup
 * - 입력 없으면 null
 */
function useInputBlobUrl(state: PipelineState, stepNum: number): string | null {
  const input = useMemo(() => getInputForStep(state, stepNum), [state, stepNum]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof input === 'string') {
      setUrl(input);
      return;
    }
    if (input instanceof File) {
      const u = URL.createObjectURL(input);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(null);
  }, [input]);

  return url;
}

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

  // 자막 편집기 안 영상 미리보기용 — 이전 단계 결과(또는 원본)
  const inputBlobUrl = useInputBlobUrl(state, 4);

  // 자막 변경 래퍼 — 훅이 이미 violations까지 채워서 넘겨주므로 여기서는 집계 + 부모 state 반영만
  const handleSubtitlesChange = useCallback((next: SubtitleSegment[]) => {
    const allV = next.flatMap(s => s.violations ?? []) as Array<{ severity: 'high' | 'medium' }>;
    const counts = countViolations(allV as never[]);
    onUpdate({
      subtitles: next,
      highViolations: counts.high,
      mediumViolations: counts.medium,
    });
  }, [onUpdate]);

  // SRT 다운로드
  const handleDownloadSrt = useCallback(() => {
    if (!sub.subtitles) return;
    const srtSegs: SrtSegment[] = sub.subtitles.map(s => ({ start_time: s.start_time, end_time: s.end_time, text: s.text }));
    const name = state.fileInfo?.name.replace(/\.[^.]+$/, '') || 'subtitles';
    downloadSrt(srtSegs, name);
  }, [sub.subtitles, state.fileInfo?.name]);

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

          {/* 편집기 */}
          <SubtitleEditor
            subtitles={sub.subtitles}
            onChange={handleSubtitlesChange}
            medicalCheck={sub.medicalCheck}
            onDownloadSrt={handleDownloadSrt}
            videoDuration={state.fileInfo?.duration}
            videoSrc={inputBlobUrl}
          />
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

// ══════════════════════════════════════════════════════════════════
// SubtitleEditor — 자막 타임라인 편집기 (2/2)
// ══════════════════════════════════════════════════════════════════

interface SubtitleEditorProps {
  subtitles: SubtitleSegment[];
  onChange: (next: SubtitleSegment[]) => void;
  medicalCheck: boolean;
  onDownloadSrt: () => void;
  videoDuration?: number;
  /** 미리보기 영상 src — 이전 단계 결과 또는 원본 */
  videoSrc?: string | null;
}

function SubtitleEditor({ subtitles, onChange, medicalCheck, onDownloadSrt, videoDuration, videoSrc }: SubtitleEditorProps) {
  const editor = useSubtitleEditor(subtitles, onChange, medicalCheck);
  const {
    splitSubtitle,
    mergeWithPrev,
    mergeWithNext,
    deleteSubtitle,
    updateText,
    updateTime,
    moveBlock,
    applyAutoFixOverlaps,
    deleteMany,
    mergeMany,
    undo,
    canUndo,
  } = editor;
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  // 다중 선택: 여러 인덱스 + 마지막 단일 클릭한 anchor (Shift+클릭 범위 기준)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  // 영상 동기화: 재생 시간 + 플레이어 ref + 사용자 스크롤 가드
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [playTime, setPlayTime] = useState(0);
  const [userScrolling, setUserScrolling] = useState(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 검증 + 읽기속도 (서브타이틀 변경 시마다 재계산) ──
  const warnings = useMemo(() => validateSubtitleTimes(subtitles), [subtitles]);
  const readSpeeds = useMemo(() => checkReadSpeed(subtitles), [subtitles]);

  // ── 타임라인 총 길이: 영상 메타데이터 우선, 없으면 마지막 자막 끝 + 1초 ──
  const totalDuration = useMemo(() => {
    if (videoDuration && videoDuration > 0) return videoDuration;
    if (subtitles.length === 0) return 1;
    const lastEnd = subtitles[subtitles.length - 1].end_time;
    return Math.max(lastEnd + 1, 1);
  }, [videoDuration, subtitles]);

  // 자막 길이 변경 시: 범위 밖 인덱스 정리 (삭제/병합 후 stale 방지)
  useEffect(() => {
    setSelectedIndices(prev => {
      let changed = false;
      const next = new Set<number>();
      for (const i of prev) {
        if (i < subtitles.length) next.add(i);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setAnchorIndex(prev => (prev !== null && prev >= subtitles.length ? null : prev));
  }, [subtitles.length]);

  const registerItemRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    itemRefs.current[idx] = el;
  }, []);

  const registerRef = useCallback((idx: number, el: HTMLTextAreaElement | null) => {
    textareaRefs.current[idx] = el;
  }, []);

  // ── 자동 스크롤 ── (max-h overflow 컨테이너 안에서 가장 가까운 가장자리로만)
  const scrollToSubtitle = useCallback((idx: number) => {
    const item = itemRefs.current[idx];
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  // 리렌더 후 포커스 + 커서 위치 지정 (스크롤 동반)
  const focusSubtitle = useCallback((idx: number, cursorPos: number) => {
    requestAnimationFrame(() => {
      scrollToSubtitle(idx);
      const ta = textareaRefs.current[idx];
      if (ta) {
        ta.focus();
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [scrollToSubtitle]);

  // ── 선택 액션 ──
  const selectSingle = useCallback((idx: number) => {
    setSelectedIndices(new Set([idx]));
    setAnchorIndex(idx);
  }, []);

  const toggleSelect = useCallback((idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setAnchorIndex(idx);
  }, []);

  const rangeSelect = useCallback((idx: number) => {
    setSelectedIndices(() => {
      if (anchorIndex === null) return new Set([idx]);
      const start = Math.min(anchorIndex, idx);
      const end = Math.max(anchorIndex, idx);
      const range = new Set<number>();
      for (let i = start; i <= end; i++) range.add(i);
      return range;
    });
    // anchor는 그대로 유지 (표준 UX)
  }, [anchorIndex]);

  const selectAll = useCallback(() => {
    if (subtitles.length === 0) return;
    const all = new Set<number>();
    for (let i = 0; i < subtitles.length; i++) all.add(i);
    setSelectedIndices(all);
    setAnchorIndex(0);
  }, [subtitles.length]);

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
    setAnchorIndex(null);
  }, []);

  // 카드/타임라인에서 선택 진입점 — 자동 스크롤 + (단일 선택일 때만) 영상 점프
  const handleSelect = useCallback(
    (idx: number, modifiers?: { ctrl?: boolean; shift?: boolean }) => {
      if (modifiers?.shift) {
        rangeSelect(idx);
      } else if (modifiers?.ctrl) {
        toggleSelect(idx);
      } else {
        selectSingle(idx);
        // 단일 선택 시에만 영상을 해당 자막 시작 시간으로 점프 (다중 선택 시엔 의도 다름)
        const target = subtitles[idx];
        if (target && playerRef.current) {
          playerRef.current.seekTo(target.start_time);
        }
      }
      scrollToSubtitle(idx);
    },
    [selectSingle, toggleSelect, rangeSelect, scrollToSubtitle, subtitles],
  );

  // ── 영상 동기화: 재생 시간 → 활성 자막 인덱스 ──
  // findIndex는 100개 이하 자막에서 충분히 빠름. 더 커지면 이진 탐색으로 교체.
  const activeSubtitleIndex = useMemo(() => {
    if (!videoSrc || subtitles.length === 0) return -1;
    return subtitles.findIndex(s => playTime >= s.start_time && playTime < s.end_time);
  }, [playTime, subtitles, videoSrc]);

  const activeSubtitle = activeSubtitleIndex >= 0 ? subtitles[activeSubtitleIndex] : null;

  // 사용자 스크롤(휠/터치) 감지 — 자동 스크롤 일시 중지 (3초)
  // onScroll은 자동 스크롤도 트리거하므로 wheel/touchmove로만 감지
  const handleUserScroll = useCallback(() => {
    setUserScrolling(true);
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = setTimeout(() => setUserScrolling(false), 3000);
  }, []);

  useEffect(() => () => {
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
  }, []);

  // 영상 재생 → 활성 자막 변경 시 자동 스크롤 (사용자가 직접 스크롤 중이면 skip)
  const prevActiveRef = useRef(-1);
  useEffect(() => {
    if (activeSubtitleIndex < 0) {
      prevActiveRef.current = -1;
      return;
    }
    if (activeSubtitleIndex === prevActiveRef.current) return;
    prevActiveRef.current = activeSubtitleIndex;
    if (userScrolling) return;
    scrollToSubtitle(activeSubtitleIndex);
  }, [activeSubtitleIndex, userScrolling, scrollToSubtitle]);

  // ── 일괄 작업 ──
  const handleDeleteSelected = useCallback(() => {
    if (selectedIndices.size === 0) return;
    if (selectedIndices.size >= subtitles.length) return; // 전부 삭제 방지
    deleteMany(selectedIndices);
    clearSelection();
  }, [selectedIndices, subtitles.length, deleteMany, clearSelection]);

  // 단일 자막 삭제 — 삭제 후 인접 자막으로 포커스/스크롤 (휴지통 아이콘이 호출)
  const handleSingleDelete = useCallback((idx: number) => {
    if (subtitles.length <= 1) return;
    deleteSubtitle(idx);
    // 삭제 후 새로 인덱스가 어디로 갈지: 같은 idx에 다음 자막이 들어옴, 끝이면 idx-1
    const newIdx = Math.min(idx, subtitles.length - 2);
    if (newIdx >= 0) {
      selectSingle(newIdx);
      focusSubtitle(newIdx, 0);
    }
  }, [subtitles.length, deleteSubtitle, selectSingle, focusSubtitle]);

  const handleMergeSelected = useCallback(() => {
    if (selectedIndices.size < 2) return;
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    const firstIdx = indices[0];
    const result = mergeMany(selectedIndices);
    if (result === 'noncontiguous') {
      // 비연속이면 사용자에게 알림 (즉시 차단)
      if (typeof window !== 'undefined') {
        window.alert('연속된 자막만 병합할 수 있습니다.');
      }
      return;
    }
    if (result === 'ok') {
      setSelectedIndices(new Set([firstIdx]));
      setAnchorIndex(firstIdx);
    }
  }, [selectedIndices, mergeMany]);

  // 키보드 이벤트 — 분할/병합/포커스 이동
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const ta = e.currentTarget;
    const cursorPos = ta.selectionStart;
    const text = ta.value;

    // Enter → 커서 위치에서 분할 (양 끝이면 분할 없이 조용히 무시해서 일반 개행 방지)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (cursorPos > 0 && cursorPos < text.length) {
        splitSubtitle(idx, cursorPos, text.length);
        // 분할 후 새 자막(idx+1)으로 단일 선택 + 포커스 + 자동 스크롤
        selectSingle(idx + 1);
        focusSubtitle(idx + 1, 0);
      }
      return;
    }

    // Backspace (맨 앞) → 이전 자막과 병합
    if (e.key === 'Backspace' && cursorPos === 0 && ta.selectionEnd === 0 && idx > 0) {
      e.preventDefault();
      const prevLen = subtitles[idx - 1]?.text.length ?? 0;
      mergeWithPrev(idx);
      // 병합 후 커서 = 이전 자막 원래 끝 + 공백 1칸 뒤
      focusSubtitle(idx - 1, prevLen + 1);
      return;
    }

    // Delete (맨 뒤) → 다음 자막과 병합
    if (e.key === 'Delete' && cursorPos === text.length && idx < subtitles.length - 1) {
      e.preventDefault();
      mergeWithNext(idx);
      return;
    }

    // ArrowUp (맨 앞) → 이전 자막 포커스
    if (e.key === 'ArrowUp' && cursorPos === 0 && idx > 0) {
      e.preventDefault();
      const prevLen = subtitles[idx - 1]?.text.length ?? 0;
      focusSubtitle(idx - 1, prevLen);
      return;
    }

    // ArrowDown (맨 뒤) → 다음 자막 포커스
    if (e.key === 'ArrowDown' && cursorPos === text.length && idx < subtitles.length - 1) {
      e.preventDefault();
      focusSubtitle(idx + 1, 0);
      return;
    }
  }, [splitSubtitle, mergeWithPrev, mergeWithNext, subtitles, focusSubtitle, selectSingle]);

  // 전역 키보드 단축키 — 편집기 내부에 포커스 있을 때만 (다른 단계 오발 방지)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as Element | null;
      const inEditor = !!containerRef.current && !!active && containerRef.current.contains(active);
      if (!inEditor) return;

      const isMod = e.ctrlKey || e.metaKey;
      const tag = active?.tagName;
      const inTextField = tag === 'TEXTAREA' || tag === 'INPUT';

      // Ctrl+Z — 되돌리기 (텍스트 필드 안에서도 우리 히스토리 우선)
      if (isMod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+A — 자막 전체 선택 (텍스트 필드 안에서는 OS 텍스트 전체선택 양보)
      if (isMod && (e.key === 'a' || e.key === 'A')) {
        if (!inTextField) {
          e.preventDefault();
          selectAll();
        }
        return;
      }

      // Escape — 선택 해제 (필드 안에서는 blur만)
      if (e.key === 'Escape') {
        if (inTextField && active instanceof HTMLElement) {
          active.blur();
        }
        if (selectedIndices.size > 0) clearSelection();
        return;
      }

      // Delete — 다중 선택일 때만 일괄 삭제 (필드 안에서는 글자 삭제 양보)
      if (e.key === 'Delete' && !inTextField) {
        if (selectedIndices.size > 1) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, selectAll, clearSelection, selectedIndices, handleDeleteSelected]);

  // 자막 삭제 시 ref 배열 길이 정리 (stale 참조 제거)
  useEffect(() => {
    textareaRefs.current = textareaRefs.current.slice(0, subtitles.length);
  }, [subtitles.length]);

  const canMergeSelected = useMemo(() => {
    if (selectedIndices.size < 2) return false;
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) return false;
    }
    return true;
  }, [selectedIndices]);

  return (
    <div ref={containerRef} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* 도구바 (전체 폭) */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-500 min-w-0">
          <span className="font-bold text-slate-700">자막 타임라인</span>
          <span className="ml-2 hidden sm:inline text-slate-400">
            Enter 분할 · Backspace 병합 · ↑↓ 이동 · Ctrl+클릭/Shift+클릭 다중선택 · Ctrl+A 전체 · Esc 해제 · Ctrl+Z
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={undo} disabled={!canUndo}
            className="text-[10px] font-bold text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="되돌리기 (Ctrl+Z)">
            ↩ 되돌리기
          </button>
          <button type="button" onClick={onDownloadSrt}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800">
            📥 SRT
          </button>
        </div>
      </div>

      {/* 2컬럼: 영상 플레이어 + 편집 영역 (모바일은 1컬럼) */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
        {/* 왼쪽: 영상 미리보기 (sticky) */}
        <div className="lg:sticky lg:top-0 lg:self-start p-3 lg:border-r border-b lg:border-b-0 border-slate-100 bg-slate-50/60 space-y-2">
          <VideoPlayer
            ref={playerRef}
            src={videoSrc || null}
            compact={false}
            aspectRatio="9/16"
            onTimeUpdate={setPlayTime}
          />

          {/* 현재 재생 자막 (캡션 오버레이) */}
          {activeSubtitle && (
            <div className="px-3 py-2 bg-black/85 rounded-lg text-center">
              <span className="text-white text-xs leading-snug">{activeSubtitle.text}</span>
            </div>
          )}
          {!videoSrc && (
            <div className="text-[10px] text-slate-400 text-center">
              이전 단계 결과가 있어야 미리보기 가능
            </div>
          )}
        </div>

        {/* 오른쪽: 타임라인 + 경고 + 자막 목록 */}
        <div className="min-w-0">
          {/* 시각적 타임라인 + 경고 */}
          <div className="px-3 pt-3">
            <SubtitleTimeline
              subtitles={subtitles}
              totalDuration={totalDuration}
              selectedIndices={selectedIndices}
              anchorIndex={anchorIndex}
              readSpeeds={readSpeeds}
              playTime={playTime}
              onSelect={handleSelect}
              onTimeChange={updateTime}
              onBlockMove={moveBlock}
            />
            <TimeWarnings warnings={warnings} onAutoFixOverlaps={applyAutoFixOverlaps} />
          </div>

          {/* 자막 목록 (사용자 wheel/touchmove 시 자동 스크롤 일시 중지) */}
          <div
            ref={listScrollRef}
            onWheel={handleUserScroll}
            onTouchMove={handleUserScroll}
            className="max-h-[500px] overflow-y-auto bg-slate-50/40"
          >
            {/* 다중 선택 툴바 (sticky) */}
            {selectedIndices.size > 1 && (
              <div className="sticky top-0 z-20 bg-blue-50 border-b border-blue-200 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-blue-700 font-bold tabular-nums">
                  {selectedIndices.size}개 선택됨
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleMergeSelected}
                    disabled={!canMergeSelected}
                    title={canMergeSelected ? '선택된 자막을 하나로 병합' : '연속된 자막만 병합 가능'}
                    className="text-[11px] px-2.5 py-1 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
                  >
                    🔗 병합
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={selectedIndices.size >= subtitles.length}
                    title={selectedIndices.size >= subtitles.length ? '전부 삭제는 불가' : '선택된 자막 일괄 삭제 (Delete)'}
                    className="text-[11px] px-2.5 py-1 bg-red-500 text-white font-bold rounded hover:bg-red-600 disabled:opacity-40 disabled:hover:bg-red-500"
                  >
                    🗑 삭제
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    title="선택 해제 (Esc)"
                    className="text-[11px] px-2.5 py-1 bg-slate-200 text-slate-600 font-bold rounded hover:bg-slate-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="p-3 space-y-2">
              {subtitles.map((seg, idx) => (
                <SubtitleItem
                  key={seg.id ?? `idx_${idx}`}
                  subtitle={seg}
                  index={idx}
                  totalCount={subtitles.length}
                  isSelected={selectedIndices.has(idx)}
                  isActive={activeSubtitleIndex === idx}
                  readSpeed={readSpeeds[idx]}
                  onSelect={handleSelect}
                  onUpdateText={updateText}
                  onUpdateTime={updateTime}
                  onDelete={handleSingleDelete}
                  onKeyDown={handleKeyDown}
                  registerRef={registerRef}
                  registerItemRef={registerItemRef}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SubtitleItem — 개별 자막 카드
// ══════════════════════════════════════════════════════════════════

type SelectModifiers = { ctrl?: boolean; shift?: boolean };

interface SubtitleItemProps {
  subtitle: SubtitleSegment;
  index: number;
  totalCount: number;
  isSelected: boolean;
  /** 영상에서 현재 재생 중인 자막인지 — emerald 강조 */
  isActive: boolean;
  readSpeed: ReadSpeedHint | undefined;
  onSelect: (idx: number, modifiers?: SelectModifiers) => void;
  onUpdateText: (idx: number, text: string) => void;
  onUpdateTime: (idx: number, field: 'start_time' | 'end_time', value: number) => void;
  onDelete: (idx: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => void;
  registerRef: (idx: number, el: HTMLTextAreaElement | null) => void;
  registerItemRef: (idx: number, el: HTMLDivElement | null) => void;
}

function SubtitleItem({
  subtitle, index, totalCount, isSelected, isActive, readSpeed,
  onSelect, onUpdateText, onUpdateTime, onDelete,
  onKeyDown, registerRef, registerItemRef,
}: SubtitleItemProps) {
  const hasHigh = subtitle.violations?.some(v => v.severity === 'high');
  const hasMed = subtitle.violations?.some(v => v.severity === 'medium');
  const duration = Math.max(0, subtitle.end_time - subtitle.start_time);

  // 우선순위: 영상 재생 중(isActive) > 다중선택(isSelected) > 위반 > 기본
  const cardClass = isActive
    ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-200'
    : isSelected
    ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-200'
    : hasHigh
    ? 'bg-red-50/70 border-red-200'
    : hasMed
    ? 'bg-amber-50/70 border-amber-200'
    : 'bg-white border-slate-200 hover:border-blue-300';

  // 카드 클릭: modifier에 따라 단일/Ctrl/Shift 선택. 다중 선택 중일 때 텍스트 선택 방지.
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onSelect(index, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  };

  // Shift+클릭으로 다중 선택할 때 브라우저의 텍스트 셀렉션이 끼어드는 걸 방지
  const handleCardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey) e.preventDefault();
  };

  return (
    <div
      ref={el => registerItemRef(index, el)}
      onClick={handleCardClick}
      onMouseDown={handleCardMouseDown}
      className={`rounded-xl p-2.5 border transition-colors cursor-pointer ${cardClass}`}
    >
      {/* 헤더: 번호 + 시간 + 삭제 */}
      <div className="flex items-center justify-between mb-1.5 gap-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 min-w-0 flex-wrap">
          <span className="font-mono text-slate-400 shrink-0">#{index + 1}</span>
          <TimeInput value={subtitle.start_time} onChange={v => onUpdateTime(index, 'start_time', v)} />
          <span className="text-slate-300">~</span>
          <TimeInput value={subtitle.end_time} onChange={v => onUpdateTime(index, 'end_time', v)} />
          <span className="text-slate-400 shrink-0">({duration.toFixed(1)}초)</span>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(index); }} disabled={totalCount <= 1}
          className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300 px-1 text-xs shrink-0"
          title="자막 삭제">
          🗑
        </button>
      </div>

      {/* 텍스트 편집 */}
      <textarea
        ref={el => registerRef(index, el)}
        value={subtitle.text}
        onChange={e => onUpdateText(index, e.target.value)}
        onKeyDown={e => onKeyDown(e, index)}
        onFocus={() => onSelect(index)}
        onClick={e => e.stopPropagation()}
        rows={2}
        className="w-full px-2 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none resize-none leading-snug font-sans"
        placeholder="자막 텍스트..."
      />

      {/* 읽기속도 뱃지 (ok가 아닐 때만) */}
      {readSpeed && <ReadSpeedBadge hint={readSpeed} />}

      {/* 의료광고법 위반 뱃지 */}
      {subtitle.violations && subtitle.violations.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {subtitle.violations.map((v, vi) => (
            <div key={vi} className={`text-[10px] px-1.5 py-0.5 rounded ${
              v.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {v.severity === 'high' ? '⛔' : '⚠️'} &apos;{v.keyword}&apos; → {v.suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TimeInput — 클릭 시 mm:ss.d 직접 편집
// ══════════════════════════════════════════════════════════════════

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const commit = useCallback(() => {
    const parsed = parseTimeInput(inputValue);
    if (parsed !== null) onChange(parsed);
    setEditing(false);
  }, [inputValue, onChange]);

  if (!editing) {
    return (
      <button type="button"
        className="font-mono text-slate-600 hover:bg-blue-100 px-1 rounded cursor-text tabular-nums"
        onClick={() => { setInputValue(formatTimeInput(value)); setEditing(true); }}
        title="클릭해서 시간 직접 입력">
        {formatTimeInput(value)}
      </button>
    );
  }

  return (
    <input type="text" value={inputValue} autoFocus
      onChange={e => setInputValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
      }}
      className="font-mono w-14 px-1 py-0 border border-blue-400 rounded text-center text-[10px] outline-none tabular-nums"
      placeholder="00:00.0"
    />
  );
}

/** mm:ss.d 형식으로 포맷 (예: 123.4초 → "02:03.4") */
function formatTimeInput(seconds: number): string {
  const safe = Math.max(0, seconds);
  const min = Math.floor(safe / 60);
  const sec = safe - min * 60;
  return `${String(min).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

/** "mm:ss" 또는 "mm:ss.d" 파싱. 잘못된 포맷이면 null 반환. */
function parseTimeInput(str: string): number | null {
  const m = str.trim().match(/^(\d{1,2}):(\d{1,2})(?:\.(\d))?$/);
  if (!m) return null;
  const mm = parseInt(m[1], 10);
  const ss = parseInt(m[2], 10);
  const ds = m[3] ? parseInt(m[3], 10) : 0;
  if (ss >= 60) return null;
  const result = mm * 60 + ss + ds / 10;
  return result >= 0 ? Math.round(result * 10) / 10 : null;
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
 *  - 훅은 조작 함수만 제공하고, 최신 값은 subtitlesRef로 항상 참조 (stale closure 방지)
 *  - undo 히스토리만 훅 내부에 별도 보관 (deep copy, 최대 20단계)
 *  - 텍스트 변경은 500ms 디바운스로 의료광고법 재검증
 *  - 분할/병합은 새 자막 텍스트에 대해 즉시 재검증
 */
function useSubtitleEditor(
  subtitles: SubtitleSegment[] | undefined,
  onChange: (next: SubtitleSegment[]) => void,
  medicalCheckEnabled: boolean,
) {
  const [history, setHistory] = useState<SubtitleSegment[][]>([]);
  const subtitlesRef = useRef(subtitles);
  const onChangeRef = useRef(onChange);
  const medicalCheckRef = useRef(medicalCheckEnabled);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 최신 props를 ref로 미러링 (setTimeout/콜백 내부에서 stale 참조 방지)
  useEffect(() => { subtitlesRef.current = subtitles; }, [subtitles]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { medicalCheckRef.current = medicalCheckEnabled; }, [medicalCheckEnabled]);

  // 언마운트 시 디바운스 타이머 정리
  useEffect(() => () => {
    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
  }, []);

  const runValidate = useCallback((text: string) => {
    return medicalCheckRef.current ? validateMedicalAd(text) : [];
  }, []);

  const saveHistory = useCallback(() => {
    const cur = subtitlesRef.current;
    if (!cur) return;
    const snapshot = JSON.parse(JSON.stringify(cur)) as SubtitleSegment[];
    setHistory(prev => [...prev.slice(-19), snapshot]); // 최대 20단계
  }, []);

  // ── 분할 ──
  const splitSubtitle = useCallback((idx: number, cursorPos: number, totalLength: number) => {
    const cur = subtitlesRef.current;
    if (!cur) return;
    const target = cur[idx];
    if (!target) return;
    const textBefore = target.text.substring(0, cursorPos).trim();
    const textAfter = target.text.substring(cursorPos).trim();
    if (!textBefore || !textAfter) return;

    saveHistory();
    const { first, second } = splitSubtitleTime(target.start_time, target.end_time, cursorPos, totalLength);
    const next = [...cur];
    next.splice(idx, 1,
      { ...target, id: target.id ?? generateSubId(), text: textBefore, start_time: first.start, end_time: first.end, violations: runValidate(textBefore) },
      { ...target, id: generateSubId(), text: textAfter, start_time: second.start, end_time: second.end, violations: runValidate(textAfter) },
    );
    onChangeRef.current(reindex(next));
  }, [saveHistory, runValidate]);

  // ── 이전과 병합 ──
  const mergeWithPrev = useCallback((idx: number) => {
    const cur = subtitlesRef.current;
    if (!cur || idx <= 0) return;
    saveHistory();
    const prev = cur[idx - 1];
    const c = cur[idx];
    const mergedText = `${prev.text} ${c.text}`.trim();
    const merged: SubtitleSegment = {
      ...prev,
      id: prev.id ?? generateSubId(),
      end_time: c.end_time,
      text: mergedText,
      violations: runValidate(mergedText),
    };
    const next = [...cur];
    next.splice(idx - 1, 2, merged);
    onChangeRef.current(reindex(next));
  }, [saveHistory, runValidate]);

  // ── 다음과 병합 ──
  const mergeWithNext = useCallback((idx: number) => {
    const cur = subtitlesRef.current;
    if (!cur || idx >= cur.length - 1) return;
    saveHistory();
    const c = cur[idx];
    const nx = cur[idx + 1];
    const mergedText = `${c.text} ${nx.text}`.trim();
    const merged: SubtitleSegment = {
      ...c,
      id: c.id ?? generateSubId(),
      end_time: nx.end_time,
      text: mergedText,
      violations: runValidate(mergedText),
    };
    const next = [...cur];
    next.splice(idx, 2, merged);
    onChangeRef.current(reindex(next));
  }, [saveHistory, runValidate]);

  // ── 삭제 ── (앞/뒤 자막이 삭제된 구간 시간을 흡수해서 갭 제거)
  const deleteSubtitle = useCallback((idx: number) => {
    const cur = subtitlesRef.current;
    if (!cur || cur.length <= 1) return;
    saveHistory();
    const next = [...cur];
    const [deleted] = next.splice(idx, 1);
    if (idx > 0 && next[idx - 1]) {
      next[idx - 1] = { ...next[idx - 1], end_time: deleted.end_time };
    } else if (next.length > 0) {
      next[0] = { ...next[0], start_time: deleted.start_time };
    }
    onChangeRef.current(reindex(next));
  }, [saveHistory]);

  // ── 텍스트 변경 ── (시간 불변 + 500ms 디바운스 재검증)
  const updateText = useCallback((idx: number, text: string) => {
    const cur = subtitlesRef.current;
    if (!cur) return;
    // 1. 즉시 텍스트 반영 (violations는 stale일 수 있음)
    const next = cur.map((s, i) => (i === idx ? { ...s, text } : s));
    onChangeRef.current(next);

    // 2. 500ms 뒤 의료광고법 재검증 (그 사이에 또 바뀌면 이 타이머는 취소됨)
    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    validateTimerRef.current = setTimeout(() => {
      const latest = subtitlesRef.current;
      if (!latest) return;
      const target = latest[idx];
      if (!target || target.text !== text) return; // 이미 또 바뀌었으면 skip
      const violations = runValidate(text);
      // 기존 violations와 동일하면 불필요한 onChange 방지
      const prevViolations = target.violations ?? [];
      if (prevViolations.length === violations.length &&
          prevViolations.every((v, i) => v.keyword === violations[i]?.keyword && v.severity === violations[i]?.severity)) {
        return;
      }
      const updated = latest.map((s, i) => (i === idx ? { ...s, violations } : s));
      onChangeRef.current(updated);
    }, 500);
  }, [runValidate]);

  // ── 시간 변경 ── (인접 자막 경계도 따라 이동해서 갭 없이 연결 유지)
  const updateTime = useCallback((idx: number, field: 'start_time' | 'end_time', value: number) => {
    const cur = subtitlesRef.current;
    if (!cur) return;
    saveHistory();
    const next = [...cur];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'end_time' && idx < next.length - 1) {
      next[idx + 1] = { ...next[idx + 1], start_time: value };
    }
    if (field === 'start_time' && idx > 0) {
      next[idx - 1] = { ...next[idx - 1], end_time: value };
    }
    onChangeRef.current(next);
  }, [saveHistory]);

  // ── 블록 전체 이동 ── (타임라인 가운데 드래그 시 호출. 인접 자막 자동 밀어내기)
  const moveBlock = useCallback((idx: number, newStart: number) => {
    const cur = subtitlesRef.current;
    if (!cur || !cur[idx]) return;
    saveHistory();
    const next = cur.map(s => ({ ...s }));
    const target = next[idx];
    const duration = target.end_time - target.start_time;
    const snap = (t: number) => Math.round(t * 10) / 10;

    target.start_time = snap(Math.max(0, newStart));
    target.end_time = snap(target.start_time + duration);

    // 이전 자막의 끝이 새 시작보다 크면 끝값을 새 시작으로 클램프
    if (idx > 0 && next[idx - 1].end_time > target.start_time) {
      next[idx - 1].end_time = target.start_time;
      // 그래서 이전 자막이 역전되면 같은 시간대로 만들고 둠 (UI 경고로 사용자에게 알림)
      if (next[idx - 1].start_time > next[idx - 1].end_time) {
        next[idx - 1].start_time = next[idx - 1].end_time;
      }
    }
    // 다음 자막의 시작이 새 끝보다 작으면 시작값을 새 끝으로 클램프
    if (idx < next.length - 1 && next[idx + 1].start_time < target.end_time) {
      next[idx + 1].start_time = target.end_time;
      if (next[idx + 1].end_time < next[idx + 1].start_time) {
        next[idx + 1].end_time = next[idx + 1].start_time;
      }
    }
    onChangeRef.current(next);
  }, [saveHistory]);

  // ── 겹침 자동 수정 ── (TimeWarnings의 "겹침 자동 수정" 버튼이 호출)
  const applyAutoFixOverlaps = useCallback(() => {
    const cur = subtitlesRef.current;
    if (!cur) return;
    saveHistory();
    onChangeRef.current(autoFixOverlaps(cur));
  }, [saveHistory]);

  // ── 일괄 삭제 ── (다중 선택된 자막을 한 번에 삭제, 단일 saveHistory)
  const deleteMany = useCallback((indicesSet: Set<number>) => {
    const cur = subtitlesRef.current;
    if (!cur) return;
    if (indicesSet.size === 0) return;
    if (indicesSet.size >= cur.length) return; // 전부 삭제 방지

    saveHistory();
    // 뒤에서부터 삭제 (인덱스 무너지지 않게) + 인접 자막에 시간 흡수
    const indices = Array.from(indicesSet).sort((a, b) => b - a);
    const next = cur.map(s => ({ ...s }));
    for (const idx of indices) {
      const [deleted] = next.splice(idx, 1);
      if (idx > 0 && next[idx - 1]) {
        next[idx - 1].end_time = Math.max(next[idx - 1].end_time, deleted.end_time);
      } else if (next[idx]) {
        next[idx].start_time = Math.min(next[idx].start_time, deleted.start_time);
      }
    }
    onChangeRef.current(reindex(next));
  }, [saveHistory]);

  // ── 일괄 병합 ── (연속된 인덱스만 허용, 비연속이면 'noncontiguous' 반환)
  const mergeMany = useCallback((indicesSet: Set<number>): 'ok' | 'noncontiguous' | 'noop' => {
    const cur = subtitlesRef.current;
    if (!cur) return 'noop';
    if (indicesSet.size < 2) return 'noop';

    const indices = Array.from(indicesSet).sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) return 'noncontiguous';
    }

    saveHistory();
    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];
    const mergedText = indices.map(i => cur[i].text).join(' ').trim();
    const merged: SubtitleSegment = {
      ...cur[firstIdx],
      id: cur[firstIdx].id ?? generateSubId(),
      end_time: cur[lastIdx].end_time,
      text: mergedText,
      violations: runValidate(mergedText),
    };
    const next = [...cur];
    next.splice(firstIdx, indices.length, merged);
    onChangeRef.current(reindex(next));
    return 'ok';
  }, [saveHistory, runValidate]);

  // ── 되돌리기 ──
  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onChangeRef.current(last);
      return prev.slice(0, -1);
    });
  }, []);

  return {
    splitSubtitle,
    mergeWithPrev,
    mergeWithNext,
    deleteSubtitle,
    updateText,
    updateTime,
    moveBlock,
    applyAutoFixOverlaps,
    deleteMany,
    mergeMany,
    undo,
    canUndo: history.length > 0,
  };
}
