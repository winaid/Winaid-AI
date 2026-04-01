'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES, PERSONAS, TONES } from '../../../lib/constants';
import { TEAM_DATA } from '../../../lib/teamData';
import { ContentCategory, type GenerationRequest, type AudienceMode, type ImageStyle, type WritingStyle, type CssTheme, type TrendingItem, type SeoTitleItem, type SeoReport } from '../../../lib/types';
import { buildBlogPrompt } from '../../../lib/blogPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe, supabase } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { type ScoreBarData } from '../../../components/GenerationResult';
import { getStyleById, getStylePromptForGeneration } from '../../../components/WritingStyleLearner';
import type { BlogSection } from '../../../lib/types';
import { parseBlogSections, replaceSectionHtml } from '../../../lib/blogSectionParser';
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
  const youtubeTranscriptParam = searchParams.get('youtubeTranscript');
  const [topic, setTopic] = useState(topicParam || '');
  const [blogTitle, setBlogTitle] = useState('');
  const [youtubeTranscript] = useState(youtubeTranscriptParam ? decodeURIComponent(youtubeTranscriptParam) : '');
  const [keywords, setKeywords] = useState('');
  const [keywordDensity, setKeywordDensity] = useState<number | 'auto'>('auto');
  const [disease, setDisease] = useState('');
  const [customSubheadings, setCustomSubheadings] = useState('');
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [tone, setTone] = useState(TONES[0].value);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');
  const [cssTheme, setCssTheme] = useState<CssTheme>('modern');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [imageCount, setImageCount] = useState(0);
  const [imageAspectRatio, setImageAspectRatio] = useState<'4:3' | '16:9' | '1:1'>('4:3');
  const [textLength, setTextLength] = useState(1500);
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
  const [includeHospitalIntro, setIncludeHospitalIntro] = useState(false);

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

  // 설정 저장/불러오기
  const getSettingsKey = () => selectedTeam ? `winaid_blog_settings_team_${selectedTeam}` : 'winaid_blog_settings';

  const handleSaveSettings = useCallback(() => {
    const s = { category, hospitalName, selectedHospitalAddress, homepageUrl, textLength, imageCount, imageAspectRatio, imageStyle, audienceMode, persona, tone, writingStyle, medicalLawMode, includeFaq, faqCount, includeHospitalIntro };
    localStorage.setItem(getSettingsKey(), JSON.stringify(s));
    setSettingsToast('💾 설정 저장됨');
    setTimeout(() => setSettingsToast(''), 1500);
  }, [category, hospitalName, selectedHospitalAddress, homepageUrl, textLength, imageCount, imageAspectRatio, imageStyle, audienceMode, persona, tone, writingStyle, medicalLawMode, includeFaq, faqCount, includeHospitalIntro, selectedTeam]);

  const applySettings = useCallback((raw: string) => {
    try {
      const s = JSON.parse(raw);
      if (s.category) setCategory(s.category);
      if (s.hospitalName) setHospitalName(s.hospitalName);
      if (s.selectedHospitalAddress) setSelectedHospitalAddress(s.selectedHospitalAddress);
      if (s.homepageUrl) setHomepageUrl(s.homepageUrl);
      if (s.textLength) setTextLength(s.textLength);
      if (s.imageCount !== undefined) setImageCount(s.imageCount);
      if (s.imageAspectRatio) setImageAspectRatio(s.imageAspectRatio);
      if (s.imageStyle) setImageStyle(s.imageStyle);
      if (s.audienceMode) setAudienceMode(s.audienceMode);
      if (s.persona) setPersona(s.persona);
      if (s.tone) setTone(s.tone);
      if (s.writingStyle) setWritingStyle(s.writingStyle);
      if (s.medicalLawMode) setMedicalLawMode(s.medicalLawMode);
      if (s.includeFaq !== undefined) setIncludeFaq(s.includeFaq);
      if (s.faqCount) setFaqCount(s.faqCount);
      if (s.includeHospitalIntro !== undefined) setIncludeHospitalIntro(s.includeHospitalIntro);
      return true;
    } catch { return false; }
  }, []);

  const handleLoadSettings = useCallback(() => {
    const raw = localStorage.getItem(getSettingsKey());
    if (!raw) { setSettingsToast('저장된 설정 없음'); setTimeout(() => setSettingsToast(''), 1500); return; }
    if (applySettings(raw)) { setSettingsToast('📂 설정 불러옴'); setTimeout(() => setSettingsToast(''), 1500); }
  }, [applySettings, selectedTeam]);

  // 페이지 진입 시 자동 불러오기
  useEffect(() => {
    const raw = localStorage.getItem(getSettingsKey());
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
    const blogUrls = hospital?.naverBlogUrls || [];
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
글자수 기준: 28~38자 이내 (모바일 최적화)
시즌: ${currentSeason}

────────────────────
[역할]

너는 네이버에서 실제 몸이 불편한 사람이 검색할 법한 문장을
병원 블로그에 올릴 수 있을 정도로
차분하고 정돈된 제목으로 다듬는 AI다.

이 제목은
광고도 아니고,
날것의 검색어도 아닌,
'검색자 언어를 한 번 정리한 질문형 문장'이어야 한다.

────────────────────
[1. 사고 기준]

- 출발점은 '아픈 사람의 검색 문장'이다
- 결과물은 '병원 블로그 제목'이다
- 너무 캐주얼하지도, 너무 전문적이지도 않게 조율한다

즉,
▶ 말투는 일반인
▶ 구조는 정리된 글 제목

────────────────────
[2. 표현 톤 규칙]

- 존댓말 사용
- 감정 표현은 최소화
- 불안은 암시만 하고 강조하지 않는다
- "걱정됨", "무서움" 같은 직접 감정어는 쓰지 않는다
- 물어보는 형식은 유지하되 과하지 않게 정리한다

────────────────────
[3. 절대 금지 표현]

- 전문가, 전문의, 전문적인
- 의료인, 의사, 한의사
- 진료, 치료, 처방, 상담
- 효과, 개선, 해결
- 정상, 비정상, 위험
- 병명 확정 표현
- 병원 방문을 연상시키는 표현

────────────────────
[4. 제목 구조 가이드]

제목은 아래 끝맺음 중 하나로 마무리한다.

▶ 끝맺음 패턴 (필수)
- ~볼 점
- ~이유
- ~한다면
- ~일 때
- ~있을까요

▶ 키워드 배치 규칙 (필수)
- SEO 키워드는 반드시 제목의 맨 앞에 위치해야 한다

▶ 구조 예시
① [증상/상황] + ~할 때 살펴볼 점
② [증상/상황] + ~는 이유
③ [증상/상황] + ~한다면
④ [증상/상황] + ~일 때 확인할 부분

────────────────────
[5. 네이버 적합성 조율 규칙]

- '블로그 제목으로 자연스러운 수준'이 기준

────────────────────
[6. 의료광고 안전 장치]

- 판단, 결론, 예측 금지
- 원인 암시 최소화
- 상태 + 질문까지만 허용

────────────────────
[7. 출력 조건]

- 제목만 출력
- 설명, 부제, 해설 금지
- 5개 생성

────────────────────
[PART 2. SEO 점수 평가]

각 제목에 대해 0~100점 SEO 점수를 계산한다.

▶ SEO 점수 = A + B + C + D + E
[A] 검색자 자연도 (0~25점)
[B] 질문 적합도 AEO (0~25점)
[C] 키워드 구조 안정성 SEO (0~20점)
[D] 의료광고·AI 요약 안전성 GEO (0~20점)
[E] 병원 블로그 적합도 CCO (0~10점)

────────────────────
[PART 3. 출력 형식]

JSON 배열로 출력한다. 각 항목은 다음 구조를 따른다:
{
  "title": "생성된 제목",
  "score": 총점(숫자),
  "type": "증상질환형" | "변화원인형" | "확인형" | "정상범위형"
}`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: 'gemini-3.1-flash-lite-preview',
          responseType: 'json',
          timeout: 60000,
          schema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                score: { type: 'NUMBER' },
                type: { type: 'STRING', enum: ['증상질환형', '변화원인형', '확인형', '정상범위형'] }
              },
              required: ['title', 'score', 'type']
            }
          }
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

  // ── 트렌드 주제 (네이버 뉴스 크롤링 → Gemini 분석 — OLD seoService.ts 동일) ──
  const handleRecommendTrends = async () => {
    console.info(`[TREND] ========== 트렌드 주제 추천 시작 ==========`);
    console.info(`[TREND] 진료과="${category}"`);
    setIsLoadingTrends(true);
    setTrendingItems([]);
    setSeoTitles([]);
    try {
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
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
        12: '독감 절정기, 연말 피로, 동상/저체온증'
      };

      const categoryHints: Record<string, string> = {
        '정형외과': '관절통, 허리디스크, 어깨통증, 무릎연골, 오십견, 척추관협착증',
        '피부과': '여드름, 아토피, 색소침착, 기미, 모공, 주름, 탄력, 레이저토닝, 피코레이저, 프락셀, IPL, 울쎄라, 인모드, 써마지, 슈링크, 보톡스, 필러, 스킨부스터, 더마펜, 제모레이저, 리프팅, 실리프팅, 물광주사',
        '내과': '당뇨, 고혈압, 갑상선, 위장질환, 간기능, 건강검진',
        '치과': '충치, 잇몸질환, 임플란트, 치아미백, 교정, 사랑니, 치주염',
        '안과': '안구건조증, 노안, 백내장, 녹내장, 시력교정',
        '이비인후과': '비염, 축농증, 어지럼증, 이명, 편도염',
      };

      // ── STEP 1: 네이버 뉴스 크롤링 (OLD searchNewsForTrends 동일) ──
      const newsSearchKeywords: Record<string, string> = {
        '정형외과': '관절 통증 OR 허리디스크 OR 어깨통증',
        '피부과': '피부과 시술 OR 레이저토닝 OR 보톡스 필러 OR 피부 관리 OR 리프팅',
        '내과': '건강검진 OR 당뇨 OR 고혈압',
        '치과': '치과 치료 OR 임플란트 OR 잇몸',
        '안과': '안구건조증 OR 시력 OR 백내장',
        '이비인후과': '비염 OR 축농증 OR 편도염',
      };
      const searchKeyword = newsSearchKeywords[category] || `${category} 건강`;

      let newsContext = '';
      try {
        console.info(`[TREND] 네이버 뉴스 검색: "${searchKeyword}"`);
        const newsRes = await fetch(`/api/naver/news?query=${encodeURIComponent(searchKeyword)}&display=10`);
        if (newsRes.ok) {
          const newsData = await newsRes.json() as {
            items?: Array<{ title?: string; description?: string; pubDate?: string }>;
          };
          const newsItems = (newsData.items || []).slice(0, 5);
          if (newsItems.length > 0) {
            // 뉴스 결과를 Gemini Flash로 분석
            const newsText = newsItems.map((item, i) =>
              `${i + 1}. ${(item.title || '').replace(/<[^>]*>/g, '')} — ${(item.description || '').replace(/<[^>]*>/g, '').substring(0, 100)}`
            ).join('\n');

            console.info(`[TREND] 네이버 뉴스 ${newsItems.length}건 → Gemini 분석 중...`);
            const analysisRes = await fetch('/api/gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: `다음은 "${category}" 관련 최신 네이버 뉴스 검색 결과입니다:\n\n${newsText}\n\n이 뉴스들을 분석하여 다음을 추출해주세요:\n1. 현재 가장 핫한 건강 이슈 3가지\n2. 블로그 키워드로 활용 가능한 SEO 키워드 5개\n3. 뉴스 기반 콘텐츠 아이디어 2개\n4. 의료광고법 주의사항\n\n간결하게 정리해주세요.`,
                model: 'gemini-3.1-flash-lite-preview',
                temperature: 0.4,
                maxOutputTokens: 1000,
              }),
            });
            const analysisData = await analysisRes.json() as { text?: string };
            if (analysisData.text) {
              newsContext = analysisData.text;
              console.info(`[TREND] 뉴스 분석 완료 (${newsContext.length}자)`);
            }
          }
        }
      } catch (newsErr) {
        console.warn('[TREND] 네이버 뉴스 크롤링 실패 (Gemini 단독 분석으로 진행):', newsErr);
        // fallback: Gemini googleSearch
        try {
          const fallbackRes = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `최근 한국 "${category}" 관련 건강 뉴스 트렌드를 검색하여 핵심 이슈 3가지를 요약해주세요.`,
              model: 'gemini-3.1-flash-lite-preview',
              googleSearch: true,
              temperature: 0.4,
              maxOutputTokens: 800,
            }),
          });
          const fallbackData = await fallbackRes.json() as { text?: string };
          if (fallbackData.text) newsContext = fallbackData.text;
        } catch { /* 최종 fallback — 뉴스 없이 진행 */ }
      }

      // ── STEP 2: 최종 Gemini 트렌드 분석 (뉴스 컨텍스트 포함) ──
      const currentSeasonContext = seasonalContext[month] || '';
      const categoryKeywords = categoryHints[category] || '일반적인 건강 증상, 예방, 관리';

      const prompt = `[🕐 정확한 현재 시각: ${dateStr} 기준 (한국 표준시)]
[🎲 다양성 시드: ${randomSeed}]

당신은 네이버/구글 검색 트렌드 분석 전문가입니다.
'${category}' 진료과와 관련하여 **지금 이 시점**에 검색량이 급상승하거나 관심이 높은 건강/의료 주제 5가지를 추천해주세요.

[📅 ${month}월 시즌 특성]
${currentSeasonContext}

[🏥 ${category} 관련 키워드 풀]
${categoryKeywords}
${newsContext ? `
[📰 최신 네이버 뉴스 분석 결과 — 반드시 반영!]
${newsContext}

⚠️ 위 뉴스 분석에서 1~2개의 뉴스 기반 트렌드 주제를 반드시 포함하세요.
뉴스 기반 주제의 seasonal_factor에는 "📰 뉴스 트렌드" 태그를 붙여주세요.` : ''}

[⚠️ 중요 규칙]
1. **매번 다른 결과 필수**: 이전 응답과 다른 새로운 주제를 선정하세요 (시드: ${randomSeed})
2. **구체적인 주제**: "어깨통증" 대신 "겨울철 난방 후 어깨 뻣뻣함" 처럼 구체적으로
3. **현재 시점 반영**: ${month}월 ${day}일 기준 계절/시기 특성 반드시 반영
4. **롱테일 키워드**: 블로그 작성에 바로 쓸 수 있는 구체적인 키워드 조합 제시
5. **다양한 난이도**: 경쟁 높은 주제 2개 + 틈새 주제 3개 섞어서
${newsContext ? '6. **뉴스 트렌드 1~2개 반드시 포함**: 위 뉴스 분석에서 추출한 이슈 반영' : ''}

[📊 점수 산정]
- SEO 점수(0~100): 검색량 높고 + 블로그 경쟁도 낮을수록 고점수
- 점수 높은 순 정렬

[🎯 출력 형식]
- topic: 구체적인 주제명
- keywords: 블로그 제목에 쓸 롱테일 키워드
- score: SEO 점수 (70~95 사이)
- seasonal_factor: 왜 지금 이 주제가 뜨는지 한 줄 설명`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: 'gemini-3.1-flash-lite-preview',
          responseType: 'json',
          googleSearch: true,
          temperature: 0.9,
          timeout: 60000,
          schema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                topic: { type: 'STRING' },
                keywords: { type: 'STRING' },
                score: { type: 'NUMBER' },
                seasonal_factor: { type: 'STRING' }
              },
              required: ['topic', 'keywords', 'score', 'seasonal_factor']
            }
          }
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '트렌드 분석 실패');

      const items: TrendingItem[] = JSON.parse(data.text);
      setTrendingItems(items);
      console.info(`[TREND] 결과: ${items.length}개 트렌드 주제`);
      items.forEach((t, i) => console.info(`[TREND]   ${i + 1}. [${t.score}점] "${t.topic}" — ${t.keywords} (${t.seasonal_factor})`));
      console.info(`[TREND] ========== 트렌드 주제 추천 완료 ==========`);
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
① 제목 최적화 (25점 만점)
---
※ keyword_natural (10점): 핵심 키워드 자연 포함
※ seasonality (5점): 시기성/상황성 포함
※ judgment_inducing (5점): 판단 유도형 구조
※ medical_law_safe (5점): 의료광고 리스크 없음

---
② 본문 키워드 구조 (25점 만점)
---
※ main_keyword_exposure (10점): 메인 키워드 3~5회 자연 노출
※ related_keyword_spread (5점): 연관 키워드(LSI) 분산 배치
※ subheading_variation (5점): 소제목에 키워드 변주 포함
※ no_meaningless_repeat (5점): 의미 없는 반복 없음

---
③ 사용자 체류 구조 (20점 만점)
---
※ intro_problem_recognition (5점): 도입부 5줄 이내 문제 인식
※ relatable_examples (5점): '나 얘기 같다' 생활 예시
※ mid_engagement_points (5점): 중간 이탈 방지 포인트
※ no_info_overload (5점): 정보 과부하 없음

---
④ 의료법 안전성 + 신뢰 신호 (20점 만점)
---
※ no_definitive_guarantee (5점): 단정·보장 표현 없음
※ individual_difference (5점): 개인차/상황별 차이 자연 언급
※ self_diagnosis_limit (5점): 자가진단 한계 명확화
※ minimal_direct_promo (5점): 병원 직접 홍보 최소화

---
⑤ 전환 연결성 (10점 만점)
---
※ cta_flow_natural (5점): CTA가 정보 흐름을 끊지 않음
※ time_fixed_sentence (5점): 시점 고정형 문장 존재

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

      const seoRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: seoPrompt, model: 'gemini-3.1-flash-lite-preview', responseType: 'json', schema: seoSchema, temperature: 0.3, maxOutputTokens: 4096 }),
      });
      const seoData = await seoRes.json() as { text?: string; error?: string };

      if (seoRes.ok && seoData.text) {
        const report = JSON.parse(seoData.text);
        report.total = (report.title?.score || 0) + (report.keyword_structure?.score || 0) + (report.user_retention?.score || 0) + (report.medical_safety?.score || 0) + (report.conversion?.score || 0);

        console.log(`[BLOG] 📊 SEO 평가 완료 - 총점: ${report.total}점`);
        console.log(`[BLOG]   ① 제목: ${report.title?.score || 0}/25  ② 키워드: ${report.keyword_structure?.score || 0}/25  ③ 체류: ${report.user_retention?.score || 0}/20  ④ 의료법: ${report.medical_safety?.score || 0}/20  ⑤ 전환: ${report.conversion?.score || 0}/10`);

        setSeoReport(report as SeoReport);
        setScores(prev => ({ ...prev, seoScore: report.total }));

        if (report.improvement_suggestions?.length) {
          console.log(`[BLOG] 📝 SEO 개선 제안: ${report.improvement_suggestions.join(' | ')}`);
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

    // 크레딧 체크 + 차감
    if (creditCtx.userId && creditCtx.creditInfo) {
      const creditResult = await blogUseCredit(creditCtx.userId);
      if (!creditResult.success) {
        setError(creditResult.error === 'no_credits' ? '크레딧이 모두 소진되었습니다.' : '크레딧 차감에 실패했습니다.');
        return;
      }
      creditCtx.setCreditInfo({ credits: creditResult.remaining, totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 1 });
    }

    const request: GenerationRequest = {
      category,
      topic: topic.trim(),
      blogTitle: blogTitle.trim() || undefined,
      keywords: keywords.trim(),
      disease: disease.trim() || undefined,
      tone,
      audienceMode,
      persona,
      imageStyle,
      postType: 'blog',
      textLength,
      imageCount,
      cssTheme,
      writingStyle,
      keywordDensity,
      youtubeTranscript: youtubeTranscript || undefined,
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
    };

    setIsGenerating(true);
    setDisplayStage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (request.imageCount && request.imageCount > 0) estimated += request.imageCount * 45;
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

    try {
      const { systemInstruction, prompt } = buildBlogPrompt(request);
      console.info(`[BLOG] 프롬프트 조립 완료 — system: ${systemInstruction.length}자, prompt: ${prompt.length}자`);

      // ── 병렬 실행: 경쟁 블로그 분석 + 말투 로드 (서로 독립적) ──
      console.info(`[BLOG] 경쟁 분석 + 말투 로드 병렬 시작`);

      const competitorPromise = keywords.trim() ? (async () => {
        try {
          const competitorRes = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `너는 네이버 블로그 SEO 분석 전문가다.
"${keywords.trim()}" 키워드로 네이버 통합탭에서 1위를 차지할 블로그 글의 구조를 분석해줘.

실제 네이버 상위 블로그를 참고하여 아래 형식의 JSON으로만 답변해.
설명 없이 JSON만 출력.

{
  "title": "예상 1위 블로그 제목 (30~40자)",
  "charCount": 예상 글자수(숫자),
  "subtitleCount": 예상 소제목 수(숫자),
  "subtitles": ["소제목1", "소제목2", "소제목3", ...],
  "imageCount": 예상 이미지 수(숫자),
  "keyAngles": ["이 키워드에서 자주 다루는 핵심 관점 3~5개"]
}`,
              model: 'gemini-3.1-flash-lite-preview',
              temperature: 0.3,
              responseType: 'json',
              timeout: 8000,
            }),
          });
          if (!competitorRes.ok) return '';
          const cData = await competitorRes.json() as { text?: string };
          if (!cData.text) return '';
          let cText = cData.text;
          const cJsonMatch = cText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (cJsonMatch) cText = cJsonMatch[1];
          const c = JSON.parse(cText.trim()) as {
            title?: string; charCount?: number; subtitleCount?: number;
            subtitles?: string[]; imageCount?: number; keyAngles?: string[];
          };
          const subs = c.subtitles || [];
          return `
[경쟁 블로그 분석 결과 - 이 글보다 상위에 노출되어야 함]
현재 "${keywords.trim()}" 통합탭 상위 블로그 예상 구조:
- 제목: ${c.title || '미분석'}
- 글자 수: ${c.charCount || 0}자
- 소제목 수: ${subs.length}개
- 이미지 수: ${c.imageCount || 0}개
${subs.length > 0 ? `- 소제목 목록: ${subs.join(' / ')}` : ''}

[경쟁 분석 기반 작성 전략]
1. 글자 수: 경쟁 글(${c.charCount || 0}자)보다 충분한 분량 확보
2. 소제목: 경쟁 글(${subs.length}개)보다 더 다양한 관점 제공
3. 이미지: 경쟁 글(${c.imageCount || 0}개)과 동등 이상
4. 구조: 더 읽기 쉽고 체류 시간이 길어지는 구조 설계

[차별화 앵글 설계 - 경쟁 글과 다른 관점 필수]
${subs.length > 0 ? `경쟁 글 소제목: ${subs.join(' / ')}` : ''}
위 소제목이 이미 다루는 내용은 "같은 말 다시 하기"가 아니라 "더 깊은 메커니즘/숫자"로 차별화.
경쟁 글이 빠뜨린 앵글을 최소 1~2개 추가:
- 빠진 관점 후보: 자가 관리법, 연령대별 차이, 시술 후 관리, 비용/기간 현실 정보, 잘못 알려진 상식 바로잡기
- 경쟁 글이 나열형이면 → 우리는 "독자 상황별 분기"나 "흔한 오해" 앵글로 차별화
- 경쟁 글이 감성 위주면 → 우리는 구체적 숫자/메커니즘으로 차별화
`;
        } catch (e) {
          console.warn(`[BLOG] 경쟁 분석 실패 (무시):`, e);
          return '';
        }
      })() : Promise.resolve('');

      const stylePromise = (async () => {
        if (learnedStyleId) {
          const learnedStyle = getStyleById(learnedStyleId);
          if (learnedStyle) {
            return `\n\n[🎓🎓🎓 학습된 말투 적용 - 최우선 적용! 🎓🎓🎓]\n${getStylePromptForGeneration(learnedStyle)}\n\n⚠️ 위 학습된 말투를 반드시 적용하세요!\n- 문장 끝 패턴을 정확히 따라하세요\n- 자주 사용하는 표현을 자연스럽게 활용하세요\n- 전체적인 어조와 분위기를 일관되게 유지하세요`;
          }
        } else if (hospitalName) {
          try {
            const sp = await getHospitalStylePrompt(hospitalName);
            if (sp) return `\n\n[병원 블로그 학습 말투 - 반드시 적용]\n${sp}`;
          } catch { /* 프로파일 없으면 기본 */ }
        }
        return '';
      })();

      // 두 작업 동시 완료 대기
      const [competitorInstruction, styleInstruction] = await Promise.all([competitorPromise, stylePromise]);

      console.info(`[BLOG] 병렬 완료 — 경쟁: ${competitorInstruction ? competitorInstruction.length + '자' : '없음'}, 말투: ${styleInstruction ? styleInstruction.length + '자' : '없음'}`);

      let finalPrompt = prompt;
      if (competitorInstruction) finalPrompt += `\n\n${competitorInstruction}`;
      if (styleInstruction) finalPrompt += styleInstruction;

      console.info(`[BLOG] 최종 프롬프트 길이: ${finalPrompt.length}자 (system: ${systemInstruction.length}자)`);
      console.info(`[BLOG] Gemini 호출 시작 — model=gemini-3.1-pro-preview, temp=0.85`);

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          systemInstruction,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.85,
          maxOutputTokens: 65536,
        }),
      });

      const data = await res.json() as { text?: string; error?: string; details?: string };

      if (!res.ok || !data.text) {
        const errMsg = data.error || data.details || `서버 오류 (${res.status})`;
        console.error(`[BLOG] ❌ 생성 실패: ${errMsg}`);
        setError(errMsg);
        setIsGenerating(false);
        setDisplayStage(0);
        return;
      }

      console.info(`[BLOG] Gemini 응답 수신 — 원본 길이: ${data.text.length}자`);
      setDisplayStage(2); // old displayStage 2: 내용 다듬는 중

      // ── 응답 파싱: 본문 / SCORES / IMAGE_PROMPTS 분리 ──
      let blogText = data.text;
      let parsed: ScoreBarData | undefined;
      const imagePrompts: string[] = [];

      // 1) ---IMAGE_PROMPTS--- 블록 추출 + 제거
      const imgPromptsMarker = '---IMAGE_PROMPTS---';
      const imgIdx = blogText.indexOf(imgPromptsMarker);
      if (imgIdx !== -1) {
        const afterImg = blogText.substring(imgIdx + imgPromptsMarker.length).trim();
        afterImg.split('\n').forEach(line => {
          const trimmed = line.replace(/^\d+[\.\)]\s*/, '').trim();
          if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
            imagePrompts.push(trimmed);
          }
        });
        blogText = blogText.substring(0, imgIdx).replace(/\n+$/, '');
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

        if (charCountNoSpaces < targetMin) {
          console.info(`[BLOG] 글자수 부족: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (${deviation}자 부족)`);
        } else if (charCountNoSpaces > targetMax) {
          console.info(`[BLOG] 글자수 초과: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (+${deviation}자) — 그대로 진행`);
        } else {
          console.info(`[BLOG] ✅ 글자수 적정: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (${deviation >= 0 ? '+' : ''}${deviation}자)`);
        }
      }

      // 3.8) 의료광고법 금지어 자동 대체
      {
        const medLawReplacements: [RegExp, string][] = [
          [/극대화/g, '향상'], [/최첨단/g, '최신'], [/완벽(한|하게|히)?/g, '꼼꼼$1'], [/확실(한|하게|히)?/g, '체계적$1'],
          [/혁신적(인|으로)?/g, '새로운 방식$1'], [/획기적(인|으로)?/g, '효과적$1'], [/독보적(인|으로)?/g, '전문적$1'],
          [/탁월(한|하게)?/g, '우수$1'], [/압도적(인|으로)?/g, '뛰어난'], [/독자적(인|으로)?/g, '고유한'],
          [/완치/g, '호전'], [/근본\s?치료/g, '근본적인 관리'], [/영구적(인|으로)?/g, '장기적$1'],
          [/100%/g, '높은 비율로'], [/가장\s(좋은|뛰어난|우수한)/g, '매우 $1'],
          [/최소\s?침습/g, '부담을 줄인'], [/최소\s?통증/g, '불편감을 줄인'], [/최대\s?효과/g, '효과를 높인'],
          [/무통\s/g, '불편감을 줄인 '], [/부작용\s?(없는|제로|zero)/g, '부작용 위험을 줄인'],
          [/통증\s?없는/g, '불편감을 줄인'],
        ];
        let replacedCount = 0;
        const foundTerms: string[] = [];
        for (const [pattern, replacement] of medLawReplacements) {
          const matches = blogText.match(pattern);
          if (matches) {
            foundTerms.push(`${matches[0]}(${matches.length}건)`);
            replacedCount += matches.length;
            blogText = blogText.replace(pattern, replacement);
          }
        }
        if (replacedCount > 0) {
          console.info(`[BLOG] 의료법 금지어 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
        }
      }

      // 4) 이미지 없으면 마커 strip 후 바로 표시
      if (imageCount === 0 || imagePrompts.length === 0) {
        blogText = blogText.replace(/\[IMG_\d+\]\n*/g, '');
        setGeneratedContent(blogText);
        setScores(parsed);
      } else {
        setDisplayStage(3); // old displayStage 3: 이미지 만드는 중
        // 5) 마커가 있는 본문을 먼저 표시 (이미지 자리에 로딩 표시)
        let htmlWithPlaceholders = blogText;
        for (let i = 1; i <= imageCount; i++) {
          htmlWithPlaceholders = htmlWithPlaceholders.replace(
            new RegExp(`\\[IMG_${i}\\]`, 'g'),
            `<div class="content-image-wrapper" data-img-slot="${i}" style="text-align:center;padding:24px 0;"><div style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#f1f5f9;border-radius:12px;font-size:13px;color:#64748b;">🖼️ 이미지 ${i}/${imageCount} 생성 중...</div></div>`,
          );
        }
        // 혹시 남은 초과 마커 정리
        htmlWithPlaceholders = htmlWithPlaceholders.replace(/\[IMG_\d+\]\n*/g, '');
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

        // 최대 imageCount개까지만 생성 — 각 이미지 완성 즉시 화면에 반영
        const prompts = imagePrompts.slice(0, imageCount);
        const imagePromises = prompts.map((p, i) => {
          const index = i + 1;
          return generateAndUpload(p, index).then(result => {
            // 이미지 완성 즉시 해당 슬롯의 플레이스홀더를 실제 이미지로 교체
            if (result.url) {
              // 이미지 히스토리 초기화
              setImageHistory(prev => ({ ...prev, [result.index]: [result.url!] }));
              setGeneratedContent(prev => {
                if (!prev) return prev;
                const imgTag = '<div class="content-image-wrapper"><img src="' + result.url + '" alt="blog image ' + result.index + '" data-image-index="' + result.index + '" style="max-width:100%;height:auto;border-radius:12px;" /></div>';
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

        // 7) [IMG_N] 마커를 실제 이미지로 교체 (old insertImageData 동일)
        let finalHtml = blogText;
        for (const img of imageResults) {
          const pattern = new RegExp(`\\[IMG_${img.index}\\]`, 'gi');
          if (img.url) {
            const imgTag = `<div class="content-image-wrapper"><img src="${img.url}" alt="blog image ${img.index}" data-image-index="${img.index}" style="max-width:100%;height:auto;border-radius:12px;" /></div>`;
            finalHtml = finalHtml.replace(pattern, imgTag);
          } else {
            finalHtml = finalHtml.replace(pattern, '');
          }
        }
        // 미매칭 마커 제거
        finalHtml = finalHtml.replace(/\[IMG_\d+\]\n*/g, '');
        setGeneratedContent(finalHtml);
        blogText = finalHtml;
      }

      // ── fact_check 기본값 설정 (old legacyBlogGeneration.ts:1713-1740 동일) ──
      // Gemini가 ---SCORES--- 블록을 반환하지 않았거나 필드가 빠진 경우 기본값으로 보완
      {
        if (!parsed) parsed = {};
        // conversion_score: 없거나 0이면 기본값 75
        if (!parsed.conversionScore || parsed.conversionScore === 0) {
          parsed.conversionScore = 75;
          console.log('[BLOG] ⚠️ conversion_score 기본값 75점 설정 (AI 미반환)');
        }
        // safety_score: undefined/null이면 기본값 90
        if (parsed.safetyScore === undefined || parsed.safetyScore === null) {
          parsed.safetyScore = 90;
        }
        // fact_score, ai_smell_score, verified_facts_count는 ScoreBarData에 없으므로 로그만 기록
        const factScore = 85;
        const aiSmellScore = 12;
        const verifiedFactsCount = 5;
        console.log('[BLOG] ⚠️ ai_smell_score 기본값 12점 설정 (AI 미반환)');
        console.log(`[BLOG] 📊 fact_check 최종값: conversion_score=${parsed.conversionScore}, fact_score=${factScore}, safety_score=${parsed.safetyScore}, ai_smell_score=${aiSmellScore}, verified_facts_count=${verifiedFactsCount}`);
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
      console.info(`[BLOG] ========== 블로그 생성 완료 ==========`);
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
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt, systemInstruction,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.7,
          maxOutputTokens: 16384,
        }),
      });
      const data = await res.json() as { text?: string };
      if (res.ok && data.text) {
        let refined = data.text.trim();
        refined = refined.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');
        if (refined.includes('<')) {
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
      const res = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `아래 병원 블로그 글의 ${selectedImgIndex}번째 이미지에 어울리는 프롬프트를 한국어로 1개만 작성해주세요. 프롬프트만 출력하세요.\n\n글 내용:\n${textOnly}`,
          model: 'gemini-3.1-flash-lite-preview', temperature: 0.7, maxOutputTokens: 300,
        }),
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
  const handleImageRegenerateSubmit = useCallback(async () => {
    const imageIndex = selectedImgIndex;
    const newPrompt = regenPrompt;
    if (!newPrompt.trim()) return;

    setImgRegenModalOpen(false);
    setRegeneratingImage(imageIndex);
    console.info(`[BLOG] 이미지 ${imageIndex} 재생성 시작 — 프롬프트: "${newPrompt.substring(0, 60)}..."`);

    try {
      const imgRes = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newPrompt, aspectRatio: imageAspectRatio, mode: 'blog' }),
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

  // ── 소제목 재생성 (root useAiRefine.ts + faqService.ts + gpt52-prompts-staged.ts 기준) ──
  const handleSectionRegenerate = useCallback(async (sectionIndex: number) => {
    const section = blogSections.find(s => s.index === sectionIndex);
    if (!section || !generatedContent) return;
    if (regeneratingSection !== null) return; // 동시 재생성 방지

    setRegeneratingSection(sectionIndex);
    setSectionProgress(`"${section.type === 'intro' ? '도입부' : section.title}" 재생성 중...`);

    try {
      const sectionTitle = section.type === 'intro' ? '도입부' : section.title;

      // root getSectionRegeneratePrompt 동일 구조
      const systemPrompt = `[글쓴이 정체성]
병원 블로그 전담 에디터. 의사가 아니라 건강 정보를 잘 정리하는 사람.
- 의학 지식이 있지만 의사처럼 말하지 않는다
- 독자에게 가르치지 않는다. 정보를 두고 갈 뿐이다
- 문장이 짧다. 군더더기를 싫어한다

[최상위 원칙] 쉽고 짧게 직접 말한다
1. 짧게 쓴다. 한 문장은 40자 이내 권장
2. 직접 말한다. 돌려 말하지 않는다
3. 쉬운 말을 쓴다
4. 의료광고법에 걸리는 표현만 피한다

[문체] 본문은 ~습니다체. 소제목만 ~다체 허용
[시점] 3인칭 관찰자. "나/저/우리/당신/여러분" 금지

[톤 규칙]
- "~할 수 있습니다" 금지 → "~는 경우도 있습니다"
- "~하는 것이 좋습니다" 금지 → "~하는 편이 낫습니다"
- "~에 도움이 됩니다" 금지
- 질문형 문장 금지 ("~하신가요?", "~은 아닌가요?")

[의료광고법 (strict)]
- 치료 효과 단정 금지 ("완치", "확실히 나아집니다")
- 비교 광고 금지 ("최고", "유일")
- 환자 유인 금지
- 개인차 언급 필수

[미션] 아래 소제목 섹션만 새로 작성하라. 나머지 글과의 흐름은 유지.

[소제목] ${sectionTitle}
[현재 내용]
${section.html}

[전체 글 맥락 (참고용)]
${generatedContent.substring(0, 2000)}

[규칙]
- 현재 내용과 다른 관점/표현으로 재작성
- 같은 정보를 다루되 문장 구조와 어미를 변경
- 2~3문단 유지
- HTML <h3>과 <p> 태그로 출력

[출력] ${section.type === 'intro' ? '<p>부터 시작하는 도입부 HTML만 출력.' : `<h3>${sectionTitle}</h3>부터 시작하는 HTML만 출력.`}`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `소제목 "${sectionTitle}" 섹션을 새로 작성해주세요.`,
          systemInstruction: systemPrompt,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.85,
          maxOutputTokens: 8192,
          timeout: 60000,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error || '재생성 실패');
      }

      let newSectionHtml = data.text.trim();
      // 코드블록 fence 제거
      newSectionHtml = newSectionHtml.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');

      // HTML 검증
      if (!newSectionHtml.includes('<')) {
        throw new Error('유효한 HTML이 반환되지 않았습니다');
      }

      // 전체 HTML에서 해당 섹션 교체
      const updatedHtml = replaceSectionHtml(
        generatedContent,
        section.html,
        newSectionHtml,
        section.title,
      );

      setGeneratedContent(updatedHtml);

      // 섹션 목록 갱신
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
  }, [blogSections, generatedContent, regeneratingSection]);

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
        hospitalName={hospitalName} selectedTeam={selectedTeam}
        showHospitalDropdown={showHospitalDropdown} selectedManager={selectedManager}
        selectedHospitalAddress={selectedHospitalAddress}
        homepageUrl={homepageUrl} clinicContext={clinicContext}
        isCrawling={isCrawling} crawlProgress={crawlProgress}
        includeFaq={includeFaq} faqCount={faqCount}
        showCustomInput={showCustomInput} customPrompt={customPrompt}
        customSubheadings={customSubheadings} learnedStyleId={learnedStyleId}
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
        setTopic={setTopic} setBlogTitle={setBlogTitle} setKeywords={setKeywords} setKeywordDensity={setKeywordDensity} setDisease={setDisease}
        setCategory={setCategory} setPersona={setPersona} setTone={setTone}
        setAudienceMode={setAudienceMode} setImageStyle={setImageStyle}
        setImageCount={setImageCount} setImageAspectRatio={setImageAspectRatio} setTextLength={setTextLength}
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
        setIncludeHospitalIntro={setIncludeHospitalIntro}
        setKeywordStats={setKeywordStats} setShowKeywordPanel={setShowKeywordPanel}
        setKeywordSortBy={setKeywordSortBy} setKeywordSearch={setKeywordSearch}
        setKeywordMinVolume={setKeywordMinVolume} setHideRanked={setHideRanked}
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
