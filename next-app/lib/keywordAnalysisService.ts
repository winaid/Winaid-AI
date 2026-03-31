/**
 * 키워드 분석 서비스 (next-app 이식)
 * - Gemini로 병원 주소 기반 지역 키워드 생성 (수도권 3km / 지방 5km)
 * - /api/naver/keyword-stats로 검색량 + 블로그 발행량 조회
 * - Gemini로 블루오션 키워드 분석 및 추천
 * - ClinicContext 기반 키워드 품질 향상
 */

import type { ClinicContext } from './clinicContextService';

export interface KeywordStat {
  keyword: string;
  monthlySearchVolume: number;
  monthlyPcVolume: number;
  monthlyMobileVolume: number;
  blogPostCount: number;
  saturation?: number;
}

export interface KeywordAnalysisResult {
  stats: KeywordStat[];
  aiRecommendation?: string;
  apiErrors?: string[];
}

export interface KeywordRankResult {
  keyword: string;
  isRanked: boolean;      // 상위 20에 노출 여부
  rank?: number;          // 몇 위인지 (1-based)
  matchedTitle?: string;  // 매칭된 블로그 제목
}

export const MAX_KEYWORDS = 100;

// ── 상위권 체크 ──

/**
 * 키워드별 네이버 블로그 검색 상위 20에 해당 병원 블로그가 있는지 체크 (API 블로그탭 기준)
 * blogIds: 병원의 네이버 블로그 ID 목록 (예: ['x577wqy3', 'ekttwj8518'])
 */
// 지역명 패턴: 동/구/읍/면/리/역 + 일반 지역명
const LOCATION_SUFFIXES = /[동구읍면리역시군]$/;

// 키워드에서 지역명을 제외한 시술/진료 단어만 추출
function extractMedicalTerms(keyword: string): string[] {
  return keyword.split(/\s+/)
    .filter(t => t.length >= 2)
    .filter(t => !LOCATION_SUFFIXES.test(t)); // 지역명 제외
}

// 키워드 관련성 검증: 키워드가 제목에 "연속으로" 포함되어야 매칭
// "불광동 충치치료" → 제목에 "불광동충치치료"가 연속으로 있어야 함
// "불광동 ~~~ 충치치료" 처럼 떨어져 있으면 매칭 실패
function isKeywordRelevant(keyword: string, title: string): boolean {
  const cleanTitle = title
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();

  // 키워드에서 공백 제거 후 연속 포함 체크
  const keywordNoSpace = keyword.replace(/\s+/g, '').toLowerCase();
  if (keywordNoSpace.length < 2) return true;

  return cleanTitle.includes(keywordNoSpace);
}

// 의료광고법 저촉 키워드 필터
const MEDICAL_AD_BANNED_WORDS = [
  // 최상급/비교 표현
  '최고', '최초', '최상', '유일', '1등', '1위', '넘버원', '가장', '독보적', '압도적',
  '최저가', '최저', '최다',
  // 보장/확정 표현
  '보장', '확실', '완치', '100%', '무조건', '반드시', '확정', '절대',
  // 비교 우위
  '가장 잘하는', '제일 잘하는', '최고의',
  // 환자 유인
  '무료시술', '공짜', '무료치료', '할인율',
  // 허위 과장
  '기적', '획기적', '혁신적', '놀라운', '충격', '대박',
  // 전후 비교 유도
  '전후사진', '비포애프터', 'before after',
];

function filterMedicalAdKeywords(keywords: string[]): string[] {
  return keywords.filter(kw => {
    const lower = kw.toLowerCase();
    return !MEDICAL_AD_BANNED_WORDS.some(banned => lower.includes(banned));
  });
}

