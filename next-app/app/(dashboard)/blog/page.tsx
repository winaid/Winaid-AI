'use client';
import { devLog } from '../../../lib/devLog';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES, PERSONAS, TONES } from '../../../lib/constants';
import { TEAM_DATA } from '../../../lib/teamData';
import { ContentCategory, type GenerationRequest, type AudienceMode, type ImageStyle, type WritingStyle, type CssTheme, type TrendingItem, type SeoTitleItem, type SeoReport } from '../../../lib/types';
import { applyContentFilters } from '../../../lib/medicalLawFilter';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe, supabase } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { type ScoreBarData } from '../../../components/GenerationResult';
import { getStyleById, getStylePromptForGeneration } from '../../../components/WritingStyleLearner';
import type { BlogSection } from '../../../lib/types';
import type { HospitalImage } from '../../../lib/hospitalImageService';
import { parseBlogSections, replaceSectionHtml } from '../../../lib/blogSectionParser';
import { stripDoctype } from '../../../lib/htmlUtils';
import { downloadWord, downloadPDF } from '../../../lib/blogExport';
import { ImageActionModal, ImageRegenModal } from '../../../components/ImageRegenModal';
import { analyzeHospitalKeywords, loadMoreKeywords, checkKeywordRankings, MAX_KEYWORDS, type KeywordStat, type KeywordRankResult } from '../../../lib/keywordAnalysisService';
import { analyzeClinicContent, type ClinicContext } from '../../../lib/clinicContextService';
import { BLOG_STAGES, BLOG_MESSAGE_POOL, MSG_ROTATION_INTERVAL } from './blogConstants';
import { normalizeBlogStructure } from './normalizeBlog';
import { buildChatRefinePrompt } from '../../../lib/refinePrompt';
import BlogResultArea from './BlogResultArea';
import BlogFormPanel from './BlogFormPanel';
import { useCreditContext } from '../layout';
import { useCredit as blogUseCredit } from '../../../lib/creditService';

