// ── 블로그 HTML 구조 보정 ──
// page.tsx에서 분리한 normalizeBlogStructure 함수

/** AI 응답 HTML의 구조를 정규화: JSON escape 정리, 헤딩 통일, 이모지 제거 등 */
export function normalizeBlogStructure(html: string, topicFallback: string): { html: string; log: string[] } {
  const log: string[] = [];
  let out = html;
  const cleanedPatterns: string[] = [];

  // 0) JSON escape 정리 (old legacyBlogGeneration.ts:1570-1596 동일)
  // 0a) JSON escaped closing tags: <\/p> → </p> etc.
  if (/<\\\//.test(out)) {
    out = out
      .replace(/<\\\/p>/g, '</p>')
      .replace(/<\\\/h2>/g, '</h3>')  // h2→h3도 함께
      .replace(/<\\\/h3>/g, '</h3>')
      .replace(/<\\\/div>/g, '</div>')
      .replace(/<\\\/span>/g, '</span>')
      .replace(/<\\\/strong>/g, '</strong>')
      .replace(/<\\\/em>/g, '</em>');
    cleanedPatterns.push('JSON escaped tags (<\\/p> etc.)');
  }
  // 0b) 남은 \/ 제거
  if (/\\\//.test(out)) {
    out = out.replace(/\\\//g, '/');
    cleanedPatterns.push('escaped slash (\\/)');
  }
  // 0c) \\n 리터럴 문자열 제거 (JSON escape 잔여물)
  if (/\\n/.test(out)) {
    out = out.replace(/\\n/g, '');
    cleanedPatterns.push('literal \\n');
  }
  // 0d) 연속 줄바꿈 정리
  out = out.replace(/\n\n+/g, '\n');
  // 0e) JSON 형식 잔여물 제거 (AI가 JSON으로 감싼 경우)
  const hadJsonWrapper =
    /^\s*\{\s*"title"\s*:\s*"/.test(out) ||
    /^\s*\{\s*"content"\s*:\s*"/.test(out);
  if (hadJsonWrapper) {
    out = out
      .replace(/^\s*\{\s*"title"\s*:\s*"[^"]*"\s*,\s*"content"\s*:\s*"/i, '')
      .replace(/"\s*,\s*"imagePrompts"\s*:\s*\[.*?\]\s*\}\s*$/i, '')
      .replace(/^\s*\{\s*"content"\s*:\s*"/i, '')
      .replace(/"\s*\}\s*$/i, '');
    cleanedPatterns.push('JSON wrapper ({\"content\":\"...\"})');
  }
  // 0f) 이미지 없음 텍스트 제거
  out = out
    .replace(/\(이미지 없음\)/g, '')
    .replace(/\(이미지가 없습니다\)/g, '')
    .replace(/\[이미지 없음\]/g, '');

  if (cleanedPatterns.length > 0) {
    log.push(`[ESCAPE] JSON escape 정리: ${cleanedPatterns.join(', ')}`);
  }

  // 1) h1 → h3
  const h1Count = (out.match(/<h1[\s>]/gi) || []).length;
  if (h1Count > 0) {
    out = out.replace(/<h1([^>]*)>/gi, '<h3$1>').replace(/<\/h1>/gi, '</h3>');
    log.push(`[STRUCTURE] h1→h3 변환: ${h1Count}개`);
  }

  // 2) h2 → h3 (old와 동일)
  const h2Count = (out.match(/<h2[\s>]/gi) || []).length;
  if (h2Count > 0) {
    out = out.replace(/<h2([^>]*)>/gi, '<h3$1>').replace(/<\/h2>/gi, '</h3>');
    log.push(`[STRUCTURE] h2→h3 변환: ${h2Count}개`);
  }

  // 2b) <p><strong>짧은 문자열</strong></p> → <h3> (LLM 이 소제목을 strong 으로 출력한 케이스).
  //     30자 이하 + strong 안 다른 태그 없을 때만 — 본문 강조 (긴 문장) 는 보존.
  const pStrongPattern = /<p>\s*<strong>([^<]{1,30})<\/strong>\s*<\/p>/g;
  const pStrongMatches = out.match(pStrongPattern) || [];
  if (pStrongMatches.length > 0) {
    out = out.replace(pStrongPattern, '<h3>$1</h3>');
    log.push(`[STRUCTURE] <p><strong>...</strong></p> → h3 변환: ${pStrongMatches.length}개 (≤30자 단순 강조)`);
  }

  // 3) markdown ## → h3
  const mdHeadings = out.match(/^#{1,3}\s+.+$/gm) || [];
  if (mdHeadings.length > 0) {
    out = out.replace(/^#{1,3}\s+(.+)$/gm, '<h3>$1</h3>');
    log.push(`[STRUCTURE] markdown heading→h3 변환: ${mdHeadings.length}개`);
  }

  // 4) 해시태그 제거 (old 동일)
  out = out.replace(/#[가-힣a-zA-Z0-9_]+(\s*#[가-힣a-zA-Z0-9_]+)*/g, '');

  // 5) 이모지 제거 (old 동일 — 전문 의료 콘텐츠 톤)
  out = out
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '');

  // 6) 빈 p 태그 남용 방지 — 학습 말투 경로에서 단락 간 빈 줄 재현용 1개는 보존.
  //    연속 2개 이상만 1개로 축소.
  out = out.replace(/(?:<p>\s*<\/p>\s*){2,}/g, '<p></p>');

  // 6a) 프롬프트 지시문이 <h3> 소제목으로 누수되는 회귀 차단 (PR #154 후속).
  //     상세: next-app/app/(dashboard)/blog/normalizeBlog.ts 와 동일.
  //     반드시 h2→h3 변환(2단계) 이후, <p> leak 필터 이전에 실행.
  const headingLeakPatterns: RegExp[] = [
    /\[태그명\]|\[tag_name\]/i,
    /(사용\s*가능|허용|사용할\s*수\s*있는|금지된?)\s*태그/,
    /(<h[1-6]>|<p>|<ul>|<li>|<strong>|<em>)(?=[\s\S]*(감싸|사용|출력|포함|마커|표시))/,
    /SEO\s*[·•]\s*가독성|SEO\s+가독성/,
    /\[IMG_[NX0-9]|IMG\s*마커|이미지\s*마커/,
    /마크다운\s*\/\s*JSON|코드펜스\s*금지|JSON\s*형식\s*포함/,
    /h3\s*태그로\s*감싸|소제목을?\s*<?h[23]>?\s*태그/,
    /^\s*(소제목을?|소제목으로?|소제목이?)\s*$/,
    /^\s*로\s*감싸|^\s*감싸\s*구조/,
    /\b(Subheading|Output\s*format|Section\s*(heading|format|label|rule|placeholder))\b/i,
    /\[META\b|\[CRITICAL\b|\[INSTRUCTION\b|\[OUTPUT\b/i,
    /^\s*(meta|format|tag|output|schema|placeholder)\s*$/i,
    /heading.*derived\s*from|subheading.*derived/i,
  ];
  let headingLeakStripped = 0;
  out = out.replace(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi, (full, inner: string) => {
    const text = inner.replace(/<[^>]*>/g, '').trim();
    if (!text) return full;
    for (const re of headingLeakPatterns) {
      if (re.test(text)) {
        headingLeakStripped++;
        log.push(`[LEAK] 메타 지시문 헤딩 제거: "${text.slice(0, 30)}"`);
        return '';
      }
    }
    return full;
  });
  if (headingLeakStripped > 0) {
    console.warn(`[normalizeBlog] heading leak detected and stripped: ${headingLeakStripped} count`);
  }

  // 6b) 프롬프트 지시문 누수 필터 (defense in depth)
  //     Gemini 한국어 모드가 system prompt 의 "사용 가능 태그", "<h3> 사용",
  //     "SEO·가독성", "[IMG_N alt=...]" 같은 메타 지시문을 본문 <p> 로 베껴 적는
  //     케이스 방어. 명백한 메타-문구만 차단해 정상 본문 오탐 risk 최소화.
  //     상세: next-app/app/(dashboard)/blog/normalizeBlog.ts 와 동일.
  const leakPatterns: RegExp[] = [
    /\[태그명\]|\[tag_name\]/i,
    /(사용\s*가능|허용|사용할\s*수\s*있는|금지된?)\s*태그/,
    /(<h[1-6]>|<p>|<ul>|<li>|<strong>|<em>)(?=[\s\S]*(감싸|사용|출력|포함|마커|표시))/,
    /SEO\s*[·•]\s*가독성|SEO\s+가독성/,
    /\[IMG_[NX0-9]|IMG\s*마커|이미지\s*마커/,
    /마크다운\s*\/\s*JSON|코드펜스\s*금지|JSON\s*형식\s*포함/,
    /h3\s*태그로\s*감싸|소제목을?\s*<?h[23]>?\s*태그/,
  ];
  let leakStripped = 0;
  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (full, inner: string) => {
    const text = inner.replace(/<[^>]*>/g, '');
    for (const re of leakPatterns) {
      if (re.test(text)) {
        leakStripped++;
        return '';
      }
    }
    return full;
  });
  if (leakStripped > 0) {
    log.push(`[LEAK] 프롬프트 지시문 누수 <p> ${leakStripped}개 제거`);
  }

  // 7) h3 개수 확인 — 최소 5개 보장
  const h3Matches = out.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || [];
  const h3Count = h3Matches.length;
  log.push(`[STRUCTURE] 소제목(h3) 수: ${h3Count}개`);

  if (h3Count === 0) {
    // 소제목이 전혀 없으면 첫 줄을 제목으로 승격하고 기본 구조 보정
    log.push(`[STRUCTURE] ⚠️ 소제목 0개 — 기본 구조 보정 시도`);
  }

  // 8) 제목 확인 — 첫 번째 h3 전까지 도입부가 있는지
  const firstH3Idx = out.search(/<h3[\s>]/i);
  if (firstH3Idx === 0) {
    // 도입부 없이 바로 h3로 시작 → 첫 h3을 제목으로 간주, 도입부 부재 경고
    log.push(`[STRUCTURE] ⚠️ 도입부 없음 — h3으로 바로 시작`);
  } else if (firstH3Idx > 0) {
    const introPart = out.substring(0, firstH3Idx);
    const introPs = (introPart.match(/<p[^>]*>/gi) || []).length;
    log.push(`[STRUCTURE] 도입부 문단: ${introPs}개`);
  }

  // 9) 각 소제목 아래 문단 수 검증
  const sections = out.split(/<h3[^>]*>/i).slice(1); // h3 이후 각 섹션
  const sectionParagraphCounts: number[] = [];
  for (const section of sections) {
    const nextH3 = section.search(/<h3[\s>]/i);
    const sectionContent = nextH3 > 0 ? section.substring(0, nextH3) : section;
    const pCount = (sectionContent.match(/<p[^>]*>/gi) || []).length;
    sectionParagraphCounts.push(pCount);
  }
  const shortSections = sectionParagraphCounts.filter(c => c < 2).length;
  if (shortSections > 0) {
    log.push(`[STRUCTURE] ⚠️ 문단 2개 미만 섹션: ${shortSections}개 (보정 불필요 — 프롬프트 강화로 대응)`);
  }
  log.push(`[STRUCTURE] 섹션별 문단 수: [${sectionParagraphCounts.join(', ')}]`);

  // 10) 긴 문단 자동 분리 — 180자 초과 <p> 를 한국어 마침 어미 기준으로 분할
  // (모바일 친화 목표는 150자이지만 자동 분리는 보수적으로 180자 상한)
  const PARA_MAX = 180;
  let splitApplied = 0;
  out = out.replace(/<p>([^<]+)<\/p>/g, (full, text: string) => {
    if (text.length <= PARA_MAX) return full;
    // 한국어 마침 어미(다/요/죠) + 마침표/물음표/느낌표 + 공백 기준 분리
    const sentences = text.split(/(?<=[다요죠][.!?]\s)/);
    if (sentences.length <= 1) return full;
    const mid = Math.ceil(sentences.length / 2);
    const first = sentences.slice(0, mid).join('').trim();
    const second = sentences.slice(mid).join('').trim();
    if (!first || !second) return full;
    splitApplied++;
    return `<p>${first}</p>\n<p>${second}</p>`;
  });
  const stillLong = (out.match(/<p>[^<]{180,}<\/p>/g) || []).length;
  if (splitApplied > 0) log.push(`[READABILITY] ✅ 긴 문단 ${splitApplied}개 자동 분리됨`);
  if (stillLong > 0) log.push(`[READABILITY] ⚠️ 여전히 180자 초과 문단 ${stillLong}개 (수동 확인 필요)`);
  if (splitApplied === 0 && stillLong === 0) log.push('[READABILITY] ✅ 모든 문단 180자 이내');

  out = out.trim();
  return { html: out, log };
}
