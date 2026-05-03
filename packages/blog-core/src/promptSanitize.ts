/**
 * 프롬프트 인젝션 방어 — 사용자 입력을 LLM 프롬프트에 삽입하기 전 정리.
 *
 * 방어 포인트:
 *  1) 구조 문자 제거: 대괄호 `[ ]`, 중괄호 `{ }`, 백틱, 따옴표 타입 정규화
 *     → 시스템 블록을 가장하는 `[system]`, `[new instruction]` 같은 wrapping 방지
 *  2) XML 태그 제거 (`<...>`): 시스템 프롬프트가 <heading>/<facts>/<draft_to_review>
 *     같은 envelope 사용 → 사용자 입력의 `</heading>` 같은 closing tag 가
 *     LLM 의 attention boundary 를 깰 수 있음 (B9 — Agent 5)
 *  3) 역할 가장 키워드 제거: "시스템/지시/instruction/ignore previous/override" 등
 *  4) 연속 줄바꿈 압축 → prompt 경계 흐림 방지
 *  5) 길이 캡(기본 300자) → 토큰 경제 + 공격 페이로드 축소
 *
 * 참고: 100% 방어는 불가능 — 이 함수는 가장 흔한 패턴만 차단.
 *       구조화된 출력(responseSchema)이 더 강력한 방어라는 점 기억할 것.
 */

const INJECTION_KEYWORDS: RegExp[] = [
  // 한국어 — 역할 가장 / 지시 변경 명령
  /\b(?:새\s*지시|이전\s*지시|기존\s*지시|시스템\s*지시|시스템\s*프롬프트|규칙\s*(?:무시|해제|우회))\b/gi,
  /(?:무시|해제|우회|override)하고/gi,
  // 한국어 — 추가 variants (B9 — Agent 5)
  /앞의\s*지시|위의\s*명령|이전\s*명령|역할\s*변경|역할\s*바꿔|시스템\s*모드|새로운\s*지시|이제부터\s*너는|너의\s*역할은|새\s*역할/gi,
  // 영어 — 기본
  /\b(?:ignore\s+(?:previous|above|prior|all))\b/gi,
  /\b(?:disregard|forget)\s+(?:previous|above|prior|all|instructions?)\b/gi,
  /\b(?:new|updated|revised)\s+instructions?\b/gi,
  /\b(?:system|assistant|user)\s*:\s*/gi,
  /\b(?:jailbreak|dan\s+mode|developer\s+mode)\b/gi,
  // 영어 — 추가 variants
  /\babove\s+instructions?\b/gi,
  /\bprevious\s+prompt\b/gi,
  /\bnew\s+persona\b/gi,
  /\bfrom\s+now\s+on\b/gi,
];

// XML/HTML 태그 — opening + closing + self-closing 모두 매칭.
// envelope tag (<draft_to_review>, <heading>, <facts>, <system>, <permitted> 등) 가장 차단.
// trade-off: 사용자가 진짜로 부등호 `<` `>` 사용해도 strip — 의료 컨텐츠에서 빈도 낮음.
const TAG_LIKE_RE = /<\s*\/?\s*[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?\/?\s*>/g;
// 닫는 태그만 (잔여 `<` `>` 도 안전하게 제거)
const STRAY_ANGLE_RE = /[<>]/g;

/**
 * 사용자 입력을 LLM 프롬프트용으로 정리.
 * @param text 원본 입력
 * @param maxLen 최대 길이 (기본 300)
 * @returns 정리된 문자열 (빈 문자열 가능)
 */
export function sanitizePromptInput(text: string | undefined | null, maxLen = 300): string {
  if (!text) return '';
  let s = String(text);

  // 제어문자 제거 (탭/줄바꿈 유지)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // XML/HTML envelope tag 제거 (closing/opening 모두) — prompt 경계 가장 차단
  s = s.replace(TAG_LIKE_RE, ' ');
  // 잔여 부등호 strip (자연 부등호 사용은 의료 컨텐츠 빈도 낮음, false positive 수용)
  s = s.replace(STRAY_ANGLE_RE, ' ');

  // 구조 문자 정규화 — 프롬프트 경계를 가장할 수 있는 문자들
  s = s.replace(/[\[\]{}`]/g, ' ');

  // 따옴표 정규화 — 이스케이프된 따옴표 공격 방지
  s = s.replace(/["'""'']/g, ' ');

  // 인젝션 키워드 제거
  for (const rx of INJECTION_KEYWORDS) {
    s = s.replace(rx, ' ');
  }

  // 연속 줄바꿈 → 최대 1개, 연속 공백 → 1개
  s = s.replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

  // 길이 캡
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();

  return s;
}

/**
 * 장문 소스 콘텐츠(블로그 글·유튜브 스크립트·기사) 전용 sanitize.
 *
 * `sanitizePromptInput` 과의 차이:
 *  - 대괄호 `[ ]` 를 보존한다 — YouTube 타임스탬프 `[00:12:34]`, 각주 `[1]`,
 *    마크다운 링크 `[text](url)` 등 원문 구조가 날아가면 추출 품질이 떨어짐.
 *  - 따옴표를 보존한다 — 인용문·고유명사·강조가 의미를 가짐.
 *  - 단락 구분(`\n\n`)을 보존한다 — 기존 함수는 단락도 한 줄로 합쳐버림.
 *  - 최대 길이 기본값 15000자로 확장 (블로그 글 전체를 수용).
 *
 * 동일한 방어:
 *  - 제어문자 제거
 *  - 중괄호·백틱 제거 (프롬프트 delimiter로 악용 가능)
 *  - 인젝션 키워드(`ignore previous`, `system:`, `jailbreak` 등) 제거
 *
 * 안전성 근거: Gemini 프롬프트의 블록 경계는 여전히 `---`, `##`, 빈 줄 등으로
 * 호출부에서 명시되므로, 대괄호/따옴표 보존만으로 심각한 경계 혼동은 없다.
 * 가장 흔한 공격(역할 가장, "ignore previous")은 INJECTION_KEYWORDS 에서 계속 차단.
 */
export function sanitizeSourceContent(text: string | undefined | null, maxLen = 15000): string {
  if (!text) return '';
  let s = String(text);

  // 제어문자 제거 (탭/줄바꿈 유지)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // XML/HTML envelope tag 제거 — review/route.ts 가 source 를 <draft_to_review>{src}</draft_to_review>
  // 안에 보간하므로 source 안 closing tag 가 envelope 종결을 가장 가능 (B9 — Agent 5).
  // long-form source 라도 envelope tag 가장은 강력한 공격 vector → 제거 우선.
  s = s.replace(TAG_LIKE_RE, ' ');
  s = s.replace(STRAY_ANGLE_RE, ' ');

  // 프롬프트 delimiter 로 쓰이는 위험 문자만 제거.
  // 대괄호·따옴표는 원문 의미 보존을 위해 유지.
  s = s.replace(/[`{}]/g, ' ');

  // 인젝션 키워드 제거 (sanitizePromptInput 과 동일)
  for (const rx of INJECTION_KEYWORDS) {
    s = s.replace(rx, ' ');
  }

  // 3줄 이상 연속 빈 줄 → 2줄로, 연속 공백은 1개로 축약 (단락 구조 보존).
  s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  // 길이 캡
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();

  return s;
}
