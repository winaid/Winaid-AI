/**
 * HTML sanitizer — 화이트리스트 기반 태그/속성 허용
 * 외부 의존성 없이 XSS 방지
 */

// 허용 태그 (소문자)
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'img',
  'figure', 'figcaption',
  'details', 'summary',
  'abbr', 'cite', 'q', 'time', 'ruby', 'rt', 'rp',
]);

// 허용 속성 (태그 무관 공통)
const ALLOWED_ATTRS = new Set([
  'class', 'id', 'title', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'scope', 'headers',
  'href', 'src', 'target', 'rel',
  'datetime', 'lang', 'dir',
  'start', 'reversed', 'type', // ol 속성
]);

// 안전한 URL 프로토콜 (//로 시작하는 protocol-relative URL은 차단)
const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|#|\/(?!\/))/i;

/**
 * HTML 문자열에서 허용된 태그/속성만 남기고 나머지 제거
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // 1단계: 위험 태그를 내용 포함하여 통째로 제거 (화이트리스트에 없고 내용도 위험한 것들)
  let result = html
    .replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, '')
    .replace(/<iframe[\s>][\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<iframe[\s>][\s\S]*?\/?>/gi, '')
    .replace(/<object[\s>][\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed[\s>][\s\S]*?\/?>/gi, '')
    .replace(/<applet[\s>][\s\S]*?<\/applet\s*>/gi, '')
    .replace(/<math[\s>][\s\S]*?<\/math\s*>/gi, '')
    .replace(/<svg[\s>][\s\S]*?<\/svg\s*>/gi, '');

  // 2단계: 모든 HTML 태그를 파싱하여 화이트리스트 필터링
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\s*\/?>/g, (match, tagName, attrsStr) => {
    const tag = tagName.toLowerCase();

    // 허용되지 않은 태그 → 제거 (내용은 유지 — 이미 1단계에서 위험 태그는 통째 삭제됨)
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }

    // 닫는 태그
    if (match.startsWith('</')) {
      return `</${tag}>`;
    }

    // 속성 필터링
    const safeAttrs = sanitizeAttributes(tag, attrsStr || '');
    const selfClosing = match.endsWith('/>') || tag === 'br' || tag === 'hr' || tag === 'img' || tag === 'col';

    return `<${tag}${safeAttrs}${selfClosing ? ' /' : ''}>`;
  });

  return result;
}

/**
 * 속성 문자열에서 허용된 속성만 필터링
 */
function sanitizeAttributes(tag: string, attrsStr: string): string {
  if (!attrsStr.trim()) return '';

  const safeAttrs: string[] = [];

  // 속성 파싱: name="value", name='value', name=value, name (boolean)
  const attrRegex = /([a-zA-Z][a-zA-Z0-9\-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  let attrMatch;

  while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
    const attrName = attrMatch[1].toLowerCase();
    const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

    // on* 이벤트 핸들러 차단
    if (attrName.startsWith('on')) continue;

    // style 속성 차단
    if (attrName === 'style') continue;

    // srcdoc 차단
    if (attrName === 'srcdoc') continue;

    // formaction 차단
    if (attrName === 'formaction') continue;

    // 허용 목록에 없는 속성 차단
    if (!ALLOWED_ATTRS.has(attrName)) continue;

    // href/src URL 검증
    if (attrName === 'href' || attrName === 'src') {
      const decodedValue = decodeURIComponent(attrValue).replace(/[\x00-\x1f]/g, '').trim();
      if (!SAFE_URL_RE.test(decodedValue)) continue;
    }

    // target은 _blank만 허용
    if (attrName === 'target' && attrValue !== '_blank') continue;

    // 값이 있는 속성
    const escapedValue = attrValue.replace(/"/g, '&quot;');
    safeAttrs.push(`${attrName}="${escapedValue}"`);
  }

  // a 태그에 target="_blank"가 있으면 rel="noopener noreferrer" 강제
  if (tag === 'a' && safeAttrs.some(a => a.startsWith('target='))) {
    const hasRel = safeAttrs.some(a => a.startsWith('rel='));
    if (!hasRel) {
      safeAttrs.push('rel="noopener noreferrer"');
    }
  }

  return safeAttrs.length > 0 ? ' ' + safeAttrs.join(' ') : '';
}
