/**
 * 의료광고법 금지어 자동 대체 + 출력 후처리 공통 유틸
 *
 * 기존에 blog/press/clinical 페이지에 중복 복사되어 있던 패턴을 한 곳으로 모은 버전.
 * 새 단어 추가나 패턴 수정은 이 파일에서만 하면 된다.
 */

/** [패턴, 치환어] 배열. 순서는 의도적 — 더 구체적인 패턴을 먼저 둔다. */
const MEDICAL_LAW_REPLACEMENTS: Array<[RegExp, string]> = [
  // ── 기존 패턴 ──
  [/극대화/g, '향상'],
  [/최첨단/g, '최신'],
  // 완벽 + loanword variant (퍼펙트/퍼팩트) + 동의어 (완전무결/흠잡을 데 없는)
  [/완벽(한|하게|히)?/g, '정밀$1'],
  [/완전무결(한|하게)?/g, '꼼꼼$1'],
  [/흠잡을\s?데\s?없는/g, '꼼꼼한'],
  [/퍼[펙팩]트(한|하게)?/g, '정밀$1'],
  [/확실한/g, '체계적인'],
  [/확실하게/g, '체계적으로'],
  [/확실히/g, '체계적으로'],
  [/확실(?=[^한하이])/g, '체계적'],
  [/혁신적인/g, '새로운'],
  [/혁신적으로/g, '새롭게'],
  [/혁신적(?=[^인으])/g, '새로운'],
  [/획기적(인|으로)?/g, '효과적$1'],
  [/독보적(인|으로)?/g, '전문적$1'],
  [/탁월(한|하게)?/g, '우수$1'],
  [/압도적인/g, '뛰어난'],
  [/압도적으로/g, '뛰어나게'],
  [/압도적(?=[^인으])/g, '뛰어난'],
  [/독자적인/g, '고유한'],
  [/독자적으로/g, '고유하게'],
  [/독자적(?=[^인으])/g, '고유한'],
  [/완치/g, '호전'],
  [/근본\s?치료/g, '근본적인 관리'],
  [/영구적(인|으로)?/g, '장기적$1'],
  // 100% / 100퍼 / 백퍼 — 보건복지부 의료광고 심의기준 2024 update 강화
  [/100\s?%/g, '대부분의 경우'],
  [/100\s?퍼\s?센트/g, '대부분의 경우'],
  [/100\s?퍼/g, '대부분의 경우'],
  [/백\s?퍼\s?센트/g, '대부분의 경우'],
  [/백프로/g, '대부분의 경우'],
  [/가장\s(좋은|뛰어난|우수한)/g, '매우 $1'],
  [/최소\s?침습/g, '부담을 줄인'],
  [/최소\s?통증/g, '불편감을 줄인'],
  [/최대\s?효과/g, '효과를 높인'],
  // '무통' — 시술명 ('무통주사', '무통분만') 은 보존, 표현 '무통 시술' / '무통의' 만 매칭
  // (?!주사|분만|마취) lookahead 로 시술명 false positive 차단
  [/무통(?!주사|분만|마취)\s/g, '편안한 '],
  [/부작용\s?(없는|제로|zero)/g, '부담이 적은'],
  [/통증\s?없는/g, '편안한'],
  [/통증\s?제로/g, '편안한'],
  [/기적적인/g, '의미 있는'],
  [/기적적으로/g, '의미 있게'],
  [/기적적(?=[^인으])/g, '의미 있는'],
  [/놀라운/g, '주목할 만한'],
  [/부작용\s?없/g, '부담이 적'],

  // ── 추가 패턴 (E2E 감사에서 누출 확인된 단어) ──
  // '유일한' → '차별화된' / '유일하게' → '차별화되게'
  [/유일한/g, '차별화된'],
  [/유일하게/g, '차별화되게'],
  [/유일히/g, '차별화되게'],
  [/국내\s?유일/g, '선도적인'],
  [/세계\s?유일/g, '선도적인'],
  [/업계\s?유일/g, '앞서가는'],
  [/세계\s?최초/g, '새로운 방식의'],
  // '최초로' 같은 조사 붙은 형태를 먼저 처리 (순서 중요)
  [/국내\s?최초로/g, '처음으로'],
  [/국내\s?최초/g, '선도적인'],
  [/업계\s?최초로/g, '앞서'],
  [/업계\s?최초/g, '앞서가는'],
  // '최고치' (peak) false positive 방지 — '최고' 뒤에 '치' 가 오면 매칭 X
  // 최고 — 조사별 분기 ('최고의' + '의료진' 같은 경우 '신뢰받는' 으로 치환,
  // '신뢰받는의' 같은 broken 조사 회피). '최고치' (peak) 는 lookahead 로 보존.
  [/최고급/g, '신뢰받는'],
  [/최고의(?!치)/g, '신뢰받는'],
  [/최고로(?!치)/g, '뛰어나게'],
  [/최고(?!치|의|로)/g, '뛰어난'],
  [/최상의/g, '검증된'],
  [/최상급/g, '검증된'],
  [/최상(?!의|급)/g, '뛰어난'],
  [/최우수/g, '검증된'],
  [/No\.?\s*1(?!\d)/gi, '많은 분들이 선택하는'],
  [/넘버원/g, '많은 분들이 선택하는'],
  [/넘버\s?1(?!\d)/gi, '많은 분들이 선택하는'],
  // 한글은 \b가 동작하지 않으므로 lookbehind/lookahead 사용 (11위/21위는 제외)
  [/(?<![0-9])1위(?![0-9])/g, '많은 분들이 선택되는'],
  [/기적의/g, '주목할 만한'],
  [/기적\s*같은/g, '주목할 만한'],
  [/보장합니다/g, '도움이 됩니다'],
  [/보장됩니다/g, '도움이 됩니다'],
  [/보장하는/g, '도움이 되는'],
  [/반드시\s*성공합니다/g, '좋은 결과를 기대할 수 있습니다'],
  [/반드시\s*성공/g, '좋은 결과'],
  [/반드시\s*효과/g, '효과'],
  [/반드시\s*결과/g, '결과'],
  [/무조건/g, '대부분의 경우'],

  // ── 행동 유도(inducement) — 의료광고법 민원 최빈 유형 ──
  // 자연스러운 한국어 권유 표현으로 대체. "고려해 보실 수 있습니다" 같은 책임 회피
  // 문체는 어색하므로 회피 — prompt 단계에서 처음부터 안 쓰도록 강조 (PR-Q natural_compliance).
  [/예약하세요/g, '편하게 연락주세요'],
  [/예약해\s?보세요/g, '편하게 연락주세요'],
  [/상담\s?받으세요/g, '상담 도움드려요'],
  [/검사\s?받으세요/g, '검사 도움드려요'],
  [/치료\s?받으세요/g, '치료 도움드려요'],
  [/시술\s?받으세요/g, '시술 도움드려요'],
  // 내원하세요 → 오세요 / 방문하세요 → 방문해 보세요 (이중 치환 회피 — 'edited 편하게 방문하세요' 패턴이
  // 다음 줄의 /방문하세요/ 와 또 매칭되어 '편하게 편하게 방문하세요' 되는 회귀 차단)
  [/내원하세요/g, '편하게 오세요'],
  [/방문하세요/g, '방문해 보세요'],
  [/추천합니다/g, '도움이 될 수 있어요'],
  [/추천드립니다/g, '도움이 되실 거예요'],
  [/확인해\s?보세요/g, '확인해 보시면 좋아요'],

  // ── 비교(comparison) — 타 병원 비교 금지 ──
  [/타\s?병원\s?대비/g, '일반적인 경우와 비교하면'],
  [/다른\s?병원보다/g, '저희는'],
  [/타\s?병원보다/g, '저희는'],
  [/업계\s?최고/g, '높은 수준의'],
  [/가장\s?좋은\s?병원/g, '전문적인 병원'],
];

