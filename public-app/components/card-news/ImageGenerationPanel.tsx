/**
 * components/card-news/ImageGenerationPanel.tsx — C2b Step 4: 이미지 생성 + 슬라이드별 재생성/업로드.
 *
 * 진입 시: 부모(page.tsx)가 이미 POST /api/card-news/generate-images 호출 + 결과 전달.
 * 본 컴포넌트는 결과 표시 + per-slide 액션:
 *   - 실패 슬라이드: 빨강 표시 + "재생성" 버튼 (개별 /api/image 호출)
 *   - 성공 슬라이드: 미리보기 + "재생성" + "업로드 (drag&drop / file input)"
 *
 * 진행 표시:
 *   - 부모가 isLoading 전달 시 큰 spinner + "X/N 완료" 카운터
 *   - per-slide regen 진행은 본 컴포넌트 내부 state
 *
 * 액션:
 *   - "이전" — 텍스트 단계로 (이미지 손실 경고 모달, 부모 onBack 위임)
 *   - "다운로드 단계로" — onSubmit
 */

'use client';

import { useRef, useState } from 'react';
import type { SlideData } from '@winaid/blog-core';
import type { ThemeId } from '../../lib/cardNewsPrompt';
import SlidePreview from './SlidePreview';

interface ImageGenerationPanelProps {
  slides: SlideData[];
  failedSlides: number[];
  creditsUsed: number;
  creditsRefunded: number;
  isLoading?: boolean;
  loadingProgress?: { done: number; total: number };
  hospitalName?: string;
  /** C2-fix-1: theme preset id. SlidePreview thumb 에 전달. */
  theme?: ThemeId;
  error?: string | null;
  onSlidesChange: (next: SlideData[]) => void;
  onRegenerateSlide: (slideIndex: number) => Promise<void>;
  onBack: () => void;
  onSubmit: () => void;
}

export default function ImageGenerationPanel({
  slides,
  failedSlides,
  creditsUsed,
  creditsRefunded,
  isLoading,
  loadingProgress,
  hospitalName,
  theme,
  error,
  onSlidesChange,
  onRegenerateSlide,
  onBack,
  onSubmit,
}: ImageGenerationPanelProps) {
  const failedSet = new Set(failedSlides);
  const [regenerating, setRegenerating] = useState<Set<number>>(new Set());

  const handleRegen = async (i: number) => {
    setRegenerating((prev) => new Set(prev).add(i));
    try {
      await onRegenerateSlide(i);
    } finally {
      setRegenerating((prev) => {
        const next = new Set(prev);
        next.delete(i);
        return next;
      });
    }
  };

  const handleUpload = (slideIndex: number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      onSlidesChange(
        slides.map((s, i) => (i === slideIndex ? { ...s, imageUrl: dataUrl } : s)),
      );
    };
    reader.readAsDataURL(file);
  };

  const successCount = slides.filter((s) => s.imageUrl).length;
  const allDone = successCount === slides.length;

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-10">
      <header className="space-y-1">
        <div className="text-xs font-semibold text-indigo-600">단계 4 / 4 — 이미지 생성</div>
        <h2 className="text-xl font-bold text-slate-900">슬라이드별 이미지를 확인하세요</h2>
        <p className="text-sm text-slate-500">
          마음에 안 드는 슬라이드는 재생성하거나 직접 이미지를 업로드할 수 있습니다.
        </p>
      </header>

      {isLoading && loadingProgress && (
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-indigo-800">
              이미지 생성 중... ({loadingProgress.done}/{loadingProgress.total} 완료)
            </span>
            <span className="text-xs text-indigo-600">
              약 {Math.max(10, (loadingProgress.total - loadingProgress.done) * 12)}초 남음
            </span>
          </div>
          <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((loadingProgress.done / Math.max(1, loadingProgress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {!isLoading && (creditsUsed > 0 || creditsRefunded > 0) && (
        <div className="text-xs text-slate-500 px-1">
          크레딧 차감 {creditsUsed}건 · 실패 환불 {creditsRefunded}건
        </div>
      )}

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {slides.map((s, i) => {
          const isFailed = failedSet.has(i) && !s.imageUrl;
          const isRegen = regenerating.has(i);
          return (
            <li
              key={s.id}
              className={[
                'relative rounded-xl overflow-hidden border-2 transition-all',
                isFailed
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-slate-200 bg-white',
              ].join(' ')}
            >
              <div className="aspect-square relative">
                <SlidePreview slide={s} size="preview" hospitalName={hospitalName} theme={theme} />
                {isRegen && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <span className="text-xs font-bold text-indigo-600">재생성 중...</span>
                  </div>
                )}
                {isFailed && !isRegen && (
                  <div className="absolute inset-0 bg-rose-50/95 flex items-center justify-center">
                    <div className="text-center space-y-2 px-2">
                      <div className="text-2xl">⚠️</div>
                      <div className="text-xs font-bold text-rose-700">이미지 생성 실패</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-600 truncate">
                  {i + 1}. {s.title || `슬라이드 ${i + 1}`}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleRegen(i)}
                    disabled={isRegen || isLoading}
                    className="flex-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
                  >
                    재생성
                  </button>
                  <UploadButton onFile={(f) => handleUpload(i, f)} disabled={isRegen || isLoading} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || !allDone}
          className={[
            'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all',
            isLoading || !allDone
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
          ].join(' ')}
        >
          {allDone ? '다운로드 단계로 →' : `이미지 ${slides.length - successCount}장 부족 (재생성 필요)`}
        </button>
      </div>
    </div>
  );
}

// ── 내부: file upload 버튼 ─────────────────────────────────────────────
function UploadButton({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        className="flex-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
      >
        업로드
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
