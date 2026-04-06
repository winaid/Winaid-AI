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
  const [slideCount, setSlideCount] = useState(6);
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

      // 텍스트 원고만 즉시 노출. 이미지는 사용자가 편집에서 슬라이드별로 개별 추가.
      setProSlides(slides);
      setPipelineStep('idle');
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
        for (let i = 0; i < slideCount; i++) {
          const fallbackRole = i === 0 ? '표지' : i === slideCount - 1 ? '마무리 표지' : `본문 ${i}`;
          const fallbackTitle = i === 0 ? topic : i === slideCount - 1 ? '상담을 기다립니다' : `슬라이드 ${i + 1}`;
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
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 ── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* ── 핑크 헤더 (OLD parity) ── */}
          <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-pink-50 to-rose-50 border-b border-pink-100">
            <span className="text-lg">🌸</span>
            <h2 className="text-base font-bold text-pink-700">카드뉴스</h2>
          </div>

          <div className="p-5 space-y-4">
            {/* 진료과 + 대상 독자 (OLD parity: grid-cols-2 select) */}
            <div className="grid grid-cols-2 gap-3">
              <select value={category} onChange={e => setCategory(e.target.value as ContentCategory)} className={inputCls} disabled={isGenerating} aria-label="진료과 선택">
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <select value={audienceMode} onChange={e => setAudienceMode(e.target.value as AudienceMode)} className={inputCls} disabled={isGenerating} aria-label="대상 독자">
                <option value="환자용(친절/공감)">환자용 (친절/공감)</option>
                <option value="보호자용(가족걱정)">보호자용 (부모님/자녀 걱정)</option>
                <option value="전문가용(신뢰/정보)">전문가용 (신뢰/정보)</option>
              </select>
            </div>

            {/* 주제 + 트렌드 버튼 */}
            <div>
              <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="카드뉴스 주제 (예: 임플란트 시술 과정 안내)" required className={inputCls} />
              <button type="button" onClick={handleRecommendTrends} disabled={isLoadingTrends}
                className="w-full mt-2 py-2.5 bg-blue-50 text-blue-600 text-sm font-semibold rounded-xl border border-blue-200 hover:bg-blue-100 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                {isLoadingTrends ? <><div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />검색 중...</> : topic.trim() ? <>🔍 &ldquo;{topic.trim().length > 10 ? topic.trim().slice(0, 10) + '…' : topic.trim()}&rdquo; 관련 주제 추천</> : <>🔥 트렌드 주제 추천</>}
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

            {/* 콘텐츠 분량 */}
            <div>
              <label className={labelCls}>콘텐츠 분량</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setContentMode('simple')}
                  className={`py-2.5 rounded-xl border transition-all text-center ${contentMode === 'simple' ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                  <span className="text-base block">⚡</span>
                  <span className="text-[10px] font-semibold block">간단</span>
                  <span className="text-[9px] text-slate-400 block">짧고 임팩트</span>
                </button>
                <button type="button" onClick={() => setContentMode('detailed')}
                  className={`py-2.5 rounded-xl border transition-all text-center ${contentMode === 'detailed' ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                  <span className="text-base block">📋</span>
                  <span className="text-[10px] font-semibold block">상세</span>
                  <span className="text-[9px] text-slate-400 block">정보 충실</span>
                </button>
              </div>
            </div>

            {/* 슬라이드 수 (4~10장) */}
            <div>
              <label className={labelCls}>
                슬라이드 수 <span className="text-blue-600 font-bold">{slideCount}장</span>
              </label>
              <input type="range" min={4} max={10} step={1} value={slideCount}
                onChange={e => setSlideCount(Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>4장 (간단)</span><span>7장 (기본)</span><span>10장 (상세)</span>
              </div>
            </div>

            {/* 카드 사이즈 */}
            <div>
              <label className={labelCls}>카드 사이즈</label>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { id: '1:1' as const, label: '1:1', desc: '정사각형' },
                  { id: '4:5' as const, label: '4:5', desc: '인스타' },
                  { id: '3:4' as const, label: '3:4', desc: '세로형' },
                  { id: '9:16' as const, label: '9:16', desc: '릴스/숏츠' },
                  { id: '16:9' as const, label: '16:9', desc: '가로형' },
                ]).map(opt => (
                  <button key={opt.id} type="button" onClick={() => setProCardRatio(opt.id)}
                    className={`flex-1 min-w-[60px] py-2 rounded-xl text-center border-2 transition-all ${
                      proCardRatio === opt.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400'
                    }`}>
                    <span className="block text-sm font-bold">{opt.label}</span>
                    <span className="block text-[9px]">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 디자인 스타일 — 한 행에 전부 (+ 새 스타일 학습 / 테마 / 학습 템플릿) */}
            <div>
              <label className={labelCls}>디자인 스타일</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {/* + 새 스타일 학습 — 첫 타일, 다른 타일과 동일 크기 */}
                <button type="button" onClick={() => setShowStyleUpload(v => !v)}
                  className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center gap-0.5 ${
                    showStyleUpload ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-slate-300 bg-white text-slate-400 hover:border-pink-400 hover:text-pink-600'
                  }`}
                  title={showStyleUpload ? '업로드 닫기' : '새 스타일 학습'}>
                  <span className="text-xl leading-none">＋</span>
                  <span className="text-[8px] font-semibold leading-tight text-center px-0.5">새 스타일{'\n'}학습</span>
                </button>

                {/* 카테고리 필터 */}
                {(['all', 'professional', 'modern', 'minimal', 'warm', 'bold'] as const).map(cat => (
                  <button key={cat} type="button" onClick={() => setPresetCategory(cat)}
                    className={`flex-shrink-0 px-3 py-1 text-[9px] font-bold rounded-full whitespace-nowrap ${
                      presetCategory === cat ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    {cat === 'all' ? '전체' : cat === 'professional' ? '전문적' : cat === 'modern' ? '모던' : cat === 'minimal' ? '미니멀' : cat === 'warm' ? '따뜻한' : '강렬한'}
                  </button>
                ))}
              </div>
              {/* 디자인 프리셋 20종 그리드 */}
              <div className="grid grid-cols-5 gap-2 mt-2">
                {DESIGN_PRESETS
                  .filter(p => presetCategory === 'all' || p.category === presetCategory)
                  .map(preset => (
                    <button key={preset.id} type="button"
                      onClick={() => {
                        setProTheme({ ...preset.theme, hospitalName: hospitalName || undefined });
                        setPresetStyle(preset.style);
                        setCurrentPresetId(preset.id);
                        setLearnedTemplate(null);
                      }}
                      className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${
                        currentPresetId === preset.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <div style={{ background: preset.thumbnail, width: '100%', height: '100%' }} className="flex items-center justify-center">
                        <span className="text-[11px] font-black" style={{ color: preset.theme.titleColor }}>Aa</span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                        <span className="text-[7px] text-white font-bold">{preset.name}</span>
                      </div>
                    </button>
                  ))}
              </div>
              {/* 학습 템플릿 */}
              <div className="flex gap-2 overflow-x-auto pb-2 mt-2">

                {/* 학습 템플릿 — 각 타일에 ✕ 삭제 버튼 */}
                {savedStyles.map(tmpl => (
                  <div key={tmpl.id} className="relative flex-shrink-0">
                    <button type="button"
                      onClick={() => {
                        setLearnedTemplate(tmpl);
                        setProTheme(prev => ({
                            ...prev,
                            backgroundColor: tmpl.colors.background,
                            backgroundGradient: tmpl.colors.backgroundGradient || '',
                            titleColor: tmpl.colors.titleColor,
                            subtitleColor: tmpl.colors.subtitleColor,
                            bodyColor: tmpl.colors.bodyColor,
                            accentColor: tmpl.colors.accentColor,
                            fontFamily: tmpl.typography.fontFamily || prev.fontFamily,
                          }));
                      }}
                      className={`w-16 h-16 rounded-xl border-2 transition-all overflow-hidden ${
                        learnedTemplate?.id === tmpl.id ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-200 hover:border-slate-300'
                      }`}
                      title={tmpl.name}>
                      {tmpl.thumbnailDataUrl ? (
                        <img src={tmpl.thumbnailDataUrl} alt={tmpl.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400 p-1 text-center">{tmpl.name}</div>
                      )}
                    </button>
                    <button type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplate(tmpl.id);
                        if (learnedTemplate?.id === tmpl.id) setLearnedTemplate(null);
                        setSavedStylesVersion(v => v + 1);
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-bold flex items-center justify-center hover:bg-red-600 shadow-sm"
                      title="이 학습 스타일 삭제">
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* 스타일 업로드 UI (토글) — CardTemplateManager의 업로드 폼만 사용 */}
              {showStyleUpload && (
                <div className="mt-2">
                  <CardTemplateManager
                    uploadOnly
                    onSelectTemplate={(tmpl) => {
                      setLearnedTemplate(tmpl);
                      setSavedStylesVersion(v => v + 1);
                    }}
                    selectedTemplateId={learnedTemplate?.id}
                  />
                </div>
              )}
            </div>

            {/* 병원명 (선택) */}
            <div>
              <label className={labelCls}>병원명 (선택)</label>
              <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="병원 이름을 입력하세요 (예: OO치과)" className={inputCls} />
            </div>

            {/* 병원 로고 (선택) */}
            <div>
              <label className={labelCls}>병원 로고 (선택)</label>
              <div className="flex items-center gap-3">
                {logoDataUrl ? (
                  <div className="relative">
                    <img src={logoDataUrl} alt="로고" className="h-10 w-auto rounded-lg border border-slate-200 bg-white p-1" />
                    <button type="button" onClick={() => { setLogoDataUrl(null); setLogoEnabled(false); try { localStorage.removeItem('hospital-logo-dataurl'); } catch {} }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center">✕</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => logoInputRef.current?.click()}
                    className="h-10 px-4 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-pink-400 hover:text-pink-500 transition-all">+ 로고 업로드</button>
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

            {/* 생성 버튼 */}
            <button type="submit" disabled={isGenerating || !topic.trim()}
              className="w-full py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>원고 생성 중...</>
              ) : '원고 생성하기'}
            </button>
          </div>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {(isGenerating || isGeneratingPrompts || isGeneratingImages) ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-pink-50 text-pink-600 border border-pink-100">
              <span>🎨</span><span>{isGeneratingImages ? '이미지 생성 중' : isGeneratingPrompts ? '프롬프트 생성 중' : '원고 작성 중'}</span>
            </div>
            {/* 진행 단계 표시 */}
            <div className="flex items-center gap-1 mb-6">
              {['원고', '승인', '프롬프트', '승인', '이미지'].map((step, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center ${
                    (i === 0 && isGenerating) || (i === 2 && isGeneratingPrompts) || (i === 4 && isGeneratingImages)
                      ? 'bg-pink-500 text-white animate-pulse' : i < (isGenerating ? 0 : isGeneratingPrompts ? 2 : 4)
                      ? 'bg-pink-100 text-pink-600' : 'bg-slate-100 text-slate-400'
                  }`}>{i + 1}</div>
                  {i < 4 && <div className="w-3 h-px bg-slate-200" />}
                </div>
              ))}
            </div>
            <div className="relative mb-6"><div className="w-14 h-14 border-[3px] border-pink-100 border-t-pink-500 rounded-full animate-spin" /></div>
            <p className="text-sm font-medium text-slate-700 mb-2">{progress || (isGeneratingImages ? '카드 이미지를 생성하고 있어요' : isGeneratingPrompts ? '이미지 프롬프트를 만들고 있어요' : `${slideCount}장 분량의 원고를 작성하고 있어요`)}</p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : proSlides.length > 0 ? (
          /* ── Pro Mode: JSON → HTML/CSS 렌더링 ── */
          <CardNewsProRenderer
            slides={proSlides}
            theme={proTheme}
            onSlidesChange={setProSlides}
            onThemeChange={setProTheme}
            learnedTemplate={learnedTemplate}
            cardRatio={proCardRatio}
            presetStyle={presetStyle}
          />
        ) : pipelineStep === 'scriptReview' && cards.length > 0 ? (
          /* ── Step 2: 원고 승인 단계 ── */
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Step 1</span>
              <span className="text-xs font-bold text-slate-700">원고 확인</span>
              <span className="text-xs text-slate-400">· 제목/본문을 수정한 뒤 프롬프트를 생성하세요</span>
            </div>

            <div className="space-y-2">
              {cards.map((card, idx) => (
                <div key={card.index} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-[9px] font-bold flex items-center justify-center flex-none">{card.index}</span>
                    <span className="text-xs font-bold text-slate-700">{card.role}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">제목</label>
                      <input type="text" value={card.title}
                        onChange={e => setCards(prev => prev.map((c, i) => i === idx ? { ...c, title: e.target.value } : c))}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">본문</label>
                      <textarea value={card.body} rows={2}
                        onChange={e => setCards(prev => prev.map((c, i) => i === idx ? { ...c, body: e.target.value } : c))}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 resize-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {learnedTemplate ? (
              <button onClick={() => setPipelineStep('idle')}
                className="w-full py-3.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20">
                ✨ 카드뉴스 미리보기 ({cards.length}장)
              </button>
            ) : (
              <button onClick={handleGenerateImages} disabled={isGeneratingImages}
                className="w-full py-3.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 disabled:opacity-50">
                🎨 원고 승인 → 이미지 생성 ({cards.length}장)
              </button>
            )}
          </div>
        ) : pipelineStep === 'promptReview' && cards.length > 0 && !cards.some(c => c.imageUrl) ? (
          /* ── Step 4: 프롬프트 승인 단계 (필드별 UI) ── */
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-pink-50 text-pink-700 border border-pink-200">Step 2</span>
              <span className="text-xs font-bold text-slate-700">이미지 프롬프트 확인</span>
              <span className="text-xs text-slate-400">· 이미지에 들어갈 텍스트와 배경을 수정하세요</span>
            </div>

            <div className="space-y-3">
              {cards.map((card, idx) => {
                // 프롬프트에서 필드 추출
                const getField = (key: string) => {
                  const m = card.imagePrompt.match(new RegExp(`${key}:\\s*"?([^"\\n]+)"?`, 'i'));
                  return m?.[1]?.trim() || '';
                };
                const pSub = getField('subtitle');
                const pMain = getField('mainTitle');
                const pDesc = getField('description');
                const vMatch = card.imagePrompt.match(/비주얼:\s*(.+)/i);
                const pVisual = vMatch?.[1]?.trim() || '';

                // 필드 수정 시 프롬프트 재조립
                const updateField = (field: string, value: string) => {
                  const fields = { subtitle: pSub, mainTitle: pMain, description: pDesc, visual: pVisual, [field]: value };
                  // 디자인 템플릿 블록 유지
                  const tmplMatch = card.imagePrompt.match(/(\[디자인 템플릿:[\s\S]*$)/m);
                  const tmplPart = tmplMatch?.[1] || '';
                  const newPrompt = [
                    `subtitle: "${fields.subtitle}"`,
                    `mainTitle: "${fields.mainTitle}"`,
                    fields.description ? `description: "${fields.description}"` : '',
                    `비주얼: ${fields.visual}`,
                    tmplPart,
                  ].filter(Boolean).join('\n');
                  setCards(prev => prev.map((c, i) => i === idx ? { ...c, imagePrompt: newPrompt } : c));
                };

                return (
                  <div key={card.index} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-[9px] font-bold flex items-center justify-center flex-none">{card.index}</span>
                      <span className="text-xs font-bold text-slate-700">{card.role}</span>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">작은 글씨 (부제)</label>
                          <input type="text" value={pSub} onChange={e => updateField('subtitle', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">큰 제목 (메인)</label>
                          <input type="text" value={pMain} onChange={e => updateField('mainTitle', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">설명 문구 (선택)</label>
                        <input type="text" value={pDesc} onChange={e => updateField('description', e.target.value)} placeholder="없으면 비워두세요"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-amber-600 mb-0.5">배경 이미지 묘사</label>
                        <input type="text" value={pVisual} onChange={e => updateField('visual', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setPipelineStep('scriptReview')}
                className="px-4 py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-all text-sm">
                ← 원고 수정
              </button>
              <button onClick={handleGenerateImages} disabled={isGeneratingImages}
                className="flex-1 py-3.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 disabled:opacity-50">
                🎨 이미지 생성하기 ({cards.length}장)
              </button>
            </div>
          </div>
        ) : learnedTemplate && cards.length > 0 && pipelineStep === 'idle' ? (
          <CardNewsRenderer
            slides={cards.map(c => ({
              index: c.index,
              role: c.role,
              subtitle: c.role,
              title: c.title,
              description: c.body,
              visual: '',
            }))}
            template={learnedTemplate}
            onSlidesChange={(updated) => {
              setCards(prev => prev.map((c, i) => ({
                ...c,
                role: updated[i]?.subtitle || c.role,
                title: updated[i]?.title || c.title,
                body: updated[i]?.description || c.body,
              })));
            }}
            hospitalName={hospitalName}
          />
        ) : cards.length > 0 ? (
          <div className="space-y-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">카드뉴스 · {cards.length}장</span>
                {saveStatus && <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{saveStatus}</span>}
              </div>
            </div>

            {/* 카드 그리드 */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map(card => (
                <div key={card.index} className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* 카드 번호 배지 */}
                  <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center justify-center">
                    {card.index}
                  </div>

                  {/* 이미지 */}
                  <div className="aspect-square bg-slate-100 relative">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={`카드 ${card.index}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                      </div>
                    )}

                    {/* 재생성 중 오버레이 */}
                    {regeneratingCard === card.index && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <div className="w-8 h-8 border-3 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
                      </div>
                    )}

                    {/* 호버 액션 버튼 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button onClick={() => openCardRegenModal(card.index)} disabled={regeneratingCard !== null}
                        className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-lg"
                      >🔄 재생성</button>
                      {card.imageUrl && (
                        <button onClick={() => handleCardDownload(card)}
                          className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-lg"
                        >💾 저장</button>
                      )}
                    </div>
                  </div>

                  {/* 이전 버전 히스토리 */}
                  {card.imageHistory.length > 1 && (
                    <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-100">
                      <div className="text-[9px] text-slate-400 mb-1">이전 버전 ({card.imageHistory.length - 1}개)</div>
                      <div className="flex gap-1 overflow-x-auto pb-0.5">
                        {card.imageHistory.slice(0, -1).reverse().map((h, hi) => (
                          <button key={hi} type="button" title="클릭하여 이 버전으로 되돌리기"
                            onClick={() => setCards(prev => prev.map(c => {
                              if (c.index !== card.index) return c;
                              const updated = [...c.imageHistory];
                              if (c.imageUrl) updated.push({ url: c.imageUrl, prompt: c.imagePrompt, createdAt: Date.now() });
                              const target = card.imageHistory.slice(0, -1).reverse()[hi];
                              const idx = updated.findIndex(u => u.url === target.url);
                              if (idx >= 0) updated.splice(idx, 1);
                              while (updated.length > 5) updated.shift();
                              return { ...c, imageUrl: target.url, imagePrompt: target.prompt, imageHistory: updated };
                            }))}
                            className="flex-shrink-0 w-10 h-10 rounded border border-slate-200 overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all">
                            <img src={h.url} alt={`v${hi + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 텍스트 */}
                  <div className="px-3 pt-3 pb-2">
                    <p className="text-[10px] text-pink-500 font-semibold mb-0.5">{card.role}</p>
                    <p className="text-xs font-bold text-slate-800 mb-1 line-clamp-2">{card.title}</p>
                    {card.body && <p className="text-[11px] text-slate-500 line-clamp-3">{card.body}</p>}
                  </div>

                  {/* 상시 표시되는 액션 버튼 */}
                  <div className="px-3 pb-3 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openCardRegenModal(card.index)}
                      disabled={regeneratingCard !== null}
                      className="flex-1 py-1.5 bg-pink-50 text-pink-600 text-[10px] font-bold rounded-lg hover:bg-pink-100 transition-colors disabled:opacity-40"
                    >
                      ✏️ 수정/재생성
                    </button>
                    {card.imageUrl && (
                      <button
                        type="button"
                        onClick={() => handleCardDownload(card)}
                        className="px-3 py-1.5 bg-slate-50 text-slate-500 text-[10px] font-bold rounded-lg hover:bg-slate-100 transition-colors"
                        title="PNG 다운로드"
                      >
                        💾
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* EmptyState */
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              {[4, 5, 6, 7].map(n => (
                <div key={n} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-300">{n}</div>
              ))}
              <div className="w-px h-4 mx-1 bg-slate-200" />
              <div className="text-[10px] text-slate-300 font-medium">slides</div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100">
                <svg className="w-7 h-7 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 만드는<br /><span className="text-pink-600">카드뉴스</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">주제 하나로 슬라이드별 원고 + 이미지를<br />자동 생성합니다</p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['슬라이드별 역할 자동 배분', '카드별 이미지 자동 생성', '3초 임팩트 카피라이팅', '의료광고법 준수'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-pink-400">✦</span>{text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-pink-50 text-pink-500 border border-pink-100">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 카드 재생성 모달 ── */}
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
