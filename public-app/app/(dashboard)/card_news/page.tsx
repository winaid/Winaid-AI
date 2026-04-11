'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CATEGORIES } from '../../../lib/constants';
import { buildCardNewsProPrompt, type CardNewsRequest } from '../../../lib/cardNewsPrompt';
import { savePost, listPosts, deletePost, type SavedPost } from '../../../lib/postStorage';
import { getSessionSafe, supabase, getSupabaseClient, isSupabaseConfigured } from '../../../lib/supabase';
import { CARD_NEWS_DESIGN_TEMPLATES } from '../../../lib/cardNewsDesignTemplates';
import { ErrorPanel } from '../../../components/GenerationResult';
import { CardRegenModal, type CardPromptHistoryItem, CARD_PROMPT_HISTORY_KEY, CARD_REF_IMAGE_KEY } from '../../../components/CardRegenModal';
import CardTemplateManager from '../../../components/CardTemplateManager';
import BrandPresetEditor from '../../../components/card-news/BrandPresetEditor';
import { brandPresetToTheme } from '../../../lib/brandPreset';
import { getBrandPreset } from '../../../lib/styleService';
import CardNewsRenderer from '../../../components/CardNewsRenderer';
import CardNewsProRenderer from '../../../components/CardNewsProRenderer';
import { DEFAULT_THEME, COVER_TEMPLATES, CARD_FONTS, FONT_CATEGORIES, type DesignPresetStyle, parseProSlidesJson, ensureSlideIds, generateSlideId, type SlideData as ProSlideData, type CardNewsTheme, type SlideLayoutType } from '../../../lib/cardNewsLayouts';
import { buildLayoutDefaults } from '../../../lib/cardAiActions';
import { getSavedTemplates, deleteTemplate, imageToEditableTemplate, type CardTemplate } from '../../../lib/cardTemplateService';
import { saveDraft, loadDraft, clearDraft, type CardNewsDraft, type CardRatio, type LoadDraftResult } from '../../../lib/cardNewsDraft';
import { ContentCategory } from '../../../lib/types';
import type { WritingStyle, CardNewsDesignTemplateId, TrendingItem, AudienceMode } from '../../../lib/types';
import { useCreditContext } from '../layout';
import { useCredit as cardNewsUseCredit } from '../../../lib/creditService';
import { consumeGuestCredit } from '../../../lib/guestCredits';
import { overlayLogo } from '../../../lib/cardDownloadUtils';
import { applyContentFilters } from '../../../lib/medicalLawFilter';

function GeneratingTimer({ progress, slideCount = 6 }: { progress: string; slideCount?: number }) {
  // 장수 기반 동적 추정치 — 4장≈50초, 6장≈70초, 8장≈90초, 10장≈110초 (30~120초 클램프)
  const ESTIMATE = Math.max(30, Math.min(120, slideCount * 10 + 10));
  const [remaining, setRemaining] = useState(ESTIMATE);
  useEffect(() => {
    setRemaining(ESTIMATE);
    const id = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
    // ESTIMATE가 바뀌면 타이머 재시작
  }, [ESTIMATE]);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  const pct = Math.min(100, Math.round(((ESTIMATE - remaining) / ESTIMATE) * 100));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center mb-4">
      {/* 프로그레스 바 */}
      <div className="w-full h-2 bg-slate-100 rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm font-medium text-slate-700">{progress || '생성 중...'}</p>
      <p className="text-xs text-slate-400 mt-2">
        {remaining > 0 ? `약 ${min > 0 ? `${min}분 ` : ''}${sec}초 남음` : '거의 완료...'}
      </p>
    </div>
  );
}

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

type ImageStyleType = 'photo' | 'illustration' | 'medical' | 'custom' | 'infographic';

// ── URL 모드: crawl-hospital-blog 응답 타입 + 헬퍼 ──

/**
 * `/api/naver/crawl-hospital-blog` 응답 형식.
 * 실제 라우트는 `posts.logNo` 를 응답에서 제거한 상태로 반환 (route.ts 참고).
 */
interface CrawlHospitalBlogPost {
  url: string;
  content: string;         // 이미 cleanHtml 로 HTML 태그·엔티티 제거된 순수 텍스트
  title: string;
  publishedAt: string;
  summary: string;
  thumbnail: string;
}
interface CrawlHospitalBlogResponse {
  success: boolean;
  blogUrl: string;
  blogId?: string;
  posts: CrawlHospitalBlogPost[];
  postsCount: number;
  diagnostics?: string[];
  elapsedMs?: number;
  timestamp?: string;
  message?: string;
  error?: string;
}

/**
 * 서버 응답에서 첫 글의 본문 텍스트를 추출.
 * posts[0].content 는 서버에서 이미 HTML 태그·엔티티가 제거된 순수 텍스트라
 * 추가 파싱 없이 그대로 사용 가능. 단, 제목을 본문 앞에 prepend 해서 원문의
 * 맥락(제목)을 카드뉴스 생성 시 AI 에게 함께 제공한다.
 */
function extractTextFromCrawlResponse(data: CrawlHospitalBlogResponse): string {
  const first = data.posts?.[0];
  if (!first || !first.content) return '';
  const title = (first.title || '').trim();
  const body = first.content.trim();
  return title ? `${title}\n\n${body}` : body;
}

/**
 * 네이버 블로그 URL 에서 특정 글의 logNo 를 추출 (클라이언트 사이드 사전 파싱).
 * 서버도 같은 로직을 가지고 있지만, 클라이언트에서 미리 파싱해 targetLogNo 로
 * 넘기면 서버가 path 파싱을 다시 시도할 필요 없이 바로 경로 분기 가능.
 */
