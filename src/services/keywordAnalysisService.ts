/**
 * 키워드 분석 서비스
 * - Gemini로 병원 주소 기반 지역 키워드 생성 (수도권 3km / 지방 5km)
 * - 네이버 검색광고 API로 검색량 + 블로그 발행량 조회
 * - Gemini로 블루오션 키워드 분석 및 추천
 */

import { callGemini, GEMINI_MODEL, TIMEOUTS } from './geminiClient';
import type { ClinicContext } from './clinicContextService';

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

/** 신뢰도 기준: 이 값 미만이면 컨텍스트 무시 */
const MIN_CONTEXT_CONFIDENCE = 0.3;

/**
 * ClinicContext가 유효할 때 프롬프트에 추가할 컨텍스트 블록 생성.
 * confidence가 낮으면 빈 문자열 반환 → 기존 프롬프트와 동일하게 작동.
 */
function buildClinicContextBlock(ctx: ClinicContext | null | undefined): string {
  if (!ctx || ctx.confidence < MIN_CONTEXT_CONFIDENCE) return '';

  const lines: string[] = [];
  lines.push('\n[병원 실제 콘텐츠 분석 결과]');
  lines.push(`분석 신뢰도: ${Math.round(ctx.confidence * 100)}%`);

  if (ctx.actualServices.length > 0) {
    lines.push(`실제 제공 서비스: ${ctx.actualServices.join(', ')}`);
  }
  if (ctx.specialties.length > 0) {
    lines.push(`특화/차별화 진료: ${ctx.specialties.join(', ')}`);
  }
  if (ctx.locationSignals.length > 0) {
    lines.push(`콘텐츠에서 확인된 지역: ${ctx.locationSignals.join(', ')}`);
  }
  const topTerms = Object.entries(ctx.recurringTerms)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([term, count]) => `${term}(${count}회)`)
    .join(', ');
  if (topTerms) {
    lines.push(`자주 언급된 용어: ${topTerms}`);
  }

  // 키워드 생성 지시
  lines.push('');
  lines.push('위 분석 결과를 참고하여 키워드를 생성하세요:');
  lines.push('- 실제 제공 서비스와 관련된 키워드를 우선 생성');
  lines.push('- 특화 진료가 있다면 해당 키워드를 반드시 포함');
  lines.push('- 콘텐츠에서 확인된 지역명이 있으면 해당 지역 조합을 우선');
  lines.push('- 콘텐츠에서 언급되지 않은 서비스 키워드(예: 야간진료, 주말진료 등)는 제외하거나 최소화');
  lines.push('- 단, "미언급 = 미제공"이 절대적이지는 않으므로 완전히 배제하지는 말고 우선순위를 낮출 것');

  return lines.join('\n');
}

/**
 * Gemini로 주소 기반 지역 키워드 후보 생성
 * - 수도권: 반경 2km / 지방: 반경 5km
 * - 실제 사람들이 검색할 법한 조합
 * - clinicContext가 제공되면 실제 서비스/지역 기반으로 키워드 품질 향상
 */
