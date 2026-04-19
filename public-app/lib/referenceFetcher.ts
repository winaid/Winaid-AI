/**
 * 화이트리스트 의료 참고 자료 수집기.
 * Gemini Search Grounding 으로 신뢰 의료 기관 자료만 검색·요약.
 * 블로그 프롬프트에 <reference_material> 블록으로 주입.
 */

import { callLLM } from './llm';

export interface ReferenceResult {
  facts: string;
  sources: string[];
}

const TRUSTED_DOMAINS_BY_CATEGORY: Record<string, string[]> = {
  '치과': [
    'kda.or.kr',           // 대한치과의사협회
    'kaoms.org',           // 대한구강악안면외과학회
    'kacd.or.kr',          // 대한치과보존학회
    'health.kdca.go.kr',
    'snuh.org',
    'amc.seoul.kr',
  ],
  '피부과': [
    'derma.or.kr',         // 대한피부과의사회·학회
    'health.kdca.go.kr',
    'snuh.org',
    'amc.seoul.kr',
  ],
  '정형외과': [
    'koa.or.kr',           // 대한정형외과학회
    'health.kdca.go.kr',
    'snuh.org',
    'amc.seoul.kr',
  ],
  '내과': [
    'kaim.or.kr',          // 대한내과학회
    'health.kdca.go.kr',
    'snuh.org',
  ],
  '안과': [
    'ophthalmology.or.kr', // 대한안과학회
    'health.kdca.go.kr',
    'snuh.org',
    'amc.seoul.kr',
  ],
  '이비인후과': [
    'korl.or.kr',          // 대한이비인후과학회
    'health.kdca.go.kr',
    'snuh.org',
  ],
  _common: [               // fallback (카테고리 미지정/매칭 실패)
    'health.kdca.go.kr',
    'hira.or.kr',
    'kams.or.kr',
    'mohw.go.kr',
    'snuh.org',
    'amc.seoul.kr',
  ],
};

function getTrustedDomains(category?: string): string {
  const domains = TRUSTED_DOMAINS_BY_CATEGORY[category || '']
    || TRUSTED_DOMAINS_BY_CATEGORY._common;
  return domains.join(', ');
}

export async function fetchMedicalReference(
  topic: string,
  category?: string,
): Promise<ReferenceResult> {
  const trustedDomains = getTrustedDomains(category);
  const res = await callLLM({
    task: 'search_ground',
    systemBlocks: [{
      type: 'text',
      text: `의학 정보 검증 전문가. 반드시 신뢰 의료 기관(${trustedDomains}) 자료를 근거로 답변.`,
      cacheable: false,
    }],
    userPrompt: `"${topic}"에 대한 의학적 사실 정리.

규칙:
1. ${trustedDomains} 등 공신력 있는 의료 기관 자료만 근거로 사용
2. 각 정보 뒤에 (출처: 기관명) 표기
3. 정의, 원인, 증상, 치료법, 주의사항 순서
4. 의료광고법에 저촉되지 않는 객관적 서술
5. 500~800자
6. 마크다운 금지, plain text`,
    maxOutputTokens: 2_000,
    googleSearch: true,
  });

  const text = (res.text ?? '').trim();
  const sourceMatches = text.matchAll(/\(출처:\s*([^)]+)\)/g);
  const sources = [...new Set([...sourceMatches].map((m) => m[1].trim()))];
  return { facts: text, sources };
}
