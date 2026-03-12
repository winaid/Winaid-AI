/**
 * clinicContextService.ts
 *
 * 병원 홈페이지/블로그 URL에서 실제 콘텐츠를 분석하여
 * 서비스·지역·특화 시그널을 추출하는 독립 서비스.
 *
 * - 기존 크롤러 엔드포인트(/api/crawler, /api/naver/crawl-hospital-blog)만 사용
 * - 기존 geminiClient의 callGemini 래퍼 재사용
 * - 키워드 추천 시스템에서 아직 import하지 않음 (Phase 2에서 연결 예정)
 */

import { callGemini, GEMINI_MODEL, TIMEOUTS } from './geminiClient';

// ─── 타입 정의 ───────────────────────────────────────────

export interface ClinicContext {
  /** 실제 제공 중인 시술/서비스 (예: ["임플란트", "치아교정", "충치치료"]) */
  actualServices: string[];
  /** 특화/차별화 진료 (예: ["디지털 임플란트", "투명교정"]) */
  specialties: string[];
  /** 콘텐츠에서 추출된 지역 시그널 (예: ["분당", "서현역", "정자동"]) */
  locationSignals: string[];
  /** 브랜드/병원명 관련 키워드 (예: ["OO치과", "OO의원"]) */
  brandKeywords: string[];
  /** 반복 등장 용어와 빈도 (예: { "임플란트": 12, "교정": 8 }) */
  recurringTerms: Record<string, number>;
  /** 분석 신뢰도 0~1 (콘텐츠 양·품질 기반) */
  confidence: number;
  /** URL 유형 */
  sourceType: 'homepage' | 'blog' | 'unknown';
}

// ─── 내부 헬퍼 ───────────────────────────────────────────

const API_BASE_URL = (() => {
  try {
    return (import.meta as any).env?.VITE_API_URL || '';
  } catch {
    return '';
  }
})();

const CRAWLER_URL = (() => {
  try {
    return (import.meta as any).env?.VITE_CRAWLER_URL || '';
  } catch {
    return '';
  }
})();

