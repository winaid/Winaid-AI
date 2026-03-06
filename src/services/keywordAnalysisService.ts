/**
 * 키워드 분석 서비스
 * - Gemini로 병원 주소 기반 지역 키워드 생성 (수도권 2km / 지방 5km)
 * - 네이버 검색광고 API로 검색량 + 블로그 발행량 조회
 * - Gemini로 블루오션 키워드 분석 및 추천
 */

import { callGemini, GEMINI_MODEL, TIMEOUTS } from './geminiClient';

export interface KeywordStat {
  keyword: string;
  monthlySearchVolume: number;
  monthlyPcVolume: number;
  monthlyMobileVolume: number;
  blogPostCount: number;
  saturation?: number; // 발행량/검색량 비율 (낮을수록 블루오션)
}

export interface KeywordAnalysisResult {
  stats: KeywordStat[];
  aiRecommendation?: string; // Gemini 블루오션 분석 결과
}

/**
 * 수도권 여부 판별
 * 서울, 인천, 경기(시흥, 안산, 부천, 고양, 성남 등) → 수도권
 */
function isMetroArea(address: string): boolean {
  const metroPatterns = [
    /^서울/, /^인천/, /^경기/,
    /안산시/, /부천시/, /고양/, /성남시/, /수원시/, /용인시/,
    /화성시/, /시흥시/, /광명시/, /안양시/, /과천시/, /의왕시/,
    /군포시/, /하남시/, /구리시/, /남양주/, /파주/, /김포/,
    /양주시/, /의정부/, /동두천/, /포천/, /연천/, /가평/,
  ];
  return metroPatterns.some(p => p.test(address));
}

/**
 * Gemini로 주소 기반 지역 키워드 후보 생성
 * - 수도권: 반경 2km / 지방: 반경 5km
 * - 실제 사람들이 검색할 법한 조합
 */
async function generateKeywordsWithAI(
  hospitalName: string,
  address: string,
  category?: string
): Promise<string[]> {
  const radius = isMetroArea(address) ? 2 : 5;

  const prompt = `당신은 네이버 블로그 SEO 키워드 전문가입니다.

아래 병원의 주소를 기반으로, 반경 ${radius}km 이내에서 실제 사람들이 네이버에 검색할 법한 지역+진료 키워드를 생성해주세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}
탐색 반경: ${radius}km (${radius === 2 ? '수도권 - 좁은 범위로 정밀하게' : '지방 - 넓은 범위로 주변 지역 포함'})

규칙:
1. 주소에서 동/구/읍/면 추출
2. 반경 ${radius}km 이내 주요 지하철역 이름 포함 (예: 마천동 → 마천역, 거여역, 개롱역)
3. 인근 유명 동네/지역명 포함 (예: 마천동 → 송파구, 문정동)
4. 키워드 조합: "{지역} 치과", "{지역} 임플란트", "{역명} 치과", "{역명} 임플란트", "{동} 치아교정" 등
5. 병원명 자체도 포함
6. 실제 네이버에서 검색량이 있을 법한 키워드만 (너무 마이너한 건 제외)
7. 최소 15개, 최대 25개

JSON 배열로만 응답하세요. 설명 없이 키워드 문자열 배열만:
["키워드1", "키워드2", ...]`;

  try {
    const result = await callGemini({
      prompt,
      model: GEMINI_MODEL.FLASH,
      responseType: 'json',
      timeout: TIMEOUTS.QUICK_OPERATION,
      temperature: 0.3,
    });

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    if (Array.isArray(parsed)) {
      return parsed.filter((k: any) => typeof k === 'string' && k.trim()).slice(0, 25);
    }
    return [];
  } catch (e) {
    console.error('AI 키워드 생성 실패, fallback 사용:', e);
    return fallbackKeywordGeneration(hospitalName, address, category);
  }
}

/**
 * 폴백: 정적 파싱으로 키워드 생성
 */
function fallbackKeywordGeneration(hospitalName: string, address: string, category?: string): string[] {
  const locations: string[] = [];

  const guMatch = address.match(/([가-힣]+[구군시])\b/g);
  if (guMatch) {
    for (const gu of guMatch) {
      if (!gu.match(/^(서울|부산|대구|인천|광주|대전|울산|세종)$/)) {
        locations.push(gu);
      }
    }
  }

  const dongMatch = address.match(/([가-힣]+[동읍면])\b/g);
  if (dongMatch) {
    for (const dong of dongMatch) {
      if (dong.length >= 2 && dong.length <= 6) locations.push(dong);
    }
  }

  const dentalTerms = ['치과', '임플란트', '치아교정', '스케일링'];
  const keywords = [hospitalName];
  for (const loc of [...new Set(locations)]) {
    for (const term of dentalTerms) {
      keywords.push(`${loc} ${term}`);
    }
  }
  return [...new Set(keywords)].slice(0, 20);
}

