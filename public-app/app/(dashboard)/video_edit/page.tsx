'use client';

import { useState, useRef, useCallback } from 'react';
import { validateMedicalAd, countViolations, CATEGORY_LABELS, type ViolationResult } from '../../../lib/medicalAdValidation';
import { downloadSrt, type SrtSegment } from '../../../lib/srtUtils';

// ── 공통 상수 ──

type Tab = 'silence' | 'subtitle';
type Intensity = 'soft' | 'normal' | 'tight';
type SubtitleStyle = 'basic' | 'highlight' | 'single_line';
type SubtitlePosition = 'top' | 'center' | 'bottom';

const ACCEPT_TYPES = '.mp4,.mov,.avi,.mp3,.wav,.aac,.m4a';
const MAX_SIZE_MB = 500;
const MAX_DURATION_SEC = 600;

// ── 무음 제거 옵션 ──

const INTENSITY_OPTIONS: { id: Intensity; label: string; desc: string }[] = [
  { id: 'soft', label: '부드럽게', desc: '자연스러운 호흡 유지 — 원장님 설명 영상에 추천' },
  { id: 'normal', label: '보통', desc: '적절한 무음 제거 — 대부분의 영상에 추천' },
  { id: 'tight', label: '빡빡하게', desc: '최대한 잘라내기 — 빠른 템포의 쇼츠에 추천' },
];

// ── 자막 스타일 옵션 ──

const SUBTITLE_STYLE_OPTIONS: { id: SubtitleStyle; label: string; desc: string }[] = [
  { id: 'basic', label: '기본', desc: '깔끔한 하단 자막 — 일반 영상에 추천' },
  { id: 'highlight', label: '강조', desc: '단어별 하이라이트 — 쇼츠/릴스에 추천' },
  { id: 'single_line', label: '한 줄씩', desc: '한 문장씩 중앙 표시 — 인터뷰 영상에 추천' },
];

const SUBTITLE_POSITION_OPTIONS: { id: SubtitlePosition; label: string }[] = [
  { id: 'top', label: '상단' },
  { id: 'center', label: '중앙' },
  { id: 'bottom', label: '하단' },
];

// ── 자막 세그먼트 타입 ──

interface SubtitleSegment {
  start_time: number;
  end_time: number;
  text: string;
  violations: ViolationResult[];
}

// ── 무음 제거 결과 ──

interface SilenceRemoveResult {
  download_url: string;
  original_duration: number;
  result_duration: number;
  removed_seconds: number;
  removed_percent: number;
}

// ── 유틸 ──

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

// ══════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════

