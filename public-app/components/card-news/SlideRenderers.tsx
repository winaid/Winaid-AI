'use client';

/**
 * SlideRenderContext — 렌더 함수들이 공유하는 테마 파생값 + 컨텍스트.
 * 현재는 context 생성만 여기에 두고, 실제 렌더 함수는 CardNewsProRenderer에 유지.
 * 다음 단계에서 렌더 함수를 이쪽으로 이동 예정.
 */
import type { CSSProperties } from 'react';
import type { CardNewsTheme, SlideData, CoverTemplate, DesignPresetStyle } from '../../lib/cardNewsLayouts';
import type { CardTemplate } from '../../lib/cardTemplateService';
import { COVER_TEMPLATES } from '../../lib/cardNewsLayouts';
import {
  parseCSSString, resolveEffectiveFontFamily, resolveSlideFontFamily,
  calcTitleSize, calcValueSize, calcItemLayout, calcGridCols, calcBodySize, calcCardPadding,
  getCardStyle as buildCardStyle, getTitleStyle as buildTitleStyle,
  getSubtitleStyle as buildSubtitleStyle, getBodyStyle as buildBodyStyle,
} from '../../lib/cardStyleUtils';

export interface SlideRenderContext {
  theme: CardNewsTheme;
  lt: CardTemplate | null;
  presetStyle: DesignPresetStyle | null;
  isDarkTheme: boolean;
  cardWidth: number;
  cardHeight: number;
  cardAspect: string;
  cardContainerStyle: CSSProperties;
  effectiveFontFamily: string;
  customFontName: string | null;
  // 파생 색상값
  innerCardBg: string;
  innerCardBorder: string;
  innerCardRadius: string;
  innerCardShadow: string;
  whiteCardBg: string;
  whiteCardText: string;
  whiteCardSub: string;
}

/** 카드 높이 계산 */
function calcCardHeight(cardRatio: string): number {
  switch (cardRatio) {
    case '3:4': return 1440;
    case '4:5': return 1350;
    case '9:16': return 1920;
    case '16:9': return 608;
    default: return 1080;
  }
}

/** CSS aspect-ratio 문자열 */
function calcCardAspect(cardRatio: string): string {
  switch (cardRatio) {
    case '3:4': return '3 / 4';
    case '4:5': return '4 / 5';
    case '9:16': return '9 / 16';
    case '16:9': return '16 / 9';
    default: return '1 / 1';
  }
}