/**
 * Gemini로 블루오션 키워드 분석
 */
async function analyzeBlueOceanWithAI(
  hospitalName: string,
  stats: KeywordStat[]
): Promise<string> {
  const dataRows = stats
    .map(s => `${s.keyword} | 검색량: ${s.monthlySearchVolume.toLocaleString()} | 발행량: ${s.blogPostCount.toLocaleString()} | 포화도: ${s.saturation?.toFixed(1)}`)
    .join('\n');

  const prompt = `당신은 네이버 블로그 SEO 전략 전문가입니다.

아래는 "${hospitalName}"의 지역 키워드별 월간 검색량과 블로그 누적 발행량 데이터입니다.

${dataRows}

위 데이터를 분석해서 다음을 알려주세요:

1. **블루오션 키워드 TOP 3** (검색량 대비 발행량이 적은 키워드 = 경쟁이 낮고 기회가 큰 키워드)
   - 왜 이 키워드가 좋은지 한 줄 설명
2. **레드오션 주의 키워드** (발행량이 너무 많아 경쟁이 치열한 키워드)
3. **추천 블로그 주제 3개** (블루오션 키워드를 활용한 구체적인 블로그 글 제목)

실무적이고 간결하게 답해주세요. 마크다운 사용 가능.`;

  try {
    const result = await callGemini({
      prompt,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      timeout: TIMEOUTS.QUICK_OPERATION,
      temperature: 0.4,
    });

    return typeof result === 'string' ? result : String(result);
  } catch (e) {
    console.error('AI 블루오션 분석 실패:', e);
    return '';
  }
}

/**
 * 키워드 검색량 + 블로그 발행량 조회
 */
export async function fetchKeywordStats(keywords: string[]): Promise<{ stats: KeywordStat[]; apiErrors?: string[] }> {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const response = await fetch(`${API_BASE_URL}/api/naver/keyword-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '알 수 없는 오류' }));
    throw new Error((error as any).error || `API 오류: ${response.status}`);
  }

  const data = await response.json() as { results: KeywordStat[]; apiErrors?: string[] };

  if (data.apiErrors?.length) {
    console.warn('[키워드분석] API 에러:', data.apiErrors);
  }

  const stats = data.results.map((item) => ({
    ...item,
    saturation: item.monthlySearchVolume > 0
      ? Math.round((item.blogPostCount / item.monthlySearchVolume) * 100) / 100
      : 0,
  }));

  return { stats, apiErrors: data.apiErrors };
}

/**
 * 병원 주소 기반 키워드 분석 전체 플로우
 *
 * 1) Gemini로 지역 키워드 후보 생성 (수도권 2km / 지방 5km)
 * 2) 네이버 API로 검색량 + 발행량 조회
 * 3) Gemini로 블루오션 분석 및 추천
 */
export async function analyzeHospitalKeywords(
  hospitalName: string,
  address: string,
  category?: string,
  onProgress?: (msg: string) => void
): Promise<KeywordAnalysisResult> {
  // Step 1: AI로 키워드 후보 생성
  onProgress?.('근처 지역 키워드 생성 중...');
  const candidates = await generateKeywordsWithAI(hospitalName, address, category);

  if (candidates.length === 0) {
    throw new Error('키워드를 생성할 수 없습니다.');
  }

  // Step 2: 검색량 + 발행량 조회
  onProgress?.(`${candidates.length}개 키워드 검색량 분석 중...`);
  const { stats, apiErrors } = await fetchKeywordStats(candidates);

  if (apiErrors?.length) {
    console.warn('[키워드분석] 네이버 API 에러:', apiErrors);
    onProgress?.(`⚠️ 검색량 조회 에러: ${apiErrors[0]}`);
  }

  // 검색량 20 이상만 필터링
  const filteredStats = stats.filter(s => s.monthlySearchVolume >= 20);

  // Step 3: 블루오션 분석 (검색량 데이터가 있는 키워드만)
  const hasData = filteredStats.filter(s => s.monthlySearchVolume > 0);
  let aiRecommendation = '';
  if (hasData.length >= 3) {
    onProgress?.('블루오션 키워드 분석 중...');
    aiRecommendation = await analyzeBlueOceanWithAI(hospitalName, filteredStats);
  } else if (apiErrors?.length) {
    aiRecommendation = `⚠️ 네이버 검색광고 API 오류로 검색량을 조회하지 못했습니다.\n\n**에러 내용:** ${apiErrors[0]}\n\nCloudflare 환경변수를 확인해주세요:\n- NAVER_SEARCHAD_CUSTOMER_ID\n- NAVER_SEARCHAD_API_KEY\n- NAVER_SEARCHAD_SECRET`;
  }

  return { stats: filteredStats, aiRecommendation };
}
