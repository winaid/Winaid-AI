/**
 * 병원 말투 학습 서비스 — Supabase CRUD + 크롤러 + Gemini 분석 + 채점
 *
 * old app writingStyleService.ts에서 이식.
 */
import { supabase } from './supabase';
import type { CrawledPostScore, DBCrawledPost } from './types';
import type { BrandPreset } from './brandPreset';

// ── 타입 ──

export interface AnalyzedStyle {
  tone: string;
  sentenceEndings: string[];
  vocabulary: string[];
  structure: string;
  emotionLevel: 'low' | 'medium' | 'high';
  formalityLevel: 'casual' | 'neutral' | 'formal';
  speakerIdentity?: string;
  readerDistance?: string;
  sentenceRhythm?: string;
  paragraphFlow?: string;
  persuasionStyle?: string;
  medicalTermLevel?: string;
  procedureExplainStyle?: string;
  trustBuildingPattern?: string;
  ctaStyle?: string;
  anxietyHandling?: string;
  uniqueExpressions?: string[];
  bannedGenericStyle?: string[];
  oneLineSummary?: string;
  goodExamples?: string[];
  badExamples?: string[];
  // ── Phase 2D Tier 2-A: 줄바꿈·단락 리듬 학습 ──
  paragraphStats?: {
    avgSentencesPerParagraph: number;
    avgCharsPerParagraph: number;
    lineBreakStyle: 'dense' | 'airy' | 'mixed';
    doubleBreakFrequency: 'low' | 'medium' | 'high';
    paragraphLengthPattern: string;
  };
  representativeParagraphs?: string[];
}

export interface LearnedWritingStyle {
  id: string;
  name: string;
  description: string;
  sampleText: string;
  analyzedStyle: AnalyzedStyle;
  stylePrompt: string;
  createdAt: string;
}

export interface HospitalStyleProfile {
  id?: string;
  hospital_name: string;
  naver_blog_url?: string;
  crawled_posts_count?: number;
  style_profile?: LearnedWritingStyle | null;
  raw_sample_text?: string;
  last_crawled_at?: string;
  updated_at?: string;
}

// ── Supabase CRUD ──

export async function getAllStyleProfiles(): Promise<HospitalStyleProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('id, hospital_name, naver_blog_url, crawled_posts_count, last_crawled_at, style_profile')
    .order('hospital_name', { ascending: true });
  if (error || !data) return [];
  return data as HospitalStyleProfile[];
}

// ── 브랜드 프리셋 (brand_preset JSONB 컬럼) ──
// hospital_style_profiles 에는 두 개의 JSONB 필드가 공존한다:
//   - style_profile  : 말투 학습 결과 (AnalyzedStyle)
//   - brand_preset   : 시각 브랜드 프리셋 (BrandPreset, 2026-04-11 마이그레이션)
// 두 필드는 의도적으로 분리 — 사용처·갱신 빈도·담당 UI 가 서로 다름.

/**
 * 병원 브랜드 프리셋 조회.
 * @returns 저장된 프리셋 또는 null (미설정·Supabase 미구성·DB 에러 시 모두 null)
 */
export async function getBrandPreset(hospitalName: string): Promise<BrandPreset | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('hospital_style_profiles')
      .select('brand_preset')
      .eq('hospital_name', hospitalName)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { brand_preset?: unknown }).brand_preset;
    // 마이그레이션 기본값 `'{}'` 가 들어와 있을 수 있음 → 빈 객체는 null 로 취급.
    if (!raw || typeof raw !== 'object') return null;
    const preset = raw as Partial<BrandPreset>;
    if (!preset.colors || !preset.typography) return null;
    return preset as BrandPreset;
  } catch {
    return null;
  }
}

/**
 * 병원 브랜드 프리셋 저장 (upsert).
 * hospital_style_profiles 의 row 가 없으면 생성, 있으면 brand_preset 컬럼만 갱신.
 * 다른 필드(style_profile, naver_blog_url 등)는 건드리지 않는다.
 *
 * @returns 성공 여부
 */
export async function saveBrandPreset(hospitalName: string, preset: BrandPreset): Promise<boolean> {
  if (!supabase) return false;
  if (!hospitalName) return false;
  try {
    const presetWithTimestamp: BrandPreset = {
      ...preset,
      updatedAt: new Date().toISOString(),
    };
    // Supabase 의 네이티브 upsert + onConflict 로 atomic 하게 처리.
    // 공급한 필드만 갱신되므로 기존 style_profile 등은 보존됨.
    // (.from().upsert 의 타입 제네릭이 DB 스키마와 연결돼 있지 않아 as any 사용 —
    //  기존 styleService 의 다른 upsert 호출과 동일한 패턴)
    const { error } = await (supabase.from('hospital_style_profiles') as any).upsert(
      {
        hospital_name: hospitalName,
        brand_preset: presetWithTimestamp,
      },
      { onConflict: 'hospital_name' },
    );
    return !error;
  } catch {
    return false;
  }
}

// ── 의료광고법 금지 표현 필터 (말투 분석 결과에서 위험 표현 제거) ──

import { FORBIDDEN_EXPRESSIONS } from './medicalLawRules';

const STYLE_PROHIBITED = [
  ...FORBIDDEN_EXPRESSIONS.inducement.map(w => w.replace(/^~/, '')),
  ...FORBIDDEN_EXPRESSIONS.superlative.slice(0, 12),
  ...FORBIDDEN_EXPRESSIONS.guarantee.slice(0, 8),
];

function filterProhibited(words: string[]): string[] {
  return words.filter(w => !STYLE_PROHIBITED.some(p => w.toLowerCase().includes(p.toLowerCase())));
}

// ── 공통 말투 프롬프트 빌더 (DB 프로파일 + localStorage 스타일 양쪽에서 사용) ──

