/**
 * LLM PII 마스킹 모듈 — ADR-1 (`docs/decisions/PII_MASKING_POLICY.md`) Option B+C 채택본.
 *
 * 목적: 외부 LLM(Anthropic / Google Gemini / OpenAI / Google STT)으로 사용자 입력을
 * 전송하기 전, 환자명·주민번호·전화·이메일·주소·차트번호 등 식별 정보를 결정적
 * 토큰으로 치환한다. LLM 응답을 사용자에게 돌려주기 전에 동일 토큰을 원복한다.
 *
 * 설계 원칙:
 * 1. **의료 컨텍스트 보존이 최우선**. false negative(못 가린 PII) 보다 false positive
 *    (의료 용어를 PII 로 오인) 가 더 위험하다 — 출력 품질 회귀가 곧 사용자 이탈.
 *    => 호칭/컨텍스트가 명확한 패턴(`환자 ○○○님`, `차트번호 ○○○`)만 가린다.
 *    => 의약품/시술/해부학/장비명은 사전 보호 어휘로 명시적 보존.
 * 2. **결정적 치환**. 같은 입력 텍스트 안에서 같은 원본 값은 같은 토큰으로
 *    치환된다 (Map 1대1). 토큰은 `[CATEGORY_N]` 형식 — Gemini/Claude 의 attention
 *    boundary 를 깨지 않도록 envelope tag 모양은 피한다.
 * 3. **라운드트립 보존**. `unmaskPII(maskPII(x).masked, replacements) === x`
 *    가 가능한 한 성립해야 한다 (의료 컨텍스트의 환자 식별 정보가 LLM 응답에
 *    그대로 인용될 때 사용자 화면에 원복).
 * 4. **옵트인 4단계** (`PIIMaskingLevel`):
 *    - `none`: 마스킹 안 함 (개발/디버그 전용)
 *    - `minimal`: 주민번호 + 전화 + 이메일만 (구조적·고위험 식별자)
 *    - `standard` (default): minimal + 환자명(호칭 컨텍스트) + 차트번호
 *    - `aggressive`: standard + 주소 + 광범위 인명 후보
 *
 * 한계:
 * - 100% 마스킹은 불가능. 호칭 없는 인명, 별명, 외국어 표기, 음성→텍스트 후
 *   왜곡된 발음 표기 등은 우회 가능. 이는 처리방침/동의 흐름(별도 PR)으로 보완.
 * - 의약품/시술명 사전은 일부 유명 항목만 포함 — 모르는 의료 용어는 마스킹
 *   하지 않는 편(false positive 회피)을 보수적으로 선택.
 *
 * 참고: `docs/audits/blog/_findings_BL-B.md` BL-B-014, `docs/PII_INVENTORY.md` 14번.
 */

export type PIIMaskingLevel = 'none' | 'minimal' | 'standard' | 'aggressive';

export interface MaskResult {
  /** 마스킹된 텍스트 — LLM 입력으로 사용 */
  masked: string;
  /** 토큰 → 원본 매핑. 결정적·1대1. unmaskPII 에 그대로 전달 */
  replacements: Map<string, string>;
}

/**
 * 일반 명사 화이트리스트 — "○○○ 환자(분)" 패턴이 인명이 아닌 일반 명사를
 * 잡는 false positive 를 차단한다. (예: "남성 환자", "여성 환자", "고령 환자")
 * 이 목록의 단어는 인명 후보로 매칭되더라도 마스킹하지 않는다.
 *
 * 보수적: 명백히 인명이 아닌 단어만 추가 — 모르면 빼는 편이 안전.
 */
const NON_NAME_NOUNS = new Set<string>([
  '남성', '여성', '고령', '청년', '소아', '성인', '노인',
  '내원', '재내', '신환', '구환', '본인', '당사자',
  '이전', '기존', '신규', '현재', '최근', '과거',
  '해당', '동일', '담당', '상담', '진료', '치료',
  '대상', '예약', '검진',
]);

