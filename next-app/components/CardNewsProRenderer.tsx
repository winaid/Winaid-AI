'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { SlideData, CardNewsTheme } from '../lib/cardNewsLayouts';
import { DEFAULT_THEME, LAYOUT_LABELS, THEME_PRESETS } from '../lib/cardNewsLayouts';

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
 * - 축소 미리보기 + 개별/전체 PNG 다운로드
 */
export default function CardNewsProRenderer({ slides, theme, onSlidesChange, onThemeChange }: Props) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

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

      {/* 카드 그리드 (축소 미리보기) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide, idx) => (
          <div
            key={idx}
            className="group relative overflow-hidden rounded-xl bg-slate-100 cursor-pointer"
            style={{ aspectRatio: '1 / 1' }}
            onClick={() => downloadCard(idx)}
          >
            {/* 라벨 */}
            <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
              {idx + 1} · {LAYOUT_LABELS[slide.layout]}
            </div>
            {/* 다운로드 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadCard(idx);
              }}
              className="absolute top-2 right-2 z-20 px-2 py-1 bg-white/90 hover:bg-white rounded-lg text-[10px] font-bold text-slate-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
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
        ))}
      </div>

      {/* 빈 사용 경고를 없애기 위해 onSlidesChange 참조 (현재는 미사용, 향후 편집 기능 확장 예정) */}
      <div className="hidden">{slides.length > 0 && typeof onSlidesChange === 'function' ? '' : ''}</div>
    </div>
  );
}
