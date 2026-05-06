/**
 * piiMask — LLM 외부 전송 전 PII (개인 식별 정보) 결정적 마스킹.
 *
 * ADR-1 결정 (B+C 병합, PR #124 머지본 §5):
 *   - 환자명 / 식별번호 / 차트번호 / 전화 / 주민번호 / 주소 등 식별 정보만
 *     결정적 토큰으로 치환하고 의료 컨텍스트(증상·진단·시술명·해부학)는 보존.
 *   - 옵트인 4단계 강도(`none / minimal / standard / aggressive`).
 *
 * 본 모듈은 블로그 사이클(self-contained) 의 모듈로 도입된다. 같은 export 시그니처는
 * clinical 사이클의 PR #127 모듈과 의도적으로 동일하다 — 두 사이클이 머지된 시점에
 * 자연 수렴된다. 코드는 PR #127 의 직접 복사가 아닌, ADR-1 / PR #127 본문의 사양으로부터
 * 재작성한 결과이다.
 *
 * 핵심 설계 원칙:
 *   1) "false positive (의료 용어 오인 마스킹) > false negative (PII 누락)" 우선.
 *      → 의료 어휘 사전 (denylist) 와 보수적 호칭 컨텍스트 매칭으로 의료 의미 보존.
 *   2) 결정적 치환: 같은 입력 → 같은 토큰. 라운드트립 가능 (mask → unmask → 원문).
 *   3) LLM 이 토큰을 변형(예: `[name_1]` 소문자화) → unmask 가 매칭 안 함 → 토큰이
 *      그대로 노출. 환자 식별 정보가 의도와 다른 위치에 새는 것보다 안전 방향 우선.
 *   4) 모르는 의료 용어는 사전에 추가하지 않는 보수 정책.
 *
 * 카테고리 (6개):
 *   - EMAIL  `[EMAIL_N]`
 *   - RRN    `[RRN_N]`     주민등록번호
 *   - PHONE  `[PHONE_N]`   한국 휴대폰 + 지역번호
 *   - NAME   `[NAME_N]`    환자명 (호칭 컨텍스트 동반시만)
 *   - CHART  `[CHART_N]`   차트번호/환자번호/등록번호 라벨 컨텍스트
 *   - ADDR   `[ADDR_N]`    한국 행정구역 + 동/로/길 등
 */

// ────────────────────────────────────────────────────────────────────────────
// 공개 타입 / 상수 (PR #127 와 의도적으로 동일 시그니처)
// ────────────────────────────────────────────────────────────────────────────

export type PIIMaskingLevel = 'none' | 'minimal' | 'standard' | 'aggressive';

export interface MaskResult {
  masked: string;
  /** 토큰 → 원문 매핑. 라운드트립 unmask 시 사용. */
  replacements: Map<string, string>;
}

/** 서버 기본값. ADR-1 §5 권고. */
export const DEFAULT_PII_MASKING_LEVEL: PIIMaskingLevel = 'standard';

// ────────────────────────────────────────────────────────────────────────────
// 의료 어휘 / 일반 명사 denylist — false positive 회피 핵심
//
// 정책: "확실한 의료 용어 / 일반 명사" 만 추가. 모르는 용어는 추가 안 함.
//      후속 PR 에서 점진 확장. 본 PR 는 가장 빈번한 용어만.
// ────────────────────────────────────────────────────────────────────────────