export default function VideoEditPage() {
  const [activeTab, setActiveTab] = useState<Tab>('silence');

  return (
    <div className="p-5 max-w-3xl mx-auto min-h-[calc(100vh-80px)]" style={{ paddingTop: '6vh' }}>

      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          🎬 영상 편집
        </h1>
        <p className="text-sm text-slate-500 mt-1.5">
          AI로 무음 제거, 자막 생성을 한 곳에서
        </p>
      </div>

      {/* 탭 전환 */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
        {([
          { id: 'silence' as Tab, label: '✂️ 무음 제거' },
          { id: 'subtitle' as Tab, label: '💬 AI 자막 생성' },
        ]).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 내용 — 상태 유지를 위해 display로 전환 */}
      <div style={{ display: activeTab === 'silence' ? 'block' : 'none' }}>
        <SilenceRemoveTab />
      </div>
      <div style={{ display: activeTab === 'subtitle' ? 'block' : 'none' }}>
        <SubtitleGenerateTab />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// 무음 제거 탭 (기존 로직 그대로)
// ══════════════════════════════════════════

function SilenceRemoveTab() {
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SilenceRemoveResult | null>(null);

  const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|avi)$/i.test(f.name);

  const handleFile = useCallback((f: File) => {
    setError(''); setResult(null);
    if (f.size > MAX_SIZE_MB * 1024 * 1024) { setError(`파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다.`); return; }
    setFile(f);
    const url = URL.createObjectURL(f);
    const el = document.createElement(isVideo(f) ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { setFileDuration(el.duration); URL.revokeObjectURL(url); if (el.duration > MAX_DURATION_SEC) setError(`영상 길이가 ${Math.round(MAX_DURATION_SEC / 60)}분을 초과합니다.`); };
    el.onerror = () => URL.revokeObjectURL(url);
    el.src = url;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }, [handleFile]);

  const handleProcess = async () => {
    if (!file || isProcessing) return;
    if (fileDuration > MAX_DURATION_SEC) return;
    setIsProcessing(true); setProgress('파일 업로드 중...'); setError(''); setResult(null);
    try {
      // TODO: 백엔드 API 구현 후 연동
      setProgress('무음 구간 분석 중...'); await new Promise(r => setTimeout(r, 1500));
      setProgress('무음 구간 제거 중...'); await new Promise(r => setTimeout(r, 1500));
      setProgress('결과 파일 생성 중...'); await new Promise(r => setTimeout(r, 1000));
      const removedPercent = intensity === 'soft' ? 12 : intensity === 'normal' ? 22 : 35;
      const removedSec = fileDuration * (removedPercent / 100);
      setResult({ download_url: '', original_duration: fileDuration, result_duration: fileDuration - removedSec, removed_seconds: removedSec, removed_percent: removedPercent });
    } catch (err) { setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.'); }
    finally { setIsProcessing(false); setProgress(''); }
  };

  return (
    <div className="space-y-6">
      {/* 업로드 */}
      <FileUploadArea file={file} dragOver={dragOver} fileDuration={fileDuration} fileInputRef={fileInputRef}
        onFile={handleFile} onDragOver={() => setDragOver(true)} onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop} onClear={() => { setFile(null); setFileDuration(0); setResult(null); setError(''); }} />

      {/* 편집 강도 */}
      {file && !result && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-500">편집 강도</label>
          <div className="grid grid-cols-3 gap-3">
            {INTENSITY_OPTIONS.map(opt => (
              <button key={opt.id} type="button" onClick={() => setIntensity(opt.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${intensity === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                <div className={`text-sm font-bold ${intensity === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>}

      {/* 실행 */}
      {file && !result && (
        <button type="button" onClick={handleProcess} disabled={isProcessing || fileDuration > MAX_DURATION_SEC || !!error}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2">
          {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : (<>✂️ 무음 제거 시작</>)}
        </button>
      )}

      {/* 결과 */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 text-lg font-black text-slate-800"><span>✅</span> 처리 완료</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center"><div className="text-xs text-slate-500 mb-1">원본 길이</div><div className="text-lg font-bold text-slate-800">{formatDuration(result.original_duration)}</div></div>
            <div className="bg-blue-50 rounded-xl p-4 text-center"><div className="text-xs text-blue-600 mb-1">결과 길이</div><div className="text-lg font-bold text-blue-700">{formatDuration(result.result_duration)}</div></div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center"><div className="text-xs text-emerald-600 mb-1">단축</div><div className="text-lg font-bold text-emerald-700">-{formatDuration(result.removed_seconds)} ({Math.round(result.removed_percent)}%)</div></div>
          </div>
          {file && (
            <div className="rounded-xl overflow-hidden bg-black">
              {file.type.startsWith('video/') ? (
                <video controls className="w-full max-h-[300px]" src={result.download_url || URL.createObjectURL(file)} />
              ) : (
                <audio controls className="w-full" src={result.download_url || URL.createObjectURL(file)} />
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => { if (!result.download_url) return; const a = document.createElement('a'); a.href = result.download_url; a.download = `edited_${file?.name || 'output'}`; a.click(); }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm flex items-center justify-center gap-2">📥 다운로드</button>
            <button type="button" onClick={() => { setFile(null); setFileDuration(0); setResult(null); setError(''); }}
              className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">새 파일</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// AI 자막 생성 탭
// ══════════════════════════════════════════

function SubtitleGenerateTab() {
  // ── 업로드 ──
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 옵션 ──
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>('highlight');
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>('bottom');
  const [dentalTerms, setDentalTerms] = useState(true);

  // ── 처리 ──
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  // ── 결과 ──
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [stats, setStats] = useState<{ total: number; duration: number; high: number; medium: number } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|avi)$/i.test(f.name);

  const handleFile = useCallback((f: File) => {
    setError(''); setSubtitles([]); setStats(null);
    if (f.size > MAX_SIZE_MB * 1024 * 1024) { setError(`파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다.`); return; }
    setFile(f);
    const url = URL.createObjectURL(f);
    const el = document.createElement(isVideo(f) ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { setFileDuration(el.duration); URL.revokeObjectURL(url); if (el.duration > MAX_DURATION_SEC) setError(`영상 길이가 ${Math.round(MAX_DURATION_SEC / 60)}분을 초과합니다.`); };
    el.onerror = () => URL.revokeObjectURL(url);
    el.src = url;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }, [handleFile]);

  // ── 자막 생성 실행 ──
  const handleGenerate = async () => {
    if (!file || isProcessing) return;
    if (fileDuration > MAX_DURATION_SEC) return;

    setIsProcessing(true);
    setProgress('음성을 분석하고 있습니다...');
    setError('');
    setSubtitles([]);
    setStats(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subtitle_style', subtitleStyle);
      formData.append('subtitle_position', subtitlePosition);
      formData.append('dental_terms', String(dentalTerms));

      setProgress('자막을 생성하고 있습니다...');

      const res = await fetch('/api/video/generate-subtitles', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '자막 생성에 실패했습니다.');
      }

      setSubtitles(data.subtitles || []);
      setStats({
        total: data.total_segments,
        duration: data.total_speech_duration,
        high: data.high_violation_count,
        medium: data.medium_violation_count,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : '자막 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  // ── 자막 텍스트 편집 ──
  const updateSubtitleText = (idx: number, text: string) => {
    setSubtitles(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const violations = validateMedicalAd(text);
      return { ...s, text, violations };
    }));
    // 통계 재계산
    setStats(prev => {
      if (!prev) return prev;
      const all = subtitles.map((s, i) => i === idx ? validateMedicalAd(text) : s.violations).flat();
      const counts = countViolations(all);
      return { ...prev, high: counts.high, medium: counts.medium };
    });
  };

  // ── SRT 다운로드 ──
  const handleDownloadSrt = () => {
    const srtSegments: SrtSegment[] = subtitles.map(s => ({ start_time: s.start_time, end_time: s.end_time, text: s.text }));
    const name = file?.name.replace(/\.[^.]+$/, '') || 'subtitles';
    downloadSrt(srtSegments, name);
  };

  const hasResult = subtitles.length > 0;

  return (
    <div className="space-y-6">
      {/* 업로드 */}
      <FileUploadArea file={file} dragOver={dragOver} fileDuration={fileDuration} fileInputRef={fileInputRef}
        onFile={handleFile} onDragOver={() => setDragOver(true)} onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop} onClear={() => { setFile(null); setFileDuration(0); setSubtitles([]); setStats(null); setError(''); }} />

      {/* 옵션 */}
      {file && !hasResult && (
        <div className="space-y-5">
          {/* 자막 스타일 */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500">자막 스타일</label>
            <div className="grid grid-cols-3 gap-3">
              {SUBTITLE_STYLE_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => setSubtitleStyle(opt.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${subtitleStyle === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${subtitleStyle === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 자막 위치 */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500">자막 위치</label>
            <div className="flex gap-2">
              {SUBTITLE_POSITION_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => setSubtitlePosition(opt.id)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${subtitlePosition === opt.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 치과 용어 토글 */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="text-sm font-bold text-slate-700">치과 용어 자동 인식</div>
              <div className="text-[11px] text-slate-500 mt-0.5">임플란트, 지르코니아 등 치과 용어를 정확하게 인식합니다</div>
            </div>
            <button type="button" onClick={() => setDentalTerms(!dentalTerms)}
              className={`relative w-11 h-6 rounded-full transition-colors ${dentalTerms ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${dentalTerms ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>}

      {/* 실행 */}
      {file && !hasResult && (
        <button type="button" onClick={handleGenerate} disabled={isProcessing || fileDuration > MAX_DURATION_SEC || !!error}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2">
          {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : (<>💬 자막 생성 시작</>)}
        </button>
      )}

      {/* ── 결과 ── */}
      {hasResult && stats && (
        <div className="space-y-5">
          {/* 통계 카드 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">총 자막 수</div>
              <div className="text-lg font-bold text-slate-800">{stats.total}개</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-blue-600 mb-0.5">총 음성 길이</div>
              <div className="text-lg font-bold text-blue-700">{formatDuration(stats.duration)}</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-red-600 mb-0.5">위반 높음</div>
              <div className="text-lg font-bold text-red-700">{stats.high}건</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-amber-600 mb-0.5">주의</div>
              <div className="text-lg font-bold text-amber-700">{stats.medium}건</div>
            </div>
          </div>

          {/* 자막 타임라인 */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">자막 미리보기</span>
              <span className="text-[10px] text-slate-400">클릭하여 편집 가능</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">
              {subtitles.map((seg, idx) => {
                const isEditing = editingIdx === idx;
                const hasHighViolation = seg.violations.some(v => v.severity === 'high');
                const hasMediumViolation = seg.violations.some(v => v.severity === 'medium');
                const bgColor = hasHighViolation ? 'bg-red-50/50' : hasMediumViolation ? 'bg-amber-50/50' : '';

                return (
                  <div key={idx} className={`px-5 py-3 hover:bg-slate-50 transition-colors ${bgColor}`}>
                    <div className="flex items-start gap-3">
                      {/* 타임코드 */}
                      <div className="text-[10px] text-slate-400 font-mono pt-0.5 whitespace-nowrap min-w-[100px]">
                        {formatTimecode(seg.start_time)} — {formatTimecode(seg.end_time)}
                      </div>

                      {/* 텍스트 */}
                      <div className="flex-1">
                        {isEditing ? (
                          <input
                            type="text"
                            value={seg.text}
                            onChange={e => updateSubtitleText(idx, e.target.value)}
                            onBlur={() => setEditingIdx(null)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditingIdx(null); }}
                            autoFocus
                            className="w-full px-2 py-1 text-sm text-slate-800 border border-blue-400 rounded-lg outline-none bg-white focus:ring-2 focus:ring-blue-200"
                          />
                        ) : (
                          <div onClick={() => setEditingIdx(idx)} className="text-sm text-slate-800 cursor-text rounded px-1 -mx-1 hover:bg-blue-50">
                            {renderHighlightedText(seg.text, seg.violations)}
                          </div>
                        )}

                        {/* 위반 경고 */}
                        {seg.violations.length > 0 && !isEditing && (
                          <div className="mt-1.5 space-y-1">
                            {seg.violations.map((v, vi) => (
                              <div key={vi} className={`text-[10px] flex items-start gap-1.5 ${v.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`}>
                                <span className="mt-0.5">{v.severity === 'high' ? '⛔' : '⚠️'}</span>
                                <span>
                                  <span className="font-bold">&apos;{v.keyword}&apos;</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  {v.suggestion}
                                  <span className="text-slate-400 ml-1">({CATEGORY_LABELS[v.category]})</span>
                                </span>
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

          {/* 다운로드 + 새로 */}
          <div className="flex gap-3">
            <button type="button" onClick={handleDownloadSrt}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm flex items-center justify-center gap-2">
              📥 SRT 다운로드
            </button>
            <button type="button"
              onClick={() => { setSubtitles([]); setStats(null); }}
              className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
              다시 생성
            </button>
            <button type="button"
              onClick={() => { setFile(null); setFileDuration(0); setSubtitles([]); setStats(null); setError(''); }}
              className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
              새 파일
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// 공통 컴포넌트: 파일 업로드 영역
// ══════════════════════════════════════════

function FileUploadArea({
  file, dragOver, fileDuration, fileInputRef,
  onFile, onDragOver, onDragLeave, onDrop, onClear,
}: {
  file: File | null;
  dragOver: boolean;
  fileDuration: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
}) {
  const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|avi)$/i.test(f.name);

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
        dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30'
      }`}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={() => onDragLeave()}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input ref={fileInputRef} type="file" accept={ACCEPT_TYPES} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

      {file ? (
        <div className="space-y-2">
          <div className="text-3xl">{isVideo(file) ? '🎬' : '🎵'}</div>
          <p className="text-sm font-bold text-slate-800">{file.name}</p>
          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <span>{formatFileSize(file.size)}</span>
            {fileDuration > 0 && <span>{formatDuration(fileDuration)}</span>}
          </div>
          <button type="button"
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="mt-2 text-xs text-red-500 hover:text-red-700 font-semibold">
            파일 변경
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-4xl text-slate-300">📁</div>
          <p className="text-sm font-semibold text-slate-600">영상 또는 오디오 파일을 드래그하거나 클릭하여 선택</p>
          <p className="text-xs text-slate-400">MP4, MOV, AVI, MP3, WAV, AAC, M4A · 최대 {MAX_SIZE_MB}MB · 최대 {MAX_DURATION_SEC / 60}분</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// 헬퍼: 위반 키워드 하이라이트 렌더링
// ══════════════════════════════════════════

function renderHighlightedText(text: string, violations: ViolationResult[]): React.ReactNode {
  if (violations.length === 0) return text;

  // 키워드별 위치 찾기 (긴 것 우선)
  const sorted = [...violations].sort((a, b) => b.keyword.length - a.keyword.length);
  const spans: Array<{ start: number; end: number; severity: 'high' | 'medium'; keyword: string }> = [];

  for (const v of sorted) {
    let idx = 0;
    while ((idx = text.indexOf(v.keyword, idx)) !== -1) {
      const overlap = spans.some(s => idx < s.end && idx + v.keyword.length > s.start);
      if (!overlap) {
        spans.push({ start: idx, end: idx + v.keyword.length, severity: v.severity, keyword: v.keyword });
      }
      idx += v.keyword.length;
    }
  }

  if (spans.length === 0) return text;

  spans.sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    const cls = span.severity === 'high'
      ? 'bg-red-200 text-red-800 px-0.5 rounded font-semibold'
      : 'bg-amber-200 text-amber-800 px-0.5 rounded font-semibold';
    parts.push(
      <span key={span.start} className={cls} title={`${span.severity === 'high' ? '위반 높음' : '주의'}: ${span.keyword}`}>
        {text.slice(span.start, span.end)}
      </span>
    );
    cursor = span.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}