/** 테마가 어두운지 판정 (배경색 luminance 기준) */
function calcIsDark(bgColor: string): boolean {
  const hex = bgColor.replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

/** SlideRenderContext 생성 — 모든 테마 파생값을 한 번에 계산 */
export function createSlideRenderContext(
  theme: CardNewsTheme,
  learnedTemplate: CardTemplate | null | undefined,
  presetStyle: DesignPresetStyle | null | undefined,
  cardRatio: string,
  effectiveFontFamily: string,
  customFontName: string | null,
): SlideRenderContext {
  const lt = learnedTemplate || null;
  const cardWidth = 1080;
  const cardHeight = calcCardHeight(cardRatio);
  const cardAspect = calcCardAspect(cardRatio);

  const learnedBgGradient = lt?.backgroundStyle?.gradient || lt?.colors?.backgroundGradient;
  const cardContainerStyle: CSSProperties = {
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    position: 'relative',
    overflow: 'hidden',
    isolation: 'isolate',
    background: learnedBgGradient || theme.backgroundGradient || theme.backgroundColor,
    fontFamily: effectiveFontFamily,
    display: 'flex',
    flexDirection: 'column',
    padding: lt?.layoutRules?.contentPadding || '60px 64px',
    boxSizing: 'border-box',
    textAlign: lt?.layoutRules?.titleAlign || 'left',
    lineHeight: 1.5,
  };

  const isDarkTheme = calcIsDark(theme.backgroundColor);

  // 내부 카드 색상 (학습 템플릿 우선, 없으면 자동)
  const innerCardBg = lt?.innerCardStyle?.background
    || (isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
  const innerCardBorderRaw = lt?.innerCardStyle?.border;
  const innerCardBorder = (innerCardBorderRaw && innerCardBorderRaw !== 'none' ? innerCardBorderRaw : null)
    || (isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');
  const innerCardRadius = lt?.innerCardStyle?.borderRadius || '18px';
  const innerCardShadow = lt?.innerCardStyle?.boxShadow && lt.innerCardStyle.boxShadow !== 'none'
    ? lt.innerCardStyle.boxShadow
    : (isDarkTheme ? 'none' : '0 4px 12px rgba(0,0,0,0.04)');

  const whiteCardBg = isDarkTheme ? 'rgba(255,255,255,0.95)' : '#FFFFFF';
  const whiteCardText = isDarkTheme ? '#1A1A2E' : theme.titleColor;
  const whiteCardSub = isDarkTheme ? '#666' : theme.bodyColor;

  return {
    theme,
    lt,
    presetStyle: presetStyle || null,
    isDarkTheme,
    cardWidth,
    cardHeight,
    cardAspect,
    cardContainerStyle,
    effectiveFontFamily,
    customFontName,
    innerCardBg,
    innerCardBorder,
    innerCardRadius,
    innerCardShadow,
    whiteCardBg,
    whiteCardText,
    whiteCardSub,
  };
}

// ══════════════════════════════════════════════════════════════
// useSlideRenderer — 16종 렌더 함수 + 공통 헬퍼를 훅으로 제공
// ProRenderer에서 그대로 복사 — 변수명·로직 동일
// ══════════════════════════════════════════════════════════════

interface UseSlideRendererParams {
  theme: CardNewsTheme;
  learnedTemplate: CardTemplate | null | undefined;
  presetStyle: DesignPresetStyle | null | undefined;
  cardRatio: '1:1' | '3:4' | '4:5' | '9:16' | '16:9';
  customFontName: string | null;
}

export function useSlideRenderer({ theme, learnedTemplate, presetStyle, cardRatio, customFontName }: UseSlideRendererParams) {
  const lt = learnedTemplate || null;

  // ── 폰트 해석 ──
  const effectiveFontFamily = resolveEffectiveFontFamily(theme, customFontName);

  const getSlideFontFamily = (slide: SlideData): string =>
    resolveSlideFontFamily(slide, effectiveFontFamily, customFontName);

  // ── 파생값 (createSlideRenderContext 호출) ──
  const renderCtx = createSlideRenderContext(theme, lt, presetStyle, cardRatio, effectiveFontFamily, customFontName);
  const { cardWidth, cardHeight, cardAspect, cardContainerStyle, isDarkTheme,
    innerCardBg, innerCardBorder, innerCardRadius, innerCardShadow,
    whiteCardBg, whiteCardText, whiteCardSub } = renderCtx;

  // ── 스타일 래퍼 (lib/cardStyleUtils.ts 위임) ──

  const getCardStyle = (slide: SlideData): CSSProperties =>
    buildCardStyle(slide, cardContainerStyle, getSlideFontFamily(slide));

  const getTitleStyle = (slide: SlideData, defaults: { fontSize: number; textAlign?: string }): CSSProperties =>
    buildTitleStyle(slide, defaults, theme, getSlideFontFamily(slide),
      slide.titleFontId ? getSlideFontFamily({ ...slide, fontId: slide.titleFontId }) : undefined);

  const getSubtitleStyle = (slide: SlideData): CSSProperties =>
    buildSubtitleStyle(slide, theme, getSlideFontFamily(slide),
      slide.subtitleFontId ? getSlideFontFamily({ ...slide, fontId: slide.subtitleFontId }) : undefined);

  const getBodyStyle = (slide: SlideData): CSSProperties =>
    buildBodyStyle(slide, theme);

  // ── 공통 JSX + 16종 렌더 함수 ──
  /**
   * 공통 배경 장식 — 학습 템플릿의 토큰이 있으면 그것을, 없으면 기본 decoration 사용.
   */
  const backgroundDecoration = lt && (lt.backgroundStyle || lt.decorations) ? (
    <>
      {/* 학습된 패턴 배경 */}
      {lt.backgroundStyle?.patternCSS && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: lt.backgroundStyle.patternCSS,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* 학습된 상단 accent */}
      {lt.backgroundStyle?.hasTopAccent && lt.backgroundStyle.topAccentCSS && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            pointerEvents: 'none',
            ...parseCSSString(lt.backgroundStyle.topAccentCSS),
          }}
        />
      )}
      {/* 학습된 하단 accent */}
      {lt.backgroundStyle?.hasBottomAccent && lt.backgroundStyle.bottomAccentCSS && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            pointerEvents: 'none',
            ...parseCSSString(lt.backgroundStyle.bottomAccentCSS),
          }}
        />
      )}
      {/* 학습된 도형 장식 */}
      {lt.decorations?.hasShapeDecor && lt.decorations.shapeDecorCSS && (
        <div
          style={{
            position: 'absolute',
            zIndex: 0,
            pointerEvents: 'none',
            ...parseCSSString(lt.decorations.shapeDecorCSS),
          }}
        />
      )}
    </>
  ) : (
    (() => {
      const ptn = presetStyle?.backgroundPattern || 'herringbone';
      const ptnOp = presetStyle?.patternOpacity ?? (isDarkTheme ? 0.02 : 0.015);
      const topH = presetStyle?.topBarHeight ?? 8;
      const botH = presetStyle?.bottomBarHeight ?? 4;
      const darkC = `rgba(255,255,255,${ptnOp})`;
      const lightC = `rgba(0,0,0,${ptnOp})`;
      const c = isDarkTheme ? darkC : lightC;

      const patternCSS = (() => {
        if (ptn === 'none') return 'none';
        if (ptn === 'herringbone') return `repeating-linear-gradient(-45deg, transparent, transparent 12px, ${c} 12px, ${c} 14px), repeating-linear-gradient(45deg, transparent, transparent 12px, ${c} 12px, ${c} 14px)`;
        if (ptn === 'diamond') return `linear-gradient(45deg, ${c} 25%, transparent 25%), linear-gradient(-45deg, ${c} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${c} 75%), linear-gradient(-45deg, transparent 75%, ${c} 75%)`;
        if (ptn === 'dots') return `radial-gradient(circle, ${c} 1px, transparent 1px)`;
        if (ptn === 'lines') return `repeating-linear-gradient(0deg, transparent, transparent 20px, ${c} 20px, ${c} 21px)`;
        return 'none';
      })();

      return (
        <>
          {ptn !== 'none' && (
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              backgroundImage: patternCSS,
              backgroundSize: ptn === 'diamond' ? '32px 32px' : ptn === 'dots' ? '20px 20px' : undefined,
              zIndex: 0, pointerEvents: 'none' as const,
            }} />
          )}
          {topH > 0 && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: `${topH}px`,
              background: `linear-gradient(90deg, ${theme.accentColor}, ${theme.accentColor}80, transparent)`,
              zIndex: 5, pointerEvents: 'none' as const,
            }} />
          )}
          {botH > 0 && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: `${botH}px`,
              background: `linear-gradient(90deg, transparent, ${theme.accentColor}50, ${theme.accentColor})`,
              zIndex: 5, pointerEvents: 'none' as const,
            }} />
          )}
        </>
      );
    })()
  );

  /** 섹션 헤더용 장식 라인 (제목 위 accent 바) — 학습 템플릿이 있으면 그 CSS 우선 */
  const learnedAccentBarStyle = lt?.decorations?.hasAccentBar && lt.decorations.accentBarCSS
    ? parseCSSString(lt.decorations.accentBarCSS)
    : null;
  const titleAccent = (align: 'left' | 'center' = 'left') => {
    if (lt && lt.decorations && !lt.decorations.hasAccentBar) {
      // 학습 템플릿이 accent bar 없음을 명시하면 표시 안 함
      return null;
    }
    return (
      <div
        style={{
          width: '60px',
          height: '4px',
          background: theme.accentColor,
          borderRadius: '2px',
          marginBottom: '24px',
          marginLeft: align === 'center' ? 'auto' : 0,
          marginRight: align === 'center' ? 'auto' : 0,
          ...(learnedAccentBarStyle || {}),
        }}
      />
    );
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

  /**
   * 이미지 레이어 — imagePosition에 따라 배경/상단/하단/중앙으로 배치.
   *
   * top/bottom: flex 아이템으로 inline 렌더. marginTop:auto(bottom) / (top은 기본)
   *   objectFit: 'contain'으로 비율 유지, 배경은 테마 카드 색으로 채워 잘림 방지.
   * background: absolute + z-index:-1로 콘텐츠 뒤에 깔고 테마 배경색 기반 반투명
   *   오버레이로 가독성 확보 (네이비 테마면 네이비 오버레이 → 회색빛 제거)
   * center: 작은 장식 이미지로 절대 배치.
   */
  const renderImageLayer = (slide: SlideData) => {
    if (!slide.imageUrl) return null;
    const position = slide.imagePosition || 'top';

    // ── 배경: 카드 전체를 덮음, 위에 반투명 테마색 오버레이 ──
    if (position === 'background') {
      return (
        <>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: 0,
          }}>
            <img src={slide.imageUrl} alt="" crossOrigin="anonymous"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: slide.imageFocalPoint ? `${slide.imageFocalPoint.x}% ${slide.imageFocalPoint.y}%` : 'center' }} />
          </div>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: `linear-gradient(180deg, ${theme.backgroundColor}55 0%, ${theme.backgroundColor}88 100%)`,
            zIndex: 1,
          }} />
        </>
      );
    }

    // ── 중앙: 카드 중앙에 반투명으로 (워터마크 느낌) ──
    if (position === 'center') {
      return (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '65%',
          opacity: 0.35,
          zIndex: 0,
          pointerEvents: 'none' as const,
        }}>
          <img src={slide.imageUrl} alt="" crossOrigin="anonymous"
            style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: '20px' }} />
        </div>
      );
    }

    // ── 상단/하단: 너비 100%, 높이는 이미지 비율에 맞게 (최대 45%) ──
    return (
      <div style={{
        width: '100%',
        maxHeight: '45%',
        overflow: 'hidden',
        borderRadius: '16px',
        flexShrink: 0,
        marginBottom: position === 'top' ? '16px' : 0,
        marginTop: position === 'bottom' ? 'auto' : 0,
        boxShadow: isDarkTheme ? '0 8px 24px rgba(0,0,0,0.25)' : '0 4px 12px rgba(0,0,0,0.08)',
        position: 'relative',
        zIndex: 2,
      }}>
        <img src={slide.imageUrl} alt="" crossOrigin="anonymous"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            maxHeight: '100%',
            objectFit: 'cover',
            objectPosition: slide.imageFocalPoint ? `${slide.imageFocalPoint.x}% ${slide.imageFocalPoint.y}%` : 'center',
          }} />
      </div>
    );
  };

  /** 슬라이드 장식 요소 렌더링 */
  const renderDecorations = (slide: SlideData) => {
    if (!slide.decorations?.length) return null;
    return slide.decorations.map(deco => {
      const base: CSSProperties = {
        position: 'absolute', top: deco.position.top, left: deco.position.left,
        opacity: deco.opacity, transform: `rotate(${deco.rotation}deg)`,
        zIndex: 3, pointerEvents: 'none' as const,
      };
      switch (deco.type) {
        case 'star':
          return <div key={deco.id} style={{ ...base, width: `${deco.size}px`, height: `${deco.size}px` }}>
            <div style={{ width: '100%', height: '100%', clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', background: deco.color }} />
          </div>;
        case 'circle':
          return <div key={deco.id} style={{ ...base, width: `${deco.size}px`, height: `${deco.size}px`, borderRadius: '50%', border: `3px solid ${deco.color}` }} />;
        case 'line':
          return <div key={deco.id} style={{ ...base, width: `${deco.size * 3}px`, height: '4px', background: deco.color, borderRadius: '2px' }} />;
        case 'arrow':
          return <div key={deco.id} style={{ ...base, fontSize: `${deco.size}px`, color: deco.color, letterSpacing: '-8px', fontWeight: 900 }}>›››</div>;
        case 'badge':
          return <div key={deco.id} style={{ ...base, padding: '8px 20px', borderRadius: '999px', background: deco.color, color: '#fff', fontSize: '14px', fontWeight: 800 }}>NEW</div>;
        case 'corner':
          return <div key={deco.id} style={{ ...base, width: `${deco.size}px`, height: `${deco.size}px`, borderTop: `4px solid ${deco.color}`, borderLeft: `4px solid ${deco.color}` }} />;
        case 'dots':
          return <div key={deco.id} style={{ ...base, display: 'flex', gap: '8px' }}>
            {[0,1,2].map(j => <div key={j} style={{ width: `${deco.size/3}px`, height: `${deco.size/3}px`, borderRadius: '50%', background: deco.color }} />)}
          </div>;
        case 'wave':
          return <div key={deco.id} style={{ ...base, width: `${deco.size*4}px`, height: `${deco.size}px`, borderBottom: `3px solid ${deco.color}`, borderRadius: '0 0 50% 50%' }} />;
        default: return null;
      }
    });
  };

  /** 슬라이드별 병원 푸터 (로고 + 병원명, 스타일 커스텀 가능) */
  const renderHospitalFooter = (slide?: SlideData) => {
    if (!theme.hospitalName && !theme.hospitalLogo) return null;
    return (
      <div style={{
        ...(slide?.hospitalNamePosition ? {
          position: 'absolute' as const, left: `${slide.hospitalNamePosition.x}%`, top: `${slide.hospitalNamePosition.y}%`,
          transform: 'translate(-50%, -50%)', zIndex: 10,
        } : { marginTop: 'auto', paddingTop: '24px' }),
        textAlign: 'center', position: slide?.hospitalNamePosition ? 'absolute' as const : 'relative', zIndex: slide?.hospitalNamePosition ? 10 : 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
      }}>
        {theme.hospitalLogo && (
          <img src={theme.hospitalLogo} alt="" crossOrigin="anonymous" style={{ height: `${slide?.hospitalLogoSize || 40}px`, objectFit: 'contain' }} />
        )}
        {theme.hospitalName && (
          <div style={{
            color: slide?.hospitalColor || (isDarkTheme ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)'),
            fontSize: `${slide?.hospitalFontSize || 14}px`,
            fontWeight: (slide?.hospitalFontWeight || '600') as CSSProperties['fontWeight'],
            letterSpacing: '3px',
            ...(slide?.hospitalFontId ? { fontFamily: getSlideFontFamily({ ...slide, fontId: slide.hospitalFontId }) } : {}),
          }}>
            {theme.hospitalName}
          </div>
        )}
      </div>
    );
  };
  // 하위 호환: 기존 hospitalFooter 참조를 유지
  const hospitalFooter = renderHospitalFooter();

  // ═══════════════════════════════════════
  // 레이아웃별 렌더 (16종, 꽉 채움 + 깊이감 디자인)
  // ═══════════════════════════════════════
  //
  // 공통 규칙:
  // - 모든 함수는 {cardContainerStyle} div 최상단에 {backgroundDecoration} 삽입
  // - imagePosition 처리:
  //   · 'top' → content 앞에서 inline 이미지
  //   · 'bottom' → content 뒤에서 inline 이미지
  //   · 'background' / 'center' → renderImageLayer가 absolute + negative z-index로 처리
  // - 콘텐츠 영역은 flex:1 + position:relative + zIndex:2 로 배경 장식 위에 배치
  // - 각 섹션에 gap을 두고, 데이터 행에 flex:1을 주어 카드 전체를 꽉 채움

  /** 커버 템플릿 기반 렌더링 */
  const renderCoverFromTemplate = (slide: SlideData, t: CoverTemplate) => {
    const showArrows = slide.showArrows !== undefined ? slide.showArrows : t.decorations.hasArrows;
    const showBadgeD = slide.showBadge !== undefined ? slide.showBadge : t.decorations.hasBadge;
    const showHashtags = slide.showHashtags !== undefined ? slide.showHashtags : t.decorations.hasHashtags;
    const showHandle = slide.showHandle !== undefined ? slide.showHandle : t.decorations.hasHandle;
    const showLine = slide.showLine !== undefined ? slide.showLine : t.decorations.hasLine;

    const bgStyle: CSSProperties = {};
    if (t.background.type === 'gradient') bgStyle.background = t.background.gradient;
    else if (t.background.type === 'solid') bgStyle.background = t.background.solidColor;

    const posMap: Record<string, CSSProperties> = {
      'center': { justifyContent: 'center', alignItems: 'center', textAlign: 'center' },
      'bottom-left': { justifyContent: 'flex-end', alignItems: 'flex-start', textAlign: 'left', paddingBottom: '100px' },
      'bottom-center': { justifyContent: 'flex-end', alignItems: 'center', textAlign: 'center', paddingBottom: '80px' },
      'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', paddingTop: '80px' },
      'top-right': { justifyContent: 'flex-start', alignItems: 'flex-end', textAlign: 'right', paddingTop: '80px' },
    };

    return (
      <div style={{ ...getCardStyle(slide), ...bgStyle, padding: '60px' }}>
        {backgroundDecoration}
        {renderDecorations(slide)}
        {/* 이미지: slide.imagePosition 우선, 없으면 템플릿 background.type 사용 */}
        {(slide.imagePosition === 'background' || slide.imagePosition === 'center' || (!slide.imagePosition && (t.background.type === 'image-full' || t.background.type === 'image-half'))) && renderImageLayer(slide)}
        {slide.imagePosition === 'top' && renderImageLayer(slide)}
        {/* split: 좌텍스트 우이미지 */}
        {t.background.type === 'split' && slide.imageUrl && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', zIndex: 0 }}>
            <img src={slide.imageUrl} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {/* 뱃지 */}
        {showBadgeD && (slide.badge || theme.hospitalName) && (
          <div style={{
            position: 'absolute', top: '40px', zIndex: 5,
            ...(t.decorations.badgePosition === 'top-left' ? { left: '40px' } : t.decorations.badgePosition === 'top-right' ? { right: '40px' } : { left: '50%', transform: 'translateX(-50%)' }),
            padding: '8px 20px', background: t.colors.accent, color: '#fff', fontSize: '13px', fontWeight: 800, borderRadius: '6px', letterSpacing: '1px',
          }}>{slide.badge || theme.hospitalName || 'CARDNEWS'}</div>
        )}
        {/* 메인 텍스트 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 3, gap: '16px', ...posMap[t.layout.titlePosition] }}>
          {t.layout.subtitlePosition === 'above-title' && slide.subtitle && (
            <p style={{ color: t.colors.subtitle, fontSize: `${t.layout.subtitleSize}px`, fontWeight: 500, letterSpacing: '1px' }}>&ldquo;{slide.subtitle}&rdquo;</p>
          )}
          {showLine && <div style={{ width: '60px', height: '3px', background: t.colors.accent, borderRadius: '2px', margin: t.layout.titlePosition.includes('center') ? '0 auto' : '0' }} />}
          <div style={slide.titlePosition ? { position: 'absolute', left: `${slide.titlePosition.x}%`, top: `${slide.titlePosition.y}%`, transform: 'translate(-50%, -50%)', zIndex: 10 } : {}}>
            <h1 style={{ ...getTitleStyle(slide, { fontSize: t.layout.titleSize, textAlign: posMap[t.layout.titlePosition]?.textAlign as string }), color: slide.titleColor || t.colors.title, fontWeight: (slide.titleFontWeight || String(t.layout.titleWeight)) as CSSProperties['fontWeight'], maxWidth: t.layout.titleMaxWidth }}>
              {slide.title}
            </h1>
          </div>
          {t.layout.subtitlePosition === 'below-title' && slide.subtitle && (
            <div style={slide.subtitlePosition ? { position: 'absolute', left: `${slide.subtitlePosition.x}%`, top: `${slide.subtitlePosition.y}%`, transform: 'translate(-50%, -50%)', zIndex: 10 } : {}}>
              <p style={{ color: slide.subtitleColor || t.colors.subtitle, fontSize: `${slide.subtitleFontSize || t.layout.subtitleSize}px`, fontWeight: 500, maxWidth: '85%' }}>{slide.subtitle}</p>
            </div>
          )}
        </div>
        {/* 해시태그 */}
        {showHashtags && (
          <div style={{ position: 'absolute', bottom: '80px', left: '60px', right: '60px', display: 'flex', gap: '12px', flexWrap: 'wrap', zIndex: 5, justifyContent: t.layout.titlePosition.includes('center') ? 'center' : 'flex-start' }}>
            {(slide.hashtags || slide.title?.split(' ').slice(0, 3).map(w => `#${w}`) || []).map((tag, i) => (
              <span key={i} style={{ padding: '8px 20px', borderRadius: '999px', border: `1.5px solid ${t.colors.hashtag}60`, color: t.colors.hashtag, fontSize: '15px', fontWeight: 700 }}>
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}
        {/* 화살표 */}
        {showArrows && (
          <div style={{ position: 'absolute', bottom: '40px', right: '60px', zIndex: 5 }}>
            {t.decorations.arrowStyle === 'circle' ? (
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: `2px solid ${t.colors.title}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.colors.title, fontSize: '20px' }}>→</div>
            ) : (
              <span style={{ color: t.colors.title, fontSize: '24px', fontWeight: 300, letterSpacing: '4px', opacity: 0.6 }}>› › › ›</span>
            )}
          </div>
        )}
        {/* SNS 핸들 */}
        {showHandle && theme.hospitalName && (
          <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', color: t.colors.subtitle, fontSize: '13px', fontWeight: 500, zIndex: 5 }}>
            @{theme.hospitalName.replace(/\s/g, '_').toLowerCase()}
          </div>
        )}
        {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
        {renderHospitalFooter(slide)}
      </div>
    );
  };

  const renderCover = (slide: SlideData) => {
    // 커버 템플릿이 선택되어 있으면 템플릿 기반 렌더링
    const tmpl = slide.coverTemplateId ? COVER_TEMPLATES.find(t => t.id === slide.coverTemplateId) : null;
    if (tmpl) return renderCoverFromTemplate(slide, tmpl);

    return (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          gap: '28px',
        }}
      >
        <div style={{ width: '72px', height: '5px', background: theme.accentColor, borderRadius: '3px' }} />
        <h1 style={{
            ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 64, 42), textAlign: 'center' }),
            fontWeight: (slide.titleFontWeight || '900') as CSSProperties['fontWeight'],
            lineHeight: slide.titleLineHeight || 1.2,
            textShadow: isDarkTheme ? '0 2px 24px rgba(0,0,0,0.25)' : 'none',
            maxWidth: '90%',
          }}>
          {slide.title}
        </h1>
        {slide.subtitle && (
          <p
            style={{
              color: theme.subtitleColor,
              fontSize: '22px',
              fontWeight: 600,
              lineHeight: 1.55,
              maxWidth: '85%',
              wordBreak: 'keep-all',
            }}
          >
            {slide.subtitle}
          </p>
        )}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
    );
  };

  const renderInfo = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
          gap: '22px',
        }}
      >
        {titleAccent('left')}
        <h2
          style={{
            color: theme.titleColor,
            fontSize: '48px',
            fontWeight: 800,
            wordBreak: 'keep-all',
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            whiteSpace: 'pre-line',
          }}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p
            style={{
              color: theme.subtitleColor,
              fontSize: '22px',
              fontWeight: 600,
              lineHeight: 1.55,
              wordBreak: 'keep-all',
            }}
          >
            {slide.subtitle}
          </p>
        )}
        {slide.body && (
          <div
            style={{
              ...getBodyStyle(slide),
              whiteSpace: 'pre-line',
              background: innerCardBg,
              borderRadius: '18px',
              padding: '32px 36px',
              borderLeft: `5px solid ${theme.accentColor}`,
              wordBreak: 'keep-all',
            }}
          >
            {slide.body}
          </div>
        )}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderComparison = (slide: SlideData) => {
    const cols = slide.columns || [];
    const labels = slide.compareLabels || [];
    const rowCount = labels.length || (cols[0]?.items?.length || 0);
    const gridTemplate = labels.length > 0 ? `160px repeat(${cols.length}, 1fr)` : `repeat(${cols.length}, 1fr)`;

    return (
      <div style={getCardStyle(slide)}>
        {backgroundDecoration}
      {renderDecorations(slide)}
        {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
        <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
          {titleAccent('center')}
          <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }), lineHeight: 1.25 }}>
            {slide.title}
          </h2>
          {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', textAlign: 'center', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', borderRadius: '20px', overflow: 'hidden', position: 'relative', zIndex: 2 }}>
          {/* VS 뱃지 (2열일 때) */}
          {cols.length === 2 && labels.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '48px', height: '48px', borderRadius: '50%', background: theme.accentColor, color: '#fff', fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: `0 4px 16px ${theme.accentColor}44` }}>{slide.vsIcon || 'VS'}</div>
          )}
          {/* 헤더 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '3px' }}>
            {labels.length > 0 && <div style={{ background: 'transparent' }} />}
            {cols.map((col, ci) => (
              <div
                key={ci}
                style={{
                  background: col.highlight ? theme.accentColor : theme.cardBgColor,
                  color: col.highlight ? '#FFFFFF' : '#1A1A2E',
                  padding: '24px 18px',
                  textAlign: 'center',
                  fontSize: '22px',
                  fontWeight: 900,
                  letterSpacing: '-0.01em',
                }}
              >
                {col.header}
              </div>
            ))}
          </div>
          {/* 데이터 행 — flex:1로 남은 공간 균등 분배 */}
          {Array.from({ length: rowCount }).map((_, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '3px', flex: 1 }}>
              {labels.length > 0 && (
                <div
                  style={{
                    background: isDarkTheme ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                    color: theme.titleColor,
                    padding: '18px 14px',
                    fontSize: '17px',
                    fontWeight: 800,
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
                    background: col.highlight ? `${theme.accentColor}1F` : innerCardBg,
                    color: col.highlight ? theme.accentColor : theme.titleColor,
                    padding: '18px 14px',
                    textAlign: 'center',
                    fontSize: '18px',
                    fontWeight: col.highlight ? 800 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    wordBreak: 'keep-all',
                    lineHeight: 1.4,
                  }}
                >
                  {col.items[ri] || ''}
                </div>
              ))}
            </div>
          ))}
        </div>
        {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
        {renderHospitalFooter(slide)}
      </div>
    );
  };

  const renderIconGrid = (slide: SlideData) => {
    const items = slide.icons || [];
    const cols = calcGridCols(items.length);
    return (
      <div style={getCardStyle(slide)}>
        {backgroundDecoration}
      {renderDecorations(slide)}
        {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
        <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
          {titleAccent('center')}
          <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }) }}>
            {slide.title}
          </h2>
          {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', textAlign: 'center', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '22px', alignContent: 'stretch', position: 'relative', zIndex: 2 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                background: whiteCardBg,
                borderRadius: '20px',
                padding: '36px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '12px',
                boxShadow: isDarkTheme ? '0 8px 32px rgba(0,0,0,0.2)' : '0 4px 20px rgba(0,0,0,0.08)',
                border: `1px solid ${innerCardBorder}`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* 배경 번호 (01, 02, 03 ...) — 프로 병원 카드뉴스 시그니처 요소 */}
              <div
                style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '12px',
                  fontSize: '80px',
                  fontWeight: 900,
                  color: isDarkTheme ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.03)',
                  lineHeight: 1,
                  pointerEvents: 'none' as const,
                  userSelect: 'none' as const,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <span style={{ fontSize: '56px', lineHeight: 1, position: 'relative', zIndex: 1 }}>{item.emoji}</span>
              <span style={{ fontSize: '22px', fontWeight: 900, color: whiteCardText, wordBreak: 'keep-all', position: 'relative', zIndex: 1 }}>{item.title}</span>
              {item.desc && (
                <span style={{ fontSize: '15px', color: whiteCardSub, lineHeight: 1.55, wordBreak: 'keep-all', fontWeight: 500, position: 'relative', zIndex: 1 }}>
                  {item.desc}
                </span>
              )}
            </div>
          ))}
        </div>
        {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
        {renderHospitalFooter(slide)}
      </div>
    );
  };

  const renderSteps = (slide: SlideData) => {
    const items = slide.steps || [];
    const stepsLayout = calcItemLayout(items.length);
    const isHorizontal = items.length <= 3;
    return (
      <div style={getCardStyle(slide)}>
        {backgroundDecoration}
      {renderDecorations(slide)}
        {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
        {slide.imagePosition === 'top' && renderImageLayer(slide)}
        <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
          {titleAccent('center')}
          <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }) }}>{slide.title}</h2>
          {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', textAlign: 'center', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', justifyContent: 'center', gap: `${stepsLayout.gap}px`, position: 'relative', zIndex: 2 }}>
          {items.map((step, i) => (
            <div
              key={i}
              style={isHorizontal ? {
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                gap: '16px', background: innerCardBg, borderRadius: '20px', padding: `${stepsLayout.padding}px 20px`,
                clipPath: i < items.length - 1 ? 'polygon(0% 0%, 88% 0%, 100% 50%, 88% 100%, 0% 100%)' : undefined,
                paddingRight: i < items.length - 1 ? '40px' : '20px',
              } : {
                display: 'flex', alignItems: 'center', gap: '24px', background: innerCardBg,
                borderRadius: '20px', padding: `${stepsLayout.padding}px 30px`,
                borderLeft: `6px solid ${theme.accentColor}`,
                boxShadow: isDarkTheme ? 'none' : '0 4px 12px rgba(0,0,0,0.04)', flex: 1,
              }}
            >
              <div style={{
                width: isHorizontal ? '56px' : '64px', height: isHorizontal ? '56px' : '64px',
                borderRadius: '50%', background: theme.accentColor, color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isHorizontal ? '24px' : '28px', fontWeight: 900, flexShrink: 0,
                boxShadow: `0 6px 18px ${theme.accentColor}40`,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: isHorizontal ? undefined : 1 }}>
                <div style={{ color: theme.titleColor, fontSize: `${Math.min(24, stepsLayout.fontSize + 2)}px`, fontWeight: 800, wordBreak: 'keep-all', marginBottom: step.desc ? '6px' : 0 }}>
                  {step.label}
                </div>
                {step.desc && (
                  <div style={{ color: theme.bodyColor, fontSize: `${stepsLayout.fontSize - 2}px`, lineHeight: 1.55, wordBreak: 'keep-all' }}>
                    {step.desc}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
        {renderHospitalFooter(slide)}
      </div>
    );
  };

  const renderChecklist = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('left')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36) }) }}>{slide.title}</h2>
        {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
      </div>
      {(() => {
        const checkLayout = calcItemLayout((slide.checkItems || []).length);
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: `${checkLayout.gap}px`, justifyContent: 'center', position: 'relative', zIndex: 2 }}>
            {(slide.checkItems || []).map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  background: innerCardBg,
                  borderRadius: '999px',
                  padding: `${checkLayout.padding}px 28px`,
                  border: `1px solid ${innerCardBorder}`,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
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
                  {slide.checkIcon || '✓'}
                </div>
                <span style={{ color: theme.titleColor, fontSize: `${checkLayout.fontSize}px`, fontWeight: 600, wordBreak: 'keep-all', flex: 1 }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        );
      })()}
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderDataHighlight = (slide: SlideData) => {
    const points = slide.dataPoints || [];
    const cols = Math.min(Math.max(points.length, 1), 3);
    const containerW = Math.floor((cardWidth - 128 - (cols - 1) * 24) / cols);
    return (
      <div style={getCardStyle(slide)}>
        {backgroundDecoration}
      {renderDecorations(slide)}
        {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
        {slide.imagePosition === 'top' && renderImageLayer(slide)}
        <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
          {titleAccent('center')}
          <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }) }}>{slide.title}</h2>
          {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', textAlign: 'center', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '24px', alignContent: 'center', position: 'relative', zIndex: 2 }}>
          {points.map((dp, i) => {
            const shape = slide.dataShape || 'rounded';
            return (
              <div
                key={i}
                style={{
                  textAlign: 'center',
                  padding: shape === 'rounded' ? '48px 28px' : '40px 20px',
                  background: dp.highlight ? `${theme.accentColor}15` : innerCardBg,
                  borderRadius: shape === 'rounded' ? '24px' : shape === 'pill' ? '999px' : shape === 'circle' ? '50%' : '24px',
                  aspectRatio: shape === 'circle' ? '1 / 1' : undefined,
                  border: dp.highlight ? `2px solid ${theme.accentColor}` : `1px solid ${innerCardBorder}`,
                  boxShadow: dp.highlight
                    ? `0 8px 30px ${theme.accentColor}25`
                    : (isDarkTheme ? 'none' : '0 4px 16px rgba(0,0,0,0.06)'),
                  display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', alignItems: 'center',
                }}
              >
                <div
                  style={{
                    color: dp.highlight ? theme.accentColor : theme.titleColor,
                    fontSize: `${calcValueSize(dp.value, containerW)}px`,
                    fontWeight: 900,
                    marginBottom: '14px',
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {dp.value}
                </div>
                <div style={{ color: theme.bodyColor, fontSize: '16px', fontWeight: 600, wordBreak: 'keep-all', lineHeight: 1.4 }}>
                  {dp.label}
                </div>
              </div>
            );
          })}
        </div>
        {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
        {renderHospitalFooter(slide)}
      </div>
    );
  };

  const renderClosing = (slide: SlideData) => {
    const tmpl = slide.coverTemplateId ? COVER_TEMPLATES.find(t => t.id === slide.coverTemplateId) : null;
    if (tmpl) return renderCoverFromTemplate(slide, tmpl);
    return (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          gap: '26px',
        }}
      >
        {slide.subtitle && (
          <div
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              background: `${theme.accentColor}22`,
              color: theme.accentColor,
              borderRadius: '999px',
              fontSize: '22px',
              fontWeight: 800,
              letterSpacing: '0.02em',
            }}
          >
            {slide.subtitle}
          </div>
        )}
        <h1 style={{
            ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 64, 42), textAlign: 'center' }),
            fontWeight: (slide.titleFontWeight || '900') as CSSProperties['fontWeight'],
            lineHeight: slide.titleLineHeight || 1.25,
            textShadow: isDarkTheme ? '0 2px 24px rgba(0,0,0,0.25)' : 'none',
            maxWidth: '90%',
          }}>
          {slide.title}
        </h1>
        {slide.body && (
          <p
            style={{
              color: theme.bodyColor,
              fontSize: '20px',
              lineHeight: 1.7,
              maxWidth: '80%',
              wordBreak: 'keep-all',
            }}
          >
            {slide.body}
          </p>
        )}
        {theme.hospitalName && (
          <div
            style={{
              marginTop: '12px',
              color: theme.titleColor,
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '4px',
              paddingTop: '20px',
              borderTop: `3px solid ${theme.accentColor}`,
              paddingLeft: '40px',
              paddingRight: '40px',
            }}
          >
            {theme.hospitalName}
          </div>
        )}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
    </div>
    );
  };

  const renderBeforeAfter = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('center')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }) }}>{slide.title}</h2>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px', position: 'relative', zIndex: 2 }}>
        {/* ⇄ 화살표 */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', borderRadius: '50%', background: theme.accentColor, color: '#fff', fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: `0 4px 12px ${theme.accentColor}44` }}>{slide.baArrowIcon || '→'}</div>
        {/* BEFORE */}
        <div style={{ background: innerCardBg, borderRadius: '20px', padding: '32px 26px', border: `1px solid ${innerCardBorder}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: theme.bodyColor, fontSize: '18px', fontWeight: 900, textAlign: 'center', marginBottom: '24px', letterSpacing: '4px' }}>
            {slide.beforeLabel || 'BEFORE'}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center' }}>
            {(slide.beforeItems || []).map((item, i) => (
              <div key={i} style={{ color: theme.bodyColor, fontSize: '20px', padding: '8px 0', borderBottom: `1px solid ${innerCardBorder}`, wordBreak: 'keep-all', lineHeight: 1.5, flex: 1 }}>
                • {item}
              </div>
            ))}
          </div>
        </div>
        {/* AFTER */}
        <div style={{ background: `${theme.accentColor}1F`, borderRadius: '20px', padding: '32px 26px', border: `2px solid ${theme.accentColor}`, display: 'flex', flexDirection: 'column', boxShadow: `0 10px 30px ${theme.accentColor}22` }}>
          <div style={{ color: theme.accentColor, fontSize: '18px', fontWeight: 900, textAlign: 'center', marginBottom: '24px', letterSpacing: '4px' }}>
            {slide.afterLabel || 'AFTER'}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center' }}>
            {(slide.afterItems || []).map((item, i) => (
              <div key={i} style={{ color: theme.titleColor, fontSize: '20px', fontWeight: 700, padding: '8px 0', borderBottom: `1px solid ${theme.accentColor}33`, wordBreak: 'keep-all', lineHeight: 1.5, flex: 1 }}>
                ✓ {item}
              </div>
            ))}
          </div>
        </div>
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderQna = (slide: SlideData) => {
    const qaLayout = calcItemLayout((slide.questions || []).length);
    return (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('left')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36) }) }}>{slide.title}</h2>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: `${qaLayout.gap}px`, justifyContent: 'center', position: 'relative', zIndex: 2 }}>
        {(slide.questions || []).map((qa, i) => (
          <div key={i} style={{ background: innerCardBg, borderRadius: '18px', padding: `${qaLayout.padding}px 28px`, border: `1px solid ${innerCardBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '14px' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: theme.accentColor,
                  color: '#fff',
                  fontSize: '22px',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Q
              </span>
              <span style={{ color: theme.titleColor, fontSize: '22px', fontWeight: 800, lineHeight: 1.4, paddingTop: '8px', flex: 1, wordBreak: 'keep-all' }}>
                {qa.q}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                  color: theme.accentColor,
                  fontSize: '22px',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                A
              </span>
              <span style={{ color: theme.bodyColor, fontSize: '18px', lineHeight: 1.65, paddingTop: '10px', flex: 1, wordBreak: 'keep-all' }}>
                {qa.a}
              </span>
            </div>
          </div>
        ))}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
    );
  };

  const renderTimeline = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('left')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36) }) }}>{slide.title}</h2>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', paddingLeft: '56px', zIndex: 2 }}>
        <div style={{ position: 'absolute', left: '24px', top: '12px', bottom: '12px', width: '4px', background: `${theme.accentColor}55`, borderRadius: '2px' }} />
        {(slide.timelineItems || []).map((item, i) => {
          const tlLayout = calcItemLayout((slide.timelineItems || []).length);
          return (
          <div key={i} style={{ marginBottom: `${tlLayout.gap}px`, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '-48px',
                top: '2px',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: theme.accentColor,
                color: '#fff',
                fontSize: '13px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `4px solid ${theme.backgroundColor}`,
                boxShadow: `0 0 0 3px ${theme.accentColor}77`,
              }}
            >
              {i + 1}
            </div>
            <div style={{ display: 'inline-block', background: `${theme.accentColor}20`, color: theme.accentColor, fontSize: '14px', fontWeight: 900, padding: '4px 14px', borderRadius: '999px', marginBottom: '8px', letterSpacing: '1px' }}>
              {item.time}
            </div>
            <div style={{ color: theme.titleColor, fontSize: `${tlLayout.fontSize}px`, fontWeight: 800, wordBreak: 'keep-all' }}>{item.title}</div>
            {item.desc && (
              <div style={{ color: theme.bodyColor, fontSize: `${tlLayout.fontSize - 4}px`, marginTop: '8px', lineHeight: 1.55, wordBreak: 'keep-all' }}>
                {item.desc}
              </div>
            )}
          </div>
          );
        })}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderQuote = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {/* 배경 장식 원 */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '300px', height: '300px', borderRadius: '50%', background: `${theme.accentColor}08`, zIndex: 0, pointerEvents: 'none' as const }} />
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          gap: '30px',
        }}
      >
        <div style={{ fontSize: '140px', color: theme.accentColor, opacity: 0.35, lineHeight: 0.85, fontFamily: 'Georgia, serif' }}>
          &ldquo;
        </div>
        <p
          style={{
            color: theme.titleColor,
            fontSize: `${calcTitleSize(slide.quoteText || slide.body || '', 28, 20)}px`,
            borderBottom: `3px solid ${theme.accentColor}40`,
            paddingBottom: '16px',
            fontWeight: 700,
            lineHeight: 1.6,
            maxWidth: '85%',
            wordBreak: 'keep-all',
            letterSpacing: '-0.01em',
          }}
        >
          {slide.quoteText || slide.body}
        </p>
        {slide.quoteAuthor && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ color: theme.accentColor, fontSize: '24px', fontWeight: 900, marginBottom: '6px' }}>
              — {slide.quoteAuthor}
            </div>
            {slide.quoteRole && (
              <div style={{ color: theme.bodyColor, fontSize: '18px', fontWeight: 500 }}>{slide.quoteRole}</div>
            )}
          </div>
        )}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderNumberedList = (slide: SlideData) => {
    const nlItems = slide.numberedItems || [];
    const nlLayout = calcItemLayout(nlItems.length);
    return (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('left')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36) }) }}>{slide.title}</h2>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: `${nlLayout.gap}px`, justifyContent: 'center', position: 'relative', zIndex: 2 }}>
        {nlItems.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              background: innerCardBg,
              borderRadius: '18px',
              padding: `${nlLayout.padding}px 28px`,
              border: `1px solid ${innerCardBorder}`,
              position: 'relative',
            }}
          >
            {/* 연결선 (마지막 항목 제외) */}
            {i < nlItems.length - 1 && (
              <div style={{ position: 'absolute', left: '50px', bottom: `-${nlLayout.gap + 2}px`, width: '3px', height: `${nlLayout.gap + 4}px`, background: `${theme.accentColor}30` }} />
            )}
            <span
              style={{
                flexShrink: 0,
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: `linear-gradient(135deg, ${theme.accentColor}, ${theme.accentColor}CC)`,
                color: '#FFFFFF',
                fontSize: '26px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 24px ${theme.accentColor}44`,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {item.num || String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ color: theme.titleColor, fontSize: `${nlLayout.fontSize}px`, fontWeight: 800, wordBreak: 'keep-all' }}>{item.title}</div>
              {item.desc && (
                <div style={{ color: theme.bodyColor, fontSize: `${nlLayout.fontSize - 4}px`, marginTop: '6px', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                  {item.desc}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
    );
  };

  const renderProsCons = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('center')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }) }}>{slide.title}</h2>
      </div>
      {(() => {
        const pcLayout = calcItemLayout(Math.max((slide.pros || []).length, (slide.cons || []).length));
        return (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', position: 'relative', zIndex: 2 }}>
          <div style={{ background: 'rgba(52,211,153,0.14)', borderRadius: '20px', padding: '28px 24px', border: '2px solid rgba(52,211,153,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#34D399', color: '#fff', fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>{slide.prosIcon || 'O'}</div>
            <div style={{ color: '#34D399', fontSize: '18px', fontWeight: 900, textAlign: 'center', marginBottom: '16px' }}>
              {slide.prosLabel || '장점'}
            </div>
            <div style={{ width: '100%', height: '2px', background: 'rgba(52,211,153,0.3)', marginBottom: '16px' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: `${pcLayout.gap}px`, justifyContent: 'center', width: '100%' }}>
              {(slide.pros || []).map((p, i) => (
                <div key={i} style={{ color: theme.titleColor, fontSize: `${pcLayout.fontSize}px`, padding: '6px 0', display: 'flex', gap: '10px', wordBreak: 'keep-all', lineHeight: 1.5, flex: 1 }}>
                  <span style={{ color: '#34D399', fontWeight: 900, flexShrink: 0 }}>○</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.14)', borderRadius: '20px', padding: '28px 24px', border: '2px solid rgba(239,68,68,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#EF4444', color: '#fff', fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>{slide.consIcon || 'X'}</div>
            <div style={{ color: '#F87171', fontSize: '18px', fontWeight: 900, textAlign: 'center', marginBottom: '16px' }}>
              {slide.consLabel || '주의점'}
            </div>
            <div style={{ width: '100%', height: '2px', background: 'rgba(239,68,68,0.3)', marginBottom: '16px' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: `${pcLayout.gap}px`, justifyContent: 'center', width: '100%' }}>
              {(slide.cons || []).map((c, i) => (
                <div key={i} style={{ color: theme.titleColor, fontSize: `${pcLayout.fontSize}px`, padding: '6px 0', display: 'flex', gap: '10px', wordBreak: 'keep-all', lineHeight: 1.5, flex: 1 }}>
                  <span style={{ color: '#F87171', fontWeight: 900, flexShrink: 0 }}>✕</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        );
      })()}
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderPriceTable = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        {titleAccent('center')}
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.title, 52, 36), textAlign: 'center' }) }}>{slide.title}</h2>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', borderRadius: '20px', overflow: 'hidden', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '3px' }}>
          <div style={{ background: theme.accentColor, color: '#fff', padding: '22px 20px', fontWeight: 900, fontSize: '22px', textAlign: 'center' }}>💊 시술 항목</div>
          <div style={{ background: theme.accentColor, color: '#fff', padding: '22px 20px', fontWeight: 900, fontSize: '22px', textAlign: 'center' }}>💰 예상 비용</div>
        </div>
        {(slide.priceItems || []).map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '3px', flex: 1 }}>
            <div
              style={{
                background: i % 2 === 0 ? innerCardBg : (isDarkTheme ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                padding: '22px',
                color: theme.titleColor,
                fontWeight: 700,
                fontSize: '20px',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                wordBreak: 'keep-all',
              }}
            >
              {item.name}
            </div>
            <div
              style={{
                background: i % 2 === 0 ? innerCardBg : (isDarkTheme ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                padding: '18px 22px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: theme.accentColor, fontWeight: 900, fontSize: '24px', letterSpacing: '-0.01em' }}>{item.price}</span>
              {item.note && <span style={{ fontSize: '13px', color: theme.bodyColor, marginTop: '4px', fontWeight: 500 }}>{item.note}</span>}
            </div>
          </div>
        ))}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  const renderWarning = (slide: SlideData) => (
    <div style={getCardStyle(slide)}>
      {backgroundDecoration}
      {renderDecorations(slide)}
      {/* 빨간 상단 바 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8px', background: 'linear-gradient(90deg, #EF4444, #F87171, #EF4444)', zIndex: 10, pointerEvents: 'none' as const }} />
      {(slide.imagePosition === 'background' || slide.imagePosition === 'center') && renderImageLayer(slide)}
      {slide.imagePosition === 'top' && renderImageLayer(slide)}
      <div style={{ textAlign: 'center', marginBottom: '16px', position: 'relative', zIndex: 2 }}>
        <span style={{ fontSize: '80px', lineHeight: 1 }}>⚠️</span>
      </div>
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '24px' }}>
        <h2 style={{ ...getTitleStyle(slide, { fontSize: calcTitleSize(slide.warningTitle || slide.title, 52, 36), textAlign: 'center' }), color: theme.accentColor, fontWeight: 900 as CSSProperties['fontWeight'] }}>
          {slide.warningTitle || slide.title}
        </h2>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
        {(slide.warningItems || []).map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              background: 'rgba(239,68,68,0.14)',
              borderRadius: '16px',
              padding: '24px 28px',
              borderLeft: '6px solid #F87171',
            }}
          >
            <span style={{ color: '#F87171', fontSize: '24px', flexShrink: 0, fontWeight: 900 }}>❗</span>
            <span style={{ color: theme.titleColor, fontSize: '20px', fontWeight: 600, wordBreak: 'keep-all', lineHeight: 1.5, flex: 1 }}>
              {item}
            </span>
          </div>
        ))}
      </div>
      {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
      {renderHospitalFooter(slide)}
    </div>
  );

  // ═══════════════════════════════════════
  // 레이아웃 분기
  // ═══════════════════════════════════════

  const renderSlide = (slide: SlideData) => {
    switch (slide.layout) {
      case 'cover':          return renderCover(slide);
      case 'comparison':     return renderComparison(slide);
      case 'icon-grid':      return renderIconGrid(slide);
      case 'steps':          return renderSteps(slide);
      case 'checklist':      return renderChecklist(slide);
      case 'data-highlight': return renderDataHighlight(slide);
      case 'closing':        return renderClosing(slide);
      case 'before-after':   return renderBeforeAfter(slide);
      case 'qna':            return renderQna(slide);
      case 'timeline':       return renderTimeline(slide);
      case 'quote':          return renderQuote(slide);
      case 'numbered-list':  return renderNumberedList(slide);
      case 'pros-cons':      return renderProsCons(slide);
      case 'price-table':    return renderPriceTable(slide);
      case 'warning':        return renderWarning(slide);
      default:               return renderInfo(slide);
    }
  };

  return {
    renderSlide,
    renderCtx,
    cardWidth,
    cardHeight,
    cardAspect,
  };
}
