/**
 * 한국어 비문 자동 치환 (회귀 차단 3중 중 후처리).
 *
 * 회귀 사례 (2026-05): LLM 응답에 "필요하는", "되어지는" 같은 비문 잔여.
 *  - 형용사를 동사처럼 활용 ("필요하다" 는 형용사 → "-는" 활용 불가)
 *  - 이중 피동 ("되어진다" = "되-" + "-어지-" 중복)
 *
 * 보수적 치환 정책 — false-positive ≈ 0 패턴만:
 *  1. 명백한 형용사 어간 + "하는"/"하던"/"하지" → "한"/"하던"/"하지"
 *     (활용 자체가 비문이라 다른 의미 해석 불가)
 *  2. 이중 피동 "되어진/되어지" → "된/되"
 *
 * <code>/<pre> 안 보존 (의도된 콘텐츠 일 수 있음).
 */

export interface GrammarNormalizeResult {
  html: string;
  replacedCount: number;
  patterns: string[];
}

const PROTECT_RE = /<(code|pre)\b[\s\S]*?<\/\1>/gi;
const PROTECT_TOKEN = ' PROTECT_GRAMMAR_';

/**
 * 형용사 어간 list — 의미상 동사 활용 불가능한 형용사만.
 * 신규 추가 시 false-positive 검증 (그 어간이 동사로도 쓰일 수 있는지) 필수.
 */
const ADJECTIVE_STEMS = [
  '필요', '중요', '안전', '건강', '가능', '충분', '정확', '확실',
  '깨끗', '복잡', '단순', '편안', '신선', '소중', '특별',
] as const;

/**
 * 형용사 + "하" + 동사 활용 어미 패턴 치환.
 * - "필요하는" → "필요한"  (-는다 활용 불가)
 * - "필요하던" → "필요하던"  (사실 OK — 회상 -던 은 형용사 가능)
 * - "필요하지" → "필요하지"  (-지 부정도 OK)
 *
 * 안전 치환 어미만:
 *   "하는" → "한"   (관형형)
 *   "하는다" / "한다고 한다" → "하다"
 * 위 두 어미만 처리. 다른 어미는 false-positive 위험이라 제외.
 */
function buildAdjectiveRules(): Array<[RegExp, string, string]> {
  return ADJECTIVE_STEMS.flatMap((stem) => [
    // "필요하는" → "필요한"
    [new RegExp(`${stem}하는(?![은])`, 'g'), `${stem}한`, `adj_hanun_${stem}`] as [RegExp, string, string],
    // "필요한는" → "필요한" (드물지만 LLM 실수)
    [new RegExp(`${stem}한는(?=\\s|[.,!?))]|$)`, 'g'), `${stem}한`, `adj_hannun_${stem}`] as [RegExp, string, string],
  ]);
}

const ADJECTIVE_RULES = buildAdjectiveRules();

/**
 * 이중 피동 패턴 — 모두 안전 치환 (의미·문맥 변동 0).
 */
const DOUBLE_PASSIVE_RULES: Array<[RegExp, string, string]> = [
  [/되어진다/g, '된다', 'double_passive_eojinda'],
  [/되어지는/g, '되는', 'double_passive_eojineun'],
  [/되어진/g, '된', 'double_passive_eojin'],
  [/되어질/g, '될', 'double_passive_eojil'],
  [/되어졌/g, '됐', 'double_passive_eojyeoss'],
];

/**
 * 흔한 활용 실수 (안전 치환만).
 */
const COMMON_TYPO_RULES: Array<[RegExp, string, string]> = [
  // "안되" + (단어 경계 또는 종결) → "안 돼"
  // [/안되(?=[\s.,!?]|$)/g, '안 돼', 'an_dwae'],  // false-positive 큼 ("안되니까" 등) — 보류
  // "어떻해" → "어떡해" (안 잡힘. 매우 흔한 오타)
  [/어떻해/g, '어떡해', 'eotteohae'],
];

const ALL_RULES = [...ADJECTIVE_RULES, ...DOUBLE_PASSIVE_RULES, ...COMMON_TYPO_RULES];

export function normalizeKoreanGrammar(input: string): GrammarNormalizeResult {
  if (!input) return { html: input, replacedCount: 0, patterns: [] };

  // <code>/<pre> 보존
  const protectedBlocks: string[] = [];
  let out = input.replace(PROTECT_RE, (match) => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(match);
    return `${PROTECT_TOKEN}${idx} `;
  });

  const patterns: string[] = [];
  let replacedCount = 0;

  for (const [pattern, replacement, id] of ALL_RULES) {
    const matches = out.match(pattern);
    if (matches && matches.length > 0) {
      out = out.replace(pattern, replacement);
      patterns.push(`${id}(${matches.length})`);
      replacedCount += matches.length;
    }
  }

  // placeholder 복원
  out = out.replace(/ PROTECT_GRAMMAR_(\d+) /g, (_, idx) => protectedBlocks[parseInt(idx, 10)] ?? '');

  return { html: out, replacedCount, patterns };
}

/**
 * 등록된 형용사 어간 list — 테스트·문서용 export.
 */
export { ADJECTIVE_STEMS };
