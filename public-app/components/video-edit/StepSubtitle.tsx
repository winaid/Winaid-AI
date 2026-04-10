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
}

function SubtitleEditor({ subtitles, onChange, medicalCheck, onDownloadSrt, videoDuration }: SubtitleEditorProps) {
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
    undo,
    canUndo,
  } = editor;
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

  // 선택된 인덱스가 범위 밖이면 정리 (삭제/병합 후 stale 방지)
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= subtitles.length) {
      setSelectedIndex(subtitles.length > 0 ? subtitles.length - 1 : null);
    }
  }, [selectedIndex, subtitles.length]);

  // 타임라인에서 블록 클릭 → 해당 자막 카드로 스크롤
  const handleSelect = useCallback((idx: number) => {
    setSelectedIndex(idx);
    const el = itemRefs.current[idx];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const registerItemRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    itemRefs.current[idx] = el;
  }, []);

  const registerRef = useCallback((idx: number, el: HTMLTextAreaElement | null) => {
    textareaRefs.current[idx] = el;
  }, []);

  // 리렌더 후 포커스 + 커서 위치 지정
  const focusSubtitle = useCallback((idx: number, cursorPos: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRefs.current[idx];
      if (ta) {
        ta.focus();
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, []);

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
  }, [splitSubtitle, mergeWithPrev, mergeWithNext, subtitles, focusSubtitle]);

  // Ctrl+Z / Cmd+Z — 편집기 내부에 포커스 있을 때만 (다른 단계 오발 방지)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z' || e.shiftKey) return;
      const active = document.activeElement;
      if (!containerRef.current || !active || !containerRef.current.contains(active)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  // 자막 삭제 시 ref 배열 길이 정리 (stale 참조 제거)
  useEffect(() => {
    textareaRefs.current = textareaRefs.current.slice(0, subtitles.length);
  }, [subtitles.length]);

  return (
    <div ref={containerRef} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* 도구바 */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-500 min-w-0">
          <span className="font-bold text-slate-700">자막 타임라인</span>
          <span className="ml-2 hidden sm:inline text-slate-400">Enter 분할 · Backspace 병합 · ↑↓ 이동 · Ctrl+Z</span>
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

      {/* 시각적 타임라인 + 경고 (목록 위) */}
      <div className="px-3 pt-3">
        <SubtitleTimeline
          subtitles={subtitles}
          totalDuration={totalDuration}
          selectedIndex={selectedIndex}
          readSpeeds={readSpeeds}
          onSelect={handleSelect}
          onTimeChange={updateTime}
          onBlockMove={moveBlock}
        />
        <TimeWarnings warnings={warnings} onAutoFixOverlaps={applyAutoFixOverlaps} />
      </div>

      {/* 자막 목록 */}
      <div className="max-h-[500px] overflow-y-auto p-3 space-y-2 bg-slate-50/40">
        {subtitles.map((seg, idx) => (
          <SubtitleItem
            key={seg.id ?? `idx_${idx}`}
            subtitle={seg}
            index={idx}
            totalCount={subtitles.length}
            isSelected={selectedIndex === idx}
            readSpeed={readSpeeds[idx]}
            onSelect={setSelectedIndex}
            onUpdateText={updateText}
            onUpdateTime={updateTime}
            onDelete={deleteSubtitle}
            onKeyDown={handleKeyDown}
            registerRef={registerRef}
            registerItemRef={registerItemRef}
          />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SubtitleItem — 개별 자막 카드
// ══════════════════════════════════════════════════════════════════

interface SubtitleItemProps {
  subtitle: SubtitleSegment;
  index: number;
  totalCount: number;
  isSelected: boolean;
  readSpeed: ReadSpeedHint | undefined;
  onSelect: (idx: number) => void;
  onUpdateText: (idx: number, text: string) => void;
  onUpdateTime: (idx: number, field: 'start_time' | 'end_time', value: number) => void;
  onDelete: (idx: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => void;
  registerRef: (idx: number, el: HTMLTextAreaElement | null) => void;
  registerItemRef: (idx: number, el: HTMLDivElement | null) => void;
}

function SubtitleItem({
  subtitle, index, totalCount, isSelected, readSpeed,
  onSelect, onUpdateText, onUpdateTime, onDelete,
  onKeyDown, registerRef, registerItemRef,
}: SubtitleItemProps) {
  const hasHigh = subtitle.violations?.some(v => v.severity === 'high');
  const hasMed = subtitle.violations?.some(v => v.severity === 'medium');
  const duration = Math.max(0, subtitle.end_time - subtitle.start_time);

  // 선택 시 파란 링 우선, 그 외엔 위반 색
  const cardClass = isSelected
    ? 'bg-white border-blue-400 ring-2 ring-blue-200'
    : hasHigh
    ? 'bg-red-50/70 border-red-200'
    : hasMed
    ? 'bg-amber-50/70 border-amber-200'
    : 'bg-white border-slate-200 hover:border-blue-300';

  return (
    <div
      ref={el => registerItemRef(index, el)}
      onClick={() => onSelect(index)}
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
    undo,
    canUndo: history.length > 0,
  };
}
