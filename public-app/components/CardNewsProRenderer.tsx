'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { SlideData, CardNewsTheme, SlideLayoutType, DesignPresetStyle, SlideCustomElement } from '../lib/cardNewsLayouts';
import { LAYOUT_LABELS, CARD_FONTS, FONT_CATEGORIES, generateSlideId } from '../lib/cardNewsLayouts';
import { buildLayoutDefaults, fillLayoutContent, generateSlideImage, suggestSlideText, suggestImagePrompt, enrichSlide, suggestComparison } from '../lib/cardAiActions';
import type { CardTemplate } from '../lib/cardTemplateService';
import { ensureGoogleFontLoaded, resolveSlideFontFamily } from '../lib/cardStyleUtils';
import { captureAllSlidesAsBlobs, downloadKonvaStageAsPng, downloadKonvaStageAsJpg, downloadKonvaStagesAsZip, downloadKonvaStagesAsPdf } from '../lib/cardDownloadUtils';
import type Konva from 'konva';
import { saveVideoToStorage, generateVideoFileName } from '../lib/videoStorage';
import { savePost } from '../lib/postStorage';
import { validateSlideMedicalAd } from '../lib/medicalAdValidation';
import {
  saveFont as saveFontToDb,
  loadFont as loadFontFromDb,
  setActiveFontName,
  getActiveFontName,
  migrateLegacyLocalStorageFont,
} from '../lib/fontStorage';
import SlideEditor from './card-news/SlideEditor';
import { useSlideRenderer } from './card-news/SlideRenderers';
import VideoPlayer from './video-edit/VideoPlayer';

const KonvaSlideEditor = dynamic(() => import('./card-news/KonvaSlideEditor'), { ssr: false });

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

/** 레이아웃에 필요한 콘텐츠 데이터가 이미 있는지 확인 — AI 자동 채우기 스킵용 */
function checkHasLayoutData(slide: SlideData, layout: SlideLayoutType): boolean {
  const startsWith = (s: string | undefined, ...prefixes: string[]) =>
    !!s && prefixes.some(p => s.trim().startsWith(p));
  switch (layout) {
    case 'checklist':
      return !!(slide.checkItems?.length && slide.checkItems.some(i => i && !startsWith(i, '항목')));
    case 'icon-grid':
      return !!(slide.icons?.length && slide.icons.some(i => i.title && !startsWith(i.title, '항목')));
    case 'steps':
      return !!(slide.steps?.length && slide.steps.some(s => s.label && !startsWith(s.label, '단계') && !s.label.endsWith('단계')));
    case 'comparison':
      return !!(slide.columns?.length && slide.columns.some(c => c.items?.some(i => i && i !== '-')));
    case 'data-highlight':
      return !!(slide.dataPoints?.length && slide.dataPoints.some(d => d.value && d.value !== '00%' && d.value !== '00'));
    case 'qna':
      return !!(slide.questions?.length && slide.questions.some(q => q.q && !startsWith(q.q, '질문')));
    case 'timeline':
      return !!(slide.timelineItems?.length && slide.timelineItems.some(t => t.title && !startsWith(t.title, '항목')));
    case 'quote':
      return !!(slide.quoteText && !startsWith(slide.quoteText, '여기에 인용문'));
    case 'before-after':
      return !!(slide.beforeItems?.length && slide.beforeItems.some(i => i && !startsWith(i, '항목')));
    case 'pros-cons':
      return !!(slide.pros?.length && slide.pros.some(i => i && !startsWith(i, '장점')));
    case 'price-table':
      return !!(slide.priceItems?.length && slide.priceItems.some(p => p.name && !startsWith(p.name, '시술')));
    case 'numbered-list':
      return !!(slide.numberedItems?.length && slide.numberedItems.some(n => n.title && !startsWith(n.title, '항목')));
    case 'warning':
      return !!(slide.warningItems?.length && slide.warningItems.some(i => i && !startsWith(i, '주의사항')));
    case 'info':
    case 'closing':
      return !!(slide.body && !startsWith(slide.body, '내용을 입력'));
    case 'cover':
      return !!(slide.title && slide.title.trim().length > 0);
    default:
      return false;
  }
}

