'use client';

/**
 * SubtitleTimeline — 자막 시각적 타임라인 + 검증 헬퍼
 *
 * 기능:
 *  1. 가로 타임라인 바: 자막 블록 클릭/드래그로 시간 조절
 *     - 양 끝 핸들: start_time / end_time 개별 조정
 *     - 가운데 드래그: 블록 전체 이동
 *     - 색상: 의료광고법 위반(빨강/노랑) → 읽기속도(주황) → 기본(파랑)
 *  2. 시간 검증: 역전 / 0초 미만 / 인접 자막 겹침
 *  3. 읽기 속도 검증: 한국어 4~12자/초 기준
 *  4. 겹침 자동 수정 (중간 지점 스냅)
 */

import { useEffect, useRef, useState } from 'react';
import type { SubtitleSegment } from './types';

// ══════════════════════════════════════════════════════════════════
// 검증 헬퍼
// ══════════════════════════════════════════════════════════════════

export interface TimeWarning {
  index: number;
  type: 'reversed' | 'overlap' | 'zero_duration';
  message: string;
}

/** 자막 시간 논리 검증 — 역전/0초/겹침 */
export function validateSubtitleTimes(subtitles: SubtitleSegment[]): TimeWarning[] {
  const warnings: TimeWarning[] = [];

  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i];

    // 시작 ≥ 끝 (역전)
    if (sub.start_time >= sub.end_time) {
      warnings.push({
        index: i,
        type: 'reversed',
        message: `#${i + 1}: 시작 시간이 끝 시간보다 늦습니다`,
      });
      continue; // 역전이면 0초 검사는 의미 없음
    }

    // 0.1초 미만
    if (sub.end_time - sub.start_time < 0.1) {
      warnings.push({
        index: i,
        type: 'zero_duration',
        message: `#${i + 1}: 자막 길이가 너무 짧습니다 (0.1초 미만)`,
      });
    }

    // 다음 자막과 겹침 (0.05초 허용 오차 = floating point 경계 공유 대응)
    if (i < subtitles.length - 1) {
      const next = subtitles[i + 1];
      const overlap = sub.end_time - next.start_time;
      if (overlap > 0.05) {
        warnings.push({
          index: i,
          type: 'overlap',
          message: `#${i + 1}과 #${i + 2}가 ${overlap.toFixed(1)}초 겹칩니다`,
        });
      }
    }
  }

  return warnings;
}

/** 겹친 자막을 중간 지점 기준으로 자동 수정 */
export function autoFixOverlaps(subtitles: SubtitleSegment[]): SubtitleSegment[] {
  const fixed = subtitles.map(s => ({ ...s }));
  for (let i = 0; i < fixed.length - 1; i++) {
    if (fixed[i].end_time > fixed[i + 1].start_time) {
      const mid = (fixed[i].end_time + fixed[i + 1].start_time) / 2;
      const snapped = Math.round(mid * 10) / 10;
      fixed[i].end_time = snapped;
      fixed[i + 1].start_time = snapped;
    }
  }
  return fixed;
}

// ── 읽기 속도 ──

const CHARS_PER_SECOND_MIN = 4;
const CHARS_PER_SECOND_WARN = 10;
const CHARS_PER_SECOND_MAX = 12;

export type ReadSpeedLevel = 'ok' | 'fast' | 'too_fast' | 'slow';

export interface ReadSpeedHint {
  index: number;
  charsPerSecond: number;
  level: ReadSpeedLevel;
  message: string;
}

/** 자막별 한국어 읽기 속도 (공백 제외 글자/초) */
export function checkReadSpeed(subtitles: SubtitleSegment[]): ReadSpeedHint[] {
  return subtitles.map((sub, i) => {
    const duration = sub.end_time - sub.start_time;
    if (duration <= 0) {
      return { index: i, charsPerSecond: 0, level: 'ok', message: '' };
    }
    const charCount = sub.text.replace(/\s/g, '').length;
    if (charCount === 0) {
      return { index: i, charsPerSecond: 0, level: 'ok', message: '' };
    }
    const cps = charCount / duration;
    const cpsLabel = cps.toFixed(0);

    if (cps > CHARS_PER_SECOND_MAX) {
      return {
        index: i,
        charsPerSecond: cps,
        level: 'too_fast',
        message: `${charCount}자 / ${duration.toFixed(1)}초 → 너무 빠름 (초당 ${cpsLabel}자)`,
      };
    }
    if (cps > CHARS_PER_SECOND_WARN) {
      return {
        index: i,
        charsPerSecond: cps,
        level: 'fast',
        message: `${charCount}자 / ${duration.toFixed(1)}초 → 빠름 (초당 ${cpsLabel}자)`,
      };
    }
    if (cps < CHARS_PER_SECOND_MIN) {
      return {
        index: i,
        charsPerSecond: cps,
        level: 'slow',
        message: `${charCount}자 / ${duration.toFixed(1)}초 → 느림`,
      };
    }
    return { index: i, charsPerSecond: cps, level: 'ok', message: '' };
  });
}

