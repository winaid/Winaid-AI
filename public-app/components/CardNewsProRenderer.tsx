'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SlideData, CardNewsTheme, SlideLayoutType, SlideImagePosition, SlideImageStyle, SlideComparisonColumn } from '../lib/cardNewsLayouts';
import { LAYOUT_LABELS, CARD_FONTS, FONT_CATEGORIES, getCardFont, SLIDE_IMAGE_STYLES } from '../lib/cardNewsLayouts';

/** Google Fonts CDN에서 한 번만 로드. 이미 있으면 스킵 */
function ensureGoogleFontLoaded(fontId: string) {
  if (typeof document === 'undefined') return;
  const font = CARD_FONTS.find(f => f.id === fontId);
  if (!font || !font.googleImport) return;
  const linkId = `gfont-${font.id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleImport}&display=swap`;
  document.head.appendChild(link);
}

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
 *
 * 미리보기 스케일 전략:
 *   카드 콘텐츠는 항상 1080×1080 고정. 미리보기 컨테이너는 그리드 셀을
 *   꽉 채우는 1:1 박스(width: 100%, aspect-ratio: 1/1)이고, 그 안의
 *   1080×1080 원본을 ResizeObserver로 측정한 컨테이너 폭에 맞춰 동적으로
 *   transform: scale(컨테이너폭 / 1080)로 축소한다. 다운로드는 별도의
 *   captureNodeAsCanvas 헬퍼가 scale을 제거한 복제본을 풀사이즈로 캡처.
 */
