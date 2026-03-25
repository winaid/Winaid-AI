/**
 * 키워드 분석 서비스 (next-app 이식)
 * - Gemini로 병원 주소 기반 지역 키워드 생성 (수도권 2km / 지방 5km)
 * - /api/naver/keyword-stats로 검색량 + 블로그 발행량 조회
 * - Gemini로 블루오션 키워드 분석 및 추천
 */

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
  isRanked: boolean;      // 상위 10에 노출 여부
  rank?: number;          // 몇 위인지 (1-based)
  matchedTitle?: string;  // 매칭된 블로그 제목
}

export const MAX_KEYWORDS = 100;

// ── 상위권 체크 ──

/**
 * 키워드별 네이버 블로그 검색 상위 10에 해당 병원 블로그가 있는지 체크
 * blogIds: 병원의 네이버 블로그 ID 목록 (예: ['x577wqy3', 'ekttwj8518'])
 */
export async function checkKeywordRankings(
  keywords: string[],
  blogIds: string[],
  onProgress?: (msg: string) => void,
): Promise<KeywordRankResult[]> {
  const results: KeywordRankResult[] = [];
  const blogIdSet = new Set(blogIds.map(id => id.toLowerCase()));

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
            body: JSON.stringify({ query: keyword, display: 10 }),
          });
          if (!res.ok) return { keyword, isRanked: false };

          const data = (await res.json()) as {
            items?: Array<{ link?: string; title?: string; bloggername?: string }>;
          };

          const items = data.items || [];
          for (let rank = 0; rank < items.length; rank++) {
            const item = items[rank];
            const link = item.link || '';
            // 블로그 URL에서 blogId 추출
            const blogIdMatch = link.match(/blog\.naver\.com\/([^/?#]+)/);
            if (blogIdMatch && blogIdSet.has(blogIdMatch[1].toLowerCase())) {
              const cleanTitle = (item.title || '')
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

// ── AI 키워드 후보 생성 ──

async function generateKeywordsWithAI(
  hospitalName: string,
  address: string,
  category?: string,
  existingBlogTitles?: string[],
): Promise<string[]> {
  const radius = isMetroArea(address) ? 2 : 5;

  const existingBlock = existingBlogTitles && existingBlogTitles.length > 0
    ? `\n[이미 작성한 블로그 글 제목 (이 주제들은 이미 다뤘으므로 관련 키워드 우선순위를 낮추세요)]
${existingBlogTitles.map(t => `- ${t}`).join('\n')}
`
    : '';

  const prompt = `당신은 네이버 블로그 SEO 키워드 전문가입니다.

아래 병원의 주소를 기반으로, 반경 ${radius}km 이내에서 실제 사람들이 네이버에 검색할 법한 지역+진료 키워드를 생성해주세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}
탐색 반경: ${radius}km (${radius === 2 ? '수도권 - 좁은 범위로 정밀하게' : '지방 - 넓은 범위로 주변 지역 포함'})
${existingBlock}
규칙:
1. 주소에서 동/구/읍/면 추출
2. 반경 ${radius}km 이내 주요 지하철역 이름 포함
3. 인근 유명 동네/지역명 포함
4. 다양한 치과 관련 키워드를 포함:
   - 시술: 임플란트, 치아교정, 라미네이트, 치아미백, 스케일링, 충치치료, 신경치료, 사랑니발치, 틀니, 브릿지, 크라운, 레진, 인레이
   - 증상: 치통, 잇몸출혈, 잇몸염증, 이갈이, 턱관절, 시린이, 충치, 풍치
   - 대상: 소아치과, 어린이치과
   - 기타: 치과 비용, 치과 가격, 치과 추천, 치과 잘하는곳, 야간진료 치과, 주말진료 치과
5. 키워드 조합: "{지역} {시술/증상/기타}", "{역명} {시술/증상/기타}" 등
6. 병원명은 포함하지 않는다
7. 실제 네이버에서 검색량이 있을 법한 키워드만
8. 정확히 15개 생성

JSON 배열로만 응답하세요:
["키워드1", "키워드2", ...]`;

  try {
    const result = await callGeminiForKeywords(prompt);
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackKeywordGeneration(address, category);
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) {
      return parsed.filter((k: unknown) => typeof k === 'string' && (k as string).trim()).slice(0, 15);
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
): Promise<string[]> {
  const radius = isMetroArea(address) ? 2 : 5;
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
4. 정확히 ${generateCount}개 생성
5. 이미 분석한 키워드와 절대 겹치면 안 됩니다!

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

  const prompt = `당신은 네이버 블로그 SEO 전략 전문가입니다.

아래는 "${hospitalName}"의 지역 키워드별 월간 검색량과 블로그 누적 발행량 데이터입니다.

${dataRows}

위 데이터를 분석해서 다음을 알려주세요:

1. **블루오션 키워드 TOP 3** (검색량 대비 발행량이 적은 키워드)
   - 왜 이 키워드가 좋은지 한 줄 설명
2. **레드오션 주의 키워드** (발행량이 너무 많아 경쟁이 치열한 키워드)
3. **추천 블로그 주제 3개** (블루오션 키워드를 활용한 구체적인 블로그 글 제목)

실무적이고 간결하게 답해주세요. 마크다운 사용 가능.`;

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
): Promise<KeywordAnalysisResult> {
  // Step 0: 이미 작성한 블로그 글 제목 가져오기
  onProgress?.('기존 블로그 글 확인 중...');
  const existingTitles = await fetchExistingBlogTitles(hospitalName);
  if (existingTitles.length > 0) {
    onProgress?.(`기존 글 ${existingTitles.length}개 확인 완료. 키워드 생성 중...`);
  } else {
    onProgress?.('근처 지역 키워드 생성 중...');
  }

  // Step 1: AI 키워드 후보 생성 (기존 글 제목 전달하여 중복 우선순위 낮춤)
  const candidates = await generateKeywordsWithAI(hospitalName, address, category, existingTitles);

  if (candidates.length === 0) {
    throw new Error('키워드를 생성할 수 없습니다.');
  }

  // Step 2: 검색량 + 발행량 조회
  onProgress?.(`${candidates.length}개 키워드 검색량 분석 중...`);
  const { stats, apiErrors } = await fetchKeywordStats(candidates);

  if (apiErrors?.length) {
    onProgress?.(`⚠️ 검색량 조회 에러: ${apiErrors[0]}`);
  }

  const filteredStats = stats
    .filter(s => s.monthlySearchVolume >= 1)
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
    const moreCandidates = await generateMoreKeywordsWithAI(hospitalName, address, currentExisting, category, batchSize);
    if (moreCandidates.length === 0) break;

    onProgress?.(`${moreCandidates.length}개 추가 키워드 분석 중...`);
    const { stats, apiErrors } = await fetchKeywordStats(moreCandidates);
    if (apiErrors?.length) allApiErrors.push(...apiErrors);

    const roundStats = stats
      .filter(s => s.monthlySearchVolume >= 1)
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
