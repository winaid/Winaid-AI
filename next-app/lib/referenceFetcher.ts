/**
 * 화이트리스트 의료 참고 자료 수집기.
 * Gemini Search Grounding 으로 신뢰 의료 기관 자료만 검색·요약.
 * 블로그 프롬프트에 [참고 의학 자료] 섹션으로 주입.
 */

import { callLLM } from './llm';

export interface ReferenceResult {
  facts: string;
  sources: string[];
}

const TRUSTED_DOMAINS = [
  'kda.or.kr',               // 대한치과의사협회
  'health.kdca.go.kr',       // 국가건강정보포털
  'snuh.org',                // 서울대학교병원
  'amc.seoul.kr',            // 서울아산병원
  'hira.or.kr',              // 건강보험심사평가원
  'kams.or.kr',              // 대한의학회
  'mohw.go.kr',              // 보건복지부
].join(', ');

export async function fetchMedicalReference(topic: string): Promise<ReferenceResult> {
  const res = await callLLM({
    task: 'search_ground',
    systemBlocks: [{
      type: 'text',
      text: `의학 정보 검증 전문가. 반드시 신뢰 의료 기관(${TRUSTED_DOMAINS}) 자료를 근거로 답변.`,
      cacheable: false,
    }],
    userPrompt: `"${topic}"에 대한 의학적 사실 정리.

규칙:
1. 대한치과의사협회, 국가건강정보포털, 서울대병원 등 공신력 있는 의료 기관 자료만 근거
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
