'use client';

import { useState, useCallback, useEffect } from 'react';
import { TEAM_DATA } from '../../../lib/teamData';
import { CATEGORIES } from '../../../lib/constants';
import { buildCardNewsPrompt, type CardNewsRequest } from '../../../lib/cardNewsPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe, supabase } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { CARD_NEWS_DESIGN_TEMPLATES } from '../../../lib/cardNewsDesignTemplates';
import { ErrorPanel } from '../../../components/GenerationResult';
import { CardRegenModal, type CardPromptHistoryItem, CARD_PROMPT_HISTORY_KEY, CARD_REF_IMAGE_KEY } from '../../../components/CardRegenModal';
import { ContentCategory } from '../../../lib/types';
import type { WritingStyle, CardNewsDesignTemplateId, TrendingItem, AudienceMode } from '../../../lib/types';

interface CardSlide {
  index: number;
  role: string;
  title: string;
  body: string;
  imagePrompt: string;
  imageUrl: string | null;
}

const IMAGE_STYLE_OPTIONS = [
  { id: 'photo', icon: '📸', label: '실사' },
  { id: 'illustration', icon: '🎨', label: '일러스트' },
  { id: 'medical', icon: '🫀', label: '의학 3D' },
  { id: 'custom', icon: '✏️', label: '커스텀' },
] as const;

type ImageStyleType = 'photo' | 'illustration' | 'medical' | 'custom';

