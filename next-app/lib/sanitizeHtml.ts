/**
 * HTML sanitizer — 화이트리스트 기반 태그/속성 허용
 * 외부 의존성 없이 XSS 방지
 */

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

const ALLOWED_ATTRS = new Set([
  'class', 'id', 'title', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'scope', 'headers',
  'href', 'src', 'target', 'rel',
  'datetime', 'lang', 'dir',
  'start', 'reversed', 'type',
]);

const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|#|data:image\/|\/(?!\/))/i;

function sanitizeAttributes(tag: string, attrsStr: string): string {
  if (!attrsStr.trim()) return '';

  const safeAttrs: string[] = [];
  const attrRegex = /([a-zA-Z][a-zA-Z0-9\-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  let attrMatch;

  while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
    const attrName = attrMatch[1].toLowerCase();
    const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

    if (attrName.startsWith('on')) continue;
    if (attrName === 'style') continue;
    if (attrName === 'srcdoc') continue;
    if (attrName === 'formaction') continue;
    if (!ALLOWED_ATTRS.has(attrName)) continue;

    if (attrName === 'href' || attrName === 'src') {
      const decodedValue = decodeURIComponent(attrValue).replace(/[\x00-\x1f]/g, '').trim();
      if (!SAFE_URL_RE.test(decodedValue)) continue;
    }

    if (attrName === 'target' && attrValue !== '_blank') continue;

    const escapedValue = attrValue.replace(/"/g, '&quot;');
    safeAttrs.push(`${attrName}="${escapedValue}"`);
  }

  if (tag === 'a' && safeAttrs.some(a => a.startsWith('target='))) {
    const hasRel = safeAttrs.some(a => a.startsWith('rel='));
    if (!hasRel) {
      safeAttrs.push('rel="noopener noreferrer"');
    }
  }

  return safeAttrs.length > 0 ? ' ' + safeAttrs.join(' ') : '';
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';

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

  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\s*\/?>/g, (match, tagName: string, attrsStr: string) => {
    const tag = tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;

    const safeAttrs = sanitizeAttributes(tag, attrsStr || '');
    const selfClosing = match.endsWith('/>') || tag === 'br' || tag === 'hr' || tag === 'img' || tag === 'col';

    return `<${tag}${safeAttrs}${selfClosing ? ' /' : ''}>`;
  });

  return result;
}