export function buildStylePrompt(
  as_: AnalyzedStyle,
  name: string,
  description: string,
  rawSampleText?: string,
): string {
  const safeVocabulary = filterProhibited(as_.vocabulary || []);
  const safeSentenceEndings = filterProhibited(as_.sentenceEndings || []);
  const safeUniqueExpressions = filterProhibited(as_.uniqueExpressions || []);

  const deepBlock = as_.speakerIdentity ? `
[화자 캐릭터]
- 정체성: ${as_.speakerIdentity || '미분석'}
- 독자와의 거리감: ${as_.readerDistance || '미분석'}
- 설득 방식: ${as_.persuasionStyle || '미분석'}

[문장·문단 DNA]
- 리듬: ${as_.sentenceRhythm || '미분석'}
- 전개 구조: ${as_.paragraphFlow || '미분석'}
- 고유 표현: ${safeUniqueExpressions.length > 0 ? safeUniqueExpressions.join(', ') : '미분석'}

[의료 콘텐츠 전략]
- 의료 용어 수준: ${as_.medicalTermLevel || '미분석'}
- 시술·치료 설명 방식: ${as_.procedureExplainStyle || '미분석'}
- 신뢰 구축 패턴: ${as_.trustBuildingPattern || '미분석'}
- 행동 유도(CTA) 방식: ${as_.ctaStyle || '미분석'}
- 환자 불안 대응: ${as_.anxietyHandling || '미분석'}

[한 줄 정의] ${as_.oneLineSummary || description}

[이 병원다운 문장 — 참고]
${(as_.goodExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}

[이 병원답지 않은 문장 — 절대 금지]
${(as_.badExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}
` : '';

  const bannedBlock = (as_.bannedGenericStyle || []).length > 0
    ? `\n[이 병원 글에서 금지할 범용 표현]\n${as_.bannedGenericStyle!.map(b => `- ${b}`).join('\n')}\n`
    : '';

  // Tier 2-B: 단락 단위 원문 샘플을 우선 사용 (줄바꿈 재현 가능).
  // Tier 2-A 이전 프로파일은 문장 15개 추출 방식으로 fallback.
  let referenceBlock = '';
  const repParagraphs = Array.isArray(as_.representativeParagraphs)
    ? as_.representativeParagraphs.filter(p => typeof p === 'string' && p.trim().length >= 50)
    : [];

  if (repParagraphs.length > 0) {
    // Tier 2-A 이후: 원문 단락 그대로 (줄바꿈 보존). Sonnet 이 물리적 리듬을 본뜰 수 있도록.
    referenceBlock = `

[원문 단락 샘플 — 이 병원이 실제로 쓴 단락]
아래 단락들의 **단락 길이, 문장 수, 줄바꿈 위치, 빈 줄 빈도** 를 본문 <p> 구성에 그대로 재현하라.
단어까지 베끼지 말고 리듬만 복제. 의료광고법 위반 표현이 섞여 있어도 따라 쓰지 마라.
원문의 빈 줄(\n\n) 이 단락을 분리하는 자리에는 빈 <p></p> 한 개를 삽입해 시각적 간격을 재현한다. 단일 \n(줄바꿈 1개) 은 공백으로 처리.

${repParagraphs.slice(0, 3).map((p, i) => `[예시 ${i + 1}]\n${p}`).join('\n\n===\n\n')}`;
  } else if (rawSampleText && rawSampleText.length > 100) {
    // Fallback: 기존 문장 15개 추출 방식 (Tier 2-A 이전 프로파일 대응)
    const sentences = rawSampleText
      .split(/[.!?]\s+|\.(?=\s)|(?<=다)\s+/)
      .map(s => s.trim().replace(/^[-–—·•\s]+/, ''))
      .filter(s => s.length >= 20 && s.length <= 80 && !s.includes('http') && !s.includes('©'));
    const uniqueSentences = [...new Set(sentences)].slice(0, 15);
    if (uniqueSentences.length > 0) {
      referenceBlock = `

[원문 레퍼런스 — 이 병원이 실제로 쓴 문장들]
아래 문장의 톤, 리듬, 표현 방식을 참고해서 같은 느낌으로 새 문장을 만들어라.
그대로 복사하지 말고 스타일만 재현.

${uniqueSentences.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`;
    }
  }

  // Tier 2-B: 단락·줄바꿈 리듬 지시 (paragraphStats 없으면 빈 문자열)
  const rhythmBlock = as_.paragraphStats ? `

[단락·줄바꿈 리듬 — 반드시 재현]
- 단락당 평균 문장 수: ${as_.paragraphStats.avgSentencesPerParagraph}
- 단락당 평균 글자 수: ${as_.paragraphStats.avgCharsPerParagraph}
- 줄바꿈 스타일: ${
      as_.paragraphStats.lineBreakStyle === 'dense' ? 'dense (문장 사이 줄바꿈 자주, 숨가쁜 리듬)' :
      as_.paragraphStats.lineBreakStyle === 'airy' ? 'airy (빈 줄 자주, 여유 있는 리듬)' :
      'mixed (dense 와 airy 섞임)'
    }
- 빈 줄 빈도: ${
      as_.paragraphStats.doubleBreakFrequency === 'high' ? 'high (약 3문장마다 빈 줄)' :
      as_.paragraphStats.doubleBreakFrequency === 'medium' ? 'medium (약 3~10문장마다 빈 줄)' :
      'low (빈 줄 거의 없음, 긴 단락 위주)'
    }
- 단락 길이 패턴: ${as_.paragraphStats.paragraphLengthPattern || '일정한 길이'}

본문 생성 시 HTML <p> 태그 구성에 위 리듬을 그대로 반영한다:
- 단락 당 평균 문장 수를 맞추고, lineBreakStyle 에 따라 문장을 어떻게 끊을지 결정한다.
- airy 일수록 <p> 를 더 짧게 나누고, dense 일수록 한 <p> 안에 문장을 여러 개 묶는다.
- 인사 단락도 학습본 원문 리듬을 따른다. 고정 형식(예: "안녕하세요. {병원명} {직책}입니다.") 을 강제하지 않는다.
` : '';

  return `[병원 고유 문체: ${name}]
어미 몇 개를 흉내 내는 것이 아니라, 화자의 태도·상담 방식·설명 습관·설득 구조를 재현하라.

[기본 톤]
- 어조: ${as_.tone}
- 격식: ${as_.formalityLevel === 'formal' ? '격식체' : as_.formalityLevel === 'casual' ? '편한 말투' : '중립적'}
- 감정 표현: ${as_.emotionLevel === 'high' ? '풍부하게' : as_.emotionLevel === 'medium' ? '적당히' : '절제하여'}
- 문장 끝 패턴: ${safeSentenceEndings.join(', ')}
- 자주 쓰는 표현: ${safeVocabulary.join(', ')}
- 글 구조: ${as_.structure}
${deepBlock}${bannedBlock}${rhythmBlock}
[자가점검]
1. 이 문단의 화자가 실제 상담실/진료실에서 말하는 것처럼 읽히는가?
2. 병원명을 가려도 이 병원 톤으로 느껴지는가?
3. 같은 어미가 3회 이상 연속 반복되지 않았는가?
4. 단락 길이·문장 수·줄바꿈 위치가 [단락·줄바꿈 리듬] 및 [원문 단락 샘플] 과 비슷한 리듬인가?${referenceBlock}`;
}

// ── 콘텐츠 생성 시 말투 프롬프트 조회 (DB에서) ──

// ── style profile 캐시 ──
// 전략: 60초 TTL + hospital_style_profiles.updated_at 기반 무효화.
// 테스트 환경(NODE_ENV='test')에서는 TTL 을 0으로 강제하여 매번 DB 조회.
// 관리자가 재학습/채점하면 invalidateStyleCache() 로 즉시 무효화 가능.
interface StyleCacheEntry {
  profile: HospitalStyleProfile | null;
  fetchedAt: number;        // Date.now() 값
  updatedAt: string | null; // DB 의 updated_at (ISO)
}

const STYLE_CACHE_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 60_000;
const styleProfileCache = new Map<string, StyleCacheEntry>();

/**
 * 병원 말투 프로파일 캐시를 무효화한다.
 * - hospitalName 지정: 해당 병원만 제거
 * - 미지정: 전체 flush
 * crawlAndLearnHospitalStyle / scoreCrawledPost / 관리자 교정 후 호출.
 */
export function invalidateStyleCache(hospitalName?: string): void {
  if (!hospitalName) {
    styleProfileCache.clear();
    return;
  }
  styleProfileCache.delete(hospitalName);
}

async function fetchStyleProfile(hospitalName: string): Promise<StyleCacheEntry> {
  if (!supabase) {
    return { profile: null, fetchedAt: Date.now(), updatedAt: null };
  }
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('style_profile, raw_sample_text, updated_at')
    .eq('hospital_name', hospitalName)
    .limit(1);
  if (error || !data || data.length === 0) {
    return { profile: null, fetchedAt: Date.now(), updatedAt: null };
  }
  const row = data[0] as HospitalStyleProfile & { updated_at?: string | null };
  return {
    profile: row,
    fetchedAt: Date.now(),
    updatedAt: row.updated_at ?? null,
  };
}

export async function getHospitalStylePrompt(hospitalName: string): Promise<string | null> {
  if (!supabase || !hospitalName) return null;

  const now = Date.now();
  const cached = styleProfileCache.get(hospitalName);

  let entry: StyleCacheEntry;
  if (cached && (now - cached.fetchedAt) < STYLE_CACHE_TTL_MS) {
    // TTL 내: 그대로 사용
    entry = cached;
  } else {
    // TTL 만료 또는 미존재: DB 재조회
    entry = await fetchStyleProfile(hospitalName);
    styleProfileCache.set(hospitalName, entry);
  }

  const profile = entry.profile;
  if (!profile?.style_profile) return null;

  const style = profile.style_profile as LearnedWritingStyle;
  if (!style.analyzedStyle) return null;

  return buildStylePrompt(
    style.analyzedStyle,
    style.name,
    style.description || '',
    profile.raw_sample_text || undefined,
  );
}

export async function saveHospitalBlogUrl(
  hospitalName: string,
  blogUrl: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase 미설정');
  const { error } = await (supabase.from('hospital_style_profiles') as any).upsert(
    {
      hospital_name: hospitalName,
      naver_blog_url: blogUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'hospital_name' },
  );
  if (error) throw new Error(`URL 저장 실패: ${error.message}`);
}

export async function resetHospitalCrawlData(
  hospitalName: string,
): Promise<{ deletedPosts: number; profileDeleted: boolean; errors: string[] }> {
  const errors: string[] = [];

  // 1. 크롤링 글 삭제
  const postResult = await deleteAllCrawledPosts(hospitalName);
  if (postResult.error) errors.push(`글 삭제: ${postResult.error}`);

  // 2. 말투 프로파일 삭제
  const profileResult = await deleteHospitalStyleProfile(hospitalName);
  if (profileResult.error) errors.push(`프로파일 삭제: ${profileResult.error}`);

  return {
    deletedPosts: postResult.deleted,
    profileDeleted: profileResult.success,
    errors,
  };
}