export interface MedicalLawFilterResult {
  filtered: string;
  replacedCount: number;
  foundTerms: string[];
}

/**
 * HTML 태그 / 속성을 보존하면서 텍스트 노드만 transform 적용.
 *
 * 과거: 정규식이 raw HTML 에 직접 적용 → `<h3>가장 좋은 치과</h3>` 의 헤딩 태그
 * 손상, `<a href="rank-1위">` 의 attribute 안 '1위' 도 mutate.
 *
 * 수정: HTML 태그 (속성 포함) 를 placeholder (\x00<index>\x00) 로 치환 후 텍스트
 * 영역에만 transform 실행 → 다시 placeholder 를 원본 태그로 복원.
 * 외부 의존성 0 (cheerio 등 미사용 — blog-core shared package 부피 최소화).
 *
 * 한계: HTML 주석 (<!-- ... -->) 은 일반 태그처럼 보호. <script>/<style> 의 본문은
 * 텍스트로 매칭됨 — 의료 콘텐츠에선 사용 안 함이라 OK.
 */
function transformTextOnly(input: string, fn: (text: string) => string): string {
  // <...> 매칭. 속성값에 '>' 가 있으면 깨지지만 의료 블로그 HTML 에선 거의 없음.
  // 안전을 위해 attribute 안 ", '" 로 감싸진 '>' 도 보호:
  //   <a href="x>y">  →  href 안 '>' 가 종결자로 잘못 잡힘. 매우 드문 케이스 — accept.
  const TAG_RE = /<[^>]+>|<!--[\s\S]*?-->/g;
  const tags: string[] = [];
  const placeheld = input.replace(TAG_RE, (tag) => {
    tags.push(tag);
    return `\x00${tags.length - 1}\x00`;
  });
  const transformed = fn(placeheld);
  return transformed.replace(/\x00(\d+)\x00/g, (_, n) => tags[parseInt(n, 10)] ?? '');
}

