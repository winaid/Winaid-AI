'use client';

import { useEffect, useRef, useState } from 'react';
import type { SlideData, CardNewsTheme, SlideLayoutType, DesignPresetStyle } from '../lib/cardNewsLayouts';
import { LAYOUT_LABELS, CARD_FONTS, FONT_CATEGORIES } from '../lib/cardNewsLayouts';
import { buildLayoutDefaults, fillLayoutContent, generateSlideImage, suggestSlideText, suggestImagePrompt, enrichSlide, suggestComparison } from '../lib/cardAiActions';
import type { CardTemplate } from '../lib/cardTemplateService';
import { ensureGoogleFontLoaded, resolveSlideFontFamily } from '../lib/cardStyleUtils';
import { downloadCardAsPng, downloadAllAsZip } from '../lib/cardDownloadUtils';
import CardNewsCanvas from './CardNewsCanvas';
import SlideEditor from './card-news/SlideEditor';
import { useSlideRenderer } from './card-news/SlideRenderers';

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
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [scales, setScales] = useState<number[]>([]);
  // 슬라이드별 AI 이미지/텍스트 생성 상태
  const [generatingImageIdx, setGeneratingImageIdx] = useState<number | null>(null);
  const [aiSuggestingKey, setAiSuggestingKey] = useState<string | null>(null); // `${idx}:${field}`

  // 카드별 AI 채팅은 SlideEditor 내부에서 관리 (글로벌 채팅 제거)
  // fabric.js 캔버스 모드 토글
  const [useCanvas, setUseCanvas] = useState(false);

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

  /** 슬라이드 복제 */
  const duplicateSlide = (idx: number) => {
    const clone: SlideData = JSON.parse(JSON.stringify(slides[idx]));
    const newSlides = [...slides];
    newSlides.splice(idx + 1, 0, clone);
    onSlidesChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
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
    onSlidesChange([...slides, newSlide]);
    setShowAddSlide(false);
  };

  /** 슬라이드 삭제 (최소 1장 유지) */
  const removeSlide = (idx: number) => {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== idx);
    onSlidesChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
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
    onSlidesChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
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
    onSlidesChange(slides.map((s, i) => (i === idx ? withDefaults : s)));
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
      await downloadAllAsZip(cardRefs.current, slides.length, cardWidth, cardHeight);
    } finally {
      setDownloading(false);
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
                <button
                  type="button"
                  onClick={() => setUseCanvas(v => !v)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${useCanvas ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                >
                  {useCanvas ? 'Canvas' : 'HTML'}
                </button>
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
                <div style={{ width: '100%', maxWidth: '650px', aspectRatio: cardAspect, position: 'relative', overflow: 'hidden', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                  <div key={`edit-fs-${editingIdx}-${fontLoaded}-${theme.fontId || ''}-${eSlide.fontId || ''}`}
                    style={{ position: 'absolute', top: 0, left: 0, width: `${cardWidth}px`, height: `${cardHeight}px`, transform: `scale(${650 / cardWidth})`, transformOrigin: 'top left' }}>
                    {renderSlide(eSlide)}
                  </div>
                  {/* 드래그 오버레이 — 제목/부제/장식 위치 이동 */}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 20, cursor: 'grab' }}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
                      const clickY = ((e.clientY - rect.top) / rect.height) * 100;

                      // 장식 요소 중 가장 가까운 것 찾기
                      let closestDeco: string | null = null;
                      let closestDist = 999;
                      (eSlide.decorations || []).forEach(d => {
                        const dx = parseFloat(d.position.left) - clickX;
                        const dy = parseFloat(d.position.top) - clickY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < closestDist) { closestDist = dist; closestDeco = d.id; }
                      });

                      // 모든 드래그 대상 + 거리 계산
                      const titlePos = eSlide.titlePosition || { x: 50, y: 30 };
                      const subPos = eSlide.subtitlePosition || { x: 50, y: 45 };
                      const hospPos = eSlide.hospitalNamePosition || { x: 50, y: 92 };

                      const targets = [
                        { id: 'title', x: titlePos.x, y: titlePos.y },
                        { id: 'subtitle', x: subPos.x, y: subPos.y },
                        { id: 'hospital', x: hospPos.x, y: hospPos.y },
                      ];
                      if (closestDeco && closestDist < 999) {
                        targets.push({ id: `deco:${closestDeco}`, x: parseFloat((eSlide.decorations || []).find(d => d.id === closestDeco)?.position.left || '50'), y: parseFloat((eSlide.decorations || []).find(d => d.id === closestDeco)?.position.top || '50') });
                      }

                      // 클릭 위치에서 가장 가까운 요소 선택
                      let bestTarget = targets[0];
                      let bestDist = 999;
                      targets.forEach(t => {
                        const d = Math.sqrt((clickX - t.x) ** 2 + (clickY - t.y) ** 2);
                        if (d < bestDist) { bestDist = d; bestTarget = t; }
                      });

                      const sx = e.clientX, sy = e.clientY;
                      const startX = bestTarget.x, startY = bestTarget.y;

                      const onMove = (ev: MouseEvent) => {
                        const dx = ((ev.clientX - sx) / rect.width) * 100;
                        const dy = ((ev.clientY - sy) / rect.height) * 100;
                        const nx = Math.round(Math.max(2, Math.min(98, startX + dx)));
                        const ny = Math.round(Math.max(2, Math.min(98, startY + dy)));
                        if (bestTarget.id === 'title') updateSlide(editingIdx, { titlePosition: { x: nx, y: ny } });
                        else if (bestTarget.id === 'subtitle') updateSlide(editingIdx, { subtitlePosition: { x: nx, y: ny } });
                        else if (bestTarget.id === 'hospital') updateSlide(editingIdx, { hospitalNamePosition: { x: nx, y: ny } });
                        else if (bestTarget.id.startsWith('deco:')) {
                          const did = bestTarget.id.split(':')[1];
                          updateSlide(editingIdx, { decorations: (eSlide.decorations || []).map(d => d.id === did ? { ...d, position: { top: `${ny}%`, left: `${nx}%` } } : d) });
                        }
                      };
                      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                      document.addEventListener('mousemove', onMove);
                      document.addEventListener('mouseup', onUp);
                    }}
                  />
                </div>
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
