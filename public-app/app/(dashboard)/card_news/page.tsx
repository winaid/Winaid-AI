'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CATEGORIES } from '../../../lib/constants';
import { buildCardNewsPrompt, buildCardNewsProPrompt, type CardNewsRequest } from '../../../lib/cardNewsPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe, supabase, getSupabaseClient, isSupabaseConfigured } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { CARD_NEWS_DESIGN_TEMPLATES } from '../../../lib/cardNewsDesignTemplates';
import { ErrorPanel } from '../../../components/GenerationResult';
import { CardRegenModal, type CardPromptHistoryItem, CARD_PROMPT_HISTORY_KEY, CARD_REF_IMAGE_KEY } from '../../../components/CardRegenModal';
import CardTemplateManager from '../../../components/CardTemplateManager';
import CardNewsRenderer from '../../../components/CardNewsRenderer';
import CardNewsProRenderer from '../../../components/CardNewsProRenderer';
import { DEFAULT_THEME, THEME_PRESETS, DESIGN_PRESETS, type DesignPreset, type DesignPresetStyle, parseProSlidesJson, type SlideData as ProSlideData, type CardNewsTheme } from '../../../lib/cardNewsLayouts';
import { getSavedTemplates, deleteTemplate, type CardTemplate } from '../../../lib/cardTemplateService';
import { ContentCategory } from '../../../lib/types';
import type { WritingStyle, CardNewsDesignTemplateId, TrendingItem, AudienceMode } from '../../../lib/types';
import { useCreditContext } from '../layout';
import { useCredit as cardNewsUseCredit } from '../../../lib/creditService';
import { consumeGuestCredit } from '../../../lib/guestCredits';

interface CardImageHistoryItem { url: string; prompt: string; createdAt: number; }

interface CardSlide {
  index: number;
  role: string;
  title: string;
  body: string;
  imagePrompt: string;
  imageUrl: string | null;
  imageHistory: CardImageHistoryItem[];
}

type ImageStyleType = 'photo' | 'illustration' | 'medical' | 'custom';