/**
 * 의료 컨텍스트 보호 사전 — 한국 의료 도메인에서 인명/주소 정규식과 충돌하기 쉬운
 * 의약품/시술/장비/해부학/직책 명칭. 보수적으로(유명 항목만) 유지.
 *
 * 사용처: 인명 후보가 매칭되었을 때, 그 토큰이 이 사전에 있으면 PII 가 아닌
 * 의료 용어로 판단해 보존한다.
 *
 * 모르는 용어는 추가하지 않는 편이 안전 — false positive 가 false negative 보다 위험.
 */
const MEDICAL_VOCABULARY = new Set<string>([
  // 시술/장비/제품 (피부과·치과·정형외과)
  '울쎄라', '써마지', '인모드', '슈링크', '올리지오', '쥬비덤', '레스틸렌',
  '쥬베룩', '리쥬란', '엑소좀', '필러', '보톡스', '피코', '프락셀',
  '엔디야그', '레이저', '아쿠아필', '더마펜', '임플란트', '지르코니아',
  '파노라마', '구강스캐너', '마이크로스코프', '파이브로블라스트',
  // 직책/호칭 — 인명 패턴 충돌 회피용
  '원장님', '교수님', '박사님', '대표원장', '진료원장', '병원장',
  // 해부학 (한국어)
  '치아', '잇몸', '치주', '구강', '구강내', '연조직', '경조직',
  '피부', '진피', '표피', '근막', 'SMAS',
  '관절', '인대', '연골', '척추', '골반',
  // 흔한 진료과/시술 한국어
  '교정', '미백', '레진', '크라운', '브릿지', '발치', '신경치료',
  '필링', '레이저토닝', '리프팅', '주름', '여드름', '색소',
  '관절경', '인공관절', '도수치료', '체외충격파', '주사치료',
]);

/**
 * 의약품/시술/장비 단어가 인명 후보(2~3글자 한국어)와 정확히 일치하면 PII 가 아니다.
 * 보수적: 사전에 없는 단어는 인명 패턴 그대로 적용.
 */
function isMedicalTerm(token: string): boolean {
  return MEDICAL_VOCABULARY.has(token);
}

/** 일반 명사(인명 아님) 여부 — "남성 환자" 같은 false positive 방지용. */
function isNonNameNoun(token: string): boolean {
  return NON_NAME_NOUNS.has(token);
}

/**
 * 카테고리별 정규식.
 *
 * 패턴 설계:
 * - RRN: 한국 주민등록번호 13자리. 7번째 자리는 1~4 (구버전 5~8 외국인은 별도 검토 필요).
 * - PHONE: 한국 휴대폰(010 등) + 지역번호. 하이픈 유무 모두 허용.
 * - EMAIL: 표준 RFC 5322 단순화 버전.
 * - NAME: 한국어 인명 + 호칭. 호칭 없는 단독 인명은 매칭하지 않는다 (보수).
 * - CHART: 차트번호/환자번호 라벨 뒤의 영숫자.
 * - ADDR: 한국 행정구역 + 동/로/길/번지 결합.
 */
