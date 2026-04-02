import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html; // SSR 환경
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','u','s','a','ul','ol','li','table','thead','tbody','tr','th','td','blockquote','code','pre','span','div','img','hr','sup','sub','mark','style'],
    ALLOWED_ATTR: ['href','target','rel','class','style','src','alt','width','height','colspan','rowspan','data-no-copy'],
    ALLOW_DATA_ATTR: true,
  });
}