// ── 크롤링 + 학습 ──

const CRAWLER_URL = process.env.NEXT_PUBLIC_CRAWLER_URL || '';

/**
 * 크롤러 엔드포인트 URL 결정.
 * 네이버 블로그는 서버사이드 fetch를 차단(403)하므로
 * 반드시 Puppeteer 기반 외부 크롤러(crawler-server/)가 필요하다.
 * NEXT_PUBLIC_CRAWLER_URL이 미설정이면 에러를 던진다.
 */
function getCrawlerBaseUrl(): string {
  if (CRAWLER_URL) return CRAWLER_URL;
  throw new Error(
    '크롤러 서버 URL이 설정되지 않았습니다.\n' +
    '네이버 블로그는 서버사이드 fetch를 차단하므로 Puppeteer 기반 크롤러가 필요합니다.\n\n' +
    '1. crawler-server/를 Railway에 배포하세요 (DEPLOY_GUIDE.md 참조)\n' +
    '2. Vercel Dashboard → Settings → Environment Variables에서\n' +
    '   NEXT_PUBLIC_CRAWLER_URL = https://your-crawler.railway.app\n' +
    '   을 추가하세요.',
  );
}

/** 서버사이드(cron 등)에서도 /api/* 상대경로를 절대 URL로 resolve */
function resolveApiUrl(path: string): string {
  if (typeof window !== 'undefined') return path; // 브라우저: 상대경로 OK
  const base = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  return `${base}${path}`;
}

interface CrawledPost {
  url: string;
  content: string;
  title?: string;
  publishedAt?: string;
  summary?: string;
  thumbnail?: string;
}