export async function checkKeywordRankings(
  keywords: string[],
  blogIds: string[],
  onProgress?: (msg: string) => void,
  hospitalName?: string,
): Promise<KeywordRankResult[]> {
  const results: KeywordRankResult[] = [];
  const blogIdSet = new Set(blogIds.map(id => id.toLowerCase()));
  const hospitalNameNorm = hospitalName?.replace(/\s/g, '').toLowerCase() || '';

  // 3개씩 배치 (rate limit 방지)
  for (let i = 0; i < keywords.length; i += 3) {
    const batch = keywords.slice(i, i + 3);
    onProgress?.(`상위권 체크 중... (${Math.min(i + 3, keywords.length)}/${keywords.length})`);

    const batchResults = await Promise.all(
      batch.map(async (keyword): Promise<KeywordRankResult> => {
        try {
          const res = await fetch('/api/naver/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: keyword, display: 30 }),
          });
          if (!res.ok) return { keyword, isRanked: false };

          const data = (await res.json()) as {
            items?: Array<{ link?: string; title?: string; description?: string; bloggername?: string }>;
          };

          const items = data.items || [];
          for (let rank = 0; rank < items.length; rank++) {
            const item = items[rank];
            const link = item.link || '';
            // 블로그 URL에서 blogId 추출 + bloggername 병원명 매칭
            const blogIdMatch = link.match(/blog\.naver\.com\/([^/?#]+)/);
            const bloggerName = (item.bloggername || '').replace(/<[^>]+>/g, '').replace(/\s/g, '').toLowerCase();
            const isBlogIdMatch = blogIdMatch && blogIdSet.has(blogIdMatch[1].toLowerCase());
            const isBloggerNameMatch = hospitalNameNorm.length >= 2 && bloggerName.includes(hospitalNameNorm);
            if (isBlogIdMatch || isBloggerNameMatch) {
              const rawTitle = item.title || '';
              const rawDesc = item.description || '';
              // 키워드가 제목 또는 본문에 연속 포함되어야 매칭
              if (!isKeywordRelevant(keyword, rawTitle) && !isKeywordRelevant(keyword, rawDesc)) continue;
              const cleanTitle = rawTitle
                .replace(/<[^>]+>/g, '')
                .replace(/&[a-z]+;/g, ' ')
                .trim();
              return {
                keyword,
                isRanked: true,
                rank: rank + 1,
                matchedTitle: cleanTitle,
              };
            }
          }
          return { keyword, isRanked: false };
        } catch {
          return { keyword, isRanked: false };
        }
      }),
    );

    results.push(...batchResults);

    // 배치 간 딜레이
    if (i + 3 < keywords.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  onProgress?.(`상위권 체크 완료 (${results.filter(r => r.isRanked).length}개 노출 중)`);
  return results;
}

// ── 수도권 판별 ──

function isMetroArea(address: string): boolean {
  const metroPatterns = [
    /^서울/, /^인천/, /^경기/,
    /안산시/, /부천시/, /고양/, /성남시/, /수원시/, /용인시/,
    /화성시/, /시흥시/, /광명시/, /안양시/, /과천시/, /의왕시/,
    /군포시/, /하남시/, /구리시/, /남양주/, /파주/, /김포/,
  ];
  return metroPatterns.some(p => p.test(address));
}

// ── Gemini 호출 (next-app의 /api/gemini 사용) ──

async function callGeminiForKeywords(prompt: string, options?: { temperature?: number }): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'text',
      temperature: options?.temperature ?? 0.3,
      timeout: 30000,
    }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error || 'Gemini 호출 실패');
  return data.text;
}

// ── ClinicContext → 프롬프트 블록 ──

function buildClinicContextBlock(ctx: ClinicContext | null | undefined): string {
  if (!ctx || ctx.confidence < 0.3) return '';
  const lines: string[] = ['', '[병원 실제 콘텐츠 분석 결과]'];
  if (ctx.actualServices.length > 0) lines.push(`실제 제공 서비스: ${ctx.actualServices.join(', ')}`);
  if (ctx.specialties.length > 0) lines.push(`특화/차별화 진료: ${ctx.specialties.join(', ')}`);
  if (ctx.locationSignals.length > 0) lines.push(`콘텐츠에서 확인된 지역: ${ctx.locationSignals.join(', ')}`);
  lines.push('→ 실제 제공 서비스와 관련된 키워드를 우선 생성하세요.');
  return lines.join('\n');
}

// ── AI 키워드 후보 생성 ──

async function generateKeywordsWithAI(
  hospitalName: string,
  address: string,
  category?: string,
  existingBlogTitles?: string[],
  clinicCtx?: ClinicContext | null,
): Promise<string[]> {
  const radius = isMetroArea(address) ? 3 : 5;

  const existingBlock = existingBlogTitles && existingBlogTitles.length > 0
    ? `\n[이미 작성한 블로그 글 제목 (이 주제들은 이미 다뤘으므로 관련 키워드 우선순위를 낮추세요)]
${existingBlogTitles.map(t => `- ${t}`).join('\n')}
`
    : '';

  const prompt = `네이버 검색창에 사람들이 실제로 타이핑하는 짧은 검색어를 만드세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}
${existingBlock}${buildClinicContextBlock(clinicCtx)}
규칙:
1. 반드시 2단어 조합만 (예: "불당동 치과", "불당동 임플란트")
2. "{지역명} {진료과/시술}" 패턴만 허용
3. 지역명: 주소에서 동/구/읍 추출 + 인근 지하철역
4. 시술: 임플란트, 치아교정, 스케일링, 충치치료, 신경치료, 사랑니, 소아치과, 치아미백, 라미네이트, 틀니
5. 절대 3단어 이상 금지
6. 병원명은 포함하지 않는다
7. "비용", "가격" 관련 키워드는 제외
8. 10개 생성

JSON 배열로만: ["불당동 치과", "불당동 임플란트", ...]`;

  try {
    const result = await callGeminiForKeywords(prompt);
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackKeywordGeneration(address, category);
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((k: unknown) => typeof k === 'string' && (k as string).trim() && (k as string).split(/\s+/).length <= 4).slice(0, 15);
      return filterMedicalAdKeywords(cleaned as string[]).slice(0, 10);
    }
    return fallbackKeywordGeneration(address, category);
  } catch {
    return fallbackKeywordGeneration(address, category);
  }
}

