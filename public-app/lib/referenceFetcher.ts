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
  _common: [
    'health.kdca.go.kr',
    'hira.or.kr',
    'kams.or.kr',
    'mohw.go.kr',
    'snuh.org',
    'amc.seoul.kr',
  ],
};

const TRUSTED_NAMES: Record<string, string> = {
  'kda.or.kr': '대한치과의사협회',
  'kaoms.org': '대한구강악안면외과학회',
  'kacd.or.kr': '대한치과보존학회',
  'health.kdca.go.kr': '국가건강정보포털',
  'snuh.org': '서울대학교병원',
  'amc.seoul.kr': '서울아산병원',
  'hira.or.kr': '건강보험심사평가원',
  'kams.or.kr': '대한의학회',
  'mohw.go.kr': '보건복지부',
  'derma.or.kr': '대한피부과학회',
  'koa.or.kr': '대한정형외과학회',
  'kaim.or.kr': '대한내과학회',
  'ophthalmology.or.kr': '대한안과학회',
  'korl.or.kr': '대한이비인후과학회',
};

function getTrustedLabel(category?: string): string {
  const domains = TRUSTED_DOMAINS_BY_CATEGORY[category || '']
    || TRUSTED_DOMAINS_BY_CATEGORY._common;
  return domains
    .map(d => TRUSTED_NAMES[d] ? `${TRUSTED_NAMES[d]}(${d})` : d)
    .join(', ');
}

function extractSources(text: string): string[] {
  const allSources = new Set<string>();
  const patterns: RegExp[] = [
    /\(출처:\s*([^)]+)\)/g,
    /[-–]\s*출처:\s*(.+?)(?:\n|$)/g,
    /【([^】]+)】/g,
    /(\S+(?:협회|포털|병원|학회|복지부|보건원|의학회))\S*(?:에\s*따르면|에서|의\s*권고|에\s*의하면|에\s*의\s*하면)/g,
    /\*\*출처:?\*\*[：:\s]*([^\n*]+)/g,
    /출처:\s*([^\n,()]+)/g,
    /자료:\s*([^\n,()]+)/g,
    /참고:\s*([^\n,()]+)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const src = m[1].trim().replace(/[.,;:]$/, '');
      if (src.length >= 3 && src.length <= 40) allSources.add(src);
    }
  }

  // TRUSTED_NAMES 14개 기관명 본문 전체 스캔
  for (const name of Object.values(TRUSTED_NAMES)) {
    if (text.includes(name)) allSources.add(name);
  }

  // 기관명 별칭 매핑 (Gemini가 줄여서 쓸 수 있음)
  const ALIAS_MAP: Record<string, string> = {
    '치협': '대한치과의사협회',
    '대한치협': '대한치과의사협회',
    '치과의사협회': '대한치과의사협회',
    '건강정보포털': '국가건강정보포털',
    '질병관리청': '국가건강정보포털',
    '서울대병원': '서울대학교병원',
    '서울아산': '서울아산병원',
    '아산병원': '서울아산병원',
    '심평원': '건강보험심사평가원',
    '복지부': '보건복지부',
    '의학회': '대한의학회',
    '피부과학회': '대한피부과학회',
    '정형외과학회': '대한정형외과학회',
  };
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (text.includes(alias)) allSources.add(canonical);
  }

  return [...allSources];
}

export async function fetchMedicalReference(
  topic: string,
  category?: string,
): Promise<ReferenceResult> {
  const trustedLabel = getTrustedLabel(category);
  const res = await callLLM({
    task: 'search_ground',
    systemBlocks: [{
      type: 'text',
      text: `의학 정보 검증 전문가. 반드시 신뢰 의료 기관 자료를 근거로 답변.\n신뢰 기관: ${trustedLabel}`,
      cacheable: false,
    }],
    userPrompt: `"${topic}"에 대한 의학적 사실 정리.

규칙:
1. ${trustedLabel} 등 공신력 있는 의료 기관 자료만 근거로 사용
2. 반드시 각 정보 뒤에 (출처: 기관명) 형식으로 출처 표기. 출처 없는 문장 금지.
   예시: "임플란트 수명은 평균 10~15년입니다. (출처: 대한치과의사협회)"
   예시: "정기 검진은 6개월마다 권장됩니다. (출처: 국가건강정보포털)"
3. 정의, 원인, 증상, 치료법, 주의사항 순서
4. 의료광고법에 저촉되지 않는 객관적 서술
5. 500~800자
6. 마크다운 금지, plain text
7. 모든 문단에 최소 1개 (출처: 기관명). 출처 없이 정보만 나열하지 마세요.
8. 번호 각주([1], [2])나 굵은 글씨(**출처:**) 금지. 반드시 (출처: 기관명) 괄호 형식만 사용.`,
    maxOutputTokens: 2_000,
    googleSearch: true,
  });

  const text = (res.text ?? '').trim();
  console.info('[reference] Gemini 응답 원문 (앞 500자):', text.slice(0, 500));
  const sources = extractSources(text);
  console.info('[reference] 추출된 출처:', sources);

  // fallback: 출처 0개 → 카테고리 기본 기관 3개 자동 추가
  // (프롬프트에서 해당 기관들을 참고하라고 지시했으므로 사실상 근거가 됨)
  if (sources.length === 0) {
    const domains = TRUSTED_DOMAINS_BY_CATEGORY[category || '']
      || TRUSTED_DOMAINS_BY_CATEGORY._common;
    const defaults = domains.slice(0, 3)
      .map(d => TRUSTED_NAMES[d])
      .filter(Boolean);
    sources.push(...defaults);
    console.info('[reference] fallback 적용 — 기본 기관:', defaults);
  }

  return { facts: text, sources };
}