export async function crawlAndLearnHospitalStyle(
  hospitalName: string,
  blogUrls: string[],
  onProgress?: (msg: string) => void,
): Promise<{ posts: CrawledPost[] }> {
  // 1단계: 모든 URL에서 글 크롤링
  const allPosts: CrawledPost[] = [];
  const errors: string[] = [];
  const crawlerBase = getCrawlerBaseUrl();

  for (let i = 0; i < blogUrls.length; i++) {
    const urlLabel = blogUrls.length > 1 ? ` (${i + 1}/${blogUrls.length})` : '';
    onProgress?.(`블로그 글 수집 중${urlLabel}... (최대 5개)`);

    try {
      const res = await fetch(`${crawlerBase}/api/naver/crawl-hospital-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: blogUrls[i], maxPosts: 5 }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const detail = `URL ${i + 1} 크롤링 HTTP ${res.status}${errBody ? ': ' + errBody.slice(0, 100) : ''}`;
        console.error(`[styleService] ${detail}`);
        errors.push(detail);
        continue;
      }
      const data = (await res.json()) as { posts?: CrawledPost[]; message?: string; diagnostics?: string[] };
      if (data.posts && data.posts.length > 0) {
        allPosts.push(...data.posts);
        onProgress?.(`${data.posts.length}개 글 수집됨${urlLabel}`);
      } else {
        const diag = data.diagnostics?.join(', ') || '';
        errors.push(`URL ${i + 1}: 글 0건${data.message ? ' — ' + data.message : ''}${diag ? ' [' + diag + ']' : ''}`);
      }
    } catch (err) {
      const msg = (err as Error).message || '알 수 없는 오류';
      console.error(`[styleService] URL ${i + 1} 크롤링 오류:`, msg);
      errors.push(`URL ${i + 1} 네트워크 오류: ${msg.slice(0, 80)}`);
      continue;
    }
  }

  if (allPosts.length === 0) {
    const detail = errors.length > 0 ? '\n' + errors.join('\n') : '';
    throw new Error(`수집된 블로그 글이 없습니다.${detail}`);
  }

  // 2단계: 합치기 + Gemini 분석
  onProgress?.(`총 ${allPosts.length}개 글 수집 완료. 말투 분석 중...`);
  // 줄바꿈/단락 리듬 분석을 위해 '---' 구분자 대신 가벼운 마커만 쓰고, 단락 경계 \n\n 를 보존한다.
  const combinedText = (() => {
    const joined = allPosts
      .map((p, idx) => `[글 #${idx + 1}]\n${p.content}`)
      .join('\n\n');
    if (joined.length <= 8000) return joined;
    const hardCut = joined.slice(0, 8000);
    // 가장 가까운 단락 경계(\n\n)에서 자른다. 못 찾으면 마지막 줄바꿈, 그것도 없으면 hardCut 그대로.
    const lastDoubleBreak = hardCut.lastIndexOf('\n\n');
    if (lastDoubleBreak >= 6000) return hardCut.slice(0, lastDoubleBreak);
    const lastBreak = hardCut.lastIndexOf('\n');
    if (lastBreak >= 7000) return hardCut.slice(0, lastBreak);
    return hardCut;
  })();
  const analyzedStyle = await analyzeWritingStyleViaApi(combinedText, hospitalName);

  // 3단계: Supabase 저장
  onProgress?.('말투 프로파일 저장 중...');

  let dbPostCount = allPosts.length;
  try {
    if (supabase) {
      const { count } = await supabase
        .from('hospital_crawled_posts')
        .select('id', { count: 'exact', head: true })
        .eq('hospital_name', hospitalName);
      if (count !== null) dbPostCount = count + allPosts.length;
    }
  } catch { /* ignore */ }

  if (supabase) {
    await (supabase.from('hospital_style_profiles') as any).upsert(
      {
        hospital_name: hospitalName,
        naver_blog_url: blogUrls.join(','),
        crawled_posts_count: dbPostCount,
        style_profile: analyzedStyle,
        raw_sample_text: combinedText.slice(0, 10000),
        last_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hospital_name' },
    );
    // Phase 2C: 재학습 완료 — 해당 병원의 캐시 무효화
    invalidateStyleCache(hospitalName);

    // 개별 글 저장 + 순위 체크
    for (let pi = 0; pi < allPosts.length; pi++) {
      const post = allPosts[pi];
      const blogId = post.url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || '';
      onProgress?.(`순위 체크 ${pi + 1}/${allPosts.length}...`);

      // 순위 체크: 글 제목 맨 앞 키워드로 검색
      let naverRank: number | null = null;
      let naverRankKeyword = '';
      if (post.title && blogId) {
        try {
          const cleanTitle = (post.title || '')
            .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
          const firstWord = cleanTitle.split(/[\s,?!.·:]/)[0].replace(/['""\[\]()【】]/g, '').trim();
          console.log(`[순위] 제목: "${post.title}" → 키워드: "${firstWord}" / blogId: ${blogId}`);
          if (firstWord.length >= 2) {
            naverRankKeyword = firstWord;
            const rankRes = await fetch('/api/naver/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: firstWord, display: 30 }),
            });
            console.log(`[순위] API 응답: ${rankRes.status}`);
            if (rankRes.ok) {
              const rankData = (await rankRes.json()) as { items?: Array<{ link?: string }> };
              const items = rankData.items || [];
              console.log(`[순위] 검색 결과 ${items.length}건`);
              const lowerBlogId = blogId.toLowerCase();
              const postLogNo = post.url.match(/\/(\d{5,})$/)?.[1] || post.url.match(/logNo=(\d+)/)?.[1];
              for (let ri = 0; ri < items.length; ri++) {
                const link = items[ri].link || '';
                if (!link.toLowerCase().includes(lowerBlogId)) continue;
                if (postLogNo && (link.includes(`/${postLogNo}`) || link.includes(`logNo=${postLogNo}`))) {
                  naverRank = ri + 1;
                  console.log(`[순위] ✅ ${ri + 1}위 매칭!`);
                  break;
                }
              }
            }
            await new Promise(r => setTimeout(r, 200));
          }
        } catch (e) { console.error('[순위] 체크 실패:', e); }
      }
      console.log(`[순위] 최종: "${naverRankKeyword}" → ${naverRank !== null ? naverRank + '위' : '순위외'}`);

      await (supabase.from('hospital_crawled_posts') as any).upsert(
        {
          hospital_name: hospitalName,
          url: post.url,
          content: post.content,
          source_blog_id: blogId,
          title: post.title || '',
          published_at: post.publishedAt || null,
          summary: post.summary || post.content.slice(0, 200),
          thumbnail: post.thumbnail || null,
          crawled_at: new Date().toISOString(),
          naver_rank: naverRank,
          naver_rank_keyword: naverRankKeyword || null,
        },
        { onConflict: 'hospital_name,url' },
      );
    }
  }

  return { posts: allPosts };
}

// ── 분석 결과(JSON) → LearnedWritingStyle 매핑 헬퍼 ──
// 저장 객체 빌드의 3중 중복을 단일 소스로 수렴. robust 가공(Number 강제 + Array.isArray
// + slice(0,3) + enum default) 채택 — 4-B 조사 보고 기준. 분석 프롬프트 자체는 호출자가
// 각자 보유(UI 수동 vs 크롤러 묶음이 의도된 분기로 판정됨).
export function createLearnedWritingStyle(
  result: Record<string, unknown>,
  rawSampleText: string,
  styleName: string,
): LearnedWritingStyle {
  return {
    id: `style_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: styleName,
    description: (result.description as string) || '',
    sampleText: rawSampleText.substring(0, 5000),
    analyzedStyle: {
      tone: (result.tone as string) || '',
      sentenceEndings: (result.sentenceEndings as string[]) || [],
      vocabulary: (result.vocabulary as string[]) || [],
      structure: (result.structure as string) || '',
      emotionLevel: (result.emotionLevel as 'low' | 'medium' | 'high') || 'medium',
      formalityLevel: (result.formalityLevel as 'casual' | 'neutral' | 'formal') || 'neutral',
      speakerIdentity: result.speakerIdentity as string,
      readerDistance: result.readerDistance as string,
      sentenceRhythm: result.sentenceRhythm as string,
      paragraphFlow: result.paragraphFlow as string,
      persuasionStyle: result.persuasionStyle as string,
      medicalTermLevel: result.medicalTermLevel as string,
      procedureExplainStyle: result.procedureExplainStyle as string,
      trustBuildingPattern: result.trustBuildingPattern as string,
      ctaStyle: result.ctaStyle as string,
      anxietyHandling: result.anxietyHandling as string,
      uniqueExpressions: result.uniqueExpressions as string[],
      bannedGenericStyle: result.bannedGenericStyle as string[],
      oneLineSummary: result.oneLineSummary as string,
      goodExamples: result.goodExamples as string[],
      badExamples: result.badExamples as string[],
      // ── Phase 2D Tier 2-A: 단락/줄바꿈 메트릭 (robust) ──
      paragraphStats: (result.paragraphStats as {
        avgSentencesPerParagraph?: number;
        avgCharsPerParagraph?: number;
        lineBreakStyle?: 'dense' | 'airy' | 'mixed';
        doubleBreakFrequency?: 'low' | 'medium' | 'high';
        paragraphLengthPattern?: string;
      } | undefined) ? {
        avgSentencesPerParagraph: Number((result.paragraphStats as { avgSentencesPerParagraph?: number }).avgSentencesPerParagraph) || 0,
        avgCharsPerParagraph: Number((result.paragraphStats as { avgCharsPerParagraph?: number }).avgCharsPerParagraph) || 0,
        lineBreakStyle: ((result.paragraphStats as { lineBreakStyle?: string }).lineBreakStyle as 'dense' | 'airy' | 'mixed') || 'mixed',
        doubleBreakFrequency: ((result.paragraphStats as { doubleBreakFrequency?: string }).doubleBreakFrequency as 'low' | 'medium' | 'high') || 'medium',
        paragraphLengthPattern: String((result.paragraphStats as { paragraphLengthPattern?: string }).paragraphLengthPattern || ''),
      } : undefined,
      representativeParagraphs: Array.isArray(result.representativeParagraphs)
        ? (result.representativeParagraphs as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 3)
        : undefined,
    },
    stylePrompt: (result.stylePrompt as string) || '',
    createdAt: new Date().toISOString(),
  };
}

// ── Gemini 분석 (next-app /api/gemini 경유) ──

async function analyzeWritingStyleViaApi(
  sampleText: string,
  styleName: string,
): Promise<LearnedWritingStyle> {
  // root writingStyleService.ts analyzeWritingStyle와 동일한 프롬프트
  const prompt = `너는 단순히 기존 글의 문장 끝맺음을 흉내 내는 사람이 아니라,
해당 병원 고유의 화자 캐릭터, 상담 방식, 설명 습관, 설득 구조를 추출해
그 문체를 재현하는 편집자 역할을 수행한다.

[분석할 텍스트]
${sampleText.substring(0, 6000)}

⚠️ 핵심 원칙 — 원문에서 직접 추출해라:
- goodExamples는 반드시 원문에서 문장을 그대로 복사-붙여넣기해라. 한 글자도 수정하지 마라!
  · 원문: "찬 것에 시린 증상이 2주 이상 지속되면 신경 치료가 필요할 수 있습니다"
  · 올바른 추출: "찬 것에 시린 증상이 2주 이상 지속되면 신경 치료가 필요할 수 있습니다" (동일)
  · 잘못된 추출: "시린 증상이 오래되면 신경 치료를 고려해야 합니다" (요약/재작성 — 금지!)
- sentenceEndings는 원문에서 실제로 반복 등장하는 패턴만 추출해라
- vocabulary는 원문에서 3회 이상 등장하는 단어/표현만 포함해라
- uniqueExpressions는 원문에서 이 병원만의 독특한 표현을 정확히 인용해라
- 추측하지 마라. 원문에 근거가 없는 분석은 하지 마라

[중요 원칙]
- 표면적인 어미나 표현 몇 개만 모방하지 말 것
- 반드시 화자의 태도, 환자와의 거리감, 설명 흐름, 설득 구조까지 분석할 것
- 업종 공통 블로그 말투로 평준화하지 말 것
- 병원명만 바꿔도 다른 병원 글처럼 보이는 문장은 피할 것
- 실제 상담실/진료실에서 나올 법한 문장인지 기준으로 판단할 것

[분석 항목 — 7가지]

1. 화자의 정체성 (speakerIdentity)
   - 대표원장 직접 설명형인지
   - 객관적 정보 칼럼형인지
   - 환자 상담형인지
   - 보호자 안심형인지

2. 독자와의 거리감 (readerDistance)
   - 전문가가 설명하는 거리인지
   - 친절한 상담 대화형인지
   - 공감과 위로가 섞인 톤인지
   - 차분하고 객관적인 톤인지

3. 문장 리듬 (sentenceRhythm)
   - 평균 문장 길이
   - 짧게 끊는지, 길게 설명하는지
   - 같은 어미 반복 여부
   - 질문형 / 단정형 / 권유형 비중

4. 문단 전개 구조 (paragraphFlow)
   - 사례 도입 → 설명 → 정리
   - 문제 제기 → 원인 → 해결
   - 환자 질문 → 답변
   - 비교 설명 → 적합 대상 → 관리법

5. 설득 방식 (persuasionStyle)
   - 정보 전달 중심인지
   - 신뢰 형성 중심인지
   - 치료 필요성 설득형인지
   - 두려움 완화형인지

6. 고유 표현 습관 (uniqueExpressions)
   - 자주 쓰는 접속어
   - 자주 쓰는 명사 표현
   - 반복되는 문장 구조
   - 자주 등장하는 상담 문장 패턴

7. 금지해야 할 범용 문체 (bannedGenericStyle)
   - 다른 병원 블로그에도 그대로 들어갈 수 있는 진부한 표현
   - 과장된 광고 문구
   - AI가 쓴 듯한 균일한 설명체
   - 의미 없이 반복되는 '~입니다', '~필요합니다' 나열

8. 단락·줄바꿈 리듬 (paragraphStats + representativeParagraphs)
   - 단락(빈 줄 \n\n 로 구분된 덩어리) 단위로 분석.
   - avgSentencesPerParagraph: 단락당 평균 문장 수를 정수/소수로 계산.
   - avgCharsPerParagraph: 단락당 평균 글자 수 (공백 포함).
   - lineBreakStyle:
       "dense" = 문장 사이 \n 으로 줄 자주 바꿈 (빈 줄은 적음, 숨가쁜 리듬)
       "airy"  = 빈 줄 \n\n 를 자주 넣어 여백이 큼
       "mixed" = 위 두 패턴이 섞임
   - doubleBreakFrequency: 빈 줄(\n\n) 의 등장 빈도
       "low" = 10문장당 1회 미만, "medium" = 3~10문장당 1회, "high" = 3문장 이하마다 1회
   - paragraphLengthPattern: 전체 글 구조의 단락 길이 리듬을 한국어로 서술.
       예: "짧은 단락(1~2문장) 2개로 훅 → 긴 단락(4~5문장) 1개로 설명 → 짧은 마무리"
   - representativeParagraphs: 이 병원 말투의 리듬을 가장 잘 보여주는 단락 3개를 원문 그대로 복사.
       각 단락은 200~500자. 단락 내부의 \n 과 \n\n 을 그대로 보존해서 복사.
       의료광고법 위반(최고, 완치, 100%, 성공률 99% 등) 단락은 피하고 자연 서술 단락 우선 선택.
       요약/축약 금지. 한 글자도 수정 금지.

[출력 형식]
반드시 아래 JSON으로만 답변. 설명 텍스트 없이 JSON만 출력.
{
  "tone": "전체적인 어조 설명 (2-3문장)",
  "sentenceEndings": ["자주 쓰는 문장 끝 패턴 5-8개"],
  "vocabulary": ["이 병원 고유의 특징적 단어/표현 5-10개"],
  "structure": "글 구조 설명 (TYPE A 에세이형 / TYPE B 정보전달형 명시 + 상세 흐름)",
  "emotionLevel": "low/medium/high",
  "formalityLevel": "casual/neutral/formal",
  "speakerIdentity": "화자 정체성 분석 (2-3문장, 어떤 위치에서 말하는지)",
  "readerDistance": "독자와의 거리감 분석 (2-3문장)",
  "sentenceRhythm": "문장 리듬 분석 (평균 길이, 끊김 패턴, 어미 반복 여부, 질문형/단정형/권유형 비중)",
  "paragraphFlow": "문단 전개 구조 분석 (2-3문장, 대표적 흐름 패턴)",
  "persuasionStyle": "설득 방식 분석 (2-3문장)",
  "medicalTermLevel": "의료 용어 사용 수준 (쉬운말만/전문용어+설명/전문가 대상)",
  "procedureExplainStyle": "시술·치료 설명 방식 (단계별/비유 활용/Before-After/비교 등)",
  "trustBuildingPattern": "환자 신뢰 구축 패턴 (경험 수치/후기 인용/논문 근거/공감 등)",
  "ctaStyle": "행동 유도(CTA) 방식 (직접 권유/부드러운 제안/정보 제공 후 선택 맡김 등)",
  "anxietyHandling": "환자 불안 대응 방식 (직접 해소/공감 후 안심/과학적 근거 제시 등)",
  "uniqueExpressions": ["고유 접속어, 명사 표현, 반복 문장 구조, 상담 패턴 — 5-10개"],
  "bannedGenericStyle": ["이 병원 글에서 절대 나오면 안 되는 범용/진부 표현 5-8개"],
  "oneLineSummary": "이 병원 문체를 한 줄로 정의",
  "goodExamples": ["⚠️ CRITICAL: 원문에서 문장을 그대로 복사-붙여넣기 하세요. 한 글자도 바꾸지 마세요. 새로 만들면 분석 실패입니다. 원문에서 이 병원의 톤이 가장 잘 드러나는 대표 문장 8~10개를 정확히 인용"],
  "badExamples": ["이 병원답지 않은 문장 예시 5개 — AI가 흔히 쓰는 범용 문장으로 직접 작성. 원문에 없는 문장이어야 함"],
  "paragraphStats": {
    "avgSentencesPerParagraph": 0,
    "avgCharsPerParagraph": 0,
    "lineBreakStyle": "dense | airy | mixed",
    "doubleBreakFrequency": "low | medium | high",
    "paragraphLengthPattern": "단락 길이 리듬 서술 (예: 짧게 2개 → 길게 1개 → 짧은 마무리)"
  },
  "representativeParagraphs": ["원문에서 그대로 복사한 단락 3개, 줄바꿈(\\n, \\n\\n) 포함, 각 200~500자"],
  "description": "이 말투를 한 줄로 설명 (화자 캐릭터 + 독자 관계 + 설득 구조 포함)",
  "stylePrompt": "AI가 이 말투로 글을 쓸 때 반드시 지켜야 할 핵심 지침 (150-250자, 화자 태도 + 설명 흐름 + 의료 설명 방식 + 금지 패턴)"
}`;

  // 말투 분석은 미묘한 톤/패턴 추출이므로 flash 이상 필요
  const res = await fetch(resolveApiUrl('/api/gemini'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'json',
    }),
  });

  if (!res.ok) {
    throw new Error('말투 분석 API 호출 실패');
  }

  const responseData = (await res.json()) as { text?: string };
  let result: Record<string, unknown>;

  try {
    // API 응답에서 JSON 추출
    let text = responseData.text || '';
    // ```json ... ``` 패턴 제거
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1];
    result = JSON.parse(text.trim());
  } catch {
    throw new Error('말투 분석 결과 파싱 실패');
  }

  return createLearnedWritingStyle(result, sampleText, styleName);
}

// ── 채점 (scoring) — root writingStyleService.scoreCrawledPost 이식 ──

export async function scoreCrawledPost(content: string): Promise<CrawledPostScore> {
  const sliced = content.slice(0, 3000);
  const prompt = `너는 병원 블로그 글의 품질·SEO를 검수하는 전문 검수자다.

⚠️ 채점 원칙:
- 100점은 진짜 완벽한 글에만 부여. 평균적인 병원 블로그는 75~85점대가 정상
- **맥락을 반드시 봐야 한다** — 문맥상 문제없는 표현을 억지로 감점하지 마라
- 실제 오류/위반/부족한 점이 있을 때만 감점. 없으면 높은 점수를 줘도 된다
- 오타가 진짜 없으면 오타 100점 OK. SEO가 진짜 잘 되어있으면 SEO 90점 OK
- 핵심: "엄격하되 공정하게". 있는 것만 잡고, 없는 걸 만들어내지 마라

⛔ 절대 금지 — AI 환각(Hallucination) 방지:
- 원문에 없는 오타를 지어내지 마라. 실제 텍스트에 존재하는 오류만 보고해라
- 원문에 없는 표현을 "위반"이라고 날조하지 마라. 실제 문장을 인용해서 근거를 대라
- "~라는 표현이 있습니다"라고 쓰려면 원문에 정말 있는지 다시 확인해라
- 확실하지 않으면 감점하지 마라. 추측으로 감점하는 것은 거짓 보고다
- issues 배열에 넣는 모든 항목의 "original", "word", "context"는 반드시 원문에서 그대로 복사한 것이어야 한다

[검수 대상 텍스트]
${sliced}

[채점 항목 4가지 — 각 100점 만점, 감점 방식]

1) score_typo (오타 점수, 100점)
- 실제 오타만 해당 (예: "임프란트"→"임플란트", "치요"→"치료")
- 건당 -10점, 최대 10건까지 보고
- ⚠️ 오타가 아닌 것: 문장 스타일/표현 차이, 문장이 짧은 것, 구어체 표현

2) score_spelling (맞춤법·띄어쓰기·문법 점수, 100점)
- 실제 맞춤법/띄어쓰기 오류만 해당 (예: "됬다"→"됐다", "해야될"→"해야 될")
- 건당 -5점, 최대 10건까지 보고
- ⚠️ 맞춤법 오류가 아닌 것:
  - 문장을 더 길게/짧게 쓰는 건 스타일 차이지 오류가 아님
  - "잇몸에 염증" → "잇몸에 염증이 생길 수 있습니다"는 문장 확장 제안이지 맞춤법 오류 아님
  - "영향" → "영향을 미칠 수 있습니다"는 스타일 제안이지 맞춤법 오류 아님
  - 완결된 문장이 아닌 것(제목, 소제목, 리스트 항목)은 오류로 잡지 않는다
  - correction이 original보다 훨씬 길면 (2배 이상) 스타일 제안일 가능성 높음 → 제외

3) score_medical_law (의료광고법 준수 점수, 100점)
- 의료법 제56조 기준 — 의심스러우면 감점 쪽으로!
  - 제56조1항: 치료 효과 단정 ("완치", "100% 치료", "확실한 효과") → critical, -20
  - 제56조2항1호: 최고/유일/최초 ("최고", "국내 유일", "업계 최초") → critical, -20
  - 제56조2항2호: 타 의료기관 비교/비방 ("다른 병원과 달리") → high, -10
  - 제56조2항3호: 환자 체험기 ("OO환자 OO일만에", "후기") → high, -10
  - 제56조2항4호: 뉴스/방송 인용 ("TV에서 소개된", "언론 보도") → medium, -5
  - 제56조2항5호: 미입증 안전 주장 ("부작용 없이", "안전한 시술") → high, -10
  - 제56조2항6호: 과장/허위 ("탁월한", "획기적인", "놀라운", "혁신적") → medium, -5
- ⚠️ 추가 감점 대상 (맥락 확인 후 판단!):
  - "검증된", "인정받은" → 구체적 인증/수상이 없으면 -5. 실제 자격증/인증 언급이면 OK
  - "풍부한 경험", "다년간의 노하우" → 구체적 연수/건수 없으면 -5. "15년 경력" 같이 구체적이면 OK
  - 시술 전후 비교 암시, 만족도 수치 → 객관적 출처 없으면 -10

⚠️ 오탐 방지 — 반드시 문맥(context)을 확인하세요. 단어만 보고 판단 금지!
- "완치"가 들어있어도 "완치가 어렵다", "완치를 보장할 수 없다" 등 부정/주의 문맥이면 위반 아님
- "최고"가 들어있어도 "최고의 결과를 위해 노력합니다" 등 일반적 표현은 위반 아님
- ⛔ 병원/치과 상호명에 포함된 단어는 절대 위반으로 잡지 마라! 예:
  - "일등치과"의 "일등" → 상호명이므로 위반 아님!
  - "으뜸치과"의 "으뜸" → 상호명이므로 위반 아님!
  - "베스트치과"의 "베스트" → 상호명이므로 위반 아님!
  - "최고치과"의 "최고" → 상호명이므로 위반 아님!
  - "검단일등치과"의 "일등" → 상호명의 일부이므로 위반 아님!
  - 병원 이름 자체가 과장 표현을 포함해도, 그것은 등록된 상호명이지 광고가 아니다
- 지역명+병원/치과 조합은 위반 아님 (예: "강서구인근치과", "광화문 치과", "OO역 치과")
- SEO 키워드 (지역+시술 조합)는 위반 아님 (예: "강남 임플란트")
- 병원 상호명, 진료과목 나열, 진료시간/위치/주차 등 사실 정보는 위반 아님
- "~에 도움이 됩니다", "~할 수 있습니다" 같은 완화된 표현은 위반 아님
- 위반 여부는 해당 문장 전체 맥락에서 판단. 단어 단독 매칭 절대 금지

⚠️ 대체어(replacement) 작성 규칙:
- 원문의 말투와 분위기를 최대한 유지하세요
- AI스러운 딱딱한 표현 금지 (예: "증상 개선에 도움을 드릴 수 있습니다" ← 이런 거 금지)
- 블로그 글이니까 자연스럽고 읽기 편한 표현으로 제안
- 예시: "획기적인 치료" → "효과적인 치료", "완치됩니다" → "나을 수 있어요", "최고의 기술" → "검증된 기술"

4) score_naver_seo (네이버 블로그 SEO 점수, 100점)
네이버 C-Rank + D.I.A 알고리즘 기준 (2025~2026) — 엄격 적용:
- 글자 수: 1500자 미만 -15, 1000자 미만 -25 (네이버 최적 1500~2500자)
- 키워드 밀도: 제목+본문에 핵심 키워드 4~6회가 적정. 2회 미만 -10, 1회만 -15, 10회 이상(키워드 스터핑) -15
- 소제목 구조: 소제목(h2/h3 또는 굵은글씨 소제목) 없음 -15, 3개 미만 -10 (구조화 필수)
- 문단 가독성: 300자 이상 연속 문단 -10, 500자 이상 -15 (모바일 가독성)
- 경험/전문성: 구체적 경험·사례·수치 없이 일반론만 -15 (D.I.A는 경험 기반 콘텐츠 우대)
- CTA/행동유도: 상담 안내, 예약, 연락처 등 없으면 -5
- ⚠️ 이미지는 크롤링 시 텍스트만 수집되므로 이미지 유무로 감점하지 마세요
- 주제 일관성: 글의 주제가 제목과 불일치하면 -10 (C-Rank 주제 전문성)
- 도입부 훅: 첫 문단이 흥미를 끌지 못하면 -5 (독자 이탈 방지)
- 내부링크/관련글: 없으면 -5
⚠️ SEO 점수는 가장 엄격하게! 평범한 블로그 글은 60~75점이 정상이다. 85+ 는 정말 잘 최적화된 글에만.

[출력 형식] JSON만 출력. 설명 없이.
{
  "score_typo": 숫자,
  "score_spelling": 숫자,
  "score_medical_law": 숫자,
  "score_naver_seo": 숫자,
  "score_total": (네 점수 평균, 반올림),
  "typo_issues": [{"original":"틀린표현","correction":"올바른표현","context":"문맥","type":"typo 또는 spelling"}],
  "law_issues": [{"word":"위반표현","severity":"critical/high/medium/low","replacement":["대체표현"],"context":"문맥","law_article":"제56조N항"}],
  "seo_issues": [{"item":"항목명","score":감점점수,"reason":"감점 사유"}]
}`;

  const res = await fetch(resolveApiUrl('/api/gemini'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.1-flash-preview',
      temperature: 0.1,
      responseType: 'json',
      timeout: 60000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`채점 API 호출 실패 (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) {
    throw new Error(`채점 API 오류: ${data.error}`);
  }
  if (!data.text) {
    throw new Error('채점 API 응답에 text 없음');
  }

  let parsed: Record<string, unknown>;
  try {
    let text = data.text;
    // 1) ```json ... ``` 블록 추출
    const jsonBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlock) text = jsonBlock[1];
    // 2) 첫 번째 { 부터 매칭하는 } 까지 추출 (중첩 대응)
    const startIdx = text.indexOf('{');
    if (startIdx >= 0) {
      let depth = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      text = text.slice(startIdx, endIdx + 1);
    }
    parsed = JSON.parse(text.trim());
  } catch {
    // 최후 시도: 응답에서 score 키가 있는 부분만 추출
    try {
      const emergency = data.text.match(/\{[^{}]*"score_typo"[^{}]*\}/);
      if (emergency) {
        parsed = JSON.parse(emergency[0]);
      } else {
        throw new Error('no json');
      }
    } catch {
      console.error('[채점 파싱 실패] 원본 응답:', data.text.slice(0, 500));
      throw new Error(`채점 결과 파싱 실패 — 응답: ${data.text.slice(0, 150)}`);
    }
  }

  let typo_issues = (parsed.typo_issues as CrawledPostScore['typo_issues']) || [];
  let law_issues = (parsed.law_issues as CrawledPostScore['law_issues']) || [];
  const seo_issues = (parsed.seo_issues as CrawledPostScore['seo_issues']) || [];

  // ── 후처리 필터: 오탐 제거 ──

  // 맞춤법/오타: correction이 original보다 2배 이상 길면 스타일 제안 → 제거
  typo_issues = typo_issues.filter(issue => {
    const origLen = (issue.original || '').length;
    const corrLen = (issue.correction || '').length;
    if (origLen > 0 && corrLen > origLen * 2) return false;
    // original과 correction이 거의 같으면 제거 (띄어쓰기만 다른 경우 제외)
    if (issue.original.replace(/\s/g, '') === issue.correction.replace(/\s/g, '')) return false;
    return true;
  });

  // 의료법: 오탐 제거
  const safeLawWordPatterns = [/인근/, /근처/, /주변/, /역\s*치과/, /구\s*치과/, /동\s*치과/];
  const negativeContextPatterns = [/어렵/, /불가/, /없습니다/, /않습니다/, /아닙니다/, /주의/, /위험/, /수 있/];
  // 기술/시스템/방식 설명에 쓰이는 단어는 치료 효과 단정이 아님
  const techDescPatterns = [/시스템/, /방식/, /기술/, /장비/, /장치/, /프로그램/, /설계/, /소재/];
  law_issues = law_issues.filter(issue => {
    const ctx = (issue.context || '');
    const word = (issue.word || '');
    // 지역명+치과 패턴은 무조건 제거
    if (safeLawWordPatterns.some(p => p.test(word))) return false;
    // 부정/완화 문맥이면 제거 (예: "완치가 어렵다", "~할 수 있습니다")
    if (negativeContextPatterns.some(p => p.test(ctx))) return false;
    // "혁신적인/획기적인" + 시스템/방식/기술 문맥이면 제거
    if (/혁신|획기/.test(word) && techDescPatterns.some(p => p.test(ctx))) return false;
    // severity가 medium이고 context에 구체적 기술/방법론 설명이 있으면 제거
    if (issue.severity === 'medium' && techDescPatterns.some(p => p.test(ctx))) return false;
    return true;
  });

  // 필터 후 점수 재계산
  const typoCount = typo_issues.filter(i => i.type === 'typo' || !i.type).length;
  const spellingCount = typo_issues.filter(i => i.type === 'spelling').length;
  const recalcTypo = Math.max(0, 100 - typoCount * 10);
  const recalcSpelling = Math.max(0, 100 - spellingCount * 5);
  // 필터 후 이슈가 0건이면 100점, 아니면 이슈 수 기반으로 재계산
  const rawLawIssueCount = (parsed.law_issues as CrawledPostScore['law_issues'])?.length ?? 0;
  const recalcLaw = law_issues.length === 0
    ? 100
    : rawLawIssueCount > law_issues.length
      ? Math.min(100, Math.max(0, Math.min(100, Number(parsed.score_medical_law) || 100) + (rawLawIssueCount - law_issues.length) * 10))
      : Math.max(0, Math.min(100, Number(parsed.score_medical_law) || 100));

  const scores = {
    score_typo: recalcTypo,
    score_spelling: recalcSpelling,
    score_medical_law: recalcLaw,
    score_naver_seo: Math.max(0, Math.min(100, Number(parsed.score_naver_seo) || 100)),
    score_total: 0,
    typo_issues,
    law_issues,
    seo_issues,
  };
  scores.score_total = Math.round((scores.score_typo + scores.score_spelling + scores.score_medical_law + scores.score_naver_seo) / 4);
  return scores;
}