export default function CardNewsProRenderer({ slides, theme, onSlidesChange, onThemeChange }: Props) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [scales, setScales] = useState<number[]>([]);
  // 슬라이드별 AI 이미지/텍스트 생성 상태
  const [generatingImageIdx, setGeneratingImageIdx] = useState<number | null>(null);
  const [aiSuggestingKey, setAiSuggestingKey] = useState<string | null>(null); // `${idx}:${field}`

  // 미리보기 박스 폭에 맞춰 scale 재계산
  useEffect(() => {
    const recompute = () => {
      const next = boxRefs.current.map(box => (box ? box.clientWidth / 1080 : 0.25));
      setScales(prev => {
        if (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.0005)) return prev;
        return next;
      });
    };
    recompute();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    boxRefs.current.forEach(el => { if (el && observer) observer.observe(el); });
    window.addEventListener('resize', recompute);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [slides.length, editingIdx]);

  // 선택된 폰트가 Google Fonts 기반이면 CDN에서 로드
  useEffect(() => {
    if (theme.fontId) ensureGoogleFontLoaded(theme.fontId);
  }, [theme.fontId]);

  /** 특정 슬라이드 업데이트 (얕은 머지) */
  const updateSlide = (idx: number, patch: Partial<SlideData>) => {
    onSlidesChange(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  /** 슬라이드별 AI 이미지 생성 */
  const handleGenerateSlideImage = async (idx: number) => {
    const slide = slides[idx];
    if (!slide) return;
    setGeneratingImageIdx(idx);
    try {
      const styleId = slide.imageStyle || 'illustration';
      const styleDef = SLIDE_IMAGE_STYLES.find(s => s.id === styleId) || SLIDE_IMAGE_STYLES[0];
      const subject = slide.visualKeyword || slide.title;
      const fullPrompt = `${subject}, ${styleDef.prompt}`;
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          aspectRatio: '16:9',
          mode: 'card_news',
          imageStyle: 'illustration',
        }),
      });
      const data = await res.json() as { imageDataUrl?: string; error?: string };
      if (res.ok && data.imageDataUrl) {
        updateSlide(idx, {
          imageUrl: data.imageDataUrl,
          imagePosition: slide.imagePosition || 'top',
        });
      } else {
        console.warn('[CARD_NEWS_PRO] AI 이미지 생성 실패', data.error);
      }
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] AI 이미지 생성 에러', err);
    } finally {
      setGeneratingImageIdx(null);
    }
  };

  /** 사용자 파일 업로드 */
  const handleUploadSlideImage = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const slide = slides[idx];
      updateSlide(idx, {
        imageUrl: reader.result as string,
        imagePosition: slide?.imagePosition || 'top',
      });
    };
    reader.readAsDataURL(file);
  };

  /** AI 텍스트 필드 추천 (title / subtitle / body) */
  const handleAiSuggestText = async (idx: number, field: 'title' | 'subtitle' | 'body') => {
    const slide = slides[idx];
    if (!slide) return;
    const key = `${idx}:${field}`;
    setAiSuggestingKey(key);
    try {
      const context = `카드뉴스 슬라이드 ${slide.index}장 (레이아웃: ${slide.layout})
현재 제목: ${slide.title}
현재 부제: ${slide.subtitle || ''}
현재 본문: ${slide.body || ''}
전체 주제: ${slides[0]?.title || ''}`;
      const prompts: Record<string, string> = {
        title: '위 카드뉴스 슬라이드의 제목을 더 매력적으로 다시 써줘. 20자 이내. 제목 한 줄만 출력. 따옴표·설명 금지.',
        subtitle: '위 슬라이드의 부제를 써줘. 25자 이내. 부제 한 줄만 출력. 따옴표·설명 금지.',
        body: '위 슬라이드의 본문을 구체적 수치 포함해 다시 써줘. 3문장 이내. 본문만 출력. 따옴표·설명 금지.',
      };
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${context}\n\n${prompts[field]}`,
          systemInstruction: '카드뉴스 콘텐츠 전문가. 요청한 필드 값만 반환. 의료광고법 준수. 최상급/단정 표현 금지.',
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.8,
          maxOutputTokens: 200,
        }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) {
        const cleaned = data.text.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (cleaned) updateSlide(idx, { [field]: cleaned } as Partial<SlideData>);
      }
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] AI 추천 실패', err);
    } finally {
      setAiSuggestingKey(null);
    }
  };

  /** AI 비교표 자동 채우기 */
  const handleAiSuggestComparison = async (idx: number) => {
    const slide = slides[idx];
    if (!slide || slide.layout !== 'comparison') return;
    const key = `${idx}:comparison`;
    setAiSuggestingKey(key);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `"${slide.title}" 주제로 2열 비교표를 만들어줘.
JSON 한 객체만 출력:
{"compareLabels": ["항목1","항목2","항목3","항목4"], "columns": [{"header":"A","highlight":false,"items":["값","값","값","값"]},{"header":"B","highlight":true,"items":["값","값","값","값"]}]}`,
          systemInstruction: 'JSON만 출력. 의료 전문가. 구체적 수치 포함. 최상급/단정 표현 금지.',
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.7,
          maxOutputTokens: 500,
          responseType: 'json',
        }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) {
        try {
          const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
          const parsed = JSON.parse(cleaned) as { compareLabels?: string[]; columns?: SlideComparisonColumn[] };
          if (parsed.compareLabels && parsed.columns) {
            updateSlide(idx, { compareLabels: parsed.compareLabels, columns: parsed.columns });
          }
        } catch (parseErr) {
          console.warn('[CARD_NEWS_PRO] comparison JSON 파싱 실패', parseErr);
        }
      }
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] AI 비교 추천 실패', err);
    } finally {
      setAiSuggestingKey(null);
    }
  };

  /** theme.fontId → CARD_FONTS family 우선, 없으면 theme.fontFamily */
  const effectiveFontFamily = theme.fontId
    ? getCardFont(theme.fontId).family
    : theme.fontFamily;

  // ═══════════════════════════════════════
  // 다운로드
  // ═══════════════════════════════════════
  //
  // cardRefs는 미리보기 영역의 transform:scale(0.25)된 div를 가리킨다.
  // 그대로 html2canvas에 넘기면 270×270 이미지의 좌상단에만 콘텐츠가 잡혀
  // 나머지가 검은색으로 나온다. 그래서 다운로드 시점에만:
  //   1) 해당 div를 cloneNode(true)로 복제
  //   2) transform 제거 + 화면 밖(-9999px)의 임시 컨테이너에 붙임
  //   3) 풀사이즈 1080×1080 상태에서 캡처
  //   4) 임시 컨테이너 제거
  // 방식으로 처리한다.

  const captureNodeAsCanvas = async (sourceEl: HTMLElement) => {
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '1080px';
    tempContainer.style.height = '1080px';
    tempContainer.style.zIndex = '-1';
    tempContainer.style.pointerEvents = 'none';
    document.body.appendChild(tempContainer);

    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.position = 'static';
    clone.style.width = '1080px';
    clone.style.height = '1080px';
    clone.style.pointerEvents = 'auto';
    tempContainer.appendChild(clone);

    try {
      // 폰트(특히 Google Fonts)가 DOM에 적용될 때까지 대기 — 이미지 캡처 전 필수
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try { await (document as Document & { fonts: { ready: Promise<FontFaceSet> } }).fonts.ready; } catch { /* best-effort */ }
      }
      const html2canvas = (await import('html2canvas')).default;
      return await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        width: 1080,
        height: 1080,
        windowWidth: 1080,
        windowHeight: 1080,
      });
    } finally {
      document.body.removeChild(tempContainer);
    }
  };

  const downloadCard = async (index: number) => {
    const sourceEl = cardRefs.current[index];
    if (!sourceEl) return;
    setDownloading(true);
    try {
      const canvas = await captureNodeAsCanvas(sourceEl);
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
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < slides.length; i++) {
        const sourceEl = cardRefs.current[i];
        if (!sourceEl) continue;
        const canvas = await captureNodeAsCanvas(sourceEl);
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
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
    // isolation: 'isolate'는 자체 스택 컨텍스트를 만들어서 음수 z-index 자식
    // (renderImageLayer의 배경 이미지)이 부모 배경보다 위에 그려지게 한다.
    isolation: 'isolate',
    background: theme.backgroundGradient || theme.backgroundColor,
    fontFamily: effectiveFontFamily,
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

  /**
   * 이미지 레이어 — imagePosition에 따라 배경/상단/중앙으로 배치.
   *
   * 'background'와 'center'는 position:absolute + z-index:-1 로 콘텐츠 뒤에 깔린다.
   * (CSS 페인팅 순서상 음수 z-index 요소는 부모 배경 위, 일반 플로우 자식 아래에
   * 그려지기 때문에 각 렌더 함수의 콘텐츠에 z-index를 따로 주지 않아도 위에 보인다.)
   * 'top'은 normal flow 요소로 콘텐츠 맨 위에 inline 삽입되므로 다른 처리가 필요 없음.
   */
  const renderImageLayer = (slide: SlideData) => {
    if (!slide.imageUrl) return null;
    const position = slide.imagePosition || 'top';

    if (position === 'background') {
      return (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: `url(${slide.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: -1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.72) 100%)',
              zIndex: -1,
            }}
          />
        </>
      );
    }

    if (position === 'top') {
      return (
        <div
          style={{
            width: '100%',
            height: '420px',
            overflow: 'hidden',
            borderRadius: '20px',
            marginBottom: '32px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            flexShrink: 0,
          }}
        >
          <img
            src={slide.imageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      );
    }

    // center
    return (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '60%',
          maxHeight: '60%',
          overflow: 'hidden',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          zIndex: -1,
          opacity: 0.55,
        }}
      >
        <img
          src={slide.imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  };

  const hospitalFooter = theme.hospitalName ? (
    <div
      style={{
        position: 'absolute',
        zIndex: 4,
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
      {renderImageLayer(slide)}
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
      {renderImageLayer(slide)}
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
        {renderImageLayer(slide)}
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
        {renderImageLayer(slide)}
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
        {renderImageLayer(slide)}
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
      {renderImageLayer(slide)}
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
        {renderImageLayer(slide)}
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
      {renderImageLayer(slide)}
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* 글씨체 드롭다운 */}
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500">글씨체</span>
            <select
              value={theme.fontId || 'pretendard'}
              onChange={(e) => {
                const newFontId = e.target.value;
                ensureGoogleFontLoaded(newFontId);
                onThemeChange({ ...theme, fontId: newFontId });
              }}
              className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:border-blue-400"
            >
              {FONT_CATEGORIES.map(cat => (
                <optgroup key={cat} label={cat}>
                  {CARD_FONTS.filter(f => f.category === cat).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            onClick={downloadAll}
            disabled={downloading}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {downloading ? '⏳ 다운로드 중...' : '📦 전체 다운로드'}
          </button>
        </div>
      </div>

      {/* 카드 그리드 (축소 미리보기 + 인라인 편집 패널) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide, idx) => {
          const isEditing = editingIdx === idx;
          return (
            <div key={idx} className={`bg-white rounded-xl border transition-all ${isEditing ? 'border-blue-400 ring-2 ring-blue-100 sm:col-span-2 lg:col-span-3' : 'border-slate-200'}`}>
              {/* 프리뷰 영역 — 셀 폭을 꽉 채우는 1:1 박스 + ResizeObserver 동적 스케일 */}
              <div
                ref={(el) => { boxRefs.current[idx] = el; }}
                className="group relative overflow-hidden rounded-t-xl bg-slate-100"
                style={{ width: '100%', aspectRatio: '1 / 1' }}
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
                {/* 실제 렌더링 — 컨테이너 폭 / 1080 으로 동적 스케일 */}
                <div
                  ref={(el) => { cardRefs.current[idx] = el; }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '1080px',
                    height: '1080px',
                    transform: `scale(${scales[idx] ?? 0.25})`,
                    transformOrigin: 'top left',
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
                  <SlideEditor
                    slide={slide}
                    slideIdx={idx}
                    onChange={(patch) => updateSlide(idx, patch)}
                    onGenerateImage={() => handleGenerateSlideImage(idx)}
                    onUploadImage={(file) => handleUploadSlideImage(idx, file)}
                    onAiSuggestText={(field) => handleAiSuggestText(idx, field)}
                    onAiSuggestComparison={() => handleAiSuggestComparison(idx)}
                    generatingImage={generatingImageIdx === idx}
                    aiSuggestingKey={aiSuggestingKey}
                  />
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
  slideIdx: number;
  onChange: (patch: Partial<SlideData>) => void;
  onGenerateImage: () => void;
  onUploadImage: (file: File) => void;
  onAiSuggestText: (field: 'title' | 'subtitle' | 'body') => void;
  onAiSuggestComparison: () => void;
  generatingImage: boolean;
  aiSuggestingKey: string | null;
}

function SlideEditor({
  slide,
  slideIdx,
  onChange,
  onGenerateImage,
  onUploadImage,
  onAiSuggestText,
  onAiSuggestComparison,
  generatingImage,
  aiSuggestingKey,
}: SlideEditorProps) {
  const inputCls = 'w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
  const labelCls = 'block text-[10px] font-semibold text-slate-500 mb-0.5';
  const textareaCls = `${inputCls} resize-none`;

  const isSuggesting = (field: string) => aiSuggestingKey === `${slideIdx}:${field}`;

  /** AI 추천 버튼이 붙은 라벨 */
  const fieldLabel = (label: string, field: 'title' | 'subtitle' | 'body') => (
    <div className="flex items-center justify-between mb-0.5">
      <label className="text-[10px] font-semibold text-slate-500">{label}</label>
      <button
        type="button"
        onClick={() => onAiSuggestText(field)}
        disabled={isSuggesting(field)}
        className="text-[9px] font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50"
      >
        {isSuggesting(field) ? '추천 중...' : '✨ AI 추천'}
      </button>
    </div>
  );

  // 공통 필드: title, subtitle
  const common = (
    <>
      <div>
        {fieldLabel('제목', 'title')}
        <input type="text" value={slide.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
      </div>
      <div>
        {fieldLabel('부제', 'subtitle')}
        <input type="text" value={slide.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} placeholder="(선택)" />
      </div>
    </>
  );

  // ── 슬라이드 이미지 섹션 (모든 레이아웃 공통) ──
  const imageSection = (
    <div className="pt-2 mt-2 border-t border-slate-200 space-y-2">
      <label className="text-[10px] font-semibold text-slate-500">슬라이드 이미지</label>
      {slide.imageUrl ? (
        <div className="space-y-1.5">
          <div className="relative">
            <img src={slide.imageUrl} alt="" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
            <button
              type="button"
              onClick={() => onChange({ imageUrl: undefined })}
              className="absolute top-1 right-1 px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-md shadow hover:bg-red-600"
            >
              삭제
            </button>
          </div>
          <div className="flex gap-1">
            {(['top', 'background', 'center'] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => onChange({ imagePosition: pos as SlideImagePosition })}
                className={`flex-1 py-1 text-[9px] font-bold rounded transition-colors ${
                  (slide.imagePosition || 'top') === pos
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {pos === 'top' ? '상단' : pos === 'background' ? '배경' : '중앙'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 이미지 스타일 선택 */}
          <div className="flex gap-1 flex-wrap">
            {SLIDE_IMAGE_STYLES.map((style) => {
              const active = (slide.imageStyle || 'illustration') === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onChange({ imageStyle: style.id as SlideImageStyle })}
                  className={`px-2 py-1 text-[9px] rounded-lg border transition-all ${
                    active
                      ? 'border-blue-400 bg-blue-50 text-blue-700 font-bold'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {style.name}
                </button>
              );
            })}
          </div>
          {/* 생성/업로드 버튼 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onGenerateImage}
              disabled={generatingImage}
              className="flex-1 py-2 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
            >
              {generatingImage ? (
                <span className="flex items-center justify-center gap-1">
                  <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  생성 중...
                </span>
              ) : (
                '🎨 AI 이미지 생성'
              )}
            </button>
            <label className="flex-1 py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer text-center flex items-center justify-center">
              📁 직접 업로드
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );

  if (slide.layout === 'cover') return <>{common}{imageSection}</>;

  if (slide.layout === 'info' || slide.layout === 'closing') {
    return (
      <>
        {common}
        <div>
          {fieldLabel('본문', 'body')}
          <textarea rows={3} value={slide.body || ''} onChange={(e) => onChange({ body: e.target.value })} className={textareaCls} />
        </div>
        {imageSection}
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
    const isSuggestingComparison = aiSuggestingKey === `${slideIdx}:comparison`;
    return (
      <>
        {common}
        <button
          type="button"
          onClick={onAiSuggestComparison}
          disabled={isSuggestingComparison}
          className="w-full py-1.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded-lg border border-purple-200 hover:bg-purple-100 disabled:opacity-50"
        >
          {isSuggestingComparison ? '생성 중...' : '✨ AI로 비교 데이터 자동 채우기'}
        </button>
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
        {imageSection}
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
        {imageSection}
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
        {imageSection}
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
        {imageSection}
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
        {imageSection}
      </>
    );
  }

  return <>{common}{imageSection}</>;
}