export default function CardNewsPage() {
  // ── 폼 상태 ──
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [slideCount, setSlideCount] = useState(6);
  const [designTemplateId, setDesignTemplateId] = useState<CardNewsDesignTemplateId | undefined>(undefined);
  const [imageStyle, setImageStyle] = useState<ImageStyleType>('illustration');
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [customImagePrompt, setCustomImagePrompt] = useState('');
  // 트렌드 주제
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [cards, setCards] = useState<CardSlide[]>([]);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'script' | 'preview' | 'image'>('idle');
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

  // ── 이미지 생성 헬퍼 (OLD cardNewsImageService.generateSingleImage 동일 파이프라인) ──
  const generateCardImage = async (prompt: string, index: number, refImage?: string): Promise<string | null> => {
    try {
      // 디자인 템플릿의 배경색/스타일 프롬프트 반영
      const tmpl = designTemplateId ? CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId) : undefined;
      const bgColor = tmpl?.colors?.background || '#E8F4FD';
      const templateBlock = tmpl ? `[디자인 템플릿: ${tmpl.name}]\n${tmpl.stylePrompt}\n배경색: ${bgColor}` : '';

      // 커스텀 스타일: 사용자 프롬프트 추가
      const customBlock = imageStyle === 'custom' && customImagePrompt ? `\n[사용자 지정 스타일]\n${customImagePrompt}` : '';
      // 프롬프트에 템플릿 블록 추가
      const fullPrompt = `${prompt}\n${templateBlock}${customBlock}`.trim();

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

      // Supabase Storage 업로드
      if (supabase) {
        try {
          const dataUrl = data.imageDataUrl;
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
      return data.imageDataUrl;
    } catch {
      return null;
    }
  };

  // ── 메인 생성 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const derivedWritingStyle: WritingStyle = audienceMode === '전문가용(신뢰/정보)' ? 'expert' : 'empathy';
    const request: CardNewsRequest = {
      topic: topic.trim(),
      keywords: keywords.trim() || undefined,
      hospitalName: hospitalName || undefined,
      slideCount,
      writingStyle: derivedWritingStyle,
      designTemplateId,
    };

    setIsGenerating(true);
    setError(null);
    setCards([]);
    setSaveStatus(null);
    setProgress('슬라이드 원고 작성 중...');

    try {
      // Stage 1: 텍스트 원고 생성
      const { systemInstruction, prompt } = buildCardNewsPrompt(request);
      let finalPrompt = prompt;
      // 말투 주입
      if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) finalPrompt += `\n\n[병원 말투 적용]\n${stylePrompt}`;
        } catch { /* ignore */ }
      }
      // 이미지 프롬프트도 같이 요청 — OLD 구조화 형식 (subtitle/mainTitle/description/비주얼)
      finalPrompt += `\n\n## 이미지 프롬프트
각 슬라이드에 어울리는 이미지 프롬프트를 아래 형식으로 작성하세요:
**이미지**:
subtitle: "(부제 텍스트)"
mainTitle: "(메인 제목 텍스트)"
description: "(설명 텍스트)"
비주얼: (배경 이미지 내용을 한국어로 30자 이내 묘사 — 텍스트/글자/라벨 절대 금지, 시각적 장면만)`;

      console.info(`[CARD] ========== 카드뉴스 생성 시작 ==========`);
      console.info(`[CARD] 주제="${topic}" 슬라이드=${slideCount}장 스타일=${derivedWritingStyle} 템플릿=${designTemplateId || 'auto'}`);

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          systemInstruction,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.85,
          maxOutputTokens: 8192,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setError(data.error || `서버 오류 (${res.status})`);
        return;
      }

      console.info(`[CARD] 원고 생성 완료 — ${data.text.length}자`);

      // Stage 2: 파싱 — 슬라이드별 분리
      const parsedCards: CardSlide[] = [];
      const slideBlocks = data.text.split(/###\s*(\d+)장[:\s]*/);

      for (let i = 1; i < slideBlocks.length; i += 2) {
        const num = parseInt(slideBlocks[i], 10);
        const block = slideBlocks[i + 1] || '';
        const roleMatch = block.match(/^(.+?)[\n\r]/);
        const titleMatch = block.match(/\*\*제목\*\*[:\s]*(.+)/m) || block.match(/\*\*메인.*?\*\*[:\s]*(.+)/m);
        const bodyMatch = block.match(/\*\*본문\*\*[:\s]*([\s\S]*?)(?=\*\*|$)/m) || block.match(/\*\*부제\*\*[:\s]*(.+)/m);
        // 이미지 프롬프트: 구조화 형식 또는 단순 형식
        const imgSection = block.match(/\*\*이미지\*\*[:\s]*([\s\S]*?)(?=###|$)/m);
        let imagePrompt = '';
        if (imgSection) {
          const imgText = imgSection[1].trim();
          // 구조화 형식이면 그대로 (subtitle/mainTitle/비주얼 포함)
          if (imgText.includes('subtitle:') || imgText.includes('mainTitle:') || imgText.includes('비주얼:')) {
            imagePrompt = imgText;
          } else {
            // 단순 형식 → 구조화 형식으로 변환
            const title = titleMatch?.[1]?.trim() || '';
            const subtitle = roleMatch?.[1]?.replace(/\*\*/g, '').trim() || '';
            const desc = bodyMatch?.[1]?.trim() || '';
            imagePrompt = `subtitle: "${subtitle}"\nmainTitle: "${title}"\n${desc ? `description: "${desc}"\n` : ''}비주얼: ${imgText}`;
          }
        } else {
          const title = titleMatch?.[1]?.trim() || `슬라이드 ${num}`;
          const subtitle = roleMatch?.[1]?.replace(/\*\*/g, '').trim() || '';
          imagePrompt = `subtitle: "${subtitle}"\nmainTitle: "${title}"\n비주얼: ${topic} 관련 의료 건강 이미지`;
        }

        parsedCards.push({
          index: num,
          role: roleMatch?.[1]?.replace(/\*\*/g, '').trim() || `${num}장`,
          title: titleMatch?.[1]?.trim() || `슬라이드 ${num}`,
          body: bodyMatch?.[1]?.trim() || '',
          imagePrompt,
          imageUrl: null,
        });
      }

      // 파싱 실패 시 단순 분할
      if (parsedCards.length === 0) {
        for (let i = 0; i < slideCount; i++) {
          parsedCards.push({
            index: i + 1,
            role: i === 0 ? '표지' : i === slideCount - 1 ? '마무리' : `본문 ${i}`,
            title: `슬라이드 ${i + 1}`,
            body: '',
            imagePrompt: `medical health ${topic} slide ${i + 1}`,
            imageUrl: null,
          });
        }
      }

      setCards(parsedCards);
      setRawScriptText(data.text);
      setPipelineStep('preview');
      console.info(`[CARD] 파싱 완료 — ${parsedCards.length}장 → 프롬프트 미리보기 단계`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
      setPipelineStep('idle');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  // ── Stage 3: 이미지 생성 (프롬프트 승인 후) ──
  const handleGenerateImages = async () => {
    if (cards.length === 0) return;
    setIsGeneratingImages(true);
    setPipelineStep('image');
    setProgress(`이미지 생성 중... (0/${cards.length}장) — 1장째 스타일 기준 설정`);

    try {
      let firstImageUrl: string | null = null;
      const imageResults: { index: number; url: string | null }[] = [];

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        setProgress(`이미지 생성 중... (${i + 1}/${cards.length}장)${i === 0 ? ' — 1장째 스타일 기준 설정' : ' — 1장째 스타일 참조'}`);
        const url = await generateCardImage(card.imagePrompt, card.index, i > 0 && firstImageUrl ? firstImageUrl : undefined);
        imageResults.push({ index: card.index, url });
        if (i === 0 && url) firstImageUrl = url;
      }

      const finalCards = cards.map(card => {
        const result = imageResults.find(r => r.index === card.index);
        return { ...card, imageUrl: result?.url || null };
      });
      setCards(finalCards);

      const successCount = finalCards.filter(c => c.imageUrl).length;
      console.info(`[CARD] 이미지 생성 완료 — ${successCount}/${finalCards.length}장 성공`);

      // 저장
      try {
        const { userId, userEmail } = await getSessionSafe();
        await savePost({
          userId, userEmail, hospitalName: hospitalName || undefined, postType: 'card_news',
          title: finalCards[0]?.title || topic, content: rawScriptText,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
        });
        setSaveStatus('저장 완료');
      } catch { setSaveStatus('저장 실패'); }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setIsGeneratingImages(false);
      setPipelineStep('idle');
      setProgress('');
    }
  };

  // ── 초기 로드: 프롬프트 히스토리 + 참고 이미지 ──
  useEffect(() => {
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
      const newPrompt = `1:1 카드뉴스, ${editSubtitle ? `"${editSubtitle}"` : ''} ${editMainTitle ? `"${editMainTitle}"` : ''} ${editDescription ? `"${editDescription}"` : ''}, 밝고 친근한 분위기`.trim();
      setEditImagePrompt(newPrompt);
    }
  }, [editSubtitle, editMainTitle, editDescription]);

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
          prompt: `다음 카드뉴스 슬라이드에 어울리는 이미지 프롬프트를 한글로 작성해주세요.\n부제: ${editSubtitle}\n제목: ${editMainTitle}\n설명: ${editDescription}\n\n1:1 카드뉴스 이미지 프롬프트만 출력하세요. 텍스트/글자 절대 금지.`,
          systemInstruction: '이미지 생성용 프롬프트 작성 전문가. 한글로 시각적 장면만 묘사하세요.',
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 500,
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
      const promptToUse = editImagePrompt || `1:1 카드뉴스, "${editSubtitle}" "${editMainTitle}" "${editDescription}", 밝고 친근한 분위기`;
      const url = await generateCardImage(promptToUse, cardRegenIndex, cardRegenRefImage || undefined);

      setCards(prev => prev.map(c =>
        c.index === cardRegenIndex
          ? { ...c, imageUrl: url, imagePrompt: promptToUse, title: editMainTitle || c.title, body: editDescription || c.body, role: editSubtitle || c.role }
          : c
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

  // ── 트렌드 주제 추천 (OLD parity — 네이버 뉴스 → Gemini 분석) ──
  const handleRecommendTrends = useCallback(async () => {
    setIsLoadingTrends(true);
    setTrendingItems([]);
    try {
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const year = koreaTime.getFullYear();
      const month = koreaTime.getMonth() + 1;
      const day = koreaTime.getDate();
      const hour = koreaTime.getHours();
      const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][koreaTime.getDay()];
      const dateStr = `${year}년 ${month}월 ${day}일 (${dayOfWeek}) ${hour}시`;
      const randomSeed = Math.floor(Math.random() * 1000);

      const seasonalContext: Record<number, string> = {
        1: '신년 건강검진 시즌, 겨울철 독감/감기, 난방으로 인한 건조',
        2: '설 연휴 후 피로, 환절기 시작, 미세먼지 증가',
        3: '본격 환절기, 꽃가루 알레르기, 황사/미세먼지',
        4: '봄철 야외활동 증가, 알레르기 비염 최고조',
        5: '초여름, 식중독 주의 시작, 냉방병 예고',
        6: '장마철 습도, 무좀/피부질환, 식중독 급증',
        7: '폭염, 열사병/일사병, 냉방병 본격화',
        8: '극심한 폭염, 온열질환 피크, 휴가 후 피로',
        9: '환절기 시작, 가을 알레르기, 일교차 큰 시기',
        10: '환절기 감기, 독감 예방접종 시즌, 건강검진 시즌',
        11: '본격 독감 시즌, 난방 시작, 건조한 피부',
        12: '독감 절정기, 연말 피로, 동상/저체온증',
      };

      const categoryHints: Record<string, string> = {
        '치과': '충치, 잇몸질환, 임플란트, 치아미백, 교정, 사랑니, 치주염',
        '피부과': '여드름, 아토피, 건선, 탈모, 피부건조, 대상포진',
        '정형외과': '관절통, 허리디스크, 어깨통증, 무릎연골, 오십견, 척추관협착증',
      };

      const newsSearchKeywords: Record<string, string> = {
        '치과': '치과 치료 OR 임플란트 OR 잇몸',
        '피부과': '피부 건강 OR 아토피 OR 탈모',
        '정형외과': '관절 통증 OR 허리디스크 OR 어깨통증',
      };
      const searchKeyword = newsSearchKeywords[category] || `${category} 건강`;

      let newsContext = '';
      try {
        const newsRes = await fetch(`/api/naver/news?query=${encodeURIComponent(searchKeyword)}&display=10`);
        if (newsRes.ok) {
          const newsData = await newsRes.json() as { items?: Array<{ title?: string; description?: string }> };
          const newsItems = (newsData.items || []).slice(0, 5);
          if (newsItems.length > 0) {
            const newsText = newsItems.map((item, i) =>
              `${i + 1}. ${(item.title || '').replace(/<[^>]*>/g, '')} — ${(item.description || '').replace(/<[^>]*>/g, '').substring(0, 100)}`
            ).join('\n');
            const analysisRes = await fetch('/api/gemini', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: `다음은 "${category}" 관련 최신 네이버 뉴스입니다:\n\n${newsText}\n\n핵심 이슈 3가지, SEO 키워드 5개, 콘텐츠 아이디어 2개를 간결히 정리하세요.`, model: 'gemini-3.1-flash-lite-preview', temperature: 0.4, maxOutputTokens: 1000 }),
            });
            const analysisData = await analysisRes.json() as { text?: string };
            if (analysisData.text) newsContext = analysisData.text;
          }
        }
      } catch {
        try {
          const fallbackRes = await fetch('/api/gemini', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: `최근 한국 "${category}" 관련 건강 뉴스 트렌드를 검색하여 핵심 이슈 3가지를 요약해주세요.`, model: 'gemini-3.1-flash-lite-preview', googleSearch: true, temperature: 0.4, maxOutputTokens: 800 }),
          });
          const fallbackData = await fallbackRes.json() as { text?: string };
          if (fallbackData.text) newsContext = fallbackData.text;
        } catch { /* 뉴스 없이 진행 */ }
      }

      const currentSeasonContext = seasonalContext[month] || '';
      const catKeywords = categoryHints[category] || '일반적인 건강 증상, 예방, 관리';

      const prompt = `[🕐 현재 시각: ${dateStr} (한국 표준시)]
[🎲 다양성 시드: ${randomSeed}]

당신은 네이버/구글 검색 트렌드 분석 전문가입니다.
'${category}' 진료과와 관련하여 **지금 이 시점**에 카드뉴스로 만들기 좋은 건강/의료 주제 5가지를 추천해주세요.

[📅 ${month}월 시즌 특성]
${currentSeasonContext}

[🏥 ${category} 관련 키워드 풀]
${catKeywords}
${newsContext ? `\n[📰 최신 네이버 뉴스 분석]\n${newsContext}\n\n⚠️ 뉴스 기반 트렌드 주제 1~2개를 반드시 포함하세요.` : ''}

[⚠️ 중요 규칙]
1. 매번 다른 결과 필수 (시드: ${randomSeed})
2. 구체적인 주제명: "어깨통증" 대신 "겨울철 어깨 뻣뻣함 원인과 해결법" 등
3. ${month}월 ${day}일 기준 계절/시기 반영
4. 카드뉴스 주제로 적합한 형태 (리스트형, 퀴즈형, 비교형 등)
5. 다양한 난이도: 경쟁 높은 주제 2개 + 틈새 주제 3개`;

      const res = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt, model: 'gemini-3.1-flash-lite-preview', responseType: 'json', googleSearch: true, temperature: 0.9, timeout: 60000,
          schema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { topic: { type: 'STRING' }, keywords: { type: 'STRING' }, score: { type: 'NUMBER' }, seasonal_factor: { type: 'STRING' } }, required: ['topic', 'keywords', 'score', 'seasonal_factor'] } },
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
  }, [category]);

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

            {/* 주제 */}
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="카드뉴스 주제 (예: 임플란트 시술 과정 안내)" required className={inputCls} />

            {/* 🔥 트렌드 주제 (OLD parity) */}
            <button type="button" onClick={handleRecommendTrends} disabled={isLoadingTrends}
              className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all disabled:opacity-40 flex items-center justify-center gap-1">
              {isLoadingTrends ? <><div className="w-3 h-3 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin" />분석 중...</> : <>🔥 트렌드 주제</>}
            </button>

            {/* 트렌드 주제 결과 */}
            {trendingItems.length > 0 && (
              <div className="space-y-1">
                {trendingItems.map((item, idx) => (
                  <button key={idx} type="button" onClick={() => setTopic(item.topic)}
                    className="w-full text-left px-3 py-2 bg-white border border-slate-100 rounded-lg hover:border-blue-400 transition-all group relative">
                    <div className="absolute top-2 right-2 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">SEO {item.score}</div>
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 block pr-12">{item.topic}</span>
                    <p className="text-[11px] text-slate-400 truncate">{item.keywords} · {item.seasonal_factor}</p>
                  </button>
                ))}
              </div>
            )}

            {/* ⚙️ 상세 설정 (OLD parity: 접기/펼치기) */}
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-500 transition-all border border-slate-100">
              <span>⚙️ 상세 설정</span>
              <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>

            {showAdvanced && (
              <div className="space-y-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                {/* 병원 선택 */}
                <div>
                  <label className={labelCls}>병원 선택 (선택)</label>
                  <div className="relative">
                    <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} onFocus={() => setShowHospitalPicker(true)} placeholder="병원명 입력 또는 선택" className={inputCls} />
                    {showHospitalPicker && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowHospitalPicker(false)} />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
                          {TEAM_DATA.map(team => (
                            <div key={team.id}>
                              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 sticky top-0">{team.label}</div>
                              {team.hospitals.map(h => (
                                <button key={`${team.id}-${h.name}`} type="button" onClick={() => { setHospitalName(h.name); setShowHospitalPicker(false); }}
                                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-pink-50 hover:text-pink-700 transition-colors">
                                  {h.name}<span className="text-[11px] text-slate-400 ml-2">{h.manager}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 디자인 템플릿 */}
                <div>
                  <label className={labelCls}>디자인 템플릿</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {CARD_NEWS_DESIGN_TEMPLATES.map(tmpl => (
                      <button key={tmpl.id} type="button"
                        onClick={() => setDesignTemplateId(designTemplateId === tmpl.id ? undefined : tmpl.id)}
                        className={`relative flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-all ${designTemplateId === tmpl.id ? 'border-pink-500 bg-pink-50 shadow-md shadow-pink-500/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        {designTemplateId === tmpl.id && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-pink-500 rounded-full flex items-center justify-center">
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                        )}
                        <div className="w-full aspect-square rounded-lg overflow-hidden" dangerouslySetInnerHTML={{ __html: tmpl.previewSvg }} />
                        <span className="text-[9px] font-semibold text-slate-600 leading-tight text-center">{tmpl.name}</span>
                      </button>
                    ))}
                  </div>
                  {designTemplateId ? (
                    <div className="mt-2 px-2.5 py-1.5 bg-pink-50 rounded-lg border border-pink-200">
                      <p className="text-[10px] text-pink-700 font-medium">
                        {CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId)?.icon}{' '}
                        {CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId)?.description}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400">선택하지 않으면 AI가 자동으로 디자인합니다.</p>
                  )}
                </div>

                {/* 카드뉴스 장수 */}
                <div>
                  <label className={labelCls}>카드뉴스 장수 <span className="text-pink-600 font-bold">{slideCount}장</span></label>
                  <input type="range" min={4} max={7} step={1} value={slideCount} onChange={e => setSlideCount(Number(e.target.value))} className="w-full accent-pink-600" />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>4장</span><span>7장</span></div>
                </div>

                {/* 이미지 스타일 (OLD parity: 4종) */}
                <div>
                  <label className={labelCls}>이미지 스타일</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {IMAGE_STYLE_OPTIONS.map(s => (
                      <button key={s.id} type="button" onClick={() => setImageStyle(s.id)}
                        className={`py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${imageStyle === s.id ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                      >
                        <span className="text-base">{s.icon}</span>
                        <span className="text-[10px] font-semibold">{s.label}</span>
                      </button>
                    ))}
                  </div>
                  {/* 커스텀 프롬프트 (커스텀 선택 시) */}
                  {imageStyle === 'custom' && (
                    <textarea value={customImagePrompt} onChange={e => setCustomImagePrompt(e.target.value)}
                      placeholder="원하는 이미지 스타일을 직접 입력하세요 (예: 수채화 느낌, 따뜻한 파스텔톤, 손그림 스타일...)"
                      rows={2} className="w-full mt-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 resize-none" />
                  )}
                </div>
              </div>
            )}

            {/* 생성 버튼 */}
            <button type="submit" disabled={isGenerating || !topic.trim()}
              className="w-full py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>생성 중...</>
              ) : '카드뉴스 생성하기'}
            </button>
          </div>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {(isGenerating || isGeneratingImages) ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-pink-50 text-pink-600 border border-pink-100">
              <span>🎨</span><span>{isGeneratingImages ? '이미지 생성 중' : '원고 작성 중'}</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-pink-100 border-t-pink-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">{progress || (isGeneratingImages ? '카드 이미지를 생성하고 있어요' : `${slideCount}장 분량의 원고를 작성하고 있어요`)}</p>
            <p className="text-xs text-slate-400">{isGeneratingImages ? '1장째 스타일 기준으로 통일된 이미지를 만듭니다' : '원고 작성 → 프롬프트 확인 → 이미지 생성 순서로 진행됩니다'}</p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : pipelineStep === 'preview' && cards.length > 0 && !cards.some(c => c.imageUrl) ? (
          /* ── 프롬프트 미리보기 단계 ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  📝 원고 확인
                </span>
                <span className="text-xs text-slate-500">{cards.length}장 · 프롬프트를 확인/수정한 뒤 이미지를 생성하세요</span>
              </div>
            </div>

            <div className="space-y-3">
              {cards.map((card, idx) => (
                <div key={card.index} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center flex-none">{card.index}</span>
                    <span className="text-xs font-bold text-slate-700">{card.role}</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">제목</label>
                      <input type="text" value={card.title}
                        onChange={e => setCards(prev => prev.map((c, i) => i === idx ? { ...c, title: e.target.value } : c))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">본문</label>
                      <textarea value={card.body} rows={2}
                        onChange={e => setCards(prev => prev.map((c, i) => i === idx ? { ...c, body: e.target.value } : c))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500/20 resize-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">이미지 프롬프트</label>
                      <textarea value={card.imagePrompt} rows={3}
                        onChange={e => setCards(prev => prev.map((c, i) => i === idx ? { ...c, imagePrompt: e.target.value } : c))}
                        className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleGenerateImages}
              className="w-full py-3.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20">
              🎨 이미지 생성하기 ({cards.length}장)
            </button>
          </div>
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

                  {/* 텍스트 */}
                  <div className="p-3">
                    <p className="text-[10px] text-pink-500 font-semibold mb-0.5">{card.role}</p>
                    <p className="text-xs font-bold text-slate-800 mb-1 line-clamp-2">{card.title}</p>
                    {card.body && <p className="text-[11px] text-slate-500 line-clamp-3">{card.body}</p>}
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
