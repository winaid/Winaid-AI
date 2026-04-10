'use client';

/**
 * WaveformBar — 오디오/영상 파형 시각화
 *
 * 기능:
 *  - Web Audio API로 peaks 추출 → canvas 막대 그래프 렌더링
 *  - 무음 구간 다른 색으로 표시 (silenceThreshold)
 *  - 자막/구간 오버레이 (regions prop)
 *  - 재생 위치 빨간 마커 (playTime prop)
 *  - 클릭 → 시간 점프 (onSeek prop)
 *  - DPR 대응으로 Retina 선명도
 *  - ResizeObserver 반응형
 *  - 같은 src + samples 조합은 모듈 레벨 캐시
 *  - 추출 실패 시 graceful — 빈 상태 표시, 에러 throw 안 함
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export interface WaveformRegion {
  start: number;
  end: number;
  /** 'rgba(r,g,b,a)' 형식 — 활성 시 alpha 자동 강조 */
  color: string;
  label?: string;
  active?: boolean;
}

export interface WaveformBarProps {
  src: string | null;
  duration?: number;
  playTime?: number;
  onSeek?: (time: number) => void;
  regions?: WaveformRegion[];
  /** 0~1 — 이 이하의 진폭은 무음으로 색칠 */
  silenceThreshold?: number;
  height?: number;
  barWidth?: number;
  barGap?: number;
  /** 일반 파형 색 */
  color?: string;
  /** 무음 구간 색 */
  silenceColor?: string;
  className?: string;
  /** 시간 눈금(0:00 / m:ss) 표시 */
  showTimeline?: boolean;
}

// ── 모듈 레벨 캐시 ──
type WaveformData = { peaks: number[]; duration: number };
const waveformCache = new Map<string, WaveformData>();
const MAX_CACHE = 10;

/**
 * onCtxCreated: 호출부(useEffect)가 in-flight AudioContext를 받아 언마운트/src 변경 시
 *               즉시 close()할 수 있게 한다. 브라우저 AudioContext 개수 제한(6~8개) 대응.
 */
async function extractWaveformDataCached(
  src: string,
  samples: number,
  onCtxCreated?: (ctx: AudioContext) => void,
): Promise<WaveformData> {
  const key = `${src}__${samples}`;
  const hit = waveformCache.get(key);
  if (hit) return hit;

  const data = await extractWaveformData(src, samples, onCtxCreated);

  // 캐시 크기 제한 (LRU 비슷하게: 가장 오래된 키 제거)
  if (waveformCache.size >= MAX_CACHE) {
    const firstKey = waveformCache.keys().next().value;
    if (firstKey !== undefined) waveformCache.delete(firstKey);
  }
  waveformCache.set(key, data);
  return data;
}

async function extractWaveformData(
  src: string,
  samples: number,
  onCtxCreated?: (ctx: AudioContext) => void,
): Promise<WaveformData> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();

  // Safari 호환 (webkitAudioContext)
  type AudioContextCtor = typeof AudioContext;
  const Ctx: AudioContextCtor =
    typeof window !== 'undefined'
      ? (window.AudioContext ||
          ((window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext as AudioContextCtor))
      : (undefined as unknown as AudioContextCtor);
  if (!Ctx) throw new Error('AudioContext not supported');

  const audioCtx = new Ctx();
  // 호출부가 이 ctx를 참조해서 언마운트 시 즉시 close할 수 있게 함
  onCtxCreated?.(audioCtx);

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0); // 모노 또는 왼쪽 채널
    const blockSize = Math.floor(channelData.length / samples);
    const peaks: number[] = new Array(samples).fill(0);

    if (blockSize > 0) {
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        let max = 0;
        const end = Math.min(start + blockSize, channelData.length);
        for (let j = start; j < end; j++) {
          const abs = Math.abs(channelData[j]);
          if (abs > max) max = abs;
        }
        peaks[i] = max;
      }
    }

    return { peaks, duration: audioBuffer.duration };
  } finally {
    // 'closed' state에서 close()를 다시 부르면 InvalidStateError 날 수 있어 state 체크
    if (audioCtx.state !== 'closed') {
      try { await audioCtx.close(); } catch { /* 이미 닫혔거나 무효 */ }
    }
  }
}