// ── 추가 키워드 생성 (더보기) ──

async function generateMoreKeywordsWithAI(
  hospitalName: string,
  address: string,
  existingKeywords: string[],
  category?: string,
  remainingCount: number = 15,
  clinicCtx?: ClinicContext | null,
): Promise<string[]> {
  const radius = isMetroArea(address) ? 3 : 5;
  const generateCount = Math.min(remainingCount, 15);

  const prompt = `당신은 네이버 블로그 SEO 키워드 전문가입니다.

아래 병원의 주소를 기반으로, 반경 ${radius}km 이내에서 실제 사람들이 네이버에 검색할 법한 지역+진료 키워드를 추가 생성해주세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}

이미 분석한 키워드 (중복 금지):
${existingKeywords.map(k => `- ${k}`).join('\n')}

규칙:
1. 위 키워드와 겹치지 않는 새로운 키워드만 생성
2. 더 구체적인 롱테일 키워드 위주
3. 다양한 카테고리에서 골고루
4. "비용", "가격" 관련 키워드는 절대 포함하지 않는다
5. 정확히 ${generateCount}개 생성
6. 이미 분석한 키워드와 절대 겹치면 안 됩니다!

JSON 배열로만 응답하세요:
["키워드1", "키워드2", ...]`;

  try {
    const result = await callGeminiForKeywords(prompt, { temperature: 0.4 });
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) {
      const existing = new Set(existingKeywords.map(k => k.toLowerCase()));
      return parsed
        .filter((k: unknown) => typeof k === 'string' && (k as string).trim() && !existing.has((k as string).trim().toLowerCase()))
        .slice(0, generateCount);
    }
    return [];
  } catch {
    return [];
  }
}

// ── 폴백: 정적 파싱으로 키워드 생성 ──

function fallbackKeywordGeneration(address: string, category?: string): string[] {
  const locations: string[] = [];
  const guMatch = address.match(/([가-힣]+[구군시])\b/g);
  if (guMatch) {
    for (const gu of guMatch) {
      if (!/^(서울|부산|대구|인천|광주|대전|울산|세종)$/.test(gu)) locations.push(gu);
    }
  }
  const dongMatch = address.match(/([가-힣]+[동읍면])\b/g);
  if (dongMatch) {
    for (const dong of dongMatch) {
      if (dong.length >= 2 && dong.length <= 6) locations.push(dong);
    }
  }
  const terms = category === '치과'
    ? ['치과', '임플란트', '치아교정', '스케일링']
    : ['병원', '진료', '검진'];
  const keywords: string[] = [];
  for (const loc of [...new Set(locations)]) {
    for (const term of terms) keywords.push(`${loc} ${term}`);
  }
  return [...new Set(keywords)].slice(0, 20);
}

// ── 검색량 + 발행량 조회 ──

