/**
 * 프롬프트 인젝션 방어 — 사용자 입력을 LLM 프롬프트에 삽입하기 전 정리.
 *
 * 방어 포인트:
 *  1) 구조 문자 제거: 대괄호 `[ ]`, 중괄호 `{ }`, 백틱, 따옴표 타입 정규화
 *     → 시스템 블록을 가장하는 `[system]`, `[new instruction]` 같은 wrapping 방지
 *  2) 역할 가장 키워드 제거: "시스템/지시/instruction/ignore previous/override" 등
 *  3) 연속 줄바꿈 압축 → prompt 경계 흐림 방지
 *  4) 길이 캡(기본 300자) → 토큰 경제 + 공격 페이로드 축소
 *
 * 참고: 100% 방어는 불가능 — 이 함수는 가장 흔한 패턴만 차단.
 *       구조화된 출력(responseSchema)이 더 강력한 방어라는 점 기억할 것.
 */

const INJECTION_KEYWORDS: RegExp[] = [
  // 한국어
  /\b(?:새\s*지시|이전\s*지시|기존\s*지시|시스템\s*지시|시스템\s*프롬프트|규칙\s*(?:무시|해제|우회))\b/gi,
  /(?:무시|해제|우회|override)하고/gi,
  // 영어
  /\b(?:ignore\s+(?:previous|above|prior|all))\b/gi,
  /\b(?:disregard|forget)\s+(?:previous|above|prior|all|instructions?)\b/gi,
  /\b(?:new|updated|revised)\s+instructions?\b/gi,
  /\b(?:system|assistant|user)\s*:\s*/gi,
  /\b(?:jailbreak|dan\s+mode|developer\s+mode)\b/gi,
];

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