// ── DB 크롤링 글 CRUD ──

export async function getCrawledPosts(hospitalName: string): Promise<DBCrawledPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .eq('hospital_name', hospitalName)
    .order('published_at', { ascending: false });
  if (error || !data) return [];
  return data as DBCrawledPost[];
}

export async function getAllCrawledPostsSummary(): Promise<Record<string, DBCrawledPost[]>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .order('published_at', { ascending: false });
  if (error || !data) return {};
  const grouped: Record<string, DBCrawledPost[]> = {};
  for (const row of data as DBCrawledPost[]) {
    if (!grouped[row.hospital_name]) grouped[row.hospital_name] = [];
    grouped[row.hospital_name].push(row);
  }
  return grouped;
}

export async function updateCrawledPostScore(id: string, score: CrawledPostScore): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('hospital_crawled_posts')
    .update({
      score_typo: score.score_typo,
      score_spelling: score.score_spelling,
      score_medical_law: score.score_medical_law,
      score_naver_seo: score.score_naver_seo,
      score_total: score.score_total,
      typo_issues: score.typo_issues,
      law_issues: score.law_issues,
      seo_issues: score.seo_issues,
      scored_at: new Date().toISOString(),
    })
    .eq('id', id);
  // Phase 2C: 글 단건 재채점 — hospitalName 이 인자에 없어 전체 flush 로 보수 처리
  invalidateStyleCache();
}