const MEDICAL_VOCAB: ReadonlySet<string> = new Set<string>([
  // 시술 / 의약품 — 한국어 음절
  '보톡스', '필러', '울쎄라', '써마지', '슈링크', '리쥬란', '엑소좀',
  '레이저', '토닝', '리프팅', '쁘띠', '보형물',
  '임플란트', '라미네이트', '교정', '스케일링', '크라운', '브릿지',
  '라식', '라섹', '스마일라식',
  '도수치료', '체외충격파', '주사치료',
  // 신체 / 해부학 일반
  '얼굴', '광대', '눈가', '이마', '입가', '코끝', '턱선', '볼살', '미간',
  '치아', '잇몸', '치근', '치주', '구강', '교합',
  '척추', '디스크', '연골', '관절',
  // 일반 명사 (성별 / 연령 / 역할)
  '남성', '여성', '환자', '환자분', '내원', '내원자', '보호자',
  '고객', '고객님', '회원', '회원님', '대표', '대표님',
  '원장', '원장님', '의사', '의사선생님', '선생님', '교수', '교수님',
  '박사', '박사님', '간호사', '직원', '직원분',
  '아버님', '어머님', '학생',
  // 시간 / 진료 관련
  '오전', '오후', '진료', '치료', '시술', '수술', '검사', '진단',
  '상담', '예약', '방문', '문의', '예후', '회복', '관리',
  // 빈도 높은 용어
  '효과', '결과', '비용', '가격', '추천', '리뷰', '후기', '체험',
  '필요', '주의', '안내', '정보', '소개', '문제',
]);

const NAME_HONORIFICS = ['님', '씨', '환자분', '환자', '원장님', '원장', '선생님', '선생', '교수님', '교수', '박사님', '박사'] as const;

// ────────────────────────────────────────────────────────────────────────────
// 정규식 — 카테고리별
// ────────────────────────────────────────────────────────────────────────────

// 이메일 — RFC 5322 단순화. local 부분 너무 관대하면 오탐 → 적당한 제한.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// 주민등록번호 — `\d{6}-?[1-4]\d{6}`. 첫 글자 뒤 1~4 (1900s/2000s, 남/여) 만 허용.
const RRN_RE = /\b\d{6}-?[1-4]\d{6}\b/g;

// 전화번호 — 한국 패턴. 010, 011, 016~19 휴대폰 + 02/0NN 지역번호.
//   휴대폰: 010-1234-5678, 010 1234 5678, 01012345678
//   지역:   02-345-6789, 031-123-4567
// 전화번호는 RRN 뒤에 적용해 RRN 일부와 충돌하지 않게 한다.
const PHONE_RE = /(?<!\d)(?:0(?:1[016-9]|2|[3-6]\d|70|80))[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g;

// 차트번호 / 환자번호 / 등록번호 — 라벨 컨텍스트 동반시만.
//   "차트번호: ABC-123", "환자번호 12345", "등록번호 #M-77"
const CHART_RE = /(?:차트번호|환자번호|등록번호|진료번호|차트\s*No\.?|Chart\s*No\.?)\s*[:#]?\s*([A-Za-z0-9-]{2,20})/g;

// 한국 인명 (standard) — 호칭 동반시만.
//   - "김철수님", "이영희 환자분", "박민수 환자", "환자 김철수"
//   - 이름 후보: 한글 2~3음절 (외자 / 4자 성씨는 false positive 큼 — 보수적 제외)
//   - 의료 용어 / 일반 명사는 denylist 로 제외
// 핵심 주의: `김철수님` 입력 시 greedy 매칭이 `[가-힣]{2,4}` 로 4자 전체("김철수님")를
// 잡아 호칭이 매칭 안 되는 함정 → name 부분을 2~3자로 제한해 호칭이 별도 캡처되게 함.
// 4자 한국 인명("선우정아") 은 standard 에서는 보수적으로 회피, aggressive 에서만 다룸.
//
// 두 가지 방향:
//   (1) 호칭 후행:     `<name(2~3자)><(공백 가능)><honorific>`
//   (2) 라벨 선행:     `(환자|내원자|보호자) <공백> <name(2~3자)>`
// 호칭 alt — 긴 것 먼저 (regex alternation 은 좌→우 순). `환자분` 이 `환자` 보다 먼저
// 매칭되어야 `이영희 환자분` 의 honorific 가 `환자분` 으로 캡처된다.
// 호칭 뒤에 한국어 조사 (`께서` 등) 가 따라올 수 있으므로 `(?![가-힣])` 사용 안 함.
const NAME_TRAILING_HONORIFIC_RE = /(?<![가-힣])([가-힣]{2,3})(\s*)(환자분|환자|원장님|원장|선생님|선생|교수님|교수|박사님|박사|님|씨)/g;
const NAME_LEADING_LABEL_RE = /(환자분|환자|내원자|보호자|고객님|고객)(\s+)([가-힣]{2,3})(?=[\s,.\)\]\}이가은는을를의에게]|$)/g;