/**
 * 의료광고법 금지어를 자동 대체한다. HTML 태그 / 속성은 보존, 텍스트 노드만 변환.
 * @param text HTML 또는 평문 — 평문은 태그 0건이라 그대로 변환
 */
export function filterMedicalLawViolations(text: string): MedicalLawFilterResult {
  let replacedCount = 0;
  const foundTerms: string[] = [];

  const filtered = transformTextOnly(text, (textOnly) => {
    let result = textOnly;
    for (const [pattern, replacement] of MEDICAL_LAW_REPLACEMENTS) {
      const matches = result.match(pattern);
      if (matches && matches.length > 0) {
        foundTerms.push(`${matches[0]}(${matches.length}건)`);
        replacedCount += matches.length;
        result = result.replace(pattern, replacement);
      }
    }
    return result;
  });

  return { filtered, replacedCount, foundTerms };
}

/**
 * AI 티 반복 패턴, 번역투 표현, 브랜드명 누출을 후처리한다.
 */
export function filterOutputArtifacts(text: string): string {
  let result = text;

  // 1) 브랜드명 누설 제거
  result = result.replace(
    /안녕하세요[^.!?\n]*(?:winaid|윈에이아이|위나이드)[^.!?\n]*[.!?]\s*/gi,
    '',
  );
  result = result.replace(/\s*\(?(?:winaid|위나이드)\)?\s*/gi, ' ');
  result = result.replace(/윈에이아이/g, '');

  // 2) AI 탐지 표현 자동 치환 (번역투 + AI 패턴)
  const AI_REPLACEMENTS: Array<[RegExp, string]> = [
    // 번역투 (Tier 2)
    [/에 해당합니다/g, '입니다'],
    [/에 불과합니다/g, '뿐입니다'],
    [/로 인해\s/g, '때문에 '],
    [/를 통해\s/g, '로 '],
    [/에 기인합니다/g, '때문입니다'],
    [/을 야기합니다/g, '을 일으킵니다'],
    [/하는 것이 중요합니다/g, '해야 합니다'],
    [/에 의해 발생/g, '때문에 생기'],
    // AI 패턴 (Tier 3)
    [/이러한\s/g, '이런 '],
    [/상기\s/g, '위 '],
    [/동일한\s/g, '같은 '],
    [/상술한\s/g, '앞서 말한 '],
    // 접속부사 (Tier 4) — 문장 시작에서만
    [/^또한[,\s]/gm, ''],
    [/^더불어[,\s]/gm, ''],
    [/^아울러[,\s]/gm, ''],
    [/^나아가[,\s]/gm, ''],
    [/^뿐만 아니라[,\s]/gm, ''],
  ];

  for (const [pattern, replacement] of AI_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 3) 같은 어미 3회 연속 감지 + 3번째를 교체
  // ⚠️ '~거든요' 는 자동 교체 후보에서 제외 (의료 콘텐츠 신뢰감 위해 절제).
  //    LLM 이 학습된 말투(learned_style)에 따라 자연 출력하는 것만 허용,
  //    필터가 인위적으로 추가하지 않는다. 프롬프트 규칙: 글 전체 최대 1회.
  const endingPatterns: Array<[RegExp, string[]]> = [
    [/좋습니다/g, ['바람직합니다', '낫습니다', '권장됩니다']],
    [/있습니다/g, ['있어요', '있는 편입니다']],
    [/됩니다/g, ['돼요', '되는 편입니다']],
    [/합니다/g, ['해요', '하는 편입니다']],
  ];

  for (const [pattern, alts] of endingPatterns) {
    const matches = result.match(pattern);
    if (matches && matches.length >= 3) {
      let count = 0;
      result = result.replace(pattern, (match) => {
        count++;
        // 3번째, 6번째, 9번째... 를 교체
        if (count % 3 === 0) return alts[Math.floor(Math.random() * alts.length)];
        return match;
      });
    }
  }

  // 4) 공백 정리
  result = result.replace(/[ \t]{2,}/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * 두 필터를 한 번에 적용하는 편의 함수.
 * 의료법 필터 → 출력 아티팩트 필터 순서로 돌린다.
 */
export function applyContentFilters(text: string): MedicalLawFilterResult {
  const medLaw = filterMedicalLawViolations(text);
  const finalText = filterOutputArtifacts(medLaw.filtered);
  return {
    filtered: finalText,
    replacedCount: medLaw.replacedCount,
    foundTerms: medLaw.foundTerms,
  };
}
