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
  [/완벽(한|하게|히)?/g, '꼼꼼$1'],
  [/확실(한|하게|히)?/g, '체계적$1'],
  [/혁신적(인|으로)?/g, '새로운 방식$1'],
  [/획기적(인|으로)?/g, '효과적$1'],
  [/독보적(인|으로)?/g, '전문적$1'],
  [/탁월(한|하게)?/g, '우수$1'],
  [/압도적(인|으로)?/g, '뛰어난'],
  [/독자적(인|으로)?/g, '고유한'],
  [/완치/g, '호전'],
  [/근본\s?치료/g, '근본적인 관리'],
  [/영구적(인|으로)?/g, '장기적$1'],
  [/100\s?%/g, '높은 비율로'],
  [/가장\s(좋은|뛰어난|우수한)/g, '매우 $1'],
  [/최소\s?침습/g, '부담을 줄인'],
  [/최소\s?통증/g, '불편감을 줄인'],
  [/최대\s?효과/g, '효과를 높인'],
  [/무통\s/g, '불편감을 줄인 '],
  [/부작용\s?(없는|제로|zero)/g, '부작용 위험을 줄인'],
  [/통증\s?없는/g, '불편감을 줄인'],
  [/기적적(인|으로)?/g, '의미 있는$1'],
  [/놀라운/g, '주목할 만한'],
  [/부작용\s?없/g, '부작용 위험을 줄인'],

  // ── 추가 패턴 (E2E 감사에서 누출 확인된 단어) ──
  // '유일한' → '대표적인' / '유일하게' → '차별화되게' (이전 버전의 문법 오류 수정)
  [/유일한/g, '대표적인'],
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
  [/최고(의|로)?/g, '높은 수준$1'],
  [/최상(의|급)?/g, '우수한 수준'],
  [/No\.?\s*1(?!\d)/gi, '많은 분들이 선택하는'],
  [/넘버원/g, '많은 분들이 선택하는'],
  // 한글은 \b가 동작하지 않으므로 lookbehind/lookahead 사용 (11위/21위는 제외)
  [/(?<![0-9])1위(?![0-9])/g, '많은 분들이 선택되는'],
  [/기적(의|같은)/g, '주목할 만한 $1'],
  [/보장합니다/g, '기대할 수 있습니다'],
  [/보장됩니다/g, '기대할 수 있습니다'],
  [/보장하는/g, '기대할 수 있는'],
  [/반드시\s*성공합니다/g, '좋은 결과를 기대할 수 있습니다'],
  [/반드시\s*성공/g, '좋은 결과'],
  [/반드시\s*효과/g, '효과'],
  [/반드시\s*결과/g, '결과'],
  [/무조건/g, '대부분의 경우'],

  // ── 행동 유도(inducement) — 의료광고법 민원 최빈 유형 ──
  // "~하세요" 류는 문맥에 따라 자연스러운 경우가 있으므로, 의료 행위 유도에 한정
  [/예약하세요/g, '예약을 고려해 보실 수 있습니다'],
  [/예약해\s?보세요/g, '예약을 고려해 보실 수 있습니다'],
  [/상담\s?받으세요/g, '상담을 받아보시는 것도 방법입니다'],
  [/검사\s?받으세요/g, '검사를 받아보시는 것을 권합니다'],
  [/치료\s?받으세요/g, '치료를 받아보시는 것을 권합니다'],
  [/시술\s?받으세요/g, '시술을 고려해 보실 수 있습니다'],
  [/내원하세요/g, '내원을 권합니다'],
  [/방문하세요/g, '방문을 권합니다'],
  [/추천합니다/g, '고려해 볼 수 있습니다'],
  [/추천드립니다/g, '고려해 보실 수 있습니다'],
  [/확인해\s?보세요/g, '확인해 보시는 것도 좋습니다'],

  // ── 비교(comparison) — 타 병원 비교 금지 ──
  [/타\s?병원\s?대비/g, '일반적인 경우와 비교하면'],
  [/다른\s?병원보다/g, ''],
  [/타\s?병원보다/g, ''],
  [/업계\s?최고/g, '높은 수준의'],
  [/가장\s?좋은\s?병원/g, '전문적인 병원'],
];

export interface MedicalLawFilterResult {
  filtered: string;
  replacedCount: number;
  foundTerms: string[];
}

/**
 * 의료광고법 금지어를 자동 대체한다.
 * @param text HTML 또는 평문
 */
export function filterMedicalLawViolations(text: string): MedicalLawFilterResult {
  let result = text;
  let replacedCount = 0;
  const foundTerms: string[] = [];

  for (const [pattern, replacement] of MEDICAL_LAW_REPLACEMENTS) {
    const matches = result.match(pattern);
    if (matches && matches.length > 0) {
      foundTerms.push(`${matches[0]}(${matches.length}건)`);
      replacedCount += matches.length;
      result = result.replace(pattern, replacement);
    }
  }

  return { filtered: result, replacedCount, foundTerms };
}

/**
 * AI 티 반복 패턴과 브랜드명 누출을 후처리한다.
 *
 * - "winaid" / "윈에이아이" 문자열이 본문에 섞여 나오는 경우 제거
 *   (랜딩 챗봇이나 시스템 프롬프트에 브랜드명이 포함될 때 모델이 자기 소개로 오해해
 *    본문에 "안녕하세요. 윈에이아이입니다" 같은 문구를 넣는 사례 대응)
 * - "좋습니다" 3회 이상 반복 시 일부를 다른 표현으로 교체해 문체 단조로움 완화
 */
export function filterOutputArtifacts(text: string): string {
  let result = text;

  // 1) 브랜드명 누설 제거 — "안녕하세요. 위나이드(winaid) 입니다" 류 문장 통째로 제거
  result = result.replace(
    /안녕하세요[^.!?\n]*(?:winaid|윈에이아이|위나이드)[^.!?\n]*[.!?]\s*/gi,
    '',
  );
  // 잔여 키워드 제거
  result = result.replace(/\s*\(?(?:winaid|위나이드)\)?\s*/gi, ' ');
  result = result.replace(/윈에이아이/g, '');
  // 공백 정리
  result = result.replace(/[ \t]{2,}/g, ' ');

  // 2) "좋습니다" 3회 이상이면 일부 교체
  const goodMatches = result.match(/좋습니다/g);
  if (goodMatches && goodMatches.length >= 3) {
    let count = 0;
    result = result.replace(/좋습니다/g, (match) => {
      count++;
      if (count === 2) return '바람직합니다';
      if (count === 4) return '도움이 됩니다';
      if (count >= 5) return '권장됩니다';
      return match;
    });
  }

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
