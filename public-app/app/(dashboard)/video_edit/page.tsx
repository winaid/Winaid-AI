'use client';

import { useState, useRef, useCallback } from 'react';

type Intensity = 'soft' | 'normal' | 'tight';

interface SilenceRemoveResult {
  download_url: string;
  original_duration: number;
  result_duration: number;
  removed_seconds: number;
  removed_percent: number;
}

const INTENSITY_OPTIONS: { id: Intensity; label: string; desc: string }[] = [
  { id: 'soft', label: '부드럽게', desc: '자연스러운 호흡 유지 — 원장님 설명 영상에 추천' },
  { id: 'normal', label: '보통', desc: '적절한 무음 제거 — 대부분의 영상에 추천' },
  { id: 'tight', label: '빡빡하게', desc: '최대한 잘라내기 — 빠른 템포의 쇼츠에 추천' },
];

const ACCEPT_TYPES = '.mp4,.mov,.avi,.mp3,.wav,.aac,.m4a';
const MAX_SIZE_MB = 500;
const MAX_DURATION_SEC = 600; // 10분

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VideoEditPage() {
  // ── 업로드 ──
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number>(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 설정 ──
  const [intensity, setIntensity] = useState<Intensity>('normal');

  // ── 처리 ──
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  // ── 결과 ──
  const [result, setResult] = useState<SilenceRemoveResult | null>(null);

  const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|avi)$/i.test(f.name);

  const handleFile = useCallback((f: File) => {
    setError('');
    setResult(null);

    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다.`);
      return;
    }

    setFile(f);

    // 길이 측정
    const url = URL.createObjectURL(f);
    const el = document.createElement(isVideo(f) ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      setFileDuration(el.duration);
      URL.revokeObjectURL(url);
      if (el.duration > MAX_DURATION_SEC) {
        setError(`영상 길이가 ${Math.round(MAX_DURATION_SEC / 60)}분을 초과합니다.`);
      }
    };
    el.onerror = () => { URL.revokeObjectURL(url); };
    el.src = url;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleProcess = async () => {
    if (!file || isProcessing) return;
    if (fileDuration > MAX_DURATION_SEC) return;

    setIsProcessing(true);
    setProgress('파일 업로드 중...');
    setError('');
    setResult(null);

    try {
      // TODO: 백엔드 API 구현 후 연동
      // const formData = new FormData();
      // formData.append('file', file);
      // formData.append('intensity', intensity);
      // const res = await fetch('/api/video/silence-remove', { method: 'POST', body: formData });
      // const data = await res.json() as SilenceRemoveResponse;
      // if (!res.ok) throw new Error(data.error || '처리 실패');
      // setResult(data);

      // 임시 시뮬레이션 (백엔드 미구현)
      setProgress('무음 구간 분석 중...');
      await new Promise(r => setTimeout(r, 1500));
      setProgress('무음 구간 제거 중...');
      await new Promise(r => setTimeout(r, 1500));
      setProgress('결과 파일 생성 중...');
      await new Promise(r => setTimeout(r, 1000));

      const removedPercent = intensity === 'soft' ? 12 : intensity === 'normal' ? 22 : 35;
      const removedSec = fileDuration * (removedPercent / 100);
      setResult({
        download_url: '', // TODO: 백엔드 반환 URL
        original_duration: fileDuration,
        result_duration: fileDuration - removedSec,
        removed_seconds: removedSec,
        removed_percent: removedPercent,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all';

  return (
    <div className="p-5 max-w-3xl mx-auto min-h-[calc(100vh-80px)]" style={{ paddingTop: '8vh' }}>

      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          ✂️ 영상 편집
        </h1>
        <p className="text-sm text-slate-500 mt-1.5">
          무음 구간을 AI로 자동 감지하고 제거합니다
        </p>
      </div>

      <div className="space-y-6">

        {/* ── 1. 업로드 영역 ── */}
        <div
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
            dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {file ? (
            <div className="space-y-2">
              <div className="text-3xl">{isVideo(file) ? '🎬' : '🎵'}</div>
              <p className="text-sm font-bold text-slate-800">{file.name}</p>
              <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
                <span>{formatFileSize(file.size)}</span>
                {fileDuration > 0 && <span>{formatDuration(fileDuration)}</span>}
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setFile(null); setFileDuration(0); setResult(null); setError(''); }}
                className="mt-2 text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                파일 변경
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-4xl text-slate-300">📁</div>
              <p className="text-sm font-semibold text-slate-600">
                영상 또는 오디오 파일을 드래그하거나 클릭하여 선택
              </p>
              <p className="text-xs text-slate-400">
                MP4, MOV, AVI, MP3, WAV, AAC, M4A · 최대 {MAX_SIZE_MB}MB · 최대 {MAX_DURATION_SEC / 60}분
              </p>
            </div>
          )}
        </div>

        {/* ── 2. 편집 강도 ── */}
        {file && !result && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500">편집 강도</label>
            <div className="grid grid-cols-3 gap-3">
              {INTENSITY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setIntensity(opt.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    intensity === opt.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className={`text-sm font-bold ${intensity === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 에러 ── */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">
            {error}
          </div>
        )}

        {/* ── 3. 실행 버튼 ── */}
        {file && !result && (
          <button
            type="button"
            onClick={handleProcess}
            disabled={isProcessing || fileDuration > MAX_DURATION_SEC || !!error}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {progress}
              </>
            ) : (
              <>✂️ 무음 제거 시작</>
            )}
          </button>
        )}

        {/* ── 4. 결과 ── */}
        {result && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-lg font-black text-slate-800">
              <span>✅</span> 처리 완료
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1">원본 길이</div>
                <div className="text-lg font-bold text-slate-800">{formatDuration(result.original_duration)}</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-xs text-blue-600 mb-1">결과 길이</div>
                <div className="text-lg font-bold text-blue-700">{formatDuration(result.result_duration)}</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <div className="text-xs text-emerald-600 mb-1">단축</div>
                <div className="text-lg font-bold text-emerald-700">
                  -{formatDuration(result.removed_seconds)} ({Math.round(result.removed_percent)}%)
                </div>
              </div>
            </div>

            {/* 미리보기 */}
            {file && (
              <div className="rounded-xl overflow-hidden bg-black">
                {isVideo(file) ? (
                  <video
                    controls
                    className="w-full max-h-[300px]"
                    src={result.download_url || URL.createObjectURL(file)}
                  />
                ) : (
                  <audio
                    controls
                    className="w-full"
                    src={result.download_url || URL.createObjectURL(file)}
                  />
                )}
              </div>
            )}

            {/* 다운로드 + 다시하기 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!result.download_url) {
                    setError('백엔드 API가 아직 구현되지 않았습니다. 곧 지원 예정입니다.');
                    return;
                  }
                  const a = document.createElement('a');
                  a.href = result.download_url;
                  a.download = `edited_${file?.name || 'output'}`;
                  a.click();
                }}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm flex items-center justify-center gap-2"
              >
                📥 다운로드
              </button>
              <button
                type="button"
                onClick={() => { setFile(null); setFileDuration(0); setResult(null); setError(''); }}
                className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm"
              >
                새 파일
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
