/**
 * 의료광고법 검증 모듈 (의료법 제56조 기반)
 *
 * 블로그, 카드뉴스, 자막 등 모든 콘텐츠 유형에서 재사용 가능.
 * 기존 medicalLawFilter.ts(자동 치환)와 별개로,
 * "위반 감지 + 대체 표현 제안"에 초점을 맞춘 모듈.
 */

// ── 타입 ──

export type ViolationCategory =
  | 'superlative'   // 배타적/최상급 표현
  | 'guarantee'     // 효과 보장/단정
  | 'comparison'    // 비교/비방
  | 'exaggeration'  // 과장
  | 'price'         // 가격 관련
  | 'testimonial'   // 치료경험담/후기 유도
  | 'unproven';     // 미검증 시술/효과

export interface ViolationRule {
  keyword: string;
  category: ViolationCategory;
  suggestion: string;
  severity: 'high' | 'medium';
}

export interface ViolationResult {
  keyword: string;
  category: ViolationCategory;
  suggestion: string;
  severity: 'high' | 'medium';
}

// ── 카테고리 한글 라벨 ──

export const CATEGORY_LABELS: Record<ViolationCategory, string> = {
  superlative: '배타적/최상급 표현',
  guarantee: '효과 보장/단정',
  comparison: '비교/비방',
  exaggeration: '과장 표현',
  price: '가격 관련 위반',
  testimonial: '치료경험담/후기',
  unproven: '미검증/무자격',
};

// ── 의료광고법 위반 규칙 (의료법 제56조 제2항 기반) ──