async function generateKeywordsWithAI(
  hospitalName: string,
  address: string,
  category?: string,
  clinicContext?: ClinicContext | null
): Promise<string[]> {
  const radius = isMetroArea(address) ? 3 : 5;
  const contextBlock = buildClinicContextBlock(clinicContext);

  const prompt = `당신은 네이버 블로그 SEO 키워드 전문가입니다.

아래 병원의 주소를 기반으로, 반경 ${radius}km 이내에서 실제 사람들이 네이버에 검색할 법한 지역+진료 키워드를 생성해주세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}
탐색 반경: ${radius}km (${radius === 3 ? '수도권 - 인근 주요 지역까지 포함' : '지방 - 넓은 범위로 주변 지역 포함'})
${contextBlock}
규칙:
1. 주소에서 동/구/읍/면 추출
2. 반경 ${radius}km 이내 주요 지하철역 이름 포함 (예: 마천동 → 마천역, 거여역, 개롱역)
3. 인근 유명 동네/지역명 포함 (예: 마천동 → 송파구, 문정동)
4. 다양한 치과 관련 키워드를 포함 - 임플란트/치아교정만 반복하지 말고 아래 카테고리를 골고루:
   - 시술: 임플란트, 치아교정, 라미네이트, 치아미백, 스케일링, 충치치료, 신경치료, 사랑니발치, 틀니, 브릿지, 크라운, 레진, 인레이
   - 증상: 치통, 잇몸출혈, 잇몸염증, 이갈이, 턱관절, 시린이, 충치, 풍치, 치아통증
   - 대상: 소아치과, 어린이치과, 노인치과
   - 기타: 치과 추천, 치과 잘하는곳, 야간진료 치과, 주말진료 치과, 무통치료
5. 키워드 조합: "{지역} {시술/증상/기타}", "{역명} {시술/증상/기타}" 등
6. 병원명은 포함하지 않는다 (지역+진료 키워드만 생성)
7. "비용", "가격" 관련 키워드는 절대 포함하지 않는다
8. 실제 네이버에서 검색량이 있을 법한 키워드만 (너무 마이너한 건 제외)
9. 정확히 15개 생성, 최대한 다양한 카테고리에서 골고루 선택

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
  remainingCount: number = 15,
  clinicContext?: ClinicContext | null
): Promise<string[]> {
  const radius = isMetroArea(address) ? 3 : 5;
  const generateCount = Math.min(remainingCount, 15);
  const contextBlock = buildClinicContextBlock(clinicContext);

  const prompt = `당신은 네이버 블로그 SEO 키워드 전문가입니다.

아래 병원의 주소를 기반으로, 반경 ${radius}km 이내에서 실제 사람들이 네이버에 검색할 법한 지역+진료 키워드를 추가 생성해주세요.

병원명: ${hospitalName}
주소: ${address}
진료과: ${category || '치과'}
탐색 반경: ${radius}km
${contextBlock}
이미 분석한 키워드 (중복 금지):
${existingKeywords.map(k => `- ${k}`).join('\n')}

규칙:
1. 위 키워드와 겹치지 않는 새로운 키워드만 생성
2. 이미 분석한 키워드들은 검색량이 높은 메인 키워드입니다. 이번에는 그보다 검색량이 낮은 세부/틈새 키워드를 생성하세요.
   - 더 구체적인 롱테일 키워드 위주로 생성 (예: "{지역} {시술} 추천", "{지역} {증상} 치과 추천", "{역명} 야간 {시술}")
   - 세부 시술명, 구체적 증상, 특정 상황 키워드 등 니치한 키워드를 우선
3. 다양한 카테고리에서 골고루 선택:
   - 시술: 임플란트, 치아교정, 라미네이트, 치아미백, 스케일링, 충치치료, 신경치료, 사랑니발치, 틀니, 브릿지, 크라운, 레진, 인레이
   - 증상: 치통, 잇몸출혈, 잇몸염증, 이갈이, 턱관절, 시린이, 충치, 풍치
   - 대상: 소아치과, 어린이치과
   - 기타: 추천, 잘하는곳, 야간진료, 주말진료, 무통치료, 후기
   - 롱테일: "{지역} {시술} 추천", "{지역} {증상} 치과", "{역명} 치과 추천" 등
4-1. "비용", "가격" 관련 키워드는 절대 포함하지 않는다
4. 더 넓은 지역명, 인접 동네, 랜드마크 주변 등도 활용
5. 실제 네이버에서 검색량이 있을 법한 키워드만
6. 정확히 ${generateCount}개 생성
7. 이미 분석한 키워드와 절대 겹치면 안 됩니다!

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
  const keywords: string[] = [];
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
 * 1) Gemini로 지역 키워드 후보 생성 (수도권 3km / 지방 5km)
 * 2) 네이버 API로 검색량 + 발행량 조회
 * 3) Gemini로 블루오션 분석 및 추천
 */
export async function analyzeHospitalKeywords(
  hospitalName: string,
  address: string,
  category?: string,
  onProgress?: (msg: string) => void,
  clinicContext?: ClinicContext | null
): Promise<KeywordAnalysisResult> {
  // Step 1: AI로 키워드 후보 생성
  if (clinicContext && clinicContext.confidence >= MIN_CONTEXT_CONFIDENCE) {
    onProgress?.('병원 콘텐츠 기반 키워드 생성 중...');
  } else {
    onProgress?.('근처 지역 키워드 생성 중...');
  }
  const candidates = await generateKeywordsWithAI(hospitalName, address, category, clinicContext);

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
  // 검색량 내림차순 정렬 (검색량 많은 키워드부터 표시)
  const filteredStats = stats
    .filter(s => s.monthlySearchVolume >= 1)
    .sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume);

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
  onProgress?: (msg: string) => void,
  clinicContext?: ClinicContext | null
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
    const moreCandidates = await generateMoreKeywordsWithAI(hospitalName, address, currentExisting, category, batchSize, clinicContext);

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

  // 검색량 내림차순 정렬 (더보기 결과도 검색량 높은 순)
  allNewStats.sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume);

  const newTotal = existingKeywords.length + allNewStats.length;
  return {
    stats: allNewStats,
    apiErrors: allApiErrors.length > 0 ? allApiErrors : undefined,
    reachedLimit: newTotal >= MAX_KEYWORDS,
  };
}