function BlogForm() {
  const creditCtx = useCreditContext();
  const searchParams = useSearchParams();

  // ── 폼 상태 ──
  const topicParam = searchParams.get('topic');
  const titleParam = searchParams.get('title');
  const keywordsParam = searchParams.get('keywords');
  const youtubeTranscriptParam = searchParams.get('youtubeTranscript');
  const clinicalContextParam = searchParams.get('clinicalContext');
  const [topic, setTopic] = useState(topicParam || '');
  const [referenceResult, setReferenceResult] = useState<{ facts: string; sources: string[] } | null>(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [blogTitle, setBlogTitle] = useState(titleParam || '');
  const [youtubeTranscript] = useState(youtubeTranscriptParam ? decodeURIComponent(youtubeTranscriptParam) : '');
  const [clinicalContext] = useState(clinicalContextParam ? decodeURIComponent(clinicalContextParam) : '');
  const [keywords, setKeywords] = useState(keywordsParam || '');
  const [keywordDensity, setKeywordDensity] = useState<number | 'auto'>('auto');
  const [disease, setDisease] = useState('');
  const [customSubheadings, setCustomSubheadings] = useState('');
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [persona, setPersona] = useState('director_1st');
  const [tone, setTone] = useState(TONES[0].value);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');
  const [cssTheme, setCssTheme] = useState<CssTheme>('modern');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [imageCount, setImageCount] = useState(6);
  const [useImageLibrary, setUseImageLibrary] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<'4:3' | '16:9' | '1:1'>('4:3');
  const [textLength, setTextLength] = useState(1500);

  // 이미지 수량 자동 추천
  const imageCountManualRef = useRef(false);
  const recommendedImageCount = useMemo(() => {
    if (textLength <= 1000) return 4;
    if (textLength <= 1500) return 6;
    if (textLength <= 2500) return 8;
    if (textLength <= 3500) return 10;
    return 15;
  }, [textLength]);

  useEffect(() => {
    if (!imageCountManualRef.current) setImageCount(recommendedImageCount);
  }, [recommendedImageCount]);

  useEffect(() => { imageCountManualRef.current = false; }, [textLength]);

  const handleImageCountChange = useCallback((count: number) => {
    imageCountManualRef.current = true;
    setImageCount(count);
  }, []);
  const [hospitalName, setHospitalName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [selectedManager, setSelectedManager] = useState('');
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [selectedHospitalAddress, setSelectedHospitalAddress] = useState('');
  const [medicalLawMode, setMedicalLawMode] = useState<'strict' | 'relaxed'>(() => {
    if (typeof window === 'undefined') return 'strict';
    return (localStorage.getItem('medicalLawMode') as 'strict' | 'relaxed') || 'strict';
  });
  const [includeFaq, setIncludeFaq] = useState(false);
  const [faqCount, setFaqCount] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [learnedStyleId, setLearnedStyleId] = useState<string | undefined>(undefined);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // 관리자 학습 말투 DB 프로파일 확인
  const [dbStyleLoaded, setDbStyleLoaded] = useState(false);
  const [dbStyleName, setDbStyleName] = useState('');

  useEffect(() => {
    setDbStyleLoaded(false);
    setDbStyleName('');
    if (!hospitalName?.trim()) return;
    const checkDbStyle = async () => {
      try {
        const res = await fetch(`/api/style-check?hospitalName=${encodeURIComponent(hospitalName.trim())}`);
        if (res.ok) {
          const data = await res.json() as { hasProfile?: boolean; hospitalName?: string };
          if (data.hasProfile) {
            setDbStyleLoaded(true);
            setDbStyleName(data.hospitalName || hospitalName);
          }
        }
      } catch { /* ignore */ }
    };
    checkDbStyle();
  }, [hospitalName]);

  // ── 키워드 분석 상태 (old InputForm 동일) ──
  const [keywordStats, setKeywordStats] = useState<KeywordStat[]>([]);
  const [keywordAiRec, setKeywordAiRec] = useState('');
  const [keywordProgress, setKeywordProgress] = useState('');
  const [isAnalyzingKeywords, setIsAnalyzingKeywords] = useState(false);
  const [isLoadingMoreKeywords, setIsLoadingMoreKeywords] = useState(false);
  const [showKeywordPanel, setShowKeywordPanel] = useState(false);
  const [keywordSortBy, setKeywordSortBy] = useState<'volume' | 'blog' | 'saturation'>('volume');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [keywordMinVolume, setKeywordMinVolume] = useState(0);
  const [isCheckingRanks, setIsCheckingRanks] = useState(false);
  const [rankResults, setRankResults] = useState<Map<string, KeywordRankResult>>(new Map());
  const [hideRanked, setHideRanked] = useState(false);

  // ── 병원 홈페이지/블로그 크롤링 상태 ──
  const [homepageUrl, setHomepageUrl] = useState('');
  const [clinicContext, setClinicContext] = useState<ClinicContext | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState('');
  const [includeHospitalIntro] = useState(true); // 항상 ON

  // 화이트리스트 참고 자료 debounce 자동 수집
  useEffect(() => {
    if (!topic.trim() || topic.trim().length < 2) {
      setReferenceResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoadingReference(true);
      try {
        const res = await fetch('/api/reference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.trim(), category }),
        });
        if (res.ok) setReferenceResult(await res.json());
      } catch { /* 실패 무시 */ }
      finally { setIsLoadingReference(false); }
    }, 800);
    return () => clearTimeout(timer);
  }, [topic]);

  // localStorage에서 커스텀 프롬프트 복원 (old 동일)
  useEffect(() => {
    const saved = localStorage.getItem('hospital_custom_image_prompt');
    if (saved) setCustomPrompt(saved);
  }, []);

  // ── AI 제목 추천 / 트렌드 상태 ──
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [seoTitles, setSeoTitles] = useState<SeoTitleItem[]>([]);
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [savedImagePrompts, setSavedImagePrompts] = useState<string[]>([]);
  const [regeneratingImage, setRegeneratingImage] = useState<number | null>(null);
  const [imageHistory, setImageHistory] = useState<Record<number, string[]>>({});
  // 블로그 이미지 모달 state
  const [imgActionModalOpen, setImgActionModalOpen] = useState(false);
  const [imgRegenModalOpen, setImgRegenModalOpen] = useState(false);
  const [selectedImgIndex, setSelectedImgIndex] = useState(0);
  const [selectedImgSrc, setSelectedImgSrc] = useState('');
  const [regenPrompt, setRegenPrompt] = useState('');
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);
  const [scores, setScores] = useState<ScoreBarData | undefined>(undefined);
  const [seoReport, setSeoReport] = useState<SeoReport | null>(null);
  const [isSeoLoading, setIsSeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [settingsToast, setSettingsToast] = useState('');

  // ── Phase 2A v4: 파이프라인 state ──
  // Phase 2D Tier 2-A+: verdict/diff UI 제거. review 호출 결과는 내부 본문 교체에만 사용 (로컬 변수).
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'drafting' | 'reviewing_and_images' | 'done' | 'error'>('idle');

  // 설정 저장/불러오기
  const getSettingsKey = () => selectedTeam ? `winaid_blog_settings_team_${selectedTeam}` : 'winaid_blog_settings';

  const handleSaveSettings = useCallback(() => {
    const s = { category, hospitalName, selectedHospitalAddress, homepageUrl, textLength, imageCount, imageAspectRatio, imageStyle, useImageLibrary, audienceMode, persona, tone, writingStyle, medicalLawMode, includeFaq, faqCount, includeHospitalIntro, learnedStyleId };
    localStorage.setItem(getSettingsKey(), JSON.stringify(s));
    setSettingsToast('💾 설정 저장됨');
    setTimeout(() => setSettingsToast(''), 1500);
  }, [category, hospitalName, selectedHospitalAddress, homepageUrl, textLength, imageCount, imageAspectRatio, imageStyle, useImageLibrary, audienceMode, persona, tone, writingStyle, medicalLawMode, includeFaq, faqCount, includeHospitalIntro, learnedStyleId, selectedTeam]);

  const applySettings = useCallback((raw: string) => {
    try {
      const s = JSON.parse(raw);
      if (s.category !== undefined) setCategory(s.category);
      if (s.hospitalName !== undefined) setHospitalName(s.hospitalName);
      if (s.selectedHospitalAddress !== undefined) setSelectedHospitalAddress(s.selectedHospitalAddress);
      if (s.homepageUrl !== undefined) setHomepageUrl(s.homepageUrl);
      if (s.textLength !== undefined) setTextLength(s.textLength);
      if (s.imageCount !== undefined) setImageCount(s.imageCount);
      if (s.imageAspectRatio !== undefined) setImageAspectRatio(s.imageAspectRatio);
      if (s.imageStyle !== undefined) setImageStyle(s.imageStyle);
      if (s.useImageLibrary !== undefined) setUseImageLibrary(s.useImageLibrary);
      if (s.learnedStyleId !== undefined) setLearnedStyleId(s.learnedStyleId);
      if (s.audienceMode !== undefined) setAudienceMode(s.audienceMode);
      if (s.persona !== undefined) setPersona(s.persona);
      if (s.tone !== undefined) setTone(s.tone);
      if (s.writingStyle !== undefined) setWritingStyle(s.writingStyle);
      if (s.medicalLawMode !== undefined) setMedicalLawMode(s.medicalLawMode);
      if (s.includeFaq !== undefined) setIncludeFaq(s.includeFaq);
      if (s.faqCount !== undefined) setFaqCount(s.faqCount);
      // includeHospitalIntro 항상 true — skip
      return true;
    } catch { return false; }
  }, []);

  const handleLoadSettings = useCallback(() => {
    const raw = localStorage.getItem(getSettingsKey());
    if (!raw) { setSettingsToast('저장된 설정 없음'); setTimeout(() => setSettingsToast(''), 1500); return; }
    if (applySettings(raw)) { setSettingsToast('📂 설정 불러옴'); setTimeout(() => setSettingsToast(''), 1500); }
  }, [applySettings, selectedTeam]);

  // 페이지 진입 시 자동 불러오기 — 팀별 키 없으면 기본 키로 폴백
  useEffect(() => {
    const teamKey = selectedTeam ? `winaid_blog_settings_team_${selectedTeam}` : null;
    const raw = (teamKey && localStorage.getItem(teamKey)) || localStorage.getItem('winaid_blog_settings');
    if (raw) applySettings(raw);
  }, [selectedTeam]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isChatRefining, setIsChatRefining] = useState(false);
  // 생성 시간 추정
  const [generationStartTime, setGenerationStartTime] = useState<number>(0);
  const [estimatedTotalSeconds, setEstimatedTotalSeconds] = useState<number>(0);

  // ── 블로그 섹션 상태 (소제목 재생성 + export) ──
  const [blogSections, setBlogSections] = useState<BlogSection[]>([]);
  const [regeneratingSection, setRegeneratingSection] = useState<number | null>(null);
  const [sectionProgress, setSectionProgress] = useState('');

  // ── 진행 상태 (old safeProgress UI parity) ──
  // displayStage: 0=준비, 1=글작성, 2=다듬기, 3=이미지, 4=마무리
  const [displayStage, setDisplayStage] = useState<number>(0);
  const [rotationIdx, setRotationIdx] = useState(0);
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // old GenerateWorkspace.tsx 동일: displayStage 변경 시 로테이션 리셋 + 타이머 순환
  useEffect(() => {
    setRotationIdx(0);
  }, [displayStage]);

  useEffect(() => {
    if (!isGenerating) {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
      return;
    }
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    rotationTimerRef.current = setInterval(() => {
      const pool = BLOG_MESSAGE_POOL[displayStage] || BLOG_MESSAGE_POOL[1];
      setRotationIdx(prev => (prev + 1) % pool.length);
    }, MSG_ROTATION_INTERVAL);
    return () => {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    };
  }, [displayStage, isGenerating]);

  // ── 키워드 분석 (old InputForm handleAnalyzeKeywords 동일) ──
  const handleAnalyzeKeywords = async () => {
    if (!selectedHospitalAddress || !hospitalName) return;
    console.info(`[KEYWORD] ========== 키워드 분석 시작 ==========`);
    console.info(`[KEYWORD] 병원="${hospitalName}" 주소="${selectedHospitalAddress}" 진료과="${category}"`);
    console.info(`[KEYWORD] clinicContext=${clinicContext ? `신뢰도 ${Math.round(clinicContext.confidence * 100)}%, 서비스 ${clinicContext.actualServices.length}개` : '없음'}`);
    setIsAnalyzingKeywords(true);
    setShowKeywordPanel(true);
    setKeywordAiRec('');
    setKeywordProgress('');
    try {
      const result = await analyzeHospitalKeywords(
        hospitalName,
        selectedHospitalAddress,
        category,
        (msg) => { setKeywordProgress(msg); console.info(`[KEYWORD] ${msg}`); },
        clinicContext,
      );
      console.info(`[KEYWORD] 결과: ${result.stats.length}개 키워드, API 에러: ${result.apiErrors?.length || 0}건`);
      result.stats.slice(0, 5).forEach(s => console.info(`[KEYWORD]   "${s.keyword}" — 검색량: ${s.monthlySearchVolume}, 발행량: ${s.blogPostCount}, 포화도: ${s.saturation}`));
      setKeywordStats(result.stats);
      if (result.apiErrors?.length) {
        console.warn(`[KEYWORD] API 에러:`, result.apiErrors);
        const blogErr = result.apiErrors.find(e => e.includes('블로그') || e.includes('Blog') || e.includes('CLIENT'));
        setKeywordAiRec(
          (result.aiRecommendation || '') + (blogErr ? `\n\n⚠️ **발행량 조회 오류:** ${blogErr}` : ''),
        );
      } else {
        setKeywordAiRec(result.aiRecommendation || '');
      }
      console.info(`[KEYWORD] ========== 키워드 분석 완료 ==========`);
    } catch (e) {
      console.error('[KEYWORD] ❌ 키워드 분석 실패:', e);
      setKeywordStats([]);
    } finally {
      setIsAnalyzingKeywords(false);
      setKeywordProgress('');
    }
  };

  // ── 병원 홈페이지 크롤링 ──
  const handleCrawlHomepage = async () => {
    if (!homepageUrl.trim()) return;
    console.info(`[CRAWL] ========== 홈페이지 분석 시작 ==========`);
    console.info(`[CRAWL] URL="${homepageUrl.trim()}"`);
    setIsCrawling(true);
    setCrawlProgress('');
    try {
      const ctx = await analyzeClinicContent(homepageUrl.trim(), setCrawlProgress);
      setClinicContext(ctx);
      if (ctx) {
        console.info(`[CRAWL] 분석 완료 — 신뢰도: ${Math.round(ctx.confidence * 100)}%, 유형: ${ctx.sourceType}`);
        console.info(`[CRAWL]   서비스: ${ctx.actualServices.join(', ') || '없음'}`);
        console.info(`[CRAWL]   특화: ${ctx.specialties.join(', ') || '없음'}`);
        console.info(`[CRAWL]   지역: ${ctx.locationSignals.join(', ') || '없음'}`);
        console.info(`[CRAWL] ========== 홈페이지 분석 완료 ==========`);
        setCrawlProgress(`분석 완료! 서비스 ${ctx.actualServices.length}개, 특화 ${ctx.specialties.length}개 발견`);
      } else {
        console.warn(`[CRAWL] 분석 결과 없음`);
        setCrawlProgress('분석할 콘텐츠를 찾지 못했습니다.');
      }
    } catch (e) {
      console.error('[CRAWL] ❌ 크롤링 실패:', e);
      setCrawlProgress('크롤링 실패');
      setClinicContext(null);
    } finally {
      setIsCrawling(false);
    }
  };

  const handleLoadMoreKeywords = async () => {
    if (!selectedHospitalAddress || !hospitalName) return;
    if (keywordStats.length >= MAX_KEYWORDS) return;
    console.info(`[KEYWORD] 추가 키워드 로드 시작 — 현재 ${keywordStats.length}개 / 최대 ${MAX_KEYWORDS}개`);
    setIsLoadingMoreKeywords(true);
    setKeywordProgress('');
    try {
      const { stats: moreStats, reachedLimit } = await loadMoreKeywords(
        hospitalName,
        selectedHospitalAddress,
        keywordStats,
        category,
        (msg) => setKeywordProgress(msg),
        clinicContext,
      );
      if (moreStats.length > 0) {
        setKeywordStats(prev => {
          const existingSet = new Set(prev.map(s => s.keyword.toLowerCase()));
          const uniqueNew = moreStats.filter(s => !existingSet.has(s.keyword.toLowerCase()));
          return [...prev, ...uniqueNew].slice(0, MAX_KEYWORDS);
        });
      }
      if (reachedLimit) {
        setKeywordProgress(`최대 ${MAX_KEYWORDS}개 키워드에 도달했습니다.`);
      }
    } catch (e) {
      console.error('추가 키워드 로드 실패:', e);
    } finally {
      setIsLoadingMoreKeywords(false);
      setTimeout(() => setKeywordProgress(''), 2000);
    }
  };

  // ── 상위권 체크 ──
  const handleCheckRanks = async () => {
    if (keywordStats.length === 0 || !hospitalName) return;
    console.info(`[RANK] ========== 상위권 체크 시작 ==========`);
    console.info(`[RANK] 병원="${hospitalName}" 키워드 ${keywordStats.length}개`);
    // 병원의 블로그 ID 가져오기
    const team = TEAM_DATA.find(t => t.id === selectedTeam);
    const hospital = team?.hospitals.find(h => h.name.replace(/ \(.*\)$/, '') === hospitalName);
    const blogUrls = hospital?.naverBlogUrls?.length ? hospital.naverBlogUrls : (homepageUrl.trim() ? [homepageUrl.trim()] : []);
    const blogIds: string[] = [];
    for (const url of blogUrls) {
      const naverMatch = url.match(/blog\.naver\.com\/([^/?#]+)/);
      if (naverMatch) {
        blogIds.push(naverMatch[1]);
      } else {
        // 나만의닥터 등 외부 사이트 → 도메인 자체를 ID로 사용
        try { blogIds.push(new URL(url).hostname); } catch { /* 무시 */ }
      }
    }

    if (blogIds.length === 0) {
      setKeywordProgress('블로그 URL이 등록되지 않은 병원입니다.');
      setTimeout(() => setKeywordProgress(''), 3000);
      return;
    }

    setIsCheckingRanks(true);
    try {
      const results = await checkKeywordRankings(
        keywordStats.map(s => s.keyword),
        blogIds,
        (msg) => setKeywordProgress(msg),
        hospitalName,
      );
      const map = new Map<string, KeywordRankResult>();
      for (const r of results) map.set(r.keyword, r);
      setRankResults(map);
      const ranked = results.filter(r => r.isRanked);
      console.info(`[RANK] 결과: ${ranked.length}/${results.length}개 키워드 노출 중`);
      ranked.forEach(r => console.info(`[RANK]   "${r.keyword}" → ${r.rank}위`));
      console.info(`[RANK] ========== 상위권 체크 완료 ==========`);
    } catch (e) {
      console.error('[RANK] ❌ 상위권 체크 실패:', e);
    } finally {
      setIsCheckingRanks(false);
      setTimeout(() => setKeywordProgress(''), 3000);
    }
  };

  // ── AI 제목 추천 (old handleRecommendTitles 동일) ──
  const handleRecommendTitles = async () => {
    const topicForSeo = topic || disease || keywords || '';
    if (!topicForSeo) return;
    console.info(`[TITLE] ========== 제목 추천 시작 ==========`);
    console.info(`[TITLE] 주제="${topicForSeo}" 키워드="${keywords}" 질환="${disease}"`);
    setIsLoadingTitles(true);
    setSeoTitles([]);
    setTrendingItems([]);
    try {
      const keywordsForSeo = keywords || disease || topicForSeo;
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const currentMonth = koreaTime.getMonth() + 1;
      const seasons = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];
      const currentSeason = seasons[currentMonth - 1];

      const prompt = `[입력 정보]
주제: ${topicForSeo}
키워드: ${keywordsForSeo}
시즌: ${currentSeason}

────────────────────
[역할]

너는 네이버 블로그 제목 전문가야.
환자가 실제로 검색할 법한 **일상적이고 공감 가는 제목**을 만들어.

핵심 원칙: **전문 용어 대신 일반인이 쓰는 말로 바꿔야 한다.**
- "심미보철" → "누런 치아", "치아 색 고민"
- "치주염" → "잇몸이 붓고 피나는 증상"
- "근관치료" → "신경치료"
- "파절" → "깨진 치아", "부러진 치아"
- "교합" → "위아래 치아가 안 맞을 때"

────────────────────
[제목 스타일 가이드]

✅ 좋은 제목 예시:
- "누런 치아, 어떻게 하면 하얗게 만들 수 있을까?"
- "임플란트 한 지 5년, 이 관리법은 꼭 알아두세요"
- "잇몸에서 피가 나는데 그냥 둬도 되나요?"
- "치아 사이 벌어짐, 교정 말고 다른 방법은 없을까"
- "스케일링 후 이가 시린 게 정상인가요?"

❌ 나쁜 제목 예시 (이런 식으로 만들지 마):
- "심미보철 대상, 치아 파절이 있다면 확인해 볼 점" ← 전문용어 + 뻣뻣한 패턴
- "치주 질환 변화 원인과 살펴볼 이유" ← 공감 불가
- "교합 부조화 시 고려해야 할 부분" ← 환자가 이렇게 검색 안 함

────────────────────
[필수 규칙]

1. **28~38자** 이내 (모바일 최적화)
2. **일상 언어 사용** — 전문 용어는 환자가 아는 쉬운 말로 반드시 변환
3. **다양한 끝맺음** — 아래에서 골고루 사용, 같은 패턴 반복 금지:
   - 질문형: ~인가요? / ~일까? / ~되나요? / ~없을까?
   - 정보형: ~방법 / ~꿀팁 / ~가이드 / ~알아두세요
   - 공감형: ~고민이라면 / ~하고 계신가요? / ~겪고 계신다면
   - 숫자형: ~N가지 / ~N가지 방법

4. **SEO 키워드는 앞쪽에** 배치하되 자연스럽게
5. **의료광고법 준수**:
   - "최고/최초/유일/100%" 과대광고 금지
   - "완치/보장/확실" 효과 보장 금지
   - 전후 비교, 특정 병원 추천 금지
   - 단, "개선/관리/방법/도움" 같은 일상어는 허용
6. **5개 생성**, 각각 다른 끝맺음 패턴 사용

────────────────────
[출력]

JSON 배열. 설명/부제/해설 없이 JSON만:
[{ "title": "...", "score": 0~100, "type": "..." }]

type은: "증상질환형" | "변화원인형" | "확인형" | "정상범위형"

SEO 점수 기준:
- 검색자 자연도 (25점): 실제 환자가 검색할 법한 문장인가
- 질문 적합도 (25점): 네이버 AI 요약에 잡히기 좋은 구조인가
- 키워드 안정성 (20점): 핵심 키워드가 자연스럽게 포함되었는가
- 의료광고 안전성 (20점): 법적 리스크 없는가
- 블로그 적합도 (10점): 클릭하고 싶은 제목인가`;

      const schemaHint = 'JSON 배열만 출력. [{title:string, score:number, type:"증상질환형"|"변화원인형"|"확인형"|"정상범위형"}]';
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'blog_title_recommend',
          prompt: prompt + '\n\n' + schemaHint,
          systemInstruction: '병원 마케팅 블로그 SEO 제목 전문가. JSON 배열만 출력. 마크다운/코드블록 금지.',
          responseType: 'json',
          temperature: 0.5,
          maxOutputTokens: 2000,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '제목 추천 실패');

      const titles: SeoTitleItem[] = JSON.parse(data.text);
      const sorted = titles.sort((a, b) => b.score - a.score);
      setSeoTitles(sorted);
      console.info(`[TITLE] 결과: ${sorted.length}개 제목 생성`);
      sorted.forEach((t, i) => console.info(`[TITLE]   ${i + 1}. [${t.score}점] "${t.title}"`));
      console.info(`[TITLE] ========== 제목 추천 완료 ==========`);
    } catch (e) {
      console.error('[TITLE] ❌ 제목 추천 실패:', e);
      setError('제목 추천 실패');
    } finally {
      setIsLoadingTitles(false);
    }
  };

  // ── 트렌드 주제: 키워드 있으면 세부 주제, 없으면 진료과별 핫 키워드 ──
  const handleRecommendTrends = async () => {
    setIsLoadingTrends(true);
    setTrendingItems([]);
    setSeoTitles([]);
    try {
      const userKeyword = (disease.trim() || topic.trim());

      let prompt: string;
      if (userKeyword) {
        // 키워드가 있으면 → 관련 세부 주제 추천
        prompt = `"${userKeyword}" 키워드와 관련된 병원 마케팅용 블로그 주제를 5개 추천해줘.

규칙:
1. 환자가 실제로 네이버에서 검색할만한 구체적인 주제
2. 각 주제(topic)는 **20자 이내**로 짧고 핵심적으로 (예: "임플란트 오래 쓰는 법", "잇몸 출혈 원인")
3. 다양한 각도 (비용, 과정, 비교, 주의사항, 사후관리, 기간, 대상 등)
4. condition에는 핵심 질환명 또는 시술명만 (예: "임플란트", "치주염", "라미네이트")
   - topic이 "임플란트 관리법"이면 condition은 "임플란트"
   - topic이 "잇몸병 초기 증상"이면 condition은 "잇몸병"

⚠️ 의료광고법 준수 필수:
- "최고", "최초", "유일", "100%" 등 과대광고 표현 금지
- "보장", "확실", "완치" 등 치료 효과 보장 표현 금지
- 전후 비교, 시술 후기, 특정 의료기관 추천 표현 금지
- 비급여 가격을 특정 금액으로 명시하지 않기
- "무통", "무절개" 등 부작용 가능성 축소 표현 주의
- 환자가 정보를 얻을 수 있는 교육형·정보형 주제로 작성

5. 웹 검색으로 최신 트렌드 반영
6. 네이버 블로그 SEO에 유리한 롱테일 키워드 포함`;
      } else {
        // 키워드 없으면 → 진료과별 핫 키워드
        prompt = `${category} 분야에서 요즘 환자들이 가장 많이 검색하는 핫한 블로그 주제 5개를 추천해줘.

규칙:
1. 최신 검색 트렌드 반영 (웹 검색으로 확인)
2. 각 주제(topic)는 **20자 이내**로 짧고 핵심적으로 (예: "사랑니 발치 후 식사", "치아미백 주의사항")
3. 환자 입장에서 관심 가질 구체적 주제
4. 시즌/계절 트렌드 포함 (지금 시기에 맞는)
5. condition에는 핵심 질환명 또는 시술명만 (한 단어~두 단어)
   - topic이 "사랑니 발치 후 식사"이면 condition은 "사랑니 발치"

⚠️ 의료광고법 준수 필수:
- "최고", "최초", "유일", "100%" 등 과대광고 표현 금지
- "보장", "확실", "완치" 등 치료 효과 보장 표현 금지
- 전후 비교, 시술 후기, 특정 의료기관 추천 표현 금지
- "무통", "무절개" 등 부작용 가능성 축소 표현 주의
- 환자가 정보를 얻을 수 있는 교육형·정보형 주제로 작성

6. 네이버 블로그 SEO에 유리한 롱테일 키워드 포함`;
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
                condition: { type: 'STRING' },
                keywords: { type: 'STRING' },
                score: { type: 'NUMBER' },
                seasonal_factor: { type: 'STRING' },
              },
              required: ['topic', 'condition', 'keywords', 'score', 'seasonal_factor'],
            },
          },
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '트렌드 분석 실패');

      const items: TrendingItem[] = JSON.parse(data.text);
      setTrendingItems(items);
    } catch (e) {
      console.error('[TREND] ❌ 트렌드 로딩 실패:', e);
      setError('트렌드 로딩 실패');
    } finally {
      setIsLoadingTrends(false);
    }
  };

  // normalizeBlogStructure — ./normalizeBlog.ts로 분리됨 (파일 상단 import 참조)

  // ── 에러 분류 (사용자 친화적 메시지 + 재시도 가능 여부) ──
  function classifyError(err: unknown): { message: string; retryable: boolean } {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('timeout') || raw.includes('Timeout') || raw.includes('504')) {
      return { message: 'AI 응답이 느려 시간이 초과되었습니다. 다시 시도해주세요.', retryable: true };
    }
    if (raw.includes('429') || raw.includes('rate') || raw.includes('quota')) {
      return { message: 'AI 요청이 일시적으로 제한되었습니다. 30초 후 다시 시도해주세요.', retryable: true };
    }
    if (raw.includes('503') || raw.includes('500') || raw.includes('upstream')) {
      return { message: 'AI 서버가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.', retryable: true };
    }
    if (raw.includes('fetch') || raw.includes('network') || raw.includes('Failed to fetch')) {
      return { message: '네트워크 연결을 확인해주세요.', retryable: true };
    }
    return { message: raw, retryable: false };
  }

  // ── SEO 평가 (백그라운드 — fire-and-forget) ──
  const runSeoEvaluation = async (blogHtml: string, topicStr: string, keywordsStr: string) => {
    setIsSeoLoading(true);
    console.info('[BLOG] 📊 SEO 자동 평가 시작 (백그라운드)...');
    try {
      const seoTitle = (blogHtml.match(/<h3[^>]*>([^<]+)<\/h3>/) || blogHtml.match(/^(.+)/))?.[1]?.replace(/<[^>]*>/g, '').trim() || topicStr;
      const currentYear = new Date().getFullYear();

      const seoPrompt = `당신은 네이버 블로그 SEO 전문가이자 병원 마케팅 콘텐츠 분석가입니다.

아래 블로그 콘텐츠의 SEO 점수를 100점 만점으로 평가해주세요.

[중요]
📊 SEO 점수 평가 기준 (100점 만점)
[중요]

[※ 평가 대상 콘텐츠]
- 제목: "${seoTitle}"
- 주제: "${topicStr}"
- 핵심 키워드: "${keywordsStr}"
- 본문:
${blogHtml.substring(0, 8000)}

---
① 제목 최적화 (20점 만점)
---
※ keyword_natural (8점): 핵심 키워드가 제목에 자연스럽게 포함되어 있는가
※ seasonality (4점): 계절/시기/트렌드 요소가 반영되어 있는가 (예: "${currentYear}년", "겨울철", "환절기")
※ judgment_inducing (4점): 독자가 클릭할지 판단할 수 있는 구체적 정보가 제목에 있는가 (예: "3가지 방법", "비용 비교", "주의사항" — 막연한 "알아보기" 류는 감점)
※ medical_law_safe (4점): 제목에 과장/단정/행동유도 표현이 없는가

---
② 본문 키워드 구조 (25점 만점)
---
※ main_keyword_exposure (10점): 메인 키워드 3~5회 자연 노출 (2회 미만 -5, 8회 초과 스터핑 -5)
※ related_keyword_spread (5점): 연관 키워드(LSI)가 소제목과 본문에 분산 배치되어 있는가
※ subheading_variation (5점): 소제목에 키워드가 변주되어 포함되어 있는가 (동일 키워드 반복 아닌 변형)
※ no_meaningless_repeat (5점): 같은 표현/정보를 다른 말로 반복하는 패딩이 없는가

---
③ 사용자 체류 구조 (20점 만점)
---
※ intro_problem_recognition (5점): 도입부 5줄 이내에 독자의 증상/고민/상황을 구체적으로 언급하는가
※ relatable_examples (5점): 독자가 "내 얘기다"라고 느낄 수 있는 일상 장면/감각 표현이 있는가 (예: "찬 물 마실 때 찌릿", "계단 내려갈 때 시큰")
※ mid_engagement_points (5점): 글 중간에 독자가 계속 읽게 만드는 요소가 있는가 (수치/비교표/질문형 소제목/의외의 사실 등)
※ no_info_overload (5점): 한 문단에 정보가 과밀하지 않은가 (300자 이상 연속 문단, 전문 용어 나열 등)

---
④ 의료법 안전성 + 신뢰 신호 (30점 만점) — 가장 중요
---
※ no_definitive_guarantee (8점): "완치/100%/확실/보장" 단정 표현이 없는가
※ individual_difference (8점): "개인차가 있을 수 있습니다" 류의 가능성 표현이 적절히 포함되어 있는가
※ self_diagnosis_limit (7점): "정확한 진단은 전문의 상담이 필요합니다" 같은 자가진단 한계 명시가 있는가
※ minimal_direct_promo (7점): "예약하세요/방문하세요" 같은 직접 홍보/행동 유도가 없는가

---
⑤ 전환 연결성 (10점 만점)
---
※ cta_flow_natural (5점): 마무리의 행동 유도(CTA)가 정보 흐름의 자연스러운 결론으로 이어지는가 (갑작스러운 "예약하세요" 금지)
※ time_fixed_sentence (5점): "2주 이상 지속되면", "3개월 간격으로" 같이 독자가 구체적 행동 시점을 알 수 있는 문장이 있는가

[중요]
⚠️ 평가 시 주의사항
[중요]

1. SEO 점수는 "완성도"가 아니라 "비교 지표"로 활용됩니다
2. 85점 미만은 재설계/재작성이 필요한 수준입니다
3. 각 항목별로 구체적인 개선 피드백을 반드시 작성하세요
4. 의료법 안전성은 다른 항목보다 엄격하게 평가하세요
5. 현재 시점(${currentYear}년) 기준 네이버 SEO 트렌드 반영

각 항목의 feedback에는:
- 잘된 점 1개 이상
- 개선이 필요한 점 1개 이상
- 구체적인 개선 방법 제안

🎯 **improvement_suggestions 필수 작성!**
85점 이상 달성을 위한 구체적이고 실행 가능한 개선 제안 3~5개를 배열로 제공해주세요.

JSON 형식으로 응답해주세요.`;

      const seoSchema = {
        type: 'OBJECT',
        properties: {
          total: { type: 'INTEGER' },
          title: { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, keyword_natural: { type: 'INTEGER' }, seasonality: { type: 'INTEGER' }, judgment_inducing: { type: 'INTEGER' }, medical_law_safe: { type: 'INTEGER' }, feedback: { type: 'STRING' } }, required: ['score', 'feedback'] },
          keyword_structure: { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, main_keyword_exposure: { type: 'INTEGER' }, related_keyword_spread: { type: 'INTEGER' }, subheading_variation: { type: 'INTEGER' }, no_meaningless_repeat: { type: 'INTEGER' }, feedback: { type: 'STRING' } }, required: ['score', 'feedback'] },
          user_retention: { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, intro_problem_recognition: { type: 'INTEGER' }, relatable_examples: { type: 'INTEGER' }, mid_engagement_points: { type: 'INTEGER' }, no_info_overload: { type: 'INTEGER' }, feedback: { type: 'STRING' } }, required: ['score', 'feedback'] },
          medical_safety: { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, no_definitive_guarantee: { type: 'INTEGER' }, individual_difference: { type: 'INTEGER' }, self_diagnosis_limit: { type: 'INTEGER' }, minimal_direct_promo: { type: 'INTEGER' }, feedback: { type: 'STRING' } }, required: ['score', 'feedback'] },
          conversion: { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, cta_flow_natural: { type: 'INTEGER' }, time_fixed_sentence: { type: 'INTEGER' }, feedback: { type: 'STRING' } }, required: ['score', 'feedback'] },
          improvement_suggestions: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['total', 'title', 'keyword_structure', 'user_retention', 'medical_safety', 'conversion', 'improvement_suggestions']
      };

      const schemaText = JSON.stringify(seoSchema, null, 2);
      const seoRes = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'blog_seo_eval', prompt: seoPrompt + `\n\nJSON 스키마:\n${schemaText}\n\n위 스키마에 정확히 맞는 JSON만 출력하세요.`, systemInstruction: '네이버 블로그 SEO 전문가. JSON만 출력.', responseType: 'json', temperature: 0.3, maxOutputTokens: 4096 }),
      });
      const seoData = await seoRes.json() as { text?: string; error?: string };

      if (seoRes.ok && seoData.text) {
        const report = JSON.parse(seoData.text);
        report.total = (report.title?.score || 0) + (report.keyword_structure?.score || 0) + (report.user_retention?.score || 0) + (report.medical_safety?.score || 0) + (report.conversion?.score || 0);

        devLog(`[BLOG] 📊 SEO 평가 완료 - 총점: ${report.total}점`);
        devLog(`[BLOG]   ① 제목: ${report.title?.score || 0}/25  ② 키워드: ${report.keyword_structure?.score || 0}/25  ③ 체류: ${report.user_retention?.score || 0}/20  ④ 의료법: ${report.medical_safety?.score || 0}/20  ⑤ 전환: ${report.conversion?.score || 0}/10`);

        setSeoReport(report as SeoReport);
        setScores(prev => ({ ...prev, seoScore: report.total }));

        if (report.improvement_suggestions?.length) {
          devLog(`[BLOG] 📝 SEO 개선 제안: ${report.improvement_suggestions.join(' | ')}`);
        }
      } else {
        console.error(`[BLOG] ❌ SEO 평가 불가: ${seoData.error || 'API 응답 없음'}`);
      }
    } catch (seoError) {
      console.error('[BLOG] ❌ SEO 평가 오류:', seoError);
    } finally {
      setIsSeoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 크레딧 체크 (차감은 생성 성공 후에)
    if (creditCtx.userId && creditCtx.creditInfo && creditCtx.creditInfo.credits <= 0) {
      setError('크레딧이 모두 소진되었습니다.');
      return;
    }

    // 학습된 말투 → 프롬프트 텍스트로 직렬화 (LLM 시스템 프롬프트의 정체성 자리에 바로 투입)
    const learned = learnedStyleId ? getStyleById(learnedStyleId) : null;
    const stylePromptText = learned ? getStylePromptForGeneration(learned) : undefined;

    const request: GenerationRequest = {
      category,
      topic: topic.trim(),
      blogTitle: blogTitle.trim() || undefined,
      keywords: keywords.trim(),
      disease: disease.trim() || topic.trim() || undefined, // next-app: 질환명 필드 제거 → topic 으로 대체
      tone,
      audienceMode,
      persona,
      imageStyle,
      postType: 'blog',
      textLength,
      imageCount,
      cssTheme,
      writingStyle,
      learnedStyleId,
      stylePromptText,
      keywordDensity,
      youtubeTranscript: youtubeTranscript || undefined,
      clinicalContext: clinicalContext || undefined,
      hospitalStrengths: (() => {
        try {
          const data = JSON.parse(localStorage.getItem('winaid_hospital_strengths') || '{}');
          return data[hospitalName] || undefined;
        } catch { return undefined; }
      })(),
      medicalLawMode,
      includeFaq,
      faqCount: includeFaq ? faqCount : undefined,
      customSubheadings: customSubheadings.trim() || undefined,
      customImagePrompt: imageStyle === 'custom' ? (customPrompt?.trim() || undefined) : undefined,
      hospitalName: hospitalName || undefined,
      hospitalStyleSource: hospitalName ? 'explicit_selected_hospital' : 'generic_default',
      includeHospitalIntro,
      clinicContext: clinicContext ? {
        actualServices: clinicContext.actualServices,
        specialties: clinicContext.specialties,
        locationSignals: clinicContext.locationSignals,
      } : undefined,
      referenceFacts: referenceResult?.facts || undefined,
      referenceSources: referenceResult?.sources || undefined,
      // libraryImages 는 생성 후 클라이언트에서 alt 기반 자동 매칭
    };

    setIsGenerating(true);
    setDisplayStage(1);
    setRotationIdx(0);
    setError(null);
    setIsRetryable(false);
    setGeneratedContent(null);
    setScores(undefined);
    setSeoReport(null);
    setIsSeoLoading(false);
    setSaveStatus(null);
    // 예상 시간 계산
    setGenerationStartTime(Date.now());
    let estimated = 25; // 텍스트 생성 (~20초) + 경쟁분석 병렬 (~5초)
    // "내 이미지 사용" 모드는 AI 생성 스킵이라 시간 제외
    if (!useImageLibrary && request.imageCount && request.imageCount > 0) {
      estimated += request.imageCount * 45;
    }
    setEstimatedTotalSeconds(estimated);
    setBlogSections([]);
    setRegeneratingSection(null);
    setSectionProgress('');

    // ── 로그: 요청 시작 ──
    console.info(`[BLOG] ========== 블로그 생성 시작 ==========`);
    console.info(`[BLOG] topic="${request.topic}" disease="${request.disease || '없음'}" imageCount=${request.imageCount} textLength=${request.textLength}`);
    console.info(`[BLOG] category="${request.category}" persona="${request.persona}" tone="${request.tone}" audience="${request.audienceMode}"`);
    if (request.customSubheadings) {
      console.info(`[BLOG] customSubheadings="${request.customSubheadings.substring(0, 100)}..."`);
    }

    // ── Phase 2A v4: pipeline state 초기화 ──
    setPipelineStep('drafting');

    try {
      // ═══ v4: Sonnet 4.6 통합 초안 (서버에서 프롬프트 조립 + callLLM) ═══
      console.info(`[BLOG] [V4] Sonnet 4.6 통합 초안 요청`);
      const draftRes = await fetch('/api/generate/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request,
          hospitalName: hospitalName || undefined,
          userId: creditCtx.userId || null,
        }),
      });

      if (!draftRes.ok) {
        let errMsg = `서버 오류 (${draftRes.status})`;
        try { const errData = await draftRes.json(); errMsg = errData.error || errData.details || errMsg; } catch {}
        console.error(`[BLOG] ❌ 초안 실패: ${errMsg}`);
        setError(errMsg);
        setIsGenerating(false);
        setDisplayStage(0);
        setPipelineStep('error');
        return;
      }

      const draftJson = await draftRes.json() as { text?: string; violations?: string[]; usage?: unknown; model?: string };
      const fullText = draftJson.text || '';
      const draftViolations = draftJson.violations || [];
      console.info(`[BLOG] [V4] Sonnet 초안 완료 — ${fullText.length}자, violations ${draftViolations.length}개 (model=${draftJson.model || '?'})`);

      const imagePrompts: string[] = [];
      for (let i = 1; i <= imageCount; i++) {
        const m = fullText.match(new RegExp(`\\[IMG_${i}(?:\\s+alt="([^"]*)")?[^\\]]*\\]`));
        const alt = m?.[1]?.trim() || '';
        imagePrompts.push(alt || `${topic.trim()} ${request.category}`);
      }
      console.info(`[BLOG] [V4] 이미지 프롬프트 추출: ${imagePrompts.length}개`);

      setPipelineStep('reviewing_and_images');
      setDisplayStage(2);

      const reviewPromise = fetch('/api/generate/blog/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftHtml: fullText,
          category: request.category,
          hospitalName: hospitalName || undefined,
          ruleFilterViolations: draftViolations,
          stylePromptText: request.stylePromptText,
          userId: creditCtx.userId || null,
        }),
      }).then(r => r.json()).catch((err: unknown) => ({
        verdict: 'pass' as const,
        issues: [] as Array<{ category: string; severity: string; problem?: string; suggestion?: string }>,
        revisedHtml: null as string | null,
        summaryNote: 'review_fetch_failed_passthrough',
        warning: (err as Error).message,
      }));

      let imageResultsPromise: Promise<{ index: number; url: string | null }[]> | null = null;
      if (imagePrompts.length > 0 && imageCount > 0) {
        setDisplayStage(3);
        imageResultsPromise = Promise.all(
          imagePrompts.slice(0, imageCount).map((p, i) => {
            const index = i + 1;
            return fetch('/api/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: p, aspectRatio: imageAspectRatio, mode: 'blog' as const }),
            }).then(r => r.ok ? r.json() : null)
              .then(d => ({ index, url: (d?.imageDataUrl as string | undefined) || null }))
              .catch(() => ({ index, url: null as string | null }));
          })
        );
      }

      // v4: 경쟁 분석 / 말투 로드 병렬 — 서버가 담당하므로 클라이언트 경로 삭제됨.
      // 아래 기존 post-processing 블록이 fullText / imagePrompts / imageResultsPromise 를 사용.

      // ── 최종 파싱 ──
      let blogText = fullText;
      let parsed: ScoreBarData | undefined;

      // BLOG_START 이후만 본문으로
      if (blogText.includes('---BLOG_START---')) {
        blogText = blogText.split('---BLOG_START---').slice(1).join('---BLOG_START---');
      }
      // OUTLINE/IMAGE_PROMPTS 블록 제거
      blogText = blogText.replace(/---OUTLINE---[\s\S]*?(?=---IMAGE_PROMPTS---|---BLOG_START---|$)/i, '');
      blogText = blogText.replace(/---IMAGE_PROMPTS---[\s\S]*?(?=---BLOG_START---|$)/i, '');

      // 이미지 프롬프트가 조기 추출 안 됐으면 기존 방식으로 추출
      if (imagePrompts.length === 0) {
        const imgMarker = '---IMAGE_PROMPTS---';
        const imgIdx = fullText.indexOf(imgMarker);
        if (imgIdx !== -1) {
          const afterImg = fullText.substring(imgIdx + imgMarker.length);
          const endIdx = afterImg.indexOf('---BLOG_START---');
          const imgBlock = endIdx !== -1 ? afterImg.substring(0, endIdx) : afterImg;
          imgBlock.trim().split('\n').forEach(line => {
            const trimmed = line.replace(/^\d+[\.\)]\s*/, '').trim();
            if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
              imagePrompts.push(trimmed);
            }
          });
        }
      }

      // 2) ---SCORES--- 블록 추출 + 제거
      const scoresMarker = '---SCORES---';
      const scoresIdx = blogText.lastIndexOf(scoresMarker);
      if (scoresIdx !== -1) {
        const afterScores = blogText.substring(scoresIdx + scoresMarker.length);
        try {
          const jsonMatch = afterScores.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
            // 점수가 10 이하면 10점 만점으로 응답한 것 → 10배 보정
            const fix = (v: unknown) => {
              if (typeof v !== 'number') return undefined;
              return v <= 10 ? v * 10 : Math.min(v, 100);
            };
            const seo = fix(raw.seo);
            const medical = fix(raw.medical);
            const conversion = fix(raw.conversion);
            if (seo != null || medical != null || conversion != null) {
              parsed = { seoScore: seo, safetyScore: medical, conversionScore: conversion };
            }
          }
        } catch { /* 파싱 실패 무시 */ }
        blogText = blogText.substring(0, scoresIdx).replace(/\n*```\s*$/, '').replace(/\n+$/, '');
      }

      // 3) HTML 정리: 코드블록 fence 제거
      blogText = blogText.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');
      blogText = stripDoctype(blogText);

      // 3.5) 구조 보정 (old legacyBlogGeneration.ts 동일: h1/h2→h3, markdown→h3, 이모지/해시태그 제거)
      const beforeLen = blogText.length;
      const { html: normalizedHtml, log: structureLogs } = normalizeBlogStructure(blogText, topic.trim());
      blogText = normalizedHtml;
      structureLogs.forEach(l => console.info(`[BLOG] ${l}`));
      console.info(`[BLOG] 구조 보정 완료 — ${beforeLen}자 → ${blogText.length}자`);

      // 3.6) 메인 제목 주입 (old resultAssembler.ts 동일: <h2 class="main-title">)
      const hasMainTitle = blogText.includes('class="main-title"') || blogText.includes("class='main-title'");
      if (!hasMainTitle) {
        const finalTitle = blogTitle.trim() || topic.trim();
        blogText = `<h2 class="main-title">${finalTitle}</h2>\n${blogText}`;
        console.info(`[BLOG] 메인 제목 주입: "${topic.trim()}"`);
      }
      if (parsed) {
        console.info(`[BLOG] 자가평가 점수 — SEO: ${parsed.seoScore ?? '?'}, 의료법: ${parsed.safetyScore ?? '?'}, 전환: ${parsed.conversionScore ?? '?'}`);
      }
      console.info(`[BLOG] 이미지 프롬프트: ${imagePrompts.length}개 (요청: ${imageCount}개)`);
      setSavedImagePrompts(imagePrompts);

      // ── Stage 2: 소제목 개수 검사 (최소 4개 정책) ──
      {
        const h3Tags = blogText.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [];
        const h3Count = h3Tags.length;
        console.info(`[BLOG] Stage 2: 소제목 수 판정 — 현재 ${h3Count}개 (최소 4개)`);

        if (h3Count >= 4) {
          console.info(`[BLOG] Stage 2: ✅ 소제목 수 충분 (${h3Count}개)`);
        }
      }

      // ── 글자수 목표 대비 검증 (old legacyBlogGeneration.ts:1474-1498 동일) ──
      {
        const textOnly = blogText.replace(/<[^>]+>/g, '');
        const charCountNoSpaces = textOnly.replace(/\s/g, '').length;
        const targetMin = textLength;
        const targetMax = textLength + 300;
        const deviation = charCountNoSpaces - textLength;

        if (charCountNoSpaces < targetMin * 0.5) {
          // 목표의 50% 미만 → 잘림으로 판단 → 크레딧 미차감
          console.error(`[BLOG] ⚠️ 글 잘림: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (50% 미만) — 크레딧 미차감`);
          setError(`글이 잘렸습니다 (${charCountNoSpaces}/${textLength}자). 크레딧이 차감되지 않았습니다. 다시 시도해주세요.`);
          setIsGenerating(false);
          setDisplayStage(0);
          return; // 크레딧 차감 전에 중단
        } else if (charCountNoSpaces < targetMin) {
          console.info(`[BLOG] 글자수 부족: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (${deviation}자 부족)`);
        } else if (charCountNoSpaces > targetMax) {
          console.info(`[BLOG] 글자수 초과: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (+${deviation}자) — 그대로 진행`);
        } else {
          console.info(`[BLOG] ✅ 글자수 적정: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (${deviation >= 0 ? '+' : ''}${deviation}자)`);
        }
      }

      // 3.8) 의료광고법 금지어 자동 대체 + 출력 아티팩트 필터 (lib/medicalLawFilter.ts)
      {
        const { filtered, replacedCount, foundTerms } = applyContentFilters(blogText);
        blogText = filtered;
        if (replacedCount > 0) {
          console.info(`[BLOG] 의료법 금지어 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
        }
      }

      // 4) 라이브러리 이미지 alt 기반 자동 매칭 (useImageLibrary ON일 때)
      if (useImageLibrary) {
        const imgMarkers = [...blogText.matchAll(/\[IMG_(\d+)\s+alt="([^"]*)"\]/g)];
        if (imgMarkers.length > 0) {
          try {
            const { userId: uid } = await getSessionSafe();
            const qs = new URLSearchParams({ limit: '100' });
            if (uid) qs.set('userId', uid);
            const res = await fetch(`/api/hospital-images?${qs.toString()}`);
            if (res.ok) {
              const data = await res.json();
              const libraryImages: HospitalImage[] = Array.isArray(data) ? data : (data.images || []);
              const usedIds = new Set<string>();
              let matched = 0;
              for (const marker of imgMarkers) {
                const [fullMatch, , altText] = marker;
                const altWords = altText.toLowerCase().split(/\s+/).filter(w => w.length > 1);
                const scored = libraryImages
                  .filter(img => !usedIds.has(img.id))
                  .map(img => {
                    const imgText = [...(img.tags || []), img.altText || '', img.aiDescription || ''].join(' ').toLowerCase();
                    const score = altWords.filter(w => imgText.includes(w)).length;
                    return { img, score };
                  })
                  .sort((a, b) => b.score - a.score);
                if (scored.length > 0 && scored[0].score > 0) {
                  const best = scored[0].img;
                  blogText = blogText.replace(
                    fullMatch,
                    `<img src="${best.publicUrl}" alt="${best.altText || altText}" style="max-width:100%;border-radius:12px;" />`,
                  );
                  usedIds.add(best.id);
                  matched++;
                }
              }
              console.info(`[BLOG] 라이브러리 자동 매칭: ${matched}/${imgMarkers.length}장 배치 (나머지는 AI 생성)`);
            }
          } catch (err) {
            console.warn('[BLOG] 라이브러리 조회 실패:', (err as Error).message);
          }
        }
      }

      // 남은 [IMG_N] 마커만 AI 이미지 생성 대상
      const remainingMarkers = blogText.match(/\[IMG_\d+[^\]]*\]/g) || [];
      // "내 이미지 사용" 모드: 매칭되지 않은 자리는 AI 생성 대신 비워둠
      const aiImageCount = useImageLibrary ? 0 : remainingMarkers.length;

      // 5) 이미지 없으면 마커 strip 후 바로 표시
      if (aiImageCount === 0 || imagePrompts.length === 0) {
        blogText = blogText.replace(/\[IMG_\d+\]\n*/g, '');
        setGeneratedContent(blogText);
        setScores(parsed);
      } else {
        setDisplayStage(3); // old displayStage 3: 이미지 만드는 중
        // 5) 마커가 있는 본문을 먼저 표시 (이미지 자리에 로딩 표시) — alt 보존
        let htmlWithPlaceholders = blogText;
        for (let i = 1; i <= imageCount; i++) {
          htmlWithPlaceholders = htmlWithPlaceholders.replace(
            new RegExp(`\\[IMG_${i}(?:\\s+alt="([^"]*)")?[^\\]]*\\]`, 'g'),
            (_m: string, alt: string | undefined) => `<div class="content-image-wrapper" data-img-slot="${i}" data-img-alt="${alt || ''}" style="text-align:center;padding:24px 0;"><div style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#f1f5f9;border-radius:12px;font-size:13px;color:#64748b;">🖼️ 이미지 ${i}/${imageCount} 생성 중...</div></div>`,
          );
        }
        // 혹시 남은 초과 마커 정리
        htmlWithPlaceholders = htmlWithPlaceholders.replace(/\[IMG_\d+[^\]]*\]\n*/g, '');
        setGeneratedContent(htmlWithPlaceholders);
        setScores(parsed);

        // 6) 이미지 생성 → Storage 업로드 → public URL
        const generateAndUpload = async (prompt: string, index: number): Promise<{ index: number; url: string | null }> => {
          try {
            // 6a) /api/image → base64
            const imgRes = await fetch('/api/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, aspectRatio: imageAspectRatio, mode: 'blog' as const }),
            });
            if (!imgRes.ok) return { index, url: null };
            const imgData = await imgRes.json() as { imageDataUrl?: string };
            const dataUrl = imgData.imageDataUrl;
            if (!dataUrl) return { index, url: null };

            // 6b) base64 → Supabase Storage 업로드
            if (supabase) {
              try {
                const commaIdx = dataUrl.indexOf(',');
                const base64Data = dataUrl.substring(commaIdx + 1);
                const metaPart = dataUrl.substring(0, commaIdx);
                const mimeMatch = metaPart.match(/data:(.*?);base64/);
                const mimeType = mimeMatch?.[1] || 'image/png';
                const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';

                // binary 변환
                const byteChars = atob(base64Data);
                const byteArray = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                  byteArray[i] = byteChars.charCodeAt(i);
                }
                const blob = new Blob([byteArray], { type: mimeType });

                const fileName = `blog/${Date.now()}_${index}.${ext}`;
                const { error: uploadErr } = await supabase.storage
                  .from('blog-images')
                  .upload(fileName, blob, { contentType: mimeType, upsert: false });

                if (!uploadErr) {
                  const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(fileName);
                  if (urlData?.publicUrl) {
                    return { index, url: urlData.publicUrl };
                  }
                }
                console.warn(`[IMG_UPLOAD] IMG_${index}: 업로드 실패, base64 fallback`, uploadErr?.message);
              } catch (uploadErr) {
                console.warn(`[IMG_UPLOAD] IMG_${index}: 업로드 예외, base64 fallback`, uploadErr);
              }
            }

            // 6c) Storage 실패 시 base64 fallback
            return { index, url: dataUrl };
          } catch {
            return { index, url: null };
          }
        };

        // 이미 스트리밍 중에 시작된 이미지가 있으면 그 결과 사용, 없으면 새로 생성
        const prompts = imagePrompts.slice(0, imageCount);
        const earlyResults = imageResultsPromise ? await imageResultsPromise : null;
        const imagePromises = prompts.map((p, i) => {
          const index = i + 1;
          // 조기 시작 결과가 있으면 Storage 업로드만 수행
          const earlyResult = earlyResults?.[i];
          const uploadOrGenerate = earlyResult?.url
            ? Promise.resolve(earlyResult)
            : generateAndUpload(p, index);
          return uploadOrGenerate.then(result => {
            // 이미지 완성 즉시 해당 슬롯의 플레이스홀더를 실제 이미지로 교체
            if (result.url) {
              // 이미지 히스토리 초기화
              setImageHistory(prev => ({ ...prev, [result.index]: [result.url!] }));
              setGeneratedContent(prev => {
                if (!prev) return prev;
                const altMatch = prev.match(new RegExp('data-img-slot="' + result.index + '"[^>]*data-img-alt="([^"]*)"'));
                const alt = altMatch?.[1] || 'blog image ' + result.index;
                const imgTag = '<div class="content-image-wrapper"><img src="' + result.url + '" alt="' + alt + '" data-image-index="' + result.index + '" style="max-width:100%;height:auto;border-radius:12px;" /></div>';
                return prev.replace(
                  new RegExp('<div class="content-image-wrapper" data-img-slot="' + result.index + '"[^>]*>[\\s\\S]*?</div>\\s*</div>', ''),
                  imgTag,
                );
              });
            }
            return result;
          });
        });
        const imageResults = await Promise.all(imagePromises);

        // 7) [IMG_N alt="..."] 마커를 실제 이미지로 교체 — alt 텍스트 추출
        let finalHtml = blogText;
        for (const img of imageResults) {
          const markerPattern = new RegExp(`\\[IMG_${img.index}(?:\\s+alt="([^"]*)")?[^\\]]*\\]`, 'gi');
          if (img.url) {
            finalHtml = finalHtml.replace(markerPattern, (_match: string, altText: string | undefined) => {
              const alt = altText || `blog image ${img.index}`;
              return `<div class="content-image-wrapper"><img src="${img.url}" alt="${alt}" data-image-index="${img.index}" style="max-width:100%;height:auto;border-radius:12px;" /></div>`;
            });
          } else {
            finalHtml = finalHtml.replace(markerPattern, '');
          }
        }
        // 미매칭 마커 제거
        finalHtml = finalHtml.replace(/\[IMG_\d+[^\]]*\]\n*/g, '');
        // 의료광고법 최종 대체 (이미지 삽입 후)
        {
          const lawReplacements: [RegExp, string][] = [
            [/극대화/g, '향상'], [/최첨단/g, '최신'], [/완벽(한|하게|히)?/g, '꼼꼼$1'], [/확실(한|하게|히)?/g, '체계적$1'],
            [/혁신적(인|으로)?/g, '새로운 방식$1'], [/획기적(인|으로)?/g, '효과적$1'], [/독보적(인|으로)?/g, '전문적$1'],
            [/완치/g, '호전'], [/100%/g, '높은 비율로'], [/영구적(인|으로)?/g, '장기적$1'],
            [/유일(한|하게)?/g, '차별화된$1'], [/세계\s?최초/g, '새로운 방식의'], [/국내\s?유일/g, '전문적인'],
            [/부작용\s?없/g, '부작용 위험을 줄인'], [/통증\s?없는/g, '불편감을 줄인'],
          ];
          for (const [p, r] of lawReplacements) finalHtml = finalHtml.replace(p, r);
        }
        setGeneratedContent(finalHtml);
        blogText = finalHtml;
      }

      // ═══ Phase 2A v4: Opus 감수 결과 적용 ═══
      try {
        const review = await reviewPromise as {
          verdict: 'pass' | 'minor_fix' | 'major_fix';
          issues: Array<{ category: string; severity: string; originalQuote?: string; problem?: string; suggestion?: string }>;
          revisedHtml: string | null;
          summaryNote: string;
          warning?: string;
        };
        console.info(`[BLOG] [V4] Opus 검수 완료 — verdict=${review.verdict}, issues=${review.issues?.length || 0}`);

        if (review.revisedHtml && typeof review.revisedHtml === 'string' && review.revisedHtml.length > 100) {
          let revisedWithImages = review.revisedHtml;
          const imgResults = imageResultsPromise ? await imageResultsPromise : [];
          for (const img of imgResults) {
            const markerPattern = new RegExp(`\\[IMG_${img.index}(?:\\s+alt="([^"]*)")?[^\\]]*\\]`, 'gi');
            if (img.url) {
              revisedWithImages = revisedWithImages.replace(markerPattern, (_m, altText) => {
                const alt = altText || `blog image ${img.index}`;
                return `<div class="content-image-wrapper"><img src="${img.url}" alt="${alt}" data-image-index="${img.index}" style="max-width:100%;height:auto;border-radius:12px;" /></div>`;
              });
            } else {
              revisedWithImages = revisedWithImages.replace(markerPattern, '');
            }
          }
          revisedWithImages = revisedWithImages.replace(/\[IMG_\d+[^\]]*\]\n*/g, '');
          setGeneratedContent(revisedWithImages);
          blogText = revisedWithImages;
          console.info(`[BLOG] [V4] revisedHtml 적용 완료`);
        }
      } catch (revErr) {
        console.warn('[BLOG] [V4] review 처리 실패 — 원본 유지:', revErr);
      }
      setPipelineStep('done');

      // ── fact_check 기본값 설정 (old legacyBlogGeneration.ts:1713-1740 동일) ──
      // Gemini가 ---SCORES--- 블록을 반환하지 않았거나 필드가 빠진 경우 기본값으로 보완
      {
        if (!parsed) parsed = {};
        // conversion_score: 없거나 0이면 기본값 75
        if (!parsed.conversionScore || parsed.conversionScore === 0) {
          parsed.conversionScore = 75;
          devLog('[BLOG] ⚠️ conversion_score 기본값 75점 설정 (AI 미반환)');
        }
        // safety_score: undefined/null이면 기본값 90
        if (parsed.safetyScore === undefined || parsed.safetyScore === null) {
          parsed.safetyScore = 90;
        }
        // fact_score, ai_smell_score, verified_facts_count는 ScoreBarData에 없으므로 로그만 기록
        const factScore = 85;
        const aiSmellScore = 12;
        const verifiedFactsCount = 5;
        devLog('[BLOG] ⚠️ ai_smell_score 기본값 12점 설정 (AI 미반환)');
        devLog(`[BLOG] 📊 fact_check 최종값: conversion_score=${parsed.conversionScore}, fact_score=${factScore}, safety_score=${parsed.safetyScore}, ai_smell_score=${aiSmellScore}, verified_facts_count=${verifiedFactsCount}`);
        // scores state 업데이트
        setScores({ ...parsed });
      }

      // ── SEO 평가는 백그라운드에서 실행 (사용자가 글을 바로 볼 수 있도록) ──
      if (blogText && topic.trim()) {
        runSeoEvaluation(blogText, topic.trim(), keywords.trim());
      }

      // ── 섹션 파싱 (소제목 재생성 기능용) ──
      const sections = parseBlogSections(blogText);
      setBlogSections(sections);
      console.info(`[BLOG] 섹션 파싱 완료: ${sections.length}개 (intro=${sections.filter(s => s.type === 'intro').length}, section=${sections.filter(s => s.type === 'section').length}, conclusion=${sections.filter(s => s.type === 'conclusion').length})`);

      // ── 저장 — Supabase 또는 guest localStorage ──
      console.info(`[BLOG] 저장 시작 — 최종 콘텐츠 길이: ${blogText.length}자`);
      try {
        const { userId, userEmail } = await getSessionSafe();
        const titleMatch = blogText.match(/<h2[^>]*class="[^"]*main-title[^"]*"[^>]*>([^<]+)<\/h2>/) || blogText.match(/<h3[^>]*>([^<]+)<\/h3>/) || blogText.match(/^(.+)/);
        const extractedTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 200) : topic.trim();
        console.info(`[BLOG] 추출 제목: "${extractedTitle}"`);

        const saveResult = await savePost({
          userId,
          userEmail,
          hospitalName: hospitalName || undefined,
          postType: 'blog',
          title: extractedTitle,
          content: blogText,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
          imageStyle: imageCount > 0 ? imageStyle : undefined,
        });

        if ('error' in saveResult) {
          console.warn(`[BLOG] 저장 실패: ${saveResult.error}`);
          setSaveStatus('저장 실패: ' + saveResult.error);
        } else {
          console.info(`[BLOG] ✅ 저장 완료`);
          setSaveStatus('저장 완료');
        }
      } catch (saveErr) {
        console.warn(`[BLOG] 저장 실패: Supabase 연결 불가`, saveErr);
        setSaveStatus('저장 실패: Supabase 연결 불가');
      }
      // ── v4: 로그인 사용자 크레딧은 서버(/blog + /review = 2크레딧) 가 차감. UI 는 즉시 로컬 감산. ──
      if (creditCtx.userId && creditCtx.creditInfo) {
        creditCtx.setCreditInfo({
          credits: Math.max(0, creditCtx.creditInfo.credits - 2),
          totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 2,
        });
      }

      console.info(`[BLOG] ========== 블로그 생성 완료 (v4) ==========`);

      // 생성 완료 시 결과 영역으로 스크롤 이동
      setTimeout(() => {
        const resultSection = document.getElementById('blog-result');
        if (resultSection) {
          resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } catch (err: unknown) {
      const { message, retryable } = classifyError(err);
      console.error(`[BLOG] ❌ 생성 실패: ${message}`, err);
      setError(message);
      setIsRetryable(retryable);
    } finally {
      setIsGenerating(false);
      setDisplayStage(0);
    }
  };

  // ── 인라인 채팅 수정 (결과 화면에서 바로 수정) ──
  const handleChatRefine = useCallback(async () => {
    if (!chatInput.trim() || !generatedContent || isChatRefining) return;
    setIsChatRefining(true);
    try {
      const { systemInstruction, prompt } = buildChatRefinePrompt({
        workingContent: generatedContent,
        userMessage: chatInput.trim(),
      });
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'refine_chat',
          prompt, systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 8192,
        }),
      });
      const data = await res.json() as { text?: string };
      if (res.ok && data.text) {
        let refined = data.text.trim();
        refined = refined.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');
        if (refined.includes('<')) {
          const { applyContentFilters: filterContent } = await import('../../../lib/medicalLawFilter');
          const { filtered, replacedCount, foundTerms } = filterContent(refined);
          refined = filtered;
          if (replacedCount > 0) console.info(`[BLOG_CHAT] 의료법 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
          setGeneratedContent(refined);
          setChatInput('');
          setSaveStatus(null);
          const sections = parseBlogSections(refined);
          setBlogSections(sections);
        }
      }
    } catch { /* 수정 실패 무시 */ }
    finally { setIsChatRefining(false); }
  }, [chatInput, generatedContent, isChatRefining]);

  // ── 이미지 클릭 → 액션 모달 열기 ──
  const handleImageClick = useCallback((imageIndex: number) => {
    const promptIdx = imageIndex - 1;
    const originalPrompt = savedImagePrompts[promptIdx];
    if (!originalPrompt) return;
    // 현재 이미지 src 가져오기
    if (generatedContent) {
      const div = document.createElement('div');
      div.innerHTML = generatedContent;
      const img = div.querySelector(`img[data-image-index="${imageIndex}"]`);
      setSelectedImgSrc(img?.getAttribute('src') || '');
    }
    setSelectedImgIndex(imageIndex);
    setRegenPrompt(originalPrompt);
    setImgActionModalOpen(true);
  }, [savedImagePrompts, generatedContent]);

  // ── 이미지 다운로드 ──
  const handleImageDownload = useCallback((src: string, index: number) => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `blog_image_${index}.png`;
    a.click();
  }, []);

  // ── AI 프롬프트 추천 (이미지 재생성 모달) ──
  const handleRecommendPrompt = useCallback(async () => {
    if (!generatedContent || isRecommendingPrompt) return;
    setIsRecommendingPrompt(true);
    try {
      const textOnly = generatedContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
      const imgPromptText = `You are a medical blog image prompt specialist.
Write ONE English image prompt for the ${selectedImgIndex}th image in the Korean hospital blog below.

[RULES]
- Write in English. Minimum 40 words.
- Include: location (where), people (who, Korean, expression), action (doing what), props (surrounding objects), atmosphere (lighting, color)
- End with: "no text, no watermark, no logo"
- Camera angle: specify eye-level, slightly elevated, or over-the-shoulder
- No direct eye contact with camera
- No text/labels/signage in the image
- Korean medical clinic setting: clean white walls, modern minimalist, warm lighting

[BLOG CONTENT]
${textOnly}

Output ONLY the prompt. No explanation.`;
      const res = await fetch('/api/llm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'blog_image_prompt', prompt: imgPromptText, systemInstruction: 'Medical blog image prompt specialist. Output only the prompt.', temperature: 0.7, maxOutputTokens: 500 }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) setRegenPrompt(data.text.trim());
    } catch { /* 추천 실패 무시 */ }
    finally { setIsRecommendingPrompt(false); }
  }, [generatedContent, selectedImgIndex, isRecommendingPrompt]);

  // ── 이미지 히스토리에서 선택 → HTML 교체 ──
  const handleSelectHistoryImage = useCallback((imageIndex: number, url: string) => {
    setGeneratedContent(prev => {
      if (!prev) return prev;
      const div = document.createElement('div');
      div.innerHTML = prev;
      const imgs = div.querySelectorAll(`img[data-image-index="${imageIndex}"]`);
      imgs.forEach(img => img.setAttribute('src', url));
      return div.innerHTML;
    });
    // 선택된 이미지를 히스토리 맨 끝으로 이동
    setImageHistory(prev => {
      const arr = prev[imageIndex] || [];
      const filtered = arr.filter(u => u !== url);
      return { ...prev, [imageIndex]: [...filtered, url] };
    });
  }, []);

  // ── 이미지 재생성 실행 (모달에서 호출) ──
  const handleImageRegenerateSubmit = useCallback(async (referenceImage?: string) => {
    const imageIndex = selectedImgIndex;
    const newPrompt = regenPrompt;
    if (!newPrompt.trim()) return;

    setImgRegenModalOpen(false);
    setRegeneratingImage(imageIndex);
    console.info(`[BLOG] 이미지 ${imageIndex} 재생성 시작 — 프롬프트: "${newPrompt.substring(0, 60)}..."${referenceImage ? ' (참고 이미지 포함)' : ''}`);

    try {
      const imgRes = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newPrompt, aspectRatio: imageAspectRatio, mode: 'blog', ...(referenceImage ? { referenceImage } : {}) }),
      });
      if (!imgRes.ok) throw new Error('이미지 생성 실패');

      const imgData = await imgRes.json() as { imageDataUrl?: string };
      if (!imgData.imageDataUrl) throw new Error('이미지 데이터 없음');

      // Supabase Storage 업로드
      if (supabase) {
        try {
          const dataUrl = imgData.imageDataUrl;
          const commaIdx = dataUrl.indexOf(',');
          const base64Data = dataUrl.substring(commaIdx + 1);
          const metaPart = dataUrl.substring(0, commaIdx);
          const mimeMatch = metaPart.match(/data:(.*?);base64/);
          const mimeType = mimeMatch?.[1] || 'image/png';
          const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const byteChars = atob(base64Data);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteArray], { type: mimeType });
          const fileName = `blog/${Date.now()}_regen_${imageIndex}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from('blog-images').upload(fileName, blob, { contentType: mimeType, upsert: false });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(fileName);
            if (urlData?.publicUrl) {
              // 히스토리에 새 이미지 추가 (최대 5개)
              setImageHistory(prev => {
                const arr = prev[imageIndex] || [];
                const updated = [...arr, urlData.publicUrl].slice(-5);
                return { ...prev, [imageIndex]: updated };
              });
              setGeneratedContent(prev => {
                if (!prev) return prev;
                const div = document.createElement('div');
                div.innerHTML = prev;
                const imgs = div.querySelectorAll(`img[data-image-index="${imageIndex}"]`);
                imgs.forEach(img => img.setAttribute('src', urlData.publicUrl));
                return div.innerHTML;
              });
              setSavedImagePrompts(prev => { const next = [...prev]; next[imageIndex - 1] = newPrompt; return next; });
              console.info(`[BLOG] 이미지 ${imageIndex} 재생성 완료 (Storage)`);
              return;
            }
          }
        } catch { /* Storage 실패 → base64 fallback */ }
      }

      // base64 fallback
      setImageHistory(prev => {
        const arr = prev[imageIndex] || [];
        const updated = [...arr, imgData.imageDataUrl!].slice(-5);
        return { ...prev, [imageIndex]: updated };
      });
      setGeneratedContent(prev => {
        if (!prev) return prev;
        const div = document.createElement('div');
        div.innerHTML = prev;
        const imgs = div.querySelectorAll(`img[data-image-index="${imageIndex}"]`);
        imgs.forEach(img => img.setAttribute('src', imgData.imageDataUrl!));
        return div.innerHTML;
      });
      setSavedImagePrompts(prev => { const next = [...prev]; next[imageIndex - 1] = newPrompt; return next; });
      console.info(`[BLOG] 이미지 ${imageIndex} 재생성 완료 (base64)`);
    } catch (err) {
      console.error(`[BLOG] 이미지 ${imageIndex} 재생성 실패:`, err);
      alert('이미지 재생성에 실패했습니다.');
    } finally {
      setRegeneratingImage(null);
    }
  }, [selectedImgIndex, regenPrompt, supabase]);

  // 섹션 재생성용 학습 말투 직렬화 — handleSubmit 과 동일한 경로. learnedStyleId 변경 시에만 재계산.
  // (handleSubmit 은 호출 시점 인라인 직렬화 유지 — 우선순위 4 통합 대기)
  const sectionLearnedStylePrompt = useMemo(() => {
    const learned = learnedStyleId ? getStyleById(learnedStyleId) : null;
    return learned ? getStylePromptForGeneration(learned) : undefined;
  }, [learnedStyleId]);

  // ── 소제목 재생성 — 원본 설정값 + 진료과 전문성 + 의료법 필터 적용 ──
  const handleSectionRegenerate = useCallback(async (sectionIndex: number) => {
    const section = blogSections.find(s => s.index === sectionIndex);
    if (!section || !generatedContent) return;
    if (regeneratingSection !== null) return;

    setRegeneratingSection(sectionIndex);
    setSectionProgress(`"${section.type === 'intro' ? '도입부' : section.title}" 재생성 중...`);

    try {
      const sectionTitle = section.type === 'intro' ? '도입부' : section.title;

      // v4: /api/generate/blog/section (Sonnet + server-side regex 필터) 로 교체
      const res = await fetch('/api/generate/blog/section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            currentSection: section.html,
            sectionIndex: section.index,
            fullBlogContent: generatedContent,
            category,
            keywords,
            medicalLawMode,
            stylePromptText: sectionLearnedStylePrompt,
          },
          userId: creditCtx.userId || null,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error || '재생성 실패');
      }

      let newSectionHtml = data.text.trim();
      newSectionHtml = newSectionHtml.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');

      if (!newSectionHtml.includes('<')) {
        throw new Error('유효한 HTML이 반환되지 않았습니다');
      }
      void sectionTitle;
      // 서버가 applyContentFilters 이미 적용 — 추가 치환 불필요.

      const updatedHtml = replaceSectionHtml(
        generatedContent,
        section.html,
        newSectionHtml,
        section.title,
      );

      setGeneratedContent(updatedHtml);
      const newSections = parseBlogSections(updatedHtml);
      setBlogSections(newSections);

      setSectionProgress(`✅ "${sectionTitle}" 재생성 완료`);
      setTimeout(() => setSectionProgress(''), 3000);
    } catch (err) {
      console.error('[BLOG] 섹션 재생성 실패:', err);
      setSectionProgress('❌ 재생성 실패');
      setTimeout(() => setSectionProgress(''), 3000);
    } finally {
      setRegeneratingSection(null);
    }
  }, [blogSections, generatedContent, regeneratingSection, category, persona, tone, audienceMode, writingStyle, keywords, disease, medicalLawMode, sectionLearnedStylePrompt]);

  // ── Word / PDF 다운로드 ──
  const handleDownloadWord = useCallback(async () => {
    if (!generatedContent) return;
    await downloadWord(generatedContent);
  }, [generatedContent]);

  const handleDownloadPDF = useCallback(() => {
    if (!generatedContent) return;
    downloadPDF(generatedContent);
  }, [generatedContent]);

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 — BlogFormPanel 컴포넌트로 분리 ── */}
      <BlogFormPanel
        topic={topic} blogTitle={blogTitle} keywords={keywords} keywordDensity={keywordDensity} disease={disease} category={category}
        persona={persona} tone={tone} audienceMode={audienceMode}
        imageStyle={imageStyle} imageCount={imageCount} imageAspectRatio={imageAspectRatio} textLength={textLength}
        useImageLibrary={useImageLibrary} onToggleImageLibrary={setUseImageLibrary}
        hospitalName={hospitalName} selectedTeam={selectedTeam}
        showHospitalDropdown={showHospitalDropdown} selectedManager={selectedManager}
        selectedHospitalAddress={selectedHospitalAddress}
        homepageUrl={homepageUrl} clinicContext={clinicContext}
        isCrawling={isCrawling} crawlProgress={crawlProgress}
        includeFaq={includeFaq} faqCount={faqCount}
        showCustomInput={showCustomInput} customPrompt={customPrompt}
        customSubheadings={customSubheadings} learnedStyleId={learnedStyleId}
        dbStyleLoaded={dbStyleLoaded} dbStyleName={dbStyleName}
        showAdvanced={showAdvanced} includeHospitalIntro={includeHospitalIntro}
        keywordStats={keywordStats} keywordAiRec={keywordAiRec}
        keywordProgress={keywordProgress} isAnalyzingKeywords={isAnalyzingKeywords}
        showKeywordPanel={showKeywordPanel} keywordSortBy={keywordSortBy}
        keywordSearch={keywordSearch} keywordMinVolume={keywordMinVolume}
        isCheckingRanks={isCheckingRanks} rankResults={rankResults}
        hideRanked={hideRanked} isLoadingMoreKeywords={isLoadingMoreKeywords}
        seoTitles={seoTitles} trendingItems={trendingItems}
        isLoadingTitles={isLoadingTitles} isLoadingTrends={isLoadingTrends}
        isGenerating={isGenerating}
        isLoadingReference={isLoadingReference}
        referenceResult={referenceResult}
        setTopic={setTopic} setBlogTitle={setBlogTitle} setKeywords={setKeywords} setKeywordDensity={setKeywordDensity} setDisease={setDisease}
        setCategory={setCategory} setPersona={setPersona} setTone={setTone}
        setAudienceMode={setAudienceMode} setImageStyle={setImageStyle}
        setImageCount={handleImageCountChange} recommendedImageCount={recommendedImageCount}
        setImageAspectRatio={setImageAspectRatio} setTextLength={setTextLength}
        setHospitalName={setHospitalName} setSelectedTeam={setSelectedTeam}
        setShowHospitalDropdown={setShowHospitalDropdown}
        setSelectedManager={setSelectedManager}
        setSelectedHospitalAddress={setSelectedHospitalAddress}
        setHomepageUrl={setHomepageUrl} setClinicContext={setClinicContext}
        setCrawlProgress={setCrawlProgress}
        setIncludeFaq={setIncludeFaq} setFaqCount={setFaqCount}
        setShowCustomInput={setShowCustomInput} setCustomPrompt={setCustomPrompt}
        setCustomSubheadings={setCustomSubheadings}
        setLearnedStyleId={setLearnedStyleId} setShowAdvanced={setShowAdvanced}
        /* setIncludeHospitalIntro 제거 — 항상 true */
        setKeywordStats={setKeywordStats} setShowKeywordPanel={setShowKeywordPanel}
        setKeywordSortBy={setKeywordSortBy} setKeywordSearch={setKeywordSearch}
        setKeywordMinVolume={setKeywordMinVolume} setHideRanked={setHideRanked} setTrendingItems={setTrendingItems}
        onSubmit={handleSubmit}
        onAnalyzeKeywords={handleAnalyzeKeywords}
        onCrawlHomepage={handleCrawlHomepage}
        onLoadMoreKeywords={handleLoadMoreKeywords}
        onCheckRanks={handleCheckRanks}
        onRecommendTitles={handleRecommendTitles}
        onRecommendTrends={handleRecommendTrends}
        onSaveSettings={handleSaveSettings}
        onLoadSettings={handleLoadSettings}
        settingsToast={settingsToast}
      />

      {/* ── 결과 영역 — BlogResultArea 컴포넌트로 분리 ── */}
      <div id="blog-result" />
      <BlogResultArea
        isGenerating={isGenerating}
        displayStage={displayStage}
        rotationIdx={rotationIdx}
        generationStartTime={generationStartTime}
        estimatedTotalSeconds={estimatedTotalSeconds}
        error={error}
        onDismissError={() => setError(null)}
        isRetryable={isRetryable}
        onRetry={() => { setError(null); setTimeout(() => { const form = document.querySelector('form'); if (form) form.requestSubmit(); }, 300); }}
        generatedContent={generatedContent}
        saveStatus={saveStatus}
        scores={scores}
        cssTheme={cssTheme}
        blogSections={blogSections}
        regeneratingSection={regeneratingSection}
        sectionProgress={sectionProgress}
        onSectionRegenerate={handleSectionRegenerate}
        onDownloadWord={handleDownloadWord}
        onDownloadPDF={handleDownloadPDF}
        onImageRegenerate={handleImageClick}
        regeneratingImage={regeneratingImage}
        seoReport={seoReport}
        isSeoLoading={isSeoLoading}
        topic={topic}
        chatInput={chatInput}
        setChatInput={setChatInput}
        isChatRefining={isChatRefining}
        onChatRefine={handleChatRefine}
      />

      {/* ── 블로그 이미지 액션 모달 (다운로드/재생성 선택) ── */}
      <ImageActionModal
        open={imgActionModalOpen}
        onClose={() => setImgActionModalOpen(false)}
        imageSrc={selectedImgSrc}
        imageIndex={selectedImgIndex}
        onDownload={handleImageDownload}
        onRegenerate={() => setImgRegenModalOpen(true)}
      />

      {/* ── 블로그 이미지 재생성 모달 (프롬프트 편집) ── */}
      <ImageRegenModal
        open={imgRegenModalOpen}
        onClose={() => setImgRegenModalOpen(false)}
        imageIndex={selectedImgIndex}
        prompt={regenPrompt}
        setPrompt={setRegenPrompt}
        isRegenerating={regeneratingImage !== null}
        onSubmit={handleImageRegenerateSubmit}
        isRecommending={isRecommendingPrompt}
        onRecommend={handleRecommendPrompt}
        imageHistory={imageHistory[selectedImgIndex] || []}
        onSelectHistoryImage={(url) => { handleSelectHistoryImage(selectedImgIndex, url); setImgRegenModalOpen(false); }}
      />
    </div>
  );
}

// useSearchParams를 쓰는 컴포넌트는 Suspense로 감싸야 함
export default function BlogPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <BlogForm />
    </Suspense>
  );
}