export const MEDICAL_AD_VIOLATIONS: ViolationRule[] = [

  // ── 배타적/최상급 표현 (제56조 제2항 제8호 + 표시광고법) ──
  { keyword: '최고', category: 'superlative', suggestion: "'검증된', '신뢰할 수 있는'", severity: 'high' },
  { keyword: '최대', category: 'superlative', suggestion: "'다양한', '폭넓은'", severity: 'high' },
  { keyword: '최초', category: 'superlative', suggestion: '삭제 권장 (객관적 증명 필요)', severity: 'high' },
  { keyword: '최저', category: 'superlative', suggestion: "'합리적인'", severity: 'high' },
  { keyword: '최신', category: 'superlative', suggestion: "'개선된', '업데이트된'", severity: 'medium' },
  { keyword: '최다', category: 'superlative', suggestion: "'풍부한 경험의'", severity: 'high' },
  { keyword: '최첨단', category: 'superlative', suggestion: "'첨단', '정밀한'", severity: 'high' },
  { keyword: '제일', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '유일', category: 'superlative', suggestion: '삭제 권장 (객관적 증명 필요)', severity: 'high' },
  { keyword: '독보적', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '압도적', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '세계 최초', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '국내 최초', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '업계 최초', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: 'No.1', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '넘버원', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '1위', category: 'superlative', suggestion: '삭제 권장 (공인 통계 출처 필요)', severity: 'high' },
  { keyword: '1등', category: 'superlative', suggestion: '삭제 권장', severity: 'high' },

  // ── 효과 보장/단정 (시행령 제23조 제2호) ──
  { keyword: '보장', category: 'guarantee', suggestion: "'기대할 수 있습니다'", severity: 'high' },
  { keyword: '보증', category: 'guarantee', suggestion: "'기대할 수 있습니다'", severity: 'high' },
  { keyword: '확실', category: 'guarantee', suggestion: "'신뢰할 수 있는'", severity: 'high' },
  { keyword: '확실한 효과', category: 'guarantee', suggestion: "'긍정적인 결과를 기대할 수 있는'", severity: 'high' },
  { keyword: '반드시', category: 'guarantee', suggestion: "'대부분의 경우'", severity: 'high' },
  { keyword: '100%', category: 'guarantee', suggestion: "'높은 성공률'", severity: 'high' },
  { keyword: '완벽', category: 'guarantee', suggestion: "'정밀한', '세밀한'", severity: 'high' },
  { keyword: '완치', category: 'guarantee', suggestion: "'치료', '개선'", severity: 'high' },
  { keyword: '완전', category: 'guarantee', suggestion: "'충분한'", severity: 'medium' },
  { keyword: '완벽해결', category: 'guarantee', suggestion: "'효과적인 치료'", severity: 'high' },
  { keyword: '근본적 해결', category: 'guarantee', suggestion: "'근본적인 치료를 목표로'", severity: 'medium' },
  { keyword: '확실히 낫', category: 'guarantee', suggestion: "'개선을 기대할 수 있'", severity: 'high' },
  { keyword: '틀림없', category: 'guarantee', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '장담', category: 'guarantee', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '약속', category: 'guarantee', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '책임지', category: 'guarantee', suggestion: '삭제 권장', severity: 'medium' },

  // ── 과장 표현 (제56조 제2항 제8호) ──
  { keyword: '혁신적', category: 'exaggeration', suggestion: "'개선된'", severity: 'medium' },
  { keyword: '획기적', category: 'exaggeration', suggestion: "'효과적인'", severity: 'medium' },
  { keyword: '기적', category: 'exaggeration', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '마법', category: 'exaggeration', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '놀라운', category: 'exaggeration', suggestion: "'긍정적인'", severity: 'medium' },
  { keyword: '놀랄만한', category: 'exaggeration', suggestion: "'긍정적인'", severity: 'medium' },
  { keyword: '경이로운', category: 'exaggeration', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '드라마틱', category: 'exaggeration', suggestion: "'효과적인'", severity: 'medium' },
  { keyword: '즉각적', category: 'exaggeration', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '즉시 효과', category: 'exaggeration', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '바로 효과', category: 'exaggeration', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '하루 만에', category: 'exaggeration', suggestion: '삭제 권장 (객관적 근거 필요)', severity: 'high' },
  { keyword: '단 한 번', category: 'exaggeration', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '한 번에', category: 'exaggeration', suggestion: '삭제 권장 (객관적 근거 필요)', severity: 'medium' },

  // ── 부작용/통증 부정 ──
  { keyword: '부작용 없', category: 'guarantee', suggestion: "'부작용을 최소화한'", severity: 'high' },
  { keyword: '부작용이 없', category: 'guarantee', suggestion: "'부작용을 최소화한'", severity: 'high' },
  { keyword: '통증 없', category: 'guarantee', suggestion: "'통증을 최소화한'", severity: 'high' },
  { keyword: '통증이 없', category: 'guarantee', suggestion: "'통증을 최소화한'", severity: 'high' },
  { keyword: '무통', category: 'guarantee', suggestion: "'통증 최소화'", severity: 'high' },
  { keyword: '안 아프', category: 'guarantee', suggestion: "'통증을 최소화한'", severity: 'medium' },
  { keyword: '안 아픈', category: 'guarantee', suggestion: "'통증을 최소화한'", severity: 'medium' },
  { keyword: '전혀 아프지', category: 'guarantee', suggestion: "'통증을 최소화한'", severity: 'high' },
  { keyword: '출혈 없', category: 'guarantee', suggestion: "'출혈을 최소화한'", severity: 'high' },
  { keyword: '흉터 없', category: 'guarantee', suggestion: "'흉터를 최소화한'", severity: 'high' },
  { keyword: '안전한 시술', category: 'guarantee', suggestion: "'안전성을 고려한 시술'", severity: 'medium' },
  { keyword: '안전합니다', category: 'guarantee', suggestion: "'안전성을 고려하여 진행합니다'", severity: 'medium' },
  { keyword: '위험 없', category: 'guarantee', suggestion: "'위험을 최소화한'", severity: 'high' },
  { keyword: '후유증 없', category: 'guarantee', suggestion: "'후유증을 최소화한'", severity: 'high' },

  // ── 비교/비방 (제56조 제2항 제5호) ──
  { keyword: '타 병원', category: 'comparison', suggestion: '삭제 권장 (비교광고 금지)', severity: 'high' },
  { keyword: '다른 병원', category: 'comparison', suggestion: '삭제 권장 (비교광고 금지)', severity: 'high' },
  { keyword: '다른 치과', category: 'comparison', suggestion: '삭제 권장 (비교광고 금지)', severity: 'high' },
  { keyword: '타 치과', category: 'comparison', suggestion: '삭제 권장 (비교광고 금지)', severity: 'high' },
  { keyword: '일반 치과', category: 'comparison', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '보다 우수', category: 'comparison', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '보다 뛰어', category: 'comparison', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '수술 없이', category: 'comparison', suggestion: "'비수술적 방법으로'", severity: 'medium' },
  { keyword: '발치 없이', category: 'comparison', suggestion: "'발치를 최소화하는'", severity: 'medium' },

  // ── 가격 관련 (제56조 제2항 제13호) ──
  { keyword: '최저가', category: 'price', suggestion: "'합리적인 비용'", severity: 'high' },
  { keyword: '최저 비용', category: 'price', suggestion: "'합리적인 비용'", severity: 'high' },
  { keyword: '파격 할인', category: 'price', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '특가', category: 'price', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '무료 시술', category: 'price', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '공짜', category: 'price', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '0원', category: 'price', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '덤', category: 'price', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '할인', category: 'price', suggestion: '삭제 권장 (비급여 할인광고 제한)', severity: 'medium' },
  { keyword: '이벤트 가격', category: 'price', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '% 할인', category: 'price', suggestion: '삭제 권장', severity: 'medium' },
  { keyword: '프로모션', category: 'price', suggestion: '삭제 권장', severity: 'medium' },

  // ── 치료경험담/후기 유도 (제56조 제2항 제2호) ──
  { keyword: '후기', category: 'testimonial', suggestion: '삭제 권장 (치료경험담 광고 금지)', severity: 'medium' },
  { keyword: '생생 후기', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '환자 후기', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '치료 후기', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '체험담', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '솔직 후기', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '리얼 후기', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '수술 후기', category: 'testimonial', suggestion: '삭제 권장', severity: 'high' },

  // ── 미검증/무자격 (제56조 제2항 제1호, 제9호) ──
  { keyword: '특효', category: 'unproven', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '만병통치', category: 'unproven', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '명의', category: 'unproven', suggestion: '삭제 권장 (법적 근거 없는 명칭)', severity: 'high' },
  { keyword: '명의가', category: 'unproven', suggestion: '삭제 권장', severity: 'high' },
  { keyword: '전문의', category: 'unproven', suggestion: '전문의 표기는 해당 전문의 자격 보유 시에만 가능', severity: 'medium' },
  { keyword: '베스트 닥터', category: 'unproven', suggestion: '삭제 권장 (법적 근거 없는 명칭)', severity: 'high' },
  { keyword: '수상', category: 'unproven', suggestion: '삭제 권장 (상장/감사장 이용 광고 금지)', severity: 'medium' },
  { keyword: '선정', category: 'unproven', suggestion: '삭제 권장 (인증/보증 표현 제한)', severity: 'medium' },
  { keyword: '인증', category: 'unproven', suggestion: '공인기관 인증만 표시 가능', severity: 'medium' },
];

