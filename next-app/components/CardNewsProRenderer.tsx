'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { SlideData, CardNewsTheme, SlideLayoutType } from '../lib/cardNewsLayouts';
import { LAYOUT_LABELS, THEME_PRESETS } from '../lib/cardNewsLayouts';

interface Props {
  slides: SlideData[];
  theme: CardNewsTheme;
  onSlidesChange: (slides: SlideData[]) => void;
  onThemeChange: (theme: CardNewsTheme) => void;
}

/**
 * 프로 카드뉴스 렌더러
 * - 1080x1080 고정 (Instagram/네이버 규격)
 * - 레이아웃 유형별 다른 HTML/CSS
 * - 축소 미리보기 + 인라인 편집 패널 + 레이아웃 변경 + PNG 다운로드
 */
export default function CardNewsProRenderer({ slides, theme, onSlidesChange, onThemeChange }: Props) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  /** 특정 슬라이드 업데이트 (얕은 머지) */
  const updateSlide = (idx: number, patch: Partial<SlideData>) => {
    onSlidesChange(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  // ═══════════════════════════════════════
  // 다운로드
  // ═══════════════════════════════════════

  const downloadCard = async (index: number) => {
    const el = cardRefs.current[index];
    if (!el) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        width: 1080,
        height: 1080,
        windowWidth: 1080,
        windowHeight: 1080,
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `card_${index + 1}.png`;
      a.click();
    } finally {
      setDownloading(false);
    }
  };

  const downloadAll = async () => {
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < slides.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: null,
          width: 1080,
          height: 1080,
          windowWidth: 1080,
          windowHeight: 1080,
        });
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b as Blob), 'image/png');
        });
        zip.file(`card_${i + 1}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `cardnews_pro_${Date.now()}.zip`;
      a.click();
    } finally {
      setDownloading(false);
    }
  };

  // ═══════════════════════════════════════
  // 공통 스타일
  // ═══════════════════════════════════════

  const cardContainerStyle: CSSProperties = {
    width: '1080px',
    height: '1080px',
    position: 'relative',
    overflow: 'hidden',
    background: theme.backgroundGradient || theme.backgroundColor,
    fontFamily: theme.fontFamily,
    display: 'flex',
    flexDirection: 'column',
    padding: '80px 70px',
    boxSizing: 'border-box',
  };

  const topBar = (
    <div
      style={{
        width: '100px',
        height: '5px',
        background: theme.accentColor,
        marginBottom: '36px',
        borderRadius: '3px',
      }}
    />
  );

  const hospitalFooter = theme.hospitalName ? (
    <div
      style={{
        position: 'absolute',
        bottom: '40px',
        left: 0,
        right: 0,
        textAlign: 'center',
        color: theme.bodyColor,
        fontSize: '16px',
        fontWeight: 500,
        opacity: 0.7,
        letterSpacing: '3px',
      }}
    >
      {theme.hospitalName}
    </div>
  ) : null;

  // ═══════════════════════════════════════
  // 레이아웃별 렌더
  // ═══════════════════════════════════════

  const renderCover = (slide: SlideData) => (
    <div
      style={{
        ...cardContainerStyle,
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '120px',
          height: '5px',
          background: theme.accentColor,
          marginBottom: '40px',
          borderRadius: '3px',
        }}
      />
      <h1
        style={{
          color: theme.titleColor,
          fontSize: '64px',
          fontWeight: 900,
          lineHeight: 1.25,
          marginBottom: '28px',
          wordBreak: 'keep-all',
          maxWidth: '860px',
          letterSpacing: '-0.02em',
        }}
      >
        {slide.title}
      </h1>
      {slide.subtitle && (
        <p
          style={{
            color: theme.subtitleColor,
            fontSize: '26px',
            fontWeight: 700,
            lineHeight: 1.5,
            maxWidth: '820px',
            wordBreak: 'keep-all',
          }}
        >
          {slide.subtitle}
        </p>
      )}
      {hospitalFooter}
    </div>
  );

  const renderInfo = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {topBar}
      <h2
        style={{
          color: theme.titleColor,
          fontSize: '48px',
          fontWeight: 800,
          marginBottom: '20px',
          wordBreak: 'keep-all',
          lineHeight: 1.3,
          letterSpacing: '-0.02em',
        }}
      >
        {slide.title}
      </h2>
      {slide.subtitle && (
        <p
          style={{
            color: theme.subtitleColor,
            fontSize: '22px',
            fontWeight: 700,
            marginBottom: '36px',
            lineHeight: 1.6,
            wordBreak: 'keep-all',
          }}
        >
          {slide.subtitle}
        </p>
      )}
      {slide.body && (
        <p
          style={{
            color: theme.bodyColor,
            fontSize: '22px',
            lineHeight: 1.85,
            whiteSpace: 'pre-line',
            wordBreak: 'keep-all',
            flex: 1,
          }}
        >
          {slide.body}
        </p>
      )}
      {hospitalFooter}
    </div>
  );

  const renderComparison = (slide: SlideData) => {
    const cols = slide.columns || [];
    const labels = slide.compareLabels || [];
    const hasLabels = labels.length > 0;
    const rowCount = hasLabels ? labels.length : (cols[0]?.items.length || 0);
    const gridCols = hasLabels
      ? `140px repeat(${cols.length}, 1fr)`
      : `repeat(${cols.length}, 1fr)`;

    return (
      <div style={cardContainerStyle}>
        {topBar}
        <h2
          style={{
            color: theme.titleColor,
            fontSize: '42px',
            fontWeight: 800,
            marginBottom: '10px',
            textAlign: 'center',
            wordBreak: 'keep-all',
            letterSpacing: '-0.02em',
          }}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p
            style={{
              color: theme.subtitleColor,
              fontSize: '20px',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: '36px',
              wordBreak: 'keep-all',
            }}
          >
            {slide.subtitle}
          </p>
        )}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            borderRadius: '18px',
            overflow: 'hidden',
            alignSelf: 'center',
            width: '100%',
            maxHeight: '700px',
          }}
        >
          {/* 헤더 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '2px' }}>
            {hasLabels && <div style={{ background: 'transparent' }} />}
            {cols.map((col, ci) => (
              <div
                key={ci}
                style={{
                  background: col.highlight ? theme.accentColor : theme.cardBgColor,
                  color: col.highlight ? '#FFFFFF' : '#1A1A2E',
                  padding: '22px 16px',
                  textAlign: 'center',
                  fontSize: '22px',
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                }}
              >
                {col.header}
              </div>
            ))}
          </div>
          {/* 데이터 행 */}
          {Array.from({ length: rowCount }).map((_, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '2px' }}>
              {hasLabels && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.10)',
                    color: theme.titleColor,
                    padding: '22px 14px',
                    fontSize: '17px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    wordBreak: 'keep-all',
                  }}
                >
                  {labels[ri]}
                </div>
              )}
              {cols.map((col, ci) => (
                <div
                  key={ci}
                  style={{
                    background: col.highlight ? 'rgba(245,166,35,0.18)' : 'rgba(255,255,255,0.06)',
                    color: col.highlight ? theme.accentColor : theme.titleColor,
                    padding: '22px 14px',
                    textAlign: 'center',
                    fontSize: '19px',
                    fontWeight: col.highlight ? 800 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    wordBreak: 'keep-all',
                  }}
                >
                  {col.items[ri] || ''}
                </div>
              ))}
            </div>
          ))}
        </div>
        {hospitalFooter}
      </div>
    );
  };

  const renderIconGrid = (slide: SlideData) => {
    const items = slide.icons || [];
    const cols = items.length <= 3 ? items.length : 2;

    return (
      <div style={cardContainerStyle}>
        {topBar}
        <h2
          style={{
            color: theme.titleColor,
            fontSize: '42px',
            fontWeight: 800,
            marginBottom: '10px',
            textAlign: 'center',
            wordBreak: 'keep-all',
            letterSpacing: '-0.02em',
          }}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p
            style={{
              color: theme.subtitleColor,
              fontSize: '20px',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: '46px',
              wordBreak: 'keep-all',
            }}
          >
            {slide.subtitle}
          </p>
        )}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: '24px',
            alignContent: 'center',
          }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.96)',
                borderRadius: '24px',
                padding: '38px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '14px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              }}
            >
              <span style={{ fontSize: '56px', lineHeight: 1 }}>{item.emoji}</span>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#1A1A2E',
                  wordBreak: 'keep-all',
                }}
              >
                {item.title}
              </span>
              {item.desc && (
                <span
                  style={{
                    fontSize: '16px',
                    color: '#5C5C6E',
                    lineHeight: 1.55,
                    wordBreak: 'keep-all',
                  }}
                >
                  {item.desc}
                </span>
              )}
            </div>
          ))}
        </div>
        {hospitalFooter}
      </div>
    );
  };

  const renderSteps = (slide: SlideData) => {
    const items = slide.steps || [];

    return (
      <div style={cardContainerStyle}>
        {topBar}
        <h2
          style={{
            color: theme.titleColor,
            fontSize: '42px',
            fontWeight: 800,
            marginBottom: '10px',
            textAlign: 'center',
            wordBreak: 'keep-all',
            letterSpacing: '-0.02em',
          }}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p
            style={{
              color: theme.subtitleColor,
              fontSize: '20px',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: '56px',
              wordBreak: 'keep-all',
            }}
          >
            {slide.subtitle}
          </p>
        )}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '22px',
          }}
        >
          {items.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '18px',
                padding: '24px 28px',
                borderLeft: `5px solid ${theme.accentColor}`,
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: theme.accentColor,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: theme.titleColor,
                    fontSize: '22px',
                    fontWeight: 800,
                    marginBottom: step.desc ? '6px' : 0,
                    wordBreak: 'keep-all',
                  }}
                >
                  {step.label}
                </div>
                {step.desc && (
                  <div
                    style={{
                      color: theme.bodyColor,
                      fontSize: '16px',
                      lineHeight: 1.5,
                      wordBreak: 'keep-all',
                    }}
                  >
                    {step.desc}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {hospitalFooter}
      </div>
    );
  };

  const renderChecklist = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {topBar}
      <h2
        style={{
          color: theme.titleColor,
          fontSize: '44px',
          fontWeight: 800,
          marginBottom: '10px',
          wordBreak: 'keep-all',
          letterSpacing: '-0.02em',
        }}
      >
        {slide.title}
      </h2>
      {slide.subtitle && (
        <p
          style={{
            color: theme.subtitleColor,
            fontSize: '20px',
            fontWeight: 600,
            marginBottom: '40px',
            wordBreak: 'keep-all',
          }}
        >
          {slide.subtitle}
        </p>
      )}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          justifyContent: 'center',
        }}
      >
        {(slide.checkItems || []).map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '14px',
              padding: '24px 28px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: theme.accentColor,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              ✓
            </div>
            <span
              style={{
                color: theme.titleColor,
                fontSize: '22px',
                fontWeight: 600,
                wordBreak: 'keep-all',
              }}
            >
              {item}
            </span>
          </div>
        ))}
      </div>
      {hospitalFooter}
    </div>
  );

  const renderDataHighlight = (slide: SlideData) => {
    const points = slide.dataPoints || [];
    const cols = Math.min(points.length, 3);
    return (
      <div style={cardContainerStyle}>
        {topBar}
        <h2
          style={{
            color: theme.titleColor,
            fontSize: '42px',
            fontWeight: 800,
            marginBottom: '10px',
            textAlign: 'center',
            wordBreak: 'keep-all',
            letterSpacing: '-0.02em',
          }}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p
            style={{
              color: theme.subtitleColor,
              fontSize: '20px',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: '46px',
              wordBreak: 'keep-all',
            }}
          >
            {slide.subtitle}
          </p>
        )}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: '22px',
            alignContent: 'center',
          }}
        >
          {points.map((dp, i) => (
            <div
              key={i}
              style={{
                textAlign: 'center',
                padding: '46px 22px',
                background: dp.highlight ? 'rgba(245,166,35,0.16)' : 'rgba(255,255,255,0.06)',
                borderRadius: '20px',
                border: dp.highlight
                  ? `2px solid ${theme.accentColor}`
                  : '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <div
                style={{
                  color: dp.highlight ? theme.accentColor : theme.titleColor,
                  fontSize: '64px',
                  fontWeight: 900,
                  marginBottom: '14px',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                }}
              >
                {dp.value}
              </div>
              <div
                style={{
                  color: theme.bodyColor,
                  fontSize: '18px',
                  fontWeight: 500,
                  wordBreak: 'keep-all',
                  lineHeight: 1.4,
                }}
              >
                {dp.label}
              </div>
            </div>
          ))}
        </div>
        {hospitalFooter}
      </div>
    );
  };

  const renderClosing = (slide: SlideData) => (
    <div
      style={{
        ...cardContainerStyle,
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {slide.subtitle && (
        <h2
          style={{
            color: theme.accentColor,
            fontSize: '32px',
            fontWeight: 700,
            marginBottom: '24px',
            letterSpacing: '-0.01em',
          }}
        >
          {slide.subtitle}
        </h2>
      )}
      <h1
        style={{
          color: theme.titleColor,
          fontSize: '56px',
          fontWeight: 900,
          lineHeight: 1.3,
          marginBottom: '32px',
          wordBreak: 'keep-all',
          maxWidth: '860px',
          letterSpacing: '-0.02em',
        }}
      >
        {slide.title}
      </h1>
      {slide.body && (
        <p
          style={{
            color: theme.bodyColor,
            fontSize: '22px',
            lineHeight: 1.65,
            marginBottom: '48px',
            maxWidth: '780px',
            wordBreak: 'keep-all',
          }}
        >
          {slide.body}
        </p>
      )}
      {theme.hospitalName && (
        <div
          style={{
            color: theme.titleColor,
            fontSize: '24px',
            fontWeight: 700,
            letterSpacing: '4px',
            paddingTop: '20px',
            borderTop: `2px solid ${theme.accentColor}`,
            display: 'inline-block',
            paddingLeft: '40px',
            paddingRight: '40px',
          }}
        >
          {theme.hospitalName}
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════
  // 레이아웃 분기
  // ═══════════════════════════════════════

  const renderSlide = (slide: SlideData) => {
    switch (slide.layout) {
      case 'cover':
        return renderCover(slide);
      case 'comparison':
        return renderComparison(slide);
      case 'icon-grid':
        return renderIconGrid(slide);
      case 'steps':
        return renderSteps(slide);
      case 'checklist':
        return renderChecklist(slide);
      case 'data-highlight':
        return renderDataHighlight(slide);
      case 'closing':
        return renderClosing(slide);
      default:
        return renderInfo(slide);
    }
  };

  // ═══════════════════════════════════════
  // UI
  // ═══════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* 상단 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            📊 프로 레이아웃
          </span>
          <span className="text-xs font-bold text-slate-700">{slides.length}장</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowThemePicker(v => !v)}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors"
          >
            🎨 테마
          </button>
          <button
            onClick={downloadAll}
            disabled={downloading}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {downloading ? '⏳ 다운로드 중...' : '📦 전체 다운로드'}
          </button>
        </div>
      </div>

      {/* 테마 선택 */}
      {showThemePicker && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex gap-2">
          {Object.entries(THEME_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => onThemeChange({ ...preset, hospitalName: theme.hospitalName, hospitalLogo: theme.hospitalLogo })}
              className="flex-1 h-16 rounded-lg border-2 transition-all"
              style={{
                background: preset.backgroundGradient || preset.backgroundColor,
                borderColor: theme.backgroundColor === preset.backgroundColor ? preset.accentColor : 'transparent',
              }}
            >
              <span className="text-xs font-bold" style={{ color: preset.titleColor }}>
                {key}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 카드 그리드 (축소 미리보기 + 인라인 편집 패널) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide, idx) => {
          const isEditing = editingIdx === idx;
          return (
            <div key={idx} className={`bg-white rounded-xl border transition-all ${isEditing ? 'border-blue-400 ring-2 ring-blue-100 sm:col-span-2 lg:col-span-3' : 'border-slate-200'}`}>
              {/* 프리뷰 영역 */}
              <div
                className="group relative overflow-hidden rounded-t-xl bg-slate-100"
                style={{ aspectRatio: '1 / 1' }}
              >
                {/* 라벨 */}
                <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
                  {idx + 1} · {LAYOUT_LABELS[slide.layout]}
                </div>
                {/* PNG 다운로드 */}
                <button
                  type="button"
                  onClick={() => downloadCard(idx)}
                  className="absolute top-2 right-2 z-20 px-2 py-1 bg-white/90 hover:bg-white rounded-lg text-[10px] font-bold text-slate-700 shadow-sm"
                  title="이 카드를 PNG로 저장"
                >
                  💾 PNG
                </button>
                {/* 실제 렌더링 (1080x1080을 0.25배 스케일) */}
                <div
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  style={{
                    transform: 'scale(0.25)',
                    transformOrigin: 'top left',
                    width: '1080px',
                    height: '1080px',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                >
                  {renderSlide(slide)}
                </div>
              </div>

              {/* 편집 툴바 — 레이아웃 드롭다운 + 편집 토글 */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100">
                <select
                  value={slide.layout}
                  onChange={(e) => updateSlide(idx, { layout: e.target.value as SlideLayoutType })}
                  className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 focus:outline-none focus:border-blue-400"
                  title="슬라이드 레이아웃 변경"
                >
                  {Object.entries(LAYOUT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setEditingIdx(isEditing ? null : idx)}
                  className={`ml-auto px-3 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                    isEditing ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {isEditing ? '✓ 완료' : '✏️ 수정'}
                </button>
              </div>

              {/* 편집 패널 */}
              {isEditing && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                  <SlideEditor slide={slide} onChange={(patch) => updateSlide(idx, patch)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SlideEditor: 현재 슬라이드 레이아웃에 맞는 폼을 렌더링
// ═══════════════════════════════════════════════════════════════

interface SlideEditorProps {
  slide: SlideData;
  onChange: (patch: Partial<SlideData>) => void;
}

function SlideEditor({ slide, onChange }: SlideEditorProps) {
  const inputCls = 'w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
  const labelCls = 'block text-[10px] font-semibold text-slate-500 mb-0.5';
  const textareaCls = `${inputCls} resize-none`;

  // 공통 필드: title, subtitle
  const common = (
    <>
      <div>
        <label className={labelCls}>제목</label>
        <input type="text" value={slide.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>부제</label>
        <input type="text" value={slide.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} placeholder="(선택)" />
      </div>
    </>
  );

  if (slide.layout === 'cover') return <>{common}</>;

  if (slide.layout === 'info' || slide.layout === 'closing') {
    return (
      <>
        {common}
        <div>
          <label className={labelCls}>본문</label>
          <textarea rows={3} value={slide.body || ''} onChange={(e) => onChange({ body: e.target.value })} className={textareaCls} />
        </div>
      </>
    );
  }

  if (slide.layout === 'comparison') {
    const cols = slide.columns || [];
    const labels = slide.compareLabels || [];
    const updateCol = (ci: number, patch: Partial<typeof cols[number]>) => {
      const next = cols.map((c, i) => (i === ci ? { ...c, ...patch } : c));
      onChange({ columns: next });
    };
    const updateColItem = (ci: number, ri: number, value: string) => {
      const next = cols.map((c, i) => {
        if (i !== ci) return c;
        const items = [...c.items];
        items[ri] = value;
        return { ...c, items };
      });
      onChange({ columns: next });
    };
    const updateLabel = (ri: number, value: string) => {
      const next = [...labels];
      next[ri] = value;
      onChange({ compareLabels: next });
    };
    return (
      <>
        {common}
        <div>
          <label className={labelCls}>비교 행 라벨 + 컬럼별 값</label>
          <div className="space-y-1.5">
            {labels.map((lbl, ri) => (
              <div key={ri} className="grid grid-cols-[110px_1fr_1fr] gap-1.5 items-center">
                <input type="text" value={lbl} onChange={(e) => updateLabel(ri, e.target.value)} className={inputCls} placeholder={`라벨 ${ri + 1}`} />
                {cols.map((c, ci) => (
                  <input key={ci} type="text" value={c.items[ri] || ''} onChange={(e) => updateColItem(ci, ri, e.target.value)} className={inputCls} placeholder={c.header} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>컬럼 헤더</label>
          <div className="grid grid-cols-2 gap-1.5">
            {cols.map((c, ci) => (
              <input key={ci} type="text" value={c.header} onChange={(e) => updateCol(ci, { header: e.target.value })} className={inputCls} />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'icon-grid') {
    const items = slide.icons || [];
    const updateIcon = (i: number, patch: Partial<typeof items[number]>) => {
      onChange({ icons: items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
    };
    return (
      <>
        {common}
        <div>
          <label className={labelCls}>아이콘 항목</label>
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[44px_1fr_1.6fr] gap-1.5">
                <input type="text" value={it.emoji} onChange={(e) => updateIcon(i, { emoji: e.target.value })} className={`${inputCls} text-center`} />
                <input type="text" value={it.title} onChange={(e) => updateIcon(i, { title: e.target.value })} className={inputCls} placeholder="제목" />
                <input type="text" value={it.desc || ''} onChange={(e) => updateIcon(i, { desc: e.target.value })} className={inputCls} placeholder="설명 (선택)" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'steps') {
    const steps = slide.steps || [];
    const updateStep = (i: number, patch: Partial<typeof steps[number]>) => {
      onChange({ steps: steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
    };
    return (
      <>
        {common}
        <div>
          <label className={labelCls}>단계</label>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.6fr] gap-1.5">
                <input type="text" value={s.label} onChange={(e) => updateStep(i, { label: e.target.value })} className={inputCls} placeholder={`단계 ${i + 1}`} />
                <input type="text" value={s.desc || ''} onChange={(e) => updateStep(i, { desc: e.target.value })} className={inputCls} placeholder="설명" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'checklist') {
    const checks = slide.checkItems || [];
    const updateCheck = (i: number, value: string) => {
      const next = [...checks];
      next[i] = value;
      onChange({ checkItems: next });
    };
    return (
      <>
        {common}
        <div>
          <label className={labelCls}>체크리스트 항목</label>
          <div className="space-y-1.5">
            {checks.map((c, i) => (
              <input key={i} type="text" value={c} onChange={(e) => updateCheck(i, e.target.value)} className={inputCls} />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'data-highlight') {
    const points = slide.dataPoints || [];
    const updateDp = (i: number, patch: Partial<typeof points[number]>) => {
      onChange({ dataPoints: points.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
    };
    return (
      <>
        {common}
        <div>
          <label className={labelCls}>수치 데이터</label>
          <div className="space-y-1.5">
            {points.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr] gap-1.5">
                <input type="text" value={p.value} onChange={(e) => updateDp(i, { value: e.target.value })} className={`${inputCls} font-bold text-center`} placeholder="예: 90%" />
                <input type="text" value={p.label} onChange={(e) => updateDp(i, { label: e.target.value })} className={inputCls} placeholder="라벨" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return <>{common}</>;
}
