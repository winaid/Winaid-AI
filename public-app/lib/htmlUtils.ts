/** Gemini 응답에서 <!DOCTYPE html> 래퍼를 제거 */
export function stripDoctype(html: string): string {
  let text = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      text = bodyMatch[1].trim();
    } else {
      text = text
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
        .replace(/<head>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
        .trim();
    }
  }
  return text;
}
