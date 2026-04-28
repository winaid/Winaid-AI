/**
 * 의료광고법 검증 모듈 (의료법 제56조 기반)
 *
 * 블로그, 카드뉴스, 자막 등 모든 콘텐츠 유형에서 재사용 가능.
 * 기존 medicalLawFilter.ts(자동 치환)와 별개로,
 * "위반 감지 + 대체 표현 제안"에 초점을 맞춘 모듈.
 */

import type { SlideData } from '@winaid/blog-core';

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
  /**
   * 엄격한 경계 매칭. true면 키워드 앞뒤가 한글이 아닐 때만 매칭.
   * 예: '완전'에 wordBoundary: true → "완전 무통"(경계 O)은 매칭,
   *     "완전히 새로운"(뒤에 '히') / "완전한 치료"(뒤에 '한') 등은 매칭 안 함.
   * (Day 5 오탐 축소)
   */
  wordBoundary?: boolean;
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
  { keyword: '완전', category: 'guarantee', suggestion: "'충분한'", severity: 'medium', wordBoundary: true },
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
  { keyword: '덤', category: 'price', suggestion: '삭제 권장', severity: 'medium', wordBoundary: true },
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

// ── 오탐 화이트리스트 ──
// 이 구문이 text에 포함되어 있으면 해당 범위의 키워드 매칭을 무시한다.
// (길이를 보존하는 공백 치환으로 indexOf 결과에 영향 없음)
// 주의: high severity 키워드는 여기에 넣지 말 것 — "100% 완치 보장" 같은 건 항상 잡혀야 함.
const WHITELIST_PHRASES: string[] = [
  // "완전" 계열 — "완전히 새로운/다른" 등은 실제로 무해한 표현
  '완전히 새로운', '완전히 다른', '완전히 달라', '완전히 새', '완전히 다',
  '완전히 달', '완전히 바뀐', '완전히 리뉴얼', '완전히 개편',
  // "안전" 계열 — "안전한 환경/공간/진행"은 무해
  '안전하게 진행', '안전한 환경', '안전한 공간', '안전한 마취', '안전한 분위기',
  '안전하게 관리', '안전한 장비',
  // "최신" 계열 — 장비/시설 설명에 자주 쓰임
  '최신 설비', '최신 장비', '최신 시설', '최신 기술', '최신 치료법',
  '최신 연구', '최신 논문',
];

/** 한글 문자 여부 */
function isKoreanChar(ch: string): boolean {
  return /[가-힣]/.test(ch);
}

/**
 * 해당 위치의 매칭이 "단어 경계"에 있는지 확인.
 * 한국어는 띄어쓰기가 불규칙하므로, 엄격한 경계가 아니라
 * "앞뒤가 한글 문자가 아닌 경우(= 공백/문장부호/숫자/경계)"만 경계로 간주.
 * wordBoundary 플래그가 켜진 룰에만 적용.
 */
function hasKoreanWordBoundary(text: string, idx: number, keywordLen: number): boolean {
  const before = idx > 0 ? text[idx - 1] : '';
  const after = idx + keywordLen < text.length ? text[idx + keywordLen] : '';
  return !isKoreanChar(before) && !isKoreanChar(after);
}

/**
 * 텍스트에서 화이트리스트 구문을 공백으로 치환 (길이 보존).
 * 그 안의 키워드는 더 이상 매칭되지 않음.
 */
function maskWhitelistedPhrases(text: string): string {
  let result = text;
  for (const phrase of WHITELIST_PHRASES) {
    if (!result.includes(phrase)) continue;
    result = result.split(phrase).join(' '.repeat(phrase.length));
  }
  return result;
}

// ── 검증 함수 ──

/** 텍스트에서 의료광고법 위반 키워드를 검사한다 (긴 키워드 우선 매칭) */
export function validateMedicalAd(text: string): ViolationResult[] {
  if (!text) return [];
  // 오탐 화이트리스트 구문은 먼저 마스킹 → 그 안의 키워드는 매칭되지 않음
  const sanitized = maskWhitelistedPhrases(text);

  const found: ViolationResult[] = [];
  const matched = new Set<string>();

  // 긴 키워드를 먼저 매칭하여 "부작용이 없" 이 "부작용 없" 과 중복 안 되게
  const sorted = [...MEDICAL_AD_VIOLATIONS].sort((a, b) => b.keyword.length - a.keyword.length);

  for (const rule of sorted) {
    if (matched.has(rule.keyword)) continue;

    const idx = sanitized.indexOf(rule.keyword);
    if (idx === -1) continue;

    // wordBoundary 룰이면 엄격 경계 체크 — "완전히 새로운"은 스킵
    if (rule.wordBoundary) {
      if (!hasKoreanWordBoundary(sanitized, idx, rule.keyword.length)) continue;
    }

    // 부분 문자열 중복 체크 — 이미 더 긴 키워드로 매칭된 부분은 스킵
    const isSubset = [...matched].some(m => m.includes(rule.keyword));
    if (isSubset) continue;

    matched.add(rule.keyword);
    found.push({
      keyword: rule.keyword,
      category: rule.category,
      suggestion: rule.suggestion,
      severity: rule.severity,
    });
  }

  return found;
}

// ── 슬라이드 전 필드 검증 ──

/** 한 필드의 위반 결과 */
export interface SlideFieldViolation {
  /** 접근 경로 (예: "title", "columns[0].items[1]") */
  field: string;
  /** UI에 표시할 한국어 라벨 */
  fieldLabel: string;
  /** 원본 텍스트 */
  text: string;
  /** 해당 필드가 평탄한(단일 문자열) 필드인지 — 원클릭 치환 가능 여부 판단 */
  isFlat: boolean;
  /** 해당 필드의 위반 목록 */
  violations: ViolationResult[];
}

