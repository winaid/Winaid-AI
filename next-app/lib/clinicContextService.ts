/**
 * clinicContextService.ts (next-app 이식)
 *
 * 병원 홈페이지/블로그 URL에서 실제 콘텐츠를 분석하여
 * 서비스·지역·특화 시그널을 추출하는 독립 서비스.
 */

export interface ClinicContext {
  actualServices: string[];
  specialties: string[];
  locationSignals: string[];
  brandKeywords: string[];
  recurringTerms: Record<string, number>;
  confidence: number;
  sourceType: 'homepage' | 'blog' | 'unknown';
}

function isNaverBlogUrl(url: string): boolean {
  return /blog\.naver\.com\/[^/?#]+/i.test(url);
}

const MIN_CONTENT_LENGTH = 200;

// ─── 크롤링 함수 ─────────────────────────────────────────

async function crawlBlogPosts(blogUrl: string): Promise<string> {
  const res = await fetch('/api/naver/crawl-hospital-blog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogUrl, maxPosts: 5 }),
  });
  if (!res.ok) return '';

  const data = (await res.json()) as { posts?: { content?: string }[] };
  return (data.posts || [])
    .map(p => (p.content || '').trim())
    .filter(t => t.length > 30)
    .join('\n\n---\n\n')
    .slice(0, 12000);
}

async function crawlSinglePage(url: string): Promise<string> {
  const res = await fetch('/api/crawler', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) return '';

  const data = (await res.json()) as { content?: string };
  return (data.content || '').trim().slice(0, 12000);
}

// ─── Gemini 분석 ─────────────────────────────────────────

async function callGeminiForContext(prompt: string): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'text',
      temperature: 0.1,
      timeout: 30000,
    }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error || 'Gemini 호출 실패');
  return data.text;
}

async function extractContextWithAI(
  content: string,
  sourceType: 'homepage' | 'blog' | 'unknown',
): Promise<Omit<ClinicContext, 'confidence' | 'sourceType'> | null> {
  const truncated = content.slice(0, 8000);

  const prompt = `당신은 병원 마케팅 전문가입니다.
아래는 병원 ${sourceType === 'blog' ? '블로그' : '홈페이지'}에서 수집한 실제 콘텐츠입니다.

이 콘텐츠를 분석하여 다음 정보를 추출하세요:

1. actualServices: 이 병원이 실제로 제공하는 시술/서비스 목록 (콘텐츠에 명시된 것만)
2. specialties: 특화 진료/차별화 포인트 (반복적으로 강조되거나 전문성이 드러나는 항목)
3. locationSignals: 언급된 지역명, 역명, 동네명
4. brandKeywords: 병원/의원/클리닉 이름, 브랜드명
5. recurringTerms: 자주 반복되는 핵심 용어와 대략적인 등장 횟수 (상위 10개)

규칙:
- 콘텐츠에 실제로 존재하는 정보만 추출 (추측 금지)
- 시술명은 일반적인 한국어 명칭으로 통일
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
    const result = await callGeminiForContext(prompt);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      actualServices: Array.isArray(parsed.actualServices) ? parsed.actualServices.filter((s: unknown) => typeof s === 'string') : [],
      specialties: Array.isArray(parsed.specialties) ? parsed.specialties.filter((s: unknown) => typeof s === 'string') : [],
      locationSignals: Array.isArray(parsed.locationSignals) ? parsed.locationSignals.filter((s: unknown) => typeof s === 'string') : [],
      brandKeywords: Array.isArray(parsed.brandKeywords) ? parsed.brandKeywords.filter((s: unknown) => typeof s === 'string') : [],
      recurringTerms: (parsed.recurringTerms && typeof parsed.recurringTerms === 'object' && !Array.isArray(parsed.recurringTerms))
        ? parsed.recurringTerms
        : {},
    };
  } catch {
    return null;
  }
}

function calculateConfidence(
  contentLength: number,
  context: Omit<ClinicContext, 'confidence' | 'sourceType'>,
): number {
  let score = 0;
  if (contentLength >= 5000) score += 0.4;
  else if (contentLength >= 2000) score += 0.3;
  else if (contentLength >= 500) score += 0.2;
  else score += 0.1;

  const serviceCount = context.actualServices.length;
  if (serviceCount >= 5) score += 0.3;
  else if (serviceCount >= 3) score += 0.2;
  else if (serviceCount >= 1) score += 0.1;

  if (context.locationSignals.length >= 2) score += 0.15;
  else if (context.locationSignals.length >= 1) score += 0.1;

  const termCount = Object.keys(context.recurringTerms).length;
  if (termCount >= 5) score += 0.15;
  else if (termCount >= 2) score += 0.1;

  return Math.min(1, Math.round(score * 100) / 100);
}

// ─── 메인 함수 ───────────────────────────────────────────

export async function analyzeClinicContent(
  url: string,
  onProgress?: (msg: string) => void,
): Promise<ClinicContext | null> {
  if (!url || typeof url !== 'string') return null;

  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith('http')) return null;

  try {
    const isBlog = isNaverBlogUrl(trimmedUrl);
    const sourceType: ClinicContext['sourceType'] = isBlog ? 'blog' : 'unknown';

    onProgress?.(isBlog ? '블로그 글 수집 중...' : '홈페이지 분석 중...');

    const content = isBlog
      ? await crawlBlogPosts(trimmedUrl)
      : await crawlSinglePage(trimmedUrl);

    if (!content || content.length < MIN_CONTENT_LENGTH) {
      onProgress?.('콘텐츠가 부족하여 분석을 건너뜁니다.');
      return null;
    }

    const detectedType: ClinicContext['sourceType'] = isBlog
      ? 'blog'
      : /병원|의원|치과|클리닉|메디컬/.test(content)
        ? 'homepage'
        : 'unknown';

    onProgress?.('AI로 병원 정보 분석 중...');
    const extracted = await extractContextWithAI(content, detectedType);
    if (!extracted) return null;

    const confidence = calculateConfidence(content.length, extracted);

    onProgress?.(`분석 완료 (신뢰도 ${Math.round(confidence * 100)}%)`);

    return {
      ...extracted,
      confidence,
      sourceType: detectedType,
    };
  } catch {
    onProgress?.('홈페이지 분석 실패');
    return null;
  }
}
