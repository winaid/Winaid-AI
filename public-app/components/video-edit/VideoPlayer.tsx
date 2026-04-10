'use client';

/**
 * VideoPlayer — 영상/오디오 통합 미리보기 플레이어
 *
 * 기능:
 *  - 영상(mp4/mov/webm): HTML5 video
 *  - 오디오(mp3/wav/m4a/aac): HTML5 audio + 간단한 시각 표시
 *  - 재생/일시정지, 시크바, 시간 표시
 *  - 재생 속도 (0.5/1/1.5/2x)
 *  - 전체화면 (영상만)
 *  - 시간 콜백 (자막 동기화용)
 *  - imperative handle: seekTo/play/pause — 외부에서 컨트롤 가능
 *
 * 사용:
 *   <VideoPlayer src={url} compact />               // STEP 카드 안
 *   <VideoPlayer src={url} className="w-full" />    // 큰 버전
 *
 *   // 외부 컨트롤 (2/2 자막 동기화 등)
 *   const playerRef = useRef<VideoPlayerHandle>(null);
 *   <VideoPlayer ref={playerRef} src={url} />
 *   playerRef.current?.seekTo(5.2);
 */

import { useState, useRef, useEffect, useCallback, useImperativeHandle, type Ref } from 'react';

export interface VideoPlayerHandle {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

export interface VideoPlayerProps {
  /** blob URL 또는 https URL. null이면 플레이스홀더 표시 */
  src: string | null;
  /** 명시 안 하면 src 확장자로 자동 감지 */
  type?: 'video' | 'audio';
  /** 재생 시간 콜백 — 자막 동기화에 사용 */
  onTimeUpdate?: (currentTime: number) => void;
  /** 메타데이터 로드 후 길이 콜백 */
  onDurationChange?: (duration: number) => void;
  className?: string;
  /** 작은 버전 (STEP 카드 안에 들어갈 때) */
  compact?: boolean;
  autoPlay?: boolean;
  /** 특정 시간부터 재생 시작 */
  startTime?: number;
  /** 컨트롤 바 표시 — 기본 true */
  showControls?: boolean;
  /** 영상 가로세로 비율 ('9/16', '16/9', '1/1' 등) */
  aspectRatio?: string;
  /** ref — imperative handle 노출 (React 19 props.ref 패턴) */
  ref?: Ref<VideoPlayerHandle>;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;

/** src 확장자로 audio/video 자동 감지 */
function detectMediaType(src: string | null): 'video' | 'audio' {
  if (!src) return 'video';
  // blob URL은 확장자가 없으므로 video로 간주 (호출부에서 type prop으로 명시 권장)
  return /\.(mp3|wav|aac|m4a|ogg)(\?|$)/i.test(src) ? 'audio' : 'video';
}

export default function VideoPlayer({
  src,
  type,
  onTimeUpdate,
  onDurationChange,
  className = '',
  compact = false,
  autoPlay = false,
  startTime,
  showControls = true,
  aspectRatio,
  ref,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const mediaType = type || detectMediaType(src);

  // 현재 미디어 엘리먼트 (video/audio 분기)
  const getMediaEl = useCallback((): HTMLMediaElement | null => {
    return mediaType === 'video' ? videoRef.current : audioRef.current;
  }, [mediaType]);

  // ── 외부 imperative API ──
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      const el = getMediaEl();
      if (!el) return;
      const safe = Math.max(0, Math.min(time, el.duration || time));
      el.currentTime = safe;
      setCurrentTime(safe);
    },
    play: () => {
      const el = getMediaEl();
      if (el) {
        el.play().then(() => setPlaying(true)).catch(() => {});
      }
    },
    pause: () => {
      const el = getMediaEl();
      if (el) {
        el.pause();
        setPlaying(false);
      }
    },
    getCurrentTime: () => getMediaEl()?.currentTime ?? 0,
  }), [getMediaEl]);

  // ── 이벤트 ──
  const togglePlay = useCallback(() => {
    const el = getMediaEl();
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }, [getMediaEl]);

  const handleTimeUpdate = useCallback(() => {
    const el = getMediaEl();
    if (!el) return;
    setCurrentTime(el.currentTime);
    onTimeUpdate?.(el.currentTime);
  }, [getMediaEl, onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    const el = getMediaEl();
    if (!el) return;
    setDuration(el.duration || 0);
    onDurationChange?.(el.duration || 0);
    if (typeof startTime === 'number' && startTime > 0) {
      el.currentTime = startTime;
      setCurrentTime(startTime);
    }
    if (autoPlay) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [getMediaEl, onDurationChange, startTime, autoPlay]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const el = getMediaEl();
    if (!el) return;
    const time = parseFloat(e.target.value);
    el.currentTime = time;
    setCurrentTime(time);
  }, [getMediaEl]);

  const cycleSpeed = useCallback(() => {
    const idx = PLAYBACK_SPEEDS.indexOf(playbackRate as typeof PLAYBACK_SPEEDS[number]);
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackRate(next);
    const el = getMediaEl();
    if (el) el.playbackRate = next;
  }, [playbackRate, getMediaEl]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    }
  }, []);

  const handleEnded = useCallback(() => setPlaying(false), []);

  // 전체화면 종료 감지 (ESC 또는 외부 트리거)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // src 변경 시 상태 초기화 (이전 영상의 잔여 상태가 안 묻게)
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  // ── 플레이스홀더 ──
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 rounded-lg ${compact ? 'h-24' : 'h-48'} ${className}`}>
        <span className="text-xs text-slate-400">처리 후 여기서 미리볼 수 있습니다</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative bg-black rounded-lg overflow-hidden group ${className}`}>
      {/* 미디어 요소 */}
      {mediaType === 'video' ? (
        <video
          ref={videoRef}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          className={`w-full ${compact ? 'max-h-48' : 'max-h-[480px]'} object-contain`}
          style={aspectRatio ? { aspectRatio } : undefined}
          playsInline
          onClick={togglePlay}
        />
      ) : (
        <div className={`flex items-center justify-center ${compact ? 'h-24' : 'h-32'} bg-gradient-to-b from-slate-800 to-slate-900`}>
          <audio
            ref={audioRef}
            src={src}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            preload="metadata"
          />
          <button
            type="button"
            onClick={togglePlay}
            className="text-5xl hover:scale-110 transition-transform"
            aria-label={playing ? '일시정지' : '재생'}
          >
            {playing ? '🔊' : '🔈'}
          </button>
        </div>
      )}

      {/* 재생 오버레이 (영상 + 일시정지 상태일 때만) */}
      {mediaType === 'video' && !playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="재생"
        >
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <span className="text-2xl ml-1 leading-none">▶</span>
          </div>
        </button>
      )}

      {/* 컨트롤 바 */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {/* 시크바 */}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 mb-1.5 accent-blue-500 cursor-pointer"
            aria-label="시크바"
          />

          <div className="flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-2">
              <button type="button" onClick={togglePlay} className="hover:opacity-80 text-base leading-none" aria-label={playing ? '일시정지' : '재생'}>
                {playing ? '⏸' : '▶'}
              </button>
              <span className="font-mono text-[11px] tabular-nums">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cycleSpeed}
                className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded hover:bg-white/30 tabular-nums"
                title="재생 속도"
              >
                {playbackRate}x
              </button>
              {mediaType === 'video' && (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="hover:opacity-80 text-sm leading-none"
                  aria-label={isFullscreen ? '전체화면 해제' : '전체화면'}
                >
                  {isFullscreen ? '⊡' : '⛶'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// StepResultPreview — 결과 미리보기 박스 (입력 vs 결과 비교 토글)
// ══════════════════════════════════════════════════════════════════

interface StepResultPreviewProps {
  /** 처리 결과 URL — 없으면 렌더 안 함 */
  resultUrl?: string | null;
  /** 원본/입력 URL (있으면 비교 토글 표시) */
  inputUrl?: string | null;
  /** 라벨 — 예: "크롭 결과", "BGM 합성 결과" */
  label?: string;
  /** compact / aspectRatio는 그대로 VideoPlayer에 forward */
  compact?: boolean;
  aspectRatio?: string;
  className?: string;
}

export function StepResultPreview({
  resultUrl,
  inputUrl,
  label = '미리보기',
  compact = true,
  aspectRatio,
  className = '',
}: StepResultPreviewProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  if (!resultUrl) return null;

  const canCompare = !!inputUrl && inputUrl !== resultUrl;
  const displayUrl = showOriginal && canCompare ? inputUrl : resultUrl;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-[11px] font-bold text-slate-600">
          {showOriginal ? '원본' : label}
        </span>
        {canCompare && (
          <button
            type="button"
            onClick={() => setShowOriginal(!showOriginal)}
            className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline ml-auto"
          >
            {showOriginal ? '결과 보기 →' : '← 원본 비교'}
          </button>
        )}
      </div>
      <VideoPlayer
        src={displayUrl}
        compact={compact}
        aspectRatio={aspectRatio}
      />
    </div>
  );
}

// ── 시간 포맷 ──
function fmtTime(seconds: number): string {
  const safe = Math.max(0, isFinite(seconds) ? seconds : 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
