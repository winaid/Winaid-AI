/**
 * 출력 누수 정규화 필터 — clinical / press / blog 등 HTML 응답 + string 값 공통.
 *
 * 배경:
 *   PR #154/#156/#158 로 system prompt 한국어 출력 메타 지시문을 영문 [META] 라벨
 *   로 분리. 1차 방어선. 단 blog 만 클라이언트 normalizeBlogStructure 로 후처리 →
 *   누수 발견 시 자동 strip. 다른 콘텐츠 타입 (clinical / press / cardNews) 은
 *   후처리 단계 부재 — 모델이 영문 라벨을 본문화하면 무방비.
 *
 *   본 모듈은 그 빈 자리를 채우는 server-side 후처리. 동일 LEAK_PATTERNS 를 사용
 *   하므로 normalizeBlog 와 동작 일치.
 *
 * 사용처:
 *   next-app/app/api/generate/clinical/route.ts  → sanitizeLeakInHtml
 *   next-app/app/api/generate/press/route.ts     → sanitizeLeakInHtml
 *   public-app/app/api/generate/press/route.ts   → sanitizeLeakInHtml
 *   (cardNews JSON 응답은 normalize/leakFilterJson.ts 사용)
 */

/**
 * 누수 패턴 — 양 필터(<p>, <h2/3>) 에 공통 적용.
 *
 * 정의: text(HTML strip 후) 가 다음 중 하나라도 매칭하면 누수로 판정.
 *   1) 명시적 placeholder [태그명]
 *   2) "사용 가능 태그" 류 메타 어휘
 *   3) SEO·가독성 메타 어휘
 *   4) [IMG_N/X/n/x] placeholder (\b 로 단어 경계 — 정상 마커 [IMG_1] 등은 통과)
 *   5) "마크다운/JSON" 메타
 *   6) "h3 태그로 감싸", "소제목을 ... 태그"
 *
 * 정상 의료 본문은 통과 (PR #160 의 45-case sanity 로 검증).
 */
export const LEAK_PATTERNS: readonly RegExp[] = [
  /\[태그명\]|\[tag_name\]/i,
  /(사용\s*가능|허용|사용할\s*수\s*있는|금지된?)\s*태그/,
  /SEO\s*[·•]\s*가독성|SEO\s+가독성/,
  /\[IMG_[NXnx]\b|IMG\s*마커|이미지\s*마커/,
  /마크다운\s*\/\s*JSON|코드펜스\s*금지|JSON\s*형식\s*포함/,
  /h3\s*태그로\s*감싸|소제목을?\s*<?h[23]>?\s*태그/,
];

/**
 * 헤딩 전용 추가 패턴 — 짧은 메타 라벨이 헤딩으로 등장하는 케이스 차단.
 *
 * 정의: heading text (HTML strip 후 trim) 가 다음 중 하나라도 매칭하면 누수.
 *   1) "소제목을/소제목으로" 단독
 *   2) "로 감싸" 또는 "감싸 구조" 시작
 *   3) Subheading / Output format / Section heading 등 영문 메타 라벨
 *   4) [META / [CRITICAL / [INSTRUCTION / [OUTPUT
 *   5) 단독 메타 영단어 (meta/format/tag/output/schema/placeholder)
 *   6) heading/subheading derived from
 *
 * 정상 의료 헤딩 (출장/SECTION/Format-A 등) 은 word boundary 로 통과.
 */
export const HEADING_LEAK_PATTERNS: readonly RegExp[] = [
  /^\s*(소제목을?|소제목으로?|소제목이?)\s*$/,
  /^\s*로\s*감싸|^\s*감싸\s*구조/,
  /\b(Subheading|Output\s*format|Section\s*(heading|format|label|rule|placeholder))\b/i,
  /\[META\b|\[CRITICAL\b|\[INSTRUCTION\b|\[OUTPUT\b/i,
  /^\s*(meta|format|tag|output|schema|placeholder)\s*$/i,
  /heading.*derived\s*from|subheading.*derived/i,
];

/**
 * HTML 안 <p> / <h2-3> 단위로 leak 감지 → 통째로 제거.
 *
 * 입력: clinical/press/blog 류 HTML.
 * 동작:
 *   1) <h2>...</h2>, <h3>...</h3> 순회. inner text 매칭 시 heading 통째 제거.
 *      heading 만 제거됨 → body 는 보존 (parseBlogSections 등에서 자연 흡수).
 *   2) <p>...</p> 순회. inner text 매칭 시 <p> 통째 제거.
 *
 * 반환: { html, paragraphsStripped, headingsStripped }.
 */
export function sanitizeLeakInHtml(html: string): {
  html: string;
  paragraphsStripped: number;
  headingsStripped: number;
} {
  let out = html;
  let headingsStripped = 0;
  let paragraphsStripped = 0;

  out = out.replace(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi, (full, inner: string) => {
    const text = inner.replace(/<[^>]*>/g, '').trim();
    if (!text) return full;
    const allPatterns = [...LEAK_PATTERNS, ...HEADING_LEAK_PATTERNS];
    for (const re of allPatterns) {
      if (re.test(text)) {
        headingsStripped++;
        return '';
      }
    }
    return full;
  });

  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (full, inner: string) => {
    const text = inner.replace(/<[^>]*>/g, '');
    for (const re of LEAK_PATTERNS) {
      if (re.test(text)) {
        paragraphsStripped++;
        return '';
      }
    }
    return full;
  });

  return { html: out, paragraphsStripped, headingsStripped };
}

/**
 * Plain string (HTML 아님) 안 leak 감지 → 매칭 부분만 제거.
 *
 * 사용처: cardNews 의 SlideData 각 string 필드 (title/subtitle/body/visualKeyword
 * /checkItems[] 등). 의료광고법 필터 (applyContentFilters) 와 비슷한 패턴.
 *
 * 전략: leak 패턴 매칭 시 그 부분만 제거. 부분 매칭은 정상 본문일 수 있어
 * 전체 빈 문자열로 치환하지 않음. UI 가 빈 필드 처리 어려우므로 보수적.
 *
 * 반환: { text, stripped } — stripped > 0 이면 적어도 1 패턴 적용됨.
 */
export function sanitizeLeakInString(text: string): {
  text: string;
  stripped: number;
} {
  if (!text || typeof text !== 'string') return { text, stripped: 0 };

  let out = text;
  let stripped = 0;

  for (const re of LEAK_PATTERNS) {
    // global flag 강제 — replace 가 모든 매치 제거
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    const matched = out.match(globalRe);
    if (matched && matched.length > 0) {
      out = out.replace(globalRe, '');
      stripped += matched.length;
    }
  }

  // anchored 헤딩 패턴은 부분 매칭 안 되므로 transformatable — 전체 매칭 시 빈 문자열로.
  // 단 anchored 패턴 (예: /^\s*meta\s*$/) 는 전체가 메타 라벨이면 잡고, 정상 본문에는 매칭 X.
  for (const re of HEADING_LEAK_PATTERNS) {
    if (re.test(out.trim())) {
      stripped++;
      return { text: '', stripped };
    }
  }

  return { text: out.replace(/\s+/g, ' ').trim(), stripped };
}