function extractNaverLogNo(blogUrl: string): string | null {
  const pathMatch = blogUrl.match(/(?:m\.)?blog\.naver\.com\/[^/?#]+\/(\d{8,})/);
  if (pathMatch) return pathMatch[1];
  const qMatch = blogUrl.match(/[?&]logNo=(\d{8,})/);
  if (qMatch) return qMatch[1];
  return null;
}

export default function CardNewsPage() {
  const creditCtx = useCreditContext();
  // ── 입력 모드 ──
  // - topic: 주제 한 줄 입력 (기존 기본값)
  // - source: 장문 소스 콘텐츠(블로그·스크립트 등) 직접 붙여넣기
  // - url: 네이버 블로그/일반 웹페이지 URL → 자동 본문 가져오기 → sourceContent 에 주입
  const [inputMode, setInputMode] = useState<'topic' | 'source' | 'url'>('topic');
  const [sourceContent, setSourceContent] = useState('');
  // URL 모드 전용 state
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  // ── 폼 상태 ──
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoOpacity, setLogoOpacity] = useState(100);
  const logoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => { try { const sb = getSupabaseClient(); const { data: { user } } = await sb.auth.getUser(); const hName = user?.user_metadata?.hospital_name || user?.user_metadata?.hospitalName; if (hName) setHospitalName(hName); } catch {} })();
  }, []);
  const [slideCount, setSlideCount] = useState(0); // 0 = 자동
  const [proCardRatio, setProCardRatio] = useState<'1:1' | '3:4' | '4:5' | '9:16' | '16:9'>('1:1');
  const [designTemplateId, setDesignTemplateId] = useState<CardNewsDesignTemplateId | undefined>(undefined);
  const [imageStyle, setImageStyle] = useState<ImageStyleType>('illustration');
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [contentMode, setContentMode] = useState<'simple' | 'detailed'>('simple');
  const [proSlides, setProSlides] = useState<ProSlideData[]>([]);
  const [proTheme, setProTheme] = useState<CardNewsTheme>({ ...DEFAULT_THEME });
  const [learnedTemplate, setLearnedTemplate] = useState<CardTemplate | null>(null);
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
  const savedStyles = useMemo(() => getSavedTemplates(), [savedStylesVersion]);
  // 트렌드 주제
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);

  // ── 생성 상태 ──
  const [mainTab, setMainTab] = useState<'create' | 'learn' | 'history'>('create');
  const [historyPosts, setHistoryPosts] = useState<SavedPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // 히스토리 탭 최초 진입 시 1회만 로드 — 렌더 중 setState 금지 (React 경고 회피)
  useEffect(() => {
    if (mainTab !== 'history') return;
    let cancelled = false;
    setHistoryLoading(true);
    getSessionSafe()
      .then(({ userId }) => listPosts(userId))
      .then(result => {
        if (cancelled) return;
        if ('posts' in result) {
          setHistoryPosts(result.posts.filter(p => p.post_type === 'card_news'));
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab]);
  const [pageStep, setPageStep] = useState<1 | 2>(1);

  // ── 드래프트 자동 저장/복원 (Day 3 강화) ──
  // userId 바인딩 + 저장 실패 노출 + idle timeout(48h) + 만료 임박 경고
  const [draftModalData, setDraftModalData] = useState<LoadDraftResult | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [draftExpiringSoon, setDraftExpiringSoon] = useState<number | null>(null); // 남은 ms
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 현재 사용자 id — layout의 CreditContext가 관리 (게스트는 null)
  const currentUserId = creditCtx.userId;

  // 마운트 시 1회: 유효한 드래프트가 있으면 모달 띄우기 (userId 일치 필요)
  // currentUserId는 layout에서 비동기로 로드되므로 id 확정 시점에 다시 시도
  useEffect(() => {
    const result = loadDraft(currentUserId);
    if (result) {
      setDraftModalData(result);
      if (result.expiringSoon) setDraftExpiringSoon(result.expiresIn);
    }
  }, [currentUserId]);

  // pageStep 2(편집 중)이고 슬라이드가 있을 때만 3초 디바운스 자동 저장
  useEffect(() => {
    if (pageStep !== 2 || proSlides.length === 0) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const now = Date.now();
      const result = saveDraft({
        topic,
        hospitalName,
        proSlides,
        proTheme,
        proCardRatio,
        savedAt: now,
      }, currentUserId);
      if (result.ok) {
        setLastSavedAt(now);
        setDraftSaveError(null);
      } else {
        // 저장 실패 — UI에 경고 노출 (작업 흐름은 막지 않음)
        setDraftSaveError(result.error);
      }
    }, 3000);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [pageStep, proSlides, proTheme, topic, hospitalName, proCardRatio, currentUserId]);

  const TOPIC_SUGGESTIONS: Record<string, string[]> = {
    '치과': ['임플란트 사후관리', '치아미백 전후비교', '스케일링 중요성', '충치 예방 꿀팁', '잇몸 건강 체크리스트', '교정 장치 종류 비교', '사랑니 발치 가이드', '치아보험 알아보기', '올바른 칫솔질법', '임플란트 vs 브릿지'],
    '피부과': ['보톡스 Q&A', '여드름 관리법', '레이저 시술 비교', '자외선 차단 가이드', '피부 타입별 관리', '탈모 예방 습관', '주름 개선 시술', '모공 관리법', '기미 치료 가이드', '피부장벽 강화법'],
    '정형외과': ['관절 건강 체크', '척추 자세 교정', '운동 부상 예방', '무릎 관절 Q&A', '어깨 통증 원인', '허리디스크 예방', '골다공증 예방법', '테니스엘보 관리', '오십견 체크리스트', '발목 염좌 대처법'],
    '안과': ['노안 수술 종류', '라식 vs 라섹 비교', '드라이아이 관리법', '녹내장 조기 발견', '백내장 수술 Q&A', '눈 건강 습관 5가지', '콘택트렌즈 관리', '어린이 시력 검사 시기'],
    '성형외과': ['코 성형 종류 비교', '눈 성형 전후 관리', '지방흡입 Q&A', '리프팅 시술 종류', '가슴 성형 체크리스트', '안면윤곽 수술 가이드', '쌍꺼풀 수술 주의사항'],
    '한의원': ['체질별 건강관리', '침 치료 효과', '한방 다이어트', '산후 보약 가이드', '추나 치료 Q&A', '알레르기 한방 치료', '스트레스 한방 관리법'],
    '산부인과': ['임신 초기 검사 리스트', '산전 검사 가이드', '자궁근종 Q&A', '갱년기 관리법', '피임 방법 비교', '난임 검사 시기', '출산 준비 체크리스트'],
    '내과': ['건강검진 항목 가이드', '당뇨 관리 5단계', '고혈압 생활습관', '위내시경 준비사항', '갑상선 검사 Q&A', '간 건강 지키는 법', '예방접종 스케줄'],
  };
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>(TOPIC_SUGGESTIONS['치과'].slice(0, 5));
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [designPreviews, setDesignPreviews] = useState<{ id: string; imageUrl: string; templateId: string }[]>([]);
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0);
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [cards, setCards] = useState<CardSlide[]>([]);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'scriptReview' | 'promptReview'>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [regeneratingCard, setRegeneratingCard] = useState<number | null>(null);
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

  // overlayLogo — lib/cardDownloadUtils.ts에서 import

  // ── 이미지 생성 헬퍼 ──
  const generateCardImage = async (prompt: string, index: number, refImage?: string): Promise<string | null> => {
    try {
      const tmpl = designTemplateId ? CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId) : undefined;
      const needsTemplate = tmpl && !prompt.includes('[디자인 템플릿:');
      const templateBlock = needsTemplate ? `\n[디자인 템플릿: ${tmpl.name}]\n${tmpl.stylePrompt}\n배경색: ${tmpl.colors.background}` : '';
      const fullPrompt = `${prompt}${templateBlock}`.trim();

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
        try { finalImageDataUrl = await overlayLogo(data.imageDataUrl, logoDataUrl, logoOpacity / 100); } catch { /* 원본 사용 */ }
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
  /** Pexels 배경 검색 키워드 매핑 */
  const [lastPexelsQuery, setLastPexelsQuery] = useState('');

  /** Gemini로 Pexels 검색어 자동 생성 */
  const fetchPexelsQuery = async (): Promise<string> => {
    try {
      const res = await fetch('/api/pexels-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, category }) });
      const { query } = await res.json();
      setLastPexelsQuery(query);
      return query;
    } catch { return 'professional clinic'; }
  };

  /** 추천 디자인 모달 — 이미지 캐시 + 프리페치 */
  const [previewBgImages, setPreviewBgImages] = useState<string[]>([]);
  const previewCacheRef = useRef<Map<string, string[]>>(new Map());
  const skipAutoImagesRef = useRef(false);

  const fetchPreviewImages = async (style: ImageStyleType, force = false) => {
    // 캐시 확인 — 같은 스타일+쿼리면 즉시 반환
    const cacheKey = `${style}:${lastPexelsQuery || topic}`;
    if (!force && previewCacheRef.current.has(cacheKey)) {
      setPreviewBgImages(previewCacheRef.current.get(cacheKey)!);
      return;
    }
    setLoadingPreviews(true);
    try {
      const baseQuery = lastPexelsQuery || await fetchPexelsQuery();
      const count = COVER_TEMPLATES.length;
      const query = baseQuery;
      const page = force ? Math.floor(Math.random() * 5) + 1 : 1;
      let photos: string[];
      if (style === 'photo') {
        // 실사: Pexels + Pixabay(photo) 동시 호출
        const [pexelsRes, pixabayRes] = await Promise.all([
          fetch(`/api/pexels?query=${encodeURIComponent(query)}&orientation=square&per_page=${count}&page=${page}`),
          fetch(`/api/pixabay?query=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=${count}&page=${page}`),
        ]);
        const [pexelsData, pixabayData] = await Promise.all([pexelsRes.json(), pixabayRes.json()]);
        const pexels: string[] = (pexelsData.photos || []).map((p: { url: string }) => p.url);
        const pixabay: string[] = (pixabayData.photos || []).map((p: { url: string }) => p.url);
        photos = [];
        const maxLen = Math.max(pexels.length, pixabay.length);
        for (let j = 0; j < maxLen; j++) {
          if (j < pexels.length) photos.push(pexels[j]);
          if (j < pixabay.length) photos.push(pixabay[j]);
        }
      } else {
        // 일러스트/벡터: Pixabay만 사용 (Pexels는 실사만 반환하므로 제외)
        const pixType = style === 'infographic' ? 'vector' : 'illustration';
        const koreanQuery = topic.trim() || query;
        // 영어+한국어 쿼리 병렬로 더 많은 결과 확보
        const [pixRes1, pixRes2] = await Promise.all([
          fetch(`/api/pixabay?query=${encodeURIComponent(koreanQuery + ' 치과')}&image_type=${pixType}&orientation=horizontal&per_page=${count}&page=${page}`),
          fetch(`/api/pixabay?query=${encodeURIComponent(query + ' dental medical')}&image_type=${pixType}&orientation=horizontal&per_page=${count}&page=${page + 1}`),
        ]);
        const [pixData1, pixData2] = await Promise.all([pixRes1.json(), pixRes2.json()]);
        const p1: string[] = (pixData1.photos || []).map((p: { url: string }) => p.url);
        const p2: string[] = (pixData2.photos || []).map((p: { url: string }) => p.url);
        photos = [...new Set([...p1, ...p2])].slice(0, count * 2);
      }
      previewCacheRef.current.set(cacheKey, photos);
      setPreviewBgImages(photos);
    } catch { /* 실패 시 색상 배경 유지 */ }
    setLoadingPreviews(false);
  };

  // 주제 입력 후 2초 뒤 백그라운드 프리페치 (모달 열기 전 미리 로드)
  useEffect(() => {
    if (!topic.trim()) return;
    const timer = setTimeout(() => {
      fetchPreviewImages('illustration');
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  const openDesignModal = async () => {
    setShowDesignModal(true);
    setSelectedPreviewIdx(0);
    setDesignPreviews(COVER_TEMPLATES.map((tmpl, i) => ({
      id: `preview-${i}`,
      imageUrl: '',
      templateId: tmpl.id,
    })));
    await fetchPreviewImages(imageStyle);
  };

  /**
   * URL 모드: 입력된 URL 에서 본문을 가져와 sourceContent 에 주입한다.
   *
   * 현재 지원:
   *  - 네이버 블로그 (blog.naver.com, m.blog.naver.com) — /api/naver/crawl-hospital-blog 재사용
   *    * 특정 글 URL (`/{blogId}/{logNo}` 또는 `?logNo=`) → 해당 글만 정확히 가져옴
   *    * 블로그 홈 URL → 최신 글 1개를 가져옴
   *  - 그 외 일반 URL — 아직 미지원. 사용자에게 "소스 변환" 탭 붙여넣기 안내.
   *
   * 미지원 도메인을 추가할 때는 서버 사이드 프록시 API 가 필요 (CORS 회피 + SSRF 방어).
   */
  const handleFetchUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;

    setUrlLoading(true);
    setUrlError('');
    setSourceContent('');

    try {
      // 1) URL 형식 검증
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        setUrlError('올바른 URL 형식이 아닙니다.');
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError('http/https URL만 지원합니다.');
        return;
      }

      // 2) 네이버 블로그 판별 (모바일·데스크톱 둘 다 허용)
      const isNaverBlog = parsed.hostname === 'blog.naver.com' || parsed.hostname === 'm.blog.naver.com';
      if (!isNaverBlog) {
        setUrlError('네이버 블로그 외 URL은 현재 자동 가져오기를 지원하지 않습니다. 본문을 복사해서 "소스 변환" 탭에 붙여넣어주세요.');
        return;
      }

      // 3) 서버 크롤러 호출 — path 또는 ?logNo= 에서 특정 글 logNo 추출해 함께 전달.
      //    서버가 targetLogNo 를 받으면 RSS/PostList 단계를 건너뛰고 해당 글만 가져옴.
      const targetLogNo = extractNaverLogNo(url);
      const res = await fetch('/api/naver/crawl-hospital-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: url, maxPosts: 1, targetLogNo: targetLogNo || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(err.message || err.error || `서버 오류 (${res.status})`);
      }

      const data = await res.json() as CrawlHospitalBlogResponse;
      const text = extractTextFromCrawlResponse(data);
      if (!text || text.length < 50) {
        throw new Error('가져온 글의 본문이 너무 짧습니다. 다른 글 URL로 시도해주세요.');
      }
      setSourceContent(text);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : '본문을 가져오는 중 오류가 발생했습니다.');
    } finally {
      setUrlLoading(false);
    }
  };

  const autoApplyBackgrounds = async (slides: ProSlideData[]): Promise<ProSlideData[]> => {
    try {
      const baseQ = lastPexelsQuery || await fetchPexelsQuery();
      let photos: { url: string }[];
      if (imageStyle === 'photo') {
        // 실사: Pexels
        const res = await fetch(`/api/pexels?query=${encodeURIComponent(baseQ)}&orientation=square&per_page=20&page=${Math.floor(Math.random() * 3) + 1}`);
        const data = await res.json();
        photos = (data.photos || []) as { url: string }[];
      } else {
        // 일러스트/벡터: Pexels(치과 정확) + Pixabay 합침
        const rndPage = Math.floor(Math.random() * 3) + 1;
        const [pexRes, pixRes] = await Promise.all([
          fetch(`/api/pexels?query=${encodeURIComponent(baseQ + ' dental')}&orientation=square&per_page=15&page=${rndPage}`),
          fetch(`/api/pixabay?query=${encodeURIComponent((topic.trim() || baseQ) + ' 치과')}&image_type=${imageStyle === 'infographic' ? 'vector' : 'illustration'}&orientation=horizontal&per_page=10&page=${rndPage}`),
        ]);
        const [pexData, pixData] = await Promise.all([pexRes.json(), pixRes.json()]);
        photos = [...(pexData.photos || []), ...(pixData.photos || [])] as { url: string }[];
      }
      if (photos.length > 0) {
        for (let i = 0; i < slides.length; i++) {
          const s = slides[i];
          if (s.imageUrl) continue; // 이미 이미지가 있으면 스킵
          const photo = photos[i % photos.length];
          s.imageUrl = photo.url;
          // 표지/마무리는 배경, 나머지는 상단 이미지
          if (s.layout === 'cover' || s.layout === 'closing') {
            s.imagePosition = 'background';
            if (!s.coverTemplateId) s.coverTemplateId = 'full-image-bottom';
          } else {
            s.imagePosition = 'top';
          }
        }
      }
    } catch { /* Pexels 실패 시 무시 */ }
    return slides;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;

    // 입력 모드별 유효성 검사
    const trimmedSource = sourceContent.trim();
    const trimmedTopic = topic.trim();
    // source / url 모드는 sourceContent 를 요구. url 모드는 본문을 가져온 후부터 유효.
    const isSourceBased = inputMode === 'source' || inputMode === 'url';
    if (isSourceBased) {
      if (trimmedSource.length < 100) {
        setError(inputMode === 'url'
          ? 'URL에서 본문을 먼저 가져와주세요. (최소 100자)'
          : '소스 콘텐츠가 너무 짧습니다. 100자 이상 입력해주세요.');
        return;
      }
    } else {
      if (!trimmedTopic) {
        setError('주제를 입력해주세요.');
        return;
      }
    }
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const derivedWritingStyle: WritingStyle = audienceMode === '전문가용(신뢰/정보)' ? 'expert' : 'empathy';
    // source/url 모드에서 topic 이 비었으면 프롬프트용 플레이스홀더를 넣어준다.
    // (buildCardNewsProPrompt 의 topic 필드는 sanitize + 라벨 용이고, 실제 내용은 sourceContent 가 담당.)
    const effectiveTopic = isSourceBased
      ? (trimmedTopic || '소스 콘텐츠 기반 카드뉴스')
      : trimmedTopic;
    const request: CardNewsRequest = {
      topic: effectiveTopic,
      keywords: keywords.trim() || undefined,
      hospitalName: hospitalName || undefined,
      slideCount,
      writingStyle: derivedWritingStyle,
      designTemplateId,
      category,
      contentMode,
      sourceContent: isSourceBased ? trimmedSource : undefined,
    };

    // 크레딧 체크 (차감은 생성 성공 후에)
    if (creditCtx.creditInfo && creditCtx.creditInfo.credits <= 0) {
      setError(creditCtx.userId
        ? '크레딧이 모두 소진되었습니다.'
        : '무료 체험 크레딧이 모두 소진되었습니다. 로그인하면 더 많은 크레딧을 사용할 수 있어요.');
      return;
    }

    setIsGenerating(true);
    setPageStep(2); // 즉시 결과 확인 단계로 전환
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
      // 학습 템플릿의 레이아웃 순서/선호도 반영
      const layoutHint = learnedTemplate?.slideStructure?.length
        ? `\n\n[학습된 레이아웃 순서]\n반드시 다음 순서로 슬라이드를 구성:\n${learnedTemplate.slideStructure.map((l: string, i: number) => `${i+1}번: layout="${l}"`).join('\n')}`
        : learnedTemplate?.layoutMatch?.length
        ? `\n\n[학습된 레이아웃 선호]\n가능하면 다음 레이아웃을 우선 사용: ${learnedTemplate.layoutMatch.join(', ')}`
        : '';
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: proPrompt + layoutHint,
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
        // 의료광고법 금지어 자동 대체 (JSON 파싱 전 텍스트 레벨)
        const { filtered: filteredText, replacedCount, foundTerms } = applyContentFilters(data.text);
        if (replacedCount > 0) console.info(`[CARD_NEWS] 의료법 금지어 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
        const parsed = parseProSlidesJson(filteredText);
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

      // 텍스트 원고만 즉시 노출. 커버/마무리에는 Pexels 배경 자동 적용 (모달에서 이미지 선택한 경우 건너뜀).
      const withBg = skipAutoImagesRef.current ? slides : await autoApplyBackgrounds(slides);
      skipAutoImagesRef.current = false;
      setProSlides(withBg);
      setPipelineStep('idle');
      setPageStep(2); // 생성 완료 → 편집 단계로 전환

      // 생성 성공 → 크레딧 차감
      if (creditCtx.creditInfo) {
        if (creditCtx.userId) {
          const creditResult = await cardNewsUseCredit(creditCtx.userId);
          if (creditResult.success) creditCtx.setCreditInfo({ credits: creditResult.remaining, totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 1 });
        } else {
          const next = consumeGuestCredit();
          if (next) creditCtx.setCreditInfo({ credits: next.credits, totalUsed: next.totalUsed });
        }
      }

      // 생성 기록 저장 (v2: 전체 슬라이드 + 테마 + 비율)
      try {
        const { userId } = await getSessionSafe();
        await savePost({
          userId: userId || undefined,
          postType: 'card_news',
          title: topic,
          content: JSON.stringify({
            version: 2,
            slides: withBg,
            theme: { ...proTheme, hospitalName: hospitalName || undefined, fontId: parsedFontId || proTheme.fontId },
            cardRatio: proCardRatio,
          }),
          topic,
          hospitalName: hospitalName || undefined,
          keywords: [],
        });
      } catch { /* 저장 실패 무시 */ }

      // 새 생성 성공 → 이전 드래프트 제거 (복원 혼선 방지)
      clearDraft();
      setLastSavedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
    return;
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
    try { const sl = localStorage.getItem('hospital-logo-dataurl'); if (sl) { setLogoDataUrl(sl); setProTheme(prev => ({ ...prev, hospitalLogo: sl })); } } catch {}
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

  // ── 병원 브랜드 프리셋 자동 로드 ──
  // hospitalName 이 세팅되면 (user_metadata 또는 수동 입력) 서버에서 해당 병원의
  // brand_preset 을 가져와 proTheme 에 머지한다. create 탭에서 바로 카드뉴스를
  // 만들 때도 저장된 색상/폰트/로고가 즉시 반영되도록 하기 위함.
  //
  // 주의:
  //   - Supabase 미구성이면 getBrandPreset 이 null 을 반환 → 무시
  //   - 기존 proTheme 필드를 전체 교체하지 않고 brandPresetToTheme 가 반환한
  //     Partial 만 머지 (backgroundGradient 등 기존 값 보존)
  //   - 로고가 있으면 logoDataUrl state 도 함께 동기화 — 기존 localStorage
  //     기반 로고 로드보다 우선 (DB 값이 진실의 원천)
  useEffect(() => {
    const name = hospitalName.trim();
    if (!name) return;
    let cancelled = false;
    getBrandPreset(name).then(preset => {
      if (cancelled || !preset) return;
      setProTheme(prev => ({ ...prev, ...brandPresetToTheme(preset) }));
      if (preset.logo?.dataUrl) {
        setLogoDataUrl(preset.logo.dataUrl);
        setLogoEnabled(true);
      }
    }).catch(() => { /* 조용히 무시 — 기본값 유지 */ });
    return () => { cancelled = true; };
  }, [hospitalName]);

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
  }, [cardRegenIndex, editSubtitle, editMainTitle, editDescription, editImagePrompt, cardRegenRefImage, imageStyle]);

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

  // ── 드래프트 복원/무시 ──
  const restoreDraft = useCallback(() => {
    const result = draftModalData ?? loadDraft(currentUserId);
    if (!result) {
      setDraftModalData(null);
      return;
    }
    const { draft } = result;
    setTopic(draft.topic);
    setHospitalName(draft.hospitalName);
    // 구버전 드래프트에는 slide.id가 없을 수 있으므로 복원 시 일괄 보정
    setProSlides(ensureSlideIds(draft.proSlides));
    setProTheme(draft.proTheme);
    setProCardRatio(draft.proCardRatio);
    setPageStep(2);
    setMainTab('create');
    setDraftModalData(null);
    setLastSavedAt(draft.savedAt);
    if (result.expiringSoon) setDraftExpiringSoon(result.expiresIn);
  }, [draftModalData, currentUserId]);

  const dismissDraft = useCallback(() => {
    clearDraft();
    setDraftModalData(null);
    setDraftExpiringSoon(null);
  }, []);

  // ── 히스토리에서 카드뉴스 복원 ──
  const restoreFromHistory = useCallback((post: SavedPost) => {
    try {
      const parsed = JSON.parse(post.content) as unknown;

      // v2 형식: { version: 2, slides, theme, cardRatio }
      if (
        parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        (parsed as { version?: number }).version === 2
      ) {
        const v2 = parsed as { slides: ProSlideData[]; theme?: CardNewsTheme; cardRatio?: CardRatio };
        if (!Array.isArray(v2.slides) || v2.slides.length === 0) {
          setError('이 기록에는 복원할 슬라이드가 없습니다.');
          return;
        }
        // 과거 저장본에 id가 없을 수 있으므로 일괄 보정
        setProSlides(ensureSlideIds(v2.slides));
        setProTheme(v2.theme ?? { ...DEFAULT_THEME });
        setProCardRatio(v2.cardRatio ?? '1:1');
      } else if (Array.isArray(parsed)) {
        // v1 형식: [{ title, layout }] — 제목/레이아웃만 있는 기본 복원
        const legacy = parsed as Array<{ title?: string; layout?: string }>;
        if (legacy.length === 0) {
          setError('이 기록에는 복원할 슬라이드가 없습니다.');
          return;
        }
        const restored: ProSlideData[] = legacy.map((s, i) => ({
          ...buildLayoutDefaults(
            { id: generateSlideId(), index: i + 1, layout: 'info' as SlideLayoutType, title: s.title || '' },
            ((s.layout as SlideLayoutType | undefined) ?? 'info'),
          ),
          id: generateSlideId(),
        }));
        setProSlides(restored);
        setProTheme({ ...DEFAULT_THEME });
        setProCardRatio('1:1');
      } else {
        setError('이 기록은 복원할 수 없는 형식입니다.');
        return;
      }

      setTopic(post.topic || post.title);
      setHospitalName(post.hospital_name || '');
      setPageStep(2);
      setMainTab('create');
      setError(null);
    } catch {
      setError('이 기록은 복원할 수 없습니다.');
    }
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

  const handleRefreshSuggestions = () => {
    const topics = TOPIC_SUGGESTIONS[category] || TOPIC_SUGGESTIONS['치과'];
    setTopicSuggestions([...topics].sort(() => Math.random() - 0.5).slice(0, 5));
  };


  return (
    <div className="p-5 max-w-6xl mx-auto min-h-[calc(100vh-80px)] flex flex-col" style={{ paddingTop: '8vh' }}>

      {/* ══════ 상단 탭 ══════ */}
      <div className="flex justify-center border-b border-slate-200 mb-4 flex-shrink-0">
        {[
          { id: 'create' as const, label: '✨ 카드뉴스 생성', color: 'blue' },
          { id: 'learn' as const, label: '🎨 스타일 학습', color: 'purple' },
          { id: 'history' as const, label: '📋 생성기록', color: 'slate' },
        ].map(tab => (
          <button key={tab.id} type="button" onClick={() => setMainTab(tab.id)}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-all ${
              mainTab === tab.id ? `border-${tab.color}-600 text-${tab.color}-600` : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 스텝 인디케이터 (생성 탭) */}
      {mainTab === 'create' && (
        <div className="flex items-center justify-center gap-0 mb-6 flex-shrink-0">
          {[
            { n: 1, label: '디자인 선택' },
            { n: 2, label: '콘텐츠 입력' },
            { n: 3, label: '결과 확인' },
          ].map((s, i) => {
            const done = pageStep === 2 ? s.n <= 2 : s.n < 1;
            const isCurrent = (pageStep === 1 && s.n === 2) || (pageStep === 2 && s.n === 3);
            return (
              <div key={s.n} className="flex items-center">
                <div className="flex flex-col items-center" style={{ minWidth: '80px' }}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-1.5 ${
                    isCurrent ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : done ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
                  }`}>{s.n}</div>
                  <span className={`text-[11px] font-semibold ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`}>{s.label}</span>
                </div>
                {i < 2 && <div className={`w-12 h-px -mt-5 ${done || isCurrent ? 'bg-blue-300' : 'bg-slate-200'}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════ 탭 1: 카드뉴스 생성 ══════ */}
      {mainTab === 'create' && pageStep === 1 && (
        <div className="max-w-3xl mx-auto">
          {/* 헤딩 */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">어떤 카드뉴스를 만들까요?</h2>
            <p className="text-sm text-blue-500">
              {inputMode === 'topic' && '주제를 입력하거나 추천 주제를 선택하세요'}
              {inputMode === 'source' && '블로그 글·기사·유튜브 스크립트를 붙여넣으면 AI가 카드뉴스로 변환합니다'}
              {inputMode === 'url' && '네이버 블로그 URL을 입력하면 AI가 본문을 가져와 카드뉴스로 변환합니다'}
            </p>
          </div>

          {/* 입력 모드 전환 탭 (주제 / 소스 변환 / URL 가져오기) */}
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => setInputMode('topic')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                inputMode === 'topic'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              주제 입력
            </button>
            <button type="button" onClick={() => setInputMode('source')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                inputMode === 'source'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              소스 변환
            </button>
            <button type="button" onClick={() => setInputMode('url')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                inputMode === 'url'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              URL 가져오기
            </button>
          </div>

          {/* 주제 추천 칩 — topic 모드에서만 노출 */}
          {inputMode === 'topic' && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-500 mb-3">이런 주제는 어때요?</p>
              <div className="flex gap-2 flex-wrap">
                {topicSuggestions.map((t, i) => (
                  <button key={i} type="button" onClick={() => setTopic(t)}
                    className={`px-4 py-2 text-sm font-semibold rounded-full border transition-all ${topic === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                    {t}
                  </button>
                ))}
                <button type="button" onClick={handleRefreshSuggestions} className="px-3 py-2 text-sm text-slate-400 hover:text-blue-500">🔄</button>
              </div>
            </div>
          )}

          {/* 콘텐츠 입력 — 모드별로 다른 UI */}
          {inputMode === 'topic' && (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 mb-4 focus-within:border-blue-400 transition-all">
              <textarea value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="주제를 입력하세요 (예: 임플란트 사후관리 5단계 가이드)"
                rows={2}
                className="w-full text-base font-medium text-slate-800 placeholder:text-slate-300 resize-none border-none outline-none bg-transparent" />
            </div>
          )}

          {inputMode === 'source' && (
            <div className="mb-4">
              <textarea value={sourceContent} onChange={e => setSourceContent(e.target.value)}
                placeholder="블로그 글, 유튜브 스크립트, 기사 등을 붙여넣으세요. AI가 핵심을 추출해서 카드뉴스로 변환합니다. (최소 100자, 최대 15,000자)"
                maxLength={15000}
                className="w-full min-h-[220px] p-4 text-sm text-slate-800 placeholder:text-slate-300 resize-y rounded-xl border-2 border-dashed border-slate-200 focus:border-blue-400 focus:outline-none transition-all" />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {sourceContent.trim().length < 100
                    ? <span className="text-amber-500">⚠ 최소 100자 필요 · 현재 {sourceContent.trim().length}자</span>
                    : <span className="text-emerald-500">✓ 입력 완료 · {sourceContent.length.toLocaleString()}자</span>}
                </span>
                <span>{sourceContent.length.toLocaleString()} / 15,000</span>
              </div>
            </div>
          )}

          {inputMode === 'url' && (
            <div className="mb-4 space-y-3">
              <div className="flex gap-2">
                <input type="url" value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); if (urlError) setUrlError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !urlLoading && urlInput.trim()) { e.preventDefault(); handleFetchUrl(); } }}
                  placeholder="네이버 블로그 글 URL을 붙여넣으세요 (예: https://blog.naver.com/blogid/223456789)"
                  className="flex-1 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300 rounded-xl border-2 border-dashed border-slate-200 focus:border-blue-400 focus:outline-none transition-all" />
                <button type="button" onClick={handleFetchUrl}
                  disabled={!urlInput.trim() || urlLoading}
                  className="px-4 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                  {urlLoading ? '가져오는 중...' : '본문 가져오기'}
                </button>
              </div>
              {urlError && (
                <p className="text-xs text-red-500 px-1 whitespace-pre-line">{urlError}</p>
              )}
              {sourceContent && !urlError && (
                <>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-emerald-600">
                      ✓ 가져온 본문 ({sourceContent.length.toLocaleString()}자) — 필요하면 수정하세요
                    </p>
                    <button type="button" onClick={() => setSourceContent('')}
                      className="text-[11px] text-slate-400 hover:text-red-500">지우기</button>
                  </div>
                  <textarea value={sourceContent} onChange={e => setSourceContent(e.target.value)}
                    maxLength={15000}
                    className="w-full min-h-[200px] p-4 text-sm text-slate-800 resize-y rounded-xl border-2 border-slate-200 focus:border-blue-400 focus:outline-none transition-all" />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <span>
                      {sourceContent.trim().length < 100
                        ? <span className="text-amber-500">⚠ 최소 100자 필요 · 현재 {sourceContent.trim().length}자</span>
                        : <span className="text-emerald-500">✓ 변환 준비 완료</span>}
                    </span>
                    <span>{sourceContent.length.toLocaleString()} / 15,000</span>
                  </div>
                </>
              )}
              {!sourceContent && !urlError && (
                <p className="text-[11px] text-slate-400 px-1">
                  현재 네이버 블로그만 자동 가져오기를 지원합니다. 일반 웹페이지는 본문을 복사해서 &ldquo;소스 변환&rdquo; 탭에 붙여넣어주세요.
                </p>
              )}
            </div>
          )}

          {/* 트렌드 주제 추천 버튼 — topic 모드에서만 노출 */}
          {inputMode === 'topic' && (
            <button type="button" onClick={handleRecommendTrends} disabled={isLoadingTrends}
              className="w-full mb-4 py-2.5 bg-blue-50 text-blue-600 text-sm font-semibold rounded-xl border border-blue-200 hover:bg-blue-100 disabled:opacity-50">
              {isLoadingTrends ? '검색 중...' : topic.trim()
                ? <>🔍 &ldquo;{topic.trim().length > 10 ? topic.trim().slice(0, 10) + '…' : topic.trim()}&rdquo; 관련 주제 추천</>
                : <>🔥 트렌드 주제 추천</>}
            </button>
          )}
          {inputMode === 'topic' && trendingItems.length > 0 && (
            <div className="mb-4 space-y-1.5">
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

          {/* 진료과 */}
          <div className="mb-4">
            <div className="flex gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.value} type="button" onClick={() => { setCategory(cat.value); setTopicSuggestions((TOPIC_SUGGESTIONS[cat.value] || TOPIC_SUGGESTIONS['치과']).sort(() => Math.random() - 0.5).slice(0, 5)); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${category === cat.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 하단 옵션 바 */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>비율</span>
              {(['1:1', '4:5', '9:16', '16:9', '3:4'] as const).map(r => {
                const [w, h] = r.split(':').map(Number);
                const active = proCardRatio === r;
                // 시각 아이콘 — 가장 긴 변을 18px로 정규화한 박스
                const MAX = 18;
                const boxW = w >= h ? MAX : Math.round((w / h) * MAX);
                const boxH = h > w ? MAX : Math.round((h / w) * MAX);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setProCardRatio(r)}
                    className={`px-2 py-1 rounded-md font-bold inline-flex items-center gap-1.5 transition-colors ${
                      active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={`${r} 비율`}
                    aria-pressed={active}
                  >
                    <span
                      className="inline-block border-[1.5px] border-current rounded-[2px]"
                      style={{ width: `${boxW}px`, height: `${boxH}px` }}
                      aria-hidden="true"
                    />
                    <span className="text-[10px]">{r}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-px h-5 bg-slate-200" />
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>장수</span>
              <button type="button" onClick={() => setSlideCount(0)}
                className={`px-2 py-1 rounded-md font-bold ${slideCount === 0 ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-500'}`}>자동</button>
              {[4, 5, 6, 7, 8, 9, 10].map(n => (
                <button key={n} type="button" onClick={() => setSlideCount(n)}
                  className={`px-2 py-1 rounded-md font-bold ${slideCount === n ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{n}</button>
              ))}
            </div>
            <div className="flex-1" />
            <button type="button" onClick={openDesignModal}
              disabled={
                isGenerating
                || (inputMode === 'topic'
                  ? !topic.trim()
                  : sourceContent.trim().length < 100)
              }
              data-testid="cta-generate-card-news"
              className="px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200 transition-all">
              {isGenerating ? '생성 중...' : '✨ 카드뉴스 생성'}
            </button>
          </div>

          {/* 로고 옵션 (접기) */}
          <details className="text-sm text-slate-500 bg-slate-50 rounded-xl px-5 py-3 mt-2">
            <summary className="cursor-pointer hover:text-slate-700 font-semibold">로고 옵션</summary>
            <div className="pt-4 pb-2 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">병원명</label>
                <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="예: 더찬한치과의원"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">병원 로고</label>
                <div className="flex items-center gap-3 h-[42px]">
                  {logoDataUrl ? (
                    <div className="relative">
                      <img src={logoDataUrl} alt="로고" className="h-10 w-auto rounded-xl border border-slate-200 bg-white p-1" />
                      <button type="button" onClick={() => { setLogoDataUrl(null); setLogoEnabled(false); setProTheme(prev => ({ ...prev, hospitalLogo: undefined })); try { localStorage.removeItem('hospital-logo-dataurl'); } catch {} }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center shadow-sm">✕</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => logoInputRef.current?.click()}
                      className="h-full px-5 border-2 border-dashed border-slate-300 rounded-xl text-xs text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all">+ 로고 업로드</button>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => { const d = reader.result as string; setLogoDataUrl(d); setLogoEnabled(true); setProTheme(prev => ({ ...prev, hospitalLogo: d })); try { localStorage.setItem('hospital-logo-dataurl', d); } catch {} };
                    reader.readAsDataURL(file); e.target.value = '';
                  }} />
                  {logoDataUrl && (
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={logoEnabled} onChange={e => setLogoEnabled(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[11px] text-slate-400">카드에 넣기</span>
                      </label>
                      {logoEnabled && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">선명도</span>
                          <input type="range" min={10} max={100} step={5} value={logoOpacity} onChange={e => setLogoOpacity(Number(e.target.value))} className="w-24 accent-blue-500" />
                          <span className="text-[10px] text-slate-500 font-semibold w-8">{logoOpacity}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </details>

          {/* 로딩/에러는 2단계에서 표시 */}
        </div>
      )}

      {/* ══════ 탭 1: 2단계 결과 + 편집 ══════ */}
      {mainTab === 'create' && pageStep === 2 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { clearDraft(); setLastSavedAt(null); setDraftSaveError(null); setDraftExpiringSoon(null); setPageStep(1); }} className="text-sm text-slate-500 hover:text-slate-700">← 새로 만들기</button>
              <h2 className="text-lg font-bold text-slate-800">{topic}</h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{proSlides.length}장</span>
            </div>
            {/* 자동저장 상태 — 에러 > 임박 경고 > 저장 완료 순 우선순위 */}
            {draftSaveError ? (
              <span className="text-[11px] font-semibold text-red-600 hidden sm:inline" title={draftSaveError}>
                ⚠️ 저장 실패 — {draftSaveError.length > 24 ? '용량 초과' : draftSaveError}
              </span>
            ) : draftExpiringSoon !== null ? (
              <span className="text-[11px] font-semibold text-amber-600 hidden sm:inline" title="편집을 계속하면 수명이 자동 연장됩니다">
                ⏰ 드래프트 {Math.max(1, Math.floor(draftExpiringSoon / (60 * 60 * 1000)))}시간 후 만료
              </span>
            ) : lastSavedAt ? (
              <span className="text-[11px] text-slate-400 hidden sm:inline" title={new Date(lastSavedAt).toLocaleString('ko-KR')}>
                💾 자동 저장됨 · {new Date(lastSavedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </div>
          {(isGenerating || isGeneratingPrompts || isGeneratingImages) && (
            <GeneratingTimer progress={progress} slideCount={proSlides.length || slideCount || 6} />
          )}
          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 mb-4">{error}</div>}
          <div className="mb-4 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-slate-400 mb-1 block">글씨체</label>
                <select value={proTheme.fontId || 'pretendard'} onChange={e => setProTheme(prev => ({ ...prev, fontId: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                  {FONT_CATEGORIES.map(cat => (<optgroup key={cat} label={cat}>{CARD_FONTS.filter(f => f.category === cat).map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}</optgroup>))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-slate-400 mb-1 block">병원명</label>
                <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="병원 이름 (선택)" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
              </div>
          </div>
          {proSlides.length > 0 && (
            <CardNewsProRenderer slides={proSlides} theme={proTheme} onSlidesChange={setProSlides} onThemeChange={setProTheme}
              learnedTemplate={learnedTemplate} cardRatio={proCardRatio} presetStyle={presetStyle} />
          )}
        </div>
      )}

      {/* ══════ 탭 2: 나만의 디자인 학습 ══════ */}
      {mainTab === 'learn' && (
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">나만의 디자인 학습</h2>
            <p className="text-slate-500 mb-8">마음에 드는 카드뉴스를 올리면 AI가 스타일을 학습해요</p>
            <div className="mb-6">
              <CardTemplateManager uploadOnly onSelectTemplate={(tmpl) => { setLearnedTemplate(tmpl); setSavedStylesVersion(v => v + 1); setMainTab('create'); }} selectedTemplateId={learnedTemplate?.id} />
            </div>
            {savedStyles.length > 0 && (
              <div className="text-left">
                <h3 className="text-sm font-bold text-slate-700 mb-3">학습된 스타일 ({savedStyles.length}개)</h3>
                <div className="grid grid-cols-4 gap-3">
                  {savedStyles.map(style => (
                    <div key={style.id} className="relative group">
                      <button type="button" onClick={() => { setLearnedTemplate(style); setMainTab('create'); }}
                        className="w-full rounded-xl overflow-hidden border-2 border-slate-200 hover:border-purple-400 aspect-square">
                        {style.thumbnailDataUrl ? <img src={style.thumbnailDataUrl} alt={style.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-xs text-slate-400">{style.name}</div>}
                      </button>
                      <button type="button" onClick={() => { deleteTemplate(style.id); if (learnedTemplate?.id === style.id) setLearnedTemplate(null); setSavedStylesVersion(v => v + 1); }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">✕</button>
                      <div className="mt-1">
                        <button type="button" onClick={async () => {
                          if (!style.thumbnailDataUrl) return;
                          setProgress('템플릿 변환 중...');
                          const result = await imageToEditableTemplate(style.thumbnailDataUrl);
                          setProgress('');
                          if (result) {
                            const newSlide = { id: generateSlideId(), index: 1, ...result.slide, layout: result.slide.layout as any } as ProSlideData;
                            setProTheme(prev => ({ ...prev, ...result.colors }));
                            setProSlides([newSlide]);
                            setPageStep(2);
                            setMainTab('create');
                          }
                        }}
                          className="w-full text-[9px] font-bold text-blue-600 bg-blue-50 rounded py-1.5 hover:bg-blue-100">템플릿으로 편집</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 브랜드 설정 섹션 (컬러·폰트·로고·톤) ── */}
          <div className="border-t border-slate-200 mt-10 pt-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">브랜드 설정</h3>
                <p className="text-xs text-slate-500 mt-1">
                  병원별로 저장됩니다. 카드뉴스 생성 시 자동 적용돼요.
                </p>
              </div>
            </div>
            {!hospitalName.trim() && (
              <div className="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                병원명을 먼저 지정해야 합니다. 상단 &ldquo;주제 입력&rdquo; 탭 하단 옵션 바의 병원명 입력란을 사용하세요.
              </div>
            )}
            <BrandPresetEditor
              hospitalName={hospitalName}
              onPresetLoaded={(preset) => {
                setProTheme(prev => ({ ...prev, ...brandPresetToTheme(preset) }));
                if (preset.logo?.dataUrl) {
                  setLogoDataUrl(preset.logo.dataUrl);
                  setLogoEnabled(true);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* ══════ 탭 3: 생성기록 ══════ */}
      {mainTab === 'history' && (
        <div className="max-w-3xl mx-auto">
          <h2 className="text-lg font-bold text-slate-800 mb-4">생성기록</h2>
          {historyLoading && <div className="text-center py-12"><div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>}
          {!historyLoading && historyPosts.length === 0 && (
            <p className="text-center text-slate-400 py-12">아직 생성한 카드뉴스가 없어요<br /><span className="text-xs">카드뉴스를 생성하면 여기에 기록됩니다</span></p>
          )}
          {!historyLoading && historyPosts.length > 0 && (
            <div className="space-y-2">
              {historyPosts.map(post => (
                <div key={post.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3 hover:border-blue-200 transition-all">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800 truncate">{post.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      {post.hospital_name && <span className="truncate">{post.hospital_name}</span>}
                      <span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => restoreFromHistory(post)}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold transition-colors"
                      title="이 카드뉴스를 편집 화면으로 불러옵니다"
                    >
                      다시 열기
                    </button>
                    <button
                      type="button"
                      onClick={async () => { await deletePost(post.id); setHistoryPosts(prev => prev.filter(p => p.id !== post.id)); }}
                      className="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1 rounded hover:bg-red-50"
                      title="삭제"
                    >🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 추천 디자인 모달 ── */}
      {showDesignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDesignModal(false)}>
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="px-8 py-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">커버 디자인을 선택하세요</h2>
                  <p className="text-sm text-slate-500 mt-1">&ldquo;{topic}&rdquo; — 마음에 드는 레이아웃을 골라주세요</p>
                </div>
                <button type="button" onClick={() => setShowDesignModal(false)}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">✕</button>
              </div>
            </div>

            {/* 프리뷰 그리드 — 템플릿 자체의 색상/레이아웃 시각화 */}
            <div className="px-8 py-6 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-3 lg:grid-cols-5 gap-4">
                {COVER_TEMPLATES.map((tmpl, i) => {
                  const titlePreview = topic.length > 12 ? topic.slice(0, 12) + '...' : (topic || '제목 미리보기');
                  const bgImage = previewBgImages[i % Math.max(previewBgImages.length, 1)];
                  return (
                  <div key={tmpl.id}>
                    <button type="button" onClick={() => setSelectedPreviewIdx(i)}
                      className={`relative rounded-2xl overflow-hidden border-3 transition-all ${
                        proCardRatio === '3:4' ? 'aspect-[3/4]' : proCardRatio === '4:5' ? 'aspect-[4/5]' : 'aspect-square'
                      } ${selectedPreviewIdx === i
                        ? 'border-blue-500 ring-4 ring-blue-100 scale-[1.02]'
                        : 'border-transparent hover:border-slate-300 hover:shadow-lg'}`}>

                      {/* 배경: Pexels 이미지 + 오버레이, 없으면 그라데이션 */}
                      <div className="absolute inset-0" style={{
                        background: tmpl.background.gradient
                          || tmpl.background.solidColor
                          || tmpl.thumbnail
                          || '#1a1a2e',
                      }} />
                      {bgImage && (
                        <>
                          <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <div className="absolute inset-0" style={{
                            background: `linear-gradient(180deg, transparent 30%, ${tmpl.colors.title === '#FFFFFF' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)'} 100%)`,
                          }} />
                        </>
                      )}

                      {/* 오버레이 (있으면) */}
                      {tmpl.background.overlayGradient && (
                        <div className="absolute inset-0" style={{ background: tmpl.background.overlayGradient }} />
                      )}

                      {/* 레이아웃 미리보기 */}
                      <div className="absolute inset-0 flex flex-col p-4" style={{
                        justifyContent: tmpl.layout.titlePosition === 'center' ? 'center'
                          : tmpl.layout.titlePosition.includes('top') ? 'flex-start'
                          : 'flex-end',
                        alignItems: tmpl.layout.titlePosition.includes('left') ? 'flex-start'
                          : tmpl.layout.titlePosition.includes('right') ? 'flex-end'
                          : 'center',
                        textAlign: (tmpl.layout.titlePosition.includes('left') ? 'left'
                          : tmpl.layout.titlePosition.includes('right') ? 'right'
                          : 'center') as 'left' | 'right' | 'center',
                      }}>
                        {/* 제목만 깔끔하게 */}
                        <div style={{
                          color: tmpl.colors.title,
                          fontSize: '13px',
                          fontWeight: tmpl.layout.titleWeight,
                          lineHeight: 1.3,
                          wordBreak: 'keep-all',
                        }}>
                          {titlePreview}
                        </div>
                      </div>

                      {/* 선택 체크 */}
                      {selectedPreviewIdx === i && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg z-10">
                          <span className="text-white text-[10px] font-bold">{'✓'}</span>
                        </div>
                      )}

                    </button>
                    {/* 템플릿 이름 — 이미지 아래 */}
                    <p className="text-[10px] text-slate-500 font-semibold text-center mt-1.5 truncate">{tmpl.name}</p>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* 이미지 스타일 선택 */}
            <div className="px-8 py-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-2">배경 이미지 스타일</p>
              <div className="flex gap-2 flex-wrap">
                {([
                  { id: 'illustration' as const, label: '일러스트', icon: '🎨', desc: 'Pixabay 일러스트' },
                  { id: 'photo' as const, label: '실사 사진', icon: '📷', desc: 'Pexels 사진' },
                  { id: 'infographic' as const, label: '아이콘/벡터', icon: '📊', desc: 'Pixabay 벡터' },
                ]).map(s => (
                  <button key={s.id} type="button" onClick={() => { setImageStyle(s.id); fetchPreviewImages(s.id); }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      imageStyle === s.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 하단 */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowDesignModal(false)} className="px-6 py-2.5 text-sm font-semibold text-slate-500">취소</button>
                <button type="button" onClick={() => { previewCacheRef.current.clear(); fetchPreviewImages(imageStyle, true); }}
                  disabled={loadingPreviews}
                  className="px-4 py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-all">
                  {loadingPreviews ? '로딩...' : '🔄 다른 이미지'}
                </button>
              </div>
              <button type="button" disabled={isGenerating}
                onClick={async () => {
                  const tmpl = COVER_TEMPLATES[selectedPreviewIdx];
                  setShowDesignModal(false);
                  const coverTmplId = tmpl?.id || '';
                  // 선택한 템플릿의 실제 색상을 테마에 적용 (하드코딩 X)
                  if (tmpl) {
                    const isDark = tmpl.colors.title === '#FFFFFF';
                    setProTheme(prev => ({
                      ...prev,
                      backgroundColor: isDark ? '#1B2A4A' : '#F5F0EB',
                      backgroundGradient: tmpl.background.gradient || (isDark ? 'linear-gradient(180deg, #1B2A4A, #152238)' : ''),
                      titleColor: tmpl.colors.title,
                      subtitleColor: tmpl.colors.subtitle,
                      accentColor: tmpl.colors.accent,
                      bodyColor: isDark ? '#D6D8E0' : '#4A5568',
                      fontId: prev.fontId || 'pretendard',
                    }));
                  }
                  // autoApplyBackgrounds 건너뛰기 — 프리뷰 이미지를 직접 적용할 것
                  skipAutoImagesRef.current = true;
                  await (handleSubmit as any)(new Event('submit'));
                  // 생성 후 프리뷰에서 선택한 이미지를 슬라이드에 직접 적용
                  if (previewBgImages.length > 0) {
                    setProSlides(prev => prev.map((s, i) => {
                      const previewImg = previewBgImages[i % previewBgImages.length];
                      if (s.layout === 'cover' || s.layout === 'closing') {
                        return { ...s, coverTemplateId: coverTmplId, imageUrl: previewImg, imagePosition: 'background' as const };
                      }
                      if (!s.imageUrl) {
                        return { ...s, imageUrl: previewImg, imagePosition: 'top' as const };
                      }
                      return s;
                    }));
                  } else {
                    // 프리뷰 이미지 없으면 템플릿만 적용
                    setProSlides(prev => prev.map(s => {
                      if (s.layout === 'cover' || s.layout === 'closing') {
                        return { ...s, coverTemplateId: coverTmplId };
                      }
                      return s;
                    }));
                  }
                }}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-bold rounded-xl shadow-lg disabled:opacity-50">
                {isGenerating ? '생성 중...' : '✨ 이 디자인으로 생성하기'}
              </button>
            </div>
          </div>
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

      {/* ── 드래프트 복원 모달 (마운트 시 유효한 드래프트가 있을 때 자동 노출) ── */}
      {draftModalData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-2">이전 작업이 있어요</h3>
            <p className="text-sm text-slate-500 mb-1">
              주제: <strong className="text-slate-700">{draftModalData.draft.topic || '(제목 없음)'}</strong>
            </p>
            <p className="text-xs text-slate-400 mb-2">
              {draftModalData.draft.proSlides.length}장 · 저장 시각{' '}
              {new Date(draftModalData.draft.savedAt).toLocaleString('ko-KR', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {draftModalData.expiringSoon && (
              <p className="text-xs text-amber-600 font-semibold mb-3">
                ⏰ {Math.max(1, Math.floor(draftModalData.expiresIn / (60 * 60 * 1000)))}시간 후 만료 — 이어서 편집하시면 수명이 자동 연장됩니다.
              </p>
            )}
            <div className="mb-5" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={restoreDraft}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
              >
                이어서 편집
              </button>
              <button
                type="button"
                onClick={dismissDraft}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                새로 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
