/**
 * components/card-news/DownloadPanel.tsx — C2b Step 5: 완성 카드뉴스 다운로드.
 *
 * 4 형식 (PNG/JPG/ZIP/PDF) 버튼. 클릭 시 cardDownloadUtils.downloadCardNews 호출.
 * 캡처 대상 DOM 은 off-screen wrapper 의 SlidePreview (size='export', 1080×1080).
 *
 * UX:
 *   - 버튼 클릭 → off-screen mount → html2canvas 캡처 → 다운로드 트리거
 *   - 진행률 (3/5 캡처 완료 ...) — onProgress 콜백
 *   - 모든 형식 끝나면 다시 활성화
 *
 * "처음으로" 버튼 — 새 카드뉴스 시작 (state reset, 부모 위임).
 */

'use client';

import { useRef, useState } from 'react';
import type { SlideData } from '@winaid/blog-core';
import SlidePreview from './SlidePreview';
import {
  downloadCardNews,
  sanitizeFilename,
  type DownloadFormat,
} from '../../lib/cardDownloadUtils';

interface DownloadPanelProps {
  slides: SlideData[];
  topic: string;
  hospitalName?: string;
  onRestart: () => void;
}

interface FormatSpec {
  id: DownloadFormat;
  label: string;
  desc: string;
  emoji: string;
}

const FORMATS: FormatSpec[] = [
  { id: 'png', label: 'PNG', desc: '슬라이드 N장 개별', emoji: '🖼' },
  { id: 'jpg', label: 'JPG', desc: '용량 작음, SNS', emoji: '📸' },
  { id: 'zip', label: 'ZIP', desc: 'PNG 일괄 묶음', emoji: '📦' },
  { id: 'pdf', label: 'PDF', desc: '슬라이드별 페이지', emoji: '📄' },
];

export default function DownloadPanel({
  slides,
  topic,
  hospitalName,
  onRestart,
}: DownloadPanelProps) {
  const [downloading, setDownloading] = useState<DownloadFormat | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exportRefs = useRef<Array<HTMLDivElement | null>>([]);

  const filenamePrefix = `cardnews-${sanitizeFilename(topic)}`;

  const handleDownload = async (format: DownloadFormat) => {
    setError(null);
    setProgress({ done: 0, total: slides.length });
    setDownloading(format);
    try {
      const elements = exportRefs.current.filter((el): el is HTMLDivElement => el !== null);
      if (elements.length !== slides.length) {
        throw new Error('내부 렌더 오류 — 슬라이드 DOM 준비 안 됨');
      }
      await downloadCardNews(format, {
        slideElements: elements,
        filenamePrefix,
        onProgress: (done, total) => setProgress({ done, total }),
      });
    } catch (e) {
      console.warn('[card-news/download]', e);
      setError((e as Error).message || '다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloading(null);
      setProgress(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-10">
      <header className="text-center space-y-2">
        <div className="text-4xl" aria-hidden="true">🎉</div>
        <h2 className="text-2xl font-bold text-slate-900">카드뉴스 완성!</h2>
        <p className="text-sm text-slate-500">
          원하는 형식으로 다운로드하세요. 다시 만들고 싶으면 "새로 만들기"를 누르세요.
        </p>
      </header>

      {/* 슬라이드 미리보기 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {slides.map((s) => (
          <div key={s.id} className="aspect-square">
            <SlidePreview slide={s} size="preview" hospitalName={hospitalName} />
          </div>
        ))}
      </div>

      {/* 진행 표시 */}
      {downloading && progress && (
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-indigo-800">
              {downloading.toUpperCase()} 다운로드 중... ({progress.done}/{progress.total})
            </span>
          </div>
          <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 형식 선택 버튼 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => handleDownload(f.id)}
            disabled={!!downloading}
            className={[
              'rounded-2xl border bg-white p-4 text-center space-y-1 transition-all',
              downloading
                ? 'opacity-40 cursor-not-allowed border-slate-200'
                : 'border-slate-200 hover:border-indigo-300 hover:shadow-md cursor-pointer',
              downloading === f.id ? 'border-indigo-500 bg-indigo-50' : '',
            ].join(' ')}
          >
            <div className="text-2xl">{f.emoji}</div>
            <div className="text-sm font-bold text-slate-800">{f.label}</div>
            <div className="text-[11px] text-slate-500">{f.desc}</div>
          </button>
        ))}
      </div>

      {/* 새로 만들기 */}
      <div className="text-center pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onRestart}
          disabled={!!downloading}
          className="text-sm font-semibold text-slate-500 hover:text-indigo-600 disabled:opacity-40"
        >
          ↺ 새로 만들기
        </button>
      </div>

      {/* Off-screen render — 다운로드 전용 (1080×1080 정사이즈, 화면 밖) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        {slides.map((s, i) => (
          <div
            key={`export-${s.id}`}
            ref={(el) => {
              exportRefs.current[i] = el;
            }}
          >
            <SlidePreview slide={s} size="export" hospitalName={hospitalName} />
          </div>
        ))}
      </div>
    </div>
  );
}