export async function updateCrawledPostContent(id: string, correctedContent: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('hospital_crawled_posts')
    .update({ corrected_content: correctedContent })
    .eq('id', id);
  // Phase 2C: 글 내용 교정 — hospitalName 이 인자에 없어 전체 flush 로 보수 처리
  invalidateStyleCache();
}

/** 크롤링 글 단건 저장/upsert (root saveCrawledPost 이식) */
export async function saveCrawledPost(
  hospitalName: string,
  url: string,
  content: string,
  score?: CrawledPostScore,
  meta?: { title?: string; publishedAt?: string; summary?: string; thumbnail?: string },
): Promise<DBCrawledPost | null> {
  if (!supabase) return null;

  const blogId = url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || '';
  const record: Record<string, unknown> = {
    hospital_name: hospitalName,
    url,
    content,
    source_blog_id: blogId,
    crawled_at: new Date().toISOString(),
  };
  if (meta?.title) record.title = meta.title;
  if (meta?.publishedAt) record.published_at = meta.publishedAt;
  if (meta?.summary) record.summary = meta.summary;
  if (meta?.thumbnail) record.thumbnail = meta.thumbnail;
  if (score) {
    record.score_typo = score.score_typo;
    record.score_medical_law = score.score_medical_law;
    record.score_total = score.score_total;
    record.typo_issues = score.typo_issues;
    record.law_issues = score.law_issues;
    record.scored_at = new Date().toISOString();
  }

  // 1차 시도: source_blog_id 포함
  const { data, error } = await (supabase
    .from('hospital_crawled_posts') as any)
    .upsert(record, { onConflict: 'hospital_name,url' })
    .select()
    .single();
  if (!error && data) return data as DBCrawledPost;

  // 2차 시도: source_blog_id 컬럼이 없을 수 있으므로 제외
  if (error) {
    const { source_blog_id: _removed, ...recordWithout } = record;
    void _removed;
    const { data: d2, error: e2 } = await (supabase
      .from('hospital_crawled_posts') as any)
      .upsert(recordWithout, { onConflict: 'hospital_name,url' })
      .select()
      .single();
    if (!e2 && d2) return d2 as DBCrawledPost;
  }

  return null;
}