export default function CardNewsProRenderer({ slides, theme, onSlidesChange, onThemeChange, learnedTemplate, cardRatio = '1:1', presetStyle }: Props) {
  // shorthand — 학습 템플릿이 있을 때 상세 토큰으로 렌더 오버라이드
  const lt = learnedTemplate || null;
  // slide.id 기반 Map — 드래그 reorder 후에도 정확한 DOM 참조 유지
  // (이전엔 배열 인덱스 기반이라 reorder 후 잘못된 카드를 캡처하는 버그 있었음)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Konva Stage refs — PNG/JPG/ZIP/PDF 다운로드에 사용
  const konvaStageRefs = useRef<Map<string, Konva.Stage>>(new Map());

  /** slides 순서대로 DOM element 배열을 반환 — 다운로드 lib 함수에 그대로 넘기기 위함 */
  const getOrderedCardElements = (): (HTMLDivElement | null)[] =>
    slides.map(s => cardRefs.current.get(s.id) ?? null);
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAddSlide, setShowAddSlide] = useState(false);

  // ── 슬라이드쇼 ──
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowIdx, setSlideshowIdx] = useState(0);
  const [slideshowViewport, setSlideshowViewport] = useState({ w: 0, h: 0 });
  const SLIDESHOW_INTERVAL_MS = 4000;

  // ── 글로벌 AI 채팅 (전체 슬라이드 맥락 공유) ──
  interface ChatMessage { role: 'user' | 'assistant'; text: string; }
  const [globalChatOpen, setGlobalChatOpen] = useState(false);
  const [globalChatMessages, setGlobalChatMessages] = useState<ChatMessage[]>([]);
  const [globalChatInput, setGlobalChatInput] = useState('');
  const [globalChatLoading, setGlobalChatLoading] = useState(false);
  // 동기 플래그 — globalChatLoading(setState)가 비동기라 Enter 연타 시점
  // 첫 요청이 async 진입 전 두 번째가 들어올 수 있는 걸 막는다
  const globalChatSendingRef = useRef(false);

  const handleGlobalChatSend = async () => {
    const userMsg = globalChatInput.trim();
    if (!userMsg || globalChatLoading) return;
    if (globalChatSendingRef.current) return;
    globalChatSendingRef.current = true;
    setGlobalChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setGlobalChatInput('');
    setGlobalChatLoading(true);
    try {
      // 전체 슬라이드 요약을 시스템 프롬프트에 포함 (이미지 dataUrl은 제외)
      const slidesContext = slides.map((s, i) =>
        `[${i + 1}번] layout: ${s.layout} | 제목: "${s.title || ''}" | 부제: "${s.subtitle || ''}"${s.body ? ` | 본문: "${s.body.slice(0, 100)}"` : ''}`
      ).join('\n');
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg,
          systemInstruction:
            `당신은 카드뉴스 편집 어시스턴트입니다. 사용자가 편집 중인 카드뉴스 전체 구성:\n` +
            `${slidesContext}\n\n` +
            `사용자 요청에 대한 답변 규칙:\n` +
            `- 한국어로 간결하게 (3~5문장)\n` +
            `- 구체적인 수정안이 필요하면 "N번 카드를 XX로 바꾸면 좋아요" 식으로 안내\n` +
            `- 자동 수정은 하지 않음 (사용자가 직접 개별 카드 편집기에서 적용)\n` +
            `- 의료광고법 준수: 최상급/단정/행동유도 표현 금지 ("100%", "완벽", "최초", "1위" 등)`,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.7,
          maxOutputTokens: 1024,
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setGlobalChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${data.error || '응답을 받지 못했습니다.'}` }]);
      } else {
        setGlobalChatMessages(prev => [...prev, { role: 'assistant', text: data.text! }]);
      }
    } catch (err) {
      setGlobalChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ 네트워크 오류: ${err instanceof Error ? err.message : '알 수 없음'}` }]);
    } finally {
      setGlobalChatLoading(false);
      globalChatSendingRef.current = false;
    }
  };

  useEffect(() => {
    if (!slideshowActive || slides.length === 0) return;
    const timer = setInterval(() => {
      setSlideshowIdx(prev => (prev + 1) % slides.length);
    }, SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slideshowActive, slides.length]);

  useEffect(() => {
    if (!slideshowActive) return;
    const update = () => setSlideshowViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [slideshowActive]);

  // Escape 키로 슬라이드쇼 종료
  useEffect(() => {
    if (!slideshowActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSlideshowActive(false);
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setSlideshowIdx(prev => (prev + 1) % slides.length);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSlideshowIdx(prev => (prev - 1 + slides.length) % slides.length);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slideshowActive, slides.length]);

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

  // 결과 blob URL은 컴포넌트 unmount 시 정리 — ref로 최신값 추적
  // (이전엔 empty deps 클로저가 초기값 null을 잡아서 unmount 시 실제 URL이 누락됐음)
  const shortsResultUrlRef = useRef<string | null>(null);
  useEffect(() => { shortsResultUrlRef.current = shortsResultUrl; }, [shortsResultUrl]);
  useEffect(() => {
    return () => {
      if (shortsResultUrlRef.current) {
        try { URL.revokeObjectURL(shortsResultUrlRef.current); } catch { /* */ }
      }
    };
  }, []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
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

  // ── Undo/Redo 히스토리 — 슬라이드 + 테마 동시 스냅샷 ──
  interface UndoEntry { slides: SlideData[]; theme: CardNewsTheme; }
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const MAX_UNDO = 30;
  // UI 강제 리렌더용 — 버튼 활성/비활성 반영
  const [historyVersion, setHistoryVersion] = useState(0);

  const snapshot = (): UndoEntry => ({
    slides: JSON.parse(JSON.stringify(slides)),
    theme: JSON.parse(JSON.stringify(theme)),
  });

  const pushAndChange = (newSlides: SlideData[]) => {
    undoStackRef.current.push(snapshot());
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = []; // 새 변경 → redo 스택 무효
    setHistoryVersion(v => v + 1);
    onSlidesChange(newSlides);
  };

  const pushThemeChange = (newTheme: CardNewsTheme) => {
    undoStackRef.current.push(snapshot());
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
    onThemeChange(newTheme);
  };

  const undo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(snapshot());
    if (redoStackRef.current.length > MAX_UNDO) redoStackRef.current.shift();
    onSlidesChange(prev.slides);
    onThemeChange(prev.theme);
    setHistoryVersion(v => v + 1);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(snapshot());
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    onSlidesChange(next.slides);
    onThemeChange(next.theme);
    setHistoryVersion(v => v + 1);
  };

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  void historyVersion; // 리렌더 트리거용

  // ── 수동 저장 (DB에 generated_posts로) ──
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const plainText = slides.map(s => `${s.title || ''}\n${s.subtitle || ''}\n${s.body || ''}`.trim()).join('\n\n');
      await savePost({
        postType: 'card_news',
        title: slides[0]?.title || '카드뉴스',
        content: JSON.stringify({ slides, theme, cardRatio }),
        topic: plainText.slice(0, 200),
        hospitalName: theme.hospitalName || undefined,
      });
      setLastSavedAt(new Date());
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] 저장 실패', err);
      alert(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
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
      // Ctrl+Shift+Z 또는 Ctrl+Y: Redo
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      // Ctrl+S: 저장
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
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
  // 1) 기존 localStorage 기반 폰트가 있으면 IndexedDB로 마이그레이션
  // 2) IndexedDB에서 활성 폰트 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        // 레거시 localStorage 폰트를 IndexedDB로 이관 (1회 실행, 성공 시 localStorage 해방)
        const migrated = await migrateLegacyLocalStorageFont();
        if (cancelled) return;
        const activeName = migrated?.name || getActiveFontName();
        if (!activeName) return;
        const stored = migrated || await loadFontFromDb(activeName);
        if (!stored || cancelled) return;

        const fontFace = new FontFace(stored.name, stored.data);
        const face = await fontFace.load();
        if (cancelled) return;
        (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
        setCustomFontName(stored.name);
        setCustomFontDisplayName(stored.displayName);
        setFontLoaded(v => v + 1);
      } catch { /* 복원 실패 무시 */ }
    })();
    return () => { cancelled = true; };
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
      pushThemeChange({ ...theme, fontId: 'custom' });
      setFontLoaded(v => v + 1);

      // IndexedDB에 저장 — localStorage 5MB 쿼터와 분리되어 드래프트와 충돌 없음
      try {
        // FontFace가 arrayBuffer를 내부에서 소비할 수 있어서 파일에서 새로 읽음
        const buf = await file.arrayBuffer();
        await saveFontToDb(fontName, rawName, buf);
        setActiveFontName(fontName);
      } catch (err) {
        console.warn('[CARD_NEWS_PRO] 커스텀 폰트 영구 저장 실패 (세션에만 유지)', err);
      }
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

  /** 슬라이드 복제 — 복제본은 새 id 부여 (원본과 공유 금지) */
  const duplicateSlide = (idx: number) => {
    const clone: SlideData = JSON.parse(JSON.stringify(slides[idx]));
    clone.id = generateSlideId();
    const newSlides = [...slides];
    newSlides.splice(idx + 1, 0, clone);
    pushAndChange(newSlides.map((s, i) => ({ ...s, index: i + 1 })));
  };

  /** 빈 슬라이드 추가 */
  const addSlide = (layout: SlideLayoutType) => {
    const newSlide: SlideData = {
      id: generateSlideId(),
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

  /** 슬라이드 순서 이동 (드래그앤드롭 + 모바일 ↑↓ 버튼 공통 사용) */
  const moveSlide = (from: number, to: number) => {
    if (from === to) return;
    if (to < 0 || to >= slides.length) return;
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
        if (from < editingIdx) newIdx--;
        if (to <= newIdx) newIdx++;
        setEditingIdx(newIdx);
      }
    }
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
    moveSlide(dragIdx, idx);
    setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ── 레이아웃 변경 + AI 자동 채우기 (선택적) ──
  const handleLayoutChange = async (idx: number, newLayout: SlideLayoutType) => {
    const curr = slides[idx];
    if (!curr) return;

    // 같은 레이아웃이면 아무것도 안 함 (AI 호출 방지)
    if (curr.layout === newLayout) return;

    const withDefaults = buildLayoutDefaults(curr, newLayout);
    pushAndChange(slides.map((s, i) => (i === idx ? withDefaults : s)));

    if (editingIdx !== null) return;

    // 레이아웃에 필요한 데이터가 이미 있으면 AI 자동 채우기 스킵
    if (checkHasLayoutData(withDefaults, newLayout)) return;

    const patch = await fillLayoutContent(withDefaults, slides);
    if (!patch) return;

    // ── 사용자 편집 필드 전부 보존 ──
    const isPlaceholder = (t?: string) =>
      !t || /^(항목|설명|내용을 입력|질문을 입력|답변|시술|주의사항|텍스트를 입력|제목을 입력|부제를 입력|단계)/.test(t.trim());

    if (curr.title && !isPlaceholder(curr.title)) delete (patch as Record<string, unknown>).title;
    if (curr.subtitle && !isPlaceholder(curr.subtitle)) delete (patch as Record<string, unknown>).subtitle;
    if (curr.body && !isPlaceholder(curr.body)) delete (patch as Record<string, unknown>).body;

    // 기존 값이 있는 필드는 전부 보존 (위치/크기/스타일/이미지/배경/커스텀 등)
    const preserve: string[] = [
      // 위치/크기
      'titlePosition', 'subtitlePosition', 'hospitalNamePosition',
      'titleSize', 'subtitleSize', 'bodySize', 'imageSize',
      'elementPositions', 'elementSizes',
      // 스타일
      'titleColor', 'titleFontId', 'titleFontSize', 'titleFontWeight',
      'titleLetterSpacing', 'titleLineHeight', 'titleAlign',
      'subtitleColor', 'subtitleFontId', 'subtitleFontSize',
      'subtitleFontWeight', 'subtitleLetterSpacing', 'subtitleLineHeight',
      'bodyColor',
      // 커스텀 요소
      'customElements',
      // 이미지
      'imageUrl', 'imagePosition', 'imageFocalPoint', 'visualKeyword',
      // 배경/디자인
      'bgColor', 'bgGradient', 'coverTemplateId',
      'hashtags', 'decorations', 'badge',
      // 폰트
      'fontId',
    ];
    preserve.forEach(k => {
      if ((curr as unknown as Record<string, unknown>)[k] !== undefined) {
        delete (patch as Record<string, unknown>)[k];
      }
    });

    if (Object.keys(patch).length > 0) updateSlide(idx, patch);
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

  /** 슬라이드 순서대로 Konva Stage 배열 반환 */
  const getOrderedKonvaStages = (): (Konva.Stage | null)[] =>
    slides.map(s => konvaStageRefs.current.get(s.id) ?? null);

  const downloadCard = async (index: number) => {
    setDownloading(true);
    try {
      const stage = konvaStageRefs.current.get(slides[index]?.id) ?? null;
      downloadKonvaStageAsPng(stage, index);
    } finally {
      setDownloading(false);
    }
  };

  const downloadAll = async () => {
    setShowDownloadMenu(false);
    setDownloading(true);
    try {
      await downloadKonvaStagesAsZip(getOrderedKonvaStages(), slides[0]?.title);
    } finally {
      setDownloading(false);
    }
  };

  const downloadAllPdf = async () => {
    setShowDownloadMenu(false);
    setDownloading(true);
    try {
      await downloadKonvaStagesAsPdf(getOrderedKonvaStages(), cardWidth, cardHeight, slides[0]?.title);
    } catch (err) {
      console.warn('[CARD_NEWS_PRO] PDF 변환 실패', err);
    } finally {
      setDownloading(false);
    }
  };

  // 외부 클릭 시 다운로드 드롭다운 닫기
  useEffect(() => {
    if (!showDownloadMenu) return;
    const handler = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDownloadMenu]);

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
      // 1) 슬라이드 → PNG Blob 배열 (slides 순서대로)
      const imageBlobs = await captureAllSlidesAsBlobs(
        getOrderedCardElements(),
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

      // 5) 백그라운드로 클라우드 저장 — 실패해도 결과 표시는 그대로
      // (게스트/Supabase 미설정 시 null 반환, 사용자에겐 영향 없음)
      saveVideoToStorage(blob, {
        fileName: generateVideoFileName('card_to_shorts', slides[0]?.title),
        type: 'card_to_shorts',
        duration: meta?.duration || 0,
        metadata: {
          slides: slides.length,
          transition: shortsOpts.transition,
          bgm_mood: shortsOpts.bgmEnabled ? shortsOpts.bgmMood : null,
          bgm_volume: shortsOpts.bgmEnabled ? shortsOpts.bgmVolume : 0,
          slide_duration_mode: shortsOpts.durationMode,
        },
      }).catch(() => {});
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

  // 전체 슬라이드 의료광고법 위반 요약 — Day 5: validateSlideMedicalAd로 전 필드 집계
  // (이전엔 title/subtitle/body만 봐서 imagePrompt/columns/questions 등 사각지대가 있었음)
  const totalViolations = useMemo(() => {
    let high = 0;
    let medium = 0;
    for (const slide of slides) {
      const fieldResults = validateSlideMedicalAd(slide);
      for (const fv of fieldResults) {
        for (const v of fv.violations) {
          if (v.severity === 'high') high++;
          else medium++;
        }
      }
    }
    return { high, medium };
  }, [slides]);

  return (
    <div className="space-y-4 pb-24">
      {/* 히스토리/저장 툴바 — 우측 상단 고정 (편집 모달 열려 있을 땐 숨김: 모달 상단에 중복됨) */}
      {editingIdx === null && (
      <div className="fixed top-4 right-4 z-40 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-slate-200 px-2 py-1.5">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="이전 (Ctrl+Z)"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-lg">↶</span>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title="다시 (Ctrl+Shift+Z)"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-lg">↷</span>
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          title="저장 (Ctrl+S)"
          className="px-3 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 text-xs font-bold transition-colors"
        >
          <span>{saving ? '저장 중...' : '💾 저장'}</span>
        </button>
        {lastSavedAt && !saving && (
          <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
            {lastSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨
          </span>
        )}
      </div>
      )}
      {/* 의료광고법 위반 요약 — 한 건이라도 있으면 상단에 고정 노출 */}
      {(totalViolations.high > 0 || totalViolations.medium > 0) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm">
          <span className="text-base" aria-hidden="true">🛡</span>
          <span className="font-bold text-slate-700">의료광고법 검토</span>
          {totalViolations.high > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
              ⛔ 위반 {totalViolations.high}건
            </span>
          )}
          {totalViolations.medium > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              ⚠️ 주의 {totalViolations.medium}건
            </span>
          )}
          <span className="text-xs text-slate-500 hidden sm:inline">
            각 카드 편집창에서 [교체] 버튼으로 수정할 수 있어요
          </span>
        </div>
      )}

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
                pushThemeChange({ ...theme, fontId: newFontId });
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
                    pushThemeChange({ ...theme, ...colors });
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
            type="button"
            onClick={() => { setSlideshowIdx(0); setSlideshowActive(true); }}
            disabled={slides.length === 0}
            className="px-3 py-1.5 bg-violet-100 text-violet-700 text-xs font-bold rounded-lg hover:bg-violet-200 transition-colors disabled:opacity-50"
            title="4초 간격 자동 넘김 · ← → 방향키 · Esc 종료"
          >
            ▶ 슬라이드쇼
          </button>
          <div className="relative" ref={downloadMenuRef}>
            <button
              type="button"
              onClick={() => setShowDownloadMenu(v => !v)}
              disabled={downloading}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
            >
              {downloading ? '⏳ 다운로드 중...' : '📦 다운로드'}
              {!downloading && <span className="text-[9px]">▾</span>}
            </button>
            {showDownloadMenu && !downloading && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 w-52 overflow-hidden">
                <button
                  type="button"
                  onClick={downloadAll}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  📦 전체 PNG (ZIP)
                </button>
                <button
                  type="button"
                  onClick={downloadAllPdf}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  📄 전체 PDF
                </button>
                <div className="my-1 border-t border-slate-100" />
                <p className="px-4 py-1 text-[10px] text-slate-400">개별 카드는 각 카드의 💾 아이콘</p>
                <p className="px-4 pb-1 text-[10px] text-slate-400">(PNG/JPG 선택 가능)</p>
              </div>
            )}
          </div>
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
            <div key={`${slide.id}-${theme.fontId || 'default'}-${slide.fontId || ''}-${fontLoaded}`}
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
                {/* 라벨 (드래그 핸들) + 모바일 ↑↓ 순서 변경 */}
                <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
                  <div
                    className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm cursor-grab active:cursor-grabbing"
                    draggable={!isEditing}
                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(idx); }}
                    onDragEnd={handleDragEnd}
                    title="드래그하여 순서 변경"
                  >
                    ⠿ {idx + 1} · {LAYOUT_LABELS[slide.layout]}
                  </div>
                  <button
                    type="button"
                    onClick={() => moveSlide(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-5 h-5 flex items-center justify-center bg-black/60 text-white rounded-full text-[8px] font-bold disabled:opacity-30 hover:bg-black/80 lg:hidden"
                    title="위로 이동"
                    aria-label="위로 이동"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(idx, idx + 1)}
                    disabled={idx === slides.length - 1}
                    className="w-5 h-5 flex items-center justify-center bg-black/60 text-white rounded-full text-[8px] font-bold disabled:opacity-30 hover:bg-black/80 lg:hidden"
                    title="아래로 이동"
                    aria-label="아래로 이동"
                  >
                    ▼
                  </button>
                </div>
                {/* 버튼 그룹 — PNG/JPG + 복제 + 삭제 */}
                <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => downloadCard(idx)}
                    className="px-2 py-1 bg-white/90 hover:bg-white rounded-lg text-[10px] font-bold text-slate-700 shadow-sm"
                    title="PNG 저장 (고화질, 투명도 지원)">
                    💾 PNG
                  </button>
                  <button type="button" onClick={() => downloadKonvaStageAsJpg(konvaStageRefs.current.get(slide.id) ?? null, idx)}
                    className="px-2 py-1 bg-white/90 hover:bg-white rounded-lg text-[10px] font-bold text-slate-700 shadow-sm"
                    title="JPG 저장 (용량 작음 — 카톡/SNS 공유에 유리)">
                    📷 JPG
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
                {/* Konva readOnly 프리뷰 */}
                <KonvaSlideEditor
                  slide={slide}
                  theme={theme}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  maxWidth={boxRefs.current[idx]?.clientWidth || 250}
                  onSlideChange={(patch) => updateSlide(idx, patch)}
                  readOnly={true}
                  onStageReady={(stage) => {
                    if (stage) konvaStageRefs.current.set(slide.id, stage);
                    else konvaStageRefs.current.delete(slide.id);
                  }}
                />
                {/* 다운로드 캡처용 (화면에 안 보임) */}
                <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                  <div
                    ref={(el) => {
                      if (el) cardRefs.current.set(slide.id, el);
                      else cardRefs.current.delete(slide.id);
                    }}
                    key={`card-capture-${slide.id}-${fontLoaded}-${theme.fontId || ''}-${slide.fontId || ''}`}
                    style={{ width: `${cardWidth}px`, height: `${cardHeight}px` }}
                  >
                    {renderSlide(slide)}
                  </div>
                </div>
                {/* 이미지 실패 오버레이 — 이미지가 기대되는 슬라이드(imagePosition 설정됨)인데 URL이 없을 때 */}
                {!slide.imageUrl && slide.imagePosition && (
                  <div className="absolute inset-0 border-2 border-dashed border-red-300 rounded-t-xl flex items-center justify-center bg-red-50/70 backdrop-blur-[1px] z-30">
                    <div className="text-center px-4">
                      <span className="text-2xl" aria-hidden="true">🖼️</span>
                      <p className="text-xs text-red-500 font-bold mt-1">이미지 생성 실패</p>
                      <button
                        type="button"
                        onClick={() => handleGenerateSlideImage(idx)}
                        disabled={generatingImageIdx === idx}
                        className="mt-2 text-[10px] px-3 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-60 font-bold"
                      >
                        {generatingImageIdx === idx ? '생성 중...' : '🔄 다시 생성'}
                      </button>
                    </div>
                  </div>
                )}
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
                    data-testid="editor-prev-slide"
                    className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30 flex items-center justify-center text-sm">‹</button>
                  <span className="text-sm text-slate-500">{editingIdx + 1} / {slides.length}</span>
                  <button type="button" onClick={() => setEditingIdx(Math.min(slides.length - 1, editingIdx + 1))} disabled={editingIdx === slides.length - 1}
                    data-testid="editor-next-slide"
                    className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30 flex items-center justify-center text-sm">›</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={undo} disabled={!canUndo}
                  title="이전 (Ctrl+Z)"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <span className="text-lg">↶</span>
                </button>
                <button type="button" onClick={redo} disabled={!canRedo}
                  title="다시 (Ctrl+Shift+Z)"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <span className="text-lg">↷</span>
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button type="button" onClick={handleSave} disabled={saving}
                  title="저장 (Ctrl+S)"
                  className="px-3 h-9 flex items-center gap-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 text-xs font-bold transition-colors">
                  <span>{saving ? '저장 중...' : '💾 저장'}</span>
                </button>
                {lastSavedAt && !saving && (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {lastSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨
                  </span>
                )}
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button type="button" onClick={() => setEditingIdx(null)}
                  data-testid="editor-close"
                  className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">✓ 완료</button>
              </div>
            </div>
            {/* 좌(프리뷰) + 우(편집) */}
            <div className="flex-1 flex overflow-hidden">
              {/* 좌: 카드 프리뷰 */}
              <div className="flex-[3] bg-slate-100 flex items-center justify-center p-6 overflow-auto">
                <KonvaSlideEditor
                  slide={eSlide}
                  theme={theme}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  maxWidth={650}
                  onSlideChange={(patch) => updateSlide(editingIdx, patch)}
                />
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
                  onCustomElementChange={(elId, patch) => {
                    const els = slides[editingIdx].customElements || [];
                    updateSlide(editingIdx, { customElements: els.map(el => el.id === elId ? { ...el, ...patch } : el) });
                  }}
                  onCustomElementDelete={(elId) => {
                    const els = slides[editingIdx].customElements || [];
                    updateSlide(editingIdx, { customElements: els.filter(el => el.id !== elId) });
                  }}
                  onAddCustomElement={(type) => {
                    const existing = slides[editingIdx].customElements || [];
                    const newEl: SlideCustomElement = {
                      id: crypto.randomUUID(),
                      type,
                      x: 50, y: 50,
                      w: type === 'text' ? 40 : 30,
                      h: type === 'text' ? 10 : 20,
                      ...(type === 'text' ? { text: '텍스트를 입력하세요', fontSize: 24, fontWeight: '500', color: '#333333' } : {}),
                    };
                    updateSlide(editingIdx, { customElements: [...existing, newEl] });
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 슬라이드쇼 풀스크린 오버레이 ── */}
      {slideshowActive && slides.length > 0 && (() => {
        const current = slides[slideshowIdx] ?? slides[0];
        const scale = slideshowViewport.w > 0
          ? Math.min(slideshowViewport.w * 0.85 / cardWidth, slideshowViewport.h * 0.75 / cardHeight)
          : 0.5;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center"
            onClick={() => setSlideshowActive(false)}
          >
            {/* 닫기 버튼 */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSlideshowActive(false); }}
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full text-lg font-bold z-10"
              title="닫기 (Esc)"
            >
              ✕
            </button>
            {/* 좌우 수동 넘김 */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSlideshowIdx(prev => (prev - 1 + slides.length) % slides.length); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full text-lg font-bold z-10"
              title="이전 (←)"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSlideshowIdx(prev => (prev + 1) % slides.length); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full text-lg font-bold z-10"
              title="다음 (→, Space)"
            >
              ›
            </button>

            {/* 현재 슬라이드 (중앙, 뷰포트에 맞춰 자동 스케일) */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: `${cardWidth}px`,
                height: `${cardHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                flexShrink: 0,
              }}
            >
              {renderSlide(current)}
            </div>

            {/* 하단: 진행 점 + 현재/전체 */}
            <div
              className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSlideshowIdx(i)}
                    className={`transition-all rounded-full ${
                      i === slideshowIdx ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                    }`}
                    aria-label={`${i + 1}번 슬라이드`}
                  />
                ))}
              </div>
              <p className="text-white/60 text-[11px]">
                {slideshowIdx + 1} / {slides.length} · ← → 방향키 · 아무 곳이나 클릭하면 닫힙니다
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── 글로벌 AI 채팅 바 (전체 슬라이드 맥락 공유) ── */}
      {slides.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-lg">
          <div className="max-w-5xl mx-auto px-4 py-2">
            {globalChatOpen && globalChatMessages.length > 0 && (
              <div className="max-h-48 overflow-y-auto mb-2 space-y-1.5 pr-1">
                {globalChatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-xs px-3 py-2 rounded-lg whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-blue-50 text-blue-700 ml-12 border border-blue-100'
                        : 'bg-slate-50 text-slate-700 mr-12 border border-slate-100'
                    }`}
                  >
                    {m.text}
                  </div>
                ))}
                {globalChatLoading && (
                  <div className="text-xs px-3 py-2 rounded-lg bg-slate-50 text-slate-500 mr-12 border border-slate-100 animate-pulse">
                    생각 중...
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setGlobalChatOpen(v => !v)}
                className={`px-3 py-2 text-sm rounded-lg font-bold transition-colors ${
                  globalChatOpen
                    ? 'bg-violet-600 text-white hover:bg-violet-700'
                    : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                }`}
                title={globalChatOpen ? '채팅 접기' : '채팅 열기'}
                aria-expanded={globalChatOpen}
              >
                🤖 {globalChatMessages.length > 0 && `(${globalChatMessages.length})`}
              </button>
              <input
                type="text"
                value={globalChatInput}
                onChange={(e) => setGlobalChatInput(e.target.value)}
                onFocus={() => setGlobalChatOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGlobalChatSend(); } }}
                placeholder="전체 카드뉴스에 대해 질문해 보세요 (예: 3번 톤을 1번이랑 맞춰줘)"
                className="flex-1 px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                disabled={globalChatLoading}
              />
              <button
                type="button"
                onClick={handleGlobalChatSend}
                disabled={globalChatLoading || !globalChatInput.trim()}
                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-violet-700 transition-colors"
              >
                {globalChatLoading ? '...' : '전송'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