// ══════════════════════════════════════════════════════════════════
// 시간 경고 UI
// ══════════════════════════════════════════════════════════════════

interface TimeWarningsProps {
  warnings: TimeWarning[];
  onAutoFixOverlaps: () => void;
}

export function TimeWarnings({ warnings, onAutoFixOverlaps }: TimeWarningsProps) {
  if (warnings.length === 0) return null;

  const hasOverlap = warnings.some(w => w.type === 'overlap');

  return (
    <div className="mb-3 space-y-1">
      {warnings.map((w, i) => (
        <div
          key={`${w.index}_${w.type}_${i}`}
          className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-700"
        >
          <span>⚠️</span>
          <span className="flex-1 truncate">{w.message}</span>
          {w.type === 'overlap' && hasOverlap && i === warnings.findIndex(x => x.type === 'overlap') && (
            <button
              type="button"
              onClick={onAutoFixOverlaps}
              className="shrink-0 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
            >
              겹침 자동 수정
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 읽기속도 뱃지
// ══════════════════════════════════════════════════════════════════

export function ReadSpeedBadge({ hint }: { hint: ReadSpeedHint }) {
  if (hint.level === 'ok') return null;

  const className =
    hint.level === 'too_fast'
      ? 'bg-red-50 text-red-600 border-red-200'
      : hint.level === 'fast'
      ? 'bg-orange-50 text-orange-600 border-orange-200'
      : 'bg-slate-50 text-slate-500 border-slate-200';

  return (
    <div className={`mt-1 text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${className}`}>
      <span>⏱</span>
      <span>{hint.message}</span>
      {hint.level === 'too_fast' && <span className="opacity-70">— Enter로 분할 추천</span>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SubtitleTimeline — 가로 타임라인 바
// ══════════════════════════════════════════════════════════════════

interface SubtitleTimelineProps {
  subtitles: SubtitleSegment[];
  totalDuration: number;
  /** 다중 선택된 자막 인덱스 집합 (모든 블록에 ring 표시) */
  selectedIndices: Set<number>;
  /** 마지막 단일 클릭한 anchor — 하단 정보 표시 + 단일 선택 강조용 */
  anchorIndex: number | null;
  readSpeeds: ReadSpeedHint[];
  /** 영상 현재 재생 시간 — 빨간 마커 표시. undefined면 마커 없음 */
  playTime?: number;
  onSelect: (index: number, modifiers?: { ctrl?: boolean; shift?: boolean }) => void;
  onTimeChange: (index: number, field: 'start_time' | 'end_time', value: number) => void;
  onBlockMove: (index: number, newStart: number) => void;
}

interface DragState {
  index: number;
  type: 'left' | 'right' | 'move';
  startX: number;
  originalStart: number;
  originalEnd: number;
  containerWidth: number;
}

export default function SubtitleTimeline({
  subtitles,
  totalDuration,
  selectedIndices,
  anchorIndex,
  readSpeeds,
  playTime,
  onSelect,
  onTimeChange,
  onBlockMove,
}: SubtitleTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);

  const safeDuration = totalDuration > 0 ? totalDuration : 1;

  // 드래그 시작
  const handleMouseDown = (
    e: React.MouseEvent,
    index: number,
    type: 'left' | 'right' | 'move',
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const sub = subtitles[index];
    const containerWidth = containerRef.current?.clientWidth || 800;
    setDragging({
      index,
      type,
      startX: e.clientX,
      originalStart: sub.start_time,
      originalEnd: sub.end_time,
      containerWidth,
    });
  };

  // 드래그 중 (전역 mousemove/mouseup 리스너)
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const dt = (dx / dragging.containerWidth) * safeDuration;
      const snap = (t: number) => Math.round(t * 10) / 10; // 0.1초 단위

      if (dragging.type === 'left') {
        const proposed = snap(Math.max(0, dragging.originalStart + dt));
        // 최소 0.2초 폭 보장
        if (proposed < dragging.originalEnd - 0.2) {
          onTimeChange(dragging.index, 'start_time', proposed);
        }
      } else if (dragging.type === 'right') {
        const proposed = snap(Math.min(safeDuration, dragging.originalEnd + dt));
        if (proposed > dragging.originalStart + 0.2) {
          onTimeChange(dragging.index, 'end_time', proposed);
        }
      } else if (dragging.type === 'move') {
        const duration = dragging.originalEnd - dragging.originalStart;
        const proposed = snap(
          Math.max(0, Math.min(safeDuration - duration, dragging.originalStart + dt)),
        );
        onBlockMove(dragging.index, proposed);
      }
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, safeDuration, onTimeChange, onBlockMove]);

  // 시간 눈금 (5/10/15초 간격)
  const interval = safeDuration <= 30 ? 5 : safeDuration <= 60 ? 10 : 15;
  const timeMarkers: number[] = [];
  for (let t = 0; t <= safeDuration; t += interval) {
    timeMarkers.push(t);
  }
  // 마지막이 정확히 끝과 안 맞으면 끝값 추가
  if (timeMarkers[timeMarkers.length - 1] !== safeDuration && safeDuration - timeMarkers[timeMarkers.length - 1] > interval / 2) {
    timeMarkers.push(safeDuration);
  }

  if (subtitles.length === 0) return null;

  return (
    <div className="mb-3 select-none">
      {/* 시간 눈금 */}
      <div className="relative h-4 mb-1 text-[9px] text-slate-400">
        {timeMarkers.map(t => {
          const left = Math.min(100, Math.max(0, (t / safeDuration) * 100));
          return (
            <span
              key={t}
              className="absolute -translate-x-1/2 tabular-nums"
              style={{ left: `${left}%` }}
            >
              {formatTimeShort(t)}
            </span>
          );
        })}
      </div>

      {/* 타임라인 바 */}
      <div
        ref={containerRef}
        className="relative h-9 bg-slate-100 rounded-lg overflow-hidden border border-slate-200"
      >
        {subtitles.map((sub, i) => {
          const left = Math.max(0, (sub.start_time / safeDuration) * 100);
          const widthPct = ((sub.end_time - sub.start_time) / safeDuration) * 100;
          const width = Math.max(widthPct, 0.6); // 최소 가시폭
          const isSelected = selectedIndices.has(i);
          const isAnchor = anchorIndex === i;
          const hasHigh = sub.violations?.some(v => v.severity === 'high');
          const hasMedium = sub.violations?.some(v => v.severity === 'medium');
          const speed = readSpeeds[i]?.level;

          // 색상 우선순위: 의료광고법 high > medium > 읽기속도 too_fast/fast > 기본
          // 선택 시(set 안에 있을 때) 진하게
          let bgColor: string;
          if (hasHigh) {
            bgColor = isSelected ? 'bg-red-500' : 'bg-red-400/80 hover:bg-red-500';
          } else if (hasMedium) {
            bgColor = isSelected ? 'bg-amber-500' : 'bg-amber-400/80 hover:bg-amber-500';
          } else if (speed === 'too_fast') {
            bgColor = isSelected ? 'bg-orange-500' : 'bg-orange-400/80 hover:bg-orange-500';
          } else if (speed === 'fast') {
            bgColor = isSelected ? 'bg-orange-400' : 'bg-orange-300/80 hover:bg-orange-400';
          } else {
            bgColor = isSelected ? 'bg-blue-600' : 'bg-blue-400/80 hover:bg-blue-500';
          }

          // anchor(주 선택)는 외곽 ring 강조, 그 외 다중 선택은 약한 ring
          let ringClass = 'z-10';
          if (isAnchor) ringClass = 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-100 z-20';
          else if (isSelected) ringClass = 'ring-1 ring-blue-400 z-10';

          return (
            <div
              key={sub.id ?? `tl_${i}`}
              className={`absolute top-0.5 bottom-0.5 ${bgColor} ${ringClass} rounded-md transition-colors duration-100 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden`}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(e) => onSelect(i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
              title={`#${i + 1} · ${sub.text.slice(0, 40)}${sub.text.length > 40 ? '…' : ''}`}
            >
              {/* 왼쪽 리사이즈 핸들 */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-black/30 z-30"
                onMouseDown={e => handleMouseDown(e, i, 'left')}
              />

              {/* 본문 영역 (드래그=이동) */}
              <span
                className="truncate px-1.5 cursor-move pointer-events-auto"
                onMouseDown={e => handleMouseDown(e, i, 'move')}
              >
                {width > 3 ? `#${i + 1}` : ''}
              </span>

              {/* 오른쪽 리사이즈 핸들 */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-black/30 z-30"
                onMouseDown={e => handleMouseDown(e, i, 'right')}
              />
            </div>
          );
        })}

        {/* 영상 재생 위치 마커 (빨간 세로선 + 위쪽 삼각형) */}
        {typeof playTime === 'number' && playTime > 0 && playTime <= safeDuration && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-40 pointer-events-none"
            style={{ left: `${Math.min(100, Math.max(0, (playTime / safeDuration) * 100))}%` }}
          >
            <div className="absolute -top-[3px] -left-[3px] w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-red-500" />
          </div>
        )}
      </div>

      {/* 선택 정보: 1개면 단일 자막 정보, 여러 개면 카운트만 */}
      {selectedIndices.size === 1 && anchorIndex !== null && subtitles[anchorIndex] && (
        <div className="mt-1 text-[10px] text-slate-500 tabular-nums">
          선택: <span className="font-bold text-slate-700">#{anchorIndex + 1}</span>
          <span className="mx-1">·</span>
          {formatTimeShort(subtitles[anchorIndex].start_time)} ~ {formatTimeShort(subtitles[anchorIndex].end_time)}
          <span className="mx-1">·</span>
          {(subtitles[anchorIndex].end_time - subtitles[anchorIndex].start_time).toFixed(1)}초
        </div>
      )}
      {selectedIndices.size > 1 && (
        <div className="mt-1 text-[10px] text-blue-600 font-bold tabular-nums">
          {selectedIndices.size}개 선택됨
        </div>
      )}
    </div>
  );
}

// ── 시간 포맷 ──

function formatTimeShort(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