/** 특정 병원의 크롤링 글 전체 삭제 (root deleteAllCrawledPosts 이식) */
export async function deleteAllCrawledPosts(
  hospitalName: string,
): Promise<{ deleted: number; error?: string }> {
  if (!supabase) return { deleted: 0, error: 'Supabase 미설정' };

  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .delete()
    .eq('hospital_name', hospitalName)
    .select('id');

  if (error) {
    console.warn('크롤링 글 삭제 실패:', error.message);
    return { deleted: 0, error: error.message };
  }
  const count = Array.isArray(data) ? data.length : 0;
  // Phase 2C: 병원 크롤링 글 전량 삭제 후 캐시 무효화
  invalidateStyleCache(hospitalName);
  return { deleted: count };
}

/** 특정 병원의 말투 프로파일만 삭제 (root deleteHospitalStyleProfile 이식) */
export async function deleteHospitalStyleProfile(
  hospitalName: string,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  const { error } = await supabase
    .from('hospital_style_profiles')
    .delete()
    .eq('hospital_name', hospitalName);

  if (error) {
    console.warn('말투 프로파일 삭제 실패:', error.message);
    return { success: false, error: error.message };
  }
  // Phase 2C: 말투 프로파일 삭제 후 캐시 무효화
  invalidateStyleCache(hospitalName);
  return { success: true };
}

