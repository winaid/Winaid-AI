/**
 * 블로그 HTML → 섹션 파싱
 * root app src/core/generation/generateContentJob.ts parseBlogSections 기준 이식
 */
import type { BlogSection } from '@winaid/blog-core';

export function parseBlogSections(html: string): BlogSection[] {
  const sections: BlogSection[] = [];

  // h3 태그 매칭 (FAQ 제외)
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const h3Matches: { title: string; position: number }[] = [];

  let match;
  while ((match = h3Regex.exec(html)) !== null) {
    const title = match[1].replace(/<[^>]*>/g, '').trim();
    if (/자주\s*묻는|FAQ/i.test(title)) continue;
    h3Matches.push({ title, position: match.index });
  }

  if (h3Matches.length === 0) return [];

  // 도입부: 첫 h3 앞 콘텐츠 (main-title 제외)
  const introRaw = html.substring(0, h3Matches[0].position).trim();
  const introClean = introRaw
    .replace(/<h2[^>]*class=["']main-title["'][^>]*>[\s\S]*?<\/h2>/gi, '')
    .trim();
  const introText = introClean.replace(/<[^>]*>/g, '').trim();

  let idx = 0;

  if (introText.length > 10) {
    sections.push({ index: idx++, type: 'intro', title: '', html: introClean });
  }

  // conclusion 마커
  const conclusionMarkerIdx = html.search(
    /<section[^>]*data-blog-part=["']conclusion["'][^>]*>/i,
  );
  const contentEnd = conclusionMarkerIdx > 0 ? conclusionMarkerIdx : html.length;

  for (let i = 0; i < h3Matches.length; i++) {
    const start = h3Matches[i].position;
    if (start >= contentEnd) break;

    const end =
      i + 1 < h3Matches.length
        ? Math.min(h3Matches[i + 1].position, contentEnd)
        : contentEnd;

    const sectionHtml = html.substring(start, end).trim();
    const isConclusion =
      /마무리|결론|마치며/.test(h3Matches[i].title) &&
      i === h3Matches.length - 1;

    sections.push({
      index: idx++,
      type: isConclusion ? 'conclusion' : 'section',
      title: h3Matches[i].title,
      html: sectionHtml,
    });
  }

  return sections;
}

/**
 * 섹션 HTML 교체 — root app useAiRefine.ts handleSectionRegenerate 기준
 * 1차: 직접 문자열 교체, 실패 시 regex fallback
 */
export function replaceSectionHtml(
  fullHtml: string,
  oldSectionHtml: string,
  newSectionHtml: string,
  sectionTitle: string,
): string {
  // 1차: 직접 교체
  if (fullHtml.includes(oldSectionHtml)) {
    return fullHtml.replace(oldSectionHtml, newSectionHtml);
  }

  // 2차: regex fallback — h3 제목부터 다음 h3 또는 끝까지
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<h3[^>]*>${escapedTitle}<\\/h3>[\\s\\S]*?(?=<h3|<div class="faq|$)`,
    'i',
  );
  if (pattern.test(fullHtml)) {
    return fullHtml.replace(pattern, newSectionHtml);
  }

  // fallback 실패 — 원본 반환
  return fullHtml;
}
