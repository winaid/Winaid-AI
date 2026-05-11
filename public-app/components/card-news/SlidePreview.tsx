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

interface SlidePreviewProps {
  slide: SlideData;
  size?: 'preview' | 'export';
  hospitalName?: string;
}

const EXPORT_SIZE_PX = 1080; // 1:1 비율, html2canvas 캡처 기준

export default function SlidePreview({ slide, size = 'preview', hospitalName }: SlidePreviewProps) {
  const isExport = size === 'export';

  // export 모드는 절대 픽셀, preview 는 반응형. 둘 다 1:1 aspect.
  const wrapperStyle = isExport
    ? { width: `${EXPORT_SIZE_PX}px`, height: `${EXPORT_SIZE_PX}px` }
    : undefined;

  const wrapperCls = [
    'relative overflow-hidden bg-white text-slate-800 font-sans',
    isExport ? '' : 'w-full aspect-square rounded-xl shadow-sm border border-slate-200',
  ].join(' ');

  // 모든 layout 공용 wrapper. 안쪽 분기는 switch.
  return (
    <div className={wrapperCls} style={wrapperStyle}>
      {renderLayout(slide, isExport, hospitalName)}
    </div>
  );
}

function renderLayout(slide: SlideData, isExport: boolean, hospitalName?: string) {
  switch (slide.layout) {
    case 'cover':
      return <CoverLayout slide={slide} isExport={isExport} hospitalName={hospitalName} />;
    case 'info':
      return <InfoLayout slide={slide} isExport={isExport} />;
    case 'checklist':
      return <ChecklistLayout slide={slide} isExport={isExport} />;
    case 'comparison':
      return <ComparisonLayout slide={slide} isExport={isExport} />;
    case 'closing':
      return <ClosingLayout slide={slide} isExport={isExport} hospitalName={hospitalName} />;
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
  hospitalName,
}: {
  slide: SlideData;
  isExport: boolean;
  hospitalName?: string;
}) {
  const titleCls = isExport ? 'text-7xl' : 'text-2xl';
  const subtitleCls = isExport ? 'text-3xl' : 'text-base';

  return (
    <div className="h-full flex flex-col justify-center items-center text-center px-10 bg-gradient-to-br from-slate-50 to-indigo-50">
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
function ChecklistLayout({ slide, isExport }: { slide: SlideData; isExport: boolean }) {
  const titleCls = isExport ? 'text-5xl' : 'text-xl';
  const itemCls = isExport ? 'text-2xl' : 'text-sm';
  const iconCls = isExport ? 'w-10 h-10 text-3xl' : 'w-6 h-6 text-base';
  const items = Array.isArray(slide.checkItems) ? slide.checkItems.slice(0, 6) : [];

  return (
    <div className="h-full flex flex-col px-10 py-10">
      <h2 className={`${titleCls} font-bold text-slate-900 leading-tight mb-6`}>{slide.title}</h2>
      <ul className={`space-y-${isExport ? '5' : '2'} flex-1`}>
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`${iconCls} flex-shrink-0 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold`}
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
function ComparisonLayout({ slide, isExport }: { slide: SlideData; isExport: boolean }) {
  const titleCls = isExport ? 'text-4xl' : 'text-lg';
  const headerCls = isExport ? 'text-2xl' : 'text-sm';
  const itemCls = isExport ? 'text-xl' : 'text-xs';
  const columns = Array.isArray(slide.columns) ? slide.columns.slice(0, 2) : [];

  return (
    <div className="h-full flex flex-col px-10 py-10">
      <h2 className={`${titleCls} font-bold text-slate-900 leading-tight mb-6 text-center`}>
        {slide.title}
      </h2>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {columns.map((col, i) => (
          <div
            key={i}
            className={`rounded-2xl p-${isExport ? '6' : '3'} ${
              i === 0 ? 'bg-slate-50 border border-slate-200' : 'bg-indigo-50 border border-indigo-200'
            }`}
          >
            <h3 className={`${headerCls} font-bold mb-3 ${i === 0 ? 'text-slate-700' : 'text-indigo-700'}`}>
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
  hospitalName,
}: {
  slide: SlideData;
  isExport: boolean;
  hospitalName?: string;
}) {
  const titleCls = isExport ? 'text-5xl' : 'text-xl';
  const bodyCls = isExport ? 'text-2xl' : 'text-sm';
  const tagCls = isExport ? 'text-xl px-4 py-2' : 'text-xs px-2 py-1';
  const hashtags = Array.isArray(slide.hashtags) ? slide.hashtags.slice(0, 5) : [];

  return (
    <div className="h-full flex flex-col justify-center items-center text-center px-10 bg-gradient-to-br from-indigo-50 to-rose-50">
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
                className={`${tagCls} rounded-full bg-white border border-indigo-200 text-indigo-700 font-medium`}
              >
                {t.startsWith('#') ? t : `#${t}`}
              </span>
            ))}
          </div>
        )}
        {hospitalName && (
          <div className={`pt-${isExport ? '8' : '4'} ${isExport ? 'text-2xl' : 'text-xs'} text-slate-500 font-semibold`}>
            {hospitalName}
          </div>
        )}
      </div>
    </div>
  );
}
