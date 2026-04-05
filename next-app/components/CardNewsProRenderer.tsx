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

  /** 슬라이드 내용 기반 이미지 프롬프트(visualKeyword) AI 추천 */
  const handleSuggestImagePrompt = async (idx: number) => {
    const slide = slides[idx];
    if (!slide) return;
    const key = `${idx}:imgprompt`;
    setAiSuggestingKey(key);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `카드뉴스 슬라이드 제목: "${slide.title}"
부제: "${slide.subtitle || ''}"
본문: "${slide.body || ''}"
레이아웃: ${slide.layout}

이 슬라이드에 어울리는 이미지를 영어로 묘사해.
규칙:
- 1줄, 영어로만 (한국어 금지)
- 의료/치과 맥락 유지
- 스타일 키워드 포함 (3D render / illustration / photograph / infographic 중)
- 깨끗한 배경·프로페셔널 품질 암시
- 프롬프트만 출력, 따옴표·설명 없이`,
          systemInstruction: '이미지 프롬프트 전문가. 영어 프롬프트 한 줄만 출력. 따옴표·설명 금지.',
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.8,
          maxOutputTokens: 200,
        }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) {
        const cleaned = data.text.replace(/^["'`]+|["'`]+$/g, '').replace(/\n/g, ' ').trim();
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
    // 기본 좌측 정렬 + 적정 줄 간격. cover/closing 등 중앙 정렬 레이아웃은
    // 각 렌더 함수에서 textAlign:'center'로 오버라이드.
    textAlign: 'left',
    lineHeight: 1.5,
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
          {/* 테마 배경색 기반 오버레이 — 회색빛 대신 테마 색조 유지 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `linear-gradient(180deg, ${theme.backgroundColor}CC 0%, ${theme.backgroundColor}EE 100%)`,
              zIndex: -1,
            }}
          />
        </>
      );
    }

    if (position === 'top' || position === 'bottom') {
      return (
        <div
          style={{
            width: '100%',
            height: '420px',
            overflow: 'hidden',
            borderRadius: '20px',
            marginBottom: position === 'top' ? '32px' : 0,
            marginTop: position === 'bottom' ? 'auto' : 0,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            flexShrink: 0,
            // 잘림 방지: 여백을 테마 배경색으로 채우기
            background: theme.backgroundColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={slide.imageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
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
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: theme.backgroundColor }}
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
  // 확장 레이아웃 8종
  // ═══════════════════════════════════════

  const renderBeforeAfter = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      {topBar}
      <h2 style={{ color: theme.titleColor, fontSize: '40px', fontWeight: 800, textAlign: 'center', marginBottom: '32px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.title}
      </h2>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignContent: 'center' }}>
        {/* BEFORE */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '18px', padding: '28px 24px', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ color: theme.bodyColor, fontSize: '16px', fontWeight: 800, textAlign: 'center', marginBottom: '22px', textTransform: 'uppercase', letterSpacing: '3px' }}>
            {slide.beforeLabel || 'BEFORE'}
          </div>
          {(slide.beforeItems || []).map((item, i) => (
            <div key={i} style={{ color: theme.bodyColor, fontSize: '18px', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', wordBreak: 'keep-all' }}>
              • {item}
            </div>
          ))}
        </div>
        {/* AFTER */}
        <div style={{ background: `${theme.accentColor}1F`, borderRadius: '18px', padding: '28px 24px', border: `2px solid ${theme.accentColor}` }}>
          <div style={{ color: theme.accentColor, fontSize: '16px', fontWeight: 800, textAlign: 'center', marginBottom: '22px', textTransform: 'uppercase', letterSpacing: '3px' }}>
            {slide.afterLabel || 'AFTER'}
          </div>
          {(slide.afterItems || []).map((item, i) => (
            <div key={i} style={{ color: theme.titleColor, fontSize: '18px', fontWeight: 700, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', wordBreak: 'keep-all' }}>
              ✓ {item}
            </div>
          ))}
        </div>
      </div>
      {hospitalFooter}
    </div>
  );

  const renderQna = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      {topBar}
      <h2 style={{ color: theme.titleColor, fontSize: '40px', fontWeight: 800, marginBottom: '36px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.title}
      </h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '28px', justifyContent: 'center' }}>
        {(slide.questions || []).map((qa, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
              <span style={{ flexShrink: 0, width: '44px', height: '44px', borderRadius: '12px', background: theme.accentColor, color: '#fff', fontSize: '22px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Q</span>
              <span style={{ color: theme.titleColor, fontSize: '22px', fontWeight: 800, lineHeight: 1.5, wordBreak: 'keep-all', flex: 1, paddingTop: '6px' }}>{qa.q}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
              <span style={{ flexShrink: 0, width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.12)', color: theme.accentColor, fontSize: '22px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
              <span style={{ color: theme.bodyColor, fontSize: '19px', lineHeight: 1.65, wordBreak: 'keep-all', flex: 1, paddingTop: '8px' }}>{qa.a}</span>
            </div>
          </div>
        ))}
      </div>
      {hospitalFooter}
    </div>
  );

  const renderTimeline = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      {topBar}
      <h2 style={{ color: theme.titleColor, fontSize: '40px', fontWeight: 800, marginBottom: '36px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.title}
      </h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', paddingLeft: '50px' }}>
        <div style={{ position: 'absolute', left: '20px', top: '8px', bottom: '8px', width: '3px', background: `${theme.accentColor}55` }} />
        {(slide.timelineItems || []).map((item, i) => (
          <div key={i} style={{ marginBottom: '28px', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '-40px', top: '4px', width: '18px', height: '18px', borderRadius: '50%', background: theme.accentColor, border: `4px solid ${theme.backgroundColor}`, boxShadow: `0 0 0 3px ${theme.accentColor}55` }} />
            <div style={{ color: theme.accentColor, fontSize: '16px', fontWeight: 800, marginBottom: '6px', letterSpacing: '1px' }}>{item.time}</div>
            <div style={{ color: theme.titleColor, fontSize: '22px', fontWeight: 800, wordBreak: 'keep-all' }}>{item.title}</div>
            {item.desc && <div style={{ color: theme.bodyColor, fontSize: '16px', marginTop: '6px', lineHeight: 1.55, wordBreak: 'keep-all' }}>{item.desc}</div>}
          </div>
        ))}
      </div>
      {hospitalFooter}
    </div>
  );

  const renderQuote = (slide: SlideData) => (
    <div style={{ ...cardContainerStyle, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      {renderImageLayer(slide)}
      <div style={{ fontSize: '120px', color: theme.accentColor, opacity: 0.35, lineHeight: 0.9, fontFamily: 'Georgia, serif' }}>&ldquo;</div>
      <p style={{ color: theme.titleColor, fontSize: '32px', fontWeight: 700, lineHeight: 1.65, maxWidth: '820px', margin: '24px 0 40px', wordBreak: 'keep-all' }}>
        {slide.quoteText || slide.body}
      </p>
      {slide.quoteAuthor && (
        <div style={{ color: theme.accentColor, fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>— {slide.quoteAuthor}</div>
      )}
      {slide.quoteRole && <div style={{ color: theme.bodyColor, fontSize: '18px' }}>{slide.quoteRole}</div>}
      {hospitalFooter}
    </div>
  );

  const renderNumberedList = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      {topBar}
      <h2 style={{ color: theme.titleColor, fontSize: '40px', fontWeight: 800, marginBottom: '32px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.title}
      </h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center' }}>
        {(slide.numberedItems || []).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <span style={{
              flexShrink: 0,
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: theme.accentColor,
              color: '#FFFFFF',
              fontSize: '26px',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 20px ${theme.accentColor}55`,
            }}>
              {item.num || String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ color: theme.titleColor, fontSize: '22px', fontWeight: 800, wordBreak: 'keep-all' }}>{item.title}</div>
              {item.desc && <div style={{ color: theme.bodyColor, fontSize: '16px', marginTop: '4px', lineHeight: 1.5, wordBreak: 'keep-all' }}>{item.desc}</div>}
            </div>
          </div>
        ))}
      </div>
      {hospitalFooter}
    </div>
  );

  const renderProsCons = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      {topBar}
      <h2 style={{ color: theme.titleColor, fontSize: '40px', fontWeight: 800, textAlign: 'center', marginBottom: '32px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.title}
      </h2>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignContent: 'center' }}>
        <div style={{ background: 'rgba(52,211,153,0.12)', borderRadius: '18px', padding: '28px 22px', border: '1px solid rgba(52,211,153,0.4)' }}>
          <div style={{ color: '#34D399', fontSize: '22px', fontWeight: 900, textAlign: 'center', marginBottom: '20px' }}>
            {slide.prosLabel || '✓ 장점'}
          </div>
          {(slide.pros || []).map((p, i) => (
            <div key={i} style={{ color: theme.titleColor, fontSize: '17px', padding: '10px 0', display: 'flex', gap: '10px', wordBreak: 'keep-all' }}>
              <span style={{ color: '#34D399', fontWeight: 900, flexShrink: 0 }}>○</span>
              <span>{p}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(239,68,68,0.12)', borderRadius: '18px', padding: '28px 22px', border: '1px solid rgba(239,68,68,0.4)' }}>
          <div style={{ color: '#F87171', fontSize: '22px', fontWeight: 900, textAlign: 'center', marginBottom: '20px' }}>
            {slide.consLabel || '⚠ 주의점'}
          </div>
          {(slide.cons || []).map((c, i) => (
            <div key={i} style={{ color: theme.titleColor, fontSize: '17px', padding: '10px 0', display: 'flex', gap: '10px', wordBreak: 'keep-all' }}>
              <span style={{ color: '#F87171', fontWeight: 900, flexShrink: 0 }}>✕</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      </div>
      {hospitalFooter}
    </div>
  );

  const renderPriceTable = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      {topBar}
      <h2 style={{ color: theme.titleColor, fontSize: '40px', fontWeight: 800, textAlign: 'center', marginBottom: '28px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.title}
      </h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', alignSelf: 'center', width: '100%', maxWidth: '820px', justifyContent: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '3px' }}>
          <div style={{ background: theme.accentColor, color: '#FFFFFF', padding: '20px', fontWeight: 900, fontSize: '20px', textAlign: 'center', borderRadius: '12px 0 0 0' }}>시술 항목</div>
          <div style={{ background: theme.accentColor, color: '#FFFFFF', padding: '20px', fontWeight: 900, fontSize: '20px', textAlign: 'center', borderRadius: '0 12px 0 0' }}>예상 비용</div>
        </div>
        {(slide.priceItems || []).map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '3px' }}>
            <div style={{ background: 'rgba(255,255,255,0.07)', padding: '20px', color: theme.titleColor, fontWeight: 600, fontSize: '19px', textAlign: 'center', wordBreak: 'keep-all' }}>{item.name}</div>
            <div style={{ background: 'rgba(255,255,255,0.07)', padding: '18px 20px', color: theme.accentColor, fontWeight: 900, fontSize: '22px', textAlign: 'center' }}>
              {item.price}
              {item.note && <div style={{ fontSize: '12px', color: theme.bodyColor, marginTop: '3px', fontWeight: 500 }}>{item.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {hospitalFooter}
    </div>
  );

  const renderWarning = (slide: SlideData) => (
    <div style={cardContainerStyle}>
      {renderImageLayer(slide)}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '72px', lineHeight: 1 }}>⚠️</span>
      </div>
      <h2 style={{ color: theme.accentColor, fontSize: '42px', fontWeight: 900, textAlign: 'center', marginBottom: '32px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
        {slide.warningTitle || slide.title}
      </h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
        {(slide.warningItems || []).map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            background: 'rgba(239,68,68,0.12)',
            borderRadius: '14px',
            padding: '22px 26px',
            borderLeft: '5px solid #F87171',
          }}>
            <span style={{ color: '#F87171', fontSize: '22px', flexShrink: 0, fontWeight: 900 }}>❗</span>
            <span style={{ color: theme.titleColor, fontSize: '19px', fontWeight: 600, wordBreak: 'keep-all' }}>{item}</span>
          </div>
        ))}
      </div>
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
            <div key={`${idx}-${theme.fontId || 'default'}-${fontLoaded}`} className={`bg-white rounded-xl border transition-all ${isEditing ? 'border-blue-400 ring-2 ring-blue-100 sm:col-span-2 lg:col-span-3' : 'border-slate-200'}`}>
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
                    onAiEnrich={() => handleAiEnrichSlide(idx)}
                    onSuggestImagePrompt={() => handleSuggestImagePrompt(idx)}
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
  onAiEnrich: () => void;
  onSuggestImagePrompt: () => void;
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
  onAiEnrich,
  onSuggestImagePrompt,
  generatingImage,
  aiSuggestingKey,
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
    </>
  );

  // ── 슬라이드 이미지 섹션 (이미지 유무와 무관하게 모든 UI 상시 노출) ──
  const hasImage = !!slide.imageUrl;
  const imageSection = (
    <div className="pt-2 mt-2 border-t border-slate-200 space-y-2">
      <label className="text-[10px] font-semibold text-slate-500">슬라이드 이미지</label>

      {/* 이미지가 있을 때만 프리뷰 + 삭제 */}
      {hasImage && (
        <div className="relative">
          <img src={slide.imageUrl} alt="" className="w-full h-32 object-contain bg-slate-100 rounded-lg border border-slate-200" />
          <button
            type="button"
            onClick={() => onChange({ imageUrl: undefined })}
            className="absolute top-1 right-1 px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-md shadow hover:bg-red-600"
          >
            삭제
          </button>
        </div>
      )}

      {/* 이미지 위치 — 항상 표시 (이미지 생성 전에도 미리 선택 가능) */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 mb-1 block">이미지 위치</label>
        <div className="grid grid-cols-4 gap-1">
          {(['top', 'bottom', 'background', 'center'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => onChange({ imagePosition: pos as SlideImagePosition })}
              className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                (slide.imagePosition || 'top') === pos
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {pos === 'top' ? '상단' : pos === 'bottom' ? '하단' : pos === 'background' ? '배경' : '중앙'}
            </button>
          ))}
        </div>
      </div>

      {/* 프롬프트 textarea + AI 추천 — 항상 표시 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500">이미지 프롬프트 (영문)</span>
          <button
            type="button"
            onClick={onSuggestImagePrompt}
            disabled={aiSuggestingKey === `${slideIdx}:imgprompt`}
            className="text-[9px] font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50"
          >
            {aiSuggestingKey === `${slideIdx}:imgprompt` ? '추천 중...' : '✨ AI 추천'}
          </button>
        </div>
        <textarea
          value={slide.visualKeyword || ''}
          onChange={(e) => onChange({ visualKeyword: e.target.value })}
          placeholder="예: dental implant titanium screws, 3D render, clean white background"
          rows={2}
          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
        />
      </div>

      {/* 이미지 스타일 6종 — 항상 표시 */}
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

      {/* 생성(또는 재생성) + 업로드(또는 교체) — 항상 표시 */}
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
          ) : hasImage ? (
            '🔄 AI 이미지 재생성'
          ) : (
            '🎨 AI 이미지 생성'
          )}
        </button>
        <label className="flex-1 py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer text-center flex items-center justify-center">
          {hasImage ? '📁 이미지 교체' : '📁 직접 업로드'}
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
  );

  if (slide.layout === 'cover') return <>{common}{imageSection}{cardChatSection}</>;

  if (slide.layout === 'info' || slide.layout === 'closing') {
    return (
      <>
        {common}
        <div>
          {fieldLabel('본문', 'body')}
          <textarea rows={3} value={slide.body || ''} onChange={(e) => onChange({ body: e.target.value })} className={textareaCls} />
        </div>
        {imageSection}
        {cardChatSection}
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
        {cardChatSection}
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
        {cardChatSection}
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
        {cardChatSection}
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
        {cardChatSection}
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
        {cardChatSection}
      </>
    );
  }

  return <>{common}{imageSection}{cardChatSection}</>;
}