// ── 검증 함수 ──

/** 텍스트에서 의료광고법 위반 키워드를 검사한다 (긴 키워드 우선 매칭) */
export function validateMedicalAd(text: string): ViolationResult[] {
  const found: ViolationResult[] = [];
  const matched = new Set<string>();

  // 긴 키워드를 먼저 매칭하여 "부작용이 없" 이 "부작용 없" 과 중복 안 되게
  const sorted = [...MEDICAL_AD_VIOLATIONS].sort((a, b) => b.keyword.length - a.keyword.length);

  for (const rule of sorted) {
    if (text.includes(rule.keyword) && !matched.has(rule.keyword)) {
      // 부분 문자열 중복 체크 — 이미 더 긴 키워드로 매칭된 부분은 스킵
      const isSubset = [...matched].some(m => m.includes(rule.keyword));
      if (!isSubset) {
        matched.add(rule.keyword);
        found.push({
          keyword: rule.keyword,
          category: rule.category,
          suggestion: rule.suggestion,
          severity: rule.severity,
        });
      }
    }
  }

  return found;
}

/** 위반 결과에서 severity별 카운트 집계 */
export function countViolations(violations: ViolationResult[]): { high: number; medium: number } {
  let high = 0;
  let medium = 0;
  for (const v of violations) {
    if (v.severity === 'high') high++;
    else medium++;
  }
  return { high, medium };
}
