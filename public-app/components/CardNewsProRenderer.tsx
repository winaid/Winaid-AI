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

  // 카드뉴스의 신 채팅
  interface ChatMessage { role: 'user' | 'assistant'; text: string }
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

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

  /** 카드뉴스의 신 — 채팅으로 전체 슬라이드 수정 */
  const handleChatSend = async () => {
    const userMsg = chatInput.trim();
    if (!userMsg || chatLoading) return;

    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setChatLoading(true);

    try {
      // 슬라이드를 슬림하게 직렬화 (이미지 dataUrl 제외해서 토큰 절약)
      const slidesForContext = slides.map(s => ({
        index: s.index,
        layout: s.layout,
        title: s.title,
        subtitle: s.subtitle,
        body: s.body,
        columns: s.columns,
        compareLabels: s.compareLabels,
        icons: s.icons,
        steps: s.steps,
        checkItems: s.checkItems,
        dataPoints: s.dataPoints,
        beforeLabel: s.beforeLabel,
        afterLabel: s.afterLabel,
        beforeItems: s.beforeItems,
        afterItems: s.afterItems,
        questions: s.questions,
        timelineItems: s.timelineItems,
        quoteText: s.quoteText,
        quoteAuthor: s.quoteAuthor,
        quoteRole: s.quoteRole,
        numberedItems: s.numberedItems,
        pros: s.pros,
        cons: s.cons,
        prosLabel: s.prosLabel,
        consLabel: s.consLabel,
        priceItems: s.priceItems,
        warningTitle: s.warningTitle,
        warningItems: s.warningItems,
      }));

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `현재 카드뉴스 슬라이드:
${JSON.stringify(slidesForContext, null, 2)}

사용자 요청: "${userMsg}"

아래 형식으로 응답해주세요:
1. 먼저 간단한 설명 (2~3문장, 한국어): 무엇을 어떻게 수정했는지 + 왜 그렇게 바꿨는지
2. 그 다음 구분자 ---SLIDES_JSON--- 이후에 수정된 전체 slides 배열을 JSON으로 출력

출력 예시:
3장의 본문을 구체적인 수치로 보강했고, 5장에 비교표를 추가했어요. 의료광고법 위반 표현 "완벽" 1개는 "꼼꼼"으로 바꿨습니다.
---SLIDES_JSON---
[{"index":1,"layout":"cover","title":"..."}, ...]

규칙:
- 특정 장만 수정 요청이면 해당 장만 바꾸고 나머지는 그대로.
- 레이아웃 변경 요청 시 적절한 레이아웃으로 교체하고 필요한 필드를 채움.
- 16종 레이아웃: cover/info/comparison/icon-grid/steps/checklist/data-highlight/closing/before-after/qna/timeline/quote/numbered-list/pros-cons/price-table/warning
- 반드시 모든 슬라이드가 JSON 배열에 포함되어야 함(전체 재출력).
- 의료광고법 위반 표현(완치/100%/최첨단/완벽/획기적/유일/국내 최초/1위 등) 사용 금지.
- 구체적 수치는 범위로(예: "80~120만원", "3~6개월").
- JSON은 파싱 가능해야 함. 설명 안에는 JSON 금지.`,
          systemInstruction: `당신은 "카드뉴스의 신"입니다. 병원 마케팅 카드뉴스 분야 10년 경력, 7,000개 이상의 카드뉴스를 제작한 대한민국 최고의 카드뉴스 기획자입니다.

성격:
- 친근하지만 전문적. "~해드릴게요", "~추천드려요" 톤.
- 구체적 수치와 데이터를 사랑. "대략" 같은 말 금지.
- 디자인 감각이 뛰어나 레이아웃 추천을 잘 함.
- 의료광고법을 꿰뚫어서 위반 표현 즉시 지적.

응답 규칙:
1. 사용자 요청을 정확히 반영한 수정본 제시
2. 수정 이유를 1~2문장으로 간결하게 설명
3. 추가 개선 제안이 있으면 한 줄
4. 의료광고법 위반 시 즉시 지적하고 대체
5. 16종 레이아웃 자유자재로 활용
6. 형식: 설명 → ---SLIDES_JSON--- → JSON 배열`,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 32768,
          googleSearch: true,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ 오류가 발생했어요. ${data.error || '다시 시도해주세요.'}` }]);
        return;
      }

      const separator = '---SLIDES_JSON---';
      const sepIdx = data.text.indexOf(separator);

      if (sepIdx >= 0) {
        const explanation = data.text.substring(0, sepIdx).trim();
        const jsonPart = data.text.substring(sepIdx + separator.length).trim();
        setChatMessages(prev => [...prev, { role: 'assistant', text: explanation || '수정했어요.' }]);

        try {
          const cleaned = jsonPart
            .replace(/```json?\s*\n?/gi, '')
            .replace(/\n?```\s*$/g, '')
            .trim();
          // 배열 또는 { slides: [...] } 둘 다 처리
          let parsed: unknown;
          try {
            parsed = JSON.parse(cleaned);
          } catch {
            const startArr = cleaned.indexOf('[');
            const endArr = cleaned.lastIndexOf(']');
            const startObj = cleaned.indexOf('{');
            const endObj = cleaned.lastIndexOf('}');
            if (startArr !== -1 && endArr !== -1 && (startObj === -1 || startArr < startObj)) {
              parsed = JSON.parse(cleaned.slice(startArr, endArr + 1));
            } else if (startObj !== -1 && endObj !== -1) {
              parsed = JSON.parse(cleaned.slice(startObj, endObj + 1));
            } else {
              throw new Error('JSON 경계 탐지 실패');
            }
          }

          const newSlidesRaw: unknown = Array.isArray(parsed)
            ? parsed
            : (parsed as { slides?: unknown[] })?.slides;

          if (!Array.isArray(newSlidesRaw) || newSlidesRaw.length === 0) {
            throw new Error('빈 배열');
          }

          // 기존 슬라이드의 imageUrl/imagePosition/imageStyle/visualKeyword 유지 (AI가 안 돌려준 경우)
          const merged: SlideData[] = (newSlidesRaw as Partial<SlideData>[]).map((s, i) => {
            const prev = slides.find(p => p.index === (s.index ?? i + 1)) || slides[i];
            return {
              ...(prev || {}),
              ...s,
              index: s.index ?? i + 1,
              // 이미지는 AI 응답에 명시적으로 포함되지 않으면 기존 것 유지
              imageUrl: s.imageUrl ?? prev?.imageUrl,
              imagePosition: s.imagePosition ?? prev?.imagePosition,
              imageStyle: s.imageStyle ?? prev?.imageStyle,
              visualKeyword: s.visualKeyword ?? prev?.visualKeyword,
            } as SlideData;
          });
          onSlidesChange(merged);
        } catch (parseErr) {
          console.warn('[CARD_NEWS_CHAT] JSON 파싱 실패', parseErr);
          setChatMessages(prev => [...prev, { role: 'assistant', text: '(⚠️ 슬라이드 업데이트를 적용하지 못했어요. 조금 더 구체적으로 요청해주세요.)' }]);
        }
      } else {
        // 구분자 없이 일반 텍스트 응답
        setChatMessages(prev => [...prev, { role: 'assistant', text: data.text as string }]);
      }
    } catch (err) {
      console.warn('[CARD_NEWS_CHAT] 오류', err);
      setChatMessages(prev => [...prev, { role: 'assistant', text: '⚠️ 네트워크 오류가 발생했어요. 다시 시도해주세요.' }]);
    } finally {
      setChatLoading(false);
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

      {/* ═══ 카드뉴스의 신 AI 채팅 ═══ */}
      <button
        type="button"
        onClick={() => setChatOpen(v => !v)}
        className="w-full mt-2 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold text-sm rounded-xl hover:from-purple-600 hover:to-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
      >
        {chatOpen ? '✕ 닫기' : '💬 카드뉴스의 신에게 물어보기'}
      </button>

      {chatOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎨</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800">카드뉴스의 신</div>
                <div className="text-[10px] text-slate-500">병원 마케팅 카드뉴스 10년 경력 · 의료광고법 전문가</div>
              </div>
            </div>
          </div>

          {/* 메시지 목록 */}
          <div className="h-72 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-6">
                <p className="text-2xl mb-2">🎨</p>
                <p className="font-semibold text-slate-600">안녕하세요! 카드뉴스의 신입니다.</p>
                <p className="mt-1 text-[12px]">슬라이드 수정·레이아웃 추천·내용 보강<br />무엇이든 물어봐주세요.</p>
                <div className="flex flex-wrap gap-1.5 justify-center mt-4">
                  {[
                    '3장 내용이 약한데 보강해줘',
                    '비교표를 추가하고 싶어',
                    '전체적으로 톤을 더 친근하게',
                    '가격 정보 슬라이드 넣어줘',
                  ].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setChatInput(q)}
                      className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] rounded-full hover:bg-purple-100 hover:text-purple-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 입력창 */}
          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              placeholder="수정 요청을 입력하세요..."
              disabled={chatLoading}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-bold rounded-xl hover:from-purple-600 hover:to-blue-600 disabled:opacity-40 transition-all"
            >
              전송
            </button>
          </div>
        </div>
      )}
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
          {/* 이미지 프롬프트 (visualKeyword) + AI 추천 */}
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