export default function WaveformBar({
  src,
  duration: durationProp,
  playTime = 0,
  onSeek,
  regions = [],
  silenceThreshold = 0.03,
  height = 64,
  barWidth = 2,
  barGap = 1,
  color = '#3B82F6',
  silenceColor = '#FCA5A5',
  className = '',
  showTimeline = true,
}: WaveformBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(durationProp || 0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  // 컨테이너 너비 추적 (반응형)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width || 0;
      setContainerWidth(w);
    });
    observer.observe(el);
    // 초기값
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // 파형 데이터 추출 (src/너비 변경 시)
  useEffect(() => {
    if (!src || containerWidth === 0) return;
    let cancelled = false;
    // in-flight AudioContext — unmount/src 변경 시 즉시 close하여 브라우저 제한 회피
    let inFlightCtx: AudioContext | null = null;
    setLoading(true);
    setFailed(false);

    const samples = Math.max(120, Math.floor(containerWidth / Math.max(1, barWidth + barGap)));

    extractWaveformDataCached(src, samples, (ctx) => {
      // cleanup이 먼저 뛰었으면 즉시 close
      if (cancelled) {
        if (ctx.state !== 'closed') { try { ctx.close(); } catch { /* */ } }
        return;
      }
      inFlightCtx = ctx;
    })
      .then(({ peaks: p, duration: d }) => {
        if (cancelled) return;
        setPeaks(p);
        if (!durationProp) setDuration(d);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[waveform] 추출 실패 (graceful):', err?.message || err);
        setPeaks([]);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        inFlightCtx = null; // 이미 extract 함수 finally에서 close됨
      });

    return () => {
      cancelled = true;
      // 디코딩 중이면 즉시 AudioContext를 닫아서 decodeAudioData promise를 빨리 끝낸다
      if (inFlightCtx && inFlightCtx.state !== 'closed') {
        try { inFlightCtx.close(); } catch { /* */ }
      }
      inFlightCtx = null;
    };
  }, [src, containerWidth, barWidth, barGap, durationProp]);

  // durationProp 우선
  useEffect(() => {
    if (durationProp && durationProp > 0) setDuration(durationProp);
  }, [durationProp]);

  // 캔버스 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0 || containerWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.max(1, Math.round(containerWidth * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 누적 방지
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerWidth, height);

    let maxPeak = 0;
    for (const p of peaks) if (p > maxPeak) maxPeak = p;
    if (maxPeak < 0.01) maxPeak = 0.01;

    // ── 1) 구간 오버레이 (자막 등) — 파형 뒤로 ──
    if (duration > 0) {
      for (const region of regions) {
        const x1 = (region.start / duration) * containerWidth;
        const x2 = (region.end / duration) * containerWidth;
        const w = Math.max(0.5, x2 - x1);
        // 활성 구간은 alpha를 0.30로 강조 (rgba(...,0.15) → rgba(...,0.30))
        ctx.fillStyle = region.active
          ? region.color.replace(/[\d.]+\)\s*$/, '0.30)')
          : region.color;
        ctx.fillRect(x1, 0, w, height);
      }
    }

    // ── 2) 파형 막대 ──
    const totalBars = peaks.length;
    const step = containerWidth / totalBars;
    for (let i = 0; i < totalBars; i++) {
      const normalized = peaks[i] / maxPeak;
      const barH = Math.max(1, normalized * (height - 4));
      const x = i * step;
      const y = (height - barH) / 2;
      const isSilent = peaks[i] < silenceThreshold * maxPeak;
      ctx.fillStyle = isSilent ? silenceColor : color;
      ctx.fillRect(x, y, Math.max(1, barWidth), barH);
    }

    // ── 3) 재생 위치 마커 (파형 위) ──
    if (playTime > 0 && duration > 0 && playTime <= duration) {
      const markerX = (playTime / duration) * containerWidth;
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX, 0);
      ctx.lineTo(markerX, height);
      ctx.stroke();
    }
  }, [peaks, containerWidth, height, barWidth, color, silenceColor, silenceThreshold, playTime, duration, regions]);

  // 클릭 → 시간 점프
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = (x / rect.width) * duration;
      onSeek(Math.max(0, Math.min(duration, time)));
    },
    [onSeek, duration],
  );

  // ── 빈 상태 / 로딩 / 실패 ──
  if (!src) {
    return (
      <div className={`bg-slate-100 rounded flex items-center justify-center text-[10px] text-slate-400 ${className}`} style={{ height }}>
        오디오를 로드하면 파형이 표시됩니다
      </div>
    );
  }
  if (loading) {
    return (
      <div ref={containerRef} className={`bg-slate-100 rounded flex items-center justify-center text-[10px] text-slate-400 ${className}`} style={{ height }}>
        <span className="animate-pulse">파형 분석 중...</span>
      </div>
    );
  }
  if (failed) {
    return (
      <div className={`bg-slate-50 border border-slate-200 rounded flex items-center justify-center text-[10px] text-slate-400 ${className}`} style={{ height }}>
        파형을 표시할 수 없습니다 (영상 크기가 크거나 형식이 맞지 않음)
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${onSeek ? 'cursor-pointer' : ''} ${className}`}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full rounded block"
        style={{ height }}
      />
      {showTimeline && duration > 0 && (
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 px-0.5 tabular-nums">
          <span>0:00</span>
          <span>
            {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  );
}
