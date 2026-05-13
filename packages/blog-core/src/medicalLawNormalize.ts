/**
 * 의료광고법 매칭용 Unicode 정규화 — 우회 트릭 차단
 *
 * 한국어 의료광고 우회 패턴은 주로 Unicode 트릭을 사용:
 *   - zero-width space:  최​고     →  validator 통과
 *   - 호모글리프:        ⅽⅼⅰⅽ          →  c 매처 통과
 *   - 전각·반각:         최　고 / Ａ급   →  공백·반각 통과
 *   - 자모 분리:         ㅊㅗㅣ고         →  NFC 통합 전 통과
 *   - 다중 공백:         최   고          →  단어 분리 통과
 *
 * 본 정규화를 매처/필터 진입점에 한 번 적용하면 위 모든 우회가 일반 키워드 매칭에
 * 잡힌다. 텍스트 자체를 변형하므로 호출자가 원본 substring/index 정보가 필요하면
 * 정규화 전 원본을 보존해야 함 (validator 는 원본 반환 안 함, filter 는 치환된
 * 텍스트 반환이 의도된 동작).
 *
 * 양 앱 공유 (public-app medicalAdValidation, blog-core medicalLawFilter).
 */

/** zero-width 와 동등한 invisible 코드포인트 — 제거 대상. */
const ZERO_WIDTH_RE = /[​‌‍﻿⁠᠎]/g;

/**
 * 호모글리프 → ASCII 매핑. 의료광고 우회에서 실제로 보이는 케이스 위주로 보수적으로.
 * 무한 확장 금지 — false-positive 위험. 영문 키워드(skin, perfect 등)가 추가되면
 * 본 표의 라틴 닮은꼴이 활성화된다.
 */
const HOMOGLYPHS: Record<string, string> = {
  // 로마 숫자 (라틴 닮은꼴)
  'ⅽ': 'c', 'ⅼ': 'l', 'ⅰ': 'i', 'ⅾ': 'd', 'ⅴ': 'v', 'ⅹ': 'x',
  // 키릴
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  // 그리스
  'ο': 'o', 'ι': 'i', 'ν': 'v',
};

const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`, 'g');

/** 전각 영숫자 → 반각. U+FF21..U+FF3A → A..Z, U+FF41..U+FF5A → a..z, U+FF10..U+FF19 → 0..9 */
function fullwidthAlphanumToHalf(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xff21 + 0x41);
    if (code >= 0xff41 && code <= 0xff5a) return String.fromCharCode(code - 0xff41 + 0x61);
    return String.fromCharCode(code - 0xff10 + 0x30);
  });
}

/**
 * 매처/필터 진입점에서 한 번 호출. 원본 텍스트는 호출자가 보존해야 한다.
 *
 * 순서가 의미가 있음:
 *   1) NFC 정규화 — 자모 분리 통합 (호모글리프 매핑 전에 자모 통합)
 *   2) zero-width strip — invisible 문자 제거
 *   3) 호모글리프 → ASCII — 라틴 닮은꼴 통합
 *   4) 전각 영숫자 → 반각 — Ａ급 → A급
 *   5) 전각 공백 → 반각 공백 — 최　고 → 최 고
 *   6) 다중 공백 collapse — 최   고 → 최 고
 */
export function normalizeForMedicalAdMatch(text: string): string {
  if (!text) return text;
  let out = text.normalize('NFC');
  out = out.replace(ZERO_WIDTH_RE, '');
  out = out.replace(HOMOGLYPH_RE, (ch) => HOMOGLYPHS[ch] ?? ch);
  out = fullwidthAlphanumToHalf(out);
  out = out.replace(/　/g, ' ');
  out = out.replace(/[ \t]+/g, ' ');
  return out;
}
