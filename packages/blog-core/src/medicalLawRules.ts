/**
 * 의료광고법 공통 규칙 — 모든 프롬프트에서 import해서 사용
 */

/** 의료광고법 금지 표현 목록 (보건소 민원 단골 소재) */
export const FORBIDDEN_EXPRESSIONS = {
  superlative: [
    '극대화', '최고', '최초', '최상', '최첨단', '최선', '최적', '최소', '최대',
    '독보적', '유일한', '탁월한', '혁신적', '획기적', '압도적', '독자적',
    '가장 좋은', '가장 뛰어난', '세계 최초', '국내 유일', '업계 최초',
  ],
  guarantee: [
    '100%', '완벽', '확실', '보장', '완치', '근본 치료', '영구적', '절대',
    '반드시 낫는', '부작용 없는', '부작용 제로', '통증 없는', '무통',
    '성공률', '치료율',
  ],
  comparison: [
    '~보다 우수', '~보다 뛰어난', '타 병원 대비', '업계 최고',
    '가장 좋은 병원', '최고의 기술',
  ],
  inducement: [
    '~하세요', '~받으세요', '~예약하세요', '~추천합니다',
    '~해보세요', '~확인해 보세요', '~해보시는 건',
  ],
  resultClaim: [
    '효과가 뛰어난', '높은 성공률', '예후가 좋다', '효과가 기대된다',
    '전후 사진', '체험기', '추천사',
  ],
} as const;

/** 금지어 → 대체 표현 매핑 */
export const REPLACEMENT_MAP: Record<string, string> = {
  '극대화': '향상',
  '최첨단': '최신',
  '완벽': '꼼꼼한',
  '확실': '~에 도움이 될 수 있습니다',
  '최고': '우수한',
  '혁신적': '새로운 방식의',
  '보장': '~을 기대할 수 있습니다',
  '완치': '증상 개선',
  '효과가 뛰어난': '도움이 될 수 있는',
  '부작용 없이': '개인차가 있을 수 있으며',
  '최고의 기술': '전문적인 진료',
  '통증 없는': '통증을 줄일 수 있는',
  '최소 침습': '부담을 줄인',
  '무통': '불편감을 줄인',
  '최대 효과': '효과를 높인',
};

/** 프롬프트에 삽입할 의료광고법 금지 규칙 텍스트 */
export function getMedicalLawPromptBlock(strictMode: boolean | 'brief' = true): string {
  if (!strictMode) {
    return '의료광고법 준수는 유지하되, "~할 수 있습니다", "~에 도움이 됩니다" 등의 표현을 적극 활용합니다.';
  }
  if (strictMode === 'brief') {
    return `[의료광고법 — 간결 버전]
- "최고/최초/유일/완치/100%/보장" 단정 금지
- "~하세요/~받으세요" 행동 유도 금지
- "전후 비교/체험기" 암시 금지`;
  }
  return `[의료광고법 제56조 — 절대 금지 표현]
- 최상급/과장: ${FORBIDDEN_EXPRESSIONS.superlative.slice(0, 10).join(', ')} 등
- 보장/단정: ${FORBIDDEN_EXPRESSIONS.guarantee.slice(0, 8).join(', ')} 등
- 비교: 타 병원 비교, "~보다 우수" 등
- 행동 유도 명령형: "~하세요", "~받으세요", "~추천합니다" 등
- 효과/결과 주장: "효과가 뛰어난", "높은 성공률", 전후 비교 등
[대신 사용할 표현]
- "효과가 좋다" → "도움이 될 수 있습니다"
- "완치" → "증상 개선을 기대할 수 있습니다"
- "최첨단" → "최신"
- "통증 없는" → "통증을 줄일 수 있는"
- 객관적 정보 전달 + 가능성 표현("~할 수 있습니다") 중심`;
}

/** 생성 결과에서 금지어를 검출하는 함수 (모든 카테고리 포함) */
export function detectForbiddenWords(text: string): { word: string; category: string; replacement?: string }[] {
  const plain = text.replace(/<[^>]+>/g, '');
  const found: { word: string; category: string; replacement?: string }[] = [];
  const categories: [string, readonly string[]][] = [
    ['최상급/과장', FORBIDDEN_EXPRESSIONS.superlative],
    ['보장/단정', FORBIDDEN_EXPRESSIONS.guarantee],
    ['비교', FORBIDDEN_EXPRESSIONS.comparison],
    ['행동 유도', FORBIDDEN_EXPRESSIONS.inducement],
    ['효과 주장', FORBIDDEN_EXPRESSIONS.resultClaim],
  ];
  for (const [category, words] of categories) {
    for (const word of words) {
      // ~로 시작하는 패턴은 접미사 매칭 (예: "~하세요" → "하세요")
      const searchWord = word.startsWith('~') ? word.slice(1) : word;
      if (plain.includes(searchWord)) {
        found.push({ word, category, replacement: REPLACEMENT_MAP[word] });
      }
    }
  }
  return found;
}