/** 네이버 블로그 URL 여부 판별 */
function isNaverBlogUrl(url: string): boolean {
  return /blog\.naver\.com\/[^/?#]+/i.test(url);
}

/** 콘텐츠 최소 품질 기준 (200자 미만이면 분석 불가로 판단) */
const MIN_CONTENT_LENGTH = 200;

// ─── 크롤링 함수 ─────────────────────────────────────────

/**
 * 네이버 블로그 URL → 여러 글 본문 수집
 * 기존 /api/naver/crawl-hospital-blog 엔드포인트 재사용
 */
async function crawlBlogPosts(blogUrl: string): Promise<string> {
  const baseUrl = CRAWLER_URL || API_BASE_URL;
  const res = await fetch(`${baseUrl}/api/naver/crawl-hospital-blog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogUrl, maxPosts: 5 }),
  });

  if (!res.ok) return '';

  const data = await res.json();
  const posts: { content?: string }[] = data.posts || [];

  return posts
    .map(p => (p.content || '').trim())
    .filter(t => t.length > 30)
    .join('\n\n---\n\n')
    .slice(0, 12000);
}

/**
 * 일반 URL → 단일 페이지 텍스트 추출
 * 기존 /api/crawler 엔드포인트 재사용
 */
async function crawlSinglePage(url: string): Promise<string> {
  const baseUrl = API_BASE_URL;
  const res = await fetch(`${baseUrl}/api/crawler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) return '';

  const data = await res.json();
  return (data.content || '').trim().slice(0, 12000);
}

// ─── Gemini 분석 ─────────────────────────────────────────

/**
 * 크롤링된 텍스트에서 병원 컨텍스트 시그널을 추출
 */
async function extractContextWithAI(
  content: string,
  sourceType: 'homepage' | 'blog' | 'unknown'
): Promise<Omit<ClinicContext, 'confidence' | 'sourceType'> | null> {
  const truncated = content.slice(0, 8000);

  const prompt = `당신은 병원 마케팅 전문가입니다.
아래는 병원 ${sourceType === 'blog' ? '블로그' : '홈페이지'}에서 수집한 실제 콘텐츠입니다.

이 콘텐츠를 분석하여 다음 정보를 추출하세요:

1. actualServices: 이 병원이 실제로 제공하는 시술/서비스 목록 (콘텐츠에 명시된 것만)
2. specialties: 특화 진료/차별화 포인트 (반복적으로 강조되거나 전문성이 드러나는 항목)
3. locationSignals: 언급된 지역명, 역명, 동네명 (예: "강남", "서현역", "분당구")
4. brandKeywords: 병원/의원/클리닉 이름, 브랜드명
5. recurringTerms: 자주 반복되는 핵심 용어와 대략적인 등장 횟수 (상위 10개)

규칙:
- 콘텐츠에 실제로 존재하는 정보만 추출 (추측 금지)
- 시술명은 일반적인 한국어 명칭으로 통일 (예: "implant" → "임플란트")
- locationSignals에는 구/동/역 등 지역 식별 가능한 단어만
- 빈 항목은 빈 배열 [] 또는 빈 객체 {}로 반환

콘텐츠:
${truncated}

JSON으로만 응답하세요:
{
  "actualServices": ["서비스1", "서비스2"],
  "specialties": ["특화1"],
  "locationSignals": ["지역1", "역명1"],
  "brandKeywords": ["브랜드1"],
  "recurringTerms": {"용어1": 5, "용어2": 3}
}`;

  try {
    const result = await callGemini({
      prompt,
      model: GEMINI_MODEL.FLASH,
      responseType: 'json',
      timeout: TIMEOUTS.QUICK_OPERATION,
      temperature: 0.1,
    });

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    return {
      actualServices: Array.isArray(parsed.actualServices) ? parsed.actualServices.filter((s: any) => typeof s === 'string') : [],
      specialties: Array.isArray(parsed.specialties) ? parsed.specialties.filter((s: any) => typeof s === 'string') : [],
      locationSignals: Array.isArray(parsed.locationSignals) ? parsed.locationSignals.filter((s: any) => typeof s === 'string') : [],
      brandKeywords: Array.isArray(parsed.brandKeywords) ? parsed.brandKeywords.filter((s: any) => typeof s === 'string') : [],
      recurringTerms: (parsed.recurringTerms && typeof parsed.recurringTerms === 'object' && !Array.isArray(parsed.recurringTerms))
        ? parsed.recurringTerms
        : {},
    };
  } catch (e) {
    console.warn('[clinicContext] Gemini 분석 실패:', e);
    return null;
  }
}

/**
 * 콘텐츠 양과 추출 결과 품질로 신뢰도 산출
 */
function calculateConfidence(
  contentLength: number,
  context: Omit<ClinicContext, 'confidence' | 'sourceType'>
): number {
  let score = 0;

  // 콘텐츠 양 (최대 0.4)
  if (contentLength >= 5000) score += 0.4;
  else if (contentLength >= 2000) score += 0.3;
  else if (contentLength >= 500) score += 0.2;
  else score += 0.1;

  // 서비스 추출 수 (최대 0.3)
  const serviceCount = context.actualServices.length;
  if (serviceCount >= 5) score += 0.3;
  else if (serviceCount >= 3) score += 0.2;
  else if (serviceCount >= 1) score += 0.1;

  // 지역 시그널 (최대 0.15)
  if (context.locationSignals.length >= 2) score += 0.15;
  else if (context.locationSignals.length >= 1) score += 0.1;

  // 반복 용어 (최대 0.15)
  const termCount = Object.keys(context.recurringTerms).length;
  if (termCount >= 5) score += 0.15;
  else if (termCount >= 2) score += 0.1;

  return Math.min(1, Math.round(score * 100) / 100);
}

// ─── 메인 함수 ───────────────────────────────────────────

/**
 * 병원 홈페이지/블로그 URL을 분석하여 ClinicContext를 반환합니다.
 *
 * - 크롤링 실패, 콘텐츠 부족, AI 분석 실패 시 null 반환 (예외 던지지 않음)
 * - 기존 크롤러 엔드포인트만 사용, 기존 로직 변경 없음
 */
export async function analyzeClinicContent(url: string): Promise<ClinicContext | null> {
  if (!url || typeof url !== 'string') return null;

  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith('http')) return null;

  try {
    // 1. URL 유형 판별
    const isBlog = isNaverBlogUrl(trimmedUrl);
    const sourceType: ClinicContext['sourceType'] = isBlog ? 'blog' : 'unknown';

    // 2. 크롤링 (기존 엔드포인트 사용)
    const content = isBlog
      ? await crawlBlogPosts(trimmedUrl)
      : await crawlSinglePage(trimmedUrl);

    if (!content || content.length < MIN_CONTENT_LENGTH) {
      console.warn(`[clinicContext] 콘텐츠 부족 (${content?.length || 0}자), 분석 스킵`);
      return null;
    }

    // 일반 URL이라도 콘텐츠에 병원/의원/치과 등이 있으면 homepage로 판별
    const detectedType: ClinicContext['sourceType'] = isBlog
      ? 'blog'
      : /병원|의원|치과|클리닉|메디컬/.test(content)
        ? 'homepage'
        : 'unknown';

    // 3. Gemini로 시그널 추출
    const extracted = await extractContextWithAI(content, detectedType);
    if (!extracted) return null;

    // 4. 신뢰도 산출
    const confidence = calculateConfidence(content.length, extracted);

    return {
      ...extracted,
      confidence,
      sourceType: detectedType,
    };
  } catch (e) {
    console.warn('[clinicContext] 분석 실패:', e);
    return null;
  }
}
