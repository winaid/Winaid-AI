/**
 * 간단한 HTML sanitizer — script/event handler 제거
 * 외부 의존성 없이 XSS 방지
 */
const DANGEROUS_TAGS = /(<script[\s>][\s\S]*?<\/script>|<iframe[\s>][\s\S]*?<\/iframe>|<object[\s>][\s\S]*?<\/object>|<embed[\s>][\s\S]*?\/?>|<form[\s>][\s\S]*?<\/form>)/gi;
const EVENT_HANDLERS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const JAVASCRIPT_URLS = /\s+(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(JAVASCRIPT_URLS, '');
}