export default function CardNewsPage() {
  const creditCtx = useCreditContext();
  // ── 폼 상태 ──
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => { try { const sb = getSupabaseClient(); const { data: { user } } = await sb.auth.getUser(); if (user?.user_metadata?.name) setHospitalName(user.user_metadata.name); } catch {} })();
  }, []);
  const [slideCount, setSlideCount] = useState(0); // 0 = 자동
  const [proCardRatio, setProCardRatio] = useState<'1:1' | '3:4' | '4:5' | '9:16' | '16:9'>('1:1');
  const [designTemplateId, setDesignTemplateId] = useState<CardNewsDesignTemplateId | undefined>(undefined);
  // 이미지 스타일 UI는 상세설정과 함께 제거됨. 레거시 AI 이미지 플로우 참조용 고정값.
  const imageStyle: ImageStyleType = 'illustration';
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [contentMode, setContentMode] = useState<'simple' | 'detailed'>('simple');
  // 프로 레이아웃이 기본이자 유일한 모드 (AI 이미지 레거시 플로우는 남아있지만 UI에서는 도달 불가)
  const proMode = true as const;
  const [proSlides, setProSlides] = useState<ProSlideData[]>([]);
  const [proTheme, setProTheme] = useState<CardNewsTheme>({ ...DEFAULT_THEME });
  const [learnedTemplate, setLearnedTemplate] = useState<CardTemplate | null>(null);
  const [presetCategory, setPresetCategory] = useState<string>('all');
  const [currentPresetId, setCurrentPresetId] = useState<string>('');
  const [presetStyle, setPresetStyle] = useState<DesignPresetStyle | null>(null);
  // 학습한 디자인 템플릿이 선택되면 프로 모드 테마에도 자동 반영
  useEffect(() => {
    if (!learnedTemplate) return;
    setProTheme(prev => ({
      ...prev,
      backgroundColor: learnedTemplate.colors.background,
      backgroundGradient: learnedTemplate.colors.backgroundGradient || '',
      titleColor: learnedTemplate.colors.titleColor,
      subtitleColor: learnedTemplate.colors.subtitleColor,
      bodyColor: learnedTemplate.colors.bodyColor,
      accentColor: learnedTemplate.colors.accentColor,
      fontFamily: learnedTemplate.typography.fontFamily || prev.fontFamily,
    }));
  }, [learnedTemplate]);
  const [showStyleUpload, setShowStyleUpload] = useState(false);
  // 저장된 학습 템플릿 목록 (업로드 후 즉시 반영을 위해 trigger state로 재조회 트리거)
  const [savedStylesVersion, setSavedStylesVersion] = useState(0);
  const savedStyles = (() => { void savedStylesVersion; return getSavedTemplates(); })();
  // 커스텀 이미지 프롬프트 UI는 상세설정과 함께 제거됨. 레거시 플로우 참조용 고정값.
  const customImagePrompt = '';
  // 트렌드 주제
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);

  // ── 생성 상태 ──
  const [pageStep, setPageStep] = useState<1 | 2>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [cards, setCards] = useState<CardSlide[]>([]);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'scriptReview' | 'promptReview'>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [regeneratingCard, setRegeneratingCard] = useState<number | null>(null);
  const [rawScriptText, setRawScriptText] = useState('');
  // 카드 재생성 모달 state
  const [cardRegenModalOpen, setCardRegenModalOpen] = useState(false);
  const [cardRegenIndex, setCardRegenIndex] = useState(1);
  const [cardRegenProgress, setCardRegenProgress] = useState('');
  const [currentCardImage, setCurrentCardImage] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editMainTitle, setEditMainTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImagePrompt, setEditImagePrompt] = useState('');
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);
  const [cardRegenRefImage, setCardRegenRefImage] = useState('');
  const [refImageMode, setRefImageMode] = useState<'recolor' | 'copy'>('copy');
  const [isRefImageLocked, setIsRefImageLocked] = useState(false);
  const [promptHistory, setPromptHistory] = useState<CardPromptHistoryItem[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // ── 로고 오버레이: canvas로 이미지 위에 로고 합성 ──
  const overlayLogo = (baseImageDataUrl: string, logoSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(baseImageDataUrl); return; }
      const baseImg = new Image();
      baseImg.crossOrigin = 'anonymous';
      baseImg.onload = () => {
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        ctx.drawImage(baseImg, 0, 0);
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.onload = () => {
          const maxW = Math.min(baseImg.width * 0.15, 120);
          const scale = maxW / logoImg.width;
          const w = logoImg.width * scale;
          const h = logoImg.height * scale;
          const x = canvas.width - w - 20;
          const y = 20;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 8);
          ctx.fill();
          ctx.drawImage(logoImg, x, y, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        logoImg.onerror = () => resolve(baseImageDataUrl);
        logoImg.src = logoSrc;
      };
      baseImg.onerror = () => resolve(baseImageDataUrl);
      baseImg.src = baseImageDataUrl;
    });
  };

  // ── 이미지 생성 헬퍼 ──
  const generateCardImage = async (prompt: string, index: number, refImage?: string): Promise<string | null> => {
    try {
      const tmpl = designTemplateId ? CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId) : undefined;
      const needsTemplate = tmpl && !prompt.includes('[디자인 템플릿:');
      const templateBlock = needsTemplate ? `\n[디자인 템플릿: ${tmpl.name}]\n${tmpl.stylePrompt}\n배경색: ${tmpl.colors.background}` : '';
      // imageStyle은 'illustration'로 고정(상세 설정 제거). 커스텀 블록 없음.
      const customBlock = '';
      const fullPrompt = `${prompt}${templateBlock}${customBlock}`.trim();

      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          aspectRatio: '1:1',
          mode: 'card_news',
          imageStyle,
          referenceImage: refImage || undefined,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { imageDataUrl?: string };
      if (!data.imageDataUrl) return null;

      // 로고 오버레이
      let finalImageDataUrl = data.imageDataUrl;
      if (logoEnabled && logoDataUrl) {
        try { finalImageDataUrl = await overlayLogo(data.imageDataUrl, logoDataUrl); } catch { /* 원본 사용 */ }
      }

      // Supabase Storage 업로드
      if (supabase) {
        try {
          const dataUrl = finalImageDataUrl;
          const commaIdx = dataUrl.indexOf(',');
          const base64Data = dataUrl.substring(commaIdx + 1);
          const mimeType = dataUrl.substring(0, commaIdx).match(/data:(.*?);base64/)?.[1] || 'image/png';
          const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const byteChars = atob(base64Data);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteArray], { type: mimeType });
          const fileName = `card-news/${Date.now()}_${index}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from('blog-images').upload(fileName, blob, { contentType: mimeType, upsert: false });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(fileName);
            if (urlData?.publicUrl) return urlData.publicUrl;
          }
        } catch { /* fallback to base64 */ }
      }
      return finalImageDataUrl;
    } catch {
      return null;
    }
  };

  // ── Step 1: 원고 생성 ──
  /** 커버/마무리 슬라이드에 Pexels 배경 자동 적용 */
  const autoApplyBackgrounds = async (slides: ProSlideData[]): Promise<ProSlideData[]> => {
    const coverSlides = slides.filter(s => s.layout === 'cover' || s.layout === 'closing');
    if (coverSlides.length === 0) return slides;
    try {
      const kwMap: Record<string, string> = {
        '임플란트': 'dental implant clinic', '치아': 'dental care smile', '교정': 'orthodontics braces',
        '피부': 'skincare dermatology', '보톡스': 'beauty clinic', '정형': 'orthopedic clinic',
        '병원': 'modern hospital', '스케일링': 'dental hygiene',
      };
      let query = 'medical clinic professional';
      for (const [kr, en] of Object.entries(kwMap)) {
        if (topic.includes(kr)) { query = en; break; }
      }
      const res = await fetch(`/api/pexels?query=${encodeURIComponent(query)}&orientation=square&per_page=15&page=${Math.floor(Math.random() * 3) + 1}`);
      const data = await res.json();
      const photos = data.photos || [];
      if (photos.length > 0) {
        for (const cs of coverSlides) {
          const photo = photos[Math.floor(Math.random() * photos.length)];
          cs.imageUrl = photo.url;
          cs.imagePosition = 'background';
          if (!cs.coverTemplateId) cs.coverTemplateId = 'full-image-bottom';
        }
      }
    } catch { /* Pexels 실패 시 무시 */ }
    return slides;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;

    const derivedWritingStyle: WritingStyle = audienceMode === '전문가용(신뢰/정보)' ? 'expert' : 'empathy';
    const request: CardNewsRequest = {
      topic: topic.trim(),
      keywords: keywords.trim() || undefined,
      hospitalName: hospitalName || undefined,
      slideCount,
      writingStyle: derivedWritingStyle,
      designTemplateId,
      category,
      contentMode,
    };

    // 크레딧 체크 + 차감 (로그인 사용자는 Supabase, 게스트는 localStorage 3개)
    if (creditCtx.creditInfo) {
      if (creditCtx.creditInfo.credits <= 0) {
        setError(creditCtx.userId
          ? '크레딧이 모두 소진되었습니다.'
          : '무료 체험 크레딧이 모두 소진되었습니다. 로그인하면 더 많은 크레딧을 사용할 수 있어요.');
        return;
      }
      if (creditCtx.userId) {
        const creditResult = await cardNewsUseCredit(creditCtx.userId);
        if (!creditResult.success) {
          setError(creditResult.error === 'no_credits' ? '크레딧이 모두 소진되었습니다.' : '크레딧 차감에 실패했습니다.');
          return;
        }
        creditCtx.setCreditInfo({ credits: creditResult.remaining, totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 1 });
      } else {
        const next = consumeGuestCredit();
        if (!next) {
          setError('무료 체험 크레딧이 모두 소진되었습니다. 로그인하면 더 많은 크레딧을 사용할 수 있어요.');
          return;
        }
        creditCtx.setCreditInfo({ credits: next.credits, totalUsed: next.totalUsed });
      }
    }

    setIsGenerating(true);
    setError(null);
    setCards([]);
    setProSlides([]);
    setSaveStatus(null);
    setPipelineStep('idle');
    setProgress('프로 레이아웃 구성 중...');

    // ═══ Pro Mode: JSON 레이아웃 출력 → HTML/CSS 렌더링 ═══
    // ═══ Pro Mode: 항상 프로 레이아웃으로 생성 ═══
    try {
      const { systemInstruction: proSI, prompt: proPrompt } = buildCardNewsProPrompt(request);
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: proPrompt,
          systemInstruction: proSI,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 32768,
          googleSearch: true,
        }),
      });
      const data = await res.json() as { text?: string; error?: string; details?: string };
      if (!res.ok || !data.text) {
        setError(data.error || data.details || `서버 오류 (${res.status})`);
        return;
      }
      let slides: ProSlideData[];
      let parsedFontId: string | undefined;
      try {
        const parsed = parseProSlidesJson(data.text);
        if (parsed.slides.length === 0) {
          setError('프로 레이아웃 파싱 결과가 비어 있습니다. 다시 시도해주세요.');
          return;
        }
        slides = parsed.slides;
        parsedFontId = parsed.fontId;
      } catch (parseErr) {
        console.error('[CARD_NEWS_PRO] JSON parse failed', parseErr);
        setError('AI가 유효한 JSON을 반환하지 않았습니다. 다시 시도해주세요.');
        return;
      }

      // 기본 테마 + AI가 고른 폰트 + 병원명 반영
      setProTheme(prev => ({
        ...prev,
        hospitalName: hospitalName || undefined,
        fontId: parsedFontId || prev.fontId,
      }));

      // 텍스트 원고만 즉시 노출. 커버/마무리에는 Pexels 배경 자동 적용.
      const withBg = await autoApplyBackgrounds(slides);
      setProSlides(withBg);
      setPipelineStep('idle');
      setPageStep(2); // 생성 완료 → 편집 단계로 전환
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
    return;
  };

  // ═══ [LEGACY] AI 이미지 모드 handleSubmit — UI에서 접근 불가(도달 불능 경로).
  // 향후 재활용 대비 보존. 함수 자체는 미사용.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _legacyAiImageHandleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const derivedWritingStyle: WritingStyle = audienceMode === '전문가용(신뢰/정보)' ? 'expert' : 'empathy';
    const request: CardNewsRequest = {
      topic: topic.trim(),
      keywords: keywords.trim() || undefined,
      hospitalName: hospitalName || undefined,
      slideCount,
      writingStyle: derivedWritingStyle,
      designTemplateId,
      category,
      contentMode,
    };
    try {
      const { systemInstruction, prompt } = buildCardNewsPrompt(request);
      let finalPrompt = prompt;
      if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) finalPrompt += `\n\n[병원 말투 적용]\n${stylePrompt}`;
        } catch { /* ignore */ }
      }

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt, systemInstruction,
          model: 'gemini-3.1-pro-preview', temperature: 0.85, maxOutputTokens: 32768,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) { setError(data.error || `서버 오류 (${res.status})`); return; }

      // 파싱
      // 파싱: ### N장 구분 → 제목/본문/비주얼 추출 (원고+이미지프롬프트 통합)
      const parsedCards: CardSlide[] = [];
      const slideBlocks = data.text.split(/###\s*(\d+)장[:\s]*/);
      const tmpl = designTemplateId ? CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId) : undefined;
      const tmplBlock = tmpl ? `\n[디자인 템플릿: ${tmpl.name}]\n${tmpl.stylePrompt}\n배경색: ${tmpl.colors.background}` : '';

      for (let i = 1; i < slideBlocks.length; i += 2) {
        const num = parseInt(slideBlocks[i], 10);
        const block = slideBlocks[i + 1] || '';
        const roleMatch = block.match(/^(.+?)[\n\r]/);

        const titleMatch = block.match(/\*\*제목\*\*[:\s]*(.+)/m)
          || block.match(/\*\*메인.*?\*\*[:\s]*(.+)/m)
          || block.match(/\*\*핵심.*?\*\*[:\s]*(.+)/m)
          || block.match(/\*\*마무리.*?\*\*[:\s]*(.+)/m)
          || block.match(/\*\*타이틀\*\*[:\s]*(.+)/m)
          || block.match(/\*\*메시지\*\*[:\s]*(.+)/m);

        const bodyMatch = block.match(/\*\*본문\*\*[:\s]*([\s\S]*?)(?=\*\*비주얼|\*\*이미지|\*\*배경|\*\*|$)/m)
          || block.match(/\*\*부제\*\*[:\s]*(.+)/m)
          || block.match(/\*\*설명\*\*[:\s]*([\s\S]*?)(?=\*\*|$)/m)
          || block.match(/\*\*내용\*\*[:\s]*([\s\S]*?)(?=\*\*|$)/m)
          || block.match(/\*\*안내\*\*[:\s]*(.+)/m);

        const visualMatch = block.match(/\*\*비주얼\*\*[:\s]*(.+)/m)
          || block.match(/\*\*이미지\*\*[:\s]*(.+)/m)
          || block.match(/\*\*배경\*\*[:\s]*(.+)/m);

        const role = roleMatch?.[1]?.replace(/\*\*/g, '').trim() || `${num}장`;
        let title = titleMatch?.[1]?.trim();
        let body = bodyMatch?.[1]?.trim() || '';
        const visual = visualMatch?.[1]?.trim() || `${topic} 관련 의료 일러스트`;

        if (!title) {
          const lines = block.split('\n').map(l => l.replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim()).filter(Boolean);
          title = lines[1] || lines[0] || `슬라이드 ${num}`;
          body = lines.slice(2).join(' ').substring(0, 100) || body;
        }

        // 비주얼을 imagePrompt로 바로 조립 (Step 2 불필요!)
        const imagePrompt = [
          `subtitle: "${role}"`,
          `mainTitle: "${title}"`,
          body ? `description: "${body.substring(0, 50)}"` : '',
          `비주얼: ${visual}`,
          tmplBlock,
        ].filter(Boolean).join('\n');

        parsedCards.push({
          index: num,
          role,
          title: title || `슬라이드 ${num}`,
          body,
          imagePrompt,
          imageUrl: null,
          imageHistory: [],
        });
      }

      if (parsedCards.length === 0) {
        const fallbackCount = slideCount || 6;
        for (let i = 0; i < fallbackCount; i++) {
          const fallbackRole = i === 0 ? '표지' : i === fallbackCount - 1 ? '마���리 표지' : `���문 ${i}`;
          const fallbackTitle = i === 0 ? topic : i === fallbackCount - 1 ? '상담을 기다립니다' : `슬라이드 ${i + 1}`;
          parsedCards.push({ index: i + 1, role: fallbackRole, title: fallbackTitle, body: '', imagePrompt: '', imageUrl: null, imageHistory: [] });
        }
      }

      setCards(parsedCards);
      setRawScriptText(data.text);
      setPipelineStep('scriptReview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally { setIsGenerating(false); setProgress(''); }
  };

  // ── Step 2: 프롬프트 생성 (원고 승인 후) ──
  const handleGeneratePrompts = async () => {
    if (cards.length === 0 || isGeneratingPrompts) return;
    setIsGeneratingPrompts(true);
    setProgress('이미지 프롬프트 생성 중...');

    try {
      const tmpl = designTemplateId ? CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId) : undefined;
      const tmplMood = tmpl ? `\n분위기: ${tmpl.styleConfig.mood}. 컬러톤: ${tmpl.colors.background} 배경.` : '';

      const cardsInfo = cards.map(c =>
        `${c.index}장 [${c.role}]: 제목="${c.title}" / 본문="${c.body}"`
      ).join('\n');

      const hospitalNameInstruction = (() => {
        if (!hospitalName) return `⚠️ 어떤 슬라이드에도 병원명을 넣지 마세요. 가짜 병원명을 지어내지 마세요.`;
        // hospitalNameMode는 'first_last' 고정(상세 설정 제거). 다른 모드 브랜치 제거됨.
        return `⚠️ 1장과 마지막 장에만 "${hospitalName}" 표시. 중간 슬라이드 금지. 다른 병원명 절대 금지.`;
      })();

      const promptGenPrompt = `당신은 카드뉴스 이미지 프롬프트 전문가입니다.
아래 카드뉴스 원고를 보고, 각 슬라이드의 이미지 생성용 프롬프트를 작성해주세요.

[주제] ${topic}
${hospitalName ? `[병원명] ${hospitalName}` : ''}
${tmplMood}

${hospitalNameInstruction}

[원고]
${cardsInfo}

[🔒 레이아웃 고정 — 절대 규칙]
모든 카드가 아래 동일한 레이아웃 그리드를 사용:
- 상단 15%: subtitle 영역 (작은 텍스트, 부제)
- 중앙 40%: mainTitle 영역 (큰 볼드 텍스트, 제목)
- 하단 30%: visual 영역 (일러스트/아이콘)
- 최하단 15%: description 영역 (설명 텍스트)

규칙:
- 배경색, 그라데이션, 장식 요소는 모든 카드에서 완전 동일
- 일러스트 스타일 동일 (3D면 전부 3D)
- 텍스트 크기/색상/위치 동일 — 내용만 변경
- visual 필드에 동일한 스타일 키워드를 매 카드에 반복
- 표지와 마무리도 같은 그리드 사용. 예외 없음

[⚠️ 비주얼 일관성 — 가장 중요한 규칙]
모든 카드의 visual 필드에 반드시 동일한 스타일 키워드를 포함하세요:
- 동일한 배경색 (예: "연한 핑크 배경" → 모든 카드에 "연한 핑크 배경")
- 동일한 일러스트 스타일 (예: "3D 파스텔 일러스트" → 모든 카드에 "3D 파스텔 일러스트")
- 동일한 장식 요소 (예: "둥근 도형 장식" → 모든 카드에 "둥근 도형 장식")
- 달라지는 것은 오직 일러스트의 "주제"만 (예: 치아, 잇몸, 임플란트...)

[⚠️ 6장 디자인 완전 통일]
1장에서 결정한 디자인을 6장까지 100% 동일하게 유지:
- 배경색: 모든 카드 동일한 hex 값 (예: 전부 #FFF0F5)
- 일러스트 스타일: 전부 동일 (예: 전부 "3D 파스텔 둥근 스타일")
- 장식 요소: 전부 동일

visual 필드 작성법:
"[공통] 연한 핑크 그라데이션, 3D 파스텔 일러스트, 상단 장식 원 [개별] 치아 단면도"
↑ [공통] 부분이 6장 모두 완전히 동일해야 함. [개별] 부분만 다름.

[프롬프트 작성 규칙]
1. 각 카드에 표시될 한글 텍스트:
   - subtitle: 8자 이내 짧은 문구
   - mainTitle: 핵심 키워드 2~4단어
   - description: 15자 이내 한 줄 요약 (표지/마무리는 생략 가능)
2. visual: 배경 비주얼 묘사 (30자 이내, 스타일+색상+오브젝트)
3. 테두리/프레임/보더 금지! 이미지 전체를 채우는 디자인!

[출력 형식 — 반드시 이 형식으로]
---CARD 1---
subtitle: (부제 텍스트)
mainTitle: (메인 제목)
description: (설명 또는 빈칸)
visual: (배경 비주얼 묘사)
---CARD 2---
...`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptGenPrompt,
          model: 'gemini-3.1-pro-preview', temperature: 0.7, maxOutputTokens: 16384,
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) { setError(data.error || '프롬프트 생성 실패'); return; }

      // 파싱: ---CARD N--- 구분 (다양한 구분자 지원)
      let promptBlocks = data.text.split(/---\s*CARD\s*\d+\s*---/i).filter(b => b.trim());
      if (promptBlocks.length < cards.length) {
        promptBlocks = data.text.split(/(?:CARD\s*\d+[:\s]|\[\s*CARD\s*\d+\s*\])/i).filter(b => b.trim());
      }
      if (promptBlocks.length < cards.length) {
        promptBlocks = data.text.split(/(?=subtitle:)/i).filter(b => b.trim());
      }
      console.log(`[카드뉴스] 프롬프트 블록 ${promptBlocks.length}개 파싱 (카드 ${cards.length}장)`);
      // 디자인 템플릿 블록 (API route의 buildCardNewsPromptFull이 파싱)
      const tmplBlock = tmpl ? `\n[디자인 템플릿: ${tmpl.name}]\n${tmpl.stylePrompt}\n배경색: ${tmpl.colors.background}` : '';

      const updatedCards = cards.map((card, idx) => {
        const block = promptBlocks[idx] || '';
        const isDuplicate = idx > 0 && block === promptBlocks[idx - 1];
        if (!block.trim() || isDuplicate) {
          console.warn(`[카드뉴스] 카드 ${card.index} 프롬프트 파싱 실패, 원고 기반 폴백`);
        }
        const sub = (!isDuplicate && block.match(/subtitle:\s*(.+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '')) || card.role;
        const main = (!isDuplicate && block.match(/mainTitle:\s*(.+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '')) || card.title;
        const desc = (!isDuplicate && block.match(/description:\s*(.+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '')) || card.body?.substring(0, 30) || '';
        const visual = (!isDuplicate && block.match(/visual:\s*(.+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '')) || `${topic} 관련 의료 일러스트`;

        // API route의 buildCardNewsPromptFull 파서가 인식하는 형식으로 조립
        const imagePrompt = [
          `subtitle: "${sub}"`,
          `mainTitle: "${main}"`,
          desc ? `description: "${desc}"` : '',
          `비주얼: ${visual}`,
          tmplBlock,
        ].filter(Boolean).join('\n');

        return { ...card, imagePrompt };
      });

      setCards(updatedCards);
      setPipelineStep('promptReview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally { setIsGeneratingPrompts(false); setProgress(''); }
  };

  // ── Step 3: 이미지 생성 (프롬프트 승인 후) ──
  const handleGenerateImages = async () => {
    if (cards.length === 0 || isGeneratingImages) return;
    setIsGeneratingImages(true);
    setProgress(`이미지 생성 중... (0/${cards.length}장)`);

    try {
      // ═══ Phase 1: 카드 1 생성 (스타일 기준) ═══
      setProgress(`이미지 생성 중... (1/${cards.length}장) — 스타일 기준 설정`);
      const firstCard = cards[0];
      let firstImageUrl = await generateCardImage(firstCard.imagePrompt, firstCard.index);
      if (!firstImageUrl) {
        setProgress('카드 1 재시도 중...');
        firstImageUrl = await generateCardImage(firstCard.imagePrompt, firstCard.index);
      }
      if (!firstImageUrl) {
        setError('첫 번째 카드 이미지 생성에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      // ═══ Phase 2: 카드 1 스타일 분석 ═══
      setProgress('스타일 분석 중... (일관성 향상)');
      let styleSheet = '1장과 동일한 배경색, 레이아웃, 일러스트 스타일을 사용하세요.';
      try {
        const styleRes = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `아래 카드뉴스 1장의 프롬프트를 보고 디자인 스타일을 추출해주세요.

[1장 프롬프트]
${firstCard.imagePrompt}

아래 형식으로만 출력:
BACKGROUND: (배경색/그라데이션)
ILLUSTRATION_STYLE: (일러스트 스타일 키워드 5개)
LAYOUT: (텍스트/일러스트 배치)
DECORATIVE: (장식 요소)`,
            model: 'gemini-3.1-flash-lite-preview',
            temperature: 0.2,
            maxOutputTokens: 300,
            thinkingLevel: 'none',
          }),
        });
        const styleData = await styleRes.json();
        if (styleData.text) styleSheet = styleData.text.trim();
      } catch { /* 스타일 분석 실패 시 기본 텍스트 사용 */ }

      // ═══ Phase 3: 카드 2~N 순차 생성 (체인 참조) ═══
      const imageResults: { index: number; url: string | null }[] = [
        { index: firstCard.index, url: firstImageUrl },
      ];
      let prevImageUrl = firstImageUrl;

      for (let i = 1; i < cards.length; i++) {
        const card = cards[i];
        setProgress(`이미지 생성 중... (${i + 1}/${cards.length}장)`);

        const consistencyBlock = `[🔒 스타일 시트 — 1장에서 추출. 절대 변경 금지]\n${styleSheet}\n\n[⚠️ 위 스타일을 100% 동일하게 적용하세요.]`;
        const enrichedPrompt = `${consistencyBlock}\n\n${card.imagePrompt}`;

        let url = await generateCardImage(enrichedPrompt, card.index, prevImageUrl);
        if (!url) {
          setProgress(`카드 ${i + 1} 재시도 중...`);
          url = await generateCardImage(enrichedPrompt, card.index, firstImageUrl);
        }

        imageResults.push({ index: card.index, url });
        if (url) prevImageUrl = url;
      }

      const finalCards = cards.map(card => {
        const result = imageResults.find(r => r.index === card.index);
        return {
          ...card,
          imageUrl: result?.url || null,
          imageHistory: result?.url ? [{ url: result.url, prompt: card.imagePrompt, createdAt: Date.now() }] : [],
        };
      });
      setCards(finalCards);
      setPipelineStep('idle');

      const failedCount = finalCards.filter(c => !c.imageUrl).length;
      if (failedCount > 0) {
        setError(`${failedCount}장의 이미지 생성에 실패했습니다. 해당 카드를 클릭하여 재생성하세요.`);
      }

      // 저장 (이미지 포함 HTML)
      try {
        const { userId, userEmail } = await getSessionSafe();
        const cardHtmlContent = finalCards.map(card => {
          const imgTag = card.imageUrl
            ? `<div style="text-align:center;margin:8px 0;"><img src="${card.imageUrl}" alt="카드 ${card.index}" style="max-width:100%;border-radius:12px;" /></div>`
            : '';
          return `<div style="margin-bottom:24px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="font-size:12px;color:#e84393;font-weight:600;margin-bottom:4px;">${card.index}장 · ${card.role}</div>
            <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${card.title}</div>
            ${card.body ? `<div style="font-size:14px;color:#64748b;margin-bottom:8px;">${card.body}</div>` : ''}
            ${imgTag}
          </div>`;
        }).join('\n');
        await savePost({
          userId, userEmail, hospitalName: hospitalName || undefined, postType: 'card_news',
          title: finalCards[0]?.title || topic, content: cardHtmlContent,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
        });
        setSaveStatus('저장 완료');
      } catch { setSaveStatus('저장 실패'); }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally { setIsGeneratingImages(false); setProgress(''); }
  };

  // ── 초기 로드: 프롬프트 히스토리 + 참고 이미지 ──
  useEffect(() => {
    try { const sl = localStorage.getItem('hospital-logo-dataurl'); if (sl) setLogoDataUrl(sl); } catch {}
    try {
      const saved = localStorage.getItem(CARD_PROMPT_HISTORY_KEY);
      if (saved) setPromptHistory(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const savedRef = localStorage.getItem(CARD_REF_IMAGE_KEY);
      if (savedRef) {
        const parsed = JSON.parse(savedRef);
        if (parsed.image) { setCardRegenRefImage(parsed.image); setRefImageMode(parsed.mode || 'copy'); setIsRefImageLocked(true); }
      }
    } catch { /* ignore */ }
  }, []);

  // ── 이미지 프롬프트 자동 연동 (텍스트 변경 시) ──
  useEffect(() => {
    if (editSubtitle || editMainTitle || editDescription) {
      const parts = [
        `subtitle: "${editSubtitle || ''}"`,
        `mainTitle: "${editMainTitle || ''}"`,
        editDescription ? `description: "${editDescription}"` : '',
        `비주얼: ${topic || '의료 건강'} 관련 밝고 친근한 분위기 일러스트`,
      ].filter(Boolean);
      setEditImagePrompt(parts.join('\n'));
    }
  }, [editSubtitle, editMainTitle, editDescription, topic]);

  // ── 카드 재생성 모달 열기 ──
  const openCardRegenModal = useCallback((cardIndex: number) => {
    const card = cards.find(c => c.index === cardIndex);
    if (!card) return;
    setCardRegenIndex(cardIndex);
    setCurrentCardImage(card.imageUrl || '');
    setEditSubtitle(card.role);
    setEditMainTitle(card.title);
    setEditDescription(card.body);
    setEditImagePrompt(card.imagePrompt);
    if (!isRefImageLocked) setCardRegenRefImage('');
    setCardRegenModalOpen(true);
  }, [cards, isRefImageLocked]);

  // ── AI 프롬프트 추천 ──
  const handleRecommendPrompt = useCallback(async () => {
    setIsRecommendingPrompt(true);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `다음 카드뉴스 슬라이드에 어울리는 이미지 프롬프트를 아래 형식으로 작성해주세요.\n부제: ${editSubtitle}\n제목: ${editMainTitle}\n설명: ${editDescription}\n\n반드시 아래 형식으로만 출력:\nsubtitle: "${editSubtitle}"\nmainTitle: "${editMainTitle}"\n${editDescription ? `description: "${editDescription}"\n` : ''}비주얼: (배경 일러스트/사진 묘사 30자 이내)`,
          systemInstruction: '이미지 프롬프트 전문가. subtitle/mainTitle/비주얼 형식으로만 출력.',
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 2048,
        }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) setEditImagePrompt(data.text.trim());
    } catch { /* ignore */ } finally { setIsRecommendingPrompt(false); }
  }, [editSubtitle, editMainTitle, editDescription]);

  // ── 카드 재생성 실행 ──
  const executeCardRegenerate = useCallback(async () => {
    const hasInput = editSubtitle || editMainTitle || editDescription || editImagePrompt || cardRegenRefImage;
    if (!hasInput) return;

    setRegeneratingCard(cardRegenIndex);
    setCardRegenProgress(cardRegenRefImage ? '참고 이미지 스타일 분석 중...' : '편집된 프롬프트로 이미지 생성 중...');

    try {
      const promptToUse = editImagePrompt || `subtitle: "${editSubtitle}"\nmainTitle: "${editMainTitle}"\n${editDescription ? `description: "${editDescription}"\n` : ''}비주얼: ${topic || '의료 건강'} 관련 밝고 친근한 분위기 일러스트`;
      const url = await generateCardImage(promptToUse, cardRegenIndex, cardRegenRefImage || undefined);

      setCards(prev => prev.map(c => {
        if (c.index !== cardRegenIndex) return c;
        const newHistory = [...c.imageHistory];
        if (c.imageUrl) newHistory.push({ url: c.imageUrl, prompt: c.imagePrompt, createdAt: Date.now() });
        while (newHistory.length > 5) newHistory.shift();
        return { ...c, imageUrl: url, imagePrompt: promptToUse, title: editMainTitle || c.title, body: editDescription || c.body, role: editSubtitle || c.role, imageHistory: newHistory };
      }
      ));
      setCardRegenModalOpen(false);
    } catch (err) {
      console.error('카드 재생성 실패:', err);
    } finally {
      setRegeneratingCard(null);
      setCardRegenProgress('');
    }
  }, [cardRegenIndex, editSubtitle, editMainTitle, editDescription, editImagePrompt, cardRegenRefImage, imageStyle, customImagePrompt]);

  // ── 프롬프트 히스토리 저장/불러오기 ──
  const savePromptToHistory = useCallback(() => {
    if (!editSubtitle && !editMainTitle && !editDescription) return;
    const newItem: CardPromptHistoryItem = {
      subtitle: editSubtitle, mainTitle: editMainTitle, description: editDescription,
      imagePrompt: editImagePrompt,
      savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };
    const filtered = promptHistory.filter(h => h.subtitle !== newItem.subtitle || h.mainTitle !== newItem.mainTitle);
    const newHistory = [newItem, ...filtered].slice(0, 3);
    setPromptHistory(newHistory);
    localStorage.setItem(CARD_PROMPT_HISTORY_KEY, JSON.stringify(newHistory));
  }, [editSubtitle, editMainTitle, editDescription, editImagePrompt, promptHistory]);

  const loadFromHistory = useCallback((item: CardPromptHistoryItem) => {
    setEditSubtitle(item.subtitle);
    setEditMainTitle(item.mainTitle);
    setEditDescription(item.description);
    setEditImagePrompt(item.imagePrompt);
    setShowHistoryDropdown(false);
  }, []);

  // ── 참고 이미지 저장/삭제 ──
  const lockRefImage = useCallback((image: string, mode: 'recolor' | 'copy') => {
    try { localStorage.setItem(CARD_REF_IMAGE_KEY, JSON.stringify({ image, mode })); setIsRefImageLocked(true); } catch { /* too large */ }
  }, []);

  const unlockRefImage = useCallback(() => {
    localStorage.removeItem(CARD_REF_IMAGE_KEY);
    setIsRefImageLocked(false);
  }, []);

  // ── 트렌드 주제 추천: 키워드 있으면 세부 주제, 없으면 진료과별 핫 키워드 ──
  const handleRecommendTrends = useCallback(async () => {
    setIsLoadingTrends(true);
    setTrendingItems([]);
    try {
      const userKeyword = topic.trim();

      let prompt: string;
      if (userKeyword) {
        // 키워드가 있으면 → 관련 세부 주제 추천
        prompt = `"${userKeyword}" 키워드와 관련된 병원 마케팅용 카드뉴스 주제를 5개 추천해줘.

규칙:
1. 환자가 실제로 검색할만한 구체적인 주제
2. 각 주제는 30자 이내
3. 다양한 각도 (비용, 과정, 비교, 주의사항, 후기, Q&A 등)
4. 의료광고법 위반 없는 주제
5. 웹 검색으로 2024~2025년 최신 트렌드 반영
6. 카드뉴스에 어울리는 형태 (리스트형, 비교형, 체크리스트, Q&A 등)`;
      } else {
        // 키워드 없으면 → 진료과별 핫 키워드
        prompt = `${category} 분야에서 요즘 환자들이 가장 많이 검색하는 핫한 카드뉴스 주제 5개를 추천해줘.

규칙:
1. 2024~2025년 기준 실제 검색 트렌드 반영 (웹 검색으로 확인)
2. 각 주제는 30자 이내
3. 환자 입장에서 관심 가질 구체적 주제
4. 시즌/계절 트렌드 포함 (지금 시기에 맞는)
5. 의료광고법 위반 없는 주제
6. 카드뉴스에 어울리는 형태 (리스트형, 비교형, 체크리스트, Q&A 등)`;
      }

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction: '병원 마케팅 트렌드 분석 전문가. JSON만 출력. 마크다운/코드블록 금지.',
          model: 'gemini-3.1-flash-lite-preview',
          responseType: 'json',
          googleSearch: true,
          temperature: 0.7,
          maxOutputTokens: 1500,
          schema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                topic: { type: 'STRING' },
                keywords: { type: 'STRING' },
                score: { type: 'NUMBER' },
                seasonal_factor: { type: 'STRING' },
              },
              required: ['topic', 'keywords', 'score', 'seasonal_factor'],
            },
          },
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '트렌드 분석 실패');
      setTrendingItems(JSON.parse(data.text) as TrendingItem[]);
    } catch {
      /* 실패 시 무시 */
    } finally {
      setIsLoadingTrends(false);
    }
  }, [category, topic]);

  // ── 개별 카드 다운로드 ──
  const handleCardDownload = (card: CardSlide) => {
    if (!card.imageUrl) return;
    const a = document.createElement('a');
    a.href = card.imageUrl;
    a.download = `card_${card.index}.png`;
    a.click();
  };

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="p-5 max-w-6xl mx-auto">

      {/* ══════════════════════════════════════ */}
      {/* 1단계: 짧은 폼 + 라이브 미리보기        */}
      {/* ══════════════════════════════════════ */}
      {pageStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── 좌: 폼 ── */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎨</span>
              <h1 className="text-xl font-bold text-slate-800">카드뉴스 만들기</h1>
            </div>

            {/* 주제 */}
            <div>
              <label className="text-sm font-bold text-slate-700 mb-1 block">주제</label>
              <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="예: 임플란트 사후관리 가이드" className={inputCls} />
              <button type="button" onClick={handleRecommendTrends} disabled={isLoadingTrends}
                className="w-full mt-2 py-2.5 bg-blue-50 text-blue-600 text-sm font-semibold rounded-xl border border-blue-200 hover:bg-blue-100 disabled:opacity-50">
                {isLoadingTrends ? '검색 중...' : topic.trim()
                  ? <>🔍 &ldquo;{topic.trim().length > 10 ? topic.trim().slice(0, 10) + '…' : topic.trim()}&rdquo; 관련 주제 추천</>
                  : <>🔥 트렌드 주제 추천</>}
              </button>
              {trendingItems.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {trendingItems.map((item, idx) => (
                    <button key={idx} type="button" onClick={() => { setTopic(item.topic); setTrendingItems([]); }}
                      className="w-full text-left px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all group">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-500 font-bold text-sm">{idx + 1}</span>
                        <span className="font-semibold text-slate-800 text-sm group-hover:text-blue-700">{item.topic}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 pl-5">{item.seasonal_factor}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 진료과 */}
            <div>
              <label className="text-sm font-bold text-slate-700 mb-1 block">진료과</label>
              <div className="flex gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat.value} type="button" onClick={() => setCategory(cat.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                      category === cat.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}>{cat.label}</button>
                ))}
              </div>
            </div>

            {/* 슬라이드 수 */}
            <div>
              <label className="text-sm font-bold text-slate-700 mb-1 block">슬라이드 수</label>
              <div className="flex gap-1.5 flex-wrap">
                <button type="button" onClick={() => setSlideCount(0)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                    slideCount === 0 ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-400'
                  }`}>✨ 자동</button>
                {[4, 5, 6, 7, 8, 10].map(n => (
                  <button key={n} type="button" onClick={() => setSlideCount(n)}
                    className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                      slideCount === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400'
                    }`}>{n}장</button>
                ))}
              </div>
            </div>

            {/* 카드 사이즈 */}
            <div>
              <label className="text-sm font-bold text-slate-700 mb-1 block">카드 사이즈</label>
              <div className="flex gap-2">
                {([
                  { id: '1:1' as const, label: '1:1 정사각형' },
                  { id: '4:5' as const, label: '4:5 세로형' },
                  { id: '3:4' as const, label: '3:4 세로형' },
                ]).map(size => (
                  <button key={size.id} type="button" onClick={() => setProCardRatio(size.id)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                      proCardRatio === size.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400'
                    }`}>{size.label}</button>
                ))}
              </div>
            </div>

            {/* 생성 버튼 */}
            <button type="button" onClick={handleSubmit as any} disabled={isGenerating || !topic.trim()}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-lg font-bold rounded-2xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 shadow-lg shadow-blue-200 transition-all">
              {isGenerating ? '✨ 생성 중...' : '✨ 카드뉴스 생성'}
            </button>
          </div>

          {/* ── 우: 라이브 미리보기 ── */}
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-slate-700">📱 디자인 미리보기</h3>
            <div style={{
              width: '100%',
              aspectRatio: proCardRatio === '3:4' ? '3/4' : proCardRatio === '4:5' ? '4/5' : '1/1',
              borderRadius: '16px', overflow: 'hidden', position: 'relative',
              background: proTheme.backgroundGradient || proTheme.backgroundColor,
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', padding: '40px', textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)', transition: 'all 0.3s ease',
              maxHeight: '400px',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: proTheme.accentColor }} />
              <div style={{ width: '50px', height: '4px', background: proTheme.accentColor, borderRadius: '2px', marginBottom: '20px' }} />
              <div style={{ color: proTheme.titleColor, fontSize: '24px', fontWeight: 900, marginBottom: '12px', wordBreak: 'keep-all', lineHeight: 1.3 }}>
                {topic || '주제를 입력해보세요'}
              </div>
              <div style={{ color: proTheme.subtitleColor, fontSize: '13px', fontWeight: 600 }}>
                {topic ? `${slideCount === 0 ? '자동' : slideCount}장 카드뉴스` : '실시간 미리보기'}
              </div>
              {proTheme.hospitalName && (
                <div style={{ position: 'absolute', bottom: '16px', color: proTheme.titleColor, fontSize: '10px', opacity: 0.4, letterSpacing: '2px' }}>{proTheme.hospitalName}</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, transparent, ${proTheme.accentColor})` }} />
            </div>

            {/* 현재 설정 요약 */}
            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-500 mb-2">⚙️ 현재 설정</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded-lg px-3 py-2"><span className="text-slate-400">진료과</span><span className="block font-bold text-slate-700 mt-0.5">{CATEGORIES.find(c => c.value === category)?.label || '치과'}</span></div>
                <div className="bg-white rounded-lg px-3 py-2"><span className="text-slate-400">슬라이드</span><span className="block font-bold text-slate-700 mt-0.5">{slideCount === 0 ? '✨ 자동' : `${slideCount}장`}</span></div>
                <div className="bg-white rounded-lg px-3 py-2"><span className="text-slate-400">사이즈</span><span className="block font-bold text-slate-700 mt-0.5">{proCardRatio}</span></div>
                <div className="bg-white rounded-lg px-3 py-2"><span className="text-slate-400">디자인</span><span className="block font-bold text-slate-700 mt-0.5">{currentPresetId ? DESIGN_PRESETS.find(p => p.id === currentPresetId)?.name : '기본'}</span></div>
              </div>
            </div>

            {/* 제작 팁 */}
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
              <h3 className="text-xs font-bold text-blue-600 mb-2">💡 제작 팁</h3>
              <ul className="text-[11px] text-blue-500 space-y-1">
                <li>• 구체적 주제가 더 좋은 결과를 만들어요</li>
                <li>• 🔥 트렌드에서 인기 주제를 확인하세요</li>
                <li>• 생성 후 카드를 클릭하면 개별 편집 가능</li>
              </ul>
            </div>

            {/* 로딩 중 (1단계에서도 표시) */}
            {(isGenerating || isGeneratingPrompts || isGeneratingImages) && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-slate-700">{progress || (slideCount === 0 ? '최적 장수로 원고를 작성하고 있어요' : `${slideCount}장 분량의 원고를 작성하고 있어요`)}</p>
              </div>
            )}

            {/* 에러 */}
            {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* 2단계: 디자인 설정(접기) + 카드 편집      */}
      {/* ══════════════════════════════════════ */}
      {pageStep === 2 && (
        <div>
          {/* 상단 바 */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPageStep(1)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200">← 새로 만들기</button>
              <h2 className="text-sm font-bold text-slate-700 truncate max-w-xs">{topic}</h2>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{proSlides.length}장 · {proCardRatio}</span>
            </div>
          </div>

          {/* 로딩 */}
          {(isGenerating || isGeneratingPrompts || isGeneratingImages) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center mb-4">
              <div className="w-12 h-12 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-medium text-slate-700">{progress || '생성 중...'}</p>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 mb-4">{error}</div>}

          {/* 디자인 설정 (접기) */}
          <details className="mb-4 bg-slate-50 rounded-xl border border-slate-200">
            <summary className="px-4 py-3 text-sm font-bold text-slate-600 cursor-pointer hover:text-slate-800">
              🎨 디자인 설정 (테마 · 글씨체 · 병원명)
            </summary>
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-slate-200">
              {/* 디자인 프리셋 */}
              <div>
                <label className={labelCls}>디자인 스타일</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <button type="button" onClick={() => setShowStyleUpload(v => !v)}
                    className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center gap-0.5 ${showStyleUpload ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-slate-300 bg-white text-slate-400'}`}>
                    <span className="text-xl leading-none">＋</span>
                    <span className="text-[8px] font-semibold leading-tight text-center px-0.5">새 스타일{'\n'}학습</span>
                  </button>
                  {(['all', 'professional', 'modern', 'minimal', 'warm', 'bold'] as const).map(cat => (
                    <button key={cat} type="button" onClick={() => setPresetCategory(cat)}
                      className={`flex-shrink-0 px-3 py-1 text-[9px] font-bold rounded-full whitespace-nowrap ${presetCategory === cat ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {cat === 'all' ? '전체' : cat === 'professional' ? '전문적' : cat === 'modern' ? '모던' : cat === 'minimal' ? '미니멀' : cat === 'warm' ? '따뜻한' : '강렬한'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 mt-2">
                  {DESIGN_PRESETS.filter(p => presetCategory === 'all' || p.category === presetCategory).map(preset => (
                    <button key={preset.id} type="button"
                      onClick={() => { setProTheme({ ...preset.theme, hospitalName: hospitalName || undefined }); setPresetStyle(preset.style); setCurrentPresetId(preset.id); setLearnedTemplate(null); }}
                      className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${currentPresetId === preset.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}>
                      <div style={{ background: preset.thumbnail, width: '100%', height: '100%' }} className="flex items-center justify-center">
                        <span className="text-[11px] font-black" style={{ color: preset.theme.titleColor }}>Aa</span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5"><span className="text-[7px] text-white font-bold">{preset.name}</span></div>
                    </button>
                  ))}
                </div>
                {/* 학습 템플릿 */}
                <div className="flex gap-2 overflow-x-auto pb-2 mt-2">
                  {savedStyles.map(tmpl => (
                    <div key={tmpl.id} className="relative flex-shrink-0">
                      <button type="button" onClick={() => { setLearnedTemplate(tmpl); setProTheme(prev => ({ ...prev, backgroundColor: tmpl.colors.background, backgroundGradient: tmpl.colors.backgroundGradient || '', titleColor: tmpl.colors.titleColor, subtitleColor: tmpl.colors.subtitleColor, bodyColor: tmpl.colors.bodyColor, accentColor: tmpl.colors.accentColor, fontFamily: tmpl.typography.fontFamily || prev.fontFamily })); }}
                        className={`w-16 h-16 rounded-xl border-2 transition-all overflow-hidden ${learnedTemplate?.id === tmpl.id ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-200'}`} title={tmpl.name}>
                        {tmpl.thumbnailDataUrl ? <img src={tmpl.thumbnailDataUrl} alt={tmpl.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400 p-1 text-center">{tmpl.name}</div>}
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteTemplate(tmpl.id); if (learnedTemplate?.id === tmpl.id) setLearnedTemplate(null); setSavedStylesVersion(v => v + 1); }}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-bold flex items-center justify-center hover:bg-red-600 shadow-sm">✕</button>
                    </div>
                  ))}
                </div>
                {showStyleUpload && (
                  <div className="mt-2">
                    <CardTemplateManager uploadOnly onSelectTemplate={(tmpl) => { setLearnedTemplate(tmpl); setSavedStylesVersion(v => v + 1); }} selectedTemplateId={learnedTemplate?.id} />
                  </div>
                )}
              </div>

              {/* 병원명 */}
              <div>
                <label className={labelCls}>병원명</label>
                <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="병원 이름 (선택)" className={inputCls} />
              </div>

              {/* 병원 로고 */}
              <div>
                <label className={labelCls}>병원 로고</label>
                <div className="flex items-center gap-3">
                  {logoDataUrl ? (
                    <div className="relative">
                      <img src={logoDataUrl} alt="로고" className="h-10 w-auto rounded-lg border border-slate-200 bg-white p-1" />
                      <button type="button" onClick={() => { setLogoDataUrl(null); setLogoEnabled(false); try { localStorage.removeItem('hospital-logo-dataurl'); } catch {} }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center">✕</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => logoInputRef.current?.click()}
                      className="h-10 px-4 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-pink-400 hover:text-pink-500">+ 로고 업로드</button>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => { const d = reader.result as string; setLogoDataUrl(d); setLogoEnabled(true); try { localStorage.setItem('hospital-logo-dataurl', d); } catch {} };
                    reader.readAsDataURL(file); e.target.value = '';
                  }} />
                  {logoDataUrl && (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={logoEnabled} onChange={e => setLogoEnabled(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 text-pink-500" />
                      <span className="text-[11px] text-slate-500">카드에 로고 넣기</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          </details>

          {/* 카드 편집 */}
          {proSlides.length > 0 && (
            <CardNewsProRenderer
              slides={proSlides}
              theme={proTheme}
              onSlidesChange={setProSlides}
              onThemeChange={setProTheme}
              learnedTemplate={learnedTemplate}
              cardRatio={proCardRatio}
              presetStyle={presetStyle}
            />
          )}
        </div>
      )}

      {/* 모달 */}
      <CardRegenModal
        open={cardRegenModalOpen}
        onClose={() => setCardRegenModalOpen(false)}
        cardIndex={cardRegenIndex}
        isRegenerating={regeneratingCard !== null}
        regenProgress={cardRegenProgress}
        currentCardImage={currentCardImage}
        editSubtitle={editSubtitle}
        setEditSubtitle={setEditSubtitle}
        editMainTitle={editMainTitle}
        setEditMainTitle={setEditMainTitle}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editImagePrompt={editImagePrompt}
        setEditImagePrompt={setEditImagePrompt}
        isRecommending={isRecommendingPrompt}
        onRecommendPrompt={handleRecommendPrompt}
        refImage={cardRegenRefImage}
        setRefImage={setCardRegenRefImage}
        refImageMode={refImageMode}
        setRefImageMode={setRefImageMode}
        isRefImageLocked={isRefImageLocked}
        onLockRefImage={lockRefImage}
        onUnlockRefImage={unlockRefImage}
        promptHistory={promptHistory}
        showHistoryDropdown={showHistoryDropdown}
        setShowHistoryDropdown={setShowHistoryDropdown}
        onSavePromptHistory={savePromptToHistory}
        onLoadFromHistory={loadFromHistory}
        onRegenerate={executeCardRegenerate}
      />
    </div>
  );
}