async function fetchKeywordStats(keywords: string[]): Promise<{ stats: KeywordStat[]; apiErrors?: string[] }> {
  const res = await fetch('/api/naver/keyword-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords }),
  });

  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: '알 수 없는 오류' }))) as { error?: string };
    throw new Error(error.error || `API 오류: ${res.status}`);
  }

  const data = (await res.json()) as { results: KeywordStat[]; apiErrors?: string[] };

  const stats = data.results.map(item => ({
    ...item,
    saturation: item.monthlySearchVolume > 0
      ? Math.round((item.blogPostCount / item.monthlySearchVolume) * 100) / 100
      : 0,
  }));

  return { stats, apiErrors: data.apiErrors };
}

// ── 블루오션 분석 ──

async function analyzeBlueOceanWithAI(hospitalName: string, stats: KeywordStat[]): Promise<string> {
  const dataRows = stats
    .map(s => `${s.keyword} | 검색량: ${s.monthlySearchVolume.toLocaleString()} | 발행량: ${s.blogPostCount.toLocaleString()} | 포화도: ${s.saturation?.toFixed(1)}`)
    .join('\n');

  const prompt = `아래 지역 키워드 데이터를 분석하세요.

${dataRows}

다음 형식으로 간결하게 답하세요:

블루오션 TOP 3 (포화도 낮은 키워드):
1. [키워드] - 한줄 이유
2. [키워드] - 한줄 이유
3. [키워드] - 한줄 이유

레드오션 주의:
- [키워드] (포화도: X)

추천 블로그 제목 3개:
1. [블루오션 키워드 활용 제목]
2. [블루오션 키워드 활용 제목]
3. [블루오션 키워드 활용 제목]

병원명("${hospitalName}")은 제목에 포함하지 마세요. 마크다운 헤딩(###) 사용하지 마세요. 위 형식 그대로만 답하세요.`;

  try {
    return await callGeminiForKeywords(prompt, { temperature: 0.4 });
  } catch {
    return '';
  }
}

// ── 메인 분석 함수 ──

/** 크롤링된 블로그 글 제목 가져오기 (Supabase) */
async function fetchExistingBlogTitles(hospitalName: string): Promise<string[]> {
  try {
    const { supabase } = await import('./supabase');
    if (!supabase) return [];
    const { data } = await supabase
      .from('hospital_crawled_posts')
      .select('title')
      .eq('hospital_name', hospitalName)
      .not('title', 'is', null)
      .order('crawled_at', { ascending: false })
      .limit(30);
    return (data || []).map(d => d.title).filter((t): t is string => !!t && t.length > 5);
  } catch {
    return [];
  }
}

export async function analyzeHospitalKeywords(
  hospitalName: string,
  address: string,
  category?: string,
  onProgress?: (msg: string) => void,
  clinicCtx?: ClinicContext | null,
): Promise<KeywordAnalysisResult> {
  // Step 0: 이미 작성한 블로그 글 제목 가져오기
  onProgress?.('기존 블로그 글 확인 중...');
  const existingTitles = await fetchExistingBlogTitles(hospitalName);
  if (existingTitles.length > 0) {
    onProgress?.(`기존 글 ${existingTitles.length}개 확인 완료. 키워드 생성 중...`);
  } else {
    onProgress?.('근처 지역 키워드 생성 중...');
  }

  // Step 1: AI 씨앗 키워드 생성 (2~3단어 조합)
  const seedKeywords = await generateKeywordsWithAI(hospitalName, address, category, existingTitles, clinicCtx);

  if (seedKeywords.length === 0) {
    throw new Error('키워드를 생성할 수 없습니다.');
  }

  // Step 1.5: 네이버 자동완성으로 확장 (실제 검색어 기반)
  onProgress?.(`${seedKeywords.length}개 씨앗 키워드로 자동완성 확장 중...`);
  const allSuggestions: string[] = [...seedKeywords];
  for (let si = 0; si < seedKeywords.length; si++) {
    try {
      const suggestRes = await fetch('/api/naver/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seedKeywords[si] }),
      });
      if (suggestRes.ok) {
        const suggestData = (await suggestRes.json()) as { suggestions?: string[] };
        const suggestions = (suggestData.suggestions || [])
          .filter((s: string) => s.split(/\s+/).length <= 4); // 4단어 이하만
        allSuggestions.push(...suggestions);
      }
    } catch { /* 자동완성 실패 시 스킵 */ }
    if (si < seedKeywords.length - 1) await new Promise(r => setTimeout(r, 100));
  }

  // 중복 제거 + 의료광고법 필터 + 최대 100개
  const candidates = filterMedicalAdKeywords([...new Set(allSuggestions)]).slice(0, MAX_KEYWORDS);
  onProgress?.(`자동완성 확장 완료: ${candidates.length}개 키워드`);

  // Step 2: 검색량 + 발행량 조회
  onProgress?.(`${candidates.length}개 키워드 검색량 분석 중...`);
  const { stats, apiErrors } = await fetchKeywordStats(candidates);

  if (apiErrors?.length) {
    onProgress?.(`⚠️ 검색량 조회 에러: ${apiErrors[0]}`);
  }

  const filteredStats = stats
    .filter(s => s.monthlySearchVolume >= 10) // 검색량 10 미만 제거
    .filter(s => s.keyword.split(/\s+/).length <= 4) // 5단어 이상 롱테일 제거
    .sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume);

  // Step 3: 블루오션 분석
  const hasData = filteredStats.filter(s => s.monthlySearchVolume > 0);
  let aiRecommendation = '';
  if (hasData.length >= 3) {
    onProgress?.('블루오션 키워드 분석 중...');
    aiRecommendation = await analyzeBlueOceanWithAI(hospitalName, filteredStats);
  } else if (apiErrors?.length) {
    aiRecommendation = `⚠️ 네이버 검색광고 API 오류로 검색량을 조회하지 못했습니다.\n\n**에러 내용:** ${apiErrors[0]}\n\n환경변수를 확인해주세요:\n- NAVER_SEARCHAD_CUSTOMER_ID\n- NAVER_SEARCHAD_API_KEY\n- NAVER_SEARCHAD_SECRET`;
  }

  return { stats: filteredStats, aiRecommendation, apiErrors };
}

