/**
 * searchService — 의료 정보 검색 SOT
 *
 * geminiService.ts와 pressReleaseService.ts에서 중복된
 * searchKDCA, searchHospitalSites, callGeminiWithSearch를 단일화.
 */

import { callGemini, GEMINI_MODEL } from './geminiClient';

// ── 1차 검색: 질병관리청 (KDCA) ──

const KDCA_DOMAINS = ['kdca.go.kr', 'cdc.go.kr', 'nih.go.kr'];

export async function searchKDCA(query: string): Promise<string> {
  try {
    console.info('🔍 [1차 검색] 질병관리청에서 검색 중...', query);

    const result = await callGemini({
      prompt: `질병관리청(KDCA) 공식 웹사이트에서 "${query}"에 대한 정보를 검색하고 요약해주세요.

검색 범위: ${KDCA_DOMAINS.join(', ')}

다음 정보를 우선적으로 찾아주세요:
1. 질환의 정의 및 원인
2. 주요 증상
3. 예방 및 관리 방법
4. 공식 통계 자료 (있는 경우)

신뢰할 수 있는 출처의 정보만 사용하고, 출처를 명시해주세요.`,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      googleSearch: true,
      temperature: 0.3,
      thinkingLevel: 'low',
      timeout: 120000,
    });

    console.info('✅ 질병관리청 검색 완료');
    return typeof result === 'string' ? result : '';
  } catch (error) {
    console.error('❌ 질병관리청 검색 실패:', error);
    return '';
  }
}

// ── 2차 검색: 대학병원 사이트 ──

const HOSPITAL_DOMAINS = [
  'amc.seoul.kr', 'snuh.org', 'severance.healthcare.or.kr',
  'samsunghospital.com', 'cmcseoul.or.kr', 'yuhs.or.kr',
];

export async function searchHospitalSites(query: string, category: string): Promise<string> {
  try {
    console.info('🔍 [2차 검색] 병원 사이트에서 크롤링 중...', query);

    const result = await callGemini({
      prompt: `대학병원 공식 웹사이트에서 "${query}" (${category})에 대한 전문 의료 정보를 검색하고 요약해주세요.

검색 범위: ${HOSPITAL_DOMAINS.join(', ')}

다음 정보를 우선적으로 찾아주세요:
1. 최신 진료 가이드라인
2. 환자를 위한 설명 자료
3. 의료진의 전문 의견
4. 치료 및 관리 방법

⚠️ 의료광고법 준수:
- 치료 효과를 단정하는 표현 금지
- 구체적인 치료 성공률/수치 언급 금지
- "완치", "100% 효과" 등의 표현 금지

신뢰할 수 있는 출처의 정보만 사용하고, 출처를 명시해주세요.`,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      googleSearch: true,
      temperature: 0.3,
      thinkingLevel: 'low',
      timeout: 120000,
    });

    console.info('✅ 병원 사이트 크롤링 완료');
    return typeof result === 'string' ? result : '';
  } catch (error) {
    console.error('❌ 병원 사이트 크롤링 실패:', error);
    return '';
  }
}

// ── 통합 검색: KDCA + 병원 → 프롬프트 보강 ──

export async function callGeminiWithSearch(
  prompt: string,
  options: { responseFormat?: string } = {},
): Promise<any> {
  try {
    const topicMatch = prompt.match(/주제[:\s]*[「『"]?([^」』"\n]+)[」』"]?/);
    const categoryMatch = prompt.match(/진료과[:\s]*([^\n]+)/);
    const topic = topicMatch?.[1]?.trim() || '';
    const category = categoryMatch?.[1]?.trim() || '';

    console.info('🔍 검색 시작:', { topic, category });

    let kdcaInfo = '';
    if (topic) {
      kdcaInfo = await searchKDCA(topic);
    }

    let hospitalInfo = '';
    if (topic && category) {
      hospitalInfo = await searchHospitalSites(topic, category);
    }

    const enrichedPrompt = `${prompt}

[🏥 1차 검색: 질병관리청 공식 정보]
${kdcaInfo || '(검색 결과 없음)'}

[🏥 2차 검색: 대학병원 전문 정보]
${hospitalInfo || '(검색 결과 없음)'}

⚠️ 위 검색 결과를 참고하되, 의료광고법을 반드시 준수하세요.
- 출처가 명확한 정보만 사용
- 치료 효과 단정 금지
- 구체적 수치는 출처와 함께 제시`;

    console.info('🚀 Gemini API 호출 시작 (검색 보강 완료)...');
    const isTextPlain = options.responseFormat === 'text/plain';
    const result = await callGemini({
      prompt: enrichedPrompt,
      model: GEMINI_MODEL.PRO,
      googleSearch: true,
      responseType: isTextPlain ? 'text' : 'json',
      temperature: 0.6,
    });

    return result;
  } catch (error) {
    console.error('❌ callGeminiWithSearch 실패:', error);
    throw error;
  }
}
