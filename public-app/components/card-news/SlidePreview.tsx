/**
 * components/card-news/SlidePreview.tsx
 *
 * SlideData → 정적 HTML 렌더 (Tailwind only, 캔버스 X).
 * 두 역할 공용:
 *   1) 미리보기 (ImageGenerationPanel·OutlineReview·DownloadPanel 의 슬라이드 표시)
 *   2) 다운로드 (cardDownloadUtils 의 html2canvas 가 본 컴포넌트의 DOM 을 캡처)
 *
 * v1 layouts 5종 분기 (blog-core 16종 sub-set): cover / info / checklist / comparison / closing.
 * v1 default theme 1개. 폰트·색상 선택 UI 는 v2 (BACKLOG).
 *
 * size prop:
 *   - 'preview' (max-w-sm, 미리보기 그리드 셀용)
 *   - 'export'  (정확 1080×1080, html2canvas 캡처 대상)
 */

import type { SlideData } from '@winaid/blog-core';
import {
  getTheme,
  getRatio,
  type ThemeId,
  type ThemePreset,
  type AspectRatio,
} from '../../lib/cardNewsPrompt';

interface SlidePreviewProps {
  slide: SlideData;
  size?: 'preview' | 'export';
  hospitalName?: string;
  /** C2-fix-1: theme preset id. 미지정 시 default. */
  theme?: ThemeId;
  /** C2-fix-1e: aspect ratio ('1:1' | '4:5'). 미지정 시 default '1:1'. */
  ratio?: AspectRatio;
}

export default function SlidePreview({
  slide,
  size = 'preview',
  hospitalName,
  theme: themeId,
  ratio: ratioId,
}: SlidePreviewProps) {
  const isExport = size === 'export';
  const theme = getTheme(themeId);
  const ratio = getRatio(ratioId);

  // export 모드는 절대 픽셀, preview 는 반응형. ratio 에 따라 분기.
  // C2-fix-1: 기본 배경에 theme.previewBg 적용 (cover/closing 은 그라데이션으로 override).
  // C2-fix-1e: ratio.dims 로 export 픽셀, preview 는 aspect-* 클래스 분기.
  const wrapperStyle = {
    backgroundColor: theme.previewBg,
    ...(isExport ? { width: `${ratio.dims.w}px`, height: `${ratio.dims.h}px` } : {}),
  };

  const aspectCls = ratio.id === '4:5' ? 'aspect-[4/5]' : 'aspect-square';
  const wrapperCls = [
    'relative overflow-hidden text-slate-800 font-sans',
    isExport ? '' : `w-full ${aspectCls} rounded-xl shadow-sm border border-slate-200`,
  ].join(' ');

  // 모든 layout 공용 wrapper. 안쪽 분기는 switch.
  return (
    <div className={wrapperCls} style={wrapperStyle}>
      {renderLayout(slide, isExport, theme, hospitalName)}
    </div>
  );
}

function renderLayout(slide: SlideData, isExport: boolean, theme: ThemePreset, hospitalName?: string) {
  switch (slide.layout) {
    case 'cover':
      return <CoverLayout slide={slide} isExport={isExport} theme={theme} hospitalName={hospitalName} />;
    case 'info':
      return <InfoLayout slide={slide} isExport={isExport} />;
    case 'checklist':
      return <ChecklistLayout slide={slide} isExport={isExport} theme={theme} />;
    case 'comparison':
      return <ComparisonLayout slide={slide} isExport={isExport} theme={theme} />;
    case 'closing':
      return <ClosingLayout slide={slide} isExport={isExport} theme={theme} hospitalName={hospitalName} />;
    default:
      // v1 미지원 layout — 디버그용 fallback (운영에선 도달 안 함, layout 화이트리스트로 보장).
      return (
        <div className="p-6 text-xs text-rose-600">
          [지원하지 않는 layout: {slide.layout}]
        </div>
      );
  }
}