// ── 추가 키워드 로드 (더보기) ──

export async function loadMoreKeywords(
  hospitalName: string,
  address: string,
  existingStats: KeywordStat[],
  category?: string,
  onProgress?: (msg: string) => void,
  clinicCtx?: ClinicContext | null,
): Promise<{ stats: KeywordStat[]; apiErrors?: string[]; reachedLimit?: boolean }> {
  const existingKeywords = existingStats.map(s => s.keyword);
  const remaining = MAX_KEYWORDS - existingKeywords.length;

  if (remaining <= 0) {
    return { stats: [], reachedLimit: true };
  }

  const allNewStats: KeywordStat[] = [];
  const allApiErrors: string[] = [];
  const allUsedKeywords = new Set(existingKeywords.map(k => k.toLowerCase()));
  const MAX_ROUNDS = 3;
  const TARGET_COUNT = Math.min(remaining, 15);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const currentExisting = [...existingKeywords, ...allNewStats.map(s => s.keyword)];
    const batchSize = Math.min(remaining - allNewStats.length, 15);
    if (batchSize <= 0) break;

    onProgress?.(round === 0
      ? `추가 키워드 생성 중... (현재 ${existingKeywords.length}개 / 최대 ${MAX_KEYWORDS}개)`
      : `유효 키워드 보충 중... (${allNewStats.length}/${TARGET_COUNT}개 확보)`,
    );
    const moreCandidates = await generateMoreKeywordsWithAI(hospitalName, address, currentExisting, category, batchSize, clinicCtx);
    if (moreCandidates.length === 0) break;

    onProgress?.(`${moreCandidates.length}개 추가 키워드 분석 중...`);
    const { stats, apiErrors } = await fetchKeywordStats(moreCandidates);
    if (apiErrors?.length) allApiErrors.push(...apiErrors);

    const roundStats = stats
      .filter(s => s.monthlySearchVolume >= 10)
      .filter(s => s.keyword.split(/\s+/).length <= 4)
      .filter(s => !allUsedKeywords.has(s.keyword.toLowerCase()));

    for (const s of roundStats) {
      allUsedKeywords.add(s.keyword.toLowerCase());
      allNewStats.push(s);
    }

    if (allNewStats.length >= TARGET_COUNT) break;
  }

  allNewStats.sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume);

  return {
    stats: allNewStats,
    apiErrors: allApiErrors.length > 0 ? allApiErrors : undefined,
    reachedLimit: existingKeywords.length + allNewStats.length >= MAX_KEYWORDS,
  };
}
