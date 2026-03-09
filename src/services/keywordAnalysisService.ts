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
  apiErrors?: string[];
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
4. 다양한 치과 관련 키워드를 포함 - 임플란트/치아교정만 반복하지 말고 아래 카테고리를 골고루:
   - 시술: 임플란트, 치아교정, 라미네이트, 치아미백, 스케일링, 충치치료, 신경치료, 사랑니발치, 틀니, 브릿지, 크라운, 레진, 인레이
   - 증상: 치통, 잇몸출혈, 잇몸염증, 이갈이, 턱관절, 시린이, 충치, 풍치, 치아통증
   - 대상: 소아치과, 어린이치과, 노인치과
   - 기타: 치과 비용, 치과 가격, 치과 추천, 치과 잘하는곳, 야간진료 치과, 주말진료 치과, 무통치료
5. 키워드 조합: "{지역} {시술/증상/기타}", "{역명} {시술/증상/기타}" 등
6. 병원명 자체도 포함
7. 실제 네이버에서 검색량이 있을 법한 키워드만 (너무 마이너한 건 제외)
8. 정확히 15개 생성, 최대한 다양한 카테고리에서 골고루 선택

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
      return parsed.filter((k: any) => typeof k === 'string' && k.trim()).slice(0, 15);
    }
    return [];
  } catch (e) {
    console.error('AI 키워드 생성 실패, fallback 사용:', e);
    return fallbackKeywordGeneration(hospitalName, address, category);
  }
}

/**
 * 추가 키워드 생성 (더보기)
 * 이미 분석한 키워드를 제외하고 새로운 키워드 생성
 * remainingCount: 100개 한도까지 남은 개수 (실제 생성은 15개씩)
 */
async function generateMoreKeywordsWithAI(
  hospitalName: string,
  address: string,
  existingKeywords: string[],
  category?: string,
  remainingCount: number = 15
): Promise<string[]> {
  const radius = isMetroArea(address) ? 2 : 5;
  const generateCount = Math.min(remainingCount, 15);

  const prompt = `당신은 네이버 블로그 SEO 키워드 전문가입니다.

아래 병원의 주소를 기반으로, 반경 ${radius}km 이내에서 실제 사람들이 네이버에 검색할 법한 지역+진료 키워드를 추가 생성해주세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}
탐색 반경: ${radius}km

이미 분석한 키워드 (중복 금지):
${existingKeywords.map(k => `- ${k}`).join('\n')}

규칙:
1. 위 키워드와 겹치지 않는 새로운 키워드만 생성
2. 다양한 카테고리에서 골고루 선택:
   - 시술: 임플란트, 치아교정, 라미네이트, 치아미백, 스케일링, 충치치료, 신경치료, 사랑니발치, 틀니, 브릿지, 크라운, 레진, 인레이
   - 증상: 치통, 잇몸출혈, 잇몸염증, 이갈이, 턱관절, 시린이, 충치, 풍치
   - 대상: 소아치과, 어린이치과
   - 기타: 비용, 가격, 추천, 잘하는곳, 야간진료, 주말진료, 무통치료, 후기
   - 롱테일: "{지역} {시술} 비용", "{지역} {증상} 치과", "{역명} 치과 추천" 등
3. 더 넓은 지역명, 인접 동네, 랜드마크 주변 등도 활용
4. 실제 네이버에서 검색량이 있을 법한 키워드만
5. 정확히 ${generateCount}개 생성
6. 이미 분석한 키워드와 절대 겹치면 안 됩니다!

JSON 배열로만 응답하세요:
["키워드1", "키워드2", ...]`;

  try {
    const result = await callGemini({
      prompt,
      model: GEMINI_MODEL.FLASH,
      responseType: 'json',
      timeout: TIMEOUTS.QUICK_OPERATION,
      temperature: 0.4,
    });

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    if (Array.isArray(parsed)) {
      const existing = new Set(existingKeywords.map(k => k.toLowerCase()));
      return parsed
        .filter((k: any) => typeof k === 'string' && k.trim() && !existing.has(k.trim().toLowerCase()))
        .slice(0, generateCount);
    }
    return [];
  } catch (e) {
    console.error('추가 키워드 생성 실패:', e);
    return [];
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

  // 검색량 1 이상 (데이터가 있는 키워드만 포함, 지역 키워드는 검색량이 낮아도 SEO 가치 있음)
  const filteredStats = stats.filter(s => s.monthlySearchVolume >= 1);

  // Step 3: 블루오션 분석 (검색량 데이터가 있는 키워드만)
  const hasData = filteredStats.filter(s => s.monthlySearchVolume > 0);
  let aiRecommendation = '';
  if (hasData.length >= 3) {
    onProgress?.('블루오션 키워드 분석 중...');
    aiRecommendation = await analyzeBlueOceanWithAI(hospitalName, filteredStats);
  } else if (apiErrors?.length) {
    aiRecommendation = `⚠️ 네이버 검색광고 API 오류로 검색량을 조회하지 못했습니다.\n\n**에러 내용:** ${apiErrors[0]}\n\nCloudflare 환경변수를 확인해주세요:\n- NAVER_SEARCHAD_CUSTOMER_ID\n- NAVER_SEARCHAD_API_KEY\n- NAVER_SEARCHAD_SECRET`;
  }

  return { stats: filteredStats, aiRecommendation, apiErrors };
}

/**
 * 추가 키워드 로드 (더보기)
 * 최대 100개까지 중복 없이 로드
 */
export const MAX_KEYWORDS = 100;

export async function loadMoreKeywords(
  hospitalName: string,
  address: string,
  existingStats: KeywordStat[],
  category?: string,
  onProgress?: (msg: string) => void
): Promise<{ stats: KeywordStat[]; apiErrors?: string[]; reachedLimit?: boolean }> {
  const existingKeywords = existingStats.map(s => s.keyword);
  const remaining = MAX_KEYWORDS - existingKeywords.length;

  if (remaining <= 0) {
    return { stats: [], reachedLimit: true };
  }

  const allNewStats: KeywordStat[] = [];
  const allApiErrors: string[] = [];
  const allUsedKeywords = new Set(existingKeywords.map(k => k.toLowerCase()));
  const MAX_ROUNDS = 3; // 최대 3라운드까지 시도 (검색량 없는 키워드 보충)
  const TARGET_COUNT = Math.min(remaining, 15); // 목표: 15개 유효 키워드

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const currentExisting = [...existingKeywords, ...allNewStats.map(s => s.keyword)];
    const batchSize = Math.min(remaining - allNewStats.length, 15);
    if (batchSize <= 0) break;

    onProgress?.(round === 0
      ? `추가 키워드 생성 중... (현재 ${existingKeywords.length}개 / 최대 ${MAX_KEYWORDS}개)`
      : `유효 키워드 보충 중... (${allNewStats.length}/${TARGET_COUNT}개 확보)`
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

    // 목표 달성하면 중단
    if (allNewStats.length >= TARGET_COUNT) break;
  }

  const newTotal = existingKeywords.length + allNewStats.length;
  return {
    stats: allNewStats,
    apiErrors: allApiErrors.length > 0 ? allApiErrors : undefined,
    reachedLimit: newTotal >= MAX_KEYWORDS,
  };
}