export async function crawlAndScoreAllHospitals(
  onProgress?: (msg: string, done: number, total: number) => void,
  options?: { includeStyleAnalysis?: boolean },
): Promise<void> {
  const includeStyle = options?.includeStyleAnalysis ?? false;
  const crawlerBase = getCrawlerBaseUrl();

  // DB 프로필에서 URL이 있는 병원 목록 구성
  const profiles = await getAllStyleProfiles();
  const hospitalUrls: { name: string; urls: string[] }[] = [];

  for (const profile of profiles) {
    const urls = profile.naver_blog_url?.split(',').map(u => u.trim()).filter(Boolean) || [];
    if (urls.length > 0) {
      hospitalUrls.push({ name: profile.hospital_name, urls });
    }
  }

  const total = hospitalUrls.length;
  if (total === 0) {
    throw new Error('크롤링할 병원이 없습니다. 블로그 URL을 먼저 설정하세요.');
  }

  // ── 한 병원 처리 함수 ──
  async function processHospital(
    hospital: { name: string; urls: string[] },
    index: number,
  ) {
    const { name, urls } = hospital;
    const allContents: string[] = [];
    let totalPostsForHospital = 0;

    // 1) 각 URL별 최대 5개씩 크롤링 + 채점
    for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
      const urlLabel = urls.length > 1 ? ` URL ${urlIdx + 1}/${urls.length}` : '';
      onProgress?.(`${name}${urlLabel} 크롤링 중...`, index, total);

      let posts: { url: string; content: string; title?: string; publishedAt?: string; summary?: string; thumbnail?: string }[] = [];
      try {
        const res = await fetch(`${crawlerBase}/api/naver/crawl-hospital-blog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogUrl: urls[urlIdx], maxPosts: 5 }),
        });
        if (!res.ok) {
          onProgress?.(`${name}${urlLabel} 크롤링 실패 (${res.status})`, index, total);
          continue;
        }
        const data = (await res.json()) as { posts?: typeof posts };
        posts = data.posts || [];
      } catch (err) {
        onProgress?.(`${name}${urlLabel} 크롤링 오류: ${(err as Error).message?.slice(0, 50)}`, index, total);
        continue;
      }

      if (posts.length === 0) continue;
      totalPostsForHospital += posts.length;

      // 채점 + 블로그탭 순위 체크 + DB 저장
      for (let pi = 0; pi < posts.length; pi++) {
        const post = posts[pi];
        allContents.push(post.content);
        onProgress?.(`${name}${urlLabel} 채점 ${pi + 1}/${posts.length}`, index, total);
        try {
          const score = await scoreCrawledPost(post.content);
          const blogId = post.url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || '';

          // 순위 체크: 글 제목 맨 앞 키워드로 검색 → 그 글이 몇 위인지
          let naverRank: number | null = null;
          let naverRankKeyword = '';
          if (post.title && blogId) {
            try {
              const cleanTitle = (post.title || '')
                .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
              // 키워드 추출: "치과/의원/병원"으로 끝나는 부분까지, 없으면 첫 단어
              const clinicMatch = cleanTitle.match(/^(.+?(?:치과|의원|병원|한의원|피부과|내과|외과|안과|이비인후과|정형외과|소아과))/);
              const firstWord = clinicMatch
                ? clinicMatch[1].replace(/['""\[\]()【】]/g, '').trim()
                : cleanTitle.split(/[\s,?!.·:]/)[0].replace(/['""\[\]()【】]/g, '').trim();
              console.log(`[순위] 제목: "${post.title}" → 키워드: "${firstWord}" / blogId: ${blogId} / url: ${post.url}`);
              if (firstWord.length >= 2) {
                naverRankKeyword = firstWord;
                onProgress?.(`${name}${urlLabel} 순위 체크 "${firstWord}"`, index, total);
                const rankRes = await fetch('/api/naver/search', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: firstWord, display: 30, type: 'blog' }),
                });
                console.log(`[순위] API 응답 상태: ${rankRes.status}`);
                if (rankRes.ok) {
                  const rankData = (await rankRes.json()) as { items?: Array<{ link?: string; title?: string; description?: string }> };
                  const items = rankData.items || [];
                  console.log(`[순위] "${firstWord}" 검색 결과 ${items.length}건`);
                  const lowerBlogId = blogId.toLowerCase();
                  const postLogNo = post.url.match(/\/(\d{5,})$/)?.[1]
                    || post.url.match(/logNo=(\d+)/)?.[1];
                  console.log(`[순위] 매칭 조건 — blogId: ${lowerBlogId}, logNo: ${postLogNo}`);
                  const kwNoSpace = firstWord.replace(/\s+/g, '').toLowerCase();
                  for (let ri = 0; ri < items.length; ri++) {
                    const item = items[ri];
                    const link = item.link || '';
                    const linkLower = link.toLowerCase();
                    if (!linkLower.includes(lowerBlogId)) continue;
                    // blogId 매칭 + 제목에 키워드 연속 포함
                    const titleClean = (item.title || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, '').toLowerCase();
                    if (titleClean.includes(kwNoSpace)) {
                      naverRank = ri + 1;
                      console.log(`[순위] ✅ 매칭! ${ri + 1}위 (키워드: ${firstWord})`);
                      break;
                    }
                  }
                }
                await new Promise(r => setTimeout(r, 200));
              }
            } catch (rankErr) { console.error('[순위] 체크 실패:', rankErr); }
          }

          console.log(`[순위] 최종 결과 — "${naverRankKeyword}": ${naverRank !== null ? naverRank + '위' : '순위외'}`);
          if (supabase) {
            await (supabase.from('hospital_crawled_posts') as any).upsert(
              {
                hospital_name: name,
                url: post.url,
                content: post.content,
                source_blog_id: blogId,
                title: post.title || '',
                published_at: post.publishedAt || null,
                summary: post.summary || post.content.slice(0, 200),
                thumbnail: post.thumbnail || null,
                crawled_at: new Date().toISOString(),
                score_typo: score.score_typo,
                score_spelling: score.score_spelling,
                score_medical_law: score.score_medical_law,
                score_naver_seo: score.score_naver_seo,
                score_total: score.score_total,
                typo_issues: score.typo_issues,
                law_issues: score.law_issues,
                seo_issues: score.seo_issues,
                scored_at: new Date().toISOString(),
                naver_rank: naverRank,
                naver_rank_keyword: naverRankKeyword || null,
              },
              { onConflict: 'hospital_name,url' },
            );
          }
        } catch {
          // 개별 글 채점 실패 → 건너뜀
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // 2) 말투 분석 (옵션 ON + 수집된 글이 있을 때만)
    let analyzedStyle: LearnedWritingStyle | null = null;
    if (includeStyle && allContents.length > 0) {
      onProgress?.(`${name} 말투 분석 중...`, index, total);
      try {
        // Phase 2D Tier 2-A: 단락 경계 보존
        const combinedText = (() => {
          const joined = allContents
            .map((c, idx) => `[글 #${idx + 1}]\n${c}`)
            .join('\n\n');
          if (joined.length <= 8000) return joined;
          const hardCut = joined.slice(0, 8000);
          const lastDoubleBreak = hardCut.lastIndexOf('\n\n');
          if (lastDoubleBreak >= 6000) return hardCut.slice(0, lastDoubleBreak);
          const lastBreak = hardCut.lastIndexOf('\n');
          if (lastBreak >= 7000) return hardCut.slice(0, lastBreak);
          return hardCut;
        })();
        analyzedStyle = await analyzeWritingStyleViaApi(combinedText, name);
      } catch {
        onProgress?.(`${name} 말투 분석 실패 (채점은 완료)`, index, total);
      }
    }

    // 3) 병원 프로필 업데이트
    if (totalPostsForHospital > 0 && supabase) {
      const profileData: Record<string, unknown> = {
        hospital_name: name,
        naver_blog_url: urls.join(','),
        crawled_posts_count: totalPostsForHospital,
        last_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (analyzedStyle) {
        profileData.style_profile = analyzedStyle;
        // Phase 2D Tier 2-A: 단락 경계 보존 (DB 저장용 raw sample)
        profileData.raw_sample_text = allContents
          .map((c, idx) => `[글 #${idx + 1}]\n${c}`)
          .join('\n\n')
          .slice(0, 10000);
      }
      await (supabase.from('hospital_style_profiles') as any).upsert(
        profileData,
        { onConflict: 'hospital_name' },
      );
      // Phase 2C: 일괄 재학습 — 해당 병원의 캐시 무효화
      invalidateStyleCache(name);
    }

    onProgress?.(`${name} 완료 (${totalPostsForHospital}개 글${analyzedStyle ? ' + 말투 분석' : ''})`, index, total);
  }

  // ── 순차 처리 (진행 표시 정확도 우선) ──
  for (let i = 0; i < total; i++) {
    const hospital = hospitalUrls[i];
    try {
      // 병원 단위 타임아웃: 5분
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('타임아웃 (5분 초과)')), 300000)
      );
      await Promise.race([processHospital(hospital, i), timeout]);
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 60) || '알 수 없는 오류';
      console.error(`[크롤링] ${hospital.name} 실패:`, msg);
      onProgress?.(`${hospital.name} 실패: ${msg} — 다음 병원으로`, i, total);
    }
    // 병원 간 딜레이 (rate limit 방지)
    if (i < total - 1) await new Promise(r => setTimeout(r, 500));
  }

  onProgress?.('전체 완료!', total, total);
}