// aggressive 모드 — 호칭 없이도 한글 인명 후보 매칭 (false positive 큼).
//   "김철수가" 같이 한글 2~3자 + 조사 / 공백 / 문장경계 패턴.
//   lazy quantifier `{2,3}?` 로 짧은 매칭 우선 → "환자가" 는 2자(`환자`) 매칭되어
//   denylist 에 의해 보존됨. 3자 인명("김철수")은 lazy 가 2자 fail 후 3자 시도.
//   denylist 는 `isLikelyName` 후처리에서 적용.
const NAME_AGGRESSIVE_RE = /(?<![가-힣])([가-힣]{2,3}?)(?=(?:[이가은는을를의에게으로와과도만이라하]|[\s,.\)\]\}!?]|$))/g;

// 한국 주소 — 행정구역 + 동/로/길/읍/면/리.
//   "서울시 강남구 역삼동", "경기도 성남시 분당구 정자로 123"
//   (병원 system 블록 인용 회피는 호출자 책임 — system 블록은 마스킹 안 함)
const ADDRESS_RE = /[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s+[가-힣A-Za-z0-9-]+(?:동|로|길|읍|면|리|가|번지|아파트)(?:\s*\d+(?:-\d+)?)?(?:\s*\d+층)?/g;

// ────────────────────────────────────────────────────────────────────────────
// 토큰 발급 / 카운터 / unmask 안전성
// ────────────────────────────────────────────────────────────────────────────

interface MaskContext {
  counters: Record<string, number>;
  /** 원문 → 토큰 캐시 (같은 입력 → 같은 토큰). */
  cache: Map<string, string>;
  replacements: Map<string, string>;
}

function newCtx(): MaskContext {
  return {
    counters: { EMAIL: 0, RRN: 0, PHONE: 0, NAME: 0, CHART: 0, ADDR: 0 },
    cache: new Map(),
    replacements: new Map(),
  };
}

function tokenFor(ctx: MaskContext, kind: 'EMAIL' | 'RRN' | 'PHONE' | 'NAME' | 'CHART' | 'ADDR', original: string): string {
  const cached = ctx.cache.get(`${kind}::${original}`);
  if (cached) return cached;
  ctx.counters[kind] += 1;
  const token = `[${kind}_${ctx.counters[kind]}]`;
  ctx.cache.set(`${kind}::${original}`, token);
  ctx.replacements.set(token, original);
  return token;
}

// ────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────────────────────────────────

function isMedicalVocab(candidate: string): boolean {
  return MEDICAL_VOCAB.has(candidate);
}

/** 한글 2~3음절 인명 후보가 의료/일반 단어인지 판정. */
function isLikelyName(candidate: string): boolean {
  if (candidate.length < 2 || candidate.length > 4) return false;
  if (isMedicalVocab(candidate)) return false;
  // 호칭 자체가 후보로 잡히는 경우 차단
  if ((NAME_HONORIFICS as readonly string[]).includes(candidate)) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// 카테고리별 마스킹 함수
// ────────────────────────────────────────────────────────────────────────────

function maskEmail(text: string, ctx: MaskContext): string {
  return text.replace(EMAIL_RE, (m) => tokenFor(ctx, 'EMAIL', m));
}

function maskRRN(text: string, ctx: MaskContext): string {
  return text.replace(RRN_RE, (m) => tokenFor(ctx, 'RRN', m));
}

function maskPhone(text: string, ctx: MaskContext): string {
  return text.replace(PHONE_RE, (m) => tokenFor(ctx, 'PHONE', m));
}

function maskChart(text: string, ctx: MaskContext): string {
  return text.replace(CHART_RE, (full, code: string) => {
    const token = tokenFor(ctx, 'CHART', code);
    return full.replace(code, token);
  });
}

function maskNameStandard(text: string, ctx: MaskContext): string {
  // (1) 후행 호칭 패턴
  let out = text.replace(NAME_TRAILING_HONORIFIC_RE, (full, name: string, ws: string, honorific: string) => {
    if (!isLikelyName(name)) return full;
    return `${tokenFor(ctx, 'NAME', name)}${ws}${honorific}`;
  });
  // (2) 선행 라벨 패턴 ("환자 김철수")
  out = out.replace(NAME_LEADING_LABEL_RE, (full, label: string, ws: string, name: string) => {
    if (!isLikelyName(name)) return full;
    return `${label}${ws}${tokenFor(ctx, 'NAME', name)}`;
  });
  return out;
}

function maskNameAggressive(text: string, ctx: MaskContext): string {
  // 호칭 없이도 한글 인명 후보 매칭 — 매우 광범위. 의료 어휘 denylist 검사 필수.
  return text.replace(NAME_AGGRESSIVE_RE, (m, name: string) => {
    if (!isLikelyName(name)) return m;
    // 명백한 의료 용어 / 일반 명사면 보존
    if (isMedicalVocab(name)) return m;
    return tokenFor(ctx, 'NAME', name);
  });
}

function maskAddress(text: string, ctx: MaskContext): string {
  return text.replace(ADDRESS_RE, (m) => tokenFor(ctx, 'ADDR', m));
}

// ────────────────────────────────────────────────────────────────────────────
// 공개 API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 입력 텍스트에서 PII 를 결정적 토큰으로 치환한다.
 *
 * 강도별 적용 카테고리:
 *   - none:       (마스킹 없음 — 원문 그대로)
 *   - minimal:    EMAIL + RRN + PHONE
 *   - standard:   minimal + NAME (호칭 컨텍스트) + CHART  ← 기본
 *   - aggressive: standard + ADDR + NAME (광범위 호칭 없는 케이스 포함)
 *
 * @param text 원본 텍스트 (LLM 으로 보내려는 user prompt)
 * @param level 마스킹 강도
 * @returns `{ masked, replacements }` — `replacements` 는 unmaskPII 에 그대로 전달.
 */
export function maskPII(text: string, level: PIIMaskingLevel): MaskResult {
  if (!text || level === 'none') {
    return { masked: text ?? '', replacements: new Map() };
  }

  const ctx = newCtx();
  let out = text;

  // 적용 순서: 가장 명확한(false positive 적은) 카테고리부터 적용.
  // RRN 을 PHONE 보다 먼저 — RRN 패턴이 PHONE 에 흡수되지 않도록.
  // CHART 는 NAME 보다 먼저 — `차트번호 김철수` 같은 페이로드 대응.

  // minimal / standard / aggressive 공통
  out = maskEmail(out, ctx);
  out = maskRRN(out, ctx);
  out = maskPhone(out, ctx);

  if (level === 'standard' || level === 'aggressive') {
    out = maskChart(out, ctx);
    out = maskNameStandard(out, ctx);
  }

  if (level === 'aggressive') {
    out = maskAddress(out, ctx);
    out = maskNameAggressive(out, ctx);
  }

  return { masked: out, replacements: ctx.replacements };
}

/**
 * LLM 응답에서 토큰을 원문으로 복원한다.
 *
 * 보안성: LLM 이 토큰을 변형(예: `[name_1]` 소문자화 / `[ NAME_1 ]` 공백 삽입) 하면
 * 매칭 안 되어 토큰이 그대로 노출된다. 환자 식별 정보가 의도와 다른 맥락에 끼어드는
 * 것보다 토큰 노출이 안전 방향이라는 판단.
 *
 * @param text LLM 응답 텍스트
 * @param replacements maskPII 가 반환한 매핑
 * @returns 토큰 → 원문 복원된 텍스트
 */
export function unmaskPII(text: string, replacements: Map<string, string>): string {
  if (!text || replacements.size === 0) return text ?? '';
  let out = text;
  // 정확 일치 토큰만 복원. 변형 토큰은 안전 방향(미복원).
  // 토큰 길이 긴 것부터 치환 (e.g. [NAME_10] 이 [NAME_1] 보다 먼저).
  const tokens = Array.from(replacements.keys()).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const original = replacements.get(token);
    if (original === undefined) continue;
    // String.prototype.replaceAll 은 ES2021 — target ES2017 환경 호환을 위해 split/join.
    out = out.split(token).join(original);
  }
  return out;
}
