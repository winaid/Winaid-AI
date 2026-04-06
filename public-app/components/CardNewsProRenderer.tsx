'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SlideData, SlideDecoration, CardNewsTheme, SlideLayoutType, SlideImagePosition, SlideImageStyle, SlideComparisonColumn, DesignPresetStyle, CoverTemplate } from '../lib/cardNewsLayouts';
import { LAYOUT_LABELS, CARD_FONTS, FONT_CATEGORIES, getCardFont, SLIDE_IMAGE_STYLES, COVER_TEMPLATES } from '../lib/cardNewsLayouts';
import type { CardTemplate } from '../lib/cardTemplateService';

/**
 * CSS 선언 문자열 "height: 6px; background: red" 를 React 스타일 객체로 파싱.
 * AI가 추출한 학습 템플릿의 CSS 힌트를 style prop에 직접 꽂기 위한 헬퍼.
 */
function parseCSSString(css: string | undefined): CSSProperties {
  const result: Record<string, string> = {};
  if (!css) return result as CSSProperties;
  css.split(';').forEach(rule => {
    const idx = rule.indexOf(':');
    if (idx <= 0) return;
    const key = rule.slice(0, idx).trim();
    const value = rule.slice(idx + 1).trim();
    if (!key || !value) return;
    // kebab-case → camelCase
    const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = value;
  });
  return result as CSSProperties;
}

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
  /** 학습한 디자인 템플릿 — 있으면 배경/내부카드/장식을 학습 값으로 오버라이드 */
  learnedTemplate?: CardTemplate | null;
  /** 카드 비율 */
  cardRatio?: '1:1' | '3:4' | '4:5' | '9:16' | '16:9';
  /** 디자인 프리셋 스타일 */
  presetStyle?: DesignPresetStyle | null;
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
export default function CardNewsProRenderer({ slides, theme, onSlidesChange, onThemeChange, learnedTemplate, cardRatio = '1:1', presetStyle }: Props) {
  // shorthand — 학습 템플릿이 있을 때 상세 토큰으로 렌더 오버라이드
  const lt = learnedTemplate || null;
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [scales, setScales] = useState<number[]>([]);
  // 슬라이드별 AI 이미지/텍스트 생성 상태
  const [generatingImageIdx, setGeneratingImageIdx] = useState<number | null>(null);
  const [aiSuggestingKey, setAiSuggestingKey] = useState<string | null>(null); // `${idx}:${field}`

  // 카드별 AI 채팅은 SlideEditor 내부에서 관리 (글로벌 채팅 제거)

  // 폰트 즉시 반영 + 커스텀 폰트 업로드
  const [fontLoaded, setFontLoaded] = useState(0);
  const [customFontName, setCustomFontName] = useState<string | null>(null);
  const [customFontDisplayName, setCustomFontDisplayName] = useState<string | null>(null);
  const customFontInputRef = useRef<HTMLInputElement | null>(null);

  // 선택된 폰트가 Google Fonts 기반이면 CDN 로드 후 fontLoaded 증가 → 카드 re-mount
  useEffect(() => {
    const fontId = theme.fontId || 'pretendard';
    if (fontId === 'custom') {
      setFontLoaded(v => v + 1);
      return;
    }
    ensureGoogleFontLoaded(fontId);
    if (typeof document !== 'undefined' && 'fonts' in document) {
      (document as Document & { fonts: { ready: Promise<FontFaceSet> } }).fonts.ready
        .then(() => setFontLoaded(v => v + 1))
        .catch(() => setFontLoaded(v => v + 1));
    } else {
      setFontLoaded(v => v + 1);
    }
  }, [theme.fontId]);

  // 저장된 커스텀 폰트 복원 (마운트 시 1회)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('winaid_custom_font');
      if (!saved) return;
      const parsed = JSON.parse(saved) as { name: string; displayName: string; data: string };
      fetch(parsed.data)
        .then(r => r.arrayBuffer())
        .then(buf => {
          const fontFace = new FontFace(parsed.name, buf);
          return fontFace.load().then(face => {
            (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
            setCustomFontName(parsed.name);
            setCustomFontDisplayName(parsed.displayName);
            setFontLoaded(v => v + 1);
          });
        })
        .catch(() => { /* 복원 실패 무시 */ });
    } catch { /* ignore */ }
  }, []);

  const handleCustomFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rawName = file.name.replace(/\.[^.]+$/, '');
    const fontName = `custom-${rawName.replace(/[^a-zA-Z0-9가-힣_-]/g, '')}` || `custom-font-${Date.now()}`;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontFace = new FontFace(fontName, arrayBuffer);
      const loaded = await fontFace.load();
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(loaded);

      setCustomFontName(fontName);
      setCustomFontDisplayName(rawName);
      onThemeChange({ ...theme, fontId: 'custom' });
      setFontLoaded(v => v + 1);

      // localStorage에 base64로 저장 (최대 ~4MB까지)
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem('winaid_custom_font', JSON.stringify({
            name: fontName,
            displayName: rawName,
            data: reader.result,
          }));
        } catch {
          // 용량 초과 → 세션에만 유지
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] 커스텀 폰트 로드 실패', err);
    }
    e.target.value = '';
  };

  // 미리보기 박스 폭에 맞춰 scale 재계산
  useEffect(() => {
    const recompute = () => {
      const next = boxRefs.current.map(box => (box ? box.clientWidth / cardWidth : 0.25));
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

  /** 특정 슬라이드 업데이트 (얕은 머지) */
  const updateSlide = (idx: number, patch: Partial<SlideData>) => {
    onSlidesChange(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  /**
   * 레이아웃 변경 — 새 레이아웃에 필요한 필드가 비어 있으면 플레이스홀더 기본값을 채운다.
   * 이렇게 해야 드롭다운에서 레이아웃을 바꿨을 때 편집 폼이 즉시 새 필드를 노출하고,
   * 사용자는 미리 채워진 예시를 수정하는 방식으로 빠르게 작성할 수 있다.
   */
  const handleLayoutChange = (idx: number, newLayout: SlideLayoutType) => {
    const curr = slides[idx];
    if (!curr) return;
    const base: SlideData = { ...curr, layout: newLayout };

    switch (newLayout) {
      case 'checklist':
        if (!base.checkItems?.length) base.checkItems = ['항목 1', '항목 2', '항목 3'];
        break;
      case 'icon-grid':
        if (!base.icons?.length) base.icons = [
          { emoji: '🦷', title: '항목 1', desc: '설명' },
          { emoji: '💉', title: '항목 2', desc: '설명' },
          { emoji: '⏱️', title: '항목 3', desc: '설명' },
          { emoji: '✨', title: '항목 4', desc: '설명' },
        ];
        break;
      case 'steps':
        if (!base.steps?.length) base.steps = [
          { label: '1단계', desc: '설명' },
          { label: '2단계', desc: '설명' },
          { label: '3단계', desc: '설명' },
        ];
        break;
      case 'comparison':
        if (!base.columns?.length) {
          base.compareLabels = ['항목 1', '항목 2', '항목 3'];
          base.columns = [
            { header: 'A 방식', highlight: false, items: ['-', '-', '-'] },
            { header: 'B 방식', highlight: true, items: ['-', '-', '-'] },
          ];
        }
        break;
      case 'data-highlight':
        if (!base.dataPoints?.length) base.dataPoints = [
          { value: '00%', label: '항목 1', highlight: true },
          { value: '00', label: '항목 2' },
          { value: '00', label: '항목 3' },
        ];
        break;
      case 'qna':
        if (!base.questions?.length) base.questions = [
          { q: '질문을 입력하세요?', a: '답변을 입력하세요.' },
          { q: '두 번째 질문?', a: '답변.' },
        ];
        break;
      case 'timeline':
        if (!base.timelineItems?.length) base.timelineItems = [
          { time: '1일차', title: '항목', desc: '설명' },
          { time: '1주차', title: '항목', desc: '설명' },
          { time: '1개월', title: '항목', desc: '설명' },
        ];
        break;
      case 'quote':
        if (!base.quoteText) {
          base.quoteText = '여기에 인용문을 입력하세요.';
          base.quoteAuthor = base.quoteAuthor || '작성자';
          base.quoteRole = base.quoteRole || '역할';
        }
        break;
      case 'before-after':
        if (!base.beforeItems?.length) {
          base.beforeLabel = base.beforeLabel || 'BEFORE';
          base.afterLabel = base.afterLabel || 'AFTER';
          base.beforeItems = ['항목 1', '항목 2', '항목 3'];
          base.afterItems = ['항목 1', '항목 2', '항목 3'];
        }
        break;
      case 'pros-cons':
        if (!base.pros?.length) {
          base.pros = ['장점 1', '장점 2', '장점 3'];
          base.cons = ['주의점 1', '주의점 2', '주의점 3'];
        }
        break;
      case 'price-table':
        if (!base.priceItems?.length) base.priceItems = [
          { name: '시술 A', price: '00만원', note: '기준' },
          { name: '시술 B', price: '00만원', note: '기준' },
          { name: '시술 C', price: '00만원', note: '기준' },
        ];
        break;
      case 'numbered-list':
        if (!base.numberedItems?.length) base.numberedItems = [
          { num: '01', title: '항목 1', desc: '설명' },
          { num: '02', title: '항목 2', desc: '설명' },
          { num: '03', title: '항목 3', desc: '설명' },
        ];
        break;
      case 'warning':
        if (!base.warningItems?.length) base.warningItems = [
          '주의사항 1',
          '주의사항 2',
          '주의사항 3',
        ];
        break;
      default:
        break;
    }

    onSlidesChange(slides.map((s, i) => (i === idx ? base : s)));
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
      // 카드 레이아웃(프레임/비교표/텍스트 박스 등)은 우리 HTML이 담당.
      // AI는 '순수 일러스트/사진'만 생성해야 함.
      const fullPrompt = `${subject}, ${styleDef.prompt}

⚠️ 순수 일러스트/사진만 생성. 텍스트·프레임·카드 레이아웃·빈 공간·UI 요소 절대 포함하지 말 것. 배경은 단색 또는 투명.`;
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          aspectRatio: slide.imageRatio || (slide.imagePosition === 'background'
            ? (cardRatio === '3:4' ? '3:4' : '1:1')
            : (cardRatio === '3:4' ? '3:4' : '16:9')),
          // 'card_news'는 카드뉴스 프레임까지 생성하므로 우리 HTML과 겹침. 'blog'는 순수 이미지.
          mode: 'blog',
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

  /** 슬라이드 내용 기반 이미지 프롬프트(visualKeyword) AI 추천 — 전체 맥락 활용 */
  const handleSuggestImagePrompt = async (idx: number) => {
    const slide = slides[idx];
    if (!slide) return;
    const key = `${idx}:imgprompt`;
    setAiSuggestingKey(key);
    try {
      const allTitles = slides.map(s => `${s.index}장: ${s.title}`).join('\n');
      const slideDetail = JSON.stringify({
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        layout: slide.layout,
        checkItems: slide.checkItems,
        icons: slide.icons,
        steps: slide.steps,
        columns: slide.columns,
        compareLabels: slide.compareLabels,
      });
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `당신은 의료 마케팅 이미지 프롬프트 전문가입니다.

이 카드뉴스의 전체 구성:
${allTitles}

현재 슬라이드 (${slide.index}장, 레이아웃: ${slide.layout}):
${slideDetail}

이미지 위치: ${slide.imagePosition || 'top'}

위 내용에 어울리는 이미지를 영어 프롬프트로 작성해주세요.

규칙:
1. 프롬프트만 출력 (다른 텍스트 없이)
2. 영어로 작성
3. 의료/치과 맥락에 정확하게 맞추기
4. 비현실적인 크기 금지 (예: 거대한 이빨 X) — 실제 비율에 맞는 의료 일러스트
5. 배경은 깨끗하고 단순하게 (복잡한 배경 X)
6. 카드뉴스에 어울리는 구도 (텍스트가 들어갈 공간 고려)
7. 스타일: ${slide.imageStyle || 'professional medical illustration, clean and modern'}
8. ${slide.imagePosition === 'top' || slide.imagePosition === 'bottom' ? '가로로 넓은 구도 (16:9 비율)' : '정사각형 구도 (1:1 비율)'}
9. 색상: 카드뉴스 테마에 어울리는 톤
10. 의료 장비/시술 이미지는 사실적이되 깨끗하고 전문적으로`,
          systemInstruction: '의료 마케팅 이미지 프롬프트 전문가. 영어 프롬프트 1줄만 출력. 마크다운/따옴표 금지.',
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.7,
          maxOutputTokens: 300,
        }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) {
        const cleaned = data.text.replace(/^["'`]+|["'`]+$/g, '').replace(/\n/g, ' ').replace(/```/g, '').trim();
        if (cleaned) updateSlide(idx, { visualKeyword: cleaned });
      }
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] 이미지 프롬프트 추천 실패', err);
    } finally {
      setAiSuggestingKey(null);
    }
  };

  /** 현재 슬라이드를 웹 검색으로 보강 (googleSearch=true) */
  const handleAiEnrichSlide = async (idx: number) => {
    const slide = slides[idx];
    if (!slide) return;
    const key = `${idx}:enrich`;
    setAiSuggestingKey(key);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `아래는 카드뉴스 슬라이드 JSON이다. 웹에서 2024~2025년 한국 기준 최신 수치(비용 평균, 성공률, 회복 기간, 건보 적용 등)를 검색해 이 슬라이드의 내용을 보강해라.
- 레이아웃(${slide.layout})은 유지.
- 제목·부제·본문·배열 필드들을 필요한 만큼 수정.
- 추가로 필요한 필드만 포함한 부분 패치(JSON 객체)를 출력. 슬라이드 전체가 아니라 수정할 필드만.
- 구체적 수치는 반드시 범위(예: "80~120만원", "3~6개월")로.
- 의료광고법 준수 (완치/최첨단/100%/유일 등 금지).
- 설명·마크다운 코드블록 금지. 순수 JSON 객체 하나만.

현재 슬라이드:
${JSON.stringify(slide, null, 2)}`,
          systemInstruction: '카드뉴스 콘텐츠 전문가. 웹 검색 결과 기반 최신 수치만 사용. JSON 부분 패치만 출력.',
          model: 'gemini-3.1-pro-preview',
          temperature: 0.5,
          maxOutputTokens: 2048,
          googleSearch: true,
        }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) {
        const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          try {
            const patch = JSON.parse(cleaned.slice(start, end + 1)) as Partial<SlideData>;
            // layout은 보존
            const { layout: _ignore, ...safePatch } = patch as { layout?: string } & Partial<SlideData>;
            void _ignore;
            updateSlide(idx, safePatch);
          } catch (parseErr) {
            console.warn('[CARD_NEWS_PRO] enrich JSON 파싱 실패', parseErr);
          }
        }
      }
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] 웹 검색 보강 실패', err);
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

  /**
   * theme.fontId → CARD_FONTS family 우선, custom이면 customFontName, 둘 다 없으면 theme.fontFamily
   */
  const effectiveFontFamily = (() => {
    if (theme.fontId === 'custom' && customFontName) {
      return `'${customFontName}', 'Pretendard Variable', 'Pretendard', sans-serif`;
    }
    if (theme.fontId) return getCardFont(theme.fontId).family;
    return theme.fontFamily;
  })();

  /**
   * 카드별 폰트 계산 — slide.fontId가 있으면 그 폰트를, 없으면 상단 전체 폰트를 사용.
   * Google Font는 필요 시 CDN 로드.
   */
  const getSlideFontFamily = (slide: SlideData): string => {
    if (!slide.fontId) return effectiveFontFamily;
    if (slide.fontId === 'custom' && customFontName) {
      return `'${customFontName}', 'Pretendard Variable', 'Pretendard', sans-serif`;
    }
    const font = CARD_FONTS.find(f => f.id === slide.fontId);
    if (!font) return effectiveFontFamily;
    if (font.googleImport) ensureGoogleFontLoaded(font.id);
    return font.family;
  };

  // ════════════════════════════════════════
  // 디자인 엔진: 내용에 따라 자동 계산
  // ════════════════════════════════════════

  /** 제목 크기 자동 계산 (글자 수 기반) */
  const calcTitleSize = (text: string, maxSize: number = 52, minSize: number = 36): number => {
    const len = (text || '').length;
    if (len <= 10) return maxSize;
    if (len <= 15) return Math.min(maxSize, 56);
    if (len <= 20) return Math.min(maxSize, 48);
    if (len <= 30) return Math.min(maxSize, 42);
    return minSize;
  };

  /** 수치 크기 자동 계산 */
  const calcValueSize = (text: string, containerWidth: number = 300): number => {
    const len = (text || '').length;
    return Math.min(80, Math.max(36, Math.floor(containerWidth * 0.85 / Math.max(len, 1))));
  };

  /** 항목 수에 따른 gap/padding/fontSize 자동 계산 */
  const calcItemLayout = (itemCount: number) => {
    if (itemCount <= 2) return { gap: 24, padding: 32, fontSize: 22 };
    if (itemCount <= 3) return { gap: 20, padding: 28, fontSize: 20 };
    if (itemCount <= 4) return { gap: 16, padding: 24, fontSize: 18 };
    if (itemCount <= 5) return { gap: 12, padding: 20, fontSize: 17 };
    return { gap: 10, padding: 16, fontSize: 16 };
  };

  /** 그리드 열 수 자동 계산 */
  const calcGridCols = (itemCount: number): number => {
    if (itemCount <= 1) return 1;
    if (itemCount <= 2) return 2;
    if (itemCount <= 4) return 2;
    if (itemCount <= 6) return 3;
    return 3;
  };

  /** 본문 크기 자동 계산 (글자 수 기반) */
  const calcBodySize = (text: string): { fontSize: number; lineHeight: number } => {
    const charCount = (text || '').length;
    if (charCount <= 50) return { fontSize: 22, lineHeight: 1.7 };
    if (charCount <= 100) return { fontSize: 20, lineHeight: 1.7 };
    if (charCount <= 200) return { fontSize: 18, lineHeight: 1.65 };
    return { fontSize: 16, lineHeight: 1.6 };
  };

  /** 카드 내부 패딩 계산 (이미지 유무 + 항목 수) */
  const calcCardPadding = (slide: SlideData): string => {
    const hasImage = !!slide.imageUrl && (slide.imagePosition === 'top' || slide.imagePosition === 'bottom');
    const itemCount = (slide.checkItems || slide.steps || slide.icons || slide.numberedItems || []).length;
    if (hasImage) return '40px 50px';
    if (itemCount >= 5) return '50px 54px';
    return '60px 64px';
  };

  /** 슬라이드별 컨테이너 스타일 — cardContainerStyle + 카드별 폰트 + 동적 패딩 */
  const getCardStyle = (slide: SlideData): CSSProperties => ({
    ...cardContainerStyle,
    fontFamily: getSlideFontFamily(slide),
    padding: calcCardPadding(slide),
  });

  /** 슬라이드별 제목 스타일 — 개별 오버라이드 + 테마 기본값 */
  const getTitleStyle = (slide: SlideData, defaults: { fontSize: number; textAlign?: string }): CSSProperties => ({
    color: slide.titleColor || theme.titleColor,
    fontSize: `${slide.titleFontSize || defaults.fontSize}px`,
    fontWeight: (slide.titleFontWeight || '800') as CSSProperties['fontWeight'],
    letterSpacing: slide.titleLetterSpacing ? `${slide.titleLetterSpacing}px` : '-0.02em',
    lineHeight: slide.titleLineHeight || 1.25,
    wordBreak: 'keep-all',
    ...(defaults.textAlign ? { textAlign: defaults.textAlign as CSSProperties['textAlign'] } : {}),
    ...(slide.titleFontId ? { fontFamily: getSlideFontFamily({ ...slide, fontId: slide.titleFontId }) } : {}),
  });

  /** 슬라이드별 부제 스타일 */
  const getSubtitleStyle = (slide: SlideData): CSSProperties => ({
    color: slide.subtitleColor || theme.subtitleColor,
    fontSize: `${slide.subtitleFontSize || 22}px`,
    fontWeight: (slide.subtitleFontWeight || '600') as CSSProperties['fontWeight'],
    letterSpacing: slide.subtitleLetterSpacing ? `${slide.subtitleLetterSpacing}px` : undefined,
    lineHeight: slide.subtitleLineHeight || 1.55,
    wordBreak: 'keep-all',
    ...(slide.subtitleFontId ? { fontFamily: getSlideFontFamily({ ...slide, fontId: slide.subtitleFontId }) } : {}),
  });

  /** 슬라이드별 본문 스타일 */
  const getBodyStyle = (slide: SlideData): CSSProperties => {
    const auto = calcBodySize(slide.body || '');
    return {
      color: slide.bodyColor || theme.bodyColor,
      fontSize: `${slide.bodyFontSize || auto.fontSize}px`,
      lineHeight: slide.bodyLineHeight || auto.lineHeight,
      wordBreak: 'keep-all',
    };
  };

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
    tempContainer.style.width = `${cardWidth}px`;
    tempContainer.style.height = `${cardHeight}px`;
    tempContainer.style.zIndex = '-1';
    tempContainer.style.pointerEvents = 'none';
    document.body.appendChild(tempContainer);

    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.position = 'static';
    clone.style.width = `${cardWidth}px`;
    clone.style.height = `${cardHeight}px`;
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
        width: cardWidth,
        height: cardHeight,
        windowWidth: cardWidth,
        windowHeight: cardHeight,
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

  // 카드 사이즈 계산
  const cardWidth = 1080;
  const cardHeight = (() => {
    switch (cardRatio) {
      case '3:4': return 1440;
      case '4:5': return 1350;
      case '9:16': return 1920;
      case '16:9': return 608;
      default: return 1080;
    }
  })();
  const cardAspect = (() => {
    switch (cardRatio) {
      case '3:4': return '3 / 4';
      case '4:5': return '4 / 5';
      case '9:16': return '9 / 16';
      case '16:9': return '16 / 9';
      default: return '1 / 1';
    }
  })();

  // 학습 템플릿이 있으면 배경/레이아웃을 학습 값으로 오버라이드
  const learnedBgGradient = lt?.backgroundStyle?.gradient || lt?.colors?.backgroundGradient;
  const cardContainerStyle: CSSProperties = {
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    position: 'relative',
    overflow: 'hidden',
    // isolation: 'isolate'는 자체 스택 컨텍스트를 만들어서 음수 z-index 자식
    // (renderImageLayer의 배경 이미지)이 부모 배경보다 위에 그려지게 한다.
    isolation: 'isolate',
    background: learnedBgGradient || theme.backgroundGradient || theme.backgroundColor,
    fontFamily: effectiveFontFamily,
    display: 'flex',
    flexDirection: 'column',
    padding: lt?.layoutRules?.contentPadding || '60px 64px',
    boxSizing: 'border-box',
    // 기본 좌측 정렬 + 적정 줄 간격. cover/closing 등 중앙 정렬 레이아웃은
    // 각 렌더 함수에서 textAlign:'center'로 오버라이드.
    textAlign: lt?.layoutRules?.titleAlign || 'left',
    lineHeight: 1.5,
  };

  // 테마가 어두운지 판정 (배경색 기준). 밝은 테마에선 내부 카드·그림자·텍스트 그림자를 미세 조정.
  const isDarkTheme = (() => {
    const hex = theme.backgroundColor.replace('#', '');
    if (hex.length !== 6) return true;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // 간단한 luminance 판정
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  })();

  /** 내부 카드·비교표 셀 공통 베이스 색 (테마 대비 자동, 학습 템플릿이 있으면 그 값 우선) */
  const innerCardBg = lt?.innerCardStyle?.background
    || (isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
  const innerCardBorderRaw = lt?.innerCardStyle?.border;
  const innerCardBorder = (innerCardBorderRaw && innerCardBorderRaw !== 'none' ? innerCardBorderRaw : null)
    || (isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');
  const innerCardRadius = lt?.innerCardStyle?.borderRadius || '18px';
  const innerCardShadow = lt?.innerCardStyle?.boxShadow && lt.innerCardStyle.boxShadow !== 'none'
    ? lt.innerCardStyle.boxShadow
    : (isDarkTheme ? 'none' : '0 4px 12px rgba(0,0,0,0.04)');

  // 프로급 내부 카드 색상 (테마 대비 자동)
  const whiteCardBg = isDarkTheme ? 'rgba(255,255,255,0.95)' : '#FFFFFF';
  const whiteCardText = isDarkTheme ? '#1A1A2E' : theme.titleColor;
  const whiteCardSub = isDarkTheme ? '#666' : theme.bodyColor;

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
            background: `linear-gradient(180deg, ${theme.backgroundColor}CC 0%, ${theme.backgroundColor}EE 100%)`,
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

  const hospitalFooter = theme.hospitalName ? (
    <div style={{
      marginTop: 'auto', paddingTop: '24px',
      textAlign: 'center', position: 'relative', zIndex: 4,
    }}>
      <div style={{
        color: isDarkTheme ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)',
        fontSize: '14px', fontWeight: 600,
        letterSpacing: '3px',
      }}>
        {theme.hospitalName}
      </div>
    </div>
  ) : null;

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
        {/* 배경 이미지 */}
        {(t.background.type === 'image-full' || t.background.type === 'image-half') && slide.imageUrl && (
          <>
            <img src={slide.imageUrl} alt="" crossOrigin="anonymous"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: t.background.type === 'image-half' ? '50%' : '100%', objectFit: 'cover', objectPosition: slide.imageFocalPoint ? `${slide.imageFocalPoint.x}% ${slide.imageFocalPoint.y}%` : 'center', zIndex: 0 }} />
            {t.background.overlayGradient && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: t.background.overlayGradient, zIndex: 1 }} />}
            {t.background.overlayColor && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: t.background.overlayColor, zIndex: 1 }} />}
          </>
        )}
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
        {hospitalFooter}
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
      {hospitalFooter}
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
      {hospitalFooter}
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
          <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
            {slide.title}
          </h2>
          {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', textAlign: 'center', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', borderRadius: '20px', overflow: 'hidden', position: 'relative', zIndex: 2 }}>
          {/* VS 뱃지 (2열일 때) */}
          {cols.length === 2 && labels.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '48px', height: '48px', borderRadius: '50%', background: theme.accentColor, color: '#fff', fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: `0 4px 16px ${theme.accentColor}44` }}>VS</div>
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
        {hospitalFooter}
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
          <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>
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
        {hospitalFooter}
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
          <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
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
        {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
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
                  ✓
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
      {hospitalFooter}
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
          <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
          {slide.subtitle && <p style={{ color: theme.subtitleColor, fontSize: '22px', textAlign: 'center', marginTop: '10px', fontWeight: 600 }}>{slide.subtitle}</p>}
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '24px', alignContent: 'center', position: 'relative', zIndex: 2 }}>
          {points.map((dp, i) => (
            <div
              key={i}
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: dp.highlight ? `${theme.accentColor}15` : innerCardBg,
                borderRadius: '50%',
                aspectRatio: '1 / 1',
                border: dp.highlight ? `3px solid ${theme.accentColor}` : `1px solid ${innerCardBorder}`,
                boxShadow: dp.highlight ? `0 8px 30px ${theme.accentColor}25` : 'none',
                display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', alignItems: 'center',
              }}
            >
              <div
                style={{
                  color: dp.highlight ? theme.accentColor : theme.titleColor,
                  fontSize: `${calcValueSize(dp.value, containerW)}px`,
                  fontWeight: 900,
                  marginBottom: '12px',
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
          ))}
        </div>
        {slide.imagePosition === 'bottom' && renderImageLayer(slide)}
        {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px', position: 'relative', zIndex: 2 }}>
        {/* ⇄ 화살표 */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', borderRadius: '50%', background: theme.accentColor, color: '#fff', fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: `0 4px 12px ${theme.accentColor}44` }}>→</div>
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
      {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
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
      {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
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
      {hospitalFooter}
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
      {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
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
      {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
      </div>
      {(() => {
        const pcLayout = calcItemLayout(Math.max((slide.pros || []).length, (slide.cons || []).length));
        return (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', position: 'relative', zIndex: 2 }}>
          <div style={{ background: 'rgba(52,211,153,0.14)', borderRadius: '20px', padding: '28px 24px', border: '2px solid rgba(52,211,153,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#34D399', color: '#fff', fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>O</div>
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
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#EF4444', color: '#fff', fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>X</div>
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
      {hospitalFooter}
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
        <h2 style={{ color: theme.titleColor, fontSize: `${calcTitleSize(slide.title, 52, 36)}px`, fontWeight: 800, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>{slide.title}</h2>
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
      {hospitalFooter}
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
        <h2 style={{ color: theme.accentColor, fontSize: `${calcTitleSize(slide.warningTitle || slide.title, 52, 36)}px`, fontWeight: 900, textAlign: 'center', wordBreak: 'keep-all', letterSpacing: '-0.02em' }}>
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
      {hospitalFooter}
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
          {/* 글씨체 드롭다운 + 커스텀 폰트 업로드 */}
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500">글씨체</span>
            <select
              value={theme.fontId || 'pretendard'}
              onChange={(e) => {
                const newFontId = e.target.value;
                if (newFontId !== 'custom') ensureGoogleFontLoaded(newFontId);
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
              {customFontName && (
                <optgroup label="내 폰트">
                  <option value="custom">📁 {customFontDisplayName || customFontName}</option>
                </optgroup>
              )}
            </select>
          </label>
          <button
            type="button"
            onClick={() => customFontInputRef.current?.click()}
            className="px-2.5 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-200 border border-slate-200"
            title="TTF, OTF, WOFF 파일 업로드"
          >
            📁 내 폰트
          </button>
          <input
            ref={customFontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={handleCustomFontUpload}
          />
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
            <div key={`${idx}-${theme.fontId || 'default'}-${slide.fontId || ''}-${fontLoaded}`} className={`bg-white rounded-xl border transition-all ${isEditing ? 'border-blue-400 ring-2 ring-blue-100 sm:col-span-2 lg:col-span-3' : 'border-slate-200'}`}>
              {/* 프리뷰 영역 — 셀 폭을 꽉 채우는 1:1 박스 + ResizeObserver 동적 스케일 */}
              <div
                ref={(el) => { boxRefs.current[idx] = el; }}
                className="group relative overflow-hidden rounded-t-xl bg-slate-100"
                style={{ width: '100%', aspectRatio: cardAspect }}
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
                  key={`card-render-${idx}-${fontLoaded}-${theme.fontId || ''}-${slide.fontId || ''}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
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
                  onChange={(e) => handleLayoutChange(idx, e.target.value as SlideLayoutType)}
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

                      {/* 인라인 편집 제거 — 풀스크린 모달로 이동 */}
            </div>
          );
        })}
      </div>

      {/* ══════ 풀스크린 편집 모달 ══════ */}
      {editingIdx !== null && slides[editingIdx] && (() => {
        const eSlide = slides[editingIdx];
        return (
          <div className="fixed inset-0 bg-white z-50 flex flex-col">
            {/* 상단 바 */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-4">
                <span className="text-lg font-bold text-slate-800">{editingIdx + 1}페이지 편집</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setEditingIdx(Math.max(0, editingIdx - 1))} disabled={editingIdx === 0}
                    className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30 flex items-center justify-center text-sm">‹</button>
                  <span className="text-sm text-slate-500">{editingIdx + 1} / {slides.length}</span>
                  <button type="button" onClick={() => setEditingIdx(Math.min(slides.length - 1, editingIdx + 1))} disabled={editingIdx === slides.length - 1}
                    className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30 flex items-center justify-center text-sm">›</button>
                </div>
              </div>
              <button type="button" onClick={() => setEditingIdx(null)} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">✓ 완료</button>
            </div>
            {/* 좌(프리뷰) + 우(편집) */}
            <div className="flex-1 flex overflow-hidden">
              {/* 좌: 카드 프리뷰 */}
              <div className="flex-1 bg-slate-100 flex items-center justify-center p-8 overflow-auto">
                <div style={{ width: '100%', maxWidth: '500px', aspectRatio: cardAspect, position: 'relative', overflow: 'hidden', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                  <div key={`edit-fs-${editingIdx}-${fontLoaded}-${theme.fontId || ''}-${eSlide.fontId || ''}`}
                    style={{ position: 'absolute', top: 0, left: 0, width: `${cardWidth}px`, height: `${cardHeight}px`, transform: `scale(${500 / cardWidth})`, transformOrigin: 'top left' }}>
                    {renderSlide(eSlide)}
                  </div>
                </div>
              </div>
              {/* 우: 편집 패널 */}
              <div className="w-[400px] border-l border-slate-200 bg-white overflow-y-auto p-4">
                <SlideEditor
                  slide={eSlide}
                  slideIdx={editingIdx}
                  onChange={(patch) => updateSlide(editingIdx, patch)}
                  onGenerateImage={() => handleGenerateSlideImage(editingIdx)}
                  onUploadImage={(file) => handleUploadSlideImage(editingIdx, file)}
                  onAiSuggestText={(field) => handleAiSuggestText(editingIdx, field)}
                  onAiSuggestComparison={() => handleAiSuggestComparison(editingIdx)}
                  onAiEnrich={() => handleAiEnrichSlide(editingIdx)}
                  onSuggestImagePrompt={() => handleSuggestImagePrompt(editingIdx)}
                  onFontChange={(newFontId) => {
                    if (newFontId && newFontId !== 'custom') {
                      ensureGoogleFontLoaded(newFontId);
                      if (typeof document !== 'undefined' && 'fonts' in document) {
                        (document as Document & { fonts: { ready: Promise<FontFaceSet> } }).fonts.ready
                          .then(() => setFontLoaded(v => v + 1))
                          .catch(() => setFontLoaded(v => v + 1));
                      }
                    } else {
                      setFontLoaded(v => v + 1);
                    }
                  }}
                  accentColor={theme.accentColor}
                  generatingImage={generatingImageIdx === editingIdx}
                  aiSuggestingKey={aiSuggestingKey}
                  customFontName={customFontName}
                  customFontDisplayName={customFontDisplayName}
                />
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Mirra 스타일 편집 컴포넌트
// ═══════════════════════════════════════════════════════════════

function DraggableText({ children, position, onPositionChange, containerRef }: {
  children: React.ReactNode;
  position?: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  if (!position) return <>{children}</>;
  return (
    <div
      style={{
        position: 'absolute', left: `${position.x}%`, top: `${position.y}%`,
        transform: 'translate(-50%, -50%)', cursor: 'move', zIndex: dragging ? 100 : 10,
        border: dragging ? '2px solid #3B82F6' : '2px dashed transparent',
        padding: '4px', borderRadius: '4px', transition: dragging ? 'none' : 'border-color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#93C5FD'; }}
      onMouseLeave={e => { if (!dragging) e.currentTarget.style.borderColor = 'transparent'; }}
      onMouseDown={e => {
        e.preventDefault(); e.stopPropagation();
        setDragging(true);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        startRef.current = { x: position.x, y: position.y, sx: e.clientX, sy: e.clientY };
        const onMove = (ev: MouseEvent) => {
          const dx = ((ev.clientX - startRef.current.sx) / rect.width) * 100;
          const dy = ((ev.clientY - startRef.current.sy) / rect.height) * 100;
          onPositionChange({ x: Math.round(Math.max(5, Math.min(95, startRef.current.x + dx))), y: Math.round(Math.max(5, Math.min(95, startRef.current.y + dy))) });
        };
        const onUp = () => { setDragging(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }}
    >
      {children}
    </div>
  );
}

function ElementAccordion({ icon, label, defaultOpen = false, children }: {
  icon: string; label: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border rounded-xl transition-all ${open ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
          icon === 'T' ? 'bg-green-100 text-green-700' :
          icon === '🖼' ? 'bg-blue-100 text-blue-700' :
          'bg-orange-100 text-orange-700'
        }`}>{icon}</span>
        <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{label}</span>
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function TextElementEditor({ value, onChange, multiline, fontSize, fontWeight, fontColor,
  letterSpacing, lineHeight, onStyleChange, prefix = 'title',
}: {
  value: string; onChange: (v: string) => void; multiline?: boolean;
  fontSize?: number; fontWeight?: string; fontColor?: string;
  letterSpacing?: number; lineHeight?: number;
  onStyleChange: (key: string, val: string | number | undefined) => void; prefix?: string;
}) {
  return (
    <div className="space-y-3">
      {/* 텍스트 입력 */}
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-blue-400" rows={3} />
      ) : (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
      )}

      {/* 크기 + 빠른 선택 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">크기</p>
        <div className="flex items-center gap-1 mb-2">
          <button type="button" onClick={() => onStyleChange(`${prefix}FontSize`, (fontSize || 48) - 2)}
            className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
          <input type="number" value={fontSize || 48}
            onChange={e => onStyleChange(`${prefix}FontSize`, Number(e.target.value))}
            className="w-14 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
          <button type="button" onClick={() => onStyleChange(`${prefix}FontSize`, (fontSize || 48) + 2)}
            className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {[16, 20, 24, 32, 40, 48, 56, 64, 80].map(s => (
            <button key={s} type="button" onClick={() => onStyleChange(`${prefix}FontSize`, s)}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                fontSize === s ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* 색상 팔레트 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">색상</p>
        <div className="flex flex-wrap gap-1.5">
          {['#FFFFFF', '#000000', '#333333', '#666666', '#999999',
            '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899'].map(c => (
            <button key={c} type="button" onClick={() => onStyleChange(`${prefix}Color`, c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                fontColor === c ? 'border-blue-500 scale-110' : 'border-slate-200 hover:scale-105'
              }`} style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* 굵기 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">굵기</p>
        <div className="flex gap-1">
          {[{ label: 'L', value: '400' }, { label: 'N', value: '500' }, { label: 'M', value: '600' },
            { label: 'SB', value: '700' }, { label: 'B', value: '800' }, { label: 'XB', value: '900' }].map(w => (
            <button key={w.label} type="button" onClick={() => onStyleChange(`${prefix}FontWeight`, w.value)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border ${
                (fontWeight || '800') === w.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* 자간 + 행간 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-[10px] text-slate-400 mb-1">자간</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onStyleChange(`${prefix}LetterSpacing`, (letterSpacing || 0) - 0.5)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
            <input type="number" step="0.5" value={letterSpacing || 0}
              onChange={e => onStyleChange(`${prefix}LetterSpacing`, Number(e.target.value))}
              className="w-12 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
            <button type="button" onClick={() => onStyleChange(`${prefix}LetterSpacing`, (letterSpacing || 0) + 0.5)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-400 mb-1">행간</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onStyleChange(`${prefix}LineHeight`, Math.round(((lineHeight || 1.3) - 0.1) * 10) / 10)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
            <input type="number" step="0.1" value={lineHeight || 1.3}
              onChange={e => onStyleChange(`${prefix}LineHeight`, Number(e.target.value))}
              className="w-12 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
            <button type="button" onClick={() => onStyleChange(`${prefix}LineHeight`, Math.round(((lineHeight || 1.3) + 0.1) * 10) / 10)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
          </div>
        </div>
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
  onAiEnrich: () => void;
  onSuggestImagePrompt: () => void;
  onFontChange: (fontId: string | undefined) => void;
  accentColor: string;
  generatingImage: boolean;
  aiSuggestingKey: string | null;
  customFontName: string | null;
  customFontDisplayName: string | null;
}

function SlideEditor({
  slide,
  slideIdx,
  onChange,
  onGenerateImage,
  onUploadImage,
  onAiSuggestText,
  onAiSuggestComparison,
  onAiEnrich,
  onSuggestImagePrompt,
  onFontChange,
  accentColor,
  generatingImage,
  aiSuggestingKey,
  customFontName,
  customFontDisplayName,
}: SlideEditorProps) {
  const inputCls = 'w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
  const labelCls = 'block text-[10px] font-semibold text-slate-500 mb-0.5';
  const textareaCls = `${inputCls} resize-none`;

  const isSuggesting = (field: string) => aiSuggestingKey === `${slideIdx}:${field}`;

  // 카드별 AI 채팅 (SlideEditor 인스턴스마다 독립 state)
  type CardChatMessage = { role: 'user' | 'assistant'; text: string };
  const [cardChatOpen, setCardChatOpen] = useState(false);
  const [cardChatMessages, setCardChatMessages] = useState<CardChatMessage[]>([]);
  const [cardChatInput, setCardChatInput] = useState('');
  const [cardChatLoading, setCardChatLoading] = useState(false);

  // 이미지 소스 4탭
  const [imageTab, setImageTab] = useState<'pexels' | 'google' | 'pinterest' | 'ai'>('pexels');
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageSearchResults, setImageSearchResults] = useState<{ id: string; url: string; thumb: string; alt: string; source: string; photographer?: string }[]>([]);
  const [imageSearchLoading, setImageSearchLoading] = useState(false);

  // 배경 제거
  const [removingBg, setRemovingBg] = useState(false);

  // 편집/AI 2탭
  const [editMode, setEditMode] = useState<'edit' | 'ai'>('edit');

  // 탭 전환 시 자동 키워드 채우기
  useEffect(() => {
    if (imageTab !== 'ai' && slide?.title && !imageSearchQuery) {
      const keywords: Record<string, string> = {
        '임플란트': 'dental implant', '치아': 'teeth dental', '교정': 'orthodontics',
        '스케일링': 'dental cleaning', '충치': 'cavity', '잇몸': 'gum disease',
        '피부': 'skin care', '보톡스': 'botox', '레이저': 'laser treatment',
        '정형외과': 'orthopedic', '관절': 'joint', '척추': 'spine',
        '병원': 'hospital clinic', '의사': 'doctor physician',
      };
      let autoQuery = imageTab === 'pexels' ? 'dental clinic' : '치과';
      for (const [kr, en] of Object.entries(keywords)) {
        if (slide.title.includes(kr)) {
          autoQuery = imageTab === 'pexels' ? en : kr;
          break;
        }
      }
      setImageSearchQuery(autoQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageTab]);

  const handleImageSearch = async () => {
    if (!imageSearchQuery.trim()) return;
    setImageSearchLoading(true);
    try {
      let endpoint = '';
      const orientation = 'landscape'; // 카드뉴스용
      if (imageTab === 'pexels') {
        endpoint = `/api/pexels?query=${encodeURIComponent(imageSearchQuery)}&orientation=${orientation}&per_page=12`;
      } else if (imageTab === 'google') {
        endpoint = `/api/google-images?query=${encodeURIComponent(imageSearchQuery)}`;
      } else if (imageTab === 'pinterest') {
        endpoint = `/api/pinterest-images?query=${encodeURIComponent(imageSearchQuery)}`;
      }
      const res = await fetch(endpoint);
      const data = await res.json();
      setImageSearchResults(data.photos || []);
    } catch { /* ignore */ }
    setImageSearchLoading(false);
  };

  const handleSelectSearchImage = (photo: { url: string }) => {
    onChange({ imageUrl: photo.url });
    setImageSearchResults([]);
  };

  const handleCardChatSend = async () => {
    const userMsg = cardChatInput.trim();
    if (!userMsg || cardChatLoading) return;
    setCardChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setCardChatInput('');
    setCardChatLoading(true);
    try {
      // 이미지 dataUrl은 제외 (토큰 절약)
      const slideForContext = {
        index: slide.index,
        layout: slide.layout,
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        columns: slide.columns,
        compareLabels: slide.compareLabels,
        icons: slide.icons,
        steps: slide.steps,
        checkItems: slide.checkItems,
        dataPoints: slide.dataPoints,
        questions: slide.questions,
        timelineItems: slide.timelineItems,
        quoteText: slide.quoteText,
        quoteAuthor: slide.quoteAuthor,
        quoteRole: slide.quoteRole,
        numberedItems: slide.numberedItems,
        pros: slide.pros,
        cons: slide.cons,
        prosLabel: slide.prosLabel,
        consLabel: slide.consLabel,
        priceItems: slide.priceItems,
        warningTitle: slide.warningTitle,
        warningItems: slide.warningItems,
        beforeLabel: slide.beforeLabel,
        afterLabel: slide.afterLabel,
        beforeItems: slide.beforeItems,
        afterItems: slide.afterItems,
      };

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `현재 슬라이드 (${slide.index}장, 레이아웃: ${slide.layout}):
${JSON.stringify(slideForContext, null, 2)}

사용자 요청: "${userMsg}"

이 슬라이드만 수정해서 응답해줘.

출력 형식:
1. 뭘 수정했는지 한국어 1~2문장
2. ---SLIDE_JSON--- 구분자
3. 수정된 슬라이드 1개의 JSON (이 슬라이드만, 배열 아님)

⚠️ 레이아웃 변경이 필요하면 layout 필드도 바꾸고 해당 레이아웃의 필드들(예: qna면 questions, timeline이면 timelineItems)을 채워줘.
⚠️ JSON 객체 하나만. 배열 금지. 설명 안에 JSON 금지.
⚠️ 의료광고법 준수: "완치/100%/최첨단/완벽/획기적/유일/국내 최초/1위" 금지.
⚠️ 구체적 수치는 범위로("80~120만원", "3~6개월").`,
          systemInstruction: '병원 마케팅 카드뉴스 전문가. 의료광고법 준수. 구체적 수치 사용. JSON 정확하게 출력.',
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 4096,
          googleSearch: true,
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setCardChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ 오류: ${data.error || '다시 시도해주세요.'}` }]);
        return;
      }
      const sep = '---SLIDE_JSON---';
      const sepIdx = data.text.indexOf(sep);
      if (sepIdx >= 0) {
        const explanation = data.text.substring(0, sepIdx).trim();
        const jsonPart = data.text.substring(sepIdx + sep.length).trim();
        setCardChatMessages(prev => [...prev, { role: 'assistant', text: explanation || '수정했어요.' }]);
        try {
          const cleaned = jsonPart.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
          let parsed: Partial<SlideData>;
          try {
            parsed = JSON.parse(cleaned) as Partial<SlideData>;
          } catch {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('no braces');
            parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<SlideData>;
          }
          // layout 포함 모든 필드 머지 (이미지 필드는 보존)
          onChange({
            ...parsed,
            index: slide.index,
            imageUrl: parsed.imageUrl ?? slide.imageUrl,
            imagePosition: parsed.imagePosition ?? slide.imagePosition,
            imageStyle: parsed.imageStyle ?? slide.imageStyle,
            visualKeyword: parsed.visualKeyword ?? slide.visualKeyword,
          });
        } catch (parseErr) {
          console.warn('[CARD_CHAT] JSON 파싱 실패', parseErr);
          setCardChatMessages(prev => [...prev, { role: 'assistant', text: '(⚠️ 수정 적용 실패. 더 구체적으로 다시 요청해주세요.)' }]);
        }
      } else {
        setCardChatMessages(prev => [...prev, { role: 'assistant', text: data.text as string }]);
      }
    } catch (err) {
      console.warn('[CARD_CHAT] 오류', err);
      setCardChatMessages(prev => [...prev, { role: 'assistant', text: '⚠️ 네트워크 오류가 발생했어요.' }]);
    } finally {
      setCardChatLoading(false);
    }
  };

  const cardChatSection = (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <button
        type="button"
        onClick={() => setCardChatOpen(v => !v)}
        className="w-full py-2 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-600 font-bold text-[11px] rounded-lg border border-blue-200 hover:from-blue-100 hover:to-purple-100"
      >
        {cardChatOpen ? '✕ 채팅 닫기' : '💬 AI 채팅으로 이 카드 수정'}
      </button>

      {cardChatOpen && (
        <div className="mt-2 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <div className="h-40 overflow-y-auto p-3 space-y-2">
            {cardChatMessages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-[11px] text-slate-500 mb-2">이 슬라이드에 대해 물어보세요</p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {['내용 보강해줘', '더 구체적으로', '톤 바꿔줘', '수치 넣어줘'].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setCardChatInput(q)}
                      className="px-2 py-0.5 bg-white text-slate-500 text-[9px] rounded-full border border-slate-200 hover:bg-slate-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cardChatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-[11px] whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {cardChatLoading && (
              <div className="flex justify-start">
                <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-2 border-t border-slate-200 flex gap-1.5">
            <input
              type="text"
              value={cardChatInput}
              onChange={(e) => setCardChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCardChatSend();
                }
              }}
              placeholder="수정 요청..."
              disabled={cardChatLoading}
              className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleCardChatSend}
              disabled={cardChatLoading || !cardChatInput.trim()}
              className="px-3 py-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </div>
      )}
    </div>
  );

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

  const isEnriching = aiSuggestingKey === `${slideIdx}:enrich`;

  // 공통 필드: title, subtitle + 🔍 웹 검색 보강 버튼
  const common = (
    <>
      <button
        type="button"
        onClick={onAiEnrich}
        disabled={isEnriching}
        className="w-full py-2 bg-green-50 text-green-700 text-[11px] font-bold rounded-lg border border-green-200 hover:bg-green-100 disabled:opacity-50"
      >
        {isEnriching ? '🔍 웹 검색 중...' : '🔍 웹 검색으로 내용 보강'}
      </button>
      <div>
        {fieldLabel('제목', 'title')}
        <input type="text" value={slide.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
      </div>
      <div>
        {fieldLabel('부제', 'subtitle')}
        <input type="text" value={slide.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} placeholder="(선택)" />
      </div>
      {/* 카드별 글씨체 — 비워두면 상단 전체 폰트 사용 */}
      <div>
        <label className={labelCls}>이 카드 글씨체 (선택)</label>
        <select
          value={slide.fontId || ''}
          onChange={(e) => {
            const newFontId = e.target.value || undefined;
            onChange({ fontId: newFontId });
            onFontChange(newFontId);
          }}
          className={inputCls}
        >
          <option value="">전체 설정 따름</option>
          {FONT_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {CARD_FONTS.filter((f) => f.category === cat).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
          {customFontName && (
            <optgroup label="내 폰트">
              <option value="custom">📁 {customFontDisplayName || customFontName}</option>
            </optgroup>
          )}
        </select>
      </div>
    </>
  );

  // ── 슬라이드 이미지 섹션 (4탭: Pexels / Google / Pinterest / AI 생성) ──
  const hasImage = !!slide.imageUrl;
  const imageSection = (
    <div className="pt-2 mt-2 border-t border-slate-200 space-y-2">
      <label className="text-[10px] font-semibold text-slate-500">슬라이드 이미지</label>

      {/* 이미지 프리뷰 + 삭제 */}
      {hasImage && (
        <div className="relative">
          <img src={slide.imageUrl} alt="" className="w-full h-32 object-contain bg-slate-100 rounded-lg border border-slate-200" />
          <button type="button" onClick={() => onChange({ imageUrl: undefined })}
            className="absolute top-1 right-1 px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-md shadow hover:bg-red-600">
            삭제
          </button>
        </div>
      )}

      {/* 배경 제거 + 초점 위치 (이미지 있을 때만) */}
      {hasImage && (
        <div className="space-y-2">
          <button type="button" onClick={async () => {
            if (!slide.imageUrl || removingBg) return;
            setRemovingBg(true);
            try {
              const imgRes = await fetch(slide.imageUrl);
              const blob = await imgRes.blob();
              const fd = new FormData();
              fd.append('image', blob, 'image.png');
              const res = await fetch('/api/remove-bg', { method: 'POST', body: fd });
              const data = await res.json();
              if (data.image) onChange({ imageUrl: data.image });
            } catch { /* ignore */ }
            setRemovingBg(false);
          }} disabled={removingBg}
            className="w-full py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50">
            {removingBg ? '처리 중...' : '✂️ 배경 제거'}
          </button>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">초점 위치</label>
            <div className="grid grid-cols-3 gap-1" style={{ maxWidth: '140px' }}>
              {[
                { label: '↖', x: 20, y: 20 }, { label: '↑', x: 50, y: 20 }, { label: '↗', x: 80, y: 20 },
                { label: '←', x: 20, y: 50 }, { label: '●', x: 50, y: 50 }, { label: '→', x: 80, y: 50 },
                { label: '↙', x: 20, y: 80 }, { label: '↓', x: 50, y: 80 }, { label: '↘', x: 80, y: 80 },
              ].map(pos => (
                <button key={pos.label} type="button"
                  onClick={() => onChange({ imageFocalPoint: { x: pos.x, y: pos.y } })}
                  className={`py-1.5 text-xs font-bold rounded ${
                    (slide.imageFocalPoint?.x ?? 50) === pos.x && (slide.imageFocalPoint?.y ?? 50) === pos.y
                      ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 이미지 위치 */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 mb-1 block">이미지 위치</label>
        <div className="grid grid-cols-4 gap-1">
          {(['top', 'bottom', 'background', 'center'] as const).map((pos) => (
            <button key={pos} type="button"
              onClick={() => onChange({ imagePosition: pos as SlideImagePosition })}
              className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                (slide.imagePosition || 'top') === pos ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {pos === 'top' ? '상단' : pos === 'bottom' ? '하단' : pos === 'background' ? '배경' : '중앙'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4탭 소스 선택 ── */}
      <div className="flex gap-1">
        {([
          { id: 'pexels' as const, label: 'Pexels', icon: '📷' },
          { id: 'google' as const, label: 'Google', icon: '🔍' },
          { id: 'pinterest' as const, label: 'Pinterest', icon: '📌' },
          { id: 'ai' as const, label: 'AI 생성', icon: '🎨' },
        ]).map(tab => (
          <button key={tab.id} type="button" onClick={() => { setImageTab(tab.id); setImageSearchResults([]); }}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
              imageTab === tab.id ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── 검색 탭 (Pexels / Google / Pinterest) ── */}
      {imageTab !== 'ai' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="text" value={imageSearchQuery}
              onChange={e => setImageSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleImageSearch()}
              placeholder={imageTab === 'pexels' ? '영문 예: dental clinic, teeth' : '예: 치과 임플란트, 병원'}
              className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <button type="button" onClick={handleImageSearch} disabled={imageSearchLoading}
              className="px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-blue-600">
              {imageSearchLoading ? '...' : '검색'}
            </button>
          </div>

          {imageSearchResults.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
                {imageSearchResults.map((photo) => (
                  <button key={photo.id} type="button" onClick={() => handleSelectSearchImage(photo)}
                    className="relative group rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-all aspect-square">
                    <img src={photo.thumb || photo.url} alt={photo.alt || ''}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold opacity-0 group-hover:opacity-100">선택</span>
                    </div>
                  </button>
                ))}
              </div>
              {imageTab === 'pexels' && (
                <p className="text-[9px] text-slate-400 text-center">📷 Photos by <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">Pexels</a> · 저작권 무료</p>
              )}
              {imageTab === 'google' && (
                <p className="text-[9px] text-red-400 text-center">⚠️ Google 이미지는 저작권이 있을 수 있습니다. 상업용은 Pexels 추천</p>
              )}
              {imageTab === 'pinterest' && (
                <p className="text-[9px] text-red-400 text-center">⚠️ Pinterest 이미지는 참고용으로만 사용하세요</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AI 생성 탭 ── */}
      {imageTab === 'ai' && (
        <div className="space-y-2">
          {/* 프롬프트 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-500">이미지 프롬프트 (영문)</span>
              <button type="button" onClick={onSuggestImagePrompt}
                disabled={aiSuggestingKey === `${slideIdx}:imgprompt`}
                className="text-[9px] font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50">
                {aiSuggestingKey === `${slideIdx}:imgprompt` ? '추천 중...' : '✨ AI 추천'}
              </button>
            </div>
            <textarea value={slide.visualKeyword || ''} onChange={(e) => onChange({ visualKeyword: e.target.value })}
              placeholder="예: dental implant titanium screws, 3D render, clean white background"
              rows={2} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200" />
          </div>
          {/* 스타일 */}
          <div className="flex gap-1 flex-wrap">
            {SLIDE_IMAGE_STYLES.map((style) => (
              <button key={style.id} type="button"
                onClick={() => onChange({ imageStyle: style.id as SlideImageStyle })}
                className={`px-2 py-1 text-[9px] rounded-lg border transition-all ${
                  (slide.imageStyle || 'illustration') === style.id
                    ? 'border-blue-400 bg-blue-50 text-blue-700 font-bold'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {style.name}
              </button>
            ))}
          </div>
          {/* 이미지 비율 선택 */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">이미지 비율</label>
            <div className="flex gap-1">
              {(['1:1', '4:5', '9:16', '16:9', '3:4'] as const).map(ratio => (
                <button key={ratio} type="button"
                  onClick={() => onChange({ imageRatio: ratio })}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    (slide.imageRatio || '1:1') === ratio
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          {/* AI 생성 버튼 */}
          <button type="button" onClick={onGenerateImage} disabled={generatingImage}
            className="w-full py-2 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-200 hover:bg-blue-100 disabled:opacity-50">
            {generatingImage ? (
              <span className="flex items-center justify-center gap-1">
                <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />생성 중...
              </span>
            ) : hasImage ? '🔄 AI 이미지 재생성' : '🎨 AI 이미지 생성'}
          </button>
        </div>
      )}

      {/* ── 직접 업로드 (항상 표시) ── */}
      <div className="pt-2 border-t border-slate-100">
        <label className="w-full py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer text-center flex items-center justify-center">
          {hasImage ? '📁 이미지 교체' : '📁 직접 업로드'}
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onUploadImage(file); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );

  // ── 레이아웃별 데이터 편집 (아코디언 안에 들어갈 내용) ──
  const renderLayoutDataEditor = () => {
    if (slide.layout === 'info' || slide.layout === 'closing') {
      return (
        <ElementAccordion icon="T" label="본문" defaultOpen={false}>
          <TextElementEditor value={slide.body || ''} onChange={v => onChange({ body: v })} multiline
            fontSize={slide.bodyFontSize} fontColor={slide.bodyColor} lineHeight={slide.bodyLineHeight}
            onStyleChange={(key, val) => onChange({ [key]: val })} prefix="body" />
        </ElementAccordion>
      );
    }
    if (slide.layout === 'comparison') {
      const cols = slide.columns || [];
      const labels = slide.compareLabels || [];
      const updateCol = (ci: number, patch: Partial<typeof cols[number]>) => {
        onChange({ columns: cols.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
      };
      const updateColItem = (ci: number, ri: number, value: string) => {
        onChange({ columns: cols.map((c, i) => {
          if (i !== ci) return c;
          const items = [...c.items]; items[ri] = value; return { ...c, items };
        }) });
      };
      const updateLabel = (ri: number, value: string) => {
        const next = [...labels]; next[ri] = value; onChange({ compareLabels: next });
      };
      return (
        <ElementAccordion icon="T" label={`비교표 (${cols.length}열 × ${labels.length}행)`} defaultOpen={false}>
          <div className="space-y-2">
            <label className={labelCls}>컬럼 헤더</label>
            <div className="grid grid-cols-2 gap-1.5">
              {cols.map((c, ci) => (
                <input key={ci} type="text" value={c.header} onChange={(e) => updateCol(ci, { header: e.target.value })} className={inputCls} />
              ))}
            </div>
            <label className={labelCls}>행 데이터</label>
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
        </ElementAccordion>
      );
    }
    if (slide.layout === 'icon-grid') {
      const items = slide.icons || [];
      const updateIcon = (i: number, patch: Partial<typeof items[number]>) => {
        onChange({ icons: items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
      };
      return (
        <ElementAccordion icon="T" label={`아이콘 (${items.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[44px_1fr_1.6fr] gap-1.5">
                <input type="text" value={it.emoji} onChange={(e) => updateIcon(i, { emoji: e.target.value })} className={`${inputCls} text-center`} />
                <input type="text" value={it.title} onChange={(e) => updateIcon(i, { title: e.target.value })} className={inputCls} placeholder="제목" />
                <input type="text" value={it.desc || ''} onChange={(e) => updateIcon(i, { desc: e.target.value })} className={inputCls} placeholder="설명" />
              </div>
            ))}
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'steps') {
      const steps = slide.steps || [];
      const updateStep = (i: number, patch: Partial<typeof steps[number]>) => {
        onChange({ steps: steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
      };
      return (
        <ElementAccordion icon="T" label={`단계 (${steps.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.6fr] gap-1.5">
                <input type="text" value={s.label} onChange={(e) => updateStep(i, { label: e.target.value })} className={inputCls} placeholder={`단계 ${i + 1}`} />
                <input type="text" value={s.desc || ''} onChange={(e) => updateStep(i, { desc: e.target.value })} className={inputCls} placeholder="설명" />
              </div>
            ))}
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'checklist') {
      const checks = slide.checkItems || [];
      const updateCheck = (i: number, value: string) => { const next = [...checks]; next[i] = value; onChange({ checkItems: next }); };
      return (
        <ElementAccordion icon="T" label={`체크리스트 (${checks.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {checks.map((c, i) => (
              <input key={i} type="text" value={c} onChange={(e) => updateCheck(i, e.target.value)} className={inputCls} />
            ))}
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'data-highlight') {
      const points = slide.dataPoints || [];
      const updateDp = (i: number, patch: Partial<typeof points[number]>) => {
        onChange({ dataPoints: points.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
      };
      return (
        <ElementAccordion icon="T" label={`수치 데이터 (${points.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {points.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr] gap-1.5">
                <input type="text" value={p.value} onChange={(e) => updateDp(i, { value: e.target.value })} className={`${inputCls} font-bold text-center`} placeholder="90%" />
                <input type="text" value={p.label} onChange={(e) => updateDp(i, { label: e.target.value })} className={inputCls} placeholder="라벨" />
              </div>
            ))}
          </div>
        </ElementAccordion>
      );
    }
    return null;
  };

  // ═══════════════════════════════════════
  // 최종 렌더: 편집 / AI 2탭
  // ═══════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* 2탭 헤더 */}
      <div className="flex border-b border-slate-200">
        <button type="button" onClick={() => setEditMode('edit')}
          className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition-all ${
            editMode === 'edit' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400'
          }`}>
          ⚙️ 편집
        </button>
        <button type="button" onClick={() => setEditMode('ai')}
          className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition-all ${
            editMode === 'ai' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-400'
          }`}>
          ✨ AI 디자이너
        </button>
      </div>

      {/* ── 편집 탭 ── */}
      {editMode === 'edit' && (
        <div className="space-y-2">
          {/* 이미지 */}
          <ElementAccordion icon="🖼" label={slide.imageUrl ? '이미지' : '이미지 추가'} defaultOpen={false}>
            {imageSection}
          </ElementAccordion>

          {/* 제목 */}
          <ElementAccordion icon="T" label={slide.title || '제목'} defaultOpen={true}>
            <TextElementEditor value={slide.title} onChange={v => onChange({ title: v })}
              fontSize={slide.titleFontSize} fontWeight={slide.titleFontWeight}
              fontColor={slide.titleColor} letterSpacing={slide.titleLetterSpacing}
              lineHeight={slide.titleLineHeight}
              onStyleChange={(key, val) => onChange({ [key]: val })} prefix="title" />
          </ElementAccordion>

          {/* 부제 */}
          <ElementAccordion icon="T" label={slide.subtitle || '부제'} defaultOpen={false}>
            <TextElementEditor value={slide.subtitle || ''} onChange={v => onChange({ subtitle: v })}
              fontSize={slide.subtitleFontSize} fontWeight={slide.subtitleFontWeight}
              fontColor={slide.subtitleColor} letterSpacing={slide.subtitleLetterSpacing}
              lineHeight={slide.subtitleLineHeight}
              onStyleChange={(key, val) => onChange({ [key]: val })} prefix="subtitle" />
          </ElementAccordion>

          {/* 레이아웃별 데이터 */}
          {renderLayoutDataEditor()}

          {/* 커버/마무리 전용 요소 */}
          {(slide.layout === 'cover' || slide.layout === 'closing') && (
            <>
              <ElementAccordion icon="🎨" label="커버 스타일" defaultOpen={false}>
                <div className="grid grid-cols-5 gap-1.5">
                  <button type="button" onClick={() => onChange({ coverTemplateId: undefined })}
                    className={`rounded-lg overflow-hidden aspect-[4/5] border-2 flex items-center justify-center text-[10px] text-slate-400 ${!slide.coverTemplateId ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>기본</button>
                  {COVER_TEMPLATES.map(tmpl => (
                    <button key={tmpl.id} type="button" onClick={() => onChange({ coverTemplateId: tmpl.id })}
                      className={`rounded-lg overflow-hidden aspect-[4/5] border-2 ${slide.coverTemplateId === tmpl.id ? 'border-blue-500' : 'border-slate-200'}`}>
                      <div style={{ background: tmpl.thumbnail, width: '100%', height: '100%' }} />
                    </button>
                  ))}
                </div>
              </ElementAccordion>
              <ElementAccordion icon="🏷" label={slide.badge || '뱃지 (선택)'} defaultOpen={false}>
                <input type="text" value={slide.badge || ''} onChange={e => onChange({ badge: e.target.value || undefined })} placeholder="예: 2025 BEST" className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg" />
              </ElementAccordion>
              <ElementAccordion icon="#" label="해시태그" defaultOpen={false}>
                <input type="text" value={(slide.hashtags || []).join(', ')} onChange={e => onChange({ hashtags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="쉼표로 구분: 임플란트, 치과추천" className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg" />
              </ElementAccordion>
              <ElementAccordion icon="📐" label="텍스트 위치" defaultOpen={false}>
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-400">편집 프리뷰에서 텍스트를 드래그하거나, 아래 좌표를 직접 입력하세요.</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">제목 X/Y (%)</p>
                      <div className="flex gap-1">
                        <input type="number" min={0} max={100} value={slide.titlePosition?.x ?? 50} onChange={e => onChange({ titlePosition: { x: Number(e.target.value), y: slide.titlePosition?.y ?? 50 } })} className="w-14 px-2 py-1 text-xs bg-white border border-slate-200 rounded" />
                        <input type="number" min={0} max={100} value={slide.titlePosition?.y ?? 50} onChange={e => onChange({ titlePosition: { x: slide.titlePosition?.x ?? 50, y: Number(e.target.value) } })} className="w-14 px-2 py-1 text-xs bg-white border border-slate-200 rounded" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">부제 X/Y (%)</p>
                      <div className="flex gap-1">
                        <input type="number" min={0} max={100} value={slide.subtitlePosition?.x ?? 50} onChange={e => onChange({ subtitlePosition: { x: Number(e.target.value), y: slide.subtitlePosition?.y ?? 50 } })} className="w-14 px-2 py-1 text-xs bg-white border border-slate-200 rounded" />
                        <input type="number" min={0} max={100} value={slide.subtitlePosition?.y ?? 50} onChange={e => onChange({ subtitlePosition: { x: slide.subtitlePosition?.x ?? 50, y: Number(e.target.value) } })} className="w-14 px-2 py-1 text-xs bg-white border border-slate-200 rounded" />
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => onChange({ titlePosition: undefined, subtitlePosition: undefined })}
                    className="px-3 py-1.5 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200">↺ 위치 초기화</button>
                </div>
              </ElementAccordion>
            </>
          )}

          {/* 카드별 글씨체 */}
          <ElementAccordion icon="🎨" label="카드 글씨체" defaultOpen={false}>
            <select value={slide.fontId || ''} onChange={(e) => { onChange({ fontId: e.target.value || undefined }); onFontChange(e.target.value || undefined); }} className={inputCls}>
              <option value="">전체 설정 따름</option>
              {FONT_CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {CARD_FONTS.filter((f) => f.category === cat).map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </optgroup>
              ))}
              {customFontName && <optgroup label="내 폰트"><option value="custom">📁 {customFontDisplayName || customFontName}</option></optgroup>}
            </select>
          </ElementAccordion>

          {/* 장식 요소 */}
          <ElementAccordion icon="🎨" label={`장식 요소${(slide.decorations?.length || 0) > 0 ? ` (${slide.decorations!.length})` : ''}`} defaultOpen={false}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { type: 'star' as const, icon: '⭐', label: '별' },
                  { type: 'circle' as const, icon: '⭕', label: '원' },
                  { type: 'line' as const, icon: '➖', label: '선' },
                  { type: 'arrow' as const, icon: '›', label: '화살표' },
                  { type: 'badge' as const, icon: '🏷️', label: '뱃지' },
                  { type: 'corner' as const, icon: '┏', label: '코너' },
                  { type: 'dots' as const, icon: '•••', label: '점' },
                  { type: 'wave' as const, icon: '〰️', label: '물결' },
                ]).map(item => (
                  <button key={item.type} type="button"
                    onClick={() => {
                      const newDeco: SlideDecoration = {
                        id: `deco-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
                        type: item.type,
                        position: { top: `${20 + Math.random() * 60}%`, left: `${10 + Math.random() * 70}%` },
                        size: item.type === 'line' ? 30 : item.type === 'badge' ? 40 : 50,
                        color: accentColor,
                        opacity: 0.3,
                        rotation: item.type === 'star' ? Math.floor(Math.random() * 30) - 15 : 0,
                      };
                      onChange({ decorations: [...(slide.decorations || []), newDeco] });
                    }}
                    className="px-3 py-1.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all">
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
              {(slide.decorations || []).map((deco) => (
                <div key={deco.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] font-bold text-slate-500 w-10 shrink-0">
                    {deco.type === 'star' ? '⭐' : deco.type === 'circle' ? '⭕' : deco.type === 'line' ? '➖' : deco.type === 'arrow' ? '›' : deco.type === 'badge' ? '🏷️' : deco.type === 'corner' ? '┏' : deco.type === 'dots' ? '•••' : '〰️'}
                  </span>
                  <div className="flex-1 flex items-center gap-1">
                    <span className="text-[9px] text-slate-400">크기</span>
                    <input type="range" min="20" max="120" value={deco.size}
                      onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, size: Number(e.target.value) } : d) })}
                      className="w-14 h-1 accent-blue-500" />
                    <span className="text-[9px] text-slate-400 ml-1">투명도</span>
                    <input type="range" min="10" max="100" value={Math.round(deco.opacity * 100)}
                      onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, opacity: Number(e.target.value) / 100 } : d) })}
                      className="w-14 h-1 accent-blue-500" />
                  </div>
                  <button type="button"
                    onClick={() => onChange({ decorations: (slide.decorations || []).filter(d => d.id !== deco.id) })}
                    className="text-red-400 hover:text-red-600 text-xs font-bold shrink-0">✕</button>
                </div>
              ))}
            </div>
          </ElementAccordion>
        </div>
      )}

      {/* ── AI 디자이너 탭 ── */}
      {editMode === 'ai' && (
        <div className="space-y-3">
          <button type="button" onClick={onAiEnrich}
            disabled={aiSuggestingKey === `${slideIdx}:enrich`}
            className="w-full py-2.5 bg-green-50 text-green-600 text-sm font-bold rounded-xl border border-green-200 hover:bg-green-100 disabled:opacity-50">
            {aiSuggestingKey === `${slideIdx}:enrich` ? '🔍 웹 검색 중...' : '🔍 웹 검색으로 내용 보강'}
          </button>
          <button type="button" onClick={() => onAiSuggestText('title')}
            disabled={isSuggesting('title')}
            className="w-full py-2.5 bg-purple-50 text-purple-600 text-sm font-bold rounded-xl border border-purple-200 hover:bg-purple-100 disabled:opacity-50">
            {isSuggesting('title') ? '추천 중...' : '✨ AI 제목 추천'}
          </button>
          <button type="button" onClick={() => onAiSuggestText('subtitle')}
            disabled={isSuggesting('subtitle')}
            className="w-full py-2.5 bg-purple-50 text-purple-600 text-sm font-bold rounded-xl border border-purple-200 hover:bg-purple-100 disabled:opacity-50">
            {isSuggesting('subtitle') ? '추천 중...' : '✨ AI 부제 추천'}
          </button>
          {slide.layout === 'comparison' && (
            <button type="button" onClick={onAiSuggestComparison}
              disabled={aiSuggestingKey === `${slideIdx}:comparison`}
              className="w-full py-2.5 bg-purple-50 text-purple-600 text-sm font-bold rounded-xl border border-purple-200 hover:bg-purple-100 disabled:opacity-50">
              {aiSuggestingKey === `${slideIdx}:comparison` ? '생성 중...' : '✨ AI 비교 데이터 자동 채우기'}
            </button>
          )}
          <button type="button" onClick={onSuggestImagePrompt}
            disabled={aiSuggestingKey === `${slideIdx}:imgprompt`}
            className="w-full py-2.5 bg-blue-50 text-blue-600 text-sm font-bold rounded-xl border border-blue-200 hover:bg-blue-100 disabled:opacity-50">
            {aiSuggestingKey === `${slideIdx}:imgprompt` ? '추천 중...' : '🎨 AI 이미지 프롬프트 추천'}
          </button>

          {/* AI 채팅 */}
          {cardChatSection}
        </div>
      )}
    </div>
  );
}