// ── Layout 1: cover ─────────────────────────────────────────────────────
function CoverLayout({
  slide,
  isExport,
  theme,
  hospitalName,
}: {
  slide: SlideData;
  isExport: boolean;
  theme: ThemePreset;
  hospitalName?: string;
}) {
  const titleCls = isExport ? 'text-7xl' : 'text-2xl';
  const subtitleCls = isExport ? 'text-3xl' : 'text-base';
  // C2-fix-1: 그라데이션을 theme palette 의 [0]→[1] 으로 동적 적용.
  const gradientStyle = {
    background: `linear-gradient(135deg, ${theme.palette[0]}, ${theme.palette[1]})`,
  };

  return (
    <div
      className="h-full flex flex-col justify-center items-center text-center px-10"
      style={gradientStyle}
    >
      {hospitalName && (
        <div className={`absolute top-6 right-6 text-slate-500 font-medium ${isExport ? 'text-xl' : 'text-xs'}`}>
          {hospitalName}
        </div>
      )}
      {slide.imageUrl && (
        <img
          src={slide.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          crossOrigin="anonymous"
        />
      )}
      <div className="relative z-10 max-w-3xl space-y-4">
        <h1 className={`${titleCls} font-bold text-slate-900 leading-tight`}>{slide.title}</h1>
        {slide.subtitle && (
          <p className={`${subtitleCls} text-slate-700 font-medium`}>{slide.subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ── Layout 2: info ──────────────────────────────────────────────────────
function InfoLayout({ slide, isExport }: { slide: SlideData; isExport: boolean }) {
  const titleCls = isExport ? 'text-5xl' : 'text-xl';
  const bodyCls = isExport ? 'text-2xl' : 'text-sm';

  return (
    <div className="h-full flex flex-col px-10 py-10">
      {slide.imageUrl && (
        <img
          src={slide.imageUrl}
          alt=""
          className={`w-full ${isExport ? 'h-[420px]' : 'h-32'} object-cover rounded-2xl mb-6`}
          crossOrigin="anonymous"
        />
      )}
      <div className="space-y-4 flex-1">
        <h2 className={`${titleCls} font-bold text-slate-900 leading-tight`}>{slide.title}</h2>
        {slide.body && (
          <p className={`${bodyCls} text-slate-700 leading-relaxed whitespace-pre-wrap`}>{slide.body}</p>
        )}
      </div>
    </div>
  );
}

// ── Layout 3: checklist ─────────────────────────────────────────────────
function ChecklistLayout({
  slide,
  isExport,
  theme,
}: {
  slide: SlideData;
  isExport: boolean;
  theme: ThemePreset;
}) {
  const titleCls = isExport ? 'text-5xl' : 'text-xl';
  const itemCls = isExport ? 'text-2xl' : 'text-sm';
  const iconCls = isExport ? 'w-10 h-10 text-3xl' : 'w-6 h-6 text-base';
  const items = Array.isArray(slide.checkItems) ? slide.checkItems.slice(0, 6) : [];
  // C2-fix-1: 체크 아이콘 배경은 theme palette[1] (mid color) — 가시성 유지.
  const iconStyle = { backgroundColor: theme.palette[1], color: theme.palette[0] };

  return (
    <div className="h-full flex flex-col px-10 py-10">
      <h2 className={`${titleCls} font-bold text-slate-900 leading-tight mb-6`}>{slide.title}</h2>
      <ul className={`space-y-${isExport ? '5' : '2'} flex-1`}>
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`${iconCls} flex-shrink-0 rounded-full flex items-center justify-center font-bold`}
              style={iconStyle}
            >
              ✓
            </span>
            <span className={`${itemCls} text-slate-800 leading-snug`}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Layout 4: comparison ────────────────────────────────────────────────
function ComparisonLayout({
  slide,
  isExport,
  theme,
}: {
  slide: SlideData;
  isExport: boolean;
  theme: ThemePreset;
}) {
  const titleCls = isExport ? 'text-4xl' : 'text-lg';
  const headerCls = isExport ? 'text-2xl' : 'text-sm';
  const itemCls = isExport ? 'text-xl' : 'text-xs';
  const columns = Array.isArray(slide.columns) ? slide.columns.slice(0, 2) : [];
  // C2-fix-1: 좌측 = neutral (palette[2]), 우측 = accent (palette[0]).
  const leftStyle = { backgroundColor: `${theme.palette[2]}40`, borderColor: theme.palette[2] };
  const rightStyle = { backgroundColor: `${theme.palette[0]}40`, borderColor: theme.palette[0] };

  return (
    <div className="h-full flex flex-col px-10 py-10">
      <h2 className={`${titleCls} font-bold text-slate-900 leading-tight mb-6 text-center`}>
        {slide.title}
      </h2>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {columns.map((col, i) => (
          <div
            key={i}
            className={`rounded-2xl p-${isExport ? '6' : '3'} border`}
            style={i === 0 ? leftStyle : rightStyle}
          >
            <h3 className={`${headerCls} font-bold mb-3 text-slate-800`}>
              {col.header}
            </h3>
            <ul className={`space-y-${isExport ? '3' : '1.5'}`}>
              {col.items.slice(0, 5).map((item, j) => (
                <li key={j} className={`${itemCls} text-slate-700 leading-snug flex items-start gap-2`}>
                  <span className="text-slate-400 flex-shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Layout 5: closing ───────────────────────────────────────────────────
function ClosingLayout({
  slide,
  isExport,
  theme,
  hospitalName,
}: {
  slide: SlideData;
  isExport: boolean;
  theme: ThemePreset;
  hospitalName?: string;
}) {
  const titleCls = isExport ? 'text-5xl' : 'text-xl';
  const bodyCls = isExport ? 'text-2xl' : 'text-sm';
  const tagCls = isExport ? 'text-xl px-4 py-2' : 'text-xs px-2 py-1';
  const hashtags = Array.isArray(slide.hashtags) ? slide.hashtags.slice(0, 5) : [];
  // C2-fix-1: 그라데이션을 palette [1]→[2] 로 (cover 와 다르게 끝쪽 색상 사용).
  const gradientStyle = {
    background: `linear-gradient(135deg, ${theme.palette[1]}, ${theme.palette[2]})`,
  };
  const tagStyle = { borderColor: theme.palette[0], color: theme.palette[0] };

  return (
    <div
      className="h-full flex flex-col justify-center items-center text-center px-10"
      style={gradientStyle}
    >
      <div className={`space-y-${isExport ? '6' : '3'} max-w-3xl`}>
        <h2 className={`${titleCls} font-bold text-slate-900 leading-tight`}>{slide.title}</h2>
        {slide.body && (
          <p className={`${bodyCls} text-slate-700 leading-relaxed`}>{slide.body}</p>
        )}
        {hashtags.length > 0 && (
          <div className={`flex flex-wrap justify-center gap-${isExport ? '3' : '1.5'} pt-2`}>
            {hashtags.map((t, i) => (
              <span
                key={i}
                className={`${tagCls} rounded-full bg-white border font-medium`}
                style={tagStyle}
              >
                {t.startsWith('#') ? t : `#${t}`}
              </span>
            ))}
          </div>
        )}
        {hospitalName && (
          <div className={`pt-${isExport ? '8' : '4'} ${isExport ? 'text-2xl' : 'text-xs'} text-slate-600 font-semibold`}>
            {hospitalName}
          </div>
        )}
      </div>
    </div>
  );
}