/**
 * SlideData의 모든 텍스트 필드를 일괄 검증.
 * 이전엔 title/subtitle/body만 검사했지만, 실제로는 visualKeyword(이미지 프롬프트),
 * quoteText, columns, questions, steps 등에도 위반이 들어갈 수 있음.
 */
export function validateSlideMedicalAd(slide: SlideData | Partial<SlideData>): SlideFieldViolation[] {
  const results: SlideFieldViolation[] = [];

  const check = (field: string, fieldLabel: string, text: string | undefined, isFlat: boolean) => {
    if (!text || !text.trim()) return;
    const violations = validateMedicalAd(text);
    if (violations.length === 0) return;
    results.push({ field, fieldLabel, text, isFlat, violations });
  };

  // ── 평탄한 단일 문자열 필드 (원클릭 치환 가능) ──
  check('title', '제목', slide.title, true);
  check('subtitle', '부제', slide.subtitle, true);
  check('body', '본문', slide.body, true);
  check('visualKeyword', '이미지 프롬프트', slide.visualKeyword, true);
  check('quoteText', '인용문', slide.quoteText, true);
  check('quoteAuthor', '인용 저자', slide.quoteAuthor, true);
  check('quoteRole', '인용 직함', slide.quoteRole, true);
  check('warningTitle', '주의 제목', slide.warningTitle, true);
  check('beforeLabel', 'Before 라벨', slide.beforeLabel, true);
  check('afterLabel', 'After 라벨', slide.afterLabel, true);
  check('prosLabel', '장점 라벨', slide.prosLabel, true);
  check('consLabel', '단점 라벨', slide.consLabel, true);
  check('badge', '배지', slide.badge, true);

  // ── 문자열 배열 (중첩 — 수동 편집) ──
  slide.checkItems?.forEach((t, i) => check(`checkItems[${i}]`, `체크 항목 ${i + 1}`, t, false));
  slide.compareLabels?.forEach((t, i) => check(`compareLabels[${i}]`, `행 라벨 ${i + 1}`, t, false));
  slide.beforeItems?.forEach((t, i) => check(`beforeItems[${i}]`, `Before 항목 ${i + 1}`, t, false));
  slide.afterItems?.forEach((t, i) => check(`afterItems[${i}]`, `After 항목 ${i + 1}`, t, false));
  slide.pros?.forEach((t, i) => check(`pros[${i}]`, `장점 ${i + 1}`, t, false));
  slide.cons?.forEach((t, i) => check(`cons[${i}]`, `단점 ${i + 1}`, t, false));
  slide.warningItems?.forEach((t, i) => check(`warningItems[${i}]`, `주의 항목 ${i + 1}`, t, false));
  slide.hashtags?.forEach((t, i) => check(`hashtags[${i}]`, `해시태그 ${i + 1}`, t, false));

  // ── 객체 배열 (중첩 — 수동 편집) ──
  slide.columns?.forEach((col, ci) => {
    check(`columns[${ci}].header`, `열 ${ci + 1} 헤더`, col.header, false);
    col.items?.forEach((t, i) => check(`columns[${ci}].items[${i}]`, `열 ${ci + 1} 항목 ${i + 1}`, t, false));
  });
  slide.icons?.forEach((icon, i) => {
    check(`icons[${i}].title`, `아이콘 ${i + 1} 제목`, icon.title, false);
    check(`icons[${i}].desc`, `아이콘 ${i + 1} 설명`, icon.desc, false);
  });
  slide.steps?.forEach((step, i) => {
    check(`steps[${i}].label`, `단계 ${i + 1} 라벨`, step.label, false);
    check(`steps[${i}].desc`, `단계 ${i + 1} 설명`, step.desc, false);
  });
  slide.dataPoints?.forEach((d, i) => {
    check(`dataPoints[${i}].label`, `데이터 ${i + 1} 라벨`, d.label, false);
  });
  slide.questions?.forEach((q, i) => {
    check(`questions[${i}].q`, `Q&A ${i + 1} 질문`, q.q, false);
    check(`questions[${i}].a`, `Q&A ${i + 1} 답변`, q.a, false);
  });
  slide.timelineItems?.forEach((t, i) => {
    check(`timelineItems[${i}].time`, `타임라인 ${i + 1} 시점`, t.time, false);
    check(`timelineItems[${i}].title`, `타임라인 ${i + 1} 제목`, t.title, false);
    check(`timelineItems[${i}].desc`, `타임라인 ${i + 1} 설명`, t.desc, false);
  });
  slide.numberedItems?.forEach((n, i) => {
    // num 필드 — "최초"/"No.1"/"1위" 등 최상급 금지어가 들어갈 가능성이 가장 높음
    check(`numberedItems[${i}].num`, `번호 ${i + 1} 라벨`, n.num, false);
    check(`numberedItems[${i}].title`, `번호 ${i + 1} 제목`, n.title, false);
    check(`numberedItems[${i}].desc`, `번호 ${i + 1} 설명`, n.desc, false);
  });
  slide.priceItems?.forEach((p, i) => {
    check(`priceItems[${i}].name`, `가격 ${i + 1} 이름`, p.name, false);
    check(`priceItems[${i}].note`, `가격 ${i + 1} 비고`, p.note, false);
  });

  return results;
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