const PATTERNS = {
  // 주민등록번호: 6자리-7자리 (7번째가 1~4)
  RRN: /\b(\d{6})-?([1-4]\d{6})\b/g,
  // 한국 휴대폰 + 지역번호
  PHONE: /\b(?:0(?:1[016-9]|2|[3-6][1-5]|70))-?\d{3,4}-?\d{4}\b/g,
  // 이메일
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // 환자명/내원자명 — 호칭 컨텍스트 동반 (false positive 회피).
  // 명시적 두 가지 패턴 (false positive 최소화):
  //   1) 라벨이 앞에:  "환자 김철수", "환자 김철수님", "내원자 이영희씨"
  //   2) 라벨이 뒤에:  "김철수님 환자분" — 이때는 님/씨 가 반드시 붙어야 함
  //      (`남성 환자` 같은 일반 명사가 이름 후보로 잡히는 false positive 차단)
  // 한국어 인명 길이는 2~3자가 95%. 4자로 잡으면 호칭(님/씨)을
  // 흡수하는 그리디 매칭 risk → 2~3자만 허용해 안전 우선.
  NAME_WITH_HONORIFIC:
    /(?:환자(?:분)?|내원자|보호자)\s+([가-힣]{2,3})(?:님|씨)?|([가-힣]{2,3})(?:님|씨)?(?=\s+(?:환자(?:분)?|내원자))/g,
  // 차트번호/환자번호 — 라벨 뒤 영숫자(공백·구분자 허용)
  CHART:
    /(?:차트(?:\s*번호)?|환자(?:\s*번호)?|진료\s*기록\s*번호|등록\s*번호)\s*[:：#]?\s*([A-Za-z0-9-]{3,20})/g,
  // 주소 — 한국 행정구역 + 동/로/길
  ADDRESS:
    /[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s+[가-힣0-9-]+(?:동|로|길|읍|면|리)(?:\s+\d+(?:-\d+)?(?:번지)?)?/g,
  // 광범위 인명 후보 (aggressive 전용) — 한국어 2~3자 + 단독 호칭(씨/님/박사/대표/이사/선생님).
  // \b 는 한국어 글자에 작동 안 함 → 앞쪽만 (?<![가-힣]) 로 명시.
  // 호칭 뒤에는 한국어 조사(에/가/는/께/께서 등)가 자연스럽게 붙으므로 trailing
  // boundary 는 제한하지 않는다.
  NAME_AGGRESSIVE:
    /(?<![가-힣])([가-힣]{2,3})\s+(?:씨|님|박사|대표|이사|선생(?:님)?)(?:[\s,.!?에가는를과의])/g,
};

/** 카테고리 우선순위 — 길이가 긴(또는 더 구체적인) 패턴부터 적용해 중첩 매칭을 피한다. */
type Category = 'EMAIL' | 'RRN' | 'PHONE' | 'CHART' | 'ADDR' | 'NAME';

/** 카테고리별 카운터 — `[NAME_1]`, `[NAME_2]` 식의 결정적 토큰 생성 */
class TokenAllocator {
  private counts = new Map<Category, number>();
  /** 원본 → 토큰 (결정적 치환) */
  private origToToken = new Map<string, string>();

  /** 같은 원본은 같은 토큰을 반환 (결정적). 새 원본이면 카운터 증가. */
  allocate(category: Category, original: string): string {
    const cached = this.origToToken.get(original);
    if (cached) return cached;
    const next = (this.counts.get(category) ?? 0) + 1;
    this.counts.set(category, next);
    const token = `[${category}_${next}]`;
    this.origToToken.set(original, token);
    return token;
  }
}

/**
 * 텍스트에서 PII 를 찾아 결정적 토큰으로 치환한다.
 *
 * @param text 사용자 입력 (sanitize 이후 권장)
 * @param level 마스킹 강도 — 기본값은 caller 결정. server default 는 'standard'
 * @returns `{ masked, replacements }` — masked 를 LLM 에 보내고, replacements 는
 *          응답을 받아 unmaskPII 로 원복할 때 사용
 */
export function maskPII(text: string, level: PIIMaskingLevel): MaskResult {
  if (!text || level === 'none') {
    return { masked: text ?? '', replacements: new Map() };
  }

  const allocator = new TokenAllocator();
  const tokenToOrig = new Map<string, string>();
  let result = text;

  /** 매칭된 텍스트를 토큰으로 치환하고, replacements 를 채운다. */
  const apply = (
    pattern: RegExp,
    category: Category,
    /** 매치 객체에서 실제 PII 부분만 추출 (옵션). 미지정 시 전체 매치. */
    extract?: (m: RegExpExecArray) => string | null,
  ) => {
    // 새 RegExp 인스턴스 — 외부에서 동일 g 플래그 RE 재사용 시 lastIndex 오염 방지
    const re = new RegExp(pattern.source, pattern.flags);
    result = result.replace(re, (...args) => {
      const matchStr = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      const fullMatch: RegExpExecArray = Object.assign([matchStr, ...groups], {
        index: args[args.length - 2] as number,
        input: args[args.length - 1] as string,
      }) as unknown as RegExpExecArray;
      const piiText = extract ? extract(fullMatch) : matchStr;
      if (!piiText) return matchStr;
      // 의료 어휘 보호 — 인명 후보가 의약품/시술명과 같으면 마스킹하지 않는다.
      // 일반 명사(남성/여성/고령 등)도 인명 false positive → 보존.
      if (category === 'NAME' && (isMedicalTerm(piiText) || isNonNameNoun(piiText))) {
        return matchStr;
      }
      const token = allocator.allocate(category, piiText);
      tokenToOrig.set(token, piiText);
      // 원본의 PII 부분만 토큰으로 교체 (호칭/라벨은 보존)
      return matchStr.replace(piiText, token);
    });
  };

  // 1) EMAIL — 단순·구조적·전 강도에서 마스킹
  if (level === 'minimal' || level === 'standard' || level === 'aggressive') {
    apply(PATTERNS.EMAIL, 'EMAIL');
  }

  // 2) RRN — 가장 강한 식별자, 전 강도에서 마스킹
  if (level === 'minimal' || level === 'standard' || level === 'aggressive') {
    apply(PATTERNS.RRN, 'RRN');
  }

  // 3) PHONE — 전 강도에서 마스킹
  if (level === 'minimal' || level === 'standard' || level === 'aggressive') {
    apply(PATTERNS.PHONE, 'PHONE');
  }

  // 4) CHART — standard 이상 (차트번호 라벨 컨텍스트가 명확할 때만)
  if (level === 'standard' || level === 'aggressive') {
    apply(PATTERNS.CHART, 'CHART', (m) => m[1] ?? null);
  }

  // 5) NAME (호칭 컨텍스트) — standard 이상
  if (level === 'standard' || level === 'aggressive') {
    apply(PATTERNS.NAME_WITH_HONORIFIC, 'NAME', (m) => m[1] ?? m[2] ?? null);
  }

  // 6) ADDRESS — aggressive 전용
  if (level === 'aggressive') {
    apply(PATTERNS.ADDRESS, 'ADDR');
  }

  // 7) NAME (광범위) — aggressive 전용
  if (level === 'aggressive') {
    apply(PATTERNS.NAME_AGGRESSIVE, 'NAME', (m) => m[1] ?? null);
  }

  return { masked: result, replacements: tokenToOrig };
}

/**
 * LLM 응답에서 토큰을 원본으로 되돌린다.
 *
 * LLM 이 토큰을 그대로 인용하면 (`[NAME_1]`) 원본 환자명으로 복원되어 사용자
 * 화면에는 마스킹 사실이 보이지 않는다. LLM 이 토큰을 자체 변형하거나
 * 누락하면(`[NAME 1]`, `[name_1]`) 복원되지 않을 수 있다 — 이는 사용자에게
 * 안전한 방향(원본 노출 안 함)이므로 의도적 동작.
 *
 * @param text LLM 응답 텍스트
 * @param replacements `maskPII` 가 반환한 Map
 * @returns 토큰이 치환된 최종 텍스트
 */
export function unmaskPII(text: string, replacements: Map<string, string>): string {
  if (!text || replacements.size === 0) return text ?? '';
  let result = text;
  // 긴 토큰부터 처리해 부분 매칭 회피 (예: [NAME_1] vs [NAME_10])
  const sorted = [...replacements.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [token, original] of sorted) {
    // 정규식 메타문자 이스케이프
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), original);
  }
  return result;
}

/**
 * 서버 기본 마스킹 강도. ADR-1 결정에 따라 'standard'.
 * 향후 옵션 C(옵트인 UI)는 별도 PR — `profiles.pii_mask_level` 컬럼 추가 후
 * caller 가 사용자별 강도를 조회해 전달.
 */
export const DEFAULT_PII_MASKING_LEVEL: PIIMaskingLevel = 'standard';
