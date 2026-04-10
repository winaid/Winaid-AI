'use client';

import { useEffect, useRef, useState } from 'react';
import type { SlideData, CardNewsTheme, SlideLayoutType, DesignPresetStyle } from '../lib/cardNewsLayouts';
import { LAYOUT_LABELS, CARD_FONTS, FONT_CATEGORIES } from '../lib/cardNewsLayouts';
import { buildLayoutDefaults, fillLayoutContent, generateSlideImage, suggestSlideText, suggestImagePrompt, enrichSlide, suggestComparison } from '../lib/cardAiActions';
import type { CardTemplate } from '../lib/cardTemplateService';
import { ensureGoogleFontLoaded, resolveSlideFontFamily } from '../lib/cardStyleUtils';
import { downloadCardAsPng, downloadAllAsZip, captureAllSlidesAsBlobs } from '../lib/cardDownloadUtils';
import CardNewsCanvas from './CardNewsCanvas';
import SlideEditor from './card-news/SlideEditor';
import InteractivePreview from './card-news/InteractivePreview';
import { useSlideRenderer } from './card-news/SlideRenderers';
import VideoPlayer from './video-edit/VideoPlayer';

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
  const [showAddSlide, setShowAddSlide] = useState(false);

  // ── 카드뉴스 → 쇼츠 변환 ──
  const [shortsPanelOpen, setShortsPanelOpen] = useState(false);
  const [shortsConverting, setShortsConverting] = useState(false);
  const [shortsProgress, setShortsProgress] = useState('');
  const [shortsError, setShortsError] = useState('');
  const [shortsResultUrl, setShortsResultUrl] = useState<string | null>(null);
  const [shortsMeta, setShortsMeta] = useState<{
    slides: number;
    duration: number;
    transition: string;
    bgm: boolean;
  } | null>(null);
  const [shortsOpts, setShortsOpts] = useState<{
    slideDuration: number;
    durationMode: 'fixed' | 'auto';
    transition: 'fade' | 'slide' | 'zoom' | 'none';
    bgmEnabled: boolean;
    bgmMood: 'calm' | 'bright' | 'emotional' | 'trendy' | 'corporate';
    bgmVolume: number;
  }>({
    slideDuration: 4,
    durationMode: 'fixed',
    transition: 'fade',
    bgmEnabled: true,
    bgmMood: 'calm',
    bgmVolume: 15,
  });

  // 결과 blob URL은 컴포넌트 unmount 시 정리
  useEffect(() => {
    return () => {
      if (shortsResultUrl) URL.revokeObjectURL(shortsResultUrl);
    };
    // shortsResultUrl 변경 시에는 useEffect 안에서 handleConvertToShorts가 직접 정리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [scales, setScales] = useState<number[]>([]);
  // 슬라이드별 AI 이미지/텍스트 생성 상태
  const [generatingImageIdx, setGeneratingImageIdx] = useState<number | null>(null);
  const [aiSuggestingKey, setAiSuggestingKey] = useState<string | null>(null); // `${idx}:${field}`

  // 카드별 AI 채팅은 SlideEditor 내부에서 관리 (글로벌 채팅 제거)
  // fabric.js 캔버스 모드 토글
  const [useCanvas, setUseCanvas] = useState(true); // 캔버스 에디터 기본 사용

  // 폰트 즉시 반영 + 커스텀 폰트 업로드
  const [fontLoaded, setFontLoaded] = useState(0);
  const [customFontName, setCustomFontName] = useState<string | null>(null);
  const [customFontDisplayName, setCustomFontDisplayName] = useState<string | null>(null);
  const customFontInputRef = useRef<HTMLInputElement | null>(null);

  // ── Undo 히스토리 (Ctrl+Z) ──
  const undoStackRef = useRef<SlideData[][]>([]);
  const MAX_UNDO = 30;

  /** slides 변경 시 히스토리에 현재 상태 저장 후 변경 */
  const pushAndChange = (newSlides: SlideData[]) => {
    undoStackRef.current.push(JSON.parse(JSON.stringify(slides)));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    onSlidesChange(newSlides);
  };

  const undo = () => {
    const prev = undoStackRef.current.pop();
    if (prev) onSlidesChange(prev);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // 입력 중이면 나머지 단축키 무시
      if (isInput) return;

      // Escape: 편집 모달 닫기
      if (e.key === 'Escape' && editingIdx !== null) {
        e.preventDefault();
        setEditingIdx(null);
        return;
      }

      // 편집 모달 열린 상태에서 방향키: 이전/다음 슬라이드
      if (editingIdx !== null) {
        if (e.key === 'ArrowLeft' && editingIdx > 0) {
          e.preventDefault();
          setEditingIdx(editingIdx - 1);
        } else if (e.key === 'ArrowRight' && editingIdx < slides.length - 1) {
          e.preventDefault();
          setEditingIdx(editingIdx + 1);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, editingIdx]);

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
    pushAndChange(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  /** 슬라이드 복제 */
  const duplicateSlide = (idx: number) => {
    const clone: SlideData = JSON.parse(JSON.stringify(slides[idx]));
    const newSlides = [...slides];
    newSlides.splice(idx + 1, 0, clone);
    pushAndChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
  };

  /** 빈 슬라이드 추가 */
  const addSlide = (layout: SlideLayoutType) => {
    const newSlide: SlideData = {
      index: slides.length + 1,
      layout,
      title: '새 슬라이드',
      subtitle: '',
      body: layout === 'info' || layout === 'closing' ? '내용을 입력하세요.' : undefined,
      ...(layout === 'checklist' ? { checkItems: ['항목 1', '항목 2', '항목 3'] } : {}),
      ...(layout === 'steps' ? { steps: [{ label: '단계 1', desc: '' }, { label: '단계 2', desc: '' }] } : {}),
      ...(layout === 'icon-grid' ? { icons: [{ emoji: '🦷', title: '항목 1', desc: '' }, { emoji: '💊', title: '항목 2', desc: '' }, { emoji: '🏥', title: '항목 3', desc: '' }] } : {}),
      ...(layout === 'comparison' ? { compareLabels: ['항목 1', '항목 2'], columns: [{ header: 'A', items: ['-', '-'], highlight: false }, { header: 'B', items: ['-', '-'], highlight: true }] } : {}),
      ...(layout === 'qna' ? { questions: [{ q: '질문을 입력하세요', a: '답변을 입력하세요' }] } : {}),
      ...(layout === 'timeline' ? { timelineItems: [{ time: '1단계', title: '내용', desc: '' }] } : {}),
      ...(layout === 'before-after' ? { beforeLabel: 'Before', afterLabel: 'After', beforeItems: ['항목'], afterItems: ['항목'] } : {}),
      ...(layout === 'pros-cons' ? { pros: ['장점 1'], cons: ['단점 1'] } : {}),
      ...(layout === 'price-table' ? { priceItems: [{ name: '항목', price: '가격', note: '' }] } : {}),
      ...(layout === 'warning' ? { warningTitle: '주의사항', warningItems: ['주의 항목 1'] } : {}),
      ...(layout === 'quote' ? { quoteText: '인용문을 입력하세요', quoteAuthor: '', quoteRole: '' } : {}),
      ...(layout === 'numbered-list' ? { numberedItems: [{ title: '항목 1', desc: '' }] } : {}),
      ...(layout === 'data-highlight' ? { dataPoints: [{ value: '90%', label: '데이터', highlight: true }] } : {}),
    };
    pushAndChange([...slides, newSlide]);
    setShowAddSlide(false);
  };

  /** 슬라이드 삭제 (최소 1장 유지) */
  const removeSlide = (idx: number) => {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== idx);
    pushAndChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
    if (editingIdx === idx) setEditingIdx(null);
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  };

  /** 드래그앤드롭 순서 변경 */
  const handleDragStart = (idx: number) => { setDragIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const from = dragIdx;
    const to = idx;
    const newSlides = [...slides];
    const [moved] = newSlides.splice(from, 1);
    newSlides.splice(to, 0, moved);
    pushAndChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
    // 편집 중인 슬라이드 인덱스 추적
    if (editingIdx !== null) {
      if (editingIdx === from) {
        setEditingIdx(to);
      } else {
        let newIdx = editingIdx;
        // from이 editingIdx 앞이었으면 제거로 -1
        if (from < editingIdx) newIdx--;
        // to가 newIdx 이하이면 삽입으로 +1
        if (to <= newIdx) newIdx++;
        setEditingIdx(newIdx);
      }
    }
    setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ── 레이아웃 변경 + AI 자동 채우기 (lib/cardAiActions.ts 위임) ──
  const handleLayoutChange = async (idx: number, newLayout: SlideLayoutType) => {
    const curr = slides[idx];
    if (!curr) return;
    const withDefaults = buildLayoutDefaults(curr, newLayout);
    pushAndChange(slides.map((s, i) => (i === idx ? withDefaults : s)));
    // 백그라운드에서 AI가 내용 자동 채우기 (플레이스홀더만 있을 때)
    const patch = await fillLayoutContent(withDefaults, slides);
    if (patch) updateSlide(idx, patch);
  };

  // ── AI 액션 래퍼 (lib/cardAiActions.ts 위임) ──
  const handleGenerateSlideImage = async (idx: number) => {
    if (!slides[idx]) return;
    setGeneratingImageIdx(idx);
    try {
      const imageUrl = await generateSlideImage(slides[idx], cardRatio);
      if (imageUrl) updateSlide(idx, { imageUrl, imagePosition: slides[idx].imagePosition || 'top' });
    } catch (err) { console.warn('[CARD_NEWS_PRO] AI 이미지 에러', err); }
    finally { setGeneratingImageIdx(null); }
  };

  const handleUploadSlideImage = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateSlide(idx, { imageUrl: reader.result as string, imagePosition: slides[idx]?.imagePosition || 'top' });
    reader.readAsDataURL(file);
  };

  const handleAiSuggestText = async (idx: number, field: 'title' | 'subtitle' | 'body') => {
    if (!slides[idx]) return;
    setAiSuggestingKey(`${idx}:${field}`);
    try {
      const result = await suggestSlideText(slides[idx], field, slides);
      if (result) updateSlide(idx, { [field]: result } as Partial<SlideData>);
    } catch (err) { console.warn('[CARD_NEWS_PRO] AI 추천 실패', err); }
    finally { setAiSuggestingKey(null); }
  };

  const handleSuggestImagePrompt = async (idx: number) => {
    if (!slides[idx]) return;
    setAiSuggestingKey(`${idx}:imgprompt`);
    try {
      const result = await suggestImagePrompt(slides[idx], slides);
      if (result) updateSlide(idx, { visualKeyword: result });
    } catch (err) { console.warn('[CARD_NEWS_PRO] 프롬프트 추천 실패', err); }
    finally { setAiSuggestingKey(null); }
  };

  const handleAiEnrichSlide = async (idx: number) => {
    if (!slides[idx]) return;
    setAiSuggestingKey(`${idx}:enrich`);
    try {
      const patch = await enrichSlide(slides[idx]);
      if (patch) updateSlide(idx, patch);
    } catch (err) { console.warn('[CARD_NEWS_PRO] 보강 실패', err); }
    finally { setAiSuggestingKey(null); }
  };

  const handleAiSuggestComparison = async (idx: number) => {
    if (!slides[idx] || slides[idx].layout !== 'comparison') return;
    setAiSuggestingKey(`${idx}:comparison`);
    try {
      const result = await suggestComparison(slides[idx]);
      if (result) updateSlide(idx, result);
    } catch (err) { console.warn('[CARD_NEWS_PRO] 비교 추천 실패', err); }
    finally { setAiSuggestingKey(null); }
  };

  // ── 렌더 엔진 (card-news/SlideRenderers.tsx) ──
  const { renderSlide, renderCtx, cardWidth, cardHeight, cardAspect } = useSlideRenderer({
    theme, learnedTemplate: lt, presetStyle, cardRatio, customFontName,
  });
  const { isDarkTheme, innerCardBg, innerCardBorder, cardContainerStyle, effectiveFontFamily } = renderCtx;
  const getSlideFontFamily = (slide: SlideData): string =>
    resolveSlideFontFamily(slide, effectiveFontFamily, customFontName);

  // ── 다운로드 (lib/cardDownloadUtils.ts 위임) ──

  const downloadCard = async (index: number) => {
    setDownloading(true);
    try {
      await downloadCardAsPng(cardRefs.current[index], index, cardWidth, cardHeight);
    } finally {
      setDownloading(false);
    }
  };

  const downloadAll = async () => {
    setDownloading(true);
    try {
      await downloadAllAsZip(cardRefs.current, slides.length, cardWidth, cardHeight, slides[0]?.title);
    } finally {
      setDownloading(false);
    }
  };

  // ── 카드뉴스 → 쇼츠 영상 변환 ──

  /** 글자수 기반 자동 duration: 한국어 초당 4.5자 기준, 3~8초 클램프 */
  const computeAutoDurations = (): number[] => {
    return slides.map(s => {
      const text = [s.title, s.subtitle, s.body].filter(Boolean).join('');
      const charCount = text.replace(/\s/g, '').length;
      if (charCount === 0) return 3;
      const readTime = charCount / 4.5;
      return Math.max(3, Math.min(8, Math.round(readTime * 10) / 10));
    });
  };

  const handleConvertToShorts = async () => {
    if (slides.length === 0) {
      setShortsError('변환할 슬라이드가 없습니다.');
      return;
    }
    // 이전 결과 정리
    if (shortsResultUrl) {
      URL.revokeObjectURL(shortsResultUrl);
      setShortsResultUrl(null);
    }
    setShortsMeta(null);
    setShortsError('');
    setShortsConverting(true);
    setShortsProgress('슬라이드를 캡처하고 있습니다...');

    try {
      // 1) 슬라이드 → PNG Blob 배열
      const imageBlobs = await captureAllSlidesAsBlobs(
        cardRefs.current,
        slides.length,
        cardWidth,
        cardHeight,
      );
      if (imageBlobs.length === 0) throw new Error('슬라이드 캡처 실패');

      // 2) FormData 구성
      setShortsProgress('영상으로 변환 중... (1~3분 소요)');
      const formData = new FormData();
      imageBlobs.forEach((blob, i) => {
        formData.append('images', blob, `slide_${String(i).padStart(3, '0')}.png`);
      });
      formData.append('slide_duration', String(shortsOpts.slideDuration));
      if (shortsOpts.durationMode === 'auto') {
        formData.append('slide_durations', JSON.stringify(computeAutoDurations()));
      }
      formData.append('transition', shortsOpts.transition);
      formData.append('bgm_enabled', String(shortsOpts.bgmEnabled));
      formData.append('bgm_mood', shortsOpts.bgmMood);
      formData.append('bgm_volume', String(shortsOpts.bgmVolume));
      formData.append('aspect_ratio', '9:16');

      // 3) API 호출
      const res = await fetch('/api/video/card-to-shorts', { method: 'POST', body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: '서버 오류' }));
        throw new Error(d.error || `변환 실패 (${res.status})`);
      }

      // 4) 메타 + blob
      const metaHeader = res.headers.get('X-Shorts-Metadata');
      let meta: typeof shortsMeta = null;
      try { if (metaHeader) meta = JSON.parse(metaHeader); } catch {}

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setShortsResultUrl(url);
      setShortsMeta(meta);
      setShortsProgress('');
    } catch (err) {
      setShortsError(err instanceof Error ? err.message : '쇼츠 변환 실패');
    } finally {
      setShortsConverting(false);
    }
  };

  const downloadShorts = () => {
    if (!shortsResultUrl) return;
    const a = document.createElement('a');
    a.href = shortsResultUrl;
    a.download = `cardnews_shorts_${Date.now()}.mp4`;
    a.click();
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
            onClick={async () => {
              if (!confirm('내용은 유지하고 색상/레이아웃만 바꿀까요?')) return;
              setAiSuggestingKey('redesign');
              try {
                const res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prompt: `카드뉴스 슬라이드 ${slides.length}장의 디자인을 새롭게 바꿔줘.

현재 슬라이드 제목들: ${slides.map(s => s.title).join(', ')}

규칙:
- 내용(title, subtitle, body, 데이터)은 절대 변경하지 마
- 색상만 변경: backgroundColor, backgroundGradient, titleColor, subtitleColor, bodyColor, accentColor
- 깔끔하고 전문적인 병원 카드뉴스에 어울리는 색상
- 밝은 톤과 어두운 톤 중 하나를 일관되게 적용

JSON만 출력:
{"backgroundColor":"#hex","backgroundGradient":"linear-gradient(...)","titleColor":"#hex","subtitleColor":"#hex","bodyColor":"#hex","accentColor":"#hex"}`,
                    model: 'gemini-3.1-flash-lite-preview', temperature: 0.9, maxOutputTokens: 500,
                  })});
                const data = await res.json() as { text?: string };
                if (data.text) {
                  const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
                  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
                  if (start !== -1 && end !== -1) {
                    const colors = JSON.parse(cleaned.slice(start, end + 1));
                    onThemeChange({ ...theme, ...colors });
                  }
                }
              } catch { /* ignore */ }
              setAiSuggestingKey(null);
            }}
            disabled={aiSuggestingKey === 'redesign'}
            className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {aiSuggestingKey === 'redesign' ? '✨ 변경 중...' : '✨ AI 리디자인'}
          </button>
          <button
            onClick={downloadAll}
            disabled={downloading}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {downloading ? '⏳ 다운로드 중...' : '📦 전체 다운로드'}
          </button>
          <button
            type="button"
            onClick={() => setShortsPanelOpen(v => !v)}
            disabled={shortsConverting || slides.length === 0}
            className="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold rounded-lg hover:from-pink-600 hover:to-rose-600 transition-colors disabled:opacity-50"
            title="카드뉴스를 9:16 세로 영상(쇼츠/릴스)으로 변환"
          >
            🎬 쇼츠로 변환
          </button>
        </div>
      </div>

      {/* 쇼츠 변환 — 인라인 옵션 패널 */}
      {shortsPanelOpen && (
        <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🎬</span>
              <span className="text-sm font-bold text-rose-700">쇼츠 변환 옵션</span>
              <span className="text-[10px] text-rose-500">9:16 세로 영상</span>
            </div>
            <button
              type="button"
              onClick={() => setShortsPanelOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          {/* 슬라이드당 시간 */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1.5">슬라이드당 시간</label>
            <div className="flex gap-1.5 flex-wrap">
              {[3, 4, 5].map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setShortsOpts(o => ({ ...o, slideDuration: sec, durationMode: 'fixed' }))}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    shortsOpts.durationMode === 'fixed' && shortsOpts.slideDuration === sec
                      ? 'bg-rose-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300'
                  }`}
                >
                  {sec}초
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShortsOpts(o => ({ ...o, durationMode: 'auto' }))}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  shortsOpts.durationMode === 'auto'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300'
                }`}
                title="글자수 기반 (한국어 4.5자/초, 3~8초)"
              >
                자동
              </button>
            </div>
          </div>

          {/* 전환 효과 */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1.5">전환 효과</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: 'fade', label: '페이드' },
                { id: 'slide', label: '슬라이드' },
                { id: 'zoom', label: '줌' },
                { id: 'none', label: '없음' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setShortsOpts(o => ({ ...o, transition: opt.id }))}
                  className={`px-2 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
                    shortsOpts.transition === opt.id
                      ? 'bg-rose-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* BGM */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-slate-500">BGM</label>
              <button
                type="button"
                onClick={() => setShortsOpts(o => ({ ...o, bgmEnabled: !o.bgmEnabled }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${shortsOpts.bgmEnabled ? 'bg-rose-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${shortsOpts.bgmEnabled ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            {shortsOpts.bgmEnabled && (
              <>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {([
                    { id: 'calm', label: '차분 (병원 추천)' },
                    { id: 'bright', label: '밝음' },
                    { id: 'emotional', label: '감성' },
                    { id: 'trendy', label: '트렌디' },
                    { id: 'corporate', label: '전문' },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShortsOpts(o => ({ ...o, bgmMood: opt.id }))}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${
                        shortsOpts.bgmMood === opt.id
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">볼륨</span>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={5}
                    value={shortsOpts.bgmVolume}
                    onChange={e => setShortsOpts(o => ({ ...o, bgmVolume: parseInt(e.target.value) }))}
                    className="flex-1 accent-rose-500"
                  />
                  <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">{shortsOpts.bgmVolume}%</span>
                </div>
              </>
            )}
          </div>

          {/* 안내: TTS는 미구현 */}
          <div className="text-[10px] text-slate-400 italic">
            ※ TTS 나레이션은 다음 업데이트에서 추가 예정 — 지금은 BGM + 전환 효과만 지원
          </div>

          {/* 변환 시작 버튼 */}
          <button
            type="button"
            onClick={handleConvertToShorts}
            disabled={shortsConverting || slides.length === 0}
            className="w-full py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 text-white text-sm font-black rounded-lg hover:from-pink-700 hover:to-rose-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {shortsConverting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {shortsProgress || '변환 중...'}
              </>
            ) : (
              <>🎬 변환 시작 ({slides.length}장)</>
            )}
          </button>

          {shortsError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {shortsError}
            </div>
          )}

          {/* 결과 */}
          {shortsResultUrl && (
            <div className="space-y-2 pt-3 border-t border-pink-200">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-rose-700">✅ 쇼츠 변환 완료</div>
                {shortsMeta && (
                  <div className="text-[10px] text-slate-500 tabular-nums">
                    {shortsMeta.slides}장 · {shortsMeta.duration}초 · {shortsMeta.transition}
                    {shortsMeta.bgm && ' · BGM'}
                  </div>
                )}
              </div>
              <div className="flex gap-3 flex-col sm:flex-row">
                <div className="mx-auto sm:mx-0" style={{ width: '200px' }}>
                  <VideoPlayer src={shortsResultUrl} aspectRatio="9/16" />
                </div>
                <div className="flex-1 flex flex-col gap-2 justify-center">
                  <button
                    type="button"
                    onClick={downloadShorts}
                    className="px-4 py-2.5 bg-rose-600 text-white text-sm font-bold rounded-lg hover:bg-rose-700"
                  >
                    📥 영상 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (shortsResultUrl) URL.revokeObjectURL(shortsResultUrl);
                      setShortsResultUrl(null);
                      setShortsMeta(null);
                    }}
                    className="px-4 py-2.5 bg-white text-slate-600 text-xs font-bold rounded-lg border border-slate-200 hover:border-rose-300"
                  >
                    🔄 다시 만들기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 카드 그리드 (축소 미리보기 + 인라인 편집 패널) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide, idx) => {
          const isEditing = editingIdx === idx;
          return (
            <div key={`${idx}-${theme.fontId || 'default'}-${slide.fontId || ''}-${fontLoaded}`}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`bg-white rounded-xl border transition-all ${
                isEditing ? 'border-blue-400 ring-2 ring-blue-100 sm:col-span-2 lg:col-span-3'
                : dragOverIdx === idx ? 'border-blue-400 border-2 bg-blue-50/50'
                : dragIdx === idx ? 'opacity-40 border-slate-300'
                : 'border-slate-200'
              }`}>
              {/* 프리뷰 영역 — 셀 폭을 꽉 채우는 1:1 박스 + ResizeObserver 동적 스케일 */}
              <div
                ref={(el) => { boxRefs.current[idx] = el; }}
                className="group relative overflow-hidden rounded-t-xl bg-slate-100"
                style={{ width: '100%', aspectRatio: cardAspect }}
              >
                {/* 라벨 (드래그 핸들) */}
                <div
                  className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm cursor-grab active:cursor-grabbing"
                  draggable={!isEditing}
                  onDragStart={(e) => { e.stopPropagation(); handleDragStart(idx); }}
                  onDragEnd={handleDragEnd}
                  title="드래그하여 순서 변경"
                >
                  ⠿ {idx + 1} · {LAYOUT_LABELS[slide.layout]}
                </div>
                {/* 버튼 그룹 — PNG + 복제 + 삭제 */}
                <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => downloadCard(idx)}
                    className="px-2 py-1 bg-white/90 hover:bg-white rounded-lg text-[10px] font-bold text-slate-700 shadow-sm"
                    title="PNG 저장">
                    💾
                  </button>
                  <button type="button" onClick={() => duplicateSlide(idx)}
                    className="px-2 py-1 bg-white/90 hover:bg-white rounded-lg text-[10px] font-bold text-slate-700 shadow-sm"
                    title="복제">
                    📋
                  </button>
                  {slides.length > 1 && (
                    <button type="button" onClick={() => { if (confirm('이 슬라이드를 삭제할까요?')) removeSlide(idx); }}
                      className="px-2 py-1 bg-white/90 hover:bg-red-50 rounded-lg text-[10px] font-bold text-red-500 shadow-sm"
                      title="삭제">
                      🗑
                    </button>
                  )}
                </div>
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

        {/* 슬라이드 추가 카드 */}
        <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 transition-all">
          <div
            className="w-full flex flex-col items-center justify-center cursor-pointer"
            style={{ aspectRatio: cardAspect }}
            onClick={() => setShowAddSlide(!showAddSlide)}
          >
            <div className="text-3xl text-slate-300 mb-2">+</div>
            <div className="text-xs font-semibold text-slate-400">슬라이드 추가</div>
          </div>
          {showAddSlide && (
            <div className="p-3 border-t border-slate-100 max-h-[200px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(LAYOUT_LABELS) as [SlideLayoutType, string][]).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => addSlide(key)}
                    className="px-2 py-2 text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all text-left">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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
              <div className="flex items-center gap-2">
                {/* HTML/Canvas 토글 — 개발용. 캔버스 안정화 후 삭제 예정 */}
                {process.env.NODE_ENV === 'development' && (
                  <button
                    type="button"
                    onClick={() => setUseCanvas(v => !v)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${useCanvas ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {useCanvas ? 'Canvas' : 'HTML'}
                  </button>
                )}
                <button type="button" onClick={() => setEditingIdx(null)} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">✓ 완료</button>
              </div>
            </div>
            {/* 좌(프리뷰) + 우(편집) */}
            <div className="flex-1 flex overflow-hidden">
              {/* 좌: 카드 프리뷰 */}
              <div className="flex-[3] bg-slate-100 flex items-center justify-center p-6 overflow-auto">
                {useCanvas ? (
                  <CardNewsCanvas
                    slide={eSlide}
                    theme={theme}
                    cardRatio={cardRatio}
                    learnedTemplate={learnedTemplate}
                    presetStyle={presetStyle}
                    maxWidth={650}
                    onSlideChange={(patch) => updateSlide(editingIdx, patch)}
                  />
                ) : (
                <InteractivePreview
                  slide={eSlide}
                  hospitalName={theme.hospitalName}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  cardAspect={cardAspect}
                  renderSlide={renderSlide}
                  onSlideChange={(patch) => updateSlide(editingIdx, patch)}
                  fontLoaded={fontLoaded}
                  fontId={theme.fontId}
                  slideFontId={eSlide.fontId}
                />
                )}
              </div>
              {/* 우: 편집 패널 */}
              <div className="flex-[2] min-w-[380px] max-w-[520px] border-l border-slate-200 bg-white overflow-y-auto p-5">
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
